# Material Kai Vision Platform - Complete Overview

**AI-Powered Material Intelligence System for Enterprise Catalogs**

> Production-grade platform serving 5,000+ users with 99.5%+ uptime. Transforms material catalog PDFs into searchable, intelligent knowledge using 12 AI models across a sophisticated 14-stage processing pipeline.

---

## 🎯 Executive Summary

Material Kai Vision Platform is an enterprise AI system that automatically extracts, analyzes, and organizes material information from PDF catalogs. Using advanced computer vision, natural language processing, and semantic search, it enables users to discover materials by visual similarity, properties, applications, and natural language queries.

**Key Metrics:**
- **5,000+ users** in production
- **99.5%+ uptime** SLA
- **12 AI models** integrated
- **14-stage processing pipeline**
- **6 embedding types** for multi-modal search
- **95%+ product detection accuracy**
- **85%+ search relevance**
- **90%+ material recognition accuracy**

---

## Platform Architecture

### Technology Stack

**Frontend**:
- React 18 + TypeScript + Vite
- Shadcn/ui + TailwindCSS
- Deployed on Vercel Edge Network
- Real-time updates via Supabase subscriptions

**Backend**:
- MIVAA API: FastAPI + Python 3.11
- 108 REST API endpoints (14 categories) - Consolidated from 113
- Docker containerized
- Self-hosted on dedicated server

**Database**:
- Supabase PostgreSQL 15
- pgvector extension for similarity search
- Row-Level Security (RLS) for multi-tenancy
- 30+ Edge Functions (TypeScript/Deno)

**AI Services**:
- OpenAI (GPT-4o, text-embedding-3-small)
- Anthropic (Claude Sonnet 4.5, Claude Haiku 4.5)
- Together AI (Llama 4 Scout 17B Vision)
- CLIP (Visual embeddings)
- Replicate (Image generation)

### System Flow

```
User uploads PDF → Frontend (React)
    ↓
Supabase Edge Function (mivaa-gateway)
    ↓
MIVAA API (FastAPI) → Creates background job
    ↓
14-Stage Processing Pipeline:
  0A. Product Discovery (Claude/GPT-4o) - Products + Metadata extraction
  0B. Document Entity Discovery (Optional) - Certificates, Logos, Specs
  1. Focused Extraction (product pages only)
  2. Text Extraction (PyMuPDF4LLM)
  3. Semantic Chunking (Anthropic)
  4. Text Embeddings (OpenAI 1536D)
  5. Image Extraction
  6. Image Analysis (Llama Vision)
  7-10. Multi-Vector CLIP Embeddings (512D)
  11. Product Creation & Entity Linking
  12. Entity Relationship Mapping
  13. Quality Enhancement (async)
  14. Cleanup & Completion
    ↓
Data stored in Supabase → Available for search
    ↓
Real-time updates → Frontend displays results
```

---

## AI Models & Intelligence

### 12 AI Models Across 7 Pipeline Stages

#### 1. Anthropic Claude Models

**Claude Sonnet 4.5** (Premium Tier):
- **Use Cases**: Deep product analysis, complex metadata extraction, quality validation
- **Context**: 200,000 tokens
- **Performance**: Highest accuracy for complex reasoning
- **Pipeline Stages**: Product Discovery (Stage 2), Deferred AI Analysis (Stage 11)

**Claude Haiku 4.5** (Mid Tier):
- **Use Cases**: Fast content classification, product boundary detection
- **Context**: 200,000 tokens
- **Performance**: 3x faster than Sonnet, 90% accuracy
- **Pipeline Stages**: Product Discovery (Stage 1), Content Classification

#### 2. OpenAI Models

**GPT-4o**:
- **Use Cases**: Product discovery, conversational AI, complex reasoning
- **Context**: 128,000 tokens
- **Performance**: High accuracy, multimodal capabilities
- **Pipeline Stages**: Product Discovery (alternative to Claude)

**text-embedding-3-small**:
- **Use Cases**: Text chunk embeddings, semantic search
- **Dimensions**: 1536
- **Performance**: 62.3% MTEB score
- **Cost**: $0.02 per 1M tokens
- **Pipeline Stages**: Text Embedding Generation (Stage 5)

#### 3. Together AI - Llama 4 Scout 17B Vision

- **Parameters**: 17 billion
- **Modality**: Vision + Text
- **Use Cases**: Material image analysis, product classification, OCR
- **Performance**: 
  - 69.4% MMMU (Massive Multitask Multimodal Understanding)
  - #1 ranked for OCR tasks
  - 85%+ accuracy on material recognition
- **Cost**: $0.30 per 1M tokens
- **Pipeline Stages**: Image Analysis (Stage 7), Material Recognition

#### 4. CLIP (OpenAI)

- **Model**: Vision Transformer Base 32
- **Dimensions**: 512
- **Use Cases**: Visual embeddings, image-text similarity, visual search
- **Performance**: Industry standard for visual embeddings
- **Cost**: Free (self-hosted)
- **Pipeline Stages**: Image Embedding Generation (Stage 8)

#### 5. Replicate Models

**Stable Diffusion XL**: 3D texture generation, material visualization  
**FLUX-Schnell**: Fast image generation, material previews

### Multi-Vector Embeddings (6 Types)

The platform generates **6 types of embeddings** for comprehensive search:

1. **Text Embeddings** (1536D) - OpenAI text-embedding-3-small
2. **Visual CLIP Embeddings** (512D) - CLIP ViT-B/32
3. **Color Embeddings** (256D) - Custom color analysis
4. **Texture Embeddings** (256D) - Custom texture analysis
5. **Application Embeddings** (512D) - Use-case classifier
6. **Multimodal Embeddings** (2048D) - Combined text + visual

---

## PDF Processing Pipeline (14 Stages)

### Stage-by-Stage Breakdown

**Stage 1: PDF Upload & Validation**
- File validation (size, type, corruption)
- Upload to Supabase Storage
- Create document record

**Stage 2: Background Job Creation**
- Create background_jobs record
- Initialize progress tracking
- Return job_id to frontend

**Stage 3: PDF Analysis**
- Extract PDF metadata (pages, size, structure)
- Analyze document type
- Select processing strategy
- **Checkpoint**: PDF_EXTRACTED

**Stage 4: Product Discovery (AI)**
- **Claude Haiku 4.5**: Fast product identification (5-15 seconds)
- Identify product count and page ranges
- **Claude Sonnet 4.5**: Validate and enrich metadata (10-30 seconds)
- Extract product names, dimensions, variants, designers
- **Output**: Product list with page ranges (95%+ accuracy)

**Stage 5: Text Extraction (Focused)**
- PyMuPDF4LLM: Extract text from product pages only
- Preserve structure and formatting
- Extract metadata (fonts, colors, layout)

**Stage 6: Semantic Chunking (AI)**
- Anthropic Chunking API: Split text semantically
- Max tokens: 800, Overlap: 100
- Preserve context and meaning
- Create document_chunks records
- **Checkpoint**: CHUNKS_CREATED

**Stage 7: Text Embedding Generation (AI)**
- OpenAI text-embedding-3-small: Generate 1536D embeddings
- Store in pgvector for similarity search
- Link embeddings to chunks
- **Checkpoint**: TEXT_EMBEDDINGS_GENERATED

**Stage 8: Image Extraction & Upload**
- Extract images from product pages
- Upload to Supabase Storage (pdf-tiles bucket)
- Create document_images records
- Extract image metadata (dimensions, format)
- **Checkpoint**: IMAGES_EXTRACTED

**Stage 9: Image Analysis (AI)**
- Llama 4 Scout 17B Vision: Analyze each image (1-3 seconds)
- Extract material properties
- Quality scoring (0-100)
- Classify image type (product, detail, mood, diagram)

**Stage 10: CLIP Embedding Generation (AI)**
- CLIP ViT-B/32: Generate 512D visual embeddings (50-150ms per image)
- Store in database for visual search
- Link to document_images
- **Checkpoint**: IMAGE_EMBEDDINGS_GENERATED

**Stage 11: Product Creation (Two-Stage AI)**
- **Stage 1**: Content classification (product/supporting/administrative)
- **Stage 2**: Product boundary detection
- Create products records with metadata
- Link chunks and images to products
- **Checkpoint**: PRODUCTS_CREATED

**Stage 12: Metafield Extraction**
- Extract dynamic metadata from chunks
- Create metafield_values records
- Link to chunks, products, images

**Stage 13: Deferred AI Analysis (Async Background Job)**
- Claude Sonnet 4.5: Validate low-scoring images
- Generate specialized embeddings:
  - Color embeddings (256D)
  - Texture embeddings (256D)
  - Application embeddings (512D)
  - Multimodal embeddings (2048D)
- Enhanced metadata extraction

**Stage 14: Cleanup & Completion**
- Delete temporary files from disk
- Kill background processes
- Update job status to 'completed'
- Send completion notification

### Processing Performance

| PDF Size | Pages | Products | Time | Accuracy |
|----------|-------|----------|------|----------|
| Small | 1-20 | 1-5 | 1-2 min | 95%+ |
| Medium | 21-50 | 6-15 | 2-4 min | 95%+ |
| Large | 51-100 | 16-30 | 4-8 min | 95%+ |
| Extra Large | 100+ | 30+ | 8-15 min | 95%+ |

**Benchmark**: Harmony PDF extracts **14+ distinct products** with complete metadata (product names, dimensions, designers, page ranges, variants, image types).

### Checkpoint Recovery System

The pipeline includes **9 checkpoints** for recovery on failure:

1. PDF_EXTRACTED
2. CHUNKS_CREATED
3. TEXT_EMBEDDINGS_GENERATED
4. IMAGES_EXTRACTED
5. IMAGE_EMBEDDINGS_GENERATED
6. PRODUCTS_CREATED
7. METAFIELDS_EXTRACTED
8. DEFERRED_ANALYSIS_QUEUED
9. COMPLETED

On job restart, the system resumes from the last completed checkpoint, avoiding redundant processing.

---

## Search & Discovery

### Multi-Vector Search System

The platform uses **6 embedding types** for comprehensive search:

**Semantic Search** (Text):
- Query: "sustainable wood materials"
- Embedding: OpenAI text-embedding-3-small (1536D)
- Similarity: Cosine similarity via pgvector
- Accuracy: 85%+

**Visual Search** (Images):
- Query: Upload image or describe visually
- Embedding: CLIP ViT-B/32 (512D)
- Similarity: Visual similarity matching
- Accuracy: 88%+

**Hybrid Search** (Combined):
- Query: Text + Image + Filters
- Weights: Configurable (e.g., 60% semantic, 40% keyword)
- Ranking: Multi-factor scoring
- Accuracy: 90%+

**Specialized Search**:
- Color-based: Find materials by color palette
- Texture-based: Find similar textures
- Application-based: Find materials for specific use cases

### Search Performance

- **Response Time**: 200-800ms
- **Accuracy**: 85%+
- **Concurrent Users**: 5,000+
- **Throughput**: 1000+ queries/minute

---

## Database Architecture

### Core Tables

**workspaces**: Multi-tenant workspace management  
**documents**: PDF documents and metadata  
**document_chunks**: Semantic text chunks with 1536D embeddings  
**document_images**: Extracted images with 512D CLIP embeddings  
**products**: Product records from PDFs  
**background_jobs**: Async job tracking with checkpoint recovery  
**material_metadata_fields**: Dynamic metafield definitions  
**metafield_values**: Metafield data for chunks/products/images

### Storage Buckets

**pdf-documents**: Original PDF files (50MB max)  
**pdf-tiles**: Extracted images (10MB max)  
**material-images**: Material photos (10MB max)  
**3d-models**: Generated 3D models (100MB max)

### Security

**Row-Level Security (RLS)**: All tables protected  
**Workspace Isolation**: Users only access their workspace data  
**JWT Authentication**: Supabase Auth with automatic token refresh  
**Encryption**: At rest and in transit

---

## Frontend Features

### User-Facing Features

**Dashboard**: Metrics, feature grid, quick actions  
**PDF Processing**: Drag-and-drop upload with real-time progress  
**Materials Catalog**: Searchable, filterable product catalog  
**Search Hub**: AI-powered semantic search  
**Material Recognition**: Upload images for material identification  
**3D Generation**: AI-powered material visualization  
**Mood Boards**: Create and share material collections  
**Shopping Cart**: Quote requests and commission tracking

### Admin Features

**Knowledge Base Management**: View/edit chunks, images, products  
**PDF Processing Monitor**: Real-time job tracking  
**AI Metrics Dashboard**: Model usage and cost tracking  
**Quality Dashboard**: Chunk quality and embedding stability  
**System Performance**: Response times, error rates, uptime  
**User Management**: Workspace members and permissions  
**Async Job Queue Monitor**: Background job status and recovery

---

## API Ecosystem

### 108 REST API Endpoints (Consolidated from 113)

**Categories** (14 total):
1. RAG & Document Processing (27 endpoints - includes metadata management, PDF extraction consolidated)
2. Search APIs (6 endpoints - semantic, vector, hybrid, visual, material, multi-vector)
3. Admin Routes (18 endpoints - job management, system monitoring, metadata management)
4. Document Entities (5 endpoints - certificates, logos, specifications)
5. Products API (3 endpoints - product management)
6. Images API (5 endpoints - image analysis and processing)
7. Embeddings APIs (3 endpoints - embedding generation)
8. AI Services (10 endpoints - AI model integration)
9. Background Jobs (7 endpoints - async job tracking)
10. Anthropic APIs (3 endpoints - Claude integration)
11. Together AI APIs (3 endpoints - Llama integration)
12. Monitoring Routes (3 endpoints - health checks, metrics)
13. AI Metrics Routes (2 endpoints - AI performance tracking)

**Consolidation Summary**:
- ✅ PDF Extraction: `/api/pdf/extract/*` (3 endpoints) → `/api/rag/documents/upload` with `processing_mode="quick"`
- ✅ Document Management: `/api/documents/*` (18 endpoints) → `/api/rag/*` (27 endpoints)
- ✅ Health Checks: 10+ individual endpoints → Single `/health` endpoint

**Documentation**:
- Swagger UI: `https://v1api.materialshub.gr/docs`
- ReDoc: `https://v1api.materialshub.gr/redoc`
- OpenAPI Schema: `https://v1api.materialshub.gr/openapi.json`

---

## Production Metrics

### Performance

- **Uptime**: 99.5%+
- **Users**: 5,000+
- **Search Response**: 200-800ms
- **PDF Processing**: 1-15 minutes (size-dependent)
- **Concurrent Jobs**: Unlimited queue

### Accuracy

- **Product Detection**: 95%+
- **Search Accuracy**: 85%+
- **Material Recognition**: 90%+
- **Image Classification**: 88%+

### Scalability

- **Database**: Auto-scaling with connection pooling
- **Frontend**: Global Edge Network (Vercel)
- **API**: Docker containerized with horizontal scaling
- **Storage**: Unlimited (Supabase)

---

**Last Updated**: 2025-10-31  
**Version**: 2.0.0  
**Status**: Production  
**Users**: 5,000+  
**Uptime**: 99.5%+

