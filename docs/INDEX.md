# Documentation Index

Complete documentation for Material Kai Vision Platform.

---

## 📚 Documentation Structure

### 🎯 Getting Started

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

**[platform-flows.md](platform-flows.md)** - User workflows & feature flows ✨ NEW
- PDF Processing Flow
- Search & Discovery Flow
- Spatial Analysis Flow (Spaceformer)
- Data Import Flow
- 3D Generation Flow
- Knowledge Base Flow
- Agent Chat Flow

**[duplicate-detection-merging.md](duplicate-detection-merging.md)** - Duplicate detection system
- Factory-based duplicate detection
- Product merging with undo
- Similarity scoring
- Merge history tracking
- API endpoints (7 total)

**[data-import-system.md](data-import-system.md)** - Data import system ✨ NEW
- XML import with AI-powered field mapping
- Dynamic field mapping (Claude Sonnet 4.5)
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
- Unified concurrency limits (5 TogetherAI (Qwen), 2 Claude, 10 uploads, 20 CLIP)
- Timeout configuration (300s discovery, 120s AI, 30s downloads)
- Rate limiting (10 req/min TogetherAI, circuit breaker Claude)
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

**[vr-world-generation.md](vr-world-generation.md)** - VR World generation with WorldLabs Marble
- WorldLabs Marble API integration (mini + plus models)
- Spark.js Gaussian Splat renderer (code-split, ~496KB)
- Orbit + First-person (WASD) navigation with toggle
- 3 quality levels (100k/500k/full SPZ)
- Credit-based pricing (50 mini, 200 plus) with refund on failure
- Edge function orchestration (upload → generate → poll → store)
- WorldViewer component with adaptive status polling
- Integrated into agent chat via DesignCanvas "Generate VR" button

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
- AI-powered dynamic extraction (Claude Sonnet 4.5 / GPT-4o)
- Complete field reference with examples
- API usage and frontend display
- Step-by-step extraction process
- Confidence scoring system
- Best practices and troubleshooting

---

### 🏗️ Architecture & Design

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
- 8 AI models across 4 providers
- Anthropic: Claude Sonnet 4.5, Claude Haiku 4.5
- OpenAI: GPT-4o, GPT-5, text-embedding-3-small
- Google: SigLIP ViT-SO400M (primary CLIP)
- TogetherAI: Qwen3-VL 17B Vision
- OpenAI CLIP ViT-B/32 (fallback)
- 6 embedding types (text, visual, color, texture, style, material)
- Model usage by pipeline stage
- Cost optimization
- API keys & configuration
- Performance benchmarks

**[agent-system.md](agent-system.md)** - AI Agent system architecture
- Database-driven agent prompts
- 4 specialized agents (Search, Insights, Interior Designer, Demo)
- B2B research tools: manufacturer search, company enrichment, contact discovery, email validation
- Email finder: Hunter.io + Apollo.io fallback, ZeroBounce validation on all discovered emails
- Admin UI for prompt management (/admin/agent-configs)
- LangChain.js tool orchestration
- Real-time prompt updates (no deployment needed)
- Role-based access control
- Agent monitoring and analytics
- Best practices and troubleshooting

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
- Stage 6: AI Classification (70-75%)
- Stage 7: CLIP Embeddings (75-85%)
- Stage 8: Qwen Vision Analysis (85-90%)
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

**[api-endpoints.md](api-endpoints.md)** - Complete API reference
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
- Together AI Routes (3 endpoints)
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
- **8** AI models across 4 providers
- **14** processing pipeline stages
- **114** API endpoints (14 categories)
- **7** embedding types with dynamic weight profiles
- **200+** metafield types
- **95%+** product detection accuracy
- **85%+** search relevance
- **90%+** material recognition accuracy

### Technology Stack

**Frontend**: React 18, TypeScript, Vite, Shadcn/ui, Vercel  
**Backend**: FastAPI, Python 3.11, Uvicorn, self-hosted  
**Database**: PostgreSQL 15, pgvector, Supabase  
**AI**: Claude 4.5, GPT-4o, Qwen3-VL, SigLIP, Voyage AI, Multi-Vector CLIP

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

**Last Updated**: February 12, 2026
**Version**: 3.1.0
**Status**: Production
**Maintainer**: Development Team

**Recent Changes:**
- ✨ **NEW**: Query-Adaptive Weight Profiles - Dynamic 7-vector search weights selected per query intent (product_name, color_finish, specification, texture_pattern, style_aesthetic, material_search, balanced)
- ✨ **NEW**: Frontend Code Splitting - React.lazy() on 60+ routes, main chunk reduced from 2,754KB to 221KB (-92%)
- ✨ **NEW**: Web Scraping Integration - Complete Firecrawl integration with AI product discovery
- ✨ **NEW**: Spaceformer Spatial Analysis - AI-powered room layout optimization
- ✨ **NEW**: Price Monitoring System - Competitive price tracking with alerts
- ✨ **NEW**: Saved Searches Deduplication - AI-powered search management
- ✨ **NEW**: VR World Generation - WorldLabs Marble + Spark.js 3D viewer integration
- ✨ **NEW**: Interior Design Generation - 14 AI models for interior design
- ✨ **NEW**: Internal Credit System - Credit-based billing for AI operations
- ✨ Updated API endpoint count to 150+ across 16 categories
- ✨ Added 10+ new database tables for new features
- ✨ Documented async processing architecture across all methods
- ✨ Added production hardening documentation (source tracking, heartbeat, Sentry)
- ✨ Updated README.md and CHANGELOG.md with comprehensive feature list
- ✨ Enhanced performance metrics with multi-source processing
- ✨ Documented 12+ AI models across 4 providers
- Previous: Campaign system, multi-vector search, monitoring & analytics

---

## 📞 Support

For questions or issues:
- Check **[troubleshooting-guide.md](troubleshooting-guide.md)**
- Review **[api-endpoints.md](api-endpoints.md)**
- Contact: support@materialkaivision.com
- GitHub Issues: https://github.com/creativeghq/material-kai-vision-platform/issues

---

**Total Documentation**: 40 comprehensive guides
**Total Lines**: 13,000+
**Coverage**: 100% of platform features
**Planning Documents**: 10 files in /planning directory

**Documentation Categories**:
- 🎯 Getting Started: 8 guides
- 🏗️ Architecture & Design: 8 guides
- 🤖 AI & Processing: 9 guides
- 🔌 API Reference: 3 guides
- 🚀 Deployment & Operations: 3 guides
- 📊 Monitoring & Analytics: 3 guides
- 💼 Business Features: 6 guides (Email System, Campaign System, Quotes System)

