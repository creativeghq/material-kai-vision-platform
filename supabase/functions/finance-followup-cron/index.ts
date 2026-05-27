// deno-lint-ignore-file no-explicit-any
import { createClient } from '@supabase/supabase-js';
import { corsHeaders } from '../_shared/cors.ts';
import { bootstrapForFunction } from '../_shared/secrets-bootstrap.ts';

// Sales/Finance — daily follow-up reminder cron.
// Scans the follow-up queue and emits a bell notification to the quote owner for:
//   1. Submitted/quoted quotes with last_activity_at older than 7 days and no pending follow-up
//   2. Activities whose scheduled_for is due today and not yet completed
//
// Dedupe is via the activity log itself — we log a `reminder_dispatched` row whenever we
// send a bell, and skip if the most recent activity for that quote is one of ours within 24h.

interface QueueRow {
  id: string;
  workspace_id: string;
  owner_user_id: string;
  quote_number: string | null;
  name: string | null;
  status: string;
  grand_total: number | null;
  currency: string | null;
  customer_contact_id: string | null;
  customer_company_id: string | null;
  days_since_activity: number | null;
  last_activity_logged_at: string | null;
  next_scheduled_follow_up: string | null;
}

const STALE_THRESHOLD_DAYS = 7;

function json(body: any, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  await bootstrapForFunction();
  if (req.method === 'OPTIONS') return new Response(null, { status: 200, headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );

    // 1. Pull the follow-up queue (view aggregates the data we need)
    const { data: queue, error: queueErr } = await supabase
      .from('vw_quote_followup_queue')
      .select('*');

    if (queueErr) {
      console.error('vw_quote_followup_queue read failed', queueErr.message);
      return json({ error: queueErr.message }, 500);
    }

    const rows = (queue as QueueRow[] | null) ?? [];
    const nowMs = Date.now();
    let dispatched = 0;
    let skipped = 0;

    for (const r of rows) {
      // Two reasons to ping: (a) stale, no recent activity, (b) a scheduled follow-up due today
      const stale =
        (r.days_since_activity ?? 0) >= STALE_THRESHOLD_DAYS &&
        (r.last_activity_logged_at === null ||
          (nowMs - new Date(r.last_activity_logged_at).getTime()) > 24 * 3600 * 1000);

      const dueScheduled =
        r.next_scheduled_follow_up !== null &&
        new Date(r.next_scheduled_follow_up).getTime() <= nowMs;

      if (!stale && !dueScheduled) {
        skipped += 1;
        continue;
      }

      // Dedupe — skip if a reminder_dispatched activity exists within 24h
      const { data: recent } = await supabase
        .from('quote_activities')
        .select('id, created_at')
        .eq('quote_id', r.id)
        .eq('kind', 'reminder_dispatched')
        .gt('created_at', new Date(nowMs - 24 * 3600 * 1000).toISOString())
        .limit(1);

      if (recent && recent.length > 0) {
        skipped += 1;
        continue;
      }

      const title = dueScheduled
        ? `Follow-up due: ${r.quote_number ?? r.name ?? 'quote'}`
        : `Quote idle for ${r.days_since_activity}d: ${r.quote_number ?? r.name ?? 'quote'}`;
      const body = dueScheduled
        ? `A scheduled follow-up for this ${r.status} quote is due now.`
        : `No activity in ${r.days_since_activity} days. Worth a nudge to the customer?`;
      const actionUrl = `/quotes/${r.id}`;

      // Insert bell notification to the owner
      if (r.owner_user_id) {
        const { error: notifErr } = await supabase.from('user_notifications').insert({
          user_id: r.owner_user_id,
          type: 'finance_follow_up',
          title,
          body,
          action_url: actionUrl,
          is_read: false,
          metadata: {
            quote_id: r.id,
            workspace_id: r.workspace_id,
            stale,
            due_scheduled: dueScheduled,
            grand_total: r.grand_total,
            currency: r.currency,
          },
        });
        if (notifErr) {
          console.error('user_notifications insert failed', r.id, notifErr.message);
        }
      }

      if (r.owner_user_id) {
        await supabase.from('quote_activities').insert({
          quote_id: r.id,
          kind: 'reminder_dispatched',
          body: title,
          metadata: { stale, due_scheduled: dueScheduled, channel: 'bell' },
        });
      }

      dispatched += 1;
    }

    return json({ ok: true, queue_size: rows.length, dispatched, skipped });
  } catch (err: any) {
    console.error('finance-followup-cron error', err);
    return json({ error: err?.message ?? 'Internal error' }, 500);
  }
});
