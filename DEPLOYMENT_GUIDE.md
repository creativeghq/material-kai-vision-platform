# Material Agent Orchestrator - Deployment Guide

## Pre-Deployment Checklist

- [ ] All environment variables configured in Supabase
- [ ] JWT_SECRET matches your authentication setup
- [ ] MIVAA_API_URL and MIVAA_API_KEY are valid
- [ ] Database tables exist (agent_tasks, material_agents, workspace_members)
- [ ] Service role key has proper permissions
- [ ] Backup of current function created (if applicable)

## Step 1: Verify Local Setup

```bash
# Navigate to project root
cd material-kai-vision-platform

# Verify Supabase CLI is installed
supabase --version

# Verify function files exist
ls -la supabase/functions/material-agent-orchestrator/
```

Expected output:
```
index.ts
README.md
test.ts
```

## Step 2: Configure Environment Variables

### In Supabase Dashboard

1. Go to **Project Settings** → **Edge Functions**
2. Click **material-agent-orchestrator**
3. Add the following environment variables:

```
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
JWT_SECRET=your-jwt-secret-key
MIVAA_API_URL=https://mivaa-api.example.com
MIVAA_API_KEY=your-mivaa-api-key
```

### Verify Variables

```bash
# List configured environment variables
supabase secrets list
```

## Step 3: Deploy the Function

### Option A: Using Supabase CLI (Recommended)

```bash
# Deploy the function
supabase functions deploy material-agent-orchestrator

# Expected output:
# ✓ Function deployed successfully
# Endpoint: https://your-project.supabase.co/functions/v1/material-agent-orchestrator
```

### Option B: Using Supabase Dashboard

1. Go to **Edge Functions**
2. Click **material-agent-orchestrator**
3. Click **Deploy**
4. Wait for deployment to complete

## Step 4: Verify Deployment

### Check Function Status

```bash
# View function details
supabase functions describe material-agent-orchestrator

# Expected output:
# Name: material-agent-orchestrator
# Status: Active
# Endpoint: https://your-project.supabase.co/functions/v1/material-agent-orchestrator
```

### Check Logs

```bash
# View recent logs
supabase functions logs material-agent-orchestrator --limit 50

# Expected: No errors, function ready to receive requests
```

## Step 5: Test the Deployment

### Test with cURL

```bash
# Get a valid JWT token first
# Then test the function

curl -X POST \
  https://your-project.supabase.co/functions/v1/material-agent-orchestrator \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": "test-user-id",
    "task_type": "material_search",
    "input_data": {
      "query": "ceramic materials for kitchen"
    }
  }'

# Expected response:
# {
#   "success": true,
#   "task_id": "uuid",
#   "coordinated_result": {...},
#   "agent_executions": [...],
#   "overall_confidence": 0.85,
#   "total_processing_time_ms": 2500
# }
```

### Test with Frontend

1. Open the Material Kai Vision Platform
2. Navigate to SearchHub component
3. Enter a search query
4. Verify response is received and displayed
5. Check browser console for any errors

## Step 6: Monitor Performance

### Check Task Execution History

```sql
-- Query agent_tasks table
SELECT 
  id,
  task_type,
  task_status,
  processing_time_ms,
  created_at
FROM agent_tasks
WHERE created_at > NOW() - INTERVAL '1 hour'
ORDER BY created_at DESC
LIMIT 10;
```

### Check Agent Metrics

```sql
-- Query material_agents table
SELECT 
  id,
  performance_metrics,
  updated_at
FROM material_agents
ORDER BY updated_at DESC;
```

### Monitor Logs

```bash
# Real-time log monitoring
supabase functions logs material-agent-orchestrator --follow

# Filter by error level
supabase functions logs material-agent-orchestrator --level error
```

## Step 7: Troubleshooting

### Issue: 401 Unauthorized

**Cause**: Invalid or missing JWT token

**Solution**:
1. Verify JWT_SECRET is set correctly
2. Check token expiration
3. Validate token format

```bash
# Test with valid token
curl -X POST \
  https://your-project.supabase.co/functions/v1/material-agent-orchestrator \
  -H "Authorization: Bearer $(supabase auth get-token)" \
  -H "Content-Type: application/json" \
  -d '{...}'
```

### Issue: 400 Bad Request

**Cause**: Missing required fields

**Solution**:
1. Verify request includes: user_id, task_type, input_data
2. Check input_data structure
3. Validate JSON format

```bash
# Verify request format
curl -X POST \
  https://your-project.supabase.co/functions/v1/material-agent-orchestrator \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": "user-123",
    "task_type": "material_search",
    "input_data": {
      "query": "test"
    }
  }'
```

### Issue: 500 Internal Server Error

**Cause**: Function execution error

**Solution**:
1. Check Supabase logs for error details
2. Verify environment variables are set
3. Check database connectivity
4. Verify MIVAA API is accessible

```bash
# View detailed error logs
supabase functions logs material-agent-orchestrator --limit 100
```

### Issue: Slow Response Time

**Cause**: MIVAA API latency or agent execution time

**Solution**:
1. Check MIVAA API response time
2. Monitor agent execution times in agent_tasks
3. Consider caching coordination plans
4. Optimize agent selection logic

## Step 8: Rollback (If Needed)

### Rollback to Previous Version

```bash
# If you have a backup of the previous function
supabase functions deploy material-agent-orchestrator --code-path ./backup/index.ts

# Or redeploy from git history
git checkout HEAD~1 supabase/functions/material-agent-orchestrator/index.ts
supabase functions deploy material-agent-orchestrator
```

## Performance Baseline

After deployment, you should see:

- **Response Time**: 2-5 seconds (typical)
- **Success Rate**: >99%
- **Agent Executions**: 1-2 per second
- **Database Operations**: <200ms
- **Error Rate**: <1%

## Monitoring Dashboard

Create a monitoring dashboard to track:

1. **Task Execution Count**
   ```sql
   SELECT COUNT(*) as total_tasks FROM agent_tasks;
   ```

2. **Average Processing Time**
   ```sql
   SELECT AVG(processing_time_ms) as avg_time FROM agent_tasks;
   ```

3. **Success Rate**
   ```sql
   SELECT 
     COUNT(CASE WHEN task_status = 'completed' THEN 1 END) * 100.0 / COUNT(*) as success_rate
   FROM agent_tasks;
   ```

4. **Agent Performance**
   ```sql
   SELECT 
     id,
     (performance_metrics->>'total_executions')::int as executions,
     (performance_metrics->>'average_confidence')::float as avg_confidence
   FROM material_agents
   ORDER BY executions DESC;
   ```

## Post-Deployment Verification

- [ ] Function is active and responding
- [ ] Logs show no errors
- [ ] agent_tasks table has execution records
- [ ] material_agents table has metrics
- [ ] Frontend component receives responses
- [ ] Response times are acceptable
- [ ] Error handling works correctly
- [ ] Database operations complete successfully

## Support

For issues or questions:

1. Check Supabase logs: `supabase functions logs material-agent-orchestrator`
2. Review error messages in agent_tasks table
3. Verify environment variables are set
4. Check database connectivity
5. Validate MIVAA API access

## Deployment Complete ✅

Once all steps are completed and verified, the Material Agent Orchestrator is ready for production use.

**Deployment Status**: Ready for Production
**Last Updated**: 2025-10-19

