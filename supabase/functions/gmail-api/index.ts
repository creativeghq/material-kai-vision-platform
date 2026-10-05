/** gmail-api — a person's own Gmail, live: connect, browse, read, reply, label. Gmail stays the source of truth. */
import { createClient } from '@supabase/supabase-js';
import { withApiLogging, HttpError } from '../_shared/api-logger.ts';
import { authenticate, userCanAccessWorkspace } from '../_shared/auth.ts';
import { bootstrapForFunction } from '../_shared/secrets-bootstrap.ts';
import { jsonResponse as json } from '../_shared/http.ts';
import { corsHeaders } from '../_shared/cors.ts';
import {
  exchangeGoogleCode, googleClientId, googleConsentUrl, GOOGLE_USERINFO_URL, revokeGoogleToken,
  signOAuthState, verifyOAuthState,
} from '../_shared/google-oauth.ts';
import { parseAddress, parseGmailPayload, type GmailPart } from '../_shared/mail-mime.ts';
import {
  EMAIL_ADDRESS, gmailAccessToken, gmailFetch, gmailHeader, prepareGmailSend, sendPreparedGmail,
} from '../_shared/gmail-client.ts';

// deno-lint-ignore no-explicit-any
type Db = any;

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const APP_URL = () => (Deno.env.get('PUBLIC_APP_URL') || 'https://app.materialshub.gr').replace(/\/+$/, '');
const REDIRECT_URI = () => `${SUPABASE_URL}/functions/v1/gmail-api`;
const SCOPE = 'https://www.googleapis.com/auth/gmail.modify https://www.googleapis.com/auth/gmail.send openid email profile';
const SCHEDULE_LIMIT_BYTES = 10 * 1024 * 1024;
const PAGE_SIZE = 25;

interface Account { id: string; user_id: string; workspace_id: string; email: string; display_name: string | null; status: string; is_shared: boolean }

/** The caller's own mailbox, or a SHARED one they were let into. `ownerOnly` for settings and disconnect. */
async function accountFor(db: Db, userId: string, accountId: string, ownerOnly = false): Promise<Account> {
  const { data, error } = await db.from('mail_accounts')
    .select('id, user_id, workspace_id, email, display_name, status, is_shared').eq('id', accountId).maybeSingle();
  if (error) throw new HttpError(500, `Could not read the mailbox: ${error.message}`);
  if (!data || data.status === 'disconnected') throw new HttpError(404, 'Mailbox not found');
  if (data.user_id === userId) return data as Account;
  if (!ownerOnly && data.is_shared) {
    const { data: member, error: mErr } = await db.from('mail_account_members')
      .select('user_id').eq('account_id', accountId).eq('user_id', userId).maybeSingle();
    if (mErr) throw new HttpError(500, `Could not read the mailbox members: ${mErr.message}`);
    if (member) return data as Account;
  }
  throw new HttpError(404, 'Mailbox not found');
}

const GMAIL_ID = /^[0-9a-f]{6,32}$/i;

async function upsertIndex(db: Db, account: Account, threadId: string, patch: Record<string, unknown>) {
  const { data, error } = await db.from('mail_thread_index').upsert({
    account_id: account.id, gmail_thread_id: threadId, workspace_id: account.workspace_id,
    ...patch, updated_at: new Date().toISOString(),
  }, { onConflict: 'account_id,gmail_thread_id' }).select('*').single();
  if (error) throw new HttpError(500, `Could not save that on the conversation: ${error.message}`);
  return data;
}

async function indexFacts(db: Db, accountId: string, threadIds: string[]) {
  if (!threadIds.length) return new Map<string, Record<string, unknown>>();
  const { data, error } = await db.from('mail_thread_index')
    .select('gmail_thread_id, contact_id, company_id, assignee_user_id, snoozed_until, crm_contacts(name)')
    .eq('account_id', accountId).in('gmail_thread_id', threadIds);
  if (error) throw new HttpError(500, `Could not read conversation facts: ${error.message}`);
  return new Map<string, Record<string, unknown>>((data ?? []).map((r: Record<string, unknown>) => [String(r.gmail_thread_id), r]));
}

const accessTokenFor = (db: Db, account: Account) => gmailAccessToken(db, account);
const gmail = gmailFetch;
const headerOf = gmailHeader;

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
      const { data: memberOf, error: memErr } = await db.from('mail_account_members').select('account_id').eq('user_id', userId);
      if (memErr) throw new HttpError(500, memErr.message);
      const sharedIds = (memberOf ?? []).map((m: { account_id: string }) => m.account_id);
      let q = db.from('mail_accounts')
        .select('id, user_id, email, display_name, status, last_error, workspace_id, is_shared')
        .neq('status', 'disconnected').order('created_at', { ascending: true });
      q = sharedIds.length
        ? q.or(`user_id.eq.${userId},and(is_shared.eq.true,id.in.(${sharedIds.join(',')}))`)
        : q.eq('user_id', userId);
      const { data, error } = await q;
      if (error) throw new HttpError(500, error.message);
      const accounts = (data ?? []).map((a: Record<string, unknown>) => {
        const { user_id: ownerId, ...rest } = a;
        return { ...rest, is_owner: ownerId === userId };
      });
      return json({ configured: !!googleClientId(), accounts });
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
      const account = await accountFor(db, userId, String(body.account_id ?? ''), true);
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
      const facts = await indexFacts(db, account.id, ids);
      const rows = threads.map((t) => {
        const f = facts.get(String(t.id));
        return {
          ...listRow(t),
          contact_id: f?.contact_id ?? null,
          contact_name: (f?.crm_contacts as { name?: string } | null)?.name ?? null,
          assignee_user_id: f?.assignee_user_id ?? null,
          snoozed_until: f?.snoozed_until ?? null,
        };
      });
      return json({ threads: rows, next_page_token: list.nextPageToken ?? null, estimate: list.resultSizeEstimate ?? null });
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
      const sent = await sendPreparedGmail(db, account, prepareGmailSend(body));
      return json({ ok: true, ...sent });
    }

    case 'schedule': {
      const account = await accountFor(db, userId, String(body.account_id ?? ''));
      const prepared = prepareGmailSend(body, SCHEDULE_LIMIT_BYTES);
      const sendAt = new Date(String(body.send_at ?? ''));
      const now = Date.now();
      if (Number.isNaN(sendAt.getTime()) || sendAt.getTime() < now + 60_000 || sendAt.getTime() > now + 366 * 86_400_000) {
        throw new HttpError(400, 'Pick a send time between a minute and a year from now');
      }
      const { data, error } = await db.from('mail_scheduled_sends').insert({
        user_id: userId, workspace_id: account.workspace_id, kind: 'gmail', account_id: account.id,
        payload: prepared, send_at: sendAt.toISOString(),
        summary: (prepared.subject || 'Reply').slice(0, 200), recipients: prepared.to.join(', ').slice(0, 300),
      }).select('id, send_at').single();
      if (error) throw new HttpError(500, `Could not schedule: ${error.message}`);
      return json({ ok: true, scheduled: data });
    }

    case 'snoozed': {
      const account = await accountFor(db, userId, String(body.account_id ?? ''));
      const token = await accessTokenFor(db, account);
      const { data, error } = await db.from('mail_thread_index').select('gmail_thread_id, snoozed_until')
        .eq('account_id', account.id).gt('snoozed_until', new Date().toISOString()).order('snoozed_until').limit(PAGE_SIZE);
      if (error) throw new HttpError(500, error.message);
      const ids = (data ?? []).map((r: { gmail_thread_id: string }) => r.gmail_thread_id);
      const meta = '&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date';
      const threads = await Promise.all(ids.map((id: string) => gmail(token, `/threads/${id}?format=metadata${meta}`).catch(() => null)));
      const facts = await indexFacts(db, account.id, ids);
      return json({
        threads: threads.filter(Boolean).map((t) => {
          const f = facts.get(String((t as Record<string, unknown>).id));
          return { ...listRow(t as Record<string, unknown>), contact_id: f?.contact_id ?? null, contact_name: (f?.crm_contacts as { name?: string } | null)?.name ?? null, assignee_user_id: f?.assignee_user_id ?? null, snoozed_until: f?.snoozed_until ?? null };
        }),
        next_page_token: null, estimate: ids.length,
      });
    }

    case 'thread_meta': {
      const account = await accountFor(db, userId, String(body.account_id ?? ''));
      const threadId = String(body.thread_id ?? '');
      if (!GMAIL_ID.test(threadId)) throw new HttpError(400, 'thread_id is required');
      const sender = String(body.sender ?? '').trim().toLowerCase();
      const { data: row, error } = await db.from('mail_thread_index')
        .select('contact_id, company_id, assignee_user_id, snoozed_until').eq('account_id', account.id).eq('gmail_thread_id', threadId).maybeSingle();
      if (error) throw new HttpError(500, error.message);
      let contactId = row?.contact_id ?? null;
      let suggested = false;
      if (!contactId && EMAIL_ADDRESS.test(sender)) {
        const { data: match, error: mErr } = await db.from('crm_contacts').select('id')
          .eq('workspace_id', account.workspace_id).ilike('email', sender.replace(/[%_\\]/g, '\\$&')).limit(1).maybeSingle();
        if (mErr) throw new HttpError(500, mErr.message);
        if (match) { contactId = match.id; suggested = true; }
      }
      let contact = null;
      if (contactId) {
        const { data: c, error: cErr } = await db.from('crm_contacts')
          .select('id, name, email, phone, position, crm_company_contacts(company:crm_companies(id, name))').eq('id', contactId).maybeSingle();
        if (cErr) throw new HttpError(500, cErr.message);
        if (c) {
          type Co = { id: string; name: string };
          const links = (c.crm_company_contacts ?? []) as unknown as Array<{ company: Co | Co[] | null }>;
          const companies = links.flatMap((l) => (Array.isArray(l.company) ? l.company : l.company ? [l.company] : []));
          contact = { id: c.id, name: c.name, email: c.email, phone: c.phone, position: c.position, companies };
        }
      }
      let members: Array<{ user_id: string; name: string }> = [];
      if (account.is_shared) {
        const { data: mem, error: memErr } = await db.from('mail_account_members').select('user_id').eq('account_id', account.id);
        if (memErr) throw new HttpError(500, memErr.message);
        const ids = [account.user_id, ...(mem ?? []).map((m: { user_id: string }) => m.user_id)];
        const { data: profs } = await db.from('user_profiles').select('user_id, full_name, email').in('user_id', ids);
        const byId = new Map((profs ?? []).map((p: { user_id: string; full_name: string | null; email: string | null }) => [p.user_id, p.full_name || p.email || p.user_id]));
        members = ids.map((id) => ({ user_id: id, name: String(byId.get(id) ?? id) }));
      }
      return json({
        contact, contact_linked: !!row?.contact_id && !suggested, contact_suggested: suggested,
        assignee_user_id: row?.assignee_user_id ?? null, snoozed_until: row?.snoozed_until ?? null,
        shared: account.is_shared, members,
      });
    }

    case 'link_contact': {
      const account = await accountFor(db, userId, String(body.account_id ?? ''));
      const threadId = String(body.thread_id ?? '');
      if (!GMAIL_ID.test(threadId)) throw new HttpError(400, 'thread_id is required');
      const contactId = body.contact_id ? String(body.contact_id) : null;
      let companyId: string | null = null;
      if (contactId) {
        const { data: c, error } = await db.from('crm_contacts').select('id, workspace_id').eq('id', contactId).maybeSingle();
        if (error) throw new HttpError(500, error.message);
        if (!c || c.workspace_id !== account.workspace_id) throw new HttpError(404, 'Contact not found in this workspace');
        const { data: link } = await db.from('crm_company_contacts').select('company_id').eq('contact_id', contactId).limit(1).maybeSingle();
        companyId = link?.company_id ?? null;
      }
      await upsertIndex(db, account, threadId, {
        contact_id: contactId, company_id: companyId,
        ...(typeof body.subject === 'string' ? { subject: body.subject.slice(0, 300) } : {}),
        ...(typeof body.sender === 'string' ? { from_address: body.sender.slice(0, 300).toLowerCase() } : {}),
      });
      return json({ ok: true });
    }

    case 'create_contact': {
      const account = await accountFor(db, userId, String(body.account_id ?? ''));
      const threadId = String(body.thread_id ?? '');
      if (!GMAIL_ID.test(threadId)) throw new HttpError(400, 'thread_id is required');
      const email = String(body.email ?? '').trim().toLowerCase();
      const name = String(body.name ?? '').trim().slice(0, 200) || email;
      if (!EMAIL_ADDRESS.test(email)) throw new HttpError(400, 'A valid email is required');
      if (!(await userCanAccessWorkspace(db, userId, account.workspace_id))) throw new HttpError(404, 'Workspace not found');
      const { data: existing, error: exErr } = await db.from('crm_contacts').select('id')
        .eq('workspace_id', account.workspace_id).ilike('email', email.replace(/[%_\\]/g, '\\$&')).limit(1).maybeSingle();
      if (exErr) throw new HttpError(500, exErr.message);
      let contactId = existing?.id ?? null;
      const created = !contactId;
      if (!contactId) {
        const { data: row, error } = await db.from('crm_contacts').insert({
          workspace_id: account.workspace_id, name, email, created_by: userId, lead_source: 'email', lead_status: 'new',
        }).select('id').single();
        if (error) throw new HttpError(500, `Could not create the contact: ${error.message}`);
        contactId = row.id;
      }
      await upsertIndex(db, account, threadId, { contact_id: contactId, from_address: email });
      return json({ ok: true, contact_id: contactId, created });
    }

    case 'snooze': {
      const account = await accountFor(db, userId, String(body.account_id ?? ''));
      const threadId = String(body.thread_id ?? '');
      if (!GMAIL_ID.test(threadId)) throw new HttpError(400, 'thread_id is required');
      const token = await accessTokenFor(db, account);
      if (body.until == null) {
        await gmail(token, `/threads/${threadId}/modify`, { method: 'POST', body: JSON.stringify({ addLabelIds: ['INBOX'] }) });
        await upsertIndex(db, account, threadId, { snoozed_until: null, snoozed_by: null });
        return json({ ok: true, snoozed_until: null });
      }
      const until = new Date(String(body.until));
      const now = Date.now();
      if (Number.isNaN(until.getTime()) || until.getTime() < now + 60_000 || until.getTime() > now + 366 * 86_400_000) {
        throw new HttpError(400, 'Pick a time between a minute and a year from now');
      }
      await gmail(token, `/threads/${threadId}/modify`, { method: 'POST', body: JSON.stringify({ removeLabelIds: ['INBOX'] }) });
      await upsertIndex(db, account, threadId, {
        snoozed_until: until.toISOString(), snoozed_by: userId,
        ...(typeof body.subject === 'string' ? { subject: body.subject.slice(0, 300) } : {}),
      });
      return json({ ok: true, snoozed_until: until.toISOString() });
    }

    case 'assign': {
      const account = await accountFor(db, userId, String(body.account_id ?? ''));
      if (!account.is_shared) throw new HttpError(400, 'Only a shared mailbox has assignees');
      const threadId = String(body.thread_id ?? '');
      if (!GMAIL_ID.test(threadId)) throw new HttpError(400, 'thread_id is required');
      const assignee = body.user_id ? String(body.user_id) : null;
      if (assignee && assignee !== account.user_id) {
        const { data: m, error } = await db.from('mail_account_members').select('user_id').eq('account_id', account.id).eq('user_id', assignee).maybeSingle();
        if (error) throw new HttpError(500, error.message);
        if (!m) throw new HttpError(400, 'That person does not have this mailbox');
      }
      await upsertIndex(db, account, threadId, { assignee_user_id: assignee });
      return json({ ok: true });
    }

    case 'members': {
      const account = await accountFor(db, userId, String(body.account_id ?? ''), true);
      const { data, error } = await db.from('mail_account_members').select('user_id').eq('account_id', account.id);
      if (error) throw new HttpError(500, error.message);
      return json({ is_shared: account.is_shared, member_ids: (data ?? []).map((m: { user_id: string }) => m.user_id) });
    }

    case 'share': {
      const account = await accountFor(db, userId, String(body.account_id ?? ''), true);
      const isShared = body.is_shared === true;
      const wanted = Array.isArray(body.member_ids) ? [...new Set(body.member_ids.map(String))].filter((id) => id !== userId).slice(0, 50) : [];
      if (isShared && wanted.length) {
        const { data: mem, error } = await db.from('workspace_members').select('user_id, status')
          .eq('workspace_id', account.workspace_id).in('user_id', wanted);
        if (error) throw new HttpError(500, error.message);
        const active = new Set((mem ?? []).filter((m: { status: string }) => m.status === 'active').map((m: { user_id: string }) => m.user_id));
        const outsider = wanted.find((id) => !active.has(id));
        if (outsider) throw new HttpError(400, 'Everyone you share with must be an active member of this workspace');
      }
      const { error: upErr } = await db.from('mail_accounts').update({ is_shared: isShared, updated_at: new Date().toISOString() }).eq('id', account.id);
      if (upErr) throw new HttpError(500, upErr.message);
      const { error: delErr } = await db.from('mail_account_members').delete().eq('account_id', account.id);
      if (delErr) throw new HttpError(500, delErr.message);
      if (isShared && wanted.length) {
        const { error: insErr } = await db.from('mail_account_members')
          .insert(wanted.map((id) => ({ account_id: account.id, user_id: id, added_by: userId })));
        if (insErr) throw new HttpError(500, insErr.message);
      }
      return json({ ok: true, is_shared: isShared, member_ids: isShared ? wanted : [] });
    }

    default:
      throw new HttpError(400, `Unknown action: ${action}`);
  }
}));
