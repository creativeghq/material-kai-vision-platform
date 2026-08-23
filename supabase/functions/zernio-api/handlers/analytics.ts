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
import { jsonResponse } from '../../_shared/http.ts';
import { corsHeaders } from '../../_shared/cors.ts';
import { authenticate } from '../../_shared/auth.ts';
import { assertEntitled } from '../../_shared/entitlement.ts';
import { zernioApi, ensureZernioSecrets } from '../zernio.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';


export async function handleZernioAnalytics(req: Request, body: any): Promise<Response> {
  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  // env → platform_secrets, before any zernioApi() read.
  await ensureZernioSecrets(supabase);
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

    // Analytics sync hits the Zernio API on the workspace's behalf — paid module (#212).
    // (By-id paths below stay membership-bound via callerWorkspaceIds; the UI always passes
    // workspace_id, so this is the user-facing gate. Secret/cron callers skip it.)
    const ent = await assertEntitled(supabase, workspace_id, 'social-media');
    if (!ent.ok) return ent.response;
  }

  // The check above only runs when workspace_id is passed. Precompute
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

  // ── IMPORT EXTERNAL POSTS ──────────────────────────────────────────────────
  //
  // Analytics only ever covered posts WE published: get_post_analytics reads social_posts where
  // zernio_post_id IS NOT NULL, and a post written in LinkedIn was never in that table. On a
  // freshly connected account that is an empty screen with a refresh button that does nothing,
  // next to an account that plainly has posts.
  //
  // TWO calls, and the order is the whole point. `GET /posts?source=external` reads what Zernio
  // has ALREADY pulled from the platform, which for a new account is nothing — listing first
  // returns an empty array and looks exactly like "this account has no posts".
  // `POST /posts/sync-external` is the one that reaches out to LinkedIn/Instagram and fetches.
  // It is debounced ~15s per account by Zernio, so calling it on every refresh is safe.
  //
  // The sync response also carries per-post `analytics` inline, so an imported post arrives with
  // its engagement already attached instead of waiting for a second pass.
  if (action === 'import_external_posts') {
    if (!workspace_id) return jsonResponse({ success: false, error: 'workspace_id required' }, 400);

    const { data: accounts } = await supabase
      .from('social_accounts')
      .select('id, zernio_account_id, platform, user_id')
      .eq('workspace_id', workspace_id)
      .eq('is_active', true);

    if (!accounts?.length) {
      return jsonResponse({ success: true, imported: 0, accounts: 0, message: 'No connected accounts to import from' });
    }

    let imported = 0;
    let withMetrics = 0;
    const errors: string[] = [];

    for (const acct of accounts as Array<{ id: string; zernio_account_id: string; platform: string; user_id: string }>) {
      if (!acct.zernio_account_id) continue;
      try {
        // 1. Make Zernio go and fetch. Analytics ride along on the posts it returns.
        const fresh = await zernioApi('POST', '/posts/sync-external', { accountId: acct.zernio_account_id });

        // 2. Read back everything Zernio now holds for this account, which is a superset of what
        //    the sync just returned (it answers with recent posts; the store keeps ~12 months).
        const qs = new URLSearchParams({
          source: 'external',
          accountId: acct.zernio_account_id,
          status: 'published',
          limit: '100',
          sortBy: 'created-desc',
        });
        const page = await zernioApi('GET', `/posts?${qs.toString()}`);

        // Merge by Zernio post id, preferring the freshly-synced copy: it is the one carrying
        // analytics. Same id from both calls must not become two rows.
        const merged = new Map<string, Record<string, any>>();
        for (const post of ((page?.posts ?? []) as Array<Record<string, any>>)) {
          const id = String(post._id ?? '');
          if (id) merged.set(id, post);
        }
        for (const post of ((fresh?.posts ?? []) as Array<Record<string, any>>)) {
          const id = String(post._id ?? '');
          if (id) merged.set(id, { ...(merged.get(id) ?? {}), ...post });
        }

        for (const post of merged.values()) {
          const zernioPostId = String(post._id ?? '');
          if (!zernioPostId) continue;

          // `platforms[]` carries the per-network result; take the entry for THIS account so a
          // cross-posted item is attributed to the account it actually went out on.
          const leg = (post.platforms ?? []).find(
            (pl: Record<string, any>) => pl.accountId === acct.zernio_account_id,
          ) ?? {};

          const { data: saved, error } = await supabase
            .from('social_posts')
            .upsert({
              workspace_id,
              // NOT NULL, and the honest answer is whoever authorised the account: an imported
              // post has no author on our side, and stamping the syncing admin would credit them
              // with somebody else's posting history.
              user_id: acct.user_id,
              social_account_id: acct.id,
              platform: leg.platform ?? post.platform ?? acct.platform,
              caption: post.content ?? post.title ?? null,
              status: 'published',
              zernio_post_id: zernioPostId,
              published_at: post.publishedAt ?? post.scheduledFor ?? post.createdAt ?? null,
              metadata: {
                source: 'external',
                platform_post_url: post.platformPostUrl ?? leg.platformPostUrl ?? null,
                imported_at: new Date().toISOString(),
              },
            }, { onConflict: 'workspace_id,zernio_post_id' })
            .select('id')
            .single();

          if (error) {
            errors.push(`${acct.platform} ${zernioPostId}: ${error.message}`);
            continue;
          }
          imported++;

          // Engagement, when the sync supplied it. Same upsert-on-post_id shape the normal
          // analytics pass uses, so the two cannot produce two rows for one post.
          const a = post.analytics as Record<string, number> | undefined;
          if (a && saved?.id) {
            const { error: mErr } = await supabase.from('social_post_analytics').upsert({
              post_id: saved.id,
              workspace_id,
              synced_at: new Date().toISOString(),
              impressions: a.impressions ?? 0,
              reach: a.reach ?? 0,
              likes: a.likes ?? 0,
              comments: a.comments ?? 0,
              shares: a.shares ?? 0,
              saves: a.saves ?? 0,
              clicks: a.clicks ?? 0,
              engagement_rate: a.engagementRate ?? 0,
              // `views` has no column and is not the same thing as impressions — keep it rather
              // than folding it into a field that means something else.
              metadata: { raw: a, source: 'external_sync' },
            }, { onConflict: 'post_id' });
            if (mErr) errors.push(`${acct.platform} ${zernioPostId} metrics: ${mErr.message}`);
            else withMetrics++;
          }
        }
      } catch (err) {
        // One account failing must not abandon the others — a LinkedIn token expiring should not
        // cost you the Instagram history in the same sweep.
        errors.push(`${acct.platform}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    return jsonResponse({
      success: true,
      imported,
      with_metrics: withMetrics,
      accounts: accounts.length,
      errors: errors.length ? errors : undefined,
    });
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
        // Bind a by-id account lookup to the caller's workspaces.
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
      // A by-id post lookup must not expose posts from another tenant.
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

          // `synced++` below counts this as done, so a discarded result meant the caller was
          // told analytics synced when nothing landed. The per-account catch logs it (#347).
          const { error: metricsErr } = await supabase.from('social_post_analytics').upsert({
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
          if (metricsErr) throw metricsErr;

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
      // A by-id account lookup must not expose another tenant's insights.
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

          // Same reason as the posts loop above: `synced++` counts this account as done.
          const { error: acctErr2 } = await supabase.from('social_accounts').update({
            followers_count: a.currentFollowers ?? 0,
            following_count: stats.followingCount ?? 0,
            last_synced_at: new Date().toISOString(),
          }).eq('id', acct.id);
          if (acctErr2) throw acctErr2;

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
