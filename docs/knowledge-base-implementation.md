# Knowledge Base & Documentation System

## 📋 Overview

The Knowledge Base & Documentation System provides a comprehensive solution for managing product documentation, technical guides, and knowledge articles with AI-powered semantic search and intelligent organization.

---

## Database Schema

### Tables Created (5 total)

1. **`kb_docs`** - Main documents table
   - Embeddings support (1024D vector with ivfflat index)
   - Embedding metadata (model, timestamp, status, error tracking)
   - Content fields (title, content, markdown, summary)
   - Status & visibility control (draft/published/archived, public/private/workspace)
   - View tracking and engagement metrics
   - **`price_doc_type`** (2026-04) — optional enum (`price_list | discount_rule | contract_terms | promotion`) for docs filed under the Pricing category; drives how the `price_lookup` agent tool combines documents
   - RLS policies for workspace isolation

2. **`kb_categories`** - Category hierarchy
   - Parent/child relationships for nested categories
   - Color coding and icons for visual organization
   - Workspace isolation with RLS
   - Sort order for custom arrangement

3. **`kb_doc_attachments`** - Product/material links
   - Multi-product linking (1 doc → many products)
   - Relationship types (primary, supplementary, related, certification, specification)
   - Relevance scoring (1-5 scale)
   - Workspace isolation

4. **`kb_doc_versions`** - Version history
   - Track all changes with timestamps
   - Change type and description
   - Changed fields tracking
   - Immutable (no updates, only inserts)
   - Creator tracking

5. **`kb_doc_comments`** - Comments & suggestions
   - Section-level feedback
   - Threading support (parent/child comments)
   - @mentions support (mentioned_users array)
   - Status tracking (open, resolved, archived)
   - Workspace isolation

### Indexes Created

- **Vector Search:** ivfflat index on `kb_docs.text_embedding` for fast similarity search
- **Workspace Isolation:** Indexes on all `workspace_id` columns
- **Category Hierarchy:** Index on `parent_category_id`
- **Document Relationships:** Indexes on `document_id` and `product_id`
- **User Tracking:** Indexes on `created_by` and `user_id`
- **Performance:** Indexes on `created_at` for time-based queries

### RLS Policies

- **Workspace Isolation:** Users only see data from their workspace
- **Creator-Based Access:** Users can edit their own documents
- **Admin Override:** Admins can manage all documents in their workspace
- **Immutable Records:** Versions and analytics cannot be updated (only inserted)
- **Category Management:** Only admins can create/update/delete categories

---

## Backend API Endpoints

### API Routes Created (16+ endpoints)

**Base Path:** `/api/kb`

#### Document Management (5 endpoints)

1. **POST `/api/kb/documents`** - Create document
   - Automatic embedding generation (1024D)
   - Smart embedding status tracking
   - Error handling with retry support
   - Returns: Document with embedding status

2. **GET `/api/kb/documents/{doc_id}`** - Get document
   - Retrieve single document by ID
   - Returns: Full document with metadata

3. **PATCH `/api/kb/documents/{doc_id}`** - Update document
   - Smart content change detection
   - Regenerates embedding ONLY if content changed
   - Skips embedding if only metadata changed
   - Returns: Updated document with embedding status

4. **DELETE `/api/kb/documents/{doc_id}`** - Delete document
   - Cascading delete (removes attachments, versions, comments)
   - Returns: 204 No Content

5. **POST `/api/kb/documents/from-pdf`** - Create from PDF
   - Extract text using PyMuPDF (text only, no chunking)
   - Automatic embedding generation
   - Returns: Document with extracted text

#### Search (1 endpoint)

6. **POST `/api/kb/search`** - Search documents
   - **Semantic Search:** Vector similarity using pgvector cosine distance
     - Generates embedding for search query using Voyage AI voyage-4 (updated 2026-04)
     - Compares against stored document embeddings using `<=>` operator
     - Returns results with similarity scores (0.0 - 1.0)
     - Minimum threshold: 0.5 (configurable)
   - **Full-Text Search:** ILIKE-based keyword matching
     - Searches title and content fields
     - Case-insensitive matching
   - **Hybrid:** not offered here. `kb_search_docs` never read `search_type`, so "hybrid" was the
     ILIKE branch under another name; the endpoint refuses it with 400 since 2026-09-05. The admin
     `SearchInterface` fuses `kb_keyword_search` + semantic client-side; the agent path fuses in SQL
     (see `kb_hybrid_doc_chunks` below).
   - Category filtering (optional)
   - Pagination support (default: 20 results)
   - Returns: Results with search time metrics (ms)

   The request body takes `workspace_id`, `query`, `search_type` (semantic or full_text), and optional `limit`. Additional filters added 2026-04: `category_id`, `category_slug` (e.g. `"pricing"`), `price_doc_type` (`price_list | discount_rule | contract_terms | promotion`), `allowed_access_levels`, `require_published` (default `false` for admin management). The response includes `results` with `category_slug`, `category_name`, `price_doc_type`, and `similarity`, plus `search_time_ms` and `total_results`.

   **Architecture:**
   - Frontend → MIVAA API `/api/kb/search`
   - MIVAA generates query embedding (Voyage AI)
   - MIVAA calls Supabase `kb_match_docs()` RPC function (unified 2026-04; accepts `match_category_id`, `match_category_slug`, `match_price_doc_type`, `require_published`)
   - Supabase performs vector similarity search using pgvector
   - Returns ranked results with similarity scores

**See also:** [Pricing API](./units-and-quantity-pricing.md) for the admin-only flow that ingests docs under a "Pricing" category with `price_doc_type` sub-types and retrieves them via either the `price_lookup` agent tool (AI reasoning mode) or `search_knowledge_base` gateway action (quick-pick direct mode).

#### Categories (2 endpoints)

7. **POST `/api/kb/categories`** - Create category
   - Hierarchical support (parent/child)
   - Color and icon customization
   - Returns: Created category

8. **GET `/api/kb/categories`** - List categories
   - Workspace filtering
   - Ordered by sort_order
   - Returns: All categories for workspace

#### Product Attachments (3 endpoints)

9. **POST `/api/kb/attachments`** - Attach document to product
   - Link document to 1+ products
   - Relationship type specification
   - Relevance scoring (1-5)
   - Returns: Attachment record

10. **GET `/api/kb/documents/{doc_id}/attachments`** - Get document attachments
    - List all products linked to document
    - Returns: Array of attachments

11. **GET `/api/kb/products/{product_id}/documents`** - Get product documents
    - List all documents linked to product
    - Returns: Array of documents

#### Health Check (1 endpoint)

12. **GET `/api/kb/health`** - Health check
    - Service status
    - Feature availability
    - Endpoint listing
    - Returns: Health status

---

## 🔄 Embedding Generation Lifecycle

### When Embeddings Are Generated

1. **CREATE Document**
   - User creates new doc → Backend generates embedding (1024D)
   - Sync operation (happens immediately)
   - Status: `pending` → `success` or `failed`

2. **PDF Upload**
   - User uploads PDF → Extract text → Generate embedding
   - Sync operation
   - Status tracked in database

3. **EDIT/MODIFY Document** (Smart Detection)
   - User edits content → Check if content changed
   - **IF content changed:** Generate NEW embedding
   - **IF only metadata changed:** Skip embedding
   - Content fields that trigger re-embedding:
     - `title`, `content`, `summary`, `seo_keywords`, `category_id`
   - Metadata fields that DON'T trigger re-embedding:
     - `status`, `visibility`, `view_count`, `timestamps`

4. **SEARCH**
   - User searches → Generate query embedding
   - Perform vector similarity search
   - Returns top N results

### Embedding Metadata Tracking

Stored in `kb_docs` table:
- `text_embedding` - The 1024D vector
- `embedding_model` - 'voyage-4' (updated 2026-04)
- `embedding_generated_at` - Timestamp
- `embedding_status` - 'pending', 'success', 'failed'
- `embedding_error_message` - Error details if failed

### Error Handling

- If embedding generation fails → Document saved WITHOUT embedding
- Embedding status set to `failed`
- Error message stored in `embedding_error_message`
- Frontend can provide "Retry Embedding" button
- Admin can regenerate all embeddings via batch endpoint (future)

---

## Section-Level Chunking (2026-07)

KB retrieval is **section-level**, not whole-document. Previously a query embedding was
compared against a single per-document `kb_docs.text_embedding` and the document body was
truncated to a head (~8k chars) before being handed to the agent — long manuals lost their
tail and matched imprecisely. Now every document is split into **sections** stored in
`kb_doc_chunks`, and search matches per-section.

### `kb_doc_chunks` table

One row per section of a document:

- `id`, `kb_doc_id` (FK to `kb_docs`), `workspace_id`
- `chunk_index` — ordinal position of the section within the doc
- `heading` — the section heading the chunk falls under
- `content` — the section text
- `char_start` / `char_end` — offsets back into the source document
- `token_count`
- `text_embedding` (1024D) + `embedding_model` (`voyage-4`) + `schema_version`
- `created_at`

The chunker is **boundary-aware** (splits on section/heading boundaries) and
coverage-invariant — the concatenation of chunks reproduces the full document, so no content
is dropped.

### `kb_hybrid_doc_chunks` RPC — retrieval for the agent (2026-09)

The agent's `kb_docs` branch of `POST /api/rag/search/knowledge-base` calls
`kb_hybrid_doc_chunks(query_embedding, query_text, match_workspace_id, …)`. It runs **two
channels over one gated candidate set** and fuses them by rank position:

- **Vector**: cosine over `kb_doc_chunks.text_embedding`, top-N by distance FIRST, the
  similarity floor applied AFTER the ordered limit (a floor inside the scan is what defeats
  an HNSW index and returns fewer than N rows).
- **Lexical**: `kb_doc_chunks.content_tsv`, a generated tsvector of English stems (heading
  weighted A, body B) plus Greek stems of the Greek words only (C), GIN-indexed. The query
  side mirrors it: `websearch_to_tsquery('english', q) || websearch_to_tsquery('greek', greek_only(q))`.
  Latin text never reaches the Greek configuration: it has no English stop-word list, and
  "the and of" matched ten sections through it before that rule.
- **Fusion**: Reciprocal Rank Fusion, `1/(60 + rank)` per channel. Never a cosine added to a
  `ts_rank`; they are not on one scale. Every row carries `similarity` (exact, for lexical-only
  hits too), `vector_rank`, `lexical_rank` and `rrf_score`, and the endpoint ships per-channel
  counts in `search_metadata.kb_channels`, so a dead channel is visible from one call.

**The gate is written once.** Workspace, shared operator workspace, published, private,
category `access_level` and per-doc `allowed_agents` all live in the `eligible` CTE of this one
function. `kb_match_doc_chunks(...)` keeps its 13-column signature as a wrapper with
`query_text = NULL` (lexical channel off), so `kb_read_doc_section` and older callers are
unchanged and there is no second copy to drift. The Haiku reranker in `_shared/rerank.ts` sits
downstream in the edge tool and reorders the fused candidates.

`kb_doc_chunks` has **no vector index**: 9.8k sections scan exactly in milliseconds, and the
materialised `eligible` set is the right shape for a per-workspace corpus of this size. Revisit
both together before adding an HNSW index.

### Retrieval evaluation — `kb_retrieval_eval_cases`

`agent_eval_cases` scores a whole agent turn; nothing scored the retriever, so "the retriever
missed it" and "the model ignored it" were one failure. The golden set maps a question to the
`kb_docs` that hold its answer (27 cases: real user questions, distinctive-term and acronym
questions, paraphrases that avoid the term, and one Greek question over the English corpus).
The scorer calls the RPC with its default similarity floor, the same 0.4 the agent path passes:
at floor 0 the two modes looked identical, while in production two acronym questions returned
no section at all in vector-only mode and rank 1 through the lexical channel.
`POST /api/rag/kb-eval/run` (MIVAA; `x-cron-secret` or the service-role bearer) embeds each
question once through `kb_query_vector` and calls `kb_retrieval_eval_score` for **both** modes,
`vector` (the wrapper) and `hybrid`, so every batch is an A/B. It records the rank of the first
expected document among distinct documents; `kb_retrieval_eval_summary(batch_id)` derives
recall@5 and MRR in SQL. The nightly `kb.retrieval_recall` probe fires when the set has not run
in 14 days, when a question finds its document in no mode, or when hybrid recall@5 falls below
vector-only.

```sh
# from the MIVAA host (the only place CRON_SECRET lives)
curl -s -X POST "$MIVAA_URL/api/rag/kb-eval/run" -H "x-cron-secret: $CRON_SECRET" \
  -H "Content-Type: application/json" -d "{}"
```

```sql
select * from kb_retrieval_eval_summary();   -- latest batch, one row per mode
```

### On-write auto-rechunk

Chunks are kept in sync automatically. After `kb-generate-embedding`
(`supabase/functions/kb-generate-embedding/`) saves a document's embedding, it fires a
fire-and-forget `POST /api/rag/kb-docs/rechunk` to the MIVAA backend (kept alive past the
response via `EdgeRuntime.waitUntil` where supported) to (re)build that document's
`kb_doc_chunks` rows. It is non-fatal — the doc save is never blocked, and a backfill
re-chunks on miss.

---

## 📊 API Response Formats

Success responses include document fields such as `id`, `workspace_id`, `title`, `content`, `embedding_status`, `embedding_generated_at`, `created_at`, and `view_count`. Error responses include a `detail` message and `status_code`. Search responses include `success`, `results`, `total_count`, `search_time_ms`, and `search_type`.

---

## Implementation Files

### Backend Files
- `mivaa-pdf-extractor/app/api/knowledge_base.py` - API endpoints (605 lines)
- `mivaa-pdf-extractor/app/main.py` - Router registration

### Database
- 6 tables created via Supabase MCP
- 15+ indexes created
- RLS policies enabled on all tables

### Documentation
- `docs/knowledge-base-implementation.md` - This file

---



## Key Features

1. **Automatic Embedding Generation** - Text embeddings (1024D) for semantic search
2. **Smart Content Detection** - Only regenerate embeddings when content changes
3. **PDF Text Extraction** - PyMuPDF integration for text-only extraction
4. **Semantic Search** - Vector similarity search using embeddings
5. **Product Attachment** - Link documents to multiple products
6. **Category Hierarchy** - Parent/child category relationships
7. **Version History** - Track all document changes
8. **Comments System** - Section-level feedback with threading
9. **Search Analytics** - Track queries and clicks
10. **Workspace Isolation** - RLS policies for multi-tenant security

---

## 📈 Metrics

- **Database Tables:** 5 created
- **API Endpoints:** 15+ created
- **Indexes:** 15+ created
- **RLS Policies:** 24 created
- **Lines of Code:** 605 (backend API)
- **Embedding Dimension:** 1024D
- **Search Types:** 2 (semantic, full-text)
- **Relationship Types:** 5 (primary, supplementary, related, certification, specification)

---

## 🔧 Technical Stack

- **Backend:** FastAPI (Python)
- **Database:** Supabase (PostgreSQL)
- **Embeddings:** Voyage AI voyage-4 (1024D, updated 2026-04)
- **PDF Extraction:** PyMuPDF (fitz)
- **Vector Search:** pgvector with ivfflat index
- **Security:** Row Level Security (RLS)
- **Error Tracking:** Sentry

---

## Frontend Components

### Components (6 total)

1. **`KnowledgeBaseManagement.tsx`** - Main admin page
   - Tabbed interface (Documents, Search, Categories, Product Links, Analytics)
   - Stats dashboard with real-time metrics
   - Integrated with GlobalAdminHeader for consistent UI
   - Route: `/admin/knowledge-base`

2. **`DocumentList.tsx`** - Document management
   - Table view with status, embedding status, views, created date
   - Status filter (all, draft, published, archived)
   - Search filtering by title/content
   - Edit and delete actions
   - Direct Supabase queries for performance

3. **`DocumentEditor.tsx`** - Document creation/editing
   - Modal dialog with full-screen editing
   - Title, content, summary, category selection
   - PDF upload with automatic text extraction
   - Edit/Preview tabs for content
   - Status and visibility controls
   - Smart embedding generation on save

4. **`CategoryManager.tsx`** - Category management
   - Table view with icon, name, description, document count
   - Create category dialog
   - Color picker and icon selector
   - Edit and delete actions

5. **`SearchInterface.tsx`** - Semantic search
   - Keyword pass (`kb_keyword_search`) + semantic pass, merged client-side
   - Real-time search with performance metrics
   - Results display with similarity scores
   - AI indexed badge for documents with embeddings

6. **`ProductAttachments.tsx`** - Product linking
   - Link documents to products
   - Relationship type selection (primary, supplementary, related, certification, specification)
   - Relevance scoring (1-5 stars)
   - Table view with product name, relationship, relevance

### Service Layer

**`knowledgeBaseService.ts`** - API integration service
- Singleton pattern for consistent API access
- All 13 Knowledge Base endpoints integrated
- MIVAA Gateway routing via Supabase Edge Functions
- TypeScript interfaces for type safety
- Error handling and toast notifications

### Integration Points

1. **App.tsx** - Route registration
   - Updated `/admin/knowledge-base` route to use new component
   - Removed old MaterialKnowledgeBase import
   - Added AuthGuard and AdminGuard protection

2. **AdminDashboard.tsx** - Navigation link
   - Updated "PDF Knowledge Base" to "Knowledge Base & Documentation"
   - Updated description to reflect new features
   - Badge shows "NEW v2.3.0"

3. **MIVAA Gateway** - API routing
   - 13 Knowledge Base endpoints registered
   - Proper path and method mapping
   - Version updated to v2.3.0

### UI/UX Features

- Consistent admin header with breadcrumbs
- Glass morphism design matching platform style
- Real-time stats dashboard
- Toast notifications for user feedback
- Loading states and error handling
- Responsive design
- Badge indicators for status and embedding state
- Icon-based navigation
- Color-coded categories
- Star rating for relevance scores

---

## System Metrics

- **Database Tables:** 5 created
- **API Endpoints:** 15+ created
- **Frontend Components:** 6 created
- **Service Layer:** 1 service with 13 methods
- **Indexes:** 15+ created
- **RLS Policies:** 24 created
- **Lines of Code:** 605 (backend) + 1,200+ (frontend)
- **Embedding Dimension:** 1024D
- **Search Types:** 2 (semantic, full-text)
- **Relationship Types:** 5 (primary, supplementary, related, certification, specification)
