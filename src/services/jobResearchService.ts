/**
 * Job Research API client.
 *
 * Wraps MIVAA's `/api/v1/job-research/*` endpoints. Internal flow only —
 * external (api_key) consumers call MIVAA directly with a Bearer kai_* token.
 *
 * Cron-driven background discovery; user receives ONE consolidated email per
 * day at digest_hour_utc covering all of their tracked job searches. The KAI
 * agent emits `job_search_created` / `job_search_updated` / `job_searches_list`
 * / `job_listings_feed` / `job_digest_preview` chunks consumed by AgentHub.
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

// v0.5.1: kick the MIVAA sync helper after a direct-Supabase CRUD on
// job_research_sites. Fire-and-forget; if it fails the KB doc body lags by
// the next refresh tick. We swallow errors silently — the source of truth is
// the table, not the doc body.
async function _kickSitesKbSync(_siteType: string): Promise<void> {
  try {
    await api('/api/v1/job-research/sites/_resync', { method: 'POST' });
  } catch {
    /* non-fatal — doc body will resync on next cron or next CRUD */
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────

export type JobRelevance = 'match' | 'tangential' | 'mismatch' | 'unverifiable' | null;
export type JobSource = 'google_jobs' | 'perplexity_sonar' | 'firecrawl_careers' | 'rss_feed';
export type JobUserAction = 'saved' | 'applied' | 'dismissed' | 'interested';

export interface TrackedJob {
  id: string;
  user_id: string | null;
  api_key_id: string | null;
  workspace_id: string | null;
  label: string;
  keywords: string[];
  excluded_keywords: string[];
  location: string | null;
  country_code: string | null;
  remote_only: boolean;
  seniority: string | null;
  employment_type: string[];
  salary_min: number | null;
  salary_currency: string | null;
  excluded_companies: string[];
  preferred_companies: string[];
  sources_enabled: { google_jobs?: boolean; perplexity?: boolean; careers_pages?: boolean };
  careers_page_urls: string[];
  digest_enabled: boolean;
  digest_hour_utc: number;
  alert_channels: string[];
  alert_webhook_url: string | null;
  refresh_interval_hours: number;
  next_check_at: string | null;
  last_refreshed_at: string | null;
  last_digest_sent_at: string | null;
  current_listing_count_24h: number;
  current_listing_count_7d: number;
  current_top_companies: unknown;
  current_metadata: unknown;
  current_snapshot_at: string | null;
  is_active: boolean;
  auto_expand_keywords: boolean;
  total_billed_usd: number;
  total_partner_credits_debited: number;
  last_refresh_billed_usd: number | null;
  last_refresh_credits_debited: number | null;
  created_at: string;
  updated_at: string;
}

export interface JobListing {
  id: string;
  tracked_job_id: string;
  refresh_run_id: string;
  url: string;
  canonical_url: string;
  content_hash: string;
  title: string | null;
  company: string | null;
  company_domain: string | null;
  location: string | null;
  is_remote: boolean | null;
  salary_min: number | null;
  salary_max: number | null;
  salary_currency: string | null;
  salary_period: string | null;
  employment_type: string | null;
  seniority: string | null;
  description_excerpt: string | null;
  description_md: string | null;
  posted_at: string | null;
  expires_at: string | null;
  discovered_at: string;
  source: JobSource;
  relevance: JobRelevance;
  relevance_score: number | null;
  match_note: string | null;
  classifier_cached: boolean;
  digest_included_at: string | null;
  user_action: JobUserAction | null;
  user_action_at: string | null;
  user_notes: string | null;
  // v0.3 — annualized USD for cross-source comparison; raw fields above preserved
  salary_annual_min_usd: number | null;
  salary_annual_max_usd: number | null;
  salary_normalization_note: string | null;
}

export interface JobExclusion {
  id: string;
  tracked_job_id: string;
  url: string | null;
  domain: string | null;
  company: string | null;
  reason: string | null;
  created_at: string;
}

export interface JobSummary {
  days: number;
  total: number;
  matches: number;
  applied: number;
  saved: number;
  by_source: Record<string, number>;
  top_companies: Array<{ company: string; count: number }>;
}

export interface RefreshOutcome {
  refresh_run_id?: string;
  discovered?: number;
  deduped?: number;
  candidates_after_exclusions?: number;
  persisted?: number;
  matches?: number;
  skipped?: boolean;
  reason?: string;
}

// ─────────────────────────────────────────────────────────────────────────
// CRUD
// ─────────────────────────────────────────────────────────────────────────

export interface CreateTrackedJobInput {
  label: string;
  keywords: string[];
  excluded_keywords?: string[];
  location?: string;
  country_code?: string;
  remote_only?: boolean;
  seniority?: 'junior' | 'mid' | 'senior' | 'lead' | 'principal' | 'any';
  employment_type?: string[];
  salary_min?: number;
  salary_currency?: string;
  excluded_companies?: string[];
  preferred_companies?: string[];
  sources_enabled?: { google_jobs?: boolean; perplexity?: boolean; careers_pages?: boolean };
  careers_page_urls?: string[];
  digest_hour_utc?: number;
  alert_channels?: string[];
  alert_webhook_url?: string;
  refresh_interval_hours?: number;
  auto_expand_keywords?: boolean;
}

export type UpdateTrackedJobInput = Partial<CreateTrackedJobInput & {
  digest_enabled: boolean;
  is_active: boolean;
}>;

export const jobResearchService = {
  async create(input: CreateTrackedJobInput): Promise<TrackedJob> {
    const r = await api<{ tracked_job: TrackedJob }>(`/api/v1/job-research/track`, {
      method: 'POST',
      body: JSON.stringify(input),
    });
    return r.tracked_job;
  },

  async list(onlyActive = true): Promise<TrackedJob[]> {
    const r = await api<{ tracked_jobs: TrackedJob[] }>(
      `/api/v1/job-research/track?only_active=${onlyActive}`,
    );
    return r.tracked_jobs ?? [];
  },

  async get(id: string): Promise<TrackedJob> {
    const r = await api<{ tracked_job: TrackedJob }>(`/api/v1/job-research/track/${id}`);
    return r.tracked_job;
  },

  async update(id: string, patch: UpdateTrackedJobInput): Promise<TrackedJob> {
    const r = await api<{ tracked_job: TrackedJob }>(`/api/v1/job-research/track/${id}`, {
      method: 'PUT',
      body: JSON.stringify(patch),
    });
    return r.tracked_job;
  },

  async deactivate(id: string): Promise<void> {
    await api<{ ok: true }>(`/api/v1/job-research/track/${id}`, { method: 'DELETE' });
  },

  // ─────────────────────────────────────────────────────────────────────
  // Refresh / listings / summary
  // ─────────────────────────────────────────────────────────────────────

  async refresh(id: string, opts: { force?: boolean; force_full_discovery?: boolean } = {}): Promise<RefreshOutcome> {
    const qs = new URLSearchParams();
    if (opts.force) qs.set('force', 'true');
    if (opts.force_full_discovery) qs.set('force_full_discovery', 'true');
    return api<RefreshOutcome>(`/api/v1/job-research/track/${id}/refresh${qs.toString() ? '?' + qs.toString() : ''}`, {
      method: 'POST',
    });
  },

  async listListings(
    id: string,
    opts: { relevance?: 'match' | 'tangential' | 'unverifiable' | 'all'; days?: number; only_actionable?: boolean; limit?: number } = {},
  ): Promise<{ listings: JobListing[]; count: number }> {
    const qs = new URLSearchParams();
    if (opts.relevance) qs.set('relevance', opts.relevance);
    if (opts.days) qs.set('days', String(opts.days));
    if (opts.only_actionable) qs.set('only_actionable', 'true');
    if (opts.limit) qs.set('limit', String(opts.limit));
    return api<{ listings: JobListing[]; count: number }>(
      `/api/v1/job-research/track/${id}/listings?${qs.toString()}`,
    );
  },

  async summary(id: string, days = 30): Promise<JobSummary> {
    return api<JobSummary>(`/api/v1/job-research/track/${id}/summary?days=${days}`);
  },

  // ─────────────────────────────────────────────────────────────────────
  // Per-listing user actions (saved/applied/dismissed/interested)
  // ─────────────────────────────────────────────────────────────────────

  async markListing(listingId: string, action: JobUserAction, notes?: string): Promise<JobListing> {
    const r = await api<{ listing: JobListing }>(`/api/v1/job-research/listings/${listingId}/action`, {
      method: 'POST',
      body: JSON.stringify({ action, notes }),
    });
    return r.listing;
  },

  /** v0.3: classifier feedback — "wrong match" inserts a job_match_corrections row
   *  AND updates the listing's relevance inline. Recent corrections become Haiku
   *  few-shot examples on the next refresh, so the classifier "learns" the user's
   *  preferences without retraining. */
  async correctMatch(
    listingId: string,
    correctedRelevance: 'match' | 'tangential' | 'mismatch',
    reason?: string,
  ): Promise<void> {
    await api<{ ok: true }>(`/api/v1/job-research/listings/${listingId}/correct-match`, {
      method: 'POST',
      body: JSON.stringify({ corrected_relevance: correctedRelevance, reason }),
    });
  },

  // ─────────────────────────────────────────────────────────────────────
  // Exclusions
  // ─────────────────────────────────────────────────────────────────────

  async addExclusion(id: string, body: { url?: string; domain?: string; company?: string; reason?: string }): Promise<JobExclusion> {
    const r = await api<{ exclusion: JobExclusion }>(`/api/v1/job-research/track/${id}/exclude`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
    return r.exclusion;
  },

  async listExclusions(id: string): Promise<JobExclusion[]> {
    const r = await api<{ exclusions: JobExclusion[] }>(`/api/v1/job-research/track/${id}/exclusions`);
    return r.exclusions ?? [];
  },

  async removeExclusion(exclusionId: string): Promise<void> {
    await api<{ ok: true }>(`/api/v1/job-research/exclusions/${exclusionId}`, { method: 'DELETE' });
  },

  // ─────────────────────────────────────────────────────────────────────
  // Sites configuration (operator-curated job-board list)
  // Surfaced at /admin/knowledge-base/job-sources; reads open, writes admin-only via RLS.
  // ─────────────────────────────────────────────────────────────────────

  // v0.5.1: sites CRUD now goes via the Supabase client directly instead of
  // MIVAA. Reasons:
  //  - The data is just a typed table (`job_research_sites`) with RLS that
  //    already enforces "authenticated read, admin-only write". MIVAA was
  //    adding a redundant JWT-validation hop that was returning 401 in the
  //    user's browser session.
  //  - Faster (skips a network hop) and works regardless of MIVAA auth state.
  //  - KB-doc sync still happens — kick it via the kb-doc-sync edge function
  //    after each CRUD (fire-and-forget; doc body lags by a few seconds at most).

  async listSites(siteType?: JobSiteType): Promise<JobSite[]> {
    let q = supabase.from('job_research_sites').select('*').order('site_type').order('url_or_domain');
    if (siteType) q = q.eq('site_type', siteType);
    const { data, error } = await q;
    if (error) throw new Error(`listSites failed: ${error.message}`);
    return (data ?? []) as JobSite[];
  },

  async createSite(body: {
    site_type: JobSiteType;
    url_or_domain: string;
    display_name?: string;
    country_code?: string;
    category?: string;
    is_enabled?: boolean;
    notes?: string;
  }): Promise<JobSite> {
    const row = {
      site_type: body.site_type,
      url_or_domain: body.site_type === 'perplexity_domain'
        ? body.url_or_domain.trim().toLowerCase()
        : body.url_or_domain.trim(),
      display_name: body.display_name ?? null,
      country_code: body.country_code ? body.country_code.toUpperCase() : null,
      category: body.category ?? null,
      notes: body.notes ?? null,
      is_enabled: body.is_enabled !== false,
    };
    const { data, error } = await supabase
      .from('job_research_sites')
      .insert(row)
      .select('*')
      .single();
    if (error) {
      const msg = error.message.toLowerCase();
      if (msg.includes('duplicate') || msg.includes('unique') || error.code === '23505') {
        throw new Error('Already exists for this site type');
      }
      throw new Error(`createSite failed: ${error.message}`);
    }
    await _kickSitesKbSync(body.site_type);
    return data as JobSite;
  },

  async updateSite(siteId: string, patch: Partial<{
    url_or_domain: string;
    display_name: string;
    country_code: string;
    category: string;
    is_enabled: boolean;
    notes: string;
  }>): Promise<JobSite> {
    const clean: Record<string, unknown> = { ...patch };
    if (typeof clean.country_code === 'string') clean.country_code = (clean.country_code as string).toUpperCase();
    clean.updated_at = new Date().toISOString();
    const { data, error } = await supabase
      .from('job_research_sites')
      .update(clean)
      .eq('id', siteId)
      .select('*')
      .single();
    if (error) throw new Error(`updateSite failed: ${error.message}`);
    const site = data as JobSite;
    await _kickSitesKbSync(site.site_type);
    return site;
  },

  async deleteSite(siteId: string): Promise<void> {
    // Read site_type before delete so we know which doc-section to resync
    const { data: pre } = await supabase
      .from('job_research_sites')
      .select('site_type')
      .eq('id', siteId)
      .maybeSingle();
    const { error } = await supabase
      .from('job_research_sites')
      .delete()
      .eq('id', siteId);
    if (error) throw new Error(`deleteSite failed: ${error.message}`);
    if (pre?.site_type) await _kickSitesKbSync(pre.site_type as JobSiteType);
  },

  /** v0.5: bulk-insert multiple sites into the platform-wide default list.
   *  Idempotent — duplicates are silently skipped. v0.5.1: now goes via Supabase
   *  client directly (same reason as the single-row CRUDs above — avoids the
   *  MIVAA 401 path; RLS handles auth). KB doc kicked once at the end. */
  async createSitesBulk(body: {
    site_type: JobSiteType;
    urls: string[];
    country_code?: string;
    category?: string;
    notes?: string;
  }): Promise<{ site_type: string; requested: number; created: number; skipped: number; failed: Array<{ url_or_domain: string; error: string }> }> {
    const cleaned = new Set<string>();
    for (const raw of body.urls) {
      const u = (raw || '').trim();
      if (!u) continue;
      const key = body.site_type === 'perplexity_domain' ? u.toLowerCase() : u;
      cleaned.add(key);
    }
    const urls = Array.from(cleaned);
    if (urls.length === 0) throw new Error('No valid URLs');
    let created = 0;
    let skipped = 0;
    const failed: Array<{ url_or_domain: string; error: string }> = [];
    for (const u of urls) {
      const { error } = await supabase.from('job_research_sites').insert({
        site_type: body.site_type,
        url_or_domain: u,
        country_code: body.country_code ? body.country_code.toUpperCase() : null,
        category: body.category ?? null,
        notes: body.notes ?? null,
        is_enabled: true,
      });
      if (!error) {
        created++;
      } else if (error.code === '23505' || error.message.toLowerCase().includes('duplicate')) {
        skipped++;
      } else {
        failed.push({ url_or_domain: u, error: error.message });
      }
    }
    await _kickSitesKbSync(body.site_type);
    return { site_type: body.site_type, requested: urls.length, created, skipped, failed };
  },

  /** v0.5: bulk-append URLs to a specific tracked_job's careers_page_urls or
   *  rss_feed_urls. Reads the row, merges (dedupe case-insensitively), PUTs back.
   *  Also enables the corresponding sources_enabled flag if any URLs were added. */
  async appendUrlsToTrackedJob(
    trackedJobId: string,
    field: 'careers_page_urls' | 'rss_feed_urls',
    newUrls: string[],
  ): Promise<{ added: number; skipped_dup: number; tracked_job: TrackedJob }> {
    const current = await this.get(trackedJobId);
    const existing = new Set(((current as any)[field] || []).map((u: string) => u.trim().toLowerCase()));
    const cleaned = newUrls.map(u => u.trim()).filter(u => !!u);
    const fresh: string[] = [];
    let dup = 0;
    for (const u of cleaned) {
      if (existing.has(u.toLowerCase())) { dup++; continue; }
      existing.add(u.toLowerCase());
      fresh.push(u);
    }
    if (fresh.length === 0) {
      return { added: 0, skipped_dup: dup, tracked_job: current };
    }
    const merged = [...((current as any)[field] || []), ...fresh];
    const sourcesPatch = {
      ...current.sources_enabled,
      [field === 'careers_page_urls' ? 'careers_pages' : 'rss_feeds']: true,
    };
    const updated = await this.update(trackedJobId, {
      [field]: merged,
      sources_enabled: sourcesPatch,
    } as any);
    return { added: fresh.length, skipped_dup: dup, tracked_job: updated };
  },
};

// ─── Sites config types ──────────────────────────────────────────────────

export type JobSiteType = 'perplexity_domain' | 'rss_feed_default' | 'careers_page_default';

export interface JobSite {
  id: string;
  site_type: JobSiteType;
  url_or_domain: string;
  display_name: string | null;
  country_code: string | null;
  category: string | null;
  is_enabled: boolean;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export default jobResearchService;
