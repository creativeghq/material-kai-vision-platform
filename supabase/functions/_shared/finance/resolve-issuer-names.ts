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
 *   4. ΑΑΔΕ RgWsPublic2 — LAST, opt-in per workspace, and only for the ΑΦΜ ΓΕΜΗ has
 *      definitively answered "no such company" about.
 *
 * ΓΕΜΗ first and ΑΑΔΕ last on purpose: every RgWsPublic2 lookup writes an audit entry into the
 * looked-up ΑΦΜ's TAXISnet inbox under the caller's identity and burns their monthly quota.
 * That is fine for "verify my own business" and completely wrong as the way to resolve 166
 * suppliers, so ΓΕΜΗ answers the overwhelming majority for free and in silence.
 *
 * But ΓΕΜΗ only carries ΓΕΜΗ-REGISTERED companies. A sole trader who invoices you is not in it
 * (measured: 3 issuers, 8 documents, 404 on every run forever), and no free source will ever
 * name them — ΑΑΔΕ is the only registry that can. So step 4 exists, bounded hard: opt-in per
 * workspace, capped per run, only about a business that filed a document against THIS workspace,
 * only after ΓΕΜΗ has said no, and never asked twice (an ΑΑΔΕ miss is cached as `source='aade'`
 * so a second run cannot re-notify the same business).
 */
// deno-lint-ignore-file no-explicit-any
import { resolveAadeCredentials, buildSoapEnvelope, postSoap, summarizeAadeError } from '../aade/soap.ts';
import {
  RGWSPUBLIC2_ENDPOINT, buildRgWsPublic2Body, parseBasicRec, displayNameFromBasicRec,
} from '../aade/rgwspublic2.ts';

const GEMI_BASE = 'https://opendata-api.businessportal.gr/api/opendata/v1';

/** Re-ask the registry about an ΑΦΜ it didn't know only after this long. */
const NOT_FOUND_RETRY_MS = 30 * 24 * 3600 * 1000;

export interface ResolveIssuerResult {
  candidates: number;   // unnamed issuer ΑΦΜ considered this run
  from_cache: number;
  from_crm: number;
  from_gemi: number;
  /** Named by the opt-in ΑΑΔΕ step — the ones ΓΕΜΗ structurally cannot answer. */
  from_aade: number;
  /** Live RgWsPublic2 calls made — i.e. businesses notified. Surfaced so the sync summary
   *  states the outward-facing cost rather than hiding it in a name count. */
  aade_calls: number;
  /** Why the ΑΑΔΕ step did nothing: not opted in, no codes configured, or nothing to ask. */
  aade_skipped: 'disabled' | 'not_configured' | 'nothing_to_ask' | null;
  /** ΑΑΔΕ refused us (expired codes, spent daily quota, 5xx). Surfaced, not swallowed —
   *  otherwise a dead credential is indistinguishable from "everyone is already named". */
  aade_error: string | null;
  not_found: number;
  docs_updated: number;
  /** The run stopped early on ΓΕΜΗ's per-minute budget; the rest resume next run. */
  throttled: boolean;
}

export interface ResolveIssuerOptions {
  /**
   * Hard ceiling on live ΓΕΜΗ calls per run. Defaults to ΓΕΜΗ's whole per-minute budget (8),
   * so one run costs ~1 minute of wall clock and a backlog drains across runs. Raising it does
   * not resolve more names — the limit is the limit — it only makes the function sit there
   * sleeping.
   */
  maxLookups?: number;
  /** Opt in to the ΑΑΔΕ step (see the file header for why this is a decision, not a default). */
  aadeFallback?: boolean;
  /** Ceiling on ΑΑΔΕ lookups per run — i.e. on businesses notified per run. */
  maxAadeLookups?: number;
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

/**
 * One registry lookup.
 *
 * Returns the best hit, `null` for a genuine "no such company", or `'error'` for anything
 * transient. The distinction matters: only a genuine miss may be cached as `not_found`.
 *
 * ΓΕΜΗ signals throttling as **HTTP 200** with `{"message":"API rate limit exceeded"}` and no
 * `searchResults` key — so status alone is not enough to tell a miss from a throttle. Reading
 * an absent `searchResults` as "no results" would permanently record live companies as
 * not-found; measured on a real backfill, that was 152 of 166 ΑΦΜ.
 */
interface GemiResult {
  hit: any | null | 'error';
  /** Requests left in the current minute, from ΓΕΜΗ's own headers. null when absent. */
  remaining: number | null;
  throttled: boolean;
}

async function gemiLookup(afm: string, apiKey: string): Promise<GemiResult> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 20000);
    const res = await fetch(`${GEMI_BASE}/companies?afm=${encodeURIComponent(afm)}`, {
      headers: { api_key: apiKey, Accept: 'application/json' },
      redirect: 'manual',
      signal: ctrl.signal,
    });
    clearTimeout(t);

    const rawRemaining = res.headers.get('x-ratelimit-remaining-minute')
      ?? res.headers.get('ratelimit-remaining');
    const remaining = rawRemaining != null && rawRemaining !== '' ? Number(rawRemaining) : null;

    // 404 is ΓΕΜΗ's "no such company" — a DEFINITIVE miss, and the only way it ever says so.
    // It has to be reported as a miss (`null`), not an error, or the ΑΦΜ is never cached and is
    // re-asked on every single run, forever. Measured on live data: the `200 + empty
    // searchResults` shape this used to rely on never occurs — 163 cached rows, ZERO recorded
    // misses — while three issuers (all non-ΓΕΜΗ ΑΦΜ) 404'd on every run and stayed name-less.
    if (res.status === 404) return { hit: null, remaining, throttled: false };
    // 503 is ΓΕΜΗ's routine maintenance window; 429 an explicit throttle. Both transient.
    if (!res.ok) return { hit: 'error', remaining, throttled: res.status === 429 };
    const body = await res.json().catch(() => null);
    if (!body || !Array.isArray(body.searchResults)) {
      return { hit: 'error', remaining, throttled: true };
    }
    return { hit: pickBest(body.searchResults, afm), remaining, throttled: false };
  } catch {
    return { hit: 'error', remaining: null, throttled: false };
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Resolve issuer names for a workspace's name-less inbound documents and write them back.
 * Best-effort throughout: a registry outage leaves the rows as they were.
 */
export async function resolveInboundIssuerNames(
  admin: any,
  workspaceId: string,
  gemiApiKey: string | null,
  opts: ResolveIssuerOptions = {},
): Promise<ResolveIssuerResult> {
  const { maxLookups = 8, aadeFallback = false, maxAadeLookups = 5 } = opts;
  const out: ResolveIssuerResult = {
    candidates: 0, from_cache: 0, from_crm: 0, from_gemi: 0, from_aade: 0, aade_calls: 0,
    aade_skipped: aadeFallback ? null : 'disabled', aade_error: null, not_found: 0, docs_updated: 0,
    throttled: false,
  };

  const { data: unnamed } = await admin
    .from('inbound_documents')
    .select('issuer_vat')
    .eq('workspace_id', workspaceId)
    .is('issuer_name', null)
    .not('issuer_vat', 'is', null)
    .limit(2000);

  // Annotated because `admin` is untyped: without it the Set widens to `unknown` and every
  // downstream use of an ΑΦΜ stops type-checking.
  const afms: string[] = [...new Set<string>((unnamed ?? []).map((r: any) => digits(r.issuer_vat)).filter((v: string) => v.length >= 9))];
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
    // ΓΕΜΗ's published budget is 8 requests per MINUTE (`X-RateLimit-Limit-Minute: 8`).
    // So the loop is strictly sequential and spends exactly that budget: pace one call per
    // ~8s, follow the `X-RateLimit-Remaining-Minute` header, and stop the moment we're
    // throttled rather than retrying. Retrying inside a run cannot help — the budget is
    // per-minute and already spent — it just burns the function's wall clock. The backlog
    // drains across runs instead, which is what the cache exists for.
    //
    // Measured the hard way: an unpaced backfill of 166 ΑΦΜ needed ~600 requests to resolve
    // 162 because ~75% came back throttled.
    const PACE_MS = 8000;
    for (let i = 0; i < toLookUp.length; i++) {
      const afm = toLookUp[i];
      const { hit, remaining, throttled } = await gemiLookup(afm, gemiApiKey);

      if (hit === 'error') {
        out.throttled = out.throttled || throttled;
        // Throttled or unreachable: nothing more will get through this minute. Leave the
        // rest for the next run — they stay uncached, so nothing is recorded as a miss.
        if (throttled) break;
      } else if (!hit) {
        await admin.from('greek_registry_companies').upsert(
          [{ afm, name: null, not_found: true, source: 'gemi', resolved_at: new Date().toISOString() }],
          { onConflict: 'afm' },
        );
        out.not_found++;
      } else {
        const name: string | null = hit.coNameEl
          ?? (Array.isArray(hit.coNamesEn) ? hit.coNamesEn[0] : null)
          ?? (Array.isArray(hit.coTitlesEl) ? hit.coTitlesEl[0] : null)
          ?? null;
        await admin.from('greek_registry_companies').upsert([{
          afm, name,
          ar_gemi: hit.arGemi != null ? String(hit.arGemi) : null,
          legal_form: hit.legalType?.descr ?? null,
          status: hit.status?.descr ?? null,
          city: hit.city ?? null,
          not_found: !name,
          source: 'gemi',
          resolved_at: new Date().toISOString(),
          raw: hit,
        }], { onConflict: 'afm' });
        if (name) { resolved.set(afm, name); out.from_gemi++; } else { out.not_found++; }
      }

      // Budget exhausted for this minute — stop rather than spend the run sleeping.
      if (remaining != null && remaining <= 0) { out.throttled = true; break; }
      if (i + 1 < toLookUp.length) await sleep(PACE_MS);
    }
  }

  // 4 — ΑΑΔΕ, for the ΑΦΜ the public registry structurally cannot answer. See the file header:
  // this notifies the looked-up business, so it is opt-in, capped, and never asked twice.
  if (aadeFallback) {
    const unresolved = afms.filter((a) => !resolved.has(a) && a.length === 9);
    // The gate is a RECORDED ΓΕΜΗ miss, not merely "still unnamed". An ΑΦΜ ΓΕΜΗ has not been
    // asked about yet — or that failed transiently — must go through the free registry first;
    // otherwise a ΓΕΜΗ outage would silently convert the whole backlog into ΑΑΔΕ notifications.
    const { data: misses } = unresolved.length > 0
      ? await admin.from('greek_registry_companies')
          .select('afm, source').in('afm', unresolved).eq('not_found', true)
      : { data: [] as any[] };
    // `source='aade'` means ΑΑΔΕ has already answered "no" about this ΑΦΜ. Asking again would
    // put a second audit entry in that business's inbox to learn the same thing.
    const targets = ((misses ?? []) as any[])
      .filter((r) => r.source !== 'aade')
      .map((r) => r.afm as string)
      .slice(0, maxAadeLookups);

    if (targets.length === 0) {
      out.aade_skipped = 'nothing_to_ask';
    } else {
      // Per-workspace Special Access Codes; only the operator's root workspace falls back to the
      // platform default. A tenant with no codes simply skips — it must never spend the
      // operator's quota or notify a business under the operator's identity.
      const creds = await resolveAadeCredentials(admin, workspaceId);
      if (!creds.username || !creds.password) {
        out.aade_skipped = 'not_configured';
      } else {
        for (const afm of targets) {
          const envelope = buildSoapEnvelope(creds, buildRgWsPublic2Body(creds.afmCalledBy, afm));
          const { ok, xml, httpStatus, err } = await postSoap(RGWSPUBLIC2_ENDPOINT, envelope);
          // A transport failure never reached ΑΑΔΕ: nothing was notified, nothing is known, so
          // record nothing and stop — the rest of the batch would fail the same way.
          if (err) { out.aade_error = err; break; }
          out.aade_calls++;

          const aadeErr = summarizeAadeError(xml);
          const code = `${aadeErr?.code ?? ''}`.toUpperCase();
          // Did ΑΑΔΕ answer about THEM, or refuse US? A refusal is bad codes, a spent daily
          // quota, a 5xx — transient, and about our access rather than their existence.
          // Caching one as "no such business" would mark live companies permanently unnameable:
          // precisely the ΓΕΜΗ-404 bug, one registry over. Only a verdict on the ΑΦΜ itself
          // ("wrong afm" / "not found") is allowed to become a cached miss.
          const refusal = !ok || (!!aadeErr
            && !(code.includes('WRONG_AFM') || code.includes('NOT_FOUND') || code.endsWith('_NF')));

          const rec = aadeErr ? null : parseBasicRec(xml);
          const name = displayNameFromBasicRec(rec);

          if (name) {
            await admin.from('greek_registry_companies').upsert([{
              afm, name,
              legal_form: rec?.legal_status_descr ?? null,
              status: rec?.deactivation_flag_descr ?? null,
              city: rec?.postal_area_description ?? null,
              not_found: false,
              source: 'aade',
              resolved_at: new Date().toISOString(),
              raw: rec,
            }], { onConflict: 'afm' });
            resolved.set(afm, name);
            out.from_aade++;
          } else if (!refusal) {
            // ΑΑΔΕ genuinely has no name for this ΑΦΜ. Cache it as an ΑΑΔΕ-sourced miss so the
            // business is never looked up — never re-notified — again.
            await admin.from('greek_registry_companies').upsert(
              [{ afm, name: null, not_found: true, source: 'aade', resolved_at: new Date().toISOString() }],
              { onConflict: 'afm' },
            );
            out.not_found++;
          } else {
            // Surfaced in the sync summary rather than swallowed — an expired credential here
            // would otherwise look identical to "every supplier is already named".
            out.aade_error = aadeErr?.message ?? `ΑΑΔΕ HTTP ${httpStatus}`;
          }

          // Our own record of who/when/why/which ΑΦΜ. `requested_by` is null because no human
          // asked for this one — the workspace's standing opt-in did. Never blocks the sync.
          try {
            await admin.from('aade_lookup_log').insert({
              looked_up_afm: afm,
              workspace_id: workspaceId,
              requested_by: null,
              reason: 'invoice_counterparty',
              source: 'aade',
              valid_afm: rec?.deactivation_flag === '1' ? true : (rec?.deactivation_flag === '2' ? false : null),
            });
          } catch (logErr) { console.error('[resolve-issuer-names] audit log failed', String(logErr)); }

          // A refusal is about our access, so it will repeat for every remaining ΑΦΜ. Stop
          // rather than spend the batch collecting the same answer.
          if (refusal) break;
        }
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
