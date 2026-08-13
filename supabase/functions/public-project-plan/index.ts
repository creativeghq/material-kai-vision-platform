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
import { computeBlueprint } from '../_shared/blueprint/compute.ts';
import { getTrustedClientIp } from '../_shared/client-ip.ts';
import { verifyTurnstile as verifyTurnstileShared } from '../_shared/turnstile.ts';
import { emitFlowEventToWorkspaceRoles } from '../_shared/flow-events.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANON_DAILY_QUOTA = 2; // combined across public tools, mirrors MIVAA
const LEAD_DAILY_CAP = 3;   // kitchen estimates sent per IP per day (a write, not a lookup)


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
        .select('id, blueprint_id, parent_id, sort_order, kind, label, unit, quantity_formula, default_quantity, line_kind, material_cost, labor_rate, margin_pct, is_allowance, allowance_amount, option_group, tier, default_selected')
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

    // Compute (default inline rates only — no workspace services for anon). No visitor
    // selection on this action, so every line falls back to its blueprint default.
    const computed = computeBlueprint((items ?? []) as any[], dims, null);

    // log success (counts toward the combined daily quota)
    // This row IS the quota counter, so `.then(() => {}, () => {})` meant a rejected insert
    // silently handed the caller a free lookup — an anonymous endpoint whose rate limit stops
    // counting is a bypass, not a lost log line. Reported, never thrown: the work is already
    // done and the visitor should still get their answer (#347 audit).
    const { error: quotaErr } = await supabase.from('public_lookup_log').insert({
      scan_type: 'project_plan', ip_address: ip, outcome: 'success', query_text: bp.title, cache_hit: false,
    });
    if (quotaErr) console.error('[public-project-plan] quota row NOT recorded — this lookup was free', quotaErr);

    return json({
      success: true,
      result: {
        blueprint: { id: bp.id, title: bp.title },
        currency: bp.source_currency || 'EUR',
        subtotal: computed.subtotal,
        sections: computed.sections,
        ungrouped: computed.ungrouped,
        used: used + 1,
        limit: ANON_DAILY_QUOTA,
      },
    });
  }

  // kitchen_lead — a visitor sends their configured kitchen in for a real quote.
  //
  // The client sends CHOICES, never money: the estimate is recomputed here from the blueprint,
  // so a tampered total cannot become the recorded one. The destination workspace is resolved
  // from an explicit opt-in flag and never from the request body (invariant 1); when no
  // workspace has opted in the submission is REFUSED rather than dropped, because a lead that
  // vanishes silently is the worst possible failure for this surface.
  if (action === 'kitchen_lead') {
    const { blueprint_id, dimensions, selected_item_ids, contact, turnstile_token } = body ?? {};
    const name = String(contact?.name ?? '').trim().slice(0, 120);
    const email = String(contact?.email ?? '').trim().slice(0, 200);
    const phone = String(contact?.phone ?? '').trim().slice(0, 40);
    const shape = String(contact?.shape ?? '').trim().slice(0, 160);
    const notes = String(contact?.notes ?? '').trim().slice(0, 2000);

    if (!blueprint_id) throw new HttpError(400, 'blueprint_id required');
    if (!name || (!email && !phone)) {
      throw new HttpError(400, 'A name and either an email or a phone number are required');
    }

    const ip = clientIp(req);
    const logLead = (outcome: string) =>
      supabase.from('public_lookup_log').insert({
        scan_type: 'kitchen_lead', ip_address: ip, outcome, query_text: name,
      }).then(() => {}, () => {});

    if (!turnstile_token || !(await verifyTurnstile(supabase, String(turnstile_token), ip))) {
      await logLead('captcha_failed');
      throw new HttpError(400, 'Bot check failed. Please try again.');
    }

    // Own cap — a lead is a write, not a lookup, so it does not share the scan budget.
    const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    const { count: leadsToday } = await supabase
      .from('public_lookup_log')
      .select('id', { count: 'exact', head: true })
      .eq('scan_type', 'kitchen_lead').eq('outcome', 'success')
      .eq('ip_address', ip).gte('created_at', since);
    if ((leadsToday ?? 0) >= LEAD_DAILY_CAP) {
      await logLead('rate_limited');
      return json({ success: false, error: 'rate_limited', limit: LEAD_DAILY_CAP }, 429);
    }

    const { data: bp, error: bpErr } = await supabase
      .from('blueprints')
      .select('id, title, source_currency, dimensions_schema, is_platform_starter')
      .eq('id', blueprint_id).maybeSingle();
    if (bpErr) throw new HttpError(400, bpErr.message);
    if (!bp || !bp.is_platform_starter) throw new HttpError(404, 'Starter blueprint not found');

    const { data: items, error: itErr } = await supabase
      .from('blueprint_items').select('*').eq('blueprint_id', blueprint_id).order('sort_order');
    if (itErr) throw new HttpError(400, itErr.message);

    const schema = (bp.dimensions_schema ?? []) as { key: string; label?: string; unit?: string; default?: number }[];
    const dims: Record<string, number> = {};
    for (const d of schema) dims[d.key] = Number(d.default ?? 0);
    for (const [k, v] of Object.entries(dimensions ?? {})) {
      const n = Number(v);
      if (Number.isFinite(n) && n >= 0 && k in dims) dims[k] = n;
    }

    const chosen = Array.isArray(selected_item_ids) ? new Set(selected_item_ids.map(String)) : null;
    const computed = computeBlueprint((items ?? []) as any[], dims, chosen);
    const currency = bp.source_currency || 'EUR';

    // Destination: the OPERATOR workspace, always.
    //
    // /tools/kitchen-cost is a platform surface with no tenant in the request — an anonymous
    // visitor on the public site belongs to nobody — so the lead goes to the operator, which is
    // `workspaces.is_root` (the same row `is_platform_operator()` keys on). There is deliberately
    // no configuration knob and nothing is read from the body: a body-supplied destination would
    // let anyone post enquiries into another tenant's inbox (invariant 1).
    //
    // When this calculator is later embedded FOR a specific dealer, that tenant must come from
    // the signed embed key that identifies them, never from a request field.
    const { data: roots } = await supabase
      .from('workspaces')
      .select('id, name')
      .eq('is_root', true)
      .limit(2);
    // Exactly one, or refuse: picking "the first" root would silently deliver a customer's
    // enquiry to whichever tenant happened to sort first.
    const workspace = (roots ?? []).length === 1
      ? (roots as { id: string; name: string }[])[0]
      : undefined;
    if (!workspace) {
      await logLead('failed');
      return json({ success: false, error: 'leads_unavailable' }, 503);
    }

    // Find-or-create the CRM contact. Separate .eq() lookups rather than one .or() — a raw
    // PostgREST filter string built from visitor input is an injection surface.
    let contactId: string | null = null;
    if (email) {
      const { data } = await supabase.from('crm_contacts')
        .select('id').eq('workspace_id', workspace.id).ilike('email', email).limit(1);
      contactId = (data ?? [])[0]?.id ?? null;
    }
    if (!contactId && phone) {
      const { data } = await supabase.from('crm_contacts')
        .select('id').eq('workspace_id', workspace.id).eq('phone', phone).limit(1);
      contactId = (data ?? [])[0]?.id ?? null;
    }
    if (!contactId) {
      // Explicit allowlisted payload — never a spread of the request body (invariant 8).
      const { data: created, error: cErr } = await supabase.from('crm_contacts').insert({
        workspace_id: workspace.id,
        name,
        email: email || null,
        phone: phone || null,
        contact_type: 'private',
        is_client: true,
        lead_source: 'kitchen_calculator',
        lead_status: 'new',
      }).select('id').single();
      if (cErr) throw new HttpError(400, `Could not record the enquiry: ${cErr.message}`);
      contactId = created.id as string;
    }

    const reference = `KC-${crypto.randomUUID().replace(/-/g, '').slice(0, 6).toUpperCase()}`;

    const dimLine = schema
      .map((d) => `  ${d.label ?? d.key}: ${dims[d.key]}${d.unit ? ` ${d.unit}` : ''}`)
      .join('\n');
    const breakdown = computed.sections
      .filter((s) => s.tasks.some((t) => t.selected && t.line_total > 0))
      .map((s) => {
        const lines = s.tasks
          .filter((t) => t.selected && t.line_total > 0)
          .map((t) => `  ${t.label} — ${t.line_total.toFixed(2)} ${currency}`)
          .join('\n');
        return `${s.label}\n${lines}`;
      })
      .join('\n\n');
    const messageBody = [
      `New kitchen estimate from the website (${reference}).`,
      '',
      'Measurements',
      dimLine,
      '',
      breakdown,
      '',
      `Estimated total: ${computed.subtotal.toFixed(2)} ${currency} (excl. VAT)`,
      '',
      'Contact',
      `  Name: ${name}`,
      email ? `  Email: ${email}` : null,
      phone ? `  Phone: ${phone}` : null,
      shape ? `  Kitchen shape: ${shape}` : null,
      notes ? `\nNotes\n  ${notes}` : null,
    ].filter((l) => l !== null).join('\n');

    const { data: thread, error: tErr } = await supabase.from('inbox_threads').insert({
      workspace_id: workspace.id,
      thread_type: 'customer',
      channel: 'email',
      subject: `Kitchen estimate ${reference} — ${name}`,
      status: 'open',
      last_message_at: new Date().toISOString(),
      last_message_preview: `Kitchen estimate ${computed.subtotal.toFixed(2)} ${currency}`,
      // Mirrors metadata.order_intake (#342): a PROPOSAL, not a quote. Nothing exists in
      // `quotes` until a member approves it.
      metadata: {
        kitchen_estimate: {
          reference,
          blueprint_id: bp.id,
          blueprint_title: bp.title,
          currency,
          dimensions: dims,
          subtotal: computed.subtotal,
          selected_item_ids: computed.sections
            .flatMap((s) => s.tasks).filter((t) => t.selected).map((t) => t.id),
          lines: computed.sections.map((s) => ({
            section: s.label,
            total: s.total,
            tasks: s.tasks.filter((t) => t.selected).map((t) => ({
              label: t.label, unit: t.unit, quantity: t.quantity,
              unit_price: t.unit_price, line_total: t.line_total,
            })),
          })),
          contact: { name, email: email || null, phone: phone || null, shape: shape || null, notes: notes || null },
          source: 'kitchen_calculator',
          created_at: new Date().toISOString(),
        },
      },
    }).select('id').single();
    if (tErr) throw new HttpError(400, `Could not record the enquiry: ${tErr.message}`);

    const { data: participant, error: pErr } = await supabase.from('inbox_participants').insert({
      thread_id: thread.id,
      participant_type: 'customer',
      contact_id: contactId,
      workspace_id: workspace.id,
      thread_role: 'participant',
      status: 'active',
    }).select('id').single();
    if (pErr) throw new HttpError(400, `Could not record the enquiry: ${pErr.message}`);

    const { error: mErr } = await supabase.from('inbox_messages').insert({
      thread_id: thread.id,
      sender_participant_id: participant.id,
      body: messageBody,
      message_type: 'text',
      metadata: { direction: 'incoming', source: 'kitchen_calculator', reference },
    });
    if (mErr) throw new HttpError(400, `Could not record the enquiry: ${mErr.message}`);

    // Notify the people who answer enquiries, through Flows rather than a hardcoded insert.
    await emitFlowEventToWorkspaceRoles(
      workspace.id,
      ['owner', 'admin', 'sales', 'sales_manager'],
      'inbox.message_received',
      (recipientUserId) => ({
        user_id: recipientUserId,
        workspace_id: workspace.id,
        title: `New kitchen estimate — ${name}`,
        body: `${computed.subtotal.toFixed(2)} ${currency} · ${reference}`,
        action_url: `/inbox?thread=${thread.id}`,
        type: 'inbox',
      }),
    ).catch(() => {});

    await logLead('success');
    return json({ success: true, reference, subtotal: computed.subtotal, currency });
  }

  throw new HttpError(400, `Unknown action: ${action}`);
});

Deno.serve(handler);
