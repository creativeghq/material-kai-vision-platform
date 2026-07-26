/**
 * Background Agent: Social Analytics Sync
 *
 * Syncs post-level analytics from Zernio for all published social_posts
 * that haven't been synced in the last 2 hours.
 *
 * Runs every 2 hours via pg_cron.
 * Processes posts in batches of 20 to avoid Zernio rate limits.
 *
 * Config params (background_agents.config):
 *   batch_size         number   Posts per run (default 20, max 50)
 *   min_age_hours      number   Only sync posts published at least N hours ago (default 1)
 *   stale_after_hours  number   Re-sync if last synced > N hours ago (default 2)
 */

import type { AgentRunner, AgentRunContext, AgentRunResult } from './types.ts';

const ZERNIO_BASE_URL = 'https://zernio.com/api/v1';
const zernioKey = () => Deno.env.get('ZERNIO_API_KEY') || Deno.env.get('LATE_API_KEY') || '';

async function fetchZernioAnalytics(zernioPostId: string): Promise<{
  impressions?: number; reach?: number; likes?: number; comments?: number;
  shares?: number; saves?: number; clicks?: number; engagement_rate?: number;
} | null> {
  try {
    // Zernio: GET /v1/analytics?postId= → AnalyticsSinglePostResponse { analytics: {...camelCase} }
    const res = await fetch(`${ZERNIO_BASE_URL}/analytics?postId=${encodeURIComponent(zernioPostId)}`, {
      headers: { 'Authorization': `Bearer ${zernioKey()}` },
    });
    if (!res.ok) return null;
    const data = await res.json();
    const a = data.analytics ?? {};
    return {
      impressions: a.impressions, reach: a.reach, likes: a.likes, comments: a.comments,
      shares: a.shares, saves: a.saves, clicks: a.clicks, engagement_rate: a.engagementRate,
    };
  } catch {
    return null;
  }
}

export class SocialAnalyticsSyncAgent implements AgentRunner {
  readonly agentType    = 'social-analytics-sync';
  readonly name         = 'Social Analytics Sync';
  readonly description  = 'Syncs post performance metrics from Zernio every 2 hours';
  readonly defaultTools = [];
  readonly defaultModel = 'claude-haiku-4-5';

  async run(ctx: AgentRunContext): Promise<AgentRunResult> {
    const { supabase, agentConfig, input, log, heartbeat } = ctx;

    const cfg = { ...agentConfig.config, ...input } as Record<string, unknown>;
    const batchSize      = Math.min(Number(cfg.batch_size       ?? 20), 50);
    const minAgeHours    = Number(cfg.min_age_hours    ?? 1);
    const staleAfterHours = Number(cfg.stale_after_hours ?? 2);

    await log('info', 'Starting social analytics sync', { batchSize, minAgeHours, staleAfterHours });

    // Find published posts with a Zernio ID that haven't been synced recently
    const staleThreshold = new Date(Date.now() - staleAfterHours * 3600000).toISOString();
    const minPublishedAt = new Date(Date.now() - minAgeHours * 3600000).toISOString();

    const { data: posts, error: fetchErr } = await supabase
      .from('social_posts')
      .select('id, zernio_post_id, workspace_id, platform, metadata')
      .eq('status', 'published')
      .not('zernio_post_id', 'is', null)
      .lte('published_at', minPublishedAt) // at least N hours old
      // NB: the JSON key must NOT be single-quoted here — `metadata->>'last_analytics_sync'` makes
      // PostgREST treat the quoted token as a literal key that never exists, so `.is.null` matched
      // EVERY published post and the stale-after gate was inert (re-pulling the whole set each tick).
      .or(`metadata->>last_analytics_sync.is.null,metadata->>last_analytics_sync.lte.${staleThreshold}`)
      .order('published_at', { ascending: true })
      .limit(batchSize);

    if (fetchErr) {
      await log('error', 'Failed to fetch posts', { error: fetchErr.message });
      return { success: false, output: { error: fetchErr.message }, inputTokens: 0, outputTokens: 0, creditsDebited: 0 };
    }

    if (!posts?.length) {
      await log('info', 'No posts need analytics sync');
      return { success: true, output: { synced: 0, message: 'No posts to sync' }, inputTokens: 0, outputTokens: 0, creditsDebited: 0 };
    }

    await log('info', `Found ${posts.length} posts to sync`);

    let synced = 0;
    let failed = 0;

    for (const post of posts) {
      await heartbeat();

      if (!post.zernio_post_id) continue;

      const analytics = await fetchZernioAnalytics(post.zernio_post_id);

      if (!analytics) {
        await log('warn', `Failed to fetch analytics for post ${post.id}`);
        failed++;
        continue;
      }

      // Upsert analytics row
      const { error: upsertErr } = await supabase
        .from('social_post_analytics')
        .upsert({
          post_id:         post.id,
          workspace_id:    post.workspace_id,
          synced_at:       new Date().toISOString(),
          impressions:     analytics.impressions     ?? 0,
          reach:           analytics.reach           ?? 0,
          likes:           analytics.likes           ?? 0,
          comments:        analytics.comments        ?? 0,
          shares:          analytics.shares          ?? 0,
          saves:           analytics.saves           ?? 0,
          clicks:          analytics.clicks          ?? 0,
          engagement_rate: analytics.engagement_rate ?? 0,
          metadata:        { raw: analytics },
        }, { onConflict: 'post_id' });

      if (upsertErr) {
        await log('warn', `Failed to upsert analytics for post ${post.id}`, { error: upsertErr.message });
        failed++;
        continue;
      }

      // MERGE last_analytics_sync into metadata — a bare `{ last_analytics_sync }` replaces the whole
      // jsonb and would destroy the partial/failed diagnostic state the webhook + publish handler write.
      await supabase
        .from('social_posts')
        .update({ metadata: { ...((post as any).metadata ?? {}), last_analytics_sync: new Date().toISOString() } })
        .eq('id', post.id);

      synced++;
    }

    await log('info', `Analytics sync complete`, { synced, failed, total: posts.length });

    return {
      success: true,
      output: { synced, failed, total: posts.length },
      inputTokens: 0,
      outputTokens: 0,
      creditsDebited: 0,
    };
  }
}
