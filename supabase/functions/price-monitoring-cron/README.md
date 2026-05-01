# Price Monitoring Cron Job

## Overview

Hourly Edge Function that refreshes every internal-flow `tracked_queries` row whose `next_check_at` has elapsed. Orchestration only — all business logic lives in the Python backend.

## Architecture

After the 2026-05-01 consolidation, every monitored catalog product is a `tracked_queries` row with `api_key_id IS NULL` and `product_id NOT NULL`. External API consumers (`api_key_id IS NOT NULL`) are intentionally NOT touched — they pay per call and control their own cadence.

```
Supabase Cron (hourly)
  ↓
Edge Function (price-monitoring-cron)
  ├─→ DB RPC: get_internal_tracked_queries_due()
  │     (Returns rows where api_key_id IS NULL AND product_id IS NOT NULL
  │      AND is_active AND (next_check_at IS NULL OR next_check_at < now()).
  │      Volatility cadence is maintained by update_tracked_query_cadence()
  │      after each refresh.)
  │
  └─→ For each row → Python: POST /api/v1/price-monitoring/products/{id}/refresh
        (Full pipeline: facet cache → Perplexity Sonar + DataForSEO Merchant
         → optional Greek/Idealo marketplaces → URL pre-filter → Firecrawl
         verification → Haiku identity classifier → write to
         tracked_query_price_history → bump tracked_queries cache columns
         (current_price, current_currency, etc.) → update_tracked_query_cadence
         picks the next next_check_at based on observed volatility.)
```

Every row written to `tracked_query_price_history` carries the identity fields (`match_kind`, `match_score`, `match_note`, `product_title`) and sanity-band fields (`is_anomaly`, `anomaly_reason`, `rolling_median_at_check`).

## Why This Architecture?

### ✅ Benefits

1. **Unified Credit System** — all credit debit logic in one place (Python backend).
2. **Unified AI Analytics** — every Perplexity/Haiku/Firecrawl call logged to `ai_usage_logs`.
3. **Single Source of Truth** — business logic in Python only; the edge function is a thin scheduler.
4. **Consistent Error Handling** — retry logic + circuit breakers in Python.
5. **Easy to Test** — backend testable independently of cron timing.

### ❌ What We Avoid

1. No duplicate credit logic in the edge function.
2. No duplicate AI logging.
3. No Firecrawl calls from the edge function.
4. No business-logic duplication.

## Environment Variables

Required (set via `supabase secrets set`):

- `SUPABASE_URL` — Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY` — service role key for backend auth
- `PYTHON_BACKEND_URL` — URL of the MIVAA FastAPI backend
- `CRON_SECRET` — random secret validating cron invocation

See `.env.example`.

## Deployment

### 1. Set Secrets

```bash
supabase secrets set SUPABASE_URL=https://your-project.supabase.co
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=your-key
supabase secrets set PYTHON_BACKEND_URL=https://v1api.materialshub.gr
supabase secrets set CRON_SECRET=$(openssl rand -hex 32)
```

### 2. Deploy Function

```bash
supabase functions deploy price-monitoring-cron
```

### 3. Set Up Cron Schedule

Supabase Dashboard → Database → Cron Jobs:

```sql
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
  "message": "Price monitoring completed: 8/10 succeeded",
  "stats": {
    "internal": {
      "total": 10,
      "processed": 10,
      "succeeded": 8,
      "failed": 2,
      "results": [
        {
          "product_id": "uuid",
          "success": true,
          "credits_used": 2,
          "results_count": 7
        }
      ]
    }
  },
  "timestamp": "2026-05-01T15:30:00Z"
}
```

## Logs

Supabase Dashboard → Edge Functions → `price-monitoring-cron` → Logs.

```
🔄 Price monitoring cron job started
📊 Found 10 internal tracked_queries due
✅ Internal monitoring completed: 10 processed, 8 succeeded, 2 failed
```

## Database Functions Used

- `get_internal_tracked_queries_due()` — returns up to 100 due internal rows ordered by oldest `next_check_at` first.
- `update_tracked_query_cadence(p_tracked_query_id, p_max_pct_change)` — called by the Python backend after every refresh; bumps `next_check_at` and `consecutive_stable_refreshes` based on observed volatility.

## Error Handling

- Invalid cron secret → 401 Unauthorized.
- Python backend non-2xx → logged with status + body excerpt, row counted as failed, cron continues with the next row.
- Per-row exceptions → caught and logged; cron never aborts mid-batch.

## Monitoring

1. **Supabase Dashboard** → Edge Functions → Logs.
2. **MIVAA Admin** → AI Analytics dashboard → filter by `module_slug` for per-source spend.
3. **Database** → `tracked_query_price_history` (newest rows = most recent refresh activity).

## Troubleshooting

### Cron job not running

- Check cron schedule in Supabase Dashboard.
- Verify `CRON_SECRET` matches between cron config and edge function secret.
- Check edge function logs for 401 responses.

### Python backend not responding

- Verify `PYTHON_BACKEND_URL` is reachable.
- Confirm MIVAA service is running (`systemctl status mivaa-api`).
- Check MIVAA logs for `/api/v1/price-monitoring/products/.../refresh` 5xx responses.

### No products being processed

- Confirm at least one `tracked_queries` row has `api_key_id IS NULL`, `product_id IS NOT NULL`, `is_active = true`, and `next_check_at < now()`.
- Verify the volatility cadence isn't pushing `next_check_at` too far out (admins can force a refresh from the Product Monitor tab).

## Related Files

- `index.ts` — main Edge Function code
- `.env.example` — environment variable template
- `../../../mivaa-pdf-extractor/app/api/price_monitoring_routes.py` — Python backend route surface
- `../../../mivaa-pdf-extractor/app/services/integrations/tracked_queries_service.py` — single chokepoint for both internal and external refresh
