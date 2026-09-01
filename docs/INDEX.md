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
- Dynamic field mapping (Claude Opus 5)
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
- Unified concurrency limits
- Timeout configuration (300s discovery, 120s AI, 30s downloads)
- Rate limiting (circuit breaker on Claude; PaddleOCR-VL inference retry in the Modal endpoint manager)
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
- JARVIS agent tools for social content (captions, images, videos)
- Zernio OAuth integration for per-user platform connections
- Publishing, scheduling, analytics via Zernio API
- xAI Aurora / Gemini Flash / FLUX Dev image generation routing
- Multi-model interior video (Veo 2, Kling 1.6 Pro, Wan, Runway)
- Background agents for analytics sync
- Admin panel at /admin/social-media/*
- Deployment checklist + required secrets

**[flow-engine.md](flow-engine.md)** - Workflow Automation System ✨ NEW
- Visual drag-and-drop flow builder at `/admin/flows`
- Trigger types: cron, webhook, event, manual
- Condition nodes: if_else, switch, filter, delay
- Action nodes: send_whatsapp (WhatsApp via Zernio), send_email, http_request, notification, quote — `send_sms` is now a legacy alias for `send_whatsapp` (SMS removed 2026-06-08)
- Template variable resolution `{{trigger.data.field}}`
- Dry-run / test mode, execution logs

**[flows-notification-system.md](flows-notification-system.md)** - Flows engine for notifications, emails & automations (emit an event, never hardcode a send)

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
- Generated through JARVIS agent chat via `generate_presentation_sheet` tool (0/2/3 cr per type)
- Interactive types open canvas widgets in chat (CalloutCanvas, DimensionCanvas, FixtureSymbolCanvas)
- Persistent + editable: every sheet is a row in `moodboard_presentation_sheets` with JSONB `data`
- Sheets tab on every moodboard at `/moodboard/:id`

**[presentation-catalogs.md](presentation-catalogs.md)** - Presentation Catalogs ✨ NEW (2026-05-08)
- Admin-only catalog builder driven by 8 JARVIS tools: create / attach_pdfs / extract / translate / add_material / find_image / generate_pdf / publish
- Source PDFs uploaded to `pdf-documents/catalog-source/` (post 2026-05-23 consolidation); Sonnet 5 PDF Vision extracts sections + bbox per material
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

**[installed-base.md](installed-base.md)** - Installed base (customer equipment, warranties, recurring service) NEW (2026-08, #343)
- `customer_assets` + warranties + service plans; auto-registered from a delivered sales line
- No `next_due_on` anywhere: the next date IS the plan's single open occurrence
- Reminders emit `asset.service_due` / `asset.service_overdue` / `asset.warranty_expiring`

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
- Resend webhook integration for bounce/complaint handling (via `email-webhooks`, Svix signature)
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
- AI-powered dynamic extraction (Claude Opus 5 / GPT-4o)
- Complete field reference with examples
- API usage and frontend display
- Step-by-step extraction process
- Confidence scoring system
- Best practices and troubleshooting

### 🆕 New Features

**[real-estate-system.md](real-estate-system.md)** — Real Estate module ✨ NEW (2026-07)
- Listings, leads, viewings, offers, sales, buyer matching (both directions), deals pipeline, CMA
- Paid add-on with two sub-add-ons that mount extra tabs on the same route: **Property Management** (tenancies, rent schedules, maintenance, landlord statements, rent → draft invoice) and **Investments** (yield / ROI)
- Four personas (operator / broker / agent / member); ownership failures return **404**, never 403
- Public surface is a separate edge function: `/p/:token` listing page, `/buyer/:token` portal, cross-workspace discovery, and Kyero / OpenImmo / generic portal syndication
- Anonymous lead writes require GDPR consent and are capped at 8/hour/IP (hashed)
- API: [real-estate-system.md](real-estate-system.md)

**[seo-system.md](seo-system.md)** — SEO & Content ✨ NEW (2026-07)
- **Connected Websites** is the organising unit — GSC, Site Health, Rankings, research and articles all scope to a site
- Google Search Console with a server-side OAuth callback + full performance breakdown (device, country, appearance, trend)
- Site Health (on-page + Lighthouse-when-present) and weekly Rankings & Links snapshots
- Five content functions consolidated into one `seo-api`; inter-link suggestions inserted into the article

**[data-integrity-framework.md](data-integrity-framework.md)** — Data health ✨ NEW (2026-07)
- 16 nightly detect/heal checks across finance, tenancy, credits, CRM, security and ops; `/admin/data-health`
- `ops.silent_zero` catches the dominant failure here: a number that should be non-zero sitting at zero while nothing complains
- Janitor crons must ship with a probe on the mess they clear — an exit code proves it ran, not that it worked

**Platform audit playbook** — now **GitHub issue #314** (was `audit-playbook.md`, deleted 2026-08-04). Plans and specs live in issues, per CLAUDE.md.
- The method behind #293–#310 (~250 findings, 16 areas): find defects by CLASS, not by clicking
- The nine defect shapes every finding must sort into, each with its historical instance
- **The traps** — every way a measurement lied during that audit: `| tee` eating exit codes, semgrep rules that parse-fail and match nothing, `manualChunks` pinning a dep into the entry preload, `overflow-x-hidden` blinding scrollWidth, `.single()` over two rows falling back forever, grep counts (1,325) vs linter counts (407)
- Verification discipline: measure the artifact that decides, check the live system not the repo's intent, and retract wrong claims in place

**[prevention-coverage.md](prevention-coverage.md)** — Which defect shapes are actually guarded ✨ NEW (2026-08)
- The seven historical defect shapes, each mapped to its mechanism and the date that mechanism was last watched to fire
- Answers "is this guarded?" — not "is CI green?". Six guards in this platform have reported clean while enforcing nothing
- Only 3 of 8 mechanisms can prove they still detect; the rest of the gaps are listed in priority order

**[company-assets.md](company-assets.md)** — Company assets register ✨ NEW (2026-07)
- Fleet / phones / laptops / payment cards / equipment, one active holder each
- Leased & financed assets flow through the existing recurring-expense → supplier-bill machinery
- One shared panel mounted in **both** Finance and HR; no dedicated page

**[units-and-measures.md](units-and-measures.md)** — Canonical units ✨ NEW (2026-07)
- One vocabulary keyed to AADE `measurement_unit` codes, enforced by triggers on 10 tables
- Closed a live divergence: m² stored 4 ways, silently breaking marketplace price comparisons

**myAADE Module — Greek Business Registry (ΑΑΔΕ)** ✨ NEW (2026-05-24) — see `src/modules/myaade/README.md`
- Family of `myaade-*` edge functions wrapping ΑΑΔΕ web services (SOAP 1.2 + WS-Security)
- Today: `myaade-rgwspublic2` — Greek business lookup by ΑΦΜ. Auto-fills legal name, ΔΟΥ, ΚΑΔ, legal form, structured address into the Business profile
- Shared `_shared/aade/soap.ts` helpers: a new ΑΑΔΕ service is ~80 lines
- 90-day cache on `crm_companies.aade_data_at` + TAXISnet quota-aware
- Mounted in `BusinessSection.tsx` (Greek users) + admin overview at `/admin/modules/myaade`
- Secrets via `platform_secrets` (env-first → DB): `AADE_USERNAME`, `AADE_PASSWORD`, `AADE_AFM_CALLED_BY`

**Business Entity + Role Upgrade Requests** ✨ NEW (2026-05-23 / 24)
- Users pick **Solo** or **Business** in their profile (`user_profiles.entity_type`); Business entities are linked to a `crm_companies` row (`business_id`)
- "Apply for Dealer / Factory" card on the Subscription tab → opens a request, admin reviews on the user detail page → approve flips `user_profiles.role_id`
- `role_upgrade_requests` table + `role-upgrade-requests` edge function (submit / approve / reject) — emails admins + user, bell notifications
- VIES validation on every VAT entry (`vies-validate` edge function) — pre-fills name + address from EU VAT registry
- ΑΑΔΕ enrichment for Greek users (see myAADE above)
- Role `manager` removed (collapsed: user → dealer → factory → admin)

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

**[design-system.md](design-system.md)** - The full design system: tokens, surfaces, typography, primitives, the `hub/` pattern library, the three screen archetypes, and the image optimization helper. Live specimen sheet at `/design-system` in-app.

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

**[job-queue-system.md](job-queue-system.md)** - Job queue & async processing
- Supabase-native job queue architecture
- Checkpoint-based recovery system
- Auto-recovery for stuck jobs
- Real-time progress tracking
- Priority-based job processing
- Health monitoring & observability
- Single-table design: `background_jobs` with JSONB `stage_history` / `recovery_history` / `last_checkpoint` (the legacy `job_progress` + `job_checkpoints` tables were dropped 2026-04-25)
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

**[relevancy-system.md](relevancy-system.md)** - Search relevancy scoring & ranking system

**[supabase-types-automation.md](supabase-types-automation.md)** - Auto-generated Supabase TypeScript types workflow

**[platform-secrets.md](platform-secrets.md)** - Centralised external-key store (`platform_secrets`, env-first → DB resolution, per-module Settings pages)

**[per-workspace-byok.md](per-workspace-byok.md)** - Per-tenant bring-your-own-key credentials (AADE, myDATA REST, Resend email) under Profile → Keys

---

### 🤖 AI & Processing

**[ai-models-guide.md](ai-models-guide.md)** - AI models integration
- Anthropic: Claude Opus 5 (vision via tool use, agent turns), Sonnet 5 (`Settings.chunking_primary_model`), Haiku 4.5 (classifiers, rerank, semantic chunking)
- Voyage AI: voyage-4 (sole text + understanding embedder, 1024D)
- Modal: PaddleOCR-VL 1.6 (0.9B, PP-DocLayoutV2 detector + VLM) — layout + OCR backbone, structure-first
- Modal: SLIG SigLIP2 (5 visual embedding types, 768D each — `siglip2-base-patch16-512`, native 768D; migrated off HuggingFace 2026-06-14, so HuggingFace now hosts nothing)
- OpenAI: GPT-4o, GPT-5 (optional alternatives — NOT vision)
- WorldLabs Marble: 3D Gaussian Splat generation
- PaddleOCR-VL replaced Surya-2 (2026-06-13), which had replaced YOLO + Chandra;
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

**[agent-and-tools-reference.md](agent-and-tools-reference.md)** - Reference for the JARVIS agents and their tool surfaces

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
- **Stage 1: PaddleOCR-VL layout + OCR pass (structure-first, BEFORE discovery)** — PP-DocLayoutV2 localizes/labels regions + predicts reading order; the 0.9B VLM recognizes content (text, tables→markdown, formulas→LaTeX). Persists `document_layout_analysis` rows (`processing_version="paddleocr-vl"`); tables preserved as markdown/HTML
- Stage 0A: Product Discovery — reads reading-order text from the PaddleOCR layout cache (not raw `page.get_text()`)
- Stage 0B: Document Entity Discovery - Certificates, Logos, Specs
- Stage 2: Text Extraction / Chunking — reads the same PaddleOCR layout cache
- Stage 3: Image Extraction — product crops sourced from PaddleOCR `IMAGE`/`FIGURE`/`chart` regions
- Stage 4: Product Creation
- Stage 5: Entity Linking
- Stage 6: AI Classification — Claude Opus 5 via Anthropic tool use
- Stage 7: SLIG Embeddings — SigLIP2 cloud endpoint, 5×768D specialized
- Stage 8: Vision Analysis — Claude Opus 5 schema-locked via `VisionAnalysis` Pydantic + `VISION_ANALYSIS_TOOL`
- **Structure-first chunking** ✨
  - Uses the PaddleOCR-VL layout cache for intelligent chunking
  - Respects region boundaries
  - Combines TITLE + TEXT
  - Keeps tables intact
  - Preserves model-predicted reading order
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
- Hire Me flow → an Inbox thread tagged `source: public_profile` + a `hire_me_received` flow event
- Social: follow/unfollow, profile views, moodboard comments
- DB tables: `user_profiles`, `user_follows` (enquiries live in `inbox_threads`, not a table of their own)

**[email-system.md](email-system.md)** - Email system with Resend (migrated 2026-03-11)
- Domain verification and management
- React Email template system
- Delivery tracking and analytics
- Bounce and complaint handling
- Resend webhook integration via `email-webhooks` (Svix signature verification)
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

**[finance-system.md](finance-system.md)** - Greek e-invoicing & AR/AP ✨ NEW (2026-06)
- Multi-tenant AADE/myDATA transmission via the Novus connector
- Invoices, credit notes (5.1/5.2), delivery notes (9.3), retail receipts (11.1)
- Inbound `RequestDocs` sync, supplier bills + credit notes
- Reports: VAT (ΦΠΑ), myDATA reconciliation, ledgers (καρτέλα), accounting export (γέφυρες)
- Replaced a removed legacy ERP connector

**[orders-system.md](orders-system.md)** - Orders (sales & purchase hub) ✨ NEW (2026-06)
- Sales/purchase orders tie quotes, invoices, payments/receipts, dispatch, products & profit together
- Accepted quote → order + draft pre-invoice; POS sale → order; payment_status + profit per order
- First Finance → Documents tab; replaces the per-doc tabs on the CRM company page

**[deals-pipeline.md](deals-pipeline.md)** - Deals & pipeline ✨ NEW (2026-08)
- One deal object across CRM and Real Estate; tenant-defined deal types, each owning its own stage set
- A composite FK on `(deal_type_id, stage)` makes "a construction deal cannot sit in Conveyancing" a database guarantee
- `get_deal_forecast` derives the weighted pipeline in SQL, grouped by currency; TypeScript only formats it

**[sourcing-fulfillment.md](sourcing-fulfillment.md)** - Sourcing & Fulfillment spine ✨ NEW (2026-06)
- `stock_allocations` lifecycle ledger (demand → warehouse|PO → reserved-to-customer); `supplier_products` cost tier; `warehouse_coverage` ship-from routing
- resolve → commit (draft POs) → send-to-supplier (PDF+email) → receive (reserve) → Finance Sourcing board; `purchase_order.sent/.received` Flows triggers
- Built on `orders(order_type='purchase')`; legacy `purchase_orders` tables retired
- KAI sourcing tools + `/admin/monitoring` shell + market-intel on quotes; marketplace sourcing (inquiry→accept→materialize)
- **Workstream F** — global supplier identity (`platform_suppliers`) + operator-gated claim (`/admin/supplier-claims`) + supplier portal (`/supplier-portal`) + ERP API ([supplier-orders-api](supplier-orders-api.md))

**[pos-retail-system.md](pos-retail-system.md)** - POS / retail ✨ NEW (2026-06)
- vPOS shifts + cash drawer + X/Z reports; Law 5155 card/IRIS signature flow; EFT-POS registry; thermal receipt

**[online-storefront.md](online-storefront.md)** - Public `/store/:slug` ✨ NEW (2026-06)
- Anonymous catalog → cart → Stripe Connect checkout → draft receipt; platform revenue model (#200)

**[warehouse-and-billing.md](warehouse-and-billing.md)** - Inventory & billing ✨ NEW (2026-06)
- Multi-warehouse stock + transfers + inbound intake; time-tracking → invoice; project → invoice (full/progress/milestone)

**[units-and-quantity-pricing.md](units-and-quantity-pricing.md)** - UOM ladder & price breaks ✨ NEW (2026-08)
- m²/piece/box/pallet conversion derived in SQL; quantity discounts inside the one price resolver; the "missing factor is not 1:1" rule

**[ontology-layer.md](ontology-layer.md)** - Typed concepts & governed term bindings ✨ NEW (2026-08)
- Source term → enterprise concept with epistemic status, confidence, evidence and provenance; one home for confirmed vocabulary and one for everything still in question; AI proposes, a human confirms

**[taric-customs-classification.md](taric-customs-classification.md)** - EU commodity codes ✨ NEW (2026-08)
- TARIC nomenclature import, code picker + validation, supplier-code/LLM classification; the July 2026 €3-per-sub-heading rule

**[sales-and-marketplace.md](sales-and-marketplace.md)** - B2B surfaces ✨ NEW (2026-06)
- Sales rep portal (#201); supplier→factory catalog access (#196); procurement routing inbox (#177)

**[capabilities-and-tenancy.md](capabilities-and-tenancy.md)** - Authorization backbone ✨ NEW (2026-06)
- 7 personas × 15 capabilities matrix; `usePermissions`/`CapabilityGuard`
- Module entitlements (#212); workspace tenancy, hierarchy & guard RPCs

**[role-access-matrix.md](role-access-matrix.md)** - Role → feature/route access matrix

**[user-levels-access.md](user-levels-access.md)** - User levels (solo / dealer / factory / admin) and what each can access

**[data-retention-policy.md](data-retention-policy.md)** - Data retention & cleanup policy across tables and storage

**[payments.md](payments.md)** - Payments overview (credits, subscriptions, checkout)

**[payments-stripe.md](payments-stripe.md)** - Stripe integration reference (checkout, portal, webhooks, Connect)

**[banking-revolut.md](banking-revolut.md)** - Revolut Business ✨ NEW (2026-08) — per-workspace BYOK bank feed, per-leg reconciliation into invoices/supplier bills, drafts/payouts/FX, virtual cards & expense import

**[hr-system.md](hr-system.md)** - HR module ✨ NEW (2026-07) — first paid tenant add-on; employees as tagged `crm_contacts` + `hr_employees`/`hr_absences`, gated `hr-api`

**[contracts-system.md](contracts-system.md)** - Contracts & e-signature ✨ NEW (2026-07) — one entity across `hr`/`finance`/`project` contexts, public `/sign/:token` page, context-branched RLS

**[blueprint-estimating.md](blueprint-estimating.md)** - Blueprint estimating & project plans ✨ NEW (2026-07) — parametric formula-driven templates → priced plans → quotes, plus the public `/tools/project-plan` estimator

**[inbox-system.md](inbox-system.md)** - Multi-tenant Inbox ✨ NEW — unified customer conversation inbox with agent takeover

**[email-marketing.md](email-marketing.md)** - Email Marketing add-on ✨ NEW (2026-07) — tenant GrapesJS campaigns, Resend BYOK, workspace-scoped

**[storage-buckets.md](storage-buckets.md)** - Storage buckets ✨ NEW (2026-07) — the 6-bucket map, path routing, privacy model, and GC-based cleanup wiring

**[mention-monitoring-system.md](mention-monitoring-system.md)** - Mention monitoring ✨ NEW (2026-07) — news/blog/RSS/YouTube discovery + LLM visibility probes, classifier + cadence pipeline

**[page-monitoring.md](page-monitoring.md)** - Page monitoring ✨ NEW (2026-08) — change detection on non-price pages (supplier terms, regulatory, partner docs) delegated to Firecrawl Monitoring; the unsigned-webhook boundary

**[job-research-system.md](job-research-system.md)** - Job research ✨ NEW (2026-07) — job-discovery agent, consolidated digests, v0.1 → v0.3.5 history

**[workspace-shared-credits.md](workspace-shared-credits.md)** - Workspace shared credits ✨ NEW (2026-07) — pooled credits (owner funds, members draw with optional per-member caps)

**[trip-expense-cards.md](trip-expense-cards.md)** - Trip/expense cards & customer AR aging ✨ NEW (2026-06)
- Expense cards with per-line finance approval + reimbursement→planned_payment; receipts via `trip-expense-ops`; JARVIS tools
- `vw_customer_aging_buckets` (not_due / 0–30 / 31–90 / 90+) across the finance Parties views

**[surplus-marketplace.md](surplus-marketplace.md)** - 0%-commission last-stock marketplace (#219) ✨ NEW (2026-06)
- Cross-tenant `marketplace_listings` browse under Discover (first read-across-workspaces RLS surface)
- Buyer inquiry bridged into the seller's Inbox; want-list alerts; warehouse-sourced listings + expiry cron

**[ai-assessment.md](ai-assessment.md)** - AI Assessment ✨ NEW (2026-09) — three paid modules over ONE system: projects, the books, and property listings
- `assessments.subject_type` — one table, one claim, one scorer; 38 / 21 / 18 signals across six dimensions per subject, all derived in SQL
- Every signal is a value or a stated reason there is none — a dimension nothing could judge scores `null` and renders "Not judged", never 0
- Ranked actions become real `project_tasks` rows (claim-then-create, so a retry cannot cut two); finance and property actions refuse with a reason rather than pretend

**[purchase-items-doors-windows.md](purchase-items-doors-windows.md)** - Project purchase items (doors/windows) ✨ NEW (2026-06)
- `project_purchase_items` + `generate-purchase-sheet-pdf` (schedule / per-item spec sheets with door-swing & window glyphs)
- Quote-referenced (not PO); frontend/agent wiring still pending

---

### 🔌 API Reference

**[api-master-reference.md](api-master-reference.md)** ✨ **START HERE** — Single-page master index covering **all 132 Supabase edge functions + MIVAA Python endpoints**. Auth models, categories (AI agents / generation / real estate / SEO / KB / CRM / finance / stock / messaging / social / pinterest / scraping / flows / crons / admin), and standard call patterns. The edge-function index is regenerated from `scripts/edge-endpoints.json` so it cannot drift from the OpenAPI spec.

**Partner-facing API guides** — the surfaces an OpenAPI spec cannot express (auth recipes, credit debits, permission locks, error codes, FAQ): [agent-chat-partner-api.md](agent-chat-partner-api.md), [price-monitoring-api.md](price-monitoring-api.md), [price-monitoring-v3-partner-update.md](price-monitoring-v3-partner-update.md), [mention-monitoring-api.md](mention-monitoring-api.md), [job-research-api.md](job-research-api.md), [projects-api.md](projects-api.md), [supplier-orders-api.md](supplier-orders-api.md), [public-tools-api.md](public-tools-api.md). Plus [slig-inference.md](slig-inference.md) — the Modal SLIG service, a third runtime in neither spec. (The old `docs/api/` per-function folder was removed: it duplicated the generated spec and had drifted to advertising 5 deleted Pinterest actions while missing 115 live ones.)

**[../public/api/openapi-edge.json](../public/api/openapi-edge.json)** — machine-readable OpenAPI 3.0.3 for **all 132** edge functions (584 documented actions); Swagger UI at [`/api/edge-swagger.html`](../public/api/edge-swagger.html). A CI guard ([`tests/unit/edgeEndpointsCoverage.test.ts`](../tests/unit/edgeEndpointsCoverage.test.ts)) fails the build when a function exists without a spec entry, or a spec entry without a function.

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
- Model Endpoint Routes (SLIG SigLIP2 visual embeddings on Modal; layout + OCR is PaddleOCR-VL on Modal — both GPU endpoints are Modal-hosted as of 2026-06-14)
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

**[monitoring-and-alerting.md](monitoring-and-alerting.md)** - Monitoring & alerting (Sentry, health checks, cron/alert wiring)

**[unified-job-tracking.md](unified-job-tracking.md)** - Single-table job tracking (`background_jobs` + JSONB stage/recovery history)

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
- **20+** AI models across 8 providers (Anthropic, OpenAI, Voyage AI, Modal, WorldLabs, Replicate, Google Gemini, xAI)
- **14** processing pipeline stages
- **170+** API endpoints (20 categories)
- **60+** Supabase Edge Functions
- **7** embedding types with dynamic weight profiles (halfvec float16 storage)
- **3** active agents: JARVIS (unified), Interior Designer, Demo
- **6** background agent types
- **200+** metafield types
- **95%+** product detection accuracy
- **85%+** search relevance
- **90%+** material recognition accuracy

### Technology Stack

**Frontend**: React 18, TypeScript, Vite, Shadcn/ui, Vercel
**Backend**: FastAPI, Python 3.11, Uvicorn, self-hosted
**Database**: PostgreSQL 15 + pgvector 0.8.0 (halfvec), Supabase
**AI**: Claude (Opus 5 vision tool use + Sonnet 5 chunking + Haiku 4.5 classifiers), Voyage AI (voyage-4 sole text + understanding embedder), PaddleOCR-VL 1.6 (Modal — layout + OCR backbone), SLIG SigLIP2 (Modal, 5×768D visual), GPT-4o/GPT-5 (optional alternatives — not vision), WorldLabs Marble, Google Gemini, xAI Aurora (Grok), Kling, Replicate models

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

**Last Updated**: 29 July 2026
**Version**: 3.9.0
**Status**: Production
**Maintainer**: Development Team

**Recent Changes (2026-07-29):**
- ✨ **NEW**: [real-estate-system.md](real-estate-system.md) + [real-estate-system.md](real-estate-system.md) — the Real Estate module and its two paid sub-modules
- ✨ **NEW**: [seo-system.md](seo-system.md) — Connected Websites, Google Search Console, Site Health, Rankings & Links
- ✨ **NEW**: [data-integrity-framework.md](data-integrity-framework.md) — the nightly detect/heal registry and the silent-zero probe
- ✨ **NEW**: [company-assets.md](company-assets.md), [units-and-measures.md](units-and-measures.md)
- ✨ **UPDATED**: OpenAPI edge spec now covers **all 107** edge functions (was 98). `KNOWN_UNDOCUMENTED` is empty and the CI parity guard keeps it there
- ✨ **NEW**: public [`/changelog`](https://app.materialshub.gr/changelog) page, backed by `changelog_entries`

**Recent Changes (2026-04-25):**
- ✨ **NEW**: **Modular Architecture** — platform now ships as 7 toggleable modules. Each module owns its routes/services/agents/admin-cards and is gated by a row in `public.modules`. Toggle from `/admin/modules`. Modules: `greek-marketplaces`, `crm`, `email`, `messaging`, `quotes`, `notifications`, `social-media`. See `.claude/plans/modular-architecture.md` + `.claude/plans/modules-extraction-roadmap.md`.
- ✨ **NEW**: `POST /api/v1/modules/_invalidate` — admin endpoint that drops MIVAA's enabled-flag cache so toggle changes propagate in ~1s. Documented in `api-master-reference.md` §2.1.
- ✨ **CHANGED**: Frontend module file paths — Email moved to `src/modules/email/`, Messaging to `src/modules/messaging/`, CRM to `src/modules/crm/`, Quotes to `src/modules/quotes/`, In-App Notifications panel to `src/modules/notifications/`, Social Media admin UI + the 11 JARVIS agent tools + 2 background agents to `src/modules/social-media/` and `supabase/functions/_shared/modules/social-media/`. Old paths under `src/services/email/`, `src/services/messaging/`, `src/components/Admin/{CRMManagement,EmailManagement,MessagingManagement,SocialMedia}/`, etc. are deleted.

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
- ✨ **NEW**: Social Media Suite — Content/image/video + Zernio publishing (see `social-media-system.md`)
- ✨ **NEW**: Background Agents — Scheduled autonomous agents with chain triggers (`background-agents.md`)
- ✨ **NEW**: Gemini Interior Generation — 4 modes including floor plan rendering
- ✨ **NEW**: AI Re-ranking — Claude post-retrieval result re-ordering (`ai-reranking.md`)
- ✨ **NEW**: Billing & Credits — Stripe subscriptions + credit packages (`billing-credits-system.md`)
- ✨ **NEW**: CRM System — Contacts, companies, users (`crm-system.md`)
- ✨ **UPDATED** (2026-02-19): Unified JARVIS Agent — Search + Insights + SEO merged
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

