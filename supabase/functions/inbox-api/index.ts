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
import { generateWithClaude } from '../_shared/ai-client.ts';
import { isModuleEnabled } from '../_shared/modules/registry.ts';
import { bootstrapForFunction } from '../_shared/secrets-bootstrap.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

const ATTACHMENT_BUCKET = 'generation-images';
// Phase-2 agent takeover (§9): the workspace owner is billed per auto-reply.
const INBOX_AGENT_REPLY_COST = 1;
const DEFAULT_INBOX_AGENT_ID = 'kai';

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

/**
 * Shared-inbox access resolution (#209 §3 — "team inbox, not single-owner inbox").
 * A thread is reachable when the caller is the platform operator, an explicit active
 * participant, OR a business member of the thread's workspace on a shared customer/upstream
 * thread (sales jump-in). `internal` threads stay strictly participant-scoped — they are
 * private team DMs. `isMember` controls private-note visibility + member-only controls.
 */
async function resolveThreadAccess(
  db: SupabaseClient,
  userId: string,
  thread: Record<string, unknown>,
  operator: boolean,
): Promise<{
  canRead: boolean;
  isMember: boolean;
  participant: { id: string; participant_type: string; thread_role: string; status: string } | null;
}> {
  const participant = await callerParticipant(db, String(thread.id), userId);
  if (participant) {
    return { canRead: true, isMember: operator || participant.participant_type === 'member', participant };
  }
  if (operator) return { canRead: true, isMember: true, participant: null };
  const threadType = String(thread.thread_type);
  if (threadType === 'customer' || threadType === 'upstream') {
    const role = await callerRoleInWorkspace(db, userId, String(thread.workspace_id));
    if (role && BUSINESS_ROLES.has(role)) return { canRead: true, isMember: true, participant: null };
  }
  return { canRead: false, isMember: false, participant: null };
}

/** Get-or-create the caller's member participant row (sales jump-in becomes a real participant). */
async function ensureMemberParticipant(
  db: SupabaseClient,
  thread: Record<string, unknown>,
  userId: string,
): Promise<string | null> {
  const existing = await callerParticipant(db, String(thread.id), userId);
  if (existing) return existing.id;
  const { data } = await db
    .from('inbox_participants')
    .insert({
      thread_id: thread.id,
      participant_type: 'member',
      user_id: userId,
      workspace_id: thread.workspace_id,
      thread_role: 'participant',
      added_by: userId,
    })
    .select('id')
    .single();
  return (data as { id?: string } | null)?.id ?? null;
}

/**
 * Meta's 24h service window: outside 24h since the customer's last inbound WhatsApp message,
 * only an approved template may be sent. Inbound messages carry metadata.direction='incoming'.
 */
async function whatsappWindow(
  db: SupabaseClient,
  threadId: string,
): Promise<{ open: boolean; last_inbound_at: string | null; expires_at: string | null }> {
  const { data } = await db
    .from('inbox_messages')
    .select('created_at')
    .eq('thread_id', threadId)
    .eq('metadata->>direction', 'incoming')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  const last = (data as { created_at?: string } | null)?.created_at ?? null;
  if (!last) return { open: false, last_inbound_at: null, expires_at: null };
  const expires = new Date(new Date(last).getTime() + 24 * 3600 * 1000);
  return { open: expires > new Date(), last_inbound_at: last, expires_at: expires.toISOString() };
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

/** First active owner/admin of a workspace — the billing user for agent replies. */
async function workspaceOwner(db: SupabaseClient, workspaceId: string): Promise<string | null> {
  const { data } = await db
    .from('workspace_members').select('user_id')
    .eq('workspace_id', workspaceId).in('role', ['owner', 'admin']).limit(1).maybeSingle();
  return (data as { user_id?: string } | null)?.user_id ?? null;
}

/**
 * Phase-2 agent takeover (§9). When a thread is in `agent_state='active'`, an inbound customer
 * message triggers an AI reply: thread history → Claude → posted as message_type='agent', billed
 * to the workspace owner via debit_user_credits. Gated on the `inbox` module + owner balance.
 * Best-effort — any failure leaves the thread for a human, never throws to the caller.
 */
async function maybeRunAgentReply(db: SupabaseClient, threadId: string): Promise<void> {
  try {
    const thread = await getThreadOrThrow(db, threadId);
    if (thread.agent_state !== 'active') return;
    if (!(await isModuleEnabled(db, 'inbox'))) return;

    const workspaceId = String(thread.workspace_id);
    const owner = await workspaceOwner(db, workspaceId);
    if (!owner) return;

    // Bill the owner first; skip the turn (leave for a human) if they can't pay.
    const { data: debit } = await db.rpc('debit_user_credits', {
      p_user_id: owner,
      p_amount: INBOX_AGENT_REPLY_COST,
      p_operation_type: 'inbox_agent_reply',
      p_description: 'Inbox agent auto-reply (1 turn)',
      p_metadata: { thread_id: threadId, billing_type: 'inbox_agent_reply' },
    });
    const debitRes = Array.isArray(debit) ? debit[0] : debit;
    if (!debitRes?.success) return;

    // Build the recent conversation (exclude private notes) for context.
    const { data: history } = await db
      .from('inbox_messages')
      .select('body, message_type, sender_participant_id')
      .eq('thread_id', threadId)
      .is('deleted_at', null)
      .neq('message_type', 'note')
      .order('created_at', { ascending: false })
      .limit(20);
    const { data: ws } = await db.from('workspaces').select('name').eq('id', workspaceId).maybeSingle();
    const businessName = (ws as { name?: string } | null)?.name || 'our team';

    const transcript = ((history || []) as Array<{ body: string | null; message_type: string }>)
      .reverse()
      .map((m) => `${m.message_type === 'agent' ? 'Assistant' : 'Customer/Team'}: ${m.body || '[attachment]'}`)
      .join('\n');

    const systemPrompt =
      `You are a helpful assistant replying to a customer on behalf of ${businessName} over ${thread.channel}. ` +
      `Be concise, warm, and professional. Answer what you can from the conversation. If you cannot help or the ` +
      `customer needs a human (pricing commitments, account changes, complaints), say a team member will follow up shortly.`;

    const result = await generateWithClaude(
      `Conversation so far:\n${transcript}\n\nWrite the next reply to the customer.`,
      { systemPrompt, maxTokens: 600, temperature: 0.5, task: 'inbox_agent_reply' },
    );
    const replyText = (result.text || '').trim();
    if (!replyText) return;

    // The agent participant (created when the thread was handed over).
    const { data: agentP } = await db
      .from('inbox_participants').select('id')
      .eq('thread_id', threadId).eq('participant_type', 'agent').eq('status', 'active')
      .limit(1).maybeSingle();

    await insertMessageAndNotify(db, {
      thread,
      senderParticipantId: (agentP as { id?: string } | null)?.id ?? null,
      body: replyText,
      attachments: [],
      messageType: 'agent',
      senderUserId: null,
      senderLabel: 'Assistant',
    });
  } catch (e) {
    console.warn('[inbox-api] agent reply failed:', e instanceof Error ? e.message : String(e));
  }
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

  // Channel relay (notes never leave the inbox). Member replies + agent replies both relay.
  if (thread.channel === 'whatsapp' && (messageType === 'text' || messageType === 'agent') && body) {
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
      // Resolve the recipient's email so the general inbox flow can email + bell (#224).
      let email: string | undefined;
      try { const { data: u } = await db.auth.admin.getUserById(p.user_id); email = u?.user?.email ?? undefined; }
      catch { /* email is optional; the bell still fires */ }
      await emitFlowEvent('inbox.message_received', {
        user_id: p.user_id,
        email,
        type: 'inbox_message',
        title: `${opts.senderLabel || 'New message'} · ${subject}`,
        subject: `New message · ${subject}`,
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
      const { error: creatorPartErr } = await db.from('inbox_participants').insert({
        thread_id: (thread as { id: string }).id,
        participant_type: creatorIsCustomer ? 'customer' : 'member',
        user_id: userId,
        contact_id: creatorContactId,
        workspace_id: creatorIsCustomer ? null : workspaceId,
        thread_role: 'owner',
        added_by: userId,
      });
      // The creator MUST be on the thread (owner / directional-ACL anchor). If this
      // insert fails the thread is orphaned + inaccessible — surface it, don't swallow.
      if (creatorPartErr) {
        throw new HttpError(500, `Failed to add creator participant: ${creatorPartErr.message}`);
      }

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
      const access = await resolveThreadAccess(db, userId, thread, operator);
      if (!access.isMember) throw new HttpError(403, 'Only thread members may add participants');
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
      const thread = await getThreadOrThrow(db, threadId);
      const access = await resolveThreadAccess(db, userId, thread, operator);
      if (!access.isMember) throw new HttpError(403, 'Only thread members may remove participants');
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
      const access = await resolveThreadAccess(db, userId, thread, operator);
      if (!access.canRead) throw new HttpError(403, 'You are not a participant of this thread');
      const messageType = String(payload.message_type || 'text') as 'text' | 'note';
      if (messageType === 'note' && !access.isMember) {
        throw new HttpError(403, 'Only members may leave private notes');
      }
      const body = payload.body != null ? String(payload.body) : null;
      const attachments = await normalizeAttachments(db, threadId, payload.attachments);
      if (!body && attachments.length === 0) throw new HttpError(400, 'message body or attachment required');
      // WhatsApp: freeform replies only inside Meta's 24h service window. Notes (internal) exempt.
      if (thread.channel === 'whatsapp' && messageType !== 'note') {
        const w = await whatsappWindow(db, threadId);
        if (!w.open) {
          throw new HttpError(409, 'WhatsApp 24h service window is closed — an approved template is required to message this customer again.');
        }
      }
      // A member replying to a shared workspace thread they hadn't joined becomes a participant.
      let senderParticipantId = access.participant?.id ?? null;
      if (!senderParticipantId && access.isMember) {
        senderParticipantId = await ensureMemberParticipant(db, thread, userId);
      }
      const msg = await insertMessageAndNotify(db, {
        thread,
        senderParticipantId,
        body,
        attachments,
        messageType: messageType === 'note' ? 'note' : 'text',
        senderUserId: userId,
        senderLabel: 'New message',
      });
      // Mark the sender as caught up.
      if (senderParticipantId) {
        await db.from('inbox_participants').update({ last_read_at: new Date().toISOString() }).eq('id', senderParticipantId);
      }
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
      const thread = await getThreadOrThrow(db, threadId);
      const access = await resolveThreadAccess(db, userId, thread, operator);
      if (!access.isMember) throw new HttpError(403, 'Only thread members may change status');
      await db.from('inbox_threads').update({ status }).eq('id', threadId);
      return json({ ok: true });
    }

    case 'set_agent': {
      // Manual hand-to-agent / hand-back (§9). Members only.
      const threadId = String(payload.thread_id || '');
      const state = String(payload.agent_state || '');
      if (!threadId || !['off', 'suggesting', 'active'].includes(state)) {
        throw new HttpError(400, 'thread_id and a valid agent_state are required');
      }
      const thread = await getThreadOrThrow(db, threadId);
      const access = await resolveThreadAccess(db, userId, thread, operator);
      if (!access.isMember) throw new HttpError(403, 'Only thread members may hand a thread to the agent');
      const agentId = String(payload.agent_id || thread.agent_id || DEFAULT_INBOX_AGENT_ID);
      await db.from('inbox_threads').update({ agent_state: state, agent_id: agentId }).eq('id', threadId);

      if (state === 'off') {
        await db.from('inbox_participants').update({ status: 'left' })
          .eq('thread_id', threadId).eq('participant_type', 'agent');
      } else {
        // Ensure exactly one active agent participant.
        const { data: existing } = await db.from('inbox_participants')
          .select('id').eq('thread_id', threadId).eq('participant_type', 'agent').eq('status', 'active').maybeSingle();
        if (!existing) {
          await db.from('inbox_participants').insert({
            thread_id: threadId, participant_type: 'agent', agent_id: agentId, thread_role: 'agent', added_by: userId,
          });
        }
      }
      // System note so the transcript records the takeover.
      await db.from('inbox_messages').insert({
        thread_id: threadId, message_type: 'system',
        body: state === 'off' ? 'Conversation handed back to the team.' : `Conversation handed to the AI assistant (${state}).`,
      });
      return json({ ok: true, agent_state: state });
    }

    case 'list_threads': {
      const channelFilter = payload.channel ? String(payload.channel) : null;
      const typeFilter = payload.thread_type ? String(payload.thread_type) : null;
      const statusFilter = payload.status ? String(payload.status) : null;
      // Operators may pull every thread across all workspaces with scope:'all'.
      const wantAll = operator && payload.scope === 'all';

      // Threads the caller explicitly participates in — drives unread state and is the ONLY
      // way internal (team DM) threads are visible.
      const { data: myParts } = await db
        .from('inbox_participants')
        .select('thread_id, last_read_at')
        .eq('user_id', userId)
        .eq('status', 'active');
      const lastReadByThread = new Map<string, string | null>();
      for (const p of (myParts || []) as Array<{ thread_id: string; last_read_at: string | null }>) {
        lastReadByThread.set(p.thread_id, p.last_read_at);
      }
      const participantThreadIds = [...lastReadByThread.keys()];

      // Workspaces where the caller is a BUSINESS member → they share the team support inbox:
      // every customer/upstream thread in those workspaces, even ones they were never added to.
      const businessWsIds: string[] = [];
      if (!wantAll) {
        const { data: myMems } = await db
          .from('workspace_members')
          .select('workspace_id, role, status')
          .eq('user_id', userId);
        for (const m of (myMems || []) as Array<{ workspace_id: string; role: string; status: string }>) {
          if (ACTIVE_MEMBER(m.status) && m.role && BUSINESS_ROLES.has(m.role)) businessWsIds.push(m.workspace_id);
        }
      }

      let q = db.from('inbox_threads').select('*').order('last_message_at', { ascending: false }).limit(200);
      if (!wantAll) {
        const ors: string[] = [];
        if (participantThreadIds.length) ors.push(`id.in.(${participantThreadIds.join(',')})`);
        if (businessWsIds.length) {
          ors.push(`and(workspace_id.in.(${businessWsIds.join(',')}),thread_type.in.(customer,upstream))`);
        }
        if (ors.length === 0) return json({ threads: [] });
        q = q.or(ors.join(','));
      }
      if (channelFilter) q = q.eq('channel', channelFilter);
      if (typeFilter) q = q.eq('thread_type', typeFilter);
      if (statusFilter) q = q.eq('status', statusFilter);
      const { data: threads, error } = await q;
      if (error) throw new HttpError(500, error.message);

      const enriched = (threads || []).map((t: Record<string, unknown>) => {
        const id = String(t.id);
        // Threads visible only via workspace membership (not an explicit participant) start unread.
        const lr = lastReadByThread.get(id);
        const unread = lastReadByThread.has(id)
          ? (!lr || new Date(String(t.last_message_at)) > new Date(lr))
          : true;
        return { ...t, unread };
      });
      return json({ threads: enriched });
    }

    case 'get_thread': {
      const threadId = String(payload.thread_id || '');
      if (!threadId) throw new HttpError(400, 'thread_id is required');
      const thread = await getThreadOrThrow(db, threadId);
      const access = await resolveThreadAccess(db, userId, thread, operator);
      if (!access.canRead) throw new HttpError(403, 'You are not a participant of this thread');
      const isMember = access.isMember;

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

      if (access.participant) {
        await db.from('inbox_participants').update({ last_read_at: new Date().toISOString() }).eq('id', access.participant.id);
      }
      const wa = thread.channel === 'whatsapp' ? await whatsappWindow(db, threadId) : null;
      return json({ thread, participants: participants || [], messages: messages || [], whatsapp_window: wa });
    }

    case 'create_marketplace_inquiry': {
      // Surplus Marketplace (#222) — a BUYER contacts a SELLER about an active listing. This
      // crosses the tenant wall (the buyer is not a member of the seller's workspace), so it can
      // only run here under the service role. The buyer joins as a `customer`-type participant on
      // a `customer` thread in the SELLER's workspace, so they are note-blind (resolveThreadAccess
      // gives isMember=false to non-member participants); the seller's owner/admins are added as
      // `member` participants so insertMessageAndNotify fires `inbox.message_received` to them.
      const listingId = String(payload.listing_id || '');
      const buyerWorkspaceId = String(payload.buyer_workspace_id || '');
      if (!listingId || !buyerWorkspaceId) throw new HttpError(400, 'listing_id and buyer_workspace_id are required');

      // Buyer must be an active business member of the workspace they inquire on behalf of.
      const buyerRole = await callerRoleInWorkspace(db, userId, buyerWorkspaceId);
      if (!buyerRole || !BUSINESS_ROLES.has(buyerRole)) {
        throw new HttpError(403, 'You are not a business member of that workspace');
      }

      const { data: listing } = await db
        .from('marketplace_listings')
        .select('id, workspace_id, title, status, qty_remaining, unit')
        .eq('id', listingId)
        .maybeSingle();
      const l = listing as { workspace_id?: string; title?: string; status?: string; unit?: string } | null;
      if (!l || l.status !== 'active') throw new HttpError(404, 'Listing not available');
      const sellerWorkspaceId = String(l.workspace_id);
      if (sellerWorkspaceId === buyerWorkspaceId) throw new HttpError(400, 'You cannot inquire on your own listing');

      const { data: buyerWs } = await db.from('workspaces').select('name').eq('id', buyerWorkspaceId).maybeSingle();
      const buyerName = (buyerWs as { name?: string } | null)?.name || 'A buyer';
      const qtyWanted = payload.qty_wanted != null ? Number(payload.qty_wanted) : null;
      const customMsg = payload.message != null ? String(payload.message).trim() : '';

      // Inquiry row (RLS would also allow the buyer to insert this directly; we do it here so the
      // whole bridge is one atomic, server-authored call).
      const { data: inq, error: inqErr } = await db.from('marketplace_inquiries').insert({
        listing_id: listingId,
        buyer_workspace_id: buyerWorkspaceId,
        buyer_user_id: userId,
        buyer_name: buyerName,
        qty_wanted: qtyWanted,
        message: customMsg || null,
        status: 'open',
      }).select('id').single();
      if (inqErr) throw new HttpError(500, `Failed to create inquiry: ${inqErr.message}`);
      const inquiryId = (inq as { id: string }).id;

      // Thread in the seller's workspace.
      const { data: thread, error: thErr } = await db.from('inbox_threads').insert({
        workspace_id: sellerWorkspaceId,
        thread_type: 'customer',
        channel: 'internal',
        subject: `Surplus inquiry: ${l.title || 'listing'}`,
        created_by: userId,
        metadata: { marketplace_listing_id: listingId, marketplace_inquiry_id: inquiryId, buyer_workspace_id: buyerWorkspaceId },
      }).select('*').single();
      if (thErr) throw new HttpError(500, `Failed to open conversation: ${thErr.message}`);
      const threadRow = thread as Record<string, unknown>;
      const threadId = String(threadRow.id);

      // Buyer as note-blind customer participant (owner of the inquiry).
      const { data: buyerPart } = await db.from('inbox_participants').insert({
        thread_id: threadId, participant_type: 'customer', user_id: userId,
        workspace_id: null, thread_role: 'owner', added_by: userId,
      }).select('id').single();

      // Seller owner/admins as explicit member participants → shared inbox + notified.
      const { data: sellerMembers } = await db.from('workspace_members')
        .select('user_id, role, status').eq('workspace_id', sellerWorkspaceId).in('role', ['owner', 'admin']);
      for (const m of (sellerMembers || []) as Array<{ user_id: string; status?: string }>) {
        if (!ACTIVE_MEMBER(m.status)) continue;
        await db.from('inbox_participants').insert({
          thread_id: threadId, participant_type: 'member', user_id: m.user_id,
          workspace_id: sellerWorkspaceId, thread_role: 'participant', added_by: userId,
        });
      }

      // Initial message — notifies the seller participants (buyer is the sender, so skipped).
      const qtyLine = qtyWanted ? ` Quantity wanted: ${qtyWanted} ${l.unit || ''}.`.trimEnd() : '';
      const body = customMsg || `Hi, I'm interested in "${l.title || 'your listing'}".${qtyLine}`;
      await insertMessageAndNotify(db, {
        thread: threadRow,
        senderParticipantId: (buyerPart as { id?: string } | null)?.id ?? null,
        body,
        attachments: [],
        messageType: 'text',
        senderUserId: userId,
        senderLabel: `${buyerName} · marketplace`,
      });

      await db.from('marketplace_inquiries').update({ inbox_thread_id: threadId }).eq('id', inquiryId);
      return json({ inquiry_id: inquiryId, thread_id: threadId });
    }

    case 'notify_want_matches': {
      // Surplus Marketplace (#225) — when a SELLER publishes an active listing, notify buyers in
      // OTHER workspaces whose saved want-list matches. Cross-tenant + throttled, so it runs here
      // under the service role (a seller cannot read other tenants' want-lists). Best-effort:
      // the caller (createListing) ignores failures so alerting never blocks publishing.
      const listingId = String(payload.listing_id || '');
      if (!listingId) throw new HttpError(400, 'listing_id is required');

      const { data: listing } = await db
        .from('marketplace_listings')
        .select('id, workspace_id, title, material_category, price, currency, location_city, status')
        .eq('id', listingId)
        .maybeSingle();
      const l = listing as {
        workspace_id?: string; title?: string; material_category?: string | null;
        price?: number; currency?: string; location_city?: string | null; status?: string;
      } | null;
      if (!l || l.status !== 'active') throw new HttpError(404, 'Listing not available');
      const sellerWorkspaceId = String(l.workspace_id);

      // Only a member of the seller workspace may trigger the fan-out (prevents abuse).
      const callerRole = await callerRoleInWorkspace(db, userId, sellerWorkspaceId);
      if (!callerRole) throw new HttpError(403, 'Not a member of the listing workspace');

      // Candidate want-lists: active, owned by a DIFFERENT workspace, not notified in the last 6h.
      // Category / keyword / price / city are narrowed in code below.
      const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();
      const { data: candidates } = await db
        .from('marketplace_want_lists')
        .select('id, user_id, workspace_id, label, material_category, keyword, max_price, location_city, last_notified_at')
        .eq('is_active', true)
        .neq('workspace_id', sellerWorkspaceId)
        .or(`last_notified_at.is.null,last_notified_at.lt.${sixHoursAgo}`);

      const title = (l.title || '').toLowerCase();
      const cat = (l.material_category || '').toLowerCase();
      const price = typeof l.price === 'number' ? l.price : null;
      const city = (l.location_city || '').toLowerCase();

      const matches = ((candidates || []) as Array<{
        id: string; user_id: string; label: string | null; material_category: string | null;
        keyword: string | null; max_price: number | null; location_city: string | null;
      }>).filter((w) => {
        if (w.material_category && cat && w.material_category.toLowerCase() !== cat) return false;
        if (w.keyword && !title.includes(w.keyword.toLowerCase())) return false;
        if (w.max_price != null && price != null && price > Number(w.max_price)) return false;
        if (w.location_city && city && !city.includes(w.location_city.toLowerCase())) return false;
        return true;
      });

      // Buyer emails for the send_email branch of the seeded flow (notify branch
      // needs only user_id; email branch needs `email` + `subject`).
      const uniqueUserIds = [...new Set(matches.map((w) => w.user_id))];
      const emailById = new Map<string, string>();
      if (uniqueUserIds.length > 0) {
        const { data: profs } = await db
          .from('user_profiles').select('user_id, email').in('user_id', uniqueUserIds);
        for (const p of (profs || []) as Array<{ user_id: string; email: string | null }>) {
          if (p.email) emailById.set(p.user_id, p.email);
        }
      }

      // One notification per buyer even if several of their want-lists match.
      const seen = new Set<string>();
      let notified = 0;
      for (const w of matches) {
        if (seen.has(w.user_id)) continue;
        seen.add(w.user_id);
        const listingTitle = l.title || 'a listing';
        const priceLine = price != null ? ` — ${l.currency || ''} ${price}`.trimEnd() : '';
        await emitFlowEvent('marketplace_want_match', {
          user_id: w.user_id, // recipient — consumed by create_notification
          email: emailById.get(w.user_id) || null, // consumed by send_email (skips if null)
          type: 'marketplace_want_match',
          subject: `New surplus match: ${listingTitle}`,
          title: `New surplus match: ${listingTitle}`,
          body: `A listing matching your saved alert${w.label ? ` "${w.label}"` : ''} was just posted${priceLine}.`,
          action_url: '/discover',
          listing_id: listingId,
          listing_title: l.title || null,
          want_list_id: w.id,
          want_list_label: w.label || null,
        });
        notified++;
      }

      // Throttle-stamp every matched want-list (incl. deduped) so it cools down for 6h.
      const matchedIds = matches.map((w) => w.id);
      if (matchedIds.length > 0) {
        await db.from('marketplace_want_lists')
          .update({ last_notified_at: new Date().toISOString() })
          .in('id', matchedIds);
      }
      return json({ matched: matches.length, notified });
    }

    case 'get_thread_context': {
      // Right-rail CRM context for the customer a member is talking to (#209 §UI col-3):
      // the linked CRM contact + their company + recent quotes + projects. Members/operators only.
      const threadId = String(payload.thread_id || '');
      if (!threadId) throw new HttpError(400, 'thread_id is required');
      const thread = await getThreadOrThrow(db, threadId);
      const access = await resolveThreadAccess(db, userId, thread, operator);
      if (!access.isMember) throw new HttpError(403, 'Only thread members may view conversation context');

      // The customer participant's CRM contact id (first active customer on the thread).
      const { data: custP } = await db
        .from('inbox_participants')
        .select('contact_id')
        .eq('thread_id', threadId)
        .eq('participant_type', 'customer')
        .eq('status', 'active')
        .not('contact_id', 'is', null)
        .limit(1)
        .maybeSingle();
      const contactId = (custP as { contact_id?: string } | null)?.contact_id ?? null;
      if (!contactId) return json({ contact: null, company: null, quotes: [], projects: [] });

      const { data: contact } = await db
        .from('crm_contacts')
        .select('id, name, first_name, last_name, email, phone, mobile, company, position, country, country_code, city, lead_source, lead_status, is_client, vat_number, tags, user_id, created_at')
        .eq('id', contactId)
        .maybeSingle();

      const [{ data: quotes }, { data: projects }] = await Promise.all([
        db.from('quotes')
          .select('id, quote_number, name, status, grand_total, currency, customer_company_id, created_at')
          .eq('customer_contact_id', contactId)
          .order('created_at', { ascending: false })
          .limit(8),
        db.from('projects')
          .select('id, name, status, budget_amount, budget_currency, client_company_id, created_at')
          .eq('client_contact_id', contactId)
          .order('created_at', { ascending: false })
          .limit(8),
      ]);

      // Company: prefer the most recent quote/project link, fall back to the contact's text name.
      const companyId =
        (quotes || []).map((q: { customer_company_id?: string }) => q.customer_company_id).find(Boolean) ||
        (projects || []).map((p: { client_company_id?: string }) => p.client_company_id).find(Boolean) || null;
      let company: Record<string, unknown> | null = null;
      if (companyId) {
        const { data: c } = await db
          .from('crm_companies')
          .select('id, name, website, city, country, vat_number, industry')
          .eq('id', companyId)
          .maybeSingle();
        company = c as Record<string, unknown> | null;
      }

      return json({ contact: contact || null, company, quotes: quotes || [], projects: projects || [] });
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
      // Phase-2: auto-reply if the thread is handed to the agent.
      await maybeRunAgentReply(db, String(thread.id));
      return json({ message: { id: (msg as { id: string }).id, created_at: (msg as { created_at: string }).created_at } });
    }

    case 'token_claim': {
      // Conversion handshake: a freshly-signed-up user adopts the token's thread and becomes a
      // `client` member of the dealer's workspace.
      const userId = String(payload.user_id || '');
      if (!userId) throw new HttpError(400, 'user_id is required');
      const tok = await resolveToken(db, token);
      if (tok.claimed_by_user_id && tok.claimed_by_user_id !== userId) {
        throw new HttpError(409, 'This invite was already claimed');
      }
      const thread = await getThreadOrThrow(db, String(tok.thread_id));
      const workspaceId = String(thread.workspace_id);

      // Link the CRM contact to the account + carry the account onto the participant row so the
      // converted customer reads the thread via RLS. participant_type stays 'customer' (a
      // converted customer still must not see internal notes).
      if (tok.contact_id) {
        await db.from('crm_contacts')
          .update({ user_id: userId, linked_at: new Date().toISOString(), linked_by: userId })
          .eq('id', tok.contact_id);
        await db.from('inbox_participants')
          .update({ user_id: userId })
          .eq('thread_id', tok.thread_id)
          .eq('contact_id', tok.contact_id);
      } else {
        // Token without a contact (rare): ensure the claimer is at least a participant.
        const { data: existing } = await db.from('inbox_participants')
          .select('id').eq('thread_id', tok.thread_id).eq('user_id', userId).maybeSingle();
        if (!existing) {
          await db.from('inbox_participants').insert({
            thread_id: tok.thread_id, participant_type: 'customer', user_id: userId, thread_role: 'participant',
          });
        }
      }

      // Become a `client` member of the dealer workspace (idempotent).
      const { data: mem } = await db.from('workspace_members')
        .select('id').eq('workspace_id', workspaceId).eq('user_id', userId).maybeSingle();
      if (!mem) {
        await db.from('workspace_members').insert({
          workspace_id: workspaceId, user_id: userId, role: 'client', status: 'active',
        });
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

  // Env-first / DB-fallback secrets (ANTHROPIC_API_KEY for agent replies). authenticate() also
  // bootstraps, but the token + internal branches skip it, so do it up front.
  await bootstrapForFunction();

  const payload = (await req.json().catch(() => ({}))) as Json;
  const action = String(payload.action || '');
  if (!action) throw new HttpError(400, 'action is required');

  const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  // Internal branch — function-to-function (e.g. the Zernio webhook after a WhatsApp inbound).
  // Guarded by the service-role bearer; never reachable by external callers.
  if (action === 'internal_agent_reply') {
    const authHeader = req.headers.get('authorization') || '';
    if (authHeader !== `Bearer ${SERVICE_ROLE_KEY}`) throw new HttpError(401, 'Unauthorized');
    await maybeRunAgentReply(db, String(payload.thread_id || ''));
    return json({ ok: true });
  }

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
