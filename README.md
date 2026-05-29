# 🏗️ Material Kai Vision Platform

**AI-Powered Material Recognition & Knowledge Management Platform**

[![Production](https://img.shields.io/badge/status-production-success)](https://materialshub.gr)
[![Users](https://img.shields.io/badge/users-5000+-blue)](https://materialshub.gr)
[![API](https://img.shields.io/badge/API-v1-green)](https://v1api.materialshub.gr/docs)

---

## 🎯 Overview

The **Material Kai Vision Platform** is a production-grade AI system that transforms material catalogs into searchable, intelligent databases using advanced computer vision, natural language processing, and multi-vector embeddings. The platform supports multiple input methods (PDF, Web Scraping, XML) and provides comprehensive AI-powered analysis.

### **Key Capabilities**
- 📄 **PDF Processing**: Extract products, images, and metadata from material catalogs with 14-stage pipeline
- 🌐 **Web Scraping**: Automatic product discovery from manufacturer websites using Firecrawl
- 🤖 **AI Analysis**: 12+ AI models across multiple providers for comprehensive understanding
- 🔍 **Multi-Vector Search**: 7 specialized embeddings (text, visual, understanding, color, texture, style, material)
- 💬 **AI Agents**: Jarvis unified agent (material search, B2B research, SEO), Interior Designer, Demo
- 📊 **Knowledge Base**: Semantic chunking, quality scoring, and relationship mapping
- 🎨 **Visual Recognition**: CLIP + Qwen3-VL Vision for image analysis
- 🏷️ **Auto-Metadata**: AI-powered metadata extraction (200+ fields)
- 🏠 **Spatial Analysis**: AI-powered room layout optimization and accessibility analysis
- 💰 **Price Monitoring**: Competitive price tracking across multiple sources
- 🎨 **Interior Design**: Multi-model AI interior design generation (14 models)
- 📁 **Project Workspace**: Container above moodboards/quotes for one engagement — rooms, budget vs actual, tasks (with subtasks), revisions, timeline, passwordless email collaborator invites ([docs](docs/projects.md) · [API](docs/api/projects-api.md))

### **Production Stats**
- **Active Users**: 5,000+
- **Documents Processed**: 1,000+ PDFs
- **Products Cataloged**: 10,000+
- **Search Accuracy**: 85%+
- **Uptime**: 99.5%+
- **API Endpoints**: 150+
- **AI Models**: 12+ across 5 providers (Anthropic, OpenAI, Voyage AI, HuggingFace, WorldLabs)

---

## 🏗️ Architecture

### **Technology Stack**

#### **Frontend**
- **Framework**: React 18 + TypeScript + Vite
- **UI**: Tailwind CSS + Headless UI
- **State**: React Query + Context API
- **Deployment**: Vercel
- **URL**: https://materialshub.gr

#### **Backend**
- **API**: FastAPI (Python 3.9+)
- **Service**: MIVAA (Material Intelligence Vision and Analysis Agent)
- **Package Manager**: UV (ultrafast Python package installer)
- **Process Management**: systemd
- **Deployment**: DigitalOcean (165.227.31.109)
- **URL**: https://v1api.materialshub.gr

#### **Database**
- **Primary**: Supabase PostgreSQL
- **Extensions**: pgvector for vector similarity search
- **Tables**: 15+ tables (materials, products, chunks, images, embeddings, etc.)
- **Indexes**: Optimized ivfflat vector indexes

#### **AI Models** (12+ models across 5 providers)
1. **Anthropic**: Claude Haiku 4.5 (fast classification/B2B search), Claude Opus 4.7 (deep enrichment, Jarvis agent)
2. **OpenAI**: GPT-4o (alternative discovery), GPT-4o-mini (query parsing)
3. **HuggingFace Endpoint**: Qwen3-VL 32B Vision (69.4% MMMU, vision analysis + understanding embeddings)
4. **Voyage AI**: voyage-4 (primary text embeddings, 1024D)
5. **SigLIP2 (HuggingFace)**: 5 visual embedding types (visual, color, texture, style, material — 768D each)
6. **Replicate**: 14 interior design models (FLUX, SDXL, Stable Diffusion 3, etc.)
7. **WorldLabs Marble**: 3D Gaussian Splat world generation (mini + plus models)

### **System Diagram**
```
┌─────────────────┐
│   Frontend      │
│  (Vercel)       │
│  materialshub.gr│
└────────┬────────┘
         │
         ├─────────────────────────────────┐
         │                                 │
┌────────▼────────┐              ┌────────▼────────┐
│  Supabase       │              │  MIVAA API      │
│  PostgreSQL     │◄─────────────┤  FastAPI        │
│  + pgvector     │              │  v1api.material │
│  + Edge Funcs   │              │  shub.gr        │
└─────────────────┘              └────────┬────────┘
                                          │
                    ┌─────────────────────┼─────────────────────┐
                    │                     │                     │
           ┌────────▼────────┐   ┌───────▼────────┐   ┌───────▼────────┐
           │  Voyage AI      │   │  Anthropic     │   │  HuggingFace   │
           │  Embeddings     │   │  Claude 4.5    │   │  Qwen3-VL 32B  │
           └─────────────────┘   └────────────────┘   └────────────────┘
```

---

## 🚀 Quick Start

### **Prerequisites**
- Node.js 18+ (Frontend)
- Python 3.9+ (Backend)
- UV package manager (Backend)
- Supabase account
- API keys: OpenAI, Anthropic, Voyage AI, HuggingFace

### **Frontend Setup**
```bash
# Clone repository
git clone https://github.com/creativeghq/material-kai-vision-platform.git
cd material-kai-vision-platform

# Install dependencies
npm install

# Configure environment
cp .env.example .env
# Edit .env with your Supabase credentials

# Run development server
npm run dev

# Build for production
npm run build
```

### **Backend Setup**
```bash
# Navigate to backend
cd mivaa-pdf-extractor

# Install UV (if not installed)
curl -LsSf https://astral.sh/uv/install.sh | sh

# Install dependencies
uv pip install -r requirements.txt

# Configure environment
cp .env.example .env
# Edit .env with API keys and database credentials

# Run development server
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

# Production deployment
# See docs/deployment-guide.md
```

### **Environment Variables**

#### **Frontend (.env)**
```bash
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your_anon_key
VITE_MIVAA_API_URL=https://v1api.materialshub.gr
```

#### **Backend (.env)**
```bash
# Database
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# AI Services
OPENAI_API_KEY=your_openai_key
ANTHROPIC_API_KEY=your_anthropic_key
VOYAGE_API_KEY=your_voyage_key

# Vision/Embedding Endpoints (HuggingFace)
QWEN_ENDPOINT_URL=https://your-qwen-endpoint.aws.endpoints.huggingface.cloud
QWEN_ENDPOINT_TOKEN=hf_...
SLIG_ENDPOINT_URL=https://your-slig-endpoint.aws.endpoints.huggingface.cloud
SLIG_ENDPOINT_TOKEN=hf_...

# Application
ENVIRONMENT=production
DEBUG=false
LOG_LEVEL=ERROR
```

#### **Supabase Edge Function Secrets**
```bash
ANTHROPIC_API_KEY=your_anthropic_key
WORLDLABS_API_KEY=your_worldlabs_key   # Required for VR world generation
FIRECRAWL_API_KEY=your_firecrawl_key   # Required for B2B company scraping
APOLLO_API_KEY=your_apollo_key          # Required for B2B company enrichment
HUNTER_API_KEY=your_hunter_key          # Required for B2B contact discovery
ZEROBOUNCE_API_KEY=your_zerobounce_key  # Required for email validation
```

---

## 📚 Documentation

### **🎯 Getting Started**
- [Documentation Index](./docs/INDEX.md) - Complete documentation index with learning paths
- [Platform Overview](./docs/overview.md) - Executive summary and key features
- [Platform Flows](./docs/platform-flows.md) - End-to-end workflow documentation
- [Features Guide](./docs/features-guide.md) - Comprehensive feature catalog
- [System Architecture](./docs/system-architecture.md) - Three-tier architecture overview

### **🤖 AI & Processing**
- [AI Models Guide](./docs/ai-models-guide.md) - 12+ AI models across 4 providers
- [PDF Processing Pipeline](./docs/pdf-processing-pipeline.md) - 14-stage processing pipeline
- [Product Discovery Architecture](./docs/product-discovery-architecture.md) - AI-powered extraction
- [Agent System](./docs/agent-system.md) - Database-driven AI agents
- [Prompt Enhancement System](./docs/prompt-enhancement-system.md) - Dynamic prompt system

### **🔍 Search & Discovery**
- [Search Strategies](./docs/search-strategies.md) - 6 search strategies (100% implemented)
- [Image Relevancy and Search](./docs/image-relevancy-and-search.md) - Multi-vector search (6 embeddings)
- [Saved Searches Deduplication](./docs/saved-searches-deduplication.md) - AI-powered deduplication

### **📥 Data Import**
- [Web Scraping Integration](./docs/web-scraping-integration.md) - Firecrawl web scraping
- [Data Import System](./docs/data-import-system.md) - XML import with AI mapping
- [Unified Product Generation Flow](./docs/unified-product-generation-flow.md) - Multi-source integration
- [Async Processing & Limits](./docs/async-processing-and-limits.md) - Concurrency architecture

### **🏠 Interior Design**
- [Interior Design Models](./docs/interior-design-models.md) - 14 AI models inventory
- [Interior Design Data Flow](./docs/interior-design-data-flow.md) - Generation workflow
- [Interior Designer Agent Guide](./docs/interior-designer-agent-user-guide.md) - User guide

### **💰 Business Features**
- [Price Monitoring System](./docs/price-monitoring-system.md) - Competitive price tracking
- [Price Monitoring Deployment](./docs/price-monitoring-deployment-guide.md) - Setup guide
- [Email System](./docs/email-system.md) - Amazon SES integration
- [Campaign System](./docs/campaign-system.md) - Email campaign management
- [Quotes System](./docs/quotes-system-architecture.md) - Quote management
- [Internal Pricing & Credits](./docs/internal-pricing-credit-system.md) - Credit system

### **🗄️ Data & Metadata**
- [Comprehensive Metadata Fields](./docs/comprehensive-metadata-fields-guide.md) - 200+ fields
- [Metadata Management System](./docs/metadata-management-system.md) - Dynamic extraction
- [Meta Field Aggregation](./docs/meta-field-aggregation.md) - 3-source redundancy
- [Relevancy System](./docs/relevancy-system.md) - Entity linking

### **📊 Monitoring & Analytics**
- [Monitoring & Analytics System](./docs/monitoring-analytics-system.md) - Real-time monitoring
- [Job Queue System](./docs/job-queue-system.md) - Async job processing
- [Monitoring and Alerting](./docs/monitoring-and-alerting.md) - Alert configuration
- [Troubleshooting Guide](./docs/troubleshooting-guide.md) - Common issues

### **🔌 API Reference**
- [API Endpoints](./docs/api-endpoints.md) - 150+ endpoints across 16 categories
- [API Documentation](./docs/api-docs.md) - Complete API reference
- [Modular Pipeline Endpoints](./docs/modular-pipeline-endpoints.md) - Pipeline API

### **🚀 Deployment & Operations**
- [Deployment Guide](./docs/deployment-guide.md) - Production deployment
- [Supabase Types Automation](./docs/supabase-types-automation.md) - TypeScript generation

---

## 🔗 Live Services

### **Production URLs**
- **Frontend**: https://materialshub.gr
- **API**: https://v1api.materialshub.gr
- **API Docs**: https://v1api.materialshub.gr/docs (Swagger UI)
- **ReDoc**: https://v1api.materialshub.gr/redoc (Alternative API docs)
- **OpenAPI Schema**: https://v1api.materialshub.gr/openapi.json
- **Documentation Site**: https://basilakis.github.io

### **Health Checks**
```bash
# Frontend health
curl https://materialshub.gr

# API health
curl https://v1api.materialshub.gr/health

# API documentation
curl https://v1api.materialshub.gr/docs
```

---

## 🎯 Key Features

### **1. Multi-Source Product Ingestion**

**PDF Processing Pipeline** (14 stages)
- Product-centric architecture with individual processing
- YOLO layout detection for tables and regions
- Page-aware chunking respecting document structure
- 200+ metadata fields extracted automatically
- 95%+ product detection accuracy

**Web Scraping Integration**
- Firecrawl-powered automatic website scraping
- AI-powered product discovery from unstructured web content
- Background processing with real-time progress tracking
- Automatic image extraction and storage
- 85%+ success rate

**XML Import**
- AI-powered dynamic field mapping (Claude Opus 4.7)
- Batch processing (10 products at a time)
- Concurrent image downloads (5 parallel)
- Cron-based scheduling for recurring imports
- Checkpoint recovery for resilience

### **2. Multi-Vector Search** (7 embedding types)
- **Text Embeddings** (1024D, Voyage AI): Semantic text understanding
- **Visual Embeddings** (768D, SigLIP2): General visual similarity
- **Understanding Embeddings** (1024D, Voyage AI): Spec-based search via Qwen3-VL analysis
- **Color Embeddings** (768D, SigLIP2): Color palette and harmony matching
- **Texture Embeddings** (768D, SigLIP2): Surface texture and pattern recognition
- **Style Embeddings** (768D, SigLIP2): Design style recognition
- **Material Embeddings** (768D, SigLIP2): Material type classification

**Storage**: halfvec (float16) — 50% storage savings vs float32
**Search Strategies**: Semantic, Vector, Multi-Vector (7-vector), Hybrid, Material, Image
**Dynamic Weights**: 7 query-adaptive profiles automatically selected per search
**Performance**: 300-500ms response time, 85%+ relevance

### **3. AI Agents & Chat**
- **Jarvis Agent** (unified): Material search, knowledge base, visual search, B2B manufacturer discovery, SEO — all users; B2B/SEO tools gated to admin/owner
- **Interior Designer Agent**: Room design, spatial analysis, VR world generation
- **Demo Agent**: Platform showcase with pre-defined responses
- **LangChain.js + LangGraph**: StateGraph orchestration, tool calling, long-term memory
- **Database-Driven Prompts**: Real-time prompt updates without deployment
- **Multimodal**: Image uploads supported (data URLs → vision content blocks)

### **5. Interior Design Generation**
- 14 AI models (7 text-to-image, 7 image-to-image) via Replicate
- Parallel processing (3 concurrent generations)
- Multiple variations per request
- Permanent storage in Supabase
- Credit-based billing system
- Models: FLUX, SDXL, Stable Diffusion 3, Playground, ComfyUI

### **5b. VR World Generation**
- WorldLabs Marble API: generates explorable 3D Gaussian Splat worlds from interior images
- Spark.js renderer (Three.js-based) with orbit + WASD first-person navigation
- 3 quality levels (Draft 100k / Standard 500k / Full SPZ)
- Credit-based: 50 credits (mini, ~30-45s) or 200 credits (plus, ~5min)
- Persists across sessions; stored in `vr_worlds` table

### **6. Price Monitoring**
- Competitive price tracking across sources
- Scheduled monitoring (hourly, daily, weekly, on-demand)
- Price history and trend analysis
- Configurable price alerts
- Competitor source management
- Statistics and reporting

### **7. Saved Searches with AI Deduplication**
- Smart duplicate detection using Claude Haiku 4.5
- Semantic similarity analysis (85-95% threshold)
- Auto-merge for highly similar searches
- Usage tracking and relevance scoring
- Integration context support

### **8. Knowledge Base & RAG**
- **Semantic Chunking**: Intelligent document segmentation
- **Quality Scoring**: Automated quality assessment (0-1 scale)
- **Deduplication**: Hash-based + semantic similarity detection
- **Relationship Mapping**: Chunk relationships (semantic, sequential, hierarchical)
- **Metadata Extraction**: 200+ fields with AI-powered extraction

### **9. Admin Dashboard**
- **PDF Processing Monitor**: Real-time job tracking with 9 checkpoints
- **Analytics Dashboard**: Usage metrics, AI costs, search patterns
- **Product Management**: Create, edit, enrich products
- **Metadata Management**: 200+ metadata fields configuration
- **Agent Configurations**: AI agent prompt management
- **User Management**: CRM and workspace administration
- **Email Campaigns**: Bulk email with tracking and analytics

---

## 📊 Performance Metrics

### **Processing Performance**
- **PDF Processing**: 2-5 minutes per document (14-stage pipeline)
- **Web Scraping**: 2-5 minutes for 10-25 products
- **XML Import**: <1 minute for 100 products
- **Product Detection**: 25-55 seconds for 200 chunks → 15 products
- **Multi-Vector Search**: 300-500ms (6 embeddings in parallel)
- **Interior Design**: 5-13 seconds per model (parallel processing)

### **Quality Metrics**
- **Search Accuracy**: 85%+ relevance
- **Product Discovery**: 85%+ (AI-powered)
- **Web Scraping Success**: 95%+ scraping, 85%+ discovery
- **Entity Extraction**: 90%+ precision
- **Material Recognition**: 90%+ accuracy (Qwen3-VL)
- **Processing Success Rate**: 95%+
- **Metadata Extraction**: 200+ fields with 90%+ accuracy

### **System Performance**
- **Uptime**: 99.5%+
- **Concurrent Users**: 100+
- **Daily Processing**: 50+ PDFs, 100+ web scraping sessions
- **API Throughput**: 100+ queries per minute
- **Error Rate**: <1%
- **API Endpoints**: 150+ across 16 categories

---

## 🛠️ Development

### **Project Structure**
```
material-kai-vision-platform/
├── src/                          # Frontend React application
│   ├── components/               # React components
│   ├── services/                 # API services
│   ├── pages/                    # Page components
│   └── utils/                    # Utilities
├── mivaa-pdf-extractor/          # Backend FastAPI service
│   ├── app/                      # Application code
│   │   ├── api/                  # API routes
│   │   ├── services/             # Business logic
│   │   ├── models/               # Data models
│   │   └── utils/                # Utilities
│   └── requirements.txt          # Python dependencies
├── supabase/                     # Supabase configuration
│   ├── functions/                # Edge functions
│   └── migrations/               # Database migrations
├── docs/                         # Documentation
├── planning/                     # Project planning documents
├── scripts/                      # Utility scripts
└── .github/workflows/            # CI/CD workflows
```

### **Development Workflow**
1. Create feature branch from `main`
2. Make changes and test locally
3. Run tests: `npm test` (frontend), `pytest` (backend)
4. Commit with descriptive message
5. Push and create pull request
6. CI/CD runs automated tests
7. Review and merge to `main`
8. Automatic deployment to production

### **Testing**
```bash
# Frontend tests
npm test
npm run test:coverage

# Backend tests
cd mivaa-pdf-extractor
pytest
pytest --cov=app

# End-to-end tests
node scripts/testing/comprehensive-end-to-end-test.js
node scripts/testing/harmony-pdf-complete-e2e-test.js
```

---

## 🤝 Contributing

We welcome contributions! Please follow these guidelines:

1. **Fork** the repository
2. **Create** a feature branch (`git checkout -b feature/amazing-feature`)
3. **Commit** your changes (`git commit -m 'Add amazing feature'`)
4. **Push** to the branch (`git push origin feature/amazing-feature`)
5. **Open** a Pull Request

### **Code Standards**
- **Frontend**: ESLint + Prettier (TypeScript)
- **Backend**: Black + isort + mypy (Python)
- **Commits**: Conventional Commits format
- **Documentation**: Update relevant docs with changes

---

## 📝 License

This project is proprietary software owned by Creative GHQ.

---

## 👥 Team

- **Development**: Creative GHQ Development Team
- **AI/ML**: Material Intelligence Team
- **DevOps**: Platform Operations Team

---

## 📞 Support

- **Documentation**: https://basilakis.github.io
- **API Docs**: https://v1api.materialshub.gr/docs
- **Issues**: GitHub Issues
- **Email**: support@materialshub.gr

---

## 🎉 Acknowledgments

- **OpenAI**: GPT models and embeddings
- **Anthropic**: Claude 4.5 models + built-in web search
- **HuggingFace**: Qwen3-VL 32B Vision
- **Voyage AI**: voyage-4 text embeddings
- **WorldLabs**: Marble 3D Gaussian Splat generation
- **Supabase**: Database and backend infrastructure
- **Vercel**: Frontend hosting and deployment

---

**Built with ❤️ by Creative GHQ**
