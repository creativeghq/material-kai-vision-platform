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
import { captureException } from '../_shared/sentry.ts';
import {
  ensureZernioSecrets, zernioWebhookSecret, fetchZernioAttachment,
  fetchZernioMediaUrl,
} from '../_shared/zernio.ts';
import { emitFlowEvent, emitFlowEventToWorkspaceRoles, emitInboxMessageEvent } from '../_shared/flow-events.ts';
import { fetchImageGuardedOrNull } from '../_shared/fetch-image.ts';
import {
  INBOX_ATTACHMENT_BUCKET, materialiseInlineAttachments, extensionFor, storeParticipantPicture,
} from '../_shared/inbox-media.ts';
import { withApiLogging } from '../_shared/api-logger.ts';
import { shouldAutoEngageAgent } from '../_shared/inbox-autopilot.ts';

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

/**
 * Record one platform's outcome on a post, without touching the post's aggregate status (#384 A).
 *
 * `post.partial` says SOMETHING failed and `firstPlatformError` returns whichever error happens to
 * come first — so a post that reached 3 of 4 networks looked fully published, and the one network
 * that failed was never named. Zernio pushes `post.platform.published` / `post.platform.failed`
 * per leg, carrying the platform and its own error and URL; we subscribed to both, had no branch,
 * answered 200 and binned them.
 *
 * THE LEG AND THE POST ARE DIFFERENT FACTS, so they are written by different events. The aggregate
 * status stays owned by `post.published` / `post.partial` / `post.failed`; this only ever writes
 * under `metadata.platforms[<platform>]`. A per-leg event arriving before or after its aggregate
 * therefore cannot flip the post's status, in either direction — which matters because the two
 * arrive in no guaranteed order.
 *
 * Keyed by platform name rather than appended to a list: the same leg can report twice (a retry,
 * a redelivery), and a list would show one network as two outcomes with no way to tell which is
 * current.
 */
async function recordPlatformLeg(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  zernioPostId: string,
  platform: string,
  leg: { status: 'published' | 'failed'; error?: string | null; url?: string | null },
): Promise<{ id: string; workspace_id: string; user_id: string; caption: string | null } | null> {
  const { data: row } = await supabase
    .from('social_posts')
    .select('id, workspace_id, user_id, caption, metadata')
    .eq('zernio_post_id', zernioPostId)
    .maybeSingle();
  if (!row) return null;

  const meta = (row.metadata && typeof row.metadata === 'object' ? row.metadata : {}) as Record<string, unknown>;
  const platforms = (meta.platforms && typeof meta.platforms === 'object' ? meta.platforms : {}) as Record<string, unknown>;

  const { error } = await supabase
    .from('social_posts')
    .update({
      metadata: {
        ...meta,
        platforms: {
          ...platforms,
          [platform]: {
            status: leg.status,
            ...(leg.error ? { error: leg.error } : {}),
            ...(leg.url ? { url: leg.url } : {}),
            at: new Date().toISOString(),
          },
        },
      },
      updated_at: new Date().toISOString(),
    })
    .eq('id', row.id);

  // Reported, not swallowed: a leg we could not record is a post whose per-platform picture is
  // now wrong, and silently dropping it is the shape this whole change exists to remove.
  if (error) {
    console.error('[zernio-webhook] platform leg not recorded:', platform, error.message);
    return null;
  }
  return row as { id: string; workspace_id: string; user_id: string; caption: string | null };
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

// `matchOrCreateContact` lived here. It was a SELECT-then-INSERT with no lock, and it is
// gone rather than merely unused: `whatsapp_resolve_contact_and_thread` does the same job
// atomically, and a second contact resolver sitting in this file is how the race comes back.

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

/**
 * A remote `sentAt`, accepted only if it is a real past instant.
 *
 * Returns null for anything unparseable, absurdly old (pre-2000 — the shape an epoch-in-seconds
 * value takes when read as milliseconds) or in the future. A bad timestamp used as `created_at`
 * does not fail: it silently files the message at the wrong end of the thread, and a message
 * dated 1970 or 2087 sorts above or below every real one forever.
 */
/**
 * The attachments on an inbound message, in OUR shape.
 *
 * This existed as `msg.attachments ?? []`, which assumed one field name and one array shape.
 * Measured 2026-08-24 across 36 inbound WhatsApp/social messages: **zero** carried an
 * attachment — while the assistant's own replies in those same threads read "Sorry, I can't open
 * PDFs or attachments here". So files were arriving and every one of them was discarded. Two of
 * those messages had no text either, which means they rendered in the inbox as an empty bubble:
 * the customer sent a document and the operator saw nothing at all.
 *
 * Zernio's own surface is `GET /inbox/conversations/{id}/messages/{messageId}/attachments/{index}`
 * — attachments are addressed separately from the message — so the inline shape is not something
 * to assume. Every plausible spelling is accepted here rather than picked; being wrong about the
 * field name must not be the same as the customer having sent nothing.
 */
export function normalizeInboundAttachments(msg: Record<string, unknown>): Array<Record<string, unknown>> {
  const out: Array<Record<string, unknown>> = [];

  const push = (raw: unknown) => {
    if (!raw || typeof raw !== 'object') return;
    const a = raw as Record<string, unknown>;
    const url = a.url ?? a.link ?? a.mediaUrl ?? a.fileUrl ?? a.downloadUrl ?? a.href;
    const name = a.name ?? a.filename ?? a.fileName ?? a.caption ?? a.title;
    const type = a.contentType ?? a.content_type ?? a.mimeType ?? a.mime_type ?? a.type;
    if (!url && !name) return;      // nothing addressable and nothing to name — not an attachment
    out.push({
      url: typeof url === 'string' ? url : undefined,
      name: typeof name === 'string' ? name : undefined,
      content_type: typeof type === 'string' ? type : undefined,
      size: typeof a.size === 'number' ? a.size : (typeof a.fileSize === 'number' ? a.fileSize : undefined),
      // Kept so the per-index endpoint can be used later without re-deriving which one this was.
      provider_index: typeof a.index === 'number' ? a.index : undefined,
      provider_id: typeof a.id === 'string' ? a.id : undefined,
    });
  };

  for (const key of ['attachments', 'media', 'files', 'documents']) {
    const v = msg[key];
    if (Array.isArray(v)) v.forEach(push);
  }
  // Singular forms — one media item promoted to a top-level object rather than an array.
  for (const key of ['attachment', 'file', 'document', 'image', 'video', 'audio']) {
    if (msg[key] && typeof msg[key] === 'object') push(msg[key]);
  }
  // Fully flattened: the url and its type sitting directly on the message.
  if (!out.length) {
    const flatUrl = msg.mediaUrl ?? msg.fileUrl ?? msg.attachmentUrl;
    if (typeof flatUrl === 'string' && flatUrl) {
      push({ url: flatUrl, contentType: msg.mediaType ?? msg.mimeType, name: msg.fileName ?? msg.caption });
    }
  }
  return out;
}

/**
 * Is this "text" actually the channel telling us it could not give us the message?
 *
 * Zernio substitutes a bracketed placeholder — `[Unsupported message]` — for media it does not
 * hand over inline. Measured 2026-08-24: 5 inbound messages carry exactly that string, from the
 * first import at 04:20 through to 08:27, and the customer's actual photo or PDF is in none of
 * them.
 *
 * This exists because the first version of the unresolved-media check asked `!msg.text`, which is
 * FALSE for a placeholder — so the diagnostic built to catch precisely this case sat silent
 * through five of them. A placeholder is not text; it is the absence of the message wearing text's
 * clothes, and any check that treats it as content will pass while the file is lost.
 *
 * Matched as an exact, small, case-insensitive set rather than "anything in brackets": a customer
 * writing `[urgent]` is sending a message, not a media placeholder.
 */
const MEDIA_PLACEHOLDERS = new Set([
  'unsupported message', 'unsupported', 'image', 'photo', 'video', 'audio', 'voice message',
  'document', 'file', 'sticker', 'contact', 'location', 'attachment', 'media',
]);

export function isMediaPlaceholder(text: unknown): boolean {
  if (typeof text !== 'string') return false;
  const t = text.trim();
  if (!t.startsWith('[') || !t.endsWith(']')) return false;
  return MEDIA_PLACEHOLDERS.has(t.slice(1, -1).trim().toLowerCase());
}

/**
 * A reaction arriving dressed as a message.
 *
 * Reacting with 👍 on the phone produces BOTH a `reaction.received` event — which carries the
 * emoji and the message it belongs to — and a `message.sent` whose entire text is the literal
 * string `[reaction]`. Filing the second one puts a message in the thread that reads "[reaction]",
 * attached to nothing, signed by whoever reacted. That is what the operator saw.
 *
 * The reaction event is the real one and it is handled; this is its shadow, and it is dropped.
 */
export function isReactionPlaceholder(text: unknown): boolean {
  if (typeof text !== 'string') return false;
  const t = text.trim().toLowerCase();
  return t === '[reaction]' || t === '[reacted]';
}


/**
 * Pull the customer's files off Zernio and into OUR storage.
 *
 * Reading the webhook payload was never going to work: Zernio serves attachments from
 * `/inbox/conversations/{id}/messages/{messageId}/attachments/{index}`, addressed separately from
 * the message. So the file has to be FETCHED, and it has to be fetched now — the vendor's links
 * are short-lived and the customer will not resend a spec sheet because our importer was late.
 *
 * The bytes are stored, never the URL (storage convention #7), and the row records
 * bucket + object path so the frontend mints a signed URL per read.
 *
 * Walks upward from index 0 until the endpoint says there is nothing there, because a message
 * does not reliably declare how many attachments it has. Capped, so a malformed count cannot turn
 * one webhook into an unbounded fetch loop.
 */
async function fetchAndStoreInboundAttachments(
  supabase: any,
  params: { threadId: string; conversationId: string; messageId: string; max?: number },
): Promise<Array<Record<string, unknown>>> {
  const out: Array<Record<string, unknown>> = [];
  if (!params.conversationId || !params.messageId) return out;

  const max = params.max ?? 10;
  for (let i = 0; i < max; i++) {
    let got: Awaited<ReturnType<typeof fetchZernioAttachment>>;
    try {
      got = await fetchZernioAttachment({
        conversationId: params.conversationId,
        messageId: params.messageId,
        index: i,
      });
    } catch (err) {
      console.warn('[zernio-webhook] attachment fetch threw:', err);
      break;
    }
    if (!got) break;                      // no attachment at this index — we have them all
    if (!got.bytes.byteLength) continue;  // an empty body is not a file; keep looking

    const ext = extensionFor(got.contentType, got.fileName);
    const safeName = (got.fileName || `attachment-${i + 1}${ext}`).replace(/[^a-zA-Z0-9._-]/g, '_');
    const path = `inbox/${params.threadId}/${crypto.randomUUID()}-${safeName}`;

    const { error } = await supabase.storage
      .from(INBOX_ATTACHMENT_BUCKET)
      .upload(path, got.bytes, { contentType: got.contentType, upsert: false });
    if (error) {
      // Loud, and not fatal: the message body must still be filed. A dropped file the operator
      // knows about beats a message that never arrives.
      console.error(`[zernio-webhook] attachment upload failed for ${params.messageId}#${i}:`, error.message);
      continue;
    }

    out.push({
      storage_bucket: INBOX_ATTACHMENT_BUCKET,
      storage_object_path: path,
      name: got.fileName || safeName,
      content_type: got.contentType,
      size: got.bytes.byteLength,
    });
  }
  return out;
}

// `refreshWhatsAppProfile` lived here. It tried three endpoints for a profile photo —
// `/whatsapp/number-info`, `/inbox/conversations/{id}`, `/contacts` — and settled for a Zernio
// CRM row whose `name` was the phone number. Deleted rather than left unused: a second profile
// path is how the guessing comes back. The photo comes from ONE place now, the documented
// `participantPicture` on `GET /v1/inbox/conversations`, read by messaging-api `sync-avatars`.

// materialiseInlineAttachments / normalizeMediaType / extensionFor / storeParticipantPicture all
// live in _shared/inbox-media.ts — messaging-api needs the identical download for
// repair-attachments and sync-avatars, and two copies of "how a provider link becomes a stored
// file" is how they drift.

export function parseSentAt(raw: unknown): string | null {
  if (typeof raw !== 'string' && typeof raw !== 'number') return null;
  const d = new Date(raw);
  const t = d.getTime();
  if (!Number.isFinite(t)) return null;
  if (t < Date.UTC(2000, 0, 1)) return null;
  // A minute of slack for clock skew between Meta and us; beyond that it is not a past event.
  if (t > Date.now() + 60_000) return null;
  return d.toISOString();
}

async function handleInboundMessage(supabase: any, payload: any): Promise<InboundOutcome> {
  const msg = payload.message || {};

  // The CONVERSATION object, which we never once read.
  //
  // Every inbox webhook carries `conversation` beside `message`, and per Zernio's OpenAPI spec it
  // holds `participantId`, `participantName`, `participantPicture` and `contactId`. That is the
  // counterparty's identity and their profile photo, in every single payload, all along — while
  // this handler was inferring the first from `msg.sender` (which is the BUSINESS on an outgoing
  // message) and chasing the second through three lookup endpoints that do not return it.
  //
  // `participantId` is the counterparty on BOTH directions, which is exactly what an echo needs:
  // there is no `recipient` field on the message object at all.
  const conv = payload.conversation || {};
  const convParticipantId = typeof conv.participantId === 'string' ? conv.participantId : '';
  const convParticipantName = typeof conv.participantName === 'string' ? conv.participantName : '';
  const convParticipantPicture = typeof conv.participantPicture === 'string' ? conv.participantPicture : '';

  // A message the OPERATOR sent, echoed back to us. It is filed, not dropped.
  //
  // This used to `return` here, and on a coexistence number that means the Inbox shows half a
  // conversation. Verified 2026-08-24 against the operator's own phone: their 10:51 "Hello, Good
  // Morning" and their 11:21 "Can you do a small follow for me, with your sales manager?" are on
  // WhatsApp and in neither our thread nor anywhere else — because they were typed in the
  // WhatsApp Business app, and every echo of them was discarded on this line. The customer's
  // replies landed, so the thread reads as a stranger answering questions nobody asked.
  //
  // Coexistence exists precisely so a number can be worked from both the phone and the platform.
  // A platform that only records its own half is not showing the conversation.
  //
  // Not a duplicate risk for a message sent FROM here: the relay stores the wamid Meta returns,
  // and the echo carries that same wamid, so the dedupe below recognises it as already filed.
  const isOutgoingEcho = !!msg.direction && msg.direction !== 'incoming';

  // A reaction's shadow message. The `reaction.received` event carries the real thing — the emoji
  // and which message it belongs on — so filing this too would put "[reaction]" in the thread as
  // a message of its own, attached to nothing.
  if (isReactionPlaceholder(msg.text)) {
    return { outcome: 'dropped', reason: 'reaction placeholder (handled by reaction.received)' };
  }

  // Is this a live message, or history being replayed by the back-fill?
  //
  // The back-fill posts through this same handler ON PURPOSE — one importer, so "works live but
  // not on replay" cannot be built. The cost of that choice is that a replayed message is
  // indistinguishable from a customer writing in, and on 2026-08-24 the assistant answered 22 of
  // them across 8 conversations that had finished weeks earlier. This flag is what makes the two
  // distinguishable, and it only ever REMOVES behaviour (no auto-engage, no agent reply, no
  // "you were assigned" notification) — so even a forged one cannot cause an action.
  const historical = payload.backfill === true;

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

  // WHOSE number identifies the conversation.
  //
  // On an inbound message that is the sender. On an echo of our own it is the RECIPIENT — the
  // sender there is our own WABA number, and resolving on it would open a thread with ourselves
  // and mint a CRM contact for the company's own line.
  // `conversation.participantId` FIRST, on both directions.
  //
  // Per the spec it is the counterparty's platform identifier — for WhatsApp, the phone number
  // without a leading `+`. It is correct for an echo, where `msg.sender` is our own business
  // number, and it is correct for an inbound message too, so there is one rule rather than a
  // direction-dependent guess. `msg.recipient` / `msg.to`, which the previous version reached
  // for, are not fields that exist on this payload at all.
  let counterparty = contactPhoneOf({ id: convParticipantId })
    ?? (isOutgoingEcho ? undefined : contactPhoneOf(msg.sender));

  // Last resort: the thread this conversation already belongs to knows the number.
  if (!counterparty && isOutgoingEcho && msg.conversationId) {
    const { data: byConv } = await supabase
      .from('inbox_threads').select('metadata')
      .eq('channel', 'whatsapp')
      .eq('metadata->>zernio_conversation_id', String(msg.conversationId))
      .limit(1).maybeSingle();
    const known = (byConv as { metadata?: Record<string, unknown> } | null)?.metadata?.contact_phone;
    if (typeof known === 'string' && known) counterparty = known;
  }

  const phone = counterparty;
  if (!phone) {
    console.warn(
      `[zernio-webhook] ${isOutgoingEcho ? 'outgoing echo' : 'inbound message'} without a resolvable `
      + `counterparty number. message keys: ${Object.keys(msg).join(',')}`,
    );
    return {
      outcome: 'dropped',
      reason: isOutgoingEcho
        ? 'no resolvable recipient on the outgoing echo'
        : 'no resolvable phone on the sender',
    };
  }

  // Already have it? Then this is a re-import, and a re-import must be a no-op.
  //
  // This is what makes "run the back-fill again" a safe, ordinary thing to do — which it has to
  // be, because Meta hands coexistence history over asynchronously (19% done when the first
  // import ran, which is why it found 8 conversations and not the whole address book). Without
  // this, catching up on what has since arrived also files a second copy of everything that
  // already had. Cheap: one indexed lookup against inbox_messages_wamid_unique.
  const alreadyFiled = await findInboxMessageByProviderId(supabase, msg);
  if (alreadyFiled) {
    // ...with ONE exception: a message we filed but whose file we never retrieved. Skipping it
    // outright would mean the five `[Unsupported message]` rows already in the inbox stay
    // unreadable forever, because the dedupe guard would refuse every attempt to go back for
    // them. A re-import REPAIRS those; it still does not duplicate anything.
    const filedMeta = (alreadyFiled.metadata ?? {}) as Record<string, unknown>;
    // Two ways a filed message can still be missing its file: we never found one, or we recorded
    // a link we cannot actually open. The second shape is what the first real media messages
    // produced — a Zernio media URL needing the API key, useless to a browser — so repairing only
    // the first would leave them broken for good.
    const filedAtts = await supabase.from('inbox_messages')
      .select('attachments, thread_id').eq('id', alreadyFiled.id).maybeSingle();
    const filedRow = filedAtts.data as { attachments?: Array<Record<string, unknown>>; thread_id?: string } | null;
    const hasUnfetchedLink = (filedRow?.attachments ?? []).some((a) => !a.storage_object_path);
    const missingItsFile = filedMeta.attachment_unresolved === true || hasUnfetchedLink;
    if (!missingItsFile) return { outcome: 'dropped', reason: 'already imported' };

    const repairThreadId = String(filedRow?.thread_id ?? '');
    // Prefer the links already on the row: they are the ones that failed, and they came from the
    // provider verbatim. Only fall back to the per-index endpoint when there is nothing to retry.
    let repaired: Array<Record<string, unknown>> = [];
    const retryable = (filedRow?.attachments ?? []).filter((a) => !a.storage_object_path && a.url);
    if (retryable.length) {
      repaired = (await materialiseInlineAttachments(supabase, repairThreadId, retryable))
        .filter((a) => a.storage_object_path);
    }
    if (!repaired.length) {
      repaired = await fetchAndStoreInboundAttachments(supabase, {
        threadId: repairThreadId,
        conversationId: String(msg.conversationId ?? ''),
        messageId: String(msg.id ?? msg.platformMessageId ?? ''),
      });
    }
    if (!repaired.length) {
      return { outcome: 'dropped', reason: 'already imported (its file is still unavailable)' };
    }
    const { attachment_unresolved: _cleared, provider_keys: _keys, ...keep } = filedMeta;
    await supabase.from('inbox_messages')
      .update({ attachments: repaired, metadata: { ...keep, attachment_recovered: true } })
      .eq('id', alreadyFiled.id);
    return { outcome: 'filed', reason: `recovered ${repaired.length} attachment(s)` };
  }

  // STOP / START keyword compliance (independent of thread resolution).
  //
  // The CUSTOMER's words only. Consent is theirs to withdraw, and an operator typing "stop" — or
  // "STOP by the showroom tomorrow" — must not opt their own customer out of every future
  // message. Reading an echo here would let us withdraw consent on the customer's behalf.
  const text = isOutgoingEcho ? '' : String(msg.text || '').trim();
  const upper = text.toUpperCase();
  if (text && (OPT_OUT_KEYWORDS.some((k) => upper === k || upper.startsWith(k + ' '))
            || OPT_IN_KEYWORDS.some((k) => upper === k || upper.startsWith(k + ' ')))) {
    // Which business was this said TO (#359 CM-1). Consent is per sender: telling one shop to stop
    // is not telling every shop on the platform to stop, and the table had no workspace at all.
    // An unresolvable account keeps the old platform-wide behaviour (workspace_id NULL) rather than
    // dropping the opt-out — over-suppressing is the safe direction for a withdrawal of consent.
    const { workspaceId: optoutWs } = await resolveAccountWorkspace(supabase, accountId);
    // Through the RPC, not a direct write: uniqueness is now a pair of PARTIAL indexes, which
    // PostgREST's `onConflict` cannot target at all — an upsert here would fail with a raw 42P10
    // on the one path where a compliance record must never be lost.
    if (OPT_OUT_KEYWORDS.some((k) => upper === k || upper.startsWith(k + ' '))) {
      const { error: optoutErr } = await supabase.rpc('messaging_record_optout', {
        p_workspace_id: optoutWs ?? null,
        p_phone: phone,
        p_channel_type: 'whatsapp',
        p_reason: `STOP keyword: ${text}`,
        p_source: 'keyword',
      });
      // Loud, because the alternative is carrying on messaging somebody who said stop.
      if (optoutErr) console.error('[zernio-webhook] STOP received but the opt-out was NOT recorded', phone, optoutErr);
    } else {
      // START only lifts what THIS business holds. It must not clear another shop's opt-out, nor a
      // platform-wide suppression somebody set deliberately.
      await supabase.rpc('messaging_clear_optout', {
        p_workspace_id: optoutWs ?? null, p_phone: phone, p_channel_type: 'whatsapp',
      });
    }
  }

  // Resolve owning workspace — required because inbox_threads.workspace_id is NOT NULL and the
  // directional wall is keyed on it. Without a binding we can't safely place the thread.
  const { workspaceId, channelId } = await resolveAccountWorkspace(supabase, accountId);
  if (!workspaceId) {
    console.warn(`[zernio-webhook] no workspace for Zernio account ${accountId} — inbound dropped`);
    return { outcome: 'dropped', reason: `no workspace bound to Zernio account ${accountId}` };
  }

  const owner = (await resolveCampaignOwner(supabase, phone)) || (await resolveWorkspaceOwner(supabase, workspaceId));
  // The name of the PERSON WE ARE TALKING TO, which is not the sender on our own message.
  //
  // `msg.sender.name` on a `message.sent` echo is the BUSINESS — so filing an echo renamed the
  // thread to the operator: a conversation with Drosopoulos was relabelled "Basilis Kanonidis",
  // the name of the person answering it. `conversation.participantName` is the counterparty on
  // both directions, which is the whole reason to prefer it. The sender fallback is kept for an
  // inbound message on a payload that carries no conversation block, and is refused outright on
  // an echo — there is no circumstance where our own name is the thread's name.
  const contactName = convParticipantName
    || (isOutgoingEcho ? null : (msg.sender?.name ?? null));

  const meta = {
    zernio_account_id: accountId,
    zernio_conversation_id: msg.conversationId,
    channel_id: channelId,
    contact_phone: phone,
  };

  // Contact, thread and participants resolved in ONE transaction, under an advisory lock on this
  // workspace+number.
  //
  // This was four separate round trips — find contact, create contact, find thread, create thread
  // — and every one of them was a check followed by an insert with a gap in between. On
  // 2026-08-24 two messages from the same person landed ~90ms apart and each webhook walked the
  // gap: two CRM contacts 69ms apart, then two threads 1.06s apart, because the thread lookup is
  // keyed on contact_id and each webhook only knew about the contact it had just made itself. One
  // person, two inboxes, and the operator's reply goes to whichever they happen to open. Nothing
  // errored — both webhooks returned 200 and both threads looked perfectly normal.
  const { data: resolved, error: resolveErr } = await supabase.rpc('whatsapp_resolve_contact_and_thread', {
    p_workspace_id: workspaceId,
    p_phone: phone,
    p_name: contactName,
    p_owner: owner,
    p_metadata: meta,
    p_at: msg.sentAt || new Date().toISOString(),
  });
  if (resolveErr) {
    // Transient DB fault — throw so the webhook returns 5xx and Zernio retries, rather than
    // permanently dropping the customer's message.
    throw new Error(`whatsapp_resolve_contact_and_thread failed: ${resolveErr.message}`);
  }
  const r = (resolved ?? {}) as {
    contact_id?: string; thread_id?: string; customer_participant_id?: string;
    contact_created?: boolean; thread_created?: boolean;
  };
  const contactId = r.contact_id ?? null;
  const threadId = r.thread_id ?? null;
  const customerParticipantId = r.customer_participant_id ?? null;
  if (!threadId) throw new Error('whatsapp_resolve_contact_and_thread returned no thread');

  // Whether the assistant engages is decided HERE, not in the resolver: only this side knows
  // whether the message is live or a replayed import. The resolver always creates the thread with
  // the agent off, which is the safe direction if this block ever stops running.
  if (r.thread_created && await shouldAutoEngageAgent(supabase, workspaceId, { historical })) {
    await supabase.from('inbox_threads')
      .update({ agent_state: 'active', agent_id: 'kai' }).eq('id', threadId);
    await supabase.from('inbox_participants').insert({
      thread_id: threadId, participant_type: 'agent', agent_id: 'kai', thread_role: 'agent',
    });
    await supabase.from('inbox_messages').insert({
      thread_id: threadId, message_type: 'system',
      body: 'The AI assistant is responding to new messages on this conversation.',
    });
  }

  // Who is this, according to WhatsApp? Fetched on a new thread, and refreshed when the answer on
  // file is older than a week — a business changes its address or its hours, and a card that is
  // right once and then frozen is a card nobody trusts. Never on an import: back-filling 8
  // conversations would fire 8 profile lookups for chats already on the operator's phone.
  // The counterparty's photo and display name come from the WEBHOOK, not from a lookup.
  //
  // `conversation.participantPicture` is OPTIONAL on a webhook — measured absent on four real
  // `message.received` payloads, which is why nothing had a photo. It is a documented field on
  // `GET /v1/inbox/conversations`, so the picture is FETCHED there by messaging-api's
  // `sync-avatars`; this block is the opportunistic path for when a payload does carry one.
  // Reading it here alone was the bug: waiting for a push that is not guaranteed, on a field the
  // list endpoint will hand over on request.
  //
  // Still downloaded rather than linked: a provider image URL expires, and a card whose photo
  // becomes a broken square is worse than one that never had a photo.
  if (!historical && (convParticipantPicture || convParticipantName)) {
    const threadMeta = (await supabase.from('inbox_threads').select('metadata').eq('id', threadId).maybeSingle())
      .data?.metadata as Record<string, unknown> | undefined;
    const known = (threadMeta?.wa_profile ?? {}) as Record<string, unknown>;
    // Re-fetch only when the picture URL actually changed — the image is immutable for a given
    // URL, so a per-message download would be one wasted round trip per message.
    if (convParticipantPicture && known.avatar_source !== convParticipantPicture) {
      await storeParticipantPicture(supabase, threadId, convParticipantPicture, convParticipantName);
    } else if (convParticipantName && known.name !== convParticipantName) {
      await supabase.rpc('inbox_thread_merge_metadata', {
        p_thread_id: threadId,
        p_patch: { wa_profile: { ...known, name: convParticipantName } },
      });
    }
  }

  // A WhatsApp reply from an unknown number is a genuine new lead written straight to
  // crm_contacts, so the "new lead → notify/assign" flow has to be fired by hand here or it never
  // runs for one. Only on a real creation, and never on an import.
  if (r.contact_created && contactId && !historical) {
    await emitFlowEventToWorkspaceRoles(workspaceId, ['owner', 'admin'], 'crm_contact_created', (uid: string) => ({
      type: 'crm_contact_created', workspace_id: workspaceId, user_id: uid,
      contact_id: contactId, contact_name: contactName || phone, lead_source: 'whatsapp',
      title: 'New WhatsApp lead', body: `${contactName || phone} messaged you on WhatsApp.`,
      action_url: `/crm/contacts/${contactId}`,
    })).catch(() => {});
  }

  // Not on an import: back-filling 8 conversations would post 8 "you were assigned" cards for
  // chats the operator has been reading on their phone for months.
  if (r.thread_created && owner && !historical) {
    await emitFlowEvent('inbox.thread_assigned', {
      user_id: owner, type: 'inbox_assigned',
      title: 'You were assigned a WhatsApp conversation',
      body: contactName || phone, action_url: `/inbox?thread=${threadId}`, thread_id: threadId,
    }).catch(() => {});
  }

  const preview = (msg.text || '[attachment]').substring(0, 200);
  // Imported history keeps the time it was actually sent. Left to `now()`, a back-fill stamps
  // every message of every conversation with the minute the import ran — the first one filed 8
  // conversations spanning weeks as if all 47 messages had arrived inside three minutes, which
  // destroys the reading order within a thread and makes the transcript a lie. Live messages keep
  // `now()`: `sentAt` there is the same instant, and trusting a remote clock for ordering on the
  // live path buys nothing while a skewed or future one would sort a reply above its question.
  const originalSentAt = historical ? parseSentAt(msg.sentAt) : null;
  let inboundAttachments = normalizeInboundAttachments(msg);

  // Nothing inline? Then ask the endpoint that actually serves the file. This is the difference
  // between "WhatsApp does not give us attachments" — which is not true — and "we never asked".
  // Only when the message looks like it HAS media: no readable text, or an inline entry we could
  // not address. Fetching for every text message would be one wasted round trip per message.
  if (inboundAttachments.length) {
    // Inline media is the shape the real payloads use. Pull the bytes in — the url they carry is
    // an authenticated API endpoint, so the browser cannot render it and it expires besides.
    inboundAttachments = await materialiseInlineAttachments(supabase, threadId, inboundAttachments);
  } else if (!msg.text || isMediaPlaceholder(msg.text)) {
    // Nothing inline but the message clearly had something: fall back to the per-index endpoint.
    const fetched = await fetchAndStoreInboundAttachments(supabase, {
      threadId,
      conversationId: String(msg.conversationId ?? ''),
      messageId: String(msg.id ?? msg.platformMessageId ?? ''),
    });
    if (fetched.length) inboundAttachments = fetched;
  }

  // A message with neither text nor a recognised attachment is not "an empty message" — WhatsApp
  // does not send those. It is a file we failed to read, and it renders as a blank bubble. Say so
  // on the row AND in the log, with the payload's own key names, so the shape we are missing is
  // recoverable from the next real one instead of staying a guess. (Pipeline convention #1:
  // explicit failure markers, never an empty return.)
  // `[Unsupported message]` counts as no text — see isMediaPlaceholder. Asking `!msg.text` alone
  // is what let five of these through in silence.
  const hasRealText = !!msg.text && !isMediaPlaceholder(msg.text);
  const unresolvedMedia = !hasRealText && inboundAttachments.length === 0;
  if (unresolvedMedia) {
    console.warn(
      '[zernio-webhook] inbound message carries no readable text and no attachment we recognise — '
      + `media is arriving under an unhandled key. body=${JSON.stringify(msg.text ?? null)} `
      + `message keys: ${Object.keys(msg).join(',')}`,
    );
  }

  // An echo is OUR message: it belongs to the member who owns the thread, on the right-hand side
  // of the transcript. Attributing it to the customer participant would show the operator's own
  // words as though the customer had written them — and the agent's own guard reads exactly that
  // field to decide whether a customer is waiting for an answer.
  let senderParticipantId: string | null = customerParticipantId;
  if (isOutgoingEcho) {
    const { data: memberP } = await supabase
      .from('inbox_participants').select('id')
      .eq('thread_id', threadId).eq('participant_type', 'member').eq('status', 'active')
      .limit(1).maybeSingle();
    senderParticipantId = (memberP as { id?: string } | null)?.id ?? null;
  }

  const { error: msgErr } = await supabase.from('inbox_messages').insert({
    thread_id: threadId,
    sender_participant_id: senderParticipantId,
    body: msg.text ?? null,
    attachments: inboundAttachments,
    message_type: 'text',
    ...(originalSentAt ? { created_at: originalSentAt } : {}),
    metadata: {
      channel: 'whatsapp',
      wamid: msg.platformMessageId || msg.id || null,
      direction: isOutgoingEcho ? 'outgoing' : 'incoming',
      // Where it was typed. The operator can then tell their own phone reply from a platform one,
      // and `whatsappWindow` — which measures the 24h clock from the last INCOMING message — is
      // not moved by our own words.
      ...(isOutgoingEcho ? { sent_from: 'device' } : {}),
      ...(unresolvedMedia ? { attachment_unresolved: true, provider_keys: Object.keys(msg) } : {}),
      // Kept whether or not it was usable as `created_at`, so "why is this message stamped
      // today" is answerable from the row rather than from a guess.
      ...(historical ? { imported: true, sent_at: msg.sentAt ?? null } : {}),
    },
  });
  if (msgErr) {
    // 23505 on inbox_messages_wamid_unique means another delivery of the SAME message won the
    // race between the pre-check above and this insert. That is the index doing its job, not a
    // fault: the message is filed, just not by us. Retrying would only lose the race again.
    if ((msgErr as { code?: string }).code === '23505') {
      return { outcome: 'dropped', reason: 'already imported' };
    }
    // The reply body itself failed to persist — throw so Zernio retries.
    throw new Error(`inbox_messages insert failed: ${msgErr.message}`);
  }

  // Everything below this line REACTS to the message, and history must not be reacted to. A
  // back-fill of 500 messages would otherwise fire 500 "new WhatsApp message" notifications for
  // conversations the operator had already read on their phone, run order intake over months of
  // old chat, and — the one that actually reached customers — hand each thread to the assistant.
  if (historical) {
    return { outcome: 'filed', reason: 'imported (no notification, no agent reply)' };
  }

  // Neither does our own message. Notifying the operator that they have a new message, because
  // they just sent one, is noise; and handing the thread to the assistant off the back of the
  // operator's own words is how a bot answers its own colleague. The customer is not waiting.
  if (isOutgoingEcho) {
    return { outcome: 'filed', reason: 'outgoing echo filed (sent from the device)' };
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
  const reaction = payload.reaction || {};

  // The reacted-to message is named by `reaction.platformMessageId`, NOT by `payload.message`.
  //
  // A reaction payload has no `message` object at all — its required fields are id, event,
  // reaction, conversation, account, timestamp. This read `payload.message`, got `{}`, produced no
  // id candidates and returned null EVERY TIME. So no reaction has ever attached to anything, in
  // silence, while the placeholder text Zernio sends alongside ("[reaction]") got filed as an
  // ordinary message — which is what an operator sees instead of an emoji on their own reply.
  const targetIds = [reaction.platformMessageId, reaction.messageId]
    .filter((v: unknown): v is string => typeof v === 'string' && v.length > 0);
  if (!targetIds.length) {
    console.warn('[zernio-webhook] reaction without a target message id — dropped');
    return;
  }

  const row = await findInboxMessageByProviderId(supabase, {
    platformMessageId: targetIds[0],
    id: targetIds[1],
  });
  if (!row) {
    // The reacted-to message is not one we hold — an older chat, or one that predates the import.
    console.warn(`[zernio-webhook] reaction targets an unknown message: ${targetIds.join(',')}`);
    return;
  }

  const emoji: string = typeof reaction.emoji === 'string' ? reaction.emoji : '';
  // `action` is authoritative. WhatsApp reports an EMPTY emoji on removal (Meta does not say which
  // one went), so inferring the action from the emoji conflates "removed" with "sent nothing".
  const removed = reaction.action === 'removed' || (!emoji && reaction.action !== 'added');

  const existing: string[] = Array.isArray(row.metadata?.reactions) ? row.metadata.reactions : [];
  const next = removed
    // Meta does not say WHICH emoji was removed, so a removal clears them. One reaction per person
    // per message is the platform rule, and this inbox shows the business's own side.
    ? (emoji ? existing.filter((r: string) => r !== emoji) : [])
    : [...existing.filter((r: string) => r !== emoji), emoji];

  const { error } = await supabase.rpc('inbox_message_merge_metadata', {
    p_message_id: row.id,
    p_patch: { reactions: next },
  });
  if (error) console.error('[zernio-webhook] reaction update FAILED', row.id, error.message);
}

/**
 * review.new / review.updated — a review on a connected profile (Google Business).
 *
 * Reviews PUSH. There is no polling to build: `review.new` on arrival, `review.updated` when the
 * reviewer edits their text or rating, and `review.updated` again when a reply is added —
 * including a reply written directly on Google rather than through us. So the two events are the
 * entire lifecycle and the same upsert serves both.
 *
 * `rating` arrives as an INTEGER 1-5. Zernio has already normalised Google's `ONE`..`FIVE` enum,
 * which is the shape that would otherwise have become a silent zero on every row.
 */
async function handleReview(supabase: any, payload: any): Promise<void> {
  const review = payload.review || {};
  const acct = payload.account || {};
  const externalId = typeof review.id === 'string' ? review.id : '';
  if (!externalId) {
    console.warn('[zernio-webhook] review without an id — dropped');
    return;
  }

  // `accountId` is the canonical field for account filtering per the spec; `id` is the same value
  // and is what older payloads carry.
  const zernioAccountId = String(acct.accountId ?? acct.id ?? '');
  const { workspaceId, socialAccountId, connectedBy } = await resolveSocialWorkspace(supabase, zernioAccountId);
  if (!workspaceId) {
    console.warn(`[zernio-webhook] review for an unmapped account ${zernioAccountId} — dropped`);
    return;
  }

  const reviewer = review.reviewer || {};
  const rating = Number(review.rating);

  const row = {
    workspace_id: workspaceId,
    platform: String(review.platform ?? acct.platform ?? 'googlebusiness'),
    external_id: externalId,
    social_account_id: socialAccountId,
    zernio_account_id: zernioAccountId || null,
    // Out-of-range is a shape we do not understand, and a CHECK violation would drop the whole
    // review. Store it unrated rather than lose the customer's words.
    rating: Number.isFinite(rating) && rating >= 1 && rating <= 5 ? Math.round(rating) : null,
    comment: typeof review.text === 'string' ? review.text : null,
    reviewer_name: typeof reviewer.name === 'string' ? reviewer.name : null,
    // Null on anonymous Google reviews, which the spec calls out as common.
    reviewer_id: typeof reviewer.id === 'string' ? reviewer.id : null,
    reviewer_avatar_url: typeof reviewer.profileImage === 'string' ? reviewer.profileImage : null,
    reply_text: review.hasReply && typeof review.reply === 'string' ? review.reply
      : (typeof review.reply?.comment === 'string' ? review.reply.comment : null),
    replied_at: review.hasReply ? (review.reply?.updateTime ?? payload.timestamp ?? null) : null,
    posted_at: review.createdAt ?? null,
    updated_at_remote: review.updatedAt ?? payload.timestamp ?? null,
    raw: review,
    updated_at: new Date().toISOString(),
  };

  // Upsert on (platform, external_id): `review.updated` is the SAME review, and a second row for
  // it would double the count on every screen that sums them.
  const { error } = await supabase
    .from('external_reviews')
    .upsert(row, { onConflict: 'platform,external_id' });
  if (error) {
    // Throw so the dispatcher answers 5xx and Zernio retries — a review we drop is not resent.
    throw new Error(`external_reviews upsert failed: ${error.message}`);
  }

  // A new review is a business event: a 1-star needs somebody today, and nobody is watching a
  // screen they do not know changed. Registered per §8 of docs/flows-notification-system.md and
  // delivered by the seeded `Review Received → Notify Owner` default flow.
  //
  // `review.updated` fires again when the reviewer edits, AND when a reply is added — including
  // our own reply. Alerting on those would notify the operator about their own answer, so only a
  // review that has NOT been replied to is announced.
  if (payload.event === 'review.new' || !row.reply_text) {
    const stars = row.rating ?? 0;
    const who = row.reviewer_name || 'Someone';
    try {
      await emitFlowEvent('review_received', {
        type: 'review_received',
        workspace_id: workspaceId,
        // Who authorised the profile. The seeded flow templates this; a flow can retarget it.
        user_id: connectedBy,
        review_id: externalId,
        social_account_id: socialAccountId,
        platform: row.platform,
        // A NUMBER, under the same key the trigger_config rating filter names — flow-engine
        // matches config generically by key, so a mismatch here is a filter that never fires.
        rating: row.rating,
        reviewer_name: row.reviewer_name,
        comment: row.comment,
        title: stars ? `${stars}★ review from ${who}` : `New review from ${who}`,
        body: row.comment ? String(row.comment).slice(0, 200) : 'No comment was left.',
        action_url: '/social-media/reviews',
      });
    } catch (err) {
      // Best-effort: the review itself is already stored, and losing the alert must never cost
      // Zernio a 5xx that would replay the whole upsert.
      console.warn('[zernio-webhook] review_received emit failed', err);
    }
  }
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

  // Same rule as WhatsApp, same one place: opt-IN only, never on replayed history.
  const autoRespond = await shouldAutoEngageAgent(supabase, workspaceId, {
    historical: payload.backfill === true,
  });

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

  // Computed once, not twice: the second call was a separate evaluation of the same question,
  // which is how the marker and the stored attachments get to disagree about one message.
  const socialAttachments = normalizeInboundAttachments(msg);
  const socialUnresolved = !(msg.text && !isMediaPlaceholder(msg.text)) && socialAttachments.length === 0;
  if (socialUnresolved) {
    console.warn(
      `[zernio-webhook] social DM on ${plat} carries no readable text and no attachment we `
      + `recognise. body=${JSON.stringify(msg.text ?? null)} message keys: ${Object.keys(msg).join(',')}`,
    );
  }

  const { error: msgErr } = await supabase.from('inbox_messages').insert({
    thread_id: threadId,
    sender_participant_id: null,          // external author, no participant row
    body: msg.text ?? null,
    // Same normaliser as WhatsApp. An Instagram DM is more likely to be a photo than a sentence,
    // so the channel where dropping media hurts most must not be the one still assuming a single
    // field name.
    attachments: socialAttachments,
    message_type: 'text',
    metadata: {
      channel: 'social', direction: 'incoming', platform: plat,
      wamid: msg.platformMessageId || msg.id || null,
      author_handle: handle, author_id: participantId,
      ...(socialUnresolved ? { attachment_unresolved: true, provider_keys: Object.keys(msg) } : {}),
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
      // Meta's own words. They were already being read for `messaging_logs` above and thrown away
      // here — so a CAMPAIGN send recorded why it failed and a CONVERSATION, where a human is
      // waiting for an answer, did not. Measured 2026-08-24: 23 of 27 outbound messages on the
      // first connected number reported FAILED and not one carried a reason, which is why "we
      // are not sending to WhatsApp" could not be told apart from "Meta is refusing them".
      p_error_code: payload.error?.code != null ? String(payload.error.code) : null,
      // `explanation` FIRST — per the spec it is the plain-language translation of the code
      // ("the recipient has likely opted out of marketing messages while utility templates are
      // unaffected"), and it is the only one of these an operator can act on. `message` is Meta's
      // wording and `title` its label; explanation is null for unmapped codes, hence the chain.
      p_error_message: payload.error?.explanation
        ?? payload.error?.message
        ?? payload.error?.title
        ?? null,
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

  // `message` declared explicitly: the message.sent branch builds an echo from it, and the
  // implicit-any spread was the only thing hiding that it was never part of this type.
  // deno-lint-ignore no-explicit-any
  let payload: { event: string; post?: any; account?: any; message?: any };
  try {
    const text = new TextDecoder().decode(rawBody);
    payload = JSON.parse(text);
  } catch {
    return jsonResponse({ error: 'Invalid JSON body' }, 400);
  }

  const { event, post, account } = payload as any;

  // 200 characters truncates before `conversation` on every inbox event, which is exactly the
  // object we needed to see — twice, while getting the profile picture wrong in both directions.
  // The conversation block is small and is logged in full, with its keys named: an optional field
  // that is ABSENT on WhatsApp and PRESENT on Instagram is a fact about the platform, and the only
  // way to know which is to look rather than to reason about the schema.
  console.log(`[zernio-webhook] Event: ${event}`, JSON.stringify(payload).substring(0, 200));
  if (typeof event === 'string' && (event.startsWith('message.') || event.startsWith('reaction.'))) {
    const c = (payload as any).conversation;
    console.log(
      `[zernio-webhook] conversation keys: ${c ? Object.keys(c).join(',') : 'ABSENT'}`
      + ` | participantPicture: ${c?.participantPicture ? 'present' : 'absent'}`
      + ` | sender keys: ${(payload as any).message?.sender ? Object.keys((payload as any).message.sender).join(',') : 'ABSENT'}`,
    );
  }

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
      // Campaign bookkeeping first — this is the only thing it used to do.
      await handleMessageSent(supabase, payload);

      // ...and then FILE it, because this is how the operator's own replies reach us.
      //
      // A reply typed in WhatsApp Web or on the phone comes back as `message.sent`, not as
      // `message.received` with a direction. So the echo handling added to the inbound path
      // never ran for the case it was written for, and two live threads showed `outgoing: 0`
      // while the operator was looking at their own replies on WhatsApp. Verified in the
      // webhook log:
      //
      //   [zernio-webhook] Event: message.sent {"message":{"conversationId":"6a8b3716…"}}
      //
      // Routed through the SAME handler as an inbound message, with the direction forced, so
      // there is one filing path rather than a second that drifts. The wamid dedupe means a
      // message sent from the platform — which also emits message.sent — is recognised as
      // already filed instead of appearing twice.
      const echo = {
        ...payload,
        message: { ...(payload.message ?? {}), direction: 'outgoing' },
      };
      const outcome = await handleInboundMessage(supabase, echo);
      return jsonResponse({ received: true, event, ...outcome });
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
    if (event === 'review.new' || event === 'review.updated') {
      await handleReview(supabase, payload);
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

    // ── post.platform.published / post.platform.failed ──────────────
    // Per-leg terminal outcomes (#384 A). Subscribed since the webhook was registered, dropped
    // until now: `WebhookPayloadPostPlatform` carries a `platform` block naming the target and an
    // `account` block naming the connected account, so the failing network is right there in the
    // payload the dispatcher was throwing away.
    if (event === 'post.platform.published' || event === 'post.platform.failed') {
      const legPlatform: string | undefined =
        (payload as any)?.platform?.platform ?? (payload as any)?.platform?.name ?? account?.platform;
      if (!zernioPostId || !legPlatform) {
        // Named rather than silently 200'd: without the platform there is nothing to key the leg
        // on, and writing it under "unknown" would be worse than not writing it.
        return jsonResponse({ received: true, event, note: 'no post id or platform on the payload' });
      }
      const failed = event === 'post.platform.failed';
      const legError = failed
        ? ((payload as any)?.platform?.error ?? firstPlatformError(post) ?? 'Publish failed on this platform')
        : null;
      const legUrl = !failed
        ? ((payload as any)?.platform?.platformPostUrl ?? (payload as any)?.platform?.url ?? null)
        : null;

      const sp = await recordPlatformLeg(supabase, zernioPostId, legPlatform, {
        status: failed ? 'failed' : 'published',
        error: legError,
        url: legUrl,
      });

      // Only a FAILED leg raises. A successful one is already covered by the aggregate
      // `post.published` notification, and a second bell per network would make a four-platform
      // post ring five times.
      if (failed && sp) {
        try {
          await emitFlowEvent('social_post_failed', {
            type: 'social_post_failed', workspace_id: sp.workspace_id, user_id: sp.user_id,
            social_post_id: sp.id, platform: legPlatform, reason: legError,
            title: `Post failed on ${platformLabel(legPlatform)}`,
            body: `${sp.caption ? `"${String(sp.caption).slice(0, 80)}"` : 'Your post'} did not publish on ${platformLabel(legPlatform)}: ${legError}`,
            action_url: '/social-media/accounts',
          });
        } catch { /* best-effort */ }
      }
      return jsonResponse({ received: true, event, platform: legPlatform, recorded: !!sp });
    }

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
    // The cause has to be REPORTED, not just logged. `withApiLogging` reports what the
    // handler THROWS, and this handler deliberately returns a Response instead — so for
    // 36 inbound WhatsApp messages over one day Sentry held only the string below and
    // the real error existed solely in an edge log nobody was reading. Fingerprinted by
    // event so one bad event type does not bury the others in a single group.
    void captureException(err instanceof Error ? err : new Error(String(err)), {
      tags: { function: 'zernio-webhook-handler', webhook_event: String(event) },
      extra: { event },
      fingerprint: ['zernio-webhook', String(event)],
    });
    // Inbound WhatsApp replies must NOT be silently dropped on a transient DB fault.
    // Return 5xx so Zernio retries the delivery; the upsert/find-or-create logic above
    // is idempotent enough for a retry to converge. Status-sync events (post.*, account.*,
    // delivery status) stay 200 to avoid pointless retry loops on best-effort updates.
    // Anything carrying customer CONTENT is retried; a lost one is unrecoverable because
    // Zernio does not resend on a 200. Status/lifecycle syncs stay 200 — they are best-effort
    // and reconverge on the next event or sync, so retrying them just loops.
    if (event === 'message.received' || event === 'message.edited'
        || event === 'message.deleted' || event === 'comment.received'
        // A review is customer CONTENT and Zernio does not resend after a 200, so a transient
        // fault here loses it permanently. The upsert is keyed on (platform, external_id), which
        // is what makes the retry converge instead of duplicating.
        || event === 'review.new' || event === 'review.updated') {
      return jsonResponse({ error: `Transient failure handling ${event}`, event }, 500);
    }
  }

  return jsonResponse({ received: true, event });
}));
