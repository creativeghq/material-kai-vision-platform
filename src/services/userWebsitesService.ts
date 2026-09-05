/**
 * userWebsitesService — Connected websites for SEO inter-linking
 *
 * Talks to:
 *  - public.user_websites (CRUD via supabase-js, RLS-gated to auth.uid())
 *  - public.user_website_pages (read-only from frontend)
 *  - edge function `crawl-user-website` (manual recrawl)
 */

import { supabase } from '@/integrations/supabase/client';
import { edgeErrorMessage } from '@/utils/edgeError';

export interface UserWebsite {
  id: string;
  user_id: string;
  workspace_id: string | null;
  url: string;
  sitemap_url: string | null;
  display_name: string | null;
  is_default: boolean;
  is_active: boolean;
  last_crawled_at: string | null;
  last_crawl_error: string | null;
  page_count: number;
  max_pages: number;
  created_at: string;
  updated_at: string;
}

export interface UserWebsitePage {
  id: string;
  website_id: string;
  url: string;
  title: string | null;
  description: string | null;
  http_status: number | null;
  is_active: boolean;
  last_seen_in_sitemap: string;
  fetched_at: string | null;
}

export interface CrawlResult {
  ok: boolean;
  pages_indexed: number;
  /** Every URL the sitemap holds, NOT the number crawled — the cap below decides that. */
  pages_discovered: number;
  pages_capped_at?: number;
  capped?: boolean;
  /** Active pages holding content after this run — the number the site can search and interlink. */
  pages_with_content?: number;
  /** Pages this run could not fetch (crawler rate limit or the run's time budget); the next run takes them first. */
  pages_pending?: number;
  rate_limited?: number;
  error?: string;
}

/**
 * One sentence for the crawl toast, naming what stopped the crawl when something did.
 * "50 of 50 pages indexed" on an 82-URL sitemap read as a 50-page site, and "82 pages
 * indexed" with 72 of them empty read as a finished crawl.
 */
export function describeCrawlResult(r: CrawlResult): string {
  const held = r.pages_with_content ?? r.pages_indexed;
  let s = `${held} of ${r.pages_discovered} pages indexed`;
  if (r.pages_pending) {
    s += ` · ${r.pages_pending} waiting on the crawler's rate limit — the crawl continues automatically every 6 hours`;
  }
  if (r.capped && r.pages_capped_at) {
    s += ` · this site's page cap is ${r.pages_capped_at}; raise it under Websites → Edit to index the rest`;
  }
  return s;
}

export interface PreviewSampleItem {
  url: string;
  title: string | null;
  description: string | null;
  ok: boolean;
}

export interface PreviewResult {
  ok: boolean;
  sitemap_url: string | null;
  pages_discovered: number;
  capped_at: number;
  sample: PreviewSampleItem[];
  error?: string;
}

/** Per-website aggregate counts from the get_website_seo_overview RPC. */
export interface WebsiteSeoOverview {
  website: {
    id: string;
    url: string;
    display_name: string | null;
    is_default: boolean;
    is_active: boolean;
    page_count: number;
    max_pages: number;
    last_crawled_at: string | null;
    last_crawl_error: string | null;
  };
  articles: { total: number; by_status: Record<string, number> };
  keyword_research: { total: number };
  toolkit_runs: { total: number; starred: number };
  tracked_domains: { total: number; active: number; last_audited_at: string | null };
}

/** One row of `seo_article_freshness` — the derived content-decay view. */
export interface SeoArticleFreshnessRow {
  article_id: string;
  title: string | null;
  slug: string | null;
  target_keyword: string | null;
  published_at: string | null;
  /** Null = never revisited since publication. */
  last_reviewed_at: string | null;
  refresh_interval_days: number;
  /** Derived in SQL. Never recompute it client-side. */
  refresh_due_at: string;
  age_days: number;
  is_due: boolean;
}

export interface SeoArticleRow {
  id: string;
  title: string | null;
  target_keyword: string;
  status: string;
  seo_score: number | null;
  readability_score: number | null;
  word_count: number | null;
  slug: string | null;
  created_at: string;
  completed_at: string | null;
}

export interface PageGscQuery {
  query: string;
  impressions: number;
  clicks: number;
  ctr: number | null;
  position: number | null;
  days_seen: number;
}

export interface PageKeywordIdea {
  term: string;
  search_volume: number | null;
  cpc: number | null;
  competition: number | null;
}

export interface PageKeywordIdeas {
  seed: string;
  page: string;
  location_code: number;
  language_code: string;
  ideas: PageKeywordIdea[];
  /** What the provider reported for the two calls; null = it reported nothing (the reserve stands). */
  cost_usd: number | null;
}

export interface SeoKeywordResearchRow {
  id: string;
  topic: string;
  target_keyword: string;
  language_code: string | null;
  total_keywords_found: number | null;
  total_addressable_volume: number | null;
  created_at: string;
  /**
   * The researched keyword's own figures, lifted from `research_data.recommendedPrimary`
   * so the list can show them without loading every run's blob. NULL = the source did
   * not return it (keyword difficulty is unscored for many Greek terms), never 0.
   */
  primary: {
    search_volume: number | null;
    cpc: number | null;
    competition: number | null;
    difficulty: number | null;
    opportunity: number | null;
    trend: string | null;
    trend_delta: number | null;
  } | null;
}

export interface SeoResearchRunRow {
  id: string;
  kind: string;
  subject: string;
  success: boolean;
  starred: boolean;
  label: string | null;
  country_code: string | null;
  created_at: string;
}

export interface SeoTrackedDomainRow {
  id: string;
  domain: string;
  display_label: string | null;
  country_code: string | null;
  is_active: boolean;
  current_domain_rank: number | null;
  current_organic_traffic: number | null;
  last_audited_at: string | null;
}

// ── Google Search Console ──────────────────────────────────────────────────
export interface GscStatus {
  connected: boolean;
  google_email?: string | null;
  property?: string | null;
  is_active?: boolean;
  connected_at?: string | null;
  last_sync_at?: string | null;
  last_sync_error?: string | null;
}

export interface GscRow {
  query?: string;
  page?: string;
  value?: string;    // breakdown value (device / country / appearance)
  clicks: number;
  impressions: number;
  ctr: number;       // percentage
  position: number;
}

export interface GscTrendPoint { date: string; clicks: number; impressions: number }

export interface DomainSnapshot {
  captured_at: string;
  country_code: string | null; language_code: string | null;
  ranking_keywords: number | null; organic_traffic: number | null; organic_traffic_value: number | null;
  kw_up: number | null; kw_down: number | null; kw_new: number | null; kw_lost: number | null;
  pos_1: number | null; pos_2_3: number | null; pos_4_10: number | null; pos_11_20: number | null;
  pos_21_50: number | null; pos_51_100: number | null;
  backlinks: number | null; referring_domains: number | null; referring_main_domains: number | null;
  domain_rank: number | null; spam_score: number | null; broken_backlinks: number | null;
  error: string | null;
  /**
   * Per-source verdict, written by `seo-domain-tracker` and returned verbatim by
   * `get_website_domain_intel` (it selects `to_jsonb(s)`).
   *
   * Keyed `overview` | `backlinks` | `ranked` with `ok` | `no_data` | `failed`. This is the
   * difference between "DataForSEO has no backlink record for this domain" and "the backlinks
   * call failed", which a NULL column cannot express — the distinction CLAUDE.md rule 3 exists
   * for. Snapshots taken before the tracker recorded it carry `{}`, which reads as unknown.
   */
  source_status?: Record<string, string> | null;
  source_errors?: Record<string, string> | null;
}
export interface DomainKeyword { keyword: string; position: number | null; search_volume: number | null; etv: number | null; url: string | null }
export interface DomainTrendPoint { date: string; ranking_keywords: number | null; organic_traffic: number | null; backlinks: number | null; referring_domains: number | null }
export interface DomainIntel {
  latest: DomainSnapshot | null;
  trend: DomainTrendPoint[];
  top_keywords: DomainKeyword[];
}

/**
 * The derived overview behind the Websites → Overview strip.
 *
 * Every field here is produced by `get_website_search_metrics` /
 * `seo_website_health_summary` / `seo_website_gsc_summary` and is only FORMATTED
 * on the client. In particular the `status` on each metric is the SQL's verdict
 * on whether the number can be trusted — the UI never re-decides that, so a tile
 * and a report reading the same RPC cannot disagree about whether a figure is
 * real. See `components/core/Profile/seo/seoMetrics.ts`.
 */
export interface SeoOverview {
  website: {
    id: string;
    url: string;
    country_code: string | null;
    language_code: string | null;
    captured_at: string | null;
    snapshot_count: number;
    window_days: number;
  };
  metrics: Record<string, SeoMetricPayload>;
  positions: {
    status: string;
    note: string | null;
    total: number;
    buckets: { key: string; label: string; value: number | null }[];
    movement: { up: number | null; down: number | null; new: number | null; lost: number | null };
  };
}

export interface SeoMetricPayload {
  value: number | null;
  previous: number | null;
  delta: number | null;
  delta_pct: number | null;
  status: string;
  note: string | null;
  series: { date: string; v: number }[];
}

export interface SeoHealthSummary {
  status: string;
  note: string | null;
  audited_at: string | null;
  audit_count: number;
  issue_count: number | null;
  scores: Record<string, SeoMetricPayload>;
}

export interface SeoGscSummary {
  status: string;
  connected: boolean;
  window_days: number;
  note: string | null;
  metrics: Record<string, SeoMetricPayload>;
}

/**
 * Whether the thing that produces AI-visibility numbers is switched ON.
 *
 * Measured 2026-08-27: all 17 tracked subjects were `is_active = false`, so the
 * daily `llm-mention-probe-daily` cron found nothing to do and recorded
 * `succeeded` every night for 41 days — while the panel showed a confident 49.2%
 * share of voice from July. A surface reporting on a feed has to report the feed's
 * own health, or it presents stale numbers as current ones.
 */
export interface AiMonitoringState {
  subjects_total: number;
  subjects_active: number;
  subjects_llm_on: number;
  /** What the nightly cron will actually pick up. Zero = it runs and does nothing. */
  subjects_due_eligible: number;
  monitoring_on: boolean;
  last_probe_at: string | null;
  site_host: string;
  /** Answers "why does it report for other brands but not for our own site". */
  own_brand_tracked: boolean;
  own_brand_subject_id: string | null;
  own_brand_label: string | null;
  own_brand_inactive: boolean;
  diagnosis: string | null;
}

export interface GaSummary {
  status: string;
  note: string | null;
  window_days: number;
  property_id: string | null;
  property_name: string | null;
  last_sync_at: string | null;
  last_sync_error: string | null;
  metrics: Record<string, SeoMetricPayload>;
  channels: { channel: string; sessions: number | null; conversions: number | null }[];
}

export interface GaProperty { property: string; name: string; account: string }

export interface SeoReportRow {
  id: string;
  name: string;
  sections: string[];
  cadence: 'none' | 'weekly' | 'monthly';
  is_active: boolean;
  last_sent_at: string | null;
  next_due_at: string | null;
}

export interface SeoReportRunRow {
  id: string;
  generated_at: string;
  period_start: string | null;
  period_end: string | null;
  status: 'ok' | 'failed';
  error: string | null;
}

export interface CannibalItem {
  query: string;
  page_count: number;
  impressions: number;
  clicks: number;
  best_position: number | null;
  pages: { page: string; impressions: number; clicks: number; position: number | null }[];
  /** False when Google's preferred page is NOT the one earning the clicks. */
  leader_is_best_converter: boolean;
  severity: 'high' | 'medium' | 'low';
}

export interface CannibalReport {
  status: 'ok' | 'not_connected' | 'not_collected' | string;
  window_days: number;
  min_impressions?: number;
  queries_checked?: number;
  items: CannibalItem[];
  note: string | null;
}

export interface TrackedKeywordRow {
  id: string;
  keyword: string;
  country_code: string;
  device: string;
  tags: string[];
  /** Date of THIS keyword's most recent check — a capped run leaves part of the set on an older day. */
  captured_at: string | null;
  /** Non-organic blocks on the page that cite or show us (featured_snippet, ai_overview, people_also_ask, local_pack…). */
  owned_features: string[];
  /** NULL = not in the top 100. Never a sentinel rank. */
  position: number | null;
  found: boolean;
  url: string | null;
  error: string | null;
  search_volume: number | null;
  serp_features: string[];
  previous: number | null;
  /** Positive = moved UP the page (position decreased). */
  change: number | null;
  entered: boolean;
  lost: boolean;
  series: { date: string; v: number }[];
}

export interface RankSummary {
  status: 'ok' | 'not_collected' | 'collector_failed' | string;
  tracked: number;
  window_days: number;
  note: string | null;
  summary?: {
    captured_at: string;
    previous_at: string | null;
    /** When the most recently checked keyword was checked — a timestamp, unlike `captured_at`. */
    last_checked_at?: string | null;
    checked: number;
    answered: number;
    failed: number;
    ranking: number;
    not_ranking: number;
    avg_position: number | null;
    /** Share of tracked keywords in the top 10, over probes that answered. */
    visibility: number | null;
    distribution: Record<string, number>;
    /** Per SERP block: how many tracked pages HAVE it, and how many of those cite us. */
    features?: Record<string, { present: number; owned: number }>;
  };
  keywords?: TrackedKeywordRow[];
  visibility_trend?: { date: string; v: number }[];
}

/** The part of the provider's item a reader acts on, projected per issue type by the report RPC. */
export interface CrawlIssueDetail {
  /** non_indexable: robots_txt | meta_tag | http_header | attribute | too_many_redirects */
  reason?: string | null;
  /** redirect_chain */
  is_redirect_loop?: boolean | null;
  hop_count?: number | null;
  hops?: { from: string | null; to: string | null }[] | null;
  /** duplicate_tags: the duplicated title/description text and the pages sharing it */
  accumulator?: string | null;
  total_count?: number | null;
  pages?: (string | { url: string | null; similarity: number | null })[] | null;
  /** broken_link */
  link_from?: string | null;
  link_to?: string | null;
  /** broken_link (target) / error_page */
  status_code?: number | null;
}

export interface CrawlIssueGroup {
  issue_type: string;
  severity: 'error' | 'warning' | 'notice';
  count: number;
  /** Up to 25 per type; `count` says how many there are in all. */
  sample: { url: string | null; title: string | null; detail?: CrawlIssueDetail | null }[];
}

export interface CrawlReport {
  status: 'not_collected' | 'running' | 'finished' | 'collector_failed' | string;
  crawl_id?: string;
  crawl_count: number;
  task_id?: string | null;
  started_at?: string;
  finished_at?: string | null;
  pages_crawled?: number | null;
  pages_with_issues?: number | null;
  requested_pages?: number | null;
  onpage_score?: number | null;
  /** Per issue-class: ok | no_data | failed. A failed section is UNKNOWN, not zero. */
  section_status?: Record<string, string>;
  severity_counts?: Record<string, number>;
  issue_groups?: CrawlIssueGroup[];
  total_issues?: number;
  previous_total_issues?: number | null;
  error?: string | null;
  note?: string | null;
}

export interface CompetitorLine {
  key: string;
  label: string;
  domain?: string;
  is_self: boolean;
  source?: 'auto' | 'manual';
  points: { date: string; v: number }[];
  /** `not_collected` = tracked but never measured. Distinct from measured-and-empty. */
  status?: string;
}

export interface CompetitorSeries {
  metric: string;
  window_days: number;
  competitors_tracked: number;
  self: CompetitorLine | null;
  competitors: CompetitorLine[];
  note: string | null;
}

export interface CompetitorRow {
  id: string;
  competitor_domain: string;
  display_label: string | null;
  source: 'auto' | 'manual';
  is_active: boolean;
}

export interface AiVisibilityModelRow {
  model: string;
  probes: number;
  answered: number;
  failed: number;
  mentioned: number;
  cited: number;
  avg_position: number | null;
  /** NULL when nothing answered — that is "unknown", never 0%. */
  share_of_voice: number | null;
  status: string;
  note: string | null;
}

export interface AiVisibility {
  status: string;
  window_days: number;
  subjects_tracked: number;
  note: string | null;
  totals: {
    probes: number;
    answered: number;
    failed: number;
    mentioned: number;
    cited: number;
    with_citations: number;
    share_of_voice: number | null;
    avg_position: number | null;
    first_run_at: string | null;
    last_run_at: string | null;
    subjects_probed: number;
  };
  models: AiVisibilityModelRow[];
  subjects: {
    id: string; label: string; subject_type: string;
    probes: number; answered: number; mentioned: number;
    avg_position: number | null; share_of_voice: number | null; status: string;
  }[];
  competitors: { name: string; mentions: number }[];
  prompts: {
    template_key: string; prompt_text: string | null;
    probes: number; answered: number; mentioned: number; share_of_voice: number | null;
  }[];
  trend: { date: string; v: number | null; answered: number }[];
  sentiment: Record<string, number>;
}

export interface WebsiteHealth {
  id: number;
  url: string;
  status: 'ok' | 'error';
  perf_score: number | null;
  a11y_score: number | null;
  bp_score: number | null;
  seo_score: number | null;
  issues: { title: string; score: number; display_value: string | null }[] | null;
  /**
   * The 52 raw on-page booleans. `get_website_health` has always returned these —
   * `to_jsonb(h)` sends the whole row — but the type omitted them, so nothing
   * rendered them and the panel showed only failures. See `seo/onPageChecks.ts`.
   */
  onpage: {
    onpage_score?: number | null;
    meta?: Record<string, any> | null;
    page_timing?: Record<string, any> | null;
    checks?: Record<string, unknown> | null;
  } | null;
  lighthouse: { categories?: Record<string, { score?: number }> } | null;
  error: string | null;
  created_at: string;
}

export interface GscSummary {
  days: number;
  from: string;
  to: string;
  /**
   * The SQL's verdict on whether `totals` means anything (CLAUDE.md rule 3).
   *
   * `ok` — rows were stored for this window, so the figures are real, zeros included.
   * `no_data` — the sync works and this period genuinely had nothing.
   * `not_collected` — nothing has ever been stored for this site.
   *
   * `totals` still coalesces to zero for back-compat, which is exactly why this exists: a
   * never-synced site and a real week of nothing both produced `0 clicks · 0 impressions ·
   * 0.0% CTR · position 0.0`, and position 0.0 reads as better than first place.
   */
  status?: 'ok' | 'no_data' | 'not_collected' | string;
  /** Source rows behind the window — the evidence for `status`. */
  rows?: number;
  totals: { clicks: number; impressions: number; ctr: number; position: number };
  trend: GscTrendPoint[];
  top_queries: GscRow[];
  top_pages: GscRow[];
  devices: GscRow[];
  countries: GscRow[];
  appearances: GscRow[];
}

function normalizeUrl(raw: string): string {
  let s = raw.trim();
  if (!/^https?:\/\//i.test(s)) s = `https://${s}`;
  return s.replace(/\/+$/, '');
}

export const userWebsitesService = {
  /** List connected websites for a workspace (default first). Pass the active
   *  workspace id so multi-workspace users only see the current tenant's sites. */
  async list(workspaceId?: string | null): Promise<UserWebsite[]> {
    let q = supabase
      .from('user_websites')
      .select('*')
      .order('is_default', { ascending: false })
      .order('created_at', { ascending: false });
    if (workspaceId) q = q.eq('workspace_id', workspaceId);
    const { data, error } = await q;
    if (error) throw error;
    return (data as UserWebsite[]) || [];
  },

  async create(input: {
    url: string;
    workspace_id: string;
    sitemap_url?: string | null;
    display_name?: string | null;
    is_default?: boolean;
    max_pages?: number;
  }): Promise<UserWebsite> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');
    if (!input.workspace_id) throw new Error('workspace_id is required');

    const payload = {
      user_id: user.id,
      workspace_id: input.workspace_id,
      url: normalizeUrl(input.url),
      sitemap_url: input.sitemap_url ? input.sitemap_url.trim() : null,
      display_name: input.display_name?.trim() || null,
      is_default: !!input.is_default,
      max_pages: input.max_pages ?? 50,
    };

    const { data, error } = await supabase
      .from('user_websites')
      .insert(payload)
      .select('*')
      .single();
    if (error) throw error;
    return data as UserWebsite;
  },

  async update(id: string, patch: Partial<Pick<UserWebsite, 'url' | 'sitemap_url' | 'display_name' | 'is_default' | 'is_active' | 'max_pages'>>): Promise<UserWebsite> {
    const update: Record<string, any> = { ...patch };
    if (typeof update.url === 'string') update.url = normalizeUrl(update.url);
    if (typeof update.sitemap_url === 'string') update.sitemap_url = update.sitemap_url.trim() || null;
    if (typeof update.display_name === 'string') update.display_name = update.display_name.trim() || null;

    const { data, error } = await supabase
      .from('user_websites')
      .update(update)
      .eq('id', id)
      .select('*')
      .single();
    if (error) throw error;
    return data as UserWebsite;
  },

  async remove(id: string): Promise<void> {
    const { error } = await supabase.from('user_websites').delete().eq('id', id);
    if (error) throw error;
  },

  async listPages(websiteId: string, opts: { activeOnly?: boolean; limit?: number } = {}): Promise<UserWebsitePage[]> {
    let q = supabase
      .from('user_website_pages')
      .select('id, website_id, url, title, description, http_status, is_active, last_seen_in_sitemap, fetched_at')
      .eq('website_id', websiteId)
      .order('last_seen_in_sitemap', { ascending: false });
    if (opts.activeOnly !== false) q = q.eq('is_active', true);
    if (opts.limit) q = q.limit(opts.limit);
    const { data, error } = await q;
    if (error) throw error;
    return (data as UserWebsitePage[]) || [];
  },

  /** Trigger a manual crawl. Synchronous from the user's POV — wait for the response. */
  async crawl(websiteId: string): Promise<CrawlResult> {
    const { data, error } = await supabase.functions.invoke('crawl-user-website', {
      body: { website_id: websiteId, mode: 'full' },
    });
    if (error) throw error;
    if (!data?.success) throw new Error(data?.error || 'Crawl failed');
    return data.data as CrawlResult;
  },

  /**
   * Lightweight preview: fetch sitemap + 5-page Firecrawl sample so the user can
   * decide whether the site looks worth fully indexing before paying for the full crawl.
   */
  async preview(websiteId: string): Promise<PreviewResult> {
    const { data, error } = await supabase.functions.invoke('crawl-user-website', {
      body: { website_id: websiteId, mode: 'preview' },
    });
    if (error) throw error;
    if (!data?.success) throw new Error(data?.error || 'Preview failed');
    return data.data as PreviewResult;
  },

  // ── Per-website SEO dashboard ─────────────────────────────────────────────
  /** Aggregate counts for one website (workspace-guarded RPC). Null when the
   *  website is unknown / not accessible. */
  async overview(websiteId: string): Promise<WebsiteSeoOverview | null> {
    const { data, error } = await supabase.rpc('get_website_seo_overview', { p_website_id: websiteId });
    if (error) throw error;
    return (data as WebsiteSeoOverview | null) ?? null;
  },

  async articles(websiteId: string, limit = 50): Promise<SeoArticleRow[]> {
    const { data, error } = await supabase
      .from('seo_articles')
      .select('id, title, target_keyword, status, seo_score, readability_score, word_count, slug, created_at, completed_at')
      .eq('website_id', websiteId)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) throw error;
    return (data as SeoArticleRow[]) || [];
  },

  /**
   * Content decay per article (issue #349 C1).
   *
   * Reads the DERIVED view, never `updated_at`: any write touches that column, so an
   * article that has not been looked at in two years reports as fresh the moment
   * anything about it saves. `refresh_due_at` and `age_days` come from
   * `seo_article_refresh_due_at()` in SQL — the one definition of when a page is due.
   *
   * `seo_article_freshness` is security_invoker, so RLS on seo_articles is the boundary.
   */
  async freshness(websiteId: string, limit = 50): Promise<SeoArticleFreshnessRow[]> {
    const { data, error } = await supabase
      .from('seo_article_freshness' as never)
      .select('article_id, title, slug, target_keyword, published_at, last_reviewed_at, refresh_interval_days, refresh_due_at, age_days, is_due')
      .eq('website_id', websiteId)
      .order('refresh_due_at', { ascending: true })
      .limit(limit);
    if (error) throw error;
    return ((data as unknown) as SeoArticleFreshnessRow[]) || [];
  },

  /**
   * Record that a human has actually revisited the content.
   *
   * Separate from any write to the article because it is a DIFFERENT claim: saving a
   * title is not reviewing the substance, and a review date that any edit resets is the
   * `updated_at` problem again under a new name. `refresh_notified_at` is cleared so the
   * next cycle can raise it once more.
   */
  async markArticleReviewed(articleId: string): Promise<void> {
    const { error } = await supabase
      .from('seo_articles')
      .update({ last_reviewed_at: new Date().toISOString(), refresh_notified_at: null } as never)
      .eq('id', articleId);
    if (error) throw error;
  },

  async keywordResearch(websiteId: string, limit = 50): Promise<SeoKeywordResearchRow[]> {
    const { data, error } = await supabase
      .from('seo_keyword_research')
      .select('id, topic, target_keyword, language_code, total_keywords_found, total_addressable_volume, created_at, primary:research_data->recommendedPrimary')
      .eq('website_id', websiteId)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) throw error;
    const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
    return ((data as any[]) || []).map((r) => {
      const p = r.primary && typeof r.primary === 'object' ? r.primary : null;
      return {
        id: r.id, topic: r.topic, target_keyword: r.target_keyword, language_code: r.language_code ?? null,
        total_keywords_found: r.total_keywords_found, total_addressable_volume: r.total_addressable_volume,
        created_at: r.created_at,
        primary: p ? {
          search_volume: num(p.searchVolume), cpc: num(p.cpc), competition: num(p.competition),
          difficulty: num(p.keywordDifficulty), opportunity: num(p.opportunityScore),
          trend: typeof p.trend === 'string' ? p.trend : null, trend_delta: num(p.trendDelta),
        } : null,
      } as SeoKeywordResearchRow;
    });
  },

  /**
   * Titles of the site's indexed pages — the raw material for research suggestions.
   * A page's title is the keyword its author already chose for it, so "what should
   * I research" starts from what the site says it is about, not from a blank box.
   */
  async pageTitles(websiteId: string, limit = 400): Promise<{ url: string; title: string }[]> {
    const { data, error } = await supabase
      .from('user_website_pages')
      .select('url, title')
      .eq('website_id', websiteId).eq('is_active', true)
      .not('title', 'is', null).not('content_excerpt', 'is', null)
      .order('fetched_at', { ascending: false })
      .limit(limit);
    if (error) throw error;
    return ((data as { url: string; title: string | null }[]) || [])
      .filter((r): r is { url: string; title: string } => !!r.title);
  },

  /**
   * The queries Google already shows ONE page for — impressions, clicks, CTR and
   * impression-weighted position over the window. Demand that exists, on a page that
   * exists, measured by Google: the truest keyword suggestion there is for a page.
   */
  async pageGscQueries(websiteId: string, page: string, days = 90): Promise<PageGscQuery[]> {
    const { data, error } = await supabase.rpc('get_page_gsc_queries' as any, {
      p_website_id: websiteId, p_page: page, p_days: days,
    } as any);
    if (error) throw error;
    return (data as PageGscQuery[]) || [];
  },

  /**
   * Paid keyword ideas seeded from a page's title (DataForSEO, Greek market). One
   * credit-debited call; the edge function refuses before spending if the workspace
   * is not entitled or out of credits.
   */
  async pageKeywordIdeas(websiteId: string, page: string): Promise<PageKeywordIdeas> {
    const { data, error } = await supabase.functions.invoke('seo-api', {
      body: { action: 'page_ideas', website_id: websiteId, page },
    });
    if (error) throw new Error(await edgeErrorMessage(error, 'Could not fetch keyword ideas'));
    if (!data?.success) throw new Error(data?.error || 'Could not fetch keyword ideas');
    return data.data as PageKeywordIdeas;
  },

  /** The keyword strings this site tracks, lower-cased, for de-duplicating suggestions. */
  async trackedKeywordStrings(websiteId: string): Promise<Set<string>> {
    const { data, error } = await supabase
      .from('seo_tracked_keywords')
      .select('keyword')
      .eq('website_id', websiteId).eq('is_active', true);
    if (error) throw error;
    return new Set(((data as { keyword: string }[]) || []).map((r) => r.keyword.toLowerCase()));
  },

  /** Owner-only by RLS (`seo_keyword_research_owner`); a member who did not run it gets a refusal, not a silent no-op. */
  async deleteKeywordResearch(id: string): Promise<void> {
    const { data, error } = await supabase.from('seo_keyword_research').delete().eq('id', id).select('id');
    if (error) throw error;
    if (!data?.length) throw new Error('Only the person who ran this research can delete it.');
  },

  async toolkitRuns(websiteId: string, limit = 50): Promise<SeoResearchRunRow[]> {
    const { data, error } = await supabase
      .from('seo_research_runs')
      .select('id, kind, subject, success, starred, label, country_code, created_at')
      .eq('website_id', websiteId)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) throw error;
    return (data as SeoResearchRunRow[]) || [];
  },

  async trackedDomains(websiteId: string): Promise<SeoTrackedDomainRow[]> {
    const { data, error } = await supabase
      .from('seo_tracked_domains')
      .select('id, domain, display_label, country_code, is_active, current_domain_rank, current_organic_traffic, last_audited_at')
      .eq('website_id', websiteId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data as SeoTrackedDomainRow[]) || [];
  },

  /**
   * Track THIS website's own domain in the SEO toolkit (weekly rank + backlink
   * audit). The domain comes from the website's URL, never from a text box: the tab
   * that offers this reads "tracking for this website's domain", and a free-text
   * form is how a competitor ends up filed under the wrong site. Locale matches
   * the rank tracker's (Greek results). Idempotent — the table is unique on
   * user + domain + country, so a second click hands back the existing row and,
   * if that row was created from the admin toolkit without a website, attaches it.
   */
  async trackOwnDomain(website: UserWebsite, countryCode = 'GR', languageCode = 'el'): Promise<SeoTrackedDomainRow> {
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) throw new Error('Not authenticated');
    const domain = website.url
      .replace(/^https?:\/\//i, '').replace(/^www\./i, '').replace(/\/.*$/, '').trim().toLowerCase();
    if (!domain) throw new Error('This website has no usable domain.');
    const cols = 'id, domain, display_label, country_code, is_active, current_domain_rank, current_organic_traffic, last_audited_at';
    const { data, error } = await supabase
      .from('seo_tracked_domains')
      .insert({
        user_id: userData.user.id,
        workspace_id: website.workspace_id,
        website_id: website.id,
        domain,
        display_label: website.display_name || null,
        country_code: countryCode,
        language_code: languageCode,
        audit_cadence_hours: 168,
      })
      .select(cols)
      .single();
    if (!error) return data as SeoTrackedDomainRow;
    if (error.code !== '23505') throw error;
    const { data: existing, error: selErr } = await supabase
      .from('seo_tracked_domains')
      .select(`${cols}, website_id`)
      .eq('user_id', userData.user.id).eq('domain', domain).eq('country_code', countryCode)
      .maybeSingle();
    if (selErr) throw selErr;
    if (!existing) throw error;
    if (!existing.website_id) {
      const { error: upErr } = await supabase
        .from('seo_tracked_domains')
        .update({ website_id: website.id, workspace_id: website.workspace_id })
        .eq('id', existing.id);
      if (upErr) throw upErr;
    }
    return existing as SeoTrackedDomainRow;
  },

  /** Read one website by id (RLS lets any workspace member read it). */
  async get(websiteId: string): Promise<UserWebsite | null> {
    const { data, error } = await supabase.from('user_websites').select('*').eq('id', websiteId).maybeSingle();
    if (error) throw error;
    return (data as UserWebsite) ?? null;
  },

  // ── Google Search Console ────────────────────────────────────────────────
  async gscStatus(websiteId: string): Promise<GscStatus> {
    const { data, error } = await supabase.rpc('get_gsc_connection_status', { p_website_id: websiteId });
    if (error) throw error;
    return (data as GscStatus) ?? { connected: false };
  },

  async gscSummary(websiteId: string, days = 28): Promise<GscSummary | null> {
    const { data, error } = await supabase.rpc('get_gsc_summary', { p_website_id: websiteId, p_days: days });
    if (error) throw error;
    return (data as GscSummary) ?? null;
  },

  /** Returns the Google consent URL to redirect the browser to. */
  async gscAuthorize(websiteId: string): Promise<string> {
    const { data, error } = await supabase.functions.invoke('gsc-api', { body: { action: 'authorize', website_id: websiteId } });
    if (error) throw new Error(await edgeErrorMessage(error, 'Could not start Google sign-in'));
    if (!data?.auth_url) throw new Error(data?.error || 'No auth URL returned');
    return data.auth_url as string;
  },

  async gscListProperties(websiteId: string): Promise<{ property: string; permission?: string }[]> {
    const { data, error } = await supabase.functions.invoke('gsc-api', { body: { action: 'list_properties', website_id: websiteId } });
    if (error) throw new Error(await edgeErrorMessage(error, 'Could not list properties'));
    return (data?.properties as any[]) || [];
  },

  async gscSetProperty(websiteId: string, property: string): Promise<void> {
    const { data, error } = await supabase.functions.invoke('gsc-api', { body: { action: 'set_property', website_id: websiteId, property } });
    if (error) throw new Error(await edgeErrorMessage(error, 'Could not set property'));
    if (!data?.ok) throw new Error(data?.error || 'Could not set property');
  },

  async gscSync(websiteId: string, days = 28): Promise<{ rows: number }> {
    const { data, error } = await supabase.functions.invoke('gsc-api', { body: { action: 'sync', website_id: websiteId, days } });
    if (error) throw new Error(await edgeErrorMessage(error, 'Sync failed'));
    if (!data?.ok) throw new Error(data?.error || 'Sync failed');
    return { rows: data.rows ?? 0 };
  },

  async gscDisconnect(websiteId: string): Promise<void> {
    const { data, error } = await supabase.functions.invoke('gsc-api', { body: { action: 'disconnect', website_id: websiteId } });
    if (error) throw new Error(await edgeErrorMessage(error, 'Disconnect failed'));
    if (!data?.ok) throw new Error(data?.error || 'Disconnect failed');
  },

  // ── Site Health (Lighthouse + on-page audit) ─────────────────────────────
  async healthLatest(websiteId: string): Promise<WebsiteHealth | null> {
    const { data, error } = await supabase.rpc('get_website_health', { p_website_id: websiteId });
    if (error) throw error;
    return (data as WebsiteHealth) ?? null;
  },

  async healthRun(websiteId: string): Promise<WebsiteHealth> {
    const { data, error } = await supabase.functions.invoke('seo-site-audit', { body: { action: 'run', website_id: websiteId } });
    if (error) throw new Error(await edgeErrorMessage(error, 'Audit failed'));
    if (!data?.ok) throw new Error(data?.error || 'Audit failed');
    return data as WebsiteHealth;
  },

  // ── Rankings & Links (DataForSEO domain intel) ───────────────────────────
  async domainIntel(websiteId: string, days = 180): Promise<DomainIntel | null> {
    const { data, error } = await supabase.rpc('get_website_domain_intel', { p_website_id: websiteId, p_days: days });
    if (error) throw error;
    return (data as DomainIntel) ?? null;
  },

  /**
   * The derived search-metric strip.
   *
   * Named `get_website_search_metrics`, NOT `get_website_seo_overview` — that
   * name was already taken by `overview()` above, which returns aggregate record
   * counts. Adding a `(uuid, integer DEFAULT 180)` overload to it did not merely
   * read confusingly, it broke the original outright: a defaulted second argument
   * makes the one-argument call match both candidates, and Postgres refuses with
   * `42725 function ... is not unique` rather than picking. Keep the two names
   * distinct.
   *
   * `as any` on the RPC name is deliberate and unavoidable: `types.ts` is
   * generated from the remote schema and neither CI nor this checkout can
   * regenerate it (no Supabase access token), so a freshly-applied RPC is absent
   * from the generated union until someone with a token refreshes it. Casting the
   * NAME keeps the payload typed.
   */
  async seoOverview(websiteId: string, days = 180): Promise<SeoOverview | null> {
    const { data, error } = await supabase.rpc(
      'get_website_search_metrics' as any,
      { p_website_id: websiteId, p_days: days } as any,
    );
    if (error) throw error;
    return (data as SeoOverview) ?? null;
  },

  async seoHealthSummary(websiteId: string): Promise<SeoHealthSummary | null> {
    const { data, error } = await supabase.rpc(
      'seo_website_health_summary' as any,
      { p_website_id: websiteId } as any,
    );
    if (error) throw error;
    return (data as SeoHealthSummary) ?? null;
  },

  async seoGscSummary(websiteId: string, days = 28): Promise<SeoGscSummary | null> {
    const { data, error } = await supabase.rpc(
      'seo_website_gsc_summary' as any,
      { p_website_id: websiteId, p_days: days } as any,
    );
    if (error) throw error;
    return (data as SeoGscSummary) ?? null;
  },

  async gaSummary(websiteId: string, days = 28): Promise<GaSummary | null> {
    const { data, error } = await supabase.rpc(
      'seo_website_ga_summary' as any, { p_website_id: websiteId, p_days: days } as any,
    );
    if (error) throw error;
    return (data as GaSummary) ?? null;
  },

  async gaListProperties(websiteId: string): Promise<GaProperty[]> {
    const { data, error } = await supabase.functions.invoke('gsc-api', {
      body: { action: 'ga_list_properties', website_id: websiteId },
    });
    if (error) throw new Error(await edgeErrorMessage(error, 'Could not list Analytics properties'));
    if (!data?.ok) throw new Error(data?.error || 'Could not list Analytics properties');
    return data.properties ?? [];
  },

  async gaSetProperty(websiteId: string, gaPropertyId: string): Promise<void> {
    const { data, error } = await supabase.functions.invoke('gsc-api', {
      body: { action: 'ga_set_property', website_id: websiteId, ga_property_id: gaPropertyId },
    });
    if (error) throw new Error(await edgeErrorMessage(error, 'Could not select the property'));
    if (!data?.ok) throw new Error(data?.error || 'Could not select the property');
  },

  async gaSync(websiteId: string, days = 28): Promise<{ rows: number }> {
    const { data, error } = await supabase.functions.invoke('gsc-api', {
      body: { action: 'ga_sync', website_id: websiteId, days },
    });
    if (error) throw new Error(await edgeErrorMessage(error, 'Analytics sync failed'));
    if (!data?.ok) throw new Error(data?.error || 'Analytics sync failed');
    return data;
  },

  async listReports(websiteId: string): Promise<SeoReportRow[]> {
    const { data, error } = await supabase
      .from('seo_reports' as any)
      .select('id, name, sections, cadence, is_active, last_sent_at, next_due_at')
      .eq('website_id', websiteId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data as unknown as SeoReportRow[]) ?? [];
  },

  async listReportRuns(reportId: string, limit = 12): Promise<SeoReportRunRow[]> {
    const { data, error } = await supabase
      .from('seo_report_runs' as any)
      .select('id, generated_at, period_start, period_end, status, error')
      .eq('report_id', reportId)
      .order('generated_at', { ascending: false })
      .limit(limit);
    if (error) throw error;
    return (data as unknown as SeoReportRunRow[]) ?? [];
  },

  async createReport(
    websiteId: string, workspaceId: string,
    name: string, sections: string[], cadence: string,
  ): Promise<void> {
    const { error } = await supabase.from('seo_reports' as any).insert({
      website_id: websiteId, workspace_id: workspaceId,
      name: name.trim() || 'SEO report',
      sections, cadence, is_active: true,
      // Due immediately so the first one arrives without waiting a cycle — a report
      // you set up and then cannot see for a month reads as broken.
      next_due_at: cadence === 'none' ? null : new Date().toISOString(),
    } as any);
    if (error) throw error;
  },

  async deleteReport(id: string): Promise<void> {
    const { error } = await supabase.from('seo_reports' as any).delete().eq('id', id);
    if (error) throw error;
  },

  async runReport(reportId: string): Promise<{ run_id: string }> {
    const { data, error } = await supabase.functions.invoke('seo-reports', {
      body: { action: 'run', report_id: reportId },
    });
    if (error) throw new Error(await edgeErrorMessage(error, 'Could not build the report'));
    if (!data?.ok) throw new Error(data?.error || 'Could not build the report');
    return data;
  },

  async reportRunPayload(runId: string): Promise<any | null> {
    const { data, error } = await supabase
      .from('seo_report_runs' as any).select('payload').eq('id', runId).maybeSingle();
    if (error) throw error;
    return (data as any)?.payload ?? null;
  },

  async cannibalisation(websiteId: string, days = 90, minImpressions = 10): Promise<CannibalReport | null> {
    const { data, error } = await supabase.rpc(
      'get_website_cannibalisation' as any,
      { p_website_id: websiteId, p_days: days, p_min_impressions: minImpressions } as any,
    );
    if (error) throw error;
    return (data as CannibalReport) ?? null;
  },

  async rankSummary(websiteId: string, days = 90): Promise<RankSummary | null> {
    const { data, error } = await supabase.rpc(
      'get_website_rank_summary' as any, { p_website_id: websiteId, p_days: days } as any,
    );
    if (error) throw error;
    return (data as RankSummary) ?? null;
  },

  async addTrackedKeywords(
    websiteId: string, workspaceId: string, keywords: string[],
    countryCode: string, languageCode: string,
  ): Promise<number> {
    // De-duplicated and trimmed here so a pasted list with blank lines and repeats
    // does not become N-1 unique-violation round trips.
    const clean = [...new Set(
      keywords.map((k) => k.trim().toLowerCase()).filter((k) => k.length > 1),
    )].slice(0, 200);
    if (clean.length === 0) throw new Error('Enter at least one keyword.');
    const { error } = await supabase.from('seo_tracked_keywords' as any).upsert(
      clean.map((keyword) => ({
        website_id: websiteId, workspace_id: workspaceId, keyword,
        country_code: countryCode, language_code: languageCode,
        device: 'desktop', is_active: true,
      })) as any,
      { onConflict: 'website_id,keyword,country_code,device', ignoreDuplicates: true },
    );
    if (error) throw error;
    return clean.length;
  },

  async removeTrackedKeyword(id: string): Promise<void> {
    const { error } = await supabase.from('seo_tracked_keywords' as any).delete().eq('id', id);
    if (error) throw error;
  },

  async runRankCheck(websiteId: string): Promise<{ checked: number; ranking: number; failed: number }> {
    const { data, error } = await supabase.functions.invoke('seo-rank-tracker', {
      body: { action: 'run', website_id: websiteId },
    });
    if (error) throw new Error(await edgeErrorMessage(error, 'Rank check failed'));
    if (!data?.ok) throw new Error(data?.error || 'Rank check failed');
    return data;
  },

  async crawlReport(websiteId: string): Promise<CrawlReport | null> {
    const { data, error } = await supabase.rpc(
      'get_website_crawl_report' as any, { p_website_id: websiteId } as any,
    );
    if (error) throw error;
    return (data as CrawlReport) ?? null;
  },

  async startCrawl(websiteId: string, maxPages = 100): Promise<{ crawl_id: string }> {
    const { data, error } = await supabase.functions.invoke('seo-site-audit', {
      body: { action: 'crawl-start', website_id: websiteId, max_pages: maxPages },
    });
    if (error) throw new Error(await edgeErrorMessage(error, 'Could not start the crawl'));
    if (!data?.ok) throw new Error(data?.error || 'Could not start the crawl');
    return data;
  },

  async syncCrawl(websiteId: string): Promise<{ status?: string; issues?: number }> {
    const { data, error } = await supabase.functions.invoke('seo-site-audit', {
      body: { action: 'crawl-sync', website_id: websiteId },
    });
    if (error) throw new Error(await edgeErrorMessage(error, 'Could not refresh the crawl'));
    return data ?? {};
  },

  async competitorSeries(
    websiteId: string, days = 365, metric = 'organic_traffic',
  ): Promise<CompetitorSeries | null> {
    const { data, error } = await supabase.rpc(
      'get_website_competitor_series' as any,
      { p_website_id: websiteId, p_days: days, p_metric: metric } as any,
    );
    if (error) throw error;
    return (data as CompetitorSeries) ?? null;
  },

  async listCompetitors(websiteId: string): Promise<CompetitorRow[]> {
    const { data, error } = await supabase
      .from('seo_competitors' as any)
      .select('id, competitor_domain, display_label, source, is_active')
      .eq('website_id', websiteId)
      .order('competitor_domain');
    if (error) throw error;
    return (data as unknown as CompetitorRow[]) ?? [];
  },

  async addCompetitor(websiteId: string, workspaceId: string, domain: string): Promise<void> {
    // Normalised the same way `domainOf` normalises in the tracker, so 'https://Flobali.GR/x'
    // and 'flobali.gr' cannot become two rows tracking one company.
    const clean = domain.trim().toLowerCase()
      .replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];
    if (!clean || !clean.includes('.')) throw new Error('Enter a domain, e.g. flobali.gr');
    const { error } = await supabase.from('seo_competitors' as any).insert({
      website_id: websiteId, workspace_id: workspaceId,
      competitor_domain: clean, source: 'manual', is_active: true,
    } as any);
    if (error) throw error;
  },

  async removeCompetitor(id: string): Promise<void> {
    const { error } = await supabase.from('seo_competitors' as any).delete().eq('id', id);
    if (error) throw error;
  },

  async aiMonitoringState(websiteId: string): Promise<AiMonitoringState | null> {
    const { data, error } = await supabase.rpc(
      'get_website_ai_monitoring_state' as any,
      { p_website_id: websiteId } as any,
    );
    if (error) throw error;
    return (data as AiMonitoringState) ?? null;
  },

  async aiVisibility(websiteId: string, days = 90): Promise<AiVisibility | null> {
    const { data, error } = await supabase.rpc(
      'get_website_ai_visibility' as any,
      { p_website_id: websiteId, p_days: days } as any,
    );
    if (error) throw error;
    return (data as AiVisibility) ?? null;
  },

  async domainTrackRun(websiteId: string): Promise<void> {
    const { data, error } = await supabase.functions.invoke('seo-domain-tracker', { body: { action: 'run', website_id: websiteId } });
    if (error) throw new Error(await edgeErrorMessage(error, 'Snapshot failed'));
    if (!data?.ok) throw new Error(data?.error || 'Snapshot failed');
  },
};
