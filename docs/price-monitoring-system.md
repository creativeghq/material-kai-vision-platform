# Price Monitoring System

> **Schema consolidated 2026-05-01.** Internal product monitoring + external API tracked queries now share a single subject table (`tracked_queries`) and a single history table (`tracked_query_price_history`). The legacy tables (`competitor_sources`, `price_history`, `price_monitoring_products`, `product_excluded_urls`) and the legacy edge function `price-monitoring` are gone. See [CLAUDE.md → Price Monitoring](../CLAUDE.md) for the canonical reference.

## Overview

Material KAI Vision Platform users (Factory + Store + admins) can enroll a catalog product into price monitoring. The platform discovers retailers selling that product, verifies the live price, classifies the result against the catalog identity, persists the rows for trend tracking, and dispatches alerts when meaningful change is observed.

The exact same engine serves external API consumers via `POST /api/v1/prices/track/...`. The only difference is **who owns the row**: internal rows have `api_key_id IS NULL` + `product_id NOT NULL`; external rows have `api_key_id IS NOT NULL` + `product_id IS NULL`.

## Pipeline

Every refresh runs:

1. **Discovery (parallel)** — Perplexity Sonar + DataForSEO Merchant + (when enabled) Greek marketplaces (Skroutz, Bestprice, Shopflix) + Idealo (DACH/IT/UK/ES/FR). Hits merged + deduped.
2. **URL pre-filter** — drops homepages, SERPs, aggregator masquerades before Firecrawl spend.
3. **Sticky promotion overrides** — pre-loaded from `tracked_query_promoted_urls`; their classifier verdict is short-circuited to the admin's choice.
4. **Firecrawl verification** — re-fetches each retailer URL, extracts `price + product_name + breadcrumb + visible_attributes`. Live-page price replaces LLM/feed price; sets `verified: true`.
5. **Sanity-band check** — rolling 7d median per (tracked_query, retailer). Outside `[median × 0.33, median × 3.0]` → `is_anomaly: true`, `anomaly_reason` set, denormalized `current_price` NOT overwritten until admin clicks "Trust this reading".
6. **Identity classifier (Haiku 4.5)** — labels each hit `exact / variant / family / mismatch / unverifiable`. `mismatch` dropped; `family` kept inert (rendered under "Similar Products in this series" in the UI, never feeds chart/median/alerts).
7. **Persistence** — one row per retailer in `tracked_query_price_history`, plus the cheapest non-anomaly verified hit goes into `tracked_queries.current_*` cache columns.
8. **Alerts** — module-gated dispatcher fires bell/email/webhook for `price_drop`, `new_retailer`, `promo_started`, `anomaly_detected` based on `tracked_queries.alert_on_*` opt-ins.
9. **Cadence** — `update_tracked_query_cadence` bumps `next_check_at` based on observed volatility (24h / 48h / 72h).

## Database Schema

### `tracked_queries` (single subject table)

Routing:
- `api_key_id IS NULL AND product_id IS NOT NULL AND mode = 'discovery'` → internal product
- `api_key_id IS NULL AND product_id IS NOT NULL AND mode = 'url-only'` → "Custom Monitoring" pinned URL (Firecrawl-only, no Perplexity)
- `api_key_id IS NOT NULL AND product_id IS NULL` → external API tracked query

Enforced by a `CHECK (api_key_id XOR product_id)` constraint. The partial unique index `uniq_tracked_queries_internal_product_discovery` allows at most one `mode='discovery'` row per product but unlimited `mode='url-only'` siblings.

Key columns:
- Identity: `id`, `product_id`, `api_key_id`, `user_id`, `workspace_id`, `search_query`, `dimensions`, `country_code`, `manufacturer`, `mode`, `pinned_url`, `query_facets`
- Cadence + activity: `is_active`, `refresh_interval_hours`, `last_refreshed_at`, `next_check_at`, `volatility_score`, `consecutive_stable_refreshes`, `first_refresh_verified`
- Cache (cheapest verified hit): `current_price`, `current_currency`, `current_availability`, `current_original_price`, `current_price_verified`, `current_metadata`, `current_price_updated_at`
- Alerts: `alert_on_price_drop`, `alert_on_new_retailer`, `alert_on_promo`, `alert_channels`, `alert_webhook_url`
- Cost tracking: `last_refresh_credits_used`, `total_credits_used`, `last_error`, `verify_prices`

### `tracked_query_price_history` (every retailer row, every refresh)

Columns include `tracked_query_id` (FK), `refresh_run_id`, `retailer_name`, `product_url`, `price`, `original_price`, `currency`, `availability`, `source` (enum: `perplexity` / `dataforseo` / `skroutz` / `bestprice` / `shopflix` / `idealo`), `verified`, `match_kind`, `match_score`, `match_note`, `product_title`, `is_anomaly`, `anomaly_reason`, `rolling_median_at_check`, `manual_override`, `scraped_at`.

### Supporting tables

- `tracked_query_promoted_urls` — sticky admin URL overrides (per tracked_query)
- `tracked_query_excluded_urls` — per-tracked-query URL/domain exclusions
- `match_corrections` — admin classifier-feedback few-shot pool
- `classifier_verdict_cache` — 7-day TTL Haiku verdict cache
- `brand_retailer_index` — `(brand, retailer_domain, country_code)` cache that seeds `known_retailer_domains` for new SKUs in the same brand
- `retailer_extraction_recipes` — per-retailer selector recipes with self-heal stats (httpx fallback before Firecrawl when confidence ≥ 0.8)
- `price_alert_log` — alert audit + dedupe
- `price_discrepancies` — cross-source disagreement log
- `price_lookups` — external `/lookup` usage log
- `ai_usage_logs` — every Perplexity / Haiku / Firecrawl / DataForSEO call

### Database functions

- `get_internal_tracked_queries_due()` — cron-target SELECT (returns up to 100 internal rows whose `next_check_at` has elapsed)
- `update_tracked_query_cadence(p_tracked_query_id, p_max_pct_change)` — bumps `next_check_at` and `consecutive_stable_refreshes` after each refresh

### Row Level Security

All tables have RLS enabled. Users see their own rows (matched on `user_id` for internal, `api_key_id` ownership for external). Admin/Owner see everything via `has_price_monitoring_access()` or role-name checks. The Python backend writes via the service role.

## Backend

### Routes — `mivaa-pdf-extractor/app/api/price_monitoring_routes.py`

Product-scoped (preferred surface):

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/products/{product_id}/track` | Get-or-create internal tracked_query + run first refresh |
| `DELETE` | `/products/{product_id}/track` | Soft delete (deactivate, history preserved) |
| `GET` | `/products/{product_id}` | Read summary row (denormalized cache included) |
| `POST` | `/products/{product_id}/refresh` | Re-run discovery (auto-enrolls). `force_refresh` requires admin. |
| `GET` | `/products/{product_id}/sources` | `{results, family_results, tracked_query_id}` from latest refresh |
| `GET` | `/products/{product_id}/history` | Historical rows newest-first |
| `POST` | `/products/{product_id}/exclude` | Exclude URL/domain |
| `POST` | `/products/{product_id}/include` | Undo exclusion |
| `GET` | `/products/{product_id}/exclusions` | List exclusions |
| `POST` | `/products/{product_id}/verify` | Re-verify URLs (Firecrawl only — no new discovery) |
| `POST` | `/products/{product_id}/url-only` | Add a pinned URL (mode='url-only' tracked_query) |
| `GET` | `/products/{product_id}/url-only` | List pinned URLs |

Cross-flow (also serve external API consumers):

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/market-check` | Stateless one-shot market scan (admin-only) |
| `POST` | `/classifier-correction` | Feed few-shot classifier loop |
| `POST` | `/promote-family-row` | Sticky admin override (admin-only) |
| `POST` | `/demote-to-family` | Undo promotion (admin-only) |
| `POST` | `/tracked-queries/cron-refresh` | Admin batch-refresh escape hatch |
| `POST` | `/broadcast-api-announcement` | Admin email broadcast |

Legacy aliases (`/start`, `/stop`, `/check-now`, `/discover`, `/sources/{id}`, `/history/{id}`, `/status/{id}`) are kept short-term and marked deprecated. New callers should use the product-scoped surface.

### Service — `mivaa-pdf-extractor/app/services/integrations/tracked_queries_service.py`

Single chokepoint for both flows. Methods of interest:

- `find_or_create_for_product(...)` — internal flow get-or-create + first refresh
- `find_for_product(product_id)` — read internal row
- `list_internal(...)` — admin dashboard product list
- `add_url_only(...)` / `list_url_only_for_product(...)` — Custom Monitoring
- `refresh(tracking_id, force=...)` — single shared refresh path; populates the denormalized cache via `_select_cheapest()`
- `latest_results_split(tracking_id)` → `{results, family_results}`
- `history(tracking_id, limit)` — historical rows
- `add_exclusion(...)` / `remove_exclusion(...)` / `list_exclusions(...)`
- `reverify(tracking_id, urls?)` — Firecrawl-only re-verify
- `due_for_refresh(limit)` — used by the manual cron-refresh escape hatch

### Edge Function — `supabase/functions/price-monitoring-cron/index.ts`

Hourly. Calls `get_internal_tracked_queries_due()` then POSTs `/products/{id}/refresh` for each row. Service-role auth. Does NOT touch external API tracked queries. See [docs/api/price-monitoring-cron-api.md](api/price-monitoring-cron-api.md).

## Cost Optimizations (apply to BOTH flows after consolidation)

- **Tier-skip** — `search_prices()` runs Tier 2 (Greek + Idealo) only when `force_full_discovery=True` or `len(known_retailer_domains) < 5`.
- **Sonar model downgrade** — Perplexity drops to `sonar` (cheaper) when `force_full_discovery=False`, `known_retailer_domains >= 3`, and `double_read=False`.
- **Classifier verdict cache** — 7-day TTL keyed on `(product_url, sha1(brand|model|sku_tokens|product_type))`.
- **Rule-based pre-classifier** — deterministic `exact`/`mismatch` shortcuts before Haiku.
- **Volatility cadence** — `next_check_at` stretches 24h → 48h → 72h on stable products.
- **Brand-level retailer cache** — `brand_retailer_index` seeds `known_retailer_domains` for new SKUs in the same brand.
- **Recipe-driven httpx fallback** — `retailer_extraction_recipes` with confidence ≥ 0.8 try `httpx + selectolax` before Firecrawl.

## Frontend

- [src/services/priceMonitoringApi.ts](../src/services/priceMonitoringApi.ts) — single client. Exports `TrackedQuery`, `RetailerRow`, `MatchKind`, and helpers (`trackProduct`, `untrackProduct`, `getProductMonitoring`, `refreshProduct`, `getProductSources`, `getProductHistory`, `verifyProductSources`, `addUrlOnly`, `listUrlOnlyForProduct`, `marketCheck`, `submitClassifierCorrection`, `promoteFamilyRow`, `demoteToFamily`, `excludeProductResult`, `includeProductResult`, `listProductExclusions`).
- [src/components/business/price-monitoring/PriceMonitoringDashboard.tsx](../src/components/business/price-monitoring/PriceMonitoringDashboard.tsx) — KPI cards + product list (queries `tracked_queries` directly with `api_key_id IS NULL` filter).
- [src/components/business/price-monitoring/MonitoredProductsList.tsx](../src/components/business/price-monitoring/MonitoredProductsList.tsx) — table with toggle/refresh per row.
- [src/components/business/price-monitoring/ProductMonitorTab.tsx](../src/components/business/price-monitoring/ProductMonitorTab.tsx) — per-product detail (chart, retailer table with anomaly banners, exclusions, custom URLs, alert prefs).
- [src/components/business/price-monitoring/PriceHistoryChart.tsx](../src/components/business/price-monitoring/PriceHistoryChart.tsx) — chart over `tracked_query_price_history` filtered by tracked_query_id.
- [src/components/business/price-monitoring/PriceAlertPreferences.tsx](../src/components/business/price-monitoring/PriceAlertPreferences.tsx) — module-gated alert opt-in, writes to `tracked_queries.alert_*`.
- [src/components/business/price-monitoring/CompetitorSourceManager.tsx](../src/components/business/price-monitoring/CompetitorSourceManager.tsx) — Custom Monitoring add-URL dialog (calls `addUrlOnly`).
- [src/components/features/pricing/MarketPanel.tsx](../src/components/features/pricing/MarketPanel.tsx) + `PriceLookupDrawer` — admin one-shot market scan UI.

## User Roles and Access

- **Factory / Store users** — monitor their own products, configure alerts, view history.
- **Admin / Owner** — see everything, force-refresh, promote/demote family rows, override anomaly readings, market-check.
- **Architect / Designer** — no access; UI is hidden.

## Required Secrets (MIVAA backend)

- `PERPLEXITY_API_KEY` — primary discovery
- `FIRECRAWL_API_KEY` — verification + Custom Monitoring
- `DATAFORSEO_BASE64` (or `DATAFORSEO_LOGIN` + `DATAFORSEO_PASSWORD`) — Google Shopping merchant feed
- `ANTHROPIC_API_KEY` — Haiku identity classifier + facet extraction
- `RESEND_API_KEY` — email channel for alerts
- `CRON_SECRET` — cron-refresh authentication

## Deployment

1. **Database migrations** — `supabase db push` (or apply via `mcp__supabase__apply_migration`). The 2026-05-01 consolidation migration is `consolidate_price_monitoring_into_tracked_queries`.
2. **Edge function** — `supabase functions deploy price-monitoring-cron`.
3. **Cron schedule** — see [docs/api/price-monitoring-cron-api.md](api/price-monitoring-cron-api.md).
4. **Backend secrets** — set on the MIVAA `systemd` unit's `Environment=` lines.

## Related

- [CLAUDE.md → Price Monitoring](../CLAUDE.md)
- [Price Monitoring API (external consumers)](api/price-monitoring-api.md)
- [Cron API](api/price-monitoring-cron-api.md)
- Edge function: the price-monitoring cron was consolidated into `supabase/functions/monitoring-cron`.
- [CHANGELOG](../CHANGELOG.md)

---

# Version history (extracted from CLAUDE.md 2026-07-29)

## Price Monitoring (consolidated 2026-05-01 — `tracked_queries` is the single subject table)

The internal product flow (was `competitor_sources` / `price_history` / `price_monitoring_products`) and the external API flow (was `tracked_queries` / `tracked_query_price_history`) now share **one** schema. Every monitored subject — catalog product or external partner query — is a `tracked_queries` row, distinguished by:

- `api_key_id IS NULL AND product_id IS NOT NULL AND mode = 'discovery'` → internal product
- `api_key_id IS NULL AND product_id IS NOT NULL AND mode = 'url-only'` → "Custom Monitoring" pinned URL (Firecrawl-only, no Perplexity discovery)
- `api_key_id IS NOT NULL AND product_id IS NULL` → external API tracked query

A `CHECK (api_key_id XOR product_id)` constraint enforces routing. `uniq_tracked_queries_internal_product_discovery` partial index allows at most one `mode='discovery'` row per product but unlimited `mode='url-only'` siblings.

**All retailer rows live in `tracked_query_price_history`** (FK to `tracked_queries.id`). The legacy `competitor_sources` / `price_history` / `price_monitoring_products` / `product_excluded_urls` tables and their helper functions (`get_products_due_for_monitoring`, `update_next_check_time`, `prune_stale_competitor_sources`) were dropped 2026-05-01.

**Denormalized cache on `tracked_queries`** (populated by every refresh, replaces the old `competitor_sources.current_*` cache): `current_price`, `current_currency`, `current_availability`, `current_original_price`, `current_price_verified`, `current_metadata jsonb`, `current_price_updated_at`. Cheapest non-anomaly verified hit wins. Lets summary cards / KPI counters read one row instead of joining history.

**Backend surface** ([mivaa-pdf-extractor/app/api/price_monitoring_routes.py](mivaa-pdf-extractor/app/api/price_monitoring_routes.py)):

- `POST /api/v1/price-monitoring/products/{id}/track` — get-or-create internal tracked_query + run first refresh
- `DELETE /api/v1/price-monitoring/products/{id}/track` — soft delete (deactivate, history preserved)
- `GET /api/v1/price-monitoring/products/{id}` — read summary row
- `POST /api/v1/price-monitoring/products/{id}/refresh` — re-run discovery (auto-enrolls on first call). `force_refresh=true` requires admin (bypasses volatility cadence).
- `GET /api/v1/price-monitoring/products/{id}/sources` — `{results, family_results}` from latest refresh
- `GET /api/v1/price-monitoring/products/{id}/history` — historical rows newest-first
- `POST /api/v1/price-monitoring/products/{id}/exclude` / `/include` / `/exclusions` — translates product → tracked_query then writes `tracked_query_excluded_urls`
- `POST /api/v1/price-monitoring/products/{id}/verify` — re-verify URLs (Firecrawl only)
- `POST /api/v1/price-monitoring/products/{id}/url-only` / `GET ...` — pinned URLs (mode='url-only' tracked_queries)
- Cross-flow: `/market-check`, `/classifier-correction`, `/promote-family-row`, `/demote-to-family`, `/tracked-queries/cron-refresh`, `/broadcast-api-announcement`
- Legacy aliases (`/start`, `/stop`, `/check-now`, `/discover`, `/sources/{id}`, `/history/{id}`, `/status/{id}`) kept short-term, marked deprecated.

**Internal cron** ([supabase/functions/price-monitoring-cron/index.ts](supabase/functions/price-monitoring-cron/index.ts)): every hour calls `get_internal_tracked_queries_due()` (RPC) which returns rows where `api_key_id IS NULL AND product_id IS NOT NULL AND next_check_at < now()`, then POSTs to `/products/{id}/refresh` for each. External API consumers (`api_key_id IS NOT NULL`) are intentionally NOT touched — they pay per call and control their own cadence.

**Service entry points** ([mivaa-pdf-extractor/app/services/integrations/tracked_queries_service.py](mivaa-pdf-extractor/app/services/integrations/tracked_queries_service.py)):

- `find_or_create_for_product()` — internal flow get-or-create + optional first refresh
- `find_for_product()`, `list_internal()`, `list_url_only_for_product()`
- `add_url_only()` — creates a mode='url-only' tracked_query with `pinned_url`
- `refresh()` — single chokepoint for both flows. After every refresh, populates the denormalized `current_*` cache via `_select_cheapest()`.

**Cost optimizations apply to BOTH flows** (the duplication that motivated this consolidation): `force_full_discovery` flag (Tier-skip), brand-retailer cache seeding, sonar/sonar-pro model selection, classifier verdict cache, rule-based pre-classifier, volatility-based `next_check_at` cadence, recipe-driven httpx fallback. Internal product refreshes inherit all of these for free now.

**Notification dispatcher** ([mivaa-pdf-extractor/app/modules/price_monitoring_notifications/service.py](mivaa-pdf-extractor/app/modules/price_monitoring_notifications/service.py)): now `tracked_query_id`-only. The dispatcher resolves `(user_id, product_id)` from `tracked_queries` so alerts still carry product_id when internal-flow.

**Frontend**:

- [src/services/priceMonitoringApi.ts](src/services/priceMonitoringApi.ts) — single client. Exports `TrackedQuery` + `RetailerRow` types, product-scoped helpers (`trackProduct`, `untrackProduct`, `getProductMonitoring`, `refreshProduct`, `getProductSources`, `getProductHistory`, `verifyProductSources`, `addUrlOnly`, `listUrlOnlyForProduct`), exclusion helpers, classifier feedback, market-check, promote/demote.
- [src/components/business/price-monitoring/PriceMonitoringDashboard.tsx](src/components/business/price-monitoring/PriceMonitoringDashboard.tsx) reads from `tracked_queries` directly (api_key_id IS NULL filter).
- [src/components/business/price-monitoring/ProductMonitorTab.tsx](src/components/business/price-monitoring/ProductMonitorTab.tsx) wires through the new client. Internally adapts `RetailerRow` → the legacy `CompetitorSource` shape so the existing render code (badges, anomaly banner, retailer table) stays intact.
- Anomaly Trust/Dismiss buttons write directly to `tracked_query_price_history` via supabase client (admin-only via RLS).

**Tables that survived the consolidation** (still in use):

- `tracked_queries` (subject) + `tracked_query_price_history` (rows)
- `tracked_query_promoted_urls` (sticky admin overrides) + `tracked_query_excluded_urls`
- `match_corrections` (classifier few-shot feedback)
- `classifier_verdict_cache` (7-day TTL)
- `brand_retailer_index` (retailer cache by brand + country)
- `retailer_extraction_recipes` (per-retailer selectors with self-heal)
- `price_alert_log` (alert audit + dedupe)
- `price_discrepancies` (cross-source disagreement log)
- `price_lookups` (external `/lookup` usage)

---

## Price Monitoring v3 (2026-04-27 — family-kept, manual promotion, cost overhaul) — historical, superseded by 2026-05-01 consolidation

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

**Product-identity verification (Phase 8, 2026-04-25)** — `app/services/integrations/product_identity_service.py`. Query → Haiku-decomposed facets (cached on `tracked_queries.query_facets`) → URL pre-filter (drops homepages/SERPs/aggregator masquerades before Firecrawl) → expanded Firecrawl extraction (`product_name + breadcrumb + visible_attributes`) → batched Haiku classifier → per-hit `match_kind` in {`exact`, `variant`, `family`, `mismatch`, `unverifiable`}. Policy: `exact + variant + unverifiable` reach the UI; `family + mismatch` dropped. Variants carry `match_note` ("Color differs: BLACK MATT → WHITE MATT") and are excluded from stats but shown in the list. Greek/Latin model normalization (Μ/M, Τ/T) + accent folding live in `product_identity_service.normalize_model_token`. `original_price` sanity rejects `> 5× current_price` (caught a SKU-as-price extraction bug where the SKU number was being parsed as the original_price field). DB: `match_kind`, `match_score`, `match_note` on `competitor_sources + tracked_query_price_history + price_history`.

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

