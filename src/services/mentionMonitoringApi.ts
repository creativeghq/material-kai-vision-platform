/**
 * Mention Monitoring API client.
 *
 * Wraps MIVAA's `/api/v1/mention-monitoring/*` endpoints. Mirror of
 * priceMonitoringApi.ts. Two flow shapes:
 *   - Product-scoped: /products/{product_id}/...     (internal flow)
 *   - Subject-scoped: /track/{tracked_mention_id}/...  (brand/keyword + admin)
 */

import { supabase } from '@/integrations/supabase/client';

const MIVAA_BASE = import.meta.env.VITE_MIVAA_BASE_URL || 'https://v1api.materialshub.gr';

async function authHeader(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error('Not authenticated');
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${MIVAA_BASE}${path}`, {
    ...init,
    headers: { ...(await authHeader()), ...(init?.headers || {}) },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`${path} failed: ${res.status} ${body.slice(0, 200)}`);
  }
  return res.json() as Promise<T>;
}

// ─────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────

export type MentionRelevance = 'exact' | 'tangential' | 'mismatch' | 'unverifiable' | null;
export type MentionSentiment = 'positive' | 'neutral' | 'negative' | null;
export type MentionOutletType =
  | 'news' | 'blog' | 'youtube' | 'forum' | 'llm' | 'rss' | 'aggregator' | 'other';
export type MentionAlertType =
  | 'mention_spike' | 'negative_sentiment' | 'new_outlet' | 'llm_visibility_change';
export type MentionSubjectType = 'product' | 'brand' | 'keyword';

export interface MentionRow {
  id: string;
  tracked_mention_id: string;
  refresh_run_id: string;
  url: string;
  canonical_url: string | null;
  outlet_domain: string | null;
  outlet_name: string | null;
  outlet_type: MentionOutletType;
  title: string | null;
  excerpt: string | null;
  body_md: string | null;
  language_code: string | null;
  country_code: string | null;
  author: string | null;
  published_at: string | null;
  discovered_at: string;
  sentiment: MentionSentiment;
  sentiment_score: number | null;
  relevance: MentionRelevance;
  relevance_score: number | null;
  match_note: string | null;
  engagement: Record<string, unknown> | null;
  is_anomaly: boolean;
  anomaly_reason: string | null;
  manual_override: boolean;
  source: string;
  classifier_cached: boolean;
}

/** Brand's primary domain (no scheme) — powers `domain_snapshot` opportunity. */
export type HomepageDomain = string | null;

export interface TrackedMention {
  id: string;
  api_key_id: string | null;
  product_id: string | null;
  brand_name: string | null;
  user_id: string | null;
  workspace_id: string | null;
  subject_type: MentionSubjectType;
  subject_label: string;
  aliases: string[];
  /** Opt-in: when true, Haiku expands the label into per-word aliases on first refresh.
   *  Default false — discovery uses only the label and any aliases supplied above. */
  auto_expand_aliases: boolean;
  /** Discovery window in days (1–730, default 30). Bump higher for niche brands. */
  recency_days: number;
  /** Brand's primary domain (no scheme) — powers `domain_snapshot` opportunity. */
  homepage_domain: HomepageDomain;
  sources_enabled: Record<string, boolean>;
  source_config: Record<string, unknown>;
  language_codes: string[];
  country_codes: string[];
  subject_facets: Record<string, unknown> | null;
  refresh_interval_hours: number;
  next_check_at: string | null;
  last_refreshed_at: string | null;
  last_refresh_credits_used: number;
  total_credits_used: number;
  last_error: string | null;
  current_mention_count_7d: number;
  current_mention_count_30d: number;
  current_sentiment_avg: number | null;
  current_share_of_voice: number | null;
  current_top_outlets: Array<{ domain: string; count: number }> | null;
  current_metadata: Record<string, unknown> | null;
  current_snapshot_at: string | null;
  alert_on_spike: boolean;
  alert_on_negative_sentiment: boolean;
  alert_on_new_outlet: boolean;
  alert_on_llm_visibility_change: boolean;
  alert_channels: string[];
  alert_webhook_url: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface RefreshOutcome {
  status: 'refreshed' | 'throttled' | 'inactive' | 'not_found' | 'error';
  credits_used: number;
  hits_count?: number;
  refresh_run_id?: string;
  by_source?: Record<string, number>;
  errors?: Record<string, string>;
  results?: MentionRow[];
  sentiment_avg?: number | null;
  top_outlets?: Array<[string, number]>;
}

export interface MentionSummary {
  tracked_mention_id: string;
  days: number;
  total_count: number;
  by_sentiment: { positive: number; neutral: number; negative: number };
  sentiment_avg: number | null;
  top_outlets: Array<{ domain: string; count: number }>;
  latest_at: string | null;
}

/** Sentiment over the probes where the subject was ACTUALLY MENTIONED. */
export interface LlmSentimentRollup {
  positive: number;
  neutral: number;
  negative: number;
  basis_probes: number;
  /** -1 .. +1. `null` means never mentioned — NOT that the verdict was neutral. */
  score: number | null;
}

export interface LlmCitationRollup {
  probes_with_citations: number;
  brand_cited: number;
  /**
   * Our page cited as the SOURCE while the brand is never named in the answer.
   * Invisible to a mention count, which is why it needed its own number.
   */
  ghost_citations: number;
  /** Probes we cannot judge: the subject has no `homepage_domain` set. */
  undecidable_no_homepage_domain: number;
  top_cited_domains: Array<[string, number]>;
}

export interface LlmProbeSample {
  template: string | null;
  response: string;
  mentioned: boolean;
  position: number | null;
  sentiment: string | null;
  context_snippet: string | null;
  cited_urls: string[];
  brand_cited: boolean | null;
}

export interface LlmVisibilitySnapshot {
  present: boolean;
  probe_run_id?: string;
  run_at?: string | null;
  total_probes?: number;
  share_of_voice?: number;
  avg_position?: number | null;
  sentiment?: LlmSentimentRollup;
  citations?: LlmCitationRollup;
  per_model?: Record<string, {
    probes: number;
    mentioned: number;
    positions: number[];
    samples?: LlmProbeSample[];
    sentiment?: LlmSentimentRollup;
    citations?: LlmCitationRollup;
  }>;
  top_competitors?: Array<[string, number]>;
}

/** One probe RUN. The run is the measurement bucket — same templates, same models. */
export interface LlmVisibilityTrendPoint {
  probe_run_id: string;
  run_at: string;
  total_probes: number;
  mentioned: number;
  share_of_voice: number;
  avg_position: number | null;
  sentiment_score: number | null;
  ghost_citations: number;
  brand_cited: number;
}

export interface LlmVisibilityTrend {
  present: boolean;
  days: number;
  truncated?: boolean;
  points: LlmVisibilityTrendPoint[];
  change?: {
    share_of_voice: number;
    /** Negative = rank IMPROVED. `null` when there is nothing to compare against. */
    avg_position: number | null;
    runs_compared: number;
  };
}

export interface ShareOfVoiceBucket {
  probe_run_id: string;
  run_at: string;
  total_probes: number;
  subject_mentions: number;
  share_of_named_brands: number;
  competitor_mentions: Array<{ name: string; count: number }>;
}

export interface ShareOfVoice {
  tracked_mention_id: string;
  days: number;
  truncated?: boolean;
  subject_label?: string;
  buckets: ShareOfVoiceBucket[];
  totals: {
    probes: number;
    subject_mentions: number;
    subject_share_of_named_brands: number;
    subject_share_of_probes: number;
    competitor_mentions: Array<{ name: string; count: number }>;
  } | null;
  /** Kept pointing at `totals.competitor_mentions` for pre-#349 callers. */
  competitor_mentions: Array<{ name: string; count: number }>;
}

export interface MentionExclusion {
  id: string;
  tracked_mention_id: string;
  url: string | null;
  domain: string | null;
  reason: string | null;
  excluded_at: string;
}

export type OpportunityType =
  // Subject-driven (work on subjects with zero mention history)
  | 'keyword_opportunity'
  | 'pao_question'
  | 'ai_overview'
  | 'featured_snippet'
  | 'related_search'
  | 'competitor_ranking'
  // v0.4.6 additions — also subject-driven, free from same SERP call
  | 'video_carousel'
  | 'news_carousel'
  | 'knowledge_graph'
  | 'paid_competitor'
  | 'shopping_listing'
  // v0.4.7 additions
  | 'llm_visibility'
  | 'domain_snapshot'
  // Mention-derived (require existing mention_history)
  | 'trending_topic'
  | 'outlet_pitch'
  | 'author_relationship'
  | 'sentiment_response';

export interface Opportunity {
  type: OpportunityType;
  title: string;
  rationale: string;
  suggested_action: string;
  priority_score: number;
  source: Record<string, unknown>;
  metadata: Record<string, unknown>;
}

export interface OpportunitiesResponse {
  tracked_mention_id: string | null;
  subject_label?: string;
  days: number;
  mention_count?: number;
  opportunities: Opportunity[];
  errors: Record<string, string>;
  latency_ms?: number;
}

// ─────────────────────────────────────────────────────────────────────────
// Product-scoped helpers
// ─────────────────────────────────────────────────────────────────────────

export async function trackProduct(
  productId: string,
  options?: Partial<{
    aliases: string[];
    auto_expand_aliases: boolean;
    sources_enabled: Record<string, boolean>;
    language_codes: string[];
    country_codes: string[];
    alert_on_spike: boolean;
    alert_on_negative_sentiment: boolean;
    alert_on_new_outlet: boolean;
    alert_on_llm_visibility_change: boolean;
    alert_channels: string[];
    alert_webhook_url: string;
    run_first_refresh: boolean;
  }>,
): Promise<TrackedMention | null> {
  const res = await api<{ success: boolean; data: TrackedMention | null }>(
    `/api/v1/mention-monitoring/products/${productId}/track`,
    { method: 'POST', body: JSON.stringify(options || {}) },
  );
  return res.data;
}

export async function untrackProduct(productId: string): Promise<void> {
  await api(`/api/v1/mention-monitoring/products/${productId}/track`, { method: 'DELETE' });
}

export async function getProductMonitoring(productId: string): Promise<TrackedMention | null> {
  const res = await api<{ success: boolean; data: TrackedMention | null }>(
    `/api/v1/mention-monitoring/products/${productId}`, { method: 'GET' },
  );
  return res.data;
}

export async function refreshProduct(
  productId: string,
  options?: { force?: boolean },
): Promise<RefreshOutcome> {
  const res = await api<{ success: boolean; data: RefreshOutcome }>(
    `/api/v1/mention-monitoring/products/${productId}/refresh`,
    { method: 'POST', body: JSON.stringify({ force: !!options?.force }) },
  );
  return res.data;
}

export async function getProductFeed(
  productId: string,
  params?: { limit?: number },
): Promise<MentionRow[]> {
  const qs = new URLSearchParams();
  if (params?.limit) qs.set('limit', String(params.limit));
  const res = await api<{ success: boolean; data: MentionRow[] }>(
    `/api/v1/mention-monitoring/products/${productId}/feed?${qs.toString()}`,
    { method: 'GET' },
  );
  return res.data || [];
}

export async function getProductHistory(
  productId: string,
  params?: { days?: number; sentiment?: string; outlet_type?: string; limit?: number },
): Promise<MentionRow[]> {
  const qs = new URLSearchParams();
  if (params?.days) qs.set('days', String(params.days));
  if (params?.sentiment) qs.set('sentiment', params.sentiment);
  if (params?.outlet_type) qs.set('outlet_type', params.outlet_type);
  if (params?.limit) qs.set('limit', String(params.limit));
  const res = await api<{ success: boolean; data: MentionRow[] }>(
    `/api/v1/mention-monitoring/products/${productId}/history?${qs.toString()}`,
    { method: 'GET' },
  );
  return res.data || [];
}

export async function getProductSummary(
  productId: string,
  days: number = 30,
): Promise<MentionSummary | null> {
  const res = await api<{ success: boolean; data: MentionSummary | null }>(
    `/api/v1/mention-monitoring/products/${productId}/summary?days=${days}`,
    { method: 'GET' },
  );
  return res.data;
}

export async function getProductLlmVisibility(
  productId: string,
): Promise<LlmVisibilitySnapshot> {
  const res = await api<{ success: boolean; data: LlmVisibilitySnapshot }>(
    `/api/v1/mention-monitoring/products/${productId}/llm-visibility`,
    { method: 'GET' },
  );
  return res.data;
}

export async function getProductLlmVisibilityTrend(
  productId: string,
  days: number = 90,
): Promise<LlmVisibilityTrend> {
  const res = await api<{ success: boolean; data: LlmVisibilityTrend }>(
    `/api/v1/mention-monitoring/products/${productId}/llm-visibility-trend?days=${days}`,
    { method: 'GET' },
  );
  return res.data;
}

export async function getTrackedLlmVisibilityTrend(
  trackedMentionId: string,
  days: number = 90,
): Promise<LlmVisibilityTrend> {
  const res = await api<{ success: boolean; data: LlmVisibilityTrend }>(
    `/api/v1/mention-monitoring/track/${trackedMentionId}/llm-visibility-trend?days=${days}`,
    { method: 'GET' },
  );
  return res.data;
}

export async function probeProductLlm(
  productId: string,
  models?: string[],
): Promise<{ status: string; probe_run_id: string; probe_count: number; total_cost_usd: number }> {
  const res = await api<{ success: boolean; data: any }>(
    `/api/v1/mention-monitoring/products/${productId}/probe-llm`,
    { method: 'POST', body: JSON.stringify(models ? { models } : {}) },
  );
  return res.data;
}

export async function getProductOpportunities(
  productId: string,
  options?: {
    types?: OpportunityType[];
    days?: number;
    limit_per_type?: number;
    use_llm_summary?: boolean;
  },
): Promise<OpportunitiesResponse> {
  const res = await api<{ success: boolean; data: OpportunitiesResponse }>(
    `/api/v1/mention-monitoring/products/${productId}/opportunities`,
    { method: 'POST', body: JSON.stringify(options || {}) },
  );
  return res.data;
}

export async function getTrackedOpportunities(
  trackedMentionId: string,
  options?: {
    types?: OpportunityType[];
    days?: number;
    limit_per_type?: number;
    use_llm_summary?: boolean;
  },
): Promise<OpportunitiesResponse> {
  const res = await api<{ success: boolean; data: OpportunitiesResponse }>(
    `/api/v1/mention-monitoring/track/${trackedMentionId}/opportunities`,
    { method: 'POST', body: JSON.stringify(options || {}) },
  );
  return res.data;
}

// ─────────────────────────────────────────────────────────────────────────
// Subject-scoped helpers (brand / keyword / admin lookups)
// ─────────────────────────────────────────────────────────────────────────

export interface CreateTrackedMentionInput {
  subject_type?: MentionSubjectType;
  subject_label?: string;
  product_id?: string;
  brand_name?: string;
  aliases?: string[];
  auto_expand_aliases?: boolean;
  sources_enabled?: Record<string, boolean>;
  source_config?: Record<string, unknown>;
  language_codes?: string[];
  country_codes?: string[];
  refresh_interval_hours?: number;
  recency_days?: number;
  homepage_domain?: string;
  alert_channels?: string[];
  alert_on_spike?: boolean;
  alert_on_negative_sentiment?: boolean;
  alert_on_new_outlet?: boolean;
  alert_on_llm_visibility_change?: boolean;
  alert_webhook_url?: string;
  run_first_refresh?: boolean;
}

export async function createTrackedMention(
  input: CreateTrackedMentionInput,
): Promise<TrackedMention> {
  const res = await api<{ success: boolean; data: TrackedMention }>(
    '/api/v1/mention-monitoring/track',
    { method: 'POST', body: JSON.stringify(input) },
  );
  return res.data;
}

export async function getTrackedMention(id: string): Promise<TrackedMention> {
  const res = await api<{ success: boolean; data: TrackedMention }>(
    `/api/v1/mention-monitoring/track/${id}`, { method: 'GET' },
  );
  return res.data;
}

export async function updateTrackedMention(
  id: string,
  patch: Partial<CreateTrackedMentionInput & { is_active: boolean }>,
): Promise<TrackedMention | null> {
  const res = await api<{ success: boolean; data: TrackedMention | null }>(
    `/api/v1/mention-monitoring/track/${id}`,
    { method: 'PUT', body: JSON.stringify(patch) },
  );
  return res.data;
}

export async function deactivateTrackedMention(id: string): Promise<void> {
  await api(`/api/v1/mention-monitoring/track/${id}`, { method: 'DELETE' });
}

export async function refreshTracked(
  id: string,
  options?: { force?: boolean },
): Promise<RefreshOutcome> {
  const res = await api<{ success: boolean; data: RefreshOutcome }>(
    `/api/v1/mention-monitoring/track/${id}/refresh`,
    { method: 'POST', body: JSON.stringify({ force: !!options?.force }) },
  );
  return res.data;
}

export async function listExclusions(id: string): Promise<MentionExclusion[]> {
  const res = await api<{ success: boolean; data: MentionExclusion[] }>(
    `/api/v1/mention-monitoring/track/${id}/exclusions`, { method: 'GET' },
  );
  return res.data || [];
}

export async function excludeMentionUrl(args: {
  trackedMentionId: string;
  url?: string;
  domain?: string;
  reason?: string;
}): Promise<MentionExclusion> {
  const res = await api<{ success: boolean; data: MentionExclusion }>(
    `/api/v1/mention-monitoring/track/${args.trackedMentionId}/exclude`,
    { method: 'POST', body: JSON.stringify({ url: args.url, domain: args.domain, reason: args.reason }) },
  );
  return res.data;
}

export async function includeMentionUrl(args: {
  trackedMentionId: string;
  url?: string;
  domain?: string;
}): Promise<{ removed_count: number }> {
  const res = await api<{ success: boolean; removed_count: number }>(
    `/api/v1/mention-monitoring/track/${args.trackedMentionId}/include`,
    { method: 'POST', body: JSON.stringify({ url: args.url, domain: args.domain }) },
  );
  return { removed_count: res.removed_count };
}

export async function promoteMentionUrl(args: {
  trackedMentionId: string;
  url: string;
  override_relevance: 'exact' | 'tangential' | 'unverifiable';
  reason?: string;
}): Promise<void> {
  await api(`/api/v1/mention-monitoring/track/${args.trackedMentionId}/promote`, {
    method: 'POST',
    body: JSON.stringify({
      url: args.url, override_relevance: args.override_relevance, reason: args.reason,
    }),
  });
}

export async function shareOfVoice(
  trackedMentionId: string,
  days: number = 30,
): Promise<ShareOfVoice> {
  const res = await api<{ success: boolean; data: ShareOfVoice }>(
    `/api/v1/mention-monitoring/track/${trackedMentionId}/share-of-voice?days=${days}`,
    { method: 'GET' },
  );
  return res.data;
}

export async function submitMentionClassifierCorrection(args: {
  mentionHistoryId: string;
  correctedRelevance?: MentionRelevance;
  correctedSentiment?: MentionSentiment;
  correctionNote?: string;
}): Promise<void> {
  await api('/api/v1/mention-monitoring/classifier-correction', {
    method: 'POST',
    body: JSON.stringify({
      mention_history_id: args.mentionHistoryId,
      corrected_relevance: args.correctedRelevance || undefined,
      corrected_sentiment: args.correctedSentiment || undefined,
      correction_note: args.correctionNote,
    }),
  });
}
