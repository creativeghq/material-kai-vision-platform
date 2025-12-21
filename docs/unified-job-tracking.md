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

```sql
CREATE TABLE background_jobs (
  id UUID PRIMARY KEY,
  job_type TEXT NOT NULL,           -- 'pdf_processing', 'web_scraping', 'xml_import'
  status TEXT NOT NULL,              -- 'pending', 'processing', 'completed', 'failed'
  progress INTEGER DEFAULT 0,        -- 0-100 percentage
  current_stage TEXT,                -- Current processing stage
  last_heartbeat TIMESTAMP,          -- Updated every 30s during processing
  
  -- Job metadata
  document_id UUID,                  -- For PDF jobs
  filename TEXT,                     -- For PDF jobs
  metadata JSONB,                    -- Job-specific data
  
  -- Timestamps
  created_at TIMESTAMP DEFAULT NOW(),
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  failed_at TIMESTAMP,
  updated_at TIMESTAMP DEFAULT NOW(),
  
  -- Error tracking
  error TEXT,
  retry_count INTEGER DEFAULT 0
);
```

#### **scraping_sessions** (Web Scraping Jobs)
Tracks web scraping sessions with page-level details.

```sql
CREATE TABLE scraping_sessions (
  id UUID PRIMARY KEY,
  background_job_id UUID REFERENCES background_jobs(id),
  
  source_url TEXT NOT NULL,
  status TEXT NOT NULL,              -- 'pending', 'processing', 'scraping', 'completed', 'failed'
  
  -- Progress tracking
  total_pages INTEGER DEFAULT 0,
  completed_pages INTEGER DEFAULT 0,
  failed_pages INTEGER DEFAULT 0,
  materials_processed INTEGER DEFAULT 0,
  progress_percentage DECIMAL,
  
  -- Configuration
  scraping_config JSONB,             -- Service, max_pages, categories, model
  
  -- Timestamps
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  
  -- Error tracking
  error_message TEXT
);
```

#### **data_import_jobs** (XML Import Jobs)
Tracks XML import jobs with product-level details.

```sql
CREATE TABLE data_import_jobs (
  id UUID PRIMARY KEY,
  background_job_id UUID REFERENCES background_jobs(id),
  
  source_name TEXT NOT NULL,
  import_type TEXT NOT NULL,         -- 'xml', 'csv', 'json'
  status TEXT NOT NULL,              -- 'pending', 'processing', 'completed', 'failed'
  
  -- Progress tracking
  total_products INTEGER DEFAULT 0,
  processed_products INTEGER DEFAULT 0,
  failed_products INTEGER DEFAULT 0,
  
  -- Configuration
  field_mappings JSONB,              -- XML field to DB field mappings
  
  -- Timestamps
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  
  -- Error tracking
  error_message TEXT
);
```

#### **webhook_calls** (API Call Tracking)
Tracks webhook/API calls made during job processing.

```sql
CREATE TABLE webhook_calls (
  id UUID PRIMARY KEY,
  job_id UUID,                       -- Links to background_jobs or data_import_jobs
  job_type TEXT,                     -- 'pdf_processing', 'xml_import', etc.
  
  webhook_url TEXT NOT NULL,
  request_body JSONB,
  response_status INTEGER,
  response_body JSONB,
  response_time_ms INTEGER,
  
  status TEXT,                       -- 'pending', 'success', 'failed', 'retrying'
  retry_count INTEGER DEFAULT 0,
  next_retry_at TIMESTAMP,
  
  created_at TIMESTAMP DEFAULT NOW(),
  completed_at TIMESTAMP,
  error_message TEXT
);
```

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

### Get All Jobs
```typescript
const { data: jobs } = await supabase
  .from('background_jobs')
  .select('*')
  .order('created_at', { ascending: false });
```

### Get Scraping Sessions
```typescript
const { data: sessions } = await supabase
  .from('scraping_sessions')
  .select('*, background_jobs(*)')
  .order('created_at', { ascending: false });
```

### Get Import Jobs with Webhook History
```typescript
const { data: importJobs } = await supabase
  .from('data_import_jobs')
  .select(`
    *,
    background_jobs(*),
    webhook_calls(*)
  `)
  .order('created_at', { ascending: false });
```

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

### Real-time Updates
All admin UIs use Supabase real-time subscriptions for live updates:
```typescript
const channel = supabase
  .channel('job_updates')
  .on('postgres_changes', {
    event: '*',
    schema: 'public',
    table: 'background_jobs'
  }, (payload) => {
    // Update UI
  })
  .subscribe();
```

