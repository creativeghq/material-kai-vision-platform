# Material Kai Vision Platform - Documentation

**AI-Powered Material Intelligence System**

> Production-grade platform serving 5,000+ users with 99.5%+ uptime. Transforms material catalog PDFs into searchable knowledge using 12 AI models across a 14-stage processing pipeline.

---

## 📚 Documentation Index

### Core Documentation

#### [Overview](overview.md) ⭐
**Complete platform overview for blog posts and presentations**
- Executive summary
- Platform architecture
- AI models and intelligence
- PDF processing pipeline (14 stages)
- Search and discovery
- Database architecture
- Frontend features
- API ecosystem
- Production metrics

#### [Architecture](architecture.md)
**System architecture and technology stack**
- System overview
- Technology stack (Frontend, Backend, Database, AI)
- Key components
- Data flow
- Security architecture
- Deployment architecture
- Performance metrics
- Monitoring and observability

#### [AI Models](ai-models.md)
**AI model inventory and integration**
- 12 AI models across 7 pipeline stages
- Anthropic Claude (Sonnet 4.5, Haiku 4.5)
- OpenAI (GPT-4o, text-embedding-3-small)
- Together AI (Llama 4 Scout 17B Vision)
- CLIP visual embeddings
- Multi-vector embeddings (6 types)
- Model selection strategy
- Performance benchmarks

#### [PDF Processing](pdf-processing.md)
**14-stage PDF processing pipeline**
- Pipeline architecture
- Stage-by-stage breakdown
- Product discovery (two-stage AI)
- Checkpoint recovery system
- Image processing and analysis
- API endpoints
- Performance metrics
- Error handling

#### [API Reference](api-reference.md)
**Complete API documentation (74+ endpoints)**
- RAG & Document Processing (15 endpoints)
- Search APIs (6 endpoints)
- Embedding APIs (5 endpoints)
- Products API (8 endpoints)
- Images API (6 endpoints)
- AI Services (7 endpoints)
- Background Jobs (5 endpoints)
- Admin & Monitoring (12 endpoints)
- Error responses and rate limits

#### [Database Schema](database-schema.md)
**Supabase PostgreSQL database**
- Core tables (workspaces, documents, chunks, images, products)
- Storage buckets
- Vector indexes (pgvector)
- Row-Level Security (RLS)
- Functions and triggers

#### [Deployment](deployment.md)
**Production deployment guide**
- Frontend deployment (Vercel)
- MIVAA API deployment (Docker)
- Supabase deployment
- Health checks and monitoring
- Rollback procedures
- Secrets management
- Backup and recovery

---

## 🎯 Quick Start

### For Users
1. Read [Overview](overview.md) for platform capabilities
2. Check [PDF Processing](pdf-processing.md) for upload guidelines
3. Explore [API Reference](api-reference.md) for integration

### For Developers
1. Review [Architecture](architecture.md) for system design
2. Study [AI Models](ai-models.md) for model integration
3. Check [Database Schema](database-schema.md) for data structure
4. Follow [Deployment](deployment.md) for setup

### For Administrators
1. Read [Deployment](deployment.md) for infrastructure
2. Check [API Reference](api-reference.md) for monitoring endpoints
3. Review [Database Schema](database-schema.md) for data management

---

## 🔧 Technical Specifications

### Platform Metrics
- **Users**: 5,000+
- **Uptime**: 99.5%+
- **API Endpoints**: 74+
- **AI Models**: 12
- **Processing Stages**: 14
- **Embedding Types**: 6

### Performance
- **Search Response**: 200-800ms
- **PDF Processing**: 1-15 minutes
- **Product Detection**: 95%+ accuracy
- **Search Accuracy**: 85%+
- **Material Recognition**: 90%+

### Technology Stack
- **Frontend**: React 18 + TypeScript + Vite + Shadcn/ui
- **Backend**: FastAPI + Python 3.11
- **Database**: Supabase PostgreSQL 15 + pgvector
- **AI**: OpenAI, Anthropic, Together AI, CLIP
- **Deployment**: Vercel + Docker + Supabase Cloud

---

## 📖 Additional Documentation

### Features
- [Materials Page](features/materials-page.md) - User-facing materials catalog
- [Product Management](features/product-management.md) - Product CRUD operations
- [Chunk Management](features/chunk-management.md) - Chunk operations

### Services
- [Backend Services](services/backend/) - MIVAA API services
- [Frontend Services](services/frontend/) - React components and services
- [Database Services](services/database/) - Supabase operations
- [AI/ML Services](services/ai-ml/) - AI model integrations
- [PDF Processing Services](services/pdf-processing/) - PDF pipeline services
- [Search Services](services/search/) - Search and discovery

### Legacy Documentation
- [Old API Documentation](api-documentation.md) - Deprecated, use [API Reference](api-reference.md)
- [Old Deployment Guide](deployment-guide.md) - Deprecated, use [Deployment](deployment.md)
- [PDF Processing Flow](pdf-processing-complete-flow.md) - Deprecated, use [PDF Processing](pdf-processing.md)
- [AI Models Inventory](ai-models-inventory.md) - Deprecated, use [AI Models](ai-models.md)

---

## 🚀 Key Features

- 🔍 **Vector Similarity Search** - Semantic search with 40% better accuracy
- 🏷️ **Entity-Based Filtering** - Smart content filtering
- 🧪 **Multi-Modal AI Analysis** - Text, image, and combined processing
- 📊 **Real-time Monitoring** - Live system tracking and diagnostics
- 🤖 **Auto-Metadata Extraction** - AI-powered metadata population

---

## 📚 Documentation Index

### 🚀 Getting Started

- **[Setup & Configuration](./setup-configuration.md)** - Installation, environment setup, and configuration
- **[Deployment Guide](./deployment-guide.md)** - Production deployment and CI/CD
- **[Environment Variables](./environment-variables-guide.md)** - Complete environment configuration reference

### 🔧 Core Documentation

- **[Platform Functionality](./platform-functionality.md)** - Complete feature overview and user guide
- **[Platform Flows](./platform-flows.md)** - Workflow documentation for all major processes
- **[Platform Enhancements & Processes](./platform-enhancements-processes.md)** - ✨ NEW - Complete documentation of all platform enhancements, image processing improvements, and metadata system
- **[Metadata Inventory System](./metadata-inventory-system.md)** - ✨ NEW - Complete inventory of 200+ metadata fields with coverage analysis
- **[API Documentation](./api-documentation.md)** - REST API endpoints and integration
- **[Database Schema](./database-schema.md)** - Database structure and relationships
- **[Security & Authentication](./security-authentication.md)** - Auth systems and security practices
- **[Color & Style Analysis to Vector Recognition](./color-style-analysis-vector-recognition.md)** - Comprehensive guide to color analysis, style classification, vector embeddings, and admin panel integration
- **[CRM & User Management](./crm-user-management.md)** - User management, role-based access control, subscriptions, and credits system
- **[Products & E-Commerce System](./platform-functionality.md#11--products--ecommerce-system)** - Product creation from PDFs, shopping cart, quotes, proposals, and commission tracking
- **[Products System Technical Architecture](./products-system-technical-architecture.md)** - Complete technical architecture for product creation, management, and e-commerce integration

### ✨ Feature Documentation

- **[Product Management](./features/product-management.md)** - ✨ NEW - Comprehensive product CRUD operations, modals, and workflows
- **[Chunk Management](./features/chunk-management.md)** - ✨ NEW - Chunk detail modal, relationships, and quality metrics
- **[Materials Page](./features/materials-page.md)** - ✨ NEW - User-facing materials catalog with search and filtering

### 📦 Services Documentation

- **[Services Overview](./services/README.md)** - Complete guide to all platform services
- **[MIVAA Integration](./services/ai-ml/mivaa-integration.md)** - AI processing engine
- **[Search Hub](./services/search/search-hub.md)** - Unified search system
- **[PDF Processing - Product Discovery Architecture](./pdf-processing-product-discovery-architecture.md)** - ✨ NEW - Revolutionary 5-stage pipeline with AI-first discovery, focused extraction, and 63% memory reduction
- **[PDF Processing - Complete Flow](./pdf-processing-complete-flow.md)** - Legacy checkpoint-based processing (deprecated)
- **[PDF Processing](./services/pdf-processing/pdf-processor.md)** - Document analysis
- **[Admin Panel](./services/frontend/admin-panel.md)** - System management
- **[API Gateway](./services/backend/api-gateway.md)** - API management
- **[Knowledge Base](./services/database/knowledge-base-system.md)** - Document management
- **[Chat Agent](./services/ai-ml/chat-agent-service.md)** - Conversational AI
- **[Agent System](./agents-system.md)** - PraisonAI-powered agents with role-based access control
- **[Agent Integration Guide](./agents-integration-guide.md)** - Complete integration guide for agent system
- **[Agent API Reference](./agents-api-reference.md)** - Full API documentation for agent endpoints
- **[MoodBoard](./services/frontend/moodboard-service.md)** - Material organization
- **[Multi-Modal Analysis](./services/ai-ml/multimodal-analysis.md)** - AI analysis
- **[Testing Panel](./services/ai-ml/testing-panel.md)** - QA and testing
- **[Metadata Management](./services/database/metadata-management.md)** - Metadata system
- **[Supabase Functions](./services/backend/supabase-edge-functions.md)** - Edge functions

### 🛠️ Development & Maintenance

- **[Testing Strategy](./testing-strategy.md)** - Testing infrastructure and QA processes
- **[Troubleshooting](./troubleshooting.md)** - Common issues and solutions
- **[Changes Log](./changes-log.md)** - Release notes and updates
- **[MIVAA Service](./mivaa-service.md)** - MIVAA deployment and configuration

### 📖 Additional Resources

- **[Complete Service Inventory](./complete-service-inventory.md)** - Full list of services and components
- **[Complete Multimodal RAG System](./complete-multimodal-rag-system.md)** - RAG architecture
- **[Dynamic Category System](./dynamic-category-system.md)** - Category management
- **[Admin Panel Guide](./admin-panel-guide.md)** - Admin panel documentation
- **[Retrieval API](./api/retrieval-api.md)** - Retrieval API reference

### 🔗 Integration & Architecture

- **[Integrations Summary](./integrations_summary.md)** - Comprehensive Q&A guide covering multimodal capabilities, LlamaIndex integration, search & RAG, OCR services, automatic categorization, and backward compatibility removal
- **[Platform Integrations Guide](./platform-integrations-guide.md)** - Detailed guide to multimodal capabilities, LlamaIndex, search & RAG, OCR services, and automatic categorization
- **[Automatic Categorization & Metadata](./automatic-categorization-metadata.md)** - Category extraction pipeline, metadata structure, and integration points
- **[Backward Compatibility Removal](./backward-compatibility-removal.md)** - 10 items to remove with impact analysis and testing strategy
- **[Cleanup Implementation Plan](./cleanup-implementation-plan.md)** - 4-phase implementation plan (62 hours, 5 weeks)

### 🤖 AI & Vision Models

- **[Llama 4 Scout Implementation Summary](./llama-4-scout-implementation-summary.md)** ✨ NEW - Complete migration guide from Llama 3.2 90B to Llama 4 Scout 17B Vision with 3 major enhancements
- **[Material Images API - Llama Integration](./material-images-api-llama-integration.md)** ✨ NEW - Auto-analysis with Llama 4 Scout Vision (69.4% MMMU, #1 OCR)

---

## 🚀 Quick Start

### Prerequisites

- Node.js 18+ and npm
- Supabase account
- MIVAA service deployment (optional for full functionality)

### Installation

```bash
# Clone repository
git clone <repository-url>
cd material-kai-vision-platform

# Install dependencies
npm install

# Configure environment
cp .env.example .env
# Edit .env with your configuration

# Start development server
npm run dev
```

### Deployment

```bash
# Build for production
npm run build

# Deploy to Vercel (frontend)
vercel deploy

# Deploy Supabase functions
supabase functions deploy
```

For detailed deployment instructions, see [Deployment Guide](./deployment-guide.md).

---

## 📞 Support

For technical support or questions:
- Review the [Troubleshooting Guide](./troubleshooting.md)
- Check the [Testing Strategy](./testing-strategy.md)
- Consult the [API Documentation](./api-documentation.md)

---

**Last Updated**: January 2025
**Version**: 1.0.0
**License**: Proprietary
