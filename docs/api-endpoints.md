# MIVAA API Endpoints Reference

**Last Updated:** 2026-01-21
**API Version:** v2.6.0
**Total Endpoints:** 140+


Complete reference of all consolidated API endpoints with detailed usage information, database operations, and integration points.

**Recent Updates (v2.6.0 - January 2026):**
- **MULTI-CHANNEL MESSAGING:** 10+ endpoints for SMS, WhatsApp via Twilio (NEW)
  - `POST /functions/v1/messaging-api` - Unified messaging API (action-based routing)
  - Send single/bulk messages across SMS, WhatsApp
  - Template management with variable substitution
  - Twilio Content API for WhatsApp templates
  - WhatsApp pre-approved template support
  - Delivery analytics and cost tracking
  - Opt-out compliance management

**Previous Updates (v2.5.0 - December 30, 2025):**
- **IMAGE RE-CLASSIFICATION:** 1 new endpoint for AI-powered image re-classification
  - `POST /api/images/reclassify/{image_id}` - Re-run material vs non-material classification
  - Force validation with secondary model (Qwen-32B or Claude)
  - Real-time database updates with new classification results
  - Confidence scoring and reasoning

**Previous Updates (v2.3.0 - November 22, 2025):**
- **NEW ENDPOINTS:** 2 relationship query endpoints for validation and testing
  - `GET /api/rag/product-image-relationships` - Query product-to-image relationships
  - `GET /api/rag/chunk-product-relationships` - Query chunk-to-product relationships
  - Both support filtering by document_id or product_id
  - Include relationship metadata, scores, and statistics
  - Used for test validation and admin dashboards

**Previous Updates (v2.3.0 - Knowledge Base System):**
- **KNOWLEDGE BASE:** 15+ new endpoints for document management with AI embeddings (NEW)
  - Document CRUD with automatic embedding generation (1024D Voyage AI)
  - Smart content change detection (only regenerate when needed)
  - PDF text extraction using PyMuPDF
  - Semantic search (vector similarity)
  - Category hierarchy management
  - Product attachment system
  - Version history tracking
  - Comments and suggestions
  - Search analytics

**Previous Updates (v2.2.0):**
- **DATA IMPORT:** 4 endpoints for XML import and web scraping with dynamic field mapping
- **DUPLICATE DETECTION:** 7 endpoints for duplicate detection and product merging (factory-based only)
- **CONSOLIDATED PDF EXTRACTION:** `/api/pdf/extract/*` endpoints removed - use `/api/rag/documents/upload`
- **CONSOLIDATED UPLOAD:** Single `/api/rag/documents/upload` endpoint replaces 3 separate upload endpoints
- **CONSOLIDATED SEARCH:** Single `/api/rag/search` endpoint with strategy parameter replaces 8+ search endpoints
- **CONSOLIDATED HEALTH:** Single `/health` endpoint replaces 10+ individual health checks
- **METADATA MANAGEMENT:** 4 endpoints for scope detection, application, listing, and statistics

**Total API Endpoints:** 140+ endpoints across 19 categories
- **MULTI-CHANNEL MESSAGING:** SMS, WhatsApp messaging via Twilio ✨ NEW
- **KNOWLEDGE BASE:** Complete documentation management system with AI embeddings
- **FRONTEND UPDATED:** All API clients updated to use new consolidated endpoints
- **FEATURES PRESERVED:** Prompt enhancement, category extraction, all processing modes intact
- **METADATA SYSTEM:** Dynamic metadata extraction with scope detection and override logic
- **PDF EXTRACTION:** Unified through RAG pipeline with optional quick mode
- **DUPLICATE DETECTION:** Factory-based duplicate detection and product merging (ready for integration)
- **DATA IMPORT:** XML import with AI-powered field mapping, batch processing, and scheduling

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
10. [HuggingFace/Qwen Routes](#10-huggingface-qwen-routes) - Qwen3-VL integration
11. [Anthropic Routes](#11-anthropic-routes) - Anthropic integration
12. [Monitoring Routes](#12-monitoring-routes) - System monitoring
13. [AI Metrics Routes](#13-ai-metrics-routes) - AI performance metrics
14. [Duplicate Detection Routes](#14-duplicate-detection-routes) - Duplicate detection and product merging
15. [Data Import Routes](#15-data-import-routes) - XML import, web scraping, batch processing
16. [Job Health Routes](#16-job-health-routes) - Job monitoring and health checks
17. [Suggestions Routes](#17-suggestions-routes) - Search suggestions and auto-complete
19. [Messaging Routes](#19-messaging-routes-sms-whatsapp--new-v260) - SMS, WhatsApp via Twilio ✨ NEW v2.6.0

---

## 1. Core Endpoints

### 1.1 GET /health

**Purpose:** Unified health check for all MIVAA services
**Replaces:** 10+ individual health check endpoints (`/api/pdf/health`, `/api/rag/health`, `/api/search/health`, etc.)

The response includes `status`, `timestamp`, per-service health details with response times (database, storage, AI models including Claude/GPT/QWEN, and RAG), and a `version` field.

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
**Flow:** User creates document → Generate 1024D Voyage AI embedding → Store in database

**Request fields:** `workspace_id`, `title`, `content`, `content_markdown`, `summary`, `category_id`, `seo_keywords`, `status`, `visibility`, `metadata`

**Response fields:** `id`, `workspace_id`, `title`, `content`, `text_embedding`, `embedding_status`, `embedding_generated_at`, `embedding_model`, `created_at`, `view_count`

**Database Operations:**
- INSERT into `kb_docs` with embedding
- INSERT into `kb_doc_versions` (version history)
- Generate 1024D embedding using Voyage AI voyage-3.5 (updated 2026-04)

---

### 2.2 GET /api/kb/documents/{doc_id}

**Purpose:** Retrieve a single knowledge base document by ID
**Used In:** Document viewer, Edit modal

**Request:** `GET /api/kb/documents/{doc_id}?workspace_id=uuid`

**Response fields:** `id`, `workspace_id`, `title`, `content`, `content_markdown`, `summary`, `category_id`, `embedding_status`, `created_at`, `updated_at`, `view_count`

---

### 2.3 PATCH /api/kb/documents/{doc_id}

**Purpose:** Update document with smart embedding regeneration
**Smart Detection:** Only regenerates embedding if content changed (title, content, summary, keywords, category)
**Used In:** Document editor

**Request fields:** `workspace_id`, `title`, `content`, `status`

**Response fields:** `id`, `title`, `content`, `embedding_status`, `embedding_generated_at`, `updated_at`

**Database Operations:**
- UPDATE `kb_docs` with new content
- INSERT into `kb_doc_versions` (version history)
- Regenerate embedding ONLY if content changed

---

### 2.4 DELETE /api/kb/documents/{doc_id}

**Purpose:** Delete a knowledge base document
**Used In:** Document management, Admin panel

**Request:** `DELETE /api/kb/documents/{doc_id}?workspace_id=uuid`

**Response:** 204 No Content

**Database Operations:**
- DELETE from `kb_docs` (cascades to attachments, versions, comments)

---

### 2.5 POST /api/kb/documents/from-pdf

**Purpose:** Create document from PDF with text extraction
**Used In:** PDF upload modal in Knowledge Base
**Flow:** Upload PDF → Extract text using PyMuPDF → Generate embedding → Store document

**Request:** Multipart form-data with fields: `file` (PDF), `workspace_id`, `title`, `category_id` (optional), `status`

**Response fields:** `id`, `title`, `content` (extracted text), `embedding_status`, `created_at`

**Database Operations:**
- Extract text using PyMuPDF (fitz)
- INSERT into `kb_docs` with extracted text
- Generate 1024D Voyage AI embedding

---

### 2.6 POST /api/kb/search

**Purpose:** Search knowledge base documents using semantic, full-text, or hybrid search
**Used In:** Knowledge Base search interface, AI agent queries
**Flow:** Frontend → MIVAA API → Generate query embedding → Supabase vector search → Return results

**Architecture:**
1. Frontend calls MIVAA API with search query
2. MIVAA generates embedding for query using Voyage AI voyage-3.5 (updated 2026-04)
3. MIVAA calls Supabase `kb_match_docs()` RPC function with query embedding
4. Supabase performs vector similarity search using pgvector `<=>` operator
5. Returns ranked results with similarity scores

**Why MIVAA Backend is Required:**
- Document embeddings already stored in `kb_docs.text_embedding` (generated when doc created)
- Search only generates ONE embedding (for the query)
- Cannot generate embeddings in Supabase RPC (requires Voyage AI API call)
- Uses pgvector's optimized cosine similarity for fast search

**Request fields:** `workspace_id`, `query`, `search_type`, `limit`

**Search Types:**
- `semantic` - Vector similarity using pgvector cosine distance (default)
  - Generates query embedding via Voyage AI
  - Compares against stored document embeddings
  - Returns results with similarity scores (0.0 - 1.0)
  - Minimum threshold: 0.5
- `full_text` - ILIKE-based keyword matching
  - Searches title and content fields
  - Case-insensitive
- `hybrid` - Combination of semantic + full-text
  - Weighted scoring for best results

**Response fields:** `success`, `results` (array with id, title, content, similarity_score, created_at), `total_count`, `search_time_ms`, `search_type`

**Database Operations:**
- Generate query embedding (1024D, Voyage AI)
- Vector similarity search using `<=>` operator
- Track search in `kb_search_analytics`

---

### 2.7 POST /api/kb/categories

**Purpose:** Create a new category
**Used In:** Category management UI

**Request fields:** `workspace_id`, `name`, `description`, `parent_category_id`, `color`, `icon`, `sort_order`

**Response fields:** `id`, `name`, `description`, `color`, `icon`, `created_at`

---

### 2.8 GET /api/kb/categories

**Purpose:** List all categories for a workspace
**Used In:** Category dropdown, Category management

**Request:** `GET /api/kb/categories?workspace_id=uuid`

**Response:** `success` and a `categories` array with fields: `id`, `name`, `description`, `parent_category_id`, `color`, `icon`, `sort_order`, `document_count`

---

### 2.9 POST /api/kb/attachments

**Purpose:** Attach a document to one or more products
**Used In:** Product attachment modal

**Request fields:** `workspace_id`, `document_id`, `product_id`, `relationship_type`, `relevance_score`

**Relationship Types:**
- `primary` - Main documentation for product
- `supplementary` - Additional information
- `related` - Related documentation
- `certification` - Certification documents
- `specification` - Technical specifications

**Response fields:** `id`, `document_id`, `product_id`, `relationship_type`, `relevance_score`, `created_at`

---

### 2.10 GET /api/kb/documents/{doc_id}/attachments

**Purpose:** Get all products attached to a document
**Used In:** Document viewer, Product links section

**Request:** `GET /api/kb/documents/{doc_id}/attachments?workspace_id=uuid`

**Response:** `success` and `attachments` array with fields: `id`, `product_id`, `product_name`, `relationship_type`, `relevance_score`

---

### 2.11 GET /api/kb/products/{product_id}/documents

**Purpose:** Get all documents attached to a product
**Used In:** Product page documentation tab

**Request:** `GET /api/kb/products/{product_id}/documents?workspace_id=uuid`

**Response:** `success` and `documents` array with fields: `id`, `title`, `summary`, `relationship_type`, `relevance_score`, `view_count`

---

### 2.12 GET /api/kb/health

**Purpose:** Health check for Knowledge Base service
**Used In:** System monitoring

**Request:** `GET /api/kb/health`

**Response fields:** `status`, `service`, `features` (document_crud, embedding_generation, pdf_extraction, semantic_search, categories, attachments), `endpoints`

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

**Request:** Multipart form-data. Choose one source: `file` (PDF file) or `file_url` (URL to PDF). Additional parameters:
- `categories` — `products` | `certificates` | `logos` | `specifications` | `all` | `extract_only`
- `discovery_model` — `claude` | `gpt` | `haiku` (default: `claude`)
- `agent_prompt` — Custom prompt for AI processing (optional)
- `enable_prompt_enhancement` — `true` | `false` (default: `true`)
- `title`, `description`, `tags`, `workspace_id`
- `chunk_size` (default: 2048), `chunk_overlap` (default: 200)

All uploads use deep processing mode with complete AI analysis, image embeddings (CLIP), advanced product enrichment, quality validation, and full RAG pipeline.

**Response fields:** `job_id`, `document_id`, `status: "processing"`, `message`

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
3. Stage 2 (30-50%): Chunking - Create chunks for vector DB
4. Stage 3 (50-70%): Image Processing - Qwen3-VL + CLIP embeddings
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

**Request:** `GET /api/rag/documents/job/{job_id}`

**Response fields:** `job_id`, `status` (`processing` | `completed` | `failed` | `interrupted`), `document_id`, `progress`, `error`, `metadata` (chunks_created, products_created, images_extracted, processing_time, current_stage, pages_completed, pages_failed, pages_skipped), `checkpoints`, `created_at`, `updated_at`

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

**Request:** Multipart form-data with fields: `file` (required), `product_name` (required), `designer` (optional), `search_terms` (optional), `title`, `description`, `tags`

**Response fields:** `job_id`, `document_id`, `status: "processing"`, `product_name`, `pages_found`

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

**Request:** `GET /api/rag/documents/job/{job_id}`

**Response fields:** `job_id`, `status`, `document_id`, `progress`, `error`, `metadata`, `checkpoints`, `created_at`, `updated_at`

**Database Operations:** SELECT FROM background_jobs WHERE id = ?

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

**Request:** `GET /api/rag/chunks?document_id={uuid}&limit=100&offset=0`

**Response:** `chunks` array (id, document_id, content, chunk_index, metadata, quality_score, created_at) and `total` count

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

**Request:** `GET /api/rag/images?document_id={uuid}&limit=100&offset=0`

**Response:** `images` array (id, document_id, image_url, page_number, QWEN_analysis, clip_embedding, quality_score, created_at) and `total` count

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

**Request:** `GET /api/rag/products?document_id={uuid}&limit=100&offset=0`

**Response:** `products` array (id, name, description, source_document_id, metadata, quality_score, created_at) and `total` count

**Database Operations:**
- SELECT FROM products WHERE source_document_id = ? LIMIT ? OFFSET ?

**Frontend Integration:**
- Used in: `ProductsTab.tsx`, `MaterialsPage.tsx`
- Displays: Product cards with images, metadata, specifications
- Actions: View details, edit, delete, export

---

### 1.8 GET /product-image-relationships ✨ NEW

**Purpose:** Get product-to-image relationships for validation and testing
**Used In:** Test scripts, Admin dashboard, Relationship viewer
**Flow:** Query relationships → Return product-image links with scores

**Request:** `GET /api/rag/product-image-relationships?document_id={uuid}&limit=100&offset=0&min_score=0.0`

**Query Parameters:**
- `document_id` (optional) - Filter by document ID
- `product_id` (optional) - Filter by product ID
- `limit` (optional) - Maximum results (default: 100, max: 1000)
- `offset` (optional) - Pagination offset (default: 0)
- `min_score` (optional) - Minimum relevance score (default: 0.0, range: 0.0-1.0)

**Response:** `document_id`, `product_id`, `relationships` array (with product and image details), `count`, `limit`, `offset`, and `statistics` (total_relationships, by_relationship_type, min_score_filter)

**Database Operations:**
- SELECT FROM product_image_relationships JOIN products JOIN document_images
- Filter by document_id through products.source_document_id
- Filter by product_id directly
- Filter by min_score using relevance_score >= ?

**Frontend Integration:**
- Used in: Test validation scripts, Admin relationship viewer
- Displays: Product-to-image links with relevance scores
- Actions: View relationships, validate pipeline output

---

### 1.9 GET /chunk-product-relationships ✨ NEW

**Purpose:** Get chunk-to-product relationships for validation and testing
**Used In:** Test scripts, Admin dashboard, Content analysis
**Flow:** Query relationships → Return chunk-product links

**Request:** `GET /api/rag/chunk-product-relationships?document_id={uuid}&limit=100&offset=0`

**Query Parameters:**
- `document_id` (optional) - Filter by document ID
- `product_id` (optional) - Filter by product ID
- `limit` (optional) - Maximum results (default: 100, max: 1000)
- `offset` (optional) - Pagination offset (default: 0)

**Response:** `document_id`, `product_id`, `relationships` array (with chunk content and product name details), `count`, `limit`, `offset`

**Database Operations:**
- SELECT FROM chunk_product_relationships JOIN document_chunks JOIN products
- Filter by document_id through document_chunks.document_id
- Filter by product_id directly

**Frontend Integration:**
- Used in: Test validation scripts, Content inspector
- Displays: Chunk-to-product associations
- Actions: View content relationships, validate chunking

---

### 1.8 POST /query

**Purpose:** Query documents using RAG (Retrieval-Augmented Generation)
**Used In:** Main search interface, Q&A functionality
**Flow:** User asks question → Semantic search → Retrieve relevant chunks → Generate answer with AI

**Request fields:** `query`, `document_ids`, `top_k`, `model`

**Response fields:** `answer`, `sources` (chunk_id, content, score, document_id), `model_used`

**Database Operations:** SELECT FROM document_chunks, embeddings
**Frontend Integration:** SearchInterface.tsx, QAModal.tsx

---

### 1.9 POST /chat

**Purpose:** Conversational interface for document Q&A with context
**Used In:** Chat interface, conversational search
**Flow:** User sends message → Maintain conversation history → Generate contextual response

**Request fields:** `message`, `conversation_id`, `document_ids`

**Response fields:** `response`, `conversation_id`, `sources`, `model_used`

**Database Operations:** SELECT FROM document_chunks, embeddings
**Frontend Integration:** ChatInterface.tsx

---

### 1.10 POST /search

**Purpose:** Semantic search across document collection
**Used In:** Search page, knowledge base search
**Flow:** User enters search term → Semantic/hybrid/keyword search → Return ranked results

**Request fields:** `query`, `search_type`, `filters` (document_ids, tags), `top_k`

**Response:** `results` array (chunk_id, content, score, metadata) and `total`

**Database Operations:** SELECT FROM document_chunks, embeddings
**Frontend Integration:** SearchPage.tsx, KnowledgeBase.tsx

---

### 1.11 POST /search/advanced

**Purpose:** Advanced query search with query expansion and optimization
**Used In:** Advanced search interface
**Flow:** User query → Query expansion → Multi-strategy search → Ranked results

**Request fields:** `query`, `expand_query`, `rerank`, `filters`

**Database Operations:** SELECT FROM document_chunks, embeddings
**Frontend Integration:** AdvancedSearch.tsx

---

### 1.12 POST /search/mmr

**Purpose:** MMR (Maximal Marginal Relevance) search for diverse results
**Used In:** Search with diversity requirements
**Flow:** User query → Semantic search → MMR reranking → Diverse results

**Request fields:** `query`, `lambda_param`, `top_k`

**Database Operations:** SELECT FROM document_chunks, embeddings
**Frontend Integration:** SearchPage.tsx (diversity mode)

---

### 1.13 GET /documents

**Purpose:** List and filter documents in collection
**Used In:** Documents page, admin dashboard
**Flow:** User views documents → Fetch with filters → Display list

**Request:** `GET /api/rag/documents?limit=20&offset=0&search=harmony&tags=catalog`

**Response:** `documents` array (id, title, filename, page_count, chunks_count, images_count, products_count, created_at) and `total`

**Database Operations:** SELECT FROM documents
**Frontend Integration:** DocumentsPage.tsx, AdminDashboard.tsx

---

### 1.14 DELETE /documents/{document_id}

**Purpose:** Delete document and all associated data
**Used In:** Document management, cleanup
**Flow:** User deletes document → Remove from database → Delete from storage → Cleanup embeddings

**Request:** `DELETE /api/rag/documents/{document_id}`

**Response:** `success` and `deleted` counts (document, chunks, images, products, embeddings)

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

**Request:** `GET /api/rag/health`

**Response fields:** `status`, `services` (rag, embeddings, vector_store, database), `timestamp`

**Database Operations:** None (service checks only)
**Frontend Integration:** AdminDashboard.tsx (health monitor)

---

### 1.16 GET /stats

**Purpose:** Get RAG system statistics
**Used In:** Admin dashboard, analytics
**Flow:** Fetch system metrics → Calculate statistics → Return summary

**Request:** `GET /api/rag/stats`

**Response fields:** `documents`, `chunks`, `images`, `products`, `embeddings`, `storage_used_mb`, `avg_processing_time`

**Database Operations:** SELECT COUNT FROM documents, document_chunks, document_images, products, embeddings
**Frontend Integration:** AdminDashboard.tsx (statistics panel)

---

### 1.17 GET /job/{job_id}/ai-tracking

**Purpose:** Get detailed AI model tracking for a job
**Used In:** Job monitoring, AI usage analytics
**Flow:** Fetch job → Get AI tracking data → Return model usage details

**Request:** `GET /api/rag/job/{job_id}/ai-tracking`

**Response:** `job_id` and `models_used` (per-model: calls, tokens, cost, stages) and `total_cost`

**Database Operations:** SELECT FROM background_jobs
**Frontend Integration:** JobMonitor.tsx, AIUsagePanel.tsx

---

### 1.18 GET /job/{job_id}/ai-tracking/model/{model_name}

**Purpose:** Get AI tracking for specific model
**Used In:** Model-specific analytics
**Flow:** Fetch job → Filter by model → Return model-specific data

**Request:** `GET /api/rag/job/{job_id}/ai-tracking/model/QWEN`

**Database Operations:** SELECT FROM background_jobs
**Frontend Integration:** AIUsagePanel.tsx (model filter)

---

### 1.19 GET /job/{job_id}/ai-tracking/stage/{stage}

**Purpose:** Get AI tracking for specific processing stage
**Used In:** Stage-specific analytics
**Flow:** Fetch job → Filter by stage → Return stage-specific AI usage

**Request:** `GET /api/rag/job/{job_id}/ai-tracking/stage/image_analysis`

**Database Operations:** SELECT FROM background_jobs
**Frontend Integration:** StageMonitor.tsx

---

### 1.20 GET /jobs/{job_id}/checkpoints

**Purpose:** Get all checkpoints for a job
**Used In:** Job recovery, debugging
**Flow:** Fetch job → Get checkpoint history → Return checkpoint data

**Request:** `GET /api/rag/jobs/{job_id}/checkpoints`

**Response:** `checkpoints` array (stage, progress, data, completed_at) and `count`

**Database Operations:** SELECT FROM background_jobs
**Frontend Integration:** JobMonitor.tsx (checkpoint viewer)

---

### 1.21 POST /jobs/{job_id}/restart

**Purpose:** Manually restart job from last checkpoint
**Used In:** Job recovery, error handling
**Flow:** User triggers restart → Load checkpoint → Resume processing

**Request:** `POST /api/rag/jobs/{job_id}/restart`

**Response:** `success`, `job_id`, `resumed_from`, `progress`

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

**Request:** `GET /api/rag/documents/jobs?limit=20&offset=0&status=processing`

**Response:** `jobs` array (id, document_id, filename, status, progress, created_at) and `total`

**Database Operations:** SELECT FROM background_jobs
**Frontend Integration:** AdminDashboard.tsx (jobs panel)

---

### 1.24 GET /documents/documents/{document_id}/content

**Purpose:** Get complete document content with all AI analysis
**Used In:** Document viewer, export functionality
**Flow:** Fetch document → Get all related data → Return comprehensive content

**Request:** `GET /api/rag/documents/documents/{document_id}/content?include_chunks=true&include_images=true&include_products=true`

**Response:** `document`, `chunks`, `images`, `products`, `embeddings`

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

**Request:** Multipart form-data with fields: `file` (PDF), `title`, `chunk_size` (default: 2048), `chunk_overlap` (default: 200)

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

**Request:** `GET /api/admin/jobs?status=processing&limit=20&offset=0`

**Response:** `jobs` array and `total` count

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

**Request fields:** `chunk_content`, `product_names`, `document_context`

**Response:** `success` and `data` with `scope`, `confidence`, `reasoning`, `applies_to`, `extracted_metadata`, `is_override`

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

**Request fields:** `document_id`, `chunks_with_scope` (array of chunk_id, content, scope, metadata, applies_to)

**Response:** `success` and `data` with `products_updated`, `metadata_fields_applied`, `overrides_tracked`, `catalog_general_count`, `product_specific_count`, `processing_time_ms`

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

**Request:** `GET /api/rag/metadata/list?document_id=uuid&scope=catalog_general_implicit&limit=50&offset=0`

**Query Parameters:**
- `document_id` (optional) - Filter by document
- `product_id` (optional) - Filter by product
- `scope` (optional) - Filter by scope type
- `metadata_key` (optional) - Filter by specific metadata field
- `limit` (optional) - Results per page (default: 50)
- `offset` (optional) - Pagination offset (default: 0)

**Response:** `success` and `data` with `items` array (product_id, product_name, metadata_key, metadata_value, scope, source_chunk_id, is_override, created_at), `total`, `limit`, `offset`

**Database Operations:**
- SELECT FROM products WHERE document_id = ?
- JOIN with document_chunks for source tracking

**Frontend Integration:** Admin metadata management page, metadata analytics dashboard

---

### 2.22 GET /api/rag/metadata/statistics

**Purpose:** Get metadata statistics and analytics
**Used In:** Admin dashboard, metadata analytics
**Flow:** Aggregate metadata → Calculate stats → Return summary

**Request:** `GET /api/rag/metadata/statistics?document_id=uuid`

**Query Parameters:**
- `document_id` (optional) - Filter by document
- `product_id` (optional) - Filter by product

**Response:** `success` and `data` with `total_products`, `total_metadata_fields`, `catalog_general_count`, `product_specific_count`, `category_specific_count`, `override_count`, `most_common_fields`, `scope_distribution`

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

**Request:** `POST /api/rag/search?strategy={strategy}` with body fields:
- `query` — search query text
- `workspace_id`
- `top_k`
- `similarity_threshold`
- `text_weight`, `visual_weight`, `multimodal_weight` (for multi_vector strategy)
- `semantic_weight`, `keyword_weight` (for hybrid strategy)
- `material_filters` — `material_type`, `slip_resistance`, `finish` (for material strategy)
- `image_url` or `image_base64` (for image strategy)

**Response:** `query`, `enhanced_query`, `results` array (id, name, description, relevance_score, metadata, score_breakdown for multi_vector, found_in_strategies for all), `total_results`, `search_type`, `processing_time`, `strategies_executed`, `strategies_count`

**Usage Examples:**

**1. Semantic Search (Natural Language):** POST to `?strategy=semantic` with `query` and `workspace_id`

**2. Multi-Vector Search (Text + Visual):** POST to `?strategy=multi_vector` with `query`, `workspace_id`, and optional weight overrides

**3. Hybrid Search (Semantic + Keyword):** POST to `?strategy=hybrid` with `query`, `workspace_id`, `semantic_weight`, `keyword_weight`

**4. Material Property Search:** POST to `?strategy=material` with `query: ""`, `workspace_id`, and `material_filters` object

**5. Image Search (Visual Similarity):** POST to `?strategy=image` with `query: ""`, `workspace_id`, and `image_url`

---

### 3.X POST /api/rag/search/knowledge-base ✨ NEW

**Purpose:** Search existing knowledge base without uploading a PDF
**Added:** 2025-12-03 (v2.4.0)
**Used In:** Knowledge base search, entity discovery, product search
**Flow:** User searches → Multi-vector search across products/entities/chunks → Return unified results

**Features:**
- Uses same **multi-vector search** as main search endpoint
- Combines 6 specialized CLIP embeddings (text 20%, visual 20%, color 15%, texture 15%, style 15%, material 15%)
- Searches across products, entities, chunks, and images
- Supports category filtering and entity type filtering
- Returns comprehensive results with all metadata and embeddings

**Request fields:**
- `query` (required)
- `workspace_id` (required)
- `search_types` (optional) — `["products", "entities", "chunks", "images"]` (default: all)
- `categories` (optional) — `["product", "certificate", "logo", "specification", "general"]`
- `entity_types` (optional) — `["certificate", "logo", "specification"]`
- `top_k` (optional, default: 10)
- `similarity_threshold` (optional, default: 0.7)

**Response fields:** `query`, `total_results`, `products` array, `entities` array, `chunks` array, `images` array, `processing_time`, `search_metadata`

**Database Operations:**
- SELECT FROM products (with multi-vector search)
- SELECT FROM document_entities (with embedding search)
- SELECT FROM document_chunks (with category filtering)
- SELECT FROM document_images (with CLIP embeddings)

**Frontend Integration:**
- KnowledgeBaseSearch.tsx
- EntityDiscovery.tsx
- ProductSearch.tsx

**Usage Examples:**
- Search for products only: set `search_types: ["products"]`
- Search for certificates: set `search_types: ["entities"]`, `entity_types: ["certificate"]`
- Search across all types with category filter: set `search_types: ["products", "chunks"]`, `categories: ["product"]`
- All strategies combined: POST to `?strategy=all` with query

**Database Operations:**
- SELECT FROM products with vector similarity (pgvector)
- PostgreSQL full-text search (for hybrid strategy)
- JSONB property filtering (for material strategy)
- CLIP embedding generation (for image strategy)

**Frontend Integration:** SearchPage.tsx, KnowledgeBase.tsx, ProductDiscovery.tsx

**Related Documentation:** [Search Strategies Guide](./search-strategies.md)

---

### 3.2 POST /query

**Purpose:** CONSOLIDATED query endpoint with auto-detecting modality
**Replaces:** Multiple query endpoints with different modalities

**Request fields:** `query`, `modality` (`auto` | `text` | `image` | `multimodal`), `limit`, `workspace_id`

**Response fields:** `success`, `answer`, `sources` (chunk_id, content, relevance_score), `modality_detected`, `processing_time_ms`

---

### PDF Extraction - DEPRECATED ⚠️ (REMOVED)

**All `/api/pdf/extract/*` endpoints have been removed as of November 7, 2025.**

**Removed Endpoints:**
- `POST /api/pdf/extract/markdown` ❌ DELETED
- `POST /api/pdf/extract/tables` ❌ DELETED
- `POST /api/pdf/extract/images` ❌ DELETED

**Replacement:** Use `POST /api/rag/documents/upload`

The RAG endpoint provides identical functionality using the same PyMuPDF4LLM library. It accepts multipart/form-data with a `file` (PDF) and `workspace_id` and returns markdown, tables, images, and status.

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

**Semantic Search** — `POST /api/search/semantic` — body: `query`, `workspace_id`, `limit`, `threshold` — response: `results` array (id, title, score, content)

**Vector Search** — `POST /api/search/vector` — body: `embedding` (float array), `workspace_id`, `limit`, `metric` — response: `results` array (id, similarity_score)

**Hybrid Search** — `POST /api/search/hybrid` — body: `query`, `embedding`, `workspace_id`, `limit`, `semantic_weight` — response: `results` array

**Visual Search** — `POST /api/search/visual` — multipart: `image` file, `workspace_id`, `limit` — response: `results` array (id, similarity_score, image_url)

**Material Search** — `POST /api/search/materials` — body: `query`, `filters` (material_type, color, texture), `limit` — response: `materials` array

**Search Recommendations** — `GET /api/search/recommendations` — query params: `query`, `workspace_id` — response: `suggestions` array

**Search Analytics** — `GET /api/analytics` — query params: `workspace_id`, `date_range` — response: `top_queries`, `search_volume`, `avg_response_time`

---

### 4. Image Analysis (6 endpoints)

**Analyze Image** — `POST /api/images/analyze` — multipart: `image` file, `analysis_type` — response: `materials`, `colors`, `textures`, `quality_score`

**Batch Image Analysis** — `POST /api/images/analyze/batch` — multipart: multiple `images` — response: `results` array (image_id, analysis)

**Search Similar Images** — `POST /api/images/search` — multipart: `image` file, `limit` — response: `similar_images` array

**Upload & Analyze** — `POST /api/images/upload-and-analyze` — multipart — response: `image_id`, `url`, `analysis`

**Re-classify Image ✨ NEW** — `POST /api/images/reclassify/{image_id}` — params: `image_id`, `force_validation` (optional boolean) — response: `success`, `image_id`, `classification` (is_material, confidence, reason, model), `updated_data`, `message`

---

### 5. RAG System (7 endpoints)

**Upload Document** — `POST /api/v1/rag/documents/upload` — multipart: `file`, `title`, `metadata` — response: `document_id`, `chunks_created`, `embeddings_generated`

**Query RAG** — `POST /api/v1/rag/query` — body: `query`, `workspace_id`, `top_k` — response: `results` array (chunk_id, content, score)

**Chat with RAG** — `POST /api/v1/rag/chat` — body: `message`, `conversation_id`, `workspace_id` — response: `response`, `sources` array

**Search RAG** — `POST /api/v1/rag/search` — body: `query`, `filters`, `limit` — response: `results` array

**List RAG Documents** — `GET /api/v1/rag/documents` — query params: `workspace_id`, `limit` — response: `documents` array

**RAG Health** — `GET /api/v1/rag/health` — response: `status`, `indices_count`, `memory_usage`

**RAG Statistics** — `GET /api/v1/rag/stats` — response: `document_count`, `chunk_count`, `embedding_count`

---

### 6. Embeddings (3 endpoints)

**Generate Embedding** — `POST /api/embeddings/generate` — body: `text` — response: `embedding` (float array), `dimension`

**Batch Embeddings** — `POST /api/embeddings/batch` — body: `texts` (string array) — response: `embeddings` (array of float arrays)

**CLIP Embeddings** — `POST /api/embeddings/clip-generate` — multipart: `image` file, `embedding_type` — response: `embedding`, `type`, `dimension`

---

### 7. Products (6 endpoints)

**Create Product** — `POST /api/products` — body: `name`, `description`, `metafields`, `images`, `chunks` — response: `product_id`, `created_at`

**Get Product** — `GET /api/products/{id}` — response: `id`, `name`, `description`, `metafields`, `images`, `chunks`

**Update Product** — `PATCH /api/products/{id}` — body: `name`, `description`, `metafields` — response: `success`, `updated_at`

**Delete Product** — `DELETE /api/products/{id}` — response: `success`

**List Products** — `GET /api/products` — query params: `workspace_id`, `limit`, `offset` — response: `products` array, `total_count`

**Find Similar Products** — `GET /api/products/{id}/similar` — query params: `limit` — response: `similar_products` array

---

### 8. Admin & Monitoring (8 endpoints)

**Get Job Progress** — `GET /api/admin/jobs/{id}/progress` — response: `job_id`, `status`, `progress_percent`, `current_stage`

**Get Page Progress** — `GET /api/admin/jobs/{id}/progress/pages` — response: `pages` array (page_number, status, progress)

**Stream Progress** — `GET /api/admin/jobs/{id}/progress/stream` — response: Server-Sent Events

**Get Chunk Quality** — `GET /api/admin/chunks/quality` — query params: `workspace_id` — response: `chunks` array (id, quality_score, status)

**AI Metrics** — `GET /api/admin/ai-metrics` — response: `models_used`, `total_tokens`, `cost_estimate`, `processing_time`

**System Health** — `GET /health` — response: `status`, `uptime`, `database`, `api_latency`

**Performance Metrics** — `GET /metrics` — response: `requests_per_second`, `avg_latency`, `error_rate`

**Performance Summary** — `GET /performance/summary` — response: `summary_stats`

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

**Request:** `GET /api/document-entities/?workspace_id={uuid}&entity_type=certificate&factory_name=Castellón Factory&limit=100&offset=0`

**Query Parameters:**
- `workspace_id` — UUID (required)
- `entity_type` — certificate | logo | specification | marketing | bank_statement (optional)
- `factory_name` — Filter by factory name (optional)
- `factory_group` — Filter by factory group (optional)
- `limit` — Maximum results (default: 100)
- `offset` — Pagination offset (default: 0)

**Response:** Array of entities with fields: `id`, `entity_type`, `name`, `description`, `page_range`, `factory_name`, `factory_group`, `manufacturer`, `metadata`, `created_at`

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

**Request:** `GET /api/document-entities/{entity_id}`

**Response fields:** `id`, `entity_type`, `name`, `description`, `page_range`, `factory_name`, `metadata`, `created_at`

**Database Operations:**
- SELECT FROM document_entities WHERE id = ?

**Frontend Integration:** EntityDetailModal.tsx

---

### 7.3 GET /api/document-entities/product/{product_id}

**Purpose:** Get all document entities linked to a specific product
**Used In:** Product detail page, agentic queries
**Flow:** Fetch product relationships → Get linked entities → Return entities

**Request:** `GET /api/document-entities/product/{product_id}?entity_type=certificate`

**Query Parameters:**
- `entity_type` — Filter by entity type (optional)

**Response:** Array of entities with fields: `entity_type`, `name`, `description`, `page_range`, `factory_name`, `metadata`

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

**Request:** `GET /api/document-entities/factory/Castellón Factory?entity_type=certificate`

**Query Parameters:**
- `entity_type` — Filter by entity type (optional)

**Response:** Array of entities with fields: `entity_type`, `name`, `factory_name`, `factory_group`, `metadata`

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

**Request:** `GET /api/document-entities/relationships/product/{product_id}`

**Response:** Array of relationships with fields: `id`, `product_id`, `document_entity_id`, `relationship_type`, `relevance_score`, `metadata` (linking_method, confidence), `created_at`

**Database Operations:**
- SELECT FROM product_document_relationships WHERE product_id = ?

**Frontend Integration:** RelationshipViewer.tsx

---

## 🔐 Authentication

All endpoints require one of:

1. **Supabase JWT** (Frontend) — `Authorization: Bearer {supabase_jwt_token}`
2. **MIVAA JWT** (Internal) — `Authorization: Bearer {mivaa_jwt_token}`
3. **API Key** (External) — `X-API-Key: {api_key}`

---

## 📊 Response Format

All endpoints return JSON with fields: `success` (boolean), `data` (object), `error` (null or string), `timestamp`.

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

**Request fields:** `product_id`, `workspace_id`, `similarity_threshold`

**Response:** `success`, `product_id`, `duplicates_found`, `duplicates` array (product_id, name, factory, overall_similarity, confidence_level)

---

### 15.2 POST /api/duplicates/batch-detect

**Purpose:** Scan entire workspace for duplicate products

**Request fields:** `workspace_id`, `similarity_threshold`, `limit`

**Response:** `success`, `workspace_id`, `duplicate_pairs_found`, `duplicate_pairs` array

---

### 15.3 GET /api/duplicates/cached

**Purpose:** Get cached duplicate detections

**Query Parameters:**
- `workspace_id` (required)
- `status` (optional): 'pending', 'reviewed', 'merged', 'dismissed'
- `min_similarity` (optional): default 0.60

**Response:** `success`, `workspace_id`, `cached_duplicates`, `duplicates` array

---

### 15.4 POST /api/duplicates/update-status

**Purpose:** Update duplicate detection status

**Request fields:** `cache_id`, `status`, `user_id`

**Valid Statuses:** 'pending', 'reviewed', 'merged', 'dismissed'

---

### 15.5 POST /api/duplicates/merge

**Purpose:** Merge duplicate products into a single product

**Request fields:** `target_product_id`, `source_product_ids`, `workspace_id`, `user_id`, `merge_strategy`, `merge_reason`

**Response:** `success`, `history_id`, `target_product`, `merged_count`, `message`

---

### 15.6 POST /api/duplicates/undo-merge

**Purpose:** Undo a product merge operation

**Request fields:** `history_id`, `user_id`

**Response:** `success`, `message`, `restored_products`

---

### 15.7 GET /api/duplicates/merge-history

**Purpose:** Get merge history for a workspace

**Query Parameters:**
- `workspace_id` (required)
- `limit` (optional): default 50

**Response:** `success`, `workspace_id`, `merge_count`, `merges` array

---

## 16. Data Import Routes

**Category:** Data Import (XML, Web Scraping)
**Total Endpoints:** 4
**Status:** ✅ Phase 1 & 2 Complete (XML Import with Dynamic Mapping & Backend Processing)

### 16.1 POST /api/import/process

**Purpose:** Start processing an import job (called by Edge Function)

**Request fields:** `job_id`, `workspace_id`

**Response:** `success`, `message`, `job_id`

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

**Response fields:** `job_id`, `status`, `import_type`, `source_name`, `total_products`, `processed_products`, `failed_products`, `progress_percentage`, `current_stage`, `started_at`, `completed_at`, `error_message`, `estimated_time_remaining`

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
- `workspace_id` (required)
- `page` (optional, default: 1)
- `page_size` (optional, default: 20)
- `status` (optional): pending, processing, completed, failed
- `import_type` (optional): xml, web_scraping

**Response:** `imports` array (job_id, import_type, source_name, status, total_products, processed_products, failed_products, created_at, completed_at, is_scheduled, next_run_at), `total_count`, `page`, `page_size`

**Database Operations:**
- Queries `data_import_jobs` table with filters
- Applies pagination
- Orders by `created_at DESC`

---

### 16.4 GET /api/import/health

**Purpose:** Health check for data import API

**Response fields:** `status`, `service`, `version`, `features` (xml_import, web_scraping, batch_processing, concurrent_image_downloads, checkpoint_recovery, real_time_progress)

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

**Request fields:** `workspace_id`, `category`, `xml_content` (base64 encoded), `preview_only`, `field_mappings`, `mapping_template_id`, `parent_job_id`

**Response (Preview Mode):** `success`, `detected_fields` array (xml_field, suggested_mapping, confidence, sample_values), `total_products`

**Response (Import Mode):** `success`, `job_id`, `total_products`

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

---

---

## 19. Messaging Routes (SMS, WhatsApp) ✨ NEW v2.6.0

**Base Path:** Supabase Edge Function `/functions/v1/messaging-api`
**Purpose:** Multi-channel messaging via Twilio (SMS, WhatsApp)
**Provider:** Twilio - Single API for all channels
**Philosophy:** Unified messaging API with templates, campaigns, analytics, and compliance

### Environment Variables (Supabase Secrets)

Required secrets: `TWILIO_ACCOUNT_SID` and `TWILIO_AUTH_TOKEN`

### 19.1 POST /functions/v1/messaging-api (action: send)

**Purpose:** Send a single message via SMS or WhatsApp
**Used In:** Test messages, transactional notifications, OTP delivery

**Request fields:** `action: "send"`, `channel` (`sms` | `whatsapp`), `to` (phone number), `content`, `from` (optional), `messageType` (`transactional` | `marketing` | `otp` | `notification`), `variables` (for template rendering), `templateSlug` (optional), `mediaUrl` (optional), `tags` (optional), `whatsappContentSid` (optional, for WhatsApp pre-approved templates)

**Response:** `success`, `messageId`, `logId`

**Twilio API Endpoints Used:**
- SMS: `POST /2010-04-01/Accounts/{AccountSid}/Messages.json`
- WhatsApp: `POST /2010-04-01/Accounts/{AccountSid}/Messages.json` (with `whatsapp:` prefix)

---

### 19.2 POST /functions/v1/messaging-api (action: send-bulk)

**Purpose:** Send messages to multiple recipients in bulk
**Used In:** Marketing campaigns, mass notifications

**Request fields:** `action: "send-bulk"`, `channel`, `recipients` (array of {to, variables}), `content`, `templateSlug` (optional), `messageType`, `from` (optional)

**Response:** `success`, `bulkId`, `total`, `sent`, `failed`, `optedOut`, `results` array (to, status, messageId or error)

---

### 19.3 POST /functions/v1/messaging-api (action: channels)

**Purpose:** List all configured messaging channels
**Used In:** Channel management UI, channel selection dropdowns

**Request fields:** `action: "channels"`, `channelType` (optional filter: `sms` | `whatsapp`)

**Response:** `success`, `channels` array (id, channel_type, provider, sender_id, display_name, is_active, is_default, daily_quota, max_send_rate, config)

**Database Table:** `messaging_channels`

---

### 19.4 POST /functions/v1/messaging-api (action: templates)

**Purpose:** List all messaging templates
**Used In:** Template management UI, campaign creation

**Request fields:** `action: "templates"`, `channelType` (optional filter)

**Response:** `success`, `templates` array (id, name, slug, channel_type, content, variables, category, whatsapp_template_name, is_approved, is_active)

**Database Table:** `messaging_templates`

---

### 19.5 POST /functions/v1/messaging-api (action: logs)

**Purpose:** Get message delivery logs with filtering
**Used In:** Message logs tab, delivery tracking, debugging

**Request fields:** `action: "logs"`, `channelType` (optional), `status` (optional: queued | sent | delivered | read | failed | rejected), `messageType` (optional), `limit`

**Response:** `success`, `logs` array (id, channel_type, provider_message_id, from_number, to_number, content, status, sent_at, delivered_at, cost, currency)

**Database Table:** `messaging_logs`

---

### 19.6 POST /functions/v1/messaging-api (action: analytics)

**Purpose:** Get aggregated messaging analytics
**Used In:** Analytics dashboard, reporting

**Request fields:** `action: "analytics"`, `channelType` (optional), `dateRange` (start, end)

**Response:** `success`, `totalSent`, `totalDelivered`, `totalRead` (WhatsApp only), `totalFailed`, `totalCost`, `deliveryRate`, `readRate`, `failureRate`, `dailyData` array

**Database Table:** `messaging_analytics`

---

### 19.7 POST /functions/v1/messaging-api (action: balance)

**Purpose:** Get Twilio account balance
**Used In:** Header balance display, billing monitoring

**Request fields:** `action: "balance"`

**Response:** `success`, `balance`, `currency`

**Twilio API Endpoint:** `GET /2010-04-01/Accounts/{AccountSid}/Balance.json`

---

### 19.8 POST /functions/v1/messaging-api (action: sync-senders)

**Purpose:** Sync senders/numbers from Twilio account to local database
**Used In:** Channel sync button, initial setup

**Request fields:** `action: "sync-senders"`, `autoImport` (boolean — set to true to automatically import to database)

**Response:** `success`, `senders` (sms and whatsapp arrays with sender_id, display_name, status), `total`, `imported`

**Twilio API Endpoints Used:**
- Phone Numbers: `GET /2010-04-01/Accounts/{AccountSid}/IncomingPhoneNumbers.json`
- WhatsApp Senders: Configured via Twilio Console

---

### 19.9 POST /functions/v1/messaging-api (action: whatsapp-templates)

**Purpose:** Fetch WhatsApp templates from Twilio Content API
**Used In:** WhatsApp template selection, template sync

**Request fields:** `action: "whatsapp-templates"`

**Response:** `success`, `templates` array (sid, friendly_name, language, types with body)

**Twilio API Endpoint:** `GET /v1/Content` (Twilio Content API)

---

### 19.10 POST /functions/v1/messaging-api (action: send-test)

**Purpose:** Send a test message for a campaign
**Used In:** Campaign testing, preview verification

**Request fields:** `action: "send-test"`, `campaignId`, `testNumber`

**Response:** `success`, `messageId`

---

### Twilio API Reference (Internal)

**Base URL:** `https://api.twilio.com`
**Authentication:** HTTP Basic Auth (Account SID + Auth Token)

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/2010-04-01/Accounts/{AccountSid}/Messages.json` | POST | Send SMS/WhatsApp messages |
| `/2010-04-01/Accounts/{AccountSid}/IncomingPhoneNumbers.json` | GET | List phone numbers |
| `/2010-04-01/Accounts/{AccountSid}/Balance.json` | GET | Get account balance |
| `/v1/Content` | GET | List WhatsApp content templates (Content API) |

**Documentation:** https://www.twilio.com/docs/messaging/api

---

### Database Tables

The messaging system uses the following tables:

- **`messaging_channels`** — Stores SMS and WhatsApp sender configurations (channel_type, provider, sender_id, display_name, is_active, is_default, config JSONB, daily_quota, max_send_rate)
- **`messaging_templates`** — Message templates with variables (name, slug, channel_type, content, variables array, category, whatsapp_content_sid, is_approved, is_active)
- **`messaging_logs`** — Per-message delivery records (channel_type, provider_message_id, from/to numbers, content, status, timestamps, cost, currency)
- **`messaging_analytics`** — Daily aggregated analytics per channel (date, channel_type, total_sent, total_delivered, total_read, total_failed, total_cost)
- **`messaging_optouts`** — Compliance opt-out records (phone_number, channel_type, source, opted_out_at)

---

## Summary

**Total Endpoints:** 140+
**Latest Version:** v2.6.0
**Last Updated:** January 2026

**New in v2.6.0:**
- ✨ Multi-channel Messaging (SMS, WhatsApp) via Twilio
- ✨ Unified messaging templates with variable substitution
- ✨ Bulk messaging with recipient-specific variables
- ✨ WhatsApp template support via Twilio Content API
- ✨ Delivery analytics and cost tracking
- ✨ Opt-out compliance management

**New in v2.5.0:**
- ✨ Image re-classification with AI validation

**Key Features:**
- ✅ Consolidated endpoints (no duplicates)
- ✅ Comprehensive AI integration (Claude, GPT, QWEN)
- ✅ Complete Knowledge Base system
- ✅ Advanced duplicate detection
- ✅ Data import with AI field mapping
- ✅ Spatial analysis with Claude Vision
- ✅ Multi-channel messaging via Twilio
- ✅ Full FastAPI documentation at `/docs` and `/redoc`
