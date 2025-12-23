# Data Import System

Complete documentation for the unified data import system supporting XML files and web scraping.

> **📚 Related Documentation:**
> - [Async Processing & Limits](./async-processing-and-limits.md) - Concurrency limits and async architecture
> - [Web Scraping Integration](./web-scraping-integration.md) - Web scraping details
> - [Product Discovery Architecture](./product-discovery-architecture.md) - AI-powered product extraction

---

## 📋 Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Features](#features)
4. [API Reference](#api-reference)
5. [Database Schema](#database-schema)
6. [Usage Guide](#usage-guide)
7. [Testing](#testing)
8. [Performance](#performance)

---

## Overview

The Data Import System enables ingesting products from multiple sources including XML files, web scraping, and PDF processing through a unified data import hub. It provides dynamic field mapping, AI-assisted configuration, batch processing, and real-time progress tracking.

### Key Features

- Dynamic XML field mapping with AI suggestions (Claude Sonnet 4.5)
- Reusable mapping templates
- Manual re-run functionality
- Cron-based scheduling for recurring imports
- Real-time progress tracking
- Import history with audit trail
- Backend batch processing (10 products at a time)
- Concurrent image downloads (5 parallel)
- Direct product creation without PDF pipeline
- Image linking to products
- Async text processing (chunking, embeddings)
- Checkpoint recovery for failed jobs
- Comprehensive error handling

### Async Processing & Limits

XML Import uses **fully async processing** with unified concurrency limits:

| Feature | Limit | Purpose |
|---------|-------|---------|
| **Product Batch Size** | 10 products | Memory optimization |
| **Image Downloads** | 5 concurrent | Network optimization |
| **Image Upload** | 10 concurrent | Supabase Storage limit |
| **Llama Vision** | 5 concurrent | AI classification |
| **Claude Validation** | 2 concurrent | Validation |
| **CLIP Batch** | 20 images | Embedding generation |
| **Download Timeout** | 30 seconds | Per-image timeout |
| **Max File Size** | 10 MB | Image size limit |

See [Async Processing & Limits](./async-processing-and-limits.md) for complete details.

### Use Cases

1. **Supplier Catalog Imports** - Import products from supplier XML catalogs
2. **Recurring Updates** - Schedule automatic imports from supplier URLs
3. **Manual Re-runs** - Re-import catalogs with one click
4. **Multi-source Integration** - Combine XML, web scraping, and PDF sources

---

## Architecture

### System Overview

```
┌─────────────────────────────────────────────────────────────┐
│ FRONTEND (DataImportHub)                                    │
│ ├─ XML Import Tab                                           │
│ ├─ Web Scraping Tab                                         │
│ └─ Import History Tab                                       │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ EDGE FUNCTION (xml-import-orchestrator)                     │
│ ├─ Parse XML and detect fields                              │
│ ├─ AI-powered field mapping (Claude Sonnet 4.5)             │
│ ├─ Create data_import_jobs record                           │
│ └─ Call Python API (non-blocking)                           │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ PYTHON API (DataImportService)                              │
│ ├─ Batch processing (10 products at a time)                 │
│ ├─ Image downloads (5 concurrent)                           │
│ ├─ Product creation with metadata                           │
│ ├─ Image linking via document_images                        │
│ ├─ Async text processing queue                              │
│ └─ Real-time progress updates                               │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ ASYNC PROCESSING (Background)                               │
│ ├─ Chunking (UnifiedChunkingService)                        │
│ ├─ Text Embeddings (RealEmbeddingsService)                  │
│ └─ Product enrichment (optional)                            │
└─────────────────────────────────────────────────────────────┘
```

### Data Flow

```
1. User uploads XML file
   ↓
2. Edge Function parses XML and detects fields
   ↓
3. AI suggests field mappings (Claude Sonnet 4.5)
   ↓
4. User reviews and confirms mappings
   ↓
5. Edge Function creates import job
   ↓
6. Python API processes job in batches
   ↓
7. Images downloaded concurrently
   ↓
8. Products created in database
   ↓
9. Images linked to products
   ↓
10. Text processing queued (async)
    ↓
11. Job marked as completed
```

---

## Frontend Components

### DataImportHub

Main hub component (`src/components/Admin/DataImportHub.tsx`) with 3 tabs:
- **XML Import Tab** - Upload and configure XML imports
- **Web Scraping Tab** - Firecrawl integration for web sources
- **Import History Tab** - View past imports with re-run and scheduling

#### 2. XMLFieldMappingModal (`src/components/Admin/DataImport/XMLFieldMappingModal.tsx`)

Interactive UI for reviewing AI-suggested field mappings:
- Color-coded confidence badges (green ≥90%, yellow ≥70%, red <70%)
- Dropdown selectors for target schema fields
- Template saving functionality
- Preview of sample values

#### 3. ImportHistoryTab (`src/components/Admin/DataImport/ImportHistoryTab.tsx`)

Displays past import jobs with:
- Status and progress indicators
- Manual re-run button (blue, Play icon)
- Schedule cron button (purple, Calendar icon)
- Next run time for scheduled imports

#### 4. ScheduleImportModal (`src/components/Admin/DataImport/ScheduleImportModal.tsx`)

Configure cron schedules for recurring imports:
- 6 preset schedules (hourly, daily, weekly, etc.)
- Custom cron expression support
- Source URL input for scheduled imports

### Edge Functions

#### xml-import-orchestrator (`supabase/functions/xml-import-orchestrator/index.ts`)

**Purpose:** Parse XML, detect fields, suggest mappings, create import jobs

**Endpoints:**
- `POST /xml-import-orchestrator` - Upload XML and create import job

**Features:**
- XML parsing with field detection
- AI-powered field mapping using Claude Sonnet 4.5
- Fallback rule-based mapping (multi-language support)
- Preview mode for field detection only
- Stores products in job metadata for Python API

**Request:**
```typescript
{
  workspace_id: string;
  category: string;
  xml_content: string; // Base64 encoded
  preview_only?: boolean;
  field_mappings?: Record<string, string>;
  mapping_template_id?: string;
  parent_job_id?: string;
}
```

**Response (Preview Mode):**
```typescript
{
  success: true;
  detected_fields: DetectedField[];
  total_products: number;
}
```

**Response (Import Mode):**
```typescript
{
  success: true;
  job_id: string;
  total_products: number;
}
```

#### scheduled-import-runner (`supabase/functions/scheduled-import-runner/index.ts`)

**Purpose:** Run scheduled imports via Supabase Cron

**Trigger:** Supabase Cron (every 15 minutes)

**Features:**
- Fetches XML from source URLs
- Creates new import jobs with same field mappings
- Updates next_run_at timestamps
- Links to parent job via parent_job_id

---

## Backend Data Processing

### Services

#### 1. DataImportService (`mivaa-pdf-extractor/app/services/data_import_service.py`)

Main orchestrator for processing import jobs.

**Key Methods:**
- `process_import_job()` - Process complete import job
- `_process_batch()` - Process batch of 10 products
- `_normalize_product()` - Apply field mappings
- `_download_images()` - Download images concurrently
- `_queue_product_processing()` - Create products in database
- `_link_images_to_product()` - Link images to products
- `_queue_text_processing()` - Queue async text processing

**Features:**
- Batch processing (10 products at a time)
- Checkpoint recovery
- Real-time progress updates
- Error handling with detailed logging

#### 2. ImageDownloadService (`mivaa-pdf-extractor/app/services/image_download_service.py`)

Handles concurrent image downloads with validation and retry logic.

**Key Methods:**
- `download_images()` - Download multiple images concurrently
- `_download_single_image()` - Download single image with retry
- `validate_image_url()` - Validate URL format
- `store_image_in_storage()` - Upload to Supabase Storage

**Features:**
- Concurrent downloads (5 parallel)
- URL validation
- Content validation (type, size)
- Retry logic (3 attempts with exponential backoff)
- 10MB file size limit
- 30s timeout per download

### API Routes

#### Data Import Routes (`mivaa-pdf-extractor/app/api/data_import_routes.py`)

**Endpoints:**

1. **POST /api/import/process** - Start processing an import job
2. **GET /api/import/jobs/{job_id}** - Get import job status
3. **GET /api/import/history** - Get import history
4. **GET /api/import/health** - Health check

See [API Reference](#api-reference) for detailed documentation.

---

## API Reference

### Edge Function API

#### POST /xml-import-orchestrator

Upload XML file and create import job.

**Request Body:**
```json
{
  "workspace_id": "uuid",
  "category": "materials",
  "xml_content": "base64_encoded_xml",
  "preview_only": false,
  "field_mappings": {
    "name": "name",
    "factory": "factory_name",
    "category": "material_category"
  },
  "mapping_template_id": "uuid",
  "parent_job_id": "uuid"
}
```

**Response:**
```json
{
  "success": true,
  "job_id": "uuid",
  "total_products": 10
}
```

### Python API

#### POST /api/import/process

Start processing an import job (called by Edge Function).

**Request Body:**
```json
{
  "job_id": "uuid",
  "workspace_id": "uuid"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Import job processing started",
  "job_id": "uuid"
}
```

#### GET /api/import/jobs/{job_id}

Get import job status and progress.

**Response:**
```json
{
  "job_id": "uuid",
  "status": "processing",
  "import_type": "xml",
  "source_name": "Supplier Catalog",
  "total_products": 100,
  "processed_products": 45,
  "failed_products": 2,
  "progress_percentage": 45,
  "current_stage": "downloading_images",
  "started_at": "2025-11-10T10:00:00Z",
  "completed_at": null,
  "error_message": null,
  "estimated_time_remaining": 120
}
```

#### GET /api/import/history

Get import history for a workspace.

**Query Parameters:**
- `workspace_id` (required) - Workspace ID
- `page` (optional, default: 1) - Page number
- `page_size` (optional, default: 20) - Items per page
- `status` (optional) - Filter by status
- `import_type` (optional) - Filter by import type

**Response:**
```json
{
  "imports": [
    {
      "job_id": "uuid",
      "import_type": "xml",
      "source_name": "Supplier Catalog",
      "status": "completed",
      "total_products": 100,
      "processed_products": 98,
      "failed_products": 2,
      "created_at": "2025-11-10T10:00:00Z",
      "completed_at": "2025-11-10T10:15:00Z"
    }
  ],
  "total_count": 50,
  "page": 1,
  "page_size": 20
}
```

#### GET /api/import/health

Health check for data import API.

**Response:**
```json
{
  "status": "healthy",
  "service": "data-import-api",
  "version": "1.0.0",
  "features": {
    "xml_import": true,
    "web_scraping": false,
    "batch_processing": true,
    "concurrent_image_downloads": true,
    "checkpoint_recovery": true,
    "real_time_progress": true
  }
}
```

---

## Database Schema

### data_import_jobs

Tracks import jobs with status and progress.

```sql
CREATE TABLE data_import_jobs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id),
  import_type TEXT NOT NULL, -- 'xml', 'web_scraping'
  source_name TEXT,
  source_url TEXT,
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'processing', 'completed', 'failed'
  total_products INTEGER DEFAULT 0,
  processed_products INTEGER DEFAULT 0,
  failed_products INTEGER DEFAULT 0,
  category TEXT,
  original_xml_content TEXT, -- For re-runs
  field_mappings JSONB, -- User-configured field mappings
  mapping_template_id UUID REFERENCES xml_mapping_templates(id),
  parent_job_id UUID REFERENCES data_import_jobs(id), -- For re-runs and scheduled runs
  is_scheduled BOOLEAN DEFAULT FALSE,
  cron_schedule TEXT,
  last_run_at TIMESTAMPTZ,
  next_run_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  error_message TEXT,
  metadata JSONB, -- Stores products for processing
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### data_import_history

Tracks individual product imports for audit trail.

```sql
CREATE TABLE data_import_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  job_id UUID NOT NULL REFERENCES data_import_jobs(id) ON DELETE CASCADE,
  source_data JSONB NOT NULL, -- Original product data from XML
  normalized_data JSONB, -- Normalized product data after field mapping
  processing_status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'success', 'failed'
  error_details TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### xml_mapping_templates

Stores reusable field mapping templates.

```sql
CREATE TABLE xml_mapping_templates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id),
  name TEXT NOT NULL,
  description TEXT,
  field_mappings JSONB NOT NULL, -- XML field -> Platform field mappings
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(workspace_id, name)
);
```

---

## Usage Guide

### 1. Upload XML File

1. Navigate to Admin Dashboard → Data Import Hub
2. Click "XML Import" tab
3. Select category (e.g., "materials")
4. Upload XML file
5. Review AI-suggested field mappings
6. Adjust mappings if needed
7. Optionally save as template
8. Click "Import"

### 2. Schedule Recurring Import

1. Go to Import History tab
2. Find completed import
3. Click "Schedule Cron" button
4. Enter source URL
5. Select schedule (hourly, daily, weekly, custom)
6. Click "Schedule"

### 3. Manual Re-run

1. Go to Import History tab
2. Find completed import
3. Click "Manual Re-run" button
4. Confirm re-run
5. New job created with same mappings

---

## Testing

### Integration Test Script

**Location:** `scripts/testing/test-xml-import-phase2.js`

**Usage:**
```bash
node scripts/testing/test-xml-import-phase2.js
```

**Test Flow:**
1. Upload XML with 3 sample products
2. Monitor job progress (polls every 5s, max 5 min)
3. Verify products created in database
4. Verify images downloaded and linked
5. Verify import history records
6. Display comprehensive summary

---

## Performance

### Batch Processing
- **Batch Size:** 10 products
- **Concurrent Images:** 5 per batch
- **Checkpoint Frequency:** After each batch
- **Memory Management:** Garbage collection after each batch

### Image Downloads
- **Max File Size:** 10MB
- **Timeout:** 30 seconds per image
- **Retry Attempts:** 3 with exponential backoff
- **Storage:** Supabase `pdf-tiles` bucket

### Database Operations
- **Products:** Direct insert to `products` table
- **Images:** Linked via `document_images` table
- **Chunks:** Created in `chunks` table
- **History:** Tracked in `data_import_history` table

---

## 🛡️ Production Hardening

The Data Import System implements **complete production hardening** across all import methods (PDF, XML, Web Scraping):

### Source Tracking ✅

All imported data is tagged with source information for complete traceability:

| Field | Purpose | Example Values |
|-------|---------|----------------|
| **source_type** | Import method | `'pdf_processing'`, `'xml_import'`, `'web_scraping'` |
| **source_job_id** | Originating job | Job UUID from `background_jobs` or `data_import_jobs` |

**Applied to:**
- ✅ Products table
- ✅ Chunks table
- ✅ Images table
- ✅ Embeddings table

**Benefits:**
- Filter Materials Data page by specific import job
- Trace any data back to its source
- Delete all data from a specific import
- Audit data quality by source

---

### Heartbeat Monitoring ✅

All import methods update heartbeat timestamps to detect stuck/crashed jobs:

| Method | Heartbeat Field | Update Frequency | Stuck Threshold |
|--------|----------------|------------------|-----------------|
| **PDF Processing** | `last_heartbeat` | Every stage | >10 minutes |
| **XML Import** | `last_heartbeat` | Every batch (10 products) | >30 minutes |
| **Web Scraping** | `last_heartbeat_at` | Every 30 seconds | >5 minutes |

**Features:**
- Automatic stuck job detection
- Auto-recovery mechanisms
- Real-time job health monitoring
- Alert on processing delays

---

### Sentry Error Tracking ✅

Comprehensive error tracking and performance monitoring across all import methods:

| Feature | PDF | XML | Web Scraping |
|---------|-----|-----|--------------|
| **Transaction Tracking** | ✅ | ✅ | ✅ |
| **Breadcrumbs** | ✅ | ✅ | ✅ |
| **Exception Capture** | ✅ | ✅ | ✅ |
| **Performance Monitoring** | ✅ | ✅ | ✅ |
| **Error Context** | ✅ | ✅ | ✅ |

**Benefits:**
- Track performance bottlenecks
- Debug errors with full context
- Monitor AI model usage
- Identify slow operations

---

### Production Hardening Status

| Feature | PDF | XML | Web Scraping | Status |
|---------|-----|-----|--------------|--------|
| **Source Tracking** | ✅ | ✅ | ✅ | COMPLETE |
| **Heartbeat Monitoring** | ✅ | ✅ | ✅ | COMPLETE |
| **Sentry Tracking** | ✅ | ✅ | ✅ | COMPLETE |
| **Error Handling** | ✅ | ✅ | ✅ | COMPLETE |
| **Progress Tracking** | ✅ | ✅ | ✅ | COMPLETE |
| **Checkpoint Recovery** | ✅ | ✅ | ✅ | COMPLETE |
| **Auto-Recovery** | ✅ | ✅ | ✅ | COMPLETE |

For detailed implementation, see:
- [Unified Product Generation Flow](./unified-product-generation-flow.md)
- [PDF Processing Pipeline](./pdf-processing-pipeline.md)
- [XML Import Orchestrator](./xml-import-orchestrator.md)
- [Web Scraping Integration](./web-scraping-integration.md)

---

## Future Enhancements

### Frontend Improvements
- Enhanced real-time progress tracking in UI
- Advanced mapping template management
- Comprehensive import job monitoring dashboard

### Web Scraping Expansion
- Extended Firecrawl integration capabilities
- Advanced dynamic mapping for complex web structures
- Automatic product extraction from supplier websites
- Unified processing through `data_import_jobs` pipeline

