# SEO & Content System

Keyword research, article generation, and per-website intelligence — Search Console performance, site health, and rank/backlink tracking.

**API reference:** [docs/api/seo-api.md](api/seo-api.md).
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
| **Domains** | `seo_tracked_domains`, `seo_domain_audit_history` | Which domains are tracked and their audit history. |
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

---

## 6. Crons

| Job | Schedule (UTC) | Does |
|---|---|---|
| `seo-toolkit-audit-hourly` | `45 * * * *` | Toolkit audit queue. |
| `gsc-performance-sync-daily` | 03:30 | GSC pull + 180-day prune. |
| `seo-domain-tracker-weekly` | Mon 03:30 | Rankings + backlinks snapshot. |
| `seo-site-health-weekly` | Sun 04:00 | Lighthouse + on-page audit sweep. |
| `user-website-recrawl-every-6h` | `0 */6 * * *` | Re-crawl connected sites into `user_website_pages`. |

---

## 7. Related

- [docs/api/seo-api.md](api/seo-api.md) — endpoint reference
- [docs/seo-toolkit-integration-plan.md](seo-toolkit-integration-plan.md) — original integration plan
- [docs/seo-pipeline-mention-monitoring-integration.md](seo-pipeline-mention-monitoring-integration.md) — how SEO and mention monitoring share discovery
- [docs/flows-notification-system.md](flows-notification-system.md) — where the movement alerts are delivered
