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
- `background_jobs` table - Main job tracking
- `job_checkpoints` table - Stage-by-stage progress

**Metrics Tracked**:
```typescript
{
  pdf_processing: {
    pending: number,
    processing: number,
    completed: number,
    failed: number,
    retrying: number,
    total: number,
    success_rate: number,
    avg_processing_time: number
  },
  total_documents: number,
  total_products_created: number,
  total_chunks_created: number,
  total_images_extracted: number
}
```

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
- **Cost Tracking**: Real-time cost per model (Claude, GPT, Qwen)
- **Model Usage**: API calls by model and endpoint
- **Confidence Scores**: Distribution of AI confidence scores
- **Latency Metrics**: Response times per model
- **Fallback Rates**: When primary models fail and fallbacks are used

**Time Periods**: 24h, 7d, 30d, 90d

**Models Tracked**:
- Claude Sonnet 4.5
- Claude Haiku 4.5
- GPT-4o
- GPT-5
- Qwen3-VL 17B Vision
- OpenAI text-embedding-3-small

---

## 🔄 Real-Time Job Tracking

### Background Jobs System

**Table**: `background_jobs`

**Columns**:
```sql
id: UUID
workspace_id: UUID
document_id: UUID
job_type: TEXT (pdf_processing, image_analysis, etc.)
status: TEXT (pending, processing, completed, failed, retrying, cancelled)
progress: INTEGER (0-100)
created_at: TIMESTAMP
started_at: TIMESTAMP
completed_at: TIMESTAMP
failed_at: TIMESTAMP
error: TEXT
metadata: JSONB
```

**Metadata Fields**:
```json
{
  "filename": "harmony.pdf",
  "stage": "IMAGES_EXTRACTED",
  "products_discovered": 14,
  "chunks_created": 229,
  "images_extracted": 249,
  "embeddings_generated": 750,
  "processing_time_ms": 180000,
  "ai_model": "claude-sonnet-4-5",
  "retry_count": 0
}
```

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

**Logging**:
```python
logger.info(f"✅ [STAGE 0] Discovery Complete:")
logger.info(f"   Products: {products_discovered}")
logger.info(f"   Total Entities: {total_entities}")
logger.info(f"   Model: {discovery_model}")
logger.info(f"   Time: {discovery_time_ms}ms")
```

**Checkpoint Metadata**:
```json
{
  "products_discovered": 14,
  "certificates_discovered": 2,
  "logos_discovered": 3,
  "specifications_discovered": 1,
  "total_entities": 20,
  "discovery_time_ms": 5000,
  "discovery_model": "claude-sonnet-4-5",
  "confidence_score": 0.95
}
```

---

### Stage 1: Focused Extraction

**Metrics Tracked**:
- `extracted_pages_count` - Number of pages extracted
- `total_pages_count` - Total pages in PDF
- `text_length` - Length of extracted text
- `extraction_rate` - Percentage of pages extracted
- `focused_extraction` - Boolean flag

**Logging**:
```python
logger.info(f"✅ [STAGE 1] Focused Extraction Complete:")
logger.info(f"   Pages Extracted: {extracted_pages_count}/{total_pages_count}")
logger.info(f"   Extraction Rate: {extraction_rate}%")
logger.info(f"   Text Length: {text_length} chars")
```

---

### Stage 3.5: Embedding-to-Text Conversion

**Purpose**: Convert visual embeddings to text descriptions for enhanced search

**Metrics Tracked**:
- `embedding_to_text_count` - Successful conversions
- `embedding_to_text_failed` - Failed conversions
- `embedding_to_text_ai_calls` - AI API calls made
- `visual_metadata_extracted` - Boolean flag

**Logging**:
```python
logger.info(f"✅ [STAGE 3.5] Embedding-to-Text Complete:")
logger.info(f"   Successful: {embedding_to_text_count}")
logger.info(f"   Failed: {embedding_to_text_failed}")
logger.info(f"   AI Calls: {embedding_to_text_ai_calls}")
```

---

### Stage 4: Metadata Consolidation

**Purpose**: Consolidate metadata from all sources (discovery, extraction, embeddings)

**Metrics Tracked**:
- `metadata_consolidation_count` - Products consolidated
- `metadata_consolidation_failed` - Failed consolidations
- `metadata_consolidation_ai_calls` - AI API calls made
- `metadata_sources_merged` - Number of sources merged

**Logging**:
```python
logger.info(f"✅ [STAGE 4] Metadata Consolidation Complete:")
logger.info(f"   Products Consolidated: {metadata_consolidation_count}")
logger.info(f"   Sources Merged: {metadata_sources_merged}")
logger.info(f"   AI Calls: {metadata_consolidation_ai_calls}")
```

---

## 🎯 Checkpoint System

### 9 Processing Checkpoints

All stages save comprehensive metrics to checkpoints for recovery:

1. **INITIALIZED** - Job created
2. **PDF_EXTRACTED** - Stage 1 complete (focused extraction)
3. **CHUNKS_CREATED** - Stage 2 complete (chunking)
4. **TEXT_EMBEDDINGS_GENERATED** - Stage 3 complete (text embeddings)
5. **IMAGES_EXTRACTED** - Stage 5 complete (image extraction)
6. **IMAGE_EMBEDDINGS_GENERATED** - Stage 7 complete (CLIP embeddings)
7. **PRODUCTS_DETECTED** - Stage 0 complete (product discovery)
8. **PRODUCTS_CREATED** - Stage 9 complete (product creation)
9. **COMPLETED** - All stages complete

**Checkpoint Data Structure**:
```json
{
  "stage": "IMAGES_EXTRACTED",
  "checkpoint_data": {
    "document_id": "uuid",
    "images_extracted": 249,
    "material_images": 150
  },
  "metadata": {
    "processing_time_ms": 120000,
    "ai_model": "qwen3-vl-8b",
    "success_rate": 0.98
  }
}
```

---

## 📊 Sentry Integration

### Exception Tracking

All stages integrate with Sentry for exception capture:

```python
try:
    # Processing logic
    result = await process_stage()
except Exception as e:
    sentry_sdk.capture_exception(e)
    logger.error(f"❌ Stage failed: {e}")
    raise
```

**Sentry Context**:
- Job ID
- Document ID
- Current stage
- Processing metrics
- Error stack trace

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
- Claude Sonnet 4.5: $3.00 / 1M input tokens, $15.00 / 1M output tokens
- Claude Haiku 4.5: $0.80 / 1M input tokens, $4.00 / 1M output tokens
- GPT-4o: $2.50 / 1M input tokens, $10.00 / 1M output tokens
- Qwen3-VL 17B: $0.30 / 1M tokens
- text-embedding-3-small: $0.02 / 1M tokens

**Cost Calculation**:
```typescript
const calculateCost = (model: string, inputTokens: number, outputTokens: number) => {
  const pricing = MODEL_PRICING[model];
  const inputCost = (inputTokens / 1_000_000) * pricing.input;
  const outputCost = (outputTokens / 1_000_000) * pricing.output;
  return inputCost + outputCost;
};
```

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

**Metrics**:
```typescript
{
  healthy: boolean,
  connection_test_ms: number,
  query_test_ms: number,
  error_count: number,
  consecutive_failures: number,
  uptime_seconds: number,
  performance: {
    avg_query_time_ms: number,
    max_query_time_ms: number,
    slow_query_count: number,
    slow_query_threshold_ms: 1000
  }
}
```

#### 2. **Job Monitor Health**
- ✅ Monitor service status (running/stopped)
- ✅ Stuck job detection
- ✅ Health status (healthy/degraded/unhealthy)

**Metrics**:
```typescript
{
  monitor_running: boolean,
  stuck_jobs_count: number,
  health: 'healthy' | 'degraded' | 'unhealthy'
}
```

#### 3. **Query Performance Metrics**
- ✅ Total queries executed
- ✅ Slow query percentage
- ✅ Average/min/max query times
- ✅ Per-table statistics
- ✅ Recent slow queries log

**Metrics**:
```typescript
{
  total_queries: number,
  slow_queries: number,
  slow_query_percentage: number,
  avg_query_time_ms: number,
  max_query_time_ms: number,
  table_metrics: {
    [table: string]: {
      count: number,
      avg_time_ms: number,
      max_time_ms: number,
      slow_count: number
    }
  }
}
```

#### 4. **Circuit Breaker Status**
- ✅ Prevents cascading failures
- ✅ Automatic recovery detection
- ✅ Fail-fast when database is down

**States**:
- **CLOSED**: Normal operation
- **OPEN**: Failing fast (database down)
- **HALF_OPEN**: Testing recovery

**Metrics**:
```typescript
{
  state: 'closed' | 'open' | 'half_open',
  failure_count: number
}
```

### Health Check API Endpoints

#### `GET /health/`
Basic health check - returns 200 if service is running.

#### `GET /health/detailed`
Comprehensive health status with all subsystems:
```json
{
  "overall_status": "healthy",
  "database": { ... },
  "job_monitor": { ... },
  "query_metrics": { ... },
  "circuit_breaker": { ... },
  "timestamp": "2025-01-20T10:30:00Z"
}
```

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

5. **Checkpoint Queries** (`idx_job_checkpoints_job_created`)
   - Query: `WHERE job_id = ? ORDER BY created_at DESC`
   - Composite index on (job_id, created_at DESC)

6. **Progress Tracking** (`idx_job_progress_document_updated`)
   - Query: `WHERE document_id = ? ORDER BY updated_at DESC`
   - Composite index on (document_id, updated_at DESC)

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


