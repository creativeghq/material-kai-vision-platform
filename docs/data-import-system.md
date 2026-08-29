# Data Import System

Complete documentation for the unified data import system supporting XML files and web scraping.

> **📚 Related Documentation:**
> - [Async Processing & Limits](./async-processing-and-limits.md) - Concurrency limits and async architecture
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

- Dynamic XML field mapping with AI suggestions (Claude Opus 5)
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
│ ├─ AI-powered field mapping (Claude Opus 5)             │
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

### Data Flow

1. User uploads XML file
   ↓
2. Edge Function parses XML and detects fields
   ↓
3. AI suggests field mappings (Claude Opus 5)
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

---

## Frontend Components

### DataImportHub

Main hub component (`src/components/Admin/DataImportHub.tsx`) with 3 tabs:
- **XML Import Tab** - Upload and configure XML imports
- **Web Scraping Tab** - Firecrawl integration for web sources
- **Import History Tab** - View past imports with re-run and scheduling

#### 2. XMLFieldMappingModal (`src/components/Admin/DataImport/XMLFieldMappingModal.tsx`) — "Fill the Gaps" panel

Dynamic per-target panel that detects missing/sparse/conflicting fields and lets the operator resolve each case inline:
- **Per-target row rendering** based on detection state:
  - 🔴 `blocking_required` — required target with 0 mappings or 0% coverage (blocks import until manual value is filled)
  - 🟡 `partial` — required target with partial coverage (optional fallback textarea; shows "fills N empty rows" or "skips N rows")
  - 🟠 `conflict` — ≥2 XML tags mapped to same target (radio picker; losers route to metadata)
  - ✅ `present` — required target with full coverage (collapsed in accordion)
  - ⚪ optional present/missing — collapsible textareas for job-level defaults
- **Coverage badges** per target: `mapped from <tag>, present in 312/418 rows (74%)`
- **Auto-mapped** and **Unmapped → metadata** fields collapsed in accordions
- Template saving for reuse on next refresh of the same feed

`material_category` is **not in this panel** — the operator picks it once on the upload screen ([XMLImportTab.tsx](../src/components/Admin/DataImport/XMLImportTab.tsx)), matching the PDF upload flow.

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

**Purpose:** Parse XML, detect fields with coverage stats, suggest mappings, create import jobs

**Endpoints:**
- `POST /xml-import-orchestrator` - Three modes via flags: `preview_only`, `generate_preview`, or default (import)

**Features:**
- XML parsing (fast-xml-parser) with full-pass coverage stats per field
- **Dictionary-first field mapping** ([_shared/xml-field-dictionary.ts](../supabase/functions/_shared/xml-field-dictionary.ts)) — ~150 entries across English/Spanish/French/German/Greek + ERP shorthand + regex rules for digit-suffix patterns
- **AI residual on Haiku 4.5** — only fields the dictionary couldn't confidently match (confidence < 0.85) get sent to the model, with dictionary hints as priors. Stable feeds skip the AI call entirely.
- **Mapping-aware extractor** — operator's `field_mappings` and `manual_values[target]` fallbacks applied per-row at import time
- Chunk-inserts into `data_import_job_products` (no full-array-in-memory anti-pattern)

**Request parameters:** workspace_id, category, xml_content (base64), optional `preview_only`/`generate_preview` flags, optional `field_mappings`, optional `manual_values` (any target), optional `mapping_template_id`.

**Response (preview_only):** detected_fields array (with `total_rows` / `present_count` / `coverage_pct` / `distinct_values` per field), `suggested_mappings`, `total_rows`.

**Response (generate_preview):** `preview_product`, `preview_value_sources` (`{target: 'xml' | 'default'}`), `total_products`.

**Response (import):** `job_id`, `total_products`, `dropped_count`, `message`.

Full API reference: [xml-import-orchestrator-api.md](./xml-import-orchestrator.md). Operator-facing overview: [xml-import-orchestrator.md](./xml-import-orchestrator.md).

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

Three-mode endpoint — see [xml-import-orchestrator-api.md](./xml-import-orchestrator.md) for full request/response schemas.

**Request Body parameters:** workspace_id (UUID), category (required for import mode — job-level material_category), xml_content (base64-encoded XML), optional `preview_only` (run dictionary + AI residual, return coverage stats), optional `generate_preview` (apply mappings + manual_values to one product, return sample + per-field value sources), optional `field_mappings` (XML tag → target), optional `manual_values` (per-target job-level fallback applied when mapped tag is empty for a row), optional `mapping_template_id`, and optional `parent_job_id` (for re-runs).

**Response:** depends on mode — preview returns `detected_fields[]` with coverage stats; generate_preview returns `preview_product` + `preview_value_sources`; import returns `job_id` + `total_products` + `dropped_count`.

### Python API

#### POST /api/import/process

Start processing an import job (called by Edge Function).

**Request Body:** job_id and workspace_id.

**Response:** success, message, job_id.

#### GET /api/import/jobs/{job_id}

Get import job status and progress.

**Response:** job_id, status, import_type, source_name, total_products, processed_products, failed_products, progress_percentage, current_stage, started_at, completed_at, error_message, and estimated_time_remaining.

#### GET /api/import/history

Get import history for a workspace.

**Query Parameters:**
- `workspace_id` (required) - Workspace ID
- `page` (optional, default: 1) - Page number
- `page_size` (optional, default: 20) - Items per page
- `status` (optional) - Filter by status
- `import_type` (optional) - Filter by import type

**Response:** imports array (each with job_id, import_type, source_name, status, total_products, processed_products, failed_products, created_at, completed_at), total_count, page, and page_size.

#### GET /api/import/health

Health check for data import API.

**Response:** status, service name, version, and a features object indicating which capabilities are enabled (xml_import, web_scraping, batch_processing, concurrent_image_downloads, checkpoint_recovery, real_time_progress).

---

## Database Schema

### data_import_jobs

Tracks import jobs with status and progress. Key fields include: id, workspace_id, import_type ('xml' or 'web_scraping'), source_name, source_url, status ('pending', 'processing', 'completed', 'failed'), total_products, processed_products, failed_products, category, original_xml_content (for re-runs), field_mappings (JSONB), mapping_template_id, parent_job_id (for re-runs and scheduled runs), is_scheduled, cron_schedule, last_run_at, next_run_at, started_at, completed_at, error_message, and metadata (stores products for processing).

### data_import_history

Tracks individual product imports for audit trail. Key fields include: id, job_id (references data_import_jobs), source_data (JSONB with original product data from XML), normalized_data (JSONB with normalized product data after field mapping), and processing_status ('pending', 'success', or 'failed').

### xml_mapping_templates

Stores reusable field mapping templates. Key fields include: id, workspace_id, name, description, field_mappings (JSONB mapping XML fields to platform fields), created_by, created_at, and updated_at. A unique constraint applies on (workspace_id, name).

---

## Usage Guide

### 1. Upload XML File

1. Navigate to Admin Dashboard → Data Import Hub
2. Click "XML Import" tab
3. **Pick the Material Category** in the dropdown at the top (applied to every product in this import)
4. Upload XML file or paste a remote URL
5. Click "Detect Fields"
6. **Resolve any gaps in the Fill-the-Gaps panel:**
   - 🔴 Required fields the XML doesn't have (e.g. missing `factory_name`) — type a job-level default
   - 🟡 Required fields with partial coverage (e.g. `<Manufacturer>` present on only 74% of rows) — optionally type a fallback for the empty rows
   - 🟠 Conflicts (e.g. `<PriceW>` and `<PriceRetail>` both map to `price`) — pick the winner; the loser routes to metadata
   - Optional fields can have job-level defaults too
7. Click "Preview & Import" to see one sample product (each rendered field shows "from XML" vs "from default")
8. Optionally save the mapping as a template for reuse
9. Click "Start Import"

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

**Usage:** Run with `node scripts/testing/test-xml-import-phase2.js`.

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
