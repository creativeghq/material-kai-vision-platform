/**
 * Background Agent: Social Insights Sync
 *
 * Takes daily account-level snapshots from Late.dev for all active social accounts.
 * Captures follower count, engagement rate, reach/impressions over 7 days.
 *
 * Runs once daily at 6am UTC via pg_cron.
 * Creates one row per social_account per day in social_account_insights.
 */

import type { AgentRunner, AgentRunContext, AgentRunResult } from './types.ts';

const LATE_API_KEY = Deno.env.get('LATE_API_KEY') || '';
const LATE_BASE_URL = 'https://api.late.dev/v1';

async function fetchAccountInsights(lateAccountId: string): Promise<{
  followers_count?: number; following_count?: number; media_count?: number;
  avg_engagement_rate?: number; reach_7d?: number; impressions_7d?: number;
} | null> {
  try {
    const res = await fetch(`${LATE_BASE_URL}/accounts/${lateAccountId}/insights`, {
      headers: { 'Authorization': `Bearer ${LATE_API_KEY}` },
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export class SocialInsightsSyncAgent implements AgentRunner {
  readonly agentType    = 'social-insights-sync';
  readonly name         = 'Social Insights Sync';
  readonly description  = 'Takes daily follower and engagement snapshots for connected social accounts';
  readonly defaultTools = [];
  readonly defaultModel = 'claude-haiku-4-5-20251001';

  async run(ctx: AgentRunContext): Promise<AgentRunResult> {
    const { supabase, log, heartbeat } = ctx;

    await log('info', 'Starting social insights sync');

    // Fetch all active social accounts
    const { data: accounts, error: fetchErr } = await supabase
      .from('social_accounts')
      .select('id, late_account_id, platform, workspace_id, handle')
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

      const insights = await fetchAccountInsights(account.late_account_id);

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
          followers_count:   insights.followers_count   ?? 0,
          following_count:   insights.following_count   ?? 0,
          posts_count:       insights.media_count       ?? 0,
          avg_engagement:    insights.avg_engagement_rate ?? 0,
          reach_7d:          insights.reach_7d          ?? 0,
          impressions_7d:    insights.impressions_7d    ?? 0,
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
          followers_count:  insights.followers_count  ?? 0,
          following_count:  insights.following_count  ?? 0,
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
