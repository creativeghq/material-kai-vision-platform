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

**[search-strategies.md](search-strategies.md)** - Complete search system guide ✅
- 6 search strategies (100% implemented)
- Semantic, Vector, Multi-Vector, Hybrid, Material, Image
- All strategies combined mode
- Database schema and indexes
- Performance metrics and benchmarks
- Usage examples and best practices

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

---

### 🤖 AI & Processing

**[ai-models-guide.md](ai-models-guide.md)** - AI models integration
- 12 AI models overview
- Claude Sonnet 4.5 (product discovery, enrichment)
- Claude Haiku 4.5 (fast validation)
- GPT-4o (alternative discovery)
- OpenAI embeddings (text-embedding-3-small)
- Llama 4 Scout 17B Vision (image analysis, OCR)
- OpenAI CLIP (5 embedding types)
- Anthropic Semantic Chunking
- LlamaIndex RAG system
- Model usage by pipeline stage
- Cost optimization
- API keys & configuration
- Performance benchmarks

**[pdf-processing-pipeline.md](pdf-processing-pipeline.md)** - 14-stage PDF processing
- Pipeline overview
- Stage 0A: Product Discovery (0-10%) - Products + Metadata extraction
- Stage 0B: Document Entity Discovery (10-15%) - Certificates, Logos, Specs
- Stage 1: Focused Extraction (15-30%)
- Stage 2: Text Extraction (30-40%)
- Stage 3: Semantic Chunking (40-50%)
- Stage 4: Text Embeddings (50-60%)
- Stage 5: Image Extraction (60-70%)
- Stage 6: Image Analysis (70-80%)
- Stages 7-10: Multi-Vector Embeddings (80-91%)
- Stage 11: Product Creation (91-95%)
- Stage 12: Metafield Extraction (95-97%)
- Stage 13: Quality Enhancement (97-100%)
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

### 🔌 API Reference

**[api-endpoints.md](api-endpoints.md)** - Complete API reference
- 113 endpoints across 14 categories
- RAG Routes (25 endpoints)
- Admin Routes (18 endpoints)
- Search Routes (18 endpoints)
- Documents Routes (11 endpoints)
- AI Services Routes (10 endpoints)
- Images Routes (5 endpoints)
- Document Entities Routes (5 endpoints) ✨ NEW
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
- **12** AI models integrated
- **14** processing pipeline stages
- **74+** API endpoints
- **9** API categories
- **6** embedding types
- **200+** metafield types
- **95%+** product detection accuracy
- **85%+** search relevance
- **90%+** material recognition accuracy

### Technology Stack

**Frontend**: React 18, TypeScript, Vite, Shadcn/ui, Vercel  
**Backend**: FastAPI, Python 3.11, Uvicorn, self-hosted  
**Database**: PostgreSQL 15, pgvector, Supabase  
**AI**: Claude, GPT-4o, Llama, CLIP, LlamaIndex  

### API Categories

1. PDF Processing (12 endpoints)
2. Document Management (13 endpoints)
3. Search APIs (8 endpoints)
4. Image Analysis (5 endpoints)
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

- ✅ Clear, concise language
- ✅ Code examples where applicable
- ✅ Structured with headers
- ✅ Links to related docs
- ✅ No task lists or planning documents
- ✅ Production-focused content
- ✅ Updated regularly

---

## 🔄 Documentation Updates

**Last Updated**: November 13, 2025
**Version**: 2.0.0
**Status**: Production
**Maintainer**: Development Team

**Recent Changes:**
- ✅ Moved analysis documents to /planning
- ✅ Added future features roadmap
- ✅ Updated performance optimization status
- ✅ Reorganized documentation structure

---

## 📞 Support

For questions or issues:
- Check **[troubleshooting-guide.md](troubleshooting-guide.md)**
- Review **[api-endpoints.md](api-endpoints.md)**
- Contact: support@materialkaivision.com
- GitHub Issues: https://github.com/creativeghq/material-kai-vision-platform/issues

---

**Total Documentation**: 20+ comprehensive guides
**Total Lines**: 10,000+
**Coverage**: 100% of platform features

