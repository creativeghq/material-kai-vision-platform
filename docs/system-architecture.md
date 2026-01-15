# System Architecture

Complete technical architecture of Material Kai Vision Platform.

---

## 🏗️ Three-Tier Architecture

```
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
```

---

## 🔌 Hybrid Architecture Pattern

**Key Design**: Frontend calls MIVAA directly (no proxy Edge Functions)

```
Frontend (Vercel)
    ↓
    └─→ MIVAA API (v1api.materialshub.gr)
            ↓
            ├─→ Supabase (Data)
            ├─→ OpenAI (Embeddings)
            ├─→ Anthropic (Claude)
            ├─→ Together AI (Qwen)
            └─→ Supabase Storage (Images)
```

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
- Vector storage (pgvector)
- 6 types: text, visual, color, texture, application, semantic
- Similarity indexes
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

```sql
-- Users can only access their workspace data
CREATE POLICY "workspace_isolation"
ON documents
FOR SELECT
USING (workspace_id = auth.uid());
```

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

10. **Together AI APIs** (3 endpoints)
    - Qwen integration
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
- Claude Sonnet 4.5 (Product discovery, enrichment)
- Claude Haiku 4.5 (Fast validation)
- Semantic Chunking (Text segmentation)

**OpenAI**:
- GPT-4o (Alternative discovery)
- text-embedding-3-small (Text embeddings)
- CLIP (5 embedding types)

**Together AI**:
- Qwen3-VL 17B Vision (Image analysis, OCR)

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
- pgvector indexes for similarity search
- Full-text search indexes
- Composite indexes

**Batch Processing**:
- Batch embeddings
- Batch image analysis
- Batch product creation

---

## 🔄 Data Flow

### PDF Upload Flow

```
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
```

### Search Flow

```
1. User enters search query (Frontend)
   ↓
2. Frontend calls MIVAA search API
   ↓
3. MIVAA generates query embedding
   ↓
4. pgvector similarity search
   ↓
5. Results ranked and filtered
   ↓
6. Results returned to frontend
   ↓
7. Frontend displays results
```

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
- Together AI API (Qwen3-VL)
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

