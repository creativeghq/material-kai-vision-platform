/**
 * dashboardInsightsService
 *
 * Thin client for the `dashboard-insights` edge function, which returns a short,
 * AI-generated (Claude) set of personalised insights for the home dashboard's
 * "AI Insights" panel. The backend caches per (user, workspace) for 15 days and
 * always returns usable insights (deterministic fallback if the LLM path fails),
 * so callers can render the result directly without special-casing errors.
 */

import { supabase } from '@/integrations/supabase/client';

export type InsightTone = 'info' | 'positive' | 'warning' | 'tip';

export interface DashboardInsight {
  title: string;
  body: string;
  tone: InsightTone;
}

export interface DashboardInsights {
  headline: string;
  insights: DashboardInsight[];
}

export interface DashboardInsightsResult {
  insights: DashboardInsights;
  model: string | null;
  source: 'ai' | 'fallback';
  generated_at: string;
  expires_at: string;
  cached: boolean;
}

export async function getDashboardInsights(
  workspaceId: string,
  opts: { force?: boolean } = {},
): Promise<DashboardInsightsResult> {
  const { data, error } = await supabase.functions.invoke('dashboard-insights', {
    body: { workspace_id: workspaceId, force: opts.force === true },
  });
  if (error) {
    const ctx = (error as { context?: { error?: string } }).context;
    throw new Error(ctx?.error || error.message || 'Failed to load insights');
  }
  if (data && (data as { error?: string }).error) {
    throw new Error((data as { error: string }).error);
  }
  return data as DashboardInsightsResult;
}
