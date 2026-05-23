# Documentation Index

Complete documentation for Material Kai Vision Platform.

---

## 📚 Documentation Structure

### 🎯 Getting Started

**[app-details.md](app-details.md)** - Business & Product Overview (Investor Document) ✨ NEW
- Full business model, credit system, pricing tiers
- User segments, access control, supplier vs buyer side
- AI model stack and technical differentiation
- Competitive landscape and roadmap
- Production metrics and platform architecture

**[overview.md](overview.md)** - Complete platform overview
- Executive summary
- Architecture overview
- AI models integration
- 14-stage PDF processing pipeline
- Search capabilities
- Database architecture
- Production metrics

**[features-guide.md](features-guide.md)** - All platform features
- Intelligent PDF processing
- Multi-modal search
- Materials catalog
- Product management
- Admin dashboard
- RAG system
- Real-time monitoring
- Metadata management
- Image management
- Workspace isolation
- Batch processing
- API gateway
- Security features
- Analytics & reporting

**[platform-flows.md](platform-flows.md)** - User workflows & feature flows ✨ UPDATED
- PDF Processing Flow
- Search & Discovery Flow
- Data Import Flow
- 3D Generation Flow
- Knowledge Base Flow
- Agent Chat Flow
- VR World Generation Flow
- Flow Automation Flow ✨ NEW
- Social Media Publishing Flow ✨ NEW

**[duplicate-detection-merging.md](duplicate-detection-merging.md)** - Duplicate detection system
- Factory-based duplicate detection
- Product merging with undo
- Similarity scoring
- Merge history tracking
- API endpoints (7 total)

**[data-import-system.md](data-import-system.md)** - Data import system ✨ NEW
- XML import with AI-powered field mapping
- Dynamic field mapping (Claude Opus 4.7)
- Batch processing (10 products at a time)
- Concurrent image downloads (5 parallel)
- Cron-based scheduling for recurring imports
- Manual re-run functionality
- Checkpoint recovery
- Real-time progress tracking
- API endpoints (4 total)
- Phase 1 & 2 complete

**[async-processing-and-limits.md](async-processing-and-limits.md)** - Async processing & concurrency limits ✨ NEW
- Fully async architecture across all methods (PDF, Web, XML)
- Unified concurrency limits (2 Claude, 10 uploads, 20 SLIG, 8 Chandra v2 — Qwen gate retired 2026-05-01)
- Timeout configuration (300s discovery, 120s AI, 30s downloads)
- Rate limiting (circuit breaker on Claude; Chandra retries with jitter at 3 attempts)
- Shared services (ImageProcessingService, RealEmbeddingsService, AsyncQueueService)
- Memory optimization (batch processing prevents OOM)
- Network optimization (semaphores prevent congestion)
- API optimization (rate limiting prevents throttling)
- Performance comparison table
- Best practices and monitoring

**[unified-product-generation-flow.md](unified-product-generation-flow.md)** - Unified product generation flow ✨ NEW
- Complete architecture diagram (all 3 methods → unified storage → unified search)
- Method comparison (PDF vs Web vs XML)
- Detailed flow verification for each method
- Unified storage (same tables + VECS collections)
- Unified search (multi-vector search across all sources)
- Verification checklist (product generation, storage, search, async)
- Visual flow diagrams and code examples

**[collaborative-filtering-recommendations.md](collaborative-filtering-recommendations.md)** - Collaborative filtering recommendations ✨ NEW
- User-user collaborative filtering ("Users like you also liked...")
- Item-item collaborative filtering ("Materials similar to this...")
- Hybrid recommendations (collaborative + content-based)
- Interaction tracking (view, click, save, purchase, rate, add_to_quote, share)
- Smart caching (7-day TTL with automatic invalidation)
- Real-time analytics and performance monitoring
- Complete API reference (5 endpoints)
- Frontend integration guide with code examples
- Database schema (2 tables with indexes and RLS)
- Cosine similarity and matrix factorization algorithms

**[social-media-system.md](social-media-system.md)** - Social media creation & monitoring system
- KAI agent tools for social content (captions, images, videos)
- Late.dev OAuth integration for per-user platform connections
- Publishing, scheduling, analytics via Late.dev API
- xAI Aurora / Gemini Flash / FLUX Dev image generation routing
- Multi-model interior video (Veo 2, Kling 1.6 Pro, Wan, Runway)
- Background agents for analytics sync
- Admin panel at /admin/social-media/*
- Deployment checklist + required secrets

**[flow-engine.md](flow-engine.md)** - Workflow Automation System ✨ NEW
- Visual drag-and-drop flow builder at `/admin/flows`
- Trigger types: cron, webhook, event, manual
- Condition nodes: if_else, switch, filter, delay
- Action nodes: send_sms, send_email, http_request, notification, quote
- Template variable resolution `{{trigger.data.field}}`
- Dry-run / test mode, execution logs

**[background-agents.md](background-agents.md)** - Background Agent Framework ✨ NEW
- 6 registered agent types (kai-task, product-enrichment, material-tagger, social sync, factory-enrichment)
- Trigger types: cron, event, manual, chain
- Auto-recovery cron (every 5 min, up to 3 retries)
- Delegation to Python backend for long tasks
- Admin UI at `/admin/background-agents`

**[virtual-staging.md](virtual-staging.md)** - Virtual Staging ✨ NEW
- Replicate proplabs model, 20 credits, ~56s
- 8 room types, 8 furniture styles

**[gemini-image-generation.md](gemini-image-generation.md)** - Gemini image generation patterns ✨ NEW (2026-05-02)
- Models, costs, response shape (`gemini-3.1-flash-image-preview`, `gemini-3-pro-image-preview`)
- Minimal copy-paste skeleton for new image-generation endpoints
- Reference implementation: `seed-sheet-references` (admin static-asset seeder)
- Admin-secret pattern, bucket conventions, prompt-engineering notes
- Pitfalls hit in production (mimeType, response modalities, idle timeout)

**[moodboard-presentation-sheets.md](moodboard-presentation-sheets.md)** - Moodboard Presentation Sheets ✨ NEW (2026-05-02)
- 8 client-ready sheet types: Material Board, Color Palette, Concept Board, Lighting Plan, Annotated Render, Elevation+Render Pair, FF&E Schedule, Full Deck
- A3-landscape PDFs via pdf-lib in `generate-moodboard-sheet-pdf` edge function
- Generated through KAI agent chat via `generate_presentation_sheet` tool (0/2/3 cr per type)
- Interactive types open canvas widgets in chat (CalloutCanvas, DimensionCanvas, FixtureSymbolCanvas)
- Persistent + editable: every sheet is a row in `moodboard_presentation_sheets` with JSONB `data`
- Sheets tab on every moodboard at `/moodboard/:id`

**[presentation-catalogs.md](presentation-catalogs.md)** - Presentation Catalogs ✨ NEW (2026-05-08)
- Admin-only catalog builder driven by 8 KAI tools: create / attach_pdfs / extract / translate / add_material / find_image / generate_pdf / publish
- Source PDFs uploaded to `pdf-documents/catalog-source/` (post 2026-05-23 consolidation); Sonnet 4.6 PDF Vision extracts sections + bbox per material
- Per-candidate page rasterization via MIVAA PyMuPDF (`/api/internal/catalog/rasterize-pdf-page`) — every extracted material has a real cropped image
- Editable JSONB body renders BOTH as A4 PDF (cover + body + back cover via pdf-lib) AND as live web page at `/c/:slug`
- Email-gate on public pages: matched against `auth.users` + `crm_contacts` + `crm_companies` + per-catalog allowlist (`catalog_email_grants`); 30-day signed cookie
- Operations dashboard at `/admin/operations?tab=catalogs` — gate attempts (granted/denied), page views, PDF downloads, per-catalog rollup with linked user profiles
- 5 tables, 3 RPCs, 1 view, 5 storage buckets, 6 edge functions, 1 MIVAA endpoint

**[interior-video-generation.md](interior-video-generation.md)** - Interior Video Generation ✨ NEW
- 4 models: Veo-2 (30cr), Kling v3.0 (20cr), Wan 2.1 (12cr), Runway Gen4 (40cr)
- 5 video types with auto model routing
- Async polling pattern for long renders

**[segmentation-inpainting.md](segmentation-inpainting.md)** - Segmentation & Inpainting ✨ NEW
- SAM 2 pixel-perfect masks + Pillow fallback
- Grok Aurora region edit (20cr), AnyDoor product placement, FLUX Fill Pro
- `/api/segment/mask` and `generate-region-edit` edge function

**[billing-credits-system.md](billing-credits-system.md)** - Billing & Credits System ✨ NEW
- Stripe subscription plans + credit packages
- stripe-checkout, stripe-customer-portal, crm-stripe-api
- Per-workspace credit balance tracking
- Frontend: `/billing/credits` and `/billing/subscriptions`

**[ai-reranking.md](ai-reranking.md)** - AI Search Re-ranking ✨ NEW
- Claude-powered post-retrieval result re-ordering
- Optional per-result explanations
- opus or haiku model choice

**[crm-system.md](crm-system.md)** - CRM System ✨ NEW
- Contacts, companies, platform user management
- Integration with messaging and quotes
- Role-based access control

**[campaign-system.md](campaign-system.md)** - Email campaign management system ✨ NEW
- Campaign creation and management
- Audience targeting and segmentation
- Recipient tracking (sent, delivered, opened, clicked, bounced)
- Template integration with personalization
- Campaign scheduling and sending
- Real-time analytics and reporting
- Admin dashboard at /admin/emails → Campaigns tab
- SES webhook integration for bounce/complaint handling
- Complete API reference and usage examples
- Best practices and troubleshooting

**[vr-world-generation.md](vr-world-generation.md)** - VR World generation with WorldLabs Marble ✨
- WorldLabs Marble API integration (mini + plus models)
- Spark.js Gaussian Splat renderer via `@sparkjsdev/spark` + `three@0.178` (code-split, ~496KB)
- Orbit + First-person (WASD + mouse look + Shift speed boost) navigation with toggle
- 3 quality levels (100k/500k/full SPZ)
- Credit-based pricing (50 credits mini ~30-45s, 200 credits plus ~5min) with refund on failure
- Edge function orchestration (upload → generate → poll → store in `vr_worlds` table)
- WorldViewer component with adaptive status polling
- Integrated into Interior Designer agent chat via DesignCanvas "Generate VR" button
- Requires `WORLDLABS_API_KEY` in Supabase Edge Function secrets

**[search-strategies.md](search-strategies.md)** - Complete search system guide ✨ UPDATED
- 6 search strategies (100% implemented)
- Semantic, Vector, Multi-Vector, Hybrid, Material, Image
- All strategies combined mode
- **Query-adaptive weight profiles** — 7 profiles dynamically selected per query
- Database schema and indexes
- Performance metrics and benchmarks
- Usage examples and best practices

**[image-relevancy-and-search.md](image-relevancy-and-search.md)** - Image search & multi-vector architecture ✨ UPDATED
- **7-embedding fusion system** (text, visual, understanding, color, texture, style, material)
- True async parallel execution with asyncio.gather() and thread pools
- 300-500ms search performance (3-4x faster than sequential)
- **Dynamic weighting** — adapts per query (e.g., color queries → Color 30%, spec queries → Understanding 40%)
- Specialized endpoints for individual embedding searches
- Complete technical implementation details
- Search response format with individual scores and weight_profile

**[comprehensive-metadata-fields-guide.md](comprehensive-metadata-fields-guide.md)** - Comprehensive metadata fields guide ✨ NEW
- 200+ metadata fields across 9 categories
- Material Properties, Dimensions, Appearance, Performance
- Application, Compliance, Design, Manufacturing, Commercial
- AI-powered dynamic extraction (Claude Opus 4.7 / GPT-4o)
- Complete field reference with examples
- API usage and frontend display
- Step-by-step extraction process
- Confidence scoring system
- Best practices and troubleshooting

### 🆕 New Features

**[ar-material-preview.md](ar-material-preview.md)** - AR Material Preview ✨ NEW
- WebXR AR on Android, 3D swatch viewer on iOS/desktop
- PBR map generation (albedo, normal, roughness, metalness)
- QR code handoff for desktop-to-mobile AR
- 8 credits per PBR generation, viewing free

**[lighting-simulation.md](lighting-simulation.md)** - Lighting Simulation ✨ NEW
- AI room re-lighting (6 presets via Gemini edit)
- 3D PBR material viewer with time-of-day and orientation controls
- Material category defaults (ceramic, wood, metal, fabric, stone, glass)

**[pinterest-integration.md](pinterest-integration.md)** - Pinterest Integration ✨ NEW
- Phase 1: URL paste → oEmbed import → auto material matching
- Phase 2: OAuth board browsing → bulk pin import
- Integration with moodboards and visual search

**[manufacturer-analytics.md](manufacturer-analytics.md)** - Manufacturer Analytics (Enhanced) ✨ NEW
- Batched event tracking (view, save, quote, search, click, compare)
- Geographic demand, designer engagement, competitive positioning
- Tiered access (free/pro/enterprise)

---

### 🏗️ Architecture & Design

**[design-system.md](design-system.md)** - Dark-mode theme, horizontal top nav, typography, button/tab/card/table patterns, image optimization helper. Summary + pointer to full reference at `.claude/design-system.md`.

**[category-field-registry.md](category-field-registry.md)** - Frontend display config for the 10 material categories (`tiles`, `wood`, `decor`, `furniture`, `general_materials`, `paint_wall_decor`, `heating`, `sanitary`, `kitchen`, `lighting`). How sections render in `ProductDetailModal`, `controlledVocab` resolution, editing rules, drift-with-Python warnings.

**[system-architecture.md](system-architecture.md)** - Complete system architecture
- Three-tier architecture
- Hybrid architecture pattern
- Database schema overview
- Authentication & security
- API endpoints (113)
- AI integration
- Scalability
- Data flow
- Technology stack
- Monitoring & observability
- Security measures
- Production metrics

**[metadata-management-system.md](metadata-management-system.md)** - Metadata management system
- Dynamic metadata extraction
- JSONB storage architecture
- Metadata validation and quality scoring
- Admin panel for metadata management
- API endpoints for metadata operations
- Best practices and guidelines

**[meta-field-aggregation.md](meta-field-aggregation.md)** - Meta field aggregation system ✨ NEW
- **3-source redundancy strategy** for maximum coverage
- Product Discovery + AI Extraction + Chunk Aggregation
- Case-insensitive deduplication
- Comprehensive metadata collection (colors, textures, finishes, materials, applications)
- Same architecture as dimension aggregation
- Prevents data loss from scattered information

**[metadata-normalization-system.md](metadata-normalization-system.md)** - Metadata normalization system ✨ NEW
- Two-layer normalization architecture (prevention + correction)
- Semantic similarity-based field standardization (60% threshold)
- Automatic consolidation (individual fields → objects, single → arrays)
- Integrated into extraction pipeline
- Migration script for existing products
- 95%+ field standardization accuracy

**[job-queue-system.md](job-queue-system.md)** - Job queue & async processing
- Supabase-native job queue architecture
- Checkpoint-based recovery system
- Auto-recovery for stuck jobs
- Real-time progress tracking
- Priority-based job processing
- Health monitoring & observability
- Database tables (background_jobs, job_progress, job_checkpoints)
- Processing flow & lifecycle
- Key services (AsyncQueueService, CheckpointRecoveryService, JobMonitorService)
- Configuration & tuning
- Production metrics & reliability

**[monitoring-analytics-system.md](monitoring-analytics-system.md)** - Monitoring & analytics system ✨ NEW
- Real-time PDF processing monitor (`/admin/async-queue-monitor`)
- Comprehensive analytics dashboard (`/admin/analytics`)
- AI model usage and cost tracking (`/admin/ai-monitoring`)
- Search analytics and query patterns
- Agent chat analytics with quality ratings
- System performance metrics (uptime, latency, error rates)
- Sentry integration for exception tracking
- 9 checkpoint stages with comprehensive metrics
- Real-time updates via Supabase subscriptions
- Stage-by-stage monitoring (Stage 0, 1, 3.5, 4)
- Cost tracking per AI model
- Alert system (critical, warning, notifications)

---

### 🤖 AI & Processing

**[ai-models-guide.md](ai-models-guide.md)** - AI models integration
- Anthropic: Claude Opus 4.7 (vision via tool use), Sonnet 4.6 (chunking), Haiku 4.5 (classifiers)
- Voyage AI: voyage-4 (sole text + understanding embedder, 1024D)
- HuggingFace Endpoints: SLIG SigLIP2 (5 visual embedding types, 768D each) + Chandra v2 (sole OCR engine, retry-with-jitter)
- OpenAI: GPT-4o, GPT-5 (optional alternatives — NOT vision)
- WorldLabs Marble: 3D Gaussian Splat generation
- Qwen retired 2026-05-01 (HF endpoint had been silently 404-ing for months)
- 7 embedding types (text, visual, understanding, color, texture, style, material) — halfvec float16
- Model usage by pipeline stage
- Cost optimization
- API keys & configuration
- Performance benchmarks

**[agent-system.md](agent-system.md)** - AI Agent system architecture ✨ UPDATED (2026-02-19)
- Database-driven agent prompts
- **3 agents**: Jarvis (unified), Interior Designer, Demo
- Legacy aliases: `search`, `insights`, `seo` → all resolve to `kai` transparently
- **Jarvis agent**: material_search, knowledge_base_search, visual_search (all roles); B2B/sub-agent tools (admin/owner only)
- B2B research: manufacturer search via Anthropic built-in web search (no Perplexity key), company enrichment, contact discovery, email validation
- Email finder: Hunter.io + Apollo.io fallback, ZeroBounce validation on all discovered emails
- Admin UI for prompt management (/admin/agent-configs)
- LangChain.js + LangGraph StateGraph orchestration
- Real-time prompt updates (no deployment needed)
- RBAC tool gating
- Multimodal image support (data URL → vision content blocks)

**[langgraph-implementation.md](langgraph-implementation.md)** - LangGraph implementation guide ✨ NEW
- StateGraph-based agent execution
- AgentStateAnnotation with reducers (append, replace, sum)
- SupabaseCheckpointer for resumable conversations
- LongTermMemory for cross-conversation context
- Memory types (preference, fact, context, relationship)
- Automatic memory extraction from conversations
- Streaming updates and observable execution
- Token usage tracking across iterations
- Human-in-the-loop patterns (planned)
- Database schema (agent_checkpoints, agent_memories)

**[prompt-enhancement-system.md](prompt-enhancement-system.md)** - Dynamic prompt system ✨ NEW
- Database-driven extraction prompts (extraction_prompts table)
- Custom vs default prompt priority (is_custom flag)
- Version control and workspace isolation
- 4 stages: discovery, chunking, image_analysis, entity_creation
- 4 categories: products, certificates, logos, specifications
- Automatic placeholder replacement
- Phase 1 complete (metadata extraction), Phases 2-4 pending

**[pdf-processing-pipeline.md](pdf-processing-pipeline.md)** - 14-stage PDF processing ✨ UPDATED
- Product-centric architecture (process each product individually)
- Stage 0A: Product Discovery (0-10%) - Products + Metadata extraction
- Stage 0B: Document Entity Discovery (10-15%) - Certificates, Logos, Specs
- Stage 1: Extract Product Pages (15-25%)
- Stage 2: Text Extraction (25-35%)
- Stage 3: Image Extraction (35-45%)
- Stage 4: Product Creation (45-50%)
- **Stage 4.5: YOLO Layout Detection + Table Extraction (50-65%)** ✨ NEW
  - 6 region types: TEXT, TITLE, TABLE, IMAGE, CAPTION, FORMULA
  - Automatic table extraction (Camelot)
  - Enabled by default (YOLO_ENABLED=true)
  - Stores in product_layout_regions and product_tables
- Stage 5: Entity Linking (65-70%)
- Stage 6: AI Classification (70-75%) — Claude Opus 4.7 via Anthropic tool use
- Stage 7: SLIG Embeddings (75-85%) — SigLIP2 cloud endpoint, 5×768D specialized
- Stage 8: Vision Analysis (85-90%) — Claude Opus 4.7 schema-locked via `VisionAnalysis` Pydantic + `VISION_ANALYSIS_TOOL`
- **Layout-Aware Chunking** ✨ NEW
  - Uses YOLO regions for intelligent chunking
  - Respects region boundaries
  - Combines TITLE + TEXT
  - Keeps tables intact
  - Preserves reading order
- Checkpoint recovery (9 checkpoints)
- Performance metrics
- API endpoint

**[product-discovery-architecture.md](product-discovery-architecture.md)** - Product discovery system
- Products + Metadata architecture (inseparable)
- Document entities (certificates, logos, specifications)
- Factory/group identification for agentic queries
- Product-document relationships
- API endpoints for entity management
- Future extensibility (marketing, bank statements)
- Database schema (document_entities, product_document_relationships)

---

### 💼 Business Features

**[professional-marketplace.md](professional-marketplace.md)** - Professional Marketplace ✨ NEW
- Public profiles for architects, designers, consultants & all professional types
- Discover directory (`/discover`) with search + tag filtering
- Services with rich detail (name, description, price, previous work)
- Hire Me flow → `profile_contact_requests` table + flow event
- Social: follow/unfollow, profile views, moodboard comments
- DB tables: `user_profiles`, `profile_contact_requests`, `user_follows`

**[email-system.md](email-system.md)** - Email system with Amazon SES
- Domain verification and management
- React Email template system
- Delivery tracking and analytics
- Bounce and complaint handling
- SNS webhook integration
- Admin dashboard at /admin/emails
- Complete API reference

**[campaign-system.md](campaign-system.md)** - Email campaign management ✨ NEW
- Bulk email campaigns with targeting
- Recipient tracking and analytics
- Campaign scheduling and automation
- Template personalization
- Real-time delivery monitoring
- Admin interface for campaign management

**[quotes-system-architecture.md](quotes-system-architecture.md)** - Quotes management system
- Multiple independent quotes per user
- Custom requests and product quotes
- Status tags and timeline tracking
- Upsells/extras management
- Quote acceptance workflow
- Admin management interface

---

### 🔌 API Reference

**[api-master-reference.md](api-master-reference.md)** ✨ **START HERE** — Single-page master index covering **all 68 Supabase edge functions + MIVAA Python endpoints**. Auth models, categories (AI agents / generation / SEO / KB / CRM / messaging / social / pinterest / scraping / flows / crons / admin), and standard call patterns.

**[api/README.md](api/README.md)** — Per-edge-function deep docs index (25 dedicated function pages).

**[api-endpoints.md](api-endpoints.md)** - Complete MIVAA Python API reference
- 114 endpoints across 14 categories
- RAG Routes (25 endpoints)
- Admin Routes (18 endpoints)
- Search Routes (18 endpoints)
- Documents Routes (11 endpoints)
- AI Services Routes (10 endpoints)
- Images Routes (6 endpoints)
- Document Entities Routes (5 endpoints)
- PDF Routes (4 endpoints)
- Products Routes (3 endpoints)
- Embeddings Routes (3 endpoints)
- HuggingFace Endpoint Routes (2 endpoints — SLIG SigLIP2 + Chandra v2; Qwen retired 2026-05-01)
- Anthropic Routes (3 endpoints)
- Monitoring Routes (3 endpoints)
- AI Metrics Routes (2 endpoints)
- Authentication methods
- Response format
- Rate limiting

---

### 🚀 Deployment & Operations

**[deployment-guide.md](deployment-guide.md)** - Production deployment
- Deployment architecture
- Frontend deployment (Vercel)
- Backend deployment (Self-hosted)
- Database deployment (Supabase)
- CI/CD pipeline
- Secrets management
- Monitoring & alerts
- Rollback procedures
- Pre-deployment checklist
- Performance targets
- Deployment links

**[troubleshooting-guide.md](troubleshooting-guide.md)** - Common issues & solutions
- Critical issues (API down, database connection, OOM)
- Common issues (PDF processing, search, latency, auth, images)
- Performance optimization
- Support resources

---

## 🎓 Learning Path

### For New Developers

1. Start with **[overview.md](overview.md)** - Understand the platform
2. Read **[system-architecture.md](system-architecture.md)** - Learn the architecture
3. Study **[pdf-processing-pipeline.md](pdf-processing-pipeline.md)** - Understand the core pipeline
4. Review **[api-endpoints.md](api-endpoints.md)** - Learn the API
5. Check **[deployment-guide.md](deployment-guide.md)** - Understand deployment

### For API Integration

1. Read **[api-endpoints.md](api-endpoints.md)** - All endpoints
2. Check **[ai-models-guide.md](ai-models-guide.md)** - AI models used
3. Review **[metadata-management-system.md](metadata-management-system.md)** - Data structure
4. Study **[system-architecture.md](system-architecture.md)** - Authentication

### For Operations

1. Read **[deployment-guide.md](deployment-guide.md)** - Deployment process
2. Study **[troubleshooting-guide.md](troubleshooting-guide.md)** - Common issues
3. Review **[system-architecture.md](system-architecture.md)** - Monitoring
4. Check **[job-queue-system.md](job-queue-system.md)** - Job monitoring and recovery

### For Product Managers

1. Start with **[overview.md](overview.md)** - Platform overview
2. Read **[features-guide.md](features-guide.md)** - All features
3. Review **[pdf-processing-pipeline.md](pdf-processing-pipeline.md)** - Processing pipeline
4. Check **[ai-models-guide.md](ai-models-guide.md)** - AI capabilities

---

## 📊 Quick Reference

### Key Numbers

- **5,000+** users in production
- **99.5%+** uptime SLA
- **20+** AI models across 8 providers (Anthropic, OpenAI, Voyage AI, HuggingFace, WorldLabs, Replicate, Google Gemini, xAI)
- **14** processing pipeline stages
- **170+** API endpoints (20 categories)
- **60+** Supabase Edge Functions
- **7** embedding types with dynamic weight profiles (halfvec float16 storage)
- **3** active agents: KAI (unified), Interior Designer, Demo
- **6** background agent types
- **200+** metafield types
- **95%+** product detection accuracy
- **85%+** search relevance
- **90%+** material recognition accuracy

### Technology Stack

**Frontend**: React 18, TypeScript, Vite, Shadcn/ui, Vercel
**Backend**: FastAPI, Python 3.11, Uvicorn, self-hosted
**Database**: PostgreSQL 15 + pgvector 0.8.0 (halfvec), Supabase
**AI**: Claude (Opus 4.7 vision tool use + Sonnet 4.6 chunking + Haiku 4.5 classifiers), Voyage AI (voyage-4 sole text + understanding embedder), SLIG SigLIP2 (HuggingFace, 5×768D visual), Chandra v2 (HuggingFace, sole OCR engine), GPT-4o/GPT-5 (optional alternatives — not vision), WorldLabs Marble, Google Gemini, xAI Aurora (Grok), Kling, Replicate models

### API Categories

1. PDF Processing (12 endpoints)
2. Document Management (13 endpoints)
3. Search APIs (8 endpoints)
4. Image Analysis (6 endpoints) - ✨ NEW: Re-classification
5. RAG System (7 endpoints)
6. Embeddings (3 endpoints)
7. Products (6 endpoints)
8. Admin & Monitoring (8 endpoints)
9. AI Services (11 endpoints)

---

## 🔗 External Resources

**API Documentation**:
- Swagger UI: `/docs`
- ReDoc: `/redoc`
- OpenAPI Schema: `/openapi.json`

**Dashboards**:
- Vercel: https://vercel.com/dashboard
- Supabase: https://app.supabase.com
- Server: SSH to v1api.materialshub.gr

**Repositories**:
- Frontend: https://github.com/creativeghq/material-kai-vision-platform
- Backend: https://github.com/creativeghq/mivaa-pdf-extractor

---

## 📝 Documentation Standards

All documentation follows these standards:

- Clear, concise language
- Code examples where applicable
- Structured with headers
- Links to related docs
- No task lists or planning documents
- Production-focused content
- Updated regularly

---

## Documentation Updates

**Last Updated**: April 2026
**Version**: 3.7.0
**Status**: Production
**Maintainer**: Development Team

**Recent Changes (2026-04-25):**
- ✨ **NEW**: **Modular Architecture** — platform now ships as 7 toggleable modules. Each module owns its routes/services/agents/admin-cards and is gated by a row in `public.modules`. Toggle from `/admin/modules`. Modules: `greek-marketplaces`, `crm`, `email`, `messaging`, `quotes`, `notifications`, `social-media`. See `.claude/plans/modular-architecture.md` + `.claude/plans/modules-extraction-roadmap.md`.
- ✨ **NEW**: `POST /api/v1/modules/_invalidate` — admin endpoint that drops MIVAA's enabled-flag cache so toggle changes propagate in ~1s. Documented in `api-master-reference.md` §2.1.
- ✨ **CHANGED**: Frontend module file paths — Email moved to `src/modules/email/`, Messaging to `src/modules/messaging/`, CRM to `src/modules/crm/`, Quotes to `src/modules/quotes/`, In-App Notifications panel to `src/modules/notifications/`, Social Media admin UI + the 11 KAI agent tools + 2 background agents to `src/modules/social-media/` and `supabase/functions/_shared/modules/social-media/`. Old paths under `src/services/email/`, `src/services/messaging/`, `src/components/Admin/{CRMManagement,EmailManagement,MessagingManagement,SocialMedia}/`, etc. are deleted.

**Recent Changes (2026-04):**
- ✨ **NEW**: AR Material Preview — WebXR + 3D swatch + PBR maps (`ar-material-preview.md`)
- ✨ **NEW**: Lighting Simulation — AI re-lighting + 3D PBR viewer (`lighting-simulation.md`)
- ✨ **NEW**: Pinterest Integration — Pin import + OAuth board browsing (`pinterest-integration.md`)
- ✨ **NEW**: Manufacturer Analytics — Enhanced tracking + tiered dashboard (`manufacturer-analytics.md`)
- ✨ **UPDATED**: Quotes System — FF&E specification fields for procurement workflows
- ✨ **UPDATED**: Features Guide — Added sections 28-31

**Previous Changes (2026-03):**
- ✨ **NEW**: Flow Engine — Visual workflow automation with triggers, conditions, actions (`flow-engine.md`)
- ✨ **NEW**: Interior Video Generation — 4 AI models: Veo-2, Kling v3, Wan 2.1, Runway Gen4 (`interior-video-generation.md`)
- ✨ **NEW**: Virtual Staging — Replicate proplabs room staging (`virtual-staging.md`)
- ✨ **NEW**: Region Editing — Grok Aurora masked inpainting + SAM 2 (`segmentation-inpainting.md`)
- ✨ **NEW**: Social Media Suite — Content/image/video + Late.dev publishing (see `social-media-system.md`)
- ✨ **NEW**: Background Agents — Scheduled autonomous agents with chain triggers (`background-agents.md`)
- ✨ **NEW**: Gemini Interior Generation — 4 modes including floor plan rendering
- ✨ **NEW**: AI Re-ranking — Claude post-retrieval result re-ordering (`ai-reranking.md`)
- ✨ **NEW**: Billing & Credits — Stripe subscriptions + credit packages (`billing-credits-system.md`)
- ✨ **NEW**: CRM System — Contacts, companies, users (`crm-system.md`)
- ✨ **UPDATED** (2026-02-19): Unified KAI Agent — Search + Insights + SEO merged
- ✨ **NEW** (2026-02-10): VR World Generation — WorldLabs Marble + Spark.js
- ✨ **UPDATED** (2026-02-07): halfvec migration — all vector columns float16
- ✨ **NEW**: Understanding embeddings, query-adaptive weight profiles, B2B web search

---

## 📞 Support

For questions or issues:
- Check **[troubleshooting-guide.md](troubleshooting-guide.md)**
- Review **[api-endpoints.md](api-endpoints.md)**
- Contact: support@materialkaivision.com
- GitHub Issues: https://github.com/creativeghq/material-kai-vision-platform/issues

---

**Total Documentation**: 55+ comprehensive guides
**Coverage**: All platform features
**Planning Documents**: /planning directory

**Documentation Categories**:
- 🎯 Getting Started: 18 guides (incl. new feature docs)
- 🏗️ Architecture & Design: 8 guides
- 🤖 AI & Processing: 9 guides
- 🔌 API Reference: 12 guides (incl. new API docs)
- 🚀 Deployment & Operations: 3 guides
- 📊 Monitoring & Analytics: 3 guides
- 💼 Business Features: 10 guides

