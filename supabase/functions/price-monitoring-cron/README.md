# Price Monitoring Cron Job

## Overview

This Edge Function runs on a schedule (hourly) to check products that are due for price monitoring. It orchestrates the cron schedule and calls the Python backend API to perform the actual price checks.

## Architecture

This edge function drives **two** backend paths on each tick:

```
Supabase Cron (hourly)
  ↓
Edge Function (price-monitoring-cron)
  ├─→ Python: /api/v1/price-monitoring/check-now
  │     (Firecrawl re-scrape of user-pasted URLs in competitor_sources
  │      with source_type='firecrawl_url' — the "Custom Monitoring" UI.)
  │
  └─→ Python: /api/v1/price-monitoring/tracked-queries/cron-refresh
        (Full pipeline for every due tracked_queries row.)
            ├─→ Facet cache read (tracked_queries.query_facets)
            ├─→ Perplexity Sonar + DataForSEO Merchant (parallel discovery)
            ├─→ URL pre-filter (drops homepages/SERPs/aggregator masquerades)
            ├─→ Firecrawl verification (per retailer URL — price + product_name
            │     + breadcrumb + visible_attributes)
            ├─→ Haiku 4.5 identity classifier (match_kind per hit —
            │     drops mismatch/family, keeps exact/variant/unverifiable)
            └─→ Writes tracked_query_price_history with match_kind, match_score,
                  match_note, product_title, original_price, verified
```

Every row returned from either path carries the Phase-8 identity fields
(`match_kind`, `match_score`, `match_note`, `product_title`). See
[docs/api/price-monitoring-api.md](../../../docs/api/price-monitoring-api.md)
for the full response schema.

## Why This Architecture?

### ✅ Benefits

1. **Unified Credit System** - All credit debit logic in one place (Python backend)
2. **Unified AI Analytics** - All AI usage logged in Admin Dashboard
3. **Single Source of Truth** - Business logic in Python backend only
4. **Consistent Error Handling** - Retry logic, circuit breakers in Python
5. **Easy to Test** - Can test Python backend independently
6. **Easy to Maintain** - No code duplication

### ❌ What We Avoid

1. **No Duplicate Credit Logic** - Edge Function doesn't manage credits
2. **No Duplicate AI Logging** - Edge Function doesn't log AI usage
3. **No Duplicate Scraping Logic** - Edge Function doesn't call Firecrawl
4. **No Maintenance Burden** - One codebase for business logic

## Environment Variables

Required environment variables (set via `supabase secrets set`):

- `SUPABASE_URL` - Your Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY` - Service role key for backend auth
- `PYTHON_BACKEND_URL` - URL of your Python FastAPI backend
- `CRON_SECRET` - Random secret for cron job security

See `.env.example` for details.

## Deployment

### 1. Set Secrets

```bash
supabase secrets set SUPABASE_URL=https://your-project.supabase.co
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=your-key
supabase secrets set PYTHON_BACKEND_URL=https://your-backend.com
supabase secrets set CRON_SECRET=$(openssl rand -hex 32)
```

### 2. Deploy Function

```bash
supabase functions deploy price-monitoring-cron
```

### 3. Set Up Cron Schedule

In Supabase Dashboard → Database → Cron Jobs:

```sql
-- Run every hour
SELECT cron.schedule(
  'price-monitoring-hourly',
  '0 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://your-project.supabase.co/functions/v1/price-monitoring-cron',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', 'your-cron-secret-here'
    )
  );
  $$
);
```

## Testing

### Manual Trigger

```bash
curl -X POST https://your-project.supabase.co/functions/v1/price-monitoring-cron \
  -H "x-cron-secret: your-cron-secret" \
  -H "Content-Type: application/json"
```

### Expected Response

```json
{
  "success": true,
  "message": "Price monitoring completed: 5/10 succeeded",
  "stats": {
    "total": 10,
    "processed": 10,
    "succeeded": 5,
    "failed": 5,
    "results": [...]
  },
  "timestamp": "2025-12-25T15:30:00Z"
}
```

## Logs

View logs in Supabase Dashboard → Edge Functions → price-monitoring-cron → Logs

Example log output:

```
🔄 Price monitoring cron job started
📊 Found 10 products due for monitoring

🔍 Processing product: abc-123
   Product name: Premium Leather Sofa
   Frequency: daily
✅ Price check completed for abc-123
   Sources checked: 2
   Prices found: 2
   Credits consumed: 2

✅ Cron job completed: 10 processed, 8 succeeded, 2 failed
```

## Database Functions Used

- `get_products_due_for_monitoring()` - Returns products where `next_check_at <= NOW()`
- `update_next_check_time(p_monitoring_id, p_frequency)` - Updates next check time

## Error Handling

- Invalid cron secret → 401 Unauthorized
- Python backend error → Logged and continued
- Database error → Logged and continued
- All errors are logged with detailed context

## Monitoring

Monitor the cron job health:

1. **Supabase Dashboard** → Edge Functions → Logs
2. **Python Backend** → Admin Dashboard → AI Analytics
3. **Database** → `price_monitoring_jobs` table

## Troubleshooting

### Cron job not running

- Check cron schedule in Supabase Dashboard
- Verify `CRON_SECRET` is set correctly
- Check Edge Function logs

### Python backend not responding

- Verify `PYTHON_BACKEND_URL` is correct
- Check Python backend is running
- Check Python backend logs

### No products being processed

- Check `price_monitoring_products` table
- Verify `monitoring_enabled = true`
- Verify `next_check_at <= NOW()`

## Related Files

- `index.ts` - Main Edge Function code
- `.env.example` - Environment variable template
- `../../migrations/` - Database migrations
- `../../../mivaa-pdf-extractor/app/api/price_monitoring_routes.py` - Python backend API
- `../../../mivaa-pdf-extractor/app/services/price_monitoring_service.py` - Python service

