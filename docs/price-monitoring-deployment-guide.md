# Price Monitoring — Deployment & Testing Guide

> **Updated 2026-05-01.** Schema consolidated: `tracked_queries` is the single subject table for both internal product monitoring and external API tracked queries. Legacy tables (`competitor_sources`, `price_history`, `price_monitoring_products`, `product_excluded_urls`) and the legacy edge function `price-monitoring` are gone.

## Architecture Overview

```
┌──────────────┐      ┌──────────────────┐      ┌──────────────────┐
│  Supabase    │─────▶│  Edge Function   │─────▶│  Python Backend  │
│  Cron        │      │  (Cron — hourly) │      │  (FastAPI/MIVAA) │
└──────────────┘      └──────────────────┘      └──────────────────┘
                              │                          │
                              ▼                          ▼
                  get_internal_tracked_     /api/v1/price-monitoring
                       _queries_due()         /products/{id}/refresh
                                                         │
                  ┌──────────────────────────────────────┼──────────────────────────────────────┐
                  ▼                                      ▼                                      ▼
        ┌──────────────────┐               ┌──────────────────┐               ┌──────────────────┐
        │  Perplexity +    │               │  Credits Service │               │  AI Call Logger  │
        │  DataForSEO +    │               │  (Debit credits) │               │  (Usage logs)    │
        │  Firecrawl +     │               └──────────────────┘               └──────────────────┘
        │  Haiku           │                          │                                  │
        └──────────────────┘                          │                                  │
                  │                                   │                                  │
                  └───────────────────────────────────┼──────────────────────────────────┘
                                                      ▼
                                          ┌──────────────────────────────┐
                                          │  Supabase Database           │
                                          │  - tracked_queries (cache)   │
                                          │  - tracked_query_price_history│
                                          │  - price_alert_log           │
                                          │  - ai_usage_logs             │
                                          └──────────────────────────────┘
```

## Prerequisites

1. **Supabase project** — active.
2. **Python backend (MIVAA)** — FastAPI deployed and running.
3. **API keys** — Perplexity, Firecrawl, DataForSEO, Anthropic, Resend.
4. **Database migrations applied** — including `consolidate_price_monitoring_into_tracked_queries` (2026-05-01).

## Step 1: Database Setup

### Apply migrations

`supabase db push` from the project root. Or push individual migrations via `mcp__supabase__apply_migration`.

### Verify tables

These should exist:

- `tracked_queries` — single subject table (internal + external)
- `tracked_query_price_history` — every retailer row from every refresh
- `tracked_query_promoted_urls` — sticky admin URL overrides
- `tracked_query_excluded_urls` — per-tracked-query URL/domain exclusions
- `match_corrections` — classifier few-shot feedback pool
- `classifier_verdict_cache` — 7-day TTL Haiku verdict cache
- `brand_retailer_index` — `(brand, retailer_domain, country_code)` cache
- `retailer_extraction_recipes` — per-retailer selectors with self-heal
- `price_alert_log` — alert audit + 24h dedupe
- `price_discrepancies` — cross-source disagreement log
- `price_lookups` — external `/lookup` usage log

These should be **gone** (dropped 2026-05-01):

- `competitor_sources`, `price_history`, `price_monitoring_products`, `product_excluded_urls`

### Verify columns on `tracked_queries`

Routing:
- `product_id` (uuid, FK products, ON DELETE CASCADE)
- `api_key_id` (uuid, FK api_keys, ON DELETE SET NULL, **nullable**)
- `mode` (text, `discovery` | `url-only`)
- `pinned_url` (text, nullable)
- `CHECK (api_key_id XOR product_id)` constraint
- Partial unique index `uniq_tracked_queries_internal_product_discovery`

Cache (cheapest verified hit, populated by every refresh):
- `current_price`, `current_currency`, `current_availability`, `current_original_price`, `current_price_verified`, `current_metadata`, `current_price_updated_at`

Cadence + alerts:
- `next_check_at`, `volatility_score`, `consecutive_stable_refreshes`, `first_refresh_verified`
- `alert_on_price_drop`, `alert_on_new_retailer`, `alert_on_promo`, `alert_channels`, `alert_webhook_url`

### Verify database functions

These should exist:

- `get_internal_tracked_queries_due()` — returns up to 100 internal rows whose `next_check_at` has elapsed
- `update_tracked_query_cadence(p_tracked_query_id uuid, p_max_pct_change double precision)` — bumps `next_check_at` after each refresh
- `has_price_monitoring_access()` — RLS helper

These should be **gone** (dropped 2026-05-01):
- `get_products_due_for_monitoring()`, `update_next_check_time(...)`, `prune_stale_competitor_sources(...)`

## Step 2: Python Backend Configuration

### Dependencies

`mivaa-pdf-extractor/requirements.txt` already includes the required deps (`price-parser`, `httpx`, `selectolax`, `anthropic`, `firecrawl-py`). Run `pip install -r requirements.txt`.

### Environment variables

Add to `mivaa-pdf-extractor/.env` (or set on the systemd unit's `Environment=` lines in production):

- `PERPLEXITY_API_KEY` — primary discovery engine
- `FIRECRAWL_API_KEY` — verification + Custom Monitoring scrapes
- `DATAFORSEO_BASE64` (or `DATAFORSEO_LOGIN` + `DATAFORSEO_PASSWORD`) — Google Shopping merchant feed
- `ANTHROPIC_API_KEY` — Haiku identity classifier + facet extraction
- `RESEND_API_KEY` — email alerts (via the platform's `email-api` edge function)
- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_JWT_SECRET` — Supabase access
- `MATERIAL_KAI_API_KEY`, `MATERIAL_KAI_WORKSPACE_ID` — platform credentials
- `CRON_SECRET` — validates `x-cron-secret` on the cron-refresh escape hatch

### Verify backend is running

```bash
python -m uvicorn app.main:app --reload --port 8000
```

Health check at `http://localhost:8000/health`. Hitting `http://localhost:8000/api/v1/price-monitoring/products/<some-uuid>` without a JWT should return 401.

## Step 3: Edge Function Deployment

### Set secrets

```bash
supabase secrets set SUPABASE_URL=https://<project>.supabase.co
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=<key>
supabase secrets set PYTHON_BACKEND_URL=https://v1api.materialshub.gr
supabase secrets set CRON_SECRET=$(openssl rand -hex 32)
```

Verify with `supabase secrets list`.

### Deploy

```bash
supabase functions deploy monitoring-cron   # single dispatcher for all five monitoring tasks
```

### Manual smoke test

```bash
curl -X POST https://<project>.supabase.co/functions/v1/price-monitoring-cron \
  -H "x-cron-secret: <secret>"
```

With no enrolled products, expect `{success: true, message: "No products due for monitoring", processed: 0}`.

## Step 4: Set Up Cron Schedule

### Option A — Supabase Dashboard

Database → Cron Jobs → Create:

- **Name**: `price-monitoring-hourly`
- **Schedule**: `0 * * * *`
- **Command**: SQL using `net.http_post(...)` to call the cron edge function with the `x-cron-secret` header.

### Option B — SQL

```sql
SELECT cron.schedule(
  'price-monitoring-hourly',
  '0 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://<project>.supabase.co/functions/v1/price-monitoring-cron',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', '<secret>'
    )
  );
  $$
);
```

### Verify

```sql
SELECT * FROM cron.job;
SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 10;
```

## Step 5: End-to-End Test

### 1. Enroll a product

```bash
curl -X POST http://localhost:8000/api/v1/price-monitoring/products/<product_uuid>/track \
  -H "Authorization: Bearer <session_jwt>" \
  -H "Content-Type: application/json" \
  -d '{}'
```

Backend creates a `tracked_queries` row (`api_key_id IS NULL`, `mode='discovery'`) and runs the first refresh synchronously. Response includes the row + first results.

### 2. Inspect the row

```bash
curl http://localhost:8000/api/v1/price-monitoring/products/<product_uuid> \
  -H "Authorization: Bearer <session_jwt>"
```

Returns the tracked_query summary including `current_price`, `next_check_at`, `last_refreshed_at`, etc.

### 3. Force-refresh (admin only)

```bash
curl -X POST http://localhost:8000/api/v1/price-monitoring/products/<product_uuid>/refresh \
  -H "Authorization: Bearer <admin_session_jwt>" \
  -H "Content-Type: application/json" \
  -d '{"force_refresh": true, "verify_prices": true}'
```

### 4. Add a Custom Monitoring URL

```bash
curl -X POST http://localhost:8000/api/v1/price-monitoring/products/<product_uuid>/url-only \
  -H "Authorization: Bearer <session_jwt>" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://retailer.example.com/product/abc"}'
```

Creates a sibling `tracked_queries` row with `mode='url-only'` and `pinned_url` set.

### 5. Verify database records

```sql
-- Tracked queries for this product (should have 1 discovery + N url-only).
SELECT id, mode, pinned_url, current_price, last_refreshed_at, next_check_at
FROM tracked_queries
WHERE product_id = '<product_uuid>' AND api_key_id IS NULL;

-- Latest refresh's retailer rows.
SELECT retailer_name, price, currency, verified, match_kind, is_anomaly
FROM tracked_query_price_history
WHERE tracked_query_id = '<id-from-above>'
ORDER BY scraped_at DESC, price ASC;

-- AI usage logged.
SELECT operation_type, model_name, credits_debited, created_at
FROM ai_usage_logs
WHERE created_at > now() - interval '5 minutes'
ORDER BY created_at DESC;
```

### 6. Trigger cron manually

```bash
curl -X POST https://<project>.supabase.co/functions/v1/price-monitoring-cron \
  -H "x-cron-secret: <secret>"
```

Tail logs:

```bash
supabase functions logs price-monitoring-cron --tail
```

## Step 6: Monitoring & Troubleshooting

### Logs

- **Edge function**: `supabase functions logs price-monitoring-cron --tail`
- **MIVAA backend**: `sudo journalctl -u mivaa-api -f` (production) or terminal output (dev)
- **AI Analytics dashboard**: Admin → AI Analytics, filter by `module_slug` (`greek-marketplaces`, `idealo`, `price-monitoring-notifications`)

### Common issues

#### Cron job not running

- `SELECT * FROM cron.job;` — confirm scheduled
- Verify `CRON_SECRET` matches between cron config and edge function secret
- `supabase functions list` — confirm deployed
- `SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 10;`

#### Edge function returns 401

- Wrong `CRON_SECRET`. Regenerate with `openssl rand -hex 32` and update both the cron config and the edge function secret.

#### Python backend not responding

- Verify `PYTHON_BACKEND_URL` is reachable
- Confirm MIVAA service is up (`systemctl status mivaa-api`)
- Check MIVAA logs for 5xx on `/api/v1/price-monitoring/products/.../refresh`

#### No products being processed

```sql
SELECT id, product_id, mode, is_active, next_check_at
FROM tracked_queries
WHERE api_key_id IS NULL AND product_id IS NOT NULL;
```

- Confirm at least one row has `is_active = true` AND (`next_check_at IS NULL` OR `next_check_at < now()`)
- Volatility cadence may be pushing `next_check_at` further out — admins can force-refresh from the Product Monitor tab

#### Firecrawl errors

- Check `FIRECRAWL_API_KEY` set on MIVAA
- Validate at https://firecrawl.dev/dashboard
- Check credit balance

#### Credits not debiting

- Check `ai_usage_logs` for entries from the refresh
- Confirm `CreditsIntegrationService` initialized
- Verify the user has sufficient credits

## Step 7: Production Deployment

### Update env vars

```bash
supabase secrets set PYTHON_BACKEND_URL=https://v1api.materialshub.gr
supabase secrets list
```

### Deploy

```bash
supabase functions deploy price-monitoring-cron --project-ref <prod-project-ref>
supabase functions list --project-ref <prod-project-ref>
```

### Update cron

```sql
SELECT cron.unschedule('price-monitoring-hourly');
SELECT cron.schedule('price-monitoring-hourly', '0 * * * *', $$ ... $$);
```

### Monitoring

- **Supabase Dashboard** → Edge Function invocations + error rates
- **MIVAA AI Analytics** → credit consumption per module, per provider
- **Database** → query `tracked_query_price_history` for refresh activity; `price_alert_log` for alerts dispatched

## Step 8: Maintenance

### Daily

- `SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 10;`
- Check edge function error logs
- Monitor credit consumption

### Weekly

- Review classifier corrections (`SELECT * FROM match_corrections ORDER BY created_at DESC LIMIT 50;`)
- Check excluded URLs (`SELECT * FROM tracked_query_excluded_urls;`)
- Review AI usage analytics

### Monthly

- Audit retailer extraction recipes (`SELECT * FROM retailer_extraction_recipes WHERE confidence < 0.5;`)
- Review brand-retailer cache hit rate
- Optimize cadence based on volatility patterns

## Related Documentation

- [Price Monitoring System](./price-monitoring-system.md)
- [Price Monitoring API (external)](api/price-monitoring-api.md)
- [Cron API](api/price-monitoring-cron-api.md)
- Edge function: the price-monitoring cron was consolidated into `supabase/functions/monitoring-cron`.
- [CLAUDE.md → Price Monitoring](../CLAUDE.md)

## Support

1. Edge function logs: `supabase functions logs price-monitoring-cron`
2. MIVAA backend logs: `sudo journalctl -u mivaa-api -n 200`
3. Database queries against `tracked_query_price_history`, `tracked_queries`, `price_alert_log`
4. Firecrawl status: https://status.firecrawl.dev
5. Supabase status: https://status.supabase.com
