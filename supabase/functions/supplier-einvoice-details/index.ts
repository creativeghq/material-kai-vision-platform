import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { bootstrapForFunction } from '../_shared/secrets-bootstrap.ts';
import { withApiLogging, HttpError } from '../_shared/api-logger.ts';
import { isServiceRoleRequest, userCanAccessWorkspace } from '../_shared/auth.ts';
import { assertSafeUrl, SSRFError } from '../_shared/ssrf-guard.ts';
import { readEinvoiceHtml, type EinvoiceIssuerDetails } from '../_shared/finance/einvoice-issuer-details.ts';
import { bankFromIban } from '../_shared/bankVocabulary.generated.ts';
import { normalizeIban } from '../_shared/iban.generated.ts';
import type { EinvoiceReadOutcome } from '../_shared/einvoiceReadOutcomes.generated.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const MAX_BYTES = 3 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 12_000;
const TIME_BUDGET_MS = 90_000;
/** Providers rate-limit by IP — einvoice.s1ecos.gr stopped answering after a burst. */
const SAME_HOST_GAP_MS = 2_000;
const REREAD_AFTER_DAYS = 30;
const PAGE = 1000;

interface Body { workspace_id?: string; company_id?: string; limit?: number }

interface DocRow {
  id: string; issuer_vat: string; issuer_name: string | null; download_url: string | null;
  series: string | null; aa: string | null; issue_date: string | null;
  issuer_address: { street?: string; number?: string; city?: string; postal_code?: string } | null;
}

interface CompanyRow {
  id: string; name: string; vat_norm: string | null; phone: string | null; email: string | null;
  street: string | null; street_number: string | null; city: string | null; postal_code: string | null;
  address: string | null; einvoice_read_at: string | null;
}

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

const blank = (v: unknown) => v === null || v === undefined || String(v).trim() === '';
const digits = (v: unknown) => String(v ?? '').replace(/\D/g, '').replace(/^(0030|30)(?=\d{10}$)/, '');
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const addressMissing = (c: CompanyRow) => blank(c.street) && blank(c.address) && blank(c.city);

type Fetched = { kind: 'html'; html: string } | { kind: 'not_readable'; why: string } | { kind: 'unreachable'; why: string };

async function fetchPage(rawUrl: string): Promise<Fetched> {
  let url = rawUrl;
  for (let hop = 0; hop < 3; hop++) {
    try {
      url = await assertSafeUrl(url, { allowSchemes: ['https:'] });
    } catch (e) {
      return { kind: 'not_readable', why: e instanceof SSRFError ? e.message : 'bad url' };
    }
    let res: Response;
    try {
      res = await fetch(url, {
        redirect: 'manual',
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        headers: { 'User-Agent': 'MaterialsHub supplier-details reader', Accept: 'text/html,application/xhtml+xml' },
      });
    } catch (e) {
      return { kind: 'unreachable', why: e instanceof Error ? e.message : 'fetch failed' };
    }
    if (res.status >= 300 && res.status < 400) {
      const next = res.headers.get('location');
      await res.body?.cancel();
      if (!next) return { kind: 'unreachable', why: `redirect ${res.status} without location` };
      url = new URL(next, url).toString();
      continue;
    }
    if (!res.ok) {
      await res.body?.cancel();
      return { kind: 'unreachable', why: `HTTP ${res.status}` };
    }
    const type = res.headers.get('content-type') ?? '';
    if (!/text\/html|xhtml/i.test(type)) {
      await res.body?.cancel();
      return { kind: 'not_readable', why: type || 'unknown content type' };
    }
    const reader = res.body?.getReader();
    if (!reader) return { kind: 'unreachable', why: 'empty body' };
    const chunks: Uint8Array[] = [];
    let size = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BYTES) { await reader.cancel(); return { kind: 'not_readable', why: 'page too large' }; }
      chunks.push(value);
    }
    const buf = new Uint8Array(size);
    let off = 0;
    for (const c of chunks) { buf.set(c, off); off += c.byteLength; }
    const html = new TextDecoder().decode(buf);
    if (/challenges\.cloudflare\.com|cf-turnstile/i.test(html)) return { kind: 'not_readable', why: 'bot challenge' };
    return { kind: 'html', html };
  }
  return { kind: 'unreachable', why: 'too many redirects' };
}

async function readAll<T>(
  page: (from: number, to: number) => PromiseLike<{ data: unknown; error: { message: string } | null }>,
): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await page(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as T[];
    out.push(...rows);
    if (rows.length < PAGE) return out;
  }
}

async function ownIbans(admin: SupabaseClient, workspaceId: string): Promise<Set<string>> {
  const [{ data: accts }, { data: settings }] = await Promise.all([
    admin.from('finance_bank_accounts').select('iban').eq('workspace_id', workspaceId),
    admin.from('finance_settings').select('bank_iban').eq('workspace_id', workspaceId),
  ]);
  const out = new Set<string>();
  for (const r of [...(accts ?? []), ...(settings ?? []).map((s: { bank_iban: string | null }) => ({ iban: s.bank_iban }))]) {
    const i = normalizeIban((r as { iban: string | null }).iban ?? '');
    if (i) out.add(i);
  }
  return out;
}

async function readOne(
  admin: SupabaseClient, workspaceId: string, c: CompanyRow, doc: DocRow | undefined,
  addr: DocRow['issuer_address'] | undefined, own: Set<string>, lastHit: Map<string, number>,
): Promise<Record<string, unknown>> {
  const vat = c.vat_norm!;
  const patch: Record<string, unknown> = {};
  const result: Record<string, unknown> = { company_id: c.id, name: c.name };

  if (addr?.street && addressMissing(c)) {
    const zip = addr.postal_code && addr.postal_code !== '0' ? addr.postal_code : null;
    const number = addr.number && addr.number !== '0' ? addr.number : null;
    Object.assign(patch, {
      street: addr.street, street_number: number, city: addr.city ?? null, postal_code: zip,
      address: [addr.street, number].filter(Boolean).join(' '),
    });
    result.address_set = true;
  }

  let outcome: EinvoiceReadOutcome | null = null;
  const host = doc?.download_url && URL.canParse(doc.download_url) ? new URL(doc.download_url).hostname : null;
  if (doc?.download_url && host) {
    const wait = (lastHit.get(host) ?? 0) + SAME_HOST_GAP_MS - Date.now();
    if (wait > 0) await sleep(wait);
    const page = await fetchPage(doc.download_url);
    lastHit.set(host, Date.now());
    result.provider = host;

    if (page.kind !== 'html') {
      outcome = page.kind;
      result.why = page.why;
    } else {
      const found: EinvoiceIssuerDetails = readEinvoiceHtml(page.html, vat);
      const label = `their e-invoice ${[doc.series, doc.aa].filter(Boolean).join(' ')}${doc.issue_date ? ` (${doc.issue_date})` : ''}`.trim();
      const ibans = found.ibans.filter((i) => !own.has(i));
      const { data: prior } = await admin.from('crm_bank_account_suggestions')
        .select('iban, source_ref').eq('company_id', c.id).eq('source', 'einvoice_provider');
      const fromThisDoc = new Set(((prior ?? []) as { iban: string | null; source_ref: { inbound_document_id?: string } | null }[])
        .filter((r) => r.source_ref?.inbound_document_id === doc.id)
        .map((r) => r.iban));
      const filed: string[] = [];
      for (const iban of ibans) {
        if (fromThisDoc.has(iban)) { filed.push(`${iban.slice(-4)}:same_document`); continue; }
        const { data, error } = await admin.rpc('crm_record_bank_account_suggestion', {
          p_workspace_id: workspaceId, p_company_id: c.id, p_iban: iban,
          p_bank_name: bankFromIban(iban)?.name ?? null, p_currency: 'EUR',
          p_source: 'einvoice_provider',
          p_source_ref: { inbound_document_id: doc.id, provider_host: host },
          p_document_label: label, p_issuer_name: doc.issuer_name,
        });
        if (error) throw new Error(`recording a suggestion failed: ${error.message}`);
        const r = (data ?? {}) as { outcome?: string; status?: string };
        filed.push(`${iban.slice(-4)}:${r.status === 'dismissed' ? 'dismissed' : (r.outcome ?? '?')}`);
      }
      result.ibans = filed;

      const k = found.contacts;
      if (k) {
        if (blank(c.phone) && k.phones[0]) { patch.phone = `+30${k.phones[0]}`; result.phone_set = true; }
        if (blank(c.email) && k.emails[0]) { patch.email = k.emails[0]; result.email_set = true; }
        const { data: existing } = await admin.from('crm_phones').select('phone').eq('company_id', c.id);
        const have = new Set([digits(patch.phone ?? c.phone), ...(existing ?? []).map((p: { phone: string }) => digits(p.phone))]);
        const extra = [
          ...k.phones.map((p) => ({ p, type: p.startsWith('69') ? 'mobile' : 'landline', label: 'Office' })),
          ...k.faxes.map((p) => ({ p, type: 'fax', label: 'Fax' })),
        ].filter((x) => !have.has(x.p));
        if (extra.length) {
          const { error } = await admin.from('crm_phones').insert(extra.map((x) => ({
            workspace_id: workspaceId, company_id: c.id, label: x.label, phone: `+30${x.p}`,
            phone_type: x.type, notes: `From ${label}`,
          })));
          if (error) throw new Error(`adding phone numbers failed: ${error.message}`);
          result.phones_added = extra.length;
        }
      }
      outcome = ibans.length || (k && (k.phones.length || k.emails.length || k.faxes.length)) ? 'details_found' : 'nothing_printed';
    }
  }

  if (outcome) Object.assign(patch, { einvoice_read_at: new Date().toISOString(), einvoice_read_outcome: outcome });
  if (Object.keys(patch).length) {
    const { error } = await admin.from('crm_companies').update(patch).eq('id', c.id).eq('workspace_id', workspaceId);
    if (error) throw new Error(`updating the company failed: ${error.message}`);
  }
  result.outcome = outcome ?? 'no_provider_link';
  return result;
}

Deno.serve(withApiLogging('supplier-einvoice-details', async (req: Request) => {
  await bootstrapForFunction();
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') throw new HttpError(405, 'POST only');

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const admin = createClient(supabaseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const body = (await req.json().catch(() => ({}))) as Body;
  const workspaceId = body.workspace_id;
  if (!workspaceId) throw new HttpError(400, 'workspace_id required');

  if (!isServiceRoleRequest(req)) {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) throw new HttpError(401, 'Missing Authorization bearer');
    const reader = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: authHeader } } });
    const { data: who } = await reader.auth.getUser();
    if (!who.user) throw new HttpError(401, 'Invalid session');
    if (!(await userCanAccessWorkspace(admin, who.user.id, workspaceId))) throw new HttpError(404, 'Workspace not found');
  }

  const limit = Math.min(Math.max(Number(body.limit) || 20, 1), 60);

  const companies = await readAll<CompanyRow>((from, to) => {
    let q = admin.from('crm_companies')
      .select('id, name, vat_norm, phone, email, street, street_number, city, postal_code, address, einvoice_read_at')
      .eq('workspace_id', workspaceId);
    if (body.company_id) q = q.eq('id', body.company_id);
    return q.order('id').range(from, to);
  });
  if (body.company_id) {
    if (!companies.length) throw new HttpError(404, 'Company not found');
    if (!companies[0].vat_norm) throw new HttpError(400, 'This company has no ΑΦΜ, so none of its myDATA documents can be matched to it.');
  }
  const byVat = new Map(companies.filter((c) => c.vat_norm).map((c) => [c.vat_norm!, c]));

  const docs = await readAll<DocRow>((from, to) => {
    let q = admin.from('inbound_documents')
      .select('id, issuer_vat, issuer_name, download_url, series, aa, issue_date, issuer_address')
      .eq('workspace_id', workspaceId).not('issuer_vat', 'is', null);
    if (body.company_id) q = q.eq('issuer_vat', companies[0].vat_norm!);
    return q.order('issue_date', { ascending: false }).order('id').range(from, to);
  });

  const linked = new Map<string, DocRow>();
  const addressed = new Map<string, DocRow>();
  for (const d of docs) {
    if (!byVat.has(d.issuer_vat)) continue;
    if (d.download_url && !linked.has(d.issuer_vat) && !/mydatapi\.aade\.gr/i.test(d.download_url)) linked.set(d.issuer_vat, d);
    if (d.issuer_address?.street && !addressed.has(d.issuer_vat)) addressed.set(d.issuer_vat, d);
  }

  const staleBefore = Date.now() - REREAD_AFTER_DAYS * 86_400_000;
  const due = [...byVat.values()]
    .filter((c) =>
      (linked.has(c.vat_norm!) && (body.company_id || !c.einvoice_read_at || Date.parse(c.einvoice_read_at) < staleBefore))
      || (addressed.has(c.vat_norm!) && addressMissing(c)))
    .sort((a, b) => (a.einvoice_read_at ?? '').localeCompare(b.einvoice_read_at ?? ''));

  if (body.company_id && !due.length) {
    const c = companies[0];
    return json({ processed: 1, remaining: 0, results: [{ company_id: c.id, name: c.name, outcome: 'no_provider_link' }] });
  }

  const own = await ownIbans(admin, workspaceId);
  const lastHit = new Map<string, number>();
  const started = Date.now();
  const results: Record<string, unknown>[] = [];

  for (const c of due.slice(0, limit)) {
    if (Date.now() - started > TIME_BUDGET_MS) break;
    try {
      results.push(await readOne(admin, workspaceId, c, linked.get(c.vat_norm!), addressed.get(c.vat_norm!)?.issuer_address, own, lastHit));
    } catch (e) {
      results.push({ company_id: c.id, name: c.name, outcome: 'failed', why: e instanceof Error ? e.message : String(e) });
    }
  }

  return json({ processed: results.length, remaining: Math.max(due.length - results.length, 0), results });
}));
