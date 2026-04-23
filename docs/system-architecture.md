# System Architecture

Complete technical architecture of Material Kai Vision Platform.

---

## 🏗️ Three-Tier Architecture

┌─────────────────────────────────────────────────────────────┐
│ FRONTEND TIER (Vercel Edge Network)                         │
│ React 18 + TypeScript + Vite + Shadcn/UI                   │
│ - Materials Catalog                                         │
│ - Search Hub (Semantic, Vector, Hybrid, Visual)            │
│ - Admin Dashboard                                           │
│ - Real-time Monitoring                                      │
│ - 3D Material Visualization                                 │
└─────────────────────────────────────────────────────────────┘
                            ↓
                    (HTTPS REST API)
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ API TIER (MIVAA - FastAPI)                                  │
│ Python 3.11 + FastAPI + Uvicorn                            │
│ Deployed: v1api.materialshub.gr                            │
│ - 115 REST API endpoints (15 categories)                   │
│ - 9-stage PDF processing pipeline (optimized)              │
│ - Memory-safe image processing (10-15MB constant)          │
│ - Real-time CLIP embedding generation                      │
│ - RAG system (Claude 4.5 + Direct Vector DB)               │
│ - Search APIs (Multi-Vector, Semantic, Hybrid)             │
│ - AI Services (Claude 4.5, GPT, Qwen3-VL, SigLIP)          │
│ - Product Management + Metadata Management                 │
│ - Duplicate Detection & Merging (factory-based)            │
│ - Admin & Monitoring                                        │
│ - Background job processing                                 │
└─────────────────────────────────────────────────────────────┘
                            ↓
                    (PostgreSQL + pgvector)
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ DATA TIER (Supabase PostgreSQL 15 + pgvector)              │
│ - Documents & Chunks                                        │
│ - Products & Metafields                                     │
│ - Images & Embeddings                                       │
│ - Vector Indexes (pgvector)                                 │
│ - Row-Level Security (RLS)                                  │
│ - Real-time subscriptions                                   │
│ - Storage (Supabase Storage)                                │
└─────────────────────────────────────────────────────────────┘

---

## 🔌 Hybrid Architecture Pattern

**Key Design**: Frontend calls MIVAA directly (no proxy Edge Functions)

Frontend (Vercel)
    ↓
    └─→ MIVAA API (v1api.materialshub.gr)
            ↓
            ├─→ Supabase (Data)
            ├─→ OpenAI (Embeddings)
            ├─→ Anthropic (Claude)
            ├─→ HuggingFace Endpoint (Qwen3-VL)
            └─→ Supabase Storage (Images)

**Benefits**:
- ✅ Reduced latency (no proxy layer)
- ✅ Lower costs (fewer Edge Functions)
- ✅ Simpler architecture
- ✅ Better error handling
- ✅ Direct authentication

---

## 📊 Database Schema

### Core Tables

**workspaces**
- Multi-tenant isolation
- User workspace association
- Metadata storage

**documents**
- PDF metadata
- Processing status
- File references
- Workspace association

**chunks**
- Text segments
- Quality scores
- Document references
- Embedding references

**products**
- Extracted products
- Metadata
- Chunk associations
- Image associations

**images**
- Extracted images
- Analysis results
- Quality scores
- Storage references

**metafields**
- Structured metadata
- Product associations
- Chunk associations
- Type definitions

**embeddings**
- Vector storage (pgvector 0.8.0, halfvec float16 — 50% storage savings)
- 7 types: text, visual, understanding, color, texture, style, material
- HNSW + IVFFlat similarity indexes (halfvec_cosine_ops)
- Chunk/image references

**background_jobs**
- Async job tracking
- Status monitoring
- Progress tracking
- Error handling

**job_progress**
- Real-time progress updates
- Stage tracking
- Checkpoint data
- Performance metrics

---

## 🔐 Authentication & Security

### Triple Authentication Support

1. **Supabase JWT** (Frontend)
   - HS256 algorithm
   - "authenticated" audience
   - 24-hour expiry
   - User identification

2. **MIVAA JWT** (Internal)
   - Service-to-service
   - Long-lived tokens
   - API operations

3. **API Keys** (External)
   - Simple authentication
   - Rate limiting
   - External integrations

### Row-Level Security (RLS)

All tables use RLS policies that restrict access based on workspace membership. Users can only read, insert, update, and delete data that belongs to their own workspace, enforced via `auth.uid()` checks.

---

## 🚀 API Endpoints (108 - Consolidated from 113)

### 14 Categories

1. **RAG & Document Processing** (27 endpoints)
   - Upload, extract, process PDFs (consolidated from `/api/pdf/extract/*`)
   - Job status tracking
   - Progress streaming
   - Metadata management (scope detection, application, listing, statistics)
   - Document upload, query, chat
   - Search with multiple strategies

2. **Search APIs** (6 endpoints)
   - Semantic search
   - Vector search
   - Hybrid search
   - Visual search
   - Material search
   - Multi-vector search

3. **Admin Routes** (18 endpoints)
   - Job management and monitoring
   - System health and metrics
   - Data backup and cleanup
   - Metadata management

4. **Document Entities** (5 endpoints)
   - Certificates management
   - Logos management
   - Specifications management
   - Entity relationships

5. **Products** (3 endpoints)
   - Product management
   - Product relationships

6. **Images** (5 endpoints)
   - Image analysis
   - Batch processing
   - Similarity search
   - OCR processing

7. **AI Services** (10 endpoints)
   - Classification
   - Boundary detection
   - Validation
   - Enrichment
   - Product discovery

8. **Background Jobs** (7 endpoints)
   - Job creation
   - Status tracking
   - Progress updates
   - Statistics

9. **Anthropic APIs** (3 endpoints)
   - Claude integration
   - Vision analysis

10. **HuggingFace Endpoint APIs** (3 endpoints)
    - Qwen3-VL integration
    - Vision analysis

11. **Monitoring Routes** (3 endpoints)
    - System health
    - Service status
    - Performance metrics

12. **AI Metrics Routes** (2 endpoints)
    - Model performance
    - Usage statistics

**Consolidation Notes:**
- ✅ PDF Extraction endpoints (`/api/pdf/extract/*`) consolidated into `/api/rag/documents/upload`
- ✅ All extraction functionality available via RAG pipeline with deep processing mode
- ✅ Internal utilities preserved in `app/core/extractor.py`

---

## 🤖 AI Integration

### 12 AI Models

**Anthropic**:
- Claude Opus 4.7 (Product discovery, enrichment)
- Claude Haiku 4.5 (Fast validation)
- Semantic Chunking (Text segmentation)

**OpenAI**:
- GPT-4o (Alternative discovery)
- (text-embedding-3-small retired 2026-04 — Voyage AI is the sole text embedder)

**Voyage AI**:
- voyage-4 (Text + understanding embeddings, 1024D)

**SigLIP2 (SLIG)**:
- Visual embeddings (768D) via HuggingFace Cloud Endpoint
- 5 collections: visual, color, texture, style, material

**HuggingFace Endpoint**:
- Qwen3-VL 32B Vision (Image analysis, OCR → feeds understanding embeddings via Voyage AI)

**Direct Vector DB RAG**:
- Claude 4.5 + Multi-Vector Search (Document retrieval, synthesis)

---

## 📈 Scalability

### Horizontal Scaling

**Frontend**:
- Vercel Edge Network (global CDN)
- Auto-scaling
- 99.99% uptime SLA

**API**:
- FastAPI with Uvicorn
- Load balancing
- Horizontal pod autoscaling
- Connection pooling

**Database**:
- Supabase managed PostgreSQL
- Automatic backups
- Read replicas
- pgvector indexes

### Performance Optimization

**Caching**:
- Redis for frequently accessed data
- Query result caching
- Embedding caching

**Indexing**:
- pgvector halfvec indexes for similarity search (HNSW + IVFFlat)
- Full-text search indexes
- Composite indexes

**Batch Processing**:
- Batch embeddings
- Batch image analysis
- Batch product creation

---

## 🔄 Data Flow

### PDF Upload Flow

1. User uploads PDF (Frontend)
   ↓
2. Frontend calls MIVAA API
   ↓
3. MIVAA creates job record
   ↓
4. Background task starts
   ↓
5. 14-stage pipeline executes
   ↓
6. Progress updates to database
   ↓
7. Frontend polls for updates
   ↓
8. Results stored in database
   ↓
9. Frontend displays results

### Search Flow

1. User enters search query (Frontend)
   ↓
2. Frontend calls MIVAA search API
   ↓
3. Query Understanding (GPT-4o-mini)
   → Extracts: colors, finish, dimensions, pattern, style, material_type
   → Selects weight profile (e.g., "color_finish", "specification", "balanced")
   ↓
4. Dynamic weight profile applied to 7-vector fusion
   → 7 profiles: product_name, color_finish, specification,
     texture_pattern, style_aesthetic, material_search, balanced
   ↓
5. Parallel embedding search (asyncio.gather)
   → Text + Visual + Understanding + Color + Texture + Style + Material
   ↓
6. Weighted score fusion using selected profile
   ↓
7. Metadata filtering + soft boosts
   ↓
8. Results returned to frontend (with weight_profile in metadata)

---

## 🛠️ Technology Stack

**Frontend**:
- React 18
- TypeScript
- Vite
- Shadcn/ui
- TailwindCSS
- Vercel deployment

**Backend**:
- FastAPI
- Python 3.11
- Uvicorn
- Pydantic
- SQLAlchemy

**Database**:
- PostgreSQL 15
- pgvector
- Supabase
- Redis (optional)

**AI Services**:
- OpenAI API
- Anthropic API (Claude 4.5)
- HuggingFace Endpoint API (Qwen3-VL 32B)
- Voyage AI (Embeddings)

**Infrastructure**:
- Vercel (Frontend)
- Self-hosted server (Backend)
- Supabase (Database)
- Supabase Storage (Images)

---

## 📊 Monitoring & Observability

### Metrics

- Request latency
- Error rates
- Processing time
- API usage
- Database performance
- AI model costs

### Logging

- Structured logging
- Error tracking
- Performance profiling
- Audit logs

### Alerting

- Health checks
- Error thresholds
- Performance degradation
- Resource limits

---

## 🔒 Security Measures

✅ HTTPS/TLS encryption
✅ JWT authentication
✅ Row-Level Security (RLS)
✅ API rate limiting
✅ Input validation
✅ SQL injection prevention
✅ CORS configuration
✅ Audit logging

---

## 📈 Production Metrics

- **Uptime**: 99.5%+
- **API Endpoints**: 110 (15 categories)
- **Processing Speed**: 1-15 minutes per PDF
- **Accuracy**: 95%+ product detection
- **Scalability**: 5,000+ concurrent users
- **Data Volume**: 100,000+ products indexed

---

**Last Updated**: November 3, 2025
**Version**: 1.0.0
**Status**: Production
