/**
 * Job Research Tools — agent-chat surface for the job-research module.
 *
 * Tools:
 *   - track_job_search        — create / pause / resume a tracked job search
 *   - list_my_job_searches    — read the user's existing tracked_jobs
 *   - find_jobs               — fetch recent matching listings for a tracked_job
 *   - get_job_digest_preview  — preview today's consolidated digest content
 *
 * Cost discipline: all four are 0-credit (DB reads + a backend round-trip).
 * The expensive part (discovery) runs on the cron tick, not on user demand.
 *
 * Module-gated: every tool first verifies `job-research` is enabled. If not,
 * returns a friendly error chunk without touching credits.
 */

const { tool } = await import('npm:@langchain/core@1.1.15/tools');
const { z } = await import('npm:zod@3.24.0');
const { createClient } = await import('npm:@supabase/supabase-js@2');

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const MIVAA_GATEWAY_URL = Deno.env.get('MIVAA_GATEWAY_URL') || 'https://v1api.materialshub.gr';

const MODULE_SLUG = 'job-research';

// ───────────────────────────────────────────────────────────────────────────
// Helpers
// ───────────────────────────────────────────────────────────────────────────

function svcClient() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
}

async function isModuleEnabled(): Promise<boolean> {
  try {
    const sb = svcClient();
    const { data } = await sb
      .from('modules')
      .select('enabled')
      .eq('slug', MODULE_SLUG)
      .maybeSingle();
    return Boolean(data?.enabled);
  } catch (_) {
    return false;
  }
}

async function callMivaa(
  path: string,
  init: RequestInit & { jwt?: string } = {},
): Promise<{ ok: boolean; status: number; data?: any; error?: string }> {
  const headers = new Headers(init.headers);
  headers.set('Content-Type', 'application/json');
  if (init.jwt) {
    headers.set('Authorization', `Bearer ${init.jwt}`);
  } else {
    headers.set('Authorization', `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`);
  }
  try {
    const resp = await fetch(`${MIVAA_GATEWAY_URL}${path}`, { ...init, headers });
    const text = await resp.text();
    let parsed: any = null;
    try { parsed = JSON.parse(text); } catch { parsed = text; }
    return { ok: resp.ok, status: resp.status, data: parsed, error: resp.ok ? undefined : String(parsed)?.slice(0, 200) };
  } catch (e) {
    return { ok: false, status: 0, error: e instanceof Error ? e.message : 'network error' };
  }
}

async function findUserTrackedJobByLabel(userId: string, label: string): Promise<any | null> {
  const sb = svcClient();
  const { data } = await sb
    .from('tracked_jobs')
    .select('*')
    .eq('user_id', userId)
    .ilike('label', label)
    .is('api_key_id', null)
    .maybeSingle();
  return data;
}

// ───────────────────────────────────────────────────────────────────────────
// 1) track_job_search — create / pause / resume
// ───────────────────────────────────────────────────────────────────────────

export const createTrackJobSearchTool = (
  userId: string,
  workspaceId: string,
  jwt: string | undefined,
  onChunk?: (chunk: any) => void,
  conversationId?: string | null,
) => {
  return tool(
    async ({
      action, label, keywords, excluded_keywords, location, country_code,
      remote_only, seniority, employment_type, salary_min, salary_currency,
      excluded_companies, preferred_companies, sources_enabled, careers_page_urls,
      digest_hour_utc, digest_day_of_week, alert_channels, refresh_interval_hours,
      tracked_job_id, pause_scope,
    }) => {
      if (!await isModuleEnabled()) {
        return JSON.stringify({ success: false, error: 'job-research module is disabled — ask an admin to enable it' });
      }

      onChunk?.({ type: 'tool_progress', status: `${action} job search "${label || tracked_job_id}"...`, timestamp: Date.now() });

      // Resolve target row by id or label
      let targetId = tracked_job_id;
      if (!targetId && label) {
        const existing = await findUserTrackedJobByLabel(userId, label);
        targetId = existing?.id;
      }

      // pause / resume → PUT is_active (or just digest_enabled when scope='digests_only')
      if (action === 'pause' || action === 'resume') {
        if (!targetId) return JSON.stringify({ success: false, error: 'tracked_job not found by label or id' });
        // v0.3.3: scoped pause. 'all' (default) stops refresh + digest. 'digests_only'
        // keeps refresh running silently — user still has fresh listings via find_jobs
        // and the AgentHub triage panel, just no email/chat-post at digest tick.
        const patch: Record<string, any> = {};
        if (pause_scope === 'digests_only') {
          patch.digest_enabled = action === 'resume';
        } else {
          patch.is_active = action === 'resume';
        }
        const r = await callMivaa(`/api/v1/job-research/track/${targetId}`, {
          method: 'PUT', jwt,
          body: JSON.stringify(patch),
        });
        if (!r.ok) return JSON.stringify({ success: false, error: r.error || `backend ${r.status}` });
        onChunk?.({
          type: 'job_search_updated',
          tracked_job_id: targetId,
          action,
          pause_scope: pause_scope || 'all',
          tracked_job: r.data?.tracked_job,
          timestamp: Date.now(),
        });
        return JSON.stringify({ success: true, scope: pause_scope || 'all', tracked_job: r.data?.tracked_job });
      }

      // delete
      if (action === 'delete') {
        if (!targetId) return JSON.stringify({ success: false, error: 'tracked_job not found by label or id' });
        const r = await callMivaa(`/api/v1/job-research/track/${targetId}`, { method: 'DELETE', jwt });
        if (!r.ok) return JSON.stringify({ success: false, error: r.error || `backend ${r.status}` });
        onChunk?.({ type: 'job_search_updated', tracked_job_id: targetId, action: 'deleted', timestamp: Date.now() });
        return JSON.stringify({ success: true });
      }

      // start / update — need keywords + label
      if (!keywords || keywords.length === 0) {
        return JSON.stringify({ success: false, error: 'keywords required (at least one)' });
      }

      const body: Record<string, any> = {
        label: label || keywords.join(' / '),
        keywords,
      };
      if (excluded_keywords?.length) body.excluded_keywords = excluded_keywords;
      if (location) body.location = location;
      if (country_code) body.country_code = country_code;
      if (remote_only !== undefined) body.remote_only = remote_only;
      if (seniority) body.seniority = seniority;
      if (employment_type?.length) body.employment_type = employment_type;
      if (salary_min !== undefined) body.salary_min = salary_min;
      if (salary_currency) body.salary_currency = salary_currency;
      if (excluded_companies?.length) body.excluded_companies = excluded_companies;
      if (preferred_companies?.length) body.preferred_companies = preferred_companies;
      if (sources_enabled) body.sources_enabled = sources_enabled;
      if (careers_page_urls?.length) body.careers_page_urls = careers_page_urls;
      if (digest_hour_utc !== undefined) body.digest_hour_utc = digest_hour_utc;
      if (digest_day_of_week !== undefined && digest_day_of_week !== null) body.digest_day_of_week = digest_day_of_week;
      if (alert_channels?.length) body.alert_channels = alert_channels;
      if (refresh_interval_hours !== undefined) body.refresh_interval_hours = refresh_interval_hours;
      // v0.2: thread the current chat conversation id through so the daily digest
      // posts back into THIS conversation as an assistant message.
      if (conversationId && action === 'start') body.source_conversation_id = conversationId;

      // If we found an existing row by label OR id was passed, treat as update
      if (targetId) {
        const r = await callMivaa(`/api/v1/job-research/track/${targetId}`, {
          method: 'PUT', jwt, body: JSON.stringify(body),
        });
        if (!r.ok) return JSON.stringify({ success: false, error: r.error || `backend ${r.status}` });
        onChunk?.({
          type: 'job_search_updated',
          tracked_job_id: targetId,
          action: 'updated',
          tracked_job: r.data?.tracked_job,
          timestamp: Date.now(),
        });
        return JSON.stringify({ success: true, tracked_job: r.data?.tracked_job });
      }

      // create
      const r = await callMivaa(`/api/v1/job-research/track`, {
        method: 'POST', jwt, body: JSON.stringify(body),
      });
      if (!r.ok) return JSON.stringify({ success: false, error: r.error || `backend ${r.status}` });
      onChunk?.({
        type: 'job_search_created',
        tracked_job: r.data?.tracked_job,
        timestamp: Date.now(),
      });
      return JSON.stringify({ success: true, tracked_job: r.data?.tracked_job });
    },
    {
      name: 'track_job_search',
      description: [
        'Create, update, pause, resume, or delete a background job search.',
        '',
        'SETUP CHECKLIST — when creating a search (action=start), ALWAYS collect these from the user, asking for anything missing before you create it:',
        '  1. JOBS / KEYWORDS — ask "Which roles? (list as many as you like, separated by commas)". Split their comma-separated answer into the `keywords` array and pass EVERY term — there is no limit, do not trim the list.',
        '  2. LOCATION — ask for a location, or "remote". Set `location` and/or `remote_only=true`.',
        '  3. DAILY EMAIL — ALWAYS ask "Do you want a daily email when new jobs are found?" If yes → alert_channels=["bell","email"]; if no → alert_channels=["bell"].',
        'Confirm the collected keywords + location + email choice back to the user before creating.',
        '',
        'When the user says things like:',
        '  • "find me jobs daily"           → digest_hour_utc=7 (or the hour they specify), digest_day_of_week=null, refresh_interval_hours=24',
        '  • "weekly summary on Mondays"    → digest_day_of_week=1 (0=Sunday..6=Saturday), refresh_interval_hours=168',
        '  • "every morning"                → digest_hour_utc=7',
        '  • "email me those jobs" / "send them to my email" → alert_channels=["bell","email"]  (email is ON by default; delivered via our Resend)',
        '  • "don\'t email me, just collect them" / "no emails" → alert_channels=["bell"]  (or action=pause with pause_scope="digests_only")',
        '  • "remote roles only"            → remote_only=true',
        '  • "Athens or remote"             → location="Athens, Greece" + remote_only=true',
        '  • "no agencies / staffing firms" → add to excluded_companies AS CALLER ENUMERATES THEM (do not invent names)',
        '',
        'CADENCE — a job search refreshes at most ONCE PER DAY (daily floor). There is NO hourly or',
        'sub-daily option: any "twice a day" / "every few hours" request is treated as daily (24h).',
        'Quiet searches auto-stretch to every few days, up to weekly. Never offer or imply hourly refresh.',
        '',
        'KEYWORD HANDLING — the platform automatically expands keywords on first save via Haiku.',
        'If the user says "Product Manager" the system auto-generates variants like',
        '"Senior Product Manager", "PM", "Product Lead", "Principal PM" and uses them in discovery.',
        'When confirming with the user, mention the expansion will happen ("I\'ll also catch related',
        'titles like Senior PM, Product Lead, etc.") and surface the result back via the',
        'job_search_created chunk so they can edit if needed.',
        '',
        'CONVERSATION POSTING — when run with action=start the system threads the CURRENT conversation',
        'id through automatically; the daily digest will post a job_findings card back into THIS chat',
        'thread (in addition to the email). The user can reopen this conversation and see the running',
        'history of findings.',
        '',
        'To find an existing search, pass either tracked_job_id or its label. The label is matched',
        'case-insensitively. To pause: action="pause". To resume: action="resume".',
      ].join('\n'),
      schema: z.object({
        action: z.enum(['start', 'update', 'pause', 'resume', 'delete']).default('start'),
        label: z.string().optional().describe('Human-readable name like "Senior React jobs in Athens". REQUIRED for action=start.'),
        tracked_job_id: z.string().optional().describe('UUID of an existing tracked job search; pass instead of label for update/pause/resume/delete'),
        keywords: z.array(z.string()).optional().describe('Search terms. Ask the user for their roles as a COMMA-SEPARATED list and pass EVERY term they give — no cap, do not trim. Split "Product Manager, Vibe Coder, Product Builder" into ["Product Manager","Vibe Coder","Product Builder"]. Each keyword is searched independently across Google Jobs + Perplexity. Required for action=start.'),
        excluded_keywords: z.array(z.string()).optional().describe('Keywords that should disqualify a match (e.g. ["junior","intern","contract"])'),
        location: z.string().optional().describe('Free-form location like "Athens, Greece" or "London, UK"'),
        country_code: z.string().optional().describe('ISO-2 country code (GR, US, UK, DE, …) — biases DataForSEO Google Jobs results to that locale'),
        remote_only: z.boolean().optional().describe('Set true when the user says "remote only", "WFH only", etc.'),
        seniority: z.enum(['junior','mid','senior','lead','principal','any']).optional().describe('Map "early career" → junior, "mid-level" → mid, "senior" → senior, "staff/principal" → principal, etc.'),
        employment_type: z.array(z.string()).optional().describe('e.g. ["full_time","contract","part_time","internship"]'),
        salary_min: z.number().int().optional(),
        salary_currency: z.string().optional().describe('USD / EUR / GBP / ...'),
        excluded_companies: z.array(z.string()).optional().describe('Companies to filter out — only use names the USER mentioned. Do NOT invent names.'),
        preferred_companies: z.array(z.string()).optional().describe('Reserved for future ranking; no behavioral effect today'),
        sources_enabled: z.record(z.boolean()).optional().describe('e.g. { google_jobs:true, perplexity:true, careers_pages:true }. Default: { google_jobs:true, perplexity:true, careers_pages:false }. Set careers_pages:true ONLY when the user pinned specific career page URLs.'),
        careers_page_urls: z.array(z.string()).optional().describe('Specific company career page URLs to scrape with Firecrawl, e.g. ["https://stripe.com/jobs", "https://vercel.com/careers"]'),
        digest_hour_utc: z.number().int().min(0).max(23).optional().describe('UTC hour for the daily consolidated email (default 7). Map "morning" → 7, "midday" → 12, "evening" → 18.'),
        digest_day_of_week: z.number().int().min(0).max(6).nullable().optional().describe('0=Sunday..6=Saturday. NULL/omit = daily. Set when the user wants a weekly digest on a specific day ("every Monday morning" → 1, "every Friday" → 5).'),
        alert_channels: z.array(z.string()).optional().describe('Subset of ["bell","email","webhook"] (default ["bell","email"])'),
        refresh_interval_hours: z.number().int().min(24).max(168).optional().describe('Base cadence between background refreshes, in hours. DAILY FLOOR: minimum 24 — sub-daily is not allowed (anything <24 is raised to 24). Default 24. Cron auto-stretches up to 168h on quiet searches.'),
        pause_scope: z.enum(['all', 'digests_only']).optional()
          .describe('For action=pause/resume. "all" (default) stops both refresh and digest. "digests_only" keeps refresh running silently — useful when the user wants to "stop emailing me but keep collecting findings I can ask for on demand". Maps to: all → is_active flag; digests_only → digest_enabled flag.'),
      }),
    },
  );
};

// ───────────────────────────────────────────────────────────────────────────
// 2) list_my_job_searches
// ───────────────────────────────────────────────────────────────────────────

export const createListMyJobSearchesTool = (
  userId: string,
  jwt: string | undefined,
  onChunk?: (chunk: any) => void,
) => {
  return tool(
    async ({ only_active = true }) => {
      if (!await isModuleEnabled()) {
        return JSON.stringify({ success: false, error: 'job-research disabled' });
      }
      const r = await callMivaa(`/api/v1/job-research/track?only_active=${only_active}`, { method: 'GET', jwt });
      if (!r.ok) return JSON.stringify({ success: false, error: r.error || `backend ${r.status}` });
      const tracked = r.data?.tracked_jobs ?? [];
      onChunk?.({
        type: 'job_searches_list',
        tracked_jobs: tracked,
        timestamp: Date.now(),
      });
      return JSON.stringify({ success: true, tracked_jobs: tracked });
    },
    {
      name: 'list_my_job_searches',
      description: 'List all tracked job searches the current user has set up. 0 credits.',
      schema: z.object({
        only_active: z.boolean().default(true),
      }),
    },
  );
};

// ───────────────────────────────────────────────────────────────────────────
// 3) find_jobs — read recent matched listings for a tracked_job
// ───────────────────────────────────────────────────────────────────────────

export const createFindJobsTool = (
  userId: string,
  jwt: string | undefined,
  onChunk?: (chunk: any) => void,
) => {
  return tool(
    async ({ label, tracked_job_id, days = 7, only_unactioned = false, limit = 25 }) => {
      if (!await isModuleEnabled()) {
        return JSON.stringify({ success: false, error: 'job-research disabled' });
      }
      let targetId = tracked_job_id;
      if (!targetId && label) {
        const existing = await findUserTrackedJobByLabel(userId, label);
        targetId = existing?.id;
      }
      if (!targetId) return JSON.stringify({ success: false, error: 'tracked_job not found by label or id' });

      onChunk?.({ type: 'tool_progress', status: `Loading recent matches (last ${days}d)...`, timestamp: Date.now() });

      const qs = new URLSearchParams({
        relevance: 'match',
        days: String(days),
        only_actionable: only_unactioned ? 'true' : 'false',
        limit: String(Math.min(limit, 100)),
      }).toString();
      const r = await callMivaa(`/api/v1/job-research/track/${targetId}/listings?${qs}`, { method: 'GET', jwt });
      if (!r.ok) return JSON.stringify({ success: false, error: r.error || `backend ${r.status}` });
      const listings = r.data?.listings ?? [];

      // ALWAYS pull the last run's empty-source report so every job answer ends
      // with "these boards returned nothing — check them manually". This is a
      // hard product rule: the report must be identical every time.
      let emptySources: string[] = [];
      let lastRefreshedAt: string | null = null;
      try {
        const sb = svcClient();
        const { data: tj } = await sb
          .from('tracked_jobs')
          .select('last_sources_empty, last_refreshed_at')
          .eq('id', targetId)
          .maybeSingle();
        emptySources = Array.isArray(tj?.last_sources_empty) ? tj!.last_sources_empty : [];
        lastRefreshedAt = tj?.last_refreshed_at ?? null;
      } catch (_) { /* report degrades gracefully, never blocks the listings */ }

      onChunk?.({
        type: 'job_listings_feed',
        tracked_job_id: targetId,
        days,
        listings,
        empty_sources: emptySources,
        last_refreshed_at: lastRefreshedAt,
        timestamp: Date.now(),
      });
      return JSON.stringify({
        success: true,
        count: listings.length,
        listings,
        empty_sources: emptySources,
        // Instruction the model MUST honour so reporting is always identical.
        reporting_instruction:
          'ALWAYS end your reply with a section titled "Sources that returned nothing this run — check manually" listing every url in empty_sources as clickable links, and tell the user to browse those by hand. If empty_sources is empty, state "All job boards returned results this run." Never omit this section.',
      });
    },
    {
      name: 'find_jobs',
      description:
        'Fetch recent matched job listings the platform discovered for one of the user\'s tracked job searches. Returns titles, companies, locations, salary, application URLs, AND `empty_sources` (job boards that returned nothing on the last run). 0 credits. To find a tracked job, pass either tracked_job_id or its label.\n\nMANDATORY REPORTING: after listing the jobs you MUST always append a section listing `empty_sources` (the boards that returned nothing) and suggest the user check those manually. This section appears every time, with or without jobs.',
      schema: z.object({
        label: z.string().optional(),
        tracked_job_id: z.string().optional(),
        days: z.number().int().min(1).max(90).default(7),
        only_unactioned: z.boolean().default(false).describe('If true, only listings the user has not yet saved/applied/dismissed'),
        limit: z.number().int().min(1).max(100).default(25),
      }),
    },
  );
};

// ───────────────────────────────────────────────────────────────────────────
// 4) get_job_digest_preview — what would today's email look like?
// ───────────────────────────────────────────────────────────────────────────

// ───────────────────────────────────────────────────────────────────────────
// 5) manage_job_sites — admin tool to curate the platform-wide job-board list
//
// Three site types:
//   - perplexity_domain     → Sonar search_domain_filter (cap 10)
//   - rss_feed_default      → suggested RSS feeds for new tracked_jobs
//   - careers_page_default  → suggested career pages for new tracked_jobs
//
// Lives in the 'Job Sources' KB category (access_level='agent' — agent reads
// it, public KB hides it). Writes are admin-gated via RLS at the DB level.
//
// When the user asks generically ("add a job site" with no fields), the tool
// emits a `job_sites_form_open` chunk so AgentHub can render a modal. When
// they give specifics ("add kariera.gr to the perplexity filter"), the tool
// just does it.
// ───────────────────────────────────────────────────────────────────────────

export const createManageJobSitesTool = (
  userId: string,
  jwt: string | undefined,
  onChunk?: (chunk: any) => void,
) => {
  return tool(
    async ({ action, site_type, url_or_domain, display_name, country_code, category, notes, site_id, is_enabled }) => {
      if (!await isModuleEnabled()) {
        return JSON.stringify({ success: false, error: 'job-research disabled' });
      }

      // No fields → open the modal form for the user to fill in. Useful when
      // the user says "add a job site" without specifics.
      if (action === 'open_form') {
        onChunk?.({
          type: 'job_sites_form_open',
          mode: 'add',
          default_site_type: site_type || 'perplexity_domain',
          timestamp: Date.now(),
        });
        return JSON.stringify({ success: true, mode: 'form_opened' });
      }

      if (action === 'list') {
        const qs = site_type ? `?site_type=${encodeURIComponent(site_type)}` : '';
        const r = await callMivaa(`/api/v1/job-research/sites${qs}`, { method: 'GET', jwt });
        if (!r.ok) return JSON.stringify({ success: false, error: r.error || `backend ${r.status}` });
        onChunk?.({
          type: 'job_sites_list',
          site_type: site_type || 'all',
          sites: r.data?.sites ?? [],
          timestamp: Date.now(),
        });
        return JSON.stringify({ success: true, sites: r.data?.sites ?? [] });
      }

      if (action === 'add') {
        if (!site_type || !url_or_domain) {
          // Open the form prefilled with what we have
          onChunk?.({
            type: 'job_sites_form_open',
            mode: 'add',
            default_site_type: site_type || 'perplexity_domain',
            prefill: { url_or_domain, display_name, country_code, category, notes },
            timestamp: Date.now(),
          });
          return JSON.stringify({ success: true, mode: 'form_opened', note: 'missing required fields; opened modal' });
        }
        const r = await callMivaa(`/api/v1/job-research/sites`, {
          method: 'POST', jwt,
          body: JSON.stringify({
            site_type, url_or_domain,
            display_name, country_code, category, notes,
            is_enabled: is_enabled !== false,
          }),
        });
        if (!r.ok) return JSON.stringify({ success: false, error: r.error || `backend ${r.status}` });
        onChunk?.({
          type: 'job_sites_updated',
          change: 'added',
          site: r.data?.site,
          timestamp: Date.now(),
        });
        return JSON.stringify({ success: true, site: r.data?.site });
      }

      if (action === 'remove' || action === 'toggle') {
        if (!site_id && !url_or_domain) {
          return JSON.stringify({ success: false, error: 'site_id or url_or_domain required' });
        }
        // Resolve site_id by url_or_domain if needed
        let resolved = site_id;
        if (!resolved) {
          const listR = await callMivaa(`/api/v1/job-research/sites${site_type ? '?site_type=' + site_type : ''}`, { method: 'GET', jwt });
          const match = (listR.data?.sites ?? []).find((s: any) =>
            (s.url_or_domain || '').toLowerCase() === (url_or_domain || '').toLowerCase()
          );
          if (!match) return JSON.stringify({ success: false, error: `no site matching '${url_or_domain}'` });
          resolved = match.id;
        }
        if (action === 'remove') {
          const r = await callMivaa(`/api/v1/job-research/sites/${resolved}`, { method: 'DELETE', jwt });
          if (!r.ok) return JSON.stringify({ success: false, error: r.error || `backend ${r.status}` });
          onChunk?.({ type: 'job_sites_updated', change: 'removed', site_id: resolved, timestamp: Date.now() });
          return JSON.stringify({ success: true });
        }
        // toggle
        const r = await callMivaa(`/api/v1/job-research/sites/${resolved}`, {
          method: 'PUT', jwt,
          body: JSON.stringify({ is_enabled: is_enabled !== false }),
        });
        if (!r.ok) return JSON.stringify({ success: false, error: r.error || `backend ${r.status}` });
        onChunk?.({ type: 'job_sites_updated', change: 'toggled', site: r.data?.site, timestamp: Date.now() });
        return JSON.stringify({ success: true, site: r.data?.site });
      }

      return JSON.stringify({ success: false, error: `unknown action: ${action}` });
    },
    {
      name: 'manage_job_sites',
      description: [
        'Manage the platform-wide list of job-board sites the engine searches.',
        '',
        'Use this when an admin says any of:',
        '  • "add kariera.gr to the search"                  → action=add, site_type=perplexity_domain, url_or_domain=kariera.gr',
        '  • "remove monster.com"                            → action=remove, url_or_domain=monster.com',
        '  • "which job boards do you search?"               → action=list',
        '  • "disable indeed.com for now"                    → action=toggle, url_or_domain=indeed.com, is_enabled=false',
        '  • "add a default RSS feed"                        → action=open_form, site_type=rss_feed_default',
        '  • "add a job site" (vague)                        → action=open_form (lets the user pick the type in the modal)',
        '',
        'For per-tracked-job overrides (this user\'s own career pages or RSS feeds for ONE search) use track_job_search instead — that puts them on `careers_page_urls` / `rss_feed_urls`. THIS tool is for the platform-wide defaults / Perplexity filter.',
        '',
        'Changes auto-sync into the "Job Sources" KB category (access_level=agent) so future agent context can read them. Writes require admin role at the DB level.',
      ].join('\n'),
      schema: z.object({
        action: z.enum(['list', 'add', 'remove', 'toggle', 'open_form']).default('list'),
        site_type: z.enum(['perplexity_domain', 'rss_feed_default', 'careers_page_default']).optional()
          .describe('Which list to operate on. Required for add. Optional for list (filter) and toggle.'),
        url_or_domain: z.string().optional().describe('The domain (e.g. "kariera.gr") for perplexity_domain, OR the full URL for RSS/career page.'),
        display_name: z.string().optional(),
        country_code: z.string().max(3).optional().describe('ISO-2'),
        category: z.string().optional().describe('e.g. tech / remote / startup / finance / general'),
        notes: z.string().optional(),
        site_id: z.string().optional().describe('UUID; alternative to url_or_domain for remove/toggle'),
        is_enabled: z.boolean().optional().describe('Used by toggle; defaults true on add'),
      }),
    },
  );
};

export const createGetJobDigestPreviewTool = (
  userId: string,
  jwt: string | undefined,
  onChunk?: (chunk: any) => void,
) => {
  return tool(
    async ({ days = 1 }) => {
      if (!await isModuleEnabled()) {
        return JSON.stringify({ success: false, error: 'job-research disabled' });
      }

      // Pull all of the user's tracked_jobs, then for each one collect the matches in the window.
      const sb = svcClient();
      const { data: tracked } = await sb
        .from('tracked_jobs')
        .select('id, label, digest_hour_utc, current_listing_count_24h, current_listing_count_7d')
        .eq('user_id', userId)
        .eq('is_active', true);

      const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
      const sections: any[] = [];
      let total = 0;
      for (const tj of (tracked ?? [])) {
        const { data: rows } = await sb
          .from('job_listings')
          .select('id, url, title, company, location, salary_min, salary_max, salary_currency, employment_type, posted_at, source, seniority, description_excerpt, relevance_score, match_note')
          .eq('tracked_job_id', tj.id)
          .eq('relevance', 'match')
          .gte('discovered_at', cutoff)
          .order('discovered_at', { ascending: false })
          .limit(10);
        if (rows && rows.length > 0) {
          sections.push({ tracked_job_id: tj.id, label: tj.label, listings: rows });
          total += rows.length;
        }
      }

      onChunk?.({
        type: 'job_digest_preview',
        days,
        total,
        section_count: sections.length,
        sections,
        timestamp: Date.now(),
      });

      return JSON.stringify({ success: true, total, section_count: sections.length, sections });
    },
    {
      name: 'get_job_digest_preview',
      description:
        'Preview what the user\'s consolidated daily job digest would look like right now: one section per tracked job search with the most recent matches. 0 credits.',
      schema: z.object({
        days: z.number().int().min(1).max(7).default(1).describe('Look-back window for the preview (default 24h, same as the actual digest)'),
      }),
    },
  );
};
