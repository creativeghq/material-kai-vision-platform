/**
 * SEO Toolkit API client.
 *
 * Two surfaces back the four `/admin/seo` dashboard tabs:
 *
 *   1. Direct Supabase reads from the new tables
 *      (seo_research_runs / seo_tracked_domains / seo_domain_audit_history)
 *      via supabase-js. RLS enforces user-scoping.
 *
 *   2. MIVAA `/api/v1/seo-agent/*` calls for live audits + research. Authed
 *      with the user's session JWT (NOT the cron secret — the dashboard is
 *      a user surface). The dispatcher route on MIVAA already accepts
 *      x-cron-secret for internal infra calls; we'll mirror the agent-tool
 *      path which goes through the agent-chat edge function rather than
 *      hitting MIVAA directly. That keeps the credit-attribution chain
 *      consistent.
 *
 * For NOW, the dashboard fires research by writing the request and
 * persisting via supabase, then invoking the seo-agent edge function (a
 * lightweight wrapper to be added — alternatively the dashboard can
 * bypass and call MIVAA with a user JWT once we expose a session-auth
 * version of /opportunities-stateless). To keep this branch lean we use
 * a hybrid: chat-driven research persists into seo_research_runs from the
 * agent tool side; the dashboard reads/displays history.
 */

import { supabase } from '@/integrations/supabase/client';

// ─────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────

export type SeoRunKind =
  | 'keyword_research'
  | 'keyword_difficulty' | 'keyword_suggestions' | 'search_intent'
  | 'keyword_overview' | 'ai_keyword_volume'
  | 'serp_audit' | 'historical_serps' | 'url_audit'
  | 'domain_snapshot' | 'ranked_keywords' | 'domain_competitors'
  | 'keyword_gap' | 'traffic_estimation' | 'subdomains'
  | 'relevant_pages' | 'categories_for_domain'
  | 'backlinks_summary' | 'backlinks_anchors' | 'referring_domains'
  | 'site_crawl' | 'content_sentiment' | 'domain_technologies' | 'domain_whois'
  | 'llm_mentions_search' | 'youtube_search' | 'local_pack' | 'google_trends'
  | 'amazon_asin' | 'app_keywords'
  | 'trustpilot_search' | 'pinterest_search' | 'reddit_search'
  | 'site_review' | 'brand_search_audit' | 'dataforseo_call';

export interface SeoResearchRun {
  id: string;
  user_id: string;
  workspace_id: string | null;
  kind: SeoRunKind | string;
  subject: string;
  request_params: Record<string, any>;
  response: Record<string, any> | null;
  country_code: string | null;
  language_code: string | null;
  cost_usd: number;
  latency_ms: number | null;
  success: boolean;
  error_message: string | null;
  label: string | null;
  starred: boolean;
  created_at: string;
}

export interface SeoTrackedDomain {
  id: string;
  user_id: string;
  workspace_id: string | null;
  domain: string;
  display_label: string | null;
  country_code: string | null;
  language_code: string;
  audit_cadence_hours: number;
  next_audit_at: string | null;
  last_audited_at: string | null;
  last_audit_id: string | null;
  current_domain_rank: number | null;
  current_ranking_keywords: number | null;
  current_organic_traffic: number | null;
  current_referring_domains: number | null;
  current_backlinks: number | null;
  is_active: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface SeoDomainAuditSnapshot {
  id: string;
  tracked_domain_id: string;
  user_id: string;
  domain_rank: number | null;
  ranking_keywords: number | null;
  organic_traffic: number | null;
  referring_domains: number | null;
  backlinks: number | null;
  spam_score: number | null;
  top_keywords: Array<Record<string, any>>;
  top_competitors: Array<Record<string, any>>;
  raw_sections: Record<string, any>;
  cost_usd: number;
  audited_at: string;
  source: 'cron' | 'manual' | 'first_run' | string;
}

// ─────────────────────────────────────────────────────────────────────
// Research history (tab: Keyword Research)
// ─────────────────────────────────────────────────────────────────────

export async function listResearchRuns(opts: {
  kinds?: SeoRunKind[];
  starredOnly?: boolean;
  limit?: number;
} = {}): Promise<SeoResearchRun[]> {
  let q = (supabase as any)
    .from('seo_research_runs')
    .select('*')
    .order('created_at', { ascending: false });
  if (opts.kinds?.length) q = q.in('kind', opts.kinds);
  if (opts.starredOnly) q = q.eq('starred', true);
  q = q.limit(opts.limit ?? 100);
  const { data, error } = await q;
  if (error) throw error;
  return (data || []) as SeoResearchRun[];
}

export async function getResearchRun(id: string): Promise<SeoResearchRun | null> {
  const { data, error } = await (supabase as any)
    .from('seo_research_runs')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return (data || null) as SeoResearchRun | null;
}

export async function setResearchRunStarred(id: string, starred: boolean): Promise<void> {
  const { error } = await (supabase as any)
    .from('seo_research_runs')
    .update({ starred })
    .eq('id', id);
  if (error) throw error;
}

export async function setResearchRunLabel(id: string, label: string | null): Promise<void> {
  const { error } = await (supabase as any)
    .from('seo_research_runs')
    .update({ label })
    .eq('id', id);
  if (error) throw error;
}

export async function deleteResearchRun(id: string): Promise<void> {
  const { error } = await (supabase as any)
    .from('seo_research_runs')
    .delete()
    .eq('id', id);
  if (error) throw error;
}

// ─────────────────────────────────────────────────────────────────────
// Tracked domains (tab: Domain Audit)
// ─────────────────────────────────────────────────────────────────────

export async function listTrackedDomains(): Promise<SeoTrackedDomain[]> {
  const { data, error } = await (supabase as any)
    .from('seo_tracked_domains')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []) as SeoTrackedDomain[];
}

export async function getTrackedDomain(id: string): Promise<SeoTrackedDomain | null> {
  const { data, error } = await (supabase as any)
    .from('seo_tracked_domains')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return (data || null) as SeoTrackedDomain | null;
}

export async function createTrackedDomain(input: {
  domain: string;
  display_label?: string | null;
  country_code?: string | null;
  language_code?: string;
  audit_cadence_hours?: number;
  notes?: string | null;
}): Promise<SeoTrackedDomain> {
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) throw new Error('Not authenticated');
  const payload = {
    user_id: userData.user.id,
    domain: input.domain.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, ''),
    display_label: input.display_label || null,
    country_code: input.country_code || null,
    language_code: (input.language_code || 'en').toLowerCase(),
    audit_cadence_hours: input.audit_cadence_hours ?? 168,
    notes: input.notes || null,
  };
  const { data, error } = await (supabase as any)
    .from('seo_tracked_domains')
    .insert(payload)
    .select('*')
    .single();
  if (error) throw error;
  return data as SeoTrackedDomain;
}

export async function updateTrackedDomain(
  id: string,
  patch: Partial<Pick<SeoTrackedDomain,
    'display_label' | 'audit_cadence_hours' | 'is_active' | 'notes'
  >>,
): Promise<void> {
  const { error } = await (supabase as any)
    .from('seo_tracked_domains')
    .update(patch)
    .eq('id', id);
  if (error) throw error;
}

export async function deleteTrackedDomain(id: string): Promise<void> {
  const { error } = await (supabase as any)
    .from('seo_tracked_domains')
    .delete()
    .eq('id', id);
  if (error) throw error;
}

// ─────────────────────────────────────────────────────────────────────
// Audit history (tab: Domain Audit detail trendline)
// ─────────────────────────────────────────────────────────────────────

export async function listAuditHistory(trackedDomainId: string, limit = 50): Promise<SeoDomainAuditSnapshot[]> {
  const { data, error } = await (supabase as any)
    .from('seo_domain_audit_history')
    .select('*')
    .eq('tracked_domain_id', trackedDomainId)
    .order('audited_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data || []) as SeoDomainAuditSnapshot[];
}

// ─────────────────────────────────────────────────────────────────────
// Re-audit trigger — invokes the seo-agent backend via the agent-chat
// edge function (so credit attribution stays consistent). The edge function
// fires the composite site-review and persists the snapshot via
// recordAuditSnapshot.
// ─────────────────────────────────────────────────────────────────────

export async function triggerAuditNow(trackedDomainId: string): Promise<{ ok: boolean; audit_id?: string; error?: string }> {
  // POST to a small edge function `seo-toolkit-audit` (to be added) that
  // (a) reads the tracked_domain row, (b) calls MIVAA /site-review with
  // x-cron-secret, (c) writes a seo_domain_audit_history row, (d) updates
  // the denormalised current_* fields on seo_tracked_domains.
  const { data, error } = await (supabase as any).functions.invoke('seo-api', {
    body: { action: 'toolkit_audit', tracked_domain_id: trackedDomainId, source: 'manual' },
  });
  if (error) return { ok: false, error: error.message || String(error) };
  return { ok: true, audit_id: data?.audit_id };
}

// ─────────────────────────────────────────────────────────────────────
// Persist a research run (called from agent tools after they get a result,
// OR from the dashboard's "save this" flow). Best-effort.
// ─────────────────────────────────────────────────────────────────────

export async function persistResearchRun(input: {
  kind: SeoRunKind | string;
  subject: string;
  request_params: Record<string, any>;
  response?: Record<string, any> | null;
  country_code?: string | null;
  language_code?: string | null;
  cost_usd?: number;
  latency_ms?: number | null;
  success?: boolean;
  error_message?: string | null;
  label?: string | null;
}): Promise<SeoResearchRun | null> {
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return null;
  const { data, error } = await (supabase as any)
    .from('seo_research_runs')
    .insert({
      user_id: userData.user.id,
      kind: input.kind,
      subject: input.subject.slice(0, 200),
      request_params: input.request_params,
      response: input.response ?? null,
      country_code: input.country_code ?? null,
      language_code: input.language_code ?? null,
      cost_usd: input.cost_usd ?? 0,
      latency_ms: input.latency_ms ?? null,
      success: input.success ?? true,
      error_message: input.error_message ?? null,
      label: input.label ?? null,
    })
    .select('*')
    .single();
  if (error) {
    console.warn('[seoToolkitApi] persistResearchRun failed:', error.message);
    return null;
  }
  return data as SeoResearchRun;
}

// ─────────────────────────────────────────────────────────────────────
// Aggregate stats for dashboard cards
// ─────────────────────────────────────────────────────────────────────

export async function getDashboardStats(): Promise<{
  research_run_count_30d: number;
  tracked_domain_count: number;
  total_audit_cost_30d: number;
  starred_count: number;
}> {
  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const [runsRes, domainsRes, starredRes] = await Promise.all([
    (supabase as any).from('seo_research_runs')
      .select('id, cost_usd', { count: 'exact' })
      .gte('created_at', cutoff),
    (supabase as any).from('seo_tracked_domains')
      .select('id', { count: 'exact', head: true })
      .eq('is_active', true),
    (supabase as any).from('seo_research_runs')
      .select('id', { count: 'exact', head: true })
      .eq('starred', true),
  ]);

  const totalCost = (runsRes.data || []).reduce(
    (sum: number, r: any) => sum + Number(r.cost_usd || 0), 0,
  );
  return {
    research_run_count_30d: runsRes.count ?? 0,
    tracked_domain_count: domainsRes.count ?? 0,
    total_audit_cost_30d: totalCost,
    starred_count: starredRes.count ?? 0,
  };
}
