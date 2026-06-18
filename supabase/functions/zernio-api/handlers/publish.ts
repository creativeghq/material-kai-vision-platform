/**
 * Zernio Publish handler
 *
 * Publishes or schedules social media posts via the Zernio API.
 * Zernio handles cross-platform publishing via OAuth-connected accounts.
 *
 * Actions:
 *   publish_now  → publishes immediately (publishNow: true)
 *   schedule     → schedules for a future datetime (scheduledFor, scheduled_at required)
 *
 * No credit cost — uses the workspace's Zernio subscription.
 */

import { createClient } from '@supabase/supabase-js';
import { corsHeaders } from '../../_shared/cors.ts';
import { authenticate } from '../../_shared/auth.ts';
import { zernioApi } from '../zernio.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

export async function handleZernioPublish(req: Request, body: any): Promise<Response> {
  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  const auth = await authenticate(req);
  if (!auth.user) return jsonResponse({ success: false, error: 'Unauthorized' }, 401);

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
    .select('zernio_account_id, platform, handle, workspace_id')
    .eq('id', social_account_id);
  if (workspace_id) accountQuery.eq('workspace_id', workspace_id);
  const { data: account, error: accountErr } = await accountQuery.single();

  if (accountErr || !account) {
    return jsonResponse({ success: false, error: 'Social account not found or not in your workspace' }, 404);
  }

  try {
    // Build Zernio createPost payload (POST /v1/posts).
    const text = [post.caption, ...(post.hashtags || [])].filter(Boolean).join('\n\n');

    const mediaItems: Array<{ type: string; url: string }> = [];
    if (post.image_urls?.length) {
      for (const url of post.image_urls as string[]) mediaItems.push({ type: 'image', url });
    }
    if (post.video_url) {
      mediaItems.push({ type: 'video', url: post.video_url });
    }

    const payload: Record<string, unknown> = {
      content: text,
      platforms: [{ platform: account.platform, accountId: account.zernio_account_id }],
    };
    if (mediaItems.length) payload.mediaItems = mediaItems;

    if (action === 'publish_now') {
      payload.publishNow = true;
    } else {
      payload.scheduledFor = scheduled_at;
    }

    // Zernio: POST /v1/posts → { message, post: Post }
    const result = await zernioApi('POST', '/posts', payload);
    const zernioPost = result.post ?? result;
    const zernioPostId: string | undefined = zernioPost?._id;
    const platformTarget = (zernioPost?.platforms || [])[0] ?? {};
    const publishedUrl: string | undefined = platformTarget.platformPostUrl;

    // The post is already live/scheduled on Zernio (POST /posts succeeded above).
    // Persist the local status, but surface a failure to update so the caller knows
    // the local record is out of sync rather than getting a blind success:true.
    const { error: statusUpdateErr } = action === 'publish_now'
      ? await supabase.from('social_posts').update({
          status: 'published',
          published_at: new Date().toISOString(),
          social_account_id,
          zernio_post_id: zernioPostId,
          updated_at: new Date().toISOString(),
        }).eq('id', post_id)
      : await supabase.from('social_posts').update({
          status: 'scheduled',
          scheduled_at,
          social_account_id,
          zernio_post_id: zernioPostId,
          updated_at: new Date().toISOString(),
        }).eq('id', post_id);

    if (statusUpdateErr) {
      console.error('[zernio-publish] Post published to Zernio but local status update failed:', statusUpdateErr);
    }

    return jsonResponse({
      success: !statusUpdateErr,
      action,
      post_id,
      zernio_post_id: zernioPostId,
      platform: account.platform,
      handle: account.handle,
      published_url: publishedUrl,
      scheduled_at: action === 'schedule' ? scheduled_at : undefined,
      published_at: action === 'publish_now' ? new Date().toISOString() : undefined,
      ...(statusUpdateErr
        ? { warning: 'Published to Zernio but failed to update local post status', status_update_error: statusUpdateErr.message }
        : {}),
    }, statusUpdateErr ? 207 : 200);

  } catch (err) {
    console.error('[zernio-publish] Error:', err);
    try {
      await supabase.from('social_posts').update({
        status: 'failed',
        metadata: { error: String(err), failed_at: new Date().toISOString() },
      }).eq('id', post_id);
    } catch (updateErr) {
      console.error('[zernio-publish] Failed to mark post as failed:', updateErr);
    }
    return jsonResponse({ success: false, error: String(err) }, 500);
  }
}
