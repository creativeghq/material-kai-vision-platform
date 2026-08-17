/**
 * mygemi-opendata
 *
 * REST/JSON client for the ΓΕΜΗ (GEMI) OpenData API — Greek Commercial Registry.
 *   https://opendata-api.businessportal.gr/api/opendata/v1
 *   Docs: https://opendata.businessportal.gr/techdocs/
 *
 *   POST /functions/v1/mygemi-opendata
 *     body: { afm: string, company_id?: string, workspace_id?: string, reason?: string }
 *     body: { action: 'creds-status' }                          → is the platform key set?
 *
 *   Returns: { ok, source: 'gemi'|'cache', checked_at, gemi: {...} }
 *
 * Auth / key model — DELIBERATELY UNLIKE ΑΑΔΕ (myaade-rgwspublic2):
 *   ΑΑΔΕ RgWsPublic2 needs PER-WORKSPACE Special Access Codes because each lookup burns
 *   the tenant's TAXISnet quota and notifies the looked-up ΑΦΜ under the tenant's identity.
 *   ΓΕΜΗ OpenData is public open data behind a single application api_key issued to the
 *   operator — no per-lookup identity, no notification, no per-tenant quota. So ONE platform
 *   key (env GEMI_API_KEY → platform_secrets) serves every workspace. Caller only needs to be
 *   an authenticated user; writing the cache onto a CRM company still requires ownership/admin.
 *
 * Contract (verified against the live OpenAPI 2.0 spec):
 *   GET /companies?afm=NNNNNNNNN            → { searchMetadata, searchResults: [Company] }
 *   GET /companies/{arGemi}                 → Company (full)
 *   auth: header `api_key: <key>`
 *   Company: { arGemi, afm, coNameEl, coNamesEn[], coTitlesEl[], coTitlesEn[], city, street,
 *              streetNumber, zipCode, legalType{id,descr}, status{id,descr}, gemiOffice{id,descr},
 *              incorporationDate, isBranch, autoRegistered, activities[] }
 */
import { createClient } from '@supabase/supabase-js';
import { corsHeaders } from '../_shared/cors.ts';
import { resolveSecret } from '../_shared/secrets.ts';
import { withApiLogging } from '../_shared/api-logger.ts';
import { mergeKad } from '../_shared/kad.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') || '';

const GEMI_BASE = 'https://opendata-api.businessportal.gr/api/opendata/v1';
const CACHE_FRESH_MS = 90 * 24 * 3600 * 1000;

interface LookupBody {
  afm?: string;
  company_id?: string;
  workspace_id?: string;
  reason?: 'own_business' | 'crm_enrichment' | 'invoice_counterparty' | string;
  action?: 'creds-status' | string;
}

// deno-lint-ignore no-explicit-any
type Json = any;

/** Normalized, UI-friendly shape derived from a raw ΓΕΜΗ Company record. */
interface GemiNormalized {
  ar_gemi: string | null;
  afm: string | null;
  name_el: string | null;
  name_en: string | null;
  title_el: string | null;
  title_en: string | null;
  legal_form: string | null;
  status: string | null;
  gemi_office: string | null;
  city: string | null;
  street: string | null;
  street_number: string | null;
  zip: string | null;
  incorporation_date: string | null;
  is_branch: boolean | null;
  auto_registered: boolean | null;
  activities: Array<{ code: string | null; description: string | null; type: string | null }>;
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function firstStr(arr: unknown): string | null {
  return Array.isArray(arr) && arr.length > 0 && typeof arr[0] === 'string' ? arr[0] : null;
}

function normalizeCompany(c: Json): GemiNormalized {
  return {
    ar_gemi: c?.arGemi != null ? String(c.arGemi) : null,
    afm: c?.afm ?? null,
    name_el: c?.coNameEl ?? null,
    name_en: firstStr(c?.coNamesEn),
    title_el: firstStr(c?.coTitlesEl),
    title_en: firstStr(c?.coTitlesEn),
    legal_form: c?.legalType?.descr ?? null,
    status: c?.status?.descr ?? null,
    gemi_office: c?.gemiOffice?.descr ?? null,
    city: c?.city ?? null,
    street: c?.street ?? null,
    street_number: c?.streetNumber ?? null,
    zip: c?.zipCode ?? null,
    incorporation_date: c?.incorporationDate ?? null,
    is_branch: typeof c?.isBranch === 'boolean' ? c.isBranch : null,
    auto_registered: typeof c?.autoRegistered === 'boolean' ? c.autoRegistered : null,
    activities: Array.isArray(c?.activities)
      ? c.activities.map((a: Json) => ({
          code: a?.activity?.id != null ? String(a.activity.id) : (a?.activity?.code ?? null),
          description: a?.activity?.descr ?? null,
          type: a?.type ?? null,
        }))
      : [],
  };
}

/** GET the ΓΕΜΗ API with the api_key header. Retries once on 503 (routine Saturday maintenance). */
async function gemiGet(path: string, apiKey: string): Promise<{ ok: boolean; status: number; body: Json; err?: string }> {
  const url = `${GEMI_BASE}${path}`;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 30000);
      const res = await fetch(url, {
        method: 'GET',
        headers: { api_key: apiKey, Accept: 'application/json' },
        redirect: 'manual',
        signal: ctrl.signal,
      });
      clearTimeout(t);
      // 503 → maintenance window; back off briefly and retry once.
      if (res.status === 503 && attempt === 0) {
        await new Promise((r) => setTimeout(r, 5000));
        continue;
      }
      let body: Json = null;
      try { body = await res.json(); } catch { /* non-JSON error body */ }
      return { ok: res.ok, status: res.status, body };
    } catch (e) {
      if (attempt === 0) { await new Promise((r) => setTimeout(r, 2000)); continue; }
      return { ok: false, status: 0, body: null, err: e instanceof Error ? e.message : String(e) };
    }
  }
  return { ok: false, status: 0, body: null, err: 'unreachable' };
}

/** Pick the best match from search results: exact ΑΦΜ, prefer the parent (non-branch) that is self-registered. */
function pickBest(results: Json[], afm: string): Json | null {
  if (!Array.isArray(results) || results.length === 0) return null;
  const exact = results.filter((r) => String(r?.afm ?? '').replace(/\D/g, '') === afm);
  const pool = exact.length > 0 ? exact : results;
  return (
    pool.find((r) => r?.isBranch === false && r?.autoRegistered !== false) ??
    pool.find((r) => r?.isBranch === false) ??
    pool[0] ??
    null
  );
}

Deno.serve(withApiLogging('mygemi-opendata', async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization') || '';
    const token = authHeader.replace(/^Bearer\s+/i, '');
    if (!token) return jsonResponse({ error: 'Unauthorized' }, 401);
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return jsonResponse({ error: 'Unauthorized' }, 401);

    const body = (await req.json()) as LookupBody;
    const admin = createClient(supabaseUrl, supabaseServiceKey);

    // ── creds-status: is the platform ΓΕΜΗ key configured? (admin-gated) ──────────────
    if (body.action === 'creds-status') {
      const { data: profile } = await admin
        .from('user_profiles')
        .select('roles!user_profiles_role_id_fkey(name)')
        .eq('user_id', user.id)
        .maybeSingle();
      // deno-lint-ignore no-explicit-any
      const rn = (profile as any)?.roles?.name;
      if (!['admin', 'super_admin', 'owner'].includes(rn)) return jsonResponse({ error: 'not authorized' }, 403);
      const sec = await resolveSecret(admin, 'GEMI_API_KEY');
      return jsonResponse({ configured: !!sec.value, source: sec.source });
    }

    const rawAfm0 = (body.afm || '').replace(/[^0-9]/g, '');
    if (rawAfm0.length === 0 || rawAfm0.length > 9) {
      return jsonResponse({ error: 'invalid_afm', message: 'Greek ΑΦΜ must be up to 9 digits.' }, 400);
    }
    const afm = rawAfm0.padStart(9, '0'); // ΓΕΜΗ requires a 9-digit ΑΦΜ with leading zeros.

    // Resolve the platform key (env wins, else platform_secrets).
    const sec = await resolveSecret(admin, 'GEMI_API_KEY');
    if (!sec.value) {
      return jsonResponse({
        error: 'gemi_not_configured',
        message: 'ΓΕΜΗ OpenData API key is not set. Add GEMI_API_KEY under /admin/operations → Keys (register at opendata.businessportal.gr).',
      }, 503);
    }

    // #356 `RE-4` generalised. `company_id` is a body-supplied FK into crm_companies. Resolved
    // ONCE here, against the workspace this request already proved the caller belongs to, so the
    // audit row can never name another tenant's company. A foreign id is dropped rather than
    // rejected: this is a best-effort audit log and refusing the whole lookup over a bad
    // provenance field would be the worse trade.
    const { data: coRow } = body.company_id
      ? await admin.from('crm_companies').select('id')
          .eq('id', String(body.company_id)).eq('workspace_id', body.workspace_id ?? '').maybeSingle()
      : { data: null };
    const safeCompanyId = (coRow as { id?: string } | null)?.id ?? null;

    // Best-effort audit (open data — no external notification, unlike ΑΑΔΕ).
    const logLookup = async (source: 'gemi' | 'cache', arGemi: string | null, found: boolean) => {
      try {
        await admin.from('gemi_lookup_log').insert({
          looked_up_afm: afm,
          ar_gemi: arGemi,
        // #356 `RE-4` generalised: `company_id` is a body-supplied FK into crm_companies,
        // stored on an audit row that is later joined for display. The workspace is verified
        // above; the company was not, so an audit entry could name another tenant's company.
          company_id: safeCompanyId,
          workspace_id: body.workspace_id ?? null,
          requested_by: user.id,
          reason: body.reason ?? null,
          source,
          found,
        });
      } catch (e) {
        console.error('[mygemi-opendata] audit log insert failed:', e);
      }
    };

    // 90-day cache (only meaningful when a company_id is supplied).
    if (body.company_id) {
      const { data: cached } = await admin
        .from('crm_companies')
        .select('gemi_data, gemi_data_at, vat_number')
        .eq('id', body.company_id)
        .maybeSingle();
      const sameAfm = cached?.vat_number && cached.vat_number.replace(/[^0-9]/g, '').padStart(9, '0') === afm;
      const fresh = cached?.gemi_data_at && (Date.now() - new Date(cached.gemi_data_at).getTime() < CACHE_FRESH_MS);
      if (sameAfm && fresh && cached!.gemi_data) {
        const norm = normalizeCompany(cached!.gemi_data);
        await logLookup('cache', norm.ar_gemi, true);
        return jsonResponse({ ok: true, source: 'cache', checked_at: cached!.gemi_data_at, gemi: norm, raw: cached!.gemi_data });
      }
    }

    // Live search by ΑΦΜ.
    const search = await gemiGet(`/companies?afm=${encodeURIComponent(afm)}`, sec.value);
    if (search.err || search.status === 0) {
      return jsonResponse({ error: 'gemi_unreachable', message: `ΓΕΜΗ API unreachable: ${search.err ?? 'network error'}` }, 503);
    }
    if (!search.ok) {
      const msg = search.body?.message || search.body?.error || `ΓΕΜΗ responded with HTTP ${search.status}.`;
      console.error('[mygemi-opendata] ΓΕΜΗ search failed:', { status: search.status, body: search.body });
      await logLookup('gemi', null, false);
      // 404 = no company for that ΑΦΜ.
      if (search.status === 404) {
        return jsonResponse({ error: 'gemi_not_found', message: 'No ΓΕΜΗ record for this ΑΦΜ.' }, 404);
      }
      return jsonResponse({ error: 'gemi_error', message: msg, http_status: search.status }, search.status >= 400 ? search.status : 400);
    }

    const results: Json[] = search.body?.searchResults ?? [];
    const best = pickBest(results, afm);
    if (!best) {
      await logLookup('gemi', null, false);
      return jsonResponse({ error: 'gemi_not_found', message: 'No ΓΕΜΗ record for this ΑΦΜ.' }, 404);
    }

    const norm = normalizeCompany(best);
    const checkedAt = new Date().toISOString();
    await logLookup('gemi', norm.ar_gemi, true);

    // Cache onto the CRM company (service role) when caller owns it or is admin — mirrors ΑΑΔΕ.
    if (body.company_id) {
      const { data: company } = await admin
        .from('crm_companies')
        .select('id, created_by, kad_all')
        .eq('id', body.company_id)
        .maybeSingle();
      if (company) {
        let canWrite = company.created_by === user.id;
        if (!canWrite) {
          const { data: profile } = await admin
            .from('user_profiles')
            .select('roles!user_profiles_role_id_fkey(name)')
            .eq('user_id', user.id)
            .maybeSingle();
          // deno-lint-ignore no-explicit-any
          const rn = (profile as any)?.roles?.name;
          canWrite = rn === 'admin' || rn === 'super_admin' || rn === 'owner';
        }
        if (canWrite) {
          // Merge ΓΕΜΗ activities into the normalized ΚΑΔ list (keeps any ΑΑΔΕ entries).
          const { kad_all, kad_codes } = mergeKad(
            company.kad_all,
            'gemi',
            norm.activities.map((a) => ({ code: a.code, description: a.description, primary: /κ[υύ]ρι/i.test(a.type ?? '') })),
          );
          await admin.from('crm_companies').update({
            gemi_number: norm.ar_gemi,
            gemi_legal_form: norm.legal_form,
            gemi_status: norm.status,
            gemi_data: best,
            gemi_data_at: checkedAt,
            kad_all,
            kad_codes,
            updated_at: checkedAt,
          }).eq('id', body.company_id);
        }
      }
    }

    return jsonResponse({ ok: true, source: 'gemi', checked_at: checkedAt, gemi: norm, raw: best });
  } catch (err) {
    const detail = err instanceof Error ? err.message : 'Unknown error';
    console.error('[mygemi-opendata] error:', err);
    return jsonResponse({ error: 'internal_error', detail }, 500);
  }
}));
