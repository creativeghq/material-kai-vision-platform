import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { bootstrapForFunction } from '../_shared/secrets-bootstrap.ts';
import { withApiLogging, HttpError } from '../_shared/api-logger.ts';
import { authenticate, isCronAuthorized, userHasWorkspaceCapability } from '../_shared/auth.ts';
import { assertSafeUrl } from '../_shared/ssrf-guard.ts';
import { structuredUrlFor, readEn16931Header } from '../_shared/finance/structured-providers.ts';
import { parseEn16931, checkAgainstMyData } from '../_shared/finance/en16931-parse.ts';
import { corsHeaders } from '../_shared/cors.ts';

const MAX_BYTES = 2 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 12_000;
const TIME_BUDGET_MS = 90_000;
const SAME_HOST_GAP_MS = 2_000;
const RECHECK_AFTER_DAYS = 7;

interface Body { workspace_id?: string; limit?: number; reparse?: boolean }
interface Candidate { id: string; download_url: string; checked_at: string | null }
type Outcome = 'fetched' | 'not_structured' | 'unreachable';

const json = (payload: unknown, status = 200) =>
  new Response(JSON.stringify(payload), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function fetchXml(rawUrl: string): Promise<{ xml: string } | { why: string; unreachable: boolean }> {
  let url = rawUrl;
  for (let hop = 0; hop < 2; hop++) {
    try {
      url = await assertSafeUrl(url, { allowSchemes: ['https:'] });
    } catch (e) {
      return { why: e instanceof Error ? e.message : 'bad url', unreachable: false };
    }
    let res: Response;
    try {
      res = await fetch(url, {
        redirect: 'manual',
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        headers: { 'User-Agent': 'MaterialsHub inbound structured reader', Accept: 'application/xml,text/xml' },
      });
    } catch (e) {
      return { why: e instanceof Error ? e.message : 'fetch failed', unreachable: true };
    }
    if (res.status >= 300 && res.status < 400) {
      const next = res.headers.get('location');
      await res.body?.cancel();
      if (!next) return { why: `redirect ${res.status} without location`, unreachable: true };
      url = new URL(next, url).toString();
      continue;
    }
    if (!res.ok) {
      await res.body?.cancel();
      return { why: `HTTP ${res.status}`, unreachable: res.status >= 500 || res.status === 429 };
    }
    const reader = res.body?.getReader();
    if (!reader) return { why: 'empty body', unreachable: true };
    const chunks: Uint8Array[] = [];
    let size = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BYTES) { await reader.cancel(); return { why: 'file too large', unreachable: false }; }
      chunks.push(value);
    }
    const buf = new Uint8Array(size);
    let off = 0;
    for (const c of chunks) { buf.set(c, off); off += c.byteLength; }
    return { xml: new TextDecoder().decode(buf) };
  }
  return { why: 'too many redirects', unreachable: true };
}

async function parsedFor(admin: SupabaseClient, workspaceId: string, id: string, xml: string): Promise<Record<string, unknown>> {
  const parsed = parseEn16931(xml);
  if (!parsed) return { en16931_parse_error: 'unreadable' };
  const { data } = await admin.from('inbound_documents')
    .select('issuer_vat, total_net, total_vat, total_gross, mark, lines')
    .eq('id', id).eq('workspace_id', workspaceId).maybeSingle();
  const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));
  const check = data
    ? checkAgainstMyData(parsed, {
      issuer_vat: data.issuer_vat, total_net: num(data.total_net), total_vat: num(data.total_vat),
      total_gross: num(data.total_gross), mark: data.mark, line_count: Array.isArray(data.lines) ? data.lines.length : 0,
    })
    : null;
  return { en16931_parsed: parsed, en16931_check: check };
}

async function reparseStored(admin: SupabaseClient, workspaceId: string, limit: number) {
  const { data, error } = await admin.from('inbound_documents')
    .select('id, raw').eq('workspace_id', workspaceId).eq('delivery_channel', 'provider_link')
    .is('raw->en16931_parsed', null).not('raw->>en16931_xml', 'is', null).limit(limit);
  if (error) throw new HttpError(500, `could not list documents: ${error.message}`);
  let parsed = 0, differs = 0, failed = 0;
  for (const r of data ?? []) {
    const raw = (r.raw ?? {}) as Record<string, unknown>;
    const extra = await parsedFor(admin, workspaceId, r.id, String(raw.en16931_xml));
    const { error: upErr } = await admin.from('inbound_documents')
      .update({ raw: { ...raw, ...extra } }).eq('id', r.id).eq('workspace_id', workspaceId);
    if (upErr || 'en16931_parse_error' in extra) { failed++; continue; }
    parsed++;
    if ((extra.en16931_check as { verdict?: string } | null)?.verdict === 'differs') differs++;
  }
  return { parsed, differs, failed };
}

async function readOne(admin: SupabaseClient, workspaceId: string, c: Candidate, structuredUrl: string): Promise<Outcome> {
  const got = await fetchXml(structuredUrl);
  const { data: row, error: readErr } = await admin.from('inbound_documents')
    .select('raw').eq('id', c.id).eq('workspace_id', workspaceId).maybeSingle();
  if (readErr || !row) throw new Error(readErr?.message ?? 'document vanished');
  const raw = (row.raw ?? {}) as Record<string, unknown>;
  const now = new Date().toISOString();

  if ('xml' in got && readEn16931Header(got.xml)) {
    const { error } = await admin.from('inbound_documents')
      .update({
        source_format: 'en16931_ubl',
        delivery_channel: 'provider_link',
        raw: { ...raw, en16931_xml: got.xml, en16931_fetched_at: now, en16931_checked_at: now, ...(await parsedFor(admin, workspaceId, c.id, got.xml)) },
      })
      .eq('id', c.id).eq('workspace_id', workspaceId).is('source_format', null);
    if (error) throw new Error(error.message);
    return 'fetched';
  }

  const outcome: Outcome = 'xml' in got || !got.unreachable ? 'not_structured' : 'unreachable';
  const why = 'xml' in got ? 'not an EN 16931 document' : got.why;
  const { error } = await admin.from('inbound_documents')
    .update({ raw: { ...raw, en16931_checked_at: now, en16931_status: outcome, en16931_why: why } })
    .eq('id', c.id).eq('workspace_id', workspaceId);
  if (error) throw new Error(error.message);
  return outcome;
}

Deno.serve(withApiLogging('inbound-structured-fetch', async (req: Request) => {
  await bootstrapForFunction();
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') throw new HttpError(405, 'POST only');

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const body = (await req.json().catch(() => ({}))) as Body;
  const workspaceId = body.workspace_id;
  if (!workspaceId) throw new HttpError(400, 'workspace_id required');

  if (!isCronAuthorized(req)) {
    const auth = await authenticate(req, { requireUser: true });
    if (!auth.success || !auth.userId) throw new HttpError(401, auth.error || 'Invalid session');
    const keyWs = auth.apiKey?.workspace_id;
    if ((keyWs && workspaceId !== keyWs) || !(await userHasWorkspaceCapability(admin, auth.userId, workspaceId, 'finance.manage'))) {
      throw new HttpError(404, 'Workspace not found');
    }
  }

  const limit = Math.min(Math.max(Number(body.limit) || 25, 1), 100);
  if (body.reparse) return json(await reparseStored(admin, workspaceId, limit));
  const { data, error } = await admin.from('inbound_documents')
    .select('id, download_url, checked_at:raw->>en16931_checked_at')
    .eq('workspace_id', workspaceId).is('source_format', null)
    .ilike('download_url', 'https://%invoiceportal.gr/%')
    .order('issue_date', { ascending: false }).limit(1000);
  if (error) throw new HttpError(500, `could not list documents: ${error.message}`);

  const staleBefore = Date.now() - RECHECK_AFTER_DAYS * 86_400_000;
  const due = ((data ?? []) as Candidate[])
    .filter((c) => !c.checked_at || Date.parse(c.checked_at) < staleBefore)
    .map((c) => ({ c, url: structuredUrlFor(c.download_url) }))
    .filter((x): x is { c: Candidate; url: string } => x.url !== null);

  const tally: Record<Outcome | 'failed', number> = { fetched: 0, not_structured: 0, unreachable: 0, failed: 0 };
  let lastHit = 0;
  const started = Date.now();
  let processed = 0;
  for (const { c, url } of due.slice(0, limit)) {
    if (Date.now() - started > TIME_BUDGET_MS) break;
    const wait = SAME_HOST_GAP_MS - (Date.now() - lastHit);
    if (wait > 0) await sleep(wait);
    lastHit = Date.now();
    processed++;
    try {
      tally[await readOne(admin, workspaceId, c, url)]++;
    } catch (e) {
      tally.failed++;
      console.error('[inbound-structured-fetch]', c.id, e instanceof Error ? e.message : e);
    }
  }
  return json({ processed, remaining: Math.max(due.length - processed, 0), ...tally });
}));
