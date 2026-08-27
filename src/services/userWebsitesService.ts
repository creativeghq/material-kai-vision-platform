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
  pages_discovered: number;
  error?: string;
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

export interface SeoKeywordResearchRow {
  id: string;
  topic: string;
  target_keyword: string;
  total_keywords_found: number | null;
  total_addressable_volume: number | null;
  created_at: string;
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
 * Every field here is produced by `get_website_seo_overview` /
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
  error: string | null;
  created_at: string;
}

export interface GscSummary {
  days: number;
  from: string;
  to: string;
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
      .select('id, topic, target_keyword, total_keywords_found, total_addressable_volume, created_at')
      .eq('website_id', websiteId)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) throw error;
    return (data as SeoKeywordResearchRow[]) || [];
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
   * The derived overview strip. `as any` on the RPC name is deliberate and
   * unavoidable: `types.ts` is generated from the remote schema and neither CI
   * nor this checkout can regenerate it (no Supabase access token), so a
   * freshly-applied RPC is absent from the generated union until someone with
   * an access token refreshes it. Casting the NAME keeps the payload typed.
   */
  async seoOverview(websiteId: string, days = 180): Promise<SeoOverview | null> {
    const { data, error } = await supabase.rpc(
      'get_website_seo_overview' as any,
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
