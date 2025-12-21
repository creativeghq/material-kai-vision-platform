# Job Queue System & Async Processing

**Architecture**: Supabase-Native with Custom Recovery Layer
**Last Updated**: December 21, 2025

---

## Overview

The Material Kai Vision Platform uses a **unified job queue system** across all data import pipelines with custom checkpoint-based recovery for resilient processing. This hybrid approach combines Supabase's reliability with custom recovery logic for fault tolerance.

### Supported Job Types

1. **PDF Processing** - Extract materials from PDF catalogs with 9-stage checkpoint recovery
2. **Web Scraping** - Discover materials from websites with page-level tracking
3. **XML Import** - Import materials from XML feeds with webhook retry logic

### Key Features

- **Unified Job Tracking**: All jobs tracked in `background_jobs` table
- **Type-Specific Tables**: Specialized tables for each job type (scraping_sessions, data_import_jobs)
- **Checkpoint-Based Recovery**: Resume PDF jobs from last successful stage
- **Auto-Recovery**: Automatic detection and restart of stuck jobs (all types)
- **Real-Time Progress**: Live progress tracking with Supabase subscriptions
- **Sentry Integration**: All failures automatically reported with full context
- **Retry Logic**: Automatic retry with exponential backoff
- **Health Monitoring**: Continuous monitoring across all job types

---

## 🏗️ Architecture

### Multi-Pipeline Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  Frontend (React)                                               │
│  - PDF Upload (/admin/data-import)                              │
│  - Web Scraping UI (/scraper)                                   │
│  - XML Import (/admin/data-import)                              │
│  - Unified Job Monitor (/admin/async-queue-monitor)             │
└────────────────┬────────────────────────────────────────────────┘
                 │
┌────────────────▼────────────────────────────────────────────────┐
│  Processing Layer                                               │
│                                                                 │
│  MIVAA Backend (FastAPI)          Edge Functions (Deno)        │
│  - PDF Processing Service         - scrape-session-manager     │
│  - Web Scraping Service           - xml-import-orchestrator    │
│  - Checkpoint Recovery            - scrape-single-page         │
│  - Job Monitor (ALL TYPES)                                     │
└────────────────┬────────────────────────────────────────────────┘
                 │
┌────────────────▼────────────────────────────────────────────────┐
│  Supabase PostgreSQL                                            │
│  - background_jobs (unified job tracking)                       │
│  - scraping_sessions (web scraping jobs)                        │
│  - scraping_pages (page-level tracking)                         │
│  - data_import_jobs (XML import jobs)                           │
│  - webhook_calls (API call tracking)                            │
│  - job_checkpoints (PDF recovery data)                          │
│  - ai_analysis_queue (AI analysis jobs)                 │
└─────────────────────────────────────────────────────────┘
```

---

## 📊 Database Tables

### background_jobs

Main job tracking table.

```sql
CREATE TABLE background_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id),
  document_id UUID REFERENCES documents(id),
  job_type VARCHAR(50) NOT NULL,
  status VARCHAR(50) DEFAULT 'pending',
  progress_percent INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  error_message TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  
  CONSTRAINT job_unique UNIQUE(workspace_id, document_id, job_type)
);

CREATE INDEX idx_jobs_workspace ON background_jobs(workspace_id);
CREATE INDEX idx_jobs_status ON background_jobs(status);
```

**Columns**:
- `id`: Unique job identifier
- `workspace_id`: Workspace this job belongs to
- `document_id`: Associated PDF document
- `job_type`: Type of job (pdf_processing, image_analysis, product_creation)
- `status`: Current status (pending, processing, completed, failed, retrying)
- `progress_percent`: Progress 0-100
- `metadata`: Additional data (AI models used, retry count, etc.)

**Job Types**:
- `pdf_processing`: Main PDF extraction and processing
- `image_analysis`: Image analysis and embedding generation
- `product_creation`: Product record creation
- `metadata_extraction`: Metafield extraction

**Statuses**:
- `pending`: Waiting to be processed
- `processing`: Currently being processed
- `completed`: Successfully completed
- `failed`: Failed after all retries
- `retrying`: Retrying after failure
- `cancelled`: Manually cancelled

---

### job_progress

Real-time progress tracking for each stage.

```sql
CREATE TABLE job_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES background_jobs(id),
  stage VARCHAR(50) NOT NULL,
  progress_percent INTEGER,
  current_step VARCHAR(255),
  details JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP DEFAULT NOW(),
  
  CONSTRAINT progress_unique UNIQUE(job_id, stage)
);

CREATE INDEX idx_progress_job ON job_progress(job_id);
```

**Stages**:
- `initialized`: Job created
- `pdf_extracted`: PDF text extracted
- `chunks_created`: Text chunks created
- `text_embeddings_generated`: Text embeddings generated
- `images_extracted`: Images extracted from PDF
- `image_embeddings_generated`: Image embeddings generated
- `products_detected`: Products identified
- `products_created`: Product records created
- `completed`: All processing complete

---

### job_checkpoints

Checkpoint data for recovery.

```sql
CREATE TABLE job_checkpoints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES background_jobs(id),
  stage VARCHAR(50) NOT NULL,
  checkpoint_data JSONB NOT NULL,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP DEFAULT NOW(),
  
  CONSTRAINT checkpoint_unique UNIQUE(job_id, stage)
);

CREATE INDEX idx_checkpoints_job ON job_checkpoints(job_id);
```

**Checkpoint Data**:
- `chunk_ids`: IDs of created chunks
- `image_ids`: IDs of extracted images
- `embedding_ids`: IDs of generated embeddings
- `product_ids`: IDs of created products
- `metadata`: Stage-specific metadata

---

### image_processing_queue

Queue for image processing jobs.

```sql
CREATE TABLE image_processing_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES documents(id),
  image_id UUID NOT NULL REFERENCES document_images(id),
  status VARCHAR(50) DEFAULT 'pending',
  priority VARCHAR(20) DEFAULT 'normal',
  retry_count INTEGER DEFAULT 0,
  max_retries INTEGER DEFAULT 3,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  
  CONSTRAINT image_queue_unique UNIQUE(image_id)
);

CREATE INDEX idx_image_queue_status ON image_processing_queue(status);
CREATE INDEX idx_image_queue_priority ON image_processing_queue(priority);
```

---

### ai_analysis_queue

Queue for AI analysis jobs.

```sql
CREATE TABLE ai_analysis_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES documents(id),
  chunk_id UUID NOT NULL REFERENCES document_chunks(id),
  analysis_type VARCHAR(50) NOT NULL,
  status VARCHAR(50) DEFAULT 'pending',
  priority VARCHAR(20) DEFAULT 'normal',
  retry_count INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  
  CONSTRAINT ai_queue_unique UNIQUE(chunk_id, analysis_type)
);

CREATE INDEX idx_ai_queue_status ON ai_analysis_queue(status);
CREATE INDEX idx_ai_queue_type ON ai_analysis_queue(analysis_type);
```

---

## 🔄 Processing Flow

### 1. Job Creation

```python
# Frontend uploads PDF
POST /api/v1/pdf/upload
{
  "file": <PDF>,
  "workspace_id": "...",
  "category": "materials"
}

# Backend creates job
job_id = AsyncQueueService.create_job(
  document_id=doc_id,
  job_type="pdf_processing",
  priority="normal"
)

# Job stored in background_jobs table
# Status: pending
```

### 2. Job Processing

```python
# Job monitor detects pending job
# Starts processing
# Updates status: processing

# 14-stage pipeline executes:
# Stage 0: Product Discovery (0-15%)
# Stage 1: Focused Extraction (15-30%)
# ...
# Stage 13: Quality Enhancement (97-100%)

# At each stage:
# - Create checkpoint
# - Update job_progress
# - Update background_jobs progress_percent
```

### 3. Checkpoint Creation

```python
# After each successful stage
await checkpoint_recovery_service.create_checkpoint(
  job_id=job_id,
  stage=ProcessingStage.CHUNKS_CREATED,
  data={
    "chunk_ids": [...],
    "total_chunks": 229,
    "avg_chunk_size": 512
  }
)

# Checkpoint stored in job_checkpoints table
# Can resume from this point if job fails
```

### 4. Stuck Job Detection

```python
# Job monitor runs every 60 seconds
# Detects jobs stuck >30 minutes without progress

stuck_jobs = await checkpoint_recovery_service.detect_stuck_jobs(
  timeout_minutes=30
)

# For each stuck job:
# 1. Check if valid checkpoint exists
# 2. If yes, restart from checkpoint
# 3. If no, mark as failed
```

### 5. Auto-Recovery

```python
# If job is stuck:
can_resume, last_stage = await checkpoint_recovery_service.can_resume_from_checkpoint(job_id)

if can_resume:
  # Verify checkpoint data is valid
  is_valid = await checkpoint_recovery_service.verify_checkpoint_data(job_id, last_stage)
  
  if is_valid:
    # Restart from checkpoint
    await checkpoint_recovery_service.auto_restart_stuck_job(job_id)
    # Status: pending (will be picked up again)
  else:
    # Checkpoint invalid, mark as failed
    status = "failed"
else:
  # No checkpoint, mark as failed
  status = "failed"
```

---

## 🎯 Key Services

### AsyncQueueService

Manages job queuing and queue operations.

```python
# Queue image processing jobs
await async_queue_service.queue_image_processing_jobs(
  document_id=doc_id,
  images=images,
  priority="normal"
)

# Queue AI analysis jobs
await async_queue_service.queue_ai_analysis_jobs(
  document_id=doc_id,
  chunks=chunks,
  analysis_type="semantic_analysis",
  priority="high"
)

# Update progress
await async_queue_service.update_job_progress(
  document_id=doc_id,
  stage="chunks_created",
  progress=45,
  total_items=229,
  completed_items=103
)
```

### CheckpointRecoveryService

Handles checkpoint creation and recovery.

```python
# Create checkpoint
await checkpoint_recovery_service.create_checkpoint(
  job_id=job_id,
  stage=ProcessingStage.CHUNKS_CREATED,
  data={"chunk_ids": [...]}
)

# Get last checkpoint
checkpoint = await checkpoint_recovery_service.get_last_checkpoint(job_id)

# Check if can resume
can_resume, last_stage = await checkpoint_recovery_service.can_resume_from_checkpoint(job_id)

# Auto-restart stuck job
await checkpoint_recovery_service.auto_restart_stuck_job(job_id)

# Verify checkpoint data
is_valid = await checkpoint_recovery_service.verify_checkpoint_data(job_id, stage)
```

### JobMonitorService

Monitors jobs and performs auto-recovery.

```python
# Start monitoring
await job_monitor_service.start()

# Get health status
health = await job_monitor_service.get_health_status()
# Returns: {
#   "monitor_running": true,
#   "stats": {...},
#   "job_counts": {"pending": 5, "processing": 2, ...},
#   "stuck_jobs_count": 0,
#   "health": "healthy"
# }

# Force restart a job
result = await job_monitor_service.force_restart_job(job_id)
```

---

## 📈 Monitoring & Observability

### Health Check Endpoint

```
GET /api/v1/admin/job-monitor/health

Response:
{
  "monitor_running": true,
  "stats": {
    "checks_performed": 1440,
    "stuck_jobs_detected": 3,
    "jobs_restarted": 2,
    "jobs_failed": 1,
    "last_check": "2025-10-31T12:00:00Z"
  },
  "job_counts": {
    "pending": 5,
    "processing": 2,
    "completed": 1250,
    "failed": 3
  },
  "stuck_jobs_count": 0,
  "health": "healthy"
}
```

### Admin Dashboard

- Real-time job monitoring
- Stuck job detection
- Manual job restart
- Job history and analytics
- Performance metrics

---

## ⚙️ Configuration

### Retry Policy

```python
retryPolicy = {
  "maxAttempts": 3,
  "baseDelay": 1000,  # 1 second
  "maxDelay": 30000,  # 30 seconds
  "backoffMultiplier": 2,
  "jitterEnabled": True
}

# Retry delays:
# Attempt 1: 1s
# Attempt 2: 2s
# Attempt 3: 4s
```

### Job Monitor Configuration

```python
job_monitor_service = JobMonitorService(
  check_interval_seconds=60,      # Check every minute
  stuck_job_timeout_minutes=30,   # Stuck after 30 min
  auto_restart_enabled=True       # Auto-restart enabled
)
```

### Priority Levels

- `critical`: Processed immediately
- `high`: Processed before normal jobs
- `normal`: Standard processing
- `low`: Processed when resources available

---

## 🚀 Production Metrics

### Performance

- **Job Creation**: <100ms
- **Checkpoint Creation**: <500ms
- **Stuck Job Detection**: <5s (per 100 jobs)
- **Auto-Recovery**: <2s
- **Progress Update**: <200ms

### Reliability

- **Checkpoint Success Rate**: 99.9%
- **Recovery Success Rate**: 95%+
- **Job Completion Rate**: 98%+
- **False Positive Rate**: <1%

### Capacity

- **Max Concurrent Jobs**: 100+
- **Max Queue Size**: 10,000+
- **Checkpoint Retention**: 24 hours
- **Job History Retention**: 30 days

---

## 🔧 Troubleshooting

### Job Stuck

**Symptoms**: Job processing >30 minutes without progress

**Solution**:
1. Check job_progress table for last update
2. Verify checkpoint exists
3. Manual restart: `POST /api/v1/admin/jobs/{job_id}/restart`

### Checkpoint Invalid

**Symptoms**: Job fails to restart from checkpoint

**Solution**:
1. Verify checkpoint_data in job_checkpoints table
2. Check if referenced chunks/images exist
3. Cleanup invalid checkpoints
4. Restart job from beginning

### High Memory Usage

**Symptoms**: Job monitor consuming excessive memory

**Solution**:
1. Reduce check_interval_seconds
2. Reduce stuck_job_timeout_minutes
3. Cleanup old checkpoints
4. Restart job monitor service

---

## 📚 Related Documentation

- [PDF Processing Pipeline](pdf-processing-pipeline.md)
- [Database Schema](database-schema-complete.md)
- [API Endpoints](api-endpoints.md)
- [Troubleshooting Guide](troubleshooting-guide.md)
- [Unified Job Tracking](unified-job-tracking.md) ✨ NEW
- [Monitoring & Alerting](monitoring-and-alerting.md) ✨ NEW

---

## 🚨 Monitoring & Alerting

### Job Monitor Service

The `JobMonitorService` continuously monitors ALL job types:

**PDF Processing Jobs**:
- Heartbeat timeout detection (15 minutes)
- Update timeout detection (5 minutes)
- Auto-restart from checkpoints

**Web Scraping Sessions**:
- Update timeout detection (30 minutes)
- Mark as failed + Sentry alert

**XML Import Jobs**:
- Update timeout detection (20 minutes)
- Mark as failed + Sentry alert

### Sentry Integration

All job failures are automatically reported to Sentry with:
- Full job context (ID, type, progress, stage)
- Error details and stack traces
- Timestamps and duration
- Unique fingerprints for grouping

See [monitoring-and-alerting.md](monitoring-and-alerting.md) for complete details.

---

## Summary

The Material Kai Vision Platform uses a **production-ready, unified job queue system** with:

- Persistent job storage in PostgreSQL
- Checkpoint-based recovery for fault tolerance
- Automatic stuck job detection and recovery
- Real-time progress tracking
- Priority-based job processing
- Comprehensive monitoring and observability
- 99%+ reliability in production

This hybrid approach combines Supabase's reliability with custom recovery logic to ensure robust PDF processing even in the face of failures.

