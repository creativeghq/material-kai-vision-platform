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
 * messaging (the former Twilio messaging-webhook was removed). Register one
 * webhook in Zernio subscribed to post.* + account.* + message.* events.
 */

import { createClient } from '@supabase/supabase-js';
import { corsHeaders } from '../_shared/cors.ts';
import { bootstrapForFunction } from '../_shared/secrets-bootstrap.ts';
import { emitFlowEvent, emitFlowEventToWorkspaceRoles } from '../_shared/flow-events.ts';
import { withApiLogging } from '../_shared/api-logger.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const webhookSecret = () => Deno.env.get('ZERNIO_WEBHOOK_SECRET') || Deno.env.get('LATE_WEBHOOK_SECRET') || '';

const OPT_OUT_KEYWORDS = ['STOP', 'UNSUBSCRIBE', 'CANCEL', 'END', 'QUIT', 'STOPALL', 'STOP ALL'];
const OPT_IN_KEYWORDS = ['START', 'YES', 'UNSTOP', 'SUBSCRIBE'];

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

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

/** WhatsApp contact phone in E.164 (with +). sender.phoneNumber wins; sender.id is digits-only. */
function contactPhoneOf(sender: any): string | undefined {
  if (sender?.phoneNumber) return sender.phoneNumber;
  if (sender?.id && /^\d{6,}$/.test(String(sender.id))) return '+' + sender.id;
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
    .from('messaging_channels').select('id, config').eq('zernio_account_id', accountId).maybeSingle();
  const profileId = (channel?.config as { profile_id?: string } | null)?.profile_id ?? null;
  let workspaceId: string | null = null;
  if (profileId) {
    const { data: prof } = await supabase
      .from('social_zernio_profiles').select('workspace_id').eq('zernio_profile_id', profileId).maybeSingle();
    workspaceId = prof?.workspace_id ?? null;
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
async function handleInboundMessage(supabase: any, payload: any): Promise<void> {
  const msg = payload.message || {};
  if (msg.platform && msg.platform !== 'whatsapp') return;       // WhatsApp only
  if (msg.direction && msg.direction !== 'incoming') return;

  const accountId = accountIdOf(payload.account);
  const phone = contactPhoneOf(msg.sender);
  if (!phone) { console.warn('[zernio-webhook] inbound message without resolvable phone'); return; }

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
    return;
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
  for (const m of (members || []) as Array<{ user_id: string }>) {
    await emitFlowEvent('inbox.message_received', {
      user_id: m.user_id, type: 'inbox_message',
      title: `WhatsApp · ${contactName || phone}`,
      body: preview, action_url: `/inbox?thread=${threadId}`, thread_id: threadId,
    }).catch(() => {});
  }

  // Phase-2 agent takeover: if the thread is handed to the AI, let inbox-api generate + relay
  // the reply (it owns the Claude call + credit metering). Service-role, best-effort.
  await fetch(`${supabaseUrl}/functions/v1/inbox-api`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${supabaseServiceKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'internal_agent_reply', thread_id: threadId }),
  }).catch(() => {});
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
  const wamid = msg.platformMessageId || msg.id;
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
  const { data: log } = await supabase
    .from('messaging_logs').select('id, campaign_id')
    .eq('provider_message_id', wamid).maybeSingle();
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
  const { data: receiptRows, error: receiptErr } = await supabase.rpc('apply_inbox_delivery_receipt', {
    p_wamid: wamid,
    p_status: status,
    p_at: at,
  });
  // The old code discarded the result, so a 0-row match looked exactly like success.
  if (receiptErr) {
    console.error('[zernio-webhook] delivery receipt failed:', receiptErr.message, 'wamid:', wamid);
  } else if (!receiptRows) {
    console.warn('[zernio-webhook] delivery receipt matched no inbox message. wamid:', wamid, 'status:', status);
  }
}

Deno.serve(withApiLogging('zernio-webhook-handler', async (req) => {
  await bootstrapForFunction();
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);

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

  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  const { event, post, account } = payload as any;

  console.log(`[zernio-webhook] Event: ${event}`, JSON.stringify(payload).substring(0, 200));

  try {
    // ── WhatsApp messaging events (Zernio inbox) ────────────────────
    if (event === 'message.received') {
      await handleInboundMessage(supabase, payload);
      return jsonResponse({ received: true, event });
    }
    if (event === 'message.delivered' || event === 'message.read' || event === 'message.failed') {
      await handleDeliveryStatus(supabase, event, payload);
      return jsonResponse({ received: true, event });
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
              action_url: '/admin/social-media/accounts',
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
              action_url: '/admin/social-media/accounts',
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

    // ── account.disconnected ────────────────────────────────────────
    else if (event === 'account.disconnected') {
      const zernioAccountId: string | undefined = account?.accountId;
      if (zernioAccountId) {
        await supabase
          .from('social_accounts')
          .update({ is_active: false })
          .eq('zernio_account_id', zernioAccountId);
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
    if (event === 'message.received') {
      return jsonResponse({ error: 'Transient failure handling inbound message', event }, 500);
    }
  }

  return jsonResponse({ received: true, event });
}));
