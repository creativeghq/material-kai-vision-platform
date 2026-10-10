/** mail-scheduler — cron: wakes snoozed Gmail threads and delivers scheduled sends. Every row is CLAIMED before it is acted on. */
import { createClient } from '@supabase/supabase-js';
import { withApiLogging, HttpError } from '../_shared/api-logger.ts';
import { isCronAuthorized } from '../_shared/auth.ts';
import { bootstrapForFunction } from '../_shared/secrets-bootstrap.ts';
import { jsonResponse as json } from '../_shared/http.ts';
import { gmailAccessToken, gmailFetch, gmailHeader, sendPreparedGmail, type PreparedGmailSend } from '../_shared/gmail-client.ts';
import { parseAddress } from '../_shared/mail-mime.ts';
import { emitFlowEvent } from '../_shared/flow-events.ts';
import { AUTO_REPLY_GMAIL_HEADERS, isAutoReplyFromHeaderList } from '../_shared/mail-auto-reply.ts';

// deno-lint-ignore no-explicit-any
type Db = any;

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const BATCH = 25;
const STALE_SENDING_MS = 15 * 60 * 1000;

async function wakeSnoozes(db: Db): Promise<{ woken: number; failed: number }> {
  const now = new Date().toISOString();
  const { data, error } = await db.from('mail_thread_index')
    .select('id, gmail_thread_id, snoozed_until, mail_accounts!inner(id, email, display_name, status)')
    .lte('snoozed_until', now).limit(BATCH);
  if (error) throw new HttpError(500, `snooze scan failed: ${error.message}`);
  let woken = 0;
  let failed = 0;
  for (const row of data ?? []) {
    const { data: claimed, error: claimErr } = await db.from('mail_thread_index')
      .update({ snoozed_until: null, woken_at: now, updated_at: now }).eq('id', row.id).eq('snoozed_until', row.snoozed_until).select('id');
    if (claimErr || !claimed?.length) continue;
    const account = row.mail_accounts;
    try {
      if (account.status !== 'active') throw new Error('the mailbox needs reconnecting');
      const token = await gmailAccessToken(db, account);
      await gmailFetch(token, `/threads/${row.gmail_thread_id}/modify`, {
        method: 'POST', body: JSON.stringify({ addLabelIds: ['INBOX', 'UNREAD'] }),
      });
      woken++;
    } catch (e) {
      failed++;
      const retryAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
      const { error: backErr } = await db.from('mail_thread_index').update({ snoozed_until: retryAt }).eq('id', row.id);
      console.error('[mail-scheduler] snooze wake failed, retrying in 15 min', row.id, (e as Error).message, backErr?.message ?? '');
    }
  }
  return { woken, failed };
}

/** They wrote on the thread after `sinceMs`. Our sends (any alias) carry SENT; an out-of-office is not an answer. */
async function repliedSince(db: Db, account: { id: string; email: string; display_name: string | null }, threadId: string, sinceMs: number): Promise<boolean> {
  const token = await gmailAccessToken(db, account);
  const t = await gmailFetch(token, `/threads/${threadId}?format=metadata${AUTO_REPLY_GMAIL_HEADERS}`);
  type Msg = { internalDate?: string; labelIds?: string[]; payload?: { headers?: Array<{ name: string; value: string }> } };
  return ((t.messages ?? []) as Msg[]).some((m) => {
    const labels = m.labelIds ?? [];
    return Number(m.internalDate ?? 0) > sinceMs && !labels.includes('SENT') && !labels.includes('DRAFT')
      && !isAutoReplyFromHeaderList(m.payload?.headers ?? []);
  });
}

/** A reply ends the whole chain: this step and every later one still waiting. */
async function cancelForReply(db: Db, id: string | null, sequenceId: string | null): Promise<void> {
  const patch = { status: 'cancelled', cancel_reason: 'replied', error: 'They replied before it was due, so it was not sent.' };
  for (let attempt = 0; id && attempt < 3; attempt++) {
    const { error } = await db.from('mail_scheduled_sends').update(patch).eq('id', id);
    if (!error) break;
    if (attempt === 2) console.error('[mail-scheduler] outreach cancel not recorded', id, error.message);
  }
  if (!sequenceId) return;
  const { error } = await db.from('mail_scheduled_sends').update(patch).eq('sequence_id', sequenceId).eq('status', 'pending');
  if (error) console.error('[mail-scheduler] later steps not cancelled', sequenceId, error.message);
}

/** A follow-up that could not go out: the person who set it hears why, and a platform conversation comes back on top. */
async function tellFollowUpFailed(db: Db, row: Record<string, unknown>, failure: string): Promise<void> {
  if (row.kind === 'inbox' && row.inbox_thread_id) {
    const { error } = await db.from('inbox_threads')
      .update({ status: 'open', last_message_at: new Date().toISOString(), follow_up_error: failure.slice(0, 500) }).eq('id', row.inbox_thread_id);
    if (error) console.error('[mail-scheduler] failed follow-up not surfaced', row.id, error.message);
  }
  await emitFlowEvent('inbox.follow_up_due', {
    type: 'inbox_follow_up',
    user_id: row.user_id,
    workspace_id: row.workspace_id,
    title: 'Your follow-up could not be sent',
    body: `${String(row.summary ?? 'A follow-up')} — ${failure}`.slice(0, 500),
    action_url: row.kind === 'inbox' ? `/inbox?thread=${row.inbox_thread_id}` : '/inbox?src=gmail',
    ...(row.kind === 'inbox' ? { thread_id: row.inbox_thread_id } : { gmail_thread_id: row.gmail_thread_id, source: 'gmail' }),
    error: failure,
  });
}

async function deliverScheduled(db: Db): Promise<{ sent: number; failed: number; skipped: number }> {
  const now = new Date();
  const { data: due, error } = await db.from('mail_scheduled_sends')
    .select('id').eq('status', 'pending').lte('send_at', now.toISOString()).order('send_at').limit(BATCH);
  if (error) throw new HttpError(500, `scheduled scan failed: ${error.message}`);
  let sent = 0;
  let failed = 0;
  let skipped = 0;
  for (const { id } of due ?? []) {
    const { data: rows, error: claimErr } = await db.from('mail_scheduled_sends')
      .update({ status: 'sending', claimed_at: new Date().toISOString() })
      .eq('id', id).eq('status', 'pending')
      .select('id, kind, account_id, payload, user_id, workspace_id, created_at, if_no_reply, gmail_thread_id, inbox_thread_id, sequence_id, summary, mail_accounts(id, email, display_name, status)');
    if (claimErr || !rows?.length) continue;
    const row = rows[0];
    let result: Record<string, unknown> | null = null;
    let failure: string | null = null;
    try {
      if (row.kind === 'gmail') {
        const account = row.mail_accounts;
        if (!account || account.status !== 'active') throw new Error('the Gmail account needs reconnecting');
        if (row.if_no_reply && row.gmail_thread_id && await repliedSince(db, account, row.gmail_thread_id, Date.parse(row.created_at))) {
          await cancelForReply(db, row.id, row.sequence_id ?? null);
          skipped++;
          continue;
        }
        result = await sendPreparedGmail(db, account, row.payload as PreparedGmailSend, { user_id: row.user_id, workspace_id: row.workspace_id });
      } else {
        const r = await fetch(`${SUPABASE_URL}/functions/v1/inbox-api`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'internal_scheduled_send', scheduled_id: row.id }),
        });
        const j = await r.json().catch(() => ({})) as Record<string, unknown>;
        if (!r.ok) throw new Error(String(j.error ?? `inbox-api ${r.status}`));
        result = { message_id: (j.message as { id?: string } | undefined)?.id ?? null };
      }
    } catch (e) {
      failure = (e as Error).message;
    }
    const { error: doneErr } = await db.from('mail_scheduled_sends').update(failure
      ? { status: 'failed', error: failure.slice(0, 1000) }
      : { status: 'sent', sent_at: new Date().toISOString(), result, payload: { delivered: true } }).eq('id', row.id);
    if (doneErr) console.error('[mail-scheduler] outcome not recorded', row.id, doneErr.message);
    if (failure && row.if_no_reply) await tellFollowUpFailed(db, row, failure);
    if (failure) failed++; else sent++;
  }
  return { sent, failed, skipped };
}

const SYNC_ACCOUNTS = 20;
const SYNC_MESSAGES = 25;

/** New mail in SHARED mailboxes becomes a `mail.received` flow event. Personal mail never leaves its owner. */
async function syncHistory(db: Db): Promise<{ accounts: number; events: number; failed: number }> {
  const { data: accounts, error } = await db.from('mail_accounts')
    .select('id, user_id, workspace_id, email, display_name, status, history_id')
    .eq('status', 'active').eq('is_shared', true)
    .order('last_synced_at', { ascending: true, nullsFirst: true }).limit(SYNC_ACCOUNTS);
  if (error) throw new HttpError(500, `account scan failed: ${error.message}`);
  let events = 0;
  let failed = 0;
  for (const account of accounts ?? []) {
    try {
      const token = await gmailAccessToken(db, account);
      if (!account.history_id) {
        const profile = await gmailFetch(token, '/profile');
        await stampSync(db, account.id, String(profile.historyId ?? ''), null);
        continue;
      }
      let history: Record<string, unknown>;
      try {
        history = await gmailFetch(token, `/history?startHistoryId=${encodeURIComponent(account.history_id)}&historyTypes=messageAdded&labelId=INBOX&maxResults=100`);
      } catch (e) {
        if ((e as { status?: number }).status === 404) {
          const profile = await gmailFetch(token, '/profile');
          await stampSync(db, account.id, String(profile.historyId ?? ''), 'History expired; restarted from now.');
          continue;
        }
        throw e;
      }
      const added = ((history.history ?? []) as Array<{ messagesAdded?: Array<{ message: { id: string; threadId: string; labelIds?: string[] } }> }>)
        .flatMap((h) => h.messagesAdded ?? []).map((m) => m.message)
        .filter((m) => !(m.labelIds ?? []).includes('SENT') && !(m.labelIds ?? []).includes('DRAFT'));
      const unique = [...new Map(added.map((m) => [m.id, m])).values()].slice(0, SYNC_MESSAGES);
      for (const m of unique) {
        const msg = await gmailFetch(token, `/messages/${m.id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject`).catch(() => null);
        if (!msg) continue;
        const from = parseAddress(gmailHeader(msg, 'From'));
        if (from.address === account.email.toLowerCase()) continue;
        const { data: contact } = from.address
          ? await db.from('crm_contacts').select('id, name').eq('workspace_id', account.workspace_id)
            .ilike('email', from.address.replace(/[%_\\]/g, '\\$&')).limit(1).maybeSingle()
          : { data: null };
        const subject = gmailHeader(msg, 'Subject') || '(no subject)';
        const who = contact?.name || from.name || from.address || 'someone';
        await emitFlowEvent('mail.received', {
          type: 'mail.received',
          workspace_id: account.workspace_id,
          user_id: account.user_id,
          account_id: account.id,
          account_email: account.email,
          gmail_thread_id: m.threadId,
          gmail_message_id: m.id,
          from_address: from.address,
          from_name: from.name,
          subject,
          snippet: String(msg.snippet ?? '').slice(0, 300),
          label_ids: m.labelIds ?? [],
          contact_id: contact?.id ?? null,
          contact_name: contact?.name ?? null,
          title: `${who} emailed ${account.email}`,
          body: subject,
          action_url: '/inbox?src=gmail',
        });
        events++;
      }
      await stampSync(db, account.id, String(history.historyId ?? account.history_id), null);
    } catch (e) {
      failed++;
      await stampSync(db, account.id, account.history_id, (e as Error).message.slice(0, 500));
    }
  }
  return { accounts: accounts?.length ?? 0, events, failed };
}

async function stampSync(db: Db, accountId: string, historyId: string | null, err: string | null) {
  const { error } = await db.from('mail_accounts')
    .update({ history_id: historyId || null, last_synced_at: new Date().toISOString(), sync_error: err }).eq('id', accountId);
  if (error) console.error('[mail-scheduler] sync stamp failed', accountId, error.message);
}

/** Due Gmail reminders ring through the inbox.follow_up_due flow; "if no reply" ones clear when a reply came. */
async function fireReminders(db: Db): Promise<{ fired: number; cleared: number }> {
  const now = new Date().toISOString();
  const { data, error } = await db.from('mail_thread_index')
    .select('id, gmail_thread_id, workspace_id, remind_at, remind_note, remind_if_no_reply, remind_user_id, remind_set_at, subject, mail_accounts!inner(id, email, display_name, status)')
    .lte('remind_at', now).limit(BATCH);
  if (error) throw new HttpError(500, `reminder scan failed: ${error.message}`);
  let fired = 0;
  let cleared = 0;
  for (const row of data ?? []) {
    const { data: claimed } = await db.from('mail_thread_index')
      .update({ remind_at: null, reminded_at: now }).eq('id', row.id).eq('remind_at', row.remind_at).select('id');
    if (!claimed?.length) continue;
    let replied = false;
    if (row.remind_if_no_reply && row.mail_accounts.status === 'active') {
      try {
        replied = await repliedSince(db, row.mail_accounts, row.gmail_thread_id, row.remind_set_at ? Date.parse(row.remind_set_at) : 0);
      } catch (e) {
        console.error('[mail-scheduler] reminder check failed; reminding anyway', row.id, (e as Error).message);
      }
    }
    if (replied) { cleared++; continue; }
    if (row.mail_accounts.status === 'active') {
      try {
        const token = await gmailAccessToken(db, row.mail_accounts);
        await gmailFetch(token, `/threads/${row.gmail_thread_id}/modify`, { method: 'POST', body: JSON.stringify({ addLabelIds: ['INBOX', 'UNREAD'] }) });
        const { error: wErr } = await db.from('mail_thread_index').update({ woken_at: now }).eq('id', row.id);
        if (wErr) console.error('[mail-scheduler] reminder fired but not pinned on top', row.id, wErr.message);
      } catch (e) {
        console.error('[mail-scheduler] reminder fired but the thread was not brought back', row.id, (e as Error).message);
      }
    }
    if (!row.remind_user_id) { console.error('[mail-scheduler] reminder with no owner dropped', row.id); continue; }
    await emitFlowEvent('inbox.follow_up_due', {
      type: 'inbox.follow_up_due',
      workspace_id: row.workspace_id,
      user_id: row.remind_user_id,
      title: row.remind_if_no_reply ? 'No reply yet — follow up' : 'Reminder',
      body: [row.subject || 'An email conversation', row.remind_note].filter(Boolean).join(' — '),
      action_url: '/inbox?src=gmail',
      gmail_thread_id: row.gmail_thread_id,
      source: 'gmail',
    });
    fired++;
  }
  return { fired, cleared };
}

const OUTCOME_BATCH = 15;
const OUTCOME_RECHECK_MS = 6 * 3600 * 1000;

/** Did a sent Gmail follow-up get an answer? Checked a few times over 30 days; the Inbox side is stamped by its trigger. */
async function checkOutcomes(db: Db): Promise<{ checked: number; replied: number }> {
  const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const stale = new Date(Date.now() - OUTCOME_RECHECK_MS).toISOString();
  const { data, error } = await db.from('mail_scheduled_sends')
    .select('id, sent_at, gmail_thread_id, sequence_id, mail_accounts!inner(id, email, display_name, status)')
    .eq('kind', 'gmail').eq('if_no_reply', true).eq('status', 'sent').is('replied_at', null).gt('sent_at', since)
    .or(`outcome_checked_at.is.null,outcome_checked_at.lt.${stale}`)
    .order('outcome_checked_at', { ascending: true, nullsFirst: true }).limit(OUTCOME_BATCH);
  if (error) { console.error('[mail-scheduler] outcome scan failed', error.message); return { checked: 0, replied: 0 }; }
  let replied = 0;
  for (const row of data ?? []) {
    let answered = false;
    if (row.mail_accounts.status === 'active' && row.gmail_thread_id) {
      try { answered = await repliedSince(db, row.mail_accounts, row.gmail_thread_id, Date.parse(row.sent_at)); } catch (e) {
        console.error('[mail-scheduler] outcome check failed', row.id, (e as Error).message);
      }
    }
    const now = new Date().toISOString();
    const { error: upErr } = await db.from('mail_scheduled_sends')
      .update({ outcome_checked_at: now, ...(answered ? { replied_at: now } : {}) }).eq('id', row.id);
    if (upErr) console.error('[mail-scheduler] outcome not recorded', row.id, upErr.message);
    if (answered) {
      replied++;
      if (row.sequence_id) await cancelForReply(db, null, row.sequence_id);
    }
  }
  return { checked: data?.length ?? 0, replied };
}

async function failStalled(db: Db): Promise<number> {
  const cutoff = new Date(Date.now() - STALE_SENDING_MS).toISOString();
  const { data, error } = await db.from('mail_scheduled_sends')
    .update({ status: 'failed', error: 'Stopped part-way through sending. Check the conversation before sending it again: it may have gone.' })
    .eq('status', 'sending').lt('claimed_at', cutoff).select('id');
  if (error) throw new HttpError(500, `stall sweep failed: ${error.message}`);
  return data?.length ?? 0;
}

Deno.serve(withApiLogging('mail-scheduler', async (req) => {
  await bootstrapForFunction();
  if (!isCronAuthorized(req)) return json({ error: 'Unauthorized' }, 401);
  const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const stalled = await failStalled(db);
  const snoozes = await wakeSnoozes(db);
  const scheduled = await deliverScheduled(db);
  const reminders = await fireReminders(db);
  const outcomes = await checkOutcomes(db);
  const sync = await syncHistory(db);
  return json({ ok: true, stalled, snoozes, scheduled, reminders, outcomes, sync });
}));
