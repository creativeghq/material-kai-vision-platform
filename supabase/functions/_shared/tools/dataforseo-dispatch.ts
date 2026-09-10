/**
 * The ONE way an edge function reaches DataForSEO.
 *
 * This used to live inside `seo-agent-tools.ts` as a module-private helper, which was fine while
 * the SEO agent was the only caller. It is not any more: the CRM's Google Business lookup needs
 * the same upstream, and importing `seo-agent-tools.ts` to get at it would drag @langchain/core's
 * generic graph into a plain REST handler.
 *
 * Everything that made the original correct comes with it, because each piece is a bug we already
 * shipped once:
 *
 *  - **Invariant 10** — credits are reserved BEFORE the operator's `x-cron-secret` spends money
 *    upstream, and settled against the cost DataForSEO itself reports (#365 `AD-13`).
 *  - **`metered_upstream`** — MIVAA charges its own flat unit for callers that do not reserve, so
 *    without this flag every gated call was billed twice (#365, 134 duplicate charges in 30 days).
 *  - **HTTP 200 is not success** — DataForSEO puts the verdict in `status_code` (#365 `AD-14`).
 *
 * A raw `fetch` to the SEO gateway from anywhere else is ungated spend. Add a caller here instead.
 */

import { openSpendGate, dataForSeoTaskError, type SpendGate } from './dataforseo-spend-gate.ts';
import { describeUpstreamError } from '../tool-result-shape.ts';

export interface DataForSeoAttribution {
  user_id?: string;
  workspace_id?: string;
  /** `metered_upstream` rides along here; MIVAA turns the whole object into a CostAttribution. */
  [key: string]: unknown;
}

export interface DataForSeoCall {
  ok: boolean;
  /**
   * Normalized `DataForSEOResult`: { items, raw, status_code, cost_usd, latency_ms, error }.
   *
   * `items` stays loose because its shape is DataForSEO's and differs per endpoint — a keyword
   * item, a backlink row and a business listing share only the array. Narrowing it here would
   * mean 70 endpoint interfaces mirroring a third party's undocumented drift; callers read the
   * three or four fields they need and are responsible for `?? null` on each.
   */
  // deno-lint-ignore no-explicit-any
  data?: { items?: any[]; cost_usd?: number; [key: string]: any };
  error?: string;
}

/**
 * Env is read lazily: the Supabase edge bootstrap only populates it at handler entry, so a
 * module-load `Deno.env.get` reads `undefined` (see `_shared/secrets.ts`).
 */
const gatewayUrl = () => Deno.env.get('MIVAA_GATEWAY_URL') || 'https://v1api.materialshub.gr';
const cronSecret = () => Deno.env.get('CRON_SECRET') || '';

/**
 * Tell MIVAA this call's credits are already reserved here.
 *
 * Set only when the gate actually metered, so a pass-through (no payer, no pricing row) still
 * pays MIVAA's unit rather than nothing.
 */
export function meteredAttribution(
  gate: SpendGate,
  attribution?: DataForSeoAttribution,
): Record<string, unknown> | undefined {
  if (!gate.metered || !attribution) return attribution;
  return { ...attribution, metered_upstream: true };
}

/**
 * Call `POST /api/v1/seo-agent/dataforseo/{kind}` on MIVAA. `kind` is a method name on
 * `DataForSEOUnifiedClient` (whitelisted there); `params` is forwarded as **kwargs.
 */
export async function callDataForSEO(
  kind: string,
  params: Record<string, unknown>,
  attribution?: DataForSeoAttribution,
): Promise<DataForSeoCall> {
  const secret = cronSecret();
  if (!secret) return { ok: false, error: 'CRON_SECRET not configured' };

  const gate = await openSpendGate(kind, attribution?.user_id, params, attribution?.workspace_id);
  if (!gate.ok) return { ok: false, error: gate.message };

  try {
    const resp = await fetch(`${gatewayUrl()}/api/v1/seo-agent/dataforseo/${kind}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-cron-secret': secret },
      body: JSON.stringify({ params, attribution: meteredAttribution(gate, attribution) }),
    });
    const text = await resp.text();
    let parsed: unknown = null;
    try { parsed = JSON.parse(text); } catch { parsed = text; }
    if (!resp.ok) {
      await gate.settle(0);
      return { ok: false, error: describeUpstreamError(resp.status, parsed) };
    }
    const data = (parsed as { data?: DataForSeoCall['data'] })?.data;
    await gate.settle(data?.cost_usd);
    const taskError = dataForSeoTaskError(data);
    if (taskError) return { ok: false, error: taskError };
    return { ok: true, data };
  } catch (e) {
    await gate.settle(0);
    return { ok: false, error: e instanceof Error ? e.message : 'network error' };
  }
}
