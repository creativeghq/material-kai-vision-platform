/**
 * userWebsitesService — Connected websites for SEO inter-linking
 *
 * Talks to:
 *  - public.user_websites (CRUD via supabase-js, RLS-gated to auth.uid())
 *  - public.user_website_pages (read-only from frontend)
 *  - edge function `crawl-user-website` (manual recrawl)
 */

import { supabase } from '@/integrations/supabase/client';

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

function normalizeUrl(raw: string): string {
  let s = raw.trim();
  if (!/^https?:\/\//i.test(s)) s = `https://${s}`;
  return s.replace(/\/+$/, '');
}

export const userWebsitesService = {
  async list(): Promise<UserWebsite[]> {
    const { data, error } = await supabase
      .from('user_websites')
      .select('*')
      .order('is_default', { ascending: false })
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data as UserWebsite[]) || [];
  },

  async create(input: {
    url: string;
    sitemap_url?: string | null;
    display_name?: string | null;
    is_default?: boolean;
    max_pages?: number;
  }): Promise<UserWebsite> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const payload = {
      user_id: user.id,
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
};
