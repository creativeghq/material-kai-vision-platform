/**
 * crm-meeting-reminders — sends reminders for upcoming CRM meetings (crm_meetings) whose
 * reminder time has arrived. Runs every few minutes via pg_cron (x-cron-secret).
 *
 * Email reminders send through email-api (to the meeting owner's account email). WhatsApp
 * reminders require a per-workspace connected WhatsApp channel + an approved template
 * (Zernio messaging) — not yet wired here, so they're counted as pending. Every processed
 * row is stamped `reminder_sent_at` so it never re-fires.
 */
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from '@supabase/supabase-js';
import { bootstrapForFunction } from '../_shared/secrets-bootstrap.ts';
import { withApiLogging } from '../_shared/api-logger.ts';
import { isCronAuthorized } from '../_shared/auth.ts';
import { escapeHtml } from '../_shared/html.ts';

serve(withApiLogging('crm-meeting-reminders', async (req) => {
  await bootstrapForFunction();
  if (!isCronAuthorized(req)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, serviceKey);
  const nowIso = new Date().toISOString();

  const { data: due, error } = await supabase
    .from('crm_meetings')
    .select('id, workspace_id, owner_user_id, target_kind, target_id, subject, notes, meeting_at, remind_email, remind_whatsapp')
    .lte('reminder_at', nowIso)
    .is('reminder_sent_at', null)
    .eq('status', 'scheduled')
    .or('remind_email.eq.true,remind_whatsapp.eq.true')
    .order('reminder_at', { ascending: true })
    .limit(100);
  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }

  let emailed = 0, whatsappPending = 0, failed = 0;

  for (const m of due ?? []) {
    try {
      const { data: owner } = await supabase.from('user_profiles').select('email').eq('user_id', m.owner_user_id).maybeSingle();

      let party = '';
      if (m.target_kind && m.target_id) {
        const tbl = m.target_kind === 'company' ? 'crm_companies' : 'crm_contacts';
        const { data: p } = await supabase.from(tbl).select('name').eq('id', m.target_id).maybeSingle();
        party = (p as { name?: string } | null)?.name || '';
      }

      const whenLong = new Date(m.meeting_at).toLocaleString('en-GB', { dateStyle: 'full', timeStyle: 'short' });
      const whenShort = new Date(m.meeting_at).toLocaleDateString('en-GB');

      // Track outcome so we only stamp reminder_sent_at when a channel actually delivered OR the failure
      // is permanent (retrying won't help). A transient failure with nothing delivered is left unstamped
      // so the next tick retries — previously it stamped unconditionally and the reminder was lost.
      let deliveredAny = false;
      let transientFailure = false;

      if (m.remind_email && owner?.email) {
        const html = `<div style="font-family:Arial,sans-serif;color:#222;line-height:1.5">
          <h2 style="margin:0 0 10px">Meeting reminder</h2>
          <p>You have a meeting${party ? ` with <strong>${escapeHtml(party)}</strong>` : ''} coming up:</p>
          <p style="font-size:16px;margin:6px 0"><strong>${escapeHtml(m.subject || 'Meeting')}</strong><br>${escapeHtml(whenLong)}</p>
          ${m.notes ? `<p style="color:#555;white-space:pre-wrap">${escapeHtml(m.notes)}</p>` : ''}
        </div>`;
        const res = await fetch(`${supabaseUrl}/functions/v1/email-api`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${serviceKey}` },
          body: JSON.stringify({
            action: 'send',
            to: owner.email,
            subject: `Reminder: ${m.subject || 'Meeting'} — ${whenShort}`,
            html,
            emailType: 'transactional',
            tags: { feature: 'crm_meeting_reminder', meeting_id: m.id },
            workspace_id: m.workspace_id,
          }),
        });
        if (res.ok) { emailed++; deliveredAny = true; } else { failed++; transientFailure = true; }
      }

      // WhatsApp reminder: direct WhatsApp send needs a connected per-workspace channel +
      // an approved template (+ the Zernio Inbox add-on). Until that's wired, deliver the
      // reminder through the in-app bell so the toggle is a real reminder, not a silent no-op.
      if (m.remind_whatsapp && m.owner_user_id) {
        const { error: notifErr } = await supabase.from('user_notifications').insert({
          user_id: m.owner_user_id,
          title: `Meeting reminder: ${m.subject || 'Meeting'}`,
          body: `${party ? `With ${party}. ` : ''}${whenLong}`,
          type: 'info',
          action_url: '/profile?tab=calendar',
          is_read: false,
          metadata: { feature: 'crm_meeting_reminder', meeting_id: m.id, channel: 'whatsapp_bell_fallback' },
        });
        if (notifErr) { failed++; transientFailure = true; } else { whatsappPending++; deliveredAny = true; }
      }

      // Stamp when something delivered, or when nothing delivered but the failure was permanent (e.g. an
      // email-only reminder with no owner email — retrying can't fix it). Leave unstamped on a transient
      // failure with nothing delivered so the next run retries.
      if (deliveredAny || !transientFailure) {
        // Same as the warranty cron: the reminder is already out, so an unstamped row re-sends on
        // every subsequent run. supabase-js resolves on an RLS denial instead of throwing, so the
        // result has to be checked explicitly — the surrounding catch would never see it.
        const { error: stampErr } = await supabase.from('crm_meetings')
          .update({ reminder_sent_at: new Date().toISOString() }).eq('id', m.id);
        if (stampErr) throw stampErr;
      }
    } catch (_) {
      failed++;
    }
  }

  return new Response(
    JSON.stringify({ success: true, due: (due ?? []).length, emailed, whatsappPending, failed }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );
}));
