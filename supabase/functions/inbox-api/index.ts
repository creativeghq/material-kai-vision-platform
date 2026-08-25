// inbox-api — Multi-Tenant Inbox (P1: schema + directional ACL + channel send-router).
// One action-discriminated edge function (merge rule). Two auth branches in one function
// (precedent: moodboard-sheet-share resolves both a JWT and a token path):
//   • JWT actions  — authenticated member/operator/customer-account flows.
//   • Token actions — service-role, unauthenticated; a tokenized customer with scoped
//                     read/reply to ONE thread, plus the token_claim conversion handshake.
// All directional ACL walls (operator↔everyone, dealer↔customer, sales jump-in, etc.) are
// enforced HERE at thread-create / participant-add time — never at read time. RLS on the
// tables only gates direct client reads/realtime to "active participant OR platform operator".
// Channel send-router: an `internal` thread stores only; `whatsapp`, `email` and `social`
// threads store AND relay (WhatsApp via Zernio's inbox, with Meta's 24h service window
// applying — freeform in-window; `social` via Zernio's comment or DM endpoint depending on
// what kind of social thread it is).

import type { DbClient } from '../_shared/supabase-client.ts';
import { jsonResponse as json } from '../_shared/http.ts';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { corsHeaders } from '../_shared/cors.ts';
import { withApiLogging, HttpError } from '../_shared/api-logger.ts';
import { authenticate } from '../_shared/auth.ts';
import { emitFlowEvent, emitFlowEventToWorkspaceRoles, emitInboxMessageEvent } from '../_shared/flow-events.ts';
import { inboxAutopilotSettings } from '../_shared/inbox-autopilot.ts';
import { runInBackground } from '../_shared/background.ts';
import { formatBusinessIdentityForPrompt, resolveBusinessIdentity } from '../_shared/business-identity.ts';
import {
  sendWhatsAppReply, sendWhatsAppMessage, setMessageReaction,
  sendSocialCommentReply, sendSocialDirectMessage,
  sendCommentPrivateReply, setCommentHidden, markConversationRead,
  ensureZernioSecrets, fetchLastInboundAt,
} from '../_shared/zernio.ts';
import {
  allocateUserEmailAddress,
  buildOutboundMessageId,
  buildReplyToAddress,
  resolveCustomer,
} from '../_shared/inbound-email.ts';
import {
  intakeDisplayTotal,
  orderIntakeSettings,
  readIntake,
  runOrderIntake,
  writeIntake,
  type IntakeConfirmation,
  type IntakeItem,
  type OrderIntake,
} from '../_shared/order-intake/index.ts';
import { matchByText } from '../_shared/order-intake/match.ts';
import { resolveLinePrice } from '../_shared/order-intake/price.ts';
import { bootstrapForFunction } from '../_shared/secrets-bootstrap.ts';
import { resolveSecret } from '../_shared/secrets.ts';
import { isWorkspaceEntitled } from '../_shared/entitlement.ts';
import { tool } from 'npm:ai@6';
import { z } from 'npm:zod@3';
import { getAgentSystemPrompt, loadPrompt } from '../_shared/prompt-utils.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

const ATTACHMENT_BUCKET = 'generation-images';
const DEFAULT_INBOX_AGENT_ID = 'kai';
/** Receiving domain for inbound mail (#342). Overridable via the INBOUND_EMAIL_DOMAIN secret. */
const DEFAULT_INBOUND_DOMAIN = 'mail.materialshub.gr';
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


const ACTIVE_MEMBER = (s: string | null | undefined) => !s || s === 'active';
const BUSINESS_ROLES = new Set(['owner', 'admin', 'member', 'staff', 'sales']);

/** Global platform operator: admin/super_admin global role OR owner/admin of the root workspace. */
async function isOperator(db: DbClient, userId: string): Promise<boolean> {
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
  db: DbClient,
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

async function parentWorkspaceId(db: DbClient, workspaceId: string): Promise<string | null> {
  const { data } = await db
    .from('workspaces')
    .select('parent_workspace_id')
    .eq('id', workspaceId)
    .maybeSingle();
  return (data as { parent_workspace_id?: string } | null)?.parent_workspace_id ?? null;
}

/** The caller's active participant row in a thread (any participant type), or null. */
async function callerParticipant(db: DbClient, threadId: string, userId: string) {
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
 * Shared-inbox access resolution — a team inbox, not a single-owner inbox.
 * A thread is reachable when the caller is the platform operator, an explicit active
 * participant, OR a business member of the thread's workspace on a shared customer/upstream
 * thread (sales jump-in). `internal` threads stay strictly participant-scoped — they are
 * private team DMs. `isMember` controls private-note visibility + member-only controls.
 */
async function resolveThreadAccess(
  db: DbClient,
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
  db: DbClient,
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
 *
 * `inbox_messages` answers this for any thread whose inbound messages we hold, which is almost
 * all of them — the live webhook files every one. It does NOT answer it for a thread we hold no
 * inbound message for, and those exist: a thread born from a `message.sent` echo (the operator
 * writes from their handset under coexistence) is created around an OUTBOUND message with none of
 * the conversation's history behind it. There, "no incoming row" is a fact about our table and not
 * about the customer, and treating the two as one produced a banner the operator could see was
 * absurd — thread c7e4f75a showed a single message sent twenty minutes earlier under "the 24-hour
 * reply window has closed", while the customer's actual last message sat in Zernio dated 18 days
 * back. Both readings said "closed"; only one of them was an answer.
 *
 * So: local first, and ask Zernio only when local has nothing to say. That keeps the common path
 * to one indexed read, and it is self-limiting — the moment a real inbound message arrives the
 * local answer takes over for good.
 *
 * The verdict still FAILS CLOSED. `source` says how it was reached so the caller can tell a
 * measured "closed" from an unknown one, and `open` is false for both: Meta would reject the send
 * anyway, and a stored message the customer never receives is worse than a blocked composer.
 */
async function whatsappWindow(
  db: DbClient,
  threadId: string,
  thread?: Record<string, unknown>,
): Promise<{
  open: boolean;
  last_inbound_at: string | null;
  expires_at: string | null;
  source: 'local' | 'provider' | 'unknown';
}> {
  const { data } = await db
    .from('inbox_messages')
    .select('created_at')
    .eq('thread_id', threadId)
    .eq('metadata->>direction', 'incoming')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  let last = (data as { created_at?: string } | null)?.created_at ?? null;
  let source: 'local' | 'provider' | 'unknown' = 'local';

  if (!last) {
    // Our mirror is silent. Ask the system that owns the conversation before calling it shut.
    const t = thread ?? await db.from('inbox_threads').select('metadata').eq('id', threadId)
      .maybeSingle().then((r) => (r.data as Record<string, unknown> | null) ?? undefined);
    const meta = ((t?.metadata as Record<string, unknown> | undefined) ?? {});
    const fromProvider = await fetchLastInboundAt({
      accountId: String(meta.zernio_account_id ?? ''),
      conversationId: String(meta.zernio_conversation_id ?? ''),
    });
    if (fromProvider === undefined) {
      // Could not find out. Say so rather than reporting a conversation that has never been
      // written to — the operator reads the difference, and the composer blocks either way.
      return { open: false, last_inbound_at: null, expires_at: null, source: 'unknown' };
    }
    last = fromProvider;
    source = 'provider';
  }

  if (!last) return { open: false, last_inbound_at: null, expires_at: null, source };
  const expires = new Date(new Date(last).getTime() + 24 * 3600 * 1000);
  return { open: expires > new Date(), last_inbound_at: last, expires_at: expires.toISOString(), source };
}

async function getThreadOrThrow(db: DbClient, threadId: string) {
  const { data } = await db
    .from('inbox_threads')
    .select('*')
    .eq('id', threadId)
    .maybeSingle();
  if (!data) throw new HttpError(404, 'Thread not found');
  return data as Record<string, unknown>;
}

/** First active owner/admin of a workspace — the billing user for agent replies. */
async function workspaceOwner(db: DbClient, workspaceId: string): Promise<string | null> {
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
async function inboxAgentSettings(db: DbClient, workspaceId: string): Promise<InboxAgentSettings> {
  // Delegated, not restated. This was the fourth hand-written copy of `auto_respond !== false`
  // and they have to agree: the WhatsApp webhook decides whether a thread is BORN handed to the
  // assistant, and this decides the same for a thread created through the API. One saying yes
  // where the other says no is a workspace where autopilot depends on which door the customer
  // came through. See _shared/inbox-autopilot.ts for what the default is and why.
  return await inboxAutopilotSettings(db, workspaceId);
}

/** The customer this thread is about: the active customer participant's CRM contact + their company. */
async function resolveThreadCustomerScope(
  db: DbClient,
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
 * Editable inbox-agent persona/policy — `prompts` row (prompt_type='agent', category='inbox').
 *
 * There is no inline fallback, and that is the point. A byte-similar
 * FALLBACK_INBOX_PERSONA used to sit here behind `|| `, loaded with a query whose
 * error was DISCARDED (`const { data } = await ...`). supabase-js resolves rather
 * than throws on an RLS denial, so a permissions change or a database blip would
 * have swapped the operator's edited persona for the hardcoded one — silently,
 * indefinitely, with every health signal green. `_shared/rerank.ts` has the same
 * story written in its comments: its FALLBACK_PROMPT ran 100% of the time while
 * the admin's row sat in the table untouched.
 *
 * getAgentSystemPrompt reads `system_prompt` specifically. That matters here: this
 * row's `prompt_text` is a placeholder note ("this column is unused for the inbox
 * agent"), so a naive swap to the generic loadPrompt() — which prefers prompt_text
 * — would have replaced the whole persona with that sentence.
 */
async function loadInboxAgentPersona(db: DbClient): Promise<string> {
  return await getAgentSystemPrompt(db, 'inbox');
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
/**
 * Order intake (#342 §3). Runs immediately BEFORE `maybeRunAgentReply` at every place an inbound
 * customer message lands, so both channels get it from one chokepoint and neither webhook needed
 * a change.
 *
 * It produces a PROPOSAL on `inbox_threads.metadata.order_intake`. Nothing reaches `orders` until
 * a member approves it — see `create_order_from_thread_intake`.
 *
 * Same guard as the agent reply: only a fresh inbound CUSTOMER text triggers it, so the assistant
 * quoting an order back, a member's reply, or a system event cannot re-trigger extraction and
 * re-bill for it. Best-effort throughout — a failure leaves the thread for a human.
 */
async function maybeRunOrderIntake(db: DbClient, threadId: string): Promise<void> {
  try {
    const thread = await getThreadOrThrow(db, threadId);
    const workspaceId = String(thread.workspace_id);

    const settings = await orderIntakeSettings(db, workspaceId);
    if (!settings.enabled) return;

    // Loop / human-takeover guard, identical to maybeRunAgentReply's.
    const { data: history } = await db
      .from('inbox_messages')
      .select('message_type, sender_participant_id')
      .eq('thread_id', threadId)
      .is('deleted_at', null)
      .neq('message_type', 'note')
      .order('created_at', { ascending: false })
      .limit(1);
    const latest = ((history || []) as Array<{ message_type: string; sender_participant_id: string | null }>)[0];
    if (!latest || latest.message_type !== 'text' || !latest.sender_participant_id) return;
    const { data: sender } = await db.from('inbox_participants')
      .select('participant_type').eq('id', latest.sender_participant_id).maybeSingle();
    if ((sender as { participant_type?: string } | null)?.participant_type !== 'customer') return;

    const owner = await workspaceOwner(db, workspaceId);
    if (!owner) return;

    const scope = await resolveThreadCustomerScope(db, threadId);
    const result = await runOrderIntake(db, {
      threadId,
      workspaceId,
      channel: String(thread.channel),
      ownerUserId: owner,
      contactId: scope.contactId,
      companyId: scope.companyId,
      settings,
    });

    // Log the no-op reason too. "Intake never fires" must be diagnosable rather than silent —
    // an empty result and a disabled toggle look identical from the outside otherwise.
    if (!result.ran) {
      console.log(`[inbox-api] order intake skipped on ${threadId}: ${result.reason}`);
      return;
    }

    // A proposal is a business event: tell the people who can approve it.
    await emitFlowEventToWorkspaceRoles(
      workspaceId, ['owner', 'admin'], 'inbox.order_intake_ready',
      (uid: string) => ({
        type: 'inbox_order_intake', user_id: uid, workspace_id: workspaceId,
        thread_id: threadId,
        title: 'An order arrived in the Inbox',
        body: `${result.intake?.items.length ?? 0} line(s) read from a ${thread.channel} conversation — review and approve.`,
        action_url: `/inbox?thread=${threadId}`,
      }),
    ).catch(() => {});
  } catch (e) {
    console.warn('[inbox-api] order intake failed:', e instanceof Error ? e.message : String(e));
  }
}

async function maybeRunAgentReply(db: DbClient, threadId: string): Promise<void> {
  try {
    const thread = await getThreadOrThrow(db, threadId);
    if (thread.agent_state !== 'active') return;
    const workspaceId = String(thread.workspace_id);

    // Recent conversation (exclude private notes), newest first — used for the guard and transcript.
    const { data: history } = await db
      .from('inbox_messages')
      .select('body, message_type, sender_participant_id, metadata')
      .eq('thread_id', threadId)
      .is('deleted_at', null)
      .neq('message_type', 'note')
      .order('created_at', { ascending: false })
      .limit(20);
    const rows = (history || []) as Array<{
      body: string | null; message_type: string; sender_participant_id: string | null; metadata: Json | null;
    }>;

    // Loop / human-takeover guard: only answer when the most recent message is a fresh inbound
    // CUSTOMER text. Skip if it was the assistant (already replied), a member (staff is handling),
    // or a system event — prevents double-replies, billing loops, and talking over a human.
    const latest = rows[0];
    if (!latest || latest.message_type !== 'text') return;

    if (latest.sender_participant_id) {
      const { data: latestSender } = await db.from('inbox_participants')
        .select('participant_type').eq('id', latest.sender_participant_id).maybeSingle();
      if ((latestSender as { participant_type?: string } | null)?.participant_type !== 'customer') return;
    } else {
      // An EXTERNAL author with no participant row. Social counterparties are a handle with
      // neither phone nor email and they never read this inbox, so they get no participant row
      // — and this guard, which proved "is a customer" by looking one up, therefore rejected
      // every social message and the agent could never answer one. `direction: 'incoming'` on
      // the message is the equivalent proof: our own relay always writes 'outgoing'.
      if ((latest.metadata as Json | null)?.direction !== 'incoming') return;
    }

    const owner = await workspaceOwner(db, workspaceId);
    if (!owner) return;

    // ── Billing ──────────────────────────────────────────────────────────
    // No debit here any more, and no refund, because there is nothing left to refund.
    //
    // This used to charge a FLAT one-credit fee before generating, then hand it back on
    // a blank draft or a failed post. That fee was calibrated for what this function used to be: a
    // single ~700-token call with three tools. The turn now runs on JARVIS, where cost depends on
    // what the question needed — a grounded, tool-using answer is not the same purchase as a
    // one-liner, and pretending otherwise would either overcharge every short reply or quietly
    // subsidise every long one.
    //
    // agent-chat already meters the real turn into `agent_usage_logs` against `owner`, and gates
    // it up front with `preflight_credits` — which returns 402 when the owner cannot pay, and
    // `buildAgentDraft` turns that into an empty draft, i.e. exactly the old "leave it for a
    // human" outcome. Keeping our own debit on top would be two ledgers for one reply, which is
    // the precise shape that made `credit_transactions` and `ai_usage_logs` disagree about which
    // feature had run (see `billedTo` below).
    let replyText: string;
    try {
      replyText = await buildAgentDraft(db, thread, { userId: owner, task: 'inbox_agent_reply' });
    } catch (draftErr) {
      throw draftErr;
    }
    if (!replyText) return;

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
      throw postErr;
    }
  } catch (e) {
    console.warn('[inbox-api] agent reply failed:', e instanceof Error ? e.message : String(e));
  }
}

/** A file the model cannot open, named so it can at least say what arrived. */
interface TranscriptAttachment { name?: string; filename?: string; type?: string; mime_type?: string }

/**
 * The conversation as the model reads it.
 *
 * Two things this fixes, both of which the one-line `.map()` it replaced got wrong.
 *
 * **1. The speakers were merged.** Every row was labelled `Customer/Team` unless it was the
 * assistant's own — and a member's reply is `message_type='text'` exactly like the customer's, so
 * there was no way to tell "the customer asked for a discount" from "my colleague offered one".
 * The participant row is what separates them, and it is the same read the reply guard already
 * trusts to decide whether the latest message is even answerable.
 *
 * **2. An attachment was invisible.** `m.body || '[attachment]'` only fired when the body was
 * EMPTY, so an email carrying an invoice PDF *and* a covering sentence rendered as the sentence
 * alone. The model then answered as though nothing had been sent. Naming the file does not let it
 * read the file — it lets it say "I can see invoice-4471.pdf and I've passed it to the team",
 * which is true, instead of "I can't open PDFs", which reads as a refusal.
 *
 * Provider placeholders (`[Unsupported message]` from Zernio, for a WhatsApp document we never
 * downloaded) are rewritten to say what actually happened. Left alone, the model treats the phrase
 * as the customer's words and argues with it — which is precisely how one thread went, three
 * messages deep, while the customer insisted they had sent the invoice.
 */
const PROVIDER_PLACEHOLDER_BODIES = new Set(['[unsupported message]', '[unsupported]', '[media]']);

async function buildTranscript(
  db: DbClient,
  threadId: string,
  rows: Array<{
    body: string | null; message_type: string; attachments: Json | null; sender_participant_id: string | null;
  }>,
): Promise<string> {
  // One read for every speaker in the window, rather than one per message.
  const { data: parts } = await db.from('inbox_participants')
    .select('id, participant_type').eq('thread_id', threadId);
  const typeById = new Map<string, string>(
    ((parts || []) as Array<{ id: string; participant_type: string }>)
      .map((p) => [p.id, p.participant_type]),
  );

  const speaker = (m: { message_type: string; sender_participant_id: string | null }): string => {
    if (m.message_type === 'agent') return 'Assistant (you, earlier)';
    if (m.message_type === 'system') return 'System';
    const t = m.sender_participant_id ? typeById.get(m.sender_participant_id) : undefined;
    if (t === 'customer') return 'Customer';
    if (t === 'member') return 'Our team';
    if (t === 'agent') return 'Assistant (you, earlier)';
    // No participant row. Social counterparties never get one (a handle with no phone and no
    // email), so an external author is the likeliest reading — but it is a guess, and the label
    // says so rather than picking a side.
    return 'Customer (unidentified sender)';
  };

  const files = (raw: Json | null): string => {
    const list = Array.isArray(raw) ? (raw as TranscriptAttachment[]) : [];
    const names = list
      .map((a) => (a && typeof a === 'object' ? (a.name || a.filename || a.type || a.mime_type) : null))
      .filter((n): n is string => typeof n === 'string' && n.trim().length > 0)
      .slice(0, 5);
    if (!names.length) return '';
    return ` [attached, and you CANNOT open it: ${names.join(', ')}]`;
  };

  return rows.slice().reverse().map((m) => {
    const raw = (m.body || '').trim();
    let body = raw;
    if (!raw) {
      body = '[sent something with no text]';
    } else if (PROVIDER_PLACEHOLDER_BODIES.has(raw.toLowerCase())) {
      body = '[sent a file or media that did not reach us in a readable form — these are NOT their '
        + 'words, so do not quote them back or argue about them]';
    }
    return `${speaker(m)}: ${body}${files(m.attachments)}`;
  }).join('\n');
}

/**
 * Generate the agent's next-reply draft for a thread — the shared brain behind both the auto-reply
 * (maybeRunAgentReply) and the member-initiated "help me write" suggestion (suggest_reply action).
 * Pure: reads the transcript + (injection-proof, thread-scoped) account tools and returns the text.
 * Does NOT post, bill, or guard — the callers own that.
 */
/**
 * `billedTo` is who the draft is FOR, and which of the two entry points asked for it.
 *
 * Both callers debit credits — the auto-reply bills the workspace owner as `inbox_agent_reply`,
 * "help me write" bills the requesting member as `inbox_agent_suggest` — and neither told the AI
 * usage log any of it. So the rows landed with no user, no workspace, and BOTH labelled
 * `inbox_agent_reply`, which meant `credit_transactions` and `ai_usage_logs` disagreed about which
 * feature had run. The workspace is read off the thread below; the rest has to be passed.
 */
async function buildAgentDraft(
  db: DbClient,
  thread: Record<string, unknown>,
  billedTo: { userId?: string; task: 'inbox_agent_reply' | 'inbox_agent_suggest' },
): Promise<string> {
  const threadId = String(thread.id);
  const workspaceId = String(thread.workspace_id);
  const { data: history } = await db
    .from('inbox_messages')
    .select('body, message_type, attachments, sender_participant_id')
    .eq('thread_id', threadId)
    .is('deleted_at', null)
    .neq('message_type', 'note')
    .order('created_at', { ascending: false })
    .limit(20);
  const rows = (history || []) as Array<{
    body: string | null; message_type: string; attachments: Json | null; sender_participant_id: string | null;
  }>;
  const transcript = await buildTranscript(db, threadId, rows);
  if (!transcript.trim()) return '';

  /**
   * Tell the assistant how this customer sounds, using the SAME reading the drawer shows.
   *
   * Without it the reply is written blind: an apology owed to somebody chasing a third time
   * reads identically to a cheerful confirmation, because the model sees the words and not the
   * temperature of them. It is usually free — the drawer's read is cached against the last
   * message id, and this asks for the same one.
   *
   * Best-effort on purpose. A failed reading must not cost the customer their reply, so a throw
   * here degrades to the plain transcript rather than to silence.
   */
  let agentInput = transcript;
  try {
    // The operator's switch for the RECURRING cost specifically. `enabled` still gates the read
    // itself; this one lets them keep the drawer button while the assistant stops paying for it
    // on every inbound message.
    const { autoOnAgentReply } = await sentimentSettings(db, workspaceId);
    if (!autoOnAgentReply) throw new Error('disabled by the operator');
    const { sentiment } = await readConversationSentiment(
      db, threadId, thread.metadata as Record<string, unknown> | null, false,
      workspaceId, billedTo.userId ?? null,
    );
    if (sentiment) {
      const guidance = Array.isArray(sentiment.reply_guidance)
        ? (sentiment.reply_guidance as string[]).map((g) => `- ${g}`).join('\n')
        : '';
      agentInput =
        `<conversation_reading>\n`
        + `The customer currently reads as: ${sentiment.mood} (urgency: ${sentiment.urgency}).\n`
        + `${sentiment.summary}\n`
        + (sentiment.open_question ? `Still unanswered: "${sentiment.open_question}"\n` : '')
        + (sentiment.suggested_tone ? `Match this tone: ${sentiment.suggested_tone}\n` : '')
        + (guidance ? `Do this in your reply:\n${guidance}\n` : '')
        + `</conversation_reading>\n\n${transcript}`;
    }
  } catch (err) {
    // Includes the operator having switched it off, which is not a fault — the reply simply goes
    // out without the tone hint, exactly as it did before this feature existed.
    console.warn('[inbox-api] sentiment unavailable for the agent reply:', err instanceof Error ? err.message : String(err));
  }

  // ── The turn runs on JARVIS ──────────────────────────────────────────────
  // Everything that made this function clever used to live HERE — a persona, a hand-built tool
  // map, a hand-built system prompt, one `generateWithClaudeTools` call. All of it is gone, and
  // that is the change: there is ONE assistant on this platform and the Inbox runs it. A customer
  // conversation now gets the same 36k system prompt, the same shared operating doctrine, the same
  // unconditional grounding in the workspace's own documents and the same reasoning the operator
  // gets in their own chat — so improving JARVIS improves every customer conversation, instead of
  // improving one of two assistants while the customer-facing one stays at 816 characters.
  //
  // `audience: 'customer'` is what makes that safe rather than reckless. agent-chat clamps 166
  // tools down to a read-only handful, drops long-term memory in BOTH directions, unbinds the
  // meta-tools and fences this transcript as DATA. The clamp is on the agent's PERMITTED set, so
  // `load_toolkit` cannot widen it either. See `_shared/customer-audience.ts`.
  //
  // Only the service-role bearer may claim that audience, which is why this is a function-to-
  // function call and not something the browser could ever make.
  const resp = await fetch(`${SUPABASE_URL}/functions/v1/agent-chat`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      agentId: DEFAULT_INBOX_AGENT_ID,
      audience: 'customer',
      thread_id: threadId,
      workspace_id: workspaceId,
      // Attribution and billing. agent-chat meters the turn into `agent_usage_logs` against this
      // user, which is why `maybeRunAgentReply` no longer debits a flat fee of its own — two
      // ledgers for one reply is how `credit_transactions` and `ai_usage_logs` came to disagree
      // about which feature had run.
      user_id: billedTo.userId ?? null,
      // ONE synthetic user message holding the whole transcript. Not a replayed message array:
      // the roles here are Customer / Our team / Assistant, which is not the two-role shape a
      // chat history has, and flattening it into `user`/`assistant` would tell the model that a
      // colleague's sentence was its own.
      messages: [{ role: 'user', content: agentInput }],
      // The reply is a single message, so there is no conversation to continue and nothing should
      // be written to one. A null id also keeps a customer thread out of the operator's Studio.
      conversation_id: null,
    }),
  });

  if (!resp.ok) {
    // 402 is the credit gate saying the owner cannot pay for this turn. That is not an error to
    // retry or report — it is the documented "leave it for a human" outcome, and the caller
    // treats an empty draft exactly that way.
    if (resp.status === 402) {
      console.log(`[inbox-api] agent reply skipped on ${threadId}: insufficient credits`);
      return '';
    }
    throw new Error(`agent-chat ${resp.status}: ${(await resp.text()).slice(0, 300)}`);
  }

  return await readAgentChatReply(resp, threadId);
}

/**
 * Pull the final answer out of agent-chat's stream.
 *
 * agent-chat speaks newline-delimited JSON, not `data:`-prefixed SSE — one object per line, of
 * which we want exactly one: `final_result`, whose `text` is the reply. Everything else on the
 * wire (heartbeats, `tool_call`, `text_chunk`, `agent_routed`) exists for the Studio's live view
 * and means nothing to a WhatsApp message that is sent whole.
 *
 * Reading the body to the end rather than bailing on the first match is deliberate: `final_result`
 * is the second-to-last chunk, `done` follows it, and abandoning a half-read body leaves the
 * upstream isolate writing into a closed pipe.
 */
async function readAgentChatReply(resp: Response, threadId: string): Promise<string> {
  const raw = await resp.text();
  let text = '';
  let sawFinal = false;
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    let chunk: { type?: string; text?: string; error?: string; message?: string };
    try {
      chunk = JSON.parse(trimmed);
    } catch {
      // A partial line is normal at a chunk boundary; a persistently unparseable body is not, but
      // it surfaces below as an empty draft rather than as a crash on the customer's turn.
      continue;
    }
    if (chunk.type === 'final_result') {
      sawFinal = true;
      text = String(chunk.text || '');
    } else if (chunk.type === 'error') {
      console.warn(`[inbox-api] agent-chat error chunk on ${threadId}:`, chunk.error || chunk.message);
    }
  }
  if (!sawFinal) {
    // The stream ended without an answer. Distinguished from "answered with nothing" on purpose —
    // the first is a broken turn worth seeing in the logs, the second is a legitimate decline.
    console.warn(`[inbox-api] agent-chat produced no final_result for ${threadId}`);
  }
  return text.trim();
}

/**
 * Get-or-create a public share token for a customer thread → the `/i/:token` link a member can
 * hand to a customer who has no account yet. Reuses an unclaimed token if one already exists.
 */
/**
 * Lifetime of a customer share link. A conversation link is an invitation, not a standing
 * credential — it exists so one customer can reach one thread while it is being handled.
 */
const SHARE_LINK_TTL_DAYS = 30;

async function getOrCreateShareLink(
  db: DbClient,
  threadId: string,
  contactId: string | null,
): Promise<string> {
  // Only reuse a token that is still within its lifetime — otherwise "get or create" would
  // keep handing back an expired one forever.
  const nowIso = new Date().toISOString();
  const { data: existing } = await db
    .from('inbox_thread_tokens')
    .select('token')
    .eq('thread_id', threadId)
    .is('claimed_by_user_id', null)
    .gt('expires_at', nowIso)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  let token = (existing as { token?: string } | null)?.token;
  if (!token) {
    // SECURITY: `expires_at` was NEVER written by any code path.
    // The column is nullable, so `t.expires_at` was always NULL and resolveToken's expiry
    // guard — and the "This link has expired" copy — were unreachable decoration. One
    // forwarded /i/:token URL was a permanent, unauthenticated read+write handle on a
    // tenant's customer conversation.
    const expiresAt = new Date(Date.now() + SHARE_LINK_TTL_DAYS * 86_400_000).toISOString();
    const { data: ins, error } = await db
      .from('inbox_thread_tokens')
      .insert({ thread_id: threadId, contact_id: contactId, expires_at: expiresAt })
      .select('token')
      .single();
    if (error) throw new HttpError(500, `Failed to create share link: ${error.message}`);
    token = (ins as { token: string }).token;
  }
  return `${PUBLIC_APP_URL}/i/${token}`;
}

/**
 * Directional add-rule. May `userId` (acting in `thread`) add `target`?
 * `callerRole` is the caller's role in thread.workspace_id (null if not a member).
 */
async function assertCanAddParticipant(
  db: DbClient,
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
  db: DbClient,
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
  db: DbClient,
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
  db: DbClient,
  opts: {
    thread: Record<string, unknown>;
    senderParticipantId: string | null;
    body: string | null;
    attachments: Attachment[];
    messageType: 'text' | 'system' | 'agent' | 'note';
    senderUserId?: string | null;
    senderLabel?: string;
    /** Platform id of the message being replied to — WhatsApp renders it as a quoted block. */
    replyToWamid?: string;
    /** Our own id for the same message, so the transcript can render the quote locally too. */
    replyToMessageId?: string;
  },
): Promise<Record<string, unknown>> {
  const { thread, senderParticipantId, body, attachments, messageType, replyToWamid, replyToMessageId } = opts;
  const threadId = String(thread.id);

  const { data: msg, error } = await db
    .from('inbox_messages')
    .insert({
      thread_id: threadId,
      sender_participant_id: senderParticipantId,
      body,
      attachments,
      message_type: messageType,
      // Recorded so the transcript can render the quoted block locally. WhatsApp shows it on the
      // customer's side from `replyTo`; without this OUR side would show a bare reply and the
      // operator could not see what they had answered.
      ...(replyToMessageId ? { metadata: { reply_to: replyToMessageId } } : {}),
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
  // The guard used to end in `&& body`, so an ATTACHMENT-ONLY message skipped the relay
  // entirely — even though the caller explicitly permits `body === null` when attachments
  // exist. Combined with the hardcoded `attachmentUrl: undefined`, an operator could attach a
  // spec sheet, see it in their own transcript, and the customer would receive the text alone
  // or nothing at all, with no indication either way.
  if (thread.channel === 'whatsapp' && (messageType === 'text' || messageType === 'agent')
      && (body || attachments.length > 0)) {
    const meta = (thread.metadata as Json) || {};
    const accountId = String(meta.zernio_account_id || '');
    const conversationId = String(meta.zernio_conversation_id || '');
    if (accountId && conversationId) {
      // Attachments live in a PRIVATE bucket as bucket + object path (never a persisted URL —
      // storage convention #7), so the relay needs a freshly signed one. Zernio accepts a
      // single attachment per message; extras stay visible in the inbox transcript.
      let attachmentUrl: string | undefined;
      let attachmentType: 'image' | 'video' | 'audio' | 'file' | undefined;
      const first = attachments[0];
      if (first?.storage_bucket && first?.storage_object_path) {
        const { data: signed, error: signErr } = await db.storage
          .from(first.storage_bucket)
          .createSignedUrl(first.storage_object_path, 60 * 60 * 24);
        if (signErr || !signed?.signedUrl) {
          throw new HttpError(502, `Message stored but its attachment could not be prepared for WhatsApp: ${signErr?.message ?? 'no signed url'}`);
        }
        attachmentUrl = signed.signedUrl;
        const ct = String(first.content_type || '');
        attachmentType = ct.startsWith('image/') ? 'image'
          : ct.startsWith('video/') ? 'video'
          : ct.startsWith('audio/') ? 'audio'
          : 'file';
      }
      const res = await sendWhatsAppReply({
        accountId,
        conversationId,
        message: body ?? undefined,
        attachmentUrl,
        attachmentType,
        replyTo: replyToWamid,
      });
      // Store the returned message id as `wamid` so the zernio-webhook-handler's
      // message.delivered|read|failed handler (which matches `metadata->>wamid`) can apply
      // delivery/read receipts to THIS outbound message. Keep `relay` for debugging.
      const relayOk = !!(res as { success?: boolean })?.success;
      await db
        .from('inbox_messages')
        .update({
          metadata: {
            channel: 'whatsapp',
            wamid: (res as { messageId?: string })?.messageId ?? null,
            relay: res,
            // Explicit failure marker (pipeline convention #1) — emptiness alone is ambiguous.
            delivery_status: relayOk ? 'sent' : 'relay_failed',
          },
        })
        .eq('id', (msg as { id: string }).id);

      // sendWhatsAppReply NEVER throws — _shared/zernio.ts catches everything and returns
      // { success: false, error }. `res.success` was never read, so a Zernio rejection
      // (expired token, missing add-on, closed 24h window, rate limit) still produced a
      // message bubble in the operator's thread and a cleared composer, while the customer
      // received nothing. The failure text sat in metadata.relay.error with no reader.
      if (!relayOk) {
        const detail = String((res as { error?: unknown })?.error ?? 'WhatsApp relay failed');
        throw new HttpError(502, `Message stored but NOT delivered to WhatsApp: ${detail}`);
      }
    }
  }

  // Social relay. A `social` thread is one of two things and they relay to DIFFERENT endpoints:
  // a comment thread (many commenters under one of our posts) or a 1:1 DM. Sending one down the
  // other's path would either post a private answer publicly under a post, or silently drop a
  // public reply into a DM nobody is in — both "succeed" at the API layer.
  if (thread.channel === 'social' && (messageType === 'text' || messageType === 'agent') && body) {
    const meta = (thread.metadata as Json) || {};
    const accountId = String(meta.zernio_account_id || '');
    const kind = String(meta.social_kind || '');
    let res: { success?: boolean; messageId?: string; error?: string } = { success: false, error: 'unrouted' };

    if (!accountId) {
      throw new HttpError(502, 'Message stored but NOT delivered: this social thread has no connected account.');
    }

    if (kind === 'comments') {
      const postId = String(meta.zernio_post_id || '');
      if (!postId) throw new HttpError(502, 'Message stored but NOT delivered: the thread has no post id.');

      // Reply UNDER the comment we are answering, not as a fresh top-level comment: a
      // top-level comment does not notify the person who asked, so the answer is written and
      // never read. The target is the most recent inbound comment on the thread, which is what
      // the transcript shows the operator replying to.
      const { data: lastInbound } = await db
        .from('inbox_messages').select('metadata')
        .eq('thread_id', thread.id)
        .eq('metadata->>direction', 'incoming')
        .order('created_at', { ascending: false })
        .limit(1).maybeSingle();
      const commentId = (lastInbound?.metadata as Json | undefined)?.comment_id as string | undefined;

      res = await sendSocialCommentReply({ accountId, postId, message: body, commentId });
    } else {
      const participantId = String(meta.participant_id || '');
      if (!participantId) throw new HttpError(502, 'Message stored but NOT delivered: the thread has no recipient.');
      res = await sendSocialDirectMessage({ accountId, participantId, message: body });
    }

    const relayOk = !!res?.success;
    // This row carries the provider id that delivery receipts match on, plus the only record
    // of whether the relay worked. Losing it silently means receipts never apply to this
    // message and the failure marker is gone — so read the error rather than assume.
    const { error: metaErr } = await db.from('inbox_messages').update({
      metadata: {
        channel: 'social',
        direction: 'outgoing',
        social_kind: kind,
        wamid: res?.messageId ?? null,
        relay: res,
        delivery_status: relayOk ? 'sent' : 'relay_failed',
      },
    }).eq('id', (msg as { id: string }).id);
    if (metaErr) console.error('[inbox-api] social relay metadata write FAILED', (msg as { id: string }).id, metaErr);

    // Same contract as the WhatsApp branch: these helpers never throw, so an unread result
    // leaves a delivered-looking bubble in the operator's thread that nobody ever received.
    if (!relayOk) {
      throw new HttpError(502, `Message stored but NOT delivered: ${String(res?.error ?? 'social relay failed')}`);
    }
  }

  // Email relay (#342). Without this an email thread is write-only: a member replies, sees their
  // own bubble, the composer clears — and the customer is never sent anything. Same failure the
  // WhatsApp branch above was fixed for, so it is built the same way: send, CHECK the result, and
  // fail loudly rather than leave a delivered-looking message that never left.
  if (thread.channel === 'email' && (messageType === 'text' || messageType === 'agent') && body) {
    const meta = (thread.metadata as Json) || {};
    const toAddress = String(meta.email_from || '');
    const ourMailbox = String(meta.email_to || '');
    // A recipient with no mailbox to send FROM used to fall straight through this branch: the
    // member saw their own reply, the composer cleared, and nothing left the building. Inbound
    // mail always carries `email_to`, but a public-profile enquiry files even when the owner's
    // address could not be allocated (two people wanting the same handle), so the state is
    // reachable — and a skipped relay is indistinguishable from a delivered one.
    if (toAddress && !ourMailbox) {
      throw new HttpError(
        502,
        'Message stored but NOT delivered: this conversation has no address to send from. '
          + 'Pick your inbox email address first, then resend.',
      );
    }
    if (toAddress && ourMailbox) {
      const messageId = (msg as { id: string }).id;
      const domain = ourMailbox.split('@')[1] || '';

      // Everything the customer's client needs to keep this in ONE conversation:
      //  • Reply-To carries the thread id, which is what actually threads the reply (the
      //    recipient address is the one field no intermediary rewrites).
      //  • In-Reply-To / References chain to their last message, so clients nest it visually.
      const { data: lastInbound } = await db
        .from('inbox_messages')
        .select('metadata')
        .eq('thread_id', threadId)
        .eq('metadata->>direction', 'incoming')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      const inboundId = ((lastInbound as { metadata?: Record<string, unknown> } | null)?.metadata
        ?.email_message_id ?? null) as string | null;

      const ourMessageId = buildOutboundMessageId(threadId, messageId, domain);
      const headers: Record<string, string> = { 'Message-ID': `<${ourMessageId}>` };
      if (inboundId) {
        headers['In-Reply-To'] = `<${inboundId}>`;
        headers['References'] = `<${inboundId}>`;
      }
      // An assistant-authored reply is marked as automated so a customer's autoresponder does not
      // ping-pong with ours. A finance document must NEVER carry these (guarded by
      // tests/security/inbound-email-isolation.test.ts).
      if (messageType === 'agent') {
        headers['Auto-Submitted'] = 'auto-replied';
        headers['Precedence'] = 'auto_reply';
      }

      const subjectBase = String(thread.subject || 'Your message');
      const subject = /^re:/i.test(subjectBase) ? subjectBase : `Re: ${subjectBase}`;

      let sendErr: string | null = null;
      try {
        const res = await fetch(`${SUPABASE_URL}/functions/v1/email-api`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            action: 'send',
            to: toAddress,
            subject,
            // Plain text only: the body is a member's own words, and building an HTML string
            // around untrusted content is how invariant 11 gets violated by accident.
            text: body,
            replyTo: buildReplyToAddress(ourMailbox, threadId),
            headers,
            emailType: 'agent_reply',
            workspace_id: String(thread.workspace_id),
            // Deliberately NOT requireWorkspaceSender: an inbox reply is not a business document
            // and must never be pinned to (or borrow) the finance sending identity.
            tags: { feature: 'inbox_email_reply', thread_id: threadId },
          }),
        });
        if (!res.ok) sendErr = `email-api returned ${res.status}`;
        else {
          const payload = await res.json().catch(() => null) as { success?: boolean; error?: string } | null;
          if (payload && payload.success === false) sendErr = payload.error || 'send failed';
        }
      } catch (e) {
        sendErr = e instanceof Error ? e.message : String(e);
      }

      await db.from('inbox_messages').update({
        metadata: {
          ...(msg as { metadata?: Record<string, unknown> }).metadata,
          channel: 'email',
          direction: 'outgoing',
          // Stored so a reply quoting this Message-ID threads via ladder step 1.
          email_message_id: ourMessageId,
          email_to: toAddress,
          delivery_status: sendErr ? 'relay_failed' : 'sent',
          ...(sendErr ? { relay_error: sendErr } : {}),
        },
      }).eq('id', messageId);

      if (sendErr) {
        throw new HttpError(502, `Message stored but NOT delivered by email: ${sendErr}`);
      }
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
    // Notes go to members only; nobody is told about their own message.
    const recipients = ((parts || []) as Array<{ user_id: string; participant_type: string }>)
      .filter((p) => p.user_id !== opts.senderUserId)
      .filter((p) => messageType !== 'note' || p.participant_type === 'member')
      .map((p) => p.user_id);
    await emitInboxMessageEvent({
      userIds: recipients,
      threadId,
      // Carry the thread's workspace so tenant flows can scope to it.
      workspaceId: (thread as { workspace_id?: string }).workspace_id ?? null,
      title: `${opts.senderLabel || 'New message'} · ${subject}`,
      subject: `New message · ${subject}`,
      body: preview,
    });
  }

  return msg as Record<string, unknown>;
}

// ──────────────────────────────────────────────────────────────────────────
// Order intake helpers (#342 §4)
// ──────────────────────────────────────────────────────────────────────────

/** The intake currently stored on a thread. */
async function loadIntake(db: DbClient, threadId: string): Promise<OrderIntake | null> {
  const { data } = await db.from('inbox_threads').select('metadata').eq('id', threadId).maybeSingle();
  return readIntake((data as { metadata?: unknown } | null)?.metadata);
}

/**
 * Resolve `{thread, intake}` for an intake action, enforcing membership first. 404 (not 403) on a
 * thread the caller cannot see, so thread ids stay un-enumerable.
 */
async function intakeContext(
  db: DbClient,
  userId: string,
  payload: Json,
  operator: boolean,
): Promise<{ thread: Record<string, unknown>; intake: OrderIntake | null }> {
  const threadId = String(payload.thread_id || '');
  if (!threadId) throw new HttpError(400, 'thread_id is required');
  const thread = await getThreadOrThrow(db, threadId);
  const access = await resolveThreadAccess(db, userId, thread, operator);
  // Intake is a business surface: members only. A customer participant must never see the
  // proposal, the matched cost, or the margin implied by it.
  if (!access.isMember && !operator) throw new HttpError(404, 'Conversation not found');
  return { thread, intake: await loadIntake(db, threadId) };
}

/** A row must belong to the thread's workspace. Returns 404, never "wrong workspace". */
async function assertOwnedByWorkspace(
  db: DbClient,
  table: 'crm_contacts' | 'crm_companies' | 'products',
  id: string,
  workspaceId: string,
  label: string,
): Promise<void> {
  const { data } = await db.from(table).select('id').eq('id', id).eq('workspace_id', workspaceId).maybeSingle();
  if (!(data as { id?: string } | null)?.id) throw new HttpError(404, `That ${label} was not found`);
}

/** Re-run the resolver for every catalog line — used when the customer (and so the price) changes. */
async function repriceItems(
  db: DbClient,
  workspaceId: string,
  intake: OrderIntake,
): Promise<IntakeItem[]> {
  const out: IntakeItem[] = [];
  for (const item of intake.items) {
    // A price a member typed is theirs to keep; only resolver-priced lines are recomputed.
    if (!item.product_id || item.unit_price_source === 'manual') { out.push(item); continue; }
    const priced = await resolveLinePrice(db, {
      workspaceId,
      productId: item.product_id,
      companyId: intake.customer_company_id,
      contactId: intake.customer_contact_id,
      // Re-pricing when the reviewer assigns the customer must also re-apply the volume break,
      // or assigning a customer would silently drop a discount the draft already had.
      quantity: item.quantity,
      unit: item.measurement_unit_code,
    });
    out.push({
      ...item,
      unit_price: priced.unit_price,
      unit_cost: priced.unit_cost,
      measurement_unit_code: priced.measurement_unit_code ?? item.measurement_unit_code,
      needs_review: priced.unit_price == null,
    });
  }
  return out;
}

/** Plain-text read-back of an approved order. Used for every confirmation channel. */
function orderConfirmationText(intake: OrderIntake, orderNumber: string | null): string {
  const lines = intake.items.map((it) => {
    const price = it.unit_price == null ? '' : ` @ ${it.unit_price.toFixed(2)} ${intake.currency}`;
    return `• ${it.quantity} × ${it.description}${price}`;
  });
  const totals = intakeDisplayTotal(intake.items);
  const head = orderNumber ? `Your order ${orderNumber} is confirmed.` : 'Your order is confirmed.';
  const tail = totals.unpriced > 0
    ? `\n\nTotal so far: ${totals.net.toFixed(2)} ${intake.currency} (${totals.unpriced} item(s) still to be priced — we will follow up).`
    : `\n\nTotal: ${totals.net.toFixed(2)} ${intake.currency} (excl. VAT).`;
  return `${head}\n\n${lines.join('\n')}${tail}`;
}

/**
 * Tell the customer their order was accepted (#342 §4a) — and REPORT which channel did it.
 *
 * This exists because of a gap #209 left open and this feature walks straight into: `send_message`
 * returns 409 on a freeform WhatsApp reply outside Meta's 24-hour service window. An order that
 * arrives at 18:00 and is approved at 09:00 the next morning is outside it. Without this, the
 * order would be created and the confirmation would silently fail — a real order the customer was
 * never told about, with nothing complaining. That is the platform's signature silent-zero shape.
 *
 * Approval NEVER rolls back because a message failed: the order is the commitment, the message is
 * best-effort. But the outcome is stored on the intake, so "approved but never told" is a state
 * you can query rather than a guess.
 */
async function sendOrderConfirmation(
  db: DbClient,
  thread: Record<string, unknown>,
  intake: OrderIntake,
  orderId: string,
): Promise<IntakeConfirmation> {
  const at = new Date().toISOString();
  const { data: orderRow } = await db.from('orders').select('order_number').eq('id', orderId).maybeSingle();
  const body = orderConfirmationText(intake, (orderRow as { order_number?: string } | null)?.order_number ?? null);
  const channel = String(thread.channel);

  try {
    if (channel === 'whatsapp') {
      const meta = (thread.metadata || {}) as Record<string, unknown>;
      const accountId = meta.zernio_account_id as string | undefined;
      const conversationId = meta.zernio_conversation_id as string | undefined;
      const phone = meta.contact_phone as string | undefined;
      if (!accountId) return { channel: 'none', status: 'unavailable', at, detail: 'no WhatsApp binding' };

      const win = await whatsappWindow(db, String(thread.id), thread);
      if (win?.open && conversationId) {
        // Both Zernio helpers RESOLVE with { success:false } instead of throwing, so a bare
        // `await` reads as success on every failure. Checking the result is the whole point of
        // this function — reporting "sent" for a message that never left is the silent zero.
        const res = await sendWhatsAppReply({ accountId, conversationId, message: body });
        return res.success
          ? { channel: 'whatsapp', status: 'sent', at }
          : { channel: 'whatsapp', status: 'failed', at, detail: res.error ?? 'relay refused' };
      }

      // Window shut → an approved template is the only way back in. This is #209's last open
      // lever, built for exactly one template rather than as a general picker.
      const templateName = (await resolveSecret(db, 'WHATSAPP_ORDER_CONFIRMATION_TEMPLATE')).value;
      if (!templateName || !phone) {
        return {
          channel: 'none', status: 'unavailable', at,
          detail: 'the 24-hour window is closed and no approved order_confirmation template is configured',
        };
      }
      const sent = await sendWhatsAppMessage({
        accountId,
        to: phone,
        message: body,
        templateName,
        templateLanguage: (await resolveSecret(db, 'WHATSAPP_ORDER_CONFIRMATION_TEMPLATE_LANG')).value || 'en',
        templateParams: [
          (orderRow as { order_number?: string } | null)?.order_number ?? '',
          intakeDisplayTotal(intake.items).net.toFixed(2),
          intake.currency,
        ],
      });
      return sent.success
        ? { channel: 'whatsapp_template', status: 'sent', at }
        : { channel: 'whatsapp_template', status: 'failed', at, detail: sent.error ?? 'template send refused' };
    }

    if (channel === 'social') {
      // An order confirmation names what someone bought and what they paid. On a COMMENTS
      // thread the relay posts publicly under our own post, so this would broadcast a
      // customer's order to the account's whole audience. Refuse, and record that it was not
      // sent — the order still stands, and "approved but never told" stays queryable.
      const meta = (thread.metadata || {}) as Record<string, unknown>;
      if (meta.social_kind === 'comments') {
        return { channel: 'none', status: 'unavailable', at, detail: 'public comment thread — confirmation withheld' };
      }
      // A social DM is private; the send-router relays it and throws on a failed relay.
      await insertMessageAndNotify(db, {
        thread, senderParticipantId: null, body, attachments: [],
        messageType: 'text', senderUserId: null, senderLabel: 'Order confirmation',
      });
      return { channel: 'social', status: 'sent', at };
    }

    if (channel === 'email') {
      // insertMessageAndNotify's email branch actually sends (and throws on a failed send), so
      // the catch below turns a delivery failure into status:'failed' rather than a false 'sent'.
      await insertMessageAndNotify(db, {
        thread,
        senderParticipantId: null,
        body,
        attachments: [],
        messageType: 'text',
        senderUserId: null,
        senderLabel: 'Order confirmation',
      });
      return { channel: 'email', status: 'sent', at };
    }

    await insertMessageAndNotify(db, {
      thread,
      senderParticipantId: null,
      body,
      attachments: [],
      messageType: 'text',
      senderUserId: null,
      senderLabel: 'Order confirmation',
    });
    return { channel: 'none', status: 'sent', at };
  } catch (e) {
    // `channel` is the thread's own channel string; narrow it to the confirmation vocabulary so
    // a future inbox_channel value cannot widen this record without the compiler noticing.
    const failedOn: IntakeConfirmation['channel'] =
      channel === 'whatsapp' || channel === 'email' || channel === 'social' ? channel : 'none';
    return { channel: failedOn, status: 'failed', at, detail: e instanceof Error ? e.message : String(e) };
  }
}

// ──────────────────────────────────────────────────────────────────────────
// JWT actions
// ──────────────────────────────────────────────────────────────────────────

async function handleJwtAction(
  db: DbClient,
  userId: string,
  action: string,
  payload: Json,
  /**
   * The same connection with RLS ENFORCED as the caller (#197 item 4). Used only by
   * `approve_intake`, which must call `create_order_from_thread_intake` under the member's own
   * identity so the RPC's `auth.uid()` guard is what decides — not our service-role bypass.
   */
  asUser?: DbClient | null,
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

    // React to a message with an emoji — the affordance WhatsApp has and this inbox did not.
    //
    // One reaction per person per message is the platform rule, so setting a second REPLACES the
    // first and clearing takes no emoji. The local row is updated optimistically; the
    // `reaction.received` webhook follows and reconciles, including for a reaction added on the
    // phone rather than here.
    case 'react_message': {
      const threadId = String(payload.thread_id || '');
      const messageId = String(payload.message_id || '');
      if (!threadId || !messageId) throw new HttpError(400, 'thread_id and message_id are required');
      const emoji = payload.emoji == null ? null : String(payload.emoji);

      const thread = await getThreadOrThrow(db, threadId);
      const access = await resolveThreadAccess(db, userId, thread, operator);
      if (!access.isMember) throw new HttpError(403, 'Only members may react');

      const { data: target } = await db
        .from('inbox_messages').select('id, metadata')
        .eq('id', messageId).eq('thread_id', threadId).maybeSingle();
      if (!target) throw new HttpError(404, 'Message not found');
      const tmeta = ((target as { metadata?: Record<string, unknown> }).metadata ?? {}) as Record<string, unknown>;

      if (thread.channel === 'whatsapp') {
        const meta = (thread.metadata as Json) || {};
        const conversationId = String(meta.zernio_conversation_id || '');
        const wamid = typeof tmeta.wamid === 'string' ? tmeta.wamid : '';
        if (!conversationId || !wamid) {
          throw new HttpError(409, 'That message has no platform id to react to.');
        }
        const res = await setMessageReaction({ conversationId, messageId: wamid, emoji });
        if (!res.success) {
          // Not stored on failure: a reaction shown here that the customer never sees is the same
          // lie as a sent bubble for a message WhatsApp refused.
          throw new HttpError(502, `WhatsApp rejected the reaction: ${res.error ?? 'unknown error'}`);
        }
      }

      const existing: string[] = Array.isArray(tmeta.reactions) ? tmeta.reactions as string[] : [];
      const next = emoji ? [...existing.filter((r) => r !== emoji), emoji] : [];
      const { error: reactErr } = await db.rpc('inbox_message_merge_metadata', {
        p_message_id: messageId,
        p_patch: { reactions: next },
      });
      if (reactErr) throw new HttpError(500, `Could not record the reaction: ${reactErr.message}`);
      return json({ ok: true, reactions: next });
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
        const w = await whatsappWindow(db, threadId, thread);
        if (!w.open) {
          // Name the reason. "The window is closed" with no anchor is unfalsifiable to the person
          // reading it, and the operator who reported this was looking at a message they had sent
          // twenty minutes earlier — an outbound message does not open the window, but nothing on
          // screen said so.
          const why = w.last_inbound_at
            ? `the customer last wrote on ${w.last_inbound_at}`
            : w.source === 'unknown'
              ? 'we could not reach WhatsApp to check when the customer last wrote'
              : 'this customer has never written to us, so no window has opened';
          throw new HttpError(409, `WhatsApp 24h service window is closed (${why}) — an approved template is required to message this customer again.`);
        }
      }
      // A member replying to a shared workspace thread they hadn't joined becomes a participant.
      let senderParticipantId = access.participant?.id ?? null;
      if (!senderParticipantId && access.isMember) {
        senderParticipantId = await ensureMemberParticipant(db, thread, userId);
      }
      // Replying TO a specific message. We hold our own message ids; WhatsApp wants the platform
      // id, so resolve it here rather than trusting the client to hand us a wamid. A note is
      // internal and has nothing to quote on the platform.
      let replyToWamid: string | undefined;
      const replyToId = payload.reply_to_message_id ? String(payload.reply_to_message_id) : '';
      if (replyToId && messageType !== 'note') {
        const { data: target } = await db
          .from('inbox_messages').select('metadata, thread_id')
          .eq('id', replyToId).eq('thread_id', threadId).maybeSingle();
        const wamid = (target as { metadata?: Record<string, unknown> } | null)?.metadata?.wamid;
        // Scoped to THIS thread: quoting a message from another conversation would either fail at
        // the platform or, worse, quote a stranger's words into someone else's chat.
        if (typeof wamid === 'string' && wamid) replyToWamid = wamid;
      }

      const msg = await insertMessageAndNotify(db, {
        thread,
        senderParticipantId,
        body,
        attachments,
        messageType: messageType === 'note' ? 'note' : 'text',
        senderUserId: userId,
        senderLabel: 'New message',
        replyToWamid,
        replyToMessageId: replyToWamid ? replyToId : undefined,
      });
      // Mark the sender as caught up.
      if (senderParticipantId) {
        await db.from('inbox_participants').update({ last_read_at: new Date().toISOString() }).eq('id', senderParticipantId);
      }
      if (!access.isMember && messageType !== 'note') {
        // Intake FIRST, so the proposal exists before the assistant answers and the reply can
        // acknowledge the order rather than contradict it. No-op unless the workspace opted in.
        await maybeRunOrderIntake(db, threadId);
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
      const { error: readErr } = await db.from('inbox_participants')
        .update({ last_read_at: new Date().toISOString() }).eq('id', me.id);
      if (readErr) throw new HttpError(500, `Could not mark the thread read: ${readErr.message}`);

      // Tell the platform as well. We tracked read state only locally, so the customer's
      // "seen" indicator never moved and Zernio's unread counts drifted permanently from ours.
      // Best-effort by design — failing to sync a read receipt must not fail the operator's read.
      const thread = await getThreadOrThrow(db, threadId);
      const convId = String(((thread.metadata as Json) || {}).zernio_conversation_id || '');
      if (convId && (thread.channel === 'whatsapp' || thread.channel === 'social')) {
        await markConversationRead(convId);
      }
      return json({ ok: true });
    }

    // ── Answer a public comment PRIVATELY ────────────────────────────────
    // The agent is instructed in prose to "invite them to message us directly". This does it:
    // the customer gets the specific answer by DM without it being published under the post.
    // Instagram and Facebook allow exactly ONE private reply per comment, inside a limited
    // window — so a failure here is final, and is surfaced rather than swallowed.
    case 'comment_private_reply': {
      const threadId = String(payload.thread_id || '');
      const messageId = String(payload.message_id || '');
      const body = String(payload.body || '').trim();
      if (!threadId || !messageId || !body) {
        throw new HttpError(400, 'thread_id, message_id and body are required');
      }
      const thread = await getThreadOrThrow(db, threadId);
      const access = await resolveThreadAccess(db, userId, thread, operator);
      if (!access.isMember && !operator) throw new HttpError(404, 'Conversation not found');

      const meta = (thread.metadata as Json) || {};
      if (thread.channel !== 'social' || meta.social_kind !== 'comments') {
        throw new HttpError(400, 'Only a social comment can be answered privately');
      }
      const { data: srcMsg } = await db.from('inbox_messages')
        .select('metadata').eq('id', messageId).eq('thread_id', threadId).maybeSingle();
      const commentId = ((srcMsg?.metadata as Json | undefined) || {}).comment_id as string | undefined;
      if (!commentId) throw new HttpError(400, 'That message is not a comment');

      const res = await sendCommentPrivateReply({
        accountId: String(meta.zernio_account_id || ''),
        postId: String(meta.zernio_post_id || ''),
        commentId,
        message: body,
      });
      if (!res.success) throw new HttpError(502, `Private reply not delivered: ${res.error ?? 'refused'}`);

      // Recorded as a NOTE, deliberately: it is not part of the public comment transcript, and
      // rendering it as an ordinary reply would read as though it had been posted under the post.
      const { error: noteErr } = await db.from('inbox_messages').insert({
        thread_id: threadId,
        message_type: 'note',
        body: `Sent privately to the commenter: ${body}`,
        attachments: [],
        metadata: { channel: 'social', social_kind: 'private_reply', comment_id: commentId, relay: res },
      });
      if (noteErr) console.error('[inbox-api] private reply sent but its note FAILED', threadId, noteErr);

      return json({ ok: true, message_id: res.messageId ?? null });
    }

    // ── Hide / unhide a comment (spam and abuse under our own posts) ─────
    case 'set_comment_hidden': {
      const threadId = String(payload.thread_id || '');
      const messageId = String(payload.message_id || '');
      const hidden = payload.hidden !== false;
      if (!threadId || !messageId) throw new HttpError(400, 'thread_id and message_id are required');

      const thread = await getThreadOrThrow(db, threadId);
      const access = await resolveThreadAccess(db, userId, thread, operator);
      if (!access.isMember && !operator) throw new HttpError(404, 'Conversation not found');

      const meta = (thread.metadata as Json) || {};
      if (thread.channel !== 'social' || meta.social_kind !== 'comments') {
        throw new HttpError(400, 'Only a social comment can be hidden');
      }
      const { data: srcMsg } = await db.from('inbox_messages')
        .select('metadata').eq('id', messageId).eq('thread_id', threadId).maybeSingle();
      const srcMeta = ((srcMsg?.metadata as Json | undefined) || {});
      const commentId = srcMeta.comment_id as string | undefined;
      if (!commentId) throw new HttpError(400, 'That message is not a comment');

      const res = await setCommentHidden({
        accountId: String(meta.zernio_account_id || ''),
        postId: String(meta.zernio_post_id || ''),
        commentId,
        hidden,
      });
      if (!res.success) throw new HttpError(502, `Could not ${hidden ? 'hide' : 'unhide'} the comment: ${res.error ?? 'refused'}`);

      const { error: hidErr } = await db.from('inbox_messages')
        .update({ metadata: { ...srcMeta, hidden_on_platform: hidden } })
        .eq('id', messageId);
      if (hidErr) console.error('[inbox-api] comment hidden but the local flag FAILED', messageId, hidErr);

      return json({ ok: true, hidden });
    }

    // Add this conversation's counterparty to the CRM — because a PERSON pressed the button.
    //
    // The webhook used to do this on its own for every unknown number that wrote in, which is how
    // the CRM filled with records named after a phone number. It links an existing contact and
    // creates nothing; this is the deliberate other half, offered from the WhatsApp tab of the
    // profile drawer.
    case 'create_contact_from_thread': {
      const threadId = String(payload.thread_id || '');
      if (!threadId) throw new HttpError(400, 'thread_id is required');
      const thread = await getThreadOrThrow(db, threadId);
      const access = await resolveThreadAccess(db, userId, thread, operator);
      if (!access.isMember) throw new HttpError(403, 'Only thread members may add a contact');

      const workspaceId = String(thread.workspace_id);
      const tmeta = (thread.metadata as Json) || {};
      const waProfile = (tmeta.wa_profile ?? {}) as Record<string, unknown>;
      const phone = String(tmeta.contact_phone || '').trim();
      if (!phone) throw new HttpError(400, 'This conversation has no phone number to file against');

      // Already linked, or already in the CRM under this number? Then say so rather than making a
      // second record — the whole point of moving this behind a button is to stop duplicating people.
      const { data: existingP } = await db.from('inbox_participants')
        .select('id, contact_id').eq('thread_id', threadId).eq('participant_type', 'customer')
        .limit(1).maybeSingle();
      const participant = existingP as { id?: string; contact_id?: string } | null;
      if (participant?.contact_id) {
        return json({ ok: true, contact_id: participant.contact_id, created: false, reason: 'already linked' });
      }

      const digits = phone.replace(/[^\d]/g, '');
      const { data: dupe } = await db.from('crm_contacts')
        .select('id').eq('workspace_id', workspaceId)
        .or(`phone.eq.+${digits},mobile.eq.+${digits}`).limit(1).maybeSingle();
      let contactId = (dupe as { id?: string } | null)?.id ?? null;
      let created = false;

      if (!contactId) {
        // Prefer what the caller typed, then what WhatsApp reports, and only fall back to the
        // number. A record named after a phone number is the thing we are trying to stop making.
        const name = String(payload.name || waProfile.name || thread.subject || '').trim() || phone;
        const { data: made, error: makeErr } = await db.from('crm_contacts').insert({
          workspace_id: workspaceId,
          name,
          phone: `+${digits}`,
          email: (payload.email as string | undefined) || (waProfile.email as string | undefined) || null,
          company: (payload.company as string | undefined) || null,
          website: Array.isArray(waProfile.websites) ? String(waProfile.websites[0] ?? '') || null : null,
          city: (waProfile.address as string | undefined) || null,
          created_by: userId,
          lead_source: 'whatsapp',
        }).select('id').single();
        if (makeErr) throw new HttpError(500, `Could not create the contact: ${makeErr.message}`);
        contactId = (made as { id: string }).id;
        created = true;

        await emitFlowEventToWorkspaceRoles(workspaceId, ['owner', 'admin'], 'crm_contact_created', (uid: string) => ({
          type: 'crm_contact_created', workspace_id: workspaceId, user_id: uid,
          contact_id: contactId, contact_name: name, lead_source: 'whatsapp',
          title: 'New CRM contact', body: `${name} was added from a WhatsApp conversation.`,
          action_url: `/crm/contacts/${contactId}`,
        })).catch(() => {});
      }

      // Adopt the conversation that was already here.
      if (participant?.id) {
        await db.from('inbox_participants').update({ contact_id: contactId }).eq('id', participant.id);
      } else {
        await db.from('inbox_participants').insert({
          thread_id: threadId, participant_type: 'customer', contact_id: contactId, thread_role: 'participant',
        });
      }
      return json({ ok: true, contact_id: contactId, created });
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
      // Every write here was unchecked while the handler returned { ok: true }. The
      // consequence was specific and bad: if the thread update failed, the UI flipped to
      // "Handled by: AI Assistant" while agent_state was unchanged — and maybeRunAgentReply's
      // `if (thread.agent_state !== 'active') return` then silently declined to answer a
      // conversation the operator believed the AI owned. remove_participant, in this same
      // file, has always done `if (error) throw`.
      const { error: threadErr } = await db.from('inbox_threads')
        .update({ agent_state: state, agent_id: agentId }).eq('id', threadId);
      if (threadErr) throw new HttpError(500, `Could not change agent state: ${threadErr.message}`);

      if (state === 'off') {
        const { error: leftErr } = await db.from('inbox_participants').update({ status: 'left' })
          .eq('thread_id', threadId).eq('participant_type', 'agent');
        if (leftErr) throw new HttpError(500, `Could not remove the agent participant: ${leftErr.message}`);
      } else {
        // Ensure exactly one active agent participant.
        const { data: existing, error: exErr } = await db.from('inbox_participants')
          .select('id').eq('thread_id', threadId).eq('participant_type', 'agent').eq('status', 'active').maybeSingle();
        if (exErr) throw new HttpError(500, `Could not read agent participants: ${exErr.message}`);
        if (!existing) {
          const { error: insErr } = await db.from('inbox_participants').insert({
            thread_id: threadId, participant_type: 'agent', agent_id: agentId, thread_role: 'agent', added_by: userId,
          });
          if (insErr) throw new HttpError(500, `Could not add the agent participant: ${insErr.message}`);
        }
      }
      // System note so the transcript records the takeover. Non-fatal: the state change above
      // already succeeded, and losing the note must not undo a completed takeover.
      const { error: noteErr } = await db.from('inbox_messages').insert({
        thread_id: threadId, message_type: 'system',
        body: state === 'off' ? 'Conversation handed back to the team.' : `Conversation handed to the AI assistant (${state}).`,
      });
      if (noteErr) console.error('[inbox-api] set_agent system note failed (non-fatal):', noteErr.message);
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
      // `reply_cost` is gone rather than zeroed. A reply is a metered JARVIS turn now, so there is
      // no single number to publish — and a stale "1 credit" in the settings panel is worse than
      // no figure, because an operator budgets against it. The real spend is in `agent_usage_logs`
      // where every other agent turn already is.
      return json({
        settings,
        can_edit: operator || callerRole === 'owner' || callerRole === 'admin',
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
        // The embed is many-to-one at runtime (a thread_label points at ONE label), so PostgREST
        // returns an object — but the generated types describe every embed as an array. Accept
        // both and normalize rather than asserting one and being wrong on the other.
        type EmbeddedLabel = { id: string; name: string; color: string };
        const rows = (tl || []) as unknown as Array<{
          thread_id: string;
          inbox_labels: EmbeddedLabel | EmbeddedLabel[] | null;
        }>;
        for (const r of rows) {
          if (!r.inbox_labels) continue;
          const labels = Array.isArray(r.inbox_labels) ? r.inbox_labels : [r.inbox_labels];
          const arr = labelsByThread.get(r.thread_id) || [];
          for (const l of labels) if (l?.id) arr.push(l);
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

        // ...and tell the PLATFORM, not just our own table.
        //
        // Opening a thread moved `last_read_at` here and nowhere else, so the customer's message
        // stayed marked unread in WhatsApp: an operator could read a message, answer it, and the
        // sender's app would still show it as never seen. Zernio's unread counts drifted from
        // ours permanently for the same reason.
        //
        // The receipt belongs on THIS path rather than in the `mark_read` action, because this is
        // the one every screen already calls to open a thread — which is exactly why `mark_read`
        // has no caller and is listed as such in inboxApiReachability. Best-effort: a failed
        // receipt must never stop an operator reading their own inbox.
        const meta = ((thread.metadata as Json) || {}) as Record<string, unknown>;
        const convId = String(meta.zernio_conversation_id || '');
        if (convId && (thread.channel === 'whatsapp' || thread.channel === 'social')) {
          // Per-number choice, because "they can see I read it" is a business decision, not a
          // technical default. A sales team often wants the blue ticks; a support desk triaging
          // overnight often does not, because a read receipt with no reply reads worse than
          // silence. Absent = ON, which is what the receipt fix shipped as.
          let sendReceipt = true;
          const channelId = String(meta.channel_id || '');
          if (thread.channel === 'whatsapp' && channelId) {
            const { data: ch } = await db.from('messaging_channels')
              .select('config').eq('id', channelId).maybeSingle();
            const cfg = (ch?.config || {}) as Record<string, unknown>;
            sendReceipt = cfg.send_read_receipts !== false;
          }
          if (sendReceipt) await markConversationRead(convId);
        }
      }
      const wa = thread.channel === 'whatsapp' ? await whatsappWindow(db, threadId, thread) : null;
      return json({ thread, participants: participants || [], messages: messages || [], whatsapp_window: wa });
    }

    case 'create_marketplace_inquiry': {
      // Surplus Marketplace — a BUYER contacts a SELLER about an active listing. This
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
        // Carry the sourcing demand so accept can materialize an allocation
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
      // SELLER accepts a surplus inquiry → materialize a DRAFT purchase
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
          // is_customer explicitly false — the column DEFAULTS TO TRUE, so the seller landed in
          // the buyer's customer lists as well as their supplier lists.
          .insert({ workspace_id: buyerWs, name: sellerName, is_supplier: true, is_customer: false, vat_number: sellerVat, country_code: sellerCountry })
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

    case 'analyze_sentiment': {
      const threadId = String(payload.thread_id || '');
      if (!threadId) throw new HttpError(400, 'thread_id is required');
      const thread = await getThreadOrThrow(db, threadId);
      const access = await resolveThreadAccess(db, userId, thread, operator);
      if (!access.isMember) throw new HttpError(403, 'Only thread members may analyse a conversation');

      const r = await readConversationSentiment(
        db, threadId, thread.metadata as Record<string, unknown> | null, !!payload.force,
        thread.workspace_id as string | null, userId,
      );
      // Nothing to read is a real answer, not an error, and it must not bill anybody.
      if (!r.sentiment) {
        // "Switched off" and "nothing to read" look identical on screen unless they are said
        // apart — and one of them is fixed in the admin, not by waiting for more messages.
        return json({
          analysed: false,
          reason: r.reason ?? 'not_enough_messages',
          // Three different fixes hide behind one blank panel: turn the platform switch back
          // on, buy the add-on for this workspace, or simply wait for more messages. Naming the
          // add-on is what makes the second one findable at all.
          message: r.reason === 'disabled'
            ? 'Conversation analysis is off for this workspace. Enable it platform-wide in '
              + 'Admin → Operations, or add the Inbox AI module to this workspace.'
            : 'There are not enough messages in this conversation to read yet.',
        });
      }
      return json({ analysed: true, cached: r.cached, sentiment: r.sentiment });
    }

    case 'get_thread_context': {
      // Right-rail CRM context for the customer a member is talking to:
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

      // No flat debit + refund pair here either. Same reason as the auto-reply path: the draft is
      // now a real JARVIS turn, agent-chat meters it against `userId` in `agent_usage_logs` and
      // refuses up front with a 402 when they cannot pay. Charging a fixed fee on top would bill
      // the same reply into two ledgers that then disagree.
      const draft = await buildAgentDraft(db, thread, { userId, task: 'inbox_agent_suggest' });
      if (!draft) {
        // An empty draft is either "the credit gate said no" or "the turn produced nothing". Both
        // leave the member exactly where they were, with nothing charged.
        throw new HttpError(502, 'The assistant could not draft a reply — try again.');
      }
      return json({ draft });
    }

    // ── Inbound email address (#342 §1) ───────────────────────────────────────────────────
    //
    // One address per USER, on the shared receiving domain. Get-or-create: without this the
    // address table is read-only and every inbound message resolves to nothing, which is exactly
    // the state the feature shipped in until this action existed.

    case 'get_my_email_address': {
      const domain = (await resolveSecret(db, 'INBOUND_EMAIL_DOMAIN')).value || DEFAULT_INBOUND_DOMAIN;
      // The workspace the mail files into. A user can be in several, so it must be exactly one;
      // default to the one they are asking from and let them move it.
      const workspaceId = String(payload.workspace_id || '');
      if (!workspaceId) throw new HttpError(400, 'workspace_id is required');
      const callerRole = await callerRoleInWorkspace(db, userId, workspaceId);
      if (!operator && !callerRole) throw new HttpError(403, 'You are not a member of that workspace');

      const { data: existing } = await db
        .from('user_email_addresses')
        .select('id, full_address, workspace_id, auto_reply_enabled, agent_ref, is_active')
        .eq('user_id', userId)
        .maybeSingle();

      // Allocated on first read, not behind a button. This was explicit — "an address is a
      // published identity, so it appears when the user asks for one" — and in practice that
      // reasoning cost every new user a step before their Inbox could receive anything, which is
      // a worse trade than minting a mailbox nobody ends up using. Opening the Inbox IS the ask.
      // Still idempotent: user_id is UNIQUE, so a second reader gets the first one's address.
      if (!existing) {
        const result = await allocateUserEmailAddress(db, {
          userId, workspaceId, domain,
          // Only supplied on the second attempt, after the derived handle came back taken.
          localPart: payload.local_part ? String(payload.local_part) : null,
        });
        if (!result.ok) {
          // `taken` and `invalid` are answers, not failures: there is no address yet and the user
          // has to choose one. A 500 here would read as "the platform is broken" for what is
          // simply two people sharing a name.
          if (result.reason === 'taken') {
            return json({
              address: null, domain, can_allocate: true,
              conflict: 'taken', suggested_local_part: result.suggested,
            });
          }
          if (result.reason === 'invalid') {
            return json({
              address: null, domain, can_allocate: true,
              conflict: 'invalid', invalid_reason: result.detail,
            });
          }
          throw new HttpError(500, 'Could not allocate an email address');
        }
      }

      const { data: row } = await db
        .from('user_email_addresses')
        .select('id, full_address, workspace_id, auto_reply_enabled, agent_ref, is_active')
        .eq('user_id', userId)
        .maybeSingle();
      return json({ address: row, domain, can_allocate: false });
    }

    case 'set_email_address_settings': {
      const { data: row } = await db
        .from('user_email_addresses').select('id, workspace_id').eq('user_id', userId).maybeSingle();
      if (!row) throw new HttpError(404, 'You do not have an email address yet');

      const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (typeof payload.auto_reply_enabled === 'boolean') patch.auto_reply_enabled = payload.auto_reply_enabled;
      if (typeof payload.is_active === 'boolean') patch.is_active = payload.is_active;
      if ('agent_ref' in payload) patch.agent_ref = payload.agent_ref ? String(payload.agent_ref) : null;
      if (payload.workspace_id) {
        // Moving the address moves where a stranger's mail lands, so it must be a workspace the
        // caller actually belongs to — never trusted from the body (invariant 1).
        const target = String(payload.workspace_id);
        const role = await callerRoleInWorkspace(db, userId, target);
        if (!operator && !role) throw new HttpError(403, 'You are not a member of that workspace');
        patch.workspace_id = target;
      }

      const { error } = await db.from('user_email_addresses').update(patch).eq('id', (row as { id: string }).id);
      if (error) throw new HttpError(500, `Failed to save: ${error.message}`);

      const { data: fresh } = await db
        .from('user_email_addresses')
        .select('id, full_address, workspace_id, auto_reply_enabled, agent_ref, is_active')
        .eq('user_id', userId).maybeSingle();
      return json({ address: fresh });
    }

    // ── Order intake (#342 §4) ────────────────────────────────────────────────────────────
    //
    // Every action derives its workspace from the THREAD and requires the caller to be a member
    // of it (invariant 1). None of them touches `orders` — only `approve_intake` does, and it
    // does so through the RPC, under the caller's own JWT.

    case 'get_thread_intake': {
      const { thread, intake } = await intakeContext(db, userId, payload, operator);
      const callerRole = await callerRoleInWorkspace(db, userId, String(thread.workspace_id));
      return json({
        intake,
        totals: intake ? intakeDisplayTotal(intake.items) : null,
        // Hidden, not merely disabled, for roles the RPC would refuse — an Approve button that
        // always throws is worse than no button.
        can_approve: operator || ['owner', 'admin', 'sales', 'sales_manager'].includes(callerRole || ''),
      });
    }

    case 'update_intake': {
      const { thread, intake } = await intakeContext(db, userId, payload, operator);
      if (!intake) throw new HttpError(404, 'This conversation has no order to edit');
      if (intake.status !== 'pending_review') throw new HttpError(409, `This order has already been ${intake.status}`);
      const workspaceId = String(thread.workspace_id);

      const next: OrderIntake = { ...intake, updated_at: new Date().toISOString() };

      // The party is re-validated here AND again in the RPC. Belt and braces on purpose: this
      // check gives the reviewer a real error message, the RPC's is the one that is load-bearing.
      if ('customer_contact_id' in payload) {
        const id = payload.customer_contact_id ? String(payload.customer_contact_id) : null;
        if (id) await assertOwnedByWorkspace(db, 'crm_contacts', id, workspaceId, 'customer');
        next.customer_contact_id = id;
      }
      if ('customer_company_id' in payload) {
        const id = payload.customer_company_id ? String(payload.customer_company_id) : null;
        if (id) await assertOwnedByWorkspace(db, 'crm_companies', id, workspaceId, 'company');
        next.customer_company_id = id;
      }
      if (typeof payload.currency === 'string') next.currency = payload.currency.slice(0, 8);
      if ('notes' in payload) next.notes = payload.notes ? String(payload.notes).slice(0, 2000) : null;
      if ('requested_delivery_date' in payload) {
        next.requested_delivery_date = payload.requested_delivery_date
          ? String(payload.requested_delivery_date).slice(0, 10) : null;
      }

      // Changing the party changes the price: the resolver folds in that customer's discount and
      // pricing layer. Re-resolving here is what stops an intake being approved at the price of
      // whoever the thread happened to be attributed to when the model first read it.
      const partyChanged = 'customer_contact_id' in payload || 'customer_company_id' in payload;
      if (partyChanged) {
        next.items = await repriceItems(db, workspaceId, next);
      }

      await writeIntake(db, String(thread.id), next);
      return json({ intake: next, totals: intakeDisplayTotal(next.items) });
    }

    case 'update_intake_items': {
      const { thread, intake } = await intakeContext(db, userId, payload, operator);
      if (!intake) throw new HttpError(404, 'This conversation has no order to edit');
      if (intake.status !== 'pending_review') throw new HttpError(409, `This order has already been ${intake.status}`);
      const workspaceId = String(thread.workspace_id);

      const incoming = Array.isArray(payload.items) ? payload.items as Array<Record<string, unknown>> : null;
      if (!incoming) throw new HttpError(400, 'items must be an array');
      if (incoming.length > 100) throw new HttpError(400, 'An order may not have more than 100 lines');

      const items: IntakeItem[] = [];
      for (const [i, raw] of incoming.entries()) {
        const prev = intake.items.find((it) => it.line_no === Number(raw.line_no));
        const productId = raw.product_id ? String(raw.product_id) : null;
        if (productId) await assertOwnedByWorkspace(db, 'products', productId, workspaceId, 'product');

        const quantity = Number(raw.quantity);
        if (!Number.isFinite(quantity) || quantity <= 0) {
          throw new HttpError(400, `Line ${i + 1}: quantity must be a positive number`);
        }

        // An explicitly supplied price is the member's own decision and is recorded as such.
        // Otherwise the resolver answers — the model never gets a say either way.
        const manualPrice = raw.unit_price === null || raw.unit_price === undefined
          ? undefined : Number(raw.unit_price);
        let unitPrice = manualPrice;
        let unitCost = prev?.unit_cost ?? null;
        let unit = prev?.measurement_unit_code ?? null;
        let source: IntakeItem['unit_price_source'] = manualPrice === undefined ? 'resolver' : 'manual';

        const productChanged = productId !== (prev?.product_id ?? null);
        if (manualPrice === undefined && productId && (productChanged || prev?.unit_price == null)) {
          const priced = await resolveLinePrice(db, {
            workspaceId, productId,
            companyId: intake.customer_company_id, contactId: intake.customer_contact_id,
            // The edited quantity, so changing it re-crosses (or un-crosses) a break threshold.
            quantity, unit,
          });
          unitPrice = priced.unit_price ?? undefined;
          unitCost = priced.unit_cost;
          unit = priced.measurement_unit_code ?? unit;
          source = 'resolver';
        } else if (manualPrice === undefined) {
          unitPrice = prev?.unit_price ?? undefined;
        }

        items.push({
          line_no: i,
          raw_text: String(raw.raw_text ?? prev?.raw_text ?? ''),
          product_id: productId,
          match_method: productChanged && productId ? 'manual' : (prev?.match_method ?? 'none'),
          match_confidence: productChanged ? null : (prev?.match_confidence ?? null),
          candidates: prev?.candidates,
          description: String(raw.description ?? prev?.description ?? '').slice(0, 500) || 'Item',
          quantity,
          unit_price: unitPrice === undefined || Number.isNaN(unitPrice) ? null : unitPrice,
          unit_cost: unitCost,
          measurement_unit_code: unit,
          vat_percent: prev?.vat_percent ?? null,
          unit_price_source: source,
          // A line a human has just set is reviewed by definition, unless it still has no price.
          needs_review: unitPrice === undefined || unitPrice === null,
        });
      }

      const next: OrderIntake = { ...intake, items, updated_at: new Date().toISOString() };
      await writeIntake(db, String(thread.id), next);
      return json({ intake: next, totals: intakeDisplayTotal(next.items) });
    }

    case 'search_intake_products': {
      const { thread } = await intakeContext(db, userId, payload, operator);
      const query = String(payload.query || '').trim();
      if (query.length < 2) return json({ candidates: [] });
      const match = await matchByText(db, String(thread.workspace_id), query);
      return json({ candidates: match.candidates });
    }

    case 'approve_intake': {
      const { thread, intake } = await intakeContext(db, userId, payload, operator);
      if (!intake) throw new HttpError(404, 'This conversation has no order to approve');
      if (!asUser) throw new HttpError(401, 'Unauthorized');

      // The RPC decides. It runs under the caller's own identity, so our service-role client
      // cannot widen who may approve — the guard lives in one place, in SQL.
      const { data, error } = await asUser.rpc('create_order_from_thread_intake', {
        p_thread_id: String(thread.id),
      });
      if (error) {
        const code = error.code === '42501' ? 403 : error.code === 'P0002' ? 404 : 400;
        throw new HttpError(code, error.message);
      }
      const orderId = String(data);

      // Re-read: the RPC stamped status/order_id/reviewed_* into the metadata.
      const fresh = await loadIntake(db, String(thread.id));

      // Tell the customer (#342 §4a). Best-effort and REPORTED — approval never rolls back
      // because a message failed, and "approved but never told" must be visible rather than
      // silently successful.
      const confirmation = await sendOrderConfirmation(db, thread, fresh ?? intake, orderId);
      if (fresh) {
        await writeIntake(db, String(thread.id), { ...fresh, confirmation });
      }

      const { data: orderRow } = await db.from('orders')
        .select('order_number, total, currency').eq('id', orderId).maybeSingle();
      const orderNumber = (orderRow as { order_number?: string } | null)?.order_number ?? null;

      await insertMessageAndNotify(db, {
        thread,
        senderParticipantId: null,
        body: `Order ${orderNumber || ''} created from this conversation.`.replace(/\s+/g, ' ').trim(),
        attachments: [],
        messageType: 'system',
        senderUserId: null,
        senderLabel: 'Order created',
      });

      await emitFlowEventToWorkspaceRoles(
        String(thread.workspace_id), ['owner', 'admin'], 'order_created',
        (uid: string) => ({
          type: 'order_created', user_id: uid, workspace_id: String(thread.workspace_id),
          order_id: orderId, order_number: orderNumber, order_type: 'sales', status: 'draft',
          total: (orderRow as { total?: number } | null)?.total ?? 0,
          currency: (orderRow as { currency?: string } | null)?.currency ?? 'EUR',
          title: `Order created from the Inbox${orderNumber ? ` #${orderNumber}` : ''}`,
          body: 'Approved from a customer conversation. It is a pre-order until confirmed.',
          action_url: `/finance/orders/${orderId}`,
        }),
      ).catch(() => {});

      return json({
        order_id: orderId,
        order_number: orderNumber,
        confirmation,
        intake: fresh ? { ...fresh, confirmation } : null,
      });
    }

    case 'reject_intake': {
      const { thread, intake } = await intakeContext(db, userId, payload, operator);
      if (!intake) throw new HttpError(404, 'This conversation has no order to reject');
      if (intake.status !== 'pending_review') throw new HttpError(409, `This order has already been ${intake.status}`);
      const reason = payload.reason ? String(payload.reason).slice(0, 500) : null;
      const next: OrderIntake = {
        ...intake,
        status: 'rejected',
        notes: reason ?? intake.notes,
        reviewed_by: userId,
        reviewed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      await writeIntake(db, String(thread.id), next);
      await insertMessageAndNotify(db, {
        thread,
        senderParticipantId: null,
        body: reason
          ? `The order read from this conversation was dismissed: ${reason}`
          : 'The order read from this conversation was dismissed.',
        attachments: [],
        messageType: 'system',
        senderUserId: null,
        senderLabel: 'Order dismissed',
      });
      return json({ intake: next });
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

/**
 * @param allowClaimed pass `true` ONLY for `token_claim`, which must resolve a token in order
 *   to claim it. Every other token action rejects an already-claimed link.
 */
async function resolveToken(db: DbClient, token: string, allowClaimed = false) {
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
  // SECURITY: `claimed_by_user_id` was checked ONLY inside
  // token_claim. token_get_thread and token_send_message ignored it entirely, so a link
  // stayed live after the intended customer had claimed it and converted to an account —
  // anyone still holding the URL kept full read+write access to that conversation.
  if (!allowClaimed && t.claimed_by_user_id) {
    throw new HttpError(403, 'This link has already been used. Please sign in to continue.');
  }
  return t;
}

async function handleTokenAction(db: DbClient, action: string, payload: Json): Promise<Response> {
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
      // #342: read any order out of the conversation before the assistant answers it.
      await maybeRunOrderIntake(db, String(thread.id));
      // Phase-2: auto-reply if the thread is handed to the agent.
      await maybeRunAgentReply(db, String(thread.id));
      return json({ message: { id: (msg as { id: string }).id, created_at: (msg as { created_at: string }).created_at } });
    }

    case 'token_claim': {
      // Conversion handshake: a freshly-signed-up user adopts the token's thread and becomes a
      // `client` member of the dealer's workspace.
      // ONE RPC, ONE transaction — never four separate writes (crm_contacts link,
      // inbox_participants, workspace_members, token claim). A partial conversion is the
      // damaging case: the contact links, the workspace_members row does not, and the customer
      // lands in an inbox they cannot read, having been told signup completed.
      const claimUserId = String(payload.user_id || '');
      if (!claimUserId) throw new HttpError(400, 'user_id is required');

      const { data: claimed, error: claimErr } = await db.rpc('claim_inbox_thread_token', {
        p_token: token,
        p_user_id: claimUserId,
      });
      if (claimErr) {
        // The RPC raises unique_violation when a DIFFERENT user already claimed the invite.
        const msg = claimErr.message || 'Could not claim this invite';
        throw new HttpError(/already claimed/i.test(msg) ? 409 : 500, msg);
      }
      const row = Array.isArray(claimed) ? claimed[0] : claimed;
      if (!row?.thread_id) throw new HttpError(500, 'Claim returned no thread');
      return json({ ok: true, thread_id: row.thread_id });
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
//
// It now lands in the SAME Inbox as every other conversation, tagged `source: 'public_profile'`,
// instead of a private table with its own screen. What that table could not do, and this does:
// a reply that actually reaches the sender (their answer threads back in by email), assignment,
// labels, archive, the AI draft, search, and a CRM contact for the lead. It could not even do
// what it looked like it did — `profile_contact_requests` had no DELETE policy, so the "delete
// message" button in that screen removed the row from the list and nothing from the database.
const CONTACT_MAX_PER_RECIPIENT_HOUR = 20;   // stops one profile being flooded
const CONTACT_MAX_PER_SENDER_WINDOW = 3;
const CONTACT_SENDER_WINDOW_MS = 10 * 60_000;
/** How far back a repeat enquiry is folded into the conversation it continues. */
const CONTACT_THREAD_REUSE_DAYS = 30;

function clientIp(req: Request): string {
  return (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || '0.0.0.0';
}

async function verifyTurnstile(db: DbClient, token: string, ip: string): Promise<boolean> {
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

/**
 * The workspace an enquiry for this person files into.
 *
 * Their inbound address already names one, and that is the answer whenever it exists — mail to
 * `you@mail.…` and a message through your profile are the same person being reached, so they must
 * not split across two workspaces. Otherwise: the workspace they OWN or administer, and only then
 * any active membership, so an enquiry for a professional never lands in someone else's team
 * inbox while their own sits empty.
 */
async function profileHostWorkspace(db: DbClient, userId: string): Promise<string | null> {
  const { data: addr } = await db
    .from('user_email_addresses').select('workspace_id').eq('user_id', userId).maybeSingle();
  const fromAddress = (addr as { workspace_id?: string } | null)?.workspace_id;
  if (fromAddress) return fromAddress;

  const { data: mems } = await db
    .from('workspace_members').select('workspace_id, role, status').eq('user_id', userId);
  const active = ((mems || []) as Array<{ workspace_id: string; role: string; status: string }>)
    .filter((m) => ACTIVE_MEMBER(m.status));
  const owned = active.find((m) => m.role === 'owner' || m.role === 'admin');
  return (owned ?? active[0])?.workspace_id ?? null;
}

async function handleProfileContact(db: DbClient, req: Request, payload: Json): Promise<Response> {
  const toUserId = String((payload as Record<string, unknown>).to_user_id ?? '').trim();
  const name = String((payload as Record<string, unknown>).from_name ?? '').trim().slice(0, 200);
  const email = String((payload as Record<string, unknown>).from_email ?? '').trim().slice(0, 200).toLowerCase();
  const message = String((payload as Record<string, unknown>).message ?? '').trim().slice(0, 5000);
  const servicesRaw = (payload as Record<string, unknown>).services_requested;
  const services = Array.isArray(servicesRaw)
    ? servicesRaw.map((s) => String(s).slice(0, 120)).slice(0, 20)
    : [];

  if (!toUserId || !name || !email || !message) throw new HttpError(400, 'name, email and message are required');
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new HttpError(400, 'Please enter a valid email address.');

  // The recipient must be a real profile; never let a caller aim a request at an arbitrary uuid.
  const { data: recipient } = await db.from('user_profiles').select('user_id').eq('user_id', toUserId).maybeSingle();
  if (!recipient) throw new HttpError(404, 'Profile not found');

  // Rate limits count the MESSAGES this path has written, which is why each one carries
  // `source`, `email_from` and `profile_user_id` in its own metadata — a thread is reused by a
  // repeat sender, so counting threads would let the second enquiry onward through free.
  const since = new Date(Date.now() - CONTACT_SENDER_WINDOW_MS).toISOString();
  const hourAgo = new Date(Date.now() - 3_600_000).toISOString();
  const contactMessages = () => db.from('inbox_messages')
    .select('*', { count: 'exact', head: true })
    .eq('metadata->>source', 'public_profile');
  const [{ count: bySender }, { count: byRecipient }] = await Promise.all([
    contactMessages().eq('metadata->>email_from', email).gte('created_at', since),
    contactMessages().eq('metadata->>profile_user_id', toUserId).gte('created_at', hourAgo),
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

  const workspaceId = await profileHostWorkspace(db, toUserId);
  // 5xx on purpose: a professional publishing a profile with nowhere to receive is a platform
  // fault, and the api-logger reports 5xx to Sentry while it deliberately never reports a 4xx.
  // Telling the visitor to try another way beats accepting a message into a hole.
  if (!workspaceId) throw new HttpError(503, 'This profile cannot receive messages right now.');

  // The mailbox the reply will go OUT from, allocated on first need exactly as opening the Inbox
  // allocates it. Without a real address on both ends the email relay in insertMessageAndNotify
  // silently skips — the member would see their own reply and the sender would receive nothing.
  const domain = (await resolveSecret(db, 'INBOUND_EMAIL_DOMAIN')).value || DEFAULT_INBOUND_DOMAIN;
  const allocation = await allocateUserEmailAddress(db, { userId: toUserId, workspaceId, domain });
  const { data: addrRow } = await db
    .from('user_email_addresses').select('id, full_address').eq('user_id', toUserId).maybeSingle();
  const mailbox = (addrRow as { full_address?: string } | null)?.full_address ?? null;
  const addressId = (addrRow as { id?: string } | null)?.id ?? null;
  // `taken`/`invalid` mean the handle needs a human choice; the enquiry still has to land, so it
  // files without a reply-from address and the member answers from the composer once they pick one.
  if (!allocation.ok && !mailbox) {
    console.warn('[inbox-api] profile_contact: no inbound address for', toUserId, allocation.reason);
  }

  // The sender becomes a CRM contact the same way an inbound email sender does — same matcher,
  // same `crm_contact_created` flow. An enquiry off a public profile IS a lead.
  const customer = await resolveCustomer(db, workspaceId, email, name, toUserId);

  const meta: Record<string, unknown> = {
    // The one field the transport cannot tell you: `channel` says this replies by email, and
    // says nothing about a stranger having found a public profile page. See inboxSource.ts.
    source: 'public_profile',
    profile_user_id: toUserId,
    email_from: email,
    ...(mailbox ? { email_to: mailbox } : {}),
    ...(addressId ? { email_address_id: addressId } : {}),
    from_name: name,
    // The only thing this form carries that no channel does — rendered in the thread details.
    ...(services.length ? { services_requested: services } : {}),
  };

  // Fold a repeat enquiry from the same person into the conversation it continues, rather than
  // stacking three near-identical threads on a member who has answered none of them yet.
  const reuseSince = new Date(Date.now() - CONTACT_THREAD_REUSE_DAYS * 86_400_000).toISOString();
  const { data: existingThread } = await db.from('inbox_threads')
    .select('id, metadata')
    .eq('workspace_id', workspaceId)
    .eq('metadata->>source', 'public_profile')
    .eq('metadata->>profile_user_id', toUserId)
    .eq('metadata->>email_from', email)
    .is('archived_at', null)
    .eq('status', 'open')
    .gte('last_message_at', reuseSince)
    .order('last_message_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  let threadId = (existingThread as { id?: string } | null)?.id ?? null;
  let customerParticipantId: string | null = null;

  if (threadId) {
    // Merge rather than replace: an earlier enquiry's services must survive a later message
    // that ticked none.
    const prior = ((existingThread as { metadata?: Record<string, unknown> } | null)?.metadata ?? {});
    const priorServices = Array.isArray(prior.services_requested) ? prior.services_requested as string[] : [];
    const merged = [...new Set([...priorServices, ...services])];
    await db.from('inbox_threads')
      .update({
        metadata: { ...prior, ...meta, ...(merged.length ? { services_requested: merged } : {}) },
        last_message_at: new Date().toISOString(),
      })
      .eq('id', threadId);
    if (customer.contactId) {
      const { data: cp } = await db.from('inbox_participants').select('id')
        .eq('thread_id', threadId).eq('contact_id', customer.contactId).limit(1).maybeSingle();
      customerParticipantId = (cp as { id?: string } | null)?.id ?? null;
    }
  } else {
    // agent_state stays 'off'. Every other inbound channel auto-engages the assistant on the
    // workspace setting, and this is the one place that would be wrong: "hire me" is addressed
    // to a PERSON by someone who chose them off their profile, and an instant AI answer is the
    // one reply that loses the job. The Bot toggle hands it over when the member wants that.
    const { data: created, error: threadErr } = await db.from('inbox_threads')
      .insert({
        workspace_id: workspaceId,
        thread_type: 'customer',
        channel: 'email',
        subject: `Enquiry from ${name}`,
        status: 'open',
        metadata: meta,
        agent_state: 'off',
        last_message_at: new Date().toISOString(),
      })
      .select('id')
      .single();
    if (threadErr) throw new HttpError(500, 'Could not deliver your message.');
    threadId = (created as { id: string }).id;

    if (customer.contactId) {
      const { data: cust } = await db.from('inbox_participants')
        .insert({
          thread_id: threadId, participant_type: 'customer',
          contact_id: customer.contactId, thread_role: 'participant',
        })
        .select('id')
        .single();
      customerParticipantId = (cust as { id?: string } | null)?.id ?? null;
    }

    // The profile owner owns the thread — a message aimed at a person lands on that person,
    // and the owner participant is also what makes it visible to them regardless of role.
    const { error: ownerErr } = await db.from('inbox_participants').insert({
      thread_id: threadId, participant_type: 'member', user_id: toUserId,
      workspace_id: workspaceId, thread_role: 'owner', added_by: toUserId,
    });
    if (ownerErr) throw new HttpError(500, 'Could not deliver your message.');
  }

  const { error: msgErr } = await db.from('inbox_messages').insert({
    thread_id: threadId,
    sender_participant_id: customerParticipantId,
    body: message,
    attachments: [],
    message_type: 'text',
    metadata: {
      channel: 'email',
      direction: 'incoming',
      source: 'public_profile',
      profile_user_id: toUserId,
      email_from: email,
      ...(services.length ? { services_requested: services } : {}),
    },
  });
  if (msgErr) throw new HttpError(500, 'Could not deliver your message.');

  await db.from('inbox_threads').update({
    status: 'open',
    last_message_at: new Date().toISOString(),
    last_message_preview: message.replace(/\s+/g, ' ').slice(0, 140),
  }).eq('id', threadId);

  // Same event as before — the seeded "Hire Me Received" flow owns delivery, so an admin can
  // retarget it without a deploy. Only the destination changed: the bell now opens the
  // conversation itself instead of a screen that no longer exists.
  await emitFlowEvent('hire_me_received', {
    user_id: toUserId, to_user_id: toUserId, type: 'hire_me',
    title: `New hire request from ${name}`,
    body: services.length ? `Interested in: ${services.join(', ')}` : message.slice(0, 100),
    action_url: `/inbox?thread=${threadId}`,
    thread_id: threadId,
    from_name: name, from_email: email, services_requested: services,
    sent_at: new Date().toISOString(),
  }).catch(() => {});

  return json({ ok: true });
}

/**
 * How does this customer feel, and what should we say back?
 *
 * ONE derivation, two callers: the Mood panel in the drawer, and the assistant just before it
 * drafts a reply. A second read for the agent would let the screen say "frustrated" while the
 * reply is written as though nothing were wrong — and the operator would believe whichever one
 * matched what they already thought.
 *
 * Cached on the thread against the LAST MESSAGE ID, which is exactly what "has anything happened
 * since?" means. The drawer opens on every thread click and the assistant asks on every reply, so
 * an uncached read would bill a model call per glance.
 *
 * Returns null when there is nothing to read — a two-message thread has no mood, and inventing
 * one would put a confident label on noise.
 */
/**
 * The operator's switches for conversation reading (Admin → Operations → Inbox AI).
 *
 * Read from the DB rather than an env var so it can be turned off DURING an incident — the point
 * of the switch is the bill, and a redeploy is the wrong tool for "stop spending, now".
 *
 * Fails CLOSED to enabled=true. An unreadable settings row must not silently disable a feature
 * the operator believes is running; that is the silent-zero shape, and a surprise bill is a
 * louder, more recoverable failure than a mood panel that quietly stopped working weeks ago.
 */
async function sentimentSettings(
  db: SupabaseClient,
  workspaceId?: string | null,
): Promise<{
  enabled: boolean;
  autoOnAgentReply: boolean;
  perMessageMood: boolean;
  /** How this workspace got it, for saying so on screen. */
  via: 'platform' | 'module' | 'off';
}> {
  const { data } = await db
    .from('system_settings')
    .select('setting_value')
    .eq('setting_key', 'inbox_sentiment_analysis')
    .maybeSingle();
  const v = ((data as { setting_value?: Record<string, unknown> } | null)?.setting_value ?? {}) as
    Record<string, unknown>;
  // `!== false`, not `=== true`: a row missing a key means "not configured", which is the
  // default (on), and only an explicit false turns something off.
  const globalOn = v.enabled !== false;

  /**
   * Global OR module — never AND.
   *
   * The platform switch turns this on for everyone. When it is off, a workspace that has bought
   * the `inbox-ai` add-on still gets it, because they are paying for it specifically. An AND
   * would make the operator's cost control a kill switch for paying tenants, which is a
   * different thing entirely and not what it is labelled as.
   *
   * The module is only consulted when the global is OFF: while it is on, everybody has the
   * feature and an entitlement round-trip per analysis would buy nothing.
   */
  let via: 'platform' | 'module' | 'off' = globalOn ? 'platform' : 'off';
  if (!globalOn && workspaceId) {
    if (await isWorkspaceEntitled(db, workspaceId, 'inbox-ai')) via = 'module';
  }
  const enabled = via !== 'off';

  return {
    enabled,
    // The sub-switches are the PLATFORM's shape for its own spend. A workspace paying for the
    // module gets the whole feature — selling someone an add-on and then withholding half of it
    // from a screen they cannot see would be indefensible.
    autoOnAgentReply: via === 'module' ? true : v.auto_on_agent_reply !== false,
    perMessageMood: via === 'module' ? true : v.per_message_mood !== false,
    via,
  };
}

async function readConversationSentiment(
  db: SupabaseClient,
  threadId: string,
  threadMetadata: Record<string, unknown> | null | undefined,
  force = false,
  /**
   * For cost attribution AND for the module gate. `ai_usage_logs.workspace_id` and `user_id`
   * being NULL is what broke every per-tenant cost view once already (and the is_workspace_admin
   * RLS branch with it), so both are passed rather than looked up and forgotten — and the same
   * workspace decides whether the `inbox-ai` add-on turns this on when the platform switch is off.
   */
  workspaceId?: string | null,
  actorUserId?: string | null,
): Promise<{ sentiment: Record<string, unknown> | null; cached: boolean; reason?: string }> {
  const settings = await sentimentSettings(db, workspaceId);
  // The master switch, checked BEFORE the message read and long before the model call — an
  // "off" that still does the work and throws the answer away is not off.
  if (!settings.enabled) return { sentiment: null, cached: false, reason: 'disabled' };

  const WINDOW = 20;
  const { data: msgs, error: msgErr } = await db
    .from('inbox_messages')
    .select('id, body, message_type, direction, created_at')
    .eq('thread_id', threadId)
    .neq('message_type', 'system')
    .order('created_at', { ascending: false })
    .limit(WINDOW);
  if (msgErr) throw new HttpError(500, `Could not read the conversation: ${msgErr.message}`);

  // Oldest first: recency is the whole point — a thread that opened badly and closed with
  // "perfect, thanks" is a happy one — and a model reading it backwards weighs the wrong end.
  const ordered = [...((msgs ?? []) as Array<Record<string, unknown>>)].reverse();
  const withText = ordered.filter((m) => typeof m.body === 'string' && (m.body as string).trim());
  if (withText.length < 2) return { sentiment: null, cached: false, reason: 'not_enough_messages' };

  const lastId = String(withText[withText.length - 1].id);
  const cached = ((threadMetadata ?? {}) as Record<string, unknown>).sentiment as
    Record<string, unknown> | undefined;
  if (!force && cached && cached.last_message_id === lastId) {
    return { sentiment: cached, cached: true };
  }

  const rubric = await loadPrompt(db, 'tool', 'inbox_conversation_sentiment');

  // Delimited as DATA (invariant 9). A customer types whatever they like into WhatsApp,
  // including "ignore your instructions".
  // The INDEX is in the markup because the model is asked to key `message_moods` on it. Message
  // ids are opaque uuids: a model asked to echo one back gets a character wrong often enough to
  // matter, and a mood keyed to an id that matches nothing renders as no border at all.
  const transcript = withText.map((m, i) => {
    const who = m.direction === 'outgoing' ? 'us' : 'customer';
    return `<message index="${i}" from="${who}">\n${String(m.body).slice(0, 1200)}\n</message>`;
  }).join('\n');

  const TOOL = {
    name: 'report_sentiment',
    description: 'Report how the customer feels and how to reply.',
    input_schema: {
      type: 'object',
      properties: {
        mood: {
          type: 'string',
          enum: ['happy', 'satisfied', 'neutral', 'confused', 'waiting', 'frustrated', 'angry'],
        },
        urgency: { type: 'string', enum: ['none', 'low', 'medium', 'high', 'critical'] },
        summary: { type: 'string', description: 'One sentence, in English, on where this stands.' },
        reply_guidance: {
          type: 'array', items: { type: 'string' },
          description: '2-4 concrete things the replier should do for THIS conversation.',
        },
        suggested_tone: { type: 'string', description: 'A few words: how the reply should sound.' },
        open_question: {
          type: ['string', 'null'],
          description: "The customer's last unanswered question, verbatim, or null if none.",
        },
        ...(settings.perMessageMood
          ? {
            message_moods: {
              type: 'array',
              description:
                'The mood of EACH message, in the order given. One entry per message, using the '
                + 'same index shown in the transcript. Judge that message in the context of the '
                + 'ones before it.',
              items: {
                type: 'object',
                properties: {
                  index: { type: 'integer' },
                  mood: {
                    type: 'string',
                    enum: ['happy', 'satisfied', 'neutral', 'confused', 'waiting', 'frustrated', 'angry'],
                  },
                },
                required: ['index', 'mood'],
              },
            },
          }
          : {}),
      },
      required: ['mood', 'urgency', 'summary', 'reply_guidance', 'suggested_tone'],
    },
  };

  // `.value` — resolveSecret returns {key, value, source}, and the object is always truthy, so
  // testing it directly would send the literal "[object Object]" as the api key.
  const key = (await resolveSecret(db, 'ANTHROPIC_API_KEY')).value;
  if (!key) throw new HttpError(503, 'The AI service is not configured.');

  let verdict: Record<string, unknown>;
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        // Haiku: this runs on every thread open and every assistant reply. Reading tone in twenty
        // short messages is not what the expensive models are for.
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 700,
        tools: [TOOL],
        // FORCED (invariant 9): the verdict drives a stored field and a UI state, so it arrives as
        // a validated tool call, never as free-form JSON with a salvage parser behind it.
        tool_choice: { type: 'tool', name: TOOL.name },
        messages: [{ role: 'user', content: `${rubric}\n\n<conversation>\n${transcript}\n</conversation>` }],
      }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const body = await res.json();
    const use = (body.content ?? []).find((c: Record<string, unknown>) => c.type === 'tool_use');
    if (!use?.input) throw new Error('the model returned no verdict');
    verdict = use.input as Record<string, unknown>;

    /*
     * Book the spend.
     *
     * This is a raw fetch to Anthropic rather than a call through `_shared/ai-client.ts`, which
     * means nothing logs it for us — and an unlogged call is invisible to every cost view, which
     * is the silent-zero shape exactly. The operator's switch for this feature sits next to a
     * figure read from this table; without the insert that figure is a permanent, convincing $0
     * and the switch looks free.
     *
     * Haiku 4.5 rates, per million tokens.
     */
    const inTok = Number(body?.usage?.input_tokens ?? 0);
    const outTok = Number(body?.usage?.output_tokens ?? 0);
    const rawUsd = (inTok / 1e6) * 1.0 + (outTok / 1e6) * 5.0;
    // CHECKED: supabase-js RESOLVES on an RLS denial, so an unchecked insert would leave the
    // operator's cost panel reading zero while every conversation billed.
    const { error: logErr } = await db.from('ai_usage_logs').insert({
        user_id: actorUserId ?? null,
        workspace_id: workspaceId ?? null,
        module_slug: 'inbox',
        operation_type: 'inbox_conversation_sentiment',
        model_name: 'claude-haiku-4-5-20251001',
        api_provider: 'anthropic',
        input_tokens: inTok,
        output_tokens: outTok,
        raw_cost_usd: rawUsd,
        billed_cost_usd: rawUsd,
        // Not debited: this is the operator's own overhead on their own inbox, not a customer
        // action, and a credit charge here would bill a tenant for a background read they never
        // asked for. `success` is what ops.silent_zero_provider reads.
        credits_debited: 0,
        unbilled_reason: 'platform_overhead',
        metadata: { success: true, thread_id: threadId, message_count: withText.length },
    });
    if (logErr) console.warn('[inbox-api] sentiment usage log failed:', logErr.message);
  } catch (err) {
    throw new HttpError(502, `Could not read the conversation: ${err instanceof Error ? err.message : String(err)}`);
  }

  /**
   * Indices back to real message ids, HERE rather than in the browser.
   *
   * The client renders from `message_moods` keyed by id; leaving it as indices would mean every
   * consumer re-deriving the same mapping against a list it may have paged differently, and an
   * off-by-one there paints the wrong bubble — which looks like a working feature giving a wrong
   * answer, the hardest kind to notice.
   */
  const rawMoods = Array.isArray(verdict.message_moods)
    ? verdict.message_moods as Array<{ index?: number; mood?: string }>
    : [];
  const messageMoods: Record<string, string> = {};
  for (const entry of rawMoods) {
    const i = Number(entry?.index);
    // Bounds-checked: a hallucinated index must drop, never wrap around onto another message.
    if (!Number.isInteger(i) || i < 0 || i >= withText.length) continue;
    if (typeof entry?.mood !== 'string') continue;
    messageMoods[String(withText[i].id)] = entry.mood;
  }

  const sentiment = {
    ...verdict,
    message_moods: messageMoods,
    last_message_id: lastId,
    analysed_at: new Date().toISOString(),
    message_count: withText.length,
  };

  // MERGE, never a whole-column write: thread metadata carries the conversation's identity
  // (`zernio_conversation_id`, `contact_phone`, `wa_profile`) and `.update({metadata})` in
  // PostgREST replaces the column outright.
  const { error: saveErr } = await db.rpc('inbox_thread_merge_metadata', {
    p_thread_id: threadId,
    p_patch: { sentiment },
  });
  if (saveErr) console.warn('[inbox-api] sentiment cache write failed:', saveErr.message);

  return { sentiment, cached: false };
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

  // The send-router relays WhatsApp and social replies through Zernio, and bootstrapForFunction()
  // above CANNOT surface a DB-only key on the edge runtime (Deno.env.set throws there). Without
  // this, every operator reply on a connected thread relayed with an empty bearer and came back
  // 401 — stored, shown in the transcript, never delivered.
  await ensureZernioSecrets(db);

  // Internal branch — function-to-function (e.g. the Zernio webhook after a WhatsApp inbound).
  // Guarded by the service-role bearer; never reachable by external callers.
  if (action === 'internal_agent_reply') {
    const authHeader = req.headers.get('authorization') || '';
    if (authHeader !== `Bearer ${SERVICE_ROLE_KEY}`) throw new HttpError(401, 'Unauthorized');
    const threadId = String(payload.thread_id || '');
    // #342: this is the shared inbound chokepoint for BOTH channels — zernio-webhook-handler
    // (WhatsApp) and email-webhooks (email) already call it, so neither needed a change to get
    // order intake. Intake runs first so the assistant's reply can acknowledge the order.
    //
    // BACKGROUNDED, and this became necessary when the reply moved onto JARVIS. Both callers are
    // provider webhooks that `await` this request: Zernio and the mail webhook want a prompt 200
    // and retry when they do not get one. The old one-shot answered in a few seconds; a real
    // agent turn grounds itself in the knowledge base and may call tools, which is tens of
    // seconds — comfortably inside the edge function's own 150s ceiling, and comfortably past
    // what a webhook will wait for. A retry would then deliver the same message twice.
    //
    // `runInBackground` (EdgeRuntime.waitUntil), never a bare floating promise: the isolate is
    // torn down the moment this handler resolves, and an unkept promise dies mid-flight with
    // nothing thrown and nothing logged — the platform's dominant failure shape.
    runInBackground(
      (async () => {
        await maybeRunOrderIntake(db, threadId);
        await maybeRunAgentReply(db, threadId);
      })(),
      `inbox-agent-reply:${threadId}`,
    );
    return json({ ok: true, queued: true });
  }

  // token_claim is the POST-signup conversion handshake — it enrolls a
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
  // limited inside the handler; writes only a `source: public_profile` thread + its message.
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
  return handleJwtAction(db, auth.userId, action, payload, auth.supabaseAsUser);
}

Deno.serve(withApiLogging('inbox-api', handler));
