# SEO & Content System

Keyword research, article generation, and per-website intelligence — Search Console performance, site health, and rank/backlink tracking.

**API reference:** [`public/api/openapi-edge.json`](../public/api/openapi-edge.json) — `seo-api`, `seo-rank-tracker`, `seo-domain-tracker`, `seo-site-audit`, `seo-content-freshness`, `gsc-api` (browse via [`edge-swagger.html`](../public/api/edge-swagger.html)).
**Modules:** `seo-toolkit` (research / write / audit) and `seo-interlinking` (internal-link suggestions), both `price_tier='pro'`.

---

## 1. Connected Websites is the organising unit

Before 2026-07 the SEO features were a set of one-shot tools with no memory of *which site* they were about. Now a workspace **connects a website once** (`user_websites`), and every SEO surface hangs off it: Search Console, Site Health, Rankings & Links, keyword research, articles and research runs.

Home is **Profile → Websites** (`ConnectedWebsitesTab` → `WebsiteSeoDashboard`), with seven tabs per site:

| Tab | Backed by | Shows |
|---|---|---|
| **GSC** | `gsc-api` → `gsc_performance`, `gsc_breakdown` | Clicks, impressions, CTR, position; broken down by query, page, **device, country and search appearance**, plus the trend line. |
| **Health** | `seo-site-audit` → `website_health_audits` | On-page audit score + issue list; Lighthouse gauges when the async run has returned. |
| **Rankings** | `seo-domain-tracker` → `seo_domain_snapshots`, `seo_domain_keywords` | Tracked DataForSEO ranked keywords, positions, movement. |
| **Rank tracking** | `seo-rank-tracker` → `seo_tracked_keywords`, `seo_keyword_positions` | Daily position for the keywords the workspace CHOSE (§4.1). |
| **Domains** | `seo_tracked_domains`, `seo_domain_audit_history` | Which domains are tracked and their audit history. Two ways in: the admin toolkit's "Track domain" dialog (any domain, no `website_id`), and Websites → Domain Audits → "Track this domain", which tracks the website's OWN domain from its URL and stamps `website_id` + `workspace_id` so the tab can find it. The latter used to hand off to the agent's "Snapshot a domain" flow, which asked for a domain the operator was already standing on and left the row unattached, so the tab stayed empty. |
| **Research** | `seo-api` `research` → `seo_keyword_research` | Saved keyword research. |
| **Articles** | `seo-api` `write` → `seo_articles` | Generated articles + the viewer. |
| **Runs** | `seo_research_runs` | Pipeline run history. |

Crawled pages land in `user_website_pages` (`crawl-user-website`, every 6 h) and are what the inter-linking suggester links *between*.

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
| `cron-sync` | Nightly refresh (03:30 UTC) of every active connection + 180-day retention prune. |

---

## 3. Site Health

`seo-site-audit` runs two things with very different latencies, and the UI reflects that honestly:

- **On-page audit** — returns immediately. Its score **is** the live Site Health figure, with the issue list beneath it.
- **Lighthouse** — asynchronous, and frequently still empty when the audit response comes back.

The first version rendered Lighthouse gauges as the headline, so a site with a perfectly good on-page score displayed four zeroes until the async job landed. Now the on-page score leads and Lighthouse gauges appear **only when present**. Weekly `cron-run` audits every active connected website; history is pruned at 180 days.

---

## 4. Rankings & Links

`seo-domain-tracker` takes a weekly DataForSEO snapshot per connected website: ranked keywords, positions and backlink profile, into `seo_domain_snapshots` + `seo_domain_keywords`. Week-over-week movement is turned into **workspace-scoped alerts routed through the Flows engine** rather than a hardcoded email — an operator can retarget, mute or extend the alert without a deploy. Scheduled Mondays 03:30 UTC.

### 4.1 Rank tracking — the keywords YOU chose, followed daily (2026-08-29)

`seo-domain-tracker` answers *what does this domain happen to rank for*, discovers that set, and
**replaces it wholesale every week**. It cannot answer *did the forty keywords I care about move*,
which is the daily loop of every rank tracker on the market. `seo-rank-tracker` is that second
question: a fixed, user-picked set followed as a **time series**.

| Piece | What it is |
|---|---|
| `seo_tracked_keywords` | The chosen set — unique on `(website_id, keyword, country_code, device)`. Up to 200 added per paste, de-duplicated and lower-cased client-side so a pasted list with blanks and repeats is not N−1 unique-violation round trips. |
| `seo_keyword_positions` | One row per keyword per day. Retained ~760 days (the summary RPC's own ceiling is 730). |
| `get_website_rank_summary(p_website_id, p_days)` | **SQL derives the number AND the verdict.** Returns the series, the averages and the movement already inverted. |
| `WebsiteRankTrackerPanel` | The Rank tracking tab — formats what the RPC returns, derives nothing. |

**Three arithmetic rules, which are one rule in three costumes** — all of them the "a metric is a
value or a stated reason there is no value" rule from CLAUDE.md:

- **Not ranking is not position 101.** Outside the top 100 stores `position NULL` with `found=false` and is EXCLUDED from the average. A sentinel rank gets averaged and charted as though it were real, so dropping your worst keyword would read as an improvement.
- **A failed check is unknown, not lost.** A check that could not run stores `error`, is excluded from every figure and counted separately. Announcing "you left the top 10" off a timed-out request is worse than saying nothing.
- **Up is good.** Position 3 beats position 30, so the RPC inverts the raw delta **once** and no consumer has to remember which way round it is.

**Cost is the real constraint** — one SERP call per keyword per run, the only cron here whose bill
scales with what a user types. Both paths cap at **60 keywords per invocation**, ordered
oldest-checked-first, so a large set becomes a slower rotation rather than a larger bill.
`last_checked_at` is stamped **even on failure**, or one broken keyword sits at the head of the
queue forever and starves everything behind it.

**Time is the other constraint, and it was the binding one.** One keyword takes ~19 s end to
end (a 7–15 s live SERP call per `ai_usage_logs.metadata.latency_ms`, plus two writes), so
checking 60 one after another needs ~19 minutes — and the edge gateway cuts the request off at
**150 s** with a 504 `IDLE_TIMEOUT`, well before pg_net's 280 s. Measured 2026-09-04 on a
129-keyword set: the sweep checked **10**, so each keyword came round every ~13 days under a
panel that said "checked daily". The shape is the silent-rotation one: every keyword that WAS
checked was checked correctly, so nothing raised. The loop is now a pool of **12 in flight**
(`CONCURRENCY`), which puts the 60-cap at ~5 rounds, ~100 s. With 129 keywords the set still
rotates over ~2 days; that is the cap doing its job, not a defect.

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

**The crawl is a rotation, because Firecrawl is rate-limited per plan and a run has 150 s.**
With the cap raised, the same recrawl scraped exactly 10 of 82 pages and got HTTP 429 on the other
72 inside twenty seconds (the key is on the ten-scrapes-a-minute tier), stored each refusal as
an ACTIVE page with `http_status = 429` and no content — overwriting the excerpt an earlier crawl
had saved — and reported `ok`. `crawl-user-website` now: pauses every worker on a 429 until the
reset and retries (`pacedScrape`); works inside `SCRAPE_BUDGET_MS`, pages with no content first
and then the stalest, and leaves the rest for the 6-hourly cron; stamps a page scraped cleanly
within `REFETCH_AFTER_DAYS` as still-in-sitemap instead of fetching it again; never writes nulls
over stored content on a failed scrape and never records Firecrawl's own status as the page's;
counts `page_count` as active pages WITH content; and returns `pages_with_content`,
`pages_pending` and `rate_limited`, which the toast prints ("10 of 82 pages indexed · 72 waiting
on the crawler's rate limit — the crawl continues automatically every 6 hours"). At ten a minute
a fresh 82-page site fills in over about two cron cycles; a bigger Firecrawl plan lifts that.

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

---

## 5. Content pipeline

The five original functions (`seo-research` / `seo-plan` / `seo-write` / `seo-analyze` / `seo-pipeline`) were consolidated into a single action-discriminated **`seo-api`**:

| Action | Does |
|---|---|
| `research` | DataForSEO keyword research (6 parallel calls). |
| `plan` | Article structure, meta tags, FAQ schema. |
| `write` | Full article via Claude. |
| `analyze` | 15+ quality checks, auto-fix pass. |
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
- **The auto-fix loop is gated on `reachableScore`, not `overallScore`** — the raw score with non-auto-fixable penalties added back. Previously an article whose only remaining problems were unfixable (plan-level meta lengths, intent mismatch, and now the two checks above) could never reach 70, so it burned all three paid iterations re-editing prose that was already finished.

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

- **The queue** — Profile → Websites → *Articles* shows *Due for a refresh* with age, last-review date and a **Mark reviewed** action, plus a content-age column on the main table. `is_due` already accounts for the cadence and any snooze, so no screen forms a second opinion about what "due" means.
- **The nudge** — `seo-content-freshness` (`cron-sweep`, weekly Mon 05:15 UTC) emits `seo.article_refresh_due` per overdue article. Payload-only trigger, seeded active locked `system-default` flow, registered in the area registry. It stamps `refresh_notified_at` **after** the emit succeeds; stamping first would mark an article notified on a run that told nobody, and it would never be raised again.
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
| `seo-toolkit-audit-hourly` | `45 * * * *` | Toolkit audit queue. |
| `gsc-performance-sync-daily` | 03:30 | GSC pull + 180-day prune. |
| `seo-domain-tracker-weekly` | Mon 03:30 | Rankings + backlinks snapshot. |
| `seo-site-health-weekly` | Sun 04:00 | Lighthouse + on-page audit sweep. |
| `user-website-recrawl-every-6h` | `0 */6 * * *` | Re-crawl connected sites into `user_website_pages`. |
| `seo-content-freshness-weekly` | Mon 05:15 | Raise generated articles past their own refresh cadence (#349 C1). |

---

## 7. Related

- [docs/seo-system.md](seo-system.md) — endpoint reference
- [docs/seo-pipeline-mention-monitoring-integration.md](seo-pipeline-mention-monitoring-integration.md) — how SEO and mention monitoring share discovery
- [docs/flows-notification-system.md](flows-notification-system.md) — where the movement alerts are delivered
