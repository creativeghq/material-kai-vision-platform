# Platform Architecture

**Material Kai Vision Platform** - AI-Powered Material Intelligence System

---

## System Overview

The Material Kai Vision Platform is a comprehensive AI-powered system for material intelligence, combining document processing, material recognition, knowledge management, and advanced search capabilities. The platform serves 5,000+ users in production with 99.5%+ uptime.

### Core Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         Frontend Layer                           │
│  React + TypeScript + Vite + Shadcn/ui + TailwindCSS           │
│  Deployed on: Vercel (Edge Network + Serverless Functions)     │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                      API Gateway Layer                           │
│  • Supabase Edge Functions (30+ functions)                     │
│  • MIVAA Gateway (Material Intelligence API)                   │
│  • Authentication & Authorization (JWT + RLS)                  │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                     Processing Layer                             │
│  • MIVAA API (FastAPI + Python)                                │
│  • PDF Processing Pipeline (14 stages)                         │
│  • AI Model Orchestration (12 models)                          │
│  • Background Job Queue System                                 │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                      Data Layer                                  │
│  • Supabase PostgreSQL (with pgvector extension)               │
│  • Row-Level Security (RLS) for multi-tenancy                  │
│  • Supabase Storage (PDF files, images, models)                │
│  • Real-time subscriptions                                     │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                      AI Services Layer                           │
│  • OpenAI (GPT-4o, text-embedding-3-small)                     │
│  • Anthropic (Claude Sonnet 4.5, Claude Haiku 4.5)            │
│  • Together AI (Llama 4 Scout 17B Vision)                      │
│  • CLIP (Visual embeddings)                                     │
│  • Replicate (Image generation models)                         │
└─────────────────────────────────────────────────────────────────┘
```

---

## Technology Stack

### Frontend
- **Framework**: React 18 with TypeScript
- **Build Tool**: Vite 5
- **UI Library**: Shadcn/ui + Radix UI
- **Styling**: TailwindCSS 3
- **State Management**: React Query + Zustand
- **Routing**: React Router v6
- **Deployment**: Vercel (Edge Network)

### Backend Services

#### MIVAA API (Python)
- **Framework**: FastAPI 0.104+
- **Language**: Python 3.11+
- **Server**: Uvicorn (ASGI)
- **Deployment**: Docker containers on dedicated server
- **API Documentation**: OpenAPI 3.0 (Swagger UI + ReDoc)

#### Supabase Edge Functions
- **Runtime**: Deno
- **Language**: TypeScript
- **Count**: 30+ functions
- **Categories**: AI Processing, PDF Processing, Search, Material Analysis, Web Scraping

### Database
- **Primary**: Supabase PostgreSQL 15
- **Extensions**: pgvector (vector similarity search)
- **Features**: Row-Level Security (RLS), Real-time subscriptions, Full-text search
- **Storage**: Supabase Storage (S3-compatible)

### AI & ML Services
- **OpenAI**: GPT-4o (LLM), text-embedding-3-small (1536D embeddings)
- **Anthropic**: Claude Sonnet 4.5 (deep analysis), Claude Haiku 4.5 (fast classification)
- **Together AI**: Llama 4 Scout 17B Vision (material analysis, 69.4% MMMU)
- **CLIP**: Visual embeddings (512D)
- **Replicate**: Stable Diffusion XL, FLUX-Schnell (image generation)

---

## Key Components

### 1. Frontend Application

**Location**: `src/`

**Main Features**:
- Dashboard with metrics and feature grid
- PDF Processing interface with real-time progress
- Materials catalog with advanced search
- Knowledge Base management
- Admin panel with comprehensive monitoring
- 3D design generation
- Material recognition
- Mood board creation
- Shopping cart and quotes

**Key Pages**:
- `/` - Dashboard
- `/pdf-processing` - PDF upload and processing
- `/materials` - Materials catalog
- `/search-hub` - AI-powered search
- `/admin` - Admin dashboard
- `/3d` - 3D design generation
- `/recognition` - Material recognition

### 2. MIVAA API

**Location**: `mivaa-pdf-extractor/`

**Core Services**:
- PDF Processing Pipeline (14 stages with checkpoints)
- Product Discovery & Classification (two-stage AI)
- Image Analysis (Llama Vision + Claude validation)
- Embedding Generation (6 types: text, visual, color, texture, application, multimodal)
- Semantic Search (multi-vector)
- Background Job Queue
- Checkpoint Recovery System

**API Endpoints**: 37+ endpoints across 14 categories

### 3. Database Schema

**Core Tables**:
- `workspaces` - Multi-tenant workspace management
- `documents` - PDF documents and metadata
- `document_chunks` - Semantic text chunks with embeddings
- `document_images` - Extracted images with AI analysis
- `products` - Product records from PDFs
- `embeddings` - Vector embeddings (1536D text)
- `background_jobs` - Async job tracking
- `material_metadata_fields` - Dynamic metafield definitions
- `metafield_values` - Metafield data for entities

**Storage Buckets**:
- `pdf-documents` - Original PDF files
- `pdf-tiles` - Extracted images
- `material-images` - Material photos
- `3d-models` - Generated 3D models

---

## Data Flow

### PDF Processing Flow

```
1. User uploads PDF → Frontend
2. Frontend → Supabase Edge Function (mivaa-gateway)
3. Edge Function → MIVAA API (/api/rag/documents/upload-with-discovery)
4. MIVAA creates background job → Returns job_id
5. Background processing starts:
   ├─ Stage 1: PDF Analysis (PyMuPDF4LLM)
   ├─ Stage 2: Product Discovery (Claude/GPT)
   ├─ Stage 3: Text Extraction & Chunking (Anthropic)
   ├─ Stage 4: Text Embeddings (OpenAI)
   ├─ Stage 5: Image Extraction & Upload (Supabase Storage)
   ├─ Stage 6: CLIP Embeddings (512D)
   ├─ Stage 7: Product Creation (Two-stage AI)
   └─ Stage 8: Deferred AI Analysis (Llama + Claude + specialized embeddings)
6. Real-time progress updates → Frontend via polling
7. Completion → Data stored in Supabase → Available for search
```

### Search Flow

```
1. User enters search query → Frontend
2. Frontend → Supabase Edge Function (mivaa-gateway)
3. Edge Function → MIVAA API (/api/search/hybrid)
4. MIVAA performs:
   ├─ Text embedding generation (OpenAI)
   ├─ Vector similarity search (pgvector)
   ├─ Semantic ranking
   └─ Result aggregation
5. Results → Edge Function → Frontend
6. Frontend displays results with metadata
```

---

## Security Architecture

### Authentication
- **Provider**: Supabase Auth
- **Method**: JWT tokens
- **Features**: Email/password, OAuth (Google, GitHub), Magic links
- **Session Management**: Automatic token refresh

### Authorization
- **Row-Level Security (RLS)**: All tables protected
- **Workspace Isolation**: Users only access their workspace data
- **Role-Based Access Control (RBAC)**: Admin, member, owner roles
- **API Key Management**: Secure API keys for external integrations

### Data Protection
- **Encryption at Rest**: All data encrypted in Supabase
- **Encryption in Transit**: HTTPS/TLS for all connections
- **Secrets Management**: GitHub Secrets, Vercel Environment Variables, Supabase Edge Function Secrets
- **No .env files**: All secrets managed through secure platforms

---

## Deployment Architecture

### Frontend Deployment
- **Platform**: Vercel
- **Regions**: Global Edge Network
- **Build**: Automatic on git push to main
- **Environment**: Production, Preview (per PR)
- **CDN**: Vercel Edge Network
- **SSL**: Automatic HTTPS

### MIVAA API Deployment
- **Platform**: Self-hosted Docker container
- **Server**: v1api.materialshub.gr
- **Deployment**: GitHub Actions → SSH → Docker restart
- **Health Checks**: Automatic monitoring
- **Logs**: Sentry error tracking

### Database
- **Platform**: Supabase Cloud
- **Region**: EU West 3 (Paris)
- **Backups**: Automatic daily backups
- **Scaling**: Automatic connection pooling

---

## Performance Metrics

### Response Times
- **Search**: 200-800ms
- **PDF Processing**: 1-4 minutes (depending on size)
- **Image Analysis**: 1-3 seconds per image
- **Embedding Generation**: 100-300ms per chunk

### Accuracy
- **Search Accuracy**: 85%+
- **Product Detection**: 95%+
- **Material Recognition**: 90%+

### Scalability
- **Concurrent Users**: 5,000+
- **PDF Processing**: 1 PDF at a time per user
- **Background Jobs**: Unlimited queue
- **Database**: Auto-scaling with connection pooling

---

## Monitoring & Observability

### Error Tracking
- **Platform**: Sentry
- **Coverage**: Frontend + Backend
- **Alerts**: Real-time error notifications

### Performance Monitoring
- **Metrics**: Response times, throughput, error rates
- **Dashboards**: Admin panel with real-time metrics
- **Logging**: Structured logging with correlation IDs

### Health Checks
- **MIVAA API**: `/health` endpoint
- **Database**: Connection pool monitoring
- **External Services**: API availability checks

---

**Last Updated**: 2025-10-31  
**Version**: 2.0.0  
**Status**: Production

