/** One Gmail client for gmail-api and mail-scheduler: token refresh, API calls, and the send. */
import { HttpError } from './api-logger.ts';
import { escapeHtml } from './html.ts';
import { hasEmailMarkup, renderEmailMarkup } from './emailMarkup.generated.ts';
import { refreshGoogleToken } from './google-oauth.ts';
import { base64ToBase64Url, buildMimeMessage, utf8ToBase64, type GmailPart, type MimeAttachment } from './mail-mime.ts';
import { isTrackId, withTrackingPixel } from './mail-tracking.ts';

// deno-lint-ignore no-explicit-any
type Db = any;

const GMAIL = 'https://gmail.googleapis.com/gmail/v1/users/me';
export const EMAIL_ADDRESS = /^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]+$/;
const SEND_LIMIT_BYTES = 25 * 1024 * 1024;

export interface GmailAccount { id: string; email: string; display_name: string | null }

export async function gmailAccessToken(db: Db, account: GmailAccount): Promise<string> {
  const { data: refresh, error } = await db.rpc('mail_account_refresh_token', { p_account_id: account.id });
  if (error) throw new HttpError(500, `Could not read the Gmail credentials: ${error.message}`);
  if (!refresh) throw new HttpError(409, 'Gmail needs to be reconnected.');
  try {
    return (await refreshGoogleToken(String(refresh))).access_token;
  } catch (e) {
    if ((e as { code?: string }).code === 'invalid_grant') {
      const { error: upErr } = await db.from('mail_accounts')
        .update({ status: 'needs_reauth', last_error: 'Google access was revoked or expired', updated_at: new Date().toISOString() })
        .eq('id', account.id);
      if (upErr) console.error('[gmail] could not mark the account for reconnection', account.id, upErr);
      throw new HttpError(409, 'Gmail access was revoked or expired. Reconnect the account.');
    }
    throw new HttpError(502, `Google refused the token refresh: ${(e as Error).message}`);
  }
}

export async function gmailFetch(token: string, path: string, init: RequestInit = {}): Promise<Record<string, unknown>> {
  const r = await fetch(`${GMAIL}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, ...(init.body ? { 'Content-Type': 'application/json' } : {}), ...(init.headers ?? {}) },
  });
  const j = await r.json().catch(() => ({})) as Record<string, unknown>;
  if (!r.ok) {
    const msg = (j.error as { message?: string } | undefined)?.message ?? `Gmail ${r.status}`;
    throw new HttpError(r.status === 404 ? 404 : r.status === 403 ? 403 : 502, msg);
  }
  return j;
}

export function gmailHeader(msg: Record<string, unknown>, name: string): string {
  const headers = ((msg.payload as GmailPart | undefined)?.headers ?? []) as Array<{ name: string; value: string }>;
  return headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? '';
}

export function cleanAddresses(raw: unknown, field: string, max = 50): string[] {
  if (raw == null) return [];
  if (!Array.isArray(raw)) throw new HttpError(400, `${field} must be a list of addresses`);
  const out = [...new Set(raw.map((a) => String(a ?? '').trim().toLowerCase()).filter(Boolean))];
  for (const a of out) if (!EMAIL_ADDRESS.test(a)) throw new HttpError(400, `"${a}" is not an email address`);
  if (out.length > max) throw new HttpError(400, `At most ${max} addresses in ${field}`);
  return out;
}

/** A send, validated and normalised — what the scheduler stores and replays. */
export interface PreparedGmailSend {
  to: string[]; cc: string[]; bcc: string[]; subject: string; text: string;
  thread_id: string | null; reply_to_message_id: string | null; attachments: MimeAttachment[];
  track_id?: string | null;
}

export interface GmailSender { user_id: string; workspace_id: string }

export function prepareGmailSend(body: Record<string, unknown>, limitBytes = SEND_LIMIT_BYTES): PreparedGmailSend {
  const to = cleanAddresses(body.to, 'to');
  if (to.length === 0) throw new HttpError(400, 'At least one To address is required');
  const text = String(body.body ?? '');
  const rawAtts = Array.isArray(body.attachments) ? body.attachments as Array<Record<string, unknown>> : [];
  if (!text.trim() && rawAtts.length === 0) throw new HttpError(400, 'Write a message or attach a file');
  const attachments: MimeAttachment[] = rawAtts.slice(0, 20).map((a) => ({
    filename: String(a.filename ?? 'attachment').slice(0, 200),
    contentType: String(a.content_type ?? 'application/octet-stream'),
    base64: String(a.data_base64 ?? '').replace(/\s+/g, ''),
  }));
  const totalBytes = attachments.reduce((n, a) => n + Math.floor(a.base64.length * 0.75), 0);
  if (totalBytes > limitBytes) throw new HttpError(413, `Attachments exceed ${Math.round(limitBytes / 1024 / 1024)} MB`);
  const threadId = typeof body.thread_id === 'string' && /^[0-9a-f]+$/i.test(body.thread_id) ? body.thread_id : null;
  const replyTo = threadId && typeof body.reply_to_message_id === 'string' && /^[0-9a-f]+$/i.test(body.reply_to_message_id)
    ? body.reply_to_message_id : null;
  const subject = String(body.subject ?? '').trim().slice(0, 500);
  if (!subject && !replyTo) throw new HttpError(400, 'A subject is required');
  return {
    to, cc: cleanAddresses(body.cc, 'cc'), bcc: cleanAddresses(body.bcc, 'bcc'), subject, text, thread_id: threadId, reply_to_message_id: replyTo, attachments,
    track_id: body.track_opens === true ? crypto.randomUUID() : null,
  };
}

export async function sendPreparedGmail(
  db: Db, account: GmailAccount, p: PreparedGmailSend, sender?: GmailSender,
): Promise<{ message_id: string; thread_id: string; tracked: boolean }> {
  const token = await gmailAccessToken(db, account);
  let subject = p.subject;
  let inReplyTo: string | null = null;
  let references: string | null = null;
  if (p.thread_id && p.reply_to_message_id) {
    const orig = await gmailFetch(token, `/messages/${p.reply_to_message_id}?format=metadata&metadataHeaders=Message-ID&metadataHeaders=References&metadataHeaders=Subject`);
    if (orig.threadId !== p.thread_id) throw new HttpError(400, 'That message is not in this conversation');
    inReplyTo = gmailHeader(orig, 'Message-ID') || null;
    references = [gmailHeader(orig, 'References'), inReplyTo].filter(Boolean).join(' ') || null;
    const origSubject = gmailHeader(orig, 'Subject');
    if (!subject) subject = /^re:/i.test(origSubject) ? origSubject : `Re: ${origSubject}`;
  }
  let trackId = isTrackId(p.track_id) && sender ? p.track_id : null;
  if (trackId) {
    const { error } = await db.from('mail_open_tracking').upsert({
      id: trackId, workspace_id: sender!.workspace_id, user_id: sender!.user_id, kind: 'gmail', account_id: account.id,
      gmail_thread_id: p.thread_id, recipients: [...p.to, ...p.cc].join(', ').slice(0, 500),
    }, { onConflict: 'id', ignoreDuplicates: true });
    if (error) { console.error('[gmail] open tracking unavailable, sending untracked', error.message); trackId = null; }
  }
  const markup = hasEmailMarkup(p.text) ? renderEmailMarkup(p.text, escapeHtml) : null;
  const from = account.display_name ? `${account.display_name.replace(/["\\]/g, '')} <${account.email}>` : account.email;
  const raw = buildMimeMessage({
    from, to: p.to, cc: p.cc, bcc: p.bcc, subject, text: p.text,
    html: trackId ? withTrackingPixel(markup, p.text, trackId) : markup,
    inReplyTo, references, attachments: p.attachments,
  });
  const sent = await gmailFetch(token, '/messages/send', {
    method: 'POST',
    body: JSON.stringify({ raw: base64ToBase64Url(utf8ToBase64(raw)), ...(p.thread_id ? { threadId: p.thread_id } : {}) }),
  });
  if (trackId) {
    const { error } = await db.from('mail_open_tracking')
      .update({ gmail_message_id: String(sent.id), gmail_thread_id: String(sent.threadId) }).eq('id', trackId);
    if (error) console.error('[gmail] could not link the tracked send to its message', trackId, error.message);
  }
  return { message_id: String(sent.id), thread_id: String(sent.threadId), tracked: !!trackId };
}
