/** gmail-api — a person's own Gmail, live: connect, browse, read, reply, label. Gmail stays the source of truth. */
import { createClient } from '@supabase/supabase-js';
import { withApiLogging, HttpError } from '../_shared/api-logger.ts';
import { authenticate, userCanAccessWorkspace } from '../_shared/auth.ts';
import { bootstrapForFunction } from '../_shared/secrets-bootstrap.ts';
import { jsonResponse as json } from '../_shared/http.ts';
import { corsHeaders } from '../_shared/cors.ts';
import { escapeHtml } from '../_shared/html.ts';
import { hasEmailMarkup, renderEmailMarkup } from '../_shared/emailMarkup.generated.ts';
import {
  exchangeGoogleCode, googleClientId, googleConsentUrl, GOOGLE_USERINFO_URL, refreshGoogleToken, revokeGoogleToken,
  signOAuthState, verifyOAuthState,
} from '../_shared/google-oauth.ts';
import {
  base64ToBase64Url, buildMimeMessage, parseAddress, parseGmailPayload, utf8ToBase64, type GmailPart, type MimeAttachment,
} from '../_shared/mail-mime.ts';

// deno-lint-ignore no-explicit-any
type Db = any;

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const APP_URL = () => (Deno.env.get('PUBLIC_APP_URL') || 'https://app.materialshub.gr').replace(/\/+$/, '');
const REDIRECT_URI = () => `${SUPABASE_URL}/functions/v1/gmail-api`;
const SCOPE = 'https://www.googleapis.com/auth/gmail.modify https://www.googleapis.com/auth/gmail.send openid email profile';
const GMAIL = 'https://gmail.googleapis.com/gmail/v1/users/me';
const EMAIL_ADDRESS = /^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]+$/;
const SEND_LIMIT_BYTES = 25 * 1024 * 1024;
const PAGE_SIZE = 25;

interface Account { id: string; user_id: string; workspace_id: string; email: string; display_name: string | null; status: string }

async function accountFor(db: Db, userId: string, accountId: string): Promise<Account> {
  const { data, error } = await db.from('mail_accounts')
    .select('id, user_id, workspace_id, email, display_name, status').eq('id', accountId).maybeSingle();
  if (error) throw new HttpError(500, `Could not read the mailbox: ${error.message}`);
  if (!data || data.user_id !== userId || data.status === 'disconnected') throw new HttpError(404, 'Mailbox not found');
  return data as Account;
}

async function accessTokenFor(db: Db, account: Account): Promise<string> {
  const { data: refresh, error } = await db.rpc('mail_account_refresh_token', { p_account_id: account.id });
  if (error) throw new HttpError(500, `Could not read the Gmail credentials: ${error.message}`);
  if (!refresh) throw new HttpError(409, 'Gmail needs to be reconnected.');
  try {
    const tok = await refreshGoogleToken(String(refresh));
    return tok.access_token;
  } catch (e) {
    const code = (e as { code?: string }).code;
    if (code === 'invalid_grant') {
      const { error: upErr } = await db.from('mail_accounts')
        .update({ status: 'needs_reauth', last_error: 'Google access was revoked or expired', updated_at: new Date().toISOString() })
        .eq('id', account.id);
      if (upErr) console.error('[gmail-api] could not mark the account for reconnection', account.id, upErr);
      throw new HttpError(409, 'Gmail access was revoked or expired. Reconnect the account.');
    }
    throw new HttpError(502, `Google refused the token refresh: ${(e as Error).message}`);
  }
}

async function gmail(token: string, path: string, init: RequestInit = {}): Promise<Record<string, unknown>> {
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

function cleanAddresses(raw: unknown, field: string, max = 50): string[] {
  if (raw == null) return [];
  if (!Array.isArray(raw)) throw new HttpError(400, `${field} must be a list of addresses`);
  const out = [...new Set(raw.map((a) => String(a ?? '').trim().toLowerCase()).filter(Boolean))];
  for (const a of out) if (!EMAIL_ADDRESS.test(a)) throw new HttpError(400, `"${a}" is not an email address`);
  if (out.length > max) throw new HttpError(400, `At most ${max} addresses in ${field}`);
  return out;
}

function headerOf(msg: Record<string, unknown>, name: string): string {
  const headers = ((msg.payload as GmailPart | undefined)?.headers ?? []) as Array<{ name: string; value: string }>;
  return headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? '';
}

function listRow(t: Record<string, unknown>) {
  const messages = (t.messages ?? []) as Array<Record<string, unknown>>;
  const first = messages[0] ?? {};
  const last = messages[messages.length - 1] ?? {};
  const labels = new Set(messages.flatMap((m) => (m.labelIds ?? []) as string[]));
  return {
    id: t.id,
    subject: headerOf(first, 'Subject') || '(no subject)',
    from: parseAddress(headerOf(last, 'From')),
    participants: [...new Set(messages.map((m) => parseAddress(headerOf(m, 'From')).name ?? parseAddress(headerOf(m, 'From')).address))].filter(Boolean),
    snippet: String(last.snippet ?? ''),
    date: last.internalDate ? new Date(Number(last.internalDate)).toISOString() : null,
    unread: labels.has('UNREAD'),
    starred: labels.has('STARRED'),
    message_count: messages.length,
    label_ids: [...labels],
  };
}

const SYSTEM_LABELS = ['INBOX', 'STARRED', 'SNOOZED', 'SENT', 'DRAFT', 'IMPORTANT', 'SPAM', 'TRASH'];

Deno.serve(withApiLogging('gmail-api', async (req) => {
  await bootstrapForFunction();
  if (req.method === 'OPTIONS') return new Response(null, { status: 200, headers: corsHeaders });
  const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const url = new URL(req.url);

  if (req.method === 'GET' && (url.searchParams.has('code') || url.searchParams.has('error'))) {
    const back = (msg: string) => Response.redirect(`${APP_URL()}/inbox?src=gmail&gmail=${encodeURIComponent(msg)}`, 302);
    const state = await verifyOAuthState(url.searchParams.get('state') ?? '');
    if (!state?.user_id || !state.workspace_id) return back('invalid_state');
    if (url.searchParams.has('error')) return back(url.searchParams.get('error') === 'access_denied' ? 'denied' : 'failed');
    try {
      const tok = await exchangeGoogleCode(url.searchParams.get('code') ?? '', REDIRECT_URI());
      if (!tok.refresh_token) return back('no_refresh_token');
      const granted = String(tok.scope ?? '').split(' ');
      if (!granted.some((s) => s.endsWith('/gmail.modify'))) return back('scope_missing');
      const who = await fetch(GOOGLE_USERINFO_URL, { headers: { Authorization: `Bearer ${tok.access_token}` } })
        .then((r) => r.json()).catch(() => ({})) as { email?: string; name?: string };
      if (!who.email) return back('no_email');
      const { data: acct, error } = await db.from('mail_accounts').upsert({
        user_id: state.user_id, workspace_id: state.workspace_id, provider: 'gmail',
        email: who.email.toLowerCase(), display_name: who.name ?? null, status: 'active',
        scopes: granted, last_error: null, updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id,provider,email' }).select('id').single();
      if (error || !acct) return back('save_failed');
      const { error: vaultErr } = await db.rpc('mail_account_store_refresh_token', { p_account_id: acct.id, p_token: tok.refresh_token });
      if (vaultErr) return back('save_failed');
      return back('connected');
    } catch {
      return back('failed');
    }
  }

  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  const auth = await authenticate(req, { requireUser: true });
  if (!auth.success || !auth.userId) return json({ error: auth.error || 'Unauthorized' }, 401);
  const userId = auth.userId;
  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const action = String(body.action ?? '');

  switch (action) {
    case 'status': {
      const workspaceId = String(body.workspace_id ?? '');
      if (!workspaceId || !(await userCanAccessWorkspace(db, userId, workspaceId))) throw new HttpError(404, 'Workspace not found');
      const { data, error } = await db.from('mail_accounts')
        .select('id, email, display_name, status, last_error, workspace_id')
        .eq('user_id', userId).neq('status', 'disconnected').order('created_at', { ascending: true });
      if (error) throw new HttpError(500, error.message);
      return json({ configured: !!googleClientId(), accounts: data ?? [] });
    }

    case 'connect': {
      const workspaceId = String(body.workspace_id ?? '');
      if (!workspaceId || !(await userCanAccessWorkspace(db, userId, workspaceId))) throw new HttpError(404, 'Workspace not found');
      if (!googleClientId()) throw new HttpError(503, 'Google is not configured on this platform.');
      const state = await signOAuthState({ user_id: userId, workspace_id: workspaceId });
      const hint = typeof body.login_hint === 'string' ? body.login_hint : undefined;
      return json({ auth_url: googleConsentUrl({ redirectUri: REDIRECT_URI(), scope: SCOPE, state, loginHint: hint }) });
    }

    case 'disconnect': {
      const account = await accountFor(db, userId, String(body.account_id ?? ''));
      const { data: refresh } = await db.rpc('mail_account_refresh_token', { p_account_id: account.id });
      if (refresh) await revokeGoogleToken(String(refresh));
      const { error } = await db.rpc('mail_account_forget_token', { p_account_id: account.id });
      if (error) throw new HttpError(500, `Could not disconnect: ${error.message}`);
      return json({ ok: true });
    }

    case 'labels': {
      const account = await accountFor(db, userId, String(body.account_id ?? ''));
      const token = await accessTokenFor(db, account);
      const list = await gmail(token, '/labels');
      const labels = (list.labels ?? []) as Array<{ id: string; name: string; type: string }>;
      const wanted = labels.filter((l) => l.type === 'user' || SYSTEM_LABELS.includes(l.id)).slice(0, 60);
      const detailed = await Promise.all(wanted.map((l) => gmail(token, `/labels/${encodeURIComponent(l.id)}`).catch(() => l)));
      return json({
        labels: detailed.map((l) => {
          const x = l as Record<string, unknown>;
          return {
            id: x.id, name: x.name, type: x.type,
            unread: Number(x.threadsUnread ?? 0), total: Number(x.threadsTotal ?? 0),
            color: (x.color as { backgroundColor?: string } | undefined)?.backgroundColor ?? null,
          };
        }),
      });
    }

    case 'threads': {
      const account = await accountFor(db, userId, String(body.account_id ?? ''));
      const token = await accessTokenFor(db, account);
      const qs = new URLSearchParams({ maxResults: String(PAGE_SIZE) });
      const labelId = typeof body.label_id === 'string' && body.label_id ? body.label_id : (body.q ? '' : 'INBOX');
      if (labelId) qs.append('labelIds', labelId);
      if (typeof body.q === 'string' && body.q.trim()) qs.set('q', body.q.trim().slice(0, 500));
      if (typeof body.page_token === 'string' && body.page_token) qs.set('pageToken', body.page_token);
      const list = await gmail(token, `/threads?${qs}`);
      const ids = ((list.threads ?? []) as Array<{ id: string }>).map((t) => t.id);
      const meta = '&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date';
      const threads = await Promise.all(ids.map((id) => gmail(token, `/threads/${id}?format=metadata${meta}`)));
      const { error: usedErr } = await db.from('mail_accounts').update({ last_used_at: new Date().toISOString() }).eq('id', account.id);
      if (usedErr) console.error('[gmail-api] last_used_at not stamped', account.id, usedErr);
      return json({ threads: threads.map(listRow), next_page_token: list.nextPageToken ?? null, estimate: list.resultSizeEstimate ?? null });
    }

    case 'thread': {
      const account = await accountFor(db, userId, String(body.account_id ?? ''));
      const token = await accessTokenFor(db, account);
      const threadId = String(body.thread_id ?? '');
      if (!/^[0-9a-f]+$/i.test(threadId)) throw new HttpError(400, 'thread_id is required');
      const t = await gmail(token, `/threads/${threadId}?format=full`);
      const messages = ((t.messages ?? []) as Array<Record<string, unknown>>).map((m) => {
        const parsed = parseGmailPayload(m.payload as GmailPart);
        const h = parsed.headers;
        return {
          id: m.id,
          label_ids: m.labelIds ?? [],
          date: m.internalDate ? new Date(Number(m.internalDate)).toISOString() : null,
          from: parseAddress(h.from),
          to: (h.to ?? '').split(',').map((a) => parseAddress(a).address).filter(Boolean),
          cc: (h.cc ?? '').split(',').map((a) => parseAddress(a).address).filter(Boolean),
          reply_to: parseAddress(h['reply-to']).address,
          subject: h.subject ?? '',
          message_id: h['message-id'] ?? null,
          text: parsed.text,
          html: parsed.html,
          attachments: parsed.attachments,
          snippet: m.snippet ?? '',
        };
      });
      if (body.mark_read === true && messages.some((m) => (m.label_ids as string[]).includes('UNREAD'))) {
        await gmail(token, `/threads/${threadId}/modify`, { method: 'POST', body: JSON.stringify({ removeLabelIds: ['UNREAD'] }) });
      }
      return json({ id: t.id, account_email: account.email, messages });
    }

    case 'attachment': {
      const account = await accountFor(db, userId, String(body.account_id ?? ''));
      const token = await accessTokenFor(db, account);
      const messageId = String(body.message_id ?? '');
      const attachmentId = String(body.attachment_id ?? '');
      if (!/^[0-9a-f]+$/i.test(messageId) || !attachmentId) throw new HttpError(400, 'message_id and attachment_id are required');
      const a = await gmail(token, `/messages/${messageId}/attachments/${encodeURIComponent(attachmentId)}`);
      const data = String(a.data ?? '').replace(/-/g, '+').replace(/_/g, '/');
      return json({ data_base64: data + '='.repeat((4 - (data.length % 4)) % 4), size: a.size ?? null });
    }

    case 'modify': {
      const account = await accountFor(db, userId, String(body.account_id ?? ''));
      const token = await accessTokenFor(db, account);
      const threadId = String(body.thread_id ?? '');
      if (!/^[0-9a-f]+$/i.test(threadId)) throw new HttpError(400, 'thread_id is required');
      const labelList = (v: unknown) => (Array.isArray(v) ? v.map(String).filter((x) => /^[A-Za-z0-9_-]{1,64}$/.test(x)).slice(0, 20) : []);
      if (body.trash === true) {
        await gmail(token, `/threads/${threadId}/trash`, { method: 'POST' });
        return json({ ok: true });
      }
      await gmail(token, `/threads/${threadId}/modify`, {
        method: 'POST',
        body: JSON.stringify({ addLabelIds: labelList(body.add), removeLabelIds: labelList(body.remove) }),
      });
      return json({ ok: true });
    }

    case 'send': {
      const account = await accountFor(db, userId, String(body.account_id ?? ''));
      const to = cleanAddresses(body.to, 'to');
      const cc = cleanAddresses(body.cc, 'cc');
      const bcc = cleanAddresses(body.bcc, 'bcc');
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
      if (totalBytes > SEND_LIMIT_BYTES) throw new HttpError(413, 'Attachments exceed 25 MB');

      const token = await accessTokenFor(db, account);
      let subject = String(body.subject ?? '').trim();
      let inReplyTo: string | null = null;
      let references: string | null = null;
      const threadId = typeof body.thread_id === 'string' && /^[0-9a-f]+$/i.test(body.thread_id) ? body.thread_id : null;
      if (threadId && typeof body.reply_to_message_id === 'string' && /^[0-9a-f]+$/i.test(body.reply_to_message_id)) {
        const orig = await gmail(token, `/messages/${body.reply_to_message_id}?format=metadata&metadataHeaders=Message-ID&metadataHeaders=References&metadataHeaders=Subject`);
        if (orig.threadId !== threadId) throw new HttpError(400, 'That message is not in this conversation');
        inReplyTo = headerOf(orig, 'Message-ID') || null;
        references = [headerOf(orig, 'References'), inReplyTo].filter(Boolean).join(' ') || null;
        const origSubject = headerOf(orig, 'Subject');
        if (!subject) subject = /^re:/i.test(origSubject) ? origSubject : `Re: ${origSubject}`;
      }
      if (!subject) throw new HttpError(400, 'A subject is required');

      const from = account.display_name ? `${account.display_name.replace(/["\\]/g, '')} <${account.email}>` : account.email;
      const raw = buildMimeMessage({
        from, to, cc, bcc, subject, text,
        html: hasEmailMarkup(text) ? renderEmailMarkup(text, escapeHtml) : null,
        inReplyTo, references, attachments,
      });
      const sent = await gmail(token, '/messages/send', {
        method: 'POST',
        body: JSON.stringify({ raw: base64ToBase64Url(utf8ToBase64(raw)), ...(threadId ? { threadId } : {}) }),
      });
      return json({ ok: true, message_id: sent.id, thread_id: sent.threadId });
    }

    default:
      throw new HttpError(400, `Unknown action: ${action}`);
  }
}));
