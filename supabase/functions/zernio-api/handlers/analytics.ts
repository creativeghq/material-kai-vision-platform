/**
 * Zernio Analytics handler
 *
 * Fetches analytics data from Zernio and syncs to local DB.
 *
 * Actions:
 *   get_post_analytics    → sync metrics for specific posts → social_post_analytics
 *   get_account_insights  → sync account-level insights → social_account_insights
 *   get_best_time         → best posting times for an account/platform
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

export async function handleZernioAnalytics(req: Request, body: any): Promise<Response> {
  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  const auth = await authenticate(req);
  if (!auth.user) return jsonResponse({ success: false, error: 'Unauthorized' }, 401);

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

  // Pentest #250 M12: the check above only runs when workspace_id is passed. Precompute
  // the caller's accessible workspaces so account/post lookups BY ID can't leak another
  // tenant's analytics when workspace_id is omitted. (Secret/admin callers are unbounded.)
  const isSecretCaller = auth.level === 'secret';
  let callerWorkspaceIds: string[] = [];
  if (!isSecretCaller && auth.userId) {
    const { data: mems } = await supabase
      .from('workspace_members')
      .select('workspace_id')
      .eq('user_id', auth.userId)
      .eq('status', 'active');
    callerWorkspaceIds = (mems ?? []).map((m: { workspace_id: string }) => m.workspace_id).filter(Boolean);
  }

  // ── GET BEST TIME ──────────────────────────────────────────────────────────
  if (action === 'get_best_time') {
    if (!platform && !social_account_id) {
      return jsonResponse({ success: false, error: 'platform or social_account_id required' }, 400);
    }

    try {
      let zernioAccountId: string | null = null;

      if (social_account_id) {
        const { data: acct } = await supabase
          .from('social_accounts')
          .select('zernio_account_id, workspace_id')
          .eq('id', social_account_id)
          .single();
        // Pentest #250 M12: bind a by-id account lookup to the caller's workspaces.
        if (acct && !isSecretCaller && !callerWorkspaceIds.includes(acct.workspace_id)) {
          return jsonResponse({ success: false, error: 'Not authorized for this account' }, 403);
        }
        zernioAccountId = acct?.zernio_account_id ?? null;
      } else if (platform && workspace_id) {
        const { data: account } = await supabase
          .from('social_accounts')
          .select('zernio_account_id')
          .eq('workspace_id', workspace_id)
          .eq('platform', platform)
          .eq('is_active', true)
          .limit(1)
          .single();
        zernioAccountId = account?.zernio_account_id ?? null;
      }

      if (!zernioAccountId) {
        return jsonResponse({ success: false, error: 'No connected account found for this platform' }, 404);
      }

      // Zernio: GET /v1/analytics/best-time?accountId= → { slots: [{day_of_week,hour,avg_engagement,post_count}] }
      const result = await zernioApi('GET', `/analytics/best-time?accountId=${encodeURIComponent(zernioAccountId)}`);

      return jsonResponse({ success: true, best_times: result.slots ?? result, platform });

    } catch (err) {
      console.error('[zernio-analytics] get_best_time error:', err);
      return jsonResponse({ success: false, error: String(err) }, 500);
    }
  }

  // ── GET POST ANALYTICS ─────────────────────────────────────────────────────
  if (action === 'get_post_analytics') {
    if (!post_ids?.length && !workspace_id) {
      return jsonResponse({ success: false, error: 'post_ids or workspace_id required' }, 400);
    }

    try {
      let postsQuery = supabase
        .from('social_posts')
        .select('id, zernio_post_id, platform, social_account_id, workspace_id')
        .eq('status', 'published')
        .not('zernio_post_id', 'is', null);

      if (post_ids?.length) {
        postsQuery = postsQuery.in('id', post_ids);
      } else if (workspace_id) {
        postsQuery = postsQuery.eq('workspace_id', workspace_id);
      }

      let { data: posts } = await postsQuery.limit(50);
      // Pentest #250 M12: a by-id post lookup must not expose posts from another tenant.
      if (posts?.length && !isSecretCaller) {
        posts = posts.filter((p: { workspace_id: string }) => callerWorkspaceIds.includes(p.workspace_id));
      }
      if (!posts?.length) return jsonResponse({ success: true, synced: 0, message: 'No published posts with Zernio IDs found' });

      let synced = 0;
      const errors: string[] = [];

      for (const post of posts) {
        try {
          // Zernio: GET /v1/analytics?postId= → AnalyticsSinglePostResponse { analytics: {...} }
          const resp = await zernioApi('GET', `/analytics?postId=${encodeURIComponent(post.zernio_post_id)}`);
          const a = (resp.analytics ?? {}) as {
            impressions?: number; reach?: number; likes?: number; comments?: number;
            shares?: number; saves?: number; clicks?: number; views?: number; engagementRate?: number;
          };

          await supabase.from('social_post_analytics').upsert({
            post_id: post.id,
            workspace_id: post.workspace_id,
            synced_at: new Date().toISOString(),
            impressions: a.impressions ?? 0,
            reach: a.reach ?? 0,
            likes: a.likes ?? 0,
            comments: a.comments ?? 0,
            shares: a.shares ?? 0,
            saves: a.saves ?? 0,
            clicks: a.clicks ?? 0,
            engagement_rate: a.engagementRate ?? 0,
            metadata: { raw: a },
          }, { onConflict: 'post_id' });

          synced++;
        } catch (postErr) {
          errors.push(`Post ${post.id}: ${String(postErr)}`);
        }
      }

      return jsonResponse({ success: true, synced, errors: errors.length ? errors : undefined });

    } catch (err) {
      console.error('[zernio-analytics] get_post_analytics error:', err);
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
        .select('id, zernio_account_id, platform, workspace_id')
        .eq('is_active', true);

      if (social_account_id) {
        accountsQuery = accountsQuery.eq('id', social_account_id);
      } else if (workspace_id) {
        accountsQuery = accountsQuery.eq('workspace_id', workspace_id);
      }

      let { data: accounts } = await accountsQuery;
      // Pentest #250 M12: a by-id account lookup must not expose another tenant's insights.
      if (accounts?.length && !isSecretCaller) {
        accounts = accounts.filter((a: { workspace_id: string }) => callerWorkspaceIds.includes(a.workspace_id));
      }
      if (!accounts?.length) return jsonResponse({ success: true, synced: 0, message: 'No active accounts found' });

      let synced = 0;
      const today = new Date().toISOString().split('T')[0];

      for (const acct of accounts) {
        try {
          // Zernio: GET /v1/accounts/follower-stats?accountIds= → { accounts: [AccountWithFollowerStats] }
          const resp = await zernioApi(
            'GET',
            `/accounts/follower-stats?accountIds=${encodeURIComponent(acct.zernio_account_id)}&granularity=daily`,
          );
          const a = ((resp.accounts || [])[0] ?? {}) as {
            currentFollowers?: number;
            accountStats?: {
              followingCount?: number; mediaCount?: number; videoCount?: number;
              postsCount?: number; tweetCount?: number; pinCount?: number;
            };
          };
          const stats = a.accountStats ?? {};
          const postsCount = stats.mediaCount ?? stats.videoCount ?? stats.postsCount ?? stats.tweetCount ?? stats.pinCount ?? 0;

          await supabase.from('social_account_insights').upsert({
            social_account_id: acct.id,
            workspace_id: acct.workspace_id,
            snapshot_date: today,
            followers_count: a.currentFollowers ?? 0,
            following_count: stats.followingCount ?? 0,
            posts_count: postsCount,
            avg_engagement: 0,
            reach_7d: 0,
            impressions_7d: 0,
            metadata: { raw: a },
          }, { onConflict: 'social_account_id,snapshot_date' });

          await supabase.from('social_accounts').update({
            followers_count: a.currentFollowers ?? 0,
            following_count: stats.followingCount ?? 0,
            last_synced_at: new Date().toISOString(),
          }).eq('id', acct.id);

          synced++;
        } catch (acctErr) {
          console.error(`[zernio-analytics] insights error for account ${acct.id}:`, acctErr);
        }
      }

      return jsonResponse({ success: true, synced });

    } catch (err) {
      console.error('[zernio-analytics] get_account_insights error:', err);
      return jsonResponse({ success: false, error: String(err) }, 500);
    }
  }

  return jsonResponse({ success: false, error: `Unknown action: ${action}` }, 400);
}
