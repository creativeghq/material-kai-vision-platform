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
- [Edge Function README](../supabase/functions/price-monitoring-cron/README.md)
- [CHANGELOG](../CHANGELOG.md)
