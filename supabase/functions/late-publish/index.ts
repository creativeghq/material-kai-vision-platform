/**
 * Late.dev Publish Edge Function
 *
 * Publishes or schedules social media posts via Late.dev API.
 * Late.dev handles cross-platform publishing via OAuth-connected accounts.
 *
 * Actions:
 *   publish_now  → publishes immediately
 *   schedule     → schedules for a future datetime (scheduled_at required)
 *
 * No credit cost — uses the workspace's Late.dev subscription.
 */

import { createClient } from '@supabase/supabase-js';
import { corsHeaders } from '../_shared/cors.ts';
import { authenticate } from '../_shared/auth.ts';
import { withApiLogging } from '../_shared/api-logger.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const LATE_API_KEY = () => Deno.env.get('LATE_API_KEY') || '';
const LATE_BASE_URL = 'https://api.late.dev/v1';

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

async function lateApi(method: string, path: string, body?: unknown) {
  const res = await fetch(`${LATE_BASE_URL}${path}`, {
    method,
    headers: {
      'Authorization': `Bearer ${LATE_API_KEY()}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Late.dev ${method} ${path} → ${res.status}: ${text}`);
  }

  return await res.json();
}

Deno.serve(withApiLogging('late-publish', async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  const auth = await authenticate(req);
  if (!auth.user) return jsonResponse({ success: false, error: 'Unauthorized' }, 401);
  const userId = auth.user.id;

  if (req.method !== 'POST') return jsonResponse({ success: false, error: 'Method not allowed' }, 405);

  const body = await req.json();
  const { post_id, social_account_id, action, scheduled_at, workspace_id } = body;

  if (!post_id || !social_account_id || !action) {
    return jsonResponse({ success: false, error: 'post_id, social_account_id, and action are required' }, 400);
  }

  if (action === 'schedule' && !scheduled_at) {
    return jsonResponse({ success: false, error: 'scheduled_at is required for schedule action' }, 400);
  }

  // Fetch post data — scoped to the authenticated user's workspace
  const postQuery = supabase
    .from('social_posts')
    .select('*')
    .eq('id', post_id);
  if (workspace_id) postQuery.eq('workspace_id', workspace_id);
  const { data: post, error: postErr } = await postQuery.single();

  if (postErr || !post) {
    return jsonResponse({ success: false, error: 'Post not found' }, 404);
  }

  // Fetch social account — verify it belongs to the same workspace
  const accountQuery = supabase
    .from('social_accounts')
    .select('late_account_id, platform, handle, workspace_id')
    .eq('id', social_account_id);
  if (workspace_id) accountQuery.eq('workspace_id', workspace_id);
  const { data: account, error: accountErr } = await accountQuery.single();

  if (accountErr || !account) {
    return jsonResponse({ success: false, error: 'Social account not found or not in your workspace' }, 404);
  }

  try {
    // Build Late.dev post payload
    const latePostPayload: Record<string, unknown> = {
      account_id: account.late_account_id,
      platform: account.platform,
      content: {
        text: [post.caption, ...(post.hashtags || [])].filter(Boolean).join('\n\n'),
      },
    };

    if (post.image_urls?.length) {
      latePostPayload.content = {
        ...latePostPayload.content as object,
        media: (post.image_urls as string[]).map((url: string) => ({ url, type: 'image' })),
      };
    }

    if (post.video_url) {
      latePostPayload.content = {
        ...latePostPayload.content as object,
        media: [{ url: post.video_url, type: 'video' }],
      };
    }

    let lateResult: { id?: string; post_id?: string; scheduled_at?: string };

    if (action === 'publish_now') {
      lateResult = await lateApi('POST', '/posts', latePostPayload);

      // Update social_posts
      await supabase.from('social_posts').update({
        status: 'published',
        published_at: new Date().toISOString(),
        social_account_id,
        late_post_id: lateResult.id || lateResult.post_id,
        updated_at: new Date().toISOString(),
      }).eq('id', post_id);

    } else {
      // schedule
      lateResult = await lateApi('POST', '/posts/scheduled', {
        ...latePostPayload,
        scheduled_at,
      });

      await supabase.from('social_posts').update({
        status: 'scheduled',
        scheduled_at,
        social_account_id,
        late_post_id: lateResult.id || lateResult.post_id,
        updated_at: new Date().toISOString(),
      }).eq('id', post_id);
    }

    return jsonResponse({
      success: true,
      action,
      post_id,
      late_post_id: lateResult.id || lateResult.post_id,
      platform: account.platform,
      handle: account.handle,
      scheduled_at: action === 'schedule' ? scheduled_at : undefined,
      published_at: action === 'publish_now' ? new Date().toISOString() : undefined,
    });

  } catch (err) {
    console.error('[late-publish] Error:', err);
    return jsonResponse({ success: false, error: String(err) }, 500);
  }
}));
