// inbox-follow-up-cron — the half of "Follow-up" that made it a queue instead of a shelf.
//
// The Inbox has had three statuses for a long time, and the middle one never worked: "Snoozed"
// carried no date and nothing ever brought it back, so it was a bucket you had to remember to
// walk past. Measured 2026-09-01, all 56 live threads sat in `open` and neither of the other two
// had ever been used once.
//
// A follow-up is now a moment (`inbox_threads.follow_up_at`) and, optionally, a message to send
// when it arrives (`follow_up_message`). This runs every five minutes and does two things per
// due thread: send the chase if there is one, and put the conversation back in front of whoever
// asked for it.
//
// ── The claim comes first, and it is the database's ──────────────────────────────────────────
// `claim_due_inbox_follow_ups` stamps `follow_up_fired_at` in the SAME statement that selects the
// row. That ordering is the whole safety property: this function sends a real message to a real
// customer, that half cannot be rolled back, and a retry after a timeout must not chase somebody
// twice. A lost race returns zero rows rather than a second message.
//
// ── Nothing here writes a notification ───────────────────────────────────────────────────────
// It emits `inbox.follow_up_due` and the seeded `system-default` flow delivers it, so an operator
// can retarget or silence it without a deploy.

import { createClient } from '@supabase/supabase-js';
import type { DbClient } from '../_shared/supabase-client.ts';
import { withApiLogging } from '../_shared/api-logger.ts';
import { isCronAuthorized } from '../_shared/auth.ts';
import { emitFlowEvent } from '../_shared/flow-events.ts';
import { bootstrapForFunction } from '../_shared/secrets-bootstrap.ts';

const BATCH = 50;

interface ClaimedRow {
  thread_id: string;
  workspace_id: string | null;
  channel: string;
  subject: string | null;
  follow_up_note: string | null;
  follow_up_message: string | null;
  follow_up_set_by: string | null;
}

/**
 * Send the chase through inbox-api rather than by writing a row.
 *
 * `internal_send_follow_up` runs the ordinary send path — the 24-hour window check, the channel
 * relay, attachment signing, the notification. A cron that inserted into `inbox_messages` itself
 * would produce a message the operator can see and the customer never got, which is the exact
 * failure this whole feature exists to prevent, wearing the opposite face.
 *
 * A dedicated action, not `send_message` with a borrowed identity: `send_message` requires a real
 * JWT, and making it accept a body-supplied `user_id` would be invariant 1 in reverse. The
 * impersonation is one narrow thing a cron does, behind the service-role bearer.
 */
async function sendChase(
  threadId: string,
  body: string,
  senderUserId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const url = `${Deno.env.get('SUPABASE_URL')}/functions/v1/inbox-api`;
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: key,
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        action: 'internal_send_follow_up',
        thread_id: threadId,
        body,
        sender_user_id: senderUserId,
      }),
    });
    if (res.ok) return { ok: true };
    // The STATUS is usually the answer, and 409 is the one that matters: Meta's service window
    // closed, which is not a bug and is the operator's to act on. Kept in full rather than
    // flattened to "failed" — a follow-up that did not go out is only actionable with its reason.
    const text = await res.text();
    let detail = text;
    try { detail = (JSON.parse(text) as { error?: string }).error ?? text; } catch { /* raw */ }
    return { ok: false, error: `HTTP ${res.status}: ${String(detail).slice(0, 400)}` };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

Deno.serve(withApiLogging('inbox-follow-up-cron', async (req: Request) => {
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

  const { data: claimed, error: claimErr } = await db.rpc('claim_due_inbox_follow_ups', {
    p_limit: BATCH,
  });
  if (claimErr) {
    // Loud. A claim that cannot run means no follow-up fires at all, and the symptom — nothing
    // happening — is indistinguishable from nothing being due.
    return new Response(JSON.stringify({ success: false, error: claimErr.message }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }

  const rows = (claimed || []) as ClaimedRow[];
  let sent = 0, remindedOnly = 0, sendFailed = 0, notifyFailed = 0;

  for (const row of rows) {
    let sendError: string | null = null;

    if (row.follow_up_message && row.follow_up_set_by) {
      const res = await sendChase(row.thread_id, row.follow_up_message, row.follow_up_set_by);
      if (res.ok) sent++;
      else { sendError = res.error; sendFailed++; }
    } else if (row.follow_up_message && !row.follow_up_set_by) {
      // Scheduled by somebody whose record has since gone. The reminder still fires; the message
      // does not, because there is no one to send it as.
      sendError = 'The person who scheduled this follow-up is no longer on the workspace.';
      sendFailed++;
    } else {
      remindedOnly++;
    }

    /*
     * Back to Open, whether or not the message went.
     *
     * That is the point of a follow-up: it puts the conversation in front of somebody again. A
     * chase that Meta refused needs the operator MORE than one that went out, not less — so a
     * failure must not leave the thread parked where nobody looks at it.
     *
     * Written unconditionally rather than only on success, because `follow_up_fired_at` is
     * already stamped: leaving the status alone here would produce a thread that has fired, is
     * still in Follow-up, and will never fire again.
     */
    await db.from('inbox_threads').update({
      status: 'open',
      follow_up_error: sendError,
    }).eq('id', row.thread_id);

    if (row.follow_up_set_by) {
      const res = await emitFlowEvent('inbox.follow_up_due', {
        user_id: row.follow_up_set_by,
        workspace_id: row.workspace_id,
        type: 'inbox_follow_up',
        title: sendError
          ? 'Your follow-up could not be sent'
          : row.follow_up_message ? 'Follow-up sent' : 'Follow-up due',
        // The note is what the operator wrote to their future self. It is the most useful
        // sentence available and beats restating the subject twice.
        body: sendError
          ? `${row.subject || 'Conversation'} — ${sendError}`
          : (row.follow_up_note || row.subject || 'Conversation'),
        action_url: `/inbox?thread=${row.thread_id}`,
        thread_id: row.thread_id,
        channel: row.channel,
        note: row.follow_up_note,
        message_sent: !!row.follow_up_message && !sendError,
        error: sendError,
      });
      if (res === null) notifyFailed++;
    }
  }

  return new Response(
    JSON.stringify({
      success: true,
      claimed: rows.length,
      sent,
      reminded_only: remindedOnly,
      send_failed: sendFailed,
      notify_failed: notifyFailed,
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );
}));
