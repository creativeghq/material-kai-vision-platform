/**
 * seo-toolkit-audit — composite domain audit for /admin/seo dashboard.
 *
 * Two invocation modes:
 *   1. User-driven (with user JWT): "Audit now" button on the dashboard.
 *      Verifies row ownership via RLS implicitly (the user's JWT identity
 *      is checked against tracked_domain.user_id). Service-role Supabase
 *      client is used for the actual writes once ownership is verified.
 *
 *   2. Cron-driven (with x-cron-secret header): pg_cron tick fires hourly
 *      and audits any tracked_domain where next_audit_at < now(). No user
 *      JWT — service-role does the row look-up by id.
 *
 * Pipeline:
 *   - Read tracked_domain row by id
 *   - Call MIVAA /api/v1/seo-agent/site-review (composite: domain rank +
 *     ranked keywords + competitors + backlinks summary + anchors)
 *   - Insert seo_domain_audit_history row from result
 *   - Update seo_tracked_domains denormalised current_* fields +
 *     last_audited_at + last_audit_id + next_audit_at
 *
 * Required env: PYTHON_BACKEND_URL, CRON_SECRET(), SUPABASE_URL,
 *               SUPABASE_SERVICE_ROLE_KEY.
 */

import { createClient } from '@supabase/supabase-js';
import { bootstrapForFunction } from '../../_shared/secrets-bootstrap.ts';
import { assertEntitled } from '../../_shared/entitlement.ts';
import { SEO_MODULE } from './entitlement.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const PYTHON_BACKEND_URL = Deno.env.get('PYTHON_BACKEND_URL') || 'https://v1api.materialshub.gr';
const CRON_SECRET = () => Deno.env.get('CRON_SECRET') || '';

interface AuditPayload {
  tracked_domain_id?: string;
  source?: 'manual' | 'cron' | 'first_run';
}

export async function handleToolkitAudit(req: Request, body: any): Promise<Response> {
  await bootstrapForFunction();
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, x-cron-secret, content-type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
      },
    });
  }

  try {
    const cronSecretHeader = req.headers.get('x-cron-secret');
    const isCron = !!cronSecretHeader && cronSecretHeader === CRON_SECRET();

    const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // ── Branch A: cron-mode batch ──
    if (isCron) {
      // Find active tracked domains due for audit (next_audit_at <= now() OR null)
      const { data: due, error } = await sb
        .from('seo_tracked_domains')
        .select('*')
        .eq('is_active', true)
        .or(`next_audit_at.is.null,next_audit_at.lte.${new Date().toISOString()}`)
        .limit(20);
      if (error) throw error;
      const results: any[] = [];
      for (const td of due || []) {
        try {
          const r = await runAuditFor(sb, td, 'cron');
          results.push({ id: td.id, ok: true, audit_id: r.audit_id });
        } catch (e) {
          results.push({ id: td.id, ok: false, error: e instanceof Error ? e.message : String(e) });
        }
      }
      return jsonResponse({ ok: true, processed: due?.length || 0, results });
    }

    // ── Branch B: user-driven (Authorization: Bearer <user_jwt>) ──
    const authHeader = req.headers.get('authorization') || '';
    if (!authHeader.startsWith('Bearer ')) {
      return jsonResponse({ ok: false, error: 'unauthorized' }, 401);
    }
    const userJwt = authHeader.slice('Bearer '.length);
    // Use a user-scoped client to verify identity + ownership
    const sbUser = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      global: { headers: { Authorization: `Bearer ${userJwt}` } },
    });
    const { data: userRes } = await sbUser.auth.getUser();
    if (!userRes.user) return jsonResponse({ ok: false, error: 'invalid jwt' }, 401);
    const userId = userRes.user.id;

    const trackedId = body.tracked_domain_id;
    if (!trackedId) return jsonResponse({ ok: false, error: 'tracked_domain_id required' }, 400);
    const source = body.source || 'manual';

    const { data: td, error } = await sbUser
      .from('seo_tracked_domains')
      .select('*')
      .eq('id', trackedId)
      .maybeSingle();
    if (error) return jsonResponse({ ok: false, error: error.message }, 500);
    if (!td) return jsonResponse({ ok: false, error: 'tracked_domain not found' }, 404);
    if ((td as any).user_id !== userId) {
      return jsonResponse({ ok: false, error: 'forbidden' }, 403);
    }

    // Paid module — refuse before firing the MIVAA composite audit (#212). Cron batch
    // (Branch A) is operator-driven and stays ungated.
    if ((td as any).workspace_id) {
      const ent = await assertEntitled(sb, (td as any).workspace_id, SEO_MODULE);
      if (!ent.ok) return ent.response;
    }

    const result = await runAuditFor(sb, td, source);
    return jsonResponse({ ok: true, audit_id: result.audit_id });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[seo-toolkit-audit] error:', msg);
    return jsonResponse({ ok: false, error: msg }, 500);
  }
}

// ─────────────────────────────────────────────────────────────────
// Audit pipeline
// ─────────────────────────────────────────────────────────────────

async function runAuditFor(sb: any, td: any, source: string): Promise<{ audit_id: string }> {
  // Fire MIVAA composite site-review
  const url = `${PYTHON_BACKEND_URL.replace(/\/+$/, '')}/api/v1/seo-agent/site-review`;
  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-cron-secret': CRON_SECRET(),
    },
    body: JSON.stringify({
      domain: td.domain,
      country_code: td.country_code,
      language_code: td.language_code,
      include_backlinks: true,
      include_competitors: true,
      include_top_keywords: true,
      top_keywords_limit: 20,
      competitors_limit: 10,
      attribution: { user_id: td.user_id, workspace_id: td.workspace_id },
    }),
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    throw new Error(`MIVAA ${resp.status}: ${text.slice(0, 200)}`);
  }
  const json = await resp.json();
  const sections = json?.data?.sections || {};

  // Extract metrics from the composite response
  const dr = sections.domain_rank_overview?.items?.[0] || {};
  const drOrganic = dr.metrics?.organic || {};
  const bs = sections.backlinks_summary?.items?.[0] || {};
  const rk = sections.ranked_keywords?.items || [];
  const cp = sections.competitors?.items || [];

  const totalCost =
    Number(sections.domain_rank_overview?.cost_usd || 0) +
    Number(sections.ranked_keywords?.cost_usd || 0) +
    Number(sections.competitors?.cost_usd || 0) +
    Number(sections.backlinks_summary?.cost_usd || 0) +
    Number(sections.backlinks_anchors?.cost_usd || 0);

  // Insert snapshot row
  const { data: snap, error: snapErr } = await sb
    .from('seo_domain_audit_history')
    .insert({
      tracked_domain_id: td.id,
      user_id: td.user_id,
      domain_rank: dr.metrics_info?.rank ?? null,
      ranking_keywords: drOrganic.count ?? null,
      organic_traffic: drOrganic.etv ?? null,
      referring_domains: bs.referring_domains ?? null,
      backlinks: bs.backlinks ?? null,
      spam_score: bs.spam_score ?? null,
      top_keywords: rk.slice(0, 20).map((it: any) => ({
        keyword: it.keyword_data?.keyword,
        rank: it.ranked_serp_element?.serp_item?.rank_absolute,
        volume: it.keyword_data?.keyword_info?.search_volume,
        traffic: it.ranked_serp_element?.serp_item?.etv,
      })),
      top_competitors: cp.slice(0, 10).map((it: any) => ({
        domain: it.domain,
        intersections: it.intersections,
      })),
      raw_sections: sections,
      cost_usd: totalCost,
      source,
    })
    .select('id')
    .single();
  if (snapErr) throw snapErr;

  // Update denormalised current_* + cadence
  const now = new Date();
  const next = new Date(now.getTime() + (td.audit_cadence_hours || 168) * 3600 * 1000);
  const { error: updErr } = await sb
    .from('seo_tracked_domains')
    .update({
      current_domain_rank: dr.metrics_info?.rank ?? null,
      current_ranking_keywords: drOrganic.count ?? null,
      current_organic_traffic: drOrganic.etv ?? null,
      current_referring_domains: bs.referring_domains ?? null,
      current_backlinks: bs.backlinks ?? null,
      last_audited_at: now.toISOString(),
      last_audit_id: snap.id,
      next_audit_at: next.toISOString(),
    })
    .eq('id', td.id);
  if (updErr) throw updErr;

  return { audit_id: snap.id };
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
