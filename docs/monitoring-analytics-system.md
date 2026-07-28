# Monitoring & Analytics System

Comprehensive real-time monitoring and analytics infrastructure for the Material Kai Vision Platform.

---

## 🎯 Overview

The platform includes a complete monitoring and analytics system that tracks:
- **PDF Processing Jobs** - Real-time job tracking with 9 checkpoint stages
- **AI Model Usage** - Cost tracking, model performance, and usage statistics
- **Search Analytics** - Query patterns, response times, and user behavior
- **System Performance** - API latency, error rates, and uptime metrics
- **Agent Chat Analytics** - Agent responses, quality ratings, and costs

---

## 📊 Admin Dashboards

### 1. PDF Processing Monitor (`/admin/async-queue-monitor`)

**Purpose**: Real-time monitoring of PDF processing jobs and pipeline stages

**Features**:
- ✅ Real-time job status updates (no refresh needed)
- ✅ 4 overview cards: Total Documents, Products Created, Success Rate, Avg Processing Time
- ✅ Job status breakdown (Pending, Processing, Completed, Failed, Retrying)
- ✅ Recent jobs list with progress percentages
- ✅ Processing stages analytics
- ✅ Failed jobs section with error details
- ✅ Auto-refresh with Supabase real-time subscriptions

**Data Sources**:
- `background_jobs` table - Main job tracking (including `stage_history` JSONB for stage-by-stage progress; `job_checkpoints` was dropped 2026-04-25)

**Metrics Tracked**: For `pdf_processing`, the system tracks pending, processing, completed, failed, retrying, and total job counts, plus success rate and average processing time. At the platform level it tracks total documents, total products created, total chunks created, and total images extracted.

**Real-Time Updates**:
- Supabase real-time subscription on `background_jobs` table
- Automatic UI updates when job status changes
- Backup polling every 10 seconds

---

### 2. Analytics Dashboard (`/admin/analytics`)

**Purpose**: Comprehensive analytics across search, API usage, PDF processing, and quality metrics

**Tabs**:

**Search Analytics**:
- Total searches performed
- Average response time
- Top search queries
- Search success rate
- Query patterns and trends
- **Weight profile distribution** — tracks which dynamic weight profiles are selected (product_name, color_finish, specification, texture_pattern, style_aesthetic, material_search, balanced)
- **Dynamic weights per query** — `search_query_tracking` table stores `weight_profile`, `dynamic_weights` (JSONB), and `weight_profile_source` (default, query_understanding, manual_override)

**API Usage**:
- Total API calls
- Calls by endpoint
- Response time distribution
- Error rate tracking
- Rate limit monitoring

**Agent Chat Analytics**:
- Total chat interactions
- Average response time
- Positive/negative ratings
- Estimated costs per model
- Agent performance metrics

**Quality Metrics**:
- Chunk quality scores (92%)
- Search precision (87%)
- Data stability (99.2%)
- User satisfaction (4.2/5)

**PDF Processing**:
- Documents processed
- Products extracted
- Processing success rate
- Average processing time

---

### 3. AI Monitoring Dashboard (`/admin/ai-monitoring`)

**Purpose**: Track AI model usage, costs, and performance

**Metrics**:
- **Cost Tracking**: Real-time cost per model (Claude, GPT).6.
- **Model Usage**: API calls by model and endpoint
- **Confidence Scores**: Distribution of AI confidence scores
- **Latency Metrics**: Response times per model
- **Fallback Rates**: When primary models fail and fallbacks are used

**Time Periods**: 24h, 7d, 30d, 90d

**Models Tracked**:
- Claude Opus 4.7
- Claude Haiku 4.5
- GPT-4o
- GPT-5
- Claude Sonnet 4.6
- Voyage AI voyage-4 (updated 2026-04 — replaced OpenAI text-embedding-3-small)
- PaddleOCR-VL on Modal (layout+OCR backbone post-2026-06-13; replaced Surya-2, which had replaced Chandra v2)


---

## 🔄 Real-Time Job Tracking

### Background Jobs System

**Table**: `background_jobs`

**Columns**: `id`, `workspace_id`, `document_id`, `job_type` (pdf_processing, image_analysis, etc.), `status` (pending, processing, completed, failed, retrying, cancelled), `progress` (0-100), `created_at`, `started_at`, `completed_at`, `failed_at`, `error`, and `metadata` JSONB.

The `metadata` JSONB field contains: `filename`, `stage`, `products_discovered`, `chunks_created`, `images_extracted`, `embeddings_generated`, `processing_time_ms`, `ai_model`, and `retry_count`.

---

## 📈 Monitoring Integration

### Stage 0: Product Discovery

**Metrics Tracked**:
- `products_discovered` - Number of products found
- `certificates_discovered` - Number of certificates found
- `logos_discovered` - Number of logos found
- `specifications_discovered` - Number of specifications found
- `total_entities` - Total entities across all categories
- `discovery_time_ms` - Processing time
- `discovery_model` - AI model used
- `confidence_score` - Overall confidence

Stage 0 logs completion details and saves checkpoint metadata including all of the above metrics.

---

### Stage 1: Focused Extraction

**Metrics Tracked**:
- `extracted_pages_count` - Number of pages extracted
- `total_pages_count` - Total pages in PDF
- `text_length` - Length of extracted text
- `extraction_rate` - Percentage of pages extracted
- `focused_extraction` - Boolean flag

Stage 1 logs pages extracted, extraction rate percentage, and text length in characters.

---

### Stage 3.5: Embedding-to-Text Conversion

**Purpose**: Convert visual embeddings to text descriptions for enhanced search

**Metrics Tracked**:
- `embedding_to_text_count` - Successful conversions
- `embedding_to_text_failed` - Failed conversions
- `embedding_to_text_ai_calls` - AI API calls made
- `visual_metadata_extracted` - Boolean flag

Stage 3.5 logs successful conversions, failed conversions, and AI calls made.

---

### Stage 4: Metadata Consolidation

**Purpose**: Consolidate metadata from all sources (discovery, extraction, embeddings)

**Metrics Tracked**:
- `metadata_consolidation_count` - Products consolidated
- `metadata_consolidation_failed` - Failed consolidations
- `metadata_consolidation_ai_calls` - AI API calls made
- `metadata_sources_merged` - Number of sources merged

Stage 4 logs products consolidated, sources merged, and AI calls made.

---

## 🎯 Stage History & Checkpoint System

### Stage-level audit via background_jobs JSONB (post 2026-04-25)

> The `job_checkpoints` table was **dropped** in the 2026-04-25 single-table migration. All stage data now lives as JSONB on `background_jobs`:

- **`stage_history`** — append-only array of stage events. Each entry carries `stage`, `status`, `started_at`, `completed_at`, `attempt`, `data`, `metadata`, `source`. Capped at 100 entries.
- **`last_checkpoint`** — the resume snapshot (last successfully completed stage data). Used by auto-recovery to know where to restart.
- **`recovery_history`** — append-only log of auto-recovery attempts.

Stage names written to `stage_history` include: `initialized`, `pdf_extracted`, `chunks_created`, `text_embeddings_generated`, `images_extracted`, `image_embeddings_generated`, `products_detected`, `products_created`, `completed`.

Each stage event carries a `data` payload (e.g., `document_id`, `images_extracted`, `material_images`) and a `metadata` payload (e.g., `processing_time_ms`, `ai_model`, `success_rate`).

---

## 📊 Sentry Integration

### Exception Tracking

All stages integrate with Sentry for exception capture. Any exception raised during processing is captured by `sentry_sdk.capture_exception()`, logged, and re-raised. Sentry receives the job ID, document ID, current stage, processing metrics, and error stack trace as context.

---

## 🔍 Search Analytics

### Query Tracking

**Table**: `search_queries`

**Metrics**:
- Query text
- Response time
- Results count
- User satisfaction
- Filters applied
- Search strategy used

**Analytics**:
- Top search queries
- Average response time
- Success rate
- Query patterns
- User behavior

---

## 💰 Cost Tracking

### AI Model Costs

**Per Model Pricing**:
- Claude Opus 4.7: $15.00 / 1M input tokens, $75.00 / 1M output tokens
- Claude Haiku 4.5: $0.80 / 1M input tokens, $4.00 / 1M output tokens
- GPT-4o: $2.50 / 1M input tokens, $10.00 / 1M output tokens
- Voyage AI voyage-4: $0.06 / 1M tokens (sole production text embedder as of 2026-04)


Cost calculation multiplies token counts by per-million rates for input and output separately, then sums them.

---

## 📈 Performance Metrics

### System-Wide Metrics

**Uptime**: 99.5%+
**Users**: 5,000+
**Search Response**: 200-800ms
**PDF Processing**: 1-15 minutes (size-dependent)
**Concurrent Jobs**: Unlimited queue

**Accuracy**:
- Product Detection: 95%+
- Search Accuracy: 85%+
- Material Recognition: 90%+
- Image Classification: 88%+

---

## 🔔 Alerts & Notifications

### Alert Types

**Critical Alerts**:
- API down (>5 minutes)
- Database connection lost
- OOM errors
- Job stuck (>30 minutes)

**Warning Alerts**:
- High error rate (>5%)
- Slow response times (>2s)
- Low success rate (<90%)
- High AI costs (>$100/day)

**Notification Channels**:
- Sentry (exception tracking)
- Email (critical alerts)
- Dashboard (real-time metrics)

---

## 🏥 System Health Monitoring

### Overview

Comprehensive health monitoring system that tracks database performance, job monitoring service, and system reliability.

**Access**: `/admin/analytics` → System Health tab

### Features

#### 1. **Database Health Monitoring**
- ✅ Connection pool health checks every 30 seconds
- ✅ Query performance tracking
- ✅ Slow query detection (>1000ms threshold)
- ✅ Error count and consecutive failure tracking
- ✅ Uptime monitoring

**Metrics**: `healthy` boolean, `connection_test_ms`, `query_test_ms`, `error_count`, `consecutive_failures`, `uptime_seconds`, and `performance` object with `avg_query_time_ms`, `max_query_time_ms`, `slow_query_count`, and `slow_query_threshold_ms` (1000).

#### 2. **Job Monitor Health**
- ✅ Monitor service status (running/stopped)
- ✅ Stuck job detection
- ✅ Health status (healthy/degraded/unhealthy)

**Metrics**: `monitor_running` boolean, `stuck_jobs_count`, and `health` string ('healthy', 'degraded', or 'unhealthy').

#### 3. **Query Performance Metrics**
- ✅ Total queries executed
- ✅ Slow query percentage
- ✅ Average/min/max query times
- ✅ Per-table statistics
- ✅ Recent slow queries log

**Metrics**: `total_queries`, `slow_queries`, `slow_query_percentage`, `avg_query_time_ms`, `max_query_time_ms`, and `table_metrics` (per-table counts, avg/max times, and slow query counts).

#### 4. **Circuit Breaker Status**
- ✅ Prevents cascading failures
- ✅ Automatic recovery detection
- ✅ Fail-fast when database is down

**States**:
- **CLOSED**: Normal operation
- **OPEN**: Failing fast (database down)
- **HALF_OPEN**: Testing recovery

**Metrics**: `state` ('closed', 'open', or 'half_open') and `failure_count`.

### Health Check API Endpoints

#### `GET /health/`
Basic health check - returns 200 if service is running.

#### `GET /health/detailed`
Comprehensive health status with all subsystems: `overall_status`, `database`, `job_monitor`, `query_metrics`, `circuit_breaker`, and `timestamp`.

#### `GET /health/database`
Database connection health only.

#### `GET /health/job-monitor`
Job monitoring service health only.

#### `GET /health/metrics`
Query performance metrics only.

#### `GET /health/circuit-breakers`
Circuit breaker status for all protected services.

#### `POST /health/metrics/reset`
Reset query performance metrics (useful for testing).

### Database Performance Optimizations

#### Indexes Added (2025-01-20)

Six critical indexes to optimize job monitoring queries:

1. **Stuck Job Detection** (`idx_background_jobs_status_updated_at`)
   - Query: `WHERE status = 'processing' AND updated_at < cutoff_time`
   - Performance: 500-900ms → 5-20ms (95-98% faster)

2. **Heartbeat Timeout Detection** (`idx_background_jobs_status_heartbeat`)
   - Query: `WHERE status = 'processing' AND last_heartbeat < cutoff_time`
   - Performance: 500-900ms → 5-20ms (95-98% faster)

3. **Workspace + Status Queries** (`idx_background_jobs_workspace_status`)
   - Query: `WHERE workspace_id = ? AND status = ?`
   - Composite index on (workspace_id, status, created_at DESC)

4. **Job Cleanup** (`idx_background_jobs_status_completed_at`)
   - Query: `WHERE status = 'completed' AND completed_at < cutoff_time`
   - Partial index for completed jobs only

5. **stage_history / last_checkpoint** — these are JSONB columns on `background_jobs` (the `job_checkpoints` table was dropped 2026-04-25); no separate index needed — queries access them via the row's primary key.

6. **Progress Tracking** — progress percent is a column on `background_jobs` itself; the `job_progress` table was dropped 2026-04-25.

**Impact**:
- Before: Queries scanning 1000s of rows → 500-900ms (timeout)
- After: Index scan → 5-20ms
- **Overall improvement: 95-98% faster queries**

### Resilience Features

#### 1. **Retry Logic with Exponential Backoff**
- Automatic retry for transient failures
- Exponential backoff: 2s → 4s → 8s
- Random jitter to prevent thundering herd
- Configurable retry conditions

#### 2. **Circuit Breaker Pattern**
- Prevents cascading failures when database is down
- Failure threshold: 5 failures → OPEN
- Recovery timeout: 60 seconds
- Success threshold: 2 successes → CLOSED

#### 3. **Graceful Degradation**
- Job monitor failures don't crash API
- Automatic recovery when database is healthy
- Fail-fast behavior reduces resource waste

### Monitoring & Alerts

#### Recommended Alerts

1. **Database Health**
   - Alert if `database.healthy = false` for > 5 minutes
   - Alert if `avg_query_time_ms > 500` for > 10 minutes

2. **Circuit Breaker**
   - Alert if `circuit_breaker.state = "open"` for > 5 minutes

3. **Slow Queries**
   - Alert if `slow_query_percentage > 20%`

4. **Job Monitor**
   - Alert if `stuck_jobs_count > 5`
   - Alert if `monitor_running = false`

#### Sentry Issues Fixed

- **MIVAA-4Z**: Database timeout errors (12 occurrences) - Fixed with indexes
- **MIVAA-51**: Cloudflare gateway errors - Fixed with retry logic
- **MIVAA-50**: JSON generation errors - Fixed with circuit breaker

---

**Last Updated**: 2025-01-20
**Version**: 2.0.0
**Status**: Production
**Coverage**: All pipeline stages, admin dashboards, monitoring systems, and health checks
