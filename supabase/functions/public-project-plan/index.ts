// public-project-plan — anonymous Blueprint surface for /tools/project-plan and /tools/kitchen-cost.
// `starters` returns the platform starters with cost folded into a sell price; `kitchen_lead`
// files a visitor's configured kitchen as a CRM lead + Inbox thread in the operator workspace.

import type { DbClient } from '../_shared/supabase-client.ts';
import { jsonResponse as json } from '../_shared/http.ts';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { withApiLogging, HttpError } from '../_shared/api-logger.ts';
import { corsHeaders } from '../_shared/cors.ts';
import { bootstrapForFunction } from '../_shared/secrets-bootstrap.ts';
import { computeBlueprint } from '../_shared/blueprint/compute.ts';
// The anonymous payload shape is SHARED with products-3d-api's blueprint action (#382 Phase 1) —
// same column list, same cost-basis fold. Both used to live in this file; a second public surface
// is what made a private copy untenable.
import { ANON_BLUEPRINT_ITEM_COLUMNS, foldItemPricingForAnon } from '../_shared/blueprint/anon-pricing.ts';
import { SERVICE_YIELD_KEYS } from '../_shared/blueprint/composition.ts';
import type { Composition, ZoneDef } from '../_shared/blueprint/composition.ts';
import { getTrustedClientIp } from '../_shared/client-ip.ts';
import { verifyTurnstile as verifyTurnstileShared } from '../_shared/turnstile.ts';
import { emitFlowEventToWorkspaceRoles } from '../_shared/flow-events.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const LEAD_DAILY_CAP = 3;   // kitchen estimates sent per IP per day (a write, not a lookup)


// Trusted proxy hop (invariant #10) — never the client-spoofable leftmost x-forwarded-for entry.
function clientIp(req: Request): string {
  const ip = getTrustedClientIp(req);
  return ip === 'unknown' ? '0.0.0.0' : ip;
}

/** Uses the shared Turnstile helper so there is one verify in the codebase rather than four. */
async function verifyTurnstile(supabase: DbClient, token: string, ip: string): Promise<boolean> {
  const { ok } = await verifyTurnstileShared(supabase, token, ip);
  return ok;
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
      .select('id, title, description, project_type, dimensions_schema, composition_schema, source_currency')
      .eq('is_platform_starter', true).eq('status', 'active').order('title');
    if (error) throw new HttpError(400, error.message);
    const ids = (bps ?? []).map((b: any) => b.id);
    const itemsByBp: Record<string, any[]> = {};
    if (ids.length) {
      const { data: items, error: itemsErr } = await supabase
        .from('blueprint_items')
        .select(ANON_BLUEPRINT_ITEM_COLUMNS)
        .in('blueprint_id', ids)
        .order('sort_order', { ascending: true });
      if (itemsErr) throw new HttpError(500, `Could not load the starter items: ${itemsErr.message}`);
      for (const it of (items ?? []) as any[]) (itemsByBp[it.blueprint_id] ||= []).push(it);
    }
    const starters = (bps ?? []).map((b: any) => ({
      ...b,
      items: (itemsByBp[b.id] ?? []).map(foldItemPricingForAnon),
    }));
    return json({ starters });
  }

  // kitchen_lead — a visitor sends their configured kitchen in for a real quote.
  //
  // The client sends CHOICES, never money: the estimate is recomputed here from the blueprint,
  // so a tampered total cannot become the recorded one. The destination workspace is resolved
  // from an explicit opt-in flag and never from the request body (invariant 1); when no
  // workspace has opted in the submission is REFUSED rather than dropped, because a lead that
  // vanishes silently is the worst possible failure for this surface.
  if (action === 'kitchen_lead') {
    const { blueprint_id, dimensions, composition, selected_item_ids, contact, turnstile_token, client_token } = body ?? {};
    const name = String(contact?.name ?? '').trim().slice(0, 120);
    const email = String(contact?.email ?? '').trim().slice(0, 200).toLowerCase();
    const phone = String(contact?.phone ?? '').trim().slice(0, 40);
    const shape = String(contact?.shape ?? '').trim().slice(0, 160);
    const notes = String(contact?.notes ?? '').trim().slice(0, 2000);

    if (!blueprint_id) throw new HttpError(400, 'blueprint_id required');
    if (!name || (!email && !phone)) {
      throw new HttpError(400, 'A name and either an email or a phone number are required');
    }
    if (email && !/^[^\s@,;:<>()[\]"'*%\\]+@[^\s@,;:<>()[\]"'*%\\]+\.[a-z]{2,}$/.test(email)) {
      throw new HttpError(400, 'That email address does not look valid');
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
    // Fail closed: an unanswerable count is not a zero.
    const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    const { count: leadsToday, error: leadCountErr } = await supabase
      .from('public_lookup_log')
      .select('id', { count: 'exact', head: true })
      .eq('scan_type', 'kitchen_lead').eq('outcome', 'success')
      .eq('ip_address', ip).gte('created_at', since);
    if (leadCountErr) {
      console.error('[public-project-plan] lead cap count failed — refusing (fail closed):', leadCountErr.message);
      return json({ success: false, error: 'rate_limited', limit: LEAD_DAILY_CAP }, 429);
    }
    if ((leadsToday ?? 0) >= LEAD_DAILY_CAP) {
      await logLead('rate_limited');
      return json({ success: false, error: 'rate_limited', limit: LEAD_DAILY_CAP }, 429);
    }

    const { data: bp, error: bpErr } = await supabase
      .from('blueprints')
      .select('id, title, source_currency, dimensions_schema, composition_schema, is_platform_starter')
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
    const computed = computeBlueprint((items ?? []) as any[], dims, chosen, {
      schema: (bp.composition_schema ?? []) as ZoneDef[],
      config: (composition ?? null) as Composition | null,
    });
    const derivedLineKeys = new Set((computed.composition?.lines ?? []).map((l) => l.key));
    const currency = bp.source_currency || 'EUR';

    // Destination: the OPERATOR workspace, always.
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
    // Appliances have to be listed SEPARATELY from the priced breakdown, because the ones that
    // matter most to the callback are the ones the breakdown cannot show: an appliance the customer
    // already owns has a line total of zero and would be filtered straight out of it, taking with it
    // the fact that a 60cm aperture, a socket and a waste have to be planned around a machine we are
    // not selling. Same for the connections and the issues — none of them are money.
    const appliances = computed.composition?.appliances ?? [];
    const applianceLines = appliances.length
      ? ['Appliances', ...appliances.map((a) => {
        const who = a.supply === 'existing' ? 'customer already owns' : `we supply${a.model_label ? `, ${a.model_label}` : ''}`;
        const where = a.placement_label ? `, ${a.placement_label.toLowerCase()}` : '';
        return `  ${a.label} × ${a.qty} — ${who}${where}`;
      }), '']
      : [];
    const services = (computed.composition?.schedule ?? []).filter((r) => SERVICE_YIELD_KEYS.has(r.key));
    const serviceLines = services.length
      ? ['Connections to plan for', ...services.map((r) => `  ${r.label}: ${r.quantity} ${r.unit}`), '']
      : [];
    const issueLines = (computed.composition?.issues ?? []).length
      ? ['Worth checking before you call back', ...computed.composition!.issues.map((i) => `  ${i}`), '']
      : [];

    const messageBody = [
      `New kitchen estimate from the website (${reference}).`,
      '',
      'Measurements',
      dimLine,
      '',
      breakdown,
      '',
      ...applianceLines,
      ...serviceLines,
      ...issueLines,
      `Estimated total: ${computed.subtotal.toFixed(2)} ${currency} (excl. VAT)`,
      '',
      'Contact',
      `  Name: ${name}`,
      email ? `  Email: ${email}` : null,
      phone ? `  Phone: ${phone}` : null,
      shape ? `  Kitchen shape: ${shape}` : null,
      notes ? `\nNotes\n  ${notes}` : null,
    ].filter((l) => l !== null).join('\n');

    // A per-submission token from the page makes a retry after a dropped connection replay the
    // first lead instead of filing a second one. An old bundle without one still gets a lead.
    const token = typeof client_token === 'string' && /^[A-Za-z0-9-]{16,64}$/.test(client_token)
      ? client_token
      : crypto.randomUUID();
    const estimate = {
      reference,
      blueprint_id: bp.id,
      blueprint_title: bp.title,
      currency,
      dimensions: dims,
      // The zone configuration IS the spec for everything a zone generates. The engine replays
      // it against the blueprint's own rates on approval (create-plan-from-kitchen-estimate).
      composition: (composition ?? null) as Composition | null,
      subtotal: computed.subtotal,
      // Composition lines carry synthetic keys, not blueprint_item ids — replaying them by id
      // would match nothing and read as "the visitor deselected everything".
      selected_item_ids: computed.sections
        .flatMap((s) => s.tasks)
        .filter((t) => t.selected && !derivedLineKeys.has(t.id))
        .map((t) => t.id),
      lines: computed.sections.map((s) => ({
        section: s.label,
        total: s.total,
        tasks: s.tasks.filter((t) => t.selected).map((t) => ({
          label: t.label, unit: t.unit, quantity: t.quantity,
          unit_price: t.unit_price, line_total: t.line_total,
        })),
      })),
      // Snapshotted beside `lines` for the same reason: the approval UI reads the estimate as
      // it was sent. The `composition` above stays the spec that gets replayed.
      appliances,
      schedule: computed.composition?.schedule ?? [],
      issues: computed.composition?.issues ?? [],
      contact: { name, email: email || null, phone: phone || null, shape: shape || null, notes: notes || null },
      source: 'kitchen_calculator',
      created_at: new Date().toISOString(),
    };

    // Lead, thread, participant and message are ONE transaction. No CRM contact is matched or
    // created: a visitor's typed email is not proof of identity, so the lead is converted by a
    // member through the normal duplicate search.
    const { data: filed, error: fileErr } = await supabase.rpc('submit_public_kitchen_lead', {
      p_workspace_id: workspace.id,
      p_client_token: token,
      p_reference: reference,
      p_name: name,
      p_email: email,
      p_phone: phone,
      p_request: [shape ? `Kitchen shape: ${shape}` : null, notes || null].filter(Boolean).join(' · ') || null,
      p_estimated_value: computed.subtotal,
      p_currency: currency,
      p_subject: `Kitchen estimate ${reference} — ${name}`,
      p_preview: `Kitchen estimate ${computed.subtotal.toFixed(2)} ${currency}`,
      p_estimate: estimate,
      p_message_body: messageBody,
    });
    if (fileErr || !filed) {
      await logLead('failed');
      throw new HttpError(500, `Could not record the enquiry: ${fileErr?.message ?? 'no result'}`);
    }
    const result = filed as { lead_id: string; thread_id?: string; reference: string; replayed: boolean };
    if (result.replayed) {
      return json({ success: true, reference: result.reference, subtotal: computed.subtotal, currency });
    }
    const threadId = result.thread_id!;

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
        action_url: `/inbox?thread=${threadId}`,
        type: 'inbox',
      }),
    ).catch(() => {});

    await logLead('success');
    return json({ success: true, reference, subtotal: computed.subtotal, currency });
  }

  throw new HttpError(400, `Unknown action: ${action}`);
});

Deno.serve(handler);
