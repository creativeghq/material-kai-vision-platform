/**
 * Notification Dispatcher Edge Function
 * Handles push notifications and webhook delivery
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from '@supabase/supabase-js';
import { crypto } from 'https://deno.land/std@0.168.0/crypto/mod.ts';
// Deno-native Web Push (RFC 8291 payload encryption + RFC 8292 VAPID). Uses only
// SubtleCrypto primitives — no Node polyfills — so it runs on the edge runtime.
import {
  ApplicationServer,
  importVapidKeys,
  PushMessageError,
} from 'jsr:@negrel/webpush@^0.5.0';
import { decodeBase64Url, encodeBase64Url } from 'jsr:@std/encoding@^1/base64url';
import { corsHeaders } from '../_shared/cors.ts';
import { authenticate, isAdminAccess } from '../_shared/auth.ts';
import { bootstrapForFunction } from '../_shared/secrets-bootstrap.ts';
import { withApiLogging, HttpError } from '../_shared/api-logger.ts';

// =====================================================
// TYPES
// =====================================================
interface PushSubscription {
  endpoint: string;
  p256dh_key: string;
  auth_key: string;
}

interface WebhookEndpoint {
  id: string;
  url: string;
  secret?: string;
  headers: Record<string, string>;
  retry_config: {
    max_retries: number;
    retry_delay_seconds: number;
  };
}

// =====================================================
// PUSH NOTIFICATION HANDLER
// =====================================================

/**
 * The platform stores the VAPID keys the way `web-push generate-vapid-keys` /
 * vapidkeys.com emit them: raw base64url. The public key is the 65-byte
 * uncompressed P-256 point (`0x04 || X(32) || Y(32)`, rendered `BN…`) — the same
 * value the browser passes as `applicationServerKey`; the private key is the raw
 * 32-byte scalar. `@negrel/webpush.importVapidKeys` wants JWK, so convert here.
 */
function rawVapidKeysToJwk(
  publicKeyB64Url: string,
  privateKeyB64Url: string,
): { publicKey: JsonWebKey; privateKey: JsonWebKey } {
  const pub = decodeBase64Url(publicKeyB64Url);
  if (pub.length !== 65 || pub[0] !== 0x04) {
    throw new Error(
      'VAPID_PUBLIC_KEY is not a 65-byte uncompressed P-256 point (expected base64url of 0x04||X||Y)',
    );
  }
  const x = encodeBase64Url(pub.slice(1, 33));
  const y = encodeBase64Url(pub.slice(33, 65));
  // Re-encode the scalar so stray padding / standard-base64 input normalizes.
  const d = encodeBase64Url(decodeBase64Url(privateKeyB64Url));

  return {
    publicKey: { kty: 'EC', crv: 'P-256', x, y, ext: true },
    privateKey: { kty: 'EC', crv: 'P-256', x, y, d, ext: true },
  };
}

// One ApplicationServer per worker, rebuilt only if the key material / subject
// changes (e.g. a rotated key picked up by the secrets bootstrap).
let _appServerPromise: Promise<ApplicationServer> | null = null;
let _appServerFingerprint = '';

async function getApplicationServer(
  publicKey: string,
  privateKey: string,
  subject: string,
): Promise<ApplicationServer> {
  const fingerprint = `${publicKey}::${subject}`;
  if (!_appServerPromise || _appServerFingerprint !== fingerprint) {
    _appServerFingerprint = fingerprint;
    _appServerPromise = (async () => {
      const vapidKeys = await importVapidKeys(
        rawVapidKeysToJwk(publicKey, privateKey),
        { extractable: false },
      );
      return await ApplicationServer.new({
        contactInformation: subject,
        vapidKeys,
      });
    })().catch((err) => {
      // Don't cache a failed build — next call retries.
      _appServerPromise = null;
      throw err;
    });
  }
  return _appServerPromise;
}

async function sendPushNotifications(
  subscriptions: PushSubscription[],
  notification: {
    title: string;
    body: string;
    data?: any;
    icon?: string;
    badge?: string;
  }
): Promise<{ success: number; failed: number; skipped?: number; reason?: string; results: any[] }> {
  const vapidPublicKey = Deno.env.get('VAPID_PUBLIC_KEY') || '';
  const vapidPrivateKey = Deno.env.get('VAPID_PRIVATE_KEY') || '';
  const vapidSubject = Deno.env.get('VAPID_SUBJECT') || 'mailto:admin@materialkai.com';

  // Not configured → clean skip, don't crash the whole dispatch.
  if (!vapidPublicKey || !vapidPrivateKey) {
    console.warn('VAPID keys not configured — skipping push send');
    return {
      success: 0,
      failed: 0,
      skipped: subscriptions.length,
      reason: 'vapid_not_configured',
      results: [],
    };
  }

  const appServer = await getApplicationServer(vapidPublicKey, vapidPrivateKey, vapidSubject);

  // RFC 8291 encrypts this JSON blob as the message plaintext. Keep the wire
  // shape the (future) service-worker `push` handler expects, unchanged.
  const payload = JSON.stringify({
    notification: {
      title: notification.title,
      body: notification.body,
      icon: notification.icon,
      badge: notification.badge,
      data: notification.data,
    },
  });

  // Endpoints the push service reports as permanently gone (404/410) — the
  // subscription no longer exists, so deactivate the row after the fan-out.
  const deadEndpoints: string[] = [];

  const results = await Promise.allSettled(
    subscriptions.map(async (sub) => {
      try {
        // Map the DB row shape (endpoint, p256dh_key, auth_key) onto the
        // library's PushSubscription shape. The library forges the VAPID JWT
        // Authorization header + performs ECDH/HKDF/AES-128-GCM (aes128gcm)
        // encryption and POSTs to sub.endpoint with the correct headers.
        const subscriber = appServer.subscribe({
          endpoint: sub.endpoint,
          keys: { p256dh: sub.p256dh_key, auth: sub.auth_key },
        });

        await subscriber.pushTextMessage(payload, { ttl: 86400 }); // 24h

        return { success: true, endpoint: sub.endpoint };
      } catch (error) {
        const status = error instanceof PushMessageError ? error.response.status : undefined;
        const gone = status === 404 || status === 410;
        if (gone) deadEndpoints.push(sub.endpoint);

        const message = error instanceof PushMessageError
          ? error.toString()
          : (error instanceof Error ? error.message : String(error));
        console.error('Push notification failed:', message);

        return { success: false, endpoint: sub.endpoint, error: message, gone };
      }
    })
  );

  // Best-effort dead-subscription cleanup: flip is_active=false so flow-engine
  // (which only selects is_active=true rows) stops resurfacing them. Match on
  // endpoint since the caller passes only endpoint/keys, not the row id.
  if (deadEndpoints.length > 0) {
    try {
      const supabase = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
      );
      await supabase
        .from('push_subscriptions')
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .in('endpoint', deadEndpoints);
    } catch (cleanupError) {
      console.error('Failed to deactivate dead push subscriptions:', cleanupError);
    }
  }

  const successCount = results.filter(r => r.status === 'fulfilled' && r.value.success).length;
  const failedCount = results.length - successCount;

  return {
    success: successCount,
    failed: failedCount,
    results: results.map(r => r.status === 'fulfilled' ? r.value : { success: false, error: r.reason })
  };
}

// =====================================================
// WEBHOOK HANDLER
// =====================================================
async function sendWebhooks(
  webhooks: WebhookEndpoint[],
  payload: any
): Promise<{ success: number; failed: number; results: any[] }> {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  );

  const results = await Promise.allSettled(
    webhooks.map(async (webhook) => {
      let attempt = 0;
      const maxRetries = webhook.retry_config?.max_retries || 3;
      const retryDelay = (webhook.retry_config?.retry_delay_seconds || 60) * 1000;

      while (attempt <= maxRetries) {
        try {
          // Generate HMAC signature if secret is provided
          let signature: string | undefined;
          if (webhook.secret) {
            const encoder = new TextEncoder();
            const key = await crypto.subtle.importKey(
              'raw',
              encoder.encode(webhook.secret),
              { name: 'HMAC', hash: 'SHA-256' },
              false,
              ['sign']
            );
            const signatureBuffer = await crypto.subtle.sign(
              'HMAC',
              key,
              encoder.encode(JSON.stringify(payload))
            );
            signature = Array.from(new Uint8Array(signatureBuffer))
              .map(b => b.toString(16).padStart(2, '0'))
              .join('');
          }

          // Send webhook
          const headers: Record<string, string> = {
            'Content-Type': 'application/json',
            'User-Agent': 'MaterialKAI-Webhook/1.0',
            ...webhook.headers,
          };

          if (signature) {
            headers['X-Webhook-Signature'] = `sha256=${signature}`;
          }

          const whController = new AbortController();
          const whTimeout = setTimeout(() => whController.abort(), 15_000);
          const response = await fetch(webhook.url, {
            method: 'POST',
            headers,
            body: JSON.stringify(payload),
            signal: whController.signal,
          }).finally(() => clearTimeout(whTimeout));

          if (!response.ok) {
            throw new Error(`Webhook failed: ${response.status} ${response.statusText}`);
          }

          // Update webhook success
          await supabase
            .from('webhook_endpoints')
            .update({
              last_success_at: new Date().toISOString(),
              failure_count: 0,
            })
            .eq('id', webhook.id);

          return {
            success: true,
            webhook_id: webhook.id,
            url: webhook.url,
            status: response.status,
          };
        } catch (error) {
          attempt++;
          if (attempt > maxRetries) {
            // Read the current failure_count so backoff actually accumulates — the
            // passed-in `webhook` object never carries this column, so `webhook.failure_count
            // + 1 || 1` always wrote 1 (NaN || 1).
            const { data: current } = await supabase
              .from('webhook_endpoints')
              .select('failure_count')
              .eq('id', webhook.id)
              .maybeSingle();
            const nextFailureCount = (Number(current?.failure_count) || 0) + 1;

            // Update webhook failure
            await supabase
              .from('webhook_endpoints')
              .update({
                last_failure_at: new Date().toISOString(),
                failure_count: nextFailureCount,
              })
              .eq('id', webhook.id);

            throw error;
          }
          // Wait before retry
          await new Promise(resolve => setTimeout(resolve, retryDelay * attempt));
        }
      }
    })
  );

  const successCount = results.filter(r => r.status === 'fulfilled').length;
  const failedCount = results.length - successCount;

  return {
    success: successCount,
    failed: failedCount,
    results: results.map(r => r.status === 'fulfilled' ? r.value : { success: false, error: r.reason })
  };
}

// =====================================================
// MAIN HANDLER
// =====================================================
serve(withApiLogging('notification-dispatcher', async (req) => {
  await bootstrapForFunction();
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const auth = await authenticate(req);
  if (!auth.success) {
    return new Response(JSON.stringify({ error: auth.error ?? 'Unauthorized' }),
      { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  try {
    let parsed: any;
    try {
      parsed = await req.json();
    } catch {
      throw new HttpError(400, 'Invalid JSON body');
    }
    const { action, ...body } = parsed;

    switch (action) {
      case 'send-push': {
        // send-push/send-webhook POST to caller-supplied endpoints
        // (SSRF) — restrict to trusted backend (service-role/admin-secret). The only
        // caller is flow-engine (service-role). get-vapid-key stays open for the frontend.
        if (!isAdminAccess(auth)) throw new HttpError(403, 'Forbidden');
        const { subscriptions, notification } = body;
        if (!Array.isArray(subscriptions)) {
          throw new HttpError(400, 'subscriptions must be an array');
        }
        const result = await sendPushNotifications(subscriptions, notification);
        return new Response(JSON.stringify(result), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      case 'send-webhook': {
        if (!isAdminAccess(auth)) throw new HttpError(403, 'Forbidden');
        const { webhooks, payload } = body;
        if (!Array.isArray(webhooks)) {
          throw new HttpError(400, 'webhooks must be an array');
        }
        const result = await sendWebhooks(webhooks, payload);
        return new Response(JSON.stringify(result), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      case 'get-vapid-key': {
        const vapidPublicKey = () => Deno.env.get('VAPID_PUBLIC_KEY') || '';
        if (!vapidPublicKey()) {
          return new Response(
            JSON.stringify({ configured: false }),
            {
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            }
          );
        }
        return new Response(
          JSON.stringify({ configured: true, publicKey: vapidPublicKey() }),
          {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        );
      }

      default:
        return new Response(
          JSON.stringify({ error: 'Invalid action' }),
          {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        );
    }
  } catch (error) {
    // Let HttpError (client errors) carry its own status and skip Sentry via the wrapper.
    if (error instanceof HttpError) throw error;
    console.error('Error in notification-dispatcher:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
}));

