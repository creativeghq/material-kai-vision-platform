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
  if (resolvedApiKey !== null) return;
  const [api, legacyApi, hook, legacyHook] = await Promise.all([
    resolveSecret(supabase, 'ZERNIO_API_KEY'),
    resolveSecret(supabase, 'LATE_API_KEY'),
    resolveSecret(supabase, 'ZERNIO_WEBHOOK_SECRET'),
    resolveSecret(supabase, 'LATE_WEBHOOK_SECRET'),
  ]);
  resolvedApiKey = api.value || legacyApi.value || '';
  resolvedWebhookSecret = hook.value || legacyHook.value || '';
}

/** Reset the worker cache — for tests, and after an admin saves a new key. */
export function resetZernioSecrets(): void {
  resolvedApiKey = null;
  resolvedWebhookSecret = null;
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
