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

---

## 📊 Database Tables

### background_jobs

Main job tracking table. Key columns: `id`, `workspace_id`, `document_id`, `job_type`, `status` (pending/processing/completed/failed/retrying/cancelled), `progress_percent` (0-100), `created_at`, `started_at`, `completed_at`, `error_message`, and `metadata` JSONB. A unique constraint exists on `(workspace_id, document_id, job_type)`.

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

Real-time progress tracking for each stage. Key columns: `id`, `job_id`, `stage`, `progress_percent`, `current_step`, `details` JSONB, `created_at`. A unique constraint exists on `(job_id, stage)`.

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

Checkpoint data for recovery. Key columns: `id`, `job_id`, `stage`, `checkpoint_data` JSONB, `metadata` JSONB, `created_at`. A unique constraint exists on `(job_id, stage)`.

**Checkpoint Data** stored per stage:
- `chunk_ids`: IDs of created chunks
- `image_ids`: IDs of extracted images
- `embedding_ids`: IDs of generated embeddings
- `product_ids`: IDs of created products
- `metadata`: Stage-specific metadata

---

### image_processing_queue

Queue for image processing jobs. Key columns: `id`, `document_id`, `image_id`, `status`, `priority` (normal/high/critical), `retry_count`, `max_retries`, `created_at`, `updated_at`. A unique constraint exists on `image_id`.

---

### ai_analysis_queue

Queue for AI analysis jobs. Key columns: `id`, `document_id`, `chunk_id`, `analysis_type`, `status`, `priority`, `retry_count`, `created_at`, `updated_at`. A unique constraint exists on `(chunk_id, analysis_type)`.

---

## 🔄 Processing Flow

### 1. Job Creation

The frontend uploads a PDF, the backend creates a job record in `background_jobs` with status `pending`, and returns the `job_id` to the frontend for tracking.

### 2. Job Processing

The job monitor detects the pending job and starts processing. It updates the status to `processing`, then executes the 14-stage pipeline (Stage 0: Product Discovery at 0-15%, through Stage 13: Quality Enhancement at 97-100%). At each stage, the system creates a checkpoint, updates `job_progress`, and updates `background_jobs.progress_percent`.

### 3. Checkpoint Creation

After each successful stage, the checkpoint recovery service stores the stage's output data (e.g., chunk IDs, total chunks, average chunk size) in the `job_checkpoints` table. This allows the job to resume from that point if it fails.

### 4. Stuck Job Detection

The job monitor runs every 60 seconds and detects jobs that have been stuck for more than 30 minutes without progress. For each stuck job, it checks whether a valid checkpoint exists, restarts from the checkpoint if available, or marks the job as failed if not.

### 5. Auto-Recovery

The recovery service checks if a job can resume from its last checkpoint, validates the checkpoint data against the database (verifying that referenced chunks/images still exist), then either auto-restarts the job from the checkpoint (setting status back to `pending` so it gets picked up) or marks it as failed if the checkpoint is invalid.

---

## 🎯 Key Services

### AsyncQueueService

Manages job queuing and queue operations. Provides methods for `queue_image_processing_jobs()`, `queue_ai_analysis_jobs()`, and `update_job_progress()` with stage, progress percentage, and item counts.

### CheckpointRecoveryService

Handles checkpoint creation and recovery. Provides `create_checkpoint()`, `get_last_checkpoint()`, `can_resume_from_checkpoint()`, `auto_restart_stuck_job()`, and `verify_checkpoint_data()`.

### JobMonitorService

Monitors jobs and performs auto-recovery. Provides `start()` to begin monitoring, `get_health_status()` returning monitor status, job counts by status, stuck job count, and overall health string, and `force_restart_job()` for manual intervention.

---

## 📈 Monitoring & Observability

### Health Check Endpoint

`GET /api/v1/admin/job-monitor/health` returns a JSON object with `monitor_running` boolean, `stats` (checks performed, stuck jobs detected, jobs restarted, jobs failed, last check timestamp), `job_counts` (by status), `stuck_jobs_count`, and overall `health` string.

### Admin Dashboard

- Real-time job monitoring
- Stuck job detection
- Manual job restart
- Job history and analytics
- Performance metrics

---

## ⚙️ Configuration

### Retry Policy

Maximum 3 attempts with exponential backoff: 1s base delay, 30s max delay, multiplier of 2, with jitter enabled. Resulting delays: Attempt 1: 1s, Attempt 2: 2s, Attempt 3: 4s.

### Job Monitor Configuration

The `JobMonitorService` is configured with `check_interval_seconds=60` (check every minute), `stuck_job_timeout_minutes=30` (mark as stuck after 30 minutes), and `auto_restart_enabled=True`.

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
