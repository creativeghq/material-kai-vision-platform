/**
 * Late.dev Analytics Edge Function
 *
 * Fetches analytics data from Late.dev and syncs to local DB.
 *
 * Actions:
 *   get_post_analytics    → sync metrics for specific posts → social_post_analytics
 *   get_account_insights  → sync account-level insights → social_account_insights
 *   get_best_time         → best posting times for a platform
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

async function lateApi(method: string, path: string): Promise<unknown> {
  const res = await fetch(`${LATE_BASE_URL}${path}`, {
    method,
    headers: { 'Authorization': `Bearer ${LATE_API_KEY()}` },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Late.dev ${method} ${path} → ${res.status}: ${text}`);
  }

  return await res.json();
}

Deno.serve(withApiLogging('late-analytics', async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  const auth = await authenticate(req);
  if (!auth.user) return jsonResponse({ success: false, error: 'Unauthorized' }, 401);

  if (req.method !== 'POST') return jsonResponse({ success: false, error: 'Method not allowed' }, 405);

  const body = await req.json();
  const { action, workspace_id, social_account_id, post_ids, platform } = body;

  if (workspace_id && auth.userId) {
    const { data: membership } = await supabase
      .from('workspace_members')
      .select('id')
      .eq('user_id', auth.userId)
      .eq('workspace_id', workspace_id)
      .eq('status', 'active')
      .maybeSingle();
    if (!membership) return jsonResponse({ success: false, error: 'Not a member of this workspace' }, 403);
  }

  // ── GET BEST TIME ──────────────────────────────────────────────────────────
  if (action === 'get_best_time') {
    if (!platform && !social_account_id) {
      return jsonResponse({ success: false, error: 'platform or social_account_id required' }, 400);
    }

    try {
      let accountId = social_account_id;

      // If no account_id, find the first active account for this platform
      if (!accountId && platform && workspace_id) {
        const { data: account } = await supabase
          .from('social_accounts')
          .select('late_account_id')
          .eq('workspace_id', workspace_id)
          .eq('platform', platform)
          .eq('is_active', true)
          .limit(1)
          .single();
        if (account) {
          const { data: fullAccount } = await supabase
            .from('social_accounts')
            .select('late_account_id')
            .eq('id', social_account_id || '')
            .single();
          accountId = fullAccount?.late_account_id || account.late_account_id;
        }
      } else if (accountId) {
        const { data: acct } = await supabase
          .from('social_accounts')
          .select('late_account_id')
          .eq('id', accountId)
          .single();
        accountId = acct?.late_account_id;
      }

      if (!accountId) {
        return jsonResponse({ success: false, error: 'No connected account found for this platform' }, 404);
      }

      const bestTimes = await lateApi('GET', `/analytics/best-times?account_id=${accountId}`);

      return jsonResponse({ success: true, best_times: bestTimes, platform });

    } catch (err) {
      console.error('[late-analytics] get_best_time error:', err);
      return jsonResponse({ success: false, error: String(err) }, 500);
    }
  }

  // ── GET POST ANALYTICS ─────────────────────────────────────────────────────
  if (action === 'get_post_analytics') {
    if (!post_ids?.length && !workspace_id) {
      return jsonResponse({ success: false, error: 'post_ids or workspace_id required' }, 400);
    }

    try {
      // Get posts with their late_post_id
      let postsQuery = supabase
        .from('social_posts')
        .select('id, late_post_id, platform, social_account_id, workspace_id')
        .eq('status', 'published')
        .not('late_post_id', 'is', null);

      if (post_ids?.length) {
        postsQuery = postsQuery.in('id', post_ids);
      } else if (workspace_id) {
        postsQuery = postsQuery.eq('workspace_id', workspace_id);
      }

      const { data: posts } = await postsQuery.limit(50);
      if (!posts?.length) return jsonResponse({ success: true, synced: 0, message: 'No published posts with Late.dev IDs found' });

      // Fetch analytics for each post from Late.dev
      let synced = 0;
      const errors: string[] = [];

      for (const post of posts) {
        try {
          const analytics = await lateApi('GET', `/posts/${post.late_post_id}/analytics`) as {
            impressions?: number; reach?: number; likes?: number; comments?: number;
            shares?: number; saves?: number; clicks?: number; engagement_rate?: number;
          };

          await supabase.from('social_post_analytics').upsert({
            post_id: post.id,
            workspace_id: post.workspace_id,
            synced_at: new Date().toISOString(),
            impressions: analytics.impressions ?? 0,
            reach: analytics.reach ?? 0,
            likes: analytics.likes ?? 0,
            comments: analytics.comments ?? 0,
            shares: analytics.shares ?? 0,
            saves: analytics.saves ?? 0,
            clicks: analytics.clicks ?? 0,
            engagement_rate: analytics.engagement_rate ?? 0,
            metadata: { raw: analytics },
          }, { onConflict: 'post_id' });

          synced++;
        } catch (postErr) {
          errors.push(`Post ${post.id}: ${String(postErr)}`);
        }
      }

      return jsonResponse({ success: true, synced, errors: errors.length ? errors : undefined });

    } catch (err) {
      console.error('[late-analytics] get_post_analytics error:', err);
      return jsonResponse({ success: false, error: String(err) }, 500);
    }
  }

  // ── GET ACCOUNT INSIGHTS ───────────────────────────────────────────────────
  if (action === 'get_account_insights') {
    if (!social_account_id && !workspace_id) {
      return jsonResponse({ success: false, error: 'social_account_id or workspace_id required' }, 400);
    }

    try {
      let accountsQuery = supabase
        .from('social_accounts')
        .select('id, late_account_id, platform, workspace_id')
        .eq('is_active', true);

      if (social_account_id) {
        accountsQuery = accountsQuery.eq('id', social_account_id);
      } else if (workspace_id) {
        accountsQuery = accountsQuery.eq('workspace_id', workspace_id);
      }

      const { data: accounts } = await accountsQuery;
      if (!accounts?.length) return jsonResponse({ success: true, synced: 0, message: 'No active accounts found' });

      let synced = 0;
      const today = new Date().toISOString().split('T')[0];

      for (const acct of accounts) {
        try {
          const insights = await lateApi('GET', `/accounts/${acct.late_account_id}/insights`) as {
            followers_count?: number; following_count?: number; media_count?: number;
            avg_engagement_rate?: number; reach_7d?: number; impressions_7d?: number;
          };

          // Upsert today's snapshot
          await supabase.from('social_account_insights').upsert({
            social_account_id: acct.id,
            workspace_id: acct.workspace_id,
            snapshot_date: today,
            followers_count: insights.followers_count ?? 0,
            following_count: insights.following_count ?? 0,
            posts_count: insights.media_count ?? 0,
            avg_engagement: insights.avg_engagement_rate ?? 0,
            reach_7d: insights.reach_7d ?? 0,
            impressions_7d: insights.impressions_7d ?? 0,
            metadata: { raw: insights },
          }, { onConflict: 'social_account_id,snapshot_date' });

          // Update social_accounts.followers_count
          await supabase.from('social_accounts').update({
            followers_count: insights.followers_count ?? 0,
            following_count: insights.following_count ?? 0,
            last_synced_at: new Date().toISOString(),
          }).eq('id', acct.id);

          synced++;
        } catch (acctErr) {
          console.error(`[late-analytics] insights error for account ${acct.id}:`, acctErr);
        }
      }

      return jsonResponse({ success: true, synced });

    } catch (err) {
      console.error('[late-analytics] get_account_insights error:', err);
      return jsonResponse({ success: false, error: String(err) }, 500);
    }
  }

  return jsonResponse({ success: false, error: `Unknown action: ${action}` }, 400);
}));
