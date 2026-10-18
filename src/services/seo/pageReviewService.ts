import { supabase } from '@/integrations/supabase/client';
import { edgeErrorMessage } from '@/utils/edgeError';
import type { SeoMetric } from '@/components/core/Profile/seo/seoMetrics';
import type {
  PageListFilter, PageRecommendationKind, PageRecommendationStatus, PageReviewVerdict,
} from './pageReviewVocabulary';

export interface WebsitePageRow {
  page_id: string;
  url: string;
  title: string | null;
  description: string | null;
  h1: string | null;
  word_count: number | null;
  http_status: number | null;
  fetched_at: string | null;
  gsc_clicks_28d: number | null;
  gsc_impressions_28d: number | null;
  onpage_score: number | null;
  audited_at: string | null;
  open_recommendations: number;
  last_verdict: PageReviewVerdict | null;
  last_review_at: string | null;
  total_count: number;
}

export interface PageRecommendation {
  id: string;
  kind: PageRecommendationKind;
  status: PageRecommendationStatus;
  current_value: string | null;
  proposed_value: string;
  rationale: string | null;
  evidence: { source_query?: string; anchor?: string } & Record<string, unknown>;
  created_at: string;
  resolved_at: string | null;
}

export interface WebsitePageDetail {
  page: {
    id: string; website_id: string; url: string; title: string | null; description: string | null; h1: string | null;
    canonical_url: string | null; lang: string | null; word_count: number | null; http_status: number | null;
    fetched_at: string | null; content_hash: string | null;
  };
  audit: { onpage_score: number | null; checks: Record<string, unknown> | null; source_errors: Record<string, unknown>; created_at: string } | null;
  content_scores: { keyword?: string; overall_score?: number; readability_score?: number | null; geo_score?: number | null; scored_at?: string } | null;
  review: { id: string; verdict: PageReviewVerdict; summary: string | null; credits: number; content_hash: string | null; created_at: string } | null;
  recommendations: PageRecommendation[];
}

export type PageReviewSummary = Record<
  'pages_known' | 'pages_fetched' | 'pages_audited' | 'pages_reviewed'
  | 'recommendations_open' | 'recommendations_applied' | 'recommendations_dismissed',
  SeoMetric
>;

const rpc = async <T>(name: string, args: Record<string, unknown>): Promise<T> => {
  const { data, error } = await supabase.rpc(name as never, args as never);
  if (error) throw error;
  return data as T;
};

const invoke = async <T>(fn: string, body: Record<string, unknown>): Promise<T> => {
  const { data, error } = await supabase.functions.invoke(fn, { body });
  if (error) throw new Error(await edgeErrorMessage(error, `${fn} failed`));
  if (data?.success === false || data?.ok === false) throw new Error(String(data.error ?? `${fn} failed`));
  return data as T;
};

export const pageReviewService = {
  async weeklyReview(workspaceId: string): Promise<boolean> {
    const { data, error } = await supabase.from('workspace_seo_settings' as never)
      .select('weekly_page_review').eq('workspace_id', workspaceId).maybeSingle();
    if (error) throw error;
    return (data as { weekly_page_review?: boolean } | null)?.weekly_page_review === true;
  },
  async setWeeklyReview(workspaceId: string, on: boolean): Promise<void> {
    const { error } = await supabase.from('workspace_seo_settings' as never)
      .upsert({ workspace_id: workspaceId, weekly_page_review: on } as never, { onConflict: 'workspace_id' });
    if (error) throw error;
  },
  list(websiteId: string, opts: { filter?: PageListFilter | null; search?: string; limit?: number; offset?: number } = {}) {
    return rpc<WebsitePageRow[] | null>('get_website_pages', {
      p_website_id: websiteId, p_filter: opts.filter ?? null, p_search: opts.search?.trim() || null,
      p_limit: opts.limit ?? 50, p_offset: opts.offset ?? 0,
    }).then((r) => r ?? []);
  },
  detail(pageId: string) {
    return rpc<WebsitePageDetail | null>('get_website_page_detail', { p_page_id: pageId });
  },
  summary(websiteId: string) {
    return rpc<PageReviewSummary | null>('get_website_page_review_summary', { p_website_id: websiteId });
  },
  dismiss(recommendationId: string) {
    return rpc<void>('dismiss_page_recommendation', { p_id: recommendationId });
  },
  review(pageId: string) {
    return invoke<{ data: { verdict: PageReviewVerdict; credits_used: number } }>('seo-api', { action: 'page_review', page_id: pageId });
  },
  audit(websiteId: string, pageId: string) {
    return invoke<{ audit_id: string | null }>('seo-site-audit', { action: 'page', website_id: websiteId, page_id: pageId });
  },
  refetch(websiteId: string, pageId: string) {
    return invoke<{ data: { pages_fetched: number } }>('crawl-user-website', { website_id: websiteId, page_ids: [pageId] });
  },
};
