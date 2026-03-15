/**
 * Late.dev Webhook Handler Edge Function
 *
 * Receives incoming webhooks from Late.dev and updates local DB.
 * Validates HMAC-SHA256 signature using LATE_WEBHOOK_SECRET.
 *
 * Supported events:
 *   post.published      → sets social_posts.status = 'published', published_at = now()
 *   post.failed         → sets social_posts.status = 'failed'
 *   account.disconnected → sets social_accounts.is_active = false
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const LATE_WEBHOOK_SECRET = Deno.env.get('LATE_WEBHOOK_SECRET') || '';

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

/** Verify HMAC-SHA256 signature from Late.dev */
async function verifySignature(rawBody: ArrayBuffer, signature: string): Promise<boolean> {
  if (!LATE_WEBHOOK_SECRET) return true; // Skip verification if secret not configured

  try {
    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(LATE_WEBHOOK_SECRET),
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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);

  // Read raw body BEFORE parsing (required for HMAC verification)
  const rawBody = await req.arrayBuffer();

  // Verify signature
  const signature = req.headers.get('X-Late-Signature') || req.headers.get('x-late-signature') || '';
  const isValid = await verifySignature(rawBody, signature);

  if (!isValid) {
    console.warn('[late-webhook] Invalid signature — rejecting');
    return jsonResponse({ error: 'Invalid signature' }, 401);
  }

  let event: { type: string; data: Record<string, unknown> };
  try {
    const text = new TextDecoder().decode(rawBody);
    event = JSON.parse(text);
  } catch {
    return jsonResponse({ error: 'Invalid JSON body' }, 400);
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  const { type, data } = event;

  console.log(`[late-webhook] Event: ${type}`, JSON.stringify(data).substring(0, 200));

  try {
    // ── post.published ──────────────────────────────────────────────
    if (type === 'post.published') {
      const latePostId = data.post_id as string || data.id as string;
      if (latePostId) {
        await supabase
          .from('social_posts')
          .update({
            status: 'published',
            published_at: (data.published_at as string) || new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('late_post_id', latePostId);
      }
    }

    // ── post.failed ─────────────────────────────────────────────────
    else if (type === 'post.failed') {
      const latePostId = data.post_id as string || data.id as string;
      if (latePostId) {
        await supabase
          .from('social_posts')
          .update({
            status: 'failed',
            metadata: { error: data.error || data.reason || 'Unknown error' },
            updated_at: new Date().toISOString(),
          })
          .eq('late_post_id', latePostId);
      }
    }

    // ── account.disconnected ────────────────────────────────────────
    else if (type === 'account.disconnected') {
      const lateAccountId = data.account_id as string || data.id as string;
      if (lateAccountId) {
        await supabase
          .from('social_accounts')
          .update({ is_active: false })
          .eq('late_account_id', lateAccountId);
      }
    }

    // ── post.scheduled ──────────────────────────────────────────────
    else if (type === 'post.scheduled') {
      const latePostId = data.post_id as string || data.id as string;
      if (latePostId) {
        await supabase
          .from('social_posts')
          .update({
            status: 'scheduled',
            scheduled_at: data.scheduled_at as string,
            updated_at: new Date().toISOString(),
          })
          .eq('late_post_id', latePostId);
      }
    }

    else {
      console.log(`[late-webhook] Unhandled event type: ${type}`);
    }

  } catch (err) {
    // Log but always return 200 to Late.dev (prevent retry loops)
    console.error(`[late-webhook] Error handling ${type}:`, err);
  }

  // Always return 200 to acknowledge receipt
  return jsonResponse({ received: true, type });
});
