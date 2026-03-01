# XML Import Orchestrator Edge Function

## Overview

Edge Function for parsing XML files and orchestrating product imports into Material-KAI platform. This function handles the initial XML parsing, validation, and job creation, then delegates to the Python API for batch processing.

## Architecture

┌─────────────────────────────────────────────────────────────┐
│ LAYER 1: DATA INGESTION (EDGE FUNCTION)                    │
│ ├─ Parse XML file (Deno XML parser)                        │
│ ├─ Validate structure                                      │
│ ├─ Extract product elements                                │
│ ├─ Create data_import_jobs record                          │
│ └─ Return job_id to frontend                               │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ LAYER 2: DATA PROCESSING (PYTHON API)                      │
│ ├─ Batch process products (10 at a time)                   │
│ ├─ Download images (5 concurrent)                          │
│ ├─ Extract metadata (AI-based)                             │
│ ├─ Normalize to NormalizedProductData                      │
│ ├─ Queue for product creation                              │
│ └─ Update job status in real-time                          │
└─────────────────────────────────────────────────────────────┘

## Supported XML Formats

The function supports multiple common XML schemas. Each format uses a different root and item element name (e.g., `<products>/<product>`, `<items>/<item>`, `<materials>/<material>`), and each item may contain varying field names for name, manufacturer, category, description, and image URLs.

## Required Fields

Each product must have:
- **name** (or title, product_name)
- **factory_name** (or manufacturer, supplier, factory)
- **material_category** (or category, material_type, type)

## Optional Fields

- description (or desc)
- factory_group_name (or factory_group, group)
- images (image, img, picture tags)
- price
- color/colors
- dimensions/size
- designer
- collection
- finish
- material

## API Endpoint

`POST /functions/v1/xml-import-orchestrator`

## Request Format

The request body is a JSON object containing: workspace_id (UUID), category (e.g., "materials"), xml_content (base64-encoded XML string), and optionally source_name (e.g., "supplier_catalog.xml").

## Response Format

### Success

The success response contains: success (true), job_id (UUID), message confirming the import job was created and processing started, and total_products count.

### Error

The error response contains: success (false) and an error message describing the failure (e.g., "Product validation failed: Product 1: Missing factory_name").

## Job Status Tracking

After receiving the job_id, track progress by querying the `data_import_jobs` table from Supabase, selecting all fields for the given job ID. The record exposes status (pending, processing, completed, failed) and progress as processed_products divided by total_products.

## Database Tables

### data_import_jobs

Tracks import job status and progress. Query the table with fields id, status, total_products, processed_products, failed_products, created_at, and completed_at, filtering by workspace_id and ordering by created_at descending.

### data_import_history

Tracks individual product imports. Query with fields id, job_id, product_id, processing_status, source_data, and normalized_data, filtering by job_id.

## Error Handling

The function validates:
1. Required parameters (workspace_id, category, xml_content)
2. Authentication (valid JWT token)
3. XML structure (valid XML format)
4. Product data (required fields present)

Common errors:
- `Missing required parameters` - Check request body
- `Authentication failed` - Check authorization header
- `XML parsing error` - Invalid XML format
- `Product validation failed` - Missing required fields
- `No product elements found` - Unsupported XML schema

## Performance

- **Timeout**: 600 seconds (Edge Function limit)
- **Memory**: 128MB (Edge Function limit)
- **Recommended file size**: < 10MB
- **Recommended product count**: < 1000 products per file

For larger files, split into multiple smaller files.

## Environment Variables

Required in Supabase Edge Function settings:
- `SUPABASE_URL` - Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY` - Service role key for database access
- `PYTHON_API_URL` - Python API endpoint (default: https://v1api.materialshub.gr)

## Next Steps

After job creation:
1. Python API processes products in batches
2. Downloads images from URLs
3. Extracts metadata using AI
4. Creates product records
5. Updates job status to 'completed'

See Python API documentation for details on batch processing.

---

## 🛡️ Production Hardening

XML Import implements **complete production hardening** for reliability and monitoring:

### Source Tracking ✅

Every product, chunk, and image is tagged with source information. When inserting records into the products, document_chunks, and document_images tables, each record includes `source_type: 'xml_import'` and `source_job_id` linking to the originating import job.

**Benefits:**
- Filter Materials Data page by specific XML import job
- Trace any data back to its source XML file
- Delete all data from a specific XML import
- Audit data quality by source

---

### Heartbeat Monitoring ✅

Updates `last_heartbeat` field **every batch (10 products)** to detect stuck jobs. The background_jobs table record is updated with the current timestamp, current progress percentage, and processing counts (processed, failed, total).

**Implementation:**
- Location: `data_import_service.py` line 584
- Frequency: Every 10 products processed
- Stuck Threshold: >30 minutes without heartbeat
- Auto-Recovery: Automatic retry of stuck jobs

---

### Sentry Error Tracking ✅

Comprehensive error tracking and performance monitoring using Sentry transactions for the overall import job, breadcrumbs for each batch, and exception capture with full stack traces.

**Features:**
- Transaction tracking for performance monitoring
- Breadcrumbs for batch processing context
- Exception capture with full stack traces
- Batch processing metrics
- Performance bottleneck identification

---

### Production Hardening Status

| Feature | Status | Details |
|---------|--------|---------|
| **Source Tracking** | ✅ COMPLETE | All tables have `source_type='xml_import'` and `source_job_id` |
| **Heartbeat Monitoring** | ✅ COMPLETE | Updates every batch (10 products), 30-minute stuck threshold |
| **Sentry Tracking** | ✅ COMPLETE | Transactions, breadcrumbs, exception capture |
| **Error Handling** | ✅ COMPLETE | Comprehensive try-catch with Sentry integration |
| **Progress Tracking** | ✅ COMPLETE | Real-time progress updates via `background_jobs` table |
| **Checkpoint Recovery** | ✅ COMPLETE | Resume from last successful batch |
| **Auto-Recovery** | ✅ COMPLETE | Automatic retry of stuck/failed jobs |

---

## Related Documentation

- [Data Import Hub Architecture](../../../docs/data-import-hub.md)
- [Python API Import Endpoints](../../../mivaa-pdf-extractor/docs/import-api.md)
- [Database Schema](../../../supabase/migrations/20251110_create_data_import_tables.sql)
- [Unified Product Generation Flow](../../../docs/unified-product-generation-flow.md) - Complete production hardening details
