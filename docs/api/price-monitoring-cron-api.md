# Price Monitoring Cron API

## Overview

Hourly Edge Function that refreshes every internal-flow `tracked_queries` row whose `next_check_at` has elapsed. After the 2026-05-01 consolidation, every monitored catalog product is a `tracked_queries` row (`api_key_id IS NULL` + `product_id NOT NULL`) — the legacy `competitor_sources` / `price_history` / `price_monitoring_products` tables and the `check-now` / `tracked-queries/cron-refresh` endpoints are gone.

External API consumers (`api_key_id IS NOT NULL`) are intentionally NOT touched by this cron — they pay per call and control their own refresh cadence by hitting `POST /api/v1/prices/track/{id}/refresh` themselves.

**Edge Function:** `price-monitoring-cron`
**Trigger:** scheduled (hourly) or manual invocation
**Backend endpoint used:** `POST /api/v1/price-monitoring/products/{product_id}/refresh` (one call per due row)

## Architecture

```
Supabase Cron (hourly)
  ↓
Edge Function (price-monitoring-cron)
  ├─→ DB RPC: get_internal_tracked_queries_due()
  │     (Returns rows where api_key_id IS NULL AND product_id IS NOT NULL
  │      AND is_active AND (next_check_at IS NULL OR next_check_at < now()),
  │      ordered by oldest next_check_at first, capped at 100.)
  │
  └─→ For each row → Python: POST /api/v1/price-monitoring/products/{id}/refresh
        (TrackedQueriesService.refresh() — full pipeline)
            ├─→ Facet cache read (tracked_queries.query_facets)
            ├─→ Perplexity Sonar (sonar/sonar-pro depending on cost gates)
            │   + DataForSEO Merchant (parallel) + optional Greek/Idealo
            ├─→ Excluded URL filter (tracked_query_excluded_urls)
            ├─→ Sticky promotion overrides (tracked_query_promoted_urls)
            ├─→ URL pre-filter (drops homepages/SERPs/aggregator masquerades)
            ├─→ Firecrawl verification (price + product_name + breadcrumb)
            ├─→ Haiku 4.5 identity classifier (match_kind per hit)
            ├─→ Sanity-band check (rolling 7d median per retailer)
            ├─→ tracked_query_price_history insert (one row per retailer)
            ├─→ tracked_queries cache columns updated (current_price, etc.)
            └─→ update_tracked_query_cadence() bumps next_check_at based on
                  observed volatility (≥5% move → 24h; ≤2% → 48h/72h)
```

## Authentication

Cron secret header required:

```
X-Cron-Secret: <CRON_SECRET>
```

Must match the `CRON_SECRET` environment variable on the edge function.

## Manual Invocation

```bash
curl -X POST https://your-project.supabase.co/functions/v1/price-monitoring-cron \
  -H "x-cron-secret: your-cron-secret" \
  -H "Content-Type: application/json"
```

**Response:**

```typescript
{
  success: true,
  message: string,
  stats: {
    internal: {
      total: number,        // rows returned by get_internal_tracked_queries_due
      processed: number,    // rows actually refreshed
      succeeded: number,    // refreshes that wrote new history rows
      failed: number,       // refreshes that errored or were throttled
      results: Array<{
        product_id: string,
        success: boolean,
        credits_used?: number,
        results_count?: number,
        status?: string,
        error?: string,
      }>,
    }
  },
  timestamp: string
}
```

## How It Works

### 1. Pick due tracked_queries

Calls `get_internal_tracked_queries_due()` (SQL function). Returns at most 100 rows, oldest `next_check_at` first.

### 2. Refresh each row

For each row, POSTs to `/api/v1/price-monitoring/products/{product_id}/refresh` with body `{force_refresh: false, verify_prices: true}`. The Python backend handles the entire discovery + verification + classifier + persistence pipeline, plus credit debit + AI usage logging.

### 3. Cadence is automatic

The Python backend calls `update_tracked_query_cadence(p_tracked_query_id, p_max_pct_change)` after every refresh. The cadence is volatility-aware:

- ≥ 5% week-over-week move → `next_check_at = now() + 24h` and `consecutive_stable_refreshes = 0`
- ≤ 2% move → `consecutive_stable_refreshes += 1` and cadence stretches:
  - 3+ stable refreshes → 48h
  - 7+ stable refreshes → 72h

The hourly cron tick is fine-grained — it just picks up rows whose `next_check_at` has elapsed.

## Alerts

Alert detection runs inside `TrackedQueriesService.refresh()` via the `price-monitoring-notifications` module (separate dispatcher). Alert prefs live on `tracked_queries.alert_on_*` columns and `alert_channels` (`bell` / `email` / `webhook`). See [docs/api/price-monitoring-api.md](./price-monitoring-api.md) for the full alert reference.

## Database Tables Touched

After a successful cron tick:

- `tracked_queries` — `last_refreshed_at`, `last_refresh_credits_used`, `total_credits_used`, `last_error`, `current_price`, `current_currency`, `current_availability`, `current_original_price`, `current_price_verified`, `current_metadata`, `current_price_updated_at`, `next_check_at`, `consecutive_stable_refreshes`, `volatility_score`, `first_refresh_verified`
- `tracked_query_price_history` — one new row per retailer per refresh
- `brand_retailer_index` — upserted per `(brand, retailer_domain, country_code)` triple seen
- `classifier_verdict_cache` — populated for new (URL, facet-signature) pairs
- `price_alert_log` — one row per alert dispatched (24h dedupe per alert_type/retailer)
- `ai_usage_logs` — one row per Perplexity / Haiku / Firecrawl call

## Error Handling

```typescript
{
  success: false,
  error: string,
  timestamp: string
}
```

Per-row errors are caught and logged inline; the cron never aborts mid-batch. A failed row stays at its current `next_check_at` so the next tick will retry it.

**Common HTTP responses from this endpoint:**

- `401` — invalid or missing `x-cron-secret`
- `500` — top-level fetch from `get_internal_tracked_queries_due` failed (check Postgres logs)

## Logs

Supabase Dashboard → Edge Functions → `price-monitoring-cron` → Logs.

```
🔄 Price monitoring cron job started
📊 Found 10 internal tracked_queries due
✅ Internal monitoring completed: 10 processed, 8 succeeded, 2 failed
```

## Related Documentation

- [Price Monitoring API](./price-monitoring-api.md)
- [Edge Function README](../../supabase/functions/price-monitoring-cron/README.md)
- [Internal Pricing & Credit System](../internal-pricing-credit-system.md)
