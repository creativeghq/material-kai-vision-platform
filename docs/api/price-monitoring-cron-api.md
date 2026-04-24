# Price Monitoring Cron API

## Overview

The Price Monitoring Cron API is a scheduled Edge Function that drives two backend paths:

1. **Firecrawl re-scrape** of user-pasted URLs monitored under `competitor_sources` with `source_type='firecrawl_url'` (Custom Monitoring section in the UI).
2. **Tracked-query refresh** for every `tracked_queries` row whose `last_refreshed_at + refresh_interval_hours < now()` — this runs the full Perplexity + DataForSEO + Firecrawl verification + Haiku identity pipeline.

**Edge Function:** `price-monitoring-cron`
**Trigger:** Scheduled (hourly) or manual invocation
**Backend endpoints used:**
- `POST /api/v1/price-monitoring/check-now` — Firecrawl-only URL rescrape
- `POST /api/v1/price-monitoring/tracked-queries/cron-refresh` — full pipeline, identity-verified

## Architecture

```
Supabase Cron (hourly)
  ↓
Edge Function (price-monitoring-cron)
  ├─→ Python: /api/v1/price-monitoring/check-now
  │     (CompetitorScraperService → Firecrawl → price_history → PriceAlertService)
  │
  └─→ Python: /api/v1/price-monitoring/tracked-queries/cron-refresh
        (TrackedQueriesService.refresh() — full pipeline for every due tracked_query)
            ├─→ Facet cache read (tracked_queries.query_facets)
            ├─→ Perplexity Sonar + DataForSEO Merchant (parallel)
            ├─→ URL pre-filter (drops homepages/SERPs/aggregators)
            ├─→ Firecrawl verification (price + product_name + breadcrumb)
            ├─→ Haiku identity classifier (match_kind per hit)
            └─→ tracked_query_price_history insert (with match_kind, product_title, original_price)
```

## Authentication

This is a cron job that requires a secret header for security:

```typescript
X-Cron-Secret: <cron_secret>
```

The secret must match the `CRON_SECRET` environment variable.

## Manual Invocation

While this function is designed to run on a schedule, it can be manually triggered:

**Method:** `POST`  
**Path:** `/`

**Headers:**
```typescript
X-Cron-Secret: <cron_secret>
```

**Response:**
```typescript
{
  success: true,
  message: string,
  processed: number,      // Total products processed
  succeeded: number,      // Successfully monitored
  failed: number,         // Failed to monitor
  results: Array<{
    product_id: string,
    product_name: string,
    status: 'success' | 'failed',
    price_changes: number,
    alerts_triggered: number,
    error?: string
  }>
}
```

## How It Works

### 1. Query Products Due for Monitoring

The function calls the database function `get_products_due_for_monitoring()` which returns products where:
- `next_check_at <= NOW()`
- `is_active = true`
- Has valid competitor sources

### 2. Process Each Product

For each product, the function:
1. Calls Python backend API: `POST /api/v1/price-monitoring/check-now`
2. Python backend handles:
   - Scraping competitor pages via Firecrawl
   - Debiting credits via CreditsIntegrationService
   - Logging AI usage via AICallLogger
   - Saving price history to database
   - Creating price monitoring jobs
   - Checking and triggering price alerts

### 3. Update Next Check Time

After processing, the `next_check_at` is updated based on the monitoring frequency:
- `hourly` → +1 hour
- `daily` → +1 day
- `weekly` → +7 days
- `monthly` → +30 days

## Monitoring Frequencies

| Frequency | Check Interval | Use Case |
|-----------|---------------|----------|
| `hourly` | Every hour | High-priority products |
| `daily` | Every 24 hours | Standard monitoring |
| `weekly` | Every 7 days | Low-priority products |
| `monthly` | Every 30 days | Occasional checks |

## Price Alerts

When price changes are detected, the system checks for active alerts:

**Alert Types:**
- `price_drop` - Price decreased by X%
- `price_increase` - Price increased by X%
- `threshold_below` - Price fell below threshold
- `threshold_above` - Price rose above threshold

**Alert Actions:**
- Email notification
- In-app notification
- Webhook call (if configured)

## Database Tables

### price_monitoring_jobs
Tracks each monitoring execution:
```typescript
{
  id: string,
  product_id: string,
  status: 'pending' | 'processing' | 'completed' | 'failed',
  sources_checked: number,
  prices_found: number,
  credits_used: number,
  started_at: string,
  completed_at: string,
  error_message?: string
}
```

### price_history
Stores historical price data:
```typescript
{
  id: string,
  product_id: string,
  source_id: string,
  price: number,
  currency: string,
  availability: boolean,
  scraped_at: string,
  metadata: object
}
```

### price_alerts
User-configured price alerts:
```typescript
{
  id: string,
  user_id: string,
  product_id: string,
  alert_type: string,
  threshold_value: number,
  is_active: boolean,
  last_triggered_at?: string
}
```

## Error Handling

```typescript
{
  success: false,
  error: string,
  processed: number,
  succeeded: number,
  failed: number
}
```

**Common Errors:**
- `401` - Invalid cron secret
- `500` - Database query failed
- `503` - Python backend unavailable

## Monitoring & Logs

The function logs detailed information:
- Products found for monitoring
- Processing status for each product
- Price changes detected
- Alerts triggered
- Errors encountered

## Related Documentation

- [Price Monitoring System](../price-monitoring-system.md)
- [Price Monitoring Deployment Guide](../price-monitoring-deployment-guide.md)
- [Credits System](../internal-pricing-credit-system.md)

