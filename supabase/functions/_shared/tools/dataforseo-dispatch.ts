/** The ONE way an edge function reaches DataForSEO. */

import { openSpendGate, dataForSeoTaskError, type SpendGate } from './dataforseo-spend-gate.ts';
import { describeUpstreamError } from '../tool-result-shape.ts';
import { createClient } from '@supabase/supabase-js';
import { resolveSecret } from '../secrets.ts';

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

/** Resolved per call: an admin-saved CRON_SECRET lives only in platform_secrets, which Deno.env never sees. */
async function agentRouteSecret(): Promise<string> {
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  return (await resolveSecret(db, 'CRON_SECRET')).value ?? '';
}

/**
 * Total upstream cost of a composite response. Returns undefined — never 0 — when no section
 * reports one, so the gate keeps its reserve rather than settling a paid call to free.
 */
export function sumSectionCost(data: any): number | undefined {
  if (!data || typeof data !== 'object') return undefined;
  if (typeof data.cost_usd === 'number') return data.cost_usd;
  const sections = data.sections;
  if (!sections || typeof sections !== 'object') return undefined;
  let total = 0;
  let seen = false;
  for (const section of Object.values(sections as Record<string, any>)) {
    const c = Number(section?.cost_usd);
    if (Number.isFinite(c)) { total += c; seen = true; }
  }
  return seen ? total : undefined;
}

/** Composite-audit dispatcher (site-review, brand-search, keyword-gap, quick-page). */
export async function callSEOAgentRoute(
  path: string,
  body: Record<string, any>,
): Promise<{ ok: boolean; data?: any; error?: string }> {
  const secret = await agentRouteSecret();
  if (!secret) return { ok: false, error: 'CRON_SECRET not configured' };
  const attribution = body?.attribution as DataForSeoAttribution | undefined;
  const gate = await openSpendGate(`composite_${path}`, attribution?.user_id, body, attribution?.workspace_id);
  if (!gate.ok) return { ok: false, error: gate.message };
  try {
    const resp = await fetch(
      `${gatewayUrl()}/api/v1/seo-agent/${path}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-cron-secret': secret },
        // A composite fans out to several DataForSEO calls under ONE reservation, so the flag
        // has to reach every one of them — MIVAA charged its unit on each leg.
        body: JSON.stringify(attribution ? { ...body, attribution: meteredAttribution(gate, attribution) } : body),
      },
    );
    const text = await resp.text();
    let parsed: any = null;
    try { parsed = JSON.parse(text); } catch { parsed = text; }
    if (!resp.ok) {
      await gate.settle(0);
      return { ok: false, error: describeUpstreamError(resp.status, parsed) };
    }
    const data = parsed?.data;
    // Composite routes report cost per section; the call's cost is their sum.
    await gate.settle(sumSectionCost(data));
    const taskError = dataForSeoTaskError(data);
    if (taskError) return { ok: false, error: taskError };
    return { ok: true, data };
  } catch (e) {
    await gate.settle(0);
    return { ok: false, error: e instanceof Error ? e.message : 'network error' };
  }
}
