// public-project-plan — anonymous lead-gen estimator for /tools/project-plan.
// In-repo public path for the Blueprint engine. The compute is PURE (no paid
// upstream APIs) so it lives here, not in MIVAA. Turnstile-gated + metered against
// the same `public_lookup_log` table the other public tools use (combined 2/day per
// IP). Reads platform-starter blueprints via the service role and computes a
// read-only estimate from the visitor's dimensions using default inline rates — no
// save, no workspace data. Actions:
//   starters  {}                                        -> { starters: [...] }
//   estimate  {blueprint_id, dimensions, turnstile_token} -> { result }
// Frontend re-reads the shared MIVAA quota after a successful estimate; this fn
// enforces the IP limit itself and logs a success row so the counts stay consistent.

import type { DbClient } from '../_shared/supabase-client.ts';
import { jsonResponse as json } from '../_shared/http.ts';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { withApiLogging, HttpError } from '../_shared/api-logger.ts';
import { corsHeaders } from '../_shared/cors.ts';
import { bootstrapForFunction } from '../_shared/secrets-bootstrap.ts';
import { evaluateFormula, computeLinePricing, round2 } from '../_shared/blueprint/formula.ts';
import { getTrustedClientIp } from '../_shared/client-ip.ts';
import { verifyTurnstile as verifyTurnstileShared } from '../_shared/turnstile.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANON_DAILY_QUOTA = 2; // combined across public tools, mirrors MIVAA


// Trusted proxy hop (invariant #10) — never the client-spoofable leftmost x-forwarded-for entry.
function clientIp(req: Request): string {
  const ip = getTrustedClientIp(req);
  return ip === 'unknown' ? '0.0.0.0' : ip;
}

/**
 * Uses the shared Turnstile helper so there is one verify in the codebase rather than four.
 *
 * This gate WORKS and always has — `TURNSTILE_SECRET_KEY` is set as a Supabase edge secret, so the
 * previous `Deno.env.get` read it fine. Verified against production before changing it: the live
 * endpoint answers "Bot check failed" (Cloudflare rejected the token) and not "Bot check is not
 * configured" (secret missing). I had assumed the opposite and was wrong.
 *
 * What the shared helper adds is a SECOND configuration route: `resolveSecret` falls back to
 * `platform_secrets`, so a key saved from the admin UI also works. `bootstrapForFunction()` cannot
 * provide that on its own — it copies platform_secrets into env with `Deno.env.set`, which this
 * runtime denies while the bootstrap swallows the throw. So an env-only read is correct today and
 * silently breaks the day someone configures the key from the admin screen instead of the CLI.
 * (#257 C28)
 */
async function verifyTurnstile(supabase: DbClient, token: string, ip: string): Promise<boolean> {
  const { ok } = await verifyTurnstileShared(supabase, token, ip);
  return ok;
}

async function quotaUsed(supabase: DbClient, ip: string): Promise<number> {
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const { count } = await supabase
    .from('public_lookup_log')
    .select('id', { count: 'exact', head: true })
    .eq('outcome', 'success')
    .eq('ip_address', ip)
    .gte('created_at', since);
  return count ?? 0;
}

const handler = withApiLogging('public-project-plan', async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') throw new HttpError(405, 'POST only');

  await bootstrapForFunction(); // pull TURNSTILE_SECRET_KEY etc. from platform_secrets if env unset
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const body = await req.json().catch(() => ({}));
  const action = body?.action as string;

  if (action === 'starters') {
    // Return each starter WITH its full works list so the public page can render +
    // price the scope of works entirely client-side (pure math, no metering needed).
    const { data: bps, error } = await supabase
      .from('blueprints')
      .select('id, title, description, project_type, dimensions_schema, source_currency')
      .eq('is_platform_starter', true).eq('status', 'active').order('title');
    if (error) throw new HttpError(400, error.message);
    const ids = (bps ?? []).map((b: any) => b.id);
    const itemsByBp: Record<string, any[]> = {};
    if (ids.length) {
      const { data: items } = await supabase
        .from('blueprint_items')
        .select('id, blueprint_id, parent_id, sort_order, kind, label, unit, quantity_formula, default_quantity, line_kind, material_cost, labor_rate, margin_pct, is_allowance, allowance_amount, option_group, tier')
        .in('blueprint_id', ids)
        .order('sort_order', { ascending: true });
      for (const it of (items ?? []) as any[]) (itemsByBp[it.blueprint_id] ||= []).push(it);
    }
    const starters = (bps ?? []).map((b: any) => ({ ...b, items: itemsByBp[b.id] ?? [] }));
    return json({ starters });
  }

  if (action === 'estimate') {
    const { blueprint_id, dimensions, turnstile_token } = body;
    if (!blueprint_id) throw new HttpError(400, 'blueprint_id required');
    const ip = clientIp(req);

    // Bot check
    if (!turnstile_token || !(await verifyTurnstile(supabase, String(turnstile_token), ip))) {
      await supabase.from('public_lookup_log').insert({ scan_type: 'project_plan', ip_address: ip, outcome: 'captcha_failed', query_text: blueprint_id }).then(() => {}, () => {});
      throw new HttpError(400, 'Bot check failed. Please try again.');
    }

    // Quota (combined across public tools, per IP)
    const used = await quotaUsed(supabase, ip);
    if (used >= ANON_DAILY_QUOTA) {
      await supabase.from('public_lookup_log').insert({ scan_type: 'project_plan', ip_address: ip, outcome: 'rate_limited', query_text: blueprint_id }).then(() => {}, () => {});
      return json({ success: false, error: 'quota_exceeded', used, limit: ANON_DAILY_QUOTA }, 429);
    }

    // Load the starter blueprint + items
    const { data: bp, error: bpErr } = await supabase
      .from('blueprints')
      .select('id, title, source_currency, dimensions_schema, is_platform_starter')
      .eq('id', blueprint_id).maybeSingle();
    if (bpErr) throw new HttpError(400, bpErr.message);
    if (!bp || !bp.is_platform_starter) throw new HttpError(404, 'Starter blueprint not found');

    const { data: items, error: itErr } = await supabase
      .from('blueprint_items').select('*').eq('blueprint_id', blueprint_id).order('sort_order');
    if (itErr) throw new HttpError(400, itErr.message);

    const dims: Record<string, number> = {};
    for (const d of (bp.dimensions_schema ?? []) as { key: string; default?: number }[]) dims[d.key] = Number(d.default ?? 0);
    for (const [k, v] of Object.entries(dimensions ?? {})) { const n = Number(v); if (!Number.isNaN(n)) dims[k] = n; }

    // Compute (default inline rates only — no workspace services for anon)
    const rows = (items ?? []) as any[];
    const sectionsById: Record<string, { label: string; total: number; tasks: any[] }> = {};
    for (const r of rows) if (r.kind === 'section') sectionsById[r.id] = { label: r.label, total: 0, tasks: [] };
    const ungrouped: any[] = [];
    let subtotal = 0;
    // default option selection: one per option_group
    const optSelected: Record<string, string> = {};
    for (const r of rows) {
      if (r.kind !== 'task' || !r.option_group) continue;
      if (!optSelected[r.option_group] || r.tier === 'good') optSelected[r.option_group] = r.id;
    }
    for (const r of rows) {
      if (r.kind !== 'task') continue;
      const selected = r.option_group ? optSelected[r.option_group] === r.id : true;
      let qty = 1;
      if (r.quantity_formula && String(r.quantity_formula).trim()) {
        const ev = evaluateFormula(r.quantity_formula, dims);
        qty = ev.ok ? ev.value : Number(r.default_quantity ?? 1);
      } else qty = Number(r.default_quantity ?? 1);
      qty = round2(qty);
      const { unit_price, line_total } = computeLinePricing({
        is_allowance: r.is_allowance, allowance_amount: r.allowance_amount,
        material_cost: r.material_cost, labor_rate: r.labor_rate, margin_pct: r.margin_pct,
        quantity: qty, is_selected: selected,
      });
      const task = { label: r.label, unit: r.unit, quantity: qty, unit_price, line_total, is_allowance: !!r.is_allowance, option_group: r.option_group ?? null, selected };
      if (selected) subtotal += line_total;
      const sec = r.parent_id ? sectionsById[r.parent_id] : null;
      if (sec) { sec.tasks.push(task); if (selected) sec.total += line_total; }
      else ungrouped.push(task);
    }
    subtotal = round2(subtotal);

    // log success (counts toward the combined daily quota)
    await supabase.from('public_lookup_log').insert({
      scan_type: 'project_plan', ip_address: ip, outcome: 'success', query_text: bp.title, cache_hit: false,
    }).then(() => {}, () => {});

    return json({
      success: true,
      result: {
        blueprint: { id: bp.id, title: bp.title },
        currency: bp.source_currency || 'EUR',
        subtotal,
        sections: Object.values(sectionsById).map((s) => ({ ...s, total: round2(s.total) })),
        ungrouped,
        used: used + 1,
        limit: ANON_DAILY_QUOTA,
      },
    });
  }

  throw new HttpError(400, `Unknown action: ${action}`);
});

Deno.serve(handler);
