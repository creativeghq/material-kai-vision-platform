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
  clicks: number;
  impressions: number;
  ctr: number;       // percentage
  position: number;
}

export interface GscSummary {
  days: number;
  from: string;
  to: string;
  totals: { clicks: number; impressions: number; ctr: number; position: number };
  top_queries: GscRow[];
  top_pages: GscRow[];
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

  async gscCallback(websiteId: string, code: string, state: string): Promise<any> {
    const { data, error } = await supabase.functions.invoke('gsc-api', { body: { action: 'callback', website_id: websiteId, code, state } });
    if (error) throw new Error(await edgeErrorMessage(error, 'Google connection failed'));
    if (!data?.ok) throw new Error(data?.error || 'Google connection failed');
    return data;
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
};
