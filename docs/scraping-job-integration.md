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

## Job Lifecycle

### 1. Job Creation

When a scraping session is created, the system first inserts a record into `background_jobs` with `job_type: 'web_scraping'`, `status: 'pending'`, `progress: 0`, `current_stage: 'initializing'`, and metadata containing `session_id`, `source_url`, `scraping_mode`, and `total_pages`. Then it inserts a record into `scraping_sessions` with a `background_job_id` linking it to the job tracking entry.

### 2. Job Processing

The job monitor service automatically:

1. **Detects pending jobs** and starts processing
2. **Updates heartbeat** every 30 seconds
3. **Tracks progress** (0-100%)
4. **Updates current_stage** (scraping, extracting, creating_products)
5. **Handles errors** with automatic retry

### 3. Error Recovery

If a job fails or gets stuck, the system applies automatic retry with exponential backoff (max 3 attempts, 2s base delay, 30s max delay), specifically handling `TimeoutError` and `ConnectionError` exceptions.

### 4. Stuck Job Detection

The job monitor service runs continuously and queries `background_jobs` for records with `status = 'processing'` and `last_heartbeat < NOW() - INTERVAL '5 minutes'`. For each stuck job found, it sends a Sentry alert and attempts recovery from the last checkpoint.

## Monitoring & Observability

### Metrics Already Tracked

✅ **Processing Times**: Tracked per page and per session
✅ **Success Rates**: Calculated from completed vs failed jobs
✅ **Error Rates**: Tracked in job_history and metrics
✅ **Throughput**: Jobs processed per minute
✅ **Queue Depth**: Number of pending jobs

### Health Checks

The batch job queue exposes a `getMetrics()` method returning `totalJobs`, `queuedJobs`, `processingJobs`, `completedJobs`, `failedJobs`, `throughputPerMinute`, `errorRate`, and `averageProcessingTime`.

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

1. **Batch Inserts for Pages**: Instead of inserting scraping pages one by one, process them in batches of 100 using a loop with `supabase.from('scraping_pages').insert(batch)`.

2. **Database Query Optimization**: Add a composite index on `scraping_pages(session_id, status)` to speed up common status queries for a given session.

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
