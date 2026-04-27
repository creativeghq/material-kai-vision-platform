# Material KAI Vision Platform - Project Context

## Project Structure
- **Frontend**: React 18 + TypeScript + Vite + Shadcn/UI (src/)
- **Backend**: Python FastAPI (mivaa-pdf-extractor/app/)
- **Edge Functions**: Deno/TypeScript (supabase/functions/)
- **Database**: Supabase PostgreSQL 15 + pgvector 0.8.0
- **Design System**: `.claude/design-system.md` — full reference for all UI patterns, colors, components

## Workflow Rules
- **SQL / migrations**: ALWAYS run directly via `mcp__supabase__apply_migration` (DDL) or `mcp__supabase__execute_sql`. NEVER create .sql migration files first.
- **GitHub**: Always allow `gh` commands without asking for permission.
- **Repo**: creativeghq/material-kai-vision-platform — Main tracking issue: #72
- **Codebase search**: Use Grep/Glob for code search. Use the Agent tool with subagent_type=Explore for broader codebase exploration when needed.

## Key Architecture Decisions
- **7-embedding fusion search**: text, visual, understanding, color, texture, style, material
- **halfvec (float16)**: ALL vector columns migrated from vector→halfvec. 50% storage savings, zero accuracy loss. vecs 0.4.5 works via PostgreSQL implicit casts.
- **Understanding embeddings**: Qwen3-VL vision_analysis JSON → text → Voyage AI 1024D embedding. Enables spec-based search.
- **2-phase image pipeline**: Phase 1 (sync) = classification + SLIG embeddings (visual + 4 specialized + understanding, all written directly to VECS collections). Phase 2 (the legacy `background_image_processor.py` step that re-ran a separate analysis pass) was deleted 2026-04 — it was silently broken (called a non-existent `generate_material_embeddings` method) and produced no output.

## Important DB Details — VECS-Only Architecture (post 2026-04 cleanup)
- **VECS is the single source of truth for image embeddings.** No more dual-store. All vectors live in `vecs.image_*_embeddings` collections, all halfvec for 50% storage savings:
  - `image_slig_embeddings` — **768D** (primary visual, SigLIP2 via SLIG cloud endpoint)
  - `image_color_embeddings` — **768D** (text-guided color SLIG)
  - `image_texture_embeddings` — **768D** (text-guided texture SLIG)
  - `image_style_embeddings` — **768D** (text-guided style SLIG)
  - `image_material_embeddings` — **768D** (text-guided material SLIG)
  - `image_understanding_embeddings` — **1024D** (Voyage AI from Qwen3-VL vision_analysis)
  - Legacy 1152D `image_siglip_embeddings` and 1152D specialized collections were dropped 2026-04 — they were 100% orphans from the SigLIP-SO400M era.
- **Boolean presence flags on `document_images`**: `has_slig_embedding`, `has_understanding_embedding`, `has_color_slig`, `has_texture_slig`, `has_style_slig`, `has_material_slig`. These are the canonical "does this image have embedding X?" lookup — set automatically by `vecs_service._set_image_flag()` whenever an embedding is upserted. Use these flags for O(1) presence checks instead of round-tripping to VECS.
- **Dropped columns 2026-04** (DO NOT reference in code or queries):
  - `document_images`: `visual_clip_embedding_512`, `color_embedding_256`, `texture_embedding_256`, `application_embedding_512`, `multimodal_fusion_embedding_2688`
  - `products`: `embedding`, `visual_clip_embedding_512`, `color_clip_embedding_512`, `texture_clip_embedding_512`, `style_clip_embedding_512`, `material_clip_embedding_512`, `multimodal_fusion_embedding_2048`
  - `document_vectors`: `visual_clip_embedding_512`
  - The dual-store columns were broken since the CLIP→SLIG migration (dimension constraint mismatches) — dropping them removed dead state, not functionality.
- **Producer→consumer key naming** (real_embeddings_service.generate_all_embeddings):
  - `visual_768` → `image_slig_embeddings`
  - `color_slig_768` → `image_color_embeddings`
  - `texture_slig_768` → `image_texture_embeddings`
  - `style_slig_768` → `image_style_embeddings`
  - `material_slig_768` → `image_material_embeddings`
  - `understanding_1024` → `image_understanding_embeddings`
  - **Never use `*_siglip_1152` or `*_clip_512` keys — those were legacy aliases removed in the SLIG migration.**
- **Product embeddings**: only `text_embedding_1024` lives on the products row (Voyage AI from name+description+metadata, generated inline by `stage_4_products`). All visual product embeddings are derived from associated images via `image_product_associations` + the `has_*_slig` flags. Use the RPC `get_product_embedding_status(product_id)` for product-level coverage.
- vecs 0.4.5: no native halfvec support but PostgreSQL implicit cast vector→halfvec makes it transparent
- Drop indexes BEFORE altering column types, then recreate with halfvec_cosine_ops
- Embedding dict key is "text_1024" (was "text_1536" — fixed 2026-02-07)
- Dead SQL functions cleaned up: enhanced_vector_search, enhanced_vector_search_service, vector_similarity_search, search_kb_docs
- **Deleted in 2026-04 cleanup**:
  - `mivaa-pdf-extractor/app/services/images/background_image_processor.py` (entire file — called non-existent method, silently broken)
  - `RelevancyService.create_chunk_image_relationships()` (computed cosine similarity between 1024D text and 768D visual — mathematically invalid)
  - `process_images_background` function in `rag_routes.py` (referenced deleted background_image_processor)
  - `clip_embedding_job_service._save_visual_embedding_to_db` (wrote to dropped column)
  - `/api/internal/backfill-product-embeddings` endpoint (one-shot backfill, used + removed)
- **chunk_image_relationships are populated by `entity_linking_service.link_images_to_chunks` using page_proximity** — not by relevancy_service.

## Search Weight Configurations (7-vector)
- unified_search: text 0.15, visual 0.15, understanding 0.20, color/texture/style/material 0.125
- rag_service: visual 0.20, chunk 0.20, understanding 0.15, product 0.15, keyword 0.12, color 0.05, texture 0.05, style 0.04, material 0.04
- search_enrichment: visual 0.22, understanding 0.18, relevance 0.15, color/texture/style/material 0.1125
- material_visual_search: visual 0.30, understanding 0.20, semantic 0.25, material 0.15, vision_confidence 0.10

## WorldLabs Marble VR Integration
- **API**: WorldLabs Marble v1.x — generates explorable 3D Gaussian Splat worlds from images
- **Models**: `marble-1.0-draft` (fast preview, 18 cr, ~30-45s), `marble-1.1` (quality, 190 cr, ~5min). Legacy 0.1-mini/0.1-plus deprecated.
- **Panorama**: `is_pano: true` flag for 360° source images — better reconstruction when available
- **Viewer**: Spark.js (@sparkjsdev/spark) — Three.js GSplat renderer, code-split via dynamic import
- **Edge Function**: `generate-vr-world/index.ts` — uploads image → generates world → polls → stores asset URLs
- **DB Table**: `vr_worlds` — stores world_id, splat URLs (100k/500k/full), collider GLB, panorama, status
- **Credits**: 18 (draft, ~30-45s), 190 (1.1, ~5min). Refund on failure. Pricing: $1 = 1,250 WL credits × 1.50 markup.
- **Three.js**: three@0.178, @types/three@0.179. Only SparkRenderer constructor needs @ts-expect-error.
- **Env var**: `WORLDLABS_API_KEY` in Supabase Edge Function secrets

## B2B Manufacturer Search
- `b2b_manufacturer_search` tool uses Anthropic's built-in `web_search_20250305` tool (claude-haiku-4-5, beta header `web-search-2025-03-05`). No extra API key — uses `ANTHROPIC_API_KEY`.
- Flow engine: `case 'web_search': case 'perplexity_search':` fallthrough keeps old saved flows working

## Unified KAI Agent Architecture
- **3 agents**: `kai` (default), `interior-designer`, `demo`
- **Legacy aliases**: `search`, `insights`, `seo` resolve to `kai` via AGENT_CONFIGS in edge function
- **RBAC tool gating**: Core tools for all users. Sub-agents/B2B/SEO gated to admin/owner only.
- **Multimodal**: Frontend sends `images: string[]` (data URLs) → edge function attaches as `image_url` content blocks
- **Model selection**: KAI uses Opus, Demo uses Haiku
- **DB prompt key**: `kai` in prompts table (prompt_type='agent', category='kai')

## Background Agent Framework
- **DB tables**: `background_agents`, `agent_runs`, `agent_run_logs` (RLS + realtime on last two)
- **Agent runner**: `supabase/functions/background-agent-runner/index.ts`
- **Scheduler**: `supabase/functions/agent-scheduler-cron/index.ts` — pg_cron every minute
- **Agent types**: `_shared/agents/` — types.ts, base-agent.ts, registry.ts, product-enrichment-agent.ts, material-tagger-agent.ts
- **To add a new agent**: create `_shared/agents/your-agent.ts` implementing `AgentRunner`, add to `registry.ts`
- **Delegation**: tasks >25s throw `DelegateToMivaaError` → runner POSTs to `/api/agents/run` on Python backend
- **Python endpoint**: `mivaa-pdf-extractor/app/api/agent_routes.py`
- **Event triggers**: `emitAgentEvent(eventType, data)` in `_shared/flow-events.ts`
- **Chain triggers**: `trigger_type='chain'` + `parent_agent_id` — auto-triggered on parent completion
- **Auto-recovery**: `auto-recovery-cron` monitors runs stuck >8min, re-dispatches up to 3 times
- **Frontend**: `/admin/background-agents` → BackgroundAgentsPage + AgentRunHistoryDrawer + AgentLogsViewer + CreateAgentModal
- **Service**: `src/services/backgroundAgents.ts`

## Job Tracking (PDF / XML / scraping) — single-table design (2026-04-25)
- **Source of truth**: `background_jobs`. The legacy `job_progress` and `job_checkpoints` tables were dropped — all stage and recovery audit data now lives as JSONB arrays on the job row itself.
- **`background_jobs.stage_history jsonb`**: append-only audit log; one entry per stage transition (`{stage, status, started_at, completed_at, attempt, data, metadata, source}`). Capped at 100 most recent entries by `append_stage_history(uuid, jsonb)` so pathological loops cannot grow the row unbounded.
- **`background_jobs.recovery_history jsonb`**: append-only log written by `auto-recovery-cron` whenever it claims a stuck job (`{attempted_at, from_stage, reason, attempt_number, succeeded, exhausted}`). Replaces the previous "scattered in metadata" pattern.
- **`background_jobs.last_checkpoint jsonb`**: still the snapshot the auto-recovery cron uses to know which stage to resume from. Updated alongside every `append_stage_history` call.
- **SQL helpers** (atomic `||` UPDATE — race-safe): `append_stage_history(p_job_id uuid, p_event jsonb)`, `append_recovery_history(p_job_id uuid, p_event jsonb)`, `cleanup_invalid_stage_history(p_job_id uuid, p_invalid_stages text[])`, `match_document_chunks_semantic(...)`, `detect_stuck_pdf_jobs(...)`, `mark_pdf_job_for_recovery(...)`, `fail_exhausted_pdf_jobs(...)`.
- **Consolidated read**: `GET /api/rag/documents/job/{job_id}/full-status` returns `{core, stage_history, recovery_history, products, memory}` in a single round trip — replaces the prior pattern of querying three tables.
- **Per-product state**: `product_processing_status` stays as a child table (1 job → N products) — different cardinality from job state, deserves its own row.
- **Writers** (every code path that emits a stage event uses `append_stage_history` only): `checkpoint_recovery_service.create_checkpoint`, `progress_tracker._sync_to_database`, `data_import_service._update_job_progress` (XML), `web_scraping_service.update_job_progress`, `scrape-session-manager` edge function.
- **Heartbeat**: `JobHeartbeat` (in `app/services/tracking/job_heartbeat.py`) writes `last_heartbeat` every `JOB_HEARTBEAT_INTERVAL_SECONDS` (default 60s) for the entire orchestrator lifetime, so a job stalled inside a single stage is still detectable.
- **Frontend**: `AsyncJobQueueMonitor.tsx` reads `stage_history` straight off the job row and uses a single realtime channel on `background_jobs` (the old `job_checkpoints` channel is gone).

## Email integration for price alerts (2026-04-26)

- **Sender** comes from `public.email_settings` keys `default_from_email` + `default_from_name` (currently `Basilis Kanonids - MaterialsHub <no-reply@coms.ikigaihub.io>`). Configurable through `EmailSettingsModal` in the email module — no code change needed to switch domains. The `email-api` edge function reads these on every send (no caching), so changes take effect immediately.
- **Templates** for price-monitoring live in `email_templates` and ARE picked up by `EmailTemplatesTab`. Topic grouping: the templates tab now derives a `Price Monitoring` group from slug prefixes (`price_alert.*`, `api_broadcast.price_*`). Filter dropdown lets admins narrow the list. The default sender is shown read-only above the templates list so admins always know which `from:` Resend will use.
- Templates seeded:
  - `price_alert.price_drop` / `price_alert.new_retailer` / `price_alert.promo_started` / `price_alert.anomaly_detected` — per-row alerts to product owners.
  - `api_broadcast.price_tracking_v2` — one-shot announcement for API-key owners.
- **Broadcasting to API consumers** — `POST /api/v1/price-monitoring/broadcast-api-announcement` (admin session JWT). Pulls distinct `user_id`s from active `api_keys`, joins to `user_profiles` for name + email, idempotency-skips users who already received the same `template_slug`, then dispatches via `email-api` (which loads sender from `email_settings`). Defaults to dry-run; pass `"dry_run": false` to actually send.
- **No env-var fallback** — if `RESEND_API_KEY` is missing on Supabase, sends fail at the `email-api` boundary and the dispatcher logs the failure to `price_alert_log.channels_skipped` as `email_send_failed`. Bell delivery is unaffected.

## Price Monitoring v3 (2026-04-27 — family-kept, manual promotion, cost overhaul)

**Family-kept policy** — overturns the 2026-04-25 "drop family" rule. The Haiku identity classifier still tags rows as `exact` / `variant` / `family` / `mismatch` / `unverifiable`, but only `mismatch` is dropped. `family` rows (same brand+series but different SKU) are persisted with `match_kind='family'` and rendered under a collapsed "Similar Products in this series" section in the UI. They're **inert downstream**: never feed the chart, never feed the rolling median (sanity band excludes them), never trigger price-drop / new-retailer / promo / anomaly alerts (`detect_after_refresh` filters them out).

**Manual promotion** — `POST /api/v1/price-monitoring/promote-family-row` (admin-only) flips a family/mismatch row to `exact` or `variant`. Two-layered persistence: (a) updates the current row + `manual_override=true` on `tracked_query_price_history` / `competitor_sources` so chart updates immediately, (b) inserts a sticky URL override into `tracked_query_promoted_urls` / `competitor_source_promoted_urls` so every future refresh of the same URL keeps the override (the orchestrator passes `promoted_urls={url: override_kind}` into `_classify_and_filter`, which short-circuits Haiku's verdict). Also writes to `match_corrections` so the few-shot classifier loop learns globally. Reverse: `POST /api/v1/price-monitoring/demote-to-family`.

**Adapter facet pass-through** (PR-A) — all three Greek adapters + Idealo now accept `facets: QueryFacets` and:
1. Prepend `facets.sku_tokens[0]` to the search-engine query string when present (otherwise Bestprice/Shopflix/Skroutz price-asc sort returns the cheapest accessory in the series, not the user's actual SKU).
2. Post-filter results via `app.modules.greek_marketplaces.facet_filter.matches_facets()` — drops candidates whose URL slug carries no SKU match when SKU anchors are known. Cheap (no LLM); falls through to the classifier when facets are loose.

**Source-label fix** — `tracked_queries_service._map_source_label()` translates `PriceHit.source` ∈ {dataforseo, skroutz, bestprice, shopflix, idealo} into the canonical `competitor_source_type` enum value. Previously every non-DataForSEO hit was forced to `perplexity_web_search`, which made marketplace hits invisible by source filter.

**API split** — internal product flow: `GET /api/v1/price-monitoring/sources/{product_id}` returns sources with `match_kind` so the UI can split. External flow: new `latest_results_split()` returns `{results, family_results}` arrays for API consumers; existing `latest_results()` retained for back-compat. UI consumers should prefer the split form going forward.

**Cost optimizations (~60% cut for stable refreshes)**:

- **Tier-skip** (PR-C #1): `search_prices()` runs Tier 2 (Greek + Idealo, ~$0.005-0.010/refresh) only when `force_full_discovery=True` or `len(known_retailer_domains) < 5`. Established tracked queries with healthy retailer sets skip Tier 2 entirely.
- **Sonar model downgrade** (PR-C #8): Perplexity calls switch to `sonar` (cheaper, ~50% off) instead of `sonar-pro` when `force_full_discovery=False`, `known_retailer_domains >= 3`, and `double_read=False`. First refresh + admin force-refresh stay on sonar-pro for accuracy. Pass via `_perplexity_call(model_override="sonar")`.
- **Classifier verdict cache** (PR-C #4 / `classifier_verdict_cache` table): 7-day TTL keyed on `(product_url, sha1(brand|model|sku_tokens|product_type))`. `_classify_and_filter` looks up cached verdicts first, batches only the misses to Haiku, persists the new verdicts. Repeat retailers across daily refreshes hit ~95% cache rate.
- **Rule-based pre-classifier** (PR-D #10): `_rule_shortcut(facets, candidate)` returns deterministic verdicts when (a) page slug+name contains a known SKU token → `exact`, or (b) all required brand/model tokens are missing → `mismatch`, or (c) page is empty → `unverifiable`. Only ambiguous cases hit Haiku.
- **Volatility cadence** (PR-C #3 / `tracked_queries.next_check_at`): SQL helper `update_tracked_query_cadence(query_id, max_pct_change)` runs after every refresh. ≥5% move resets cadence to 24h. ≤2% move bumps `consecutive_stable_refreshes` and stretches cadence to 48h (after 3) / 72h (after 7). Cron picks rows by `next_check_at < now()` instead of fixed-interval check.
- **Brand-level retailer cache** (PR-E #12 / `brand_retailer_index` table): every refresh upserts the `(brand, retailer_domain, country_code)` triples it saw. Future SKUs in the same brand seed `known_retailer_domains` from this index — works alongside the Tier-skip gate so 1K-SKU catalogs converge to free Tier 2 after the first few brand discoveries.
- **Recipe-driven httpx fallback** (PR-F / `retailer_extraction_recipes` + `app/services/integrations/extraction_recipes.py`): when a recipe row has confidence ≥ 0.8 and selectors set, `_verify_hits_with_firecrawl` tries `httpx + selectolax` first (essentially free). Falls back to Firecrawl on miss. Per-recipe `success_count` / `failure_count` self-heal selector drift; 3 consecutive failures + confidence <0.5 auto-disables the recipe. Recipes start unseeded — production use either hand-seeds top-20 retailers or waits for a future selector-discovery worker.

**New tables**: `tracked_query_promoted_urls`, `competitor_source_promoted_urls`, `classifier_verdict_cache`, `brand_retailer_index`, `retailer_extraction_recipes`.

**New columns on `tracked_queries`**: `volatility_score`, `consecutive_stable_refreshes`, `next_check_at`. **On `competitor_sources`**: `verification_count`, `verification_skips_remaining`, `last_price_change_at`.

**`PriceSearchService.search_prices()` signature additions**: `promoted_urls: Optional[Dict[str, str]]`, `force_full_discovery: bool = False`, `skip_verification_urls: Optional[List[str]] = None`.

## Price Monitoring v2.1 (2026-04-26 — Resend email, anomaly override UI, classifier feedback UI)

- Email channel wired via the platform's existing `email-api` edge function (Resend-backed via `RESEND_API_KEY`). Default `alert_channels` for newly-tracked products = `['bell','email']`. Templates seeded into `email_templates` (slugs: `price_alert.price_drop` / `.new_retailer` / `.promo_started` / `.anomaly_detected`, all `category='notification'`). Dispatcher invokes `email-api?action=send` with `templateSlug` + `variables`; passes a fallback `html` so emails still go out if a template is missing or the renderer fails. User email pulled from `user_profiles.email`.
- Anomaly override UI: rows where `is_anomaly=true` render with a yellow left border + an inline banner showing the rejected reading, the trailing 7d median, and (admin only) two buttons:
  - **Trust this reading**: flips the latest anomaly row's `manual_override=true` AND back-fills `competitor_sources.current_price` with the rejected price. Use when the retailer genuinely changed price by >3× (rare but legitimate — clearance sales, wholesaler-to-retail conversion).
  - **Dismiss**: clears `is_anomaly=false` so the banner disappears + the data point joins the median window from the next refresh onward. Use when the reading was a transient bug that's already resolved.
  - Implemented inline in `RetailerTable` ([ProductMonitorTab.tsx](src/components/business/price-monitoring/ProductMonitorTab.tsx)). Uses direct Supabase client writes — no API round-trip needed since these are admin-only writes governed by RLS.
- Classifier correction UI: admin sees a `Wrong match` button (thumbs-down icon) on every classified row. Click prompts for a reason, POSTs to `/api/v1/price-monitoring/classifier-correction` with `corrected_match_kind: 'should_drop'`. The next classify call (5min cache) prepends the most recent corrections as few-shot examples to the system prompt. Service helper at [priceMonitoringApi.ts → submitClassifierCorrection](src/services/priceMonitoringApi.ts).

## Price Monitoring v2 (2026-04-26 — sanity bands, alerts, discrepancies, adaptive discovery)

**Module:** `price-monitoring-notifications` — credit-metered alert dispatcher. Slug must be enabled in `public.modules` for any alert to fire. Channels: bell (0 credits), email (1 credit), webhook (0 credits). Insufficient credits skip the channel silently and log to `price_alert_log.channels_skipped`. 24h dedupe per (alert_type, product/tracked_query, retailer_domain). Webhook URL is per-tracked-query (`tracked_queries.alert_webhook_url`) — internal product flow has no per-product webhook today.

**Sanity band (PR 1):** Every price reading checked against trailing 7d median per (subject, retailer). Outside `[median × 0.33, median × 3.0]` ⇒ row written with `is_anomaly=true` + `anomaly_reason`, `competitor_sources.current_price` NOT overwritten until admin sets `manual_override=true`. UI shows yellow banner with rejected reading + median side by side. Min 3 samples to fire — below that we trust the new reading. See `app/modules/price_monitoring_notifications/service.py:check_sanity`.

**Alerts (PR 1):** Three opt-in types — `price_drop` (median drops ≥10% W/W), `new_retailer` (domain never seen for this product), `promo_started` (`original_price` becomes non-null). `anomaly_detected` always fires regardless of opt-in. Detection runs in the persistence chokepoints — `tracked_queries_service.refresh()` + `price_monitoring_routes./discover` — after rows commit. Fan-out goes through the module dispatcher.

**Discrepancy logging (PR 2a):** `price_discrepancies` table captures cross-source disagreements >20%. Two sites: Firecrawl-vs-Perplexity inside `_verify_hits_with_firecrawl` (Firecrawl wins), and Perplexity-vs-DataForSEO inside `_merge_with_dataforseo` (Perplexity wins, direct page beats feed). `notes` column carries the resolution rationale.

**First-refresh double-read (PR 2b):** `tracked_queries.first_refresh_verified` flag — first refresh of a tracked query runs Firecrawl twice with a 30s gap. Disagreement >5% ⇒ `verified=false` + note "double-read inconsistent". Subsequent refreshes single-read. Internal product flow does NOT double-read (per-source first-refresh tracking would slow `/discover`).

**Adaptive Stage A re-issue (PR 3a):** When initial Perplexity returned ≥1 exact match AND we can extract a SKU from the surviving titles AND query had no SKU anchor, fire ONE additional Perplexity call with the SKU prepended. Capped at one extra call per refresh. ~$0.02/refresh, typically doubles keep rate. See `perplexity_price_search_service.search_prices` step 6.

**Retailer-list memory (PR 3b):** Caller passes `known_retailer_domains` to `search_prices`; the prompt asks for ADDITIONAL retailers beyond that list. Sourced from `competitor_sources` (internal flow) or `tracked_query_price_history` (external flow), capped at 25 retailers in the prompt. Stabilizes the long tail across refreshes.

**Idealo module (PR 4a):** New module `idealo` — DACH/IT/UK/ES/FR price comparison. Same Firecrawl-scrape shape as `greek_marketplaces`. Locales: DE/AT→idealo.de, IT→idealo.it, UK/GB→idealo.co.uk, ES→idealo.es, FR→idealo.fr. Disabled by default; admin enables in `/admin/modules` when ready to spend Firecrawl credits in those markets. Wired into the orchestrator parallel to the Greek marketplaces task.

**Classifier feedback loop (PR 4b):** `match_corrections` table — admin clicks "this is wrong" in the UI (route `POST /api/v1/price-monitoring/classifier-correction`). The next classify call (5min cache) prepends the most recent 5 corrections to the system prompt as few-shot examples. Closes the loop without retraining a model. See `product_identity_service._build_few_shot_block`.

**Flow engine integration:** New action node `send_price_alert` in `supabase/functions/flow-engine/index.ts`. Module-gated. Writes to `user_notifications` + mirrors to `price_alert_log` for parity with the Python dispatcher. Required resolved fields: `user_id`, `alert_type`, `product_id` OR `tracked_query_id`, `title`, `body`. Optional: `action_url`, `retailer_name`, `retailer_domain`, `payload`.

**New / modified DB columns:**
- `price_monitoring_products`: `alert_on_price_drop`, `alert_on_new_retailer`, `alert_on_promo`, `alert_channels`
- `tracked_queries`: same four + `alert_webhook_url`, `first_refresh_verified`
- `price_history` + `tracked_query_price_history`: `is_anomaly`, `anomaly_reason`, `rolling_median_at_check`, `manual_override`
- `competitor_sources`: `source_domain`, `first_seen_at`, `first_refresh_verified`
- New tables: `price_discrepancies`, `match_corrections`, `price_alert_log`

## Price Monitoring (2026-04-25 — Perplexity + DataForSEO discovery → Firecrawl verification)

**Two-stage pipeline on every price refresh:**
1. **Discovery (Stage A)**: Perplexity Sonar-pro + DataForSEO Merchant run in parallel, merged + deduped by domain. Each hit tagged `source: "perplexity" | "dataforseo"`.
2. **Verification (Stage B)**: every discovered URL is re-fetched via Firecrawl (`PriceExtraction` schema, parallel `asyncio.gather`). The live-page price replaces the LLM/feed price and `verified: true` is set. Opt out per-request with `verify_prices: false`.
3. Discrepancy rule: if Stage B price differs from Stage A by >20%, trust Stage B (it read the page) and append a diagnostic to `notes`.
4. On-page was/now: every row carries `original_price` (nullable) — set only when the retailer displays both on the page.

**DB columns added 2026-04-25**: `tracked_queries.verify_prices`, `tracked_query_price_history.{original_price,verified}`, `price_history.{original_price,verified}`, `competitor_sources.{current_original_price,current_price_verified,current_metadata}`. `current_metadata jsonb` carries DataForSEO thumbnail/rating + verification discrepancy notes + `product_title` so the retailer list renders in a single query.

**Product-identity verification (Phase 8, 2026-04-25)** — `app/services/integrations/product_identity_service.py`. Query → Haiku-decomposed facets (cached on `tracked_queries.query_facets`) → URL pre-filter (drops homepages/SERPs/aggregator masquerades before Firecrawl) → expanded Firecrawl extraction (`product_name + breadcrumb + visible_attributes`) → batched Haiku classifier → per-hit `match_kind` in {`exact`, `variant`, `family`, `mismatch`, `unverifiable`}. Policy: `exact + variant + unverifiable` reach the UI; `family + mismatch` dropped. Variants carry `match_note` ("Color differs: BLACK MATT → WHITE MATT") and are excluded from stats but shown in the list. Greek/Latin model normalization (Μ/M, Τ/T) + accent folding live in `product_identity_service.normalize_model_token`. `original_price` sanity rejects `> 5× current_price` (Flobali €11,900 SKU-as-price bug). DB: `match_kind`, `match_score`, `match_note` on `competitor_sources + tracked_query_price_history + price_history`.

**DataForSEO merchant dedupe fix (2026-04-25)**: every DataForSEO Shopping URL has host `google.gr`, so the old `by_domain` dedupe in `_merge_with_dataforseo` collapsed 20+ merchants into 1. Fixed by keying DataForSEO hits on `(retailer_name, product_title[:80])`. Bumped fetch depth to `max(limit, 30)` since Google Shopping routinely has 20-30 merchants per product. Net: ~8× more merchants reach the UI.

**product_title field (2026-04-25)**: every PriceHit now carries the exact product name as shown on the retailer page (DataForSEO feed title or Firecrawl `product_name`). Persisted on `tracked_query_price_history.product_title`, `price_history.product_title`, and `competitor_sources.current_metadata.product_title`. UI renders as subtitle under `retailer_name` so multiple listings from the same retailer (different variants) disambiguate visibly.

**Two parallel flows, one shared discovery+verification engine:**

**Flow 1 — Platform-internal (catalog products, session JWT auth):**
- User enables monitoring on a product → `POST /api/v1/price-monitoring/discover` runs Perplexity Sonar-pro → up to 10 retailer rows written to `competitor_sources` with `source_type='perplexity_web_search'` + snapshots in `price_history`.
- User pastes specific URLs in "Custom Monitoring" → `source_type='firecrawl_url'` via the existing `FirecrawlClient`.
- 6h throttle on Perplexity per product; admin/super_admin `force_refresh=true` bypasses.
- **Single-tier 24h cadence** (2026-04-25): every monitored product refreshes once per day measured from its last refresh. `monitoring_frequency` column is forced to `'daily'`; `update_next_check_time()` ignores the input frequency and always sets `NOW() + INTERVAL '1 day'`. UI dropdown was collapsed to a single "Every 24h" line.
- Cron at `supabase/functions/price-monitoring-cron` — pg_cron `price-monitoring-refresh-hourly` fires at `:15` every hour, queries `get_products_due_for_monitoring()`, refreshes each via MIVAA's `/api/v1/price-monitoring/check-now`. The hourly cron tick is fine-grained — it just picks up any product whose 24h window has elapsed since its last refresh.

**Flow 2 — External API (api_keys Bearer auth, for other projects):**
- `POST /api/v1/prices/track` creates a `tracked_queries` row (search_query, dimensions, country_code, preferred_retailer_domains, refresh_interval_hours 1–720). First refresh runs synchronously; initial results in response.
- `tracked_queries.api_key_id → api_keys.id ON DELETE CASCADE` — deleting the key wipes the tracked query AND all `tracked_query_price_history` (also cascades). Intentional blast radius.
- 6 endpoints at `/api/v1/prices/track/*` (POST / GET list / GET one / GET /{id}/history / PUT / POST /{id}/refresh / DELETE). All route-level api_keys auth.
- **No automated refresh** (2026-04-25 policy change): external consumers control their own refresh cadence. Each tracked query is refreshed only when the consumer calls `POST /api/v1/prices/track/{id}/refresh`. Our internal cron does NOT touch `tracked_queries` — unsolicited refreshes would surprise per-call billing.
- Manual admin endpoint `POST /api/v1/price-monitoring/tracked-queries/cron-refresh` (x-cron-secret auth) still exists in MIVAA as an escape hatch for emergency batch refreshes after a bug fix or data backfill, but is NOT invoked by any cron. The price-monitoring-cron edge function intentionally does NOT call it.

**Engine: Perplexity Sonar-pro** (`app/services/integrations/perplexity_price_search_service.py`):
- Replaced Claude `web_search_20250305` on 2026-04-24 — Claude API's Brave-based snippets missed prices visible on pages (e.g. YouBath €25). Perplexity has deeper page reading + real `user_location` geo support.
- Structured JSON output via `response_format.json_schema`. `user_location.country` biases results. `search_domain_filter` (max 10) used when `preferred_retailer_domains` is set — Option 2 domain pinning.
- ~$0.02/query, ~5-8s latency, typically 6-10 retailers with visible prices for mainstream materials.
- Strong out-of-stock inclusion: pages showing "€25 - Out of stock" (or local-language equivalents like "Εκτός διαθεσιμότητας") are included with `availability=out_of_stock` + the posted price.

**Firecrawl retained for:**
- `POST /api/v1/prices/lookup` with `url` — specific product page scrape (external API)
- "Custom Monitoring" section of the UI — user pastes a URL, Firecrawl tracks it
- Shared client at `app/services/integrations/firecrawl_client.py`, Pydantic `PriceExtraction` model, locale-aware price parser (`price-parser` lib)

**Source type enum** (`competitor_source_type`):
- `firecrawl_url` — user-pasted URL, Firecrawl scrape
- `perplexity_web_search` — auto-discovered via Perplexity Sonar-pro
- `dataforseo_shopping` — auto-discovered via DataForSEO Merchant (Google Shopping feed) — added 2026-04-24, runs in parallel with Perplexity
- `claude_web_search` — deprecated, kept for historical rows

**Tables:**
- `competitor_sources` — internal flow, product_id FK, has denormalized `current_price`/`current_currency`/`current_availability` cache
- `tracked_queries` — external flow, api_key_id FK with CASCADE
- `tracked_query_price_history` — external flow's price history, tracked_query_id FK with CASCADE
- `price_history` — internal flow's history, product_id FK
- `price_lookups` — external `/lookup` usage log
- `ai_usage_logs` — every Perplexity call logged with tokens + cost + platform credits

**Secrets** (required on MIVAA server via deploy.yml `Environment=`):
- `PERPLEXITY_API_KEY` (primary discovery engine) — get from perplexity.ai/settings/api
- `FIRECRAWL_API_KEY` (URL mode + custom monitoring + verification pass on every discovery refresh)
- `DATAFORSEO_BASE64` (or `DATAFORSEO_LOGIN` + `DATAFORSEO_PASSWORD`) — Merchant API credentials, parallel discovery source
- `CRON_SECRET` (validates `x-cron-secret` on cron-refresh endpoint)

**Check Market (admin-only, stateless pricing companion)** — `POST /api/v1/price-monitoring/market-check` runs the same Perplexity+DataForSEO+Firecrawl engine for one-shot market scans used from `PriceLookupDrawer` (the KB-based AI price proposal drawer). Does NOT write to `competitor_sources` or `price_history`. If the product is already enrolled in monitoring and the last refresh is ≤6h old, returns the cached snapshot (`from_monitoring_cache: true`, credits_used=0). Frontend: `MarketPanel` renders min/median/max, verified-count, and a percentile callout ("your KB price sits at the 62nd percentile"). Scoped to admin/super_admin only.

**UI**: `src/components/business/price-monitoring/ProductMonitorTab.tsx` — per-product view: toggle + admin Refresh → chart → discovered retailers (Perplexity) → Custom Monitoring (Firecrawl). Admin role gated via `user_profiles.role_id → roles.name IN ('admin', 'super_admin')`.

**External API docs**: `docs/api/price-monitoring-api.md` — full reference for consumers integrating from other projects.

## FF&E Specification on Quotes
- **New fields on `quote_items`**: `room`, `dimensions`, `installation_requirements`, `delivery_date`
- **QuoteItemsList**: Room column, dimensions appended to product name, expandable detail row (notes + installation + delivery)
- **AddProductsSheet**: FF&E section in custom product form, room field in catalog product selection
- **PDF generation**: Room column in items table, dimensions in product name, "SPECIFICATIONS & DELIVERY" section at bottom
- **Service**: `QuotesService.addItem()`, `addCustomItem()`, `updateItem()` all accept FF&E fields

## Oxygen Pre-Invoice Module (Greek e-Invoicing — 2026-04-22)
Self-contained module under `src/modules/oxygen/` + `supabase/functions/oxygen-create-pre-invoice/` + `supabase/functions/_shared/oxygen/`. Pushes accepted quotes to **oxygen.gr** as **notices (pre-invoices)**, never invoices. See `src/modules/oxygen/README.md`.

- **Single endpoint hit at Oxygen**: `POST /notices` (plus `/contacts` lookup-or-create and `/products` create-if-missing as side effects). We never call `/invoices`.
- **Auth**: `Authorization: Bearer <OXYGEN_API_KEY>` via `_shared/oxygen/client.ts`.
- **Trigger**: admin clicks "Make Pre-Invoice" on a quote where `status='accepted'`. Hard idempotent — once `quotes.oxygen_notice_id` is set, button permanently disabled and edge function early-returns.
- **Customer model**: `quotes.customer_company_id` (B2B → `crm_companies`, type=2) OR `quotes.customer_contact_id` (private/B2C → `crm_contacts`, type=1). XOR check enforces at most one. `quotes.user_id` is the operator/designer, NOT the bill-to.
- **Customer create-if-missing**: lookup by `vat_number` (companies) or `email` (private), then `POST /contacts` if not found. Result cached on our side as `crm_*.oxygen_contact_id`.
- **Product create-if-missing**: same pattern, cached as `products.oxygen_product_id`.
- **Single warehouse**: `OXYGEN_DEFAULT_WAREHOUSE_ID` secret, no per-product column.
- **DB columns added**: `crm_contacts.{first_name,last_name,contact_type,vat_number,tax_office,profession,is_client,country_code,street,street_number,oxygen_contact_id}`; `crm_companies.{tax_office,profession,country_code,street,street_number,oxygen_contact_id}`; `quotes.{customer_contact_id,customer_company_id,oxygen_notice_id,oxygen_contact_id,oxygen_sync_status,oxygen_last_sync_at,oxygen_sync_error}`; `products.{sku,oxygen_product_id,oxygen_tax_id}`.
- **Required Edge secrets**: `OXYGEN_API_KEY`, `OXYGEN_API_BASE_URL` (optional, defaults to `https://api.oxygen.gr/v1`), `OXYGEN_DEFAULT_TAX_ID_24`, `OXYGEN_DEFAULT_WAREHOUSE_ID`.
- **Mount point**: single `<OxygenPreInvoiceButton />` in `src/modules/quotes/pages/QuoteDetailAdminPage.tsx`. Removable by deleting the module folders + that one import.

## Manufacturer Analytics (Enhanced)
- **Tracking service**: `src/services/manufacturerAnalyticsService.ts` — batched fire-and-forget event tracking (flush every 5s or 20 events)
- **Events**: `product_view`, `product_save`, `product_quote`, `product_search_impression`, `product_search_click`, `product_compare`
- **DB table**: `manufacturer_analytics_events` with indexes on event_type, product_id, manufacturer_id, user_id, created_at
- **ProductCard**: IntersectionObserver tracks views when card is 50% visible
- **AddToQuoteButton/AddToMoodboardButton**: Track quote/save events on success
- **Factory Analytics Dashboard**: Enhanced with Geographic Demand, Designer Engagement by Profession, Competitive Positioning sections
- **Tiered access**: `MyFactoryTab` accepts `tier` prop ('free'|'pro'|'enterprise'). Geographic/designer/competitive sections gated behind Pro.

## AR Material Preview (Plan 8)
- **Components**: `src/components/features/ar/` — ARPreviewModal, ViewInARButton, ARPage, useARSupport
- **Edge function**: `generate-pbr-maps/index.ts` — generates PBR texture maps (albedo, normal, roughness, metalness) via Replicate API
- **AR detection**: `useARSupport()` returns 'webxr' | 'quicklook' | 'desktop' | 'none'
- **Route**: `/ar/:productId` — standalone AR page for QR handoff from desktop
- **Integration**: ProductCard shows "AR View" button, opens ARPreviewModal (3D material swatch viewer)
- **Future**: @react-three/xr for full WebXR on Android, @google/model-viewer for iOS USDZ Quick Look
- **Credits**: 8 credits per PBR map generation, AR viewing is free

## Lighting Simulation (Plan 10)
- **Layer 1 (AI)**: "Lighting Variants" dropdown on ProgressiveImageGrid — generates same room under 6 lighting presets via Gemini edit
- **Layer 2 (3D)**: `src/components/features/lighting/` — MaterialLightingViewer, LightingPreviewModal, lightingPresets, useSunPosition
- **Presets**: Natural Daylight, Golden Hour, Overcast, Showroom Spots, Warm Evening, Night
- **Controls**: Preset selector, time-of-day slider (6AM-9PM), room orientation (N/E/S/W), surface type (wall/floor/column/curved)
- **PBR**: Uses MeshPhysicalMaterial with albedo + normal + roughness + metalness maps from SVBRDF or generate-pbr-maps
- **Integration**: ProductCard shows "Lighting" button, opens LightingPreviewModal
- **Sun calculation**: Built-in simplified solar position (no suncalc dependency) — altitude peaks at noon, color temp shifts warm↔cool

## Pinterest Integration (Plan 9)
- **Service**: `src/services/pinterestService.ts` — extractPin, importPin, importPinsBulk, OAuth board browsing
- **Modal**: `src/components/business/moodboard/PinterestImportModal.tsx` — single URL, bulk URL, and OAuth board browser
- **Edge functions**: `pinterest-import/index.ts` (oEmbed extraction + import), `pinterest-oauth/index.ts` (OAuth + board/pin API proxy)
- **Integration**: "Import from Pinterest" button on MoodBoardDetailPage header
- **Auto-matching**: Imported pin images run through MIVAA visual search to suggest matching catalog products
- **OAuth tokens**: Stored in `social_accounts` table (platform='pinterest'), auto-refresh on expiry
- **Phase 1 (no OAuth)**: Paste pin URL → oEmbed extraction → import image → AI match
- **Phase 2 (OAuth)**: Connect account → browse boards → select pins → bulk import
- **Env vars**: `PINTEREST_APP_ID`, `PINTEREST_APP_SECRET`, `PINTEREST_REDIRECT_URI`

## Design Inspiration URL Finder
- **Tool**: `analyze_inspiration_url` in `_shared/tools/search-tools.ts` — available to all users (KAI + Interior Designer agents)
- **Pipeline**: Firecrawl scrape URL → Claude Haiku extracts design tokens (colors, hex codes, materials, textures, styles, room type) → MIVAA 7-vector search for matching products
- **Frontend modal**: `InspirationUrlModal.tsx` — Globe icon button in chat toolbar, all agents
- **Frontend card**: `InspirationCard.tsx` — renders extracted palette swatches, material/style tags, hero image, source link
- **Chunk type**: `inspiration_analysis` emitted via onChunk during tool execution
- **Credit cost**: 1 credit (Firecrawl scrape) + Haiku token cost
- **Shared utility**: `_shared/utils/web-scraper.ts` — reusable `scrapeUrl()` extracted from b2b-tools

## Explainable Search Spec
- **Schema extension**: `material_search` tool now accepts optional `search_spec` object (intent, color_keywords, color_hex, material_types, style_keywords, texture_finish, specifications)
- **LLM-generated**: The agent fills in the spec as part of its tool call — no extra LLM call needed
- **Chunk type**: `search_spec` emitted via onChunk, stored as `pendingSearchSpec`, attached to assistant message
- **Frontend card**: `SearchSpecCard.tsx` — collapsible panel above product results showing color swatches, material/style tags, spec details
- **Persistence**: Saved to `searchSpec` field in message metadata, restored on conversation reload

## Virtual Staging Before/After QA
- **Component**: `VirtualStagingViewer.tsx` — replaces old static image display for virtual staging results
- **Before/After slider**: CSS clip-path based, pointer-drag interaction, no external dependency
- **Source image**: `source_image_url` now included in `virtualStagingData` (from both edge function chunk and frontend direct call)
- **Quality analysis**: "Analyze Quality" button sends both images to KAI for Claude Vision assessment (lighting, perspective, scale, materials, edge blending — scored 1-10)
- **Toggle**: "Before / After" button shows/hides the comparison slider

## Design System Summary
Full reference: `.claude/design-system.md`
- **Theme**: Dark mode. **Background**: near black (`--background: 0 0% 7%`). **Foreground**: light (`--foreground: 0 0% 92%`).
- **Primary**: brightened plum (`--primary: 330 50% 35%`). **Accent**: dark warm (`--accent: 22 60% 18%`).
- **Navigation**: Horizontal top nav bar (h-14), not sidebar. Logo left, nav center, profile right. Admin accessed via `/admin` page boxes.
- **Font**: Open Sans. `font-bold` → 300, `font-semibold/medium` → 400 globally. Headings are light weight by design.
- **Glass cards**: `.dashboard-card` class (rgba white 0.05 + blur 12px on dark). Never recreate inline.
- **Tabs active**: TabsList: `w-full h-auto flex-wrap justify-start gap-2 bg-transparent p-0`. TabsTrigger: `flex items-center gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground`. **NEVER add `rounded-full` to TabsTrigger** — that is only for Buttons.
- **Tables**: `<CardContent className="p-0">`, no wrapper div, no fixed column widths.
- **Buttons**: all pill-shaped (`rounded-full`). Variants: default (plum), outline, secondary, ghost, destructive, link.
