# Job Research — system reference & version history

> Extracted from CLAUDE.md 2026-07-29. Covers v0.1 (2026-05-14) through v0.3.5 (2026-05-23).
> API reference: [docs/api/job-research-api.md](api/job-research-api.md).

## Job Research v0.3.5 (2026-05-23 — post-deploy smoke iteration 2: rule_shortcut + cost RPC fixes)

After the v0.3.4 fixes deployed (Anthropic HTTP path + DataForSEO URL), iteration-2 smoke surfaced two more production bugs:

1. **`rule_shortcut` too strict — required literal substring match of full keywords.** Even with 11 Haiku-expanded keyword variants (`python developer`, `python engineer`, `sr python dev`, etc.), the rule's `_normalize(k) in blob` check requires the full keyword to be a substring. Real Perplexity titles like `Senior Backend Engineer (Python)` don't contain the literal substring `python developer` (word order doesn't match), so they were fast-dropped as mismatch BEFORE Haiku ever saw them. The classifier never got called; `persisted=0` even with 6 clearly-relevant Perplexity hits.
   **Fix**: token-based match. Tokenize keywords + blob (alphanumeric + `+#`/`-`), apply a small stoplist of generic role words (`engineer`, `developer`, `senior`, `manager`, `lead`, `staff`, etc.) so they don't single-handedly count, then require at least one shared distinctive token. Fast-promote to `match` when a distinctive token hits the title. Ambiguous → Haiku. Committed in [job_classifier_service.py](mivaa-pdf-extractor/app/services/integrations/job_classifier_service.py) as `557f007`.

2. **`stamp_job_refresh_cost` RPC silently failed forever** — referenced `platform_credits_debited` column which doesn't exist (`ai_usage_logs` actually has `credits_debited`). Postgres parse error on every call, caught by the Python wrapper's `try/except`, swallowed. `tracked_jobs.total_billed_usd` stayed `0.0` even though Perplexity charged real money per refresh.
   **Fix**: applied via `mcp__supabase__apply_migration` — both `stamp_job_refresh_cost` and `recompute_job_cost` now SUM `credits_debited`. Backfilled the existing test row to pick up its historical cost.

Both bugs are textbook "live-only" — typecheck and static analysis can't catch wrong column names in RPC strings, and the rule_shortcut's substring check looks reasonable in isolation but breaks against real-world title shapes you only see by calling Perplexity.

---

## Job Research v0.3.4 (2026-05-23 — post-deploy bugfixes surfaced by external smoke test)

First end-to-end smoke against the deployed module (external `kai_*` API → `POST /api/v1/jobs/track` with synchronous first refresh) surfaced two production-only bugs that didn't show in static checks:

1. **`AsyncMessages.create() got an unexpected keyword argument 'tools'`** — the deployed MIVAA used to pin `anthropic==0.23.1` (beta-era SDK that didn't accept `tools` on `messages.create()`). `job_classifier_service` / `job_keyword_expansion_service` worked around it via raw httpx. **Resolution (2026-05-23)**: the anthropic SDK was removed from the codebase entirely and replaced with `claude_helper._call_anthropic_async/sync` (raw httpx → `/v1/messages`) + a `_AnthropicShim*` in `ai_client_service` that preserves the `.messages.create()` API for back-compat. No more SDK pin trap. The job_classifier / job_keyword raw-httpx code paths were left in place — they're working code and match the now-canonical pattern.
2. **DataForSEO Google Jobs URL was 404'ing** — I used `/serp/google_jobs/live/advanced` (underscore-separated), correct path is `/serp/google/jobs/live/advanced` (slash-separated). Also widened the response `item.type` filter to accept both `google_jobs_serp` (legacy) and `jobs_element` (current) for forward compat. Fix in [job_search_service.py](mivaa-pdf-extractor/app/services/integrations/job_search_service.py).

Both bugs traced to: code paths that only get exercised on live deploys + paid APIs. Static smoke checks and typecheck won't surface them. Lesson: a real curl-against-prod is part of "done", not a nice-to-have.

**Diagnostic case** (the 2026-05-23 smoke test):
- POST `/api/v1/jobs/track` with `keywords: ["senior python developer", "staff python engineer"]`, `remote_only: true`, `run_first_refresh: true`
- Row created, 5 credits debited, `last_keywords_expanded_at` stamped, `first_refresh: {discovered: 15, deduped: 15, persisted: 0, matches: 0, by_source: {google_jobs: 0, perplexity: 15}}`
- `ai_usage_logs` showed: keyword_expansion = error (tools kwarg), dataforseo_jobs = 404, perplexity_sonar-pro = success (15 hits), classifier = error (tools kwarg)
- Net: user paid 5 credits + ~$0.018 Perplexity cost and got zero persisted listings.

**Cost discipline gap** (not yet fixed): the external route's refund check only fires on `first_refresh.error`; doesn't fire when classifier-failed-wholesale leads to `persisted=0`. Open follow-up — should refund when no listings survived AND classifier batches all failed.

---

## Job Research v0.3.3 (2026-05-15 — admin-stop bridge + KB category consolidation + scoped pause)

Three corrections on top of v0.3.2:

1. **Admin-stop bridge.** Previously the `/admin/background-agents` enable/disable toggle on a job-research row was a no-op for the engine — the refresh cron reads `tracked_jobs.is_active` directly, not `background_agents.enabled`. New AFTER UPDATE trigger `background_agents_sync_tracked_job_active` mirrors the toggle: disabling a job-research agent at the admin panel now actually stops the cron AND flips the user's row to inactive (so they see "paused" in their own listings). Function `_sync_tracked_job_active_from_bg_agent()` is SECURITY DEFINER and only acts when `agent_type = 'job-research'` and `enabled` changed.

2. **KB consolidation** — `Job Sources` category → `Internal Configuration` (generic, future-proof). Three per-site_type docs → **one** consolidated `Job Research Sites` doc with three sections (Perplexity domain filter / Default RSS feeds / Default career pages). Sibling docs for other internal configs (mention outlets, price retailers, etc.) can live in the same category. Sync helper [job_sites_kb_sync.py](mivaa-pdf-extractor/app/services/integrations/job_sites_kb_sync.py) rewritten to render the single doc; legacy `sync_one_site_type()` kept as a no-op alias that calls `sync_all()` so route callers don't break.

3. **Scoped pause.** `track_job_search` action=pause now accepts `pause_scope: 'all' | 'digests_only'`. Default `all` flips `is_active=false` (stops refresh + digest). `digests_only` flips `digest_enabled=false` (refresh keeps running silently; user can still ask "what new jobs did you find?" via `find_jobs` and gets the AgentHub triage panel; just no emails/chat-posts at digest tick). Broader NL vocab in the prompt — "stop", "cancel", "turn off", "kill", "snooze", "disable" all map to pause; "got a job, stop" confirms then maps to delete.

**JARVIS prompt addendum** rewritten with explicit two-scope STOP section + the new generic category name.

---

## Job Research v0.3.2 (2026-05-15 — sites list moved to KB category + agent-driven flow with modal — superseded by v0.3.3)

Correction to v0.3.1. The previous attempt added a standalone admin page at `/admin/knowledge-base/job-sources`. That was wrong — operator wanted (a) the list as a proper KB category with `access_level='agent'` so the agent reads it but the public KB hides it, and (b) all add/edit flows to go through the JARVIS agent (with a modal for vague requests), not through a dedicated admin page.

**What changed vs v0.3.1:**
- ❌ **Deleted**: `src/pages/Admin/JobResearchSitesPage.tsx` + its route in `src/App.tsx`. No more standalone admin page.
- 🆕 **KB category `Job Sources`** ([kb_categories](src/components/Admin/KnowledgeBase/CategoryManager.tsx) with `access_level='agent'`, trigger_keyword='job sources'). Three child kb_docs (one per `site_type`) auto-rendered as Markdown tables of the current sites. Visible in admin KB; hidden from `PublicKnowledgeBasePage` which filters `access_level='public'`. Agent can search them via the standard KB search tool.
- 🆕 **Sync helper** [job_sites_kb_sync.py](mivaa-pdf-extractor/app/services/integrations/job_sites_kb_sync.py) — after every CRUD on `job_research_sites`, calls `sync_one_site_type(site_type)` which rewrites the corresponding kb_doc body with a fresh Markdown table (enabled rows in a table, disabled in a strike-through list, with timestamp). Wired into `POST/PUT/DELETE /api/v1/job-research/sites[/{id}]` endpoints.
- 🆕 **JARVIS tool `manage_job_sites`** ([job-research-tools.ts](supabase/functions/_shared/tools/job-research-tools.ts)). Actions: `list`, `add`, `remove`, `toggle`, `open_form`. Registered on the `kai` agent. Writes 401 for non-admins (RLS enforced at DB layer). When the user gives vague input ("add a job site"), the tool emits a `job_sites_form_open` chunk instead of guessing.
- 🆕 **AgentHub modal** [JobSitesFormModal.tsx](src/components/features/ai/JobSitesFormModal.tsx) — triggered by the `job_sites_form_open` chunk. Select site_type + fill URL/domain/country/category/notes → on submit, populates the input box with a structured prose message ("Please add this job site using manage_job_sites... site_type: …, url_or_domain: …") which the user reviews and sends. Re-invokes the tool with the concrete fields.
- 🆕 **JARVIS prompt addendum** updated — drops the dead `/admin/knowledge-base/job-sources` deep-link; teaches the agent the new `manage_job_sites` tool with NL→action mappings ("add kariera.gr" → action=add; vague "add a job site" → action=open_form to mount the modal).

**User flow now:**
1. User (in chat): *"add kariera.gr to the search"* → JARVIS calls `manage_job_sites(action=add, site_type=perplexity_domain, url_or_domain=kariera.gr)` → row inserted → kb_doc resync → confirmation in chat.
2. User (vague): *"I want to add a job site"* → JARVIS calls `manage_job_sites(action=open_form)` → AgentHub mounts the modal → user fills fields → submits → input box populated → user reviews + sends → tool runs.
3. User (read): *"which job boards do you search?"* → JARVIS calls `manage_job_sites(action=list)` → enumerates from KB doc / DB.

**RLS model** (unchanged from v0.3.1):
- `job_research_sites`: reads open to authenticated, writes admin-only via role check.
- `kb_docs` under "Job Sources" category: workspace-scoped via existing KB RLS; `access_level='agent'` on the category makes the public KB skip it.

---

## Job Research v0.3.1 (2026-05-15 — operator-curated sites list — superseded by v0.3.2)

Late-day follow-up after the v0.3 ship. The Perplexity domain filter had been hardcoded in `_DEFAULT_JOB_DOMAINS` since v0.1 — no way to add country-specific job boards (e.g. `kariera.gr`, `jobs.gr` for the Greek market) without a code change. **Fixed by moving the list into the DB with a hidden admin editor.**

- 🆕 **`job_research_sites` table** — operator-curated list with `site_type ∈ {perplexity_domain, rss_feed_default, careers_page_default}`, `url_or_domain`, optional `country_code` + `category`, `is_enabled` toggle, `notes`. RLS: reads open to authenticated, writes admin-only. Seeded with the previous 10 hardcoded domains.
- 🆕 **Hidden admin page** at `/admin/knowledge-base/job-sources` ([JobResearchSitesPage.tsx](src/pages/Admin/JobResearchSitesPage.tsx)). Three tabs (one per `site_type`), per-site enable/disable toggle, add-site dialog with country/category metadata. NOT registered in any nav config — reachable only via direct URL, KB-admin sidebar (if linked), or the JARVIS agent deep-link.
- 🆕 **CRUD endpoints** at `GET/POST/PUT/DELETE /api/v1/job-research/sites[/{id}]`. Reads return all rows for any authenticated user; writes 401 for non-admins (RLS enforced).
- ✏️ **`search_via_perplexity()`** now calls `_load_perplexity_domains_from_db()` first; falls back to the hardcoded constant only if the DB read fails or returns nothing. Perplexity's 10-domain cap is still enforced — extras are truncated alphabetically.
- ✏️ **JARVIS prompt addendum** updated with a "Job source sites configuration" paragraph instructing the agent to deep-link admins to `/admin/knowledge-base/job-sources` when they ask "which sites do you search?" / "add kariera.gr to the search" / "where do I configure job boards?".
- 📋 **Per-tracked_job overrides still win.** Setting `tracked_jobs.careers_page_urls` or `rss_feed_urls` per-search overrides the defaults. The DB list is for the *platform-wide* defaults.

**Where to add a new job board (operator workflow):**
1. Navigate to `/admin/knowledge-base/job-sources` (or ask JARVIS: "open the job sources admin page").
2. Pick the right tab (`perplexity_domain` for Sonar's filter, `rss_feed_default` for a feed-aggregator, `careers_page_default` for a specific company).
3. Click "Add site" → fill URL/domain + optional display name + country + category.
4. Toggle enabled. Takes effect on the next refresh tick.

---

## Job Research v0.3 (2026-05-15 — RSS + burst alerts + classifier feedback + external API + cross-conversation triage)

Closed out the v0.2 follow-up backlog. Changes since v0.2:

1. **RSS source adapter** — `search_via_rss_feeds()` in [job_search_service.py](mivaa-pdf-extractor/app/services/integrations/job_search_service.py) parses RSS 2.0 + Atom 1.0 feeds via `xml.etree`. New `tracked_jobs.rss_feed_urls text[]` column. Enabled per tracked_job via `sources_enabled.rss_feeds=true`. Free (no per-call billing). Source-priority dedupe rank: `firecrawl_careers > rss_feed > perplexity_sonar > google_jobs`.
2. **Salary normalization** — [job_salary_normalizer.py](mivaa-pdf-extractor/app/services/integrations/job_salary_normalizer.py) converts source-reported salary (`{min, max, currency, period}`) into annualized USD. Static FX table (refreshable quarterly), period multipliers for hour/day/week/month/year, magnitude-based period inference when source omits it, sanity floor/ceiling ($5k–$2M/yr). Persisted on new `job_listings.salary_annual_min_usd` + `salary_annual_max_usd` + `salary_normalization_note` columns. Original raw values preserved alongside.
3. **Real-time burst alert** — opt-in via `tracked_jobs.alert_on_burst boolean` + `burst_threshold int default 10`. After every refresh, if new matches ≥ threshold AND last_burst_alert_at > 2h ago, the dispatcher fires a chat-post + bell notification BETWEEN daily digests. Implementation: `JobDigestDispatcher.dispatch_burst_if_warranted()` called inline at the end of `JobResearchService.refresh()`. 24h cooldown enforced via `tracked_jobs.last_burst_alert_at`.
4. **Classifier feedback (full loop)** — new endpoint `POST /api/v1/job-research/listings/{id}/correct-match` (also on the public API at `POST /api/v1/jobs/track/listings/{id}/correct-match`). Inserts a `job_match_corrections` row + immediately updates the listing's `relevance` so the user sees feedback inline. The classifier ([job_classifier_service.py](mivaa-pdf-extractor/app/services/integrations/job_classifier_service.py)) now calls `_load_recent_corrections(tracked_job_id)` and prepends the most recent 5 as Haiku few-shot examples on the next batched classify call. AgentHub renders a "⚠ wrong" button on each listing in the inline `job_findings` card.
5. **External `api_keys` flow** — new file [job_tracking_routes.py](mivaa-pdf-extractor/app/api/job_tracking_routes.py) at `/api/v1/jobs/track/*`. 12 endpoints. Authenticates via the same `kai_*` Bearer flow used by `mention_tracking_routes` + `tracked_queries_routes`. Per-call partner billing via `JOB_OP_CREDIT_COST` (refresh=5cr, regenerate-keywords=2cr, others=0cr). Refunded automatically on hard failure / no-op outcomes. Returns `402 Insufficient credits` when balance is exhausted. Cron does NOT touch `api_key_id IS NOT NULL` rows — partners control their own refresh cadence.
6. **Cross-conversation triage UI** — replaces the dropped `/knowledge-base/job-sources` page from v0.1. New component [JobResearchSavedJobsPanel.tsx](src/components/Admin/BackgroundAgents/JobResearchSavedJobsPanel.tsx) auto-mounts inside `AgentRunHistoryDrawer` whenever the agent's `agent_type === 'job-research'`. Reads `agent.config.tracked_job_id` and surfaces saved/applied/interested/all-matches with per-listing actions (save, apply, dismiss, "wrong match"). Lives in the existing background-agents framework — no new admin page, just an inline panel above the run history.

**New tables/columns (v0.3 migration applied via `mcp__supabase__apply_migration`):**
- `tracked_jobs.rss_feed_urls text[]`
- `tracked_jobs.alert_on_burst boolean default false`
- `tracked_jobs.burst_threshold int default 10` (CHECK 1..100)
- `tracked_jobs.last_burst_alert_at timestamptz`
- `tracked_jobs.sources_enabled` default updated to include `rss_feeds: false`
- `job_listings.salary_annual_min_usd int`
- `job_listings.salary_annual_max_usd int`
- `job_listings.salary_normalization_note text`
- New index `job_listings_salary_annual_idx` on `(tracked_job_id, salary_annual_min_usd) WHERE relevance='match' AND salary_annual_min_usd IS NOT NULL`

**API surface additions** (see [docs/api/job-research-api.md](api/job-research-api.md) v0.3.0 changelog):
- Internal: `POST /api/v1/job-research/listings/{id}/correct-match`
- External (NEW namespace): `POST/GET/PUT/DELETE /api/v1/jobs/track/*` — 12 endpoints mirroring the internal flow with `kai_*` Bearer auth + per-call credit metering

**Frontend additions:**
- `jobResearchService.correctMatch()` API client method
- `JobResearchSavedJobsPanel` mounts inside `AgentRunHistoryDrawer` for `agent_type='job-research'`
- "⚠ wrong" button on each listing in the AgentHub inline `job_findings` card

**Cost discipline:**
- RSS: free (no upstream billing)
- Salary normalization: pure local computation, no API
- Burst alert: same channels as digest (bell free, email 1cr only when actively sent — but burst alert chat-posts are free; emails are NOT auto-sent on burst, only chat+bell)
- Classifier few-shot: ~5 extra prompt tokens × 5 examples ≈ negligible token cost on top of the existing classify call
- External API: 5cr/refresh, 2cr/regenerate-keywords, 0cr for reads + corrections. Same rate as internal-flow ai_usage_logs.

---

## Job Research v0.2 (2026-05-15 — background-agents integration + chat-posting + auto keyword expansion)

Architecture rework on top of v0.1.0. Three corrections:

1. **Background-agents bookkeeping** — every `tracked_jobs` row now also gets a `background_agents` row (type=`job-research`) so the search appears in `/admin/background-agents` alongside other background agents. Each refresh writes one `agent_runs` row + per-source `agent_run_logs` entries (DataForSEO / Sonar / Firecrawl outcomes, dedupe counts, persisted+match counts). FK on `tracked_jobs.background_agent_id`. Helpers in [mivaa-pdf-extractor/app/services/integrations/job_agent_runs.py](mivaa-pdf-extractor/app/services/integrations/job_agent_runs.py) — start_run / append_log / complete_run / fail_run.
2. **Chat-posting (primary user surface)** — when the JARVIS agent creates a tracked_job via `track_job_search`, the current `conversation_id` is captured on `tracked_jobs.source_conversation_id`. After every daily digest tick, the dispatcher inserts a new assistant message into THAT `agent_chat_messages` thread with `metadata.chunk_type = 'job_findings'` carrying the listings. The user reopens the conversation and sees the running history of findings rendered as a rich card by AgentHub. Email digest still goes out in parallel — chat is the in-product surface, email is the outside-the-app surface.
3. **Auto keyword expansion (default-on, was opt-in)** — `JobResearchService.create()` now synchronously calls Haiku tool-use ([job_keyword_expansion_service.py](mivaa-pdf-extractor/app/services/integrations/job_keyword_expansion_service.py)) which returns `{title_variants, seniority_variants, abbreviations, rejected_terms}`. Persisted on `tracked_jobs.expanded_keywords`. Discovery uses `keywords ∪ expanded_keywords`. Re-runnable via `POST /track/{id}/regenerate-keywords`. So "Product Manager" automatically catches "Senior PM", "Product Lead", "Principal PM", etc.

**Other v0.2 changes:**
- **Synchronous first refresh**: `create()` now runs the full discovery + classifier pipeline inline before returning. The JARVIS agent's tool reply contains real findings counts on first save instead of "wait an hour for the cron".
- **Weekly cadence support**: new `tracked_jobs.digest_day_of_week` column (0=Sunday..6=Saturday, NULL=daily). The `get_tracked_jobs_due_for_digest` RPC was rewritten to honor it. Lets the user say "every Monday morning" and have the digest only fire on Mondays.
- **Hidden KB page DROPPED**: `/knowledge-base/job-sources` is gone. The chat is the user surface; `/admin/background-agents` is the ops surface. The page added churn for no value once chat-posting was wired.
- **Action URL**: bell-notification + email "Open" links now deep-link to the conversation (`/agent-hub?conversation=<id>`) instead of the deleted KB page. Falls back to `/agent-hub?q=...` when no source_conversation_id is set.
- **JARVIS agent prompt addendum** added to the live `prompts` row (key='kai') with idempotent `--BEGIN_JOB_RESEARCH_ADDENDUM--` markers. Tells the agent how to map NL phrases ("daily" / "weekly" / "every Monday morning" / "twice a day") to the structured `digest_hour_utc` + `digest_day_of_week` + `refresh_interval_hours` fields, and instructs it to confirm scope before saving.
- **AgentHub `job_findings` card**: type definition + metadata restore + render block in [src/components/features/ai/AgentHub.tsx](src/components/features/ai/AgentHub.tsx). Renders per-listing url/company/location/salary/source. The cron-posted message arrives via the conversation-load metadata path, not the live streaming chunk handler — the `chunk_type === 'job_findings'` discriminator on stored metadata routes it into `jobFindingsData`.

**Removed in v0.2** (tracked_jobs columns no longer used in code paths but retained in schema):
- `auto_expand_keywords` boolean — column kept for back-compat; ignored. Expansion is unconditional now.

**API surface changes** (see [docs/api/job-research-api.md](api/job-research-api.md) v0.2 changelog for the full list):
- `POST /api/v1/job-research/track` is now async; accepts `source_conversation_id`, `digest_day_of_week`, `run_first_refresh` (default `true`).
- New: `POST /api/v1/job-research/track/{id}/regenerate-keywords` — re-runs Haiku expansion.
- `PUT /api/v1/job-research/track/{id}` accepts `digest_day_of_week`.

**JARVIS tool** now takes a 5th parameter `conversationId` from the agent-chat runtime; passes it as `source_conversation_id` on create. The tool description is rewritten with explicit NL-scheduling translation table.

---

## Job Research (2026-05-14 — background job-discovery agent + consolidated daily email — superseded by v0.2 above)

Per-user background agent that discovers job postings across **DataForSEO Google Jobs**, **Perplexity Sonar** (with `search_domain_filter` pinned to LinkedIn / Indeed / Glassdoor / WeWorkRemotely / RemoteOK / Wellfound / Dice / Monster / StackOverflow / YC), and **Firecrawl scraping of user-pinned career pages**. Runs hourly on a volatility-adaptive cadence (6h / 24h / 48h / 72h / 168h). Sends **ONE consolidated email per user per day** at the user's chosen `digest_hour_utc` covering all of their tracked job searches — not per-event alerts.

Cloned wholesale from the [[mention-monitoring]] template (subject row → history rows → cron-driven refresh → classifier verdict cache → adaptive cadence → email digest dispatcher → JARVIS agent tool surface). What's net-new: the 3 job-source adapters and the consolidated-digest dispatcher.

**Tables** (applied 2026-05-14 via `mcp__supabase__apply_migration`):
- `tracked_jobs` — subject. XOR check: internal flow has `user_id` set + `api_key_id IS NULL`; external API flow has `api_key_id` set + `user_id IS NULL`. CHECK constraint enforces exactly one. Includes denormalized snapshot (`current_listing_count_24h`, `current_listing_count_7d`, `current_top_companies`).
- `job_listings` — discovered postings. UNIQUE (`tracked_job_id`, `content_hash`) prevents double-insert across runs. `digest_included_at` marks rows already sent in a digest. `user_action ∈ {saved, applied, dismissed, interested}` for per-listing user feedback.
- `job_classifier_verdict_cache` — Haiku verdict cache, 7d TTL, keyed on sha1(`content_hash` + `facets_hash`). ~95% cache rate on stable searches across daily refreshes.
- `job_excluded_urls` — per-tracked_job blocklist (url / domain / company).
- `job_match_corrections` — classifier feedback loop (recent rows become Haiku few-shot examples on next call).
- `job_alert_log` — digest dispatch audit + 24h dedupe.
- `job_research_summary` — read-only view for the admin dashboard.

**RPCs**: `get_internal_tracked_jobs_due`, `get_tracked_jobs_due_for_digest`, `update_tracked_job_cadence`, `append_job_alert_log`, `stamp_job_refresh_cost`, `recompute_job_cost`. All `SECURITY DEFINER` — service role and edge functions call them across user boundaries; RLS still applies to direct client reads.

**Cron** (pg_cron):
- `job-research-refresh-hourly` (`45 * * * *`) → **`monitoring-cron?task=job-refresh`** → MIVAA `/cron-refresh`
- `job-research-digest-hourly` (`5 * * * *`) → **`monitoring-cron?task=job-digest`** → MIVAA `/cron-digest?current_hour_utc=<H>`. Each user's tracked_jobs whose `digest_hour_utc == H` and `last_digest_sent_at < today` receive ONE consolidated email covering all their searches.
- `job-classifier-cache-prune` (`30 4 * * *`) → DELETE expired verdict cache rows.

**Refresh pipeline** ([mivaa-pdf-extractor/app/services/integrations/job_research_service.py](mivaa-pdf-extractor/app/services/integrations/job_research_service.py)):
1. Build `JobFacets` from the tracked_job (keywords, location, remote_only, seniority, excluded_*).
2. Fan out across enabled sources in parallel (`asyncio.gather`):
   - `search_via_dataforseo_jobs` — POST `/serp/google_jobs/live/advanced` with keyword + location + country_code. ~$0.0006/req. Returns up to 30 hits.
   - `search_via_perplexity` — Sonar (or `sonar-pro` on first/forced refresh) with `search_domain_filter` + JSON-schema response. ~$0.005/sweep. Returns up to 15 hits with structured fields.
   - `search_via_firecrawl_careers` — for each pinned URL, POST `/v2/scrape` with the `_FirecrawlCareersPage` Pydantic schema. Pays Firecrawl credits per scrape.
3. URL canonicalize (strip tracking params) + cross-source dedupe by content_hash. Source priority on ties: firecrawl > perplexity > google_jobs.
4. Drop rows in `job_excluded_urls` (url / domain / company exclusions) AND in `tracked_jobs.excluded_companies`.
5. Drop dupes already in `job_listings` (`UNIQUE (tracked_job_id, content_hash)` is the safety net but pre-filter avoids wasting classifier credits).
6. Classifier ([job_classifier_service.py](mivaa-pdf-extractor/app/services/integrations/job_classifier_service.py)): rule shortcut → 7d cache → batched Haiku tool-use (`submit_classifications`, ≤25/batch). Verdicts: `match` / `tangential` / `mismatch` / `unverifiable`.
7. Drop `mismatch` rows; persist the rest with relevance + score + match_note.
8. Update denormalized counters (`current_listing_count_*`) on tracked_jobs.
9. `stamp_job_refresh_cost` RPC sums `ai_usage_logs` for this `refresh_run_id` onto the row.
10. `update_tracked_job_cadence` RPC sets `next_check_at`. Active (≥5 new matches) → 6h. Some activity (1–4) → base 24h. Stable → stretches 24 → 48 → 72 → 168h.

**Digest dispatcher** ([mivaa-pdf-extractor/app/modules/job_research_notifications/service.py](mivaa-pdf-extractor/app/modules/job_research_notifications/service.py)):
- For each due user, group their tracked_jobs into ONE email body. Each tracked_job becomes a section with up to 10 newest match listings.
- Channels: bell (always free, writes `user_notifications`), email (1 cr, via `email-api` edge function with template `job_alerts.daily_digest`), webhook (per-tracked_job `alert_webhook_url`, free).
- Marks the listing rows as `digest_included_at = now()` so they don't reappear in tomorrow's digest.
- Calls `append_job_alert_log` per tracked_job — that RPC also updates `last_digest_sent_at` so the same row isn't re-evaluated until tomorrow.
- "No new matches today" still stamps `last_digest_sent_at` (silent stamp, no email sent) so the cron doesn't reprocess until tomorrow.

**Backend surface** (internal flow only — external `api_keys` flow not yet wired in v1):
- `POST /api/v1/job-research/track` — create tracked_job
- `GET / PUT / DELETE /api/v1/job-research/track/{id}` — CRUD
- `POST /api/v1/job-research/track/{id}/refresh` — re-run discovery (`force=true` admin-only bypasses cadence)
- `GET /api/v1/job-research/track/{id}/listings` — list with `relevance` / `days` / `only_actionable` filters
- `GET /api/v1/job-research/track/{id}/summary` — aggregate snapshot
- `POST /api/v1/job-research/track/{id}/exclude` — add url/domain/company exclusion
- `GET /api/v1/job-research/track/{id}/exclusions` / `DELETE /api/v1/job-research/exclusions/{id}`
- `POST /api/v1/job-research/listings/{id}/action` — mark saved/applied/dismissed/interested
- `POST /api/v1/job-research/cron-refresh` (x-cron-secret) / `POST /api/v1/job-research/cron-digest` (x-cron-secret)

**Module flags** (in `public.modules`, both default-enabled):
- `job-research` — main module
- `job-research-notifications` — gates digest dispatch (`is_module_enabled` check at top of `dispatch_due_users`)

**JARVIS agent tools** ([supabase/functions/_shared/tools/job-research-tools.ts](supabase/functions/_shared/tools/job-research-tools.ts)) — registered on the `kai` agent for **all users** (not admin-gated). All 0-credit (refresh runs on cron, not on-demand):
- `track_job_search` — create / update / pause / resume / delete (resolves target by `tracked_job_id` or by label)
- `list_my_job_searches` — read user's tracked_jobs
- `find_jobs` — fetch recent matches for a tracked_job
- `get_job_digest_preview` — preview today's consolidated digest content

Each tool checks `is_module_enabled('job-research')` first. Chunk types streamed back to AgentHub: `job_search_created`, `job_search_updated`, `job_searches_list`, `job_listings_feed`, `job_digest_preview`. **These are wired** (2026-07 cleanup) via the generic `AgentResultCard` fallback — every type is registered in `AGENT_RESULT_TITLES` in [AgentHub.tsx](src/components/features/ai/AgentHub.tsx), so they render an inline card (live-stream + on reload). The "Job Sources" page renders the same data with full interactivity.

**Frontend**:
- [src/services/jobResearchService.ts](src/services/jobResearchService.ts) — single client with full CRUD + refresh + listings + summary + exclusions + per-listing action.
- [src/pages/KnowledgeBase/JobSourcesPage.tsx](src/pages/KnowledgeBase/JobSourcesPage.tsx) — **hidden KB page** at `/knowledge-base/job-sources?tracked_job=<id>`. NOT registered in any nav config. Reachable only via:
  1. The "Open Job Sources →" link in the daily digest email (`PUBLIC_APP_URL` env var on MIVAA backend points to it).
  2. The bell-notification action_url from a delivered digest.
  3. Deep-link emitted by the JARVIS agent when it creates / updates a tracked_job (chunk handler can navigate to it).
- Layout: tracked-jobs sidebar on the left, listings table on the right with All / New / Saved / Applied filters. Per-listing actions: open external URL, save, apply, dismiss.
- Route registered in [src/App.tsx](src/App.tsx) under `AuthGuard` so unauthenticated users get redirected to login.

**Required secrets** (MIVAA backend `Environment=` lines):
- `DATAFORSEO_BASE64` — already configured
- `PERPLEXITY_API_KEY` — already configured
- `FIRECRAWL_API_KEY` — already configured (only needed when `careers_pages` source is enabled per tracked_job)
- `ANTHROPIC_API_KEY` — already configured (Haiku classifier)
- `CRON_SECRET` — already configured (validated on `/cron-refresh` and `/cron-digest`)
- `PUBLIC_APP_URL` — same env var already used by `catalog-send-to-customers` + `catalog-tools.ts` for the public app URL; the digest dispatcher reads it to deep-link the conversation. Defaults to `https://app.materialshub.gr` if unset.

**Cost discipline** (mirrors price/mention v3):
- Verdict cache: ~95% hit rate on stable subjects across daily refreshes.
- Rule shortcut eliminates ~60% of candidates before Haiku.
- Tier-skip on Perplexity (sonar by default; sonar-pro only on first/forced refresh).
- Volatility cadence stretches stable searches to weekly polling.
- Typical per-refresh cost on a stable search: ~$0.005–0.010.

**Out of scope for v1** (deferred follow-ups):
- External `api_keys` flow (`/api/v1/jobs/track/*`) — partner billing + credit metering already wired in `job_cost_logger.JOB_OP_CREDIT_COST`, just need a sister router file with `Authorization: Bearer kai_*` auth.
- AgentHub rich cards for the 5 job chunk types — text reply works fine without them.
- RSS source adapter — was scoped out 2026-05-14 in favor of the 3 selected sources; trivial to add as a 4th adapter in [job_search_service.py](mivaa-pdf-extractor/app/services/integrations/job_search_service.py).
- Per-tracked_job `alert_on_high_match_burst` real-time alert (separate from daily digest) — schema supports it (`alert_type='high_match_burst'` enum value reserved); dispatcher logic not yet implemented.
- `auto_expand_keywords` (Haiku-driven keyword expansion on first refresh) — column exists, default `false`, no expansion code path yet.

---

