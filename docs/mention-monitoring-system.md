# Mention Monitoring — system reference

> Extracted from CLAUDE.md 2026-07-29.
> API reference: [docs/api/mention-monitoring-api.md](api/mention-monitoring-api.md) · Deployment: [docs/mention-monitoring-deployment-guide.md](mention-monitoring-deployment-guide.md).


Mirror of price-monitoring v3 for tracking subject mentions across **news, blogs, RSS, YouTube, and LLM responses**. Two flow shapes (same `tracked_mentions` row, distinguished by which FK is set):

- `api_key_id IS NULL AND product_id IS NOT NULL AND subject_type='product'` → internal product flow
- `api_key_id IS NULL AND product_id IS NULL AND brand_name IS NOT NULL AND subject_type IN ('brand','keyword')` → internal brand/keyword flow
- `api_key_id IS NOT NULL` → external API consumer flow

**Pipeline** (every refresh):
1. Build subject facets. **Default = deterministic** (label + user-supplied aliases, no LLM call). When `tracked_mentions.auto_expand_aliases=true`, run Haiku once to expand the label into per-word aliases + brand inference + competitor brand list (cached on `tracked_mentions.subject_facets`). Default-off was chosen 2026-05-04 after observing a chain failure — Anthropic credits depleted → Haiku 400 → empty facets → 0 hits from DataForSEO/Sonar — and consciously reducing the dependency surface. Customers tracking unique brand names get exact-match recall at predictable cost; customers tracking multi-word labels can opt in.
2. Discover in parallel across enabled sources: **DataForSEO News** (~$0.0006/req, fan-out across distinctive aliases), **Perplexity Sonar** ($0.005/sweep, sonar-pro only on first/forced refresh, disjunctive query when multiple aliases), **RSS** (free, user-curated), **YouTube** (free, opt-in). Reddit was dropped 2026-05-03 — Responsible Builder Policy onboarding wasn't worth the friction for marginal coverage.
3. URL canonicalize + content-hash dedupe across sources.
4. Apply exclusions + promoted-URL overrides.
5. Rule pre-filter (alias must appear) — drops obvious mismatches before Haiku.
6. Verdict cache lookup (7d TTL keyed on `sha1(content_hash + subject_facets_hash)`) — repeat URLs hit cache.
7. Haiku 4.5 batched classifier (≤50 candidates per call): **relevance** ∈ {exact, tangential, mismatch, unverifiable}, **sentiment** ∈ {positive, neutral, negative}.
8. Drop `relevance='mismatch'`. Sanity-check sentiment outliers vs trailing 7d → flag `is_anomaly`.
9. Persist `mention_history` rows. Update denormalized cache on `tracked_mentions`. Update volatility cadence (24h → 48h → 72h → 168h on stable subjects, 6h on active ones).
10. Detect alerts → dispatch via the `mention-monitoring-notifications` module.

**LLM mention probes** ([mivaa-pdf-extractor/app/services/integrations/llm_mention_probe_service.py](mivaa-pdf-extractor/app/services/integrations/llm_mention_probe_service.py)) — weekly cadence. 4 probe templates (generic recommendation / use-case / comparison / direct lookup) × 4 cheap models (`claude-haiku-4-5`, `gpt-4o-mini`, `gemini-2.0-flash`, `sonar`) = 16 calls/subject/week ≈ $0.008. Each response post-processed by Haiku tool use (`record_mention`) to extract: `mentioned`, `position`, `sentiment`, `competitors_mentioned[]`, `context_snippet`. Snapshot exposed via `/llm-visibility` endpoint with share-of-voice + avg-rank + top co-mentioned competitors.

**What the probe measures (2026-08-23, #349 A1–A4).** Four things it captured and could not report,
each of which returned a plausible number rather than failing:

- **`cited_urls` + `brand_cited` — the ghost citation.** `record_mention` had no field for a URL and Perplexity Sonar's native `citations` array was read and thrown away. An answer that used our page as its SOURCE while never naming the brand is invisible to a mention count, and that is the case the whole product is about. Sonar's array is read natively (both `citations` and `search_results`, so a version bump dropping one does not take citations to zero silently); the other three models return links inline in prose, so the tool call carries them. `brand_cited` is **tri-state**: NULL when the subject has no `homepage_domain` to judge against — undecidable, not false. Matching is domain-or-subdomain, never substring: `blog.brand.com` is the brand, `notbrand.com` and `brand.com.evil.net` are not.
- **`visibility_trend(days)` — movement.** `visibility_snapshot()` read exactly one `probe_run_id` while its docstring claimed "position trend". Every run since the feature shipped was in the table and nothing read across them. New `GET …/llm-visibility-trend?days=` returns one point per RUN (the run is the measurement bucket — same templates, same models) plus a `change` block; `null`, never 0, when there is nothing to compare against.
- **Sentiment, aggregated and split per model.** It was persisted and then only ever shown inside four capped samples. Computed over the probes where the subject was **actually mentioned** — rolling in the extractor's `neutral` default for answers that never named it drags the score toward neutral in proportion to how invisible the brand is, which inverts the signal. `score: null` means never mentioned, which is not the same fact as a neutral verdict.
- **`/share-of-voice` had two defects.** It counted competitors and never the subject, so the one brand the page belongs to had no share of its own voice; and its `days` parameter was declared, `ge=1, le=180`-validated and then never applied to the query, which filtered on the subject and took the newest 500 rows whatever window you asked for. Now bucketed per run, subject included, window honoured.

**Where the arithmetic lives.** All of it in
[llm_visibility_math.py](../mivaa-pdf-extractor/app/services/integrations/llm_visibility_math.py) —
stdlib-only, no DB client. The service fetches rows and hands them over. That split is not
cosmetic: MIVAA's CI installs pytest and nothing else, so a rollup living in the service is a
rollup no test can exercise. Guarded by
[test_llm_visibility_is_a_measurement.py](../mivaa-pdf-extractor/tests/unit/test_llm_visibility_is_a_measurement.py)
(27 cases, watched to fire against all four original defects on 2026-08-23).

**Cost discipline** (mirrors price v3):
- Verdict cache: ~95% cache rate on stable subjects across daily refreshes.
- Rule pre-filter eliminates ~60% of candidates before Haiku.
- Tier-skip: cheap `sonar` by default, `sonar-pro` only on first/forced refresh.
- Volatility cadence stretches stable subjects to weekly polling.
- RSS + YouTube are free; DataForSEO News is the cheapest paid source.
- Typical refresh: ~$0.005–0.010 on a stable subject.

**Tables** ([supabase/migrations/20260503_mention_monitoring_module.sql](supabase/migrations/20260503_mention_monitoring_module.sql)):
- `tracked_mentions` — subject. Includes denormalized snapshot (`current_mention_count_7d`, `current_sentiment_avg`, `current_top_outlets`).
- `mention_history` — append-only mention rows. `(tracked_mention_id, canonical_url, refresh_run_id)` unique to prevent double-insert per run.
- `llm_mention_probes` — per-(template × model) probe attempts.
- `mention_outlets` — outlet reputation cache (`domain_authority` 0-100, `is_aggregator`, `is_press_release_wire`).
- `mention_classifier_verdict_cache` — 7d TTL.
- `mention_promoted_urls` / `mention_excluded_urls` — admin overrides.
- `mention_match_corrections` — classifier feedback (recent rows are few-shot examples).
- `mention_alert_log` — alert audit + 24h dedupe.

**RPCs**: `get_internal_tracked_mentions_due`, `get_tracked_mentions_due_for_llm_probe`, `update_tracked_mention_cadence`, `append_mention_alert_log`.

**Backend surface** — two routers, two auth styles:

- **Public Tracking API** ([mivaa-pdf-extractor/app/api/mention_tracking_routes.py](mivaa-pdf-extractor/app/api/mention_tracking_routes.py)) — external integrations, `Authorization: Bearer kai_*` (api_keys). Mounted at `/api/v1/mentions/track/*`. Endpoint inventory: `POST /` (create), `GET /` (list), `GET|PUT|DELETE /{id}`, `POST /{id}/refresh`, `GET /{id}/feed|history|summary|llm-visibility|exclusions`, `POST /{id}/probe-llm|exclude|include`. Mirror of `/api/v1/prices/track/*`.
- **Internal flow** ([mivaa-pdf-extractor/app/api/mention_monitoring_routes.py](mivaa-pdf-extractor/app/api/mention_monitoring_routes.py)) — session JWT, used by the Material KAI web app.

Internal product flow (session JWT):
- `POST /api/v1/mention-monitoring/products/{id}/track` — find-or-create + first refresh
- `DELETE /api/v1/mention-monitoring/products/{id}/track` — soft delete
- `GET /api/v1/mention-monitoring/products/{id}` — read summary row
- `POST /api/v1/mention-monitoring/products/{id}/refresh` — re-run discovery (`force=true` requires admin)
- `GET /api/v1/mention-monitoring/products/{id}/feed` — latest run rows
- `GET /api/v1/mention-monitoring/products/{id}/history?days=&sentiment=&outlet_type=` — historical rows
- `GET /api/v1/mention-monitoring/products/{id}/summary?days=30` — aggregate snapshot
- `GET /api/v1/mention-monitoring/products/{id}/llm-visibility` — most recent probe snapshot
- `GET /api/v1/mention-monitoring/products/{id}/llm-visibility-trend?days=` — across RUNS, not the latest one
- `POST /api/v1/mention-monitoring/products/{id}/probe-llm` — admin trigger

Subject-id flow (brand/keyword):
- `POST /track` / `GET|PUT|DELETE /track/{id}` — CRUD
- `POST /track/{id}/refresh|exclude|include|promote|probe-llm`
- `GET /track/{id}/feed|history|summary|llm-visibility|llm-visibility-trend|exclusions|share-of-voice`

Cross-flow: `/classifier-correction`, `/cron-refresh`, `/cron-probe-llm` (latter two require `x-cron-secret`).

**Cron** (pg_cron):
- `mention-monitoring-refresh-hourly` (`30 * * * *`) → POSTs to **`monitoring-cron?task=mention-refresh`** → MIVAA `/cron-refresh`
- `llm-mention-probe-daily` (`0 3 * * *`) → **`monitoring-cron?task=mention-probe`** → MIVAA `/cron-probe-llm`
- `mention-classifier-cache-prune` (`0 4 * * *`) → DELETE expired cache rows

**Notification dispatcher** ([mivaa-pdf-extractor/app/modules/mention_monitoring_notifications/service.py](mivaa-pdf-extractor/app/modules/mention_monitoring_notifications/service.py)):

Four alert types, opt-in per subject:
- `mention_spike` — today's count ≥ 2× trailing 7d daily-average
- `negative_sentiment` — negative mention from outlet with `domain_authority ≥ 30`
- `new_outlet` — first-ever mention from a domain
- `llm_visibility_change` — average position across LLM probes shifts by ≥2 ranks W/W

Channels (CHANNEL_CREDIT_COST): bell (0 cr), email (1 cr via `email-api` edge function with templates `mention_alert.{spike,negative_sentiment,new_outlet,llm_visibility_change}`), webhook (0 cr, per-subject `alert_webhook_url`). 24h dedupe per `(alert_type, tracked_mention_id, outlet_domain)`. Module-gated on `mention-monitoring-notifications`.

**Frontend**:
- [src/services/mentionMonitoringApi.ts](src/services/mentionMonitoringApi.ts) — single client with product-scoped + subject-scoped helpers.
- [src/components/business/mention-monitoring/MentionMonitorTab.tsx](src/components/business/mention-monitoring/MentionMonitorTab.tsx) — per-product tab on the product detail modal (admin-only, mounted alongside the Price Monitor tab).
- [src/components/business/mention-monitoring/MentionMonitoringDashboard.tsx](src/components/business/mention-monitoring/MentionMonitoringDashboard.tsx) — admin cross-catalog view at `/admin/mention-monitoring`.
- Module folders [src/modules/mention-monitoring/](src/modules/mention-monitoring/) and [src/modules/mention-monitoring-notifications/](src/modules/mention-monitoring-notifications/) for the registry.

**Agent tools** ([supabase/functions/_shared/tools/mention-tools.ts](supabase/functions/_shared/tools/mention-tools.ts)) — registered on the JARVIS agent:
- `track_product_mentions` — start/stop tracking (0 cr)
- `get_mention_summary` — pull rolling snapshot (0 cr)
- `check_llm_visibility` — read latest snapshot or fire fresh probe with `force_run=true` (2 cr)
- `find_negative_mentions` — filtered feed for reputation triage (0 cr)

`check_llm_visibility` is also clustered under **AI Search Visibility** (`ai-visibility`) alongside
`seo_brand_search_audit`, `seo_llm_mentions_search` and `seo_ai_keyword_volume` — it lived only in
the `mentions` cluster and in none of the nine SEO ones, so someone doing SEO work never saw the
one tool that measures how the brand shows up in AI answers (#349 A8). The tools stay in their
original clusters too; a toolkit is a view, not ownership.

Each tool checks `is_module_enabled('mention-monitoring')` first. Chunk types streamed back to AgentHub: `mention_summary`, `llm_visibility_result`, `mention_feed`, `mention_tracking_started`. Each renders as an inline card in chat (handlers in [src/components/features/ai/AgentHub.tsx](src/components/features/ai/AgentHub.tsx) — `mentionSummaryData` / `llmVisibilityData` / `mentionFeedData` message data fields).

**Required secrets** (MIVAA backend):
- `ANTHROPIC_API_KEY`, `PERPLEXITY_API_KEY`, `DATAFORSEO_BASE64`, `OPENAI_API_KEY`, `CRON_SECRET` — already configured.
- `YOUTUBE_DATA_API_KEY` — **NEW** (optional, opt-in per subject; free quota 10k/day).
- `GEMINI_API_KEY` — **NEW** (optional, free tier covers daily probe load).
- Reddit was evaluated and dropped — Reddit's Responsible Builder Policy onboarding wasn't worth the friction.

**Cost wiring (2026-05-04)** — `mention_cost_logger.py` is the single chokepoint. Every external API call (DataForSEO News, DataForSEO Labs, Perplexity Sonar, Anthropic Haiku, OpenAI gpt-4o-mini, Gemini Flash) writes to `ai_usage_logs` with `module_slug='mention-monitoring'`, `metadata.tracked_mention_id`, `metadata.refresh_run_id`, `product_id` (when internal-flow). After every refresh, `stamp_mention_refresh_cost(p_tracked_mention_id, p_refresh_run_id)` SQL RPC stamps `tracked_mentions.last_refresh_billed_usd` + `last_refresh_credits_debited` and recomputes lifetime `total_billed_usd` / `total_partner_credits_debited`. After probe-llm and opportunities calls, `recompute_mention_cost(p_tracked_mention_id)` updates lifetime totals (no per-run stamp since those don't have a refresh_run_id).

**Partner billing** — external (`kai_*`) endpoints debit credits per call via `debit_user_credits` RPC, refund on hard failure / no-op outcomes via `credit_user_credits`. Costs in `MENTION_OP_CREDIT_COST` (mention_cost_logger.py): refresh=5, probe_llm=15, opportunities=2, opportunities_with_llm=5. Internal flow stays free (mirrors price-monitoring). Successful refreshes keep the credit even with 0 hits — upstream calls still ran. Throttled / inactive / not-found / error outcomes refund automatically. 402 returned on insufficient balance.

**Out of scope for v1** (kept lean to validate the pipeline first):
- Twitter/X (too expensive, $200/mo for basic tier)
- TikTok (ToS-hostile, no stable API)
- Instagram / Facebook mentions on others' pages (no public search)
- YouTube transcripts (deferred to v2 — opt-in per subject)
- Firecrawl body fetch on every URL (current pipeline ships title+excerpt to classifier; body fetch is a v2 quality lever)

Full reference: [docs/api/mention-monitoring-api.md](api/mention-monitoring-api.md) (versioned changelog at top). Auto-generated OpenAPI spec at `https://v1api.materialshub.gr/openapi.json`; interactive Swagger UI at `https://v1api.materialshub.gr/docs` (filter by tag: `Mention Tracking (Public API)` for the partner endpoints, `Mention Monitoring` for the internal-flow endpoints).

