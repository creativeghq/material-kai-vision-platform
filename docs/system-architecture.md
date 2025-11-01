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
│ - 74+ REST API endpoints                                    │
│ - 14-stage PDF processing pipeline                          │
│ - RAG system (LlamaIndex)                                   │
│ - Search APIs (Semantic, Vector, Hybrid)                   │
│ - AI Services (Claude, GPT, Llama, CLIP)                   │
│ - Product Management                                        │
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
            ├─→ Together AI (Llama)
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

## 🚀 API Endpoints (74+)

### 9 Categories

1. **PDF Processing** (12 endpoints)
   - Upload, extract, process PDFs
   - Job status tracking
   - Progress streaming

2. **Document Management** (13 endpoints)
   - CRUD operations
   - Batch processing
   - Content retrieval

3. **Search APIs** (8 endpoints)
   - Semantic search
   - Vector search
   - Hybrid search
   - Visual search

4. **Image Analysis** (5 endpoints)
   - Image analysis
   - Batch processing
   - Similarity search

5. **RAG System** (7 endpoints)
   - Document upload
   - Query interface
   - Chat functionality
   - Statistics

6. **Embeddings** (3 endpoints)
   - Text embeddings
   - Batch embeddings
   - CLIP embeddings

7. **Products** (6 endpoints)
   - CRUD operations
   - Similarity search
   - Listing

8. **Admin & Monitoring** (8 endpoints)
   - Job monitoring
   - Progress tracking
   - Health checks
   - Metrics

9. **AI Services** (11 endpoints)
   - Classification
   - Boundary detection
   - Validation
   - Enrichment

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
- Llama 4 Scout 17B Vision (Image analysis, OCR)

**LlamaIndex**:
- RAG system (Document indexing, retrieval)

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
- Anthropic API
- Together AI API
- LlamaIndex

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
- **API Endpoints**: 74+
- **Processing Speed**: 1-15 minutes per PDF
- **Accuracy**: 95%+ product detection
- **Scalability**: 5,000+ concurrent users
- **Data Volume**: 100,000+ products indexed

---

**Last Updated**: October 31, 2025  
**Version**: 1.0.0  
**Status**: Production

