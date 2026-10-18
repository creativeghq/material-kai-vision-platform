/** seo-toolkit-audit — composite domain audit for /admin/seo dashboard. */

import { createClient } from '@supabase/supabase-js';
import { authenticate, userHasWorkspaceCapability } from '../../_shared/auth.ts';
import { secretMatches } from '../../_shared/timing-safe.ts';
import { bootstrapForFunction } from '../../_shared/secrets-bootstrap.ts';
import { assertEntitled } from '../../_shared/entitlement.ts';
import { chargeCronWorkspace, chargeCronUser, refundCronWorkspace, refundCronUser } from '../../_shared/cron-billing.ts';
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
    const isCron = secretMatches(req.headers.get('x-cron-secret'), CRON_SECRET());

    const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // ── Branch A: cron-mode batch ──
    if (isCron) {
      // A website's own domain is collected by seo-domain-tracker on the owner's schedule; this
      // cron keeps only the ad-hoc domains the agent was asked to watch.
      const { data: due, error } = await sb
        .from('seo_tracked_domains')
        .select('*')
        .eq('is_active', true)
        .is('website_id', null)
        .or(`next_audit_at.is.null,next_audit_at.lte.${new Date().toISOString()}`)
        .limit(20);
      if (error) throw error;
      const results: any[] = [];
      let skippedUnpaid = 0;
      for (const td of due || []) {
        // The row policy binds user_id only, so workspace_id is whatever the owner wrote.
        if (td.workspace_id && !(await userHasWorkspaceCapability(sb, td.user_id, td.workspace_id, 'marketing.seo'))) {
          await sb.from('seo_tracked_domains').update({
            next_audit_at: new Date(Date.now() + (td.audit_cadence_hours || 168) * 3600 * 1000).toISOString(),
          }).eq('id', td.id);
          results.push({ id: td.id, ok: false, skipped: 'owner_not_in_workspace' });
          continue;
        }
        // Meter the owner BEFORE the paid audit. `runAuditFor` calls MIVAA's composite
        // site-review — domain rank, ranked keywords, competitors, backlinks, anchors — which
        // is DataForSEO spend on the operator's account. Registered cron_key
        // 'seo-toolkit-audit' (3 cr) existed and nothing called it, so this hourly cron ran
        // free: an admin could see a price on the dashboard that governed nothing.
        // Fails open on a metering error; false only when the payer is out of credits.
        const gate = td.workspace_id
          ? await chargeCronWorkspace(sb, td.workspace_id, 'seo-toolkit-audit', {
              description: `SEO audit: ${td.domain}`,
            })
          : await chargeCronUser(sb, td.user_id, 'seo-toolkit-audit', {
              description: `SEO audit: ${td.domain}`,
            });
        if (!gate.allowed) {
          skippedUnpaid++;
          results.push({ id: td.id, ok: false, skipped: 'insufficient_credits' });
          continue;
        }
        try {
          const r = await runAuditFor(sb, td, 'cron');
          results.push({ id: td.id, ok: true, audit_id: r.audit_id, failed_sections: r.failed_sections });
        } catch (e) {
          if (gate.charged > 0) {
            await (td.workspace_id
              ? refundCronWorkspace(sb, td.workspace_id, 'seo-toolkit-audit', gate.charged, 'Audit failed')
              : refundCronUser(sb, td.user_id, 'seo-toolkit-audit', gate.charged, 'Audit failed'));
          }
          results.push({ id: td.id, ok: false, error: e instanceof Error ? e.message : String(e) });
        }
      }
      return jsonResponse({
        ok: true, processed: due?.length || 0, skipped_insufficient_credits: skippedUnpaid, results,
      });
    }

    // ── Branch B: user-driven (a user JWT or a kai_ key) ──
    const auth = await authenticate(req, { requireUser: true });
    if (!auth.success || !auth.userId) return jsonResponse({ ok: false, error: auth.error || 'unauthorized' }, 401);
    const userId = auth.userId;

    const trackedId = body.tracked_domain_id;
    if (!trackedId) return jsonResponse({ ok: false, error: 'tracked_domain_id required' }, 400);
    const source = body.source || 'manual';

    const { data: td, error } = await sb
      .from('seo_tracked_domains')
      .select('*')
      .eq('id', trackedId)
      .maybeSingle();
    if (error) return jsonResponse({ ok: false, error: error.message }, 500);
    if (!td) return jsonResponse({ ok: false, error: 'tracked_domain not found' }, 404);
    if ((td as any).user_id !== userId) {
      return jsonResponse({ ok: false, error: 'tracked_domain not found' }, 404);
    }
    if ((td as any).workspace_id
      && !(await userHasWorkspaceCapability(sb, userId, (td as any).workspace_id, 'marketing.seo'))) {
      return jsonResponse({ ok: false, error: 'tracked_domain not found' }, 404);
    }

    // Paid module — refuse before firing the MIVAA composite audit (#212). Cron batch
    // (Branch A) is operator-driven and stays ungated.
    if ((td as any).workspace_id) {
      const ent = await assertEntitled(sb, (td as any).workspace_id, SEO_MODULE);
      if (!ent.ok) return ent.response;
    }

    // …and meter it, exactly as the cron branch does. Entitlement answers "may this workspace use
    // the module", not "has it paid for this run": an entitled workspace could press "Audit now"
    // in a loop and spend the operator's DataForSEO balance for free, while the identical work on
    // the hourly tick was charged 3 credits. Same unit of work, same cron key, same price.
    // (#365 AD-13)
    const gate = (td as any).workspace_id
      ? await chargeCronWorkspace(sb, (td as any).workspace_id, 'seo-toolkit-audit', {
          description: `SEO audit: ${(td as any).domain}`,
        })
      : await chargeCronUser(sb, userId, 'seo-toolkit-audit', {
          description: `SEO audit: ${(td as any).domain}`,
        });
    if (!gate.allowed) {
      return jsonResponse({ ok: false, error: 'Not enough credits to run this audit.' }, 402);
    }

    let result: AuditResult;
    try {
      result = await runAuditFor(sb, td, source);
    } catch (e) {
      // Charged before the upstream (invariant 10), so a failed audit has to give it back or a
      // provider outage becomes a standing charge for nothing.
      if (gate.charged > 0) {
        await ((td as any).workspace_id
          ? refundCronWorkspace(sb, (td as any).workspace_id, 'seo-toolkit-audit', gate.charged, 'Audit failed')
          : refundCronUser(sb, userId, 'seo-toolkit-audit', gate.charged, 'Audit failed'));
      }
      throw e;
    }
    return jsonResponse({ ok: true, audit_id: result.audit_id, failed_sections: result.failed_sections });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[seo-toolkit-audit] error:', msg);
    return jsonResponse({ ok: false, error: msg }, 500);
  }
}

// ─────────────────────────────────────────────────────────────────
// Audit pipeline
// ─────────────────────────────────────────────────────────────────

type AuditResult = { audit_id: string; failed_sections: Record<string, string> };

/** The sections each stored figure comes from; a figure whose section failed is never written. */
const METRIC_SECTIONS = ['domain_rank_overview', 'ranked_keywords', 'backlinks_summary'] as const;

/** Throws when no metric section answered, so the caller refunds and the domain stays due. */
async function runAuditFor(sb: any, td: any, source: string): Promise<AuditResult> {
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
  if (json?.success !== true) throw new Error(`MIVAA site-review refused: ${String(json?.error || json?.data?.error || 'no reason given').slice(0, 200)}`);
  const sections = json?.data?.sections || {};
  const failed: Record<string, string> = {};
  for (const [k, v] of Object.entries(json?.data?.errors || {})) failed[k] = String(v).slice(0, 300);
  const answered = (k: string) => !!sections[k] && !(k in failed);
  if (!METRIC_SECTIONS.some(answered)) {
    const why = Object.entries(failed).map(([k, v]) => `${k}: ${v}`).join(' · ');
    throw new Error(`Audit not recorded — no metric section answered${why ? ` (${why})` : ''}`);
  }
  const dfsOk = answered('domain_rank_overview');
  const blOk = answered('backlinks_summary');

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
      raw_sections: Object.keys(failed).length ? { ...sections, _errors: failed } : sections,
      cost_usd: totalCost,
      source,
    })
    .select('id')
    .single();
  if (snapErr) throw snapErr;

  // A failed section leaves the previous current_* values standing rather than nulling them.
  const now = new Date();
  const next = new Date(now.getTime() + (td.audit_cadence_hours || 168) * 3600 * 1000);
  const { error: updErr } = await sb
    .from('seo_tracked_domains')
    .update({
      ...(dfsOk ? {
        current_domain_rank: dr.metrics_info?.rank ?? null,
        current_ranking_keywords: drOrganic.count ?? null,
        current_organic_traffic: drOrganic.etv ?? null,
      } : {}),
      ...(blOk ? {
        current_referring_domains: bs.referring_domains ?? null,
        current_backlinks: bs.backlinks ?? null,
      } : {}),
      last_audited_at: now.toISOString(),
      last_audit_id: snap.id,
      next_audit_at: next.toISOString(),
    })
    .eq('id', td.id);
  if (updErr) throw updErr;

  return { audit_id: snap.id, failed_sections: failed };
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
