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

---

### 🏗️ Architecture & Design

**[system-architecture.md](system-architecture.md)** - Complete system architecture
- Three-tier architecture
- Hybrid architecture pattern
- Database schema overview
- Authentication & security
- API endpoints (74+)
- AI integration
- Scalability
- Data flow
- Technology stack
- Monitoring & observability
- Security measures
- Production metrics

**[database-schema-complete.md](database-schema-complete.md)** - Database schema reference
- Core tables (workspaces, documents, chunks, products, images, metafields, embeddings)
- Relationships (product-chunk, product-image associations)
- Row-Level Security (RLS)
- Indexes for performance
- Storage capacity
- Backup & recovery

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
- Stage 0: Product Discovery (0-15%)
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

---

### 🔌 API Reference

**[api-endpoints.md](api-endpoints.md)** - Complete API reference
- 74+ endpoints across 9 categories
- PDF Processing (12 endpoints)
- Document Management (13 endpoints)
- Search APIs (8 endpoints)
- Image Analysis (5 endpoints)
- RAG System (7 endpoints)
- Embeddings (3 endpoints)
- Products (6 endpoints)
- Admin & Monitoring (8 endpoints)
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
3. Review **[database-schema-complete.md](database-schema-complete.md)** - Data structure
4. Study **[system-architecture.md](system-architecture.md)** - Authentication

### For Operations

1. Read **[deployment-guide.md](deployment-guide.md)** - Deployment process
2. Study **[troubleshooting-guide.md](troubleshooting-guide.md)** - Common issues
3. Review **[system-architecture.md](system-architecture.md)** - Monitoring
4. Check **[database-schema-complete.md](database-schema-complete.md)** - Backup strategy

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

**Last Updated**: October 31, 2025  
**Version**: 1.0.0  
**Status**: Production  
**Maintainer**: Development Team

---

## 📞 Support

For questions or issues:
- Check **[troubleshooting-guide.md](troubleshooting-guide.md)**
- Review **[api-endpoints.md](api-endpoints.md)**
- Contact: support@materialkaivision.com
- GitHub Issues: https://github.com/creativeghq/material-kai-vision-platform/issues

---

**Total Documentation**: 10 comprehensive guides  
**Total Lines**: 5,000+  
**Coverage**: 100% of platform features

