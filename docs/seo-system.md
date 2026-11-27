# SEO & Content System

Keyword research, article generation, and per-website intelligence — Search Console performance, site health, and rank/backlink tracking.

**API reference:** [`public/api/openapi-edge.json`](../public/api/openapi-edge.json) — `seo-api`, `seo-rank-tracker`, `seo-domain-tracker`, `seo-site-audit`, `seo-content-freshness`, `gsc-api` (browse via [`edge-swagger.html`](../public/api/edge-swagger.html)).
**Modules:** `seo-toolkit` (research / write / audit) and `seo-interlinking` (internal-link suggestions), both `price_tier='pro'`.

---

## 1. Connected Websites is the organising unit

Before 2026-07 the SEO features were a set of one-shot tools with no memory of *which site* they were about. Now a workspace **connects a website once** (`user_websites`), and every SEO surface hangs off it: Search Console, Site Health, Rankings & Links, keyword research, articles and research runs.

The list is **Profile → Websites** (`WebsitesTab`); one site is its own page at **`/websites/:id`** (`WebsiteSeoDashboard`, `PageHeader` + breadcrumbs back to the list). The rail is declared ONCE in [src/components/core/Profile/seo/sections.ts](../src/components/core/Profile/seo/sections.ts): ten sections, each with `&view=` sub-panes rendered as a `HubTabNav` strip, never a second rail (#475).

| Section (`?section=`) | Views (`&view=`) | Backed by |
|---|---|---|
| `overview` | — | `get_website_setup` (setup checklist), opportunities, search presence, ranking profile |
| `gsc` Search performance | `queries` · `cannibalisation` | `gsc-api` → `gsc_performance`, `gsc_breakdown`; `get_gsc_striking_distance` / `get_gsc_movers` (Lens); `set_cannibalisation_main_page` → `seo_cannibalisation_decisions` |
| `keywords` | `tracked` · `serp` · `research` | `seo-rank-tracker` (§4.1), `get_website_serp_features`, `seo_keyword_research` |
| `analytics` Audience | `overview` · `pages` · `geo` · `tech` · `commerce` · `funnel` · `retention` | GA4 via `gsc-api` |
| `ai` AI Citations | `overview` · `asked` · `discover` · `pages` · `beyond` | §8 |
| `authority` | `summary` (Backlinks & Authority) · `history` | `seo-domain-tracker` → `seo_domain_snapshots`; `get_website_domain_history` (snapshots + earlier `seo_domain_audit_history`, one series) |
| `competitors` | `domains` · `gap` | `seo_tracked_domains`; `get_competitor_keyword_gap` |
| `articles` | `articles` · `brand` | `seo_articles`; brand profile (website-specific since #484) |
| `health` Site Health | `crawl` · `pages` · `homepage` · `llms` | full crawl; page review (§8.4); `website_health_audits`; llms.txt |
| `reports` | `reports` · `runs` · `schedules` | `seo-reports`; `seo_research_runs`; `website_collector_schedules` (§8.1) |

`LEGACY_SECTION_ALIASES` maps every pre-#475 `?section=` id (`cannibalisation`, `ranks`, `research`, `analytics-*`, `rankings`, `domains`, `brand`, `crawl`, `llms`, `runs`, …) to its new section/view, and the URL is rewritten to the canonical form; navigation also accepts `section/view`. Guarded by [tests/unit/seoSections.test.ts](../tests/unit/seoSections.test.ts) (every old id resolves, every view reachable, one vertical rail).

Read pages land in `user_website_pages` (`crawl-user-website`, on the website's `page_crawl` collector schedule — §8.1 — or a manual Recrawl) and are what the inter-linking suggester links *between*. A page is read because **search demand names it**, never because the sitemap lists it — see *The crawl follows search demand* below.

---

## 2. Google Search Console

`gsc-api` handles OAuth and the data pull.

**The callback is server-side on purpose.** `GET /gsc-api?code&state` is Google's redirect target — not a client route. When the callback landed in the SPA, supabase-js saw Google's `?code` query param, assumed it was its own auth code and hijacked it before the SEO code ever ran. Moving the exchange into the edge function removed the ambiguity: the function verifies the **signed state** (which binds the callback to a specific website *and* user), exchanges the code, stores the connection in `website_gsc_connections`, auto-matches the GSC property to the website, backfills 28 days, and only then `302`s back to `/profile?tab=websites&gsc=…`.

| Action | Purpose |
|---|---|
| `authorize` | Return the Google consent URL with the signed state. |
| `GET ?code&state` | Server-side callback (above). |
| `list_properties` | GSC properties the connected account can access. |
| `set_property` | Bind a property manually when auto-match didn't. |
| `sync` | Pull the last N days now (default 28). |
| `disconnect` | Deactivate + clear tokens. History is kept. |
| `cron-sync` | Nightly refresh (03:30 UTC) of every active connection + 180-day retention prune, then `seo_autotrack_sweep` (§4.2) now that the day's rows have landed. `searchAppearance` is queried one day at a time: Search Console refuses to group it with any other dimension, date included. |
| `cron-inspect` | URL inspection (`gsc-url-inspection`, 02:10/08:10/14:10/20:10). Published article URLs not inspected in the last 7 days lead the queue; the rest follow by last inspection. |
| `submit_sitemaps` | User JWT + `marketing.seo`. `syncSitemaps()` resubmits the site's sitemap INDEX (children are read through it, never submitted) and deletes submitted sitemaps that now answer 404/410. `cron-submit-sitemaps` is the x-cron-secret twin over every active connection. A 403 names the fix ("Reconnect Search Console to grant write access"). |
| `cron-ga-sync` | GA4 hourly (`ga-analytics-sync-hourly`), including `landingPage × sessionSource` for assistant referrers into `website_ai_landing` (§8.3). |

**OAuth scope.** `GOOGLE_SCOPE` asks for `webmasters` (write — sitemap submission) and `content` (Merchant Center), not `webmasters.readonly`; `include_granted_scopes` merges them into an existing grant. A connection made under the old scope shows **Update Google access**, which re-consents in place: the upsert keeps the row and the GA property, and the Search Console property is re-matched by domain.

---

## 3. Site Health

`seo-site-audit` runs two things with very different latencies, and the UI reflects that honestly:

- **On-page audit** — returns immediately. Its score **is** the live Site Health figure, with the issue list beneath it.
- **Lighthouse** — asynchronous, and frequently still empty when the audit response comes back.

The first version rendered Lighthouse gauges as the headline, so a site with a perfectly good on-page score displayed four zeroes until the async job landed. Now the on-page score leads and Lighthouse gauges appear **only when present**. `cron-run` (daily 04:00) audits only websites whose `site_audit` collector is due (`website_collectors_due`, §8.1); history is pruned at 180 days. `action: "page"` audits any https, public URL on the website's own domain (session or `kai_` key, `marketing.seo`, `seo-toolkit` entitled) through `callSEOAgentRoute` in `dataforseo-dispatch.ts`, the one metered path to DataForSEO; the result is returned, not stored, because `website_health_audits` is the homepage's history and feeds the score-change alert.

---

## 4. Rankings & Links

`seo-domain-tracker` takes a weekly DataForSEO snapshot per connected website: ranked keywords, positions and backlink profile, into `seo_domain_snapshots` + `seo_domain_keywords`. Week-over-week movement is turned into **workspace-scoped alerts routed through the Flows engine** rather than a hardcoded email — an operator can retarget, mute or extend the alert without a deploy. The cron fires daily at 03:30 UTC and collects only websites whose `domain_tracking` collector is due (§8.1). It is the ONE collector of a website's own domain: the hourly toolkit audit no longer collects it, and Authority → Audit history reads one series through `get_website_domain_history` (snapshots plus the earlier audits, read in place). Probe `ops.silent_zero` `seo_domain_tracking_never_lands`.

### 4.1 Rank tracking — the keywords YOU chose, followed daily (2026-08-29)

`seo-domain-tracker` answers *what does this domain happen to rank for*, discovers that set, and
**replaces it wholesale every week**. It cannot answer *did the forty keywords I care about move*,
which is the daily loop of every rank tracker on the market. `seo-rank-tracker` is that second
question: a fixed, user-picked set followed as a **time series**.

| Piece | What it is |
|---|---|
| `seo_tracked_keywords` | The chosen set — unique (NULLS NOT DISTINCT) on `(website_id, keyword, country_code, device, location_code)`; `location_code` NULL = country level, else a DataForSEO city/region code. `device` and `location_code` are sent on every SERP call. Up to 200 added per paste, de-duplicated and lower-cased client-side so a pasted list with blanks and repeats is not N−1 unique-violation round trips. |
| `seo_keyword_positions` | One row per keyword per day. Retained ~760 days (the summary RPC's own ceiling is 730). |
| `get_website_rank_summary(p_website_id, p_days)` | **SQL derives the number AND the verdict.** Returns the series, the averages and the movement already inverted. |
| `WebsiteRankTrackerPanel` | The Rank tracking tab — formats what the RPC returns, derives nothing. |
| `seo_my_rankings` (agent tool, 2026-09-05) | Edith's **first-party** read of the connected website: this RPC plus `get_gsc_summary`, relayed with their `status` intact. It exists because "which keywords does materialshub.gr rank for right now" was answered from the DataForSEO Labs index — two keywords, SERPs crawled seven weeks earlier — while this tracker had checked 129 keywords 35 minutes before (brand at #1) and Search Console was connected. The Labs tools (`seo_ranked_keywords`, `seo_domain_snapshot`) are for competitors and market sizing; they now return and render the SERP crawl date, and Edith's prompt says to read this tool first for the workspace's own site. |

**Three arithmetic rules, which are one rule in three costumes** — all of them the "a metric is a
value or a stated reason there is no value" rule from CLAUDE.md:

- **Not ranking is not position 101.** Outside the top 100 stores `position NULL` with `found=false` and is EXCLUDED from the average. A sentinel rank gets averaged and charted as though it were real, so dropping your worst keyword would read as an improvement.
- **A failed check is unknown, not lost.** A check that could not run stores `error`, is excluded from every figure and counted separately. Announcing "you left the top 10" off a timed-out request is worse than saying nothing.
- **Up is good.** Position 3 beats position 30, so the RPC inverts the raw delta **once** and no consumer has to remember which way round it is.

**Cost scales with what a user types** — one SERP call per keyword per run, priced at the depth it
reads (a depth-100 live SERP is $0.0155, plus 2 units when `resolve_poisoned_results` is on; the
reservation, the collector estimate and the call all read one flag in `serp-price.ts`). Both paths
cap at **60 keywords per invocation**. A manual run (Check now) takes an optional `tag` that limits it
to active keywords carrying that tag, in the same due order and cap.

**The cron only runs what a schedule asked for.** `cron-run` picks sites from
`website_collectors_due('rank_tracking')` (§8.1); a website with no schedule row is checked only on
Check now. A day is done once every keyword was attempted (`website_rank_run_complete`), so a
failing keyword cannot keep a weekly schedule due.

**A top-10 drop is confirmed before it is announced.** One live read is a sample (the same query
seconds apart read #3 and "not in top 100"). A reading that leaves the top 10 gets up to two
immediate re-reads into `seo_keyword_positions.rechecked` / `recheck_best_position`; `position`
stays the first read so history is not biased. `seo_keywords_dropped_out_of_top10` requires a
confirming re-read and returns the page that was ranking; the alert links to
`/agent-hub?agent=marketing` with a seeded review prompt. `seo_my_rankings` takes `keywords` and
returns day-by-day history from `get_keyword_rank_history`.

**Google GoTo URLs.** Since ~2026-10-27 live SERPs return results as `google.com/goto?url=<opaque>`
with domain `google.com`. Every `/serp/` response is normalised through `_shared/seo/serp-goto.ts`
(twin of MIVAA's `dataforseo_goto.py`): the domain comes from the breadcrumb, `url` becomes null,
the redirect is kept as `goto_url`. When we rank behind a GoTo link the tracker follows that ONE
redirect (`resolveOwnGoto`: only `google.*/goto`, a `Location` kept only if it is on our host, the
destination never fetched) to record which of our pages ranks. Rank rows from 2026-10-30..11-08 that
recorded "not found" while every result domain was google.com were relabelled unknown.
`last_checked_at` is stamped **even on failure**, or one broken keyword sits at the head of the
queue forever and starves everything behind it.

**The cap is per RUN, not per day, and the sweep is scheduled in legs.** `20 5,7,9,11 * * *` — four
legs, each taking what the earlier ones did not reach, so a 129-keyword set is covered every day
instead of rotating over two. Adding legs is nearly free: `seo_keywords_due(p_only_stale => true)`
returns nothing once the day's work is done and the leg makes no upstream call at all. Before this
the sweep was one leg of 60 against 129 keywords — the panel said "followed daily" over figures that
blended three capture dates, and a failed check waited a full day for its retry.

**`seo_keywords_due` is the one derivation of what to check next** (service_role only): a check that
failed on an EARLIER day first, then never-checked, then least-recently-checked; `p_only_stale` skips
what today's earlier legs covered; `p_website_id` NULL orders the whole platform at once, so a big
site cannot starve a small one by sorting first every leg. It replaced `seo_keywords_to_recheck` plus
two PostgREST reads in the edge function — two places deciding one thing.
- **The module gate is IN the queue**, not in the caller's loop. The cap is global, so keywords
  belonging to a lapsed workspace were taken from the platform's 60 rows and then skipped without
  being stamped — which left them the least recently checked, so they won the next leg too. One
  workspace could have stopped rank tracking for everybody while every run reported `ok`. The edge
  function asks `isWorkspaceEntitled` again before spending (invariant 10); the queue is what stops
  the cap being eaten.
- **A failure from TODAY does not jump the queue.** Jumping it is for a failure from an earlier day
  ("8 of 129 failed" sitting on the panel across a two-day rotation); a keyword that failed three
  deep reads and a shallow one twenty minutes ago is retried with whatever capacity a later leg has
  spare. Otherwise a permanently unreadable keyword holds a slot at the head of every leg forever.
- **One queue for the whole batch, not a pool per site.** Each row carries its own website, so the
  twelve workers stay busy whoever the work belongs to. Per-site pools run in sequence give a site
  with two due keywords a concurrency of two.

**Time is the other constraint, and it was the binding one.** One keyword takes ~19 s end to
end (a 7–15 s live SERP call per `ai_usage_logs.metadata.latency_ms`, plus two writes), so
checking 60 one after another needs ~19 minutes — and the edge gateway cuts the request off at
**150 s** with a 504 `IDLE_TIMEOUT`, well before pg_net's 280 s. Measured 2026-09-04 on a
129-keyword set: the sweep checked **10**, so each keyword came round every ~13 days under a
panel that said "checked daily". The shape is the silent-rotation one: every keyword that WAS
checked was checked correctly, so nothing raised. The loop is now a pool of **12 in flight**
(`CONCURRENCY`), which puts the 60-cap at ~5 rounds, ~100 s. Two guards keep it there: every SERP
call carries a **45 s** `AbortSignal.timeout` (a hung call otherwise holds one of the twelve workers
until the platform kills the whole request), and the pool stops **starting** keywords at 120 s
(`RUN_DEADLINE_MS`) so the run ends with a report instead of dying at the 504 — which also skipped
the drop alerts and the retention delete, while `api_usage_logs` recorded the 200 it never sent.

**Out of time is not a failed check.** A call is not dispatched with less than `MIN_CALL_BUDGET_MS`
(6 s) left — a live SERP needs 7–15 s, so sending one is a guaranteed abort that still pays for the
upstream task — and when nothing was observed the collector writes NOTHING (`OutOfTime`): an `error`
row claims we asked and were refused, and it would stamp `last_checked_at` and hide the keyword from
the rest of the day's legs. Unstamped and stale IS the front of the next queue. A failure we DID
observe is still stored with its message. The abort itself is renamed on the way out — `AbortSignal`
says `Signal timed out.`, which the note would print as what "the source said".

**Two writing rules that come from the same place:** an error row clears `serp_features` /
`owned_features` (the upsert can land on a row an earlier leg wrote today, and the badges would
otherwise survive next to a position we say we could not read), and `last_checked_at` is stamped
only when the position row was actually written — a stamp after a failed write hides the keyword
for the rest of the day with neither a position nor an error to show for the call we paid for.
Write failures are counted and reported; a leg that bought work and stored none of it returns 500
rather than `ok`, because re-buying the same calls every leg forever while reporting success is the
`ops.silent_zero` shape.

**A capped run means the newest capture DATE covers part of the set, so every reader uses each
keyword's OWN latest capture.** `get_website_rank_summary` joined every keyword to the site's
newest date; the morning after a 60-of-129 run that rendered "materialshub", #1 for a week, as
"not in top 100", and the visibility line dropped to 0% on a day nothing moved. The summary,
the per-keyword row (which now carries its own `captured_at`, and the panel prints "checked 2
days ago" when it differs), the `change` column (against the last ANSWERED check, so a failed
day in between does not blank it), the visibility trend (the state of the whole set as of each
day) and `seo_keywords_dropped_out_of_top10` all derive from the per-keyword latest capture.
`summary.as_of_latest` says how much of the set the newest run reached and the note says the
rest.

**A failed check is retried three times and re-checked FIRST next run.** DataForSEO fails
8–12% of Greek depth-100 SERP tasks on the first try (40101 "internal SE server error", 40106
"partial results"); one retry left 5–8% of a sweep as unknown, and because `last_checked_at`
is stamped on failure too (correctly — a broken keyword must not starve the rest) those
keywords went to the BACK of a two-day rotation, so "8 of 129 latest checks failed" sat on the
panel for days. `serpWithRetry` now makes three attempts with backoff, `seo_keywords_due` puts a
failed check at the head of the next leg — hours later, not tomorrow — and after those three
attempts the collector reads the **top 50 once** before recording unknown: what DataForSEO fails on
is the deep pages (40106 says so, and the 40101s land on the same depth-100 Greek tasks), so the
shallower ask usually answers, and "not in top 50" with `depth_checked = 50` is a real answer where
unknown is none. Residual after all that, measured 09-06→09-09: **1–2 keywords per 60-keyword leg**,
all transient upstream task errors. The summary carries `last_checked_at` (a timestamp — the capture
DATE read "checked 10h ago" at ten in the morning) and the note names the source's error text.
**A partial page set is used when we are IN it.** 40106 returns the result pages DataForSEO did
fetch; MIVAA's `_call` passes those items through with `ok=False`, and the tracker accepts them
on its LAST attempt only: a position found in the fetched pages is real, "not found in a partial
set" stays unknown. Three Greek queries failed 40106 on every one of three attempts on
2026-09-05, which is what this is for. **And then the top 50 is read.** The partial sets vary per
attempt for the same keyword (81 items, then 32; 13, then 61), so this is the provider's deep-page
scraping failing on Greek SERPs, not "fewer results exist" — and a 50-deep read of the same
keyword came back complete (57 items). When the partial set does not contain us, the tracker
reads depth 50 and records `seo_keyword_positions.depth_checked = 50`; the panel says "not in top
50", which is a different, honest sentence from "not in top 100". Unknown is now reserved for a
keyword the provider could not read at all.

**An upstream failure inside a 200 envelope is UNKNOWN, never "not in top 100".** MIVAA's
dispatcher answers HTTP 200 with `success:false` and `data.error` when DataForSEO itself fails
(task 40106 "partial results", 40101 "internal SE error"), with an empty item list. The tracker
read `data.items ?? []`, found nothing, and stored `found=false, error=null` — 12 rows over two
days, pixel-identical in the panel to a real miss and counted in the visibility denominator.
`serp()` now throws on `success:false`, on `data.error`, and on an EMPTY item list (a Google
results page with no blocks of any kind does not exist), and `serpWithRetry` tries once more
before recording the error. The 12 rows were stamped with an error retroactively; an empty
`serp_features` on a `found=false` row is the tell for any older data.

**The crawl reports the sitemap's real size, and the toast names the cap when it bit.**
`crawl-user-website` collected `max_pages` URLs and returned that count as `pages_discovered`,
so a 127-URL sitemap under the default cap of 50 reported "50 of 50 pages indexed" and read as
a 50-page site. It now collects up to the hard cap, returns `pages_discovered` (all of them),
`pages_capped_at` and `capped`, and `describeCrawlResult` prints "50 of 127 pages indexed — this
site's page cap is 50" so the reader knows where to go. The cap itself is edited under
Websites → Edit (10–1000).

**The crawl follows search demand, and the sitemap is only discovery.**
Enumerating the sitemap meant reading whatever existed. For materialshub.gr that was 5,249 URLs,
of which 492 read pages had never appeared in a search result while 5 pages Google was actively
showing had never been read at all; 89% of the site is the same 311 templates repeated across 26
cities, so finishing was re-reading near-duplicates. `seo_page_demand` derives per URL which
keywords name it and at what position — from `gsc_performance`, `seo_keyword_positions` and
`seo_domain_keywords` — and `get_page_crawl_queue` ranks those by opportunity: `new_in_search`,
then `striking_distance` (5–20), `impressions_no_clicks`, `google_recrawled`, `periodic_refresh`.
That queue is the ONLY source of URLs the crawler reads (11 pages for materialshub.gr, not 4,785).
The sitemap still runs every time — one XML fetch, nothing per page — and records which URLs
exist, which is what `gsc-url-inspection` and the retire sweep need.

**Each feed carries the keyword, so a read page knows what it is FOR.** `user_website_pages`
stores `content_text` (the whole document), `demand_snapshot` (the keywords, position,
impressions and clicks as they were at read time — history, never re-derived; call
`seo_page_demand` for the live figure), `demand_reason` and `fetch_method`. A 600-char excerpt
with no keyword cannot support "you sit at #12 for X and X is absent from the H1", which is why
519 indexed pages produced no suggestions.

**Firecrawl is the fallback, not the reader.** It renders JavaScript and defeats anti-bot on
sites we do not control; against a server-rendered page it contributed only its
ten-scrapes-a-minute key limit — the sole reason a crawl could never finish. A plain guarded GET
of materialshub.gr returns the same title, the same meta description and 13,631 characters of
text in 0.6 s. `scrapePage` reads directly first and falls back to Firecrawl only when the HTML
held under `DIRECT_TEXT_FLOOR` characters (a client-rendered shell, which a tenant may well add);
`fetch_method` records which ran, so the paid path stays measured rather than assumed.

**A page is charged, not a run.** `seo-website-crawl` is 1 credit per QUEUED page, debited before
the read (invariant 10) and refunded for any the budget never reaches; an empty queue costs
nothing. It was 5 credits per invocation on an hourly cron misnamed `every-6h` — 120 credits a
day for one site, 1,755 since 2026-07-27, including 240 across two days that read zero pages and
refunded none, because the run reports `ok` when the sitemap-stamp upserts succeed whatever the
reads did. Cron is `user-website-crawl-hourly` (:45): a site runs daily for demand, and hourly while `get_page_backfill_queue` still holds never-read sitemap pages — those fill spare capacity (50 reads a run), direct fetch only. Analytics (GA4) refreshes hourly via `ga-analytics-sync-hourly` → `gsc-api` `cron-ga-sync`.

**A new tenant is not empty on day one.** DataForSEO Labs answers from Google's public index with
no Search Console connection, so it is the cold start for a domain that already ranks — its feed
returns PATHS where Search Console returns absolute URLs, and `seo_absolute_url` resolves both
onto one key (a relative URL there is unfetchable AND a duplicate row). A site that ranks for
nothing yet seeds once from a 20-URL evenly-spaced sample, never as ongoing work.

**An empty OnPage section is nothing found, not one finding.** DataForSEO answers every OnPage
section with a task envelope — `{crawl_progress, items_count, items: [...]}` — and when the
section has nothing to report, `items` is `null`. MIVAA's `_call` normaliser treated a falsy
`items` as "data inline" and handed the envelope back as the one item; `seo-site-audit` stored it
as an issue. materialshub.gr showed "Cannot be indexed: 1" and "Redirect chains: 1" for a week
with no URL and nothing to fix, on a crawl that had found neither. Fixed at both ends: the
normaliser tests for the KEY (`"items" in r`), and the collector unwraps any envelope it is
handed and treats an empty one as no data. The two phantom rows were deleted.

**A crawl issue is a URL, the provider's reason, and the remedy.** `website_crawl_issues.detail`
has always held the whole OnPage item. `get_website_crawl_report` now projects the part a reader
acts on into each sample row (25 per type): the non-indexable `reason` (robots.txt / meta tag /
X-Robots-Tag / attribute / too many redirects), a redirect chain's hops and loop flag, the
duplicated title text and the pages sharing it, the near-duplicate pages with similarity, a
broken link's target and status. `WebsiteCrawlPanel` prints that per row with a "Show all N"
control and a **Fix** line per issue type; `WebsiteHealthPanel` prints a Fix line per failing
homepage check from `CHECK_FIXES` in `seo/onPageChecks.ts`. The provider returns booleans and
lists; the remedy is ours to state, or a red row is a red row.

**Keyword Research lists the researched keyword's own figures and can be deleted.** The list
showed keyword, topic, count, volume and date; `recommendedPrimary` in the blob holds volume,
CPC, competition, difficulty, opportunity and trend for the researched term, so the row shows
them (a dash is "not returned", never 0 — difficulty is unscored for most Greek terms). Delete is
owner-only by RLS (`seo_keyword_research_owner`); a member who did not run it gets a refusal.

**Rival domains live under Competitors, not Authority.** Authority → Audit history is the site's
own domain (one series, `get_website_domain_history`). Competitors takes any domain, measures it on
the same `seo-domain-tracker` run (the `domain_tracking` collector) in the same market
(`seo_competitor_snapshots`), and plots it beside the site. Competitors → Keyword Gap is
`get_competitor_keyword_gap`: what the active competitors rank for that the site neither ranks for
nor tracks; no competitors / nothing collected is stated, never an empty table.

**The crawl reads the sitemap the site ADVERTISES, and the site is bigger than its first sitemap.**
materialshub.gr's robots.txt names `/sitemap-index.xml`, which holds three children: 82 + 83 +
5,082 URLs (the city × category tree). `user_websites.sitemap_url` had been auto-discovered as
`/sitemap.xml` — the 82-URL child — and the hard cap was 1,000, so "we have 1,700 pages and it
finds 50" was two ceilings stacked. The row now points at the index, the hard cap and the form
cap are 6,000, the Site Health crawl requests the site's own `max_pages` instead of a flat 100,
and the Site Health crawl requests the site's own `max_pages` instead of a flat 100. Reading
every one of those URLs is no longer the goal — the sitemap says what EXISTS, and search demand
decides what is worth reading.

**The rank tracker records which SERP blocks WE hold.** `seo_keyword_positions.owned_features`
(featured_snippet, ai_overview, people_also_ask, local_pack, knowledge_graph, images, video…) is
computed by a bounded walk over every non-organic block for any `domain`/`url` that is ours — a
featured snippet carries `domain` at the top, an AI Overview buries it in `references`, People
Also Ask in `expanded_element`, and a per-type map goes stale the next time the provider adds a
field. `get_website_rank_summary` returns `summary.features.{block}.{present,owned}` and the
per-keyword `owned_features`; the Rankings panel prints owned/present tiles and per-row badges
(✓ = cites us). A block on the page that names a rival is a target, not a win.

**AI Visibility asks what the subject's facets say, and a subject with no product type asks
nothing useful.** MIVAA's `llm_probe_templates.build_probes` renders the four stock questions
from `tracked_mentions.subject_facets` (`product_type` defaults to the literal "products") plus
`source_config.custom_probes`. materialshub.gr's brand subject had no product type, `language_codes
['en']` and no country, so the assistants were asked "What are the best products brands?" and
named Apple, Toyota and Sony — which the panel then reported as "who they name instead". The
questions are the measurement: the panel now has **Edit questions** (custom prompts, aliases,
languages, countries → `updateTrackedMention`), and this subject was given a product type,
`el`+`en`, `GR` and five Greek/English questions about sourcing tiles, sanitary ware and marble
in Thessaloniki and for hotel projects. Perplexity (`sonar`) probes return HTTP 401 because that
account is unfunded; the panel reports it as No verdict, not 0%. **Changing the questions restarts
the measurement**: the 90-day window would otherwise keep reporting answers to the OLD questions
(and their brands) beside the new ones, so the eight probes that asked "best products brands"
were deleted and the panel carries a permanent **Run probes now** button (it was only inside the
diagnosis banner, which does not show on a healthy subject). The nightly run is 03:00 UTC; MIVAA's
`cron-probe-llm` (x-cron-secret) takes subjects whose `next_check_at` is due.

**Which assistants run = the tier's roster ∩ the keys MIVAA can resolve, and a dropped one leaves
no row.** The cheap tier asks Claude Haiku, ChatGPT (gpt-5-mini), Gemini Flash and Perplexity
Sonar; frontier asks Opus, GPT-5, Gemini Pro and Sonar Pro (`TIER_MODELS` in
`llm_mention_probe_service.py`). ChatGPT was removed on 2026-08-23 after every one of its 212
gpt-4o-mini probes returned HTTP 429, and restored on 2026-09-05 as a deliberate provider
decision — in the one shape that cannot regrow the fallback embedder: httpx (no `openai`
package), chat completions only, in that one file. `test_openai_is_chat_only_and_lives_in_one_file`
fails the build on the package, on any embeddings endpoint, and on `api.openai.com` /
`OPENAI_API_KEY` anywhere else in MIVAA. It runs only once `OPENAI_API_KEY` is set in Admin →
Platform Secrets on a FUNDED account; until then the roster shows it as "no key configured".
The probes run in MIVAA (Python → provider HTTP over httpx, per the three-runtimes rule), not
through the edge AI SDK client; the client is not what decides the roster, the keys are. Gemini
did not run for materialshub.gr because MIVAA resolved no key under `GEMINI_API_KEY` /
`GOOGLE_GENAI_API_KEY` — the edge runtime holds the same credential as
`GOOGLE_GENERATIVE_AI_API_KEY`, so the resolver now accepts that name too, and pasting the key
into Admin → Platform Secrets under any of the three enables Gemini within 30 s, no deploy.
Perplexity's key resolves but the account answers 401 (unfunded). `GET
/api/v1/mention-monitoring/probe-providers` reports the roster with each provider's key source
(env / db / default / missing, never the value); the panel prints it above "By assistant" with
"no key configured" on the missing ones, because a two-row table otherwise reads as a
two-assistant design.

**Every question is asked to every assistant, and the panel shows each reply.** A probe run
asks each prompt to every model in the tier that has a key. `get_website_ai_answers(website,
days)` returns the matrix behind the visibility figures: per subject × question (the newest
wording), the latest reply of each assistant — mention verdict, rank, whether it linked the
site, the brands it named instead, cited URLs and the answer text (bounded to 1,500 chars).
"Questions we asked" renders one row per assistant per question, including a "not run — no key
configured" row for a roster model with no reply, so a missing provider is a visible gap on
every question rather than a column that does not exist.

**Keyword Research feeds the tracker and starts from the site's own pages.** A research row, the
detail header and each cluster carry a Track action (`addTrackedKeywords`, GR/el). "Suggested
from your pages" lists page titles (brand suffix stripped) that are neither tracked nor
researched, each with Research (opens the agent with the keyword and market in the prompt) and
Track. The Search Performance breakdown sorts by any column on click.

**Suggestions for ONE page come from two sources, in order of trust.** Pick a page (title or URL
search over the indexed pages) and the card shows (1) the queries Search Console already shows
that page for — `get_page_gsc_queries(website, page, days)`: impressions, clicks, CTR and an
impression-weighted position over the window, from `gsc_performance` rows we hold, free and
instant; and (2) on request, paid keyword ideas seeded from the page's TITLE — `seo-api`
`page_ideas` → `DataForSEOClient.keywordIdeas` (Google Ads expansion + Labs related keywords,
GR/el, merged, by volume). The seed comes from the page row we stored, never from a URL the
caller typed; the handler checks membership, entitlement and reserves credits before the call
and settles against the provider's reported cost (`keywordIdeas` returns `costUsd` for that
reason — the research helpers discard it). Every row has Research and Track.

**Alerts fire on leaving the top 10 only**, through the existing `seo.ranking_movement` flow
trigger — not a new near-duplicate one. A tracker that alerts on every wobble gets muted, and a
muted alert cannot warn about anything. (The first cut emitted `seo.rank_drop`, which is in no
`TriggerType` union: flow-engine matched zero flows and returned `{triggered: 0}` without error —
an alert that silently never arrives.)

**DataForSEO parameter traps, verified against the live SERP before the collector was written:**
the endpoint takes `country_code` and maps it to `location_code` itself — passing the mapped name
is a hard 400; and `rank_group` is the organic position while `rank_absolute` counts every block,
which would report a place or two below what Search Console and every other tracker says.

`verify_jwt` is disabled so the daily `cron-run` (`x-cron-secret`) works; the user-facing `run`
action calls `authenticate()` + `userCanAccessWorkspace()` and asserts the `seo-toolkit`
entitlement **before** spending (invariant 10).

### 4.2 Discovery — Search Console queries → the tracked set (2026-09-12)

Search Console already knows every query the site is **visible** for; the tracked set only knows
the ones somebody typed in. `seo_keyword_candidates` closes that gap, and the whole design is about
*not* closing it wholesale: of 57 real queries on materialshub.gr, 3 were search operators from
somebody else's scraper (`-site:facebook.com … "shell"`), two spellings of one Greek phrase were
reported as two rows, and 42 had a single impression on a single day. Every active keyword is a
paid SERP call on every rotation, so "track everything Google reports" buys noise with money and
slows the rotation for the keywords that matter.

**One derivation, two readers.** `seo_keyword_candidate_rows(website, days)` is the source: it
folds by normalised spelling, scores, and returns a verdict per query. The panel renders it and
`seo_promote_keyword_candidates` writes from it — never a second query, or the screen describes a
decision made on different numbers.

| Piece | Does |
|---|---|
| `seo_normalize_keyword(text)` | lower + Greek/Latin accent fold + whitespace collapse. `μονωτικά υλικά` and `μονωτικα υλικα` are ONE keyword and one SERP call. |
| `seo_keyword_candidate_rows` | The derivation: evidence, junk verdict, qualification reason, already-tracked / dismissed / brand flags. |
| `seo_keyword_candidates` | Presentation wrapper: counts, the limited list, and the status/note when there is nothing to show. |
| `seo_promote_keyword_candidates` | The write. Named keywords → `source='manual'` (a person decided). None named → the engine takes the best that qualify, `source='gsc_auto'`, bounded by the site's ceiling. |
| `seo_retire_auto_keywords` | The other half of the loop: deactivates `gsc_auto` keywords with no impressions AND no top-100 position for 60 days. Never touches `manual`. |
| `seo_autotrack_sweep` | Nightly, service-role only. Called by `gsc-api` `cron-sync` once the day's rows land. Writes `user_websites.keyword_autotrack_{at,note}` per site — including on failure. |
| `seo_untrack_keyword` | Delete + dismissal in ONE transaction, so removing a keyword cannot be undone by tonight's sweep. |

**Qualification**, strongest evidence first: `earning_clicks` (≥1 click) → `recurring_impressions`
(≥10 impressions on ≥3 separate days) → `striking_distance` (position ≤20, ≥3 impressions, ≥2
days). Anything else is listed as *watching* — visible, offered, but not auto-taken.

**Off by default** (`user_websites.keyword_autotrack`), with a ceiling
(`keyword_autotrack_limit`, default 40) counting only `gsc_auto` rows: a person adding a keyword by
hand is making a decision, not spending an allowance. Turning the engine on is a spending decision
and the switch says so.

**Watched by `seo.keyword_autotrack_stalled`**, which probes the janitor's *output* — keywords that
meet the retirement rule and are still billing, a sweep older than three days, or a recorded
failure — because a sweep that quietly stops leaves a growing pile under a panel that looks normal.

---

## 5. Content pipeline

The five original functions (`seo-research` / `seo-plan` / `seo-write` / `seo-analyze` / `seo-pipeline`) were consolidated into a single action-discriminated **`seo-api`**:

| Action | Does |
|---|---|
| `research` | DataForSEO keyword research (6 parallel calls). |
| `plan` | Article structure, meta tags, FAQ schema. |
| `write` | Full article via Claude. |
| `analyze` | 15+ quality checks and a fix list. Reports only; it never rewrites the article. |
| `pipeline` | research → plan → write → analyze end to end. |
| `toolkit_research` / `toolkit_audit` | Website-aware toolkit entry points. |

**Inter-link suggestions are inserted into the article.** They used to be produced as a list you copied out and applied by hand, which meant most of them were never applied. The suggester now writes the links into the draft body; `user_website_pages` is the link target corpus.

Every action is surfaced to the `kai` agent as a first-class tool, so the same work can be done from chat or from the dashboard (capability-fabric parity). The DataForSEO gap capabilities were promoted from internal helpers to agent tools in the same pass.

### 5.1 Helpful-content / E-E-A-T (2026-08-10)

Every other input to the writer — research, SERP signals, competitor content scores — is derived
from the pages the article is trying to outrank, so an article built from those alone is by
construction a better-formatted restatement of what already ranks. Two `ContentBrief` blocks are
the only inputs that carry information the SERP does not already contain:

| Brief field | Feeds | Absent → |
|---|---|---|
| `provenance` (author, title, bio, publisher, `reviewedBy`, `aiDisclosure`) | schema.org `author`/`publisher`/`datePublished`/`reviewedBy`, plus a visible byline appended to the markdown at finalize | `provenance` fix, `medium` |
| `firsthandExperience` (`proprietaryData`, `ownedExamples`, `methodology`, `credentials`) | a dedicated writer-prompt block; the required `[!example]` block uses a real example instead of a hypothetical | `firsthand_experience` fix, `medium` |

**Neither check is auto-fixable, and neither ever synthesises its own input.** An LLM told to "add
an author" or "add first-hand experience" invents both, which is the exact failure these checks
exist to catch — a fabricated byline is a worse signal than a missing one. They report and stop.
Both land in the `helpfulContent` section score.

Three scoring rules were corrected in the same pass because they pushed *against* the guidance:

- **Keyword density is now asymmetric.** Too low is informational (`low`, not auto-fixable); it used to be `high` + auto-fixable, which sent the fix loop back into the prose to inject keyword repetitions purely to move a number that has not been a positive ranking signal for years. Placement (first 100 words / H1 / an H2) is what is actually enforced. Too high is still auto-fixed — removing stuffing improves prose and ranking together.
- **`authorityTone` → `claimAttribution`.** The old signal penalised hedging ("might", "perhaps"), i.e. scored an article *up* for asserting things it could not support, and the fix loop stripped qualifiers out of claims that genuinely vary by case. It now penalises the real problem — the appeal to an unnamed authority ("studies show", "experts agree"). The writer prompt gained a matching hard rule: never invent a source, URL, statistic, quote or person.
- **There is no auto-fix pass.** It rewrote the whole article with Gemini after the editor review and put back what the review removed (2026-10-11). The pipeline order is write → editor review → analysis, and the analysis only reports.

Still open, deliberately not built: no scaled-content guard (Phase 5 auto-suggests write-next
topics with no check against the site's declared focus) and no YMYL gate. The `[SOURCE:]` and
`[INTERNAL:]` quotas in checks 11/12 remain arbitrary counts.

### 5.2 Content decay — freshness (2026-08-23, #349 C1)

The pipeline generated articles and never revisited one. `freshness`, `decay`, `staleness` and
`refresh-due` had **zero hits** anywhere in `seo-api/` or `_shared/seo-types.ts`, which is the
gap that mattered: a page updated inside the last three months is cited noticeably more often by
answer engines than the same page left to age, and a page going stale produces no error, no
failed check and no row anywhere. It keeps ranking and simply stops being the page an engine
reaches for.

**One derivation.** `seo_article_refresh_due_at(completed_at, last_reviewed_at, refresh_interval_days)`
is the single definition of when an article is due. The view `seo_article_freshness`
(`security_invoker`, so RLS on `seo_articles` is the boundary) publishes `age_days`,
`refresh_due_at`, `content_dated_at` and `is_due`. Nothing re-adds an interval to a date anywhere
else — not the cron, not the edge handler, not the dashboard.

| Column on `seo_articles` | Means |
|---|---|
| `last_reviewed_at` | The content was materially refreshed. NULL falls back to `completed_at`. **Never `updated_at`** — any write touches that, so a two-year-old article reports fresh the moment anything saves. |
| `refresh_interval_days` | This article's own cadence. Default 90; an evergreen reference page can be longer. CHECK 7–730. |
| `refresh_snoozed_until` | An explicit "not yet" from a human. Without it a page somebody has decided is fine nags forever and the queue trains people to ignore it. |
| `refresh_notified_at` | Dedupe for the sweep: one nudge per refresh CYCLE, not per cron tick. |

**Three surfaces, one fact.**

- **The queue** — `/websites/:id` → *Articles* shows *Due for a refresh* with age, last-review date and a **Mark reviewed** action, plus a content-age column on the main table. `is_due` already accounts for the cadence and any snooze, so no screen forms a second opinion about what "due" means.
- **The nudge** — `seo-content-freshness` (`cron-sweep`, weekly Mon 05:15 UTC) emits `seo.article_refresh_due` per overdue article. It only notifies: it no longer drafts an LLM refresh by itself, and the article answer-check has no cron (its weekly job was unscheduled; "Check AI answers" in the article viewer runs it). Payload-only trigger, seeded active locked `system-default` flow, registered in the area registry. It stamps `refresh_notified_at` **after** the emit succeeds; stamping first would mark an article notified on a run that told nobody, and it would never be raised again.
- **The score** — an 11th `GEOScore` signal, `freshness` (10 pts), banded 0–90d / 90–180d / 180–365d / 365d+. Fed by `content_dated_at`, which the handler DERIVES from the article row when the request carries an `article_id` — a client-supplied date is only honoured for content that is not a stored article. **No date means an unpublished draft and scores full marks**, which is not the same fact as stale.

The 11 signals still sum to exactly 100: `freshness` was funded by taking 5 points from
statistics-with-attribution (15 → 10) and 5 from self-contained-paragraphs (10 → 5). Adding it on
top would have been silent — `overall` is clamped at 100, so a stale article with strong writing
signals would have kept a perfect score and the new signal would only ever have bitten pages that
were already scoring badly.

**Backstop:** `ops.silent_zero` probe `seo_article_refresh_due_never_emitted` — overdue articles
piling up with nothing stamped notified in 14 days. Watched to fire 2026-08-23.

---

### 5.3 Crawl policy — retrieval is not training (2026-08-23, #349 B4)

`public/robots.txt` blocked `OAI-SearchBot`, `ChatGPT-User`, `PerplexityBot` and `Perplexity-User`
in the same breath as `GPTBot` and `CCBot`. Those four are **retrieval** agents: they fetch a page
to answer a question somebody is asking right now, or to keep the index an answer cites from.
Blocking them removed the platform from every answer engine — so its AI-search visibility was
structurally zero, which reads identically to being genuinely invisible. Meanwhile `public/llms.txt`
sat there addressed to exactly those agents, describing surfaces they were forbidden to read.

- **Allowed** (one group, several `User-agent:` lines — RFC 9309 §2.2.1): Googlebot, Bingbot, OAI-SearchBot, ChatGPT-User, Claude-SearchBot, Claude-User, PerplexityBot, Perplexity-User, meta-externalfetcher. They share ONE Disallow list rather than four pasted copies, and it still excludes the app surface and every tokenised share URL — allowing a crawler is not opening the app, and `/q/{token}` IS a credential.
- **Still blocked:** GPTBot, ClaudeBot, Claude-Web, anthropic-ai, CCBot, Google-Extended, Applebot-Extended, Bytespider, meta-externalagent, FacebookBot, cohere-ai, AI2Bot, and the commercial scrapers. `Google-Extended` and `Applebot-Extended` are the Gemini-app and Apple-Intelligence **training** controls specifically; AI Overviews are served off the ordinary Googlebot crawl, which is permitted.
- The vendors ship separate tokens precisely so this is a separate decision. Do not move an agent between the groups without checking which of the two jobs it does.

Guarded by [tests/unit/crawlPolicy.test.ts](../tests/unit/crawlPolicy.test.ts), which parses
robots.txt into groups, applies longest-match Allow/Disallow, and pins llms.txt to the same
allow-set so the two files cannot contradict each other again.

---

## 6. Crons

| Job | Schedule (UTC) | Does |
|---|---|---|
Read from `cron.job` on 2026-11-27. Several names still say "weekly" while the job fires daily: the cadence is the website's collector schedule (§8.1), and the cron only asks what is due.

| Job | Schedule (UTC) | Does |
|---|---|---|
| `seo-toolkit-audit-hourly` | `45 * * * *` | Toolkit audit queue (`auto_refresh` rows only; never a website's own domain). |
| `gsc-performance-sync-daily` | 03:30 | GSC pull + 180-day prune + the keyword discovery sweep (§4.2). |
| `gsc-url-inspection` | 02:10, 08:10, 14:10, 20:10 | `cron-inspect`; published article URLs first. |
| `ga-analytics-sync-hourly` | `5 * * * *` | GA4 pull + AI-referral landing rows. |
| `seo-domain-tracker-weekly` | daily 03:30 | Sites whose `domain_tracking` collector is due. |
| `seo-site-health-weekly` | daily 04:00 | Sites whose `site_audit` collector is due. |
| `seo-rank-tracker-daily` | 05:20, 07:20, 09:20, 11:20 | Sites whose `rank_tracking` collector is due, in legs. |
| `seo-crawl-sync-15min` | `*/15 * * * *` | `seo-site-audit` `cron-sync-crawls`: collects finished full-site crawls. |
| `seo-llm-mentions-weekly` | Mon 04:15 | `seo-api` `llm_mentions` over `website_collectors_due('ai_visibility')`. |
| `seo-reports-daily` | 06:10 | Builds scheduled website reports. |
| `seo-content-freshness-weekly` | Mon 05:15 | Raise generated articles past their own refresh cadence (#349 C1); notify only. |
| `seo-page-review-weekly` | Tue 05:45 | Opt-in page review batch (§8.4). |
| `ai-crawler-hits-prune` | 03:50 | 180-day TTL on `ai_crawler_hits`. |
| `dataforseo-reconcile-daily` | 02:50 | Reconciles DataForSEO spend against the provider and books edge-direct calls. |

No cron currently calls `crawl-user-website`; the `user-website-recrawl-every-6h` / `user-website-crawl-hourly` jobs are gone. Pages are read on a manual Recrawl, the article pipeline's topic reads, and whatever drives the `page_crawl` collector (`page_crawl_runs_now`) — verify that before relying on a scheduled crawl.

---

## 7. Related

- [docs/seo-system.md](seo-system.md) — endpoint reference
- [docs/seo-pipeline-mention-monitoring-integration.md](seo-pipeline-mention-monitoring-integration.md) — how SEO and mention monitoring share discovery
- [docs/flows-notification-system.md](flows-notification-system.md) — where the movement alerts are delivered
- [docs/page-monitoring.md](page-monitoring.md) — change detection on pages someone else owns

---

## 8. The website page since #475 — schedules, market, findings, page review, AI citations

### 8.1 Paid collectors run on the customer's schedule

`website_collector_schedules` holds one row per (website, collector) with its cadence, payer and
last/next run. Collectors are `rank_tracking`, `domain_tracking`, `site_audit`, `page_crawl`,
`ai_visibility`; cadences `off | daily | weekly | monthly`. Both vocabularies are declared once in
`src/services/seo/collectorSchedules.ts` and mirrored to Deno
(`_shared/seo/collectorSchedules.generated.ts`).

- **No row = off.** `collector_root_default()` returns `'off'` for every collector, the platform's own workspace included; a collector then runs only when someone presses its button.
- `website_collectors_due(p_collector, p_limit)` is what each cron reads; a payer who left the workspace or lost `marketing.seo` stops being billed. `mark_collector_run` records a run only on success, and due times keep their cron slot instead of drifting later each cycle.
- Only the scheduled crawl loop records a `page_crawl` run; the article pipeline's topic reads do not move the schedule.
- **Prices before switching on.** `seo-api` `collector_estimates` uses the spend gate's own formula (rank tracking at its retry worst case, the crawl with its one-off backlog). Reports → Schedules shows Per Run (Max) / Per Month (Max); every manual run button shows `· up to N cr` from the same estimate (`RunPrice`). A price that cannot be read says so instead of 0.
- The same rule reaches outside SEO: toolkit domains, mention subjects, price rows and job searches carry `auto_refresh` (default off), and their hourly queues and probes respect it.

### 8.2 The website owns its market

`user_websites.market_country_code` / `market_language_code`. `website_market()` is the one
derivation: what the website sets, else its tracked keywords, Search Console countries, the
AI-visibility subject, then the business country (via `sourcing_markets`). `website_ai_market` and
`seo_site_keyword_locale` delegate to it. There is no US/en fallback: an unknown market is NULL and
tracking refuses with the reason. `WebsiteMarketControl` shows the market and its source; owners and
admins can set it.

### 8.3 Findings carry a next step

- **One keyword action bar.** `KeywordActions` (Track, Research, Write article, Copy) sits on every keyword row. Tracking has ONE path, the `seo_track_keywords` RPC (`marketing.seo`, normalised, at most 200, reactivates a retired row, reports already-tracked); a shared per-website store keeps "Tracked" consistent across panels.
- **Setup checklist.** `get_website_setup` derives the steps (Search Console, market, competitors, tracked keywords, first crawl, a schedule); nothing is stored.
- **Search performance Lens** over `get_gsc_striking_distance` / `get_gsc_movers`.
- **Cannibalisation decision.** `set_cannibalisation_main_page` → `seo_cannibalisation_decisions`; a competing page that is one of our articles can be handed to the article refresh with the decision as its reason.
- **Crawl issues and homepage checks** hand the website, page and issue code to the agent ("Ask JARVIS to fix"); "Open article" when the page is ours.
- **Provider metric breaks.** `provider_metric_breaks` records a provider-side recalculation (DataForSEO Labs ETV from 2026-11-01); `get_website_search_metrics` does not compare across a break and states why.

### 8.4 Page review (#399)

Site Health → Pages lists every sitemap page. `user_website_pages` gains `h1`, `canonical_url`,
`lang` (crawler) and generated `word_count` / `content_hash`. `website_page_audits`,
`website_page_reviews` and `website_page_recommendations` are RLS on `marketing.seo`, written
through DEFINER RPCs only. `seo-api` `page_review` is one model turn (prompt row
`seo_page_reviewer`), reserved before the call and settled at token cost; invented links are
dropped; `save_page_review` is one transaction. The crawler calls
`apply_page_recommendation_outcomes` after every page upsert: a proposal becomes applied when the
live page carries it, stale when the page changed to something else. `seo_audit_url` and
`seo_score_url` save to the page when the URL is ours. The weekly batch is opt-in
(`workspace_seo_settings.weekly_page_review`, off by default, 25 pages per workspace). Agent tool
`seo_page_review`.

### 8.5 AI Citations — five views

`ai` section views: `overview` (rates, engine cards, cited/named instead), `asked` (the question
accordion and editor), `discover`, `pages`, `beyond`. Steps 3–5 read their own sources, so they
render before anything has been asked.

- **Question sources** (`get_website_ai_questions`): market questions (`website_ai_market_questions`, LLM Mentions over the site's topics; `set_website_ai_question_topics`), AI-cited, Search Console (question-shaped or 5+ words), People Also Ask (`seo_keyword_research.paa_questions`), and enquiries. A tracked question records its `source`.
- **Enquiry questions (#592).** The lead sync agent turns each NEW flow-captured lead (website form / page card) into the generic buyer question it implies (prompt from the registry, enquiry fenced as data). A server-side check refuses any question containing an email, a phone number or a word of the sender's name or company. `workspace_enquiry_questions` merges duplicates with a count and keeps no link to the lead. Nothing reaches an engine until someone tracks it.
- **Question → page.** `suggest_pages_for_question` ranks the site's pages (Search Console page for that exact query first, then title/H1 trigram match); `assign_question_to_page` records an `ai_questions` content gap on `website_page_recommendations`; `apply_page_recommendation_outcomes` marks it applied once the crawled text carries the question.
- **Read but not cited.** `get_website_ai_citation_report` returns a retrieval block; engine cards show "Read your site in N of M answers · K without citing it".
- **Compare with yours.** `seo-api` `citability` takes `rival_url`, accepts it only when a probe of this site cited it for that question, and scores both pages with the same scorer. `readPage` follows redirects by hand and re-runs the SSRF guard on every hop.
- **Your market** reads only answers that name the brand (`keyword_scope ['brand_entities']`).
- **AI referrals.** `ai_referral_platform(source, medium)` is the one classifier; `get_website_ai_referrals` derives sessions, share, engaged rate vs site, key events, per-assistant rows and the series, with a status (`not_connected | collector_failed | no_data | ok`).
- **AI crawler hits** (`ai-crawler-ingest`): a signed endpoint per website (HMAC-SHA256 over `timestamp.body`, 300 s window, checked before the body is parsed). `ai_crawler_bot()` classifies crawlers into vendor + purpose; only those land in `ai_crawler_hits` (service-role only, 180-day TTL, probe `seo.ai_crawler_hits_unpruned`). Every delivery is the source's heartbeat, so a silent source reads `collector_failed`. `get_website_ai_crawls` joins hits with `website_ai_landing`. **Operator-only**: the card renders only for the platform operator, and `connect/disconnect_website_crawler_source` require `is_platform_operator()`, because it needs the site's edge configured by hand.
- **Presence plan** (`seo-api` `presence_plan`, agent tool `seo_presence_plan`): top non-branded Search Console queries (tracked keywords when there are none) searched on YouTube and, through Google, as `site:reddit.com` / `site:pinterest.com`, plus the brand as `site:trustpilot.com`. Each platform is `present | absent | collector_failed`, stored in `seo_presence_plans`. `estimate=true` states the credit ceiling first (`reservedCreditsFor` / `ceilingCreditsFor`, the spend gate's own formula).

### 8.6 Article writing checks

- **The copy check is shared.** `_shared/copy-check.ts` is the one check every writer runs (SEO articles, social posts, email campaigns). It warns and never rewrites; an unreadable rule set reports as unchecked, never clean. Rules are DB rows edited under Admin → AI Configurations → Writing Rules: `channel_writing_rules` (per-channel limits) and `writing_tells` (per-language stock phrases, with `strength` strong/weak and an optional `pattern` regex run on folded text, where `\b` is a Unicode boundary so Greek matches). Strong tells warn per kind; weak ones only when `copy_style_checks.weak_tells_min` appear together; dash rate and repeated sentence openings are judged above `min_words_for_rhythm` (thresholds in `system_settings`, labels in the mirrored `writingVocabulary`).
- **Review keeps facts.** `findTellPassages` hands flagged sentences to the consistency pass as `ai_tell` exact edits that must keep every fact, number and name; the whole-article pass may also return a `repetition` edit. `text-defects.ts` finds doubled punctuation, a repeated phrase and two sentences opening alike; a wording edit that would introduce one is refused (a correction of fact is not).
- **Facts as our pages state them.** `serpValue` neutralises only a tag-shaped `<`, so bounds like `<0,5%` survive; a price range or several amounts on a page is no price; a table row stays on one line so a quantity is never read without its size; required link pages reach the article before member pages; a photo is offered only when its checked description fits the topic (`seo_photo_topic_fit`, fails closed). Prompt rows `seo_reviewer` and `seo_consistency_check` forbid new or catalogue-wide claims and computing a figure.
- **Accents.** The analysis flags an accented Greek keyword written any other way in the meta title, description or body; auto-fixable, since restoring accents changes no fact. The meta title and description also get the foreign-word check.
- **Not checked is not all good.** `analyze` reports the schema category as `not_checked` (it is generated after analysis), rendered neutrally.
- **Models.** Article review runs on Sonnet 5.5; photo verify and topic fit on Haiku 5.5.
- Finished articles are checked and recorded in `ai_content_outputs` with their score; going live on WordPress records the outcome.
