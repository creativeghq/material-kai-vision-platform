/**
 * Background Agent: Social Analytics Sync
 *
 * Syncs post-level analytics from Late.dev for all published social_posts
 * that haven't been synced in the last 2 hours.
 *
 * Runs every 2 hours via pg_cron.
 * Processes posts in batches of 20 to avoid Late.dev rate limits.
 *
 * Config params (background_agents.config):
 *   batch_size         number   Posts per run (default 20, max 50)
 *   min_age_hours      number   Only sync posts published at least N hours ago (default 1)
 *   stale_after_hours  number   Re-sync if last synced > N hours ago (default 2)
 */

import type { AgentRunner, AgentRunContext, AgentRunResult } from './types.ts';

const LATE_API_KEY = Deno.env.get('LATE_API_KEY') || '';
const LATE_BASE_URL = 'https://api.late.dev/v1';

async function fetchLateAnalytics(latePostId: string): Promise<{
  impressions?: number; reach?: number; likes?: number; comments?: number;
  shares?: number; saves?: number; clicks?: number; engagement_rate?: number;
} | null> {
  try {
    const res = await fetch(`${LATE_BASE_URL}/posts/${latePostId}/analytics`, {
      headers: { 'Authorization': `Bearer ${LATE_API_KEY}` },
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export class SocialAnalyticsSyncAgent implements AgentRunner {
  readonly agentType    = 'social-analytics-sync';
  readonly name         = 'Social Analytics Sync';
  readonly description  = 'Syncs post performance metrics from Late.dev every 2 hours';
  readonly defaultTools = [];
  readonly defaultModel = 'claude-haiku-4-5';

  async run(ctx: AgentRunContext): Promise<AgentRunResult> {
    const { supabase, agentConfig, input, log, heartbeat } = ctx;

    const cfg = { ...agentConfig.config, ...input } as Record<string, unknown>;
    const batchSize      = Math.min(Number(cfg.batch_size       ?? 20), 50);
    const minAgeHours    = Number(cfg.min_age_hours    ?? 1);
    const staleAfterHours = Number(cfg.stale_after_hours ?? 2);

    await log('info', 'Starting social analytics sync', { batchSize, minAgeHours, staleAfterHours });

    // Find published posts with a Late.dev ID that haven't been synced recently
    const staleThreshold = new Date(Date.now() - staleAfterHours * 3600000).toISOString();
    const minPublishedAt = new Date(Date.now() - minAgeHours * 3600000).toISOString();

    const { data: posts, error: fetchErr } = await supabase
      .from('social_posts')
      .select('id, late_post_id, workspace_id, platform')
      .eq('status', 'published')
      .not('late_post_id', 'is', null)
      .lte('published_at', minPublishedAt) // at least N hours old
      .or(`metadata->>'last_analytics_sync'.is.null,metadata->>'last_analytics_sync'.lte.${staleThreshold}`)
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

      if (!post.late_post_id) continue;

      const analytics = await fetchLateAnalytics(post.late_post_id);

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

      // Update last_analytics_sync in metadata
      await supabase
        .from('social_posts')
        .update({ metadata: { last_analytics_sync: new Date().toISOString() } })
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
