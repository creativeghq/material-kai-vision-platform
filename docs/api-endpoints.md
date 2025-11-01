# MIVAA API Endpoints Reference

**Last Updated:** 2025-11-01
**Total Endpoints:** 112
**Status:** ✅ Complete Audit in Progress

Complete reference of all 112 API endpoints across 13 categories with detailed usage information, database operations, and integration points.

---

## 📋 Table of Contents

1. [RAG Routes](#1-rag-routes-25-endpoints) - 25 endpoints
2. [Admin Routes](#2-admin-routes-18-endpoints) - 18 endpoints
3. [Search Routes](#3-search-routes-18-endpoints) - 18 endpoints
4. [Documents Routes](#4-documents-routes-10-endpoints) - 10 endpoints
5. [AI Services Routes](#5-ai-services-routes-10-endpoints) - 10 endpoints
6. [Images Routes](#6-images-routes-5-endpoints) - 5 endpoints
7. [PDF Routes](#7-pdf-routes-4-endpoints) - 4 endpoints
8. [Products Routes](#8-products-routes-3-endpoints) - 3 endpoints
9. [Embeddings Routes](#9-embeddings-routes-3-endpoints) - 3 endpoints
10. [Together AI Routes](#10-together-ai-routes-3-endpoints) - 3 endpoints
11. [Anthropic Routes](#11-anthropic-routes-3-endpoints) - 3 endpoints
12. [Monitoring Routes](#12-monitoring-routes-3-endpoints) - 3 endpoints
13. [AI Metrics Routes](#13-ai-metrics-routes-2-endpoints) - 2 endpoints

---

## 1. RAG Routes (25 endpoints)

**Base Path:** `/api/rag` or `/api/v1/rag`
**Purpose:** Core RAG (Retrieval-Augmented Generation) functionality for document processing, querying, and management
**Used In:** Main PDF upload flow, Knowledge Base, Search functionality

### 1.1 POST /documents/upload-with-discovery

**Purpose:** Upload PDF with intelligent product discovery and focused extraction
**Used In:** Main PDF upload modal, Product catalog processing
**Flow:** User uploads PDF → Product discovery → Focused extraction → Chunking → Image processing → Product creation

**Request:**
```http
POST /api/rag/documents/upload-with-discovery
Content-Type: multipart/form-data

Parameters:
- file: PDF file (required)
- title: Document title (optional)
- description: Document description (optional)
- tags: Comma-separated tags (optional)
- chunk_size: Chunk size (default: 2048)
- chunk_overlap: Chunk overlap (default: 200)
- enable_product_discovery: Enable AI product discovery (default: true)
- focused_extraction: Process only product pages (default: true)
- discovery_model: AI model for discovery - "claude" or "gpt" (default: "claude")
```

**Response:**
```json
{
  "job_id": "uuid",
  "document_id": "uuid",
  "status": "processing",
  "message": "Document upload started with product discovery"
}
```

**Database Operations:**
- INSERT INTO documents
- INSERT INTO background_jobs
- UPDATE background_jobs.metadata (progress tracking)

**Metadata Fields Set:**
- `chunks_created` (int) - Number of chunks created
- `products_created` (int) - Number of products identified
- `images_extracted` (int) - Number of images extracted ✅ FIXED
- `processing_time` (float) - Total processing time in seconds

**Processing Stages:**
1. Stage 0 (0-15%): Product Discovery - Claude/GPT analyzes entire PDF
2. Stage 1 (15-30%): Focused Extraction - Extract only product pages
3. Stage 2 (30-50%): Chunking - Create chunks with LlamaIndex
4. Stage 3 (50-70%): Image Processing - Llama Vision + CLIP embeddings
5. Stage 4 (70-90%): Product Creation - Create product records
6. Stage 5 (90-100%): Quality Enhancement - Claude validation (async)

**Frontend Integration:**
- Used in: `PDFUploadModal.tsx`
- Polls: `GET /documents/job/{job_id}` for progress
- Displays: Real-time progress with stage indicators

---

### 1.2 POST /documents/upload-async

**Purpose:** Upload PDF with standard async processing (no product discovery)
**Used In:** Simple document upload without product extraction
**Flow:** User uploads PDF → Chunking → Embeddings → Complete

**Request:**
```http
POST /api/rag/documents/upload-async
Content-Type: multipart/form-data

Parameters:
- file: PDF file (required)
- title: Document title (optional)
- description: Document description (optional)
- tags: Comma-separated tags (optional)
- chunk_size: Chunk size (default: 2048)
- chunk_overlap: Chunk overlap (default: 200)
```

**Response:**
```json
{
  "job_id": "uuid",
  "document_id": "uuid",
  "status": "processing",
  "message": "Document processing started"
}
```

**Database Operations:**
- INSERT INTO documents
- INSERT INTO background_jobs
- INSERT INTO document_chunks (during processing)
- INSERT INTO embeddings (during processing)

---

### 1.3 POST /documents/upload-focused

**Purpose:** Upload PDF and extract only pages containing a specific product
**Used In:** Single product extraction from multi-product catalogs
**Flow:** User specifies product → PDF scanned → Extract matching pages → Process focused PDF

**Request:**
```http
POST /api/rag/documents/upload-focused
Content-Type: multipart/form-data

Parameters:
- file: PDF file (required)
- product_name: Product name to search for (required)
- designer: Designer/studio name (optional)
- search_terms: Additional search terms (optional)
- title: Document title (optional)
- description: Document description (optional)
- tags: Comma-separated tags (optional)
```

**Response:**
```json
{
  "job_id": "uuid",
  "document_id": "uuid",
  "status": "processing",
  "product_name": "NOVA",
  "pages_found": [5, 6, 7, 8, 9, 10, 11]
}
```

**Database Operations:**
- INSERT INTO documents
- INSERT INTO background_jobs
- INSERT INTO products (single product)

**Use Case:** Extract "NOVA" product from Harmony PDF (pages 5-11)

---

### 1.4 GET /documents/job/{job_id}

**Purpose:** Get job status and metadata for async processing
**Used In:** Progress tracking, completion detection, error handling
**Flow:** Frontend polls this endpoint every 2 seconds during processing

**Request:**
```http
GET /api/rag/documents/job/{job_id}
```

**Response:**
```json
{
  "job_id": "uuid",
  "status": "processing|completed|failed|interrupted",
  "document_id": "uuid",
  "progress": 75,
  "error": null,
  "metadata": {
    "chunks_created": 16,
    "products_created": 11,
    "images_extracted": 28,
    "processing_time": 123.45,
    "current_stage": "image_processing",
    "pages_completed": 7,
    "pages_failed": 0,
    "pages_skipped": 4
  },
  "checkpoints": [
    {
      "stage": "product_discovery",
      "progress": 15,
      "completed_at": "2025-11-01T18:00:00Z"
    }
  ],
  "created_at": "2025-11-01T17:58:00Z",
  "updated_at": "2025-11-01T18:02:00Z"
}
```

**Database Operations:**
- SELECT FROM background_jobs WHERE id = ?

**Critical Fields:** ✅ VERIFIED
- `metadata.chunks_created` - Used by test validation
- `metadata.products_created` - Used by test validation
- `metadata.images_extracted` - Used by test validation (FIXED: was images_stored)

**Frontend Integration:**
- Used in: `PDFUploadModal.tsx`, `ProcessingStatus.tsx`
- Polling interval: 2 seconds
- Stops polling when: status = "completed" or "failed"

---

### 1.5 GET /chunks

**Purpose:** Get document chunks with pagination
**Used In:** Knowledge Base viewer, Chunk inspector, Admin dashboard
**Flow:** User views document → Fetch chunks → Display in UI

**Request:**
```http
GET /api/rag/chunks?document_id={uuid}&limit=100&offset=0
```

**Response:**
```json
{
  "chunks": [
    {
      "id": "uuid",
      "document_id": "uuid",
      "content": "Chunk text content...",
      "chunk_index": 0,
      "metadata": {
        "page_number": 1,
        "chunk_type": "product",
        "product_id": "uuid"
      },
      "quality_score": 0.85,
      "created_at": "2025-11-01T18:00:00Z"
    }
  ],
  "total": 16
}
```

**Database Operations:**
- SELECT FROM document_chunks WHERE document_id = ? LIMIT ? OFFSET ?

**Frontend Integration:**
- Used in: `KnowledgeBase.tsx`, `ChunkViewer.tsx`
- Pagination: 100 chunks per page
- Displays: Chunk content, metadata, quality scores

---

### 1.6 GET /images

**Purpose:** Get document images with analysis results
**Used In:** Image gallery, Image inspector, Admin dashboard
**Flow:** User views document → Fetch images → Display gallery

**Request:**
```http
GET /api/rag/images?document_id={uuid}&limit=100&offset=0
```

**Response:**
```json
{
  "images": [
    {
      "id": "uuid",
      "document_id": "uuid",
      "image_url": "https://storage.supabase.co/...",
      "page_number": 5,
      "llama_analysis": {
        "materials": ["fabric", "leather"],
        "colors": ["beige", "brown"],
        "ocr_text": "NOVA Sofa"
      },
      "clip_embedding": [0.123, 0.456, ...],
      "quality_score": 0.92,
      "created_at": "2025-11-01T18:00:00Z"
    }
  ],
  "total": 28
}
```

**Database Operations:**
- SELECT FROM document_images WHERE document_id = ? LIMIT ? OFFSET ?

**Frontend Integration:**
- Used in: `ImageGallery.tsx`, `ImageViewer.tsx`
- Displays: Image thumbnails, AI analysis, quality scores
- Actions: View full image, re-analyze, delete

---

### 1.7 GET /products

**Purpose:** Get products extracted from document
**Used In:** Products tab, Product catalog, Materials page
**Flow:** User views products → Fetch from database → Display cards

**Request:**
```http
GET /api/rag/products?document_id={uuid}&limit=100&offset=0
```

**Response:**
```json
{
  "products": [
    {
      "id": "uuid",
      "name": "NOVA Sofa",
      "description": "Modern modular sofa system...",
      "source_document_id": "uuid",
      "metadata": {
        "designer": "Studio Kairos",
        "dimensions": "W: 240cm, D: 95cm, H: 75cm",
        "materials": ["fabric", "wood", "metal"],
        "page_range": [5, 11]
      },
      "quality_score": 0.88,
      "created_at": "2025-11-01T18:00:00Z"
    }
  ],
  "total": 11
}
```

**Database Operations:**
- SELECT FROM products WHERE source_document_id = ? LIMIT ? OFFSET ?

**Frontend Integration:**
- Used in: `ProductsTab.tsx`, `MaterialsPage.tsx`
- Displays: Product cards with images, metadata, specifications
- Actions: View details, edit, delete, export

---

### 1.8 POST /query

**Purpose:** Query documents using RAG (Retrieval-Augmented Generation)
**Used In:** Main search interface, Q&A functionality
**Flow:** User asks question → Semantic search → Retrieve relevant chunks → Generate answer with AI

**Request:**
```http
POST /api/rag/query
Content-Type: application/json

{
  "query": "What materials are used in NOVA sofa?",
  "document_ids": ["uuid1", "uuid2"],
  "top_k": 5,
  "model": "claude"
}
```

**Response:**
```json
{
  "answer": "The NOVA sofa uses fabric, wood, and metal materials...",
  "sources": [
    {
      "chunk_id": "uuid",
      "content": "...",
      "score": 0.92,
      "document_id": "uuid"
    }
  ],
  "model_used": "claude-sonnet-4.5"
}
```

**Database Operations:** SELECT FROM document_chunks, embeddings
**Frontend Integration:** SearchInterface.tsx, QAModal.tsx

---

### 1.9 POST /chat

**Purpose:** Conversational interface for document Q&A with context
**Used In:** Chat interface, conversational search
**Flow:** User sends message → Maintain conversation history → Generate contextual response

**Request:**
```http
POST /api/rag/chat
Content-Type: application/json

{
  "message": "Tell me more about the dimensions",
  "conversation_id": "uuid",
  "document_ids": ["uuid1"]
}
```

**Response:**
```json
{
  "response": "The NOVA sofa dimensions are W: 240cm, D: 95cm, H: 75cm...",
  "conversation_id": "uuid",
  "sources": [...],
  "model_used": "claude-sonnet-4.5"
}
```

**Database Operations:** SELECT FROM document_chunks, embeddings
**Frontend Integration:** ChatInterface.tsx

---

### 1.10 POST /search

**Purpose:** Semantic search across document collection
**Used In:** Search page, knowledge base search
**Flow:** User enters search term → Semantic/hybrid/keyword search → Return ranked results

**Request:**
```http
POST /api/rag/search
Content-Type: application/json

{
  "query": "modern sofas",
  "search_type": "semantic",
  "filters": {
    "document_ids": ["uuid1"],
    "tags": ["furniture"]
  },
  "top_k": 10
}
```

**Response:**
```json
{
  "results": [
    {
      "chunk_id": "uuid",
      "content": "...",
      "score": 0.89,
      "metadata": {...}
    }
  ],
  "total": 45
}
```

**Database Operations:** SELECT FROM document_chunks, embeddings
**Frontend Integration:** SearchPage.tsx, KnowledgeBase.tsx

---

### 1.11 POST /search/advanced

**Purpose:** Advanced query search with query expansion and optimization
**Used In:** Advanced search interface
**Flow:** User query → Query expansion → Multi-strategy search → Ranked results

**Request:**
```http
POST /api/rag/search/advanced
Content-Type: application/json

{
  "query": "sustainable furniture",
  "expand_query": true,
  "rerank": true,
  "filters": {...}
}
```

**Database Operations:** SELECT FROM document_chunks, embeddings
**Frontend Integration:** AdvancedSearch.tsx

---

### 1.12 POST /search/mmr

**Purpose:** MMR (Maximal Marginal Relevance) search for diverse results
**Used In:** Search with diversity requirements
**Flow:** User query → Semantic search → MMR reranking → Diverse results

**Request:**
```http
POST /api/rag/search/mmr
Content-Type: application/json

{
  "query": "chairs",
  "lambda_param": 0.5,
  "top_k": 10
}
```

**Database Operations:** SELECT FROM document_chunks, embeddings
**Frontend Integration:** SearchPage.tsx (diversity mode)

---

### 1.13 GET /documents

**Purpose:** List and filter documents in collection
**Used In:** Documents page, admin dashboard
**Flow:** User views documents → Fetch with filters → Display list

**Request:**
```http
GET /api/rag/documents?limit=20&offset=0&search=harmony&tags=catalog
```

**Response:**
```json
{
  "documents": [
    {
      "id": "uuid",
      "title": "Harmony PDF",
      "filename": "harmony.pdf",
      "page_count": 120,
      "chunks_count": 45,
      "images_count": 28,
      "products_count": 11,
      "created_at": "2025-11-01T18:00:00Z"
    }
  ],
  "total": 1
}
```

**Database Operations:** SELECT FROM documents
**Frontend Integration:** DocumentsPage.tsx, AdminDashboard.tsx

---

### 1.14 DELETE /documents/{document_id}

**Purpose:** Delete document and all associated data
**Used In:** Document management, cleanup
**Flow:** User deletes document → Remove from database → Delete from storage → Cleanup embeddings

**Request:**
```http
DELETE /api/rag/documents/{document_id}
```

**Response:**
```json
{
  "success": true,
  "deleted": {
    "document": 1,
    "chunks": 45,
    "images": 28,
    "products": 11,
    "embeddings": 225
  }
}
```

**Database Operations:**
- DELETE FROM documents
- DELETE FROM document_chunks
- DELETE FROM document_images
- DELETE FROM products
- DELETE FROM embeddings

**Frontend Integration:** DocumentsPage.tsx (delete button)

---

### 1.15 GET /health

**Purpose:** Health check for RAG services
**Used In:** Monitoring, admin dashboard
**Flow:** System checks → Verify all services → Return status

**Request:**
```http
GET /api/rag/health
```

**Response:**
```json
{
  "status": "healthy",
  "services": {
    "llamaindex": "healthy",
    "embeddings": "healthy",
    "vector_store": "healthy",
    "database": "healthy"
  },
  "timestamp": "2025-11-01T18:30:00Z"
}
```

**Database Operations:** None (service checks only)
**Frontend Integration:** AdminDashboard.tsx (health monitor)

---

### 1.16 GET /stats

**Purpose:** Get RAG system statistics
**Used In:** Admin dashboard, analytics
**Flow:** Fetch system metrics → Calculate statistics → Return summary

**Request:**
```http
GET /api/rag/stats
```

**Response:**
```json
{
  "documents": 150,
  "chunks": 6750,
  "images": 4200,
  "products": 1650,
  "embeddings": 33750,
  "storage_used_mb": 2450,
  "avg_processing_time": 125.5
}
```

**Database Operations:** SELECT COUNT FROM documents, document_chunks, document_images, products, embeddings
**Frontend Integration:** AdminDashboard.tsx (statistics panel)

---

### 1.17 GET /job/{job_id}/ai-tracking

**Purpose:** Get detailed AI model tracking for a job
**Used In:** Job monitoring, AI usage analytics
**Flow:** Fetch job → Get AI tracking data → Return model usage details

**Request:**
```http
GET /api/rag/job/{job_id}/ai-tracking
```

**Response:**
```json
{
  "job_id": "uuid",
  "models_used": {
    "LLAMA": {
      "calls": 28,
      "tokens": 45000,
      "cost": 0.45,
      "stages": ["image_analysis"]
    },
    "ANTHROPIC": {
      "calls": 2,
      "tokens": 12000,
      "cost": 1.20,
      "stages": ["product_discovery", "validation"]
    },
    "CLIP": {
      "calls": 140,
      "embeddings_generated": 140,
      "stages": ["image_embeddings"]
    }
  },
  "total_cost": 1.65
}
```

**Database Operations:** SELECT FROM background_jobs
**Frontend Integration:** JobMonitor.tsx, AIUsagePanel.tsx

---

### 1.18 GET /job/{job_id}/ai-tracking/model/{model_name}

**Purpose:** Get AI tracking for specific model
**Used In:** Model-specific analytics
**Flow:** Fetch job → Filter by model → Return model-specific data

**Request:**
```http
GET /api/rag/job/{job_id}/ai-tracking/model/LLAMA
```

**Database Operations:** SELECT FROM background_jobs
**Frontend Integration:** AIUsagePanel.tsx (model filter)

---

### 1.19 GET /job/{job_id}/ai-tracking/stage/{stage}

**Purpose:** Get AI tracking for specific processing stage
**Used In:** Stage-specific analytics
**Flow:** Fetch job → Filter by stage → Return stage-specific AI usage

**Request:**
```http
GET /api/rag/job/{job_id}/ai-tracking/stage/image_analysis
```

**Database Operations:** SELECT FROM background_jobs
**Frontend Integration:** StageMonitor.tsx

---

### 1.20 GET /jobs/{job_id}/checkpoints

**Purpose:** Get all checkpoints for a job
**Used In:** Job recovery, debugging
**Flow:** Fetch job → Get checkpoint history → Return checkpoint data

**Request:**
```http
GET /api/rag/jobs/{job_id}/checkpoints
```

**Response:**
```json
{
  "checkpoints": [
    {
      "stage": "product_discovery",
      "progress": 15,
      "data": {...},
      "completed_at": "2025-11-01T18:00:00Z"
    }
  ],
  "count": 6
}
```

**Database Operations:** SELECT FROM background_jobs
**Frontend Integration:** JobMonitor.tsx (checkpoint viewer)

---

### 1.21 POST /jobs/{job_id}/restart

**Purpose:** Manually restart job from last checkpoint
**Used In:** Job recovery, error handling
**Flow:** User triggers restart → Load checkpoint → Resume processing

**Request:**
```http
POST /api/rag/jobs/{job_id}/restart
```

**Response:**
```json
{
  "success": true,
  "job_id": "uuid",
  "resumed_from": "image_processing",
  "progress": 65
}
```

**Database Operations:**
- SELECT FROM background_jobs
- UPDATE background_jobs
- SELECT FROM documents

**Frontend Integration:** JobMonitor.tsx (restart button)

---

### 1.22 POST /documents/job/{job_id}/resume

**Purpose:** Resume job from last checkpoint (alias for restart)
**Used In:** Job recovery
**Flow:** Same as /jobs/{job_id}/restart

**Database Operations:** Same as restart endpoint
**Frontend Integration:** JobMonitor.tsx

---

### 1.23 GET /documents/jobs

**Purpose:** List all background jobs with filtering
**Used In:** Admin dashboard, job management
**Flow:** Fetch jobs → Apply filters → Return paginated list

**Request:**
```http
GET /api/rag/documents/jobs?limit=20&offset=0&status=processing
```

**Response:**
```json
{
  "jobs": [
    {
      "id": "uuid",
      "document_id": "uuid",
      "filename": "harmony.pdf",
      "status": "processing",
      "progress": 75,
      "created_at": "2025-11-01T18:00:00Z"
    }
  ],
  "total": 5
}
```

**Database Operations:** SELECT FROM background_jobs
**Frontend Integration:** AdminDashboard.tsx (jobs panel)

---

### 1.24 GET /documents/documents/{document_id}/content

**Purpose:** Get complete document content with all AI analysis
**Used In:** Document viewer, export functionality
**Flow:** Fetch document → Get all related data → Return comprehensive content

**Request:**
```http
GET /api/rag/documents/documents/{document_id}/content?include_chunks=true&include_images=true&include_products=true
```

**Response:**
```json
{
  "document": {...},
  "chunks": [...],
  "images": [...],
  "products": [...],
  "embeddings": [...]
}
```

**Database Operations:**
- SELECT FROM documents
- SELECT FROM document_chunks
- SELECT FROM document_images
- SELECT FROM products
- SELECT FROM embeddings

**Frontend Integration:** DocumentViewer.tsx, ExportModal.tsx

---

### 1.25 POST /documents/upload

**Purpose:** Upload and process document for RAG
**Used In:** Simple document upload
**Flow:** Upload → Process → Generate embeddings → Complete

**Request:**
```http
POST /api/rag/documents/upload
Content-Type: multipart/form-data

Parameters:
- file: PDF file
- title: Document title
- chunk_size: 2048
- chunk_overlap: 200
```

**Database Operations:**
- INSERT INTO documents
- INSERT INTO document_chunks
- INSERT INTO embeddings

**Frontend Integration:** SimpleUploadForm.tsx

---

## 2. Admin Routes (18 endpoints)

**Base Path:** `/api/admin`
**Purpose:** Administrative functions for system management
**Used In:** Admin dashboard, system configuration, job management

### 2.1 GET /jobs

**Purpose:** List all jobs with filtering and pagination
**Used In:** Admin dashboard jobs panel
**Flow:** Admin views jobs → Apply filters → Display paginated list

**Request:**
```http
GET /api/admin/jobs?status=processing&limit=20&offset=0
```

**Response:**
```json
{
  "jobs": [...],
  "total": 45
}
```

**Database Operations:** SELECT FROM background_jobs
**Frontend Integration:** AdminDashboard.tsx (jobs panel)

---

### 2.2 GET /jobs/statistics

**Purpose:** Get comprehensive job statistics and metrics
**Used In:** Admin dashboard analytics
**Flow:** Fetch all jobs → Calculate metrics → Return statistics

**Database Operations:** SELECT FROM background_jobs
**Frontend Integration:** AdminDashboard.tsx (statistics panel)

---

### 2.3 GET /jobs/{job_id}

**Purpose:** Get detailed status for specific job
**Used In:** Job monitoring, debugging
**Flow:** Fetch job by ID → Return full details

**Database Operations:** SELECT FROM background_jobs
**Frontend Integration:** JobMonitor.tsx

---

### 2.4 GET /jobs/{job_id}/status

**Purpose:** Alternative endpoint for job status
**Used In:** Job monitoring (alternative path)
**Flow:** Same as /jobs/{job_id}

**Database Operations:** SELECT FROM background_jobs
**Frontend Integration:** JobMonitor.tsx

---

### 2.5 DELETE /jobs/{job_id}

**Purpose:** Cancel a running job
**Used In:** Job management, error recovery
**Flow:** User cancels job → Update status → Stop processing

**Database Operations:** UPDATE background_jobs
**Frontend Integration:** JobMonitor.tsx (cancel button)

---

### 2.6 POST /bulk/process

**Purpose:** Process multiple documents in bulk
**Used In:** Bulk upload, batch processing
**Flow:** Upload multiple URLs → Queue jobs → Process in parallel

**Database Operations:** INSERT INTO documents, background_jobs
**Frontend Integration:** BulkUploadModal.tsx

---

### 2.7 GET /system/health

**Purpose:** Get comprehensive system health status
**Used In:** Monitoring dashboard, health checks
**Flow:** Check all services → Return health status

**Database Operations:** None (service checks only)
**Frontend Integration:** AdminDashboard.tsx (health monitor)

---

### 2.8 GET /system/metrics

**Purpose:** Get detailed system performance metrics
**Used In:** Performance monitoring, analytics
**Flow:** Collect metrics → Calculate statistics → Return data

**Database Operations:** SELECT FROM background_jobs, documents
**Frontend Integration:** AdminDashboard.tsx (metrics panel)

---

### 2.9 DELETE /data/cleanup

**Purpose:** Clean up old data from system
**Used In:** Data maintenance, storage management
**Flow:** Find old data → Delete records → Return summary

**Database Operations:** DELETE FROM documents, document_chunks, document_images, products, embeddings
**Frontend Integration:** AdminDashboard.tsx (cleanup button)

---

### 2.10 POST /data/backup

**Purpose:** Create backup of system data
**Used In:** Data backup, disaster recovery
**Flow:** Export data → Create backup file → Return download link

**Database Operations:** SELECT FROM all tables
**Frontend Integration:** AdminDashboard.tsx (backup button)

---

### 2.11 GET /data/export

**Purpose:** Export system data in various formats
**Used In:** Data export, reporting
**Flow:** Fetch data → Format (JSON/CSV) → Return file

**Database Operations:** SELECT FROM background_jobs, documents
**Frontend Integration:** AdminDashboard.tsx (export button)

---

### 2.12 GET /packages/status

**Purpose:** Get status of all system packages and dependencies
**Used In:** System diagnostics, dependency management
**Flow:** Check installed packages → Return versions and status

**Database Operations:** None (system checks only)
**Frontend Integration:** AdminDashboard.tsx (packages panel)

---

### 2.13 GET /jobs/{job_id}/progress

**Purpose:** Get detailed progress for specific job
**Used In:** Real-time job monitoring
**Flow:** Fetch job → Extract progress data → Return details

**Database Operations:** SELECT FROM background_jobs
**Frontend Integration:** JobMonitor.tsx (progress bar)

---

### 2.14 GET /jobs/progress/active

**Purpose:** Get progress for all active jobs
**Used In:** Multi-job monitoring
**Flow:** Fetch active jobs → Return progress summary

**Database Operations:** SELECT FROM background_jobs
**Frontend Integration:** AdminDashboard.tsx (active jobs panel)

---

### 2.15 GET /jobs/{job_id}/progress/pages

**Purpose:** Get page-by-page progress for job
**Used In:** Detailed progress tracking
**Flow:** Fetch job → Extract page progress → Return details

**Database Operations:** SELECT FROM background_jobs
**Frontend Integration:** JobMonitor.tsx (page progress)

---

### 2.16 GET /jobs/{job_id}/progress/stream

**Purpose:** Stream real-time progress updates (SSE)
**Used In:** Real-time monitoring
**Flow:** Open SSE connection → Stream progress updates

**Database Operations:** SELECT FROM background_jobs
**Frontend Integration:** JobMonitor.tsx (real-time updates)

---

### 2.17 POST /test-product-creation

**Purpose:** Test endpoint for enhanced product creation
**Used In:** Testing, development
**Flow:** Test product detection → Return results

**Database Operations:** SELECT/INSERT products
**Frontend Integration:** Development tools

---

### 2.18 POST /admin/images/{image_id}/process-ocr

**Purpose:** Manually reprocess image with OCR
**Used In:** Image reprocessing, error recovery
**Flow:** Fetch image → Run OCR → Update database

**Database Operations:** UPDATE document_images, document_chunks
**Frontend Integration:** ImageViewer.tsx (reprocess button)

---

## 3. Search Routes (18 endpoints)

**Base Path:** `/api/search`
**Purpose:** Search and query functionality across documents
**Used In:** Search interface, knowledge base, document discovery

**Extract Tables**
```http
POST /api/v1/extract/tables
Content-Type: multipart/form-data

Response: { tables: [{ page, content, format }] }
```

**Extract Images**
```http
POST /api/v1/extract/images
Content-Type: multipart/form-data

Response: { images: [{ page, filename, base64, metadata }] }
```

**Get Job Status**
```http
GET /api/v1/documents/job/{job_id}

Response: { status, progress, current_stage, checkpoint, error }
```

**Stream Job Progress**
```http
GET /api/v1/documents/job/{job_id}/progress/stream

Response: Server-Sent Events with real-time progress
```

---

### 2. Document Management (13 endpoints)

**Process Document**
```http
POST /api/documents/process
Content-Type: multipart/form-data

Parameters:
- file: PDF file
- extract_text: boolean
- extract_images: boolean
- extract_tables: boolean
- extract_metadata: boolean
- page_range: Optional "1-5" or "1,3,5"
- async_processing: boolean

Response: { success, message, job_id, async_processing }
```

**Process from URL**
```http
POST /api/documents/process-url
Content-Type: application/json

Body: { url, async_processing }
Response: { success, message, job_id }
```

**Analyze Document**
```http
POST /api/documents/analyze
Content-Type: multipart/form-data

Response: { structure, metadata, content_type }
```

**List Documents**
```http
GET /api/documents/documents

Query Parameters:
- workspace_id: Filter by workspace
- limit: Results per page (default: 20)
- offset: Pagination offset

Response: { documents: [...], total_count }
```

**Get Document**
```http
GET /api/documents/documents/{id}

Response: { id, filename, content_type, metadata, created_at }
```

**Get Document Content**
```http
GET /api/documents/documents/{id}/content

Response: { content, format, page_count }
```

**Delete Document**
```http
DELETE /api/documents/documents/{id}

Response: { success, message }
```

---

### 3. Search APIs (8 endpoints)

**Semantic Search**
```http
POST /api/search/semantic
Content-Type: application/json

Body: {
  query: "string",
  workspace_id: "string",
  limit: 10,
  threshold: 0.7
}

Response: { results: [{ id, title, score, content }] }
```

**Vector Search**
```http
POST /api/search/vector
Content-Type: application/json

Body: {
  embedding: [float],
  workspace_id: "string",
  limit: 10,
  metric: "cosine"
}

Response: { results: [{ id, similarity_score }] }
```

**Hybrid Search**
```http
POST /api/search/hybrid
Content-Type: application/json

Body: {
  query: "string",
  embedding: [float],
  workspace_id: "string",
  limit: 10,
  semantic_weight: 0.5
}

Response: { results: [...] }
```

**Visual Search**
```http
POST /api/search/visual
Content-Type: multipart/form-data

Parameters:
- image: Image file
- workspace_id: string
- limit: 10

Response: { results: [{ id, similarity_score, image_url }] }
```

**Material Search**
```http
POST /api/search/materials
Content-Type: application/json

Body: {
  query: "string",
  filters: { material_type, color, texture },
  limit: 10
}

Response: { materials: [...] }
```

**Search Recommendations**
```http
GET /api/search/recommendations

Query Parameters:
- query: string
- workspace_id: string

Response: { suggestions: [...] }
```

**Search Analytics**
```http
GET /api/analytics

Query Parameters:
- workspace_id: string
- date_range: "7d" | "30d" | "90d"

Response: { top_queries, search_volume, avg_response_time }
```

---

### 4. Image Analysis (5 endpoints)

**Analyze Image**
```http
POST /api/images/analyze
Content-Type: multipart/form-data

Parameters:
- image: Image file
- analysis_type: "material" | "color" | "texture" | "all"

Response: { materials, colors, textures, quality_score }
```

**Batch Image Analysis**
```http
POST /api/images/analyze/batch
Content-Type: multipart/form-data

Parameters:
- images: Multiple image files

Response: { results: [{ image_id, analysis }] }
```

**Search Similar Images**
```http
POST /api/images/search
Content-Type: multipart/form-data

Parameters:
- image: Image file
- limit: 10

Response: { similar_images: [...] }
```

**Upload & Analyze**
```http
POST /api/images/upload-and-analyze
Content-Type: multipart/form-data

Response: { image_id, url, analysis }
```

---

### 5. RAG System (7 endpoints)

**Upload Document**
```http
POST /api/v1/rag/documents/upload
Content-Type: multipart/form-data

Parameters:
- file: PDF file
- title: string
- metadata: JSON

Response: { document_id, chunks_created, embeddings_generated }
```

**Query RAG**
```http
POST /api/v1/rag/query
Content-Type: application/json

Body: {
  query: "string",
  workspace_id: "string",
  top_k: 5
}

Response: { results: [{ chunk_id, content, score }] }
```

**Chat with RAG**
```http
POST /api/v1/rag/chat
Content-Type: application/json

Body: {
  message: "string",
  conversation_id: "string",
  workspace_id: "string"
}

Response: { response, sources: [...] }
```

**Search RAG**
```http
POST /api/v1/rag/search
Content-Type: application/json

Body: { query, filters, limit }

Response: { results: [...] }
```

**List RAG Documents**
```http
GET /api/v1/rag/documents

Query Parameters:
- workspace_id: string
- limit: 20

Response: { documents: [...] }
```

**RAG Health**
```http
GET /api/v1/rag/health

Response: { status, indices_count, memory_usage }
```

**RAG Statistics**
```http
GET /api/v1/rag/stats

Response: { document_count, chunk_count, embedding_count }
```

---

### 6. Embeddings (3 endpoints)

**Generate Embedding**
```http
POST /api/embeddings/generate
Content-Type: application/json

Body: { text: "string" }

Response: { embedding: [float], dimension: 1536 }
```

**Batch Embeddings**
```http
POST /api/embeddings/batch
Content-Type: application/json

Body: { texts: ["string"] }

Response: { embeddings: [[float]] }
```

**CLIP Embeddings**
```http
POST /api/embeddings/clip-generate
Content-Type: multipart/form-data

Parameters:
- image: Image file
- embedding_type: "visual" | "color" | "texture" | "application"

Response: { embedding: [float], type, dimension }
```

---

### 7. Products (6 endpoints)

**Create Product**
```http
POST /api/products
Content-Type: application/json

Body: {
  name: "string",
  description: "string",
  metafields: {},
  images: ["image_id"],
  chunks: ["chunk_id"]
}

Response: { product_id, created_at }
```

**Get Product**
```http
GET /api/products/{id}

Response: { id, name, description, metafields, images, chunks }
```

**Update Product**
```http
PATCH /api/products/{id}
Content-Type: application/json

Body: { name, description, metafields }

Response: { success, updated_at }
```

**Delete Product**
```http
DELETE /api/products/{id}

Response: { success }
```

**List Products**
```http
GET /api/products

Query Parameters:
- workspace_id: string
- limit: 50
- offset: 0

Response: { products: [...], total_count }
```

**Find Similar Products**
```http
GET /api/products/{id}/similar

Query Parameters:
- limit: 10

Response: { similar_products: [...] }
```

---

### 8. Admin & Monitoring (8 endpoints)

**Get Job Progress**
```http
GET /api/admin/jobs/{id}/progress

Response: { job_id, status, progress_percent, current_stage }
```

**Get Page Progress**
```http
GET /api/admin/jobs/{id}/progress/pages

Response: { pages: [{ page_number, status, progress }] }
```

**Stream Progress**
```http
GET /api/admin/jobs/{id}/progress/stream

Response: Server-Sent Events
```

**Get Chunk Quality**
```http
GET /api/admin/chunks/quality

Query Parameters:
- workspace_id: string

Response: { chunks: [{ id, quality_score, status }] }
```

**AI Metrics**
```http
GET /api/admin/ai-metrics

Response: {
  models_used: [...],
  total_tokens: number,
  cost_estimate: number,
  processing_time: number
}
```

**System Health**
```http
GET /health

Response: { status, uptime, database, api_latency }
```

**Performance Metrics**
```http
GET /metrics

Response: { requests_per_second, avg_latency, error_rate }
```

**Performance Summary**
```http
GET /performance/summary

Response: { summary_stats }
```

---

## 🔐 Authentication

All endpoints require one of:

1. **Supabase JWT** (Frontend)
   ```
   Authorization: Bearer {supabase_jwt_token}
   ```

2. **MIVAA JWT** (Internal)
   ```
   Authorization: Bearer {mivaa_jwt_token}
   ```

3. **API Key** (External)
   ```
   X-API-Key: {api_key}
   ```

---

## 📊 Response Format

All endpoints return JSON:

```json
{
  "success": boolean,
  "data": {},
  "error": null,
  "timestamp": "2025-10-31T12:00:00Z"
}
```

---

## ⚡ Rate Limiting

- **Standard**: 100 requests/minute
- **Premium**: 1000 requests/minute
- **Enterprise**: Unlimited

---

**Total Endpoints**: 74+  
**Last Updated**: October 31, 2025  
**API Version**: v1

