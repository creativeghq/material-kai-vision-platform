# Material Kai Vision Platform - Documentation

> Comprehensive AI-powered material intelligence system combining document processing, material recognition, 3D generation, and knowledge management.

## 🏗️ Architecture Overview

### Core Components

- **Frontend**: React + TypeScript + Vite with advanced UI components
- **Backend**: Supabase Edge Functions (TypeScript/Deno)
- **Database**: PostgreSQL with pgvector extension and Row-Level Security
- **AI Services**: MIVAA (Material Intelligence Vision and Analysis Agent)
- **AI/ML Providers**: OpenAI, HuggingFace, Replicate
- **3D Processing**: SVBRDF extraction and AI-powered generation
- **Authentication**: JWT-based with Supabase Auth and RBAC

### Key Features

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

### 📦 Services Documentation

- **[Services Overview](./services/README.md)** - Complete guide to all platform services
- **[MIVAA Integration](./services/ai-ml/mivaa-integration.md)** - AI processing engine
- **[Search Hub](./services/search/search-hub.md)** - Unified search system
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
