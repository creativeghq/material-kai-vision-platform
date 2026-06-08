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
 *   message.received    → capture WhatsApp reply into messaging_conversations (+ assign on first reply, STOP/START)
 *   message.delivered|read|failed → update messaging_logs / campaign recipient delivery status
 *
 * This is the single Zernio webhook endpoint for BOTH social posts and WhatsApp
 * messaging (the former Twilio messaging-webhook was removed). Register one
 * webhook in Zernio subscribed to post.* + account.* + message.* events.
 */

import { createClient } from '@supabase/supabase-js';
import { corsHeaders } from '../_shared/cors.ts';
import { bootstrapForFunction } from '../_shared/secrets-bootstrap.ts';
import { emitFlowEvent } from '../_shared/flow-events.ts';

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
    return expectedHex === receivedHex;
  } catch {
    return false;
  }
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
 * Inbound WhatsApp reply (message.received). Captures it into the conversations
 * layer, assigns the thread (to the originating campaign owner) the FIRST time a
 * reply arrives, handles STOP/START keywords, and emits a flow event for notify.
 * Outbound campaign sends never reach here — only genuine replies surface a thread.
 */
async function handleInboundMessage(supabase: any, payload: any): Promise<void> {
  const msg = payload.message || {};
  if (msg.platform && msg.platform !== 'whatsapp') return;       // WhatsApp only
  if (msg.direction && msg.direction !== 'incoming') return;

  const accountId = accountIdOf(payload.account);
  const phone = contactPhoneOf(msg.sender);
  if (!phone) { console.warn('[zernio-webhook] inbound message without resolvable phone'); return; }

  // Map the Zernio account back to our channel.
  const { data: channel } = await supabase
    .from('messaging_channels').select('id').eq('zernio_account_id', accountId).maybeSingle();

  // STOP / START keyword compliance.
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

  // Find or create the conversation thread for (channel, contact).
  const { data: existingConv } = await supabase
    .from('messaging_conversations').select('id, assigned_to')
    .eq('channel_id', channel?.id ?? null).eq('contact_phone', phone).maybeSingle();

  const preview = (msg.text || '[attachment]').substring(0, 200);
  let conversationId = existingConv?.id;

  if (existingConv) {
    const update: Record<string, unknown> = {
      zernio_conversation_id: msg.conversationId,
      contact_name: msg.sender?.name ?? undefined,
      contact_wa_id: msg.sender?.businessScopedUserId ?? msg.sender?.id ?? undefined,
      status: 'open',
      last_message_at: msg.sentAt || new Date().toISOString(),
      last_message_preview: preview,
      last_message_direction: 'incoming',
      unread_count: undefined, // bumped below via rpc-free increment
    };
    // increment unread atomically-ish (best-effort read-modify-write)
    const { data: cur } = await supabase.from('messaging_conversations').select('unread_count').eq('id', existingConv.id).single();
    update.unread_count = (cur?.unread_count || 0) + 1;

    // Assign on first reply: if nobody owns it yet, hand it to the campaign owner.
    if (!existingConv.assigned_to) {
      const owner = await resolveCampaignOwner(supabase, phone);
      if (owner) { update.assigned_to = owner; update.assigned_at = new Date().toISOString(); }
    }
    await supabase.from('messaging_conversations').update(update).eq('id', existingConv.id);
  } else {
    const owner = await resolveCampaignOwner(supabase, phone);
    const { data: created } = await supabase.from('messaging_conversations').insert({
      channel_id: channel?.id ?? null,
      zernio_account_id: accountId,
      zernio_conversation_id: msg.conversationId,
      contact_phone: phone,
      contact_name: msg.sender?.name ?? null,
      contact_wa_id: msg.sender?.businessScopedUserId ?? msg.sender?.id ?? null,
      status: 'open',
      assigned_to: owner ?? null,
      assigned_at: owner ? new Date().toISOString() : null,
      last_message_at: msg.sentAt || new Date().toISOString(),
      last_message_preview: preview,
      last_message_direction: 'incoming',
      unread_count: 1,
    }).select('id, assigned_to').single();
    conversationId = created?.id;
  }

  if (conversationId) {
    await supabase.from('messaging_conversation_messages').insert({
      conversation_id: conversationId,
      zernio_message_id: msg.platformMessageId || msg.id || null,
      direction: 'incoming',
      body: msg.text ?? null,
      attachments: msg.attachments ?? [],
      status: 'received',
      sender_phone: phone,
      sender_name: msg.sender?.name ?? null,
      sent_at: msg.sentAt || new Date().toISOString(),
      metadata: msg.metadata ?? {},
    });

    // Notify via Flows (no-op until a flow is bound — wired with the inbox UI fast-follow).
    const { data: conv } = await supabase
      .from('messaging_conversations').select('assigned_to').eq('id', conversationId).maybeSingle();
    await emitFlowEvent('whatsapp.reply_received', {
      conversation_id: conversationId,
      user_id: conv?.assigned_to ?? null,
      contact_phone: phone,
      contact_name: msg.sender?.name ?? null,
      title: `New WhatsApp reply from ${msg.sender?.name || phone}`,
      body: preview,
      action_url: `/admin/modules/messaging?conversation=${conversationId}`,
      type: 'whatsapp_reply',
    }).catch(() => {});
  }
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

  // Agent-reply messages in the conversation layer (best-effort).
  await supabase.from('messaging_conversation_messages').update({ status }).eq('zernio_message_id', wamid);
}

Deno.serve(async (req) => {
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
        await supabase.from('social_posts').update(update).eq('zernio_post_id', zernioPostId);
      }
    }

    // ── post.failed ─────────────────────────────────────────────────
    else if (event === 'post.failed') {
      if (zernioPostId) {
        await supabase
          .from('social_posts')
          .update({
            status: 'failed',
            metadata: { error: firstPlatformError(post) || 'Publish failed on all platforms' },
            updated_at: new Date().toISOString(),
          })
          .eq('zernio_post_id', zernioPostId);
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
    // Log but always return 200 to Zernio (prevent retry loops)
    console.error(`[zernio-webhook] Error handling ${event}:`, err);
  }

  return jsonResponse({ received: true, event });
});
