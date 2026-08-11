// asset-service-reminders-cron — the reminder half of the installed base (#343).
//
// Three things get told to somebody here:
//   • a service occurrence entered its lead-time window   -> asset.service_due
//   • a service occurrence passed its due date, still open -> asset.service_overdue
//   • a warranty is approaching its end date               -> asset.warranty_expiring
//
// Nothing in this file writes a `user_notifications` row or calls `email-api`. It emits FLOW
// EVENTS carrying the fully-resolved payload, and the seeded `system-default` flows deliver
// them — so an admin can pause, retarget or add a channel without a deploy.
//
// De-duplication is stamped on the row, per reminder: `reminded_at` / `overdue_reminded_at` on
// the occurrence, and a jsonb offset->timestamp map on the warranty. A stamp is written only
// when the emit actually succeeded; a transient failure leaves the row unstamped so the next
// tick retries rather than losing the reminder for good.

import { createClient } from '@supabase/supabase-js';
import type { DbClient } from '../_shared/supabase-client.ts';
import { withApiLogging } from '../_shared/api-logger.ts';
import { isCronAuthorized } from '../_shared/auth.ts';
import { emitFlowEvent } from '../_shared/flow-events.ts';
import { bootstrapForFunction } from '../_shared/secrets-bootstrap.ts';

const BATCH = 200;
/** Look no further ahead than this for warranties; the longest sane reminder offset. */
const WARRANTY_HORIZON_DAYS = 400;

interface DueRow {
  event_id: string;
  workspace_id: string;
  due_on: string;
  reminded_at: string | null;
  overdue_reminded_at: string | null;
  is_overdue: boolean;
  days_until_due: number;
  is_within_lead_time: boolean;
  plan_title: string;
  instructions: string | null;
  lead_days: number;
  assignee_user_id: string | null;
  notify_internal: boolean;
  notify_customer: boolean;
  asset_id: string;
  asset_name: string;
  serial_number: string | null;
  location_note: string | null;
  project_id: string | null;
  customer_company_id: string | null;
  customer_contact_id: string | null;
  customer_name: string | null;
  customer_email: string | null;
  project_name: string | null;
}

interface WarrantyRow {
  id: string;
  workspace_id: string;
  asset_id: string;
  kind: string;
  policy_number: string | null;
  ends_on: string;
  remind_days_before: number[] | null;
  reminded_at: Record<string, string> | null;
}

const today = () => new Date().toISOString().slice(0, 10);
const addDays = (iso: string, n: number) => {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

/**
 * Where the reminder sends you: the customer's CRM record, on its Equipment tab. Guarded by
 * deepLinkTargets.test.ts, which fails the build on an action_url that matches no declared
 * route — a notification whose link goes nowhere is worse than no notification.
 */
function assetActionUrl(companyId: string | null, contactId: string | null): string {
  if (companyId) return `/crm/companies/${companyId}?tab=equipment`;
  if (contactId) return `/crm/contacts/${contactId}?tab=equipment`;
  return '/crm';
}

/**
 * Who hears about this? The plan's assignee if it has one, else whoever is marked responsible
 * for the customer in CRM, else the workspace's owners/admins. An empty list would mean the
 * reminder fires into nothing, which is the exact failure this feature exists to prevent — so
 * the owner/admin fallback is unconditional.
 */
async function resolveRecipients(
  db: DbClient,
  workspaceId: string,
  assigneeUserId: string | null,
  companyId: string | null,
  contactId: string | null,
): Promise<string[]> {
  if (assigneeUserId) return [assigneeUserId];

  if (companyId || contactId) {
    const table = companyId ? 'crm_companies' : 'crm_contacts';
    const { data } = await db.from(table)
      .select('responsible_sales_user_ids')
      .eq('id', companyId || contactId)
      .maybeSingle();
    const ids = (data as { responsible_sales_user_ids?: string[] } | null)?.responsible_sales_user_ids ?? [];
    if (ids.length > 0) return [...new Set(ids)];
  }

  const { data: members } = await db.from('workspace_members')
    .select('user_id')
    .eq('workspace_id', workspaceId)
    .eq('status', 'active')
    .in('role', ['owner', 'admin']);
  return [...new Set((members ?? []).map((m: { user_id: string }) => m.user_id))];
}

Deno.serve(withApiLogging('asset-service-reminders-cron', async (req: Request) => {
  await bootstrapForFunction();
  if (!isCronAuthorized(req)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401, headers: { 'Content-Type': 'application/json' },
    });
  }

  const db = createClient(
    Deno.env.get('SUPABASE_URL') || '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '',
  ) as DbClient;

  const nowIso = new Date().toISOString();
  const day = today();
  let serviceDue = 0, serviceOverdue = 0, warrantyExpiring = 0, failed = 0;

  // ── Service occurrences ───────────────────────────────────────────────────
  const { data: dueRows, error: dueErr } = await db
    .from('customer_asset_service_due')
    .select('*')
    .eq('is_within_lead_time', true)
    .order('due_on', { ascending: true })
    .limit(BATCH);
  if (dueErr) {
    return new Response(JSON.stringify({ error: dueErr.message }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }

  for (const row of (dueRows ?? []) as DueRow[]) {
    const overdue = row.is_overdue;
    // An occurrence that went overdue without ever being reminded gets the overdue event only —
    // a "due soon" reminder for a date already in the past reads as a bug to the person getting it.
    const kind = overdue ? 'overdue' : 'due';
    if (kind === 'due' && row.reminded_at) continue;
    if (kind === 'overdue' && row.overdue_reminded_at) continue;

    try {
      const recipients = row.notify_internal
        ? await resolveRecipients(db, row.workspace_id, row.assignee_user_id, row.customer_company_id, row.customer_contact_id)
        : [];

      const where = [row.customer_name, row.project_name, row.location_note].filter(Boolean).join(' · ');
      const title = overdue
        ? `Overdue: ${row.plan_title} — ${row.asset_name}`
        : `Service due: ${row.plan_title} — ${row.asset_name}`;
      const bodyText = overdue
        ? `${row.plan_title} on ${row.asset_name} was due ${row.due_on}${where ? ` (${where})` : ''}.`
        : `${row.plan_title} on ${row.asset_name} is due ${row.due_on}${where ? ` (${where})` : ''}.`;

      // One event per recipient, each carrying the customer's details too. A flow that should
      // also mail the customer branches on `notify_customer` and sends to `customer_email`;
      // that keeps the audience an admin's decision rather than this function's.
      const base = {
        workspace_id: row.workspace_id,
        type: overdue ? 'warning' : 'info',
        title,
        body: bodyText,
        action_url: assetActionUrl(row.customer_company_id, row.customer_contact_id),
        event_id: row.event_id,
        asset_id: row.asset_id,
        asset_name: row.asset_name,
        serial_number: row.serial_number,
        plan_title: row.plan_title,
        instructions: row.instructions,
        due_on: row.due_on,
        days_until_due: row.days_until_due,
        location_note: row.location_note,
        customer_name: row.customer_name,
        customer_email: row.customer_email,
        customer_company_id: row.customer_company_id,
        customer_contact_id: row.customer_contact_id,
        project_id: row.project_id,
        project_name: row.project_name,
        notify_customer: row.notify_customer,
      };

      const eventType = overdue ? 'asset.service_overdue' : 'asset.service_due';
      let ok = true;
      if (recipients.length > 0) {
        for (const uid of recipients) {
          const res = await emitFlowEvent(eventType, { ...base, user_id: uid });
          if (res === null) ok = false;
        }
      } else if (row.notify_customer && row.customer_email) {
        // Customer-only plan: still emit, with no internal recipient.
        const res = await emitFlowEvent(eventType, { ...base, user_id: null });
        if (res === null) ok = false;
      } else {
        // Nothing to tell anyone. Stamp it so it does not spin every tick forever.
        ok = true;
      }

      if (!ok) { failed++; continue; }

      // An occurrence that went overdue before anyone was told never gets a "due soon" event, so
      // `reminded_at` would stay null forever — and ops.asset_reminders_silent_zero looks for
      // exactly that, so every such row would raise a false alarm about a cron that in fact did
      // its job. Stamp both on the overdue path, keeping the original timestamp when there is one.
      await db.from('customer_asset_service_events')
        .update(overdue
          ? { overdue_reminded_at: nowIso, reminded_at: row.reminded_at ?? nowIso }
          : { reminded_at: nowIso })
        .eq('id', row.event_id);
      if (overdue) serviceOverdue++; else serviceDue++;
    } catch (_err) {
      failed++;
    }
  }

  // ── Warranties ────────────────────────────────────────────────────────────
  const { data: warranties } = await db
    .from('customer_asset_warranties')
    .select('id, workspace_id, asset_id, kind, policy_number, ends_on, remind_days_before, reminded_at')
    .gte('ends_on', day)
    .lte('ends_on', addDays(day, WARRANTY_HORIZON_DAYS))
    .order('ends_on', { ascending: true })
    .limit(BATCH);

  for (const w of (warranties ?? []) as WarrantyRow[]) {
    const offsets = (w.remind_days_before ?? []).filter((n) => Number.isFinite(n) && n >= 0);
    const sent = w.reminded_at ?? {};
    // Largest offset first: if several windows opened at once (a warranty added late, say),
    // the customer gets one reminder at the earliest applicable notice, not a burst of four.
    const pending = offsets
      .filter((n) => sent[String(n)] === undefined && day >= addDays(w.ends_on, -n))
      .sort((a, b) => b - a);
    if (pending.length === 0) continue;

    try {
      const { data: asset } = await db.from('customer_assets')
        .select('id, name, customer_company_id, customer_contact_id, project_id, status')
        .eq('id', w.asset_id).maybeSingle();
      const a = asset as {
        name?: string; customer_company_id?: string | null; customer_contact_id?: string | null;
        project_id?: string | null; status?: string;
      } | null;
      if (!a || a.status !== 'active') continue;

      const recipients = await resolveRecipients(
        db, w.workspace_id, null, a.customer_company_id ?? null, a.customer_contact_id ?? null,
      );
      const daysLeft = Math.round(
        (new Date(w.ends_on + 'T00:00:00Z').getTime() - new Date(day + 'T00:00:00Z').getTime()) / 86_400_000,
      );

      const base = {
        workspace_id: w.workspace_id,
        type: 'warning',
        title: `Warranty expiring: ${a.name ?? 'equipment'}`,
        body: `The ${w.kind} warranty on ${a.name ?? 'this equipment'} ends ${w.ends_on} (${daysLeft} days).`,
        action_url: assetActionUrl(a.customer_company_id ?? null, a.customer_contact_id ?? null),
        warranty_id: w.id,
        asset_id: w.asset_id,
        asset_name: a.name ?? null,
        kind: w.kind,
        policy_number: w.policy_number,
        ends_on: w.ends_on,
        days_until_expiry: daysLeft,
        customer_company_id: a.customer_company_id ?? null,
        customer_contact_id: a.customer_contact_id ?? null,
        project_id: a.project_id ?? null,
      };

      let ok = true;
      for (const uid of recipients) {
        const res = await emitFlowEvent('asset.warranty_expiring', { ...base, user_id: uid });
        if (res === null) ok = false;
      }
      if (recipients.length === 0) ok = true;
      if (!ok) { failed++; continue; }

      // Stamp EVERY offset that has already opened, not just the one we sent for — otherwise
      // a 60/30/7 warranty added at day 45 would fire again tomorrow for the 30-day window.
      const stamp: Record<string, string> = { ...sent };
      for (const n of pending) stamp[String(n)] = nowIso;
      await db.from('customer_asset_warranties').update({ reminded_at: stamp }).eq('id', w.id);
      warrantyExpiring++;
    } catch (_err) {
      failed++;
    }
  }

  return new Response(
    JSON.stringify({
      success: true,
      scanned_due: (dueRows ?? []).length,
      scanned_warranties: (warranties ?? []).length,
      serviceDue, serviceOverdue, warrantyExpiring, failed,
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );
}));
