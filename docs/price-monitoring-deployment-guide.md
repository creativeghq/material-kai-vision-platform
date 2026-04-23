# Price Monitoring - Deployment & Testing Guide

## Architecture Overview

┌─────────────────────────────────────────────────────────────────┐
│                     PRICE MONITORING SYSTEM                      │
└─────────────────────────────────────────────────────────────────┘

┌──────────────┐      ┌──────────────┐      ┌──────────────────┐
│  Supabase    │      │    Edge      │      │     Python       │
│  Cron Job    │─────▶│  Function    │─────▶│    Backend       │
│  (Hourly)    │      │  (Cron)      │      │    (FastAPI)     │
└──────────────┘      └──────────────┘      └──────────────────┘
                                                      │
                      ┌───────────────────────────────┼───────────────────────────┐
                      │                               │                           │
                      ▼                               ▼                           ▼
            ┌──────────────────┐          ┌──────────────────┐      ┌──────────────────┐
            │  Firecrawl API   │          │  Credits Service │      │  AI Call Logger  │
            │  (Web Scraping)  │          │  (Debit Credits) │      │  (Usage Logs)    │
            └──────────────────┘          └──────────────────┘      └──────────────────┘
                      │                               │                           │
                      └───────────────────────────────┼───────────────────────────┘
                                                      ▼
                                          ┌──────────────────────┐
                                          │  Supabase Database   │
                                          │  - price_history     │
                                          │  - competitor_sources│
                                          │  - price_alerts      │
                                          │  - ai_usage_logs     │
                                          └──────────────────────┘

## Prerequisites

1. **Supabase Project** - Active Supabase project
2. **Python Backend** - FastAPI backend deployed and running
3. **Firecrawl API Key** - Get from [firecrawl.dev](https://firecrawl.dev)
4. **Database Migrations** - All price monitoring tables created

## Step 1: Database Setup

### Apply Migrations

Run `supabase db push` from the project root to apply all migrations. Verify the schema with `supabase db diff`.

### Verify Tables

Check that these tables exist:
- `price_monitoring_products`
- `price_history`
- `competitor_sources` (has `source_type` enum, `current_price`/`current_currency`/`current_availability`/`current_price_updated_at` cache columns)
- `price_monitoring_jobs`
- `price_alerts`
- `price_alert_history`
- `price_lookups` (external `/api/v1/prices/lookup` usage log)

And the enum type:
- `competitor_source_type` (`firecrawl_url`, `dataforseo_shopping`)

### Verify Database Functions

Check that these functions exist:
- `get_products_due_for_monitoring()`
- `update_next_check_time(p_monitoring_id, p_frequency)`
- `should_trigger_alert(p_alert_id, p_old_price, p_new_price)`

## Step 2: Python Backend Configuration

### Dependencies

The backend requires `price-parser>=0.3.4` for locale-aware price string parsing (already listed in `mivaa-pdf-extractor/requirements.txt`). Run `pip install -r requirements.txt` to pick it up.

### Environment Variables

Add the following to `mivaa-pdf-extractor/.env`:
- `FIRECRAWL_API_KEY` - Your Firecrawl API key
- `RESEND_API_KEY` - Resend API key (used by the `notification-dispatcher` edge function for price alert emails)
- `SUPABASE_URL` - Supabase project URL (should already exist)
- `SUPABASE_SERVICE_ROLE_KEY` - Service role key (should already exist)
- `SUPABASE_JWT_SECRET` - JWT secret (should already exist)
- `MATERIAL_KAI_API_KEY` - Material Kai API key (should already exist)
- `MATERIAL_KAI_WORKSPACE_ID` - Workspace ID (should already exist)

### Verify Backend is Running

Start the backend with `python -m uvicorn app.main:app --reload --port 8000`. Verify the health endpoint responds at `http://localhost:8000/health`. The price monitoring endpoint at `http://localhost:8000/api/v1/price-monitoring/status/test-id` should return 401 without authentication.

## Step 3: Edge Function Deployment

### Set Secrets

Use `supabase secrets set` to configure the following secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, PYTHON_BACKEND_URL (localhost for dev or the production URL), and CRON_SECRET (generate with `openssl rand -hex 32`). Verify with `supabase secrets list`.

### Deploy Edge Function

Run `supabase functions deploy price-monitoring-cron` and verify with `supabase functions list`.

### Test Edge Function Manually

Send a POST request to `https://your-project.supabase.co/functions/v1/price-monitoring-cron` with the `x-cron-secret` header set to your CRON_SECRET value. With no products configured yet, the expected response will show success with all stats at zero.

## Step 4: Set Up Cron Schedule

### Option A: Supabase Dashboard

1. Go to **Database** → **Cron Jobs**
2. Click **Create a new cron job**
3. Configure:
   - **Name**: `price-monitoring-hourly`
   - **Schedule**: `0 * * * *` (every hour)
   - **Command**: A SQL statement using `net.http_post` to call the price-monitoring-cron edge function URL with the Content-Type and x-cron-secret headers.

### Option B: SQL Command

Execute a `SELECT cron.schedule(...)` statement with the job name `'price-monitoring-hourly'`, schedule `'0 * * * *'`, and a dollar-quoted SQL block that calls `net.http_post` with the edge function URL and the required headers including the cron secret.

### Verify Cron Job

Query `SELECT * FROM cron.job;` to list all scheduled cron jobs. Query `SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 10;` to check recent execution history.

## Step 5: Testing the Complete Flow

### 1. Create Test Product Monitoring

Send a POST request to `http://localhost:8000/api/v1/price-monitoring/start` with your JWT token in the Authorization header and a body specifying `product_id`, `frequency: 'hourly'`, and `enabled: true`.

### 2. Add Competitor Sources

Send POST requests to `http://localhost:8000/api/v1/price-monitoring/sources` with your JWT token. Each request body specifies `product_id`, `source_name`, `source_url`, and optionally `scraping_config` with settings like `waitFor` (milliseconds) and `timeout`.

### 3. Trigger Manual Price Check

Send a POST request to `http://localhost:8000/api/v1/price-monitoring/check-now` with your JWT token and a body specifying `product_id` and `product_name`. The expected response includes success, message, job_id, sources_checked, prices_found, and credits_consumed.

### 4. Verify Database Records

Query the `price_history` table filtering by product_id and ordering by scraped_at descending to confirm price records were created. Query `price_monitoring_jobs` similarly to confirm job records. Query `ai_usage_logs` filtering by provider 'firecrawl' to confirm credit usage was logged.

### 5. Test Cron Job Execution

Manually trigger the cron function by sending a POST request with the cron secret header. Check Edge Function logs with `supabase functions logs price-monitoring-cron --tail`. Check Python backend logs in the backend terminal.

### 6. Verify Cron Schedule

Query `SELECT * FROM cron.job WHERE jobname = 'price-monitoring-hourly';` to confirm the job is scheduled. Query `cron.job_run_details` filtering by the jobid to see fields including jobid, runid, job_pid, database, username, command, status, return_message, start_time, and end_time.

## Step 6: Monitoring & Troubleshooting

### Check Edge Function Logs

Use `supabase functions logs price-monitoring-cron --tail` for real-time logs or `supabase functions logs price-monitoring-cron --limit 100` for the last 100 entries.

### Check Python Backend Logs

View logs via systemd (`sudo journalctl -u mivaa-backend -f`), Docker (`docker logs -f mivaa-backend`), or directly in the terminal if running locally.

### Common Issues

#### 1. Cron Job Not Running

**Symptoms**: No logs in Edge Function, no database updates

**Solutions**:
- Verify cron job is scheduled: `SELECT * FROM cron.job;`
- Check cron secret is correct
- Verify Edge Function is deployed: `supabase functions list`
- Check cron job run history: `SELECT * FROM cron.job_run_details;`

#### 2. Edge Function Returns 401

**Symptoms**: "Unauthorized" error in logs

**Solutions**:
- Verify `CRON_SECRET` is set correctly
- Check cron job is using correct secret
- Regenerate secret if needed using `openssl rand -hex 32` and set it via `supabase secrets set CRON_SECRET=...`

#### 3. Python Backend Not Responding

**Symptoms**: Edge Function logs show connection errors

**Solutions**:
- Verify `PYTHON_BACKEND_URL` is correct
- Check Python backend is running at the health endpoint
- Check firewall rules allow Edge Function → Backend communication
- For production, ensure backend URL is publicly accessible

#### 4. No Products Being Processed

**Symptoms**: "Found 0 products due for monitoring"

**Solutions**:
- Check `price_monitoring_products` table has records
- Verify `monitoring_enabled = true`
- Verify `next_check_at <= NOW()`
- Query the price_monitoring_products table filtering by `monitoring_enabled = true` to see product_id, monitoring_frequency, next_check_at, and status for each record.

#### 5. Firecrawl API Errors

**Symptoms**: "Failed to scrape" errors in logs

**Solutions**:
- Verify `FIRECRAWL_API_KEY` is set in Python backend
- Check Firecrawl API key is valid: https://firecrawl.dev/dashboard
- Check Firecrawl credits balance
- Verify competitor URLs are accessible
- Check scraping_config is valid

#### 6. Credits Not Being Debited

**Symptoms**: Price checks succeed but credits unchanged

**Solutions**:
- Check `CreditsIntegrationService` is configured
- Verify user has sufficient credits
- Check `ai_usage_logs` table for entries
- Review Python backend logs for credit debit errors

## Step 7: Production Deployment

### 1. Update Environment Variables

Set the production Python backend URL using `supabase secrets set PYTHON_BACKEND_URL=https://api.yourdomain.com`. Verify all secrets with `supabase secrets list`.

### 2. Deploy Edge Function

Deploy to production with `supabase functions deploy price-monitoring-cron --project-ref your-project-ref`. Verify with `supabase functions list --project-ref your-project-ref`.

### 3. Update Cron Schedule

Delete the old cron job with `SELECT cron.unschedule('price-monitoring-hourly');`. Create a new cron job using `SELECT cron.schedule(...)` pointing to the production URL with the production cron secret.

### 4. Set Up Monitoring

#### Supabase Dashboard

- Monitor Edge Function invocations
- Check error rates
- Review execution times

#### Python Backend

- Monitor API endpoint `/api/v1/price-monitoring/check-now`
- Track credit consumption
- Review AI usage logs in Admin Dashboard

#### Database

- Monitor `price_monitoring_jobs` table for failures
- Check `price_history` table for data gaps
- Review `ai_usage_logs` for anomalies

## Step 8: Maintenance

### Daily Tasks

- Check cron job execution: `SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 10;`
- Review error logs in Edge Function
- Monitor credit consumption

### Weekly Tasks

- Review price monitoring success rates
- Check for failed competitor sources
- Update scraping configs if needed
- Review AI usage analytics

### Monthly Tasks

- Analyze price trends
- Optimize scraping frequency
- Review and update competitor sources
- Check Firecrawl API usage and costs

## Related Documentation

- [Price Monitoring System](./price-monitoring-system.md)
- [Price Monitoring Backend Implementation](./price-monitoring-backend-implementation.md)
- [Edge Function README](../supabase/functions/price-monitoring-cron/README.md)
- [Environment Variables](../supabase/functions/price-monitoring-cron/.env.example)

## Support

For issues or questions:
1. Check Edge Function logs: `supabase functions logs price-monitoring-cron`
2. Check Python backend logs
3. Review database tables for errors
4. Check Firecrawl API status: https://status.firecrawl.dev
5. Review Supabase status: https://status.supabase.com
