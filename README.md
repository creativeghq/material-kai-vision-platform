# 🏗️ Material Kai Vision Platform

**AI-Powered Material Recognition & Knowledge Management Platform**

[![Production](https://img.shields.io/badge/status-production-success)](https://materialshub.gr)
[![Users](https://img.shields.io/badge/users-5000+-blue)](https://materialshub.gr)
[![API](https://img.shields.io/badge/API-v1-green)](https://v1api.materialshub.gr/docs)

---

## 🎯 Overview

The **Material Kai Vision Platform** is a production-grade AI system that transforms PDF catalogs into searchable, intelligent material databases using advanced computer vision, natural language processing, and multi-vector embeddings.

### **Key Capabilities**
- 📄 **PDF Processing**: Extract products, images, and metadata from material catalogs
- 🤖 **AI Analysis**: 12 AI models across 7 pipeline stages for comprehensive material understanding
- 🔍 **Multi-Vector Search**: 6 specialized embeddings (text, visual, color, texture, application, multimodal)
- 💬 **AI Agents**: Intelligent material recommendations and search assistance
- 📊 **Knowledge Base**: Semantic chunking, quality scoring, and relationship mapping
- 🎨 **Visual Recognition**: CLIP + Llama 4 Scout Vision for image analysis
- 🏷️ **Auto-Metadata**: AI-powered metadata extraction and population

### **Production Stats**
- **Active Users**: 5,000+
- **Documents Processed**: 1,000+ PDFs
- **Products Cataloged**: 10,000+
- **Search Accuracy**: 85%+
- **Uptime**: 99.5%+

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
- **Deployment**: DigitalOcean (104.248.68.3)
- **URL**: https://v1api.materialshub.gr

#### **Database**
- **Primary**: Supabase PostgreSQL
- **Extensions**: pgvector for vector similarity search
- **Tables**: 15+ tables (materials, products, chunks, images, embeddings, etc.)
- **Indexes**: Optimized ivfflat vector indexes

#### **AI Models** (12 models across 7 stages)
1. **OpenAI**: text-embedding-3-small (1536D embeddings)
2. **Anthropic**: Claude Haiku 4.5 (fast classification), Claude Sonnet 4.5 (deep enrichment)
3. **Together AI**: Llama 4 Scout 17B Vision (69.4% MMMU, #1 OCR)
4. **CLIP**: Visual embeddings (512D)
5. **Custom Models**: Color, texture, application embeddings

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
           │  OpenAI         │   │  Anthropic     │   │  Together AI   │
           │  Embeddings     │   │  Claude 4.5    │   │  Llama 4 Scout │
           └─────────────────┘   └────────────────┘   └────────────────┘
```

---

## 🚀 Quick Start

### **Prerequisites**
- Node.js 18+ (Frontend)
- Python 3.9+ (Backend)
- UV package manager (Backend)
- Supabase account
- API keys: OpenAI, Anthropic, Together AI

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
TOGETHER_API_KEY=your_together_key

# Application
ENVIRONMENT=production
DEBUG=false
LOG_LEVEL=ERROR
```

---

## 📚 Documentation

### **Core Platform**
- [Platform Overview](./docs/README.md) - Complete platform documentation index
- [Platform Flows](./docs/platform-flows.md) - End-to-end workflow documentation
- [Platform Functionality](./docs/platform-functionality.md) - Feature catalog
- [System Diagrams](./docs/system-diagrams.md) - Architecture visualizations

### **AI & Machine Learning**
- [AI Models Inventory](./docs/ai-models-inventory.md) - All 12 AI models documented
- [Multi-Vector Storage](./docs/multi-vector-storage-system.md) - 6 embedding types architecture
- [Embeddings & Search Strategy](./docs/embeddings-search-strategy.md) - Search optimization
- [Multimodal Analysis](./docs/multimodal-analysis.md) - Text + image processing

### **PDF Processing**
- [PDF Processing Flow](./docs/pdf-processing-complete-flow.md) - Complete pipeline (14 stages)
- [Product Detection](./docs/product-detection-and-chunk-quality-improvements.md) - Two-stage classification
- [Two-Stage Classification](./docs/two-stage-product-classification.md) - Claude Haiku + Sonnet system
- [Chunk Quality](./docs/product-detection-and-chunk-quality-improvements.md) - Quality scoring & deduplication

### **API Documentation**
- [Complete API Reference](./docs/api-documentation.md) - All 37+ endpoints
- [MIVAA Service](./docs/mivaa-service.md) - Backend API service documentation
- [Agents System](./docs/agents-system.md) - AI agent capabilities
- [Search APIs](./docs/api-documentation.md#search-apis) - Semantic, vector, hybrid search

### **Admin & Management**
- [Admin Panel Guide](./docs/admin-panel-guide.md) - Admin interface documentation
- [Admin Knowledge Base](./docs/admin-knowledge-base-api.md) - Knowledge base management
- [Metadata Inventory](./docs/metadata-inventory-system.md) - 200+ metadata fields
- [CRM & User Management](./docs/crm-user-management.md) - User administration

### **Deployment & Operations**
- [Deployment Guide](./docs/deployment-guide.md) - Production deployment instructions
- [Setup & Configuration](./docs/setup-configuration.md) - Environment setup
- [Environment Variables](./docs/environment-variables-guide.md) - Configuration reference
- [Troubleshooting](./docs/troubleshooting.md) - Common issues and solutions

### **Security & Testing**
- [Security & Authentication](./docs/security-authentication.md) - JWT, RLS, RBAC
- [Testing Strategy](./docs/testing-strategy.md) - Test coverage and validation

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

### **1. PDF Processing Pipeline** (14 stages)
1. PDF Upload & Validation
2. PDF Extraction (PyMuPDF4LLM)
3. Image Extraction
4. Semantic Chunking (HierarchicalNodeParser)
5. Quality Scoring & Validation (min score 0.7)
6. Hash Generation & Exact Duplicate Detection (SHA-256)
7. Semantic Similarity Detection (85% threshold)
8. Borderline Quality Flagging (score 0.6-0.7)
9. Chunk Classification
10. Embedding Generation (6 types)
11. Image Analysis (Claude Haiku 4.5 + Llama 4 Scout Vision)
12. Product Detection (Four-layer validation)
13. Product Enrichment (Claude Sonnet 4.5)
14. Multi-Vector Embedding Generation

### **2. Multi-Vector Search** (6 embedding types)
- **Text Embeddings** (1536D): Semantic text understanding
- **Visual CLIP Embeddings** (512D): Cross-modal visual-text matching
- **Multimodal Fusion** (2048D): Combined text+visual understanding
- **Color Embeddings** (256D): Color palette and harmony matching
- **Texture Embeddings** (256D): Surface texture and pattern recognition
- **Application Embeddings** (512D): Use-case and context-specific matching

**Search Accuracy**: 85%+ improvement over single-vector methods

### **3. AI Agents**
- **Research Agent** (Admin only): Advanced material research and analysis
- **MIVAA Search Agent** (All users): Intelligent search assistance
- **PraisonAI Integration**: Role-based access control and orchestration

### **4. Knowledge Base**
- **Semantic Chunking**: Intelligent document segmentation
- **Quality Scoring**: Automated quality assessment (0-1 scale)
- **Deduplication**: Hash-based + semantic similarity detection
- **Relationship Mapping**: Chunk relationships (semantic, sequential, hierarchical)
- **Metadata Extraction**: AI-powered metadata population

### **5. Admin Dashboard**
- **Chunk Quality Dashboard**: Monitor and review chunk quality
- **Product Management**: Create, edit, and enrich products
- **Metadata Management**: Define and manage 200+ metadata fields
- **User Management**: CRM and user administration
- **Analytics**: Performance metrics and usage statistics

---

## 📊 Performance Metrics

### **Processing Performance**
- **PDF Processing**: 2-5 minutes per document (average)
- **Product Detection**: 25-55 seconds for 200 chunks → 15 products
- **Embedding Generation**: 1.5-3 seconds per entity
- **Search Response**: 200-800ms (semantic search)
- **Multi-Modal Analysis**: 1-4 seconds

### **Quality Metrics**
- **Search Accuracy**: 85%+
- **Product Classification**: 85%+ (two-stage system)
- **Entity Extraction**: 90%+ precision
- **Material Recognition**: 80%+ accuracy
- **Processing Success Rate**: 95%+
- **Chunk Quality Score**: Average 0.82 (scale 0-1)

### **System Performance**
- **Uptime**: 99.5%+
- **Concurrent Users**: 100+
- **Daily Document Processing**: 50+ PDFs
- **API Throughput**: 100+ queries per minute
- **Error Rate**: <1%

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
- **Anthropic**: Claude 4.5 models
- **Together AI**: Llama 4 Scout Vision
- **Supabase**: Database and backend infrastructure
- **Vercel**: Frontend hosting and deployment

---

**Built with ❤️ by Creative GHQ**
