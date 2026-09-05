/**
 * DataForSEO spend gate — invariant 10 for the SEO agent toolkit (#365 `AD-13`, `AD-14`).
 *
 * Every SEO agent tool reaches DataForSEO through MIVAA using `x-cron-secret`, which is the
 * OPERATOR's credential. Four audits traced the chain looking for the layer that debits before
 * the spend (#352 `A18` in the tool wrappers, #361 `EG-4` in `seo-api`, the MIVAA route check,
 * and `AD-13` in `_shared/dataforseo-client.ts`) and found none — while `seo_site_crawl_start`
 * accepts `max_pages` up to 1000 and a dozen Labs tools accept `limit` up to 1000. DataForSEO
 * was not even present in `ai_model_pricing`, so there was no price to charge.
 *
 * The shape here is reserve → settle (`_shared/credit-reserve.ts`), because the real cost is only
 * known after the call: DataForSEO reports it per response and MIVAA normalises it to `cost_usd`.
 *
 *   1. Reserve a per-op-class CEILING before the fetch. Out of credits → the tool refuses and
 *      NOTHING is spent upstream.
 *   2. Run the call.
 *   3. Settle against the provider's own reported `cost_usd` — surplus refunded, overage charged.
 *
 * The billing unit is deliberately money, not calls: `dataforseo-request` is priced at
 * $0.001/unit, so one unit is a thousandth of a dollar of DataForSEO spend and `units` is just
 * `cost_usd * 1000`. That keeps `ai_model_pricing` the single USD source without anybody having
 * to guess a per-endpoint price (which the platform rule forbids) — the ceiling is a reserve
 * size, and the amount actually billed is the amount actually measured.
 *
 * A response that reports no cost settles at the CEILING, not at zero, and logs an error. Zero is
 * the platform's dominant historical failure (`ops.silent_zero`); a missing cost is a defect to
 * surface, not a discount to grant.
 */

import { createClient } from '@supabase/supabase-js';
import { getServicePricing, debitOrRefuseTracked, recordExternalServiceOutcome } from '../credit-utils.ts';
import { settleCredits } from '../credit-reserve.ts';

/** `ai_model_pricing.model_key` for DataForSEO spend. One unit = $0.001 of provider cost. */
export const DATAFORSEO_SERVICE = 'dataforseo-request';

/** Fallback markup used only if the pricing row cannot be read; mirrors the platform default. */
const FALLBACK_MARKUP = 1.5;

/** USD per billing unit. Must match the seeded `ai_model_pricing.cost_per_unit`. */
const USD_PER_UNIT = 0.001;

// deno-lint-ignore no-explicit-any
type Sb = any;

let _client: Sb | null = null;

/**
 * Service-role client, built lazily. Module-load `Deno.env.get` reads `undefined` on Supabase
 * edge because the bootstrap only populates env at handler entry (see `_shared/secrets.ts`).
 */
function client(): Sb | null {
  if (_client) return _client;
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) return null;
  _client = createClient(url, key);
  return _client;
}

// ── Workspace resolution ─────────────────────────────────────────────────────
// Most SEO tool factories take only `_userId`, so the workspace has to be resolved here or the
// spend lands on `ai_usage_logs.workspace_id = NULL` — the exact gap fixed across both repos on
// 2026-08-12, which broke per-tenant cost views and the `is_workspace_admin` RLS branch.

const WS_CACHE_TTL_MS = 60_000;
const _wsCache = new Map<string, { workspaceId: string | null; expiresAt: number }>();

async function resolveWorkspace(sb: Sb, userId: string): Promise<string | null> {
  const hit = _wsCache.get(userId);
  if (hit && hit.expiresAt > Date.now()) return hit.workspaceId;
  let workspaceId: string | null = null;
  try {
    const { data } = await sb
      .from('workspace_members')
      .select('workspace_id')
      .eq('user_id', userId)
      .eq('status', 'active')
      .order('joined_at', { ascending: false })
      .limit(1);
    workspaceId = data?.[0]?.workspace_id ?? null;
  } catch (e) {
    console.warn('[dataforseo-gate] workspace resolve failed:', (e as Error)?.message);
  }
  _wsCache.set(userId, { workspaceId, expiresAt: Date.now() + WS_CACHE_TTL_MS });
  return workspaceId;
}

// ── Ceilings ─────────────────────────────────────────────────────────────────

/**
 * Reserve ceiling in units ($0.001 each) per operation class. These are bounds on what one call
 * may cost, NOT prices — the settle step replaces them with the provider's reported cost. They
 * exist so a caller who cannot pay for the call is stopped before it happens.
 */
const CEILING_UNITS: Array<{ match: RegExp; units: number }> = [
  // Composite routes fan out to several DataForSEO endpoints in one call, so they reserve for
  // the whole fan-out. `site-review` alone is domain rank + ranked keywords + competitors +
  // backlinks summary + anchors.
  { match: /^composite_site-review$/, units: 150 },
  { match: /^composite_keyword-gap$/, units: 80 },
  { match: /^composite_brand-search-audit$/, units: 60 },
  { match: /^composite_opportunities$/, units: 60 },
  { match: /^composite_onpage\//, units: 30 },
  // SERP live endpoints are the cheapest class (~$0.002/call).
  { match: /^serp_|^ai_overview|^local_pack|^google_maps|^gbp_/, units: 8 },
  // OnPage task creation is priced per crawled page; the per-page term is added separately.
  { match: /^onpage/, units: 20 },
  // Backlinks endpoints are the most expensive class.
  { match: /^backlinks_|^referring_domains|^subdomains|^relevant_pages/, units: 40 },
  // Content analysis / sentiment.
  { match: /^content_/, units: 15 },
];

const DEFAULT_CEILING_UNITS = 30; // Labs (keywords, domain, competitors, intersections, …)

/** OnPage is billed per crawled page upstream; reserve for the cap the caller actually asked for. */
const ONPAGE_UNITS_PER_PAGE = 0.2;

export function ceilingUnitsFor(kind: string, params?: Record<string, unknown>): number {
  const base = CEILING_UNITS.find((c) => c.match.test(kind))?.units ?? DEFAULT_CEILING_UNITS;
  if (/^(composite_)?onpage/.test(kind)) {
    const pages = Number(params?.max_crawl_pages ?? params?.max_pages ?? 0);
    if (Number.isFinite(pages) && pages > 0) {
      return base + Math.ceil(pages * ONPAGE_UNITS_PER_PAGE);
    }
  }
  return base;
}

// ── The gate ─────────────────────────────────────────────────────────────────

export interface SpendGate {
  /** Caller may proceed. When false, `refusal` is a ready tool-result string. */
  ok: boolean;
  /**
   * True when THIS gate reserved the caller's credits. The dispatcher forwards it to MIVAA as
   * `attribution.metered_upstream`, and MIVAA's DataForSEO client — which charges a flat unit
   * per call for callers that do not reserve — stands down for the call. Without the flag every
   * SEO-agent call was billed twice (edge reserve settled at real cost + MIVAA's flat unit): 134
   * calls in the 30 days to 2026-09-05. False on a pass-through so an unmetered call still pays
   * MIVAA's unit rather than nothing.
   */
  metered: boolean;
  refusal?: string;
  /** Human-readable reason, safe to hand back to the agent as the tool's error. */
  message?: string;
  /**
   * Settle the reservation against the provider's reported cost. `costUsd` undefined/NaN means
   * the response carried no cost — the ceiling stands and an error is logged.
   */
  settle: (costUsd: number | null | undefined) => Promise<void>;
}

/** A gate that charges nothing and settles to nothing — used when metering is unavailable. */
const PASS_THROUGH: SpendGate = { ok: true, metered: false, settle: async () => {} };

/**
 * Reserve DataForSEO spend for one upstream call.
 *
 * Fails OPEN on a metering-infrastructure error (no service-role client, RPC blip) so a transient
 * problem in billing does not take the toolkit down — but fails CLOSED on an actual "not enough
 * credits" answer, which is the case invariant 10 is about.
 */
export async function openSpendGate(
  kind: string,
  userId: string | undefined,
  params?: Record<string, unknown>,
  workspaceIdHint?: string | null,
): Promise<SpendGate> {
  // No identified user → a cron/service context, metered by its own cron key.
  if (!userId) return PASS_THROUGH;
  const sb = client();
  if (!sb) {
    console.warn('[dataforseo-gate] no service-role client; proceeding unmetered');
    return PASS_THROUGH;
  }

  const units = ceilingUnitsFor(kind, params);
  const workspaceId = workspaceIdHint ?? (await resolveWorkspace(sb, userId));
  const opType = `dataforseo_${kind}`;

  const pricing = await getServicePricing(sb, DATAFORSEO_SERVICE).catch(() => null);
  if (!pricing) {
    // No pricing row = nothing to charge against. Surface it loudly rather than silently
    // handing out free provider spend, but do not break the toolkit.
    console.error(
      `[dataforseo-gate] '${DATAFORSEO_SERVICE}' missing from ai_model_pricing — ${kind} ran UNMETERED`,
    );
    return PASS_THROUGH;
  }

  const creditsPerUnit = pricing.cost_per_unit * (pricing.markup_multiplier || FALLBACK_MARKUP) * 100;
  const reservedCredits = Math.round(units * creditsPerUnit * 100) / 100;

  const { refusal, usageLogId } = await debitOrRefuseTracked(
    sb, userId, DATAFORSEO_SERVICE, opType, units,
    { kind, reserve: true, ceiling_units: units }, workspaceId,
    // Name the module. `ai_usage_logs.module_slug` exists and this writer left it null on 5,192
    // rows, which is what makes "what is the SEO toolkit costing us" unanswerable.
    { moduleSlug: 'seo-toolkit' },
  );
  if (refusal) {
    let message = 'Not enough credits to run this SEO lookup. Please top up.';
    try { message = JSON.parse(refusal)?.error || message; } catch { /* keep the default */ }
    return { ok: false, metered: false, refusal, message, settle: async () => {} };
  }

  return {
    ok: true,
    metered: true,
    settle: async (costUsd) => {
      const known = typeof costUsd === 'number' && Number.isFinite(costUsd) && costUsd >= 0;
      // Settling is the moment the outcome becomes knowable, so it is where the usage row learns
      // it. The debit ran BEFORE the call, so the row was written not knowing — and
      // `ops.silent_zero`'s provider-failure arm reads `metadata.success` and skips a row without
      // it. Every dataforseo_* operation shares this gate, so stamping here covers all of them
      // without touching a single call site.
      await recordExternalServiceOutcome(
        sb, usageLogId, known,
        known ? null : `${kind}: DataForSEO reported no cost_usd`,
      );
      if (!known) {
        console.error(
          `[dataforseo-gate] ${kind} reported no cost_usd — keeping the ${units}-unit reserve. ` +
          `A DataForSEO response without a cost is a defect, not a free call.`,
        );
        return;
      }
      const actualUnits = Math.ceil((costUsd as number) / USD_PER_UNIT);
      const actualCredits = Math.round(actualUnits * creditsPerUnit * 100) / 100;
      await settleCredits(sb, userId, workspaceId ?? undefined, reservedCredits, actualCredits, opType, {
        kind, cost_usd: costUsd, actual_units: actualUnits, ceiling_units: units,
      });
    },
  };
}

// ── Upstream task-status verification (`AD-14`) ──────────────────────────────

/**
 * DataForSEO answers HTTP 200 for a FAILED task and puts the verdict in `status_code`. Treating
 * 200 as success means a paid call that returned nothing reads as a successful one, with no error
 * anywhere — the same shape as a silent zero, and it compounds `AD-13`: spend that is neither
 * gated nor verified.
 *
 * 20000–29999 is the success range (20000 Ok, 20100 Task Created). 40000+ is an error.
 */
export function dataForSeoTaskError(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') return null;
  const d = payload as Record<string, any>;

  const check = (code: unknown, message: unknown, where: string): string | null => {
    const n = Number(code);
    if (!Number.isFinite(n) || n < 30000) return null;
    return `DataForSEO ${where} status ${n}: ${String(message ?? 'no message')}`;
  };

  const top = check(d.status_code, d.status_message, 'response');
  if (top) return top;

  const tasks = Array.isArray(d.tasks) ? d.tasks : [];
  for (const t of tasks) {
    const err = check(t?.status_code, t?.status_message, 'task');
    if (err) return err;
  }

  // MIVAA's normalised shape surfaces upstream failures on `error`.
  if (typeof d.error === 'string' && d.error) return `DataForSEO error: ${d.error}`;
  return null;
}
