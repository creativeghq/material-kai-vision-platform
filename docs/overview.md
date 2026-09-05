# Material Kai Vision Platform - Complete Overview

**AI-Powered Material Intelligence System for Enterprise Catalogs**

> Production-grade platform serving 5,000+ users with 99.5%+ uptime. Transforms material catalogs from multiple sources (PDF, Web, XML) into searchable, intelligent knowledge using a focused AI stack: Anthropic-only vision (Claude Opus 5 via tool use), Claude Sonnet 5 chunking, Claude Haiku 4.5 classifiers, Voyage AI embeddings, SigLIP2 visual embeddings (SLIG on Modal), and PaddleOCR-VL structural layout + OCR backbone (on Modal).

---

## 🎯 Executive Summary

Material Kai Vision Platform is an enterprise AI system that automatically extracts, analyzes, and organizes material information from multiple sources: PDF catalogs, manufacturer websites, and XML feeds. Using advanced computer vision, natural language processing, semantic search, spatial analysis, and interior design generation, it enables comprehensive material discovery and application.

**Key Metrics:**
- **5,000+ users** in production
- **99.5%+ uptime** SLA
- **AI stack**: Anthropic-only vision (Claude Opus 5 via tool use), Claude Sonnet 5 chunking, Claude Haiku 4.5 classifiers, Voyage AI voyage-4 embeddings (text + understanding, 1024D), SigLIP2 768D visual embeddings (SLIG on Modal), PaddleOCR-VL structural layout + OCR backbone (on Modal) — plus Replicate, Gemini, xAI, WorldLabs, Kling for generation
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
- 🤖 **Unified JARVIS Agent**: Merged Search + Insights + SEO into one intelligent agent
- 🔍 **B2B Manufacturer Search**: Claude built-in web search (no separate API key)
- ⚡ **Flow Engine**: Visual drag-and-drop workflow automation (triggers, conditions, actions)
- 🎬 **Interior Video Generation**: 4 AI models — Veo-2, Kling, Wan, Runway Gen4
- 🛋️ **Virtual Staging**: AI-furnished room renders from empty photos (Replicate, 20cr)
- ✏️ **Region Editing**: Pixel-precise inpainting with SAM 2 masks + Grok Aurora
- 📱 **Social Media Suite**: Generate captions, images, videos + publish via Zernio
- 🤖 **Background Agents**: Scheduled autonomous agents with chain triggers + auto-recovery
- 💳 **Billing & Credits**: Stripe subscriptions + credit packages
- 📊 **CRM System**: Contacts, companies, user management
- 🏦 **Finance & Business Suite**: Greek e-invoicing (AADE/myDATA via Novus), POS cash register, online storefront, warehouse & billing, sales portal, and multi-tenant capabilities — see `docs/finance-system.md` and related docs (`pos-retail-system.md`, `online-storefront.md`, `warehouse-and-billing.md`, `sales-and-marketplace.md`, `capabilities-and-tenancy.md`)

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
- Anthropic (Claude Opus 5 vision-via-tool-use + chunking via Sonnet 5 + Haiku 4.5 classifiers + built-in web_search_20250305)
- Voyage AI (voyage-4, sole text + understanding embedder, 1024D)
- SigLIP2 (SLIG) via Modal Endpoint (5 visual embedding types, 768D each)
- PaddleOCR-VL (`PaddlePaddle/PaddleOCR-VL-1.6`, 0.9B) on Modal — two-stage structural layout (PP-DocLayoutV3) + OCR backbone (replaced Surya-2 2026-06-13)
- OpenAI (GPT-4o, GPT-5 — optional alternative for product discovery / agents; NOT vision)
- Replicate (virtual staging, Wan video, Runway Gen4, FLUX Dev, SAM 2, AnyDoor)
- WorldLabs Marble (3D Gaussian Splat VR world generation)
- Google Gemini (gemini-3.1-flash-image-preview, gemini-3-pro-image-preview — interior generation)
- xAI Aurora (grok-2-aurora — region edit inpainting, social image generation)
- Kling (kling-v3.0 — interior and social video generation)
- Zernio (social media OAuth broker + publishing platform)

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
  6. Image Analysis (Claude Opus 5 vision tool use → `VisionAnalysis` JSON → understanding embeddings via Voyage AI; per-image OCR via PaddleOCR-VL)
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

### Production AI Stack

#### 1. Anthropic Claude Models

**Claude Opus 5** (Vision + Deep Analysis):
- **Use Cases**: Material image analysis (schema-locked via `VisionAnalysis` Pydantic + `VISION_ANALYSIS_TOOL`), deep product analysis, quality validation, JARVIS agent
- **Context**: 200,000 tokens
- **Vision**: Sole vision engine post-2026-05-01. Sends base64 images with `tool_choice={'type':'tool','name':...}` forcing structured `VisionAnalysis` JSON output. Pre. The migration made the architecture honest.
- **Pipeline Stages**: Image Analysis (Stages 6, 8, 9), product discovery

**Claude Sonnet 5** (Chunking):
- **Use Cases**: Semantic text chunking
- **Pipeline Stages**: Stage 6 semantic chunking

**Claude Haiku 4.5** (Classification):
- **Use Cases**: Fast content classification, product boundary detection, price-monitoring identity classifier, demo agent
- **Performance**: 3x faster than Opus, 90% accuracy
- **Pipeline Stages**: Product Discovery (Stage 4), Content Classification

#### 2. Modal — PaddleOCR-VL (structural layout + OCR backbone)

- **Model**: `PaddlePaddle/PaddleOCR-VL-1.6` (0.9B), a two-stage document parser — PP-DocLayoutV3 (RT-DETR detector; multi-point boxes + reading order predicted in the decoder) localizes/labels regions and predicts reading order; the 0.9B VLM recognizes content (text, tables→markdown, formulas→LaTeX, charts)
- **Hosting**: Modal app `paddleocr-vl` (GPU L4, scale-to-zero → $0 idle). Contract: `GET /health` + `POST /parse`. ~1-3s/page warm, ~90s cold start
- **Use Cases**: Structure-first Stage 1 layout pass (runs BEFORE discovery, `processing_version="paddleocr-vl"`) + Phase 3 per-image OCR for text-bearing images + admin re-OCR
- **Failure marker**: `OCRResult.method` = `paddleocr` / `paddleocr_failed` (`ocr_engine` = `paddleocr`)
- **Per-attempt metrics**: `paddleocr_metrics` table
- **Secret**: only `PADDLEOCR_MODAL_API_KEY` required at runtime (URL baked as config default); CI auto-deploys on `modal_app/**` via the `deploy-modal` job
- **Replaced**: Surya-2 (2026-06-13), which had replaced YOLO + Chandra v2 + `merge_layout`

#### 3. OpenAI Models (optional, not vision)

**GPT-4o / GPT-5**:
- **Use Cases**: Alternative product discovery, conversational AI (optional, not vision)
- **Pipeline Stages**: Product Discovery (alternative to Claude)

**text-embedding-3-small** (retired 2026-04):
- **Status**: Retired. Primary and only text embedder is now Voyage AI voyage-4 (1024D, stored as halfvec in VECS).

#### 4. SLIG (SigLIP2 via Modal Cloud) — current visual embedder

- **Model**: SigLIP2 base (`google/siglip2-base-patch16-512`, native 768D) via the SLIG Modal endpoint (replaced CLIP ViT-B/32 and SigLIP-SO400M in 2026-04)
- **Dimensions**: 768 (halfvec in VECS)
- **Use Cases**: Visual, color, texture, style, and material embeddings — 5 specialized 768D vectors per image
- **Performance**: Superior quality vs CLIP 512D; text-guided specialized vectors via similarity mode
- **Cost**: Modal endpoint (scale-to-zero → $0 idle; moved off HuggingFace 2026-06-14)
- **Pipeline Stages**: Image Embedding Generation (Stage 7)

#### 5. Replicate Models

**Stable Diffusion XL**: 3D texture generation, material visualization
**FLUX-Schnell**: Fast image generation, material previews

### Multi-Vector Embeddings (7 Types)

The platform generates **7 types of embeddings** stored as `halfvec` (float16, 50% storage savings):

1. **Text Embeddings** (1024D) - Voyage AI voyage-4 (primary)
2. **Visual Embeddings** (768D) - SigLIP2 via SLIG Modal Endpoint
3. **Understanding Embeddings** (1024D) - Voyage AI from Claude Opus 5 `VisionAnalysis` JSON via `serialize_vision_analysis_to_text` (enables spec-based search). Provenance (`embedding_model`, `schema_version`) persisted per row.
4. **Color Embeddings** (1024D) - Voyage AI from `VisionAnalysis.colors[]` (v2, post-2026-05-04; legacy was 768D SigLIP2)
5. **Texture Embeddings** (1024D) - Voyage AI from `VisionAnalysis.textures[] + finish` (v2)
6. **Style Embeddings** (1024D) - Voyage AI from `VisionAnalysis.style + surface_pattern + applications` (v2)
7. **Material Embeddings** (1024D) - Voyage AI from `VisionAnalysis.material_type + category + subcategory` (v2)

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
- **Claude Opus 5**: Validate and enrich metadata (10-30 seconds)
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
- Claude Opus 5 vision via Anthropic tool use (3-8s per image, schema-locked via `VisionAnalysis`)
- Extract material properties
- Quality scoring (0-100)
- Classify image type (product, detail, mood, diagram)
- Per-image OCR via PaddleOCR-VL (text-bearing images only)

**Stage 10: SLIG Embedding Generation (AI)**
- SLIG (SigLIP2) cloud endpoint: Generate 5× 768D specialized embeddings per image (visual / color / texture / style / material), ~150-400ms per image
- Voyage AI voyage-4: 1024D understanding embedding from `VisionAnalysis` JSON
- All halfvec, written directly to VECS collections
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

**Stage 13: Quality Enhancement (Async)**
- Claude Opus 5: Validate low-scoring images
- Enhanced metadata extraction
- Note: Legacy 256D/512D/2048D specialized embedding columns were dropped in 2026-04. All embeddings now in VECS collections (SLIG 768D visual + Voyage 1024D understanding/aspect).

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

The platform uses **7 embedding types** for comprehensive search:

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
**document_images**: Image metadata + boolean presence flags (`has_slig_embedding`, `has_understanding_embedding`, `has_color_slig`, `has_texture_slig`, `has_style_slig`, `has_material_slig`) + provenance columns for the four aspect collections (`<aspect>_aspect_embedding_model`, `<aspect>_aspect_schema_version`). All image vectors live in VECS collections.
**products**: Product records from PDFs
**background_jobs**: Async job tracking — `stage_history` + `recovery_history` JSONB arrays (single-table design post-2026-04-25; `job_progress` and `job_checkpoints` tables dropped)
**material_metadata_fields**: Dynamic metafield definitions
**metafield_values**: Metafield data for chunks/products/images

### Storage Buckets (post-consolidation 2026-05-23)

**pdf-documents** (private, signed URLs): All PDF binaries — KB raw uploads, catalog sources/outputs, quote PDFs, moodboard sheet PDFs. Sub-folders distinguish identity (`{user_id}/`, `catalog-source/`, `catalog-output/`, `quote-output/`, `moodboard-output/`).
**pdf-tiles** (public): Extracted page images from PDFs — KB at `extracted/`, catalog at `catalog-extracted/`.
**generation-images** (public, 100 MB, image/video MIME): All AI-generated and chat-uploaded media — virtual staging, region edit, video, PBR maps, SAM crops, 3D models, designer assets, agent chat uploads.
**quote-templates** (private, 50 MB): Admin-managed template assets for quotes (root) and catalogs (`catalog/`).
**moodboard-sheet-references** (public): Static admin-curated illustrations for the sheet picker.
**profile-avatars** (public, 2 MB): User avatars.

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
11. Model Endpoint APIs
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
- Social: `zernio-api`, `zernio-webhook-handler`
- CRM & Billing: `crm-companies-api`, `crm-contacts-api`, `crm-users-api`, `crm-stripe-api`, `stripe-checkout`, `stripe-customer-portal`, `stripe-webhooks`
- Automation: `flow-engine`, `flow-scheduler-cron`, `flow-webhook`
- Messaging: `email-api`, `messaging-api`, `notification-dispatcher`
- Scraping & Import: `scrape-session-manager`, `scrape-single-page`, `scrape-preview`, `parse-sitemap`, `xml-import-orchestrator`, `scheduled-import-runner`, `pdf-batch-process`
- Monitoring: `monitoring-cron` (one dispatcher, `?task=price-refresh|mention-refresh|mention-probe|job-refresh|job-digest`), `check-material-alerts`, `ai-pricing-updater`, `auto-recovery-cron`, `job-cleanup-cron`, `health-check`
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

**Last Updated**: June 2026
**Version**: 3.7.0
**Status**: Production
**Users**: 5,000+
**Uptime**: 99.5%+

**Recent Enhancements**:
- ✨ Flow Engine — Visual workflow automation with triggers, conditions, actions (2026-03)
- ✨ Interior Video Generation — 4 AI models: Veo-2, Kling v3, Wan 2.1, Runway Gen4 (2026-03)
- ✨ Virtual Staging — AI-furnished room renders via Replicate proplabs (2026-03)
- ✨ Region Editing — Pixel-precise masked inpainting with Grok Aurora + SAM 2 (2026-03)
- ✨ Social Media Suite — Content/image/video generation + Zernio publishing (2026-03)
- ✨ Background Agents — Autonomous scheduled agents with chain triggers + auto-recovery (2026-03)
- ✨ Gemini Interior Generation — 4 modes: text-to-image, image-edit, floor plan render/diagram (2026-03)
- ✨ AI Re-ranking — Claude-powered post-retrieval result re-ordering (2026-03)
- ✨ Billing & Credits — Stripe subscriptions + credit packages (2026-03)
- ✨ CRM System — Contacts, companies, user management (2026-02)
- ✨ Unified JARVIS Agent — Search + Insights + SEO merged into one agent (2026-02-19)
- ✨ VR World Generation — WorldLabs Marble + Spark.js 3D Gaussian Splat viewer (2026-02-10)
- ✨ halfvec migration — All vector columns float16, 50% storage savings (2026-02-07)
- ✨ 7-vector fusion search with query-adaptive weight profiles
- ✨ Understanding embeddings — Claude Opus 5 vision_analysis (tool-use schema-locked) → Voyage AI 1024D embedding
- ✨ B2B web search powered by Anthropic built-in web_search tool
