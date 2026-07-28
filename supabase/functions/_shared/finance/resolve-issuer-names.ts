/**
 * Fills in the supplier name AADE never sends.
 *
 * myDATA's `RequestDocs` feed identifies the issuer by ΑΦΜ only — the `<issuer>` block
 * carries `vatNumber`/`country`/`branch` and nothing else. (Measured on live data: of 1,146
 * inbound documents with no issuer name, ZERO contained a `<name>` tag — it is never a parse
 * miss.) So the name has to be resolved from the ΑΦΜ on our side.
 *
 * Resolution order, cheapest first:
 *   1. `greek_registry_companies` — platform-wide ΑΦΜ→name cache (public registry data).
 *   2. `crm_companies` for this workspace — the operator may already know the supplier.
 *   3. ΓΕΜΗ OpenData (`GEMI_API_KEY`) — public registry, one platform key, no per-tenant
 *      quota and no notification to the looked-up business.
 *
 * ΓΕΜΗ and NOT ΑΑΔΕ RgWsPublic2 on purpose: every RgWsPublic2 lookup writes an audit entry
 * into the looked-up ΑΦΜ's TAXISnet inbox under the caller's identity and burns their monthly
 * quota. That is correct for "verify my own business", and completely wrong for bulk
 * resolution of 166 suppliers who never asked to hear from us.
 */
// deno-lint-ignore-file no-explicit-any

const GEMI_BASE = 'https://opendata-api.businessportal.gr/api/opendata/v1';

/** Re-ask the registry about an ΑΦΜ it didn't know only after this long. */
const NOT_FOUND_RETRY_MS = 30 * 24 * 3600 * 1000;

export interface ResolveIssuerResult {
  candidates: number;   // unnamed issuer ΑΦΜ considered this run
  from_cache: number;
  from_crm: number;
  from_gemi: number;
  not_found: number;
  docs_updated: number;
}

const digits = (s: unknown) => String(s ?? '').replace(/\D/g, '');

/** Pick the best ΓΕΜΗ search hit: exact ΑΦΜ, prefer the parent (non-branch) entry. */
function pickBest(results: any[], afm: string): any | null {
  if (!Array.isArray(results) || results.length === 0) return null;
  const exact = results.filter((r) => digits(r?.afm) === afm);
  const pool = exact.length > 0 ? exact : results;
  return pool.find((r) => r?.isBranch === false && r?.autoRegistered !== false)
    ?? pool.find((r) => r?.isBranch === false)
    ?? pool[0]
    ?? null;
}

async function gemiLookup(afm: string, apiKey: string): Promise<any | null | 'error'> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 20000);
    const res = await fetch(`${GEMI_BASE}/companies?afm=${encodeURIComponent(afm)}`, {
      headers: { api_key: apiKey, Accept: 'application/json' },
      redirect: 'manual',
      signal: ctrl.signal,
    });
    clearTimeout(t);
    // 503 is ΓΕΜΗ's routine maintenance window — an error, not a "no such company", so it
    // must NOT be cached as not_found.
    if (!res.ok) return 'error';
    const body = await res.json().catch(() => null);
    return pickBest(body?.searchResults ?? [], afm);
  } catch {
    return 'error';
  }
}

/**
 * Resolve issuer names for a workspace's name-less inbound documents and write them back.
 * Best-effort throughout: a registry outage leaves the rows as they were.
 *
 * @param maxLookups hard ceiling on live ΓΕΜΗ calls per run, so a first sync over a large
 *        backlog spreads its lookups across runs instead of hammering the registry.
 */
export async function resolveInboundIssuerNames(
  admin: any,
  workspaceId: string,
  gemiApiKey: string | null,
  maxLookups = 40,
): Promise<ResolveIssuerResult> {
  const out: ResolveIssuerResult = {
    candidates: 0, from_cache: 0, from_crm: 0, from_gemi: 0, not_found: 0, docs_updated: 0,
  };

  const { data: unnamed } = await admin
    .from('inbound_documents')
    .select('issuer_vat')
    .eq('workspace_id', workspaceId)
    .is('issuer_name', null)
    .not('issuer_vat', 'is', null)
    .limit(2000);

  const afms = [...new Set((unnamed ?? []).map((r: any) => digits(r.issuer_vat)).filter((v: string) => v.length >= 9))];
  out.candidates = afms.length;
  if (afms.length === 0) return out;

  // 1 — platform cache.
  const resolved = new Map<string, string>();
  const { data: cached } = await admin
    .from('greek_registry_companies')
    .select('afm, name, not_found, resolved_at')
    .in('afm', afms);
  const cachedByAfm = new Map<string, any>((cached ?? []).map((r: any) => [r.afm, r]));
  for (const [afm, row] of cachedByAfm) {
    if (row.name) { resolved.set(afm, row.name); out.from_cache++; }
  }

  // 2 — the operator's own CRM. Free, and often better than the registry name (it's what
  //     they actually call the supplier).
  const stillUnknown = afms.filter((a) => !resolved.has(a));
  if (stillUnknown.length > 0) {
    const { data: companies } = await admin
      .from('crm_companies')
      .select('name, vat_number')
      .eq('workspace_id', workspaceId)
      .not('vat_number', 'is', null);
    for (const c of companies ?? []) {
      const a = digits(c.vat_number);
      if (a && stillUnknown.includes(a) && c.name && !resolved.has(a)) {
        resolved.set(a, c.name);
        out.from_crm++;
      }
    }
  }

  // 3 — ΓΕΜΗ, for whatever is left and isn't a fresh known-miss.
  const now = Date.now();
  const toLookUp = afms.filter((a) => {
    if (resolved.has(a)) return false;
    const row = cachedByAfm.get(a);
    if (!row) return true;
    if (row.not_found) return now - new Date(row.resolved_at).getTime() > NOT_FOUND_RETRY_MS;
    return false;   // cached with a name already handled above
  }).slice(0, maxLookups);

  if (gemiApiKey && toLookUp.length > 0) {
    // Small concurrency — the registry is a shared public service, not a CDN.
    const CONCURRENCY = 4;
    for (let i = 0; i < toLookUp.length; i += CONCURRENCY) {
      const batch = toLookUp.slice(i, i + CONCURRENCY);
      const hits = await Promise.all(batch.map((afm) => gemiLookup(afm, gemiApiKey)));
      const rows: any[] = [];
      batch.forEach((afm, k) => {
        const hit = hits[k];
        if (hit === 'error') return;          // transient — cache nothing, retry next run
        if (!hit) {
          rows.push({ afm, name: null, not_found: true, source: 'gemi', resolved_at: new Date().toISOString() });
          out.not_found++;
          return;
        }
        const name: string | null = hit.coNameEl
          ?? (Array.isArray(hit.coNamesEn) ? hit.coNamesEn[0] : null)
          ?? (Array.isArray(hit.coTitlesEl) ? hit.coTitlesEl[0] : null)
          ?? null;
        rows.push({
          afm,
          name,
          ar_gemi: hit.arGemi != null ? String(hit.arGemi) : null,
          legal_form: hit.legalType?.descr ?? null,
          status: hit.status?.descr ?? null,
          city: hit.city ?? null,
          not_found: !name,
          source: 'gemi',
          resolved_at: new Date().toISOString(),
          raw: hit,
        });
        if (name) { resolved.set(afm, name); out.from_gemi++; } else { out.not_found++; }
      });
      if (rows.length > 0) {
        await admin.from('greek_registry_companies').upsert(rows, { onConflict: 'afm' });
      }
    }
  }

  // Write the names back onto this workspace's documents. Only rows that are still name-less
  // are touched, so an operator's manual correction is never overwritten.
  for (const [afm, name] of resolved) {
    const { count } = await admin
      .from('inbound_documents')
      .update({ issuer_name: name, updated_at: new Date().toISOString() }, { count: 'exact' })
      .eq('workspace_id', workspaceId)
      .is('issuer_name', null)
      .eq('issuer_vat', afm);
    out.docs_updated += count ?? 0;
  }

  return out;
}
