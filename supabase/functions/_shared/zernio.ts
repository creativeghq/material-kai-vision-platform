/**
 * Shared Zernio client + helpers.
 *
 * Zernio (formerly Late) is the social-publishing + WhatsApp backbone.
 * Base URL: https://zernio.com/api/v1 — Bearer-auth with the workspace's Zernio API key.
 *
 * This file is the single source of truth for the Zernio client. `zernio-api/zernio.ts`
 * re-exports from here so the social functions keep their existing import paths.
 *
 * Secret resolution is env-first / DB-fallback and goes through _shared/secrets.ts →
 * resolveSecret(): ZERNIO_API_KEY first, falling back to the legacy LATE_API_KEY so existing
 * deployments keep working until the new key is pasted in.
 */

import { resolveSecret } from './secrets.ts';

type SupabaseLike = { from: (t: string) => any };

export const ZERNIO_BASE_URL = 'https://zernio.com/api/v1';

// Resolved once per worker. Both getters stay SYNCHRONOUS because ~12 call sites and the whole
// zernioApi surface are sync; an entry point awaits ensureZernioSecrets() once and everything
// downstream reads this cache. `null` means "not resolved yet", '' means "resolved, and absent".
let resolvedApiKey: string | null = null;
let resolvedWebhookSecret: string | null = null;
let resolvedAt = 0;

// A resolved key is cached, but NOT for ever.
//
// An edge worker stays warm for many minutes. Caching indefinitely means the very state an
// admin is actively fixing — key absent — sticks for the life of the worker: they paste the
// key, the row saves, and the warm worker keeps answering 503 from a cached ''. That is the
// same "saved and never read" shape this whole resolver exists to remove, just with a shorter
// fuse. A found key is stable, so it is held longer; an ABSENT one is re-checked almost
// immediately, because someone is probably fixing it right now.
const RESOLVED_TTL_MS = 5 * 60_000;
const ABSENT_TTL_MS = 15_000;

/**
 * Resolve the Zernio secrets through the platform resolver and cache them for the worker.
 * MUST be awaited at handler entry, before the first zernioKey() / zernioApi() call.
 *
 * Both getters used to read Deno.env.get() directly, which can NEVER see an admin-saved value:
 * the secrets-bootstrap that would copy platform_secrets into env is a no-op on the Supabase
 * edge runtime, where Deno.env.set throws 'The operation is not supported' (the warning is
 * documented in _shared/secrets-bootstrap.ts). That made the whole Zernio surface a silent dead
 * end — messaging-api answered 503 with 'paste the key at /admin/modules/messaging/settings →
 * Keys', the admin pasted it, the row saved, and nothing ever read it back. Sentry KAI-RD.
 */
export async function ensureZernioSecrets(supabase: SupabaseLike): Promise<void> {
  const ttl = resolvedApiKey ? RESOLVED_TTL_MS : ABSENT_TTL_MS;
  if (resolvedApiKey !== null && Date.now() - resolvedAt < ttl) return;
  const [api, legacyApi, hook, legacyHook] = await Promise.all([
    resolveSecret(supabase, 'ZERNIO_API_KEY'),
    resolveSecret(supabase, 'LATE_API_KEY'),
    resolveSecret(supabase, 'ZERNIO_WEBHOOK_SECRET'),
    resolveSecret(supabase, 'LATE_WEBHOOK_SECRET'),
  ]);
  resolvedApiKey = api.value || legacyApi.value || '';
  resolvedWebhookSecret = hook.value || legacyHook.value || '';
  resolvedAt = Date.now();
}

/** Reset the worker cache — for tests, and after an admin saves a new key. */
export function resetZernioSecrets(): void {
  resolvedApiKey = null;
  resolvedWebhookSecret = null;
  resolvedAt = 0;
}

/** The Zernio API key. Empty until ensureZernioSecrets() has run (env-only fallback below). */
export function zernioKey(): string {
  if (resolvedApiKey !== null) return resolvedApiKey;
  // Pre-resolve fallback: a caller that forgot ensureZernioSecrets() still sees a real
  // deployment secret — just not an admin-saved one.
  return Deno.env.get('ZERNIO_API_KEY') || Deno.env.get('LATE_API_KEY') || '';
}

/** The Zernio webhook signing secret, falling back to the legacy LATE_WEBHOOK_SECRET. */
export function zernioWebhookSecret(): string {
  if (resolvedWebhookSecret !== null) return resolvedWebhookSecret;
  return Deno.env.get('ZERNIO_WEBHOOK_SECRET') || Deno.env.get('LATE_WEBHOOK_SECRET') || '';
}

/** Public app URL used to build OAuth redirect targets. */
export function publicAppUrl(): string {
  return (Deno.env.get('PUBLIC_APP_URL') || 'https://app.materialshub.gr').replace(/\/+$/, '');
}

export class ZernioApiError extends Error {
  constructor(
    readonly status: number,
    readonly method: string,
    readonly path: string,
    readonly bodyText: string,
  ) {
    super(`Zernio ${method} ${path} → ${status}: ${bodyText}`);
    this.name = 'ZernioApiError';
  }
}

/**
 * Call the Zernio REST API. Throws ZernioApiError on non-2xx. Returns parsed JSON
 * (or {} for empty bodies).
 *
 * Rate limits are tier-based (60 req/min on the free tier, 600 on standard; analytics
 * endpoints are stricter at ~6 req/s). A 429 carries `Retry-After` in seconds, which is
 * relative and therefore immune to clock skew — honour it rather than guessing. Without this
 * a single burst (sync-channels over N accounts, the analytics agent over a batch of 20)
 * surfaced as an opaque failure with no indication that waiting would have fixed it.
 *
 * `opts.headers` exists for `x-request-id`, Zernio's 5-minute idempotency key.
 */
export async function zernioApi(
  method: string,
  path: string,
  body?: unknown,
  opts: { headers?: Record<string, string>; retries?: number } = {},
): Promise<any> {
  const maxRetries = opts.retries ?? 2;

  for (let attempt = 0; ; attempt++) {
    const res = await fetch(`${ZERNIO_BASE_URL}${path}`, {
      method,
      headers: {
        'Authorization': `Bearer ${zernioKey()}`,
        'Content-Type': 'application/json',
        ...(opts.headers ?? {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (res.status === 429 && attempt < maxRetries) {
      // Retry-After is seconds. Cap the wait so an edge function cannot park on a long one.
      const retryAfter = Number(res.headers.get('Retry-After') ?? '');
      const waitMs = Math.min(
        Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 2000 * (attempt + 1),
        15_000,
      );
      console.warn(`[zernio] 429 on ${method} ${path} — retrying in ${waitMs}ms (attempt ${attempt + 1}/${maxRetries})`);
      await new Promise((r) => setTimeout(r, waitMs));
      continue;
    }

    if (!res.ok) {
      throw new ZernioApiError(res.status, method, path, await res.text());
    }

    const text = await res.text();
    return text ? JSON.parse(text) : {};
  }
}

/**
 * Fetch ONE connected account by its Zernio id.
 *
 * There is no `GET /v1/accounts/{accountId}` — the spec exposes only PUT / PATCH / DELETE on
 * that path. Both OAuth callbacks called it anyway and would have died at the last step of
 * every connect, social and WhatsApp alike. It was never noticed because ZERNIO_API_KEY has
 * never had a value, so the request failed earlier, at the 503.
 *
 * The list endpoint is the supported read. Narrow it with the filters the spec accepts
 * (`profileId`, `platform`) so this stays one page even on a large tenant, then match on
 * `_id` — the list item's id field is `_id`, not `accountId`.
 */
export async function fetchZernioAccount(
  accountId: string,
  filters: { profileId?: string; platform?: string } = {},
): Promise<Record<string, any> | null> {
  const qs = new URLSearchParams({ includeOverLimit: 'true' });
  if (filters.profileId) qs.set('profileId', filters.profileId);
  if (filters.platform) qs.set('platform', filters.platform);

  const data = await zernioApi('GET', `/accounts?${qs.toString()}`);
  const accounts = (data.accounts ?? data.data ?? []) as Array<Record<string, any>>;
  return accounts.find((a) => (a._id ?? a.accountId ?? a.id) === accountId) ?? null;
}

/**
 * Sign a body with the SAME secret verifyZernioSignature checks, for a locally-originated
 * replay (the inbox backfill).
 *
 * The alternative was a service-role bypass on the webhook handler, i.e. a second way in that
 * skips signature verification. Invariant 6 says verify before processing and fail closed; a
 * bypass added "just for replay" is the shape that ends up reachable. Signing instead means the
 * replay goes through the exact same door as a real delivery, and an unset secret fails it for
 * the same reason.
 */
export async function signZernioBody(rawBody: string): Promise<string> {
  const secret = zernioWebhookSecret();
  if (!secret) throw new Error('ZERNIO_WEBHOOK_SECRET is not set — cannot sign a replay');
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(rawBody));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Verify an `X-Zernio-Signature` HMAC-SHA256 over the raw webhook body.
 * Supports both "sha256=<hex>" and bare-hex header formats. Fails closed when
 * no secret is configured.
 */
export async function verifyZernioSignature(rawBody: ArrayBuffer, signature: string): Promise<boolean> {
  const secret = zernioWebhookSecret();
  if (!secret || !signature) return false;
  try {
    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign'],
    );
    const expected = await crypto.subtle.sign('HMAC', key, rawBody);
    const expectedHex = Array.from(new Uint8Array(expected))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
    const receivedHex = signature.startsWith('sha256=') ? signature.slice(7) : signature;
    return expectedHex === receivedHex;
  } catch {
    return false;
  }
}

/**
 * Every webhook event this platform acts on, plus the WhatsApp operational events that tell
 * an operator their number is in trouble. Subscribing to an event we do not branch on is
 * harmless (the handler logs and 200s); NOT subscribing to one we do branch on makes that
 * branch dead code, which is the failure mode worth avoiding.
 */
export const ZERNIO_WEBHOOK_EVENTS = [
  // Inbound + delivery — the WhatsApp inbox depends entirely on these.
  'message.received', 'message.sent', 'message.delivered', 'message.read', 'message.failed',
  'message.edited', 'message.deleted', 'conversation.started', 'reaction.received',
  // Connection lifecycle.
  'account.connected', 'account.disconnected',
  // Comments on our own posts, routed into the unified inbox as a `social` thread.
  'comment.received',
  // Publishing outcomes.
  'post.scheduled', 'post.published', 'post.partial', 'post.failed', 'post.cancelled',
  'post.platform.published', 'post.platform.failed',
  // WhatsApp operational health — a declined/suspended number stops all sending, and a
  // template whose category Meta changed silently re-prices every message on it.
  'whatsapp.template.status_updated', 'whatsapp.template.category_updated',
  'whatsapp.number.activated', 'whatsapp.number.declined', 'whatsapp.number.action_required',
  'whatsapp.number.verification_required', 'whatsapp.number.suspended',
  'whatsapp.number.reactivated', 'whatsapp.number.released',
] as const;

/** Public URL Zernio should POST events to. */
export function zernioWebhookUrl(): string {
  const base = (Deno.env.get('SUPABASE_URL') || '').replace(/\/+$/, '');
  return `${base}/functions/v1/zernio-webhook-handler`;
}

export interface ZernioWebhookStatus {
  registered: boolean;
  webhookId?: string;
  url: string;
  isActive?: boolean;
  failureCount?: number;
  lastFiredAt?: string | null;
  missingEvents?: string[];
  secretConfigured: boolean;
}

/** Read our webhook registration from Zernio, if it exists. */
export async function getZernioWebhookStatus(): Promise<ZernioWebhookStatus> {
  const url = zernioWebhookUrl();
  const data = await zernioApi('GET', '/webhooks/settings');
  const hooks = (data.webhooks ?? []) as Array<Record<string, any>>;
  const mine = hooks.find((h) => h.url === url);
  if (!mine) {
    return { registered: false, url, secretConfigured: Boolean(zernioWebhookSecret()) };
  }
  const subscribed = new Set<string>(mine.events ?? []);
  return {
    registered: true,
    webhookId: mine._id,
    url,
    isActive: mine.isActive,
    failureCount: mine.failureCount,
    lastFiredAt: mine.lastFiredAt ?? null,
    missingEvents: ZERNIO_WEBHOOK_EVENTS.filter((e) => !subscribed.has(e)),
    secretConfigured: Boolean(zernioWebhookSecret()),
  };
}

/**
 * Register (or repair) the Zernio webhook pointing at zernio-webhook-handler.
 *
 * NOTHING in this repo ever did this. The handler existed, verified signatures and wrote to
 * the inbox, and Zernio had never been told the URL — so the entire inbound path was
 * unreachable by construction, not by bug. It cannot be inferred from any local signal:
 * "no inbound messages" is indistinguishable from "nobody messaged us".
 *
 * Also repairs two states Zernio can land in on its own:
 *  - `isActive: false` — Zernio auto-disables a webhook after 10 consecutive delivery
 *    failures, and our own signature check fails CLOSED, so a misconfigured secret
 *    switches the hook off permanently after ten inbound messages.
 *  - a subscription missing events we now branch on, after this list grows.
 */
export async function ensureZernioWebhook(
  supabase: SupabaseLike,
  opts: { secret?: string } = {},
): Promise<{ action: 'created' | 'updated' | 'unchanged'; status: ZernioWebhookStatus }> {
  const url = zernioWebhookUrl();
  const secret = opts.secret || zernioWebhookSecret();
  if (!secret) {
    throw new Error(
      'ZERNIO_WEBHOOK_SECRET is not set. Set it first — registering a webhook without a ' +
      'signing secret would leave the handler rejecting every delivery (it fails closed).',
    );
  }

  const existing = await getZernioWebhookStatus();

  if (!existing.registered) {
    const created = await zernioApi('POST', '/webhooks/settings', {
      name: 'Material KAI',
      url,
      secret,
      events: [...ZERNIO_WEBHOOK_EVENTS],
      isActive: true,
    });
    void created;
    return { action: 'created', status: await getZernioWebhookStatus() };
  }

  const needsRepair = existing.isActive === false || (existing.missingEvents?.length ?? 0) > 0;
  if (needsRepair) {
    await zernioApi('PUT', '/webhooks/settings', {
      _id: existing.webhookId,
      url,
      secret,
      events: [...ZERNIO_WEBHOOK_EVENTS],
      isActive: true,
    });
    return { action: 'updated', status: await getZernioWebhookStatus() };
  }

  return { action: 'unchanged', status: existing };
}

/**
 * Find-or-create exactly one Zernio profile per workspace and cache its id in
 * social_zernio_profiles. Zernio requires a profileId on every connect call;
 * a profile is just a container that holds many connected accounts, so this
 * preserves "multiple accounts per workspace" with clean per-workspace separation.
 *
 * If profile creation hits Zernio's plan ceiling (402/403), we fall back to the
 * account's default profile so connecting still succeeds.
 */
export async function resolveWorkspaceProfile(
  supabase: any,
  workspaceId: string,
): Promise<string> {
  // 1. Cached mapping
  const { data: existing } = await supabase
    .from('social_zernio_profiles')
    .select('zernio_profile_id')
    .eq('workspace_id', workspaceId)
    .maybeSingle();
  if (existing?.zernio_profile_id) return existing.zernio_profile_id;

  const desiredName = `ws:${workspaceId}`;
  let profileId: string | undefined;

  // 2. Reuse a previously-created profile with the same name (idempotent across retries)
  try {
    const list = await zernioApi('GET', '/profiles?includeOverLimit=true');
    const match = (list.profiles || []).find((p: any) => p.name === desiredName);
    if (match?._id) profileId = match._id;
  } catch (_) { /* listing is best-effort */ }

  // 3. Create a fresh profile for this workspace
  if (!profileId) {
    try {
      const created = await zernioApi('POST', '/profiles', {
        name: desiredName,
        description: `Material KAI workspace ${workspaceId}`,
      });
      profileId = created.profile?._id;
    } catch (err) {
      // Plan ceiling / payment gate → fall back to the default profile.
      try {
        const list = await zernioApi('GET', '/profiles?includeOverLimit=true');
        const profiles = (list.profiles || []) as any[];
        profileId = (profiles.find((p) => p.isDefault) || profiles[0])?._id;
      } catch (_) { /* ignore */ }
      if (!profileId) throw err;
    }
  }

  if (!profileId) {
    throw new Error('Could not resolve a Zernio profile for this workspace');
  }

  // 4. Cache the mapping (service-role write)
  await supabase
    .from('social_zernio_profiles')
    .upsert({ workspace_id: workspaceId, zernio_profile_id: profileId }, { onConflict: 'workspace_id' });

  return profileId;
}

// =====================================================
// WhatsApp helpers (Zernio Cloud-API wrapper)
// =====================================================

/**
 * Normalise a phone number to WhatsApp's expected form: digits only, country
 * code included, NO leading "+". Zernio's inbox `participantId` for WhatsApp
 * wants the bare international number.
 */
export function waParticipantId(phone: string): string {
  return (phone || '').replace(/[^\d]/g, '');
}

export interface ZernioSendResult {
  success: boolean;
  messageId?: string;
  conversationId?: string;
  error?: string;
}

/**
 * Send a WhatsApp message via Zernio's inbox.
 *
 * For a cold start (no message from the recipient in the last 24h) WhatsApp
 * REQUIRES an approved template — pass `templateName`/`templateLanguage`
 * (+ ordered `templateParams`). Inside the 24h service window a freeform
 * `message` is allowed.
 *
 * Requires Zernio's Inbox add-on (the /v1/inbox/* endpoints 403 without it).
 */
export async function sendWhatsAppMessage(params: {
  accountId: string;
  to: string;
  message?: string;
  templateName?: string;
  templateLanguage?: string;
  templateParams?: string[];
  /**
   * Meta Direct Send. With `message` and WITHOUT `templateName`, starts a business-initiated
   * conversation using no pre-approved template — Meta matches or auto-creates one
   * asynchronously. UTILITY content only; marketing under this category is rejected. The WABA
   * must be eligible, otherwise the send fails telling you to use an approved template.
   * Mutually exclusive with templateName (templates are categorised at creation).
   */
  category?: 'utility';
  /** Override a media-header template's header asset for THIS send only. */
  headerMedia?: Record<string, unknown>;
}): Promise<ZernioSendResult> {
  try {
    const participantId = waParticipantId(params.to);
    // Cold-start / first-contact path: create the conversation with a template.
    // Zernio upserts into the existing thread if one already exists, so this is
    // safe to call per recipient.
    const body: Record<string, unknown> = { accountId: params.accountId, participantId };
    if (params.templateName) {
      body.templateName = params.templateName;
      if (params.templateLanguage) body.templateLanguage = params.templateLanguage;
      if (params.templateParams?.length) body.templateParams = params.templateParams;
      if (params.headerMedia) body.headerMedia = params.headerMedia;
    } else if (params.category) {
      // Sending both is a 400 from Zernio, so this is an else-branch rather than a second if.
      body.category = params.category;
    }
    if (params.message) body.message = params.message;

    const res = await zernioApi('POST', '/inbox/conversations', body);
    const data = res?.data ?? res;
    return {
      success: true,
      messageId: data?.messageId,
      conversationId: data?.conversationId,
    };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Reply to a comment on one of our posts.
 *
 * `commentId` decides who actually hears it: with one, the reply threads under that comment and
 * notifies its author; without one it is a new TOP-LEVEL comment on the post, which the person
 * who asked will most likely never see. Both are valid API calls and both "succeed", so the
 * distinction cannot be left to chance — inbox-api resolves the target explicitly.
 */
export async function sendSocialCommentReply(params: {
  accountId: string;
  postId: string;
  message: string;
  commentId?: string;
  attachmentUrl?: string;
}): Promise<ZernioSendResult> {
  try {
    const body: Record<string, unknown> = { accountId: params.accountId, message: params.message };
    if (params.commentId) body.commentId = params.commentId;
    if (params.attachmentUrl) body.attachmentUrl = params.attachmentUrl;

    const res = await zernioApi(
      'POST',
      `/inbox/comments/${encodeURIComponent(params.postId)}`,
      body,
    );
    const data = res?.data ?? res;
    return { success: true, messageId: data?.id ?? data?.commentId ?? data?.messageId };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Start or continue a DM on a non-WhatsApp platform (Instagram, Facebook, X, Bluesky, Reddit,
 * Telegram, Slack). Same endpoint as the WhatsApp cold start — Zernio upserts into the existing
 * thread when one exists — but keyed on the platform's own participant id rather than a phone
 * number, and with no template machinery, which is WhatsApp-only.
 */
export async function sendSocialDirectMessage(params: {
  accountId: string;
  participantId: string;
  message: string;
}): Promise<ZernioSendResult> {
  try {
    const res = await zernioApi('POST', '/inbox/conversations', {
      accountId: params.accountId,
      participantId: params.participantId,
      message: params.message,
    });
    const data = res?.data ?? res;
    return { success: true, messageId: data?.messageId, conversationId: data?.conversationId };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Send a freeform reply inside an existing conversation (24h service window).
 * Used by the agent reply surface — not by campaign sends.
 */
export async function sendWhatsAppReply(params: {
  accountId: string;
  conversationId: string;
  message?: string;
  attachmentUrl?: string;
  attachmentType?: 'image' | 'video' | 'audio' | 'file';
}): Promise<ZernioSendResult> {
  try {
    const body: Record<string, unknown> = { accountId: params.accountId };
    if (params.message) body.message = params.message;
    if (params.attachmentUrl) {
      body.attachmentUrl = params.attachmentUrl;
      body.attachmentType = params.attachmentType || 'file';
    }
    const res = await zernioApi(
      'POST',
      `/inbox/conversations/${encodeURIComponent(params.conversationId)}/messages`,
      body,
    );
    const data = res?.data ?? res;
    return { success: true, messageId: data?.messageId };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}
