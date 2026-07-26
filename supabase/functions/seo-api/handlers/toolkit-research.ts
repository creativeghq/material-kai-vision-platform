/**
 * seo-toolkit-research — user-driven research wrapper.
 *
 * The dashboard + ProductSEOTab fire research with the user's session JWT.
 * This edge function:
 *   1. Verifies the JWT (Authorization: Bearer ...)
 *   2. Calls MIVAA's /api/v1/mention-monitoring/opportunities-stateless
 *      with x-cron-secret (server-side only — never exposed to the browser)
 *   3. Persists the result into seo_research_runs (RLS owner-scoped)
 *   4. Returns the full DataForSEO opportunity payload
 *
 * Body: { kind, subject, params, label? }
 * `params` is forwarded verbatim to /opportunities-stateless.
 *
 * Required env: PYTHON_BACKEND_URL, CRON_SECRET(), SUPABASE_URL,
 *               SUPABASE_SERVICE_ROLE_KEY.
 */

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { bootstrapForFunction } from '../../_shared/secrets-bootstrap.ts';
import { resolveWebsite } from '../../_shared/seo-website.ts';

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
    const authHeader = req.headers.get('authorization') || '';
    if (!authHeader.startsWith('Bearer ')) {
      return jsonResponse({ ok: false, error: 'unauthorized' }, 401);
    }
    const userJwt = authHeader.slice('Bearer '.length);

    const sbUser = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      global: { headers: { Authorization: `Bearer ${userJwt}` } },
    });
    const { data: userRes } = await sbUser.auth.getUser();
    if (!userRes.user) return jsonResponse({ ok: false, error: 'invalid jwt' }, 401);
    const userId = userRes.user.id;

    if (!body?.subject || !body?.params) {
      return jsonResponse({ ok: false, error: 'subject and params required' }, 400);
    }

    const start = Date.now();
    // Fire the MIVAA opportunities-stateless engine
    const url = `${PYTHON_BACKEND_URL.replace(/\/+$/, '')}/api/v1/mention-monitoring/opportunities-stateless`;
    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-cron-secret': CRON_SECRET(),
      },
      body: JSON.stringify(body.params),
    });
    const latency_ms = Date.now() - start;

    let mivaaJson: any = null;
    try { mivaaJson = await resp.json(); } catch { /* ignore */ }
    const ok = resp.ok && mivaaJson?.success;
    const data = mivaaJson?.data;

    // Persist via service-role (so insert works regardless of RLS, but with
    // explicit user_id from the verified JWT)
    const sbAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // File the run under the workspace + connected website so it surfaces in the
    // website's SEO dashboard. website_id: explicit body.website_id → default site.
    const { data: memberData } = await sbAdmin
      .from('workspace_members')
      .select('workspace_id')
      .eq('user_id', userId)
      .maybeSingle();
    const workspaceId = memberData?.workspace_id || null;
    const website = await resolveWebsite(sbAdmin, { workspaceId, explicitWebsiteId: body.website_id });

    const { data: row, error: insertErr } = await sbAdmin
      .from('seo_research_runs')
      .insert({
        user_id: userId,
        workspace_id: workspaceId,
        website_id: website?.id ?? null,
        kind: body.kind,
        subject: body.subject.slice(0, 200),
        request_params: body.params,
        response: data || null,
        country_code: (body.params as any)?.country_codes?.[0] || null,
        language_code: (body.params as any)?.language_codes?.[0] || null,
        cost_usd: 0,
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
