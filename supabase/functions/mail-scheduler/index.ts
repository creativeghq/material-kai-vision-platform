/** mail-scheduler — cron: wakes snoozed Gmail threads and delivers scheduled sends. Every row is CLAIMED before it is acted on. */
import { createClient } from '@supabase/supabase-js';
import { withApiLogging, HttpError } from '../_shared/api-logger.ts';
import { isCronAuthorized } from '../_shared/auth.ts';
import { bootstrapForFunction } from '../_shared/secrets-bootstrap.ts';
import { jsonResponse as json } from '../_shared/http.ts';
import { gmailAccessToken, gmailFetch, sendPreparedGmail, type PreparedGmailSend } from '../_shared/gmail-client.ts';

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
      .update({ snoozed_until: null, updated_at: now }).eq('id', row.id).eq('snoozed_until', row.snoozed_until).select('id');
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

async function deliverScheduled(db: Db): Promise<{ sent: number; failed: number }> {
  const now = new Date();
  const { data: due, error } = await db.from('mail_scheduled_sends')
    .select('id').eq('status', 'pending').lte('send_at', now.toISOString()).order('send_at').limit(BATCH);
  if (error) throw new HttpError(500, `scheduled scan failed: ${error.message}`);
  let sent = 0;
  let failed = 0;
  for (const { id } of due ?? []) {
    const { data: rows, error: claimErr } = await db.from('mail_scheduled_sends')
      .update({ status: 'sending', claimed_at: new Date().toISOString() })
      .eq('id', id).eq('status', 'pending')
      .select('id, kind, account_id, payload, mail_accounts(id, email, display_name, status)');
    if (claimErr || !rows?.length) continue;
    const row = rows[0];
    let result: Record<string, unknown> | null = null;
    let failure: string | null = null;
    try {
      if (row.kind === 'gmail') {
        const account = row.mail_accounts;
        if (!account || account.status !== 'active') throw new Error('the Gmail account needs reconnecting');
        result = await sendPreparedGmail(db, account, row.payload as PreparedGmailSend);
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
    if (failure) failed++; else sent++;
  }
  return { sent, failed };
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
  return json({ ok: true, stalled, snoozes, scheduled });
}));
