# Price Monitoring - Deployment & Testing Guide

## Architecture Overview

```
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
```

## Prerequisites

1. **Supabase Project** - Active Supabase project
2. **Python Backend** - FastAPI backend deployed and running
3. **Firecrawl API Key** - Get from [firecrawl.dev](https://firecrawl.dev)
4. **Database Migrations** - All price monitoring tables created

## Step 1: Database Setup

### Apply Migrations

```bash
cd material-kai-vision-platform

# Apply all migrations
supabase db push

# Verify tables exist
supabase db diff
```

### Verify Tables

Check that these tables exist:
- `price_monitoring_products`
- `price_history`
- `competitor_sources`
- `price_monitoring_jobs`
- `price_alerts`
- `price_alert_history`

### Verify Database Functions

Check that these functions exist:
- `get_products_due_for_monitoring()`
- `update_next_check_time(p_monitoring_id, p_frequency)`
- `should_trigger_alert(p_alert_id, p_old_price, p_new_price)`

## Step 2: Python Backend Configuration

### Environment Variables

Add to `mivaa-pdf-extractor/.env`:

```bash
# Firecrawl API Key
FIRECRAWL_API_KEY=fc-your-api-key-here

# Supabase Configuration (should already exist)
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
SUPABASE_JWT_SECRET=your-jwt-secret

# Material Kai API Key (should already exist)
MATERIAL_KAI_API_KEY=your-material-kai-api-key
MATERIAL_KAI_WORKSPACE_ID=your-workspace-id
```

### Verify Backend is Running

```bash
cd mivaa-pdf-extractor

# Start backend
python -m uvicorn app.main:app --reload --port 8000

# Test health endpoint
curl http://localhost:8000/health

# Test price monitoring endpoint (should return 401 without auth)
curl http://localhost:8000/api/v1/price-monitoring/status/test-id
```

## Step 3: Edge Function Deployment

### Set Secrets

```bash
# Set all required secrets
supabase secrets set SUPABASE_URL=https://your-project.supabase.co
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
supabase secrets set PYTHON_BACKEND_URL=http://localhost:8000  # or production URL
supabase secrets set CRON_SECRET=$(openssl rand -hex 32)

# Verify secrets are set
supabase secrets list
```

### Deploy Edge Function

```bash
# Deploy the cron function
supabase functions deploy price-monitoring-cron

# Verify deployment
supabase functions list
```

### Test Edge Function Manually

```bash
# Get your cron secret
CRON_SECRET=$(supabase secrets get CRON_SECRET)

# Test the function
curl -X POST https://your-project.supabase.co/functions/v1/price-monitoring-cron \
  -H "x-cron-secret: $CRON_SECRET" \
  -H "Content-Type: application/json"

# Expected response:
# {
#   "success": true,
#   "message": "Price monitoring completed: 0/0 succeeded",
#   "stats": {
#     "total": 0,
#     "processed": 0,
#     "succeeded": 0,
#     "failed": 0,
#     "results": []
#   },
#   "timestamp": "2025-12-25T15:30:00Z"
# }
```

## Step 4: Set Up Cron Schedule

### Option A: Supabase Dashboard

1. Go to **Database** → **Cron Jobs**
2. Click **Create a new cron job**
3. Configure:
   - **Name**: `price-monitoring-hourly`
   - **Schedule**: `0 * * * *` (every hour)
   - **Command**:
   ```sql
   SELECT net.http_post(
     url := 'https://your-project.supabase.co/functions/v1/price-monitoring-cron',
     headers := jsonb_build_object(
       'Content-Type', 'application/json',
       'x-cron-secret', 'your-cron-secret-here'
     )
   );
   ```

### Option B: SQL Command

```sql
SELECT cron.schedule(
  'price-monitoring-hourly',
  '0 * * * *',  -- Every hour
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

### Verify Cron Job

```sql
-- List all cron jobs
SELECT * FROM cron.job;

-- Check cron job runs
SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 10;
```

## Step 5: Testing the Complete Flow

### 1. Create Test Product Monitoring

```bash
# Use your JWT token
TOKEN="your-jwt-token-here"

# Start monitoring for a product
curl -X POST http://localhost:8000/api/v1/price-monitoring/start \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "product_id": "test-product-123",
    "frequency": "hourly",
    "enabled": true
  }'
```

### 2. Add Competitor Sources

```bash
# Add first competitor
curl -X POST http://localhost:8000/api/v1/price-monitoring/sources \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "product_id": "test-product-123",
    "source_name": "Amazon",
    "source_url": "https://www.amazon.com/dp/B08N5WRWNW",
    "scraping_config": {
      "waitFor": 2000,
      "timeout": 30000
    }
  }'

# Add second competitor
curl -X POST http://localhost:8000/api/v1/price-monitoring/sources \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "product_id": "test-product-123",
    "source_name": "Wayfair",
    "source_url": "https://www.wayfair.com/furniture/pdp/example.html"
  }'
```

### 3. Trigger Manual Price Check

```bash
# Check prices now
curl -X POST http://localhost:8000/api/v1/price-monitoring/check-now \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "product_id": "test-product-123",
    "product_name": "Premium Leather Sofa"
  }'

# Expected response:
# {
#   "success": true,
#   "message": "Checked 2 sources",
#   "job_id": "uuid",
#   "sources_checked": 2,
#   "prices_found": 2,
#   "credits_consumed": 2
# }
```

### 4. Verify Database Records

```sql
-- Check price history
SELECT * FROM price_history 
WHERE product_id = 'test-product-123' 
ORDER BY scraped_at DESC;

-- Check monitoring jobs
SELECT * FROM price_monitoring_jobs 
WHERE product_id = 'test-product-123' 
ORDER BY created_at DESC;

-- Check AI usage logs
SELECT * FROM ai_usage_logs
WHERE provider = 'firecrawl'
ORDER BY created_at DESC;
```

### 5. Test Cron Job Execution

```bash
# Manually trigger the cron job
CRON_SECRET=$(supabase secrets get CRON_SECRET)

curl -X POST https://your-project.supabase.co/functions/v1/price-monitoring-cron \
  -H "x-cron-secret: $CRON_SECRET" \
  -H "Content-Type: application/json"

# Check Edge Function logs
supabase functions logs price-monitoring-cron --tail

# Check Python backend logs
# (in your Python backend terminal)
```

### 6. Verify Cron Schedule

```sql
-- Check if cron job is scheduled
SELECT * FROM cron.job WHERE jobname = 'price-monitoring-hourly';

-- Check recent cron job runs
SELECT
  jobid,
  runid,
  job_pid,
  database,
  username,
  command,
  status,
  return_message,
  start_time,
  end_time
FROM cron.job_run_details
WHERE jobid = (SELECT jobid FROM cron.job WHERE jobname = 'price-monitoring-hourly')
ORDER BY start_time DESC
LIMIT 10;
```

## Step 6: Monitoring & Troubleshooting

### Check Edge Function Logs

```bash
# View real-time logs
supabase functions logs price-monitoring-cron --tail

# View last 100 logs
supabase functions logs price-monitoring-cron --limit 100
```

### Check Python Backend Logs

```bash
# If using systemd
sudo journalctl -u mivaa-backend -f

# If using Docker
docker logs -f mivaa-backend

# If running locally
# Check terminal output
```

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
- Regenerate secret if needed:
  ```bash
  supabase secrets set CRON_SECRET=$(openssl rand -hex 32)
  ```

#### 3. Python Backend Not Responding

**Symptoms**: Edge Function logs show connection errors

**Solutions**:
- Verify `PYTHON_BACKEND_URL` is correct
- Check Python backend is running: `curl http://localhost:8000/health`
- Check firewall rules allow Edge Function → Backend communication
- For production, ensure backend URL is publicly accessible

#### 4. No Products Being Processed

**Symptoms**: "Found 0 products due for monitoring"

**Solutions**:
- Check `price_monitoring_products` table has records
- Verify `monitoring_enabled = true`
- Verify `next_check_at <= NOW()`
- Check product monitoring status:
  ```sql
  SELECT
    product_id,
    monitoring_enabled,
    monitoring_frequency,
    next_check_at,
    status
  FROM price_monitoring_products
  WHERE monitoring_enabled = true;
  ```

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

```bash
# Production Python backend URL
supabase secrets set PYTHON_BACKEND_URL=https://api.yourdomain.com

# Verify all secrets
supabase secrets list
```

### 2. Deploy Edge Function

```bash
# Deploy to production
supabase functions deploy price-monitoring-cron --project-ref your-project-ref

# Verify deployment
supabase functions list --project-ref your-project-ref
```

### 3. Update Cron Schedule

Update the cron job to use production URL:

```sql
-- Delete old cron job
SELECT cron.unschedule('price-monitoring-hourly');

-- Create new cron job with production URL
SELECT cron.schedule(
  'price-monitoring-hourly',
  '0 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://your-project.supabase.co/functions/v1/price-monitoring-cron',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', 'your-production-cron-secret'
    )
  );
  $$
);
```

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



