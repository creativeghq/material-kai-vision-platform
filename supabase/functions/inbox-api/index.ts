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
import { generateWithClaudeTools } from '../_shared/ai-client.ts';
import { bootstrapForFunction } from '../_shared/secrets-bootstrap.ts';
import { resolveSecret } from '../_shared/secrets.ts';
import { tool } from 'npm:ai@6';
import { z } from 'npm:zod@3';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

const ATTACHMENT_BUCKET = 'generation-images';
// Phase-2 agent takeover (§9): the workspace owner is billed per auto-reply.
const INBOX_AGENT_REPLY_COST = 1;
const DEFAULT_INBOX_AGENT_ID = 'kai';
// Base URL for customer-facing links the agent may hand out (e.g. invoice pay links).
const PUBLIC_APP_URL = (Deno.env.get('PUBLIC_APP_URL') || 'https://app.materialshub.gr').replace(/\/+$/, '');

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

type InboxAgentSettings = { autoRespond: boolean; allowAccountData: boolean };

/**
 * Per-workspace inbox-agent config at `workspaces.settings.inbox_agent`. Both default ON so the
 * assistant works platform-wide out of the box: `auto_respond` makes it first-respond on new
 * customer threads, `allow_account_data` lets it answer the customer's OWN account/billing
 * questions. A workspace opts out by setting either to `false`.
 */
async function inboxAgentSettings(db: SupabaseClient, workspaceId: string): Promise<InboxAgentSettings> {
  const { data } = await db.from('workspaces').select('settings').eq('id', workspaceId).maybeSingle();
  const root = ((data as { settings?: Record<string, unknown> } | null)?.settings || {}) as Record<string, unknown>;
  const cfg = (root.inbox_agent || {}) as Record<string, unknown>;
  return {
    autoRespond: cfg.auto_respond !== false,
    allowAccountData: cfg.allow_account_data !== false,
  };
}

/** The customer this thread is about: the active customer participant's CRM contact + their company. */
async function resolveThreadCustomerScope(
  db: SupabaseClient,
  threadId: string,
): Promise<{ contactId: string | null; companyId: string | null }> {
  const { data: custP } = await db
    .from('inbox_participants').select('contact_id')
    .eq('thread_id', threadId).eq('participant_type', 'customer').eq('status', 'active')
    .not('contact_id', 'is', null).limit(1).maybeSingle();
  const contactId = (custP as { contact_id?: string } | null)?.contact_id ?? null;
  if (!contactId) return { contactId: null, companyId: null };
  const { data: q } = await db
    .from('quotes').select('customer_company_id')
    .eq('customer_contact_id', contactId).not('customer_company_id', 'is', null)
    .order('created_at', { ascending: false }).limit(1).maybeSingle();
  return { contactId, companyId: (q as { customer_company_id?: string } | null)?.customer_company_id ?? null };
}

/**
 * Read-only self-service tools for the customer-facing agent. CRITICAL: every query is scoped by
 * (workspace_id, contact_id) captured from the THREAD — never from tool arguments or the customer's
 * message — so the customer can only ever read their own records and cannot widen scope by prompt
 * injection. The tools intentionally take no scoping parameters.
 */
function buildCustomerSupportTools(db: SupabaseClient, scope: { workspaceId: string; contactId: string }) {
  return {
    get_account_statement: tool({
      description:
        "The customer's current outstanding balance split into aging buckets (not yet due, 0-30, " +
        '31-90, and 90+ days overdue), the total owed, how many documents are open, and the most ' +
        'overdue day count. Use for any question about how much they owe or their statement.',
      inputSchema: z.object({}),
      execute: async () => {
        const { data } = await db
          .from('vw_customer_aging_buckets')
          .select('total_outstanding, not_due, due_0_30, due_31_90, due_90_plus, max_days_overdue, open_doc_count')
          .eq('workspace_id', scope.workspaceId)
          .eq('customer_contact_id', scope.contactId);
        const rows = (data || []) as Array<Record<string, number>>;
        if (!rows.length) return { has_balance: false, message: 'No outstanding balance on record.' };
        const sum = (k: string) => rows.reduce((a, r) => a + Number(r[k] || 0), 0);
        const { data: inv } = await db.from('invoices').select('currency')
          .eq('workspace_id', scope.workspaceId).eq('customer_contact_id', scope.contactId)
          .gt('amount_due', 0).limit(1).maybeSingle();
        return {
          has_balance: true,
          currency: (inv as { currency?: string } | null)?.currency || 'EUR',
          total_outstanding: sum('total_outstanding'),
          not_due: sum('not_due'),
          due_0_30: sum('due_0_30'),
          due_31_90: sum('due_31_90'),
          due_90_plus: sum('due_90_plus'),
          open_document_count: sum('open_doc_count'),
          max_days_overdue: Math.max(0, ...rows.map((r) => Number(r.max_days_overdue || 0))),
        };
      },
    }),
    list_open_invoices: tool({
      description:
        "The customer's unpaid or partially-paid invoices: document number, amount still due, " +
        'currency, due date, status, and a secure payment link when one is available. Use to ' +
        'itemise what is open or to give them a way to pay.',
      inputSchema: z.object({}),
      execute: async () => {
        const { data } = await db.from('invoices')
          .select('internal_number, legal_number, amount_due, currency, due_at, status, pay_token, pay_token_expires_at')
          .eq('workspace_id', scope.workspaceId).eq('customer_contact_id', scope.contactId)
          .gt('amount_due', 0).order('due_at', { ascending: true }).limit(10);
        const now = Date.now();
        return ((data || []) as Array<Record<string, unknown>>).map((r) => {
          const tokenOk = r.pay_token &&
            (!r.pay_token_expires_at || new Date(String(r.pay_token_expires_at)).getTime() > now);
          return {
            number: r.legal_number || r.internal_number,
            amount_due: Number(r.amount_due || 0),
            currency: r.currency || 'EUR',
            due_at: r.due_at,
            status: r.status,
            pay_url: tokenOk ? `${PUBLIC_APP_URL}/pay/${r.pay_token}` : null,
          };
        });
      },
    }),
    list_quotes_and_projects: tool({
      description:
        "The customer's recent quotes (with status and total) and projects. Use for questions about " +
        'their orders, quotes, proposals, or project status.',
      inputSchema: z.object({}),
      execute: async () => {
        const [{ data: quotes }, { data: projects }] = await Promise.all([
          db.from('quotes').select('quote_number, name, status, grand_total, currency, created_at')
            .eq('customer_contact_id', scope.contactId).order('created_at', { ascending: false }).limit(8),
          db.from('projects').select('name, status, created_at')
            .eq('client_contact_id', scope.contactId).order('created_at', { ascending: false }).limit(8),
        ]);
        return { quotes: quotes || [], projects: projects || [] };
      },
    }),
  };
}

// Fallback persona if the editable DB row (prompts: prompt_type='agent', category='inbox') is missing.
const FALLBACK_INBOX_PERSONA =
  'You are a customer-support assistant for a business, replying inside a customer conversation. ' +
  "Reply in the customer's language; be concise, warm, and professional. Never invent facts — only " +
  'state amounts, balances, dates, invoice numbers, statuses, or links returned by a tool. For anything ' +
  'that needs a person (negotiation, discounts, complaints, refunds, account changes, legal), say a team ' +
  'member will follow up shortly and do not make commitments on the business’s behalf.';

/** Editable inbox-agent persona/policy (prompts row), with an inline fallback. */
async function loadInboxAgentPersona(db: SupabaseClient): Promise<string> {
  const { data } = await db.from('prompts').select('system_prompt')
    .eq('prompt_type', 'agent').eq('category', 'inbox').eq('is_active', true)
    .order('updated_at', { ascending: false }).limit(1).maybeSingle();
  return (data as { system_prompt?: string } | null)?.system_prompt?.trim() || FALLBACK_INBOX_PERSONA;
}

/**
 * Phase-2 agent takeover (§9). When a thread is `agent_state='active'`, an inbound customer message
 * triggers an AI reply: it can look up THIS customer's own account (statement/aging, open invoices +
 * pay links, quotes & projects) via read-only thread-scoped tools, then posts the answer as
 * message_type='agent', billed to the workspace pool (or owner personal) via debit_credits. Available to every
 * workspace (no module gate); every reply costs credits and is skipped (left for a human) when the
 * owner can't pay. Only fires on a fresh inbound CUSTOMER message (loop/takeover guard below).
 * Best-effort — any failure leaves the thread for a human, never throws.
 */
async function maybeRunAgentReply(db: SupabaseClient, threadId: string): Promise<void> {
  try {
    const thread = await getThreadOrThrow(db, threadId);
    if (thread.agent_state !== 'active') return;
    const workspaceId = String(thread.workspace_id);

    // Recent conversation (exclude private notes), newest first — used for the guard and transcript.
    const { data: history } = await db
      .from('inbox_messages')
      .select('body, message_type, sender_participant_id')
      .eq('thread_id', threadId)
      .is('deleted_at', null)
      .neq('message_type', 'note')
      .order('created_at', { ascending: false })
      .limit(20);
    const rows = (history || []) as Array<{ body: string | null; message_type: string; sender_participant_id: string | null }>;

    // Loop / human-takeover guard: only answer when the most recent message is a fresh inbound
    // CUSTOMER text. Skip if it was the assistant (already replied), a member (staff is handling),
    // or a system event — prevents double-replies, billing loops, and talking over a human.
    const latest = rows[0];
    if (!latest || latest.message_type !== 'text' || !latest.sender_participant_id) return;
    const { data: latestSender } = await db.from('inbox_participants')
      .select('participant_type').eq('id', latest.sender_participant_id).maybeSingle();
    if ((latestSender as { participant_type?: string } | null)?.participant_type !== 'customer') return;

    const owner = await workspaceOwner(db, workspaceId);
    if (!owner) return;

    // Bill the owner only now that we've committed to replying; skip (leave for a human) if unpaid.
    const { data: debit } = await db.rpc('debit_credits', {
      p_user_id: owner,
      p_amount: INBOX_AGENT_REPLY_COST,
      p_operation_type: 'inbox_agent_reply',
      p_description: 'Inbox agent auto-reply (1 turn)',
      p_metadata: { thread_id: threadId, billing_type: 'inbox_agent_reply' },
      p_workspace_id: workspaceId,  // draw from the workspace pool when funded, else owner personal
    });
    const debitRes = Array.isArray(debit) ? debit[0] : debit;
    if (!debitRes?.success) return;

    // Refund the owner (pool → personal) for any post-debit failure — a blank draft, a
    // draft-generation throw, or a failed post — so an auto-reply that never reached the
    // customer isn't billed. Mirrors the suggest_reply refund below.
    const refundReply = () => db.rpc('refund_credits', {
      p_user_id: owner,
      p_amount: INBOX_AGENT_REPLY_COST,
      p_operation_type: 'inbox_agent_reply_refund',
      p_description: 'Refund — agent auto-reply produced no message',
      p_metadata: { thread_id: threadId },
      p_workspace_id: workspaceId,
    }).catch(() => {});

    let replyText: string;
    try {
      replyText = await buildAgentDraft(db, thread);
    } catch (draftErr) {
      await refundReply();
      throw draftErr;
    }
    if (!replyText) {
      await refundReply();
      return;
    }

    // The agent participant (created when the thread was handed over / auto-engaged).
    const { data: agentP } = await db
      .from('inbox_participants').select('id')
      .eq('thread_id', threadId).eq('participant_type', 'agent').eq('status', 'active')
      .limit(1).maybeSingle();

    try {
      await insertMessageAndNotify(db, {
        thread,
        senderParticipantId: (agentP as { id?: string } | null)?.id ?? null,
        body: replyText,
        attachments: [],
        messageType: 'agent',
        senderUserId: null,
        senderLabel: 'Assistant',
      });
    } catch (postErr) {
      await refundReply();
      throw postErr;
    }
  } catch (e) {
    console.warn('[inbox-api] agent reply failed:', e instanceof Error ? e.message : String(e));
  }
}

/**
 * Generate the agent's next-reply draft for a thread — the shared brain behind both the auto-reply
 * (maybeRunAgentReply) and the member-initiated "help me write" suggestion (suggest_reply action).
 * Pure: reads the transcript + (injection-proof, thread-scoped) account tools and returns the text.
 * Does NOT post, bill, or guard — the callers own that.
 */
async function buildAgentDraft(db: SupabaseClient, thread: Record<string, unknown>): Promise<string> {
  const threadId = String(thread.id);
  const workspaceId = String(thread.workspace_id);
  const { data: history } = await db
    .from('inbox_messages')
    .select('body, message_type')
    .eq('thread_id', threadId)
    .is('deleted_at', null)
    .neq('message_type', 'note')
    .order('created_at', { ascending: false })
    .limit(20);
  const rows = (history || []) as Array<{ body: string | null; message_type: string }>;
  const settings = await inboxAgentSettings(db, workspaceId);
  const { data: ws } = await db.from('workspaces').select('name').eq('id', workspaceId).maybeSingle();
  const businessName = (ws as { name?: string } | null)?.name || 'our team';
  const transcript = rows.slice().reverse()
    .map((m) => `${m.message_type === 'agent' ? 'Assistant' : 'Customer/Team'}: ${m.body || '[attachment]'}`)
    .join('\n');
  // Self-service tools — only when we know which customer this is AND the workspace allows account
  // answers. Scope is derived from the thread, never from the message (injection-proof).
  const scope = await resolveThreadCustomerScope(db, threadId);
  const tools = (settings.allowAccountData && scope.contactId)
    ? buildCustomerSupportTools(db, { workspaceId, contactId: scope.contactId })
    : {};
  const personaBase = await loadInboxAgentPersona(db);
  const systemPrompt =
    `${personaBase}\n\n` +
    `Business: ${businessName}. Channel: ${String(thread.channel)}. ` +
    (Object.keys(tools).length
      ? "Use the tools to look up THIS customer's own account (statement/balance, open invoices, " +
        'quotes & projects); always call a tool for real figures and only share a payment link a tool returns.'
      : 'You do not have access to account data in this conversation.');
  const result = await generateWithClaudeTools(
    `Conversation so far:\n${transcript}\n\nWrite the next reply to the customer.`,
    { systemPrompt, maxTokens: 700, temperature: 0.4, task: 'inbox_agent_reply', tools, maxSteps: 6 },
  );
  return (result.text || '').trim();
}

/**
 * Get-or-create a public share token for a customer thread → the `/i/:token` link a member can
 * hand to a customer who has no account yet. Reuses an unclaimed token if one already exists.
 */
async function getOrCreateShareLink(
  db: SupabaseClient,
  threadId: string,
  contactId: string | null,
): Promise<string> {
  const { data: existing } = await db
    .from('inbox_thread_tokens')
    .select('token')
    .eq('thread_id', threadId)
    .is('claimed_by_user_id', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  let token = (existing as { token?: string } | null)?.token;
  if (!token) {
    const { data: ins, error } = await db
      .from('inbox_thread_tokens')
      .insert({ thread_id: threadId, contact_id: contactId })
      .select('token')
      .single();
    if (error) throw new HttpError(500, `Failed to create share link: ${error.message}`);
    token = (ins as { token: string }).token;
  }
  return `${PUBLIC_APP_URL}/i/${token}`;
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

  // Agents are attached/detached via the `set_agent` action (which manages the agent participant
  // + agent_state), not through add_participant.
  if (target.type === 'agent') {
    throw new HttpError(400, 'Use set_agent to hand a thread to (or take it back from) the assistant.');
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

  // Denormalized last-message snippet for the mailbox list. Notes are private (never shown to
  // customers) and system events aren't content, so neither updates the preview.
  const preview = (messageType === 'note' || messageType === 'system')
    ? undefined
    : (body ? body.replace(/\s+/g, ' ').slice(0, 140) : '[attachment]');
  await db
    .from('inbox_threads')
    .update({
      last_message_at: new Date().toISOString(),
      status: 'open',
      ...(preview !== undefined ? { last_message_preview: preview } : {}),
    })
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
      // Store the returned message id as `wamid` so the zernio-webhook-handler's
      // message.delivered|read|failed handler (which matches `metadata->>wamid`) can apply
      // delivery/read receipts to THIS outbound message. Keep `relay` for debugging.
      await db
        .from('inbox_messages')
        .update({ metadata: { channel: 'whatsapp', wamid: (res as { messageId?: string })?.messageId ?? null, relay: res } })
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
        // #256 — carry the thread's workspace so tenant flows can scope to it.
        workspace_id: (thread as { workspace_id?: string }).workspace_id,
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

      // Auto-engage the AI assistant on customer-initiated threads (per-workspace opt-out via
      // settings.inbox_agent.auto_respond). It stays quiet until the customer actually messages —
      // maybeRunAgentReply only fires on inbound customer messages.
      if (threadType === 'customer' && creatorIsCustomer) {
        const settings = await inboxAgentSettings(db, workspaceId);
        if (settings.autoRespond) {
          await db.from('inbox_threads')
            .update({ agent_state: 'active', agent_id: DEFAULT_INBOX_AGENT_ID })
            .eq('id', (thread as { id: string }).id);
          await db.from('inbox_participants').insert({
            thread_id: (thread as { id: string }).id, participant_type: 'agent',
            agent_id: DEFAULT_INBOX_AGENT_ID, thread_role: 'agent', added_by: userId,
          });
          await db.from('inbox_messages').insert({
            thread_id: (thread as { id: string }).id, message_type: 'system',
            body: 'The AI assistant is responding to new messages on this conversation.',
          });
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
      if (!access.isMember && messageType !== 'note') {
        // A customer (claimed-account) message lets the agent take first crack. No-op unless the
        // thread is agent-active; maybeRunAgentReply gates + bills internally.
        await maybeRunAgentReply(db, threadId);
      } else if (access.isMember && messageType === 'text' && thread.agent_state === 'active') {
        // Human takeover: a staff reply pauses the assistant so it stops auto-replying. Resume via
        // the Bot toggle (set_agent → 'active'). Notes don't pause (they're private to members).
        await db.from('inbox_threads').update({ agent_state: 'paused' }).eq('id', threadId);
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
      if (!threadId || !['off', 'active'].includes(state)) {
        throw new HttpError(400, 'thread_id and a valid agent_state (off|active) are required');
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

    case 'get_agent_settings': {
      // Per-workspace AI-assistant config (workspaces.settings.inbox_agent). Any workspace member
      // may read it (drives UI state); only owner/admin may change it (set_agent_settings).
      const workspaceId = String(payload.workspace_id || '');
      if (!workspaceId) throw new HttpError(400, 'workspace_id is required');
      const callerRole = await callerRoleInWorkspace(db, userId, workspaceId);
      if (!operator && !callerRole) throw new HttpError(403, 'You are not a member of that workspace');
      const settings = await inboxAgentSettings(db, workspaceId);
      return json({
        settings,
        can_edit: operator || callerRole === 'owner' || callerRole === 'admin',
        reply_cost: INBOX_AGENT_REPLY_COST,
      });
    }

    case 'set_agent_settings': {
      const workspaceId = String(payload.workspace_id || '');
      if (!workspaceId) throw new HttpError(400, 'workspace_id is required');
      const callerRole = await callerRoleInWorkspace(db, userId, workspaceId);
      if (!operator && callerRole !== 'owner' && callerRole !== 'admin') {
        throw new HttpError(403, 'Only a workspace owner or admin may change AI assistant settings');
      }
      // Read-modify-write the jsonb so sibling settings keys are preserved.
      const { data: wsRow } = await db.from('workspaces').select('settings').eq('id', workspaceId).maybeSingle();
      const current = ((wsRow as { settings?: Record<string, unknown> } | null)?.settings || {}) as Record<string, unknown>;
      const prevAgent = (current.inbox_agent || {}) as Record<string, unknown>;
      const nextAgent: Record<string, unknown> = { ...prevAgent };
      if (typeof payload.auto_respond === 'boolean') nextAgent.auto_respond = payload.auto_respond;
      if (typeof payload.allow_account_data === 'boolean') nextAgent.allow_account_data = payload.allow_account_data;
      const { error } = await db.from('workspaces')
        .update({ settings: { ...current, inbox_agent: nextAgent } }).eq('id', workspaceId);
      if (error) throw new HttpError(500, `Failed to save settings: ${error.message}`);
      return json({ settings: await inboxAgentSettings(db, workspaceId) });
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
      // Archived (soft-deleted) threads live in their own view for the 30-day restore window.
      q = payload.archived === true ? q.not('archived_at', 'is', null) : q.is('archived_at', null);
      // Optional label filter — restrict to threads carrying a given label.
      if (payload.label_id) {
        const { data: lt } = await db.from('inbox_thread_labels')
          .select('thread_id').eq('label_id', String(payload.label_id));
        const ids = (lt || []).map((r: { thread_id: string }) => r.thread_id);
        if (ids.length === 0) return json({ threads: [] });
        q = q.in('id', ids);
      }
      const { data: threads, error } = await q;
      if (error) throw new HttpError(500, error.message);

      // Attach labels for the returned threads in one round trip.
      const threadIds = (threads || []).map((t: Record<string, unknown>) => String(t.id));
      const labelsByThread = new Map<string, Array<{ id: string; name: string; color: string }>>();
      if (threadIds.length) {
        const { data: tl } = await db.from('inbox_thread_labels')
          .select('thread_id, inbox_labels(id, name, color)')
          .in('thread_id', threadIds);
        for (const r of (tl || []) as Array<{ thread_id: string; inbox_labels: { id: string; name: string; color: string } | null }>) {
          if (!r.inbox_labels) continue;
          const arr = labelsByThread.get(r.thread_id) || [];
          arr.push(r.inbox_labels);
          labelsByThread.set(r.thread_id, arr);
        }
      }

      // Attach the human assignees (active `user` participants) for the same threads. Assignment
      // is modelled as a participant row, not a column on the thread, so the mailbox list had no
      // way to show or filter by who owns a conversation without this second round trip.
      const assigneesByThread = new Map<string, Array<{ user_id: string; name: string; thread_role: string }>>();
      if (threadIds.length) {
        const { data: parts } = await db.from('inbox_participants')
          .select('thread_id, user_id, thread_role')
          .in('thread_id', threadIds)
          .eq('participant_type', 'member')
          .eq('status', 'active')
          .not('user_id', 'is', null);
        const partRows = (parts || []) as Array<{ thread_id: string; user_id: string; thread_role: string }>;
        const assigneeIds = [...new Set(partRows.map((p) => p.user_id))];
        const nameById = new Map<string, string>();
        if (assigneeIds.length) {
          const { data: profiles } = await db.from('user_profiles')
            .select('user_id, full_name, email').in('user_id', assigneeIds);
          for (const pr of (profiles || []) as Array<{ user_id: string; full_name: string | null; email: string | null }>) {
            const label = pr.full_name || pr.email;
            if (label) nameById.set(pr.user_id, label);
          }
        }
        for (const p of partRows) {
          const arr = assigneesByThread.get(p.thread_id) || [];
          // An unresolved profile still counts as an assignee — fall back to the id.
          arr.push({ user_id: p.user_id, name: nameById.get(p.user_id) || p.user_id, thread_role: p.thread_role });
          assigneesByThread.set(p.thread_id, arr);
        }
      }

      const enriched = (threads || []).map((t: Record<string, unknown>) => {
        const id = String(t.id);
        // Threads visible only via workspace membership (not an explicit participant) start unread.
        const lr = lastReadByThread.get(id);
        const unread = lastReadByThread.has(id)
          ? (!lr || new Date(String(t.last_message_at)) > new Date(lr))
          : true;
        return { ...t, unread, labels: labelsByThread.get(id) || [], assignees: assigneesByThread.get(id) || [] };
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
        // #247 A5p2 — carry the sourcing demand so accept can materialize an allocation
        demand_type: (payload.demand_type === 'order_item' || payload.demand_type === 'quote_item') ? payload.demand_type : null,
        demand_id: payload.demand_id ? String(payload.demand_id) : null,
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

    case 'accept_marketplace_inquiry': {
      // #247 A5p2 — SELLER accepts a surplus inquiry → materialize a DRAFT purchase
      // order (+ an on_order allocation, if the inquiry carried a sourcing demand) in
      // the BUYER's workspace. Cross-tenant write under the service role; the caller
      // must be a business member of the SELLER's (listing's) workspace.
      const acceptInquiryId = String(payload.inquiry_id || '');
      if (!acceptInquiryId) throw new HttpError(400, 'inquiry_id is required');

      const { data: inqRow } = await db.from('marketplace_inquiries')
        .select('id, listing_id, buyer_workspace_id, qty_wanted, status, inbox_thread_id, demand_type, demand_id, accepted_order_id')
        .eq('id', acceptInquiryId).maybeSingle();
      const inq2 = inqRow as Record<string, any> | null;
      if (!inq2) throw new HttpError(404, 'Inquiry not found');
      if (inq2.status === 'accepted' && inq2.accepted_order_id) {
        return json({ inquiry_id: acceptInquiryId, order_id: inq2.accepted_order_id, already: true });
      }
      if (inq2.status !== 'open') throw new HttpError(409, `Inquiry is ${inq2.status}, not open`);

      const { data: listingRow } = await db.from('marketplace_listings')
        .select('id, workspace_id, seller_name, title, price, currency, unit, status')
        .eq('id', inq2.listing_id).maybeSingle();
      const lst = listingRow as Record<string, any> | null;
      if (!lst) throw new HttpError(404, 'Listing not found');
      const sellerWs = String(lst.workspace_id);
      const buyerWs = String(inq2.buyer_workspace_id);

      const sellerRole = await callerRoleInWorkspace(db, userId, sellerWs);
      if (!sellerRole || !BUSINESS_ROLES.has(sellerRole)) {
        throw new HttpError(403, 'Only a member of the selling workspace can accept this inquiry');
      }

      const acceptQty = Number(payload.accepted_qty ?? inq2.qty_wanted ?? 1) || 1;
      const acceptPrice = Number(payload.unit_price ?? lst.price ?? 0) || 0;
      const acceptCurrency = lst.currency || 'EUR';
      const sellerName = lst.seller_name || 'Marketplace seller';

      // Seller's legal-entity VAT (if their workspace links one) → carried onto the buyer-side
      // supplier row, where the _crm_link_platform_supplier trigger links the canonical identity.
      let sellerVat: string | null = null; let sellerCountry: string | null = null;
      const { data: sellerWsRow } = await db.from('workspaces').select('parent_crm_company_id').eq('id', sellerWs).maybeSingle();
      const parentCo = (sellerWsRow as Record<string, any> | null)?.parent_crm_company_id;
      if (parentCo) {
        const { data: co } = await db.from('crm_companies').select('vat_number, country_code').eq('id', parentCo).maybeSingle();
        sellerVat = (co as Record<string, any> | null)?.vat_number ?? null;
        sellerCountry = (co as Record<string, any> | null)?.country_code ?? null;
      }

      // Find-or-create a supplier in the BUYER's workspace representing the seller.
      let supplierCompanyId: string;
      const { data: existingSup } = await db.from('crm_companies')
        .select('id').eq('workspace_id', buyerWs).eq('is_supplier', true).ilike('name', sellerName).maybeSingle();
      if (existingSup) {
        supplierCompanyId = (existingSup as Record<string, any>).id;
      } else {
        const { data: newSup, error: supErr } = await db.from('crm_companies')
          .insert({ workspace_id: buyerWs, name: sellerName, is_supplier: true, vat_number: sellerVat, country_code: sellerCountry })
          .select('id').single();
        if (supErr) throw new HttpError(500, `Failed to create supplier: ${supErr.message}`);
        supplierCompanyId = (newSup as Record<string, any>).id;
      }

      // Buyer-side product from the demand line, if any.
      let productId: string | null = null;
      if (inq2.demand_type === 'order_item' && inq2.demand_id) {
        const { data: di } = await db.from('order_items').select('product_id').eq('id', inq2.demand_id).eq('workspace_id', buyerWs).maybeSingle();
        productId = (di as Record<string, any> | null)?.product_id ?? null;
      } else if (inq2.demand_type === 'quote_item' && inq2.demand_id) {
        const { data: di } = await db.from('quote_items').select('product_id').eq('id', inq2.demand_id).maybeSingle();
        productId = (di as Record<string, any> | null)?.product_id ?? null;
      }

      const net = Math.round(acceptQty * acceptPrice * 100) / 100;

      const { data: ord, error: ordErr } = await db.from('orders').insert({
        workspace_id: buyerWs, order_type: 'purchase', status: 'draft',
        supplier_company_id: supplierCompanyId, currency: acceptCurrency,
        subtotal_net: net, vat_amount: 0, total: net,
        notes: `Sourced from marketplace listing "${lst.title || ''}" (${sellerName}).`,
      }).select('id').single();
      if (ordErr) throw new HttpError(500, `Failed to create purchase order: ${ordErr.message}`);
      const acceptOrderId = (ord as Record<string, any>).id;

      const { data: oi, error: oiErr } = await db.from('order_items').insert({
        order_id: acceptOrderId, workspace_id: buyerWs, product_id: productId,
        description: lst.title || 'Marketplace item', quantity: acceptQty,
        unit_price: acceptPrice, unit_cost: acceptPrice, supplier_company_id: supplierCompanyId,
        net_value: net, vat_amount: 0, line_total: net, update_warehouse: true, sort_order: 0,
      }).select('id').single();
      if (oiErr) throw new HttpError(500, `Failed to create order line: ${oiErr.message}`);
      const acceptOrderItemId = (oi as Record<string, any>).id;

      // on_order allocation against the sourcing demand (only when the inquiry carried one).
      if (inq2.demand_type && inq2.demand_id) {
        await db.from('stock_allocations').insert({
          workspace_id: buyerWs, demand_type: inq2.demand_type, demand_id: inq2.demand_id,
          product_id: productId, quantity: acceptQty, source_type: 'purchase_order',
          supply_order_item_id: acceptOrderItemId, status: 'on_order',
        });
      }

      // Decrement the seller's listing + close the inquiry.
      await db.rpc('mark_listing_sold', { p_id: lst.id, p_qty: acceptQty }).then(() => {}, () => {});
      await db.from('marketplace_inquiries')
        .update({ status: 'accepted', accepted_order_id: acceptOrderId, accepted_at: new Date().toISOString() })
        .eq('id', acceptInquiryId);

      // Notify the buyer on the inquiry thread.
      if (inq2.inbox_thread_id) {
        const { data: thr } = await db.from('inbox_threads').select('*').eq('id', inq2.inbox_thread_id).maybeSingle();
        const { data: sellerPart } = await db.from('inbox_participants')
          .select('id').eq('thread_id', inq2.inbox_thread_id).eq('user_id', userId).maybeSingle();
        if (thr) {
          await insertMessageAndNotify(db, {
            thread: thr as Record<string, unknown>,
            senderParticipantId: (sellerPart as Record<string, any> | null)?.id ?? null,
            body: `Inquiry accepted — a draft purchase order for ${acceptQty} ${lst.unit || ''} at ${acceptPrice} ${acceptCurrency} was created in your workspace.`.replace(/\s+/g, ' ').trim(),
            attachments: [], messageType: 'text', senderUserId: userId, senderLabel: `${sellerName} · marketplace`,
          });
        }
      }

      return json({ inquiry_id: acceptInquiryId, order_id: acceptOrderId, order_item_id: acceptOrderItemId });
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
      if (!contactId) return json({ contact: null, company: null, quotes: [], projects: [], invoices: [], metrics: null });

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

      // Finance context: the customer's invoices (linked by contact/company),
      // scoped to this thread's workspace. Aggregates → lifetime value + open
      // balance; the open (amount_due > 0) invoices drive the rail list. Open-
      // ness is derived from amount_due, not a status string, so it's robust to
      // the finance status vocabulary.
      const invFilter = [`customer_contact_id.eq.${contactId}`];
      if (companyId) invFilter.push(`customer_company_id.eq.${companyId}`);
      const { data: invRows } = await db
        .from('invoices')
        .select('id, total, amount_due, status, currency, due_at, issued_at, internal_number, legal_number')
        .eq('workspace_id', thread.workspace_id)
        .or(invFilter.join(','))
        .order('issued_at', { ascending: false })
        .limit(200);
      const allInv = (invRows || []) as Array<Record<string, unknown>>;
      const num = (v: unknown) => (typeof v === 'number' ? v : Number(v) || 0);
      const openInv = allInv.filter((i) => num(i.amount_due) > 0);
      const metrics = {
        currency: (allInv[0]?.currency as string) || (quotes?.[0]?.currency as string) || 'EUR',
        lifetime_value: allInv.reduce((s, i) => s + num(i.total), 0),
        open_balance: openInv.reduce((s, i) => s + num(i.amount_due), 0),
        invoice_count: allInv.length,
        open_count: openInv.length,
      };
      const invoices = openInv
        .slice()
        .sort((a, b) => String(a.due_at || '').localeCompare(String(b.due_at || '')))
        .slice(0, 6)
        .map((i) => ({
          id: i.id as string,
          number: (i.legal_number || i.internal_number || null) as string | null,
          amount_due: num(i.amount_due),
          currency: (i.currency as string) || metrics.currency,
          status: (i.status as string) || null,
          due_at: (i.due_at as string) || null,
        }));

      return json({ contact: contact || null, company, quotes: quotes || [], projects: projects || [], invoices, metrics });
    }

    case 'list_labels': {
      const workspaceId = String(payload.workspace_id || '');
      if (!workspaceId) throw new HttpError(400, 'workspace_id is required');
      const callerRole = await callerRoleInWorkspace(db, userId, workspaceId);
      if (!operator && !callerRole) throw new HttpError(403, 'You are not a member of that workspace');
      const { data: labels } = await db.from('inbox_labels')
        .select('id, name, color, created_at')
        .eq('workspace_id', workspaceId)
        .order('name', { ascending: true });
      return json({ labels: labels || [] });
    }

    case 'create_label': {
      const workspaceId = String(payload.workspace_id || '');
      const name = String(payload.name || '').trim();
      const color = String(payload.color || 'slate');
      if (!workspaceId || !name) throw new HttpError(400, 'workspace_id and name are required');
      const callerRole = await callerRoleInWorkspace(db, userId, workspaceId);
      if (!operator && callerRole !== 'owner' && callerRole !== 'admin') {
        throw new HttpError(403, 'Only a workspace owner or admin may manage labels');
      }
      const { data: label, error } = await db.from('inbox_labels')
        .insert({ workspace_id: workspaceId, name, color, created_by: userId })
        .select('id, name, color, created_at').single();
      if (error) {
        if ((error as { code?: string }).code === '23505') throw new HttpError(409, 'A label with that name already exists');
        throw new HttpError(500, error.message);
      }
      return json({ label });
    }

    case 'update_label': {
      const labelId = String(payload.label_id || '');
      if (!labelId) throw new HttpError(400, 'label_id is required');
      const { data: existing } = await db.from('inbox_labels').select('workspace_id').eq('id', labelId).maybeSingle();
      const wsId = (existing as { workspace_id?: string } | null)?.workspace_id;
      if (!wsId) throw new HttpError(404, 'Label not found');
      const callerRole = await callerRoleInWorkspace(db, userId, wsId);
      if (!operator && callerRole !== 'owner' && callerRole !== 'admin') {
        throw new HttpError(403, 'Only a workspace owner or admin may manage labels');
      }
      const patch: Record<string, unknown> = {};
      if (payload.name != null) patch.name = String(payload.name).trim();
      if (payload.color != null) patch.color = String(payload.color);
      const { data: label, error } = await db.from('inbox_labels').update(patch).eq('id', labelId)
        .select('id, name, color, created_at').single();
      if (error) throw new HttpError(500, error.message);
      return json({ label });
    }

    case 'delete_label': {
      const labelId = String(payload.label_id || '');
      if (!labelId) throw new HttpError(400, 'label_id is required');
      const { data: existing } = await db.from('inbox_labels').select('workspace_id').eq('id', labelId).maybeSingle();
      const wsId = (existing as { workspace_id?: string } | null)?.workspace_id;
      if (!wsId) throw new HttpError(404, 'Label not found');
      const callerRole = await callerRoleInWorkspace(db, userId, wsId);
      if (!operator && callerRole !== 'owner' && callerRole !== 'admin') {
        throw new HttpError(403, 'Only a workspace owner or admin may manage labels');
      }
      await db.from('inbox_labels').delete().eq('id', labelId); // cascade removes assignments
      return json({ ok: true });
    }

    case 'set_thread_labels': {
      const threadId = String(payload.thread_id || '');
      if (!threadId) throw new HttpError(400, 'thread_id is required');
      const labelIds = Array.isArray(payload.label_ids) ? payload.label_ids.map(String) : [];
      const thread = await getThreadOrThrow(db, threadId);
      const access = await resolveThreadAccess(db, userId, thread, operator);
      if (!access.isMember) throw new HttpError(403, 'Only thread members may label conversations');
      // Validate the labels belong to the thread's workspace (no cross-tenant labels).
      let valid: string[] = [];
      if (labelIds.length) {
        const { data: ok } = await db.from('inbox_labels')
          .select('id').eq('workspace_id', String(thread.workspace_id)).in('id', labelIds);
        valid = (ok || []).map((r: { id: string }) => r.id);
      }
      await db.from('inbox_thread_labels').delete().eq('thread_id', threadId);
      if (valid.length) {
        await db.from('inbox_thread_labels')
          .insert(valid.map((label_id) => ({ thread_id: threadId, label_id, created_by: userId })));
      }
      return json({ ok: true, label_ids: valid });
    }

    case 'create_customer_thread': {
      // A member starts a conversation WITH a customer (CRM contact). If the contact has a claimed
      // account they see it in their inbox + get notified; otherwise a /i/:token share link is returned.
      const workspaceId = String(payload.workspace_id || '');
      const contactId = String(payload.contact_id || '');
      if (!workspaceId || !contactId) throw new HttpError(400, 'workspace_id and contact_id are required');
      const callerRole = await callerRoleInWorkspace(db, userId, workspaceId);
      if (!operator && (!callerRole || !BUSINESS_ROLES.has(callerRole))) {
        throw new HttpError(403, 'Only a business member may start a customer conversation');
      }
      const { data: contact } = await db
        .from('crm_contacts')
        .select('id, name, first_name, last_name, user_id, workspace_id')
        .eq('id', contactId)
        .maybeSingle();
      const c = contact as {
        id?: string; name?: string; first_name?: string; last_name?: string; user_id?: string; workspace_id?: string;
      } | null;
      if (!c || c.workspace_id !== workspaceId) throw new HttpError(404, 'Contact not found in this workspace');

      const subject = payload.subject != null && String(payload.subject).trim()
        ? String(payload.subject).trim()
        : (c.name || [c.first_name, c.last_name].filter(Boolean).join(' ') || 'Customer conversation');

      const { data: thread, error } = await db.from('inbox_threads').insert({
        workspace_id: workspaceId, thread_type: 'customer', channel: 'internal',
        subject, created_by: userId, metadata: {},
      }).select('*').single();
      if (error) throw new HttpError(500, `Failed to create conversation: ${error.message}`);
      const threadId = (thread as { id: string }).id;

      // Creator (member owner) + the customer participant (user_id set when the contact has an
      // account so insertMessageAndNotify can fan a bell/email out to them).
      const { data: creatorP } = await db.from('inbox_participants').insert({
        thread_id: threadId, participant_type: 'member', user_id: userId,
        workspace_id: workspaceId, thread_role: 'owner', added_by: userId,
      }).select('id').single();
      await db.from('inbox_participants').insert({
        thread_id: threadId, participant_type: 'customer',
        contact_id: contactId, user_id: c.user_id ?? null,
        thread_role: 'participant', added_by: userId,
      });

      const firstMsg = payload.message != null ? String(payload.message).trim() : '';
      if (firstMsg) {
        await insertMessageAndNotify(db, {
          thread: thread as Record<string, unknown>,
          senderParticipantId: (creatorP as { id?: string } | null)?.id ?? null,
          body: firstMsg, attachments: [], messageType: 'text',
          senderUserId: userId, senderLabel: 'You',
        });
      }

      const share_url = c.user_id ? null : await getOrCreateShareLink(db, threadId, contactId);
      return json({ thread_id: threadId, share_url, has_account: !!c.user_id });
    }

    case 'create_share_link': {
      // A copyable /i/:token link for an existing customer/upstream thread.
      const threadId = String(payload.thread_id || '');
      if (!threadId) throw new HttpError(400, 'thread_id is required');
      const thread = await getThreadOrThrow(db, threadId);
      const access = await resolveThreadAccess(db, userId, thread, operator);
      if (!access.isMember) throw new HttpError(403, 'Only thread members may create a share link');
      if (String(thread.thread_type) === 'internal') {
        throw new HttpError(400, 'Internal team conversations cannot be shared');
      }
      const { data: cust } = await db.from('inbox_participants')
        .select('contact_id').eq('thread_id', threadId).eq('participant_type', 'customer')
        .not('contact_id', 'is', null).limit(1).maybeSingle();
      const url = await getOrCreateShareLink(db, threadId, (cust as { contact_id?: string } | null)?.contact_id ?? null);
      return json({ url });
    }

    case 'suggest_reply': {
      // "Help me write" — the assistant drafts the next reply for a member to review/edit/send.
      // Uses the same injection-proof, thread-scoped brain as the auto-reply, but returns the draft
      // instead of posting it. Billed to the workspace pool (member's balance) like an auto-reply.
      const threadId = String(payload.thread_id || '');
      if (!threadId) throw new HttpError(400, 'thread_id is required');
      const thread = await getThreadOrThrow(db, threadId);
      const access = await resolveThreadAccess(db, userId, thread, operator);
      if (!access.isMember) throw new HttpError(403, 'Only thread members may draft AI replies');
      const workspaceId = String(thread.workspace_id);

      const { data: debit } = await db.rpc('debit_credits', {
        p_user_id: userId,
        p_amount: INBOX_AGENT_REPLY_COST,
        p_operation_type: 'inbox_agent_suggest',
        p_description: 'Inbox AI draft reply (help me write)',
        p_metadata: { thread_id: threadId, billing_type: 'inbox_agent_suggest' },
        p_workspace_id: workspaceId,
      });
      const debitRes = Array.isArray(debit) ? debit[0] : debit;
      if (!debitRes?.success) throw new HttpError(402, 'Not enough credits for an AI draft');

      const draft = await buildAgentDraft(db, thread);
      if (!draft) {
        // Nothing to say — refund the debit so a blank draft isn't charged.
        await db.rpc('refund_credits', {
          p_user_id: userId, p_amount: INBOX_AGENT_REPLY_COST,
          p_operation_type: 'inbox_agent_suggest_refund',
          p_description: 'Refund — AI draft produced no text',
          p_metadata: { thread_id: threadId }, p_workspace_id: workspaceId,
        }).catch(() => {});
        throw new HttpError(502, 'The assistant could not draft a reply — try again.');
      }
      return json({ draft });
    }

    case 'archive_thread': {
      // Soft-delete: moves the thread into the 30-day Archived view (purge cron deletes after).
      const threadId = String(payload.thread_id || '');
      if (!threadId) throw new HttpError(400, 'thread_id is required');
      const thread = await getThreadOrThrow(db, threadId);
      const access = await resolveThreadAccess(db, userId, thread, operator);
      if (!access.isMember) throw new HttpError(403, 'Only thread members may archive conversations');
      await db.from('inbox_threads')
        .update({ archived_at: new Date().toISOString(), status: 'closed' }).eq('id', threadId);
      return json({ ok: true });
    }

    case 'restore_thread': {
      const threadId = String(payload.thread_id || '');
      if (!threadId) throw new HttpError(400, 'thread_id is required');
      const thread = await getThreadOrThrow(db, threadId);
      const access = await resolveThreadAccess(db, userId, thread, operator);
      if (!access.isMember) throw new HttpError(403, 'Only thread members may restore conversations');
      await db.from('inbox_threads')
        .update({ archived_at: null, status: 'open' }).eq('id', threadId);
      return json({ ok: true });
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

// ── Public "Hire me" contact form (PublicProfilePage → HireMeModal) ───────────────────────────
// The modal is rendered on a PUBLIC profile page with no auth gate, but it wrote to
// profile_contact_requests straight from the browser and RLS only allows `authenticated` — so a
// logged-out visitor always got "Failed to send". The form was inert for exactly the audience it
// exists to serve. It posts here instead: Turnstile-gated, rate-limited, service-role insert.
const CONTACT_MAX_PER_RECIPIENT_HOUR = 20;   // stops one profile being flooded
const CONTACT_MAX_PER_SENDER_WINDOW = 3;
const CONTACT_SENDER_WINDOW_MS = 10 * 60_000;

function clientIp(req: Request): string {
  return (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || '0.0.0.0';
}

async function verifyTurnstile(db: SupabaseClient, token: string, ip: string): Promise<boolean> {
  // Resolve through resolveSecret (env-first, then platform_secrets) — NOT Deno.env.get.
  // bootstrapForFunction() is supposed to copy platform_secrets into env, but it does that via
  // Deno.env.set, which this runtime denies (the bootstrap swallows the throw by design). Verified
  // live: with TURNSTILE_SECRET_KEY populated in platform_secrets and the function freshly
  // redeployed, Deno.env.get still returned undefined and this check silently failed OPEN.
  const secret = (await resolveSecret(db, 'TURNSTILE_SECRET_KEY').catch(() => ({ value: null })))?.value;
  if (!secret) return true; // genuinely not configured → fail-open, same contract as hr-careers
  const r = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    body: new URLSearchParams({ secret, response: token, remoteip: ip }),
  });
  return !!(await r.json().catch(() => ({ success: false }))).success;
}

async function handleProfileContact(db: SupabaseClient, req: Request, payload: Json): Promise<Response> {
  const toUserId = String((payload as Record<string, unknown>).to_user_id ?? '').trim();
  const name = String((payload as Record<string, unknown>).from_name ?? '').trim().slice(0, 200);
  const email = String((payload as Record<string, unknown>).from_email ?? '').trim().slice(0, 200);
  const message = String((payload as Record<string, unknown>).message ?? '').trim().slice(0, 5000);
  const servicesRaw = (payload as Record<string, unknown>).services_requested;
  const services = Array.isArray(servicesRaw)
    ? servicesRaw.map((s) => String(s).slice(0, 120)).slice(0, 20)
    : null;

  if (!toUserId || !name || !email || !message) throw new HttpError(400, 'name, email and message are required');
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new HttpError(400, 'Please enter a valid email address.');

  // The recipient must be a real profile; never let a caller aim a request at an arbitrary uuid.
  const { data: recipient } = await db.from('user_profiles').select('user_id').eq('user_id', toUserId).maybeSingle();
  if (!recipient) throw new HttpError(404, 'Profile not found');

  const since = new Date(Date.now() - CONTACT_SENDER_WINDOW_MS).toISOString();
  const hourAgo = new Date(Date.now() - 3_600_000).toISOString();
  const [{ count: bySender }, { count: byRecipient }] = await Promise.all([
    db.from('profile_contact_requests').select('*', { count: 'exact', head: true })
      .eq('from_email', email).gte('created_at', since),
    db.from('profile_contact_requests').select('*', { count: 'exact', head: true })
      .eq('to_user_id', toUserId).gte('created_at', hourAgo),
  ]);
  if ((bySender ?? 0) >= CONTACT_MAX_PER_SENDER_WINDOW || (byRecipient ?? 0) >= CONTACT_MAX_PER_RECIPIENT_HOUR) {
    throw new HttpError(429, 'Too many messages right now — please try again later.');
  }

  // Bot check LAST, immediately before the write. Everything above is a cheap local guard
  // (shape, recipient exists, rate limit) with no side effects, so running them first means a
  // malformed or flooding request never burns a Turnstile verification — and it keeps those
  // guards observable to an automated caller that cannot mint a challenge token.
  if (!(await verifyTurnstile(db, String((payload as Record<string, unknown>).turnstile_token ?? ''), clientIp(req)))) {
    throw new HttpError(400, 'Bot check failed — please retry.');
  }

  // is_read is set server-side: a sender must never be able to pre-mark their own message read.
  const { error } = await db.from('profile_contact_requests').insert({
    to_user_id: toUserId, from_name: name, from_email: email, message,
    services_requested: services && services.length ? services : null, is_read: false,
  });
  if (error) throw new HttpError(400, 'Could not send your message.');

  // Same event the authenticated client path emits — the seeded "Hire Me Received" flow owns
  // delivery, so an admin can retarget it without a deploy.
  await emitFlowEvent('hire_me_received', {
    user_id: toUserId, to_user_id: toUserId, type: 'hire_me',
    title: `New hire request from ${name}`,
    body: services && services.length ? `Interested in: ${services.join(', ')}` : message.slice(0, 100),
    action_url: '/profile?tab=inbox',
    from_name: name, from_email: email, services_requested: services ?? [],
    sent_at: new Date().toISOString(),
  }).catch(() => {});

  return json({ ok: true });
}

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

  // Pentest #250 C17: token_claim is the POST-signup conversion handshake — it enrolls a
  // user into the dealer workspace and links their account to the CRM contact. It must be
  // AUTHENTICATED and adopt the caller's OWN id; previously it took user_id from the body
  // on the unauthenticated token path, letting anyone with the invite token force-enroll an
  // arbitrary victim. Require a JWT and override any body user_id with the verified caller.
  if (action === 'token_claim') {
    const claimAuth = await authenticate(req, { requireUser: true });
    if (!claimAuth.success || !claimAuth.userId) {
      return json({ error: claimAuth.error || 'Unauthorized' }, 401);
    }
    return handleTokenAction(db, action, { ...payload, user_id: claimAuth.userId });
  }

  // Public branch — genuinely anonymous visitor on a public profile page. Turnstile + rate
  // limited inside the handler; writes only profile_contact_requests.
  if (action === 'profile_contact') {
    return handleProfileContact(db, req, payload);
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
