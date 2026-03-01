# Unified Job Tracking System

## Overview

The Material KAI Vision Platform uses a unified job tracking system across all data import pipelines:
- **PDF Processing** - Extract materials from PDF catalogs
- **Web Scraping** - Discover materials from websites
- **XML Import** - Import materials from XML feeds

All jobs are tracked in the `background_jobs` table with links to specialized tables for each job type.

---

## 📊 Database Schema

### Core Tables

#### **background_jobs** (Unified Job Tracking)
Primary table for all background jobs across the platform.

Key columns: `id`, `job_type` ('pdf_processing', 'web_scraping', 'xml_import'), `status` ('pending', 'processing', 'completed', 'failed'), `progress` (0-100), `current_stage`, `last_heartbeat` (updated every 30s during processing), `document_id` (for PDF jobs), `filename` (for PDF jobs), `metadata` JSONB (job-specific data), `created_at`, `started_at`, `completed_at`, `failed_at`, `updated_at`, `error`, and `retry_count`.

#### **scraping_sessions** (Web Scraping Jobs)
Tracks web scraping sessions with page-level details.

Key columns: `id`, `background_job_id` (references background_jobs), `source_url`, `status` ('pending', 'processing', 'scraping', 'completed', 'failed'), `total_pages`, `completed_pages`, `failed_pages`, `materials_processed`, `progress_percentage`, `scraping_config` JSONB (service, max_pages, categories, model), `created_at`, `updated_at`, and `error_message`.

#### **data_import_jobs** (XML Import Jobs)
Tracks XML import jobs with product-level details.

Key columns: `id`, `background_job_id` (references background_jobs), `source_name`, `import_type` ('xml', 'csv', 'json'), `status` ('pending', 'processing', 'completed', 'failed'), `total_products`, `processed_products`, `failed_products`, `field_mappings` JSONB (XML field to DB field mappings), `created_at`, `updated_at`, and `error_message`.

#### **webhook_calls** (API Call Tracking)
Tracks webhook/API calls made during job processing.

Key columns: `id`, `job_id` (links to background_jobs or data_import_jobs), `job_type`, `webhook_url`, `request_body` JSONB, `response_status`, `response_body` JSONB, `response_time_ms`, `status` ('pending', 'success', 'failed', 'retrying'), `retry_count`, `next_retry_at`, `created_at`, `completed_at`, and `error_message`.

---

## 🎯 Job Lifecycle

### 1. PDF Processing Job
```
pending → processing → completed/failed
         ↓
    (9 checkpoint stages)
```

**Stages**:
1. `pdf_loaded` - PDF file loaded
2. `text_extracted` - Text extraction complete
3. `tiles_generated` - Image tiles created
4. `embeddings_created` - Vector embeddings generated
5. `materials_extracted` - Materials discovered and saved

**Monitoring**:
- Heartbeat every 30 seconds
- Checkpoint after each stage
- Auto-recovery on crash

### 2. Web Scraping Job
```
pending → processing → scraping → completed/failed
         ↓
    (page-by-page processing)
```

**Flow**:
1. Create scraping_session
2. Parse sitemap/crawl pages
3. Create scraping_pages entries
4. Process pages in batches
5. Discover materials from each page
6. Update progress in real-time

**Monitoring**:
- Real-time page progress
- Materials discovered count
- Failed pages tracking

### 3. XML Import Job
```
pending → processing → completed/failed
         ↓
    (product-by-product processing)
```

**Flow**:
1. Create data_import_job
2. Parse XML file
3. Detect fields and suggest mappings
4. Call Python API to process products
5. Track webhook calls with retries
6. Update progress in real-time

**Monitoring**:
- Product processing progress
- Webhook call status
- Retry attempts tracking

---

## 📱 Admin UI Integration

### Current State

#### **AsyncJobQueueMonitor** (`/admin/async-queue-monitor`)
Currently shows only PDF processing jobs.

**Features**:
- Real-time job status
- Progress tracking
- Checkpoint history
- Job cancellation
- Auto-refresh every 5 seconds

#### **MaterialScraperPage** (`/scraper`)
Dedicated UI for web scraping.

**Features**:
- Create new scraping sessions
- View session list
- Real-time progress monitoring
- Page queue viewer
- Retry failed sessions

#### **DataImportHub** (`/admin/data-import`)
Handles PDF and XML imports.

**Features**:
- PDF upload and processing
- XML import with field mapping
- Import history

### Planned Enhancements

**Unified Job Monitor** - Extend AsyncJobQueueMonitor to show all job types:
- Add tabs for PDF, Scraping, XML
- Unified metrics dashboard
- Cross-job-type analytics
- Failed jobs requiring attention

---

## 🔍 Querying Jobs

All job types can be queried through Supabase using the `background_jobs` table. Scraping sessions can be queried from `scraping_sessions` with a join to `background_jobs`. Import jobs can be queried from `data_import_jobs` with joins to both `background_jobs` and `webhook_calls`.

---

## 🚨 Monitoring & Alerts

All job failures are automatically reported to **Sentry** with full context.

See [monitoring-and-alerting.md](monitoring-and-alerting.md) for details.

---

## 📈 Metrics

### Key Metrics Tracked
- Total jobs by type
- Success rate by type
- Average processing time
- Failed jobs count
- Retry attempts
- Cost per job (AI usage)

### Real-Time Updates
All admin UIs use Supabase real-time subscriptions for live updates on the `background_jobs` table, automatically updating the UI when any job status changes.
