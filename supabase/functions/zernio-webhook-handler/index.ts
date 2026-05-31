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
 */

import { createClient } from '@supabase/supabase-js';
import { corsHeaders } from '../_shared/cors.ts';
import { bootstrapForFunction } from '../_shared/secrets-bootstrap.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const webhookSecret = () => Deno.env.get('ZERNIO_WEBHOOK_SECRET') || Deno.env.get('LATE_WEBHOOK_SECRET') || '';

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
  const { event, post, account } = payload;

  console.log(`[zernio-webhook] Event: ${event}`, JSON.stringify(payload).substring(0, 200));

  try {
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
