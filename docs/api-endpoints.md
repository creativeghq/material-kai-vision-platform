# MIVAA API Endpoints Reference

**Last Updated:** 2025-11-14
**API Version:** v2.3.0
**Total Endpoints:** 125+ (119 + Knowledge Base)
**Status:** ✅ Production-Ready - Knowledge Base System Complete

Complete reference of all consolidated API endpoints with detailed usage information, database operations, and integration points.

**Recent Updates (v2.3.0 - Knowledge Base System):**
- ✅ **KNOWLEDGE BASE:** 15+ new endpoints for document management with AI embeddings (NEW)
  - Document CRUD with automatic embedding generation (1536D)
  - Smart content change detection (only regenerate when needed)
  - PDF text extraction using PyMuPDF
  - Semantic search (vector similarity)
  - Category hierarchy management
  - Product attachment system
  - Version history tracking
  - Comments and suggestions
  - Search analytics

**Previous Updates (v2.2.0):**
- ✅ **DATA IMPORT:** 4 endpoints for XML import and web scraping with dynamic field mapping
- ✅ **DUPLICATE DETECTION:** 7 endpoints for duplicate detection and product merging (factory-based only)
- ✅ **CONSOLIDATED PDF EXTRACTION:** `/api/pdf/extract/*` endpoints removed - use `/api/rag/documents/upload` with `processing_mode="quick"`
- ✅ **CONSOLIDATED UPLOAD:** Single `/api/rag/documents/upload` endpoint replaces 3 separate upload endpoints
- ✅ **CONSOLIDATED SEARCH:** Single `/api/rag/search` endpoint with strategy parameter replaces 8+ search endpoints
- ✅ **CONSOLIDATED HEALTH:** Single `/health` endpoint replaces 10+ individual health checks
- ✅ **METADATA MANAGEMENT:** 4 endpoints for scope detection, application, listing, and statistics

**Total API Endpoints:** 125+ endpoints across 17 categories
- ✅ **KNOWLEDGE BASE:** Complete documentation management system with AI embeddings
- ✅ **FRONTEND UPDATED:** All API clients updated to use new consolidated endpoints
- ✅ **FEATURES PRESERVED:** Prompt enhancement, category extraction, all processing modes intact
- ✅ **METADATA SYSTEM:** Dynamic metadata extraction with scope detection and override logic
- ✅ **PDF EXTRACTION:** Unified through RAG pipeline with optional quick mode
- ✅ **DUPLICATE DETECTION:** Factory-based duplicate detection and product merging (ready for integration)
- ✅ **DATA IMPORT:** XML import with AI-powered field mapping, batch processing, and scheduling

---

## ⚠️ Important: Legacy Endpoints Removed

**All `/api/documents/*` endpoints have been removed** (except `/api/document-entities/*` which are valid).

**Removed Endpoints (Use `/api/rag/*` instead):**
- `POST /api/documents/{document_id}/query` → Use `POST /api/rag/query`
- `GET /api/documents/{document_id}/related` → Use `GET /api/rag/search?strategy=semantic`
- `POST /api/documents/{document_id}/summarize` → Not implemented
- `POST /api/documents/{document_id}/extract-entities` → Not implemented
- `POST /api/documents/compare` → Not implemented
- `POST /api/documents/process` → Use `POST /api/rag/documents/upload`
- `POST /api/documents/process-url` → Use `POST /api/rag/documents/upload` with URL
- `POST /api/documents/analyze` → Use `POST /api/rag/documents/upload`
- `GET /api/documents/documents` → Use `GET /api/rag/documents`
- `GET /api/documents/documents/{id}` → Use `GET /api/rag/documents/{id}`
- `GET /api/documents/documents/{id}/content` → Use `GET /api/rag/documents/documents/{id}/content`
- `DELETE /api/documents/documents/{id}` → Use `DELETE /api/rag/documents/{id}`

---

## 📋 Table of Contents

**✨ CONSOLIDATED ENDPOINTS (One Endpoint, One Purpose, No Duplicates)**

1. [Core Endpoints](#1-core-endpoints) - Health, Status
2. [Knowledge Base Routes](#2-knowledge-base-routes) - Document Management, Semantic Search, Categories, Attachments ✨ NEW v2.3.0
3. [RAG Routes](#3-rag-routes) - Document Upload, Search, Query (CONSOLIDATED)
4. [Admin Routes](#4-admin-routes) - Admin management
5. [Search Routes](#5-search-routes) - Semantic, Vector, Hybrid Search (CONSOLIDATED)
6. [Document Entities Routes](#6-document-entities-routes) - Certificates, Logos, Specifications
7. [Products Routes](#7-products-routes) - Product management
8. [Images Routes](#8-images-routes) - Image processing
9. [Embeddings Routes](#9-embeddings-routes) - Embedding generation
10. [Together AI Routes](#10-together-ai-routes) - TogetherAI integration
11. [Anthropic Routes](#11-anthropic-routes) - Anthropic integration
12. [Monitoring Routes](#12-monitoring-routes) - System monitoring
13. [AI Metrics Routes](#13-ai-metrics-routes) - AI performance metrics
14. [Duplicate Detection Routes](#14-duplicate-detection-routes) - Duplicate detection and product merging
15. [Data Import Routes](#15-data-import-routes) - XML import, web scraping, batch processing
16. [Job Health Routes](#16-job-health-routes) - Job monitoring and health checks
17. [Suggestions Routes](#17-suggestions-routes) - Search suggestions and auto-complete

---

## 1. Core Endpoints

### 1.1 GET /health

**Purpose:** Unified health check for all MIVAA services
**Replaces:** 10+ individual health check endpoints (`/api/pdf/health`, `/api/rag/health`, `/api/search/health`, etc.)

**Request:**
```http
GET /health
```

**Response:**
```json
{
  "status": "healthy",
  "timestamp": "2025-11-02T10:00:00Z",
  "services": {
    "database": {"status": "healthy", "response_time_ms": 5},
    "storage": {"status": "healthy", "response_time_ms": 10},
    "ai_models": {
      "claude": {"status": "healthy", "response_time_ms": 150},
      "gpt": {"status": "healthy", "response_time_ms": 120},
      "llama": {"status": "healthy", "response_time_ms": 200}
    },
    "llamaindex": {"status": "healthy", "response_time_ms": 8}
  },
  "version": "1.0.0"
}
```

**Benefits:**
- ✅ Single request instead of 10+ requests
- ✅ Complete system status overview
- ✅ Individual service health details
- ✅ Response time metrics for each service

---

## 2. Knowledge Base Routes ✨ NEW v2.3.0

**Base Path:** `/api/kb`
**Purpose:** Document management system with AI embeddings, semantic search, and product attachments
**Philosophy:** Complete knowledge base for documentation, guides, specifications, and product information

### 2.1 POST /api/kb/documents

**Purpose:** Create a new knowledge base document with automatic embedding generation
**Used In:** Knowledge Base admin panel, Documentation editor
**Flow:** User creates document → Generate 1536D embedding → Store in database

**Request:**
```http
POST /api/kb/documents
Content-Type: application/json

{
  "workspace_id": "uuid",
  "title": "Installation Guide",
  "content": "Step 1: Prepare the surface...",
  "content_markdown": "# Installation Guide\n\n## Step 1...",
  "summary": "Complete installation instructions",
  "category_id": "uuid",
  "seo_keywords": ["installation", "guide", "setup"],
  "status": "draft",
  "visibility": "workspace",
  "metadata": {}
}
```

**Response:**
```json
{
  "id": "uuid",
  "workspace_id": "uuid",
  "title": "Installation Guide",
  "content": "Step 1: Prepare the surface...",
  "text_embedding": [0.123, -0.456, ...],
  "embedding_status": "success",
  "embedding_generated_at": "2025-11-14T10:30:00Z",
  "embedding_model": "text-embedding-3-small",
  "created_at": "2025-11-14T10:30:00Z",
  "view_count": 0
}
```

**Database Operations:**
- INSERT into `kb_docs` with embedding
- INSERT into `kb_doc_versions` (version history)
- Generate 1536D embedding using OpenAI text-embedding-3-small

---

### 2.2 GET /api/kb/documents/{doc_id}

**Purpose:** Retrieve a single knowledge base document by ID
**Used In:** Document viewer, Edit modal

**Request:**
```http
GET /api/kb/documents/{doc_id}?workspace_id=uuid
```

**Response:**
```json
{
  "id": "uuid",
  "workspace_id": "uuid",
  "title": "Installation Guide",
  "content": "Step 1: Prepare the surface...",
  "content_markdown": "# Installation Guide...",
  "summary": "Complete installation instructions",
  "category_id": "uuid",
  "embedding_status": "success",
  "created_at": "2025-11-14T10:30:00Z",
  "updated_at": "2025-11-14T10:30:00Z",
  "view_count": 5
}
```

---

### 2.3 PATCH /api/kb/documents/{doc_id}

**Purpose:** Update document with smart embedding regeneration
**Smart Detection:** Only regenerates embedding if content changed (title, content, summary, keywords, category)
**Used In:** Document editor

**Request:**
```http
PATCH /api/kb/documents/{doc_id}
Content-Type: application/json

{
  "workspace_id": "uuid",
  "title": "Updated Installation Guide",
  "content": "New content...",
  "status": "published"
}
```

**Response:**
```json
{
  "id": "uuid",
  "title": "Updated Installation Guide",
  "content": "New content...",
  "embedding_status": "success",
  "embedding_generated_at": "2025-11-14T11:00:00Z",
  "updated_at": "2025-11-14T11:00:00Z"
}
```

**Database Operations:**
- UPDATE `kb_docs` with new content
- INSERT into `kb_doc_versions` (version history)
- Regenerate embedding ONLY if content changed

---

### 2.4 DELETE /api/kb/documents/{doc_id}

**Purpose:** Delete a knowledge base document
**Used In:** Document management, Admin panel

**Request:**
```http
DELETE /api/kb/documents/{doc_id}?workspace_id=uuid
```

**Response:**
```
204 No Content
```

**Database Operations:**
- DELETE from `kb_docs` (cascades to attachments, versions, comments)

---

### 2.5 POST /api/kb/documents/from-pdf

**Purpose:** Create document from PDF with text extraction
**Used In:** PDF upload modal in Knowledge Base
**Flow:** Upload PDF → Extract text using PyMuPDF → Generate embedding → Store document

**Request:**
```http
POST /api/kb/documents/from-pdf
Content-Type: multipart/form-data

Parameters:
- file: PDF file
- workspace_id: uuid
- title: "Product Specifications"
- category_id: uuid (optional)
- status: "draft" | "published"
```

**Response:**
```json
{
  "id": "uuid",
  "title": "Product Specifications",
  "content": "Extracted text from PDF...",
  "embedding_status": "success",
  "created_at": "2025-11-14T10:30:00Z"
}
```

**Database Operations:**
- Extract text using PyMuPDF (fitz)
- INSERT into `kb_docs` with extracted text
- Generate 1536D embedding

---

### 2.6 POST /api/kb/search

**Purpose:** Search knowledge base documents using semantic, full-text, or hybrid search
**Used In:** Knowledge Base search interface, AI agent queries
**Flow:** Frontend → MIVAA API → Generate query embedding → Supabase vector search → Return results

**Architecture:**
1. Frontend calls MIVAA API with search query
2. MIVAA generates embedding for query using OpenAI (text-embedding-3-small)
3. MIVAA calls Supabase `match_kb_docs()` RPC function with query embedding
4. Supabase performs vector similarity search using pgvector `<=>` operator
5. Returns ranked results with similarity scores

**Why MIVAA Backend is Required:**
- Document embeddings already stored in `kb_docs.text_embedding` (generated when doc created)
- Search only generates ONE embedding (for the query)
- Cannot generate embeddings in Supabase RPC (requires OpenAI API call)
- Uses pgvector's optimized cosine similarity for fast search

**Request:**
```http
POST /api/kb/search
Content-Type: application/json

{
  "workspace_id": "uuid",
  "query": "How to install the product?",
  "search_type": "semantic",
  "limit": 20
}
```

**Search Types:**
- `semantic` - Vector similarity using pgvector cosine distance (default)
  - Generates query embedding via OpenAI
  - Compares against stored document embeddings
  - Returns results with similarity scores (0.0 - 1.0)
  - Minimum threshold: 0.5
- `full_text` - ILIKE-based keyword matching
  - Searches title and content fields
  - Case-insensitive
- `hybrid` - Combination of semantic + full-text
  - Weighted scoring for best results

**Response:**
```json
{
  "success": true,
  "results": [
    {
      "id": "uuid",
      "title": "Installation Guide",
      "content": "Step 1: Prepare the surface...",
      "similarity_score": 0.92,
      "created_at": "2025-11-14T10:30:00Z"
    }
  ],
  "total_count": 1,
  "search_time_ms": 45,
  "search_type": "semantic"
}
```

**Database Operations:**
- Generate query embedding (1536D)
- Vector similarity search using `<=>` operator
- Track search in `kb_search_analytics`

---

### 2.7 POST /api/kb/categories

**Purpose:** Create a new category
**Used In:** Category management UI

**Request:**
```http
POST /api/kb/categories
Content-Type: application/json

{
  "workspace_id": "uuid",
  "name": "Installation Guides",
  "description": "Step-by-step installation instructions",
  "parent_category_id": "uuid",
  "color": "#3B82F6",
  "icon": "📖",
  "sort_order": 1
}
```

**Response:**
```json
{
  "id": "uuid",
  "name": "Installation Guides",
  "description": "Step-by-step installation instructions",
  "color": "#3B82F6",
  "icon": "📖",
  "created_at": "2025-11-14T10:30:00Z"
}
```

---

### 2.8 GET /api/kb/categories

**Purpose:** List all categories for a workspace
**Used In:** Category dropdown, Category management

**Request:**
```http
GET /api/kb/categories?workspace_id=uuid
```

**Response:**
```json
{
  "success": true,
  "categories": [
    {
      "id": "uuid",
      "name": "Installation Guides",
      "description": "Step-by-step installation instructions",
      "parent_category_id": null,
      "color": "#3B82F6",
      "icon": "📖",
      "sort_order": 1,
      "document_count": 5
    }
  ]
}
```

---

### 2.9 POST /api/kb/attachments

**Purpose:** Attach a document to one or more products
**Used In:** Product attachment modal

**Request:**
```http
POST /api/kb/attachments
Content-Type: application/json

{
  "workspace_id": "uuid",
  "document_id": "uuid",
  "product_id": "uuid",
  "relationship_type": "primary",
  "relevance_score": 5
}
```

**Relationship Types:**
- `primary` - Main documentation for product
- `supplementary` - Additional information
- `related` - Related documentation
- `certification` - Certification documents
- `specification` - Technical specifications

**Response:**
```json
{
  "id": "uuid",
  "document_id": "uuid",
  "product_id": "uuid",
  "relationship_type": "primary",
  "relevance_score": 5,
  "created_at": "2025-11-14T10:30:00Z"
}
```

---

### 2.10 GET /api/kb/documents/{doc_id}/attachments

**Purpose:** Get all products attached to a document
**Used In:** Document viewer, Product links section

**Request:**
```http
GET /api/kb/documents/{doc_id}/attachments?workspace_id=uuid
```

**Response:**
```json
{
  "success": true,
  "attachments": [
    {
      "id": "uuid",
      "product_id": "uuid",
      "product_name": "Premium Flooring",
      "relationship_type": "primary",
      "relevance_score": 5
    }
  ]
}
```

---

### 2.11 GET /api/kb/products/{product_id}/documents

**Purpose:** Get all documents attached to a product
**Used In:** Product page documentation tab

**Request:**
```http
GET /api/kb/products/{product_id}/documents?workspace_id=uuid
```

**Response:**
```json
{
  "success": true,
  "documents": [
    {
      "id": "uuid",
      "title": "Installation Guide",
      "summary": "Complete installation instructions",
      "relationship_type": "primary",
      "relevance_score": 5,
      "view_count": 10
    }
  ]
}
```

---

### 2.12 GET /api/kb/health

**Purpose:** Health check for Knowledge Base service
**Used In:** System monitoring

**Request:**
```http
GET /api/kb/health
```

**Response:**
```json
{
  "status": "healthy",
  "service": "knowledge_base",
  "features": {
    "document_crud": true,
    "embedding_generation": true,
    "pdf_extraction": true,
    "semantic_search": true,
    "categories": true,
    "attachments": true
  },
  "endpoints": 15
}
```

---

## 3. RAG Routes (CONSOLIDATED)

**Base Path:** `/api/rag` or `/api/v1/rag`
**Purpose:** Core RAG (Retrieval-Augmented Generation) functionality for document processing, querying, and management
**Philosophy:** One endpoint per function with parameters for different modes/strategies

### 2.1 POST /api/rag/documents/upload

**Purpose:** CONSOLIDATED upload endpoint for all document processing scenarios
**Replaces:**
- `/api/documents/process` (removed)
- `/api/documents/process-url` (removed)
- `/api/documents/upload` (removed)
- `/api/documents/{document_id}/query` (removed)
- `/api/documents/{document_id}/related` (removed)
- `/api/documents/{document_id}/summarize` (removed)
- `/api/documents/{document_id}/extract-entities` (removed)
- `/api/documents/compare` (removed)

**Used In:** Main PDF upload modal, Product catalog processing, Simple document upload
**Flow:** User uploads PDF → AI discovery → Category extraction → Chunking → Image processing → Product creation

**Request:**
```http
POST /api/rag/documents/upload
Content-Type: multipart/form-data

Parameters (Form Data):
# File Upload (choose one)
- file: PDF file (for file upload)
- file_url: URL to PDF (for URL-based upload)

# Processing Mode (choose one)
- processing_mode: "quick" | "standard" | "deep" (default: "standard")
  * quick: Extract only (no embeddings, no AI analysis)
  * standard: Full RAG processing (embeddings + basic AI)
  * deep: Complete analysis (embeddings + advanced AI + validation)

# Category Extraction (choose one or more)
- categories: "products" | "certificates" | "logos" | "specifications" | "all" | "extract_only"
  * products: Extract product information
  * certificates: Extract certificates (async)
  * logos: Extract logos (async)
  * specifications: Extract specifications (async)
  * all: Extract all categories
  * extract_only: No category extraction, just chunks

# AI Model Selection
- discovery_model: "claude" | "gpt" | "haiku" (default: "claude")

# Prompt Enhancement System (PRESERVED)
- agent_prompt: Custom prompt for AI processing (optional)
- enable_prompt_enhancement: true | false (default: true)

# Document Metadata
- title: Document title (optional)
- description: Document description (optional)
- tags: Comma-separated tags (optional)
- workspace_id: Workspace ID (default: system workspace)

# Chunking Configuration
- chunk_size: Chunk size in characters (default: 2048)
- chunk_overlap: Overlap between chunks (default: 200)
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
- Polls: `GET /api/rag/documents/job/{job_id}` for progress
- Displays: Real-time progress with stage indicators

---

### 2.2 GET /api/rag/documents/job/{job_id}

**Purpose:** Get job status and metadata for async processing
**Used In:** Progress tracking, completion detection, error handling
**Flow:** Frontend polls this endpoint every 2 seconds during processing

**Request:**
```http
GET /api/rag/documents/job/{job_id}
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

### 2.19 POST /api/rag/metadata/detect-scope

**Purpose:** Detect metadata scope for text chunks (product-specific vs catalog-general)
**Used In:** PDF processing pipeline, metadata classification
**Flow:** Analyze chunk → Classify scope → Return scope with confidence

**Request:**
```http
POST /api/rag/metadata/detect-scope
Content-Type: application/json

Body:
{
  "chunk_content": "Available in 15×38 dimensions",
  "product_names": ["NOVA", "HARMONY", "ESSENCE"],
  "document_context": "Tile catalog with multiple products"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "scope": "catalog_general_implicit",
    "confidence": 0.92,
    "reasoning": "Dimensions mentioned without specific product reference",
    "applies_to": ["NOVA", "HARMONY", "ESSENCE"],
    "extracted_metadata": {
      "dimensions": "15×38"
    },
    "is_override": false
  }
}
```

**Scope Types:**
- `product_specific` - Mentions specific product name
- `catalog_general_explicit` - Explicitly says "all products"
- `catalog_general_implicit` - Metadata mentioned without product context
- `category_specific` - Applies to product category

**Database Operations:** None (AI-powered classification)
**Frontend Integration:** Admin metadata management, PDF processing monitoring

---

### 2.20 POST /api/rag/metadata/apply-to-products

**Purpose:** Apply metadata to products with scope-aware override logic
**Used In:** PDF processing pipeline (Stage 4), metadata management
**Flow:** Detect scope → Apply in order → Track overrides → Update database

**Request:**
```http
POST /api/rag/metadata/apply-to-products
Content-Type: application/json

Body:
{
  "document_id": "uuid",
  "chunks_with_scope": [
    {
      "chunk_id": "uuid",
      "content": "Available in 15×38",
      "scope": "catalog_general_implicit",
      "metadata": {"dimensions": "15×38"},
      "applies_to": ["NOVA", "HARMONY", "ESSENCE"]
    },
    {
      "chunk_id": "uuid",
      "content": "HARMONY dimensions: 20×40",
      "scope": "product_specific",
      "metadata": {"dimensions": "20×40"},
      "applies_to": ["HARMONY"]
    }
  ]
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "products_updated": 3,
    "metadata_fields_applied": 5,
    "overrides_tracked": 1,
    "catalog_general_count": 1,
    "product_specific_count": 1,
    "processing_time_ms": 245
  }
}
```

**Processing Order:**
1. Catalog-general (explicit) - Lowest priority
2. Catalog-general (implicit) - Low priority
3. Category-specific - Medium priority
4. Product-specific - Highest priority (can override)

**Database Operations:**
- UPDATE products SET metadata = metadata || new_metadata
- Track overrides in `_overrides` array

**Frontend Integration:** PDF processing pipeline, admin metadata management

---

### 2.21 GET /api/rag/metadata/list

**Purpose:** List metadata with filtering and pagination
**Used In:** Admin metadata viewer, metadata analytics
**Flow:** Query database → Filter → Paginate → Return results

**Request:**
```http
GET /api/rag/metadata/list?document_id=uuid&scope=catalog_general_implicit&limit=50&offset=0
```

**Query Parameters:**
- `document_id` (optional) - Filter by document
- `product_id` (optional) - Filter by product
- `scope` (optional) - Filter by scope type
- `metadata_key` (optional) - Filter by specific metadata field
- `limit` (optional) - Results per page (default: 50)
- `offset` (optional) - Pagination offset (default: 0)

**Response:**
```json
{
  "success": true,
  "data": {
    "items": [
      {
        "product_id": "uuid",
        "product_name": "NOVA",
        "metadata_key": "dimensions",
        "metadata_value": "15×38",
        "scope": "catalog_general_implicit",
        "source_chunk_id": "uuid",
        "is_override": false,
        "created_at": "2025-11-03T10:00:00Z"
      }
    ],
    "total": 125,
    "limit": 50,
    "offset": 0
  }
}
```

**Database Operations:**
- SELECT FROM products WHERE document_id = ?
- JOIN with document_chunks for source tracking

**Frontend Integration:** Admin metadata management page, metadata analytics dashboard

---

### 2.22 GET /api/rag/metadata/statistics

**Purpose:** Get metadata statistics and analytics
**Used In:** Admin dashboard, metadata analytics
**Flow:** Aggregate metadata → Calculate stats → Return summary

**Request:**
```http
GET /api/rag/metadata/statistics?document_id=uuid
```

**Query Parameters:**
- `document_id` (optional) - Filter by document
- `product_id` (optional) - Filter by product

**Response:**
```json
{
  "success": true,
  "data": {
    "total_products": 14,
    "total_metadata_fields": 156,
    "catalog_general_count": 45,
    "product_specific_count": 98,
    "category_specific_count": 13,
    "override_count": 8,
    "most_common_fields": [
      {"field": "dimensions", "count": 14},
      {"field": "material_category", "count": 14},
      {"field": "factory_name", "count": 14},
      {"field": "slip_resistance", "count": 12},
      {"field": "finish", "count": 10}
    ],
    "scope_distribution": {
      "catalog_general_implicit": 45,
      "catalog_general_explicit": 12,
      "product_specific": 98,
      "category_specific": 13
    }
  }
}
```

**Database Operations:**
- SELECT COUNT(*) FROM products
- Aggregate metadata fields across products
- Calculate scope distribution

**Frontend Integration:** Admin dashboard, metadata analytics page

---

## 3. Search Routes (CONSOLIDATED)

**Base Path:** `/api/rag`
**Purpose:** Unified search and query functionality across documents
**Philosophy:** Single search endpoint with strategy parameter instead of multiple separate endpoints

### 3.1 POST /search

**Purpose:** CONSOLIDATED search endpoint for all 6 search strategies ✅
**Status:** All strategies implemented (100% complete)
**Replaces:**
- `/api/search/semantic` (deprecated)
- `/api/search/similarity` (deprecated)
- `/api/search/multimodal` (deprecated)
- `/api/unified-search` (deprecated)
- `/api/search/materials/visual` (deprecated)

**Available Strategies:**

| Strategy | Status | Use Case | Performance |
|----------|--------|----------|-------------|
| `semantic` | ✅ | Natural language queries | <150ms |
| `vector` | ✅ | Exact similarity matching | <100ms |
| `multi_vector` | ✅ | Text + visual understanding | <200ms |
| `hybrid` | ✅ | Technical terms + semantics | <180ms |
| `material` | ✅ | Property-based filtering | <50ms |
| `image` | ✅ | Visual similarity | <150ms |
| `all` | ✅ | All strategies combined | <800ms |

**Request:**
```http
POST /api/rag/search?strategy={strategy}
Content-Type: application/json

Query Parameters:
- strategy: "semantic" | "vector" | "multi_vector" | "hybrid" | "material" | "image" | "all"
  * semantic: Natural language understanding with MMR diversity
  * vector: Pure vector similarity (no diversity)
  * multi_vector: Combines 3 embeddings (text 40%, visual 30%, multimodal 30%)
  * hybrid: Semantic (70%) + keyword matching (30%)
  * material: JSONB property filtering
  * image: Visual similarity using CLIP embeddings
  * all: Runs all 6 strategies in parallel (recommended)

Body:
{
  "query": "search query text",
  "workspace_id": "uuid",
  "top_k": 10,
  "similarity_threshold": 0.6,

  // Multi-vector weights (optional)
  "text_weight": 0.4,
  "visual_weight": 0.3,
  "multimodal_weight": 0.3,

  // Hybrid weights (optional)
  "semantic_weight": 0.7,
  "keyword_weight": 0.3,

  // Material filters (for material strategy)
  "material_filters": {
    "material_type": "Porcelain",
    "slip_resistance": "R11",
    "finish": "matte"
  },

  // Image search (for image strategy)
  "image_url": "https://example.com/tile.jpg",
  "image_base64": "data:image/jpeg;base64,..."
}
```

**Response:**
```json
{
  "query": "search query",
  "enhanced_query": "enhanced query if prompts applied",
  "results": [
    {
      "id": "uuid",
      "name": "Product Name",
      "description": "Product description",
      "relevance_score": 0.88,
      "metadata": {
        "material_type": "Porcelain",
        "dimensions": "60x60",
        "slip_resistance": "R11"
      },

      // For multi_vector strategy
      "score_breakdown": {
        "text_score": 0.85,
        "visual_score": 0.90,
        "multimodal_score": 0.89
      },

      // For all strategy
      "found_in_strategies": ["semantic", "multi_vector", "hybrid"],
      "strategy_scores": {
        "semantic": 0.85,
        "multi_vector": 0.90,
        "hybrid": 0.89
      }
    }
  ],
  "total_results": 15,
  "search_type": "all",
  "processing_time": 0.45,

  // For all strategy
  "strategies_executed": ["semantic", "vector", "multi_vector", "hybrid"],
  "strategies_count": 4
}
```

**Usage Examples:**

**1. Semantic Search (Natural Language):**
```bash
curl -X POST "https://v1api.materialshub.gr/api/rag/search?strategy=semantic" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "modern minimalist tiles for bathroom",
    "workspace_id": "uuid",
    "top_k": 10
  }'
```

**2. Multi-Vector Search (Text + Visual):**
```bash
curl -X POST "https://v1api.materialshub.gr/api/rag/search?strategy=multi_vector" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "geometric patterns in neutral colors",
    "workspace_id": "uuid",
    "top_k": 10,
    "text_weight": 0.4,
    "visual_weight": 0.3,
    "multimodal_weight": 0.3
  }'
```

**3. Hybrid Search (Semantic + Keyword):**
```bash
curl -X POST "https://v1api.materialshub.gr/api/rag/search?strategy=hybrid" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "R11 slip resistance porcelain",
    "workspace_id": "uuid",
    "top_k": 10,
    "semantic_weight": 0.7,
    "keyword_weight": 0.3
  }'
```

**4. Material Property Search:**
```bash
curl -X POST "https://v1api.materialshub.gr/api/rag/search?strategy=material" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "",
    "workspace_id": "uuid",
    "top_k": 50,
    "material_filters": {
      "material_type": "Porcelain",
      "slip_resistance": "R11",
      "finish": "matte"
    }
  }'
```

**5. Image Search (Visual Similarity):**
```bash
curl -X POST "https://v1api.materialshub.gr/api/rag/search?strategy=image" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "",
    "workspace_id": "uuid",
    "top_k": 10,
    "image_url": "https://example.com/tile-sample.jpg"
  }'
```

**6. All Strategies Combined (Recommended):**
```bash
curl -X POST "https://v1api.materialshub.gr/api/rag/search?strategy=all" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "modern geometric tiles",
    "workspace_id": "uuid",
    "top_k": 10
  }'
```

**Database Operations:**
- SELECT FROM products with vector similarity (pgvector)
- PostgreSQL full-text search (for hybrid strategy)
- JSONB property filtering (for material strategy)
- CLIP embedding generation (for image strategy)

**Frontend Integration:** SearchPage.tsx, KnowledgeBase.tsx, ProductDiscovery.tsx

**Related Documentation:** [Search Strategies Guide](./search-strategies.md)

**Database Operations:**
- SELECT FROM document_chunks (for text search)
- SELECT FROM document_images (for image search)
- SELECT FROM products (for material search)
- Uses pgvector for similarity search

**Frontend Integration:**
- Used in: `SearchInterface.tsx`, `KnowledgeBase.tsx`
- API Client: `mivaaApiClient.searchSemantic()`, `mivaaApiClient.searchVector()`, etc.

---

### 3.2 POST /query

**Purpose:** CONSOLIDATED query endpoint with auto-detecting modality
**Replaces:** Multiple query endpoints with different modalities

**Request:**
```http
POST /api/rag/query
Content-Type: application/json

{
  "query": "What are the dimensions of Nova?",
  "modality": "auto",  // "auto" | "text" | "image" | "multimodal"
  "limit": 10,
  "workspace_id": "uuid"
}
```

**Response:**
```json
{
  "success": true,
  "answer": "Nova has dimensions of 120cm x 80cm x 2cm",
  "sources": [
    {
      "chunk_id": "uuid",
      "content": "Nova dimensions: 120cm x 80cm x 2cm",
      "relevance_score": 0.98
    }
  ],
  "modality_detected": "text",
  "processing_time_ms": 150
}
```

---

### PDF Extraction - DEPRECATED ⚠️ (REMOVED)

**All `/api/pdf/extract/*` endpoints have been removed as of November 7, 2025.**

**Removed Endpoints:**
- `POST /api/pdf/extract/markdown` ❌ DELETED
- `POST /api/pdf/extract/tables` ❌ DELETED
- `POST /api/pdf/extract/images` ❌ DELETED

**Replacement:** Use `POST /api/rag/documents/upload` with `processing_mode="quick"`

The RAG endpoint provides identical functionality using the same PyMuPDF4LLM library:
```http
POST /api/rag/documents/upload
Content-Type: multipart/form-data

Body:
{
  "file": <PDF file>,
  "processing_mode": "quick",  // Fast extraction without RAG
  "workspace_id": "uuid"
}

Response: { markdown, tables, images, status }
```

**Benefits of consolidation:**
- ✅ Single endpoint for all extraction needs
- ✅ Optional RAG pipeline for enhanced processing
- ✅ Unified job tracking and progress monitoring
- ✅ Consistent error handling and response format

---

### 2. Document Management - DEPRECATED ⚠️

**All `/api/documents/*` endpoints have been removed. Use `/api/rag/*` endpoints instead.**

See Section 2 (RAG System) for current endpoints:
- Upload: `POST /api/rag/documents/upload`
- List: `GET /api/rag/documents`
- Get: `GET /api/rag/documents/{id}`
- Delete: `DELETE /api/rag/documents/{id}`
- Query: `POST /api/rag/query`
- Search: `GET /api/rag/search`

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

## 7. Document Entities Routes (5 endpoints)

**Base Path:** `/api/document-entities`
**Purpose:** Manage document entities (certificates, logos, specifications) as separate knowledge base
**Used In:** Docs Admin Page, Agentic queries, Product-document relationships
**Architecture:** Document entities are stored separately from products and linked via relationships

### 7.1 GET /api/document-entities/

**Purpose:** Get all document entities for a workspace with filtering
**Used In:** Docs Admin Page, Agentic queries
**Flow:** Query entities → Apply filters → Return paginated results

**Request:**
```http
GET /api/document-entities/?workspace_id={uuid}&entity_type=certificate&factory_name=Castellón Factory&limit=100&offset=0

Query Parameters:
- workspace_id: UUID (required)
- entity_type: certificate | logo | specification | marketing | bank_statement (optional)
- factory_name: Filter by factory name (optional)
- factory_group: Filter by factory group (optional)
- limit: Maximum results (default: 100)
- offset: Pagination offset (default: 0)
```

**Response:**
```json
[
  {
    "id": "uuid",
    "entity_type": "certificate",
    "name": "ISO 9001:2015",
    "description": "Quality Management System certification",
    "page_range": [45, 46],
    "factory_name": "Castellón Factory",
    "factory_group": "Harmony Group",
    "manufacturer": "Harmony Materials",
    "metadata": {
      "certificate_type": "quality_management",
      "issue_date": "2024-01-15",
      "expiry_date": "2027-01-15",
      "certifying_body": "TÜV SÜD",
      "standards": ["ISO 9001:2015"]
    },
    "created_at": "2024-01-15T10:30:00Z"
  }
]
```

**Database Operations:**
- SELECT FROM document_entities WHERE workspace_id = ? AND entity_type = ? AND factory_name = ?

**Frontend Integration:** DocsManagement.tsx (Docs Admin Page)

**Agentic Query Examples:**
- "Get all certifications for Castellón Factory" → `?entity_type=certificate&factory_name=Castellón Factory`
- "Get logos for Harmony Group" → `?entity_type=logo&factory_group=Harmony Group`

---

### 7.2 GET /api/document-entities/{entity_id}

**Purpose:** Get a specific document entity by ID
**Used In:** Entity detail view, relationship management
**Flow:** Fetch entity by ID → Return entity details

**Request:**
```http
GET /api/document-entities/{entity_id}
```

**Response:**
```json
{
  "id": "uuid",
  "entity_type": "certificate",
  "name": "ISO 9001:2015",
  "description": "Quality Management System certification",
  "page_range": [45, 46],
  "factory_name": "Castellón Factory",
  "metadata": {...},
  "created_at": "2024-01-15T10:30:00Z"
}
```

**Database Operations:**
- SELECT FROM document_entities WHERE id = ?

**Frontend Integration:** EntityDetailModal.tsx

---

### 7.3 GET /api/document-entities/product/{product_id}

**Purpose:** Get all document entities linked to a specific product
**Used In:** Product detail page, agentic queries
**Flow:** Fetch product relationships → Get linked entities → Return entities

**Request:**
```http
GET /api/document-entities/product/{product_id}?entity_type=certificate

Query Parameters:
- entity_type: Filter by entity type (optional)
```

**Response:**
```json
[
  {
    "entity_type": "certificate",
    "name": "ISO 9001:2015",
    "description": "Quality Management System certification",
    "page_range": [45, 46],
    "factory_name": "Castellón Factory",
    "metadata": {...}
  }
]
```

**Database Operations:**
- SELECT document_entities.* FROM product_document_relationships JOIN document_entities WHERE product_id = ?

**Frontend Integration:** ProductDetailPage.tsx

**Agentic Query Example:**
- "Get certifications for product NOVA" → First get product ID, then `/product/{nova_id}?entity_type=certificate`

---

### 7.4 GET /api/document-entities/factory/{factory_name}

**Purpose:** Get all document entities for a specific factory
**Used In:** Factory-specific queries, compliance reports
**Flow:** Query by factory name → Filter by entity type → Return entities

**Request:**
```http
GET /api/document-entities/factory/Castellón Factory?entity_type=certificate

Query Parameters:
- entity_type: Filter by entity type (optional)
```

**Response:**
```json
[
  {
    "entity_type": "certificate",
    "name": "ISO 9001:2015",
    "factory_name": "Castellón Factory",
    "factory_group": "Harmony Group",
    "metadata": {...}
  }
]
```

**Database Operations:**
- SELECT FROM document_entities WHERE factory_name = ? AND entity_type = ?

**Frontend Integration:** FactoryComplianceReport.tsx

**Agentic Query Example:**
- "Get all certifications for Castellón Factory" → `/factory/Castellón Factory?entity_type=certificate`

---

### 7.5 GET /api/document-entities/relationships/product/{product_id}

**Purpose:** Get all product-document relationships for a product
**Used In:** Relationship management, linking visualization
**Flow:** Fetch relationships → Return relationship details with scores

**Request:**
```http
GET /api/document-entities/relationships/product/{product_id}
```

**Response:**
```json
[
  {
    "id": "uuid",
    "product_id": "uuid",
    "document_entity_id": "uuid",
    "relationship_type": "certification",
    "relevance_score": 0.95,
    "metadata": {
      "linking_method": "ai_discovery",
      "confidence": 0.95
    },
    "created_at": "2024-01-15T10:30:00Z"
  }
]
```

**Database Operations:**
- SELECT FROM product_document_relationships WHERE product_id = ?

**Frontend Integration:** RelationshipViewer.tsx

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

## 15. Duplicate Detection Routes

**Purpose:** Detect and merge duplicate products from the same factory/manufacturer

**CRITICAL RULE:** Duplicates are ONLY detected when products have the same factory/manufacturer in metadata. Visual similarity alone does NOT constitute a duplicate.

### 15.1 POST /api/duplicates/detect

**Purpose:** Detect potential duplicates for a specific product

**Request:**
```json
{
  "product_id": "uuid",
  "workspace_id": "uuid",
  "similarity_threshold": 0.60
}
```

**Response:**
```json
{
  "success": true,
  "product_id": "uuid",
  "duplicates_found": 3,
  "duplicates": [
    {
      "product_id": "uuid",
      "name": "Product Name",
      "factory": "Factory Name",
      "overall_similarity": 0.92,
      "confidence_level": "high"
    }
  ]
}
```

---

### 15.2 POST /api/duplicates/batch-detect

**Purpose:** Scan entire workspace for duplicate products

**Request:**
```json
{
  "workspace_id": "uuid",
  "similarity_threshold": 0.75,
  "limit": 1000
}
```

**Response:**
```json
{
  "success": true,
  "workspace_id": "uuid",
  "duplicate_pairs_found": 15,
  "duplicate_pairs": [...]
}
```

---

### 15.3 GET /api/duplicates/cached

**Purpose:** Get cached duplicate detections

**Query Parameters:**
- `workspace_id` (required)
- `status` (optional): 'pending', 'reviewed', 'merged', 'dismissed'
- `min_similarity` (optional): default 0.60

**Response:**
```json
{
  "success": true,
  "workspace_id": "uuid",
  "cached_duplicates": 42,
  "duplicates": [...]
}
```

---

### 15.4 POST /api/duplicates/update-status

**Purpose:** Update duplicate detection status

**Request:**
```json
{
  "cache_id": "uuid",
  "status": "reviewed",
  "user_id": "uuid"
}
```

**Valid Statuses:** 'pending', 'reviewed', 'merged', 'dismissed'

---

### 15.5 POST /api/duplicates/merge

**Purpose:** Merge duplicate products into a single product

**Request:**
```json
{
  "target_product_id": "uuid",
  "source_product_ids": ["uuid1", "uuid2"],
  "workspace_id": "uuid",
  "user_id": "uuid",
  "merge_strategy": "manual",
  "merge_reason": "Duplicate from same factory"
}
```

**Response:**
```json
{
  "success": true,
  "history_id": "uuid",
  "target_product": {...},
  "merged_count": 2,
  "message": "Successfully merged 2 products"
}
```

---

### 15.6 POST /api/duplicates/undo-merge

**Purpose:** Undo a product merge operation

**Request:**
```json
{
  "history_id": "uuid",
  "user_id": "uuid"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Merge successfully undone",
  "restored_products": 2
}
```

---

### 15.7 GET /api/duplicates/merge-history

**Purpose:** Get merge history for a workspace

**Query Parameters:**
- `workspace_id` (required)
- `limit` (optional): default 50

**Response:**
```json
{
  "success": true,
  "workspace_id": "uuid",
  "merge_count": 12,
  "merges": [...]
}
```

---

## 16. Data Import Routes

**Category:** Data Import (XML, Web Scraping)
**Total Endpoints:** 4
**Status:** ✅ Phase 1 & 2 Complete (XML Import with Dynamic Mapping & Backend Processing)

### 16.1 POST /api/import/process

**Purpose:** Start processing an import job (called by Edge Function)

**Request:**
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

**Features:**
- Background task processing
- Batch processing (10 products at a time)
- Concurrent image downloads (5 parallel)
- Checkpoint recovery
- Real-time progress updates

**Database Operations:**
- Updates `data_import_jobs` status to 'processing'
- Creates records in `data_import_history`
- Inserts products into `products` table
- Links images via `document_images` table
- Creates chunks in `chunks` table

---

### 16.2 GET /api/import/jobs/{job_id}

**Purpose:** Get import job status and progress

**Path Parameters:**
- `job_id` (required): Import job ID

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

**Status Values:**
- `pending` - Job created, waiting to start
- `processing` - Job is being processed
- `completed` - Job completed successfully
- `failed` - Job failed with errors

**Database Operations:**
- Reads from `data_import_jobs` table
- Calculates progress percentage
- Estimates time remaining based on processing rate

---

### 16.3 GET /api/import/history

**Purpose:** Get import history for a workspace with pagination and filters

**Query Parameters:**
- `workspace_id` (required): Workspace ID
- `page` (optional, default: 1): Page number
- `page_size` (optional, default: 20): Items per page
- `status` (optional): Filter by status (pending, processing, completed, failed)
- `import_type` (optional): Filter by import type (xml, web_scraping)

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
      "completed_at": "2025-11-10T10:15:00Z",
      "is_scheduled": false,
      "next_run_at": null
    }
  ],
  "total_count": 50,
  "page": 1,
  "page_size": 20
}
```

**Database Operations:**
- Queries `data_import_jobs` table with filters
- Applies pagination
- Orders by `created_at DESC`

---

### 16.4 GET /api/import/health

**Purpose:** Health check for data import API

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

**Features Status:**
- ✅ `xml_import` - XML import with dynamic field mapping
- ⏳ `web_scraping` - Firecrawl integration (Phase 4)
- ✅ `batch_processing` - Process 10 products at a time
- ✅ `concurrent_image_downloads` - Download 5 images in parallel
- ✅ `checkpoint_recovery` - Resume from last successful batch
- ✅ `real_time_progress` - Real-time progress updates in database

---

## Edge Function Endpoints

### POST /xml-import-orchestrator

**Purpose:** Parse XML, detect fields, suggest mappings, create import jobs

**Hosted:** Supabase Edge Function (Deno)

**Request:**
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

**Response (Preview Mode):**
```json
{
  "success": true,
  "detected_fields": [
    {
      "xml_field": "ProductName",
      "suggested_mapping": "name",
      "confidence": 0.95,
      "sample_values": ["Product A", "Product B"]
    }
  ],
  "total_products": 10
}
```

**Response (Import Mode):**
```json
{
  "success": true,
  "job_id": "uuid",
  "total_products": 10
}
```

**Features:**
- XML parsing with field detection
- AI-powered field mapping (Claude Sonnet 4.5)
- Fallback rule-based mapping (multi-language support)
- Preview mode for field detection only
- Stores products in job metadata for Python API
- Calls Python API to start processing

**Database Operations:**
- Creates record in `data_import_jobs` table
- Stores original XML content for re-runs
- Stores field mappings for future use
- Links to mapping template if provided

---

### POST /scheduled-import-runner

**Purpose:** Run scheduled imports via Supabase Cron

**Hosted:** Supabase Edge Function (Deno)

**Trigger:** Supabase Cron (every 15 minutes)

**Features:**
- Fetches XML from source URLs
- Creates new import jobs with same field mappings
- Updates `next_run_at` timestamps
- Links to parent job via `parent_job_id`

**Database Operations:**
- Queries `data_import_jobs` for scheduled imports
- Creates new job records for each scheduled import
- Updates `last_run_at` and `next_run_at` timestamps

---

**Total Endpoints**: 119 (115 + 4 Data Import)
**Last Updated**: November 10, 2025

**See Also:**
- [Data Import System Documentation](data-import-system.md) - Complete guide to XML import and web scraping
**API Version**: v1

