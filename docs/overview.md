# Material Kai Vision Platform - Complete Overview

**AI-Powered Material Intelligence System for Enterprise Catalogs**

> Production-grade platform serving 5,000+ users with 99.5%+ uptime. Transforms material catalogs from multiple sources (PDF, Web, XML) into searchable, intelligent knowledge using 20+ AI models across 8 providers.

---

## 🎯 Executive Summary

Material Kai Vision Platform is an enterprise AI system that automatically extracts, analyzes, and organizes material information from multiple sources: PDF catalogs, manufacturer websites, and XML feeds. Using advanced computer vision, natural language processing, semantic search, spatial analysis, and interior design generation, it enables comprehensive material discovery and application.

**Key Metrics:**
- **5,000+ users** in production
- **99.5%+ uptime** SLA
- **20+ AI models** across 8 providers (Anthropic, OpenAI, Voyage AI, HuggingFace, WorldLabs, Replicate, Google Gemini, xAI)
- **170+ API endpoints** across 20 categories
- **3 ingestion methods** (PDF, Web Scraping, XML)
- **14-stage PDF processing pipeline**
- **7 embedding types** for multi-modal search (text, visual, understanding, color, texture, style, material)
- **60+ Supabase Edge Functions**
- **95%+ product detection accuracy**
- **85%+ search relevance**
- **90%+ material recognition accuracy**

**New Capabilities (2026):**
- 🌐 **Web Scraping**: Automatic product discovery from websites
- 💰 **Price Monitoring**: Competitive price tracking across sources
- 🎨 **Interior Design**: 20+ AI generation modes (image, video, VR, staging, region edit)
- 🔍 **Smart Search Management**: AI-powered search deduplication + re-ranking
- 🥽 **VR World Generation**: WorldLabs Marble 3D Gaussian Splat worlds from interior images
- 🤖 **Unified KAI Agent**: Merged Search + Insights + SEO into one intelligent agent
- 🔍 **B2B Manufacturer Search**: Claude built-in web search (no separate API key)
- ⚡ **Flow Engine**: Visual drag-and-drop workflow automation (triggers, conditions, actions)
- 🎬 **Interior Video Generation**: 4 AI models — Veo-2, Kling, Wan, Runway Gen4
- 🛋️ **Virtual Staging**: AI-furnished room renders from empty photos (Replicate, 20cr)
- ✏️ **Region Editing**: Pixel-precise inpainting with SAM 2 masks + Grok Aurora
- 📱 **Social Media Suite**: Generate captions, images, videos + publish via Late.dev
- 🤖 **Background Agents**: Scheduled autonomous agents with chain triggers + auto-recovery
- 💳 **Billing & Credits**: Stripe subscriptions + credit packages
- 📊 **CRM System**: Contacts, companies, user management

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
- Anthropic (Claude Sonnet 4.5, Claude Haiku 4.5 + built-in web search)
- OpenAI (GPT-4o, GPT-4o-mini for query parsing)
- Voyage AI (voyage-4, primary text/understanding embeddings, 1024D)
- HuggingFace Endpoint (Qwen3-VL 32B Vision)
- SigLIP2 via HuggingFace Endpoint (5 visual embedding types, 768D each)
- Replicate (virtual staging, Wan video, Runway Gen4, FLUX Dev, SAM 2, AnyDoor)
- WorldLabs Marble (3D Gaussian Splat VR world generation)
- Google Gemini (gemini-3.1-flash-image-preview, gemini-3-pro-image-preview — interior generation)
- xAI Aurora (grok-2-aurora — region edit inpainting, social image generation)
- Kling (kling-v3.0, kling-1.6-pro — interior and social video generation)
- Late.dev (social media OAuth broker + publishing platform)

### System Flow

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
  4. Text Embeddings (Voyage AI voyage-4, 1024D)
  5. Image Extraction
  6. Image Analysis (Qwen3-VL 32B → understanding embeddings via Voyage AI)
  7-10. Multi-Vector SigLIP2 Embeddings (768D halfvec: visual, color, texture, style, material)
  11. Product Creation & Entity Linking
  12. Entity Relationship Mapping
  13. Quality Enhancement (async)
  14. Cleanup & Completion
    ↓
Data stored in Supabase → Available for search
    ↓
Real-time updates → Frontend displays results

---

## AI Models & Intelligence

### 8 AI Models Across 4 Providers

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

**text-embedding-3-small** (retired 2026-04):
- **Use Cases**: Text chunk embeddings (historical)
- **Dimensions**: 1536
- **Status**: Retired in 2026-04. Primary and only text embedder is now Voyage AI voyage-4 (1024D, stored as halfvec in VECS). OpenAI text-embedding-3-small is only retained for the legacy CI changelog workflow.

#### 3. HuggingFace Endpoint - Qwen3-VL 32B Vision

- **Parameters**: 32 billion
- **Modality**: Vision + Text
- **Use Cases**: Material image analysis, product classification, OCR
- **Performance**:
  - 69.4% MMMU (Massive Multitask Multimodal Understanding)
  - #1 ranked for OCR tasks
  - 85%+ accuracy on material recognition
- **Cost**: $0.30 per 1M tokens
- **Pipeline Stages**: Image Analysis (Stage 6, 8)

#### 4. SLIG (SigLIP2 via HuggingFace Cloud) — updated 2026-04

- **Model**: SigLIP2 via SLIG cloud endpoint (replaced CLIP ViT-B/32 and SigLIP-SO400M in 2026-04)
- **Dimensions**: 768 (halfvec in VECS)
- **Use Cases**: Visual, color, texture, style, and material embeddings — 5 specialized 768D vectors per image
- **Performance**: Superior quality vs CLIP 512D; text-guided specialized vectors via similarity mode
- **Cost**: HuggingFace Inference Endpoint (auto-pause enabled)
- **Pipeline Stages**: Image Embedding Generation (Stage 7)

#### 5. Replicate Models

**Stable Diffusion XL**: 3D texture generation, material visualization
**FLUX-Schnell**: Fast image generation, material previews

### Multi-Vector Embeddings (7 Types)

The platform generates **7 types of embeddings** stored as `halfvec` (float16, 50% storage savings):

1. **Text Embeddings** (1024D) - Voyage AI voyage-4 (primary)
2. **Visual Embeddings** (768D) - SigLIP2 via HuggingFace Endpoint
3. **Understanding Embeddings** (1024D) - Voyage AI from Qwen3-VL structured analysis (enables spec-based search)
4. **Color Embeddings** (768D) - SigLIP2 color-guided
5. **Texture Embeddings** (768D) - SigLIP2 texture-guided
6. **Style Embeddings** (768D) - SigLIP2 style-guided
7. **Material Embeddings** (768D) - SigLIP2 material-guided

**Dynamic Weight Profiles**: 7 profiles (product_name, color_finish, specification, texture_pattern, style_aesthetic, material_search, balanced) automatically selected per query.

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
- Voyage AI voyage-4: Generate 1024D embeddings (stored as halfvec)
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
- Qwen3-VL 32B Vision: Analyze each image (1-3 seconds)
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
- Embedding: Voyage AI voyage-4 (1024D, updated 2026-04)
- Similarity: Cosine similarity via pgvector (halfvec)
- Accuracy: 85%+

**Visual Search** (Images):
- Query: Upload image or describe visually
- Embedding: SLIG SigLIP2 768D (updated 2026-04)
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
**document_chunks**: Semantic text chunks with 1024D Voyage embeddings (updated 2026-04)
**document_images**: Image metadata + boolean presence flags (`has_slig_embedding`, `has_understanding_embedding`, `has_color_slig`, `has_texture_slig`, `has_style_slig`, `has_material_slig`). All image vectors live in VECS collections (updated 2026-04 — legacy 512D CLIP columns were dropped).
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
**Quotes System**: Complete quote management with timeline tracking

### Admin Features

**Knowledge Base Management**: View/edit chunks, images, products
**PDF Processing Monitor**: Real-time job tracking with 9 checkpoint stages ✨ ENHANCED
**Analytics Dashboard**: Comprehensive analytics (search, API, agent chat, quality) ✨ ENHANCED
**AI Monitoring Dashboard**: Model usage, cost tracking, performance metrics
**Quality Dashboard**: Chunk quality and embedding stability
**System Performance**: Response times, error rates, uptime
**User Management**: Workspace members and permissions
**Async Job Queue Monitor**: Real-time background job status with auto-refresh ✨ ENHANCED
**Agent Configurations**: Manage AI agent system prompts and behavior
**AI Configs**: Unified AI prompt management (agents, extraction, templates, search) ✨ NEW
**Quote Management**: View all quote requests with status filtering
**Status Tags Management**: Create/edit custom status tags with colors
**Upsells Management**: Manage upsell items with pricing
**Timeline Steps Management**: Configure project timeline steps

**Monitoring Features** ✨ NEW:
- Real-time job tracking with Supabase subscriptions
- Comprehensive metrics per pipeline stage
- AI model cost tracking and usage analytics
- Search analytics and query patterns
- Agent chat quality ratings and performance
- Sentry integration for exception tracking
- Alert system (critical, warning, notifications)

---

## API Ecosystem

### 170+ API Endpoints

**Python REST API Categories** (18+ total):
1. RAG & Document Processing (27 endpoints — metadata management, PDF extraction consolidated)
2. Search APIs (6 endpoints — semantic, vector, hybrid, visual, material, multi-vector)
3. Admin Routes (18 endpoints — job management, system monitoring, metadata management)
4. Document Entities (5 endpoints — certificates, logos, specifications)
5. Products API (3 endpoints — product management)
6. Images API (6 endpoints — image analysis, processing, re-classification)
7. Embeddings APIs (3 endpoints — embedding generation)
8. AI Services (10 endpoints — AI model integration)
9. Background Jobs (7 endpoints — async job tracking)
10. Anthropic APIs (3 endpoints — Claude integration)
11. HuggingFace Endpoint APIs (3 endpoints — Qwen integration)
12. Monitoring Routes (3 endpoints — health checks, metrics)
13. AI Metrics Routes (2 endpoints — AI performance tracking)
14. Duplicate Detection (7 endpoints — factory-based duplicate detection + merging)
15. Data Import (4 endpoints — XML, web scraping, batch processing)
16. Job Health (3 endpoints — stuck job detection, recovery)
17. Segmentation (2 endpoints — SAM 2 mask generation, inpainting)
18. User Feedback (3 endpoints — feedback submission + sentiment analysis)

**Supabase Edge Functions** (60+ total):
- Agent & AI: `agent-chat`, `ai-rerank`, `background-agent-runner`, `mivaa-gateway`
- Interior Design: `generate-interior-gemini`, `generate-interior-video-v2`, `generate-region-edit`, `generate-virtual-staging`, `generate-vr-world`, `generate-quote-pdf`, `generate-social-content`, `generate-social-image`, `generate-social-video`
- Social: `late-oauth`, `late-publish`, `late-analytics`, `late-webhook-handler`
- CRM & Billing: `crm-companies-api`, `crm-contacts-api`, `crm-users-api`, `crm-stripe-api`, `stripe-checkout`, `stripe-customer-portal`, `stripe-webhooks`
- Automation: `flow-engine`, `flow-scheduler-cron`, `flow-webhook`
- Messaging: `email-api`, `messaging-api`, `notification-dispatcher`
- Scraping & Import: `scrape-session-manager`, `scrape-single-page`, `scrape-preview`, `parse-sitemap`, `xml-import-orchestrator`, `scheduled-import-runner`, `pdf-batch-process`
- Monitoring: `price-monitoring`, `price-monitoring-cron`, `check-material-alerts`, `ai-pricing-updater`, `auto-recovery-cron`, `job-cleanup-cron`, `health-check`
- Recommendations: `recommendations-api`
- SEO: `seo-analyze`, `seo-pipeline`, `seo-plan`, `seo-research`, `seo-write`

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

## Quote System

### Complete Quote Management Platform

**Customer Features**:
- Create multiple independent quotes
- Add products from search, agents, moodboards
- Custom text-based requests (no products required)
- Dimensions and area tracking (width, height, sqm)
- Auto-expiration after 30 days (configurable)
- Submit quote requests
- View and accept/reject extras/upsells
- Accept quotes with validation
- Track project timeline progress

**Admin Features**:
- View all quote requests with filtering
- Assign custom status tags with colors
- Attach upsells/extras to quotes
- Monitor customer acceptance
- Update project timeline progress
- Add notes to timeline steps

**System Components**:
- 8 database tables (quotes, quote_items, status_tags, upsells, quote_upsells, timeline_steps, quote_timeline, system_settings)
- 30+ service methods via QuotesService
- 6 default status tags (pending, in_progress, quoted, accepted, rejected, expired)
- 9 predefined timeline steps (Quote Accepted → Project Completed)
- Full-page admin interface with tabs
- Visual timeline tree with connector lines
- Real-time status updates

**Workflow**:
1. Customer creates quote and adds materials
2. Customer submits quote request
3. Admin assigns status tag and attaches upsells
4. Customer accepts/rejects each upsell
5. Customer accepts quote (validates all upsells decided)
6. System auto-initializes project timeline
7. Admin updates timeline progress with notes
8. Customer tracks project completion

---

**Last Updated**: March 2026
**Version**: 3.5.0
**Status**: Production
**Users**: 5,000+
**Uptime**: 99.5%+

**Recent Enhancements**:
- ✨ Flow Engine — Visual workflow automation with triggers, conditions, actions (2026-03)
- ✨ Interior Video Generation — 4 AI models: Veo-2, Kling v3, Wan 2.1, Runway Gen4 (2026-03)
- ✨ Virtual Staging — AI-furnished room renders via Replicate proplabs (2026-03)
- ✨ Region Editing — Pixel-precise masked inpainting with Grok Aurora + SAM 2 (2026-03)
- ✨ Social Media Suite — Content/image/video generation + Late.dev publishing (2026-03)
- ✨ Background Agents — Autonomous scheduled agents with chain triggers + auto-recovery (2026-03)
- ✨ Gemini Interior Generation — 4 modes: text-to-image, image-edit, floor plan render/diagram (2026-03)
- ✨ AI Re-ranking — Claude-powered post-retrieval result re-ordering (2026-03)
- ✨ Billing & Credits — Stripe subscriptions + credit packages (2026-03)
- ✨ CRM System — Contacts, companies, user management (2026-02)
- ✨ Unified KAI Agent — Search + Insights + SEO merged into one agent (2026-02-19)
- ✨ VR World Generation — WorldLabs Marble + Spark.js 3D Gaussian Splat viewer (2026-02-10)
- ✨ halfvec migration — All vector columns float16, 50% storage savings (2026-02-07)
- ✨ 7-vector fusion search with query-adaptive weight profiles
- ✨ Understanding embeddings — Qwen3-VL analysis → Voyage AI 1024D embedding
- ✨ B2B web search powered by Anthropic built-in web_search tool
