/** seo-toolkit-research — user-driven research wrapper. */

import { createClient } from '@supabase/supabase-js';
import { authenticate } from '../../_shared/auth.ts';
import { bootstrapForFunction } from '../../_shared/secrets-bootstrap.ts';
import { resolveWebsite } from '../../_shared/seo-website.ts';
import { resolveAndAssertSeoEntitled } from './entitlement.ts';
import { openSpendGate } from '../../_shared/tools/dataforseo-spend-gate.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const PYTHON_BACKEND_URL = Deno.env.get('PYTHON_BACKEND_URL') || 'https://v1api.materialshub.gr';
const CRON_SECRET = () => Deno.env.get('CRON_SECRET') || '';

interface ResearchPayload {
  kind: string;
  subject: string;
  params: Record<string, unknown>;
  label?: string | null;
}

const strList = (v: unknown, max: number, len = 200): string[] | undefined =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').map((x) => x.slice(0, len)).slice(0, max) : undefined;

/** The MIVAA body, built field by field. `workspace_id` is the server-resolved one, never the caller's. */
export function buildResearchParams(raw: Record<string, unknown>, workspaceId: string | null): Record<string, unknown> {
  const out: Record<string, unknown> = {
    subject_label: String(raw.subject_label ?? '').slice(0, 200),
    workspace_id: workspaceId,
  };
  if (typeof raw.brand_name === 'string') out.brand_name = raw.brand_name.slice(0, 200);
  if (typeof raw.homepage_domain === 'string') out.homepage_domain = raw.homepage_domain.slice(0, 253);
  const aliases = strList(raw.aliases, 20);
  if (aliases) out.aliases = aliases;
  const languages = strList(raw.language_codes, 10, 10);
  if (languages) out.language_codes = languages;
  const countries = strList(raw.country_codes, 10, 10);
  if (countries) out.country_codes = countries;
  const types = strList(raw.types, 20, 64);
  if (types) out.types = types;
  const limit = Number(raw.limit_per_type);
  if (Number.isInteger(limit)) out.limit_per_type = Math.min(Math.max(limit, 1), 20);
  if (typeof raw.use_llm_summary === 'boolean') out.use_llm_summary = raw.use_llm_summary;
  return out;
}

export async function handleToolkitResearch(req: Request, body: any): Promise<Response> {
  await bootstrapForFunction();
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, content-type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
      },
    });
  }

  try {
    const auth = await authenticate(req, { requireUser: true });
    if (!auth.success || !auth.userId) return jsonResponse({ ok: false, error: auth.error || 'unauthorized' }, 401);
    const userId = auth.userId;

    if (!body?.subject || !body?.params || typeof body.params !== 'object') {
      return jsonResponse({ ok: false, error: 'subject and params required' }, 400);
    }

    // Persist via service-role (so insert works regardless of RLS, but with
    // explicit user_id from the verified JWT)
    const sbAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Paid module — refuse BEFORE firing the MIVAA/DataForSEO engine (#212). Also resolves
    // the workspace the run is filed under (was a late `.maybeSingle()` lookup below).
    const { workspaceId, response: entResponse } = await resolveAndAssertSeoEntitled(sbAdmin, userId, auth.apiKey?.workspace_id);
    if (entResponse) return entResponse;
    const params = buildResearchParams(body.params as Record<string, unknown>, workspaceId ?? null);
    if (!params.subject_label) return jsonResponse({ ok: false, error: 'params.subject_label required' }, 400);

    // Meter BEFORE the engine runs (invariant 10, #365 `AD-13`). opportunities-stateless fans out
    // to DataForSEO SERP + Labs on the OPERATOR's x-cron-secret credential, so entitlement alone
    // ("this workspace bought the module") left every run of it free and unbounded. Reserve a
    // ceiling, settle the cost MIVAA reports back.
    const gate = await openSpendGate('composite_opportunities', userId, params, workspaceId);
    if (!gate.ok) {
      return jsonResponse({ ok: false, error: gate.message ?? 'Insufficient credits' }, 402);
    }

    const start = Date.now();
    // Fire the MIVAA opportunities-stateless engine
    const url = `${PYTHON_BACKEND_URL.replace(/\/+$/, '')}/api/v1/mention-monitoring/opportunities-stateless`;
    let resp: Response;
    try {
      resp = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-cron-secret': CRON_SECRET(),
        },
        body: JSON.stringify(params),
      });
    } catch (e) {
      await gate.settle(0);
      throw e;
    }
    const latency_ms = Date.now() - start;

    let mivaaJson: any = null;
    try { mivaaJson = await resp.json(); } catch { /* ignore */ }
    const ok = resp.ok && mivaaJson?.success;
    const data = mivaaJson?.data;
    // A failed run refunds the whole reserve; a successful one settles against the provider's
    // own reported cost, which is also what lands in `seo_research_runs.cost_usd` below — it was
    // hardcoded to 0, so every run reported as free regardless of what it spent.
    const upstreamCostUsd = ok ? Number(data?.cost_usd) : 0;
    await gate.settle(ok && Number.isFinite(upstreamCostUsd) ? upstreamCostUsd : (ok ? undefined : 0));

    // File the run under the workspace + connected website so it surfaces in the
    // website's SEO dashboard. website_id: explicit body.website_id → default site.
    const website = await resolveWebsite(sbAdmin, { workspaceId, explicitWebsiteId: body.website_id });

    const { data: row, error: insertErr } = await sbAdmin
      .from('seo_research_runs')
      .insert({
        user_id: userId,
        workspace_id: workspaceId,
        website_id: website?.id ?? null,
        kind: body.kind,
        subject: body.subject.slice(0, 200),
        request_params: params,
        response: data || null,
        country_code: (params.country_codes as string[] | undefined)?.[0] || null,
        language_code: (params.language_codes as string[] | undefined)?.[0] || null,
        cost_usd: Number.isFinite(upstreamCostUsd) ? upstreamCostUsd : null,
        latency_ms,
        success: ok,
        error_message: ok ? null : (mivaaJson?.detail || `MIVAA ${resp.status}`),
        label: body.label || null,
      })
      .select('id')
      .single();
    if (insertErr) {
      console.warn('[seo-toolkit-research] persist failed:', insertErr.message);
    }

    return jsonResponse({
      ok,
      run_id: row?.id || null,
      data,
      latency_ms,
      error: ok ? null : (mivaaJson?.detail || `MIVAA ${resp.status}`),
    // Reflect upstream failure in the HTTP status — never 200 on a failed MIVAA call.
    // Use the upstream status when it's already an error, otherwise 502 (bad gateway).
    }, ok ? 200 : (resp.status >= 400 ? resp.status : 502));
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[seo-toolkit-research] error:', msg);
    return jsonResponse({ ok: false, error: msg }, 500);
  }
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  });
}
