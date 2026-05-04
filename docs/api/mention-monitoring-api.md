# Mention Monitoring API

Track product, brand, and keyword mentions across **news, blogs, RSS, YouTube, and LLM responses**. Cost-optimized multi-source pipeline with sentiment classification and weekly LLM visibility tracking.

**Host**: `https://v1api.materialshub.gr`
**OpenAPI tag**: `Mention Tracking (Public API)`
**Interactive docs (Swagger UI)**: `GET https://v1api.materialshub.gr/docs` — filter by tag
**Machine-readable spec**: `GET https://v1api.materialshub.gr/openapi.json` — auto-generated from the FastAPI route signatures, always in sync with what's deployed.

---

## Changelog

### v0.4.8 — 2026-05-03 — SEO pipeline integration (internal-only — no partner-facing changes)

This release wires the existing `/opportunities` engine into the platform's content-creation pipeline so research → plan → write → analyze → finalize can consume AI Overview text, featured-snippet targets, PAA answer snippets, related searches, video / news / shopping carousel state, knowledge-graph presence, paid bidders, and per-keyword intent classification on every SEO research run.

**For external API consumers**: **nothing changes.** The existing `/track/{id}/opportunities` endpoint, request/response schemas, credit costs (2 / 5), and behavior are identical. No client SDK update required, no new headers, no migration needed.

**What's new internally:**

- 🆕 **`POST /api/v1/mention-monitoring/opportunities-stateless`** (internal-only, `x-cron-secret` auth). Accepts an inline subject (`subject_label`, optional `brand_name`, `aliases`, `language_codes`, `country_codes`, `homepage_domain`, `types`, `limit_per_type`, `use_llm_summary`) and runs the same opportunity engine without requiring a `tracked_mentions` row. Bypasses the per-call credit charge — used by edge functions on the platform's own infrastructure. Mention-derived types (`trending_topic`, `outlet_pitch`, `author_relationship`, `sentiment_response`, `llm_visibility`) auto-skip in this mode since they need data only available on a real tracked subject.
- 🆕 **5-phase SEO pipeline integration** (`seo-research` → `seo-plan` → `seo-write` → `seo-analyze` → `seo-pipeline` finalize). Every research run now runs the stateless opportunities call in parallel with DataForSEO research, attaches a `serpSignals` blob to the `KeywordResearchResult`, and propagates it through every downstream stage. New `SerpSignalBlob` type with quick-access projections (`aiOverviewText`, `featuredSnippetTarget`, `relatedSearches`, `paaAnswers`, `keywordIntents`, etc.) keeps prompts and analyzers from re-walking the opportunities array.
- 🆕 **6 new gap-scoring rules in `seo-analyze`** (Phase 4): `featured_snippet_target`, `ai_overview_alignment`, `paa_coverage`, `related_search_coverage`, `entity_authority`, `intent_alignment`. Each gates on the corresponding signal — silently skipped when signals are absent.
- 🆕 **Auto-interlinking from `related_searches`** (Phase 5): for every term in Google's "Searches related to" block, the pipeline now (a) boosts existing platform articles whose target_keyword matches, and (b) surfaces related searches with no existing article as `suggestedLinks` write-this-next candidates with the rationale "Google clusters this with the primary keyword".
- 📋 **Refactored `MentionOpportunityService.generate()`** to accept either `tracked_mention_id` (DB-backed) or `subject_override` (stateless). Same engine, same opportunity types, same DataForSEO fan-out — just no DB write/read in stateless mode. The lifetime-cost rollup (`recompute_lifetime_cost`) is skipped when stateless.

### v0.4.7 — 2026-05-04

- 🆕 **Two new opportunity types:**
  - `llm_visibility` — reads the latest `/probe-llm` snapshot and surfaces share-of-voice across Haiku / GPT-4o-mini / Gemini Flash / Sonar with per-model breakdown + co-mentioned competitors. **Reads existing snapshot — does NOT fire a fresh probe** (probes are a separate 15-credit endpoint and run automatically weekly). When no snapshot exists, returns a card pointing to `/probe-llm`.
  - `domain_snapshot` — when the subject's `homepage_domain` is set, calls DataForSEO Labs `domain_rank_overview` to surface Domain Rank, organic-traffic estimation, ranking-keywords count, referring domains, total backlinks. Baseline metric for tracking SEO progress over time.
- 🆕 **`homepage_domain` field on tracked subjects** (1-line text, optional). Powers `domain_snapshot`. Set via create / PUT.
- 🆕 **`keyword_suggestions` fallback** — when DataForSEO Labs Related Keywords returns 0 (common for niche brands), fall back to phrase-match Keyword Suggestions which is more permissive. Each `keyword_opportunity` card now exposes `source.source_endpoint` to indicate which Labs endpoint produced it.
- 🆕 **`keyword_difficulty` + `search_intent` enrichment** — every `keyword_opportunity` card now includes a `difficulty` score (0–100) and `intent` classification (`informational` / `navigational` / `commercial` / `transactional`). The `suggested_action` is tailored per intent (e.g. transactional → "target a product page, not a blog post"; commercial → "write a comparison / buyer's-guide piece"). One batched call per opportunities run, ~$0.001 added cost.
- 📋 **Total opportunity types: 17** (13 subject-driven + 4 mention-derived).

### v0.4.6 — 2026-05-04

- 🆕 **Five additional opportunity types from the same SERP call** (cost unchanged — partner credit charge stays at 2 / 5 with `use_llm_summary`):
  - `video_carousel` — unified card across Google's `video` + `short_videos` (TikTok/YT Shorts/IG Reels) + `inline_videos` blocks. Includes platform mix breakdown + brand-presence check + GEO-style "publish video where Google's already showing the carousel" suggestion.
  - `news_carousel` — Google's "Top Stories" featured news block (different from our DataForSEO News *discovery* — this is what Google chose to *editorially feature* in the SERP).
  - `knowledge_graph` — whether the brand has a Google Knowledge Panel (right-rail entity card). Returns either "yes, here's what Google says about you" (audit-and-correct opportunity) or "no, you're not yet a recognized entity" (Wikidata + structured-data opportunity).
  - `paid_competitor` — Google Ads / commercial-units bidders for the keyword. Pure competitive intel — these are advertisers paying per click for the same buyer-intent traffic.
  - `shopping_listing` — Google Shopping carousel hits with prices, sellers, ratings. Surfaces only on transactional queries.
- 🐛 **`ai_usage_logs.operation_type` widened from `VARCHAR(50)` → `TEXT`**. The mention-monitoring SERP operation_types are 62 chars (`mention_monitoring.opportunities.dataforseo_serp.serp_signals`) and were silently failing the insert — exception swallowed by the logger's try/except. **No SERP cost rows had been written since v0.4.1.** Now all SERP calls produce proper audit/cost-rollup entries.
- 📋 **Total opportunity type count: 15** (11 subject-driven + 4 mention-derived).

### v0.4.5 — 2026-05-04

- 🆕 **Four new opportunity types from the SERP, all subject-driven**:
  - `ai_overview` — **Google's generative AI Overview answer** (the LLM-summary at the top of the SERP). Includes brand-mention check, full text, and cited references. When the tracked brand isn't cited, the rationale lists the citations Google IS using so the partner knows who to target for GEO. **`priority_score: 0.95`** — top of the list because of GEO impact in 2026.
  - `featured_snippet` — current position-0 answer with URL + title + description. Gives you the snippet you're competing against and a target to outrank.
  - `related_search` — Google's own "Searches related to" block (different from `keyword_opportunity` which uses DataForSEO Labs). Direct user-intent overlap signal.
  - `competitor_ranking` — top ~5 organic pages currently ranking for the seed keyword. **Returns ALL ranked domains, including the tracked brand's own domain when it ranks** — partners using this as third-party analysts (distributors, market researchers, competitor-intel teams) need to see the brand's own SEO position too. Callers who want to filter the brand's own domain can add it to `mention_excluded_urls` via the standard exclude flow.
- ⚙️ **One SERP call powers all 5 SERP-derived types** (PAA + the 4 new ones). Same fallback-seed chain. Cost unchanged for the `/opportunities` endpoint — still 2 credits (or 5 with `use_llm_summary`).
- 📋 Total opportunity type count: **10** (6 subject-driven + 4 mention-derived).

### v0.4.4 — 2026-05-04

- 🐛 **`language_codes` were not reaching DataForSEO.** v0.4.3 added the language fan-out logic, but the row's `language_codes` field was never passed from `tracked_mentions_service.refresh()` → `extract_facets()` → the `SubjectFacets` object. Default `["en"]` always won, so `language_codes: ["el", "en"]` only ever ran English queries against DataForSEO News, missing all Greek-language coverage. The fix plumbs `language_codes` through every layer; caller-supplied codes always win over Haiku's guess.
- 📋 Symptom: subjects with non-English `language_codes` returned hits from English-language sources only. Greek brand coverage on `.gr` outlets in Greek language went uncaught.

### v0.4.3 — 2026-05-04

- 🆕 **`recency_days` field per subject** (1–730, default 30). Discovery filters articles older than this window. The previous global 30-day default was too tight for niche brands whose coverage cadence is slower than monthly (regional outlets that publish quarterly, trade press with monthly issues). Bump to 90/180/365 for niche subjects to surface their actual coverage. Diagnostic case: a Greek smart-lighting brand had real launch coverage from Nov 2025 across 3 Greek outlets, all dropped because today is May 2026 (~165 days later). With `recency_days: 180` the articles surface correctly.
- 🐛 **`language_codes` is now a fan-out, not just `[0]`.** Previously DataForSEO News only got the first language code in the array — so `language_codes: ["en", "el"]` only ever returned English-language articles, missing all Greek-language coverage. Now we run each query under each supplied language (capped at 2 to keep cost bounded). 1 alias × 2 langs = 2 calls (~$0.0012); 3 aliases × 2 langs = 6 calls (~$0.0036). Worst-case is still well under 1 credit.

### v0.4.2 — 2026-05-04

- 🐛 **Seed fallback chain for keyword + PAA queries.** Previously, both `keyword_opportunity` and `pao_question` sent only `subject_label` to DataForSEO. Niche full-product names often have no related-keywords or PAA data, returning empty. Now both calls automatically fall back through caller-supplied seeds: `subject_label` → `brand_name` (if set on the row) → each entry in `aliases[]`. Stops at the first seed that returns data (≤ 3 calls per source). Each opportunity exposes `source.seed_used` and `source.fallback: true` when a non-primary seed was used. Worst-case cost still well under 1 credit; partner credit charge unchanged.
- 📋 **Important**: the system never autonomously decomposes `subject_label` into individual words. To get broader keyword coverage on multi-word labels, the caller supplies `aliases[]` explicitly or sets `auto_expand_aliases: true`. The fallback chain only uses seeds the caller provided.

### v0.4.1 — 2026-05-04

- 🐛 **`pao_question` no longer requires mention history.** Refactored from a regex-over-mention-text placeholder to a real DataForSEO SERP People-Also-Ask query against the subject_label. Now returns actual Google PAA questions even on a freshly-created subject with zero mentions collected. Cost unchanged.
- ✏️ **Opportunity types categorized** in code + docs:
  - **Subject-driven** (work on subjects with zero mention history): `keyword_opportunity`, `pao_question`
  - **Mention-derived** (require an existing mention_history; skip silently when 0): `trending_topic`, `outlet_pitch`, `author_relationship`, `sentiment_response`

### v0.4.0 — 2026-05-04

- 🆕 **Credit-system integration (full)**:
  - Every external API call (DataForSEO, Perplexity, Anthropic, OpenAI, Gemini) now writes a row to `ai_usage_logs` with `module_slug='mention-monitoring'` and per-subject attribution. Module-level cost dashboards now work.
  - **Partner billing enabled**: external `kai_*` endpoints debit credits per call: `refresh=5`, `probe-llm=15`, `opportunities=2` (or `5` with `use_llm_summary`). Refunded automatically on 5xx and no-op outcomes (`throttled` / `inactive` / `not_found` / `error`).
  - **Per-row cost rollup**: every `tracked_mentions` row exposes `total_billed_usd`, `total_partner_credits_debited`, `last_refresh_billed_usd`, `last_refresh_credits_debited`. Updated automatically after every billable call.
  - New error code: **`402`** — insufficient credits.
  - New response field on billable endpoints: `partner_credits_debited` (number of credits charged for this call).
- 🆕 **`POST /track/{id}/opportunities`** — generate content + outreach opportunities mined from existing mention data: `trending_topic`, `outlet_pitch`, `keyword_opportunity`, `pao_question`, `author_relationship`, `sentiment_response`. Read-only, sorted by `priority_score`.
- ✏️ **Discovery window 14 → 30 days** for News, RSS, and Sonar (`search_recency_filter: "month"`).
- ✏️ **Strict country filter** — when `country_codes` is set, results outside matching TLDs and the curated per-country outlet allowlist are dropped. Drop `country_codes` (or pass `[]`) for global discovery.
- ✏️ **Perplexity geo-biasing fixed** — `web_search_options.user_location.country` is now actually sent.
- ✏️ **Strict-substring alias matching** — a multi-word `subject_label` only matches articles containing the literal phrase. For broader matching, supply variants in `aliases` or set `auto_expand_aliases: true`.

### v0.3.0 — 2026-05-04

- 🆕 **`auto_expand_aliases` field** on create / update — opt-in Haiku-driven alias expansion. Default `false`: discovery uses only `subject_label` + user-supplied `aliases`. No LLM dependency by default.
- 🐛 Fixed: `claude-haiku-4-5` bare alias was 400-ing on Anthropic's HTTP API. Switched all direct Anthropic calls to the dated form `claude-haiku-4-5-20251001`.
- 🐛 Fixed: discovery only searched the first alias. Now fans out across up to 3 distinctive aliases (DataForSEO News parallel calls; Perplexity disjunctive query). Cost ceiling preserved via early-stop when the primary returns enough hits.

### v0.2.0 — 2026-05-03

- 🆕 **Public Tracking API** (`/api/v1/mentions/track/*`) for partner integrations using `kai_*` Bearer auth. Mirrors price-tracking shape.
- ❌ **Reddit dropped**. Responsible Builder Policy onboarding wasn't worth the friction. News + Sonar pick up Reddit threads when news/blogs cite them.

### v0.1.0 — 2026-05-03

- 🚀 **Initial release**: tracked subjects, multi-source discovery (DataForSEO News + Perplexity Sonar + RSS + YouTube), Haiku batched classifier (relevance + sentiment), LLM visibility probe matrix (4 templates × 4 cheap models, weekly), 4 webhook alert types (`mention_spike` / `negative_sentiment` / `new_outlet` / `llm_visibility_change`).

---

## Aliases (important — read before integrating)

By default, the API runs **exact-match discovery**. Discovery searches use only the `subject_label` you supply, plus any strings you put in the optional `aliases` array. **No LLM expansion runs by default.** This makes the pipeline:

- Free of any Anthropic dependency for discovery (cheaper, more reliable)
- Predictable — you only get hits for terms you explicitly supplied
- Tight on precision (less noise from same-name brands in unrelated industries)

If your subject is a multi-word label where articles often split the words apart (e.g. a product line where journalists write only the brand or only the model, not the full name), supply the variants you care about in `aliases`:

```json
{
  "subject_label": "<your brand + product line>",
  "aliases": ["<just the brand>", "<just the product line>", "<reversed order>"]
}
```

Or, set **`auto_expand_aliases: true`** to have the platform run an LLM pass on first refresh that splits the label into per-word aliases, infers brand, and adds common reorderings. Higher recall on multi-word subjects, but adds an Anthropic token cost and a soft dependency on the Anthropic API being reachable. Off by default.

**Host**: `https://v1api.materialshub.gr`

There are **two surfaces** with different auth:

| Surface | Path prefix | Auth | Used by |
|---|---|---|---|
| **Public Tracking API** | `/api/v1/mentions/track` | `Authorization: Bearer kai_*` (api_keys) | External integrations, partner projects |
| **Internal product/brand flow** | `/api/v1/mention-monitoring` | Session JWT (Supabase access token) | Material KAI web app |
| Cron | `/api/v1/mention-monitoring/cron-*` | `x-cron-secret` | Internal pg_cron jobs |

**Module gate**: All endpoints require the `mention-monitoring` module to be enabled. Alert dispatch additionally requires `mention-monitoring-notifications`.

If you're integrating from another project, **use the Public Tracking API** (section near the top of this doc). The internal endpoints are documented for reference only.

---

## Pipeline overview

```
discover (parallel) — 30-day rolling window per refresh
  ├─ DataForSEO News API     ($0.0006/req, 100 results, ~6h freshness)
  ├─ Perplexity Sonar        ($0.005/sweep, "month" recency filter)
  ├─ RSS feeds               (free, user-curated per subject)
  └─ YouTube Data API        (free, opt-in per subject)
  ↓
URL canonicalize + content-hash dedupe
  ↓
Apply exclusions + promoted-URL overrides
  ↓
Rule pre-filter (alias must appear) — drops obvious mismatches before Haiku
  ↓
Verdict cache lookup (7d TTL) — repeat URLs hit cache
  ↓
Haiku 4.5 batched classifier (≤50 candidates per call)
  → relevance ∈ {exact, tangential, mismatch, unverifiable}
  → sentiment ∈ {positive, neutral, negative}
  ↓
Drop relevance='mismatch'
Sanity check: sentiment outlier vs trailing 7d → flag is_anomaly
  ↓
Persist mention_history rows with refresh_run_id
Update tracked_mentions denormalized cache
Update volatility cadence (update_tracked_mention_cadence RPC)
  ↓
Detect alerts → dispatch via mention-monitoring-notifications module
```

## Cost discipline

The same playbook as price-monitoring v3:

- **Verdict cache (7d TTL)**: repeat URLs across daily refreshes hit ~95% cache rate on stable subjects.
- **Rule pre-filter**: deterministic alias-presence check eliminates ~60% of candidates before Haiku.
- **Tier-skip on Perplexity**: cheap `sonar` model on stable refreshes; `sonar-pro` only on first refresh / forced refresh.
- **Volatility cadence**: stable subjects stretch from 24h → 48h → 72h → 168h. Active subjects accelerate to 6h.
- **LLM probes**: weekly cadence, 4 templates × 4 cheap models (haiku, gpt-4o-mini, gemini-flash, sonar) = ~$0.008/subject/week.

Typical refresh cost on a stable subject: ~$0.005–0.010 per refresh (DataForSEO News + cached Sonar + free RSS).

---

## Public Tracking API — `/api/v1/mentions/track/*`

For partner integrations using an `api_keys` Bearer token (`kai_*` prefix). Mirrors the shape of the Price Tracking API at `/api/v1/prices/track/*`.

### Auth

```
Authorization: Bearer kai_<32-char-alphanumeric>
Content-Type: application/json
```

The key must be active and not expired. Each tracked subject is owned by the api_key that created it — partner A cannot read or modify partner B's subjects.

**Cascade**: deleting the api_key (or letting it expire) is permitted, but the row + all its mention history is dropped along with it (`ON DELETE CASCADE`).

### Endpoint inventory

| # | Method | Path | Purpose |
|---|---|---|---|
| 1 | `POST` | `/api/v1/mentions/track` | Create tracked subject + first refresh |
| 2 | `GET` | `/api/v1/mentions/track` | List all subjects owned by your key |
| 3 | `GET` | `/api/v1/mentions/track/{id}` | Read one subject (config + cached snapshot) |
| 4 | `PUT` | `/api/v1/mentions/track/{id}` | Update aliases / sources / alert prefs / cadence |
| 5 | `DELETE` | `/api/v1/mentions/track/{id}` | Soft delete (deactivates, preserves history) |
| 6 | `POST` | `/api/v1/mentions/track/{id}/refresh` | Force refresh now (bypasses cadence) |
| 7 | `GET` | `/api/v1/mentions/track/{id}/feed` | Latest refresh-run rows |
| 8 | `GET` | `/api/v1/mentions/track/{id}/history` | Filterable history (sentiment, outlet_type, days) |
| 9 | `GET` | `/api/v1/mentions/track/{id}/summary` | Aggregate snapshot (total count, sentiment, outlets) |
| 10 | `GET` | `/api/v1/mentions/track/{id}/llm-visibility` | LLM probe snapshot (share-of-voice + rank + competitors) |
| 11 | `POST` | `/api/v1/mentions/track/{id}/probe-llm` | Fire a fresh LLM probe matrix |
| 12 | `POST` | `/api/v1/mentions/track/{id}/exclude` | Exclude a URL or domain from results |
| 13 | `POST` | `/api/v1/mentions/track/{id}/include` | Undo an exclusion |
| 14 | `GET` | `/api/v1/mentions/track/{id}/exclusions` | List exclusions for the subject |
| 15 | `POST` | `/api/v1/mentions/track/{id}/opportunities` | Content + outreach opportunities (read-only) |

### Quickstart

```bash
# 1. Create a tracked subject (brand example, exact-match aliases)
curl -X POST https://v1api.materialshub.gr/api/v1/mentions/track \
  -H "Authorization: Bearer kai_YOUR_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "subject_type": "brand",
    "subject_label": "YourBrand",
    "brand_name": "YourBrand",
    "aliases": ["YourBrand Tiles", "YourBrand Hellas"],
    "auto_expand_aliases": false,
    "sources_enabled": { "news": true, "blogs": true, "youtube": false, "rss": true, "llm": true },
    "language_codes": ["en", "el"],
    "country_codes": ["GR", "DE"],
    "refresh_interval_hours": 24,
    "alert_on_negative_sentiment": true,
    "alert_on_new_outlet": true,
    "alert_channels": ["webhook"],
    "alert_webhook_url": "https://your.domain/webhooks/material-kai-mentions"
  }'

# Response: { "success": true, "data": { "id": "uuid", ...row, "last_refresh": { ... } } }
```

```bash
# 1b. Same flow with LLM-driven alias expansion (only when you want it)
curl -X POST https://v1api.materialshub.gr/api/v1/mentions/track \
  -H "Authorization: Bearer kai_YOUR_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "subject_type": "product",
    "subject_label": "<your full product label>",
    "auto_expand_aliases": true,
    "country_codes": ["<ISO 3166-1 alpha-2>"]
  }'
```

```bash
# 2. List your subjects
curl https://v1api.materialshub.gr/api/v1/mentions/track \
  -H "Authorization: Bearer kai_YOUR_KEY"
```

```bash
# 3. Get a subject's latest mention feed
curl https://v1api.materialshub.gr/api/v1/mentions/track/{id}/feed?limit=50 \
  -H "Authorization: Bearer kai_YOUR_KEY"
```

```bash
# 4. Get filtered history (last 30 days, only negative sentiment, news only)
curl "https://v1api.materialshub.gr/api/v1/mentions/track/{id}/history?days=30&sentiment=negative&outlet_type=news&limit=100" \
  -H "Authorization: Bearer kai_YOUR_KEY"
```

```bash
# 5. Get a 30-day summary
curl https://v1api.materialshub.gr/api/v1/mentions/track/{id}/summary?days=30 \
  -H "Authorization: Bearer kai_YOUR_KEY"
```

```bash
# 6. Get LLM visibility snapshot (latest probe run)
curl https://v1api.materialshub.gr/api/v1/mentions/track/{id}/llm-visibility \
  -H "Authorization: Bearer kai_YOUR_KEY"
```

```bash
# 7. Force a refresh now (bypasses cadence)
curl -X POST https://v1api.materialshub.gr/api/v1/mentions/track/{id}/refresh \
  -H "Authorization: Bearer kai_YOUR_KEY" \
  -H "Content-Type: application/json" \
  -d '{ "force": true }'
```

### Refresh cadence (you control it)

Set `refresh_interval_hours` between **1 and 720** (1 hour to 30 days). The platform's own cron does NOT touch external-flow rows — refreshes happen only when YOU call `POST /{id}/refresh`. This is intentional: you pay per call and shouldn't be surprised by background charges.

Volatility cadence still adjusts `next_check_at` after each refresh you trigger, so you can use that field as a hint about when re-polling is worth the cost.

### Webhook alerts

Set `alert_webhook_url` to receive HTTP POST notifications. Payload shape:

```json
{
  "alert_type": "negative_sentiment",
  "title": "Negative mention from wirecutter.com",
  "body": "...",
  "tracked_mention_id": "uuid",
  "outlet_name": "Wirecutter",
  "outlet_domain": "wirecutter.com",
  "payload": { "url": "...", "title": "...", "sentiment_score": -0.6 },
  "fired_at": "2026-05-03T10:15:00Z"
}
```

Four alert types, each opt-in (`alert_on_*` flags):
- `mention_spike` — today's count ≥ 2× trailing 7d daily-average
- `negative_sentiment` — negative mention from a high-DA outlet
- `new_outlet` — first-ever mention from a new domain
- `llm_visibility_change` — average rank across LLM probes shifts ≥2 W/W

24h dedupe per `(alert_type, tracked_mention_id, outlet_domain)`.

### Opportunities — content + outreach signals from your data

`POST /api/v1/mentions/track/{id}/opportunities` analyzes the existing mention history for a subject and returns a ranked list of actionable opportunities. **Read-only** — does not mutate state, doesn't trigger a refresh, doesn't write to history.

**Body** (all fields optional):

```json
{
  "types": ["trending_topic", "outlet_pitch", "keyword_opportunity",
            "pao_question", "author_relationship", "sentiment_response"],
  "days": 30,
  "limit_per_type": 5,
  "use_llm_summary": false
}
```

**Seventeen opportunity types, all returned by default. Two categories:**

**Subject-driven** — work on freshly-created subjects with zero mention history:

| Type | What it surfaces | Source signal |
|---|---|---|
| `keyword_opportunity` | High-volume related keywords for SEO content | DataForSEO Labs Related Keywords API |
| `pao_question` | Real Google "People Also Ask" questions about the subject | DataForSEO SERP `people_also_ask` block |
| `ai_overview` | Google's generative AI summary at top of SERP + brand-mention check + cited references (GEO opportunity) | DataForSEO SERP `ai_overview` block |
| `featured_snippet` | Current position-0 snippet with URL + content to outrank | DataForSEO SERP `featured_snippet` block |
| `related_search` | Google's "Searches related to" terms — direct user-intent overlap | DataForSEO SERP `related_searches` block |
| `competitor_ranking` | All top organic pages currently ranking for the seed keyword (including the tracked brand's own domain when it ranks — third-party analysts need to see the brand's own SEO position too) | DataForSEO SERP `organic` block (top 5) |
| `video_carousel` | Unified card across Google's video / Shorts / inline-videos blocks. Platform mix breakdown (TikTok / YT Shorts / IG Reels) + brand-presence check. | DataForSEO SERP `video` + `short_videos` + `inline_videos` blocks |
| `news_carousel` | Google's "Top Stories" featured news block (curated by Google, not just indexed) | DataForSEO SERP `top_stories` block |
| `knowledge_graph` | Whether the brand has a Google Knowledge Panel (right-rail entity card). Two response shapes: "panel exists" (audit-and-correct) vs "no panel" (Wikidata + entity-SEO opportunity). | DataForSEO SERP `knowledge_graph` block |
| `paid_competitor` | Google Ads bidders on the keyword. Pure competitive intel — advertisers paying per click for the same intent traffic. | DataForSEO SERP `paid` + `commercial_units` blocks |
| `shopping_listing` | Google Shopping carousel hits with prices, sellers, ratings. Transactional queries only. | DataForSEO SERP `popular_products` + `shopping` blocks |
| `llm_visibility` | Share-of-voice across Haiku / GPT-4o-mini / Gemini Flash / Sonar — what each LLM says about the subject, at what rank, with what sentiment, and which competitors get cited alongside. Reads latest `/probe-llm` snapshot (does not fire a fresh probe). | LLM Mention Probe Service (separate endpoint, weekly cron) |
| `domain_snapshot` | Brand's overall SEO position — Domain Rank, organic-traffic estimation, ranking-keywords count, referring domains, total backlinks. Requires `homepage_domain` to be set. | DataForSEO Labs `domain_rank_overview` |

**Mention-derived** — require an existing mention_history; skip silently when 0 mentions:

| Type | What it surfaces | Source signal |
|---|---|---|
| `trending_topic` | Recurring phrases across recent coverage worth writing about | Bigram frequency over mention titles + excerpts |
| `outlet_pitch` | Outlets that have covered the subject — warm pitch targets | Outlet frequency in mention_history |
| `author_relationship` | Authors who covered you 2+ times — warm contacts | Author frequency in mention_history |
| `sentiment_response` | Negative-sentiment mentions worth addressing | `sentiment='negative'` filter |

> **Tip**: a brand-new subject with no refreshes yet will return all 6 subject-driven types immediately (keyword, PAA, AI overview, featured snippet, related searches, competitor rankings). To unlock the mention-derived types, run `POST /track/{id}/refresh` first to collect mention history, then call `/opportunities` again.

> **Cost note**: all SERP-derived types (PAA, AI overview, featured snippet, related searches, competitor ranking, video carousel, news carousel, knowledge graph, paid competitor, shopping listing) share **one** DataForSEO SERP call per fallback seed. The `/opportunities` charge stays at 2 credits (or 5 with `use_llm_summary`) regardless of how many SERP types you request.

### DataForSEO SERP block coverage audit

DataForSEO's `/v3/serp/google/organic/live/advanced` response can return 20+ distinct block types. Our coverage as of v0.4.6:

| DataForSEO block type | Extracted? | Mapped to opportunity type | Notes |
|---|---|---|---|
| `organic` | ✅ | `competitor_ranking` | top organic results |
| `people_also_ask` | ✅ | `pao_question` | PAA block questions |
| `ai_overview` | ✅ | `ai_overview` | Google's generative answer + cited references |
| `featured_snippet` | ✅ | `featured_snippet` | position-0 answer block |
| `related_searches` | ✅ | `related_search` | "Searches related to..." terms |
| `video` | ✅ | `video_carousel` | YouTube full-length video carousel |
| `short_videos` | ✅ | `video_carousel` | TikTok / YT Shorts / IG Reels carousel |
| `inline_videos` | ✅ | `video_carousel` | embedded video thumbnails in organic |
| `top_stories` | ✅ | `news_carousel` | featured news carousel (editorial pick) |
| `knowledge_graph` | ✅ | `knowledge_graph` | right-rail entity card |
| `paid` | ✅ | `paid_competitor` | Google Ads paid placements |
| `commercial_units` | ✅ | `paid_competitor` | shopping ads (also feeds `paid_competitor`) |
| `popular_products` | ✅ | `shopping_listing` | Google Shopping carousel |
| `shopping` | ✅ | `shopping_listing` | Shopping module (also feeds `shopping_listing`) |
| `images` | ❌ | — | image-pack data is sparse without download; deferred |
| `local_pack` | ❌ | — | Google Maps 3-pack — useful only for local-business subjects |
| `twitter` | ❌ | — | Twitter/X embeds unreliable since 2024 API changes |
| `recipes` | ❌ | — | food-domain only |
| `events` | ❌ | — | event-domain only |
| `jobs` | ❌ | — | recruiting-domain only |
| `app` | ❌ | — | app-store domain only |
| `scholarly_articles` | ❌ | — | academic-research domain only |
| `find_results_on` | ❌ | — | site-suggestion list — weak signal |

If a block type you need isn't covered, ask — most are trivial additions to the same existing SERP call.

**Each opportunity** in the response:

```json
{
  "type": "trending_topic",
  "title": "<phrase> — N recent mentions",
  "rationale": "This phrase appears in N recent mentions of \"<your subject>\". Sample headlines: ...",
  "suggested_action": "Write a post or article that engages directly with the \"<phrase>\" theme...",
  "priority_score": 0.75,
  "source": { "mention_ids": ["..."], "phrase": "<phrase>", "count": 3 },
  "metadata": {}
}
```

**`use_llm_summary: true`** runs Haiku to rewrite each `rationale` and `suggested_action` in tighter, more actionable language. Default off — the deterministic summaries are good for most use cases and avoid Anthropic dependency.

**Cost**:
- Default (no LLM): ~$0.001 — one DataForSEO Labs call for keyword opportunities, the rest is DB aggregation.
- With LLM polish: + ~$0.005-0.015 (one Haiku call covering up to 12 opportunities).

**Quickstart**:

```bash
curl -X POST https://v1api.materialshub.gr/api/v1/mentions/track/{id}/opportunities \
  -H "Authorization: Bearer kai_YOUR_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "types": ["trending_topic", "outlet_pitch", "keyword_opportunity"],
    "days": 30,
    "limit_per_type": 5,
    "use_llm_summary": false
  }'
```

Response shape:

```json
{
  "success": true,
  "data": {
    "tracked_mention_id": "uuid",
    "subject_label": "<your subject>",
    "days": 30,
    "mention_count": 14,
    "opportunities": [
      { "type": "trending_topic", ... },
      { "type": "outlet_pitch", ... },
      ...
    ],
    "errors": {},
    "latency_ms": 1240
  }
}
```

Opportunities are sorted by `priority_score` desc — the first ones are the highest-value to act on.

### Billing — partner credit costs

External (`kai_*` Bearer) endpoints debit credits from the API key owner's balance for the operations that invoke external upstream APIs. Read endpoints are free; write/compute endpoints are billed:

| Operation | Endpoint | Credits |
|---|---|---|
| Refresh discovery | `POST /api/v1/mentions/track/{id}/refresh` | 5 |
| LLM probe matrix | `POST /api/v1/mentions/track/{id}/probe-llm` | 15 |
| Opportunities (no LLM polish) | `POST /api/v1/mentions/track/{id}/opportunities` | 2 |
| Opportunities with `use_llm_summary: true` | same | 5 |
| Create / list / read / update / delete / feed / history / summary / llm-visibility / exclude / include / exclusions | various GET / mutation | 0 |

**Refund policy**: credits are refunded automatically on hard failure (any 5xx) and on no-op outcomes (`throttled`, `inactive`). Successful refreshes keep the credits even if 0 hits land — the upstream API calls still ran.

**402 response**: returned when the api_key owner has insufficient credits.

**Per-subject cost**: every billable call lands a row in `ai_usage_logs` tagged with `module_slug='mention-monitoring'` and `metadata.tracked_mention_id`. The platform aggregates this into `tracked_mentions.total_billed_usd` and `total_partner_credits_debited` after every refresh / probe / opportunity call. Internal-flow rows (no `api_key_id`) stay at 0 partner credits — internal usage is platform-paid.

### Error codes

| Code | Meaning |
|---|---|
| `400` | Bad request (missing field, invalid value) |
| `401` | Missing or invalid `Authorization: Bearer kai_*` |
| `402` | Insufficient credits to cover the operation cost |
| `403` | Your API key does not own this `tracking_id` |
| `404` | `tracking_id` not found |
| `429` | Rate limit exceeded (default 60 req/min, configurable per key) |
| `500` | Internal error (credits refunded automatically) |

---

## Endpoints — internal flow (product-scoped)

All require session JWT. The internal flow auto-resolves the catalog product into a `tracked_mentions` row with `api_key_id IS NULL` and `product_id NOT NULL`.

### `POST /products/{product_id}/track`

Enroll a catalog product in mention monitoring. Idempotent — re-calling returns the existing row + a fresh refresh.

**Body** (all fields optional):

```json
{
  "aliases": ["YourBrand", "YourBrand Tiles", "YB-7012MT"],
  "sources_enabled": { "news": true, "blogs": true, "youtube": false, "rss": true, "llm": true },
  "language_codes": ["en", "el"],
  "country_codes": ["GR", "DE"],
  "alert_on_spike": true,
  "alert_on_negative_sentiment": true,
  "alert_on_new_outlet": false,
  "alert_on_llm_visibility_change": true,
  "alert_channels": ["bell", "email"],
  "alert_webhook_url": null,
  "run_first_refresh": true
}
```

**Response**: `TrackedMention` row.

### `DELETE /products/{product_id}/track`

Soft-delete: deactivates the row but preserves history.

### `GET /products/{product_id}`

Read the `TrackedMention` row including denormalized snapshot (`current_mention_count_7d`, `current_sentiment_avg`, `current_top_outlets`).

### `POST /products/{product_id}/refresh`

Body: `{ "force": false }`. Admin-only when `force=true` (bypasses volatility cadence).

**Response**: `RefreshOutcome`:
```json
{
  "status": "refreshed",
  "credits_used": 3,
  "hits_count": 24,
  "refresh_run_id": "uuid",
  "by_source": { "dataforseo_news": 12, "perplexity_sonar": 6, "rss": 2 },
  "errors": {},
  "results": [/* MentionRow[] */],
  "sentiment_avg": 0.18,
  "top_outlets": [["wirecutter.com", 4], ["dezeen.com", 3]]
}
```

### `GET /products/{product_id}/feed?limit=100`

Latest refresh run as a row list. For continuous browsing across runs, use `/history`.

### `GET /products/{product_id}/history?days=30&sentiment=negative&outlet_type=news&limit=200`

Filterable history. `sentiment` and `outlet_type` are optional.

### `GET /products/{product_id}/summary?days=30`

Aggregated snapshot: total count, sentiment breakdown, top outlets.

### `GET /products/{product_id}/llm-visibility`

Most recent LLM probe snapshot:

```json
{
  "present": true,
  "probe_run_id": "uuid",
  "total_probes": 16,
  "share_of_voice": 0.5,
  "avg_position": 3.2,
  "per_model": {
    "claude-haiku-4-5": { "probes": 4, "mentioned": 3, "positions": [2, 5, 1] },
    "gpt-4o-mini": { "probes": 4, "mentioned": 2, "positions": [4, 6] }
  },
  "top_competitors": [["Brand A", 12], ["Brand B", 8]]
}
```

### `POST /products/{product_id}/probe-llm`

Admin only. Body: `{ "models": ["claude-haiku-4-5", "gpt-4o-mini"] }` (optional — defaults to all enabled).

Fires a fresh probe matrix. Cost: ~$0.008 per full run.

**Response**:
```json
{
  "status": "completed",
  "probe_run_id": "uuid",
  "probe_count": 16,
  "models": ["claude-haiku-4-5", "gpt-4o-mini", "gemini-2.0-flash", "sonar"],
  "total_cost_usd": 0.008
}
```

---

## Endpoints — subject-scoped (brand / keyword + admin lookups)

### `POST /track`

Create a tracked subject without binding to a catalog product. Used for brand/keyword tracking.

**Body**:

```json
{
  "subject_type": "brand",
  "subject_label": "<your brand>",
  "brand_name": "<your brand>",
  "aliases": ["<alt spelling>", "<abbreviation>"],
  "sources_enabled": { "news": true, "blogs": true, "rss": true, "llm": true },
  "language_codes": ["<ISO 639-1>"],
  "country_codes": ["<ISO 3166-1 alpha-2>"],
  "refresh_interval_hours": 24,
  "alert_on_spike": true,
  "alert_on_negative_sentiment": true,
  "run_first_refresh": true
}
```

### `GET / PUT / DELETE /track/{tracked_mention_id}`

Read / update / deactivate the row.

### `POST /track/{tracked_mention_id}/refresh`

Same as `/products/{id}/refresh` but for arbitrary subjects.

### `GET /track/{tracked_mention_id}/feed | history | summary | llm-visibility`

Same shapes as the product-scoped endpoints.

### `POST /track/{tracked_mention_id}/probe-llm`

Admin only. Fires a probe matrix.

### `POST /track/{tracked_mention_id}/exclude` / `/include`

Body: `{ "url": "https://...", "domain": "spammer.com", "reason": "..." }`. Either `url` or `domain` is required.

### `GET /track/{tracked_mention_id}/exclusions`

List exclusions for the subject.

### `POST /track/{tracked_mention_id}/promote`

Admin only. Body: `{ "url": "...", "override_relevance": "exact", "reason": "..." }`. Sticky override that survives future refreshes.

### `GET /track/{tracked_mention_id}/share-of-voice?days=30`

Aggregate competitor mention counts across all LLM probes for the subject.

```json
{
  "tracked_mention_id": "uuid",
  "competitor_mentions": [
    { "name": "Brand A", "count": 24 },
    { "name": "Brand B", "count": 12 }
  ]
}
```

---

## Cross-flow endpoints

### `POST /classifier-correction`

Body:
```json
{
  "mention_history_id": "uuid",
  "corrected_relevance": "mismatch",
  "corrected_sentiment": null,
  "correction_note": "wrong product family"
}
```

The most-recent corrections are prepended as few-shot examples to subsequent Haiku classifier calls.

### `POST /cron-refresh` — `x-cron-secret` only

Cron-target batch refresh. Calls `get_internal_tracked_mentions_due()` and runs `refresh()` on each due subject. Used by `mention-monitoring-cron` edge function.

### `POST /cron-probe-llm` — `x-cron-secret` only

Daily cron target. Calls `get_tracked_mentions_due_for_llm_probe()` and runs the LLM probe matrix on each subject whose last probe is older than 7 days.

---

## Data shapes

### `TrackedMention`

```ts
{
  id: string;
  api_key_id: string | null;        // XOR with product_id/brand_name
  product_id: string | null;
  brand_name: string | null;
  user_id: string | null;
  subject_type: 'product' | 'brand' | 'keyword';
  subject_label: string;
  aliases: string[];
  sources_enabled: Record<string, boolean>;
  source_config: Record<string, unknown>;  // { rss_feeds: [], probe_template_overrides: {} }
  language_codes: string[];
  country_codes: string[];
  subject_facets: Record<string, unknown> | null;  // cached Haiku facet decomposition
  refresh_interval_hours: number;
  velocity_score: number | null;
  consecutive_stable_refreshes: number;
  next_check_at: string | null;
  last_refreshed_at: string | null;
  total_credits_used: number;
  // Denormalized snapshot
  current_mention_count_7d: number;
  current_mention_count_30d: number;
  current_sentiment_avg: number | null;       // -1..1
  current_share_of_voice: number | null;
  current_top_outlets: Array<{ domain: string; count: number }> | null;
  current_metadata: Record<string, unknown> | null;
  current_snapshot_at: string | null;
  // Alerts
  alert_on_spike: boolean;
  alert_on_negative_sentiment: boolean;
  alert_on_new_outlet: boolean;
  alert_on_llm_visibility_change: boolean;
  alert_channels: string[];
  alert_webhook_url: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}
```

### `MentionRow` (`mention_history`)

```ts
{
  id: string;
  tracked_mention_id: string;
  refresh_run_id: string;
  url: string;
  canonical_url: string | null;
  outlet_domain: string | null;
  outlet_name: string | null;
  outlet_type: 'news' | 'blog' | 'youtube' | 'forum' | 'llm' | 'rss' | 'aggregator' | 'other';
  title: string | null;
  excerpt: string | null;
  body_md: string | null;             // truncated 2KB
  language_code: string | null;
  country_code: string | null;
  author: string | null;
  published_at: string | null;
  discovered_at: string;
  // Classification
  sentiment: 'positive' | 'neutral' | 'negative' | null;
  sentiment_score: number | null;     // -1..1
  relevance: 'exact' | 'tangential' | 'mismatch' | 'unverifiable' | null;
  relevance_score: number | null;
  match_note: string | null;
  // Engagement (when source provides)
  engagement: { upvotes?: number; comments?: number; views?: number } | null;
  // Sanity flags
  is_anomaly: boolean;
  anomaly_reason: string | null;
  manual_override: boolean;
  // Provenance
  source: 'dataforseo_news' | 'perplexity_sonar' | 'rss' | 'youtube';
  classifier_cached: boolean;
}
```

---

## Alerts

Four types, opt-in per tracked subject:

| Type | Detector |
|---|---|
| `mention_spike` | today's count ≥ 2× trailing 7d daily-average baseline (min baseline 1.0) |
| `negative_sentiment` | new mention with `sentiment='negative'` from outlet with `domain_authority ≥ 30` |
| `new_outlet` | first-ever mention from a domain |
| `llm_visibility_change` | average position across LLM probes shifts by ≥2 ranks W/W |

**Channels** (CHANNEL_CREDIT_COST):
- `bell`    → 0 cr (writes to `user_notifications`)
- `email`   → 1 cr (Resend via `email-api` edge function; templates seeded)
- `webhook` → 0 cr (per-subject `alert_webhook_url`)

**Dedupe**: 24h per `(alert_type, tracked_mention_id, outlet_domain)`.

**Webhook payload**:
```json
{
  "alert_type": "negative_sentiment",
  "title": "Negative mention from wirecutter.com",
  "body": "...",
  "product_id": "uuid|null",
  "tracked_mention_id": "uuid",
  "outlet_name": "Wirecutter",
  "outlet_domain": "wirecutter.com",
  "payload": { "url": "...", "title": "...", "sentiment_score": -0.6 },
  "fired_at": "2026-05-03T10:15:00Z"
}
```

---

## Required environment

On the MIVAA backend (systemd unit / Docker env):

| Var | Purpose |
|---|---|
| `ANTHROPIC_API_KEY` | Haiku classifier + facet decomposition + LLM probe |
| `PERPLEXITY_API_KEY` | Sonar / sonar-pro discovery |
| `DATAFORSEO_BASE64` (or `DATAFORSEO_LOGIN` + `DATAFORSEO_PASSWORD`) | News API |
| `YOUTUBE_DATA_API_KEY` | YouTube discovery (opt-in per subject) |
| `OPENAI_API_KEY` | gpt-4o-mini probe |
| `GEMINI_API_KEY` | gemini-2.0-flash probe |
| `CRON_SECRET` | shared with price-monitoring-cron; validates `x-cron-secret` header |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | bell + email + RPCs |

On Supabase Edge Function env:
- `PYTHON_BACKEND_URL` (e.g. `https://v1api.materialshub.gr`)
- `CRON_SECRET` (matches MIVAA's value)

---

## Cron schedule

| Job | Schedule (UTC) | Purpose |
|---|---|---|
| `mention-monitoring-refresh-hourly` | `30 * * * *` | Iterate due internal subjects, run discovery + classify + persist + alerts |
| `llm-mention-probe-daily` | `0 3 * * *` | Pick subjects whose last probe is >7d old, fire probe matrix |
| `mention-classifier-cache-prune` | `0 4 * * *` | Delete expired verdict-cache rows |

---

## Tables (post 2026-05-03)

- `tracked_mentions` — subject (XOR `api_key_id` / `product_id` / `brand_name`)
- `mention_history` — append-only rows per refresh
- `llm_mention_probes` — per-(template × model) probe attempts
- `mention_outlets` — outlet reputation cache (domain authority, type, country)
- `mention_classifier_verdict_cache` — 7d TTL cache keyed on content_hash + facets_hash
- `mention_promoted_urls` — sticky admin overrides
- `mention_excluded_urls` — per-subject URL/domain exclusions
- `mention_match_corrections` — classifier feedback loop (few-shot)
- `mention_alert_log` — alert audit + dedupe

## RPCs

- `get_internal_tracked_mentions_due(p_limit)`
- `get_tracked_mentions_due_for_llm_probe(p_limit, p_min_age_days)`
- `update_tracked_mention_cadence(p_tracked_mention_id, p_velocity_pct_change)`
- `append_mention_alert_log(...)`

---

## Out of scope for v1

- **Twitter/X**: too expensive ($200/mo for 10k tweets, basic tier).
- **TikTok**: ToS-hostile, no stable API.
- **Instagram / Facebook (mentions of you on others' pages)**: no public search.
- **YouTube transcripts**: opt-in per subject in v2 (multiplies cost significantly).
- **Auto-extracted color palettes from mention images**: deferred to v2.

## v2 follow-ups

- Curated outlet seed list with hand-rated domain authority.
- Self-healing extraction recipes for forum scrapes (mirrors `retailer_extraction_recipes`).
- Per-subject competitor co-mention graph view.
