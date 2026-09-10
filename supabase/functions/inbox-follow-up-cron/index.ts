// inbox-follow-up-cron — the half of "Follow-up" that made it a queue instead of a shelf.

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

/** Send the chase through inbox-api rather than by writing a row. */
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

    /* Back to Open, whether or not the message went. */
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
