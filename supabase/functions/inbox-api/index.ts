// inbox-api — Issue #209 Multi-Tenant Inbox (P1: schema + directional ACL + channel send-router).
//
// One action-discriminated edge function (merge rule). Two auth branches in one function
// (precedent: moodboard-sheet-share resolves both a JWT and a token path):
//   • JWT actions  — authenticated member/operator/customer-account flows.
//   • Token actions — service-role, unauthenticated; a tokenized customer with scoped
//                     read/reply to ONE thread, plus the token_claim conversion handshake.
//
// All directional ACL walls (operator↔everyone, dealer↔customer, sales jump-in, etc.) are
// enforced HERE at thread-create / participant-add time — never at read time. RLS on the
// tables only gates direct client reads/realtime to "active participant OR platform operator".
//
// Channel send-router: an `internal` thread stores only; a `whatsapp` thread stores AND
// relays via Zernio (Meta 24h service window applies — freeform in-window).

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { corsHeaders } from '../_shared/cors.ts';
import { withApiLogging, HttpError } from '../_shared/api-logger.ts';
import { authenticate } from '../_shared/auth.ts';
import { emitFlowEvent } from '../_shared/flow-events.ts';
import { sendWhatsAppReply } from '../_shared/zernio.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

const ATTACHMENT_BUCKET = 'generation-images';

type Json = Record<string, unknown>;

interface Attachment {
  storage_bucket: string;
  storage_object_path: string;
  name?: string;
  content_type?: string;
  size?: number;
}

// ──────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────

function json(body: Json, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

const ACTIVE_MEMBER = (s: string | null | undefined) => !s || s === 'active';
const BUSINESS_ROLES = new Set(['owner', 'admin', 'member', 'staff', 'sales']);

/** Global platform operator: admin/super_admin global role OR owner/admin of the root workspace. */
async function isOperator(db: SupabaseClient, userId: string): Promise<boolean> {
  const { data: prof } = await db
    .from('user_profiles')
    .select('roles!user_profiles_role_id_fkey(name)')
    .eq('user_id', userId)
    .maybeSingle();
  const globalRole = (prof as { roles?: { name?: string } } | null)?.roles?.name;
  if (globalRole && ['admin', 'super_admin'].includes(globalRole)) return true;

  const { data: rootMem } = await db
    .from('workspace_members')
    .select('role, workspaces!inner(is_root)')
    .eq('user_id', userId)
    .eq('workspaces.is_root', true)
    .maybeSingle();
  const r = rootMem as { role?: string } | null;
  return !!r && (r.role === 'owner' || r.role === 'admin');
}

/** The caller's role string in a workspace, or null when not an active member. */
async function callerRoleInWorkspace(
  db: SupabaseClient,
  userId: string,
  workspaceId: string,
): Promise<string | null> {
  const { data } = await db
    .from('workspace_members')
    .select('role, status')
    .eq('user_id', userId)
    .eq('workspace_id', workspaceId)
    .maybeSingle();
  const m = data as { role?: string; status?: string } | null;
  if (!m || !ACTIVE_MEMBER(m.status)) return null;
  return m.role ?? null;
}

async function parentWorkspaceId(db: SupabaseClient, workspaceId: string): Promise<string | null> {
  const { data } = await db
    .from('workspaces')
    .select('parent_workspace_id')
    .eq('id', workspaceId)
    .maybeSingle();
  return (data as { parent_workspace_id?: string } | null)?.parent_workspace_id ?? null;
}

/** The caller's active participant row in a thread (any participant type), or null. */
async function callerParticipant(db: SupabaseClient, threadId: string, userId: string) {
  const { data } = await db
    .from('inbox_participants')
    .select('id, participant_type, thread_role, status')
    .eq('thread_id', threadId)
    .eq('user_id', userId)
    .eq('status', 'active')
    .maybeSingle();
  return data as
    | { id: string; participant_type: string; thread_role: string; status: string }
    | null;
}

async function getThreadOrThrow(db: SupabaseClient, threadId: string) {
  const { data } = await db
    .from('inbox_threads')
    .select('*')
    .eq('id', threadId)
    .maybeSingle();
  if (!data) throw new HttpError(404, 'Thread not found');
  return data as Record<string, unknown>;
}

/**
 * Directional add-rule (the heart of #209 §4). May `userId` (acting in `thread`) add `target`?
 * `callerRole` is the caller's role in thread.workspace_id (null if not a member).
 */
async function assertCanAddParticipant(
  db: SupabaseClient,
  opts: {
    operator: boolean;
    callerRole: string | null;
    thread: Record<string, unknown>;
    target: { type: string; user_id?: string; contact_id?: string; agent_id?: string };
  },
): Promise<void> {
  const { operator, callerRole, thread, target } = opts;
  if (operator) return; // operator ↔ everyone

  const wsId = String(thread.workspace_id);
  const threadType = String(thread.thread_type);

  if (!callerRole) throw new HttpError(403, 'You are not a member of this thread\'s workspace');

  // Agent participants are inert until Phase 2.
  if (target.type === 'agent') {
    throw new HttpError(400, 'Agent takeover is a Phase 2 capability');
  }

  // A client (converted/end-user customer) may only add their dealer/sales team — never
  // other customers, never upstream.
  if (callerRole === 'client') {
    if (target.type !== 'member' || !target.user_id) {
      throw new HttpError(403, 'Customers can only message their dealer/sales team');
    }
    const role = await callerRoleInWorkspace(db, target.user_id, wsId);
    if (!role || role === 'client') {
      throw new HttpError(403, 'Customers can only message members of their own dealer workspace');
    }
    return;
  }

  // Business member (owner/admin/member/staff/sales).
  if (!BUSINESS_ROLES.has(callerRole)) {
    throw new HttpError(403, 'Insufficient role to add participants');
  }

  if (target.type === 'member') {
    if (!target.user_id) throw new HttpError(400, 'member participant requires user_id');
    // Own-workspace member …
    const inWs = await callerRoleInWorkspace(db, target.user_id, wsId);
    if (inWs) return;
    // … or, on an upstream thread, a member of the parent (operator/parent) workspace.
    if (threadType === 'upstream') {
      const parent = await parentWorkspaceId(db, wsId);
      if (parent) {
        const inParent = await callerRoleInWorkspace(db, target.user_id, parent);
        if (inParent) return;
      }
    }
    throw new HttpError(403, 'Target user is not reachable from this thread');
  }

  if (target.type === 'customer') {
    if (threadType !== 'customer') {
      throw new HttpError(400, 'customer participants are only allowed on customer threads');
    }
    if (!target.contact_id) throw new HttpError(400, 'customer participant requires contact_id');
    const { data: contact } = await db
      .from('crm_contacts')
      .select('workspace_id')
      .eq('id', target.contact_id)
      .maybeSingle();
    const ownerWs = (contact as { workspace_id?: string } | null)?.workspace_id;
    // "A dealer with their customers, not their customers with other dealers."
    if (!ownerWs || ownerWs !== wsId) {
      throw new HttpError(403, 'That customer belongs to a different workspace');
    }
    return;
  }

  throw new HttpError(400, `Unknown participant type: ${target.type}`);
}

/** Upload a base64 attachment to the private inbox prefix; returns the stored reference. */
async function uploadAttachment(
  db: SupabaseClient,
  threadId: string,
  att: { filename?: string; content_type?: string; data_base64?: string } & Partial<Attachment>,
): Promise<Attachment> {
  // Already-stored reference passes through untouched.
  if (att.storage_object_path) {
    return {
      storage_bucket: att.storage_bucket || ATTACHMENT_BUCKET,
      storage_object_path: att.storage_object_path,
      name: att.name || att.filename,
      content_type: att.content_type,
      size: att.size,
    };
  }
  if (!att.data_base64) throw new HttpError(400, 'attachment requires storage_object_path or data_base64');
  const bytes = Uint8Array.from(atob(att.data_base64), (c) => c.charCodeAt(0));
  const safeName = (att.filename || 'file').replace(/[^a-zA-Z0-9._-]/g, '_');
  const path = `inbox/${threadId}/${crypto.randomUUID()}-${safeName}`;
  const { error } = await db.storage
    .from(ATTACHMENT_BUCKET)
    .upload(path, bytes, { contentType: att.content_type || 'application/octet-stream', upsert: false });
  if (error) throw new HttpError(500, `Attachment upload failed: ${error.message}`);
  return {
    storage_bucket: ATTACHMENT_BUCKET,
    storage_object_path: path,
    name: att.filename,
    content_type: att.content_type,
    size: bytes.byteLength,
  };
}

async function normalizeAttachments(
  db: SupabaseClient,
  threadId: string,
  raw: unknown,
): Promise<Attachment[]> {
  if (!Array.isArray(raw) || raw.length === 0) return [];
  const out: Attachment[] = [];
  for (const a of raw) out.push(await uploadAttachment(db, threadId, a as never));
  return out;
}

/** Persist a message, bump the thread, fan out the channel relay + the in-app bell. */
async function insertMessageAndNotify(
  db: SupabaseClient,
  opts: {
    thread: Record<string, unknown>;
    senderParticipantId: string | null;
    body: string | null;
    attachments: Attachment[];
    messageType: 'text' | 'system' | 'agent' | 'note';
    senderUserId?: string | null;
    senderLabel?: string;
  },
): Promise<Record<string, unknown>> {
  const { thread, senderParticipantId, body, attachments, messageType } = opts;
  const threadId = String(thread.id);

  const { data: msg, error } = await db
    .from('inbox_messages')
    .insert({
      thread_id: threadId,
      sender_participant_id: senderParticipantId,
      body,
      attachments,
      message_type: messageType,
    })
    .select('*')
    .single();
  if (error) throw new HttpError(500, `Failed to store message: ${error.message}`);

  await db
    .from('inbox_threads')
    .update({ last_message_at: new Date().toISOString(), status: 'open' })
    .eq('id', threadId);

  // Channel relay (notes never leave the inbox; system/agent handled elsewhere).
  if (thread.channel === 'whatsapp' && messageType === 'text' && body) {
    const meta = (thread.metadata as Json) || {};
    const accountId = String(meta.zernio_account_id || '');
    const conversationId = String(meta.zernio_conversation_id || '');
    if (accountId && conversationId) {
      const res = await sendWhatsAppReply({
        accountId,
        conversationId,
        message: body,
        attachmentUrl: undefined,
      });
      await db
        .from('inbox_messages')
        .update({ metadata: { channel: 'whatsapp', relay: res } })
        .eq('id', (msg as { id: string }).id);
    }
  }

  // In-app bell to every OTHER active participant that has an account (members + converted
  // customers). Notes go to members only. Pure token customers (no user_id) get no bell.
  if (messageType !== 'system') {
    const { data: parts } = await db
      .from('inbox_participants')
      .select('user_id, participant_type')
      .eq('thread_id', threadId)
      .eq('status', 'active')
      .not('user_id', 'is', null);
    const preview = (body || '[attachment]').slice(0, 200);
    const subject = (thread.subject as string) || 'New message';
    for (const p of (parts || []) as Array<{ user_id: string; participant_type: string }>) {
      if (p.user_id === opts.senderUserId) continue;
      if (messageType === 'note' && p.participant_type !== 'member') continue;
      await emitFlowEvent('inbox.message_received', {
        user_id: p.user_id,
        type: 'inbox_message',
        title: `${opts.senderLabel || 'New message'} · ${subject}`,
        body: preview,
        action_url: `/inbox?thread=${threadId}`,
        thread_id: threadId,
      }).catch(() => {});
    }
  }

  return msg as Record<string, unknown>;
}

// ──────────────────────────────────────────────────────────────────────────
// JWT actions
// ──────────────────────────────────────────────────────────────────────────

async function handleJwtAction(
  db: SupabaseClient,
  userId: string,
  action: string,
  payload: Json,
): Promise<Response> {
  const operator = await isOperator(db, userId);

  switch (action) {
    case 'create_thread': {
      const threadType = String(payload.thread_type || 'internal');
      const channel = String(payload.channel || 'internal');
      const workspaceId = String(payload.workspace_id || '');
      if (!workspaceId) throw new HttpError(400, 'workspace_id is required');
      if (!['internal', 'customer', 'upstream'].includes(threadType)) {
        throw new HttpError(400, 'invalid thread_type');
      }

      const callerRole = await callerRoleInWorkspace(db, userId, workspaceId);
      if (!operator && !callerRole) {
        throw new HttpError(403, 'You are not a member of that workspace');
      }

      const { data: thread, error } = await db
        .from('inbox_threads')
        .insert({
          workspace_id: workspaceId,
          thread_type: threadType,
          channel,
          subject: payload.subject ?? null,
          created_by: userId,
          metadata: payload.metadata ?? {},
        })
        .select('*')
        .single();
      if (error) throw new HttpError(500, `Failed to create thread: ${error.message}`);

      // Creator becomes the owner participant. A client-role creator is a customer participant.
      const creatorIsCustomer = callerRole === 'client';
      let creatorContactId: string | null = null;
      if (creatorIsCustomer) {
        const { data: c } = await db
          .from('crm_contacts')
          .select('id')
          .eq('user_id', userId)
          .eq('workspace_id', workspaceId)
          .maybeSingle();
        creatorContactId = (c as { id?: string } | null)?.id ?? null;
      }
      await db.from('inbox_participants').insert({
        thread_id: (thread as { id: string }).id,
        participant_type: creatorIsCustomer ? 'customer' : 'member',
        user_id: userId,
        contact_id: creatorContactId,
        workspace_id: creatorIsCustomer ? null : workspaceId,
        thread_role: 'owner',
        added_by: userId,
      });

      // Optional initial participants.
      const requested = Array.isArray(payload.participants) ? payload.participants : [];
      for (const t of requested as Array<Json>) {
        const target = {
          type: String(t.type),
          user_id: t.user_id ? String(t.user_id) : undefined,
          contact_id: t.contact_id ? String(t.contact_id) : undefined,
          agent_id: t.agent_id ? String(t.agent_id) : undefined,
        };
        await assertCanAddParticipant(db, { operator, callerRole, thread: thread as Json, target });
        const ws = target.type === 'member'
          ? (await callerRoleInWorkspace(db, target.user_id!, workspaceId) ? workspaceId : null)
          : null;
        const { data: addedP } = await db.from('inbox_participants').insert({
          thread_id: (thread as { id: string }).id,
          participant_type: target.type,
          user_id: target.user_id ?? null,
          contact_id: target.contact_id ?? null,
          agent_id: target.agent_id ?? null,
          workspace_id: ws,
          thread_role: 'participant',
          added_by: userId,
        }).select('user_id').single();
        const addedUser = (addedP as { user_id?: string } | null)?.user_id;
        if (addedUser) {
          await emitFlowEvent('inbox.thread_assigned', {
            user_id: addedUser,
            type: 'inbox_assigned',
            title: 'You were added to a conversation',
            body: (thread as { subject?: string }).subject || 'New conversation',
            action_url: `/inbox?thread=${(thread as { id: string }).id}`,
            thread_id: (thread as { id: string }).id,
          }).catch(() => {});
        }
      }

      return json({ thread });
    }

    case 'add_participant': {
      const threadId = String(payload.thread_id || '');
      if (!threadId) throw new HttpError(400, 'thread_id is required');
      const thread = await getThreadOrThrow(db, threadId);
      const me = await callerParticipant(db, threadId, userId);
      if (!operator && (!me || me.participant_type !== 'member')) {
        throw new HttpError(403, 'Only thread members may add participants');
      }
      const callerRole = await callerRoleInWorkspace(db, userId, String(thread.workspace_id));
      const target = {
        type: String(payload.type),
        user_id: payload.user_id ? String(payload.user_id) : undefined,
        contact_id: payload.contact_id ? String(payload.contact_id) : undefined,
        agent_id: payload.agent_id ? String(payload.agent_id) : undefined,
      };
      await assertCanAddParticipant(db, { operator, callerRole, thread, target });
      const ws = target.type === 'member' && target.user_id
        ? (await callerRoleInWorkspace(db, target.user_id, String(thread.workspace_id)) ? String(thread.workspace_id) : null)
        : null;
      const { data: p, error } = await db.from('inbox_participants').insert({
        thread_id: threadId,
        participant_type: target.type,
        user_id: target.user_id ?? null,
        contact_id: target.contact_id ?? null,
        agent_id: target.agent_id ?? null,
        workspace_id: ws,
        thread_role: String(payload.thread_role || 'participant'),
        added_by: userId,
      }).select('*').single();
      if (error) throw new HttpError(409, `Failed to add participant: ${error.message}`);
      if (target.user_id) {
        await emitFlowEvent('inbox.thread_assigned', {
          user_id: target.user_id,
          type: 'inbox_assigned',
          title: 'You were added to a conversation',
          body: (thread.subject as string) || 'New conversation',
          action_url: `/inbox?thread=${threadId}`,
          thread_id: threadId,
        }).catch(() => {});
      }
      return json({ participant: p });
    }

    case 'remove_participant': {
      const threadId = String(payload.thread_id || '');
      const participantId = String(payload.participant_id || '');
      if (!threadId || !participantId) throw new HttpError(400, 'thread_id and participant_id are required');
      const me = await callerParticipant(db, threadId, userId);
      if (!operator && (!me || me.participant_type !== 'member')) {
        throw new HttpError(403, 'Only thread members may remove participants');
      }
      const { error } = await db
        .from('inbox_participants')
        .update({ status: 'removed' })
        .eq('id', participantId)
        .eq('thread_id', threadId);
      if (error) throw new HttpError(500, error.message);
      return json({ ok: true });
    }

    case 'send_message': {
      const threadId = String(payload.thread_id || '');
      if (!threadId) throw new HttpError(400, 'thread_id is required');
      const thread = await getThreadOrThrow(db, threadId);
      const me = await callerParticipant(db, threadId, userId);
      if (!operator && !me) throw new HttpError(403, 'You are not a participant of this thread');
      const messageType = String(payload.message_type || 'text') as 'text' | 'note';
      if (messageType === 'note' && me && me.participant_type !== 'member') {
        throw new HttpError(403, 'Only members may leave private notes');
      }
      const body = payload.body != null ? String(payload.body) : null;
      const attachments = await normalizeAttachments(db, threadId, payload.attachments);
      if (!body && attachments.length === 0) throw new HttpError(400, 'message body or attachment required');
      const msg = await insertMessageAndNotify(db, {
        thread,
        senderParticipantId: me?.id ?? null,
        body,
        attachments,
        messageType: messageType === 'note' ? 'note' : 'text',
        senderUserId: userId,
        senderLabel: 'New message',
      });
      // Mark the sender as caught up.
      if (me) await db.from('inbox_participants').update({ last_read_at: new Date().toISOString() }).eq('id', me.id);
      return json({ message: msg });
    }

    case 'mark_read': {
      const threadId = String(payload.thread_id || '');
      if (!threadId) throw new HttpError(400, 'thread_id is required');
      const me = await callerParticipant(db, threadId, userId);
      if (!me) throw new HttpError(403, 'You are not a participant of this thread');
      await db.from('inbox_participants').update({ last_read_at: new Date().toISOString() }).eq('id', me.id);
      return json({ ok: true });
    }

    case 'set_status': {
      const threadId = String(payload.thread_id || '');
      const status = String(payload.status || '');
      if (!threadId || !['open', 'snoozed', 'closed'].includes(status)) {
        throw new HttpError(400, 'thread_id and a valid status are required');
      }
      const me = await callerParticipant(db, threadId, userId);
      if (!operator && (!me || me.participant_type !== 'member')) {
        throw new HttpError(403, 'Only thread members may change status');
      }
      await db.from('inbox_threads').update({ status }).eq('id', threadId);
      return json({ ok: true });
    }

    case 'list_threads': {
      const channelFilter = payload.channel ? String(payload.channel) : null;
      const typeFilter = payload.thread_type ? String(payload.thread_type) : null;
      const statusFilter = payload.status ? String(payload.status) : null;

      // Thread ids the caller participates in (or all, for an operator scope:'all').
      let threadIds: string[] | null = null;
      if (!(operator && payload.scope === 'all')) {
        const { data: myParts } = await db
          .from('inbox_participants')
          .select('thread_id, last_read_at')
          .eq('user_id', userId)
          .eq('status', 'active');
        const lastReadByThread = new Map<string, string | null>();
        for (const p of (myParts || []) as Array<{ thread_id: string; last_read_at: string | null }>) {
          lastReadByThread.set(p.thread_id, p.last_read_at);
        }
        threadIds = [...lastReadByThread.keys()];
        if (threadIds.length === 0) return json({ threads: [] });
        // attach lastRead for unread calc below
        (payload as Json)._lastRead = Object.fromEntries(lastReadByThread);
      }

      let q = db.from('inbox_threads').select('*').order('last_message_at', { ascending: false }).limit(200);
      if (threadIds) q = q.in('id', threadIds);
      if (channelFilter) q = q.eq('channel', channelFilter);
      if (typeFilter) q = q.eq('thread_type', typeFilter);
      if (statusFilter) q = q.eq('status', statusFilter);
      const { data: threads, error } = await q;
      if (error) throw new HttpError(500, error.message);

      const lastRead = ((payload as Json)._lastRead as Record<string, string | null>) || {};
      const enriched = (threads || []).map((t: Record<string, unknown>) => {
        const lr = lastRead[String(t.id)];
        const unread = !lr || new Date(String(t.last_message_at)) > new Date(lr);
        return { ...t, unread };
      });
      return json({ threads: enriched });
    }

    case 'get_thread': {
      const threadId = String(payload.thread_id || '');
      if (!threadId) throw new HttpError(400, 'thread_id is required');
      const thread = await getThreadOrThrow(db, threadId);
      const me = await callerParticipant(db, threadId, userId);
      if (!operator && !me) throw new HttpError(403, 'You are not a participant of this thread');
      const isMember = operator || (me && me.participant_type === 'member');

      const { data: participants } = await db
        .from('inbox_participants')
        .select('*')
        .eq('thread_id', threadId)
        .neq('status', 'removed');

      let mq = db
        .from('inbox_messages')
        .select('*')
        .eq('thread_id', threadId)
        .is('deleted_at', null)
        .order('created_at', { ascending: true })
        .limit(500);
      if (!isMember) mq = mq.neq('message_type', 'note'); // customers never see notes
      const { data: messages } = await mq;

      if (me) await db.from('inbox_participants').update({ last_read_at: new Date().toISOString() }).eq('id', me.id);
      return json({ thread, participants: participants || [], messages: messages || [] });
    }

    default:
      throw new HttpError(400, `Unknown action: ${action}`);
  }
}

// ──────────────────────────────────────────────────────────────────────────
// Token actions (service-role, unauthenticated customer)
// ──────────────────────────────────────────────────────────────────────────

async function resolveToken(db: SupabaseClient, token: string) {
  if (!token) throw new HttpError(400, 'token is required');
  const { data: tok } = await db
    .from('inbox_thread_tokens')
    .select('*')
    .eq('token', token)
    .maybeSingle();
  if (!tok) throw new HttpError(404, 'Invalid token');
  const t = tok as Record<string, unknown>;
  if (t.expires_at && new Date(String(t.expires_at)) < new Date()) {
    throw new HttpError(403, 'This link has expired');
  }
  return t;
}

async function handleTokenAction(db: SupabaseClient, action: string, payload: Json): Promise<Response> {
  const token = String(payload.token || '');

  switch (action) {
    case 'token_get_thread': {
      const tok = await resolveToken(db, token);
      const thread = await getThreadOrThrow(db, String(tok.thread_id));
      const { data: messages } = await db
        .from('inbox_messages')
        .select('id, body, attachments, message_type, sender_participant_id, created_at')
        .eq('thread_id', thread.id)
        .is('deleted_at', null)
        .neq('message_type', 'note') // customers never see private notes
        .order('created_at', { ascending: true })
        .limit(500);
      const { data: participants } = await db
        .from('inbox_participants')
        .select('id, participant_type, thread_role')
        .eq('thread_id', thread.id)
        .neq('status', 'removed');
      return json({
        thread: { id: thread.id, subject: thread.subject, status: thread.status, channel: thread.channel },
        messages: messages || [],
        participants: participants || [],
        claimed: !!tok.claimed_by_user_id,
      });
    }

    case 'token_send_message': {
      const tok = await resolveToken(db, token);
      const thread = await getThreadOrThrow(db, String(tok.thread_id));
      // The customer participant bound to this token's contact.
      const { data: cp } = await db
        .from('inbox_participants')
        .select('id')
        .eq('thread_id', thread.id)
        .eq('contact_id', tok.contact_id)
        .eq('status', 'active')
        .maybeSingle();
      const body = payload.body != null ? String(payload.body) : null;
      const attachments = await normalizeAttachments(db, String(thread.id), payload.attachments);
      if (!body && attachments.length === 0) throw new HttpError(400, 'message body or attachment required');
      const msg = await insertMessageAndNotify(db, {
        thread,
        senderParticipantId: (cp as { id?: string } | null)?.id ?? null,
        body,
        attachments,
        messageType: 'text',
        senderUserId: null,
        senderLabel: 'Customer reply',
      });
      return json({ message: { id: (msg as { id: string }).id, created_at: (msg as { created_at: string }).created_at } });
    }

    case 'token_claim': {
      // Conversion handshake: a freshly-signed-up user adopts the token's thread.
      const userId = String(payload.user_id || '');
      if (!userId) throw new HttpError(400, 'user_id is required');
      const tok = await resolveToken(db, token);
      if (tok.claimed_by_user_id && tok.claimed_by_user_id !== userId) {
        throw new HttpError(409, 'This invite was already claimed');
      }
      // Link the CRM contact to the account + carry the account onto the participant row so
      // the converted customer reads the thread via RLS. participant_type stays 'customer'
      // (a converted customer still must not see internal notes).
      if (tok.contact_id) {
        await db.from('crm_contacts')
          .update({ user_id: userId, linked_at: new Date().toISOString(), linked_by: userId })
          .eq('id', tok.contact_id);
        await db.from('inbox_participants')
          .update({ user_id: userId })
          .eq('thread_id', tok.thread_id)
          .eq('contact_id', tok.contact_id);
      }
      await db.from('inbox_thread_tokens').update({ claimed_by_user_id: userId }).eq('token', token);
      return json({ ok: true, thread_id: tok.thread_id });
    }

    default:
      throw new HttpError(400, `Unknown token action: ${action}`);
  }
}

// ──────────────────────────────────────────────────────────────────────────
// Entry
// ──────────────────────────────────────────────────────────────────────────

const TOKEN_ACTIONS = new Set(['token_get_thread', 'token_send_message', 'token_claim']);

async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') throw new HttpError(405, 'Method not allowed');

  const payload = (await req.json().catch(() => ({}))) as Json;
  const action = String(payload.action || '');
  if (!action) throw new HttpError(400, 'action is required');

  const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  // Token branch — unauthenticated customer, service-role only.
  if (TOKEN_ACTIONS.has(action)) {
    return handleTokenAction(db, action, payload);
  }

  // JWT branch — authenticated member/operator/customer-account.
  const auth = await authenticate(req, { requireUser: true });
  if (!auth.success || !auth.userId) {
    return json({ error: auth.error || 'Unauthorized' }, 401);
  }
  return handleJwtAction(db, auth.userId, action, payload);
}

Deno.serve(withApiLogging('inbox-api', handler));
