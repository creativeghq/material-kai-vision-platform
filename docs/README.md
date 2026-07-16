# Material Kai Vision Platform - Documentation

**AI-Powered Material Intelligence System**

> Production-grade platform serving 5,000+ users with 99.5%+ uptime. Transforms material catalog PDFs into searchable knowledge using 12 AI models across a 14-stage processing pipeline.

---

## 📚 Documentation

### 🎯 Start Here

**[INDEX.md](INDEX.md)** - Complete documentation index with learning paths
**[overview.md](overview.md)** - Platform overview and key features

### 📖 Core Documentation

**[overview.md](overview.md)** - Complete platform overview
- Executive summary with key metrics
- Architecture overview
- AI models integration (8 models across 4 providers)
- 14-stage PDF processing pipeline
- Multi-modal search capabilities
- Database architecture
- Production metrics

**[system-architecture.md](system-architecture.md)** - System architecture & design
- Three-tier architecture
- Hybrid architecture pattern
- Technology stack
- Authentication & security
- API endpoints (115)
- Scalability & monitoring

**[duplicate-detection-merging.md](duplicate-detection-merging.md)** - Duplicate detection & merging
- Factory-based duplicate detection
- Product merging with undo capability
- Similarity scoring algorithm
- Merge history tracking
- 7 API endpoints
- Database schema

**[data-import-system.md](data-import-system.md)** - Data import system ✨ NEW
- XML import with AI-powered field mapping
- Dynamic field mapping (Claude Opus 4.7)
- Batch processing (10 products at a time)
- Concurrent image downloads (5 parallel)
- Cron-based scheduling for recurring imports
- Manual re-run functionality
- Checkpoint recovery
- Real-time progress tracking
- 4 API endpoints
- Phase 1 & 2 complete

**[ai-models-guide.md](ai-models-guide.md)** - AI models reference
- Anthropic: Claude Opus 4.7 (vision via tool use), Sonnet 4.6 (chunking), Haiku 4.5 (classifiers)
- Voyage AI: voyage-4 (sole text + understanding embedder, 1024D)
- Modal: PaddleOCR-VL 1.6 (0.9B, PP-DocLayoutV2 detector + VLM) — layout + OCR backbone, structure-first
- Modal: SLIG SigLIP2 (768D visual, 5 specialized types — `siglip2-base-patch16-512`, native 768D; migrated off HuggingFace 2026-06-14, so HuggingFace now hosts nothing)
- OpenAI: GPT-4o, GPT-5 (optional alternatives — NOT vision)
- WorldLabs Marble: 3D Gaussian Splat generation
- PaddleOCR-VL replaced Surya-2 (2026-06-13), which had replaced YOLO + Chandra; Qwen vision retired 2026-05-01
- Model usage by stage
- Cost optimization

**[agent-system.md](agent-system.md)** - AI Agent system ✨ NEW
- Database-driven agent prompts
- 3 specialized agents (PDF Processor, Search, Product)
- Admin UI for prompt management
- LangChain.js tool orchestration
- Real-time updates (no deployment)
- Role-based access control
- Best practices & troubleshooting

**[search-strategies.md](search-strategies.md)** - Search system guide
- 6 search strategies (100% complete)
- Semantic, Vector, Multi-Vector, Hybrid, Material, Image
- All strategies combined mode
- Performance metrics (<800ms for all)
- Database schema and indexes
- Usage examples and best practices

**[comprehensive-metadata-fields-guide.md](comprehensive-metadata-fields-guide.md)** - Comprehensive metadata fields guide ✨ NEW
- 200+ metadata fields across 9 categories
- Material Properties, Dimensions, Appearance, Performance
- Application, Compliance, Design, Manufacturing, Commercial
- AI-powered dynamic extraction (Claude/GPT)
- Complete field reference with examples
- API usage and frontend display
- Step-by-step extraction process
- Confidence scoring system
- Best practices and troubleshooting

**[pdf-processing-pipeline.md](pdf-processing-pipeline.md)** - PDF processing pipeline
- 14-stage pipeline breakdown
- Products + Metadata extraction (inseparable)
- Document entities (certificates, logos, specs)
- Stage-by-stage details
- Checkpoint recovery (9 checkpoints)
- Performance metrics
- API endpoint

**[api-endpoints.md](api-endpoints.md)** - API reference
- 119 endpoints across 16 categories
- RAG Routes (27)
- Admin Routes (18)
- Search Routes (6)
- Document Entities Routes (5)
- Products Routes (3)
- Images Routes (5)
- Embeddings Routes (3)
- AI Services Routes (10)
- Background Jobs (7)
- Model Endpoint Routes (SLIG SigLIP2 visual embeddings on Modal; layout + OCR is PaddleOCR-VL on Modal — both GPU endpoints are Modal-hosted as of 2026-06-14)
- Anthropic Routes (3)
- Monitoring Routes (3)
- AI Metrics Routes (2)
- Duplicate Detection Routes (7)
- Data Import Routes (4) ✨ NEW

**[relevancy-system.md](relevancy-system.md)** - Relevancy & entity linking
- Chunk → Product relationships
- Product → Image relationships
- Chunk → Image relationships
- Relevance scoring algorithms (3 algorithms)
- Relationship types and priorities
- Implementation details
- Best practices

**[job-queue-system.md](job-queue-system.md)** - Job queue & async processing
- Supabase-native job queue
- Checkpoint-based recovery
- Auto-recovery for stuck jobs
- Real-time progress tracking
- Priority queuing
- Health monitoring

**[monitoring-analytics-system.md](monitoring-analytics-system.md)** - Monitoring & analytics ✨ NEW
- Real-time PDF processing monitor
- Comprehensive analytics dashboard
- AI model usage and cost tracking
- Search analytics and query patterns
- Agent chat analytics
- System performance metrics
- Sentry integration
- 9 checkpoint stages with full metrics
- Real-time updates via Supabase subscriptions

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
- Complete workflow documentation

**[quotes-system-architecture.md](quotes-system-architecture.md)** - Quotes management system
- Multiple independent quotes per user
- Custom requests and product quotes
- Status tags and timeline tracking
- Upsells/extras management
- Quote acceptance workflow
- Admin management interface

**[features-guide.md](features-guide.md)** - Platform features
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
- Security features

**[deployment-guide.md](deployment-guide.md)** - Production deployment
- Deployment architecture
- Frontend (Vercel)
- Backend (Self-hosted)
- Database (Supabase)
- CI/CD pipeline
- Secrets management
- Monitoring & alerts
- Rollback procedures

**[supabase-types-automation.md](supabase-types-automation.md)** - Supabase types automation
- Automated TypeScript type generation
- GitHub Actions integration
- Weekly scheduled updates
- Type validation scripts
- Manual generation commands
- Setup instructions

**[troubleshooting-guide.md](troubleshooting-guide.md)** - Common issues & solutions
- Critical issues (API down, database, OOM)
- Common issues (PDF processing, search, latency, auth)
- Performance optimization
- Support resources

**[product-discovery-architecture.md](product-discovery-architecture.md)** - Product discovery system
- Products + Metadata architecture (inseparable)
- Document entities (certificates, logos, specifications)
- Factory/group identification for agentic queries
- Product-document relationships
- API endpoints for entity management
- Future extensibility (marketing, bank statements)

**[metadata-management-system.md](metadata-management-system.md)** - Metadata management system
- Dynamic metadata extraction (250+ attributes)
- Scope detection (product-specific vs catalog-general)
- Implicit catalog-general metadata detection
- Override logic and processing order
- Metadata API endpoints
- Integration with PDF processing pipeline

**[prompt-enhancement-system.md](prompt-enhancement-system.md)** - Dynamic prompt system ✨ NEW
- Database-driven extraction prompts (extraction_prompts table)
- Custom vs default prompt priority (is_custom flag)
- Version control and workspace isolation
- 4 stages: discovery, chunking, image_analysis, entity_creation
- 4 categories: products, certificates, logos, specifications
- Automatic placeholder replacement
- Phase 1 complete (metadata extraction), Phases 2-4 pending

---

### 💶 Business, Finance & Tenancy ✨ NEW (2026-06)

The multi-tenant business suite (#207/#208/#185/#206/#201/#196/#195/#212/#174/#194). **Tenant = workspace.**

**[contracts-system.md](contracts-system.md)** — Contracts & e-signature ✨ NEW
- One entity, three contexts (`hr` | `finance` | `project`) — context branches the RLS
- Public `/sign/:token` page (no account); allowlisted writes, user-context client
- `contract_signed` flow event; `contract_signatures` captures ip/user-agent as the audit record

**[blueprint-estimating.md](blueprint-estimating.md)** — Blueprint estimating & project plans ✨ NEW
- Parametric templates + safe formula evaluator → priced plan trees → quotes
- `project-plan-engine` is the ONLY writer of persisted plan money
- Public anonymous estimator at `/tools/project-plan` (Turnstile + shared 2/day IP quota)

**[finance-system.md](finance-system.md)** — Greek e-invoicing core
- AADE/myDATA via the **Novus** connector (master-key model, per-tenant issuer VAT)
- Issue → series/AA allocation → transmit → MARK / offline-recovery state machine
- Inbound `RequestDocs` sync, customer + supplier credit notes
- Reports: VAT analysis (ΦΠΑ), myDATA reconciliation, ledgers (καρτέλα), accounting export bridges (γέφυρες CSV)
- 9 `finance-*` edge functions; replaced a removed legacy ERP connector

**[pos-retail-system.md](pos-retail-system.md)** — POS / retail
- myDATA `11.1` retail receipts; cloud vPOS shifts + cash drawer + X/Z reports
- Law 5155 card/IRIS two-phase signature flow + EFT-POS terminal registry; thermal receipt

**[online-storefront.md](online-storefront.md)** — public `/store/:slug`
- Anonymous catalog → cart → Stripe Connect checkout → draft `11.1` receipt
- Platform revenue model (#200): separate billing Stripe account, destination charges

**[warehouse-and-billing.md](warehouse-and-billing.md)** — inventory & billing
- Multi-warehouse stock, transfers, intake from inbound myDATA
- Time-tracking → draft invoice; project → invoice (full / progress / milestone / final)

**[sales-and-marketplace.md](sales-and-marketplace.md)** — B2B surfaces
- Sales rep portal (#201); supplier→factory catalog access (#196); procurement routing inbox (#177)

**[capabilities-and-tenancy.md](capabilities-and-tenancy.md)** — authorization backbone
- 7 personas × 15 capabilities matrix + `usePermissions()` + `CapabilityGuard`
- Module entitlements (#212): `is_workspace_entitled`, `EntitlementGuard`, plan/grant pathways
- Workspace tenancy: signup→own-workspace, hierarchy, `assert_workspace_member` guard RPCs

**[api/finance-api.md](api/finance-api.md)** — `finance-*` edge function reference

---

## 🎓 Learning Paths

### For New Developers
1. [overview.md](overview.md) - Understand the platform
2. [system-architecture.md](system-architecture.md) - Learn the architecture
3. [pdf-processing-pipeline.md](pdf-processing-pipeline.md) - Understand the pipeline
4. [agent-system.md](agent-system.md) - Learn the AI agent system
5. [job-queue-system.md](job-queue-system.md) - Learn async job processing
6. [api-endpoints.md](api-endpoints.md) - Learn the API
7. [deployment-guide.md](deployment-guide.md) - Understand deployment

### For API Integration
1. [api-endpoints.md](api-endpoints.md) - All endpoints
2. [ai-models-guide.md](ai-models-guide.md) - AI models used
3. [system-architecture.md](system-architecture.md) - Authentication

### For Operations
1. [deployment-guide.md](deployment-guide.md) - Deployment process
2. [job-queue-system.md](job-queue-system.md) - Job monitoring & recovery
3. [troubleshooting-guide.md](troubleshooting-guide.md) - Common issues
4. [system-architecture.md](system-architecture.md) - Monitoring
5. [data-retention-policy.md](data-retention-policy.md) - Retention & backup

### For Product Managers
1. [overview.md](overview.md) - Platform overview
2. [features-guide.md](features-guide.md) - All features
3. [pdf-processing-pipeline.md](pdf-processing-pipeline.md) - Processing pipeline
4. [ai-models-guide.md](ai-models-guide.md) - AI capabilities

---

## 📊 Quick Reference

### Key Numbers
- **5,000+** users in production
- **99.5%+** uptime SLA
- **8** AI models across 4 providers
- **14** processing pipeline stages
- **108** API endpoints (14 categories)
- **6** embedding types
- **200+** metafield types
- **95%+** product detection accuracy
- **85%+** search relevance
- **90%+** material recognition accuracy

### Technology Stack
- **Frontend**: React 18, TypeScript, Vite, Shadcn/ui, Vercel
- **Backend**: FastAPI, Python 3.11, Uvicorn, self-hosted
- **Database**: PostgreSQL 15, pgvector, Supabase
- **AI**: Claude Opus 4.7 (vision tool use) / Sonnet 4.6 (chunking) / Haiku 4.5 (classifiers); Voyage AI voyage-4 (sole text + understanding embedder); PaddleOCR-VL 1.6 (Modal — layout + OCR backbone); SLIG SigLIP2 (5×768D visual); GPT-4o/GPT-5 optional alternatives

### API Categories
1. PDF Processing (12 endpoints)
2. Document Management (13 endpoints)
3. Search APIs (8 endpoints)
4. Image Analysis (5 endpoints)
5. RAG System (7 endpoints)
6. Embeddings (3 endpoints)
7. Products (6 endpoints)
8. Admin & Monitoring (8 endpoints)
9. AI Services (11+ endpoints)

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

## � Support

For questions or issues:
- Check [troubleshooting-guide.md](troubleshooting-guide.md)
- Review [api-endpoints.md](api-endpoints.md)
- Contact: support@materialkaivision.com
- GitHub Issues: https://github.com/creativeghq/material-kai-vision-platform/issues

---

**Last Updated**: July 16, 2026
**Version**: 3.0.0
**Status**: Production
**Total Documentation**: 55+ comprehensive guides
**Total Lines**: 15,000+
**Coverage**: 100% of platform features
**API Endpoints**: 150+ across 16 categories

**Recent Additions**:
- ✨ **NEW**: price-monitoring-system.md - Competitive price tracking
- ✨ **NEW**: price-monitoring-deployment-guide.md - Setup instructions
- ✨ **NEW**: saved-searches-deduplication.md - AI-powered search deduplication
- ✨ **NEW**: interior-design-models.md - 14 AI models inventory
- ✨ **NEW**: interior-design-data-flow.md - Generation workflow
- ✨ **NEW**: interior-designer-agent-user-guide.md - User guide
- ✨ **NEW**: internal-pricing-credit-system.md - Credit system documentation
- ✨ Updated README.md and CHANGELOG.md with all new features
- ✨ Documented async processing and concurrency limits
- ✨ Added production hardening documentation
