# Material Kai Vision Platform - Documentation

**AI-Powered Material Intelligence System**

> Production-grade platform serving 5,000+ users with 99.5%+ uptime. Transforms material catalog PDFs into searchable knowledge using 12 AI models across a 14-stage processing pipeline.

---

## 📚 Documentation

### 🎯 Start Here

**[INDEX.md](INDEX.md)** - Complete documentation index with learning paths
**[BLOG-POST-OVERVIEW.md](BLOG-POST-OVERVIEW.md)** - Comprehensive blog post overview (6,000+ words)

### 📖 Core Documentation

**[overview.md](overview.md)** - Complete platform overview
- Executive summary with key metrics
- Architecture overview
- AI models integration (12 models)
- 14-stage PDF processing pipeline
- Multi-modal search capabilities
- Database architecture
- Production metrics

**[system-architecture.md](system-architecture.md)** - System architecture & design
- Three-tier architecture
- Hybrid architecture pattern
- Technology stack
- Authentication & security
- API endpoints (74+)
- Scalability & monitoring

**[ai-models-guide.md](ai-models-guide.md)** - AI models reference
- 12 AI models overview
- Claude Sonnet 4.5 & Haiku 4.5
- GPT-4o & embeddings
- Llama 4 Scout 17B Vision
- OpenAI CLIP (5 types)
- Model usage by stage
- Cost optimization

**[pdf-processing-pipeline.md](pdf-processing-pipeline.md)** - PDF processing pipeline
- 14-stage pipeline breakdown
- Stage-by-stage details
- Checkpoint recovery (9 checkpoints)
- Performance metrics
- API endpoint

**[api-endpoints.md](api-endpoints.md)** - API reference
- 74+ endpoints across 9 categories
- PDF Processing (12)
- Document Management (13)
- Search APIs (8)
- Image Analysis (5)
- RAG System (7)
- Embeddings (3)
- Products (6)
- Admin & Monitoring (8)
- AI Services (11+)

**[database-schema-complete.md](database-schema-complete.md)** - Database schema
- Core tables
- Relationships
- Row-Level Security (RLS)
- Indexes & performance
- Storage capacity
- Backup & recovery

**[job-queue-system.md](job-queue-system.md)** - Job queue & async processing
- Supabase-native job queue
- Checkpoint-based recovery
- Auto-recovery for stuck jobs
- Real-time progress tracking
- Priority queuing
- Health monitoring

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

**[troubleshooting-guide.md](troubleshooting-guide.md)** - Common issues & solutions
- Critical issues (API down, database, OOM)
- Common issues (PDF processing, search, latency, auth)
- Performance optimization
- Support resources

---

## 🎓 Learning Paths

### For New Developers
1. [overview.md](overview.md) - Understand the platform
2. [system-architecture.md](system-architecture.md) - Learn the architecture
3. [pdf-processing-pipeline.md](pdf-processing-pipeline.md) - Understand the pipeline
4. [job-queue-system.md](job-queue-system.md) - Learn async job processing
5. [api-endpoints.md](api-endpoints.md) - Learn the API
6. [deployment-guide.md](deployment-guide.md) - Understand deployment

### For API Integration
1. [api-endpoints.md](api-endpoints.md) - All endpoints
2. [ai-models-guide.md](ai-models-guide.md) - AI models used
3. [database-schema-complete.md](database-schema-complete.md) - Data structure
4. [system-architecture.md](system-architecture.md) - Authentication

### For Operations
1. [deployment-guide.md](deployment-guide.md) - Deployment process
2. [job-queue-system.md](job-queue-system.md) - Job monitoring & recovery
3. [troubleshooting-guide.md](troubleshooting-guide.md) - Common issues
4. [system-architecture.md](system-architecture.md) - Monitoring
5. [database-schema-complete.md](database-schema-complete.md) - Backup strategy

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
- **Frontend**: React 18, TypeScript, Vite, Shadcn/ui, Vercel
- **Backend**: FastAPI, Python 3.11, Uvicorn, self-hosted
- **Database**: PostgreSQL 15, pgvector, Supabase
- **AI**: Claude, GPT-4o, Llama, CLIP, LlamaIndex

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
- ✅ Clear, concise language
- ✅ Code examples where applicable
- ✅ Structured with headers
- ✅ Links to related docs
- ✅ No task lists or planning documents
- ✅ Production-focused content
- ✅ Updated regularly

---

## � Support

For questions or issues:
- Check [troubleshooting-guide.md](troubleshooting-guide.md)
- Review [api-endpoints.md](api-endpoints.md)
- Contact: support@materialkaivision.com
- GitHub Issues: https://github.com/creativeghq/material-kai-vision-platform/issues

---

**Last Updated**: October 31, 2025
**Version**: 1.0.1
**Status**: Production
**Total Documentation**: 11 comprehensive guides
**Total Lines**: 6,000+
**Coverage**: 100% of platform features
