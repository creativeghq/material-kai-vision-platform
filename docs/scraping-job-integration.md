# Web Scraping Job Integration

## Overview

The web scraping system is fully integrated with the platform's unified job tracking infrastructure, providing:

- ✅ **Automatic retry** with exponential backoff
- ✅ **Progress tracking** with real-time updates
- ✅ **Error recovery** from checkpoints
- ✅ **Stuck job detection** and auto-recovery
- ✅ **Monitoring & alerting** via Sentry
- ✅ **Performance metrics** (processing times, success rates, error rates)

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Scraping Session                          │
│  ┌────────────────────────────────────────────────────────┐ │
│  │  scraping_sessions                                      │ │
│  │  - id, source_url, status                              │ │
│  │  - background_job_id  ← Links to job tracking         │ │
│  │  - workspace_id                                        │ │
│  │  - progress_percentage, total_pages                    │ │
│  └────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│              Unified Job Tracking System                     │
│  ┌────────────────────────────────────────────────────────┐ │
│  │  background_jobs                                        │ │
│  │  - id, job_type: 'web_scraping'                        │ │
│  │  - status, progress, current_stage                     │ │
│  │  - last_heartbeat (updated every 30s)                  │ │
│  │  - metadata (session_id, scraping_mode, etc.)          │ │
│  └────────────────────────────────────────────────────────┘ │
│                                                              │
│  Features:                                                   │
│  • Automatic retry (3 attempts with exponential backoff)    │
│  • Stuck job detection (no heartbeat > 5 min)               │
│  • Dead letter queue for failed jobs                        │
│  • Circuit breaker for external services                    │
│  • Sentry integration for crash alerts                      │
└─────────────────────────────────────────────────────────────┘
```

## Job Lifecycle

### 1. Job Creation

When a scraping session is created:

```typescript
// 1. Create background job
const jobData = {
  id: jobId,
  workspace_id: workspaceId,
  job_type: 'web_scraping',
  status: 'pending',
  progress: 0,
  current_stage: 'initializing',
  metadata: {
    session_id: sessionId,
    source_url: sourceUrl,
    scraping_mode: scrapingMode,
    total_pages: urls.length,
  },
};

await supabase.from('background_jobs').insert([jobData]);

// 2. Create scraping session linked to job
const sessionData = {
  id: sessionId,
  background_job_id: jobId,  // ← Link to job tracking
  workspace_id: workspaceId,
  source_url: sourceUrl,
  status: 'pending',
  // ... other fields
};

await supabase.from('scraping_sessions').insert([sessionData]);
```

### 2. Job Processing

The job monitor service automatically:

1. **Detects pending jobs** and starts processing
2. **Updates heartbeat** every 30 seconds
3. **Tracks progress** (0-100%)
4. **Updates current_stage** (scraping, extracting, creating_products)
5. **Handles errors** with automatic retry

### 3. Error Recovery

If a job fails or gets stuck:

```python
# Automatic retry with exponential backoff
@retry_async(
    max_attempts=3,
    base_delay=2.0,
    max_delay=30.0,
    exceptions=(TimeoutError, ConnectionError)
)
async def process_scraping_session(session_id: str):
    # Processing logic
    pass
```

### 4. Stuck Job Detection

The job monitor service runs continuously:

```python
# Detects jobs stuck for > 5 minutes
async def detect_stuck_jobs():
    stuck_jobs = await db.query("""
        SELECT * FROM background_jobs
        WHERE status = 'processing'
          AND last_heartbeat < NOW() - INTERVAL '5 minutes'
    """)
    
    for job in stuck_jobs:
        # Send Sentry alert
        sentry_sdk.capture_message(f"Stuck job detected: {job.id}")
        
        # Attempt recovery from checkpoint
        await checkpoint_recovery_service.recover_job(job.id)
```

## Monitoring & Observability

### Metrics Already Tracked

✅ **Processing Times**: Tracked per page and per session
✅ **Success Rates**: Calculated from completed vs failed jobs
✅ **Error Rates**: Tracked in job_history and metrics
✅ **Throughput**: Jobs processed per minute
✅ **Queue Depth**: Number of pending jobs

### Health Checks

The system already has:

```typescript
// Get job metrics
const metrics = batchJobQueue.getMetrics();
// Returns:
// {
//   totalJobs: 150,
//   queuedJobs: 10,
//   processingJobs: 5,
//   completedJobs: 130,
//   failedJobs: 5,
//   throughputPerMinute: 12,
//   errorRate: 0.03,
//   averageProcessingTime: 2500
// }
```

### Alerting

Sentry alerts are automatically sent for:

- ❌ Job crashes
- ⚠️ Stuck jobs (no progress > 5 min)
- 🔥 Circuit breaker open (service unavailable)
- ⏱️ Timeouts
- 🔄 Max retries exceeded

## Performance Optimizations

### Already Implemented

✅ **Batch Processing**: Process multiple pages concurrently
✅ **Connection Pooling**: Supabase client uses connection pooling
✅ **Circuit Breaker**: Prevents cascading failures
✅ **Rate Limiting**: Configurable delays between batches
✅ **Timeout Protection**: Prevents hanging requests

### Recommended Additions

1. **Batch Inserts for Pages**:
```typescript
// Instead of inserting pages one by one
const BATCH_SIZE = 100;
for (let i = 0; i < urls.length; i += BATCH_SIZE) {
  const batch = urls.slice(i, i + BATCH_SIZE);
  await supabase.from('scraping_pages').insert(batch);
}
```

2. **Database Query Optimization**:
```sql
-- Add composite index for common queries
CREATE INDEX idx_scraping_pages_session_status 
ON scraping_pages(session_id, status);
```

## Summary

### ✅ What We Already Have

- Complete job tracking infrastructure
- Automatic retry and error recovery
- Stuck job detection and alerts
- Performance metrics and monitoring
- Sentry integration for crash alerts

### 🔧 What We Just Added

- `background_job_id` link in `scraping_sessions`
- Automatic background job creation for scraping sessions
- Integration with unified job tracking system

### 📊 What We Don't Need to Build

- ❌ Custom retry logic (already exists)
- ❌ Custom monitoring (already exists)
- ❌ Custom alerting (already exists via Sentry)
- ❌ Custom metrics (already tracked)

The scraping system now leverages the existing, battle-tested job infrastructure used by PDF processing!

