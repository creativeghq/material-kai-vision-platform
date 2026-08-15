/**
 * Background Agent: Social Insights Sync
 *
 * Takes daily account-level snapshots from Zernio for all active social accounts.
 * Captures follower / following / posts counts.
 *
 * Runs once daily at 6am UTC via pg_cron.
 * Creates one row per social_account per day in social_account_insights.
 */

import type { AgentRunner, AgentRunContext, AgentRunResult } from '../../../agents/types.ts';
import { ZERNIO_BASE_URL, zernioKey, ensureZernioSecrets } from '../../../zernio.ts';


interface AccountInsights {
  followers_count: number;
  following_count: number;
  posts_count: number;
}

/** Fetch account-level follower stats from Zernio. */
async function fetchAccountInsights(zernioAccountId: string): Promise<AccountInsights | null> {
  try {
    const res = await fetch(
      `${ZERNIO_BASE_URL}/accounts/follower-stats?accountIds=${encodeURIComponent(zernioAccountId)}&granularity=daily`,
      { headers: { 'Authorization': `Bearer ${zernioKey()}` } },
    );
    if (!res.ok) return null;
    const data = await res.json();
    const a = (data.accounts || [])[0];
    if (!a) return null;
    const stats = a.accountStats ?? {};
    const postsCount = stats.mediaCount ?? stats.videoCount ?? stats.postsCount ?? stats.tweetCount ?? stats.pinCount ?? 0;
    return {
      followers_count: a.currentFollowers ?? 0,
      following_count: stats.followingCount ?? 0,
      posts_count: postsCount,
    };
  } catch {
    return null;
  }
}

export class SocialInsightsSyncAgent implements AgentRunner {
  readonly agentType    = 'social-insights-sync';
  readonly name         = 'Social Insights Sync';
  readonly description  = 'Takes daily follower and engagement snapshots for connected social accounts';
  readonly defaultTools = [];
  readonly defaultModel = 'claude-haiku-4-5';

  async run(ctx: AgentRunContext): Promise<AgentRunResult> {
    const { supabase, log, heartbeat } = ctx;

    // env → platform_secrets. Every Zernio fetch below swallows its error and returns null,
    // so an unresolved key reads as "synced 0" forever instead of as a failure.
    await ensureZernioSecrets(supabase);
    if (!zernioKey()) {
      await log('error', 'Zernio is not configured (ZERNIO_API_KEY) — nothing to sync');
      throw new Error('Zernio is not configured (ZERNIO_API_KEY)');
    }

    await log('info', 'Starting social insights sync');

    // Fetch all active social accounts
    const { data: accounts, error: fetchErr } = await supabase
      .from('social_accounts')
      .select('id, zernio_account_id, platform, workspace_id, handle')
      .eq('is_active', true)
      .order('created_at', { ascending: true });

    if (fetchErr) {
      await log('error', 'Failed to fetch social accounts', { error: fetchErr.message });
      return { success: false, output: { error: fetchErr.message }, inputTokens: 0, outputTokens: 0, creditsDebited: 0 };
    }

    if (!accounts?.length) {
      await log('info', 'No active social accounts found');
      return { success: true, output: { synced: 0, message: 'No accounts to sync' }, inputTokens: 0, outputTokens: 0, creditsDebited: 0 };
    }

    await log('info', `Found ${accounts.length} active accounts to sync`);

    let synced = 0;
    let failed = 0;
    const today = new Date().toISOString().split('T')[0];

    for (const account of accounts) {
      await heartbeat();

      const insights = await fetchAccountInsights(account.zernio_account_id);

      if (!insights) {
        await log('warn', `Failed to fetch insights for account ${account.id} (${account.platform}:${account.handle})`);
        failed++;
        continue;
      }

      // Upsert today's snapshot (UNIQUE on social_account_id, snapshot_date)
      const { error: upsertErr } = await supabase
        .from('social_account_insights')
        .upsert({
          social_account_id: account.id,
          workspace_id:      account.workspace_id,
          snapshot_date:     today,
          followers_count:   insights.followers_count,
          following_count:   insights.following_count,
          posts_count:       insights.posts_count,
          avg_engagement:    0,
          reach_7d:          0,
          impressions_7d:    0,
          metadata:          { raw: insights },
        }, { onConflict: 'social_account_id,snapshot_date' });

      if (upsertErr) {
        await log('warn', `Failed to upsert insights for account ${account.id}`, { error: upsertErr.message });
        failed++;
        continue;
      }

      // Update social_accounts with latest follower count
      await supabase
        .from('social_accounts')
        .update({
          followers_count:  insights.followers_count,
          following_count:  insights.following_count,
          last_synced_at:   new Date().toISOString(),
        })
        .eq('id', account.id);

      synced++;
    }

    await log('info', 'Insights sync complete', { synced, failed, total: accounts.length });

    return {
      success: true,
      output: { synced, failed, total: accounts.length, snapshot_date: today },
      inputTokens: 0,
      outputTokens: 0,
      creditsDebited: 0,
    };
  }
}
