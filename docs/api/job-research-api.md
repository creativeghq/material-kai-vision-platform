# Job Research API

Background job-discovery agent. Each tracked search runs hourly on a volatility-adaptive cadence (6h / 24h / 48h / 72h / 168h) across **DataForSEO Google Jobs**, **Perplexity Sonar** (pinned to LinkedIn / Indeed / Glassdoor / WeWorkRemotely / RemoteOK / Wellfound / Dice / Monster / StackOverflow / YC), and **Firecrawl scraping of user-pinned career pages**. Discovered listings are classified by Haiku (relevance: `match` / `tangential` / `mismatch` / `unverifiable`), the matches are persisted, and ONE consolidated email per user is sent daily at the user's chosen `digest_hour_utc` covering all of their tracked searches.

**Host**: `https://v1api.materialshub.gr`
**OpenAPI tag**: `Job Research`
**Interactive docs (Swagger UI)**: `GET https://v1api.materialshub.gr/docs` — filter by tag
**Machine-readable spec**: `GET https://v1api.materialshub.gr/openapi.json` — auto-generated from the FastAPI route signatures, always in sync with what's deployed.

---

## Changelog

### v0.5.2 — 2026-05-28 — RSS feed + careers page defaults are no longer inert

Closes a P0 UX gap. The "Default RSS feeds" and "Default career pages" sub-lists in the **Manage resources** tab existed since v0.3.1 but **nothing in the engine read them** — they were aspirational UI. Three concrete changes:

- 🆕 **Per-refresh UNION with global defaults.** `JobResearchService._run_refresh_pipeline` now, when `sources_enabled.rss_feeds` or `sources_enabled.careers_pages` is true, reads BOTH the tracked_job's own URLs AND the operator-curated rows in `job_research_sites` (`site_type='rss_feed_default'` / `'careers_page_default'`), de-dupes case-insensitively, and runs the adapter once over the merged list. Mirrors the existing pattern for `perplexity_domain` (`_load_perplexity_domains_from_db`).
- 🆕 **Auto-enable source toggles when global defaults exist.** `create()` now defaults `sources_enabled.rss_feeds` / `careers_pages` to `true` if the operator has curated any default entries of that type. So adding a default in **Manage resources** is enough — no separate toggle to flip. Explicit per-request `sources_enabled` still wins outright. Existing rows aren't touched.
- 🆕 **`rss_feed_urls` added to the internal-flow Pydantic.** `POST/PUT /api/v1/job-research/track` now accept `rss_feed_urls: string[]`. Was missing — even though the DB column + engine existed, no route would let you set it via session JWT. The external `/api/v1/jobs/track` already had it.
- ✏️ **New helper** `job_search_service.load_site_defaults_from_db(site_type) → list[str]` for any future site_type to follow the same pattern.
- ✏️ **KB doc body** now explains that defaults are UNIONed with per-tracked URLs on every refresh, not merely "suggested to new tracked_jobs" (the old wording was honest that the lists were dead).
- 📋 **Smoke verified** on prod 2026-05-28: seeded one rss_feed_default + one careers_page_default → POST `/jobs/track` with no `sources_enabled` → response shows `{rss_feeds: true, careers_pages: true}` auto-set + `by_source: {rss_feeds: 8, careers_pages: 20, ...}` in `first_refresh`.

### v0.3.3 — 2026-05-15 — Admin-stop bridge + KB consolidation + scoped pause

Three related fixes addressing "how do I stop a search?" and "where do platform configs live in the KB?":

- 🆕 **Admin-panel stop now actually stops.** New AFTER UPDATE trigger on `background_agents`: when an admin toggles `enabled` for a `job-research` row at `/admin/background-agents`, the trigger mirrors the change onto `tracked_jobs.is_active` so the refresh cron skips it. Previously the admin toggle was cosmetic — the engine ignored it.
- 🆕 **Scoped pause.** `track_job_search` action `pause` (and `resume`) now accept `pause_scope: 'all' | 'digests_only'`.
  - `all` (default): flips `tracked_jobs.is_active=false` → stops both refresh and digest.
  - `digests_only`: flips `tracked_jobs.digest_enabled=false` → refresh keeps running; just no emails/chat-posts at digest tick. User can still call `find_jobs` to see what's accumulated.
- 🆕 **Broader stop vocabulary.** KAI prompt addendum extended — "stop", "cancel", "turn off", "kill", "snooze", "disable" all map to pause. "got a job, stop looking" confirms then maps to delete. "stop emailing me but keep tracking" → pause with `pause_scope=digests_only`.
- ✏️ **KB category renamed** `Job Sources` → `Internal Configuration` (slug `internal-configuration`, icon ⚙️). Generic name so future internal config pages (mention outlets, price retailers, etc.) can live as sibling docs in the same category.
- ✏️ **KB docs consolidated**: three per-site_type docs → one `Job Research Sites` doc with three sections. `job_sites_kb_sync.sync_one_site_type()` is now a backwards-compatible alias for `sync_all()` which always re-renders the single consolidated doc.

### v0.3.2 — 2026-05-15 — Sites list lives in a KB category (access_level='agent') + agent-driven flow with modal (superseded by v0.3.3)

Architectural correction to v0.3.1. Standalone admin page deleted; the sites list is now a proper KB category (`access_level='agent'` → agent reads it, public KB filters it out, admin sees it via the regular KB admin UI). All add/edit/remove goes through the KAI agent.

- ❌ **Deleted** the standalone admin page `/admin/knowledge-base/job-sources` (the route from v0.3.1). Operators don't open a custom page anymore.
- 🆕 **KB category "Job Sources"** with three child kb_docs (one per `site_type`: Perplexity domain filter / Default RSS feeds / Default career pages). Bodies are auto-rendered Markdown tables, regenerated on every CRUD via the sync helper.
- 🆕 **KAI agent tool `manage_job_sites`** — replaces the deep-link. Actions: `list` / `add` / `remove` / `toggle` / `open_form`. When the user is vague ("add a job site"), `open_form` emits a `job_sites_form_open` chunk; AgentHub mounts a modal with type/URL/country/category/notes fields. On submit, the modal populates the input box with a structured prose message that re-invokes the tool with concrete fields.
- ✏️ **Sites CRUD endpoints** (`/api/v1/job-research/sites`) unchanged in signature, but each write now calls `_sync_kb(site_type)` to refresh the corresponding kb_doc.
- ✏️ **KAI prompt addendum** rewritten — drops the dead deep-link, teaches the agent the new tool + the NL→action mappings + when to call `open_form` vs `add` with specifics.

### v0.3.1 — 2026-05-15 — Operator-curated job-sites list at /admin/knowledge-base/job-sources (superseded by v0.3.2)

The Perplexity domain filter and the default RSS / career-page lists are now editable through a hidden admin page instead of being hardcoded. Adds 4 new endpoints under `/api/v1/job-research/sites` and a new `job_research_sites` DB table (RLS: reads open, writes admin-only). The previously hardcoded `_DEFAULT_JOB_DOMAINS` constant becomes a fallback used only when the DB read fails.

- 🆕 `GET /api/v1/job-research/sites[?site_type=perplexity_domain|rss_feed_default|careers_page_default]` — list configured sites (any authenticated user).
- 🆕 `POST /api/v1/job-research/sites` — add a new site (admin/super_admin only via RLS). Body: `{ site_type, url_or_domain, display_name?, country_code?, category?, is_enabled=true, notes? }`. 409 on duplicate.
- 🆕 `PUT /api/v1/job-research/sites/{id}` — update fields (admin-only).
- 🆕 `DELETE /api/v1/job-research/sites/{id}` — remove (admin-only).
- ✏️ `search_via_perplexity()` now loads the domain filter from the DB; falls back to the hardcoded constant only on DB-read failure.

**Where the page lives:** `/admin/knowledge-base/job-sources` (hidden — no nav entry; deep-linked from the KAI agent or hand-typed). Three tabs:
1. **Perplexity domain filter** — the global list Sonar searches across. Capped at 10 by Perplexity; extras displayed with a warning.
2. **Default RSS feeds** — feeds offered as defaults when a new tracked_job enables `sources_enabled.rss_feeds`.
3. **Default career pages** — same for `sources_enabled.careers_pages`.

Per-tracked_job overrides (`tracked_jobs.careers_page_urls` / `rss_feed_urls`) still take precedence.

### v0.3.0 — 2026-05-15 — RSS adapter + burst alerts + classifier feedback + external `kai_*` API + cross-conversation triage

Closes the v0.2 follow-up backlog. **Two breaking-ish changes for new fields, no breaking changes to existing endpoints.**

- 🆕 **External public API** at `/api/v1/jobs/track/*` (12 endpoints), `Authorization: Bearer kai_*`. Mirrors the internal flow but with per-call partner billing: `refresh=5cr`, `regenerate-keywords=2cr`, all reads + corrections free. Returns `402 Insufficient credits` when balance is exhausted. Cron does NOT touch external rows — partners control their own refresh cadence. See full reference in the new "Public API endpoint inventory" section below.
- 🆕 **RSS source adapter.** New column `tracked_jobs.rss_feed_urls text[]`. Enable per tracked_job via `sources_enabled.rss_feeds: true`. Parses RSS 2.0 + Atom 1.0 feeds from any URL (career-page feeds, WeWorkRemotely, RemoteOK, HN "Who's Hiring" archives, etc.). Free — no per-call billing. Source-priority dedupe rank: `firecrawl_careers > rss_feed > perplexity_sonar > google_jobs`.
- 🆕 **Salary normalization.** Every persisted listing now also carries `salary_annual_min_usd`, `salary_annual_max_usd`, `salary_normalization_note`. The normalizer converts source-reported `{min, max, currency, period}` to annualized USD using a static FX table (refreshable quarterly), period multipliers (hour/day/week/month/year), magnitude-based period inference when source omits it, and sanity floor/ceiling ($5k–$2M/yr). Original raw values preserved. Lets cross-source comparison and salary-band filtering work uniformly.
- 🆕 **Real-time `high_match_burst` alerts.** Opt-in via `tracked_jobs.alert_on_burst: true` + `burst_threshold: int (default 10)`. After every refresh, if new matches ≥ threshold AND last_burst_alert_at > 2h ago, the dispatcher fires a chat-post + bell notification BETWEEN daily digests. 24h cooldown prevents spam. Email is NOT auto-sent on burst (only daily digest emails). Webhook NOT auto-fired on burst either (keep webhooks deterministic — once per digest cycle).
- 🆕 **Classifier feedback loop (full).** New endpoint `POST /api/v1/job-research/listings/{id}/correct-match` (and `POST /api/v1/jobs/track/listings/{id}/correct-match` on the public API). Inserts a `job_match_corrections` row + flips the listing's `relevance` immediately. The classifier prepends the most recent 5 corrections per tracked_job as Haiku few-shot examples on the next batched classify call — no retraining, just in-context learning of the user's idiosyncratic preferences. Free.
- 🆕 **Cross-conversation triage UI.** Replaces the dropped `/knowledge-base/job-sources` page from v0.1. New `JobResearchSavedJobsPanel` auto-mounts inside the `AgentRunHistoryDrawer` whenever the agent's `agent_type === 'job-research'`. Tabs: Saved / Applied / Interested / All matches. Per-listing actions inline (save, apply, dismiss, ⚠ wrong match). Lives in the existing background-agents framework at `/admin/background-agents` — no new admin page.
- ✏️ **`sources_enabled` default** updated to include `rss_feeds: false`. Existing rows unchanged.
- ✏️ **Frontend `jobResearchService`**: new `correctMatch(listingId, correctedRelevance, reason?)` method.
- ✏️ **AgentHub `job_findings` card** gains a "⚠ wrong" button per listing.

### v0.2.0 — 2026-05-15 — Background-agents integration, chat-posting, default-on keyword expansion

Three architecture corrections on top of v0.1.0. **No breaking changes for the documented endpoints** (additive only) but the runtime behavior changes meaningfully.

- 🆕 **Background-agents framework integration.** Every `tracked_jobs` row now also gets a `background_agents` row (`agent_type='job-research'`) so the search appears in `/admin/background-agents` alongside other background agents. New FK column `tracked_jobs.background_agent_id`. Each refresh inserts one `agent_runs` row (with input/output stats + duration_ms + token counts) and per-source `agent_run_logs` entries. `deactivate()` mirrors `enabled=false` onto the linked agent.
- 🆕 **Chat-posting (primary user surface).** New column `tracked_jobs.source_conversation_id` (FK → `agent_chat_conversations`). When the KAI agent creates a tracked_job, it captures the current conversation id automatically. After every daily digest tick, the dispatcher inserts an assistant message into THAT conversation thread with `metadata.chunk_type = 'job_findings'`. Frontend (AgentHub) renders it as a rich card with per-listing details. The user reopens the conversation and sees the running history of findings. Email digest still goes out in parallel.
- 🆕 **Default-on keyword expansion via Haiku.** `JobResearchService.create()` now synchronously calls Haiku tool-use to expand the user's keywords into `{title_variants, seniority_variants, abbreviations}`. Persisted on new column `tracked_jobs.expanded_keywords text[]`. Discovery uses `keywords ∪ expanded_keywords`. So "Product Manager" automatically catches "Senior PM", "Product Lead", "Principal PM" without the user listing them. Re-runnable via the new endpoint `POST /track/{id}/regenerate-keywords`.
- 🆕 **Synchronous first refresh.** `POST /track` now runs the full discovery + classifier pipeline inline before returning. Response includes `first_refresh: { discovered, persisted, matches, by_source }` so the caller (typically the KAI agent) can confirm real findings to the user instead of "wait an hour for the cron". Pass `run_first_refresh: false` to opt out.
- 🆕 **Weekly cadence.** New column `tracked_jobs.digest_day_of_week int|null` (0=Sunday..6=Saturday, NULL=daily). The `get_tracked_jobs_due_for_digest` RPC was rewritten to honor it. Lets the user say "every Monday morning" and have the digest fire only on Mondays.
- 🆕 **`POST /api/v1/job-research/track/{id}/regenerate-keywords`** — re-runs Haiku expansion. Response: `{ expanded: string[], rejected: string[], raw: {...} }`. Useful when the user updates their `keywords` and wants the variants refreshed too.
- ✏️ **`POST /track` request body additions**: `source_conversation_id` (string, optional), `digest_day_of_week` (int 0-6 or null, optional), `run_first_refresh` (bool, default `true`).
- ✏️ **`PUT /track/{id}`** accepts `digest_day_of_week`.
- ✏️ **Action URLs change**: bell-notification + email "Open" links now deep-link to `/agent-hub?conversation=<id>` (the original conversation) instead of the deleted KB page. Falls back to `/agent-hub?q=...` when `source_conversation_id` is unset.
- ❌ **`/knowledge-base/job-sources` page DROPPED.** Was a hidden KB page in v0.1.0; redundant once chat-posting was wired. The chat is now the user surface; `/admin/background-agents` is the ops surface.
- ❌ **`auto_expand_keywords` flag removed** from the public schema (column retained on the table for back-compat but ignored). Expansion is unconditional.

### v0.1.0 — 2026-05-14 — Initial release

- 🚀 **Job Research module** (`module slug: job-research` + notifications submodule `job-research-notifications`).
- 🚀 **3 discovery sources** wired into a single refresh pipeline:
  - **DataForSEO Google Jobs** (`/serp/google_jobs/live/advanced`) — flat ~$0.0006/req, broad coverage via Google for Jobs aggregation.
  - **Perplexity Sonar** with `search_domain_filter` pinned to the major job boards + JSON-schema response — ~$0.005/sweep, deep page reads where DataForSEO misses.
  - **Firecrawl scrape** of user-pinned career pages with a `JobListing[]` extraction schema — direct from companies' own pages.
- 🚀 **Haiku batched classifier** (`claude-haiku-4-5-20251001`) with rule shortcut + 7-day verdict cache. ~95% cache hit on stable searches across daily refreshes.
- 🚀 **Volatility-adaptive cadence**: ≥5 new matches → next check in 6h; 1–4 → 24h; stable → 48h → 72h → 168h.
- 🚀 **Consolidated daily digest**: one email per user at their `digest_hour_utc`, covering all tracked searches in one body. Channels: bell (free), email (1 cr), webhook (free, per-tracked_job).
- 🚀 **Internal flow** (session JWT) — 12 endpoints under `/api/v1/job-research/*` for the platform's own UI + KAI agent tools.
- 📋 **External `api_keys` flow** (`/api/v1/jobs/track/*`) — **NOT YET WIRED**. Schema and `JOB_OP_CREDIT_COST` table support partner billing; just needs a sister router file. Will land in v0.2.0.

---

## Concepts

### Tracked job vs job listing

A **tracked job** (`tracked_jobs`) is a saved search — keywords, location, filters, source preferences, digest schedule. It's the row the cron picks up.

A **job listing** (`job_listings`) is a discovered posting. Many listings per tracked job. Deduped by `UNIQUE (tracked_job_id, content_hash)` so a posting that appears across multiple sources or refreshes only writes once. Each listing carries a `relevance` verdict from the Haiku classifier; only `match` / `tangential` / `unverifiable` are persisted (`mismatch` is dropped).

### Cadence (you don't control it for internal flow)

Internal flow refreshes are **cron-driven**. The platform's `job-research-refresh-hourly` cron (every hour at :45) picks rows where `next_check_at <= now()` and runs the discovery pipeline. After each refresh, `update_tracked_job_cadence` adjusts `next_check_at` based on activity:

- `≥5 new matches` → next check in 6h
- `1–4 new matches` → next check in 24h (the base `refresh_interval_hours`)
- `0 new matches`, stable for N consecutive refreshes:
  - N = 1 → 48h
  - N ≥ 3 → 72h
  - N ≥ 7 → 168h (1 week)

You can pass `force=true` on `POST /track/{id}/refresh` to bypass the cadence and refresh immediately.

External-API flow (forthcoming v0.2.0) will NOT auto-cron — partners control their own cadence and pay per call.

### Digest cadence

A separate cron `job-research-digest-hourly` runs at :05 every hour. It computes the current UTC hour `H` and dispatches one consolidated email to each user whose `digest_hour_utc == H` and `last_digest_sent_at < today`.

Even when no new matches were found in the last 24h, the dispatcher stamps `last_digest_sent_at` so the same row isn't re-evaluated until tomorrow (silent stamp, no email sent). Set `digest_enabled: false` on the row to stop digests entirely.

### Three engines, one refresh — why the three tabs in Manage Resources?

The **Manage resources** tab inside the *Job Research Sites* KB doc has three sub-lists: **Perplexity domain filter**, **Default RSS feeds**, **Default career pages**. They look like three flavors of the same thing — they're not. Each drives a different upstream engine because no single engine does all three jobs well.

**Concrete example — putting the same site (`kariera.gr`) in each tab does THREE different things:**

| Tab | What you'd add | What the engine does | When you'd use it |
|---|---|---|---|
| Perplexity domain filter | `kariera.gr` (bare domain) | Sonar runs an **LLM-driven web search** restricted to that host, scored against the tracked_job's keywords. Returns ~5-10 relevant pages. Like `site:kariera.gr "senior python developer"` on Google, but read by an LLM. | Big multi-company job boards where you want **keyword-filtered** results, not every job. Capped at 10 domains by Sonar. |
| Default RSS feeds | `https://kariera.gr/feed.rss` (or whatever feed URL the site exposes) | **Direct XML poll** via httpx — no browser, no LLM. Parses `<item>` / `<entry>` elements with their real `<pubDate>` and canonical `<link>`. | Anywhere with a published feed. **Best freshness signal** (web search has to guess "is this recent?"). Free — no per-call billing. |
| Default career pages | `https://kariera.gr/jobs/it` (a specific landing page URL) | **Firecrawl** loads that exact URL in a real browser, waits for JS, hands the rendered HTML to an LLM with a strict `JobListing[]` schema. Returns **every** job visible on the page. | Single-company careers pages, or category pages where you want **all** roles (the tracked_job's keywords filter afterward). Firecrawl credits apply per page. |

**Why not just one engine?**

- **Sonar alone** would degrade RSS and Careers: an RSS URL given to Sonar comes back as "this page has XML" not "47 jobs with dates"; client-rendered company pages return nothing because Sonar doesn't run JS.
- **Firecrawl alone** would be expensive (one credit per page per refresh × hundreds of aggregator pages) and miss Sonar's strength: keyword-aware retrieval across a large catalog.
- **RSS alone** doesn't work for any site that doesn't publish a feed (most company careers pages don't).

**How defaults interact with per-tracked_job URLs (v0.5.2+):** the engine reads BOTH on every refresh and UNIONs them. `tracked_jobs.rss_feed_urls + job_research_sites WHERE site_type='rss_feed_default'`, de-duped case-insensitively. Per-tracked entries come first so the user's choice wins on tie. Same for `careers_page_urls + careers_page_default`.

**Picking the right tab — quick rule:**
- Bare domain (no scheme, no path) → **Perplexity**
- URL ending in `.rss` / `.atom` / `/feed` / `?format=rss` → **RSS**
- Any specific URL on a company's careers page → **Careers**

You CAN put the same site in two tabs (e.g. `kariera.gr` in Perplexity + `kariera.gr/feed.rss` in RSS). Engine-side de-dupe handles overlap; you just pay for both adapter calls. Usually pick one.

### Source priority on dedupe

When the same posting is found by multiple sources, the dedupe keeps the highest-priority source:

1. `firecrawl_careers` (direct from company)
2. `rss_feed` (per-item dates + canonical link, no LLM interpretation)
3. `perplexity_sonar` (read the page)
4. `google_jobs` (via Google for Jobs feed)

### Classifier verdicts

- **`match`** — title + description clearly hit the user's intent. Persisted. Counted in `current_listing_count_*`. Eligible for the daily digest.
- **`tangential`** — same field but wrong specialization (e.g. a Vue posting for a React search). Persisted with `match_note` explaining why. NOT in the digest. Visible in the UI under the "All" tab.
- **`mismatch`** — entirely different role or excluded keyword/company hit. **Dropped, not persisted.**
- **`unverifiable`** — page didn't load enough signal. Persisted; user can review.

The classifier runs in 3 phases per refresh: (1) **rule shortcut** drops obvious mismatches (excluded keyword in title, excluded company match) and obvious matches (all keywords + title contains the first keyword) deterministically — no LLM call. (2) **7d verdict cache** lookup keyed on `sha1(content_hash + facets_hash)`. (3) **Batched Haiku tool-use** with the `submit_classifications` tool (≤25 candidates per call, hard JSON guarantee via tool-use).

---

## Authentication (internal flow)

Every endpoint requires a valid Supabase session JWT:

```http
Authorization: Bearer <supabase_session_access_token>
Content-Type: application/json
```

Get the access token from `supabase.auth.getSession()` on the frontend. RLS on `tracked_jobs` and `job_listings` enforces row-level ownership — users only see their own rows.

---

## Endpoint inventory

| # | Method | Path | Purpose |
|---|---|---|---|
| 1 | `POST` | `/api/v1/job-research/track` | Create a tracked job search |
| 2 | `GET` | `/api/v1/job-research/track` | List the user's tracked jobs |
| 3 | `GET` | `/api/v1/job-research/track/{id}` | Read one tracked job |
| 4 | `PUT` | `/api/v1/job-research/track/{id}` | Update keywords / filters / digest config |
| 5 | `DELETE` | `/api/v1/job-research/track/{id}` | Soft delete (deactivate, preserves history) |
| 6 | `POST` | `/api/v1/job-research/track/{id}/refresh` | Force a refresh (bypasses cadence) |
| 7 | `GET` | `/api/v1/job-research/track/{id}/listings` | List discovered listings for this tracked job |
| 8 | `GET` | `/api/v1/job-research/track/{id}/summary` | Aggregate snapshot (counts, top companies, by-source) |
| 9 | `POST` | `/api/v1/job-research/track/{id}/exclude` | Add a URL / domain / company exclusion |
| 10 | `GET` | `/api/v1/job-research/track/{id}/exclusions` | List exclusions for this tracked job |
| 11 | `DELETE` | `/api/v1/job-research/exclusions/{exclusion_id}` | Remove an exclusion |
| 12 | `POST` | `/api/v1/job-research/listings/{listing_id}/action` | Mark `saved` / `applied` / `dismissed` / `interested` |
| 13 | `POST` | `/api/v1/job-research/track/{id}/regenerate-keywords` | Re-run Haiku keyword expansion (v0.2) |
| 14 | `POST` | `/api/v1/job-research/listings/{listing_id}/correct-match` | Classifier feedback (v0.3); flips relevance + becomes few-shot |

---

## Public API endpoint inventory (v0.3, `kai_*` Bearer auth)

For partner integrations. Same orchestration engine as the internal flow, with per-call partner billing. Returns `402 Insufficient credits` when balance is exhausted; refunds on hard failure / no-op outcomes.

| # | Method | Path | Credits | Purpose |
|---|---|---|---|---|
| 1 | `POST` | `/api/v1/jobs/track` | 5 (if `run_first_refresh`) | Create a tracked job search |
| 2 | `GET` | `/api/v1/jobs/track` | 0 | List your tracked job searches |
| 3 | `GET` | `/api/v1/jobs/track/{id}` | 0 | Read one |
| 4 | `PUT` | `/api/v1/jobs/track/{id}` | 0 | Update config |
| 5 | `DELETE` | `/api/v1/jobs/track/{id}` | 0 | Soft delete (cascades on api_key revocation) |
| 6 | `POST` | `/api/v1/jobs/track/{id}/refresh` | 5 | Force a refresh |
| 7 | `GET` | `/api/v1/jobs/track/{id}/listings` | 0 | List discovered listings |
| 8 | `GET` | `/api/v1/jobs/track/{id}/summary` | 0 | Aggregate snapshot |
| 9 | `POST` | `/api/v1/jobs/track/{id}/exclude` | 0 | Add an exclusion |
| 10 | `GET` | `/api/v1/jobs/track/{id}/exclusions` | 0 | List exclusions |
| 11 | `POST` | `/api/v1/jobs/track/{id}/regenerate-keywords` | 2 | Re-run Haiku keyword expansion |
| 12 | `POST` | `/api/v1/jobs/track/listings/{listing_id}/correct-match` | 0 | Classifier feedback |

**Quickstart** (external):

```bash
curl -X POST https://v1api.materialshub.gr/api/v1/jobs/track \
  -H "Authorization: Bearer kai_YOUR_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "label": "Senior backend roles, EU remote",
    "keywords": ["backend engineer", "senior backend"],
    "remote_only": true,
    "country_code": "DE",
    "sources_enabled": { "google_jobs": true, "perplexity": true, "rss_feeds": true },
    "rss_feed_urls": ["https://weworkremotely.com/categories/remote-back-end-programming-jobs.rss"],
    "alert_webhook_url": "https://your.domain/webhooks/material-kai-jobs",
    "run_first_refresh": true
  }'

# Response includes the tracked_job + first_refresh outcome + partner_credits_debited: 5
```

Cron-only endpoints (`x-cron-secret` auth, NOT for partner use):

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/api/v1/job-research/cron-refresh` | Picks due tracked jobs and runs each one's refresh |
| `POST` | `/api/v1/job-research/cron-digest?current_hour_utc=<H>` | Dispatches the daily digest for users whose `digest_hour_utc == H` |

---

## Quickstart

```bash
# 1. Create a tracked job search
curl -X POST https://v1api.materialshub.gr/api/v1/job-research/track \
  -H "Authorization: Bearer $SUPABASE_JWT" \
  -H "Content-Type: application/json" \
  -d '{
    "label": "Senior React jobs in Athens (remote OK)",
    "keywords": ["senior react", "react developer", "frontend engineer"],
    "excluded_keywords": ["junior", "intern"],
    "location": "Athens, Greece",
    "country_code": "GR",
    "remote_only": false,
    "seniority": "senior",
    "employment_type": ["full_time"],
    "salary_min": 60000,
    "salary_currency": "EUR",
    "excluded_companies": ["acme corp"],
    "sources_enabled": { "google_jobs": true, "perplexity": true, "careers_pages": false },
    "digest_hour_utc": 7,
    "alert_channels": ["bell", "email"],
    "refresh_interval_hours": 24
  }'

# Response: { "tracked_job": { "id": "uuid", ...row } }
```

```bash
# 2. List your tracked jobs
curl https://v1api.materialshub.gr/api/v1/job-research/track \
  -H "Authorization: Bearer $SUPABASE_JWT"
```

```bash
# 3. Force a refresh now (don't wait for the next cron tick)
curl -X POST "https://v1api.materialshub.gr/api/v1/job-research/track/$ID/refresh?force=true" \
  -H "Authorization: Bearer $SUPABASE_JWT"

# Response: {
#   "refresh_run_id": "uuid",
#   "discovered": 42,           # raw hits from all sources before dedupe
#   "deduped": 31,              # after cross-source dedupe
#   "candidates_after_exclusions": 27,
#   "persisted": 18,            # written to job_listings (drops mismatch + already-seen)
#   "matches": 12               # subset of persisted with relevance='match'
# }
```

```bash
# 4. List today's matched listings
curl "https://v1api.materialshub.gr/api/v1/job-research/track/$ID/listings?relevance=match&days=1&limit=50" \
  -H "Authorization: Bearer $SUPABASE_JWT"
```

```bash
# 5. 30-day summary
curl "https://v1api.materialshub.gr/api/v1/job-research/track/$ID/summary?days=30" \
  -H "Authorization: Bearer $SUPABASE_JWT"

# Response: {
#   "days": 30, "total": 84, "matches": 51, "applied": 3, "saved": 7,
#   "by_source": { "google_jobs": 32, "perplexity_sonar": 15, "firecrawl_careers": 4 },
#   "top_companies": [{"company":"Stripe","count":4}, {"company":"Vercel","count":3}, ...]
# }
```

```bash
# 6. Mark a listing applied (also: saved | dismissed | interested)
curl -X POST "https://v1api.materialshub.gr/api/v1/job-research/listings/$LISTING_ID/action" \
  -H "Authorization: Bearer $SUPABASE_JWT" \
  -H "Content-Type: application/json" \
  -d '{ "action": "applied", "notes": "Applied via the careers page; recruiter Slack thread #1234" }'
```

```bash
# 7. Exclude a domain you don't want to see again
curl -X POST "https://v1api.materialshub.gr/api/v1/job-research/track/$ID/exclude" \
  -H "Authorization: Bearer $SUPABASE_JWT" \
  -H "Content-Type: application/json" \
  -d '{ "domain": "ziprecruiter.com", "reason": "Always reposts old listings" }'
```

```bash
# 8. Pause a tracked search (won't refresh, won't appear in digest)
curl -X PUT "https://v1api.materialshub.gr/api/v1/job-research/track/$ID" \
  -H "Authorization: Bearer $SUPABASE_JWT" \
  -H "Content-Type: application/json" \
  -d '{ "is_active": false }'
```

---

## Endpoint reference

### `POST /api/v1/job-research/track`

Create a new tracked job search. Eligible for the next cron tick immediately (`next_check_at = now()`).

**Request body:**

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| `label` | string | ✅ | — | Display name, max 200 chars |
| `keywords` | string[] | ✅ | — | At least 1, max 20 |
| `excluded_keywords` | string[] | | `[]` | Disqualifying terms; matched against title |
| `location` | string | | `null` | Free-form, e.g. `"Athens, Greece"` |
| `country_code` | string | | `null` | ISO-2; biases DataForSEO results |
| `remote_only` | boolean | | `false` | Filters out non-remote |
| `seniority` | enum | | `null` | `junior` \| `mid` \| `senior` \| `lead` \| `principal` \| `any` |
| `employment_type` | string[] | | `[]` | `full_time` / `contract` / `part_time` / `internship` |
| `salary_min` | integer | | `null` | Used by classifier as a soft filter |
| `salary_currency` | string | | `"USD"` | ISO-4217 |
| `excluded_companies` | string[] | | `[]` | Case-insensitive substring match against `company` |
| `preferred_companies` | string[] | | `[]` | Reserved for ranking; no behavioral effect in v0.1.0 |
| `sources_enabled` | object | | `{ google_jobs: true, perplexity: true, careers_pages: false }` | Per-source toggles |
| `careers_page_urls` | string[] | | `[]` | Required if `sources_enabled.careers_pages: true` |
| `digest_hour_utc` | integer | | `7` | 0–23, when the daily digest is sent |
| `alert_channels` | string[] | | `["bell", "email"]` | Subset of `["bell", "email", "webhook"]` |
| `alert_webhook_url` | string | | `null` | Per-tracked_job webhook URL (POST) |
| `refresh_interval_hours` | integer | | `24` | 1–168; cron stretches this on stable searches |
| `digest_day_of_week` | integer | | `null` | 0=Sunday..6=Saturday. NULL = daily. Set when the user wants weekly digest on a specific day. |
| `source_conversation_id` | string | | `null` | UUID of the `agent_chat_conversations` row where the user set up the search via KAI; daily digest will chat-post into it. |
| `run_first_refresh` | boolean | | `true` | If true, the create endpoint runs discovery + classifier inline before returning (synchronous first refresh). |

**Response:** `{ "tracked_job": <row> }` — see [TrackedJob schema](#trackedjob).

**Errors:**
- `400` — missing/empty `keywords`, invalid `digest_hour_utc`, etc.
- `401` — missing/invalid JWT.

---

### `GET /api/v1/job-research/track`

List the current user's tracked jobs.

**Query**: `only_active=true|false` (default `true`).

**Response:** `{ "tracked_jobs": [<row>, ...] }`

---

### `GET /api/v1/job-research/track/{id}`

Read one tracked job.

**Response:** `{ "tracked_job": <row> }`

**Errors:** `404` if not owned by the user.

---

### `PUT /api/v1/job-research/track/{id}`

Patch one tracked job. All fields are optional. Same shape as create + these extras:

| Field | Type | Notes |
|---|---|---|
| `digest_enabled` | boolean | Set `false` to keep refreshing but stop sending digests |
| `is_active` | boolean | Set `false` to pause refresh entirely |

**Response:** `{ "tracked_job": <updated row> }`

---

### `DELETE /api/v1/job-research/track/{id}`

Soft delete — sets `is_active = false`. History is preserved.

**Response:** `{ "ok": true }`

---

### `POST /api/v1/job-research/track/{id}/refresh`

Run discovery + classification + persistence right now.

**Query:**
- `force=true` — bypass `is_active` check (admin/debug; ownership is still enforced)
- `force_full_discovery=true` — use `sonar-pro` (more expensive, more accurate) instead of `sonar`. Defaults to `sonar-pro` automatically on the very first refresh.

**Response:**

```json
{
  "refresh_run_id": "uuid",
  "discovered": 42,                       // raw hits across all sources
  "deduped": 31,                          // after cross-source dedupe
  "candidates_after_exclusions": 27,      // after blocklist filter
  "persisted": 18,                        // after classifier (mismatch dropped)
  "matches": 12                           // subset of persisted with relevance='match'
}
```

If the search is inactive: `{ "skipped": true, "reason": "inactive" }`.

If no sources are enabled: `{ "skipped": true, "reason": "no sources enabled", "refresh_run_id": "uuid" }`.

---

### `GET /api/v1/job-research/track/{id}/listings`

List discovered listings for this tracked job.

**Query:**
- `relevance` — `match` (default) / `tangential` / `unverifiable` / `all`
- `days` — look-back window 1–365 (default 30)
- `only_actionable=true` — only listings the user hasn't yet saved/applied/dismissed
- `limit` — 1–500 (default 100)

**Response:** `{ "listings": [<JobListing>, ...], "count": N }` — see [JobListing schema](#joblisting).

---

### `GET /api/v1/job-research/track/{id}/summary`

Aggregate snapshot.

**Query:** `days=30` (1–365).

**Response:**

```json
{
  "days": 30,
  "total": 84,
  "matches": 51,
  "applied": 3,
  "saved": 7,
  "by_source": { "google_jobs": 32, "perplexity_sonar": 15, "firecrawl_careers": 4 },
  "top_companies": [{ "company": "Stripe", "count": 4 }, { "company": "Vercel", "count": 3 }]
}
```

---

### `POST /api/v1/job-research/track/{id}/exclude`

Block a URL / domain / company from future refreshes. At least one of `url`, `domain`, `company` is required.

**Request body:**

```json
{
  "url": "https://...optional...",
  "domain": "ziprecruiter.com",
  "company": "Acme Corp",
  "reason": "Optional free-text"
}
```

**Response:** `{ "exclusion": <row> }`

---

### `GET /api/v1/job-research/track/{id}/exclusions`

**Response:** `{ "exclusions": [<row>, ...] }`

---

### `DELETE /api/v1/job-research/exclusions/{exclusion_id}`

Remove an exclusion. RLS enforces ownership.

**Response:** `{ "ok": true }`

---

### `POST /api/v1/job-research/listings/{listing_id}/action`

Mark a listing as `saved`, `applied`, `dismissed`, or `interested`. Optional `notes` (free text). Updates `user_action`, `user_action_at`, `user_notes` on the row.

**Request body:**

```json
{ "action": "applied", "notes": "Optional" }
```

**Response:** `{ "listing": <updated JobListing> }`

---

## Daily digest email

Sent by the `job-research-digest-hourly` cron at `:05` past each hour. The cron computes the current UTC hour `H` and POSTs to `/cron-digest?current_hour_utc=H`. The dispatcher then:

1. Calls RPC `get_tracked_jobs_due_for_digest(H)` — returns rows where `digest_enabled AND is_active AND digest_hour_utc = H AND last_digest_sent_at < today`.
2. Groups them by `user_id`.
3. For each user, fetches new `relevance='match'` listings since their last digest from each of their tracked jobs (capped at 10 per section).
4. If any tracked job has new listings: builds ONE consolidated email body (one section per tracked job, dark-themed HTML), sends via the `email-api` edge function with template slug `job_alerts.daily_digest`. Also writes one bell notification + optionally POSTs each tracked-job's `alert_webhook_url`.
5. If NO tracked jobs have new listings: silently stamps `last_digest_sent_at` so the row isn't re-evaluated until tomorrow.
6. Marks all included listings with `digest_included_at = now()` so they don't re-appear in tomorrow's digest.
7. Calls `append_job_alert_log` per tracked job for audit + 24h dedupe.

**Webhook payload** (when `alert_webhook_url` is set):

```json
{
  "tracked_job_id": "uuid",
  "label": "Senior React jobs in Athens",
  "listings": [[<JobListing>, <JobListing>, ...]]
}
```

---

## Schemas

### TrackedJob

```typescript
{
  id: string;                              // uuid
  user_id: string | null;                  // set for internal flow, null for external
  api_key_id: string | null;               // set for external flow, null for internal
  workspace_id: string | null;
  label: string;
  keywords: string[];
  excluded_keywords: string[];
  location: string | null;
  country_code: string | null;
  remote_only: boolean;
  seniority: 'junior' | 'mid' | 'senior' | 'lead' | 'principal' | 'any' | null;
  employment_type: string[];
  salary_min: number | null;
  salary_currency: string | null;
  excluded_companies: string[];
  preferred_companies: string[];
  sources_enabled: { google_jobs?: boolean; perplexity?: boolean; careers_pages?: boolean };
  careers_page_urls: string[];

  digest_enabled: boolean;
  digest_hour_utc: number;                 // 0..23
  alert_channels: string[];                // subset of ['bell','email','webhook']
  alert_webhook_url: string | null;
  refresh_interval_hours: number;          // 1..168, base cadence

  next_check_at: string | null;            // ISO timestamp
  last_refreshed_at: string | null;
  last_digest_sent_at: string | null;
  consecutive_stable_refreshes: number;

  current_listing_count_24h: number;
  current_listing_count_7d: number;
  current_top_companies: unknown;
  current_metadata: unknown;
  current_snapshot_at: string | null;

  total_billed_usd: number;
  total_partner_credits_debited: number;
  last_refresh_billed_usd: number | null;
  last_refresh_credits_debited: number | null;

  is_active: boolean;
  auto_expand_keywords: boolean;
  created_at: string;
  updated_at: string;
}
```

### JobListing

```typescript
{
  id: string;                              // uuid
  tracked_job_id: string;
  refresh_run_id: string;                  // groups rows by which refresh produced them
  url: string;                             // raw URL as found
  canonical_url: string;                   // tracking params stripped
  content_hash: string;                    // dedupe key (sha1 of canonical_url + title + company)

  title: string | null;
  company: string | null;
  company_domain: string | null;
  location: string | null;
  is_remote: boolean | null;
  salary_min: number | null;
  salary_max: number | null;
  salary_currency: string | null;
  salary_period: 'hour' | 'day' | 'week' | 'month' | 'year' | null;
  employment_type: string | null;
  seniority: string | null;
  description_excerpt: string | null;
  description_md: string | null;

  posted_at: string | null;                // ISO timestamp from source
  expires_at: string | null;
  discovered_at: string;                   // when WE found it

  source: 'google_jobs' | 'perplexity_sonar' | 'firecrawl_careers' | 'rss_feed';
  relevance: 'match' | 'tangential' | 'mismatch' | 'unverifiable' | null;
  relevance_score: number | null;          // 0..1
  match_note: string | null;               // e.g. "all keywords + title hit"
  classifier_cached: boolean;              // true if served from 7d verdict cache

  digest_included_at: string | null;       // when this row first appeared in a digest
  user_action: 'saved' | 'applied' | 'dismissed' | 'interested' | null;
  user_action_at: string | null;
  user_notes: string | null;

  // v0.3 — annualized USD for cross-source comparison; raw salary_min/max/currency/period above preserved
  salary_annual_min_usd: number | null;
  salary_annual_max_usd: number | null;
  salary_normalization_note: string | null;
}
```

### JobExclusion

```typescript
{
  id: string;
  tracked_job_id: string;
  url: string | null;
  domain: string | null;
  company: string | null;
  reason: string | null;
  created_at: string;
}
```

---

## Error format

All errors return:

```json
{ "detail": "human-readable message" }
```

| Status | Meaning |
|---|---|
| `400` | Bad request — missing required field, invalid value |
| `401` | Missing or invalid JWT |
| `403` | Forbidden (e.g. `force_full_discovery=true` without admin role) |
| `404` | Tracked job not found OR not owned by you |
| `500` | Internal error — check MIVAA logs |

---

## Costs

External-API partner billing is documented in [JOB_OP_CREDIT_COST](../../mivaa-pdf-extractor/app/services/integrations/job_cost_logger.py). For internal flow, **no credits are debited per call** — everything is metered into `ai_usage_logs` with `module_slug='job-research'` for cost-attribution dashboards but not charged through the credit system. Typical per-refresh cost: **$0.005–0.010** on a stable search (most candidates hit the verdict cache; only a handful trigger Haiku).

---

## KAI agent surface

The KAI agent (`agentType: 'kai'`) exposes 4 tools backed by this API:

| Tool | Purpose | Credits |
|---|---|---|
| `track_job_search` | Create / update / pause / resume / delete a tracked job. Resolves target by `tracked_job_id` or by `label`. | 0 |
| `list_my_job_searches` | Read the user's tracked jobs. | 0 |
| `find_jobs` | Fetch recent matched listings for a tracked job. | 0 |
| `get_job_digest_preview` | Preview today's consolidated digest. | 0 |

All 4 are 0-credit because the expensive part (discovery) runs on cron, not on demand. They're module-gated on `job-research`; if disabled, each tool returns `{ success: false, error: 'job-research module is disabled — ask an admin to enable it' }`.

**Chunk types** streamed back to AgentHub during tool use:
- `job_search_created` — emitted by `track_job_search` after a successful create. Payload: `{ tracked_job }`.
- `job_search_updated` — emitted on update / pause / resume / delete. Payload: `{ tracked_job_id, action, tracked_job }`.
- `job_searches_list` — emitted by `list_my_job_searches`. Payload: `{ tracked_jobs: [] }`.
- `job_listings_feed` — emitted by `find_jobs`. Payload: `{ tracked_job_id, days, listings: [] }`.
- `job_digest_preview` — emitted by `get_job_digest_preview`. Payload: `{ days, total, section_count, sections: [{ tracked_job_id, label, listings }] }`.

> **Note (v0.1.0)**: AgentHub rich-card renderers for these chunk types are not yet wired. The agent's text reply still carries the information; the chunks are inert for now and consumed only as logs. Rich card rendering will land in a follow-up patch.

The agent can also deep-link the user to the hidden Knowledge Base "Job Sources" page at `/knowledge-base/job-sources?tracked_job=<uuid>` — same path the daily digest email links to.

---

## User-facing surfaces (v0.2)

The job-research module exposes **two** user-facing surfaces, both auto-wired:

1. **The KAI agent conversation.** When the user creates a search via the agent, the conversation_id is captured on `tracked_jobs.source_conversation_id`. After every daily digest tick, the dispatcher inserts a new assistant message into that conversation thread with `metadata.chunk_type = 'job_findings'` carrying the new listings. AgentHub renders it as a rich card (per-listing url / company / location / salary / source). The user reopens the conversation and sees the running history of findings.
2. **The email digest** at `digest_hour_utc` (or only on `digest_day_of_week` if set). One consolidated email per user covering all of their tracked searches. The "Open" link deep-links to the conversation.

Operations visibility lives at `/admin/background-agents`: every tracked_job has a corresponding `background_agents` row, and every refresh writes an `agent_runs` row + per-source `agent_run_logs`. Admins see job-research runs alongside other background agents — no module-specific UI required.

---

## Required secrets (MIVAA backend)

| Var | Purpose | Required when |
|---|---|---|
| `DATAFORSEO_BASE64` (or `DATAFORSEO_LOGIN` + `DATAFORSEO_PASSWORD`) | Google Jobs SERP | `sources_enabled.google_jobs: true` |
| `PERPLEXITY_API_KEY` | Sonar discovery | `sources_enabled.perplexity: true` |
| `FIRECRAWL_API_KEY` | Career-page scraping | `sources_enabled.careers_pages: true` |
| `ANTHROPIC_API_KEY` | Haiku classifier | Always (else everything is `unverifiable`) |
| `CRON_SECRET` | Validates `x-cron-secret` on `/cron-refresh` and `/cron-digest` | Always |
| `PUBLIC_APP_URL` | Used by the digest dispatcher to build the deep-link to the source conversation in `/agent-hub`. Same env var the catalog module uses for public catalog URLs — do NOT introduce a duplicate. | Optional; defaults to `https://app.materialshub.gr` |
| `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` | Used by the digest dispatcher to call `email-api` | Always |

---

## Future / deferred (not in v0.1.0)

- **External `api_keys` flow** (`/api/v1/jobs/track/*` with `Authorization: Bearer kai_*`) — partner billing already wired in `JOB_OP_CREDIT_COST`, just needs a sister router file.
- **AgentHub rich cards** for the 5 chunk types above.
- **RSS source adapter** as a 4th discovery option.
- **Real-time `high_match_burst` alert** (separate from the daily digest) — schema supports it (`alert_type='high_match_burst'`), dispatcher logic not yet implemented.
- **`auto_expand_keywords`** Haiku-driven keyword expansion on first refresh.
- **Classifier feedback UI** writing to `job_match_corrections` (table + few-shot loop already in place; UI button not wired).
