# XML Import Orchestrator Edge Function

## Overview

Edge Function for parsing XML files and orchestrating product imports into Material-KAI platform. This function handles the initial XML parsing, validation, and job creation, then delegates to the Python API for batch processing.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│ STAGE 0: UPLOAD SCREEN (XMLImportTab.tsx)                  │
│ ├─ Operator picks Material Category up-front (job-level)   │
│ ├─ Selects file or pastes feed URL                         │
│ └─ Clicks Detect Fields                                    │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ STAGE 1: FIELD DETECTION (EDGE FUNCTION, preview_only)     │
│ ├─ Parse XML (fast-xml-parser)                             │
│ ├─ Walk ALL product nodes → per-field coverage stats       │
│ │   (present_count, coverage_pct, distinct_values)         │
│ ├─ Dictionary-first classification                         │
│ │   (_shared/xml-field-dictionary.ts, ~150 entries +       │
│ │    regex rules; ≥0.85 confidence skips AI)               │
│ ├─ AI residual on Haiku for ambiguous/unknown only         │
│ └─ Return detected_fields[] with coverage + suggestions    │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ STAGE 2: FILL-THE-GAPS PANEL (XMLFieldMappingModal.tsx)    │
│ ├─ Per-target dynamic rendering by case:                   │
│ │     🔴 blocking required (no mapping or 0% coverage)     │
│ │     🟡 partial coverage (textarea for empty-row fallback)│
│ │     🟠 conflict (≥2 XML tags → same target, picker)      │
│ │     ✅ present (collapsed in "Auto-mapped" accordion)    │
│ │     ⚪ optional missing/partial (optional textarea)      │
│ ├─ Conflict-resolution: losing tags route to metadata      │
│ └─ Submit blocked until no blocking required + no conflict │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ STAGE 3: PREVIEW + IMPORT (EDGE FUNCTION)                  │
│ ├─ generate_preview: build sample product +                │
│ │     preview_value_sources (xml | default per field)      │
│ ├─ import: extract all products via buildProductWithMappings│
│ │     - mapped tag → top-level + metadata under target name│
│ │     - empty mapped tag → manual_values[target] fallback  │
│ │     - job-level category → every product's category      │
│ ├─ Chunk-insert into data_import_job_products              │
│ ├─ Create data_import_jobs row                             │
│ └─ POST /api/import/process to Python (auth header now     │
│     correctly forwarded — was a latent bug pre-2026-05-23) │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ STAGE 4: PYTHON PROCESSING                                 │
│ ├─ Page-read product_data from job_products (no full load) │
│ ├─ Stage 4 product insert: top-level keys → columns,       │
│ │     metadata → JSONB; external_sku dedup from product_id │
│ │     / sku / metadata.product_id                          │
│ ├─ Download images from product_data.images[]              │
│ ├─ Voyage 1024D text embedding from top-level + metadata   │
│ ├─ Facet canonicalization on whitelisted metadata keys     │
│ └─ Update background_jobs status + heartbeat               │
└─────────────────────────────────────────────────────────────┘
```

## Supported XML Formats

`findProductNodes()` does a BFS for any of these container tags: `<product>`, `<item>`, `<material>`, `<producto>`, `<articulo>`, `<produit>` — the root element doesn't matter. Common roots seen in production: `<products>`, `<catalog>`, `<items>`, `<materials>`, `<catalogo>`, `<PanagoulasStore>`, etc.

## Required Fields

Per product:
- **name** (or title, product_name, nombre, όνομα, etc.) — must come from the XML
- **factory_name** (or manufacturer, supplier, brand, fabricante, κατασκευαστής, etc.) — from XML OR job-level `manual_values.factory_name` fallback

Job-level (NOT mapped from XML):
- **material_category** — picked once on the upload screen, applied to every product

## Optional Fields

All resolved via the same dictionary + AI residual pipeline. Mapped + present in XML → top-level on ProductData + mirrored in metadata. Mapped + empty → optional `manual_values[target]` fallback.

| Target | Common aliases |
|---|---|
| `description` | desc, descripcion, περιγραφή |
| `factory_group_name` | factory_group, group, brand_group |
| `factory_address` / `factory_city` / `factory_country` / `factory_postal_code` | address, city, country, zip, διεύθυνση, πόλη, χώρα, τκ |
| `factory_phone` / `factory_email` / `factory_website` | phone/tel, email, website/url/homepage, τηλέφωνο, ιστοσελίδα |
| `factory_country_of_origin` | origin, made_in, χώρα_προέλευσης |
| `images` | image, img, picture, photo, imagen, image_link, εικόνα, image1/image2/etc. (regex) |
| `external_sku` | sku, product_id, product_code, item_id, mtrl, code, kodikos |
| `price` | price, cost, precio, prix, preis, pricew, priceretail, τιμή |
| `color` / `colors` | colour, colours, χρώμα, χρώματα |
| `dimensions` / `size` | dimension, dim, dimensiones, sizes, διαστάσεις, μέγεθος, dim1/dim2/etc. (regex) |
| `designer` | disenador, σχεδιαστής |
| `collection` | coleccion, serie, series, model, modelname, συλλογή, σειρά |
| `finish` | acabado, φινίρισμα, τελείωμα |
| `material` | materia, υλικό |

The full dictionary lives at [_shared/xml-field-dictionary.ts](../supabase/functions/_shared/xml-field-dictionary.ts) — add new entries there to extend coverage for new languages or supplier-specific naming conventions.

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

## Performance / Safety Envelope

Tunable via env vars on the edge-function deployment:

| Limit | Default | Env var |
|---|---|---|
| Max decoded XML size | 25 MB | `XML_IMPORT_MAX_MB` |
| Max products per import | 20,000 | `XML_IMPORT_MAX_PRODUCTS` |
| PostgREST INSERT chunk size | 100 rows | `XML_IMPORT_INSERT_CHUNK` |
| Edge Function memory | 256 MB (Deno Deploy cap) | — |
| Synchronous CPU per invocation | ~2 s | — |

The chunk-insert into `data_import_job_products` happens in batches of `XML_IMPORT_INSERT_CHUNK` so a 20K-product feed doesn't exceed PostgREST's body limit. After the edge function returns, the Python service page-reads products via index and never holds more than one batch in memory.

For files larger than the limits: split into multiple smaller imports.

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
