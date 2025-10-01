# API Documentation

## 🌐 API Architecture Overview

The Material Kai Vision Platform uses a multi-layered API architecture:

1. **Frontend API Layer** - React application API calls
2. **Backend API Gateway** - Node.js/TypeScript API routing
3. **MIVAA Microservice** - Python FastAPI service
4. **Supabase Edge Functions** - Serverless functions
5. **External API Integrations** - Third-party services

## 🔗 Internal API Endpoints

### Health Check Endpoints

#### Frontend Health Check
```http
GET /api/health
```

**Response**:
```json
{
  "status": "healthy",
  "timestamp": "2025-01-01T00:00:00Z",
  "version": "1.0.0",
  "services": {
    "database": "connected",
    "mivaa": "healthy",
    "supabase": "operational"
  }
}
```

#### MIVAA Service Health
```http
GET /health
Host: mivaa-pdf-extractor:8000
```

**Response**:
```json
{
  "service": "MIVAA PDF Extractor",
  "version": "1.0.0",
  "status": "running",
  "timestamp": "2025-01-01T00:00:00Z",
  "endpoints": {
    "health": "/health",
    "metrics": "/metrics",
    "docs": "/docs",
    "pdf_markdown": "/api/v1/extract/markdown",
    "rag_upload": "/api/v1/rag/documents/upload"
  }
}
```

### Authentication Endpoints

#### User Authentication
```http
POST /auth/signin
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "password123"
}
```

#### API Key Validation
```http
POST /api/auth/validate-key
Authorization: Bearer your-api-key
```

### Document Processing Endpoints

#### Process Document
```http
POST /api/documents/process
Authorization: Bearer jwt-token
Content-Type: multipart/form-data

file: [PDF file]
options: {
  "extractMarkdown": true,
  "extractTables": true,
  "extractImages": true
}
```

## 🤖 MIVAA Service API

### What is MIVAA?
**MIVAA (Material Intelligence Vision and Analysis Agent)** is the core microservice that powers the Material Kai Vision Platform's document processing, AI analysis, and knowledge extraction capabilities.

#### MIVAA Architecture
- **Framework**: FastAPI + Python 3.9+
- **Purpose**: PDF processing, RAG system, AI coordination
- **Features**: Document extraction, vector embeddings, semantic search
- **AI Integration**: OpenAI, HuggingFace, Replicate APIs
- **Database**: Supabase PostgreSQL with vector extensions

#### MIVAA Core Capabilities
1. **PDF Processing**: Advanced text and image extraction
2. **RAG System**: Retrieval-Augmented Generation for documents
3. **Vector Search**: Semantic similarity search
4. **AI Coordination**: Multi-provider AI service management
5. **Document Management**: Workspace-aware document organization

### Base URL
- **Development**: `http://localhost:8000`
- **Production**: `https://your-mivaa-service.com`

### Authentication
All MIVAA endpoints require JWT authentication:
```http
Authorization: Bearer your-jwt-token
```

### Core Endpoints

#### 1. PDF Processing

##### Extract Markdown
```http
POST /api/v1/extract/markdown
Content-Type: multipart/form-data

{
  "file": [PDF file],
  "options": {
    "preserve_formatting": true,
    "extract_metadata": true
  }
}
```

**Response**:
```json
{
  "success": true,
  "data": {
    "markdown_content": "# Document Title\n\nContent...",
    "metadata": {
      "pages": 10,
      "word_count": 1500,
      "processing_time": 2.5
    }
  }
}
```

##### Extract Tables
```http
POST /api/v1/extract/tables
```

##### Extract Images
```http
POST /api/v1/extract/images
```

#### 2. RAG System

##### Upload Documents
```http
POST /api/v1/rag/documents/upload
Content-Type: multipart/form-data

{
  "files": [PDF files],
  "workspace_id": "workspace-uuid",
  "options": {
    "chunk_size": 1000,
    "overlap": 200
  }
}
```

##### Query RAG System
```http
POST /api/v1/rag/query
Content-Type: application/json

{
  "query": "What are the material properties?",
  "workspace_id": "workspace-uuid",
  "max_results": 5,
  "similarity_threshold": 0.7
}
```

**Response**:
```json
{
  "success": true,
  "data": {
    "answer": "Material properties include...",
    "sources": [
      {
        "document_id": "doc-uuid",
        "chunk_id": "chunk-uuid",
        "content": "Relevant content...",
        "similarity_score": 0.85
      }
    ],
    "metadata": {
      "query_time": 0.5,
      "total_chunks_searched": 1000
    }
  }
}
```

##### Chat with Documents
```http
POST /api/v1/rag/chat
Content-Type: application/json

{
  "message": "Explain the safety requirements",
  "conversation_id": "conv-uuid",
  "workspace_id": "workspace-uuid"
}
```

#### 3. Search Endpoints

##### Semantic Search
```http
POST /api/v1/search/semantic
Content-Type: application/json

{
  "query": "steel properties",
  "workspace_id": "workspace-uuid",
  "filters": {
    "document_type": "pdf",
    "date_range": {
      "start": "2024-01-01",
      "end": "2024-12-31"
    }
  }
}
```

**Response**:
```json
{
  "success": true,
  "data": {
    "results": [
      {
        "document_id": "doc-uuid",
        "chunk_id": "chunk-uuid",
        "content": "Steel properties include...",
        "similarity_score": 0.92,
        "metadata": {
          "page_number": 5,
          "document_title": "Material Properties Guide"
        }
      }
    ],
    "total_results": 25,
    "query_time": 0.3
  }
}
```

##### Vector Search
```http
POST /api/v1/search/vector
Content-Type: application/json

{
  "embedding": [0.1, 0.2, ...], // 1536-dimensional vector
  "workspace_id": "workspace-uuid",
  "top_k": 10
}
```

#### 4. AI Integration Endpoints

##### Generate Embeddings
```http
POST /api/v1/embeddings/generate
Content-Type: application/json

{
  "text": "Material description text",
  "model": "text-embedding-ada-002",
  "workspace_id": "workspace-uuid"
}
```

##### AI Chat Completion
```http
POST /api/v1/chat/completions
Content-Type: application/json

{
  "messages": [
    {
      "role": "user",
      "content": "Explain the properties of steel"
    }
  ],
  "model": "gpt-4",
  "context_documents": ["doc-uuid-1", "doc-uuid-2"]
}
```

#### 5. Document Management Endpoints

##### List Documents
```http
GET /api/v1/documents?workspace_id=workspace-uuid&limit=20&offset=0
```

##### Get Document Details
```http
GET /api/v1/documents/{document_id}
```

##### Delete Document
```http
DELETE /api/v1/documents/{document_id}
```

#### 6. Workspace Management

##### Create Workspace
```http
POST /api/v1/workspaces
Content-Type: application/json

{
  "name": "My Workspace",
  "description": "Workspace for material research"
}
```

##### List User Workspaces
```http
GET /api/v1/workspaces
```

## 🔌 API Gateway Integration

### MIVAA Gateway Endpoint

The frontend communicates with MIVAA through a unified gateway:

```http
POST /api/mivaa/gateway
Authorization: Bearer material-kai-api-key
Content-Type: application/json

{
  "action": "generate_embedding",
  "payload": {
    "text": "Material description",
    "model": "text-embedding-ada-002"
  }
}
```

### Available Actions

| Action | Description | MIVAA Endpoint |
|--------|-------------|----------------|
| `generate_embedding` | Generate text embeddings | `/api/embeddings/generate` |
| `semantic_search` | Perform semantic search | `/api/search/semantic` |
| `extract_text` | Extract text from PDF | `/api/documents/extract` |
| `process_document` | Full document processing | `/api/documents/process` |
| `rag_query` | Query RAG system | `/api/rag/query` |
| `chat_completion` | Chat with AI | `/api/chat/completions` |

## 🌩️ Supabase Edge Functions

### Base URL
`https://bgbavxtjlbvgplozizxu.supabase.co/functions/v1/`

### Authentication
```http
Authorization: Bearer supabase-anon-key
```

### Available Functions

#### 1. Material Recognition
```http
POST /functions/v1/material-recognition
Content-Type: application/json

{
  "image_url": "https://example.com/image.jpg",
  "analysis_type": "material_properties"
}
```

#### 2. Enhanced RAG Search
```http
POST /functions/v1/enhanced-rag-search
Content-Type: application/json

{
  "query": "search query",
  "workspace_id": "workspace-uuid",
  "search_type": "hybrid"
}
```

#### 3. CrewAI 3D Generation
```http
POST /functions/v1/crewai-3d-generation
Content-Type: application/json

{
  "prompt": "Generate 3D model of steel beam",
  "room_type": "industrial",
  "style": "realistic"
}
```

#### 4. Material Scraper
```http
POST /functions/v1/material-scraper
Content-Type: application/json

{
  "url": "https://material-database.com/steel",
  "scrape_type": "material_properties"
}
```

#### 5. NeRF Processor
```http
POST /functions/v1/nerf-processor
Content-Type: application/json

{
  "images": ["url1", "url2", "url3"],
  "output_format": "ply",
  "quality": "high"
}
```

#### 6. SVBRDF Extractor
```http
POST /functions/v1/svbrdf-extractor
Content-Type: application/json

{
  "image_url": "https://example.com/material.jpg",
  "material_type": "metal"
}
```

## 🔗 External API Integrations

### 1. OpenAI API

**Used for**: Text embeddings, chat completions, image analysis

```typescript
// Configuration
const openaiConfig = {
  apiKey: process.env.OPENAI_API_KEY,
  baseURL: 'https://api.openai.com/v1',
  models: {
    embedding: 'text-embedding-ada-002',
    chat: 'gpt-4',
    vision: 'gpt-4-vision-preview'
  }
};
```

### 2. HuggingFace API

**Used for**: Alternative ML models, CLIP embeddings

```typescript
// Configuration
const huggingfaceConfig = {
  apiKey: process.env.HUGGINGFACE_API_KEY,
  baseURL: 'https://api-inference.huggingface.co',
  models: {
    clip: 'openai/clip-vit-base-patch32',
    embedding: 'sentence-transformers/all-MiniLM-L6-v2'
  }
};
```

### 3. Replicate API

**Used for**: 3D model generation, advanced AI models

```typescript
// Configuration
const replicateConfig = {
  apiToken: process.env.REPLICATE_API_TOKEN,
  baseURL: 'https://api.replicate.com/v1',
  models: {
    '3d-generation': 'stability-ai/stable-diffusion-3d',
    'image-analysis': 'yorickvp/llava-13b'
  }
};
```

## 🔐 API Security

### Authentication Methods

1. **JWT Tokens** (Primary)
   - Supabase-issued JWT tokens
   - Workspace-scoped access
   - Auto-refresh capability

2. **API Keys** (Secondary)
   - Material Kai API keys
   - Rate-limited access
   - Endpoint-specific permissions

3. **Service Keys** (Internal)
   - Service-to-service communication
   - Supabase service role key
   - Internal connection tokens

### Rate Limiting

| Endpoint Type | Rate Limit | Window |
|---------------|------------|--------|
| Authentication | 10 req/min | Per IP |
| Document Processing | 50 req/hour | Per user |
| Search/Query | 100 req/min | Per user |
| Health Checks | 1000 req/min | Per IP |

### CORS Configuration

**Current Issues**:
- Wildcard CORS in development
- Missing environment-specific origins

**Required Fix**:
```typescript
const corsOrigins = process.env.NODE_ENV === 'production'
  ? ['https://your-domain.com']
  : ['http://localhost:3000', 'http://localhost:5173'];
```

## 📊 API Monitoring

### Health Check Strategy

1. **Service Health**: Individual service status
2. **Dependency Health**: External service connectivity
3. **Performance Metrics**: Response times and throughput
4. **Error Tracking**: Error rates and types

### Metrics Endpoints

```http
GET /metrics
GET /api/v1/health
GET /performance/summary
```

## 🚨 Known API Issues

### 1. ESLint Configuration
- **Issue**: Lint command fails with invalid options
- **Impact**: Code quality checks not running
- **Fix**: Update ESLint configuration for new format

### 2. Missing Error Handling
- **Issue**: Inconsistent error responses across services
- **Impact**: Poor debugging experience
- **Fix**: Standardize error response format

### 3. No API Versioning
- **Issue**: No version strategy for API endpoints
- **Impact**: Breaking changes affect all clients
- **Fix**: Implement API versioning strategy

### 4. Incomplete Documentation
- **Issue**: Many endpoints lack proper documentation
- **Impact**: Developer experience issues
- **Fix**: Generate OpenAPI specifications

## 🔗 Related Documentation

- [Security & Authentication](./security-authentication.md) - API security
- [Setup & Configuration](./setup-configuration.md) - API configuration
- [AI & ML Services](./ai-ml-services.md) - AI API integrations
