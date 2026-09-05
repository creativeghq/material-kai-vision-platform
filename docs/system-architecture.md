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
│ - Real-time SigLIP2 (SLIG) embedding generation            │
│ - RAG system (Claude Opus 5 + 7-Vector Direct VECS)      │
│ - Search APIs (Multi-Vector, Semantic, Hybrid)             │
│ - AI Services (Claude Opus 5 / Sonnet 5 / Haiku 4.5,   │
│   Voyage AI voyage-4, SLIG/SigLIP2 on Modal, PaddleOCR-VL  │
│   on Modal, GPT-5)                                         │
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
            ├─→ Voyage AI (Text + Understanding Embeddings, sole text embedder)
            ├─→ Anthropic (Claude Opus 5 vision tool use, Sonnet 5 chunking, Haiku 4.5 classifiers)
            ├─→ Modal (SLIG SigLIP2 visual embeddings)
            ├─→ Modal (PaddleOCR-VL structural layout + OCR backbone)
            ├─→ OpenAI (optional alternative — GPT-4o/GPT-5; not vision)
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
- Async job tracking (single-table design post-2026-04-25)
- `stage_history jsonb` — append-only audit log per stage transition (capped at 100 entries)
- `recovery_history jsonb` — append-only auto-recovery audit log
- `last_checkpoint jsonb` — resume snapshot used by auto-recovery cron
- Note: `job_progress` and `job_checkpoints` tables were dropped 2026-04-25; all stage and recovery data now lives as JSONB arrays on the job row.

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
   - Claude integration (Opus 5 vision via tool use, Sonnet 5 chunking, Haiku 4.5 classifiers)
   - Vision analysis (schema-locked via `VisionAnalysis` Pydantic + `VISION_ANALYSIS_TOOL`)

10. **Model Endpoint APIs**
    - SLIG (SigLIP2) on Modal — visual embeddings (768D, 5 specialized types)
    - PaddleOCR-VL on Modal — two-stage structural layout (PP-DocLayoutV3) + OCR backbone

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

### Production AI Stack (post-2026-05-01)

**Anthropic**:
- **Claude Opus 5** — vision analysis (PRIMARY, schema-locked via `VisionAnalysis` Pydantic + `VISION_ANALYSIS_TOOL`); product discovery; JARVIS agent default
- **Claude Sonnet 5** — chunking
- **Claude Haiku 4.5** — fast classification, demo agent, price-monitoring identity classifier

**Voyage AI** (sole text embedder):
- voyage-4 (1024D) — text chunks + product text + understanding embeddings (from Claude vision_analysis JSON via `serialize_vision_analysis_to_text`)
- Provenance fields persisted (`embedding_model`, `schema_version`) for drift detection
- No fallback embedder anywhere (deleted 2026-08-08) — prevents VECS collection drift by construction

**Modal** (visual embeddings):
- **SLIG (SigLIP2)** — visual embeddings (768D, 5 specialized types: visual / color / texture / style / material). Model `basiliskan/slig` duplicates `google/siglip2-base-patch16-512` (native 768D, no projection head). Migrated off HuggingFace onto Modal 2026-06-14, so HuggingFace now hosts nothing.

**Modal** (structural layout + OCR backbone):
- **PaddleOCR-VL** (`PaddlePaddle/PaddleOCR-VL-1.6`, 0.9B) — two-stage parser: PP-DocLayoutV3 (RT-DETR detector; multi-point boxes + reading order predicted in the decoder) localizes/labels regions and predicts reading order; the 0.9B VLM recognizes content (text, tables→markdown, formulas→LaTeX, charts). Runs structure-first as Stage 1, BEFORE discovery (`processing_version="paddleocr-vl"`); also backs Phase 3 per-image OCR (`OCRResult.method` = `paddleocr`/`paddleocr_failed`, metrics in `paddleocr_metrics`, `ocr_engine`=`paddleocr`)
- **Hosting**: Modal app `paddleocr-vl` (GPU L4, scale-to-zero → $0 idle). Contract `GET /health` + `POST /parse`. ~1-3s/page warm. Only `PADDLEOCR_MODAL_API_KEY` required (URL baked as config default); CI auto-deploys on `modal_app/**` via the `deploy-modal` job
- **Replaced**: Surya-2 (2026-06-13); Surya-2 had replaced YOLO + Chandra v2 + `merge_layout` (those, plus pytesseract + EasyOCR, are all removed)

**OpenAI** (optional, not vision):
- GPT-4o / GPT-5 — alternative product discovery / agents
- text-embedding-3-small retired 2026-04 (Voyage is sole text embedder)

**7-Vector RAG**:
- Text (Voyage 1024D) + 5× SLIG specialized (768D each) + Understanding (Voyage 1024D)
- Synthesis: Claude Opus 5 (200K context)

py` code, `Settings. Only the `VisionProvider.

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
- Anthropic API (Claude Opus 5 / Sonnet 5 / Haiku 4.5 — primary)
- Voyage AI (text + understanding embeddings, sole text embedder)
- Modal (SLIG SigLIP2 visual embeddings)
- Modal (PaddleOCR-VL structural layout + OCR backbone)
- OpenAI API (optional alternative — GPT-4o/GPT-5; not vision)

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

## 🏦 Finance & Business Suite

The platform includes a multi-tenant finance and business operations stack layered on top of the core AI catalog. Key modules:

- **Greek e-invoicing** — AADE/myDATA direct transmission via Novus connector (per-tenant issuer VAT + TaxisNet authorization). See `docs/finance-system.md`.
- **POS** — two-panel cash register (`docs/pos-retail-system.md`)
- **Online Storefront** (`docs/online-storefront.md`)
- **Warehouse & Billing** (`docs/warehouse-and-billing.md`)
- **Sales Portal & Marketplace** (`docs/sales-and-marketplace.md`)
- **Multi-tenant Capabilities & Tenancy** (`docs/capabilities-and-tenancy.md`)

Note: A legacy ERP connector (platform-wide API key) was removed 2026-06-07 — replaced by the per-tenant Novus/AADE direct transmission path.

---

## 📈 Production Metrics

- **Uptime**: 99.5%+
- **API Endpoints**: 110 (15 categories)
- **Processing Speed**: 1-15 minutes per PDF
- **Accuracy**: 95%+ product detection
- **Scalability**: 5,000+ concurrent users
- **Data Volume**: 100,000+ products indexed

---

**Last Updated**: June 2026
**Version**: 3.7.0
**Status**: Production
