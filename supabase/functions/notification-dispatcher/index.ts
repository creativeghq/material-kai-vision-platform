/**
 * Notification Dispatcher Edge Function
 * Handles push notifications and webhook delivery
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from '@supabase/supabase-js';
import { crypto } from 'https://deno.land/std@0.168.0/crypto/mod.ts';
import { corsHeaders } from '../_shared/cors.ts';
import { authenticate } from '../_shared/auth.ts';
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
async function sendPushNotifications(
  subscriptions: PushSubscription[],
  notification: {
    title: string;
    body: string;
    data?: any;
    icon?: string;
    badge?: string;
  }
): Promise<{ success: number; failed: number; results: any[] }> {
  const vapidPublicKey = () => Deno.env.get('VAPID_PUBLIC_KEY') || '';
  const vapidPrivateKey = () => Deno.env.get('VAPID_PRIVATE_KEY') || '';
  const vapidSubject = () => Deno.env.get('VAPID_SUBJECT') || 'mailto:admin@materialkai.com';

  if (!vapidPublicKey() || !vapidPrivateKey()) {
    throw new Error('VAPID keys not configured');
  }

  const results = await Promise.allSettled(
    subscriptions.map(async (sub) => {
      try {
        // Use web-push library (would need to be imported)
        // For now, we'll use fetch directly to the push service
        const pushController = new AbortController();
        const pushTimeout = setTimeout(() => pushController.abort(), 15_000);
        const response = await fetch(sub.endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'TTL': '86400', // 24 hours
          },
          body: JSON.stringify({
            notification: {
              title: notification.title,
              body: notification.body,
              icon: notification.icon,
              badge: notification.badge,
              data: notification.data,
            },
          }),
          signal: pushController.signal,
        }).finally(() => clearTimeout(pushTimeout));

        if (!response.ok) {
          throw new Error(`Push failed: ${response.status} ${response.statusText}`);
        }

        return { success: true, endpoint: sub.endpoint };
      } catch (error) {
        console.error('Push notification failed:', error);
        return { success: false, endpoint: sub.endpoint, error: error.message };
      }
    })
  );

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

