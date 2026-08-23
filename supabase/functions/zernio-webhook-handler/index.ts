/**
 * Zernio Webhook Handler Edge Function
 *
 * Receives incoming webhooks from Zernio and updates local DB.
 * Validates HMAC-SHA256 signature using ZERNIO_WEBHOOK_SECRET (falls back to
 * the legacy LATE_WEBHOOK_SECRET).
 *
 * Zernio payload shape: { id, event, post|account, timestamp }
 *
 * Supported events:
 *   post.scheduled      → social_posts.status = 'scheduled'
 *   post.published      → social_posts.status = 'published', published_at = now()
 *   post.partial        → social_posts.status = 'published' (best-effort; per-platform errors stored)
 *   post.failed         → social_posts.status = 'failed'
 *   post.cancelled      → social_posts.status = 'cancelled'
 *   account.disconnected → social_accounts.is_active = false
 *   message.received    → capture WhatsApp reply into the unified inbox: inbox_threads
 *                         (thread_type='customer', channel='whatsapp') + inbox_participants
 *                         (channel-customer + assign-on-reply owner) + inbox_messages, STOP/START
 *   message.delivered|read|failed → update messaging_logs / campaign recipient delivery status
 *
 * This is the single Zernio webhook endpoint for BOTH social posts and WhatsApp
 * messaging. Register one webhook in Zernio subscribed to post.* + account.* +
 * message.* events.
 */

import { createClient } from '@supabase/supabase-js';
import { jsonResponse } from '../_shared/http.ts';
import { corsHeaders } from '../_shared/cors.ts';
import { bootstrapForFunction } from '../_shared/secrets-bootstrap.ts';
import { ensureZernioSecrets, zernioWebhookSecret } from '../_shared/zernio.ts';
import { emitFlowEvent, emitFlowEventToWorkspaceRoles, emitInboxMessageEvent } from '../_shared/flow-events.ts';
import { withApiLogging } from '../_shared/api-logger.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
// Resolved via _shared/zernio.ts (env → platform_secrets); ensureZernioSecrets() runs at
// handler entry, before the first read below. A local Deno.env-only copy lived here and
// could not see an admin-saved secret, so verifySignature failed CLOSED on every inbound
// message whenever ZERNIO_WEBHOOK_SECRET was DB-only.
const webhookSecret = zernioWebhookSecret;

const OPT_OUT_KEYWORDS = ['STOP', 'UNSUBSCRIBE', 'CANCEL', 'END', 'QUIT', 'STOPALL', 'STOP ALL'];
const OPT_IN_KEYWORDS = ['START', 'YES', 'UNSTOP', 'SUBSCRIBE'];


/** Verify HMAC-SHA256 signature from Zernio (X-Zernio-Signature) */
async function verifySignature(rawBody: ArrayBuffer, signature: string): Promise<boolean> {
  if (!webhookSecret()) return false;

  try {
    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(webhookSecret()),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign'],
    );

    const expectedSig = await crypto.subtle.sign('HMAC', key, rawBody);
    const expectedHex = Array.from(new Uint8Array(expectedSig))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');

    // Support both "sha256=xxx" and plain hex formats
    const receivedHex = signature.startsWith('sha256=') ? signature.slice(7) : signature;
    // constant-time comparison — a plain `===` on the HMAC leaks timing.
    return timingSafeEqualHex(expectedHex, receivedHex);
  } catch {
    return false;
  }
}

/** Constant-time hex string comparison. */
function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Pull the first per-platform error out of a Zernio post payload, if any. */
function firstPlatformError(post: any): string | undefined {
  const platforms = (post?.platforms || []) as Array<{ error?: string }>;
  const withError = platforms.find(p => p?.error);
  return withError?.error;
}

const accountIdOf = (account: any): string | undefined => account?.accountId || account?.id || account?._id;

/**
 * Display name for a network, for notification copy only. Zernio sends the slug (`linkedin`),
 * and a notification reading "linkedin connected" is the one place a user sees a raw slug.
 * Casing is per-brand, so there is no rule to derive it from — an unknown slug falls back to
 * itself rather than guessing. Nothing branches on this; the slug stays the identifier.
 */
const PLATFORM_LABELS: Record<string, string> = {
  instagram: 'Instagram', facebook: 'Facebook', linkedin: 'LinkedIn', tiktok: 'TikTok',
  pinterest: 'Pinterest', youtube: 'YouTube', twitter: 'X (Twitter)', x: 'X (Twitter)',
  threads: 'Threads', whatsapp: 'WhatsApp',
};
const platformLabel = (platform?: string): string =>
  (platform ? PLATFORM_LABELS[platform] ?? platform : 'An account');

/** WhatsApp contact phone in E.164 (with +). sender.phoneNumber wins; sender.id is digits-only. */
function contactPhoneOf(sender: any): string | undefined {
  // Every shape a WhatsApp sender arrives in, because this function decides whether the message
  // is filed or discarded and it used to accept exactly two of them.
  //
  // It required `phoneNumber`, or an `id` of BARE digits. A live webhook happens to satisfy that;
  // a back-filled conversation does not — Zernio identifies a participant by a JID
  // (`306948408542@s.whatsapp.net`) or an E.164 string with the plus already on it, and both fail
  // `/^\d{6,}$/`. 103 replayed messages were dropped for "no resolvable phone" and every one
  // returned 200, so the import reported success and the inbox stayed empty.
  const candidates = [sender?.phoneNumber, sender?.phone, sender?.wa_id, sender?.id];
  for (const raw of candidates) {
    if (!raw) continue;
    // A JID carries the number before the @; anything else is taken as written.
    const digits = String(raw).split('@')[0].replace(/[^\d]/g, '');
    if (digits.length >= 6) return '+' + digits;
  }
  return undefined;
}

/**
 * Resolve the owning workspace for an inbound WhatsApp message from its Zernio account.
 * Account → messaging_channels (by zernio_account_id) → config.profile_id →
 * social_zernio_profiles → workspace_id. Local lookups only (no Zernio API call).
 */
async function resolveAccountWorkspace(
  supabase: any,
  accountId: string | undefined,
): Promise<{ workspaceId: string | null; channelId: string | null; profileId: string | null }> {
  if (!accountId) return { workspaceId: null, channelId: null, profileId: null };
  const { data: channel } = await supabase
    .from('messaging_channels').select('id, config, workspace_id')
    .eq('zernio_account_id', accountId).maybeSingle();
  const profileId = (channel?.config as { profile_id?: string } | null)?.profile_id ?? null;

  // The channel row OWNS the answer. This used to resolve only via config.profile_id →
  // social_zernio_profiles, two hops that are each nullable: a channel written before that key
  // existed, or one whose profile row was reaped, resolved to NO workspace and the message was
  // dropped on the floor — indistinguishable from "nobody messaged us".
  let workspaceId: string | null = channel?.workspace_id ?? null;

  // Fall back to the profile map only when the direct binding is absent, and repair the row so
  // the next delivery takes the short path.
  if (!workspaceId && profileId) {
    const { data: prof } = await supabase
      .from('social_zernio_profiles').select('workspace_id').eq('zernio_profile_id', profileId).maybeSingle();
    workspaceId = prof?.workspace_id ?? null;
    if (workspaceId && channel?.id) {
      await supabase.from('messaging_channels').update({ workspace_id: workspaceId }).eq('id', channel.id);
    }
  }
  return { workspaceId, channelId: channel?.id ?? null, profileId };
}

/** First active owner/admin of a workspace — the default thread owner when no campaign owner exists. */
async function resolveWorkspaceOwner(supabase: any, workspaceId: string): Promise<string | null> {
  const { data } = await supabase
    .from('workspace_members').select('user_id, role')
    .eq('workspace_id', workspaceId).in('role', ['owner', 'admin']).limit(1).maybeSingle();
  return data?.user_id ?? null;
}

/** Match an existing CRM contact by phone within a workspace, or create one. */
async function matchOrCreateContact(
  supabase: any,
  workspaceId: string,
  phone: string,
  name: string | null,
  createdBy: string | null,
): Promise<string | null> {
  // `phone` originates from the webhook payload (sender.phoneNumber). Strip everything that isn't a
  // digit or '+' before building the PostgREST .or() filter — a crafted value containing `,`/`)`/
  // `and(...)` would otherwise alter the query grammar (filter injection). A valid E.164 phone is
  // only `+` and digits, so this is loss-free for legitimate input.
  const safePhone = phone.replace(/[^\d+]/g, '');
  const { data: existing } = await supabase
    .from('crm_contacts').select('id')
    .eq('workspace_id', workspaceId).or(`phone.eq.${safePhone},mobile.eq.${safePhone}`).limit(1).maybeSingle();
  if (existing?.id) return existing.id;
  // A contact's ADDITIONAL named numbers (crm_phones) count too — someone replying from the
  // number saved as "Warehouse" is the same contact, not a new lead. Matched on the generated
  // `phone_normalized` column so "+30 210 123 4567" resolves against an E.164 payload.
  const { data: byExtraPhone } = await supabase
    .from('crm_phones').select('contact_id')
    .eq('workspace_id', workspaceId).eq('phone_normalized', safePhone)
    .not('contact_id', 'is', null).limit(1).maybeSingle();
  if (byExtraPhone?.contact_id) return byExtraPhone.contact_id;
  // crm_contacts.created_by is NOT NULL — fall back to the workspace owner.
  const owner = createdBy || (await resolveWorkspaceOwner(supabase, workspaceId));
  if (!owner) return null;
  const { data: created } = await supabase.from('crm_contacts').insert({
    workspace_id: workspaceId, name: name || phone, phone, created_by: owner, lead_source: 'whatsapp',
  }).select('id').single();
  // A WhatsApp reply from an unknown number is a genuine new lead written directly to crm_contacts
  // (bypassing crm-api), so fire crm_contact_created here or the "new lead → notify/assign" flow never
  // runs for it. Notify workspace owners/admins. Best-effort.
  if (created?.id) {
    try {
      await emitFlowEventToWorkspaceRoles(workspaceId, ['owner', 'admin'], 'crm_contact_created', (uid: string) => ({
        type: 'crm_contact_created', workspace_id: workspaceId, user_id: uid,
        contact_id: created.id, contact_name: name || phone, lead_source: 'whatsapp',
        title: 'New WhatsApp lead', body: `${name || phone} messaged you on WhatsApp.`,
        action_url: `/crm/contacts/${created.id}`,
      }));
    } catch { /* best-effort */ }
  }
  return created?.id ?? null;
}

/**
 * Inbound WhatsApp reply (message.received) → the unified inbox.
 * A WhatsApp reply is a `thread_type='customer'`, `channel='whatsapp'` thread owned by the
 * workspace whose WABA received it. The contact is a channel-customer participant (contact_id,
 * user_id NULL — never converts to an app account). Assign-on-first-reply adds the campaign /
 * workspace owner as the `owner` member participant. STOP/START opt-out handling preserved.
 */
/**
 * What happened to one inbound message.
 *
 * Every drop below used to be a bare `return`, and the handler answered 200 either way — correct
 * as a webhook (Zernio must not retry a message we will never want) and useless to anything
 * asking whether the message landed. The back-fill counted those 200s as imports and reported a
 * full inbox while nothing had been filed.
 *
 * The reason travels with the outcome because the reasons need different fixes: an unresolvable
 * workspace is a wiring problem, a missing phone is a payload-shape problem, and an outbound echo
 * is correct behaviour that should never be reported as a failure.
 */
export interface InboundOutcome {
  outcome: 'filed' | 'dropped';
  reason?: string;
}

async function handleInboundMessage(supabase: any, payload: any): Promise<InboundOutcome> {
  const msg = payload.message || {};
  if (msg.direction && msg.direction !== 'incoming') {
    return { outcome: 'dropped', reason: 'not an incoming message' };
  }

  // Zernio's inbox covers Instagram, Facebook, X, Bluesky, Reddit and Telegram DMs as well as
  // WhatsApp. Everything that was not WhatsApp used to hit `return` on the line below and be
  // discarded — silently, and indistinguishably from nobody having written to us. WhatsApp
  // keeps its own path because it is the only one keyed on a PHONE number, which is what makes
  // CRM contact matching (and STOP/START compliance) possible; a social DM has a handle and no
  // phone, so it cannot reuse any of that.
  if (msg.platform && msg.platform !== 'whatsapp') {
    await handleSocialDirectMessage(supabase, payload);
    return { outcome: 'filed', reason: 'routed to the social DM path' };
  }

  const accountId = accountIdOf(payload.account);
  const phone = contactPhoneOf(msg.sender);
  if (!phone) {
    console.warn('[zernio-webhook] inbound message without resolvable phone');
    return { outcome: 'dropped', reason: 'no resolvable phone on the sender' };
  }

  // STOP / START keyword compliance (independent of thread resolution).
  const text = String(msg.text || '').trim();
  const upper = text.toUpperCase();
  if (OPT_OUT_KEYWORDS.some((k) => upper === k || upper.startsWith(k + ' '))) {
    await supabase.from('messaging_optouts').upsert({
      phone_number: phone, channel_type: 'whatsapp',
      reason: `STOP keyword: ${text}`, source: 'keyword', opted_out_at: new Date().toISOString(),
    }, { onConflict: 'phone_number,channel_type' });
  } else if (OPT_IN_KEYWORDS.some((k) => upper === k || upper.startsWith(k + ' '))) {
    await supabase.from('messaging_optouts').delete().eq('phone_number', phone).eq('channel_type', 'whatsapp');
  }

  // Resolve owning workspace — required because inbox_threads.workspace_id is NOT NULL and the
  // directional wall is keyed on it. Without a binding we can't safely place the thread.
  const { workspaceId, channelId } = await resolveAccountWorkspace(supabase, accountId);
  if (!workspaceId) {
    console.warn(`[zernio-webhook] no workspace for Zernio account ${accountId} — inbound dropped`);
    return { outcome: 'dropped', reason: `no workspace bound to Zernio account ${accountId}` };
  }

  const owner = (await resolveCampaignOwner(supabase, phone)) || (await resolveWorkspaceOwner(supabase, workspaceId));
  const contactName = msg.sender?.name ?? null;
  const contactId = await matchOrCreateContact(supabase, workspaceId, phone, contactName, owner);

  // Find the existing whatsapp thread for this contact in this workspace.
  let threadId: string | null = null;
  if (contactId) {
    const { data: cp } = await supabase
      .from('inbox_participants').select('thread_id, inbox_threads!inner(channel, workspace_id)')
      .eq('contact_id', contactId).eq('status', 'active')
      .eq('inbox_threads.channel', 'whatsapp').eq('inbox_threads.workspace_id', workspaceId)
      .limit(1).maybeSingle();
    threadId = (cp as { thread_id?: string } | null)?.thread_id ?? null;
  }

  const meta = {
    zernio_account_id: accountId,
    zernio_conversation_id: msg.conversationId,
    channel_id: channelId,
    contact_phone: phone,
  };

  let customerParticipantId: string | null = null;

  if (!threadId) {
    // Auto-engage the AI assistant on new inbound WhatsApp threads unless the workspace opted out
    // (settings.inbox_agent.auto_respond === false). The internal_agent_reply call below only acts
    // when agent_state='active', so this is what makes the agent reply first to support questions.
    const { data: wsRow } = await supabase.from('workspaces').select('settings').eq('id', workspaceId).maybeSingle();
    const agentCfg = (((wsRow as { settings?: Record<string, unknown> } | null)?.settings || {}) as Record<string, unknown>)
      .inbox_agent as Record<string, unknown> | undefined;
    const autoRespond = agentCfg?.auto_respond !== false;

    // New thread + customer participant + owner member participant (assign-on-reply).
    const { data: thread, error: threadErr } = await supabase.from('inbox_threads').insert({
      workspace_id: workspaceId, thread_type: 'customer', channel: 'whatsapp',
      subject: contactName || phone, status: 'open', metadata: meta,
      agent_state: autoRespond ? 'active' : 'off', agent_id: autoRespond ? 'kai' : null,
      last_message_at: msg.sentAt || new Date().toISOString(),
    }).select('id').single();
    if (threadErr) {
      // Transient DB fault — throw so the webhook returns 5xx and Zernio retries
      // (rather than permanently dropping the inbound reply).
      throw new Error(`inbox_threads insert failed: ${threadErr.message}`);
    }
    threadId = thread?.id ?? null;
    if (!threadId) throw new Error('inbox_threads insert returned no id');

    if (autoRespond) {
      await supabase.from('inbox_participants').insert({
        thread_id: threadId, participant_type: 'agent', agent_id: 'kai', thread_role: 'agent',
      });
      await supabase.from('inbox_messages').insert({
        thread_id: threadId, message_type: 'system',
        body: 'The AI assistant is responding to new messages on this conversation.',
      });
    }

    const { data: cust, error: custErr } = await supabase.from('inbox_participants').insert({
      thread_id: threadId, participant_type: 'customer', contact_id: contactId, thread_role: 'participant',
    }).select('id').single();
    if (custErr) {
      throw new Error(`inbox_participants (customer) insert failed: ${custErr.message}`);
    }
    customerParticipantId = cust?.id ?? null;

    if (owner) {
      const { error: ownerErr } = await supabase.from('inbox_participants').insert({
        thread_id: threadId, participant_type: 'member', user_id: owner,
        workspace_id: workspaceId, thread_role: 'owner', added_by: owner,
      });
      if (ownerErr) {
        throw new Error(`inbox_participants (owner) insert failed: ${ownerErr.message}`);
      }
      await emitFlowEvent('inbox.thread_assigned', {
        user_id: owner, type: 'inbox_assigned',
        title: 'You were assigned a WhatsApp conversation',
        body: contactName || phone, action_url: `/inbox?thread=${threadId}`, thread_id: threadId,
      }).catch(() => {});
    }
  } else {
    // Existing thread: refresh channel binding + assign an owner if none yet.
    await supabase.from('inbox_threads').update({
      metadata: meta, status: 'open', last_message_at: msg.sentAt || new Date().toISOString(),
    }).eq('id', threadId);

    const { data: cp } = await supabase
      .from('inbox_participants').select('id').eq('thread_id', threadId).eq('contact_id', contactId).maybeSingle();
    customerParticipantId = (cp as { id?: string } | null)?.id ?? null;

    const { data: ownerP } = await supabase
      .from('inbox_participants').select('id').eq('thread_id', threadId)
      .eq('participant_type', 'member').eq('status', 'active').limit(1).maybeSingle();
    if (!ownerP && owner) {
      await supabase.from('inbox_participants').insert({
        thread_id: threadId, participant_type: 'member', user_id: owner,
        workspace_id: workspaceId, thread_role: 'owner', added_by: owner,
      });
    }
  }

  const preview = (msg.text || '[attachment]').substring(0, 200);
  const { error: msgErr } = await supabase.from('inbox_messages').insert({
    thread_id: threadId,
    sender_participant_id: customerParticipantId,
    body: msg.text ?? null,
    attachments: msg.attachments ?? [],
    message_type: 'text',
    metadata: { channel: 'whatsapp', wamid: msg.platformMessageId || msg.id || null, direction: 'incoming' },
  });
  if (msgErr) {
    // The reply body itself failed to persist — throw so Zernio retries.
    throw new Error(`inbox_messages insert failed: ${msgErr.message}`);
  }

  // Notify every member participant via the unified inbox event.
  const { data: members } = await supabase
    .from('inbox_participants').select('user_id')
    .eq('thread_id', threadId).eq('participant_type', 'member').eq('status', 'active').not('user_id', 'is', null);
  await emitInboxMessageEvent({
    userIds: ((members || []) as Array<{ user_id: string }>).map((m) => m.user_id),
    threadId,
    // Was omitted entirely, so a tenant-scoped flow could not match a WhatsApp message.
    workspaceId,
    title: `WhatsApp · ${contactName || phone}`,
    body: preview,
  });

  // Phase-2 agent takeover: if the thread is handed to the AI, let inbox-api generate + relay
  // the reply (it owns the Claude call + credit metering). Service-role, best-effort.
  await fetch(`${supabaseUrl}/functions/v1/inbox-api`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${supabaseServiceKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'internal_agent_reply', thread_id: threadId }),
  }).catch(() => {});

  // Reached only after the message is in a thread. Everything above returns 'dropped' with the
  // reason, so 'filed' means filed.
  return { outcome: 'filed' };
}


/**
 * Locate a stored inbox message by the provider id the webhook carries.
 *
 * Inbound rows store `metadata.wamid`. Zernio sends BOTH `platformMessageId` (the WhatsApp
 * wamid) and its own `id`, and which one create returned is not contractually pinned — the
 * same ambiguity handleDeliveryStatus documents — so try both rather than assume.
 */
async function findInboxMessageByProviderId(supabase: any, msg: any): Promise<{ id: string; metadata: any } | null> {
  const candidates = [msg?.platformMessageId, msg?.id]
    .filter((v: unknown): v is string => typeof v === 'string' && v.length > 0)
    .filter((v: string, i: number, a: string[]) => a.indexOf(v) === i);

  for (const wamid of candidates) {
    const { data } = await supabase
      .from('inbox_messages').select('id, metadata')
      .eq('metadata->>wamid', wamid).limit(1).maybeSingle();
    if (data) return data as { id: string; metadata: any };
  }
  return null;
}

/**
 * message.edited — WhatsApp lets a sender edit a delivered message for 15 minutes.
 * Without this the inbox keeps showing the ORIGINAL text, which is worse than showing
 * nothing: an operator reads and acts on wording the customer has already retracted.
 */
async function handleMessageEdited(supabase: any, payload: any): Promise<void> {
  const msg = payload.message || {};
  const row = await findInboxMessageByProviderId(supabase, msg);
  if (!row) return;                       // not a thread we track — nothing to correct

  const { error } = await supabase.from('inbox_messages').update({
    body: msg.text ?? null,
    edited_at: payload.editedAt || msg.editedAt || new Date().toISOString(),
    metadata: { ...(row.metadata ?? {}), edited: true },
  }).eq('id', row.id);
  if (error) console.error('[zernio-webhook] message.edited update FAILED', row.id, error);
}

/**
 * message.deleted — "delete for everyone". Soft-delete so the thread keeps its shape and the
 * audit trail survives; the UI decides how to render a tombstone.
 */
async function handleMessageDeleted(supabase: any, payload: any): Promise<void> {
  const msg = payload.message || {};
  const row = await findInboxMessageByProviderId(supabase, msg);
  if (!row) return;

  const { error } = await supabase.from('inbox_messages').update({
    deleted_at: payload.deletedAt || new Date().toISOString(),
    metadata: { ...(row.metadata ?? {}), deleted_by_sender: true },
  }).eq('id', row.id);
  if (error) console.error('[zernio-webhook] message.deleted update FAILED', row.id, error);
}

/**
 * reaction.received — an emoji on one of our messages. Kept on the message's metadata rather
 * than as a new row: a reaction is not a message, and inserting one would bump the thread's
 * unread count and re-notify every participant for a thumbs-up.
 */
async function handleReaction(supabase: any, payload: any): Promise<void> {
  const msg = payload.message || {};
  const emoji: string | null = payload.reaction?.emoji ?? payload.emoji ?? null;
  const row = await findInboxMessageByProviderId(supabase, msg);
  if (!row) return;

  const reactions = Array.isArray(row.metadata?.reactions) ? row.metadata.reactions : [];
  // WhatsApp sends an EMPTY emoji to mean "reaction removed".
  const next = emoji ? [...reactions.filter((r: string) => r !== emoji), emoji] : [];

  const { error } = await supabase.from('inbox_messages').update({
    metadata: { ...(row.metadata ?? {}), reactions: next },
  }).eq('id', row.id);
  if (error) console.error('[zernio-webhook] reaction update FAILED', row.id, error);
}

/**
 * message.sent — Meta accepted an outbound message.
 *
 * The send path already writes `status: 'sent'` optimistically from the API response, so this
 * only fills the gap where a message left through Zernio WITHOUT going through our send action
 * (an agent reply relayed by inbox-api, a Zernio-side automation). Never downgrades a row that
 * has already progressed to delivered/read — webhook order is not guaranteed, and a late
 * `sent` overwriting `read` would silently walk the status backwards.
 */
async function handleMessageSent(supabase: any, payload: any): Promise<void> {
  const msg = payload.message || {};
  const candidates = [msg.platformMessageId, msg.id]
    .filter((v: unknown): v is string => typeof v === 'string' && v.length > 0);
  if (!candidates.length) return;

  const { error } = await supabase
    .from('messaging_logs')
    .update({ status: 'sent', sent_at: payload.sentAt || msg.sentAt || new Date().toISOString() })
    .in('provider_message_id', candidates)
    .eq('status', 'queued');            // only ever forward, never back
  if (error) console.error('[zernio-webhook] message.sent update FAILED', error);
}


/**
 * Find the workspace that owns a Zernio account, for SOCIAL accounts.
 *
 * resolveAccountWorkspace() reads messaging_channels, which only ever holds WhatsApp numbers.
 * A social account lives in social_accounts, so a social event resolved to no workspace and
 * was dropped.
 */
async function resolveSocialWorkspace(
  supabase: any,
  zernioAccountId: string | undefined,
): Promise<{ workspaceId: string | null; socialAccountId: string | null; platform: string | null; connectedBy: string | null }> {
  if (!zernioAccountId) return { workspaceId: null, socialAccountId: null, platform: null, connectedBy: null };
  const { data } = await supabase
    .from('social_accounts').select('id, workspace_id, platform, user_id')
    .eq('zernio_account_id', zernioAccountId).maybeSingle();
  return {
    workspaceId: data?.workspace_id ?? null,
    socialAccountId: data?.id ?? null,
    platform: data?.platform ?? null,
    // Who authorised this account. They are the right owner for a thread on it — see
    // findOrCreateSocialThread.
    connectedBy: data?.user_id ?? null,
  };
}

/** Everyone who should be told about a thread, and the notification itself. */
async function notifyThreadMembers(
  supabase: any,
  threadId: string,
  workspaceId: string,
  title: string,
  body: string,
): Promise<void> {
  const { data: members } = await supabase
    .from('inbox_participants').select('user_id')
    .eq('thread_id', threadId).eq('participant_type', 'member')
    .eq('status', 'active').not('user_id', 'is', null);
  await emitInboxMessageEvent({
    userIds: ((members || []) as Array<{ user_id: string }>).map((m) => m.user_id),
    threadId,
    workspaceId,
    title,
    body,
  });
}

/**
 * Find-or-create a `social` thread and make sure the workspace owner is on it.
 *
 * `externalKey` is what identifies the conversation on the platform side — the DM participant
 * id, or the post id for a comment thread. It is matched against thread metadata rather than a
 * participant row because a social counterparty has NO CRM contact: they are a handle, with
 * neither phone nor email, and minting a crm_contacts row per commenter would fill the CRM
 * with people nobody can ever contact again.
 */
async function findOrCreateSocialThread(supabase: any, params: {
  workspaceId: string;
  externalKey: string;
  subject: string;
  metadata: Record<string, unknown>;
  at: string;
  /** A DM is a 1:1 service conversation like WhatsApp; a comment thread is not. */
  allowAgent: boolean;
  /**
   * Who connected the account this arrived on. Preferred over "first owner/admin we find",
   * which is what this used to do: on a workspace with four admins the thread landed on an
   * arbitrary one of them, and the person whose Instagram it actually is was not told at all.
   */
  preferredOwner?: string | null;
}): Promise<string> {
  const { data: existing } = await supabase
    .from('inbox_threads').select('id')
    .eq('workspace_id', params.workspaceId).eq('channel', 'social')
    .eq('metadata->>external_key', params.externalKey)
    .limit(1).maybeSingle();

  if (existing?.id) {
    const { error } = await supabase.from('inbox_threads').update({
      status: 'open',
      last_message_at: params.at,
      metadata: { ...params.metadata, external_key: params.externalKey },
    }).eq('id', existing.id);
    if (error) console.error('[zernio-webhook] social thread refresh FAILED', existing.id, error);
    return existing.id;
  }

  const { data: thread, error: threadErr } = await supabase.from('inbox_threads').insert({
    workspace_id: params.workspaceId,
    thread_type: 'customer',
    channel: 'social',
    subject: params.subject,
    status: 'open',
    // A DM is a 1:1 service conversation and follows the same workspace auto-respond setting
    // WhatsApp does. A COMMENT thread never auto-answers: the reply is posted publicly under
    // our own post, so an agent replying unprompted would be broadcasting to the account's
    // whole audience on its own initiative. That stays opt-in, per thread.
    agent_state: params.allowAgent ? 'active' : 'off',
    agent_id: params.allowAgent ? 'kai' : null,
    metadata: { ...params.metadata, external_key: params.externalKey },
    last_message_at: params.at,
  }).select('id').single();
  if (threadErr) throw new Error(`social inbox_threads insert failed: ${threadErr.message}`);
  const threadId = thread?.id as string | undefined;
  if (!threadId) throw new Error('social inbox_threads insert returned no id');

  if (params.allowAgent) {
    const { error: aErr } = await supabase.from('inbox_participants').insert({
      thread_id: threadId, participant_type: 'agent', agent_id: 'kai', thread_role: 'agent',
    });
    if (aErr) console.error('[zernio-webhook] social agent participant insert FAILED', threadId, aErr);
  }

  const owner = params.preferredOwner || (await resolveWorkspaceOwner(supabase, params.workspaceId));
  if (owner) {
    const { error: pErr } = await supabase.from('inbox_participants').insert({
      thread_id: threadId, participant_type: 'member', user_id: owner,
      workspace_id: params.workspaceId, thread_role: 'owner', added_by: owner,
    });
    if (pErr) throw new Error(`social inbox_participants insert failed: ${pErr.message}`);
  }
  return threadId;
}

/** An inbound DM on a non-WhatsApp platform (Instagram, Facebook, X, Bluesky, Reddit, Telegram). */
async function handleSocialDirectMessage(supabase: any, payload: any): Promise<void> {
  const msg = payload.message || {};
  const accountId = accountIdOf(payload.account);
  const { workspaceId, socialAccountId, platform, connectedBy } = await resolveSocialWorkspace(supabase, accountId);
  if (!workspaceId) {
    console.warn(`[zernio-webhook] no workspace for social account ${accountId} — DM dropped`);
    return;
  }

  const participantId = String(msg.sender?.id ?? msg.participantId ?? '');
  const handle = msg.sender?.username ?? msg.sender?.name ?? participantId;
  if (!participantId) {
    console.warn('[zernio-webhook] social DM without a resolvable sender — dropped');
    return;
  }

  const at = msg.sentAt || new Date().toISOString();
  const plat = msg.platform ?? platform ?? 'social';

  const { data: wsRow } = await supabase.from('workspaces').select('settings').eq('id', workspaceId).maybeSingle();
  const agentCfg = (((wsRow as { settings?: Record<string, unknown> } | null)?.settings || {}) as Record<string, unknown>)
    .inbox_agent as Record<string, unknown> | undefined;
  const autoRespond = agentCfg?.auto_respond !== false;

  const threadId = await findOrCreateSocialThread(supabase, {
    allowAgent: autoRespond,
    workspaceId,
    preferredOwner: connectedBy,
    externalKey: `dm:${plat}:${participantId}`,
    subject: `${plat} · ${handle}`,
    metadata: {
      social_kind: 'dm',
      platform: plat,
      zernio_account_id: accountId,
      zernio_conversation_id: msg.conversationId ?? null,
      social_account_id: socialAccountId,
      participant_id: participantId,
      participant_handle: handle,
    },
    at,
  });

  const { error: msgErr } = await supabase.from('inbox_messages').insert({
    thread_id: threadId,
    sender_participant_id: null,          // external author, no participant row
    body: msg.text ?? null,
    attachments: msg.attachments ?? [],
    message_type: 'text',
    metadata: {
      channel: 'social', direction: 'incoming', platform: plat,
      wamid: msg.platformMessageId || msg.id || null,
      author_handle: handle, author_id: participantId,
    },
  });
  if (msgErr) throw new Error(`social DM inbox_messages insert failed: ${msgErr.message}`);

  await notifyThreadMembers(
    supabase, threadId, workspaceId,
    `${plat} · ${handle}`,
    (msg.text || '[attachment]').substring(0, 200),
  );

  // Same handover the WhatsApp path uses — inbox-api owns the Claude call, the credit debit and
  // the relay back out. Without this a social DM thread could be marked agent-active and simply
  // never answer, which looks identical to the agent choosing not to.
  await fetch(`${supabaseUrl}/functions/v1/inbox-api`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${supabaseServiceKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'internal_agent_reply', thread_id: threadId }),
  }).catch(() => {});
}

/**
 * A comment on one of our posts.
 *
 * The thread is keyed on the POST, not the commenter: an operator triaging replies thinks in
 * terms of "the comments under this post", and one thread per commenter would turn a post with
 * fifty comments into fifty threads. Each comment carries its own author and comment id on the
 * message, which is what the reply relay in inbox-api targets.
 */
async function handleSocialComment(supabase: any, payload: any): Promise<void> {
  const comment = payload.comment || payload.message || {};
  const accountId = accountIdOf(payload.account);
  const { workspaceId, socialAccountId, platform, connectedBy } = await resolveSocialWorkspace(supabase, accountId);
  if (!workspaceId) {
    console.warn(`[zernio-webhook] no workspace for social account ${accountId} — comment dropped`);
    return;
  }

  const postId = String(payload.post?.id ?? comment.postId ?? '');
  const commentId = String(comment.id ?? '');
  if (!postId || !commentId) {
    console.warn('[zernio-webhook] comment without a post/comment id — dropped');
    return;
  }

  // Our own reply, echoed back. Storing it would double every reply in the transcript.
  const authorId = String(comment.from?.id ?? comment.author?.id ?? '');
  if (authorId && accountId && authorId === accountId) return;

  const handle = comment.from?.name ?? comment.from?.username ?? comment.author?.username ?? 'Someone';
  const at = comment.createdTime || new Date().toISOString();
  const plat = comment.platform ?? platform ?? 'social';

  const threadId = await findOrCreateSocialThread(supabase, {
    allowAgent: false,          // never auto-answer in public
    workspaceId,
    preferredOwner: connectedBy,
    externalKey: `comments:${plat}:${postId}`,
    subject: `${plat} comments · ${String(payload.post?.content ?? postId).substring(0, 60)}`,
    metadata: {
      social_kind: 'comments',
      platform: plat,
      zernio_account_id: accountId,
      zernio_post_id: postId,
      social_account_id: socialAccountId,
      post_permalink: payload.post?.permalink ?? null,
    },
    at,
  });

  // A platform can redeliver a comment; the transcript must not gain a duplicate each time.
  const { data: dupe } = await supabase
    .from('inbox_messages').select('id')
    .eq('thread_id', threadId).eq('metadata->>comment_id', commentId)
    .limit(1).maybeSingle();
  if (dupe) return;

  const { error: msgErr } = await supabase.from('inbox_messages').insert({
    thread_id: threadId,
    sender_participant_id: null,
    body: comment.message ?? comment.text ?? null,
    attachments: [],
    message_type: 'text',
    metadata: {
      channel: 'social', direction: 'incoming', platform: plat,
      social_kind: 'comment', comment_id: commentId,
      parent_comment_id: comment.parentId ?? null,
      author_handle: handle, author_id: authorId || null,
      permalink: comment.url ?? null,
    },
  });
  if (msgErr) throw new Error(`social comment inbox_messages insert failed: ${msgErr.message}`);

  await notifyThreadMembers(
    supabase, threadId, workspaceId,
    `${plat} comment · ${handle}`,
    (comment.message || comment.text || '[comment]').substring(0, 200),
  );

  // Distinct from inbox.message_received on purpose: a reply to THIS is published to the
  // account's whole audience, so a flow that auto-answers a DM must not silently also
  // auto-answer in public. Owners/admins, because a comment is not assigned to anyone.
  await emitFlowEventToWorkspaceRoles(workspaceId, ['owner', 'admin'], 'social_comment_received', (uid: string) => ({
    user_id: uid,
    type: 'social_comment_received',
    title: `New ${plat} comment from ${handle}`,
    body: (comment.message || comment.text || '[comment]').substring(0, 200),
    action_url: `/inbox?thread=${threadId}`,
    workspace_id: workspaceId,
    thread_id: threadId,
    platform: plat,
    post_id: postId,
    comment_id: commentId,
    author_handle: handle,
    permalink: comment.url ?? payload.post?.permalink ?? null,
    is_public: true,
  })).catch(() => {});
}

/** Best-effort: find which user a contact's most recent outbound campaign belonged to. */
async function resolveCampaignOwner(supabase: any, phone: string): Promise<string | null> {
  const { data: log } = await supabase
    .from('messaging_logs')
    .select('campaign_id, created_by')
    .eq('to_number', phone).not('campaign_id', 'is', null)
    .order('created_at', { ascending: false }).limit(1).maybeSingle();
  if (log?.created_by) return log.created_by;
  if (log?.campaign_id) {
    const { data: c } = await supabase.from('campaigns').select('created_by').eq('id', log.campaign_id).maybeSingle();
    return c?.created_by ?? null;
  }
  return null;
}

/** Delivery-status events for outbound messages (delivered / read / failed). */
async function handleDeliveryStatus(supabase: any, event: string, payload: any): Promise<void> {
  const msg = payload.message || {};

  // Match on EITHER id, because we cannot prove which one we stored.
  //
  // Outbound writes `provider_message_id = data.messageId` from Zernio's conversation-create; the
  // receipt webhook carries BOTH `platformMessageId` (the WhatsApp wamid) and `id` (Zernio's own).
  // This used to pick `platformMessageId || msg.id` — so if create returns Zernio's internal id
  // while the webhook carries a wamid, the lookup silently matched nothing and every outbound
  // message stayed `sent` forever: no delivery, no read, and a message Meta reported as FAILED
  // still displayed as sent.
  //
  // #286 left this open pending Zernio's response contract. Trying both ids closes it without one:
  // they are distinct opaque strings from the same vendor, so a row matching either is the row,
  // and if the contract is ever confirmed this simply stops needing the second candidate. Ordered
  // platform-id first so the common case is one query.
  const wamidCandidates = [msg.platformMessageId, msg.id]
    .filter((v: unknown): v is string => typeof v === 'string' && v.length > 0)
    .filter((v: string, i: number, a: string[]) => a.indexOf(v) === i);
  const wamid = wamidCandidates[0];
  if (!wamid) return;

  const status = event === 'message.delivered' ? 'delivered' : event === 'message.read' ? 'read' : 'failed';
  const at = payload.statusAt || new Date().toISOString();

  const update: Record<string, unknown> = { status };
  if (status === 'delivered') update.delivered_at = at;
  else if (status === 'read') update.read_at = at;
  else if (status === 'failed') {
    update.failed_at = at;
    if (payload.error?.code != null) update.error_code = String(payload.error.code);
    if (payload.error?.message) update.error_message = payload.error.message;
  }

  // Outbound campaign / transactional log.
  const { data: logs } = await supabase
    .from('messaging_logs').select('id, campaign_id')
    .in('provider_message_id', wamidCandidates).limit(1);
  const log = logs?.[0];
  if (log?.id) {
    await supabase.from('messaging_logs').update(update).eq('id', log.id);
    if (log.campaign_id) {
      const rUpdate: Record<string, unknown> = {
        status: status === 'delivered' ? 'delivered' : status === 'failed' ? 'failed' : 'sent',
      };
      if (status === 'delivered') rUpdate.delivered_at = at;
      else if (status === 'read') rUpdate.read_at = at;
      else if (status === 'failed') { rUpdate.failed_at = at; rUpdate.error_message = payload.error?.message; }
      await supabase.from('messaging_campaign_recipients').update(rUpdate).eq('message_log_id', log.id);
    }
  }

  // Outbound inbox messages relayed over WhatsApp carry the wamid in metadata.
  // Goes through an RPC because PostgREST `.update` is a WHOLE-COLUMN ASSIGNMENT, not a merge.
  // The previous `.update({ metadata: { delivery_status: status } })` wrote that object OVER the
  // entire column, deleting `wamid`, `channel` and `relay` — so the first receipt (normally
  // `delivered`) recorded itself AND made the row permanently unmatchable. Every later `read` or
  // `failed` receipt matched zero rows forever: read receipts never worked, and a message Meta
  // later reported as FAILED stayed displayed as delivered.
  // Same either-id treatment: try each candidate until one matches a row.
  let receiptRows: unknown = null;
  let receiptErr: { message: string } | null = null;
  for (const candidate of wamidCandidates) {
    const r = await supabase.rpc('apply_inbox_delivery_receipt', {
      p_wamid: candidate,
      p_status: status,
      p_at: at,
    });
    receiptErr = r.error;
    receiptRows = r.data;
    if (r.error || r.data) break;
  }
  // The old code discarded the result, so a 0-row match looked exactly like success.
  if (receiptErr) {
    console.error('[zernio-webhook] delivery receipt failed:', receiptErr.message, 'wamid:', wamid);
  } else if (!receiptRows) {
    console.warn('[zernio-webhook] delivery receipt matched no inbox message. tried:', wamidCandidates.join(','), 'status:', status);
  }
}

Deno.serve(withApiLogging('zernio-webhook-handler', async (req) => {
  await bootstrapForFunction();
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);

  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  // MUST precede verifySignature — the secret may live only in platform_secrets, and
  // bootstrapForFunction() cannot surface it on the edge runtime.
  await ensureZernioSecrets(supabase);

  // Read raw body BEFORE parsing (required for HMAC verification)
  const rawBody = await req.arrayBuffer();

  const signature = req.headers.get('X-Zernio-Signature') || req.headers.get('x-zernio-signature') || '';
  const isValid = await verifySignature(rawBody, signature);

  if (!isValid) {
    console.warn('[zernio-webhook] Invalid signature — rejecting');
    return jsonResponse({ error: 'Invalid signature' }, 401);
  }

  let payload: { event: string; post?: any; account?: any };
  try {
    const text = new TextDecoder().decode(rawBody);
    payload = JSON.parse(text);
  } catch {
    return jsonResponse({ error: 'Invalid JSON body' }, 400);
  }

  const { event, post, account } = payload as any;

  console.log(`[zernio-webhook] Event: ${event}`, JSON.stringify(payload).substring(0, 200));

  try {
    // ── WhatsApp messaging events (Zernio inbox) ────────────────────
    if (event === 'message.received') {
      // The outcome rides back in the response. Still a 200 either way — Zernio must not retry a
      // message we have deliberately declined — but a caller replaying history can now tell an
      // import from a discard, which is the difference between a full inbox and an empty one.
      const result = await handleInboundMessage(supabase, payload);
      return jsonResponse({ received: true, event, ...result });
    }
    if (event === 'message.delivered' || event === 'message.read' || event === 'message.failed') {
      await handleDeliveryStatus(supabase, event, payload);
      return jsonResponse({ received: true, event });
    }
    if (event === 'message.sent') {
      await handleMessageSent(supabase, payload);
      return jsonResponse({ received: true, event });
    }
    if (event === 'message.edited') {
      await handleMessageEdited(supabase, payload);
      return jsonResponse({ received: true, event });
    }
    if (event === 'message.deleted') {
      await handleMessageDeleted(supabase, payload);
      return jsonResponse({ received: true, event });
    }
    if (event === 'reaction.received') {
      await handleReaction(supabase, payload);
      return jsonResponse({ received: true, event });
    }
    if (event === 'comment.received') {
      await handleSocialComment(supabase, payload);
      return jsonResponse({ received: true, event });
    }
    if (event === 'conversation.started') {
      // The thread is created by message.received, which always accompanies or follows this.
      // Acknowledged explicitly so it does not read as an unhandled event in the logs.
      return jsonResponse({ received: true, event, note: 'thread is created on message.received' });
    }

    const zernioPostId: string | undefined = post?.id;

    // ── post.published ──────────────────────────────────────────────
    if (event === 'post.published' || event === 'post.partial') {
      if (zernioPostId) {
        const update: Record<string, unknown> = {
          status: 'published',
          published_at: (post?.publishedAt as string) || new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        if (event === 'post.partial') {
          update.metadata = { partial: true, error: firstPlatformError(post) || 'Some platforms failed' };
        }
        const { data: sp } = await supabase.from('social_posts').update(update)
          .eq('zernio_post_id', zernioPostId)
          .select('id, workspace_id, user_id, platform, caption').maybeSingle();
        if (sp) {
          try {
            await emitFlowEvent('social_post_published', {
              type: 'social_post_published', workspace_id: (sp as any).workspace_id,
              user_id: (sp as any).user_id, social_post_id: (sp as any).id, platform: (sp as any).platform,
              partial: event === 'post.partial',
              title: `Post published${(sp as any).platform ? ` on ${(sp as any).platform}` : ''}`,
              body: `${(sp as any).caption ? `"${String((sp as any).caption).slice(0, 80)}"` : 'Your scheduled post'} is now live.`,
              action_url: '/social-media/accounts',
            });
          } catch { /* best-effort */ }
        }
      }
    }

    // ── post.failed ─────────────────────────────────────────────────
    else if (event === 'post.failed') {
      if (zernioPostId) {
        const reason = firstPlatformError(post) || 'Publish failed on all platforms';
        const { data: sp } = await supabase
          .from('social_posts')
          .update({
            status: 'failed',
            metadata: { error: reason },
            updated_at: new Date().toISOString(),
          })
          .eq('zernio_post_id', zernioPostId)
          .select('id, workspace_id, user_id, platform, caption').maybeSingle();
        if (sp) {
          try {
            await emitFlowEvent('social_post_failed', {
              type: 'social_post_failed', workspace_id: (sp as any).workspace_id,
              user_id: (sp as any).user_id, social_post_id: (sp as any).id, platform: (sp as any).platform,
              reason,
              title: `Post failed${(sp as any).platform ? ` on ${(sp as any).platform}` : ''}`,
              body: `A scheduled post failed to publish: ${reason}`,
              action_url: '/social-media/accounts',
            });
          } catch { /* best-effort */ }
        }
      }
    }

    // ── post.cancelled ──────────────────────────────────────────────
    else if (event === 'post.cancelled') {
      if (zernioPostId) {
        await supabase
          .from('social_posts')
          .update({ status: 'cancelled', updated_at: new Date().toISOString() })
          .eq('zernio_post_id', zernioPostId);
      }
    }

    // ── post.scheduled ──────────────────────────────────────────────
    else if (event === 'post.scheduled') {
      if (zernioPostId) {
        await supabase
          .from('social_posts')
          .update({
            status: 'scheduled',
            scheduled_at: post?.scheduledFor as string,
            updated_at: new Date().toISOString(),
          })
          .eq('zernio_post_id', zernioPostId);
      }
    }

    // ── account.connected ───────────────────────────────────────────
    // Zernio announces a finished connection here, whoever started it — including one made
    // straight in the Zernio dashboard, which the OAuth callback never sees. Without this the
    // only way such an account reached us was an operator remembering to press "Sync from
    // Zernio", so a number could be live at Meta and invisible here indefinitely.
    else if (event === 'account.connected') {
      const zernioAccountId = accountIdOf(account);
      const platform: string | undefined = account?.platform;
      const profileId: string | undefined = account?.profileId;

      // Bind to the workspace that owns the Zernio profile. Without one we cannot place the
      // row safely (a NULL workspace_id channel is visible to every tenant), so skip rather
      // than write it unbound.
      let workspaceId: string | null = null;
      if (profileId) {
        const { data: prof } = await supabase
          .from('social_zernio_profiles').select('workspace_id')
          .eq('zernio_profile_id', profileId).maybeSingle();
        workspaceId = prof?.workspace_id ?? null;
      }

      // Did this delivery actually CHANGE anything? Zernio re-sends account.connected for an
      // account that has been connected all along (observed 4× for one LinkedIn account on
      // 2026-08-23, one of them with no user activity anywhere near it), and the handler used
      // to notify on every delivery — so "linkedin connected" arrived again and again for a
      // connection made once. Only a real transition is news: an account we have never seen,
      // or one that was sitting inactive after a disconnect. A repeat delivery still refreshes
      // the row; it just does not announce itself.
      let isNewConnection = false;

      if (!zernioAccountId || !workspaceId) {
        console.warn(`[zernio-webhook] account.connected without a resolvable workspace (account=${zernioAccountId}, profile=${profileId}) — ignored`);
      } else if (platform === 'whatsapp') {
        const senderId = account?.selectedPhoneNumber || account?.username || account?.platformIdentifier;
        const { data: existing } = await supabase
          .from('messaging_channels').select('id, is_active')
          .eq('zernio_account_id', zernioAccountId).maybeSingle();
        if (existing) {
          // Reconnecting a number that was switched off IS worth a notification — publishing
          // and replies were dead until this moment.
          isNewConnection = existing.is_active === false;
          const { error: updErr } = await supabase.from('messaging_channels')
            .update({ is_active: true, sender_id: senderId, updated_at: new Date().toISOString() })
            .eq('id', existing.id);
          if (updErr) {
            console.error('[zernio-webhook] account.connected channel refresh FAILED', zernioAccountId, updErr);
            isNewConnection = false;
          }
        } else if (senderId) {
          const { count } = await supabase
            .from('messaging_channels').select('*', { count: 'exact', head: true })
            .eq('channel_type', 'whatsapp');
          const { error: insErr } = await supabase.from('messaging_channels').insert({
            workspace_id: workspaceId,
            channel_type: 'whatsapp',
            provider: 'zernio',
            sender_id: senderId,
            zernio_account_id: zernioAccountId,
            display_name: account?.displayName || senderId,
            is_active: true,
            is_default: (count || 0) === 0,
            daily_quota: 10000,
            max_send_rate: 100,
            config: {
              zernio_account_id: zernioAccountId,
              display_phone_number: senderId,
              profile_id: profileId ?? null,
            },
          });
          // The row is the ONLY trace that this number connected, and supabase-js resolves on
          // an RLS denial rather than throwing — so a failed insert must not notify either,
          // or we announce a connection nothing recorded.
          if (insErr) console.error('[zernio-webhook] account.connected channel insert FAILED', senderId, insErr);
          else isNewConnection = true;
        }
      } else {
        // Read before the upsert: afterwards every row looks identical whether it was created
        // now or months ago. Matched on the account id within the workspace rather than the
        // full unique key, because `platform` can be absent from the payload.
        const { data: existingSocial } = await supabase
          .from('social_accounts').select('id, is_active')
          .eq('workspace_id', workspaceId)
          .eq('zernio_account_id', zernioAccountId)
          .limit(1);
        const priorSocial = existingSocial?.[0];
        isNewConnection = !priorSocial || priorSocial.is_active === false;

        const { error: upErr } = await supabase.from('social_accounts').upsert({
          workspace_id: workspaceId,
          platform,
          zernio_account_id: zernioAccountId,
          handle: account?.username,
          display_name: account?.displayName,
          avatar_url: account?.profilePicture ?? null,
          followers_count: account?.followersCount ?? 0,
          is_active: true,
          last_synced_at: new Date().toISOString(),
        }, { onConflict: 'workspace_id,platform,zernio_account_id' });
        if (upErr) {
          console.error('[zernio-webhook] account.connected social upsert FAILED', zernioAccountId, upErr);
          isNewConnection = false;
        }
      }

      if (workspaceId && zernioAccountId && isNewConnection) {
        await emitFlowEventToWorkspaceRoles(workspaceId, ['owner', 'admin'], 'social_account_connected', (uid: string) => ({
          user_id: uid,
          type: 'social_account_connected',
          title: `${platformLabel(platform)} connected`,
          body: account?.username ?? account?.displayName ?? zernioAccountId,
          action_url: platform === 'whatsapp' ? '/messaging' : '/profile?tab=social-accounts',
          workspace_id: workspaceId,
          platform: platform ?? null,
          zernio_account_id: zernioAccountId,
          handle: account?.username ?? null,
        })).catch(() => {});
      }
    }

    // ── account.disconnected ────────────────────────────────────────
    else if (event === 'account.disconnected') {
      const zernioAccountId = accountIdOf(account) || account?.accountId;
      if (zernioAccountId) {
        // Read BEFORE the update, for the same reason account.connected does: afterwards the
        // row is is_active=false whether this delivery switched it off or a delivery an hour
        // ago did. Only the transition is news.
        const { data: owned } = await supabase
          .from('social_accounts').select('workspace_id, platform, handle, is_active')
          .eq('zernio_account_id', zernioAccountId).maybeSingle();
        const wasActive = (owned as { is_active?: boolean } | null)?.is_active === true;

        const { error: saErr } = await supabase
          .from('social_accounts')
          .update({ is_active: false })
          .eq('zernio_account_id', zernioAccountId);
        if (saErr) console.error('[zernio-webhook] account.disconnected social update FAILED', zernioAccountId, saErr);
        // A disconnected WhatsApp number cannot send. Leaving the channel active meant every
        // subsequent send failed at Meta with nothing on the channel card explaining why.
        const { error: mcErr } = await supabase
          .from('messaging_channels')
          .update({ is_active: false, updated_at: new Date().toISOString() })
          .eq('zernio_account_id', zernioAccountId);
        if (mcErr) console.error('[zernio-webhook] account.disconnected channel update FAILED', zernioAccountId, mcErr);

        // Publishing and replies stop dead until someone reconnects. Nothing else tells them.
        const wsId = (owned as { workspace_id?: string } | null)?.workspace_id;
        if (wsId && wasActive) {
          await emitFlowEventToWorkspaceRoles(wsId, ['owner', 'admin'], 'social_account_disconnected', (uid: string) => ({
            user_id: uid,
            type: 'social_account_disconnected',
            title: `${platformLabel((owned as { platform?: string })?.platform)} disconnected`,
            body: 'Publishing and replies stop until it is reconnected.',
            action_url: (owned as { platform?: string })?.platform === 'whatsapp' ? '/messaging' : '/profile?tab=social-accounts',
            workspace_id: wsId,
            platform: (owned as { platform?: string })?.platform ?? null,
            zernio_account_id: zernioAccountId,
            handle: (owned as { handle?: string })?.handle ?? null,
          })).catch(() => {});
        }
      }
    }

    // ── whatsapp.number.* — operational health of the sender number ─
    // Meta can decline, suspend or release a number without anything in this app changing.
    // Each of these stops sending outright, so the channel must not stay green.
    else if (typeof event === 'string' && event.startsWith('whatsapp.number.')) {
      const zernioAccountId = accountIdOf(account);
      const HEALTHY = new Set(['whatsapp.number.activated', 'whatsapp.number.reactivated']);
      const isHealthy = HEALTHY.has(event);
      if (zernioAccountId) {
        const { error: numErr } = await supabase
          .from('messaging_channels')
          .update({ is_active: isHealthy, updated_at: new Date().toISOString() })
          .eq('zernio_account_id', zernioAccountId);
        if (numErr) console.error(`[zernio-webhook] ${event} channel update FAILED`, zernioAccountId, numErr);
      }
      if (!isHealthy) {
        console.warn(`[zernio-webhook] ${event} for account ${zernioAccountId} — channel deactivated`);
      }

      // The single highest-value alert on this whole surface: a declined or suspended number
      // stops EVERY outbound message, and Meta tells Zernio, not us. Without this the first
      // sign is a customer saying they never heard back.
      if (zernioAccountId) {
        const { data: chan } = await supabase
          .from('messaging_channels').select('workspace_id, sender_id')
          .eq('zernio_account_id', zernioAccountId).maybeSingle();
        const wsId = (chan as { workspace_id?: string } | null)?.workspace_id;
        if (wsId) {
          const state = String(event).replace('whatsapp.number.', '');
          await emitFlowEventToWorkspaceRoles(wsId, ['owner', 'admin'], 'whatsapp_number_status_changed', (uid: string) => ({
            user_id: uid,
            type: 'whatsapp_number_status_changed',
            title: isHealthy
              ? `WhatsApp number ${state}`
              : `WhatsApp number ${state} — sending has stopped`,
            body: (chan as { sender_id?: string })?.sender_id ?? zernioAccountId,
            action_url: '/messaging',
            workspace_id: wsId,
            zernio_account_id: zernioAccountId,
            sender_id: (chan as { sender_id?: string })?.sender_id ?? null,
            status: state,
            is_healthy: isHealthy,
          })).catch(() => {});
        }
      }
    }

    // ── whatsapp.template.* ─────────────────────────────────────────
    // Meta approves, rejects, or silently RE-CATEGORISES a template (which re-prices every
    // message sent on it). Mirror the verdict so a rejected template stops being offered.
    else if (event === 'whatsapp.template.status_updated' || event === 'whatsapp.template.category_updated') {
      const tpl = (payload as any).template ?? {};
      const name: string | undefined = tpl.name;
      const status: string | undefined = tpl.status;
      if (name) {
        const approved = String(status || '').toUpperCase() === 'APPROVED';
        const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
        if (status) {
          patch.is_approved = approved;
          patch.approval_status = approved ? 'approved' : 'rejected';
          patch.is_active = approved;
        }
        const { error: tplErr } = await supabase
          .from('messaging_templates')
          .update(patch)
          .eq('whatsapp_template_name', name);
        if (tplErr) console.error(`[zernio-webhook] ${event} template update FAILED`, name, tplErr);

        // A rejection blocks every cold send that used it; a RE-CATEGORISATION changes nothing
        // visible and re-prices every message on it. Both need a human told.
        const { data: tplRow } = await supabase
          .from('messaging_templates').select('id, name, channel_type')
          .eq('whatsapp_template_name', name).maybeSingle();
        // Attribute via the ACCOUNT the event names. messaging_templates is platform-global
        // (no workspace_id), so picking "the first workspace with a WhatsApp channel" would
        // tell one tenant about another tenant's template — a tenancy leak dressed as a
        // notification. If the account cannot be resolved, notify nobody rather than guess.
        const tplAccountId = accountIdOf(account) || (payload as any).accountId;
        const { data: ownChan } = tplAccountId
          ? await supabase.from('messaging_channels').select('workspace_id')
              .eq('zernio_account_id', tplAccountId).maybeSingle()
          : { data: null };
        const wsId = (ownChan as { workspace_id?: string } | null)?.workspace_id;
        if (!wsId) {
          console.warn(`[zernio-webhook] ${event} for "${name}" — no resolvable workspace, not notifying`);
        }
        if (wsId) {
          await emitFlowEventToWorkspaceRoles(wsId, ['owner', 'admin'], 'whatsapp_template_status_changed', (uid: string) => ({
            user_id: uid,
            type: 'whatsapp_template_status_changed',
            title: event === 'whatsapp.template.category_updated'
              ? `Meta re-categorised the template "${name}"`
              : `Template "${name}" is now ${String(status ?? 'updated').toLowerCase()}`,
            body: event === 'whatsapp.template.category_updated'
              ? 'Its category changed, which changes what every message sent on it costs.'
              : `Meta ${String(status ?? '').toUpperCase() === 'APPROVED' ? 'approved' : 'rejected'} this template.`,
            action_url: '/messaging',
            workspace_id: wsId,
            template_name: name,
            template_id: (tplRow as { id?: string } | null)?.id ?? null,
            status: status ?? null,
            category: tpl.category ?? null,
          })).catch(() => {});
        }
      }
    }

    else {
      console.log(`[zernio-webhook] Unhandled event: ${event}`);
    }

  } catch (err) {
    console.error(`[zernio-webhook] Error handling ${event}:`, err);
    // Inbound WhatsApp replies must NOT be silently dropped on a transient DB fault.
    // Return 5xx so Zernio retries the delivery; the upsert/find-or-create logic above
    // is idempotent enough for a retry to converge. Status-sync events (post.*, account.*,
    // delivery status) stay 200 to avoid pointless retry loops on best-effort updates.
    // Anything carrying customer CONTENT is retried; a lost one is unrecoverable because
    // Zernio does not resend on a 200. Status/lifecycle syncs stay 200 — they are best-effort
    // and reconverge on the next event or sync, so retrying them just loops.
    if (event === 'message.received' || event === 'message.edited'
        || event === 'message.deleted' || event === 'comment.received') {
      return jsonResponse({ error: `Transient failure handling ${event}`, event }, 500);
    }
  }

  return jsonResponse({ received: true, event });
}));
