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
1. **PDF Processing**: Advanced text and image extraction with PyMuPDF4LLM
2. **RAG System**: Retrieval-Augmented Generation with LlamaIndex integration
3. **Vector Search**: Semantic similarity search with optimized embeddings
4. **AI Coordination**: Multi-provider AI service management (OpenAI, TogetherAI, HuggingFace)
5. **Document Management**: Workspace-aware document organization
6. **Embedding Generation**: Text-embedding-ada-002 standardized embeddings (1536 dimensions)
7. **Semantic Analysis**: Advanced material analysis with LLaMA Vision models

### Base URL
- **Development**: `http://localhost:8000`
- **Production**: `https://your-mivaa-service.com`

### Authentication
All MIVAA endpoints require JWT authentication:
```http
Authorization: Bearer your-jwt-token
```

## 📄 **PDF Processing API** (`/api/v1/extract/`)

### Extract Markdown
```http
POST /api/v1/extract/markdown
Content-Type: multipart/form-data
```

**Parameters:**
- `file` (required): PDF file to process
- `page_number` (optional): Specific page to extract (default: all pages)

**Response:**
```json
{
  "success": true,
  "markdown": "# Document Title\n\nContent...",
  "metadata": {
    "pages": 10,
    "processing_time": 2.5
  }
}
```

### Extract Tables
```http
POST /api/v1/extract/tables
Content-Type: multipart/form-data
```

**Parameters:**
- `file` (required): PDF file to process
- `page_number` (optional): Specific page to extract tables from

**Response:** ZIP file containing CSV files of extracted tables

### Extract Images
```http
POST /api/v1/extract/images
Content-Type: multipart/form-data
```

**Parameters:**
- `file` (required): PDF file to process
- `page_number` (optional): Specific page to extract images from

**Response:** ZIP file containing extracted images and metadata JSON

## 🧠 **RAG System API** (`/api/v1/rag/`)

### Upload Documents
```http
POST /api/v1/rag/documents/upload
Content-Type: multipart/form-data
```

**Parameters:**
- `file` (required): Document file to upload
- `title` (optional): Document title
- `description` (optional): Document description
- `tags` (optional): JSON string of tags
- `chunk_size` (optional): Chunk size for processing (default: 1000)
- `chunk_overlap` (optional): Chunk overlap (default: 200)
- `enable_embedding` (optional): Enable automatic embedding generation (default: true)

**Response:**
```json
{
  "document_id": "doc_abc123",
  "title": "Material Analysis Report",
  "status": "processed",
  "chunks_created": 25,
  "embeddings_generated": true,
  "processing_time": 15.2,
  "message": "Document processed successfully"
}
```

### Query RAG System
```http
POST /api/v1/rag/query
Content-Type: application/json
```

**Request:**
```json
{
  "query": "What are the properties of steel?",
  "top_k": 5,
  "similarity_threshold": 0.7,
  "include_metadata": true,
  "enable_reranking": true,
  "document_ids": ["doc_abc123"]
}
```

**Response:**
```json
{
  "query": "What are the properties of steel?",
  "answer": "Steel is an alloy of iron and carbon...",
  "sources": [
    {
      "document_id": "doc_abc123",
      "chunk_id": "chunk_456",
      "content": "Steel properties include...",
      "similarity_score": 0.95,
      "metadata": {...}
    }
  ],
  "confidence_score": 0.92,
  "processing_time": 1.8,
  "retrieved_chunks": 5
}
```

### Chat with RAG
```http
POST /api/v1/rag/chat
Content-Type: application/json
```

**Request:**
```json
{
  "message": "Tell me about material properties",
  "conversation_id": "conv_123",
  "top_k": 5,
  "include_history": true,
  "document_ids": ["doc_abc123"]
}
```

**Response:**
```json
{
  "message": "Tell me about material properties",
  "response": "Material properties are characteristics that...",
  "conversation_id": "conv_123",
  "sources": [...],
  "processing_time": 2.1
}
```

### Search Documents
```http
POST /api/v1/rag/search
Content-Type: application/json
```

**Request:**
```json
{
  "query": "corrosion resistance",
  "search_type": "semantic",
  "top_k": 10,
  "similarity_threshold": 0.6,
  "document_ids": null,
  "include_content": true
}
```

**Response:**
```json
{
  "query": "corrosion resistance",
  "results": [
    {
      "document_id": "doc_abc123",
      "chunk_id": "chunk_789",
      "content": "Corrosion resistance refers to...",
      "similarity_score": 0.89,
      "metadata": {...}
    }
  ],
  "total_results": 15,
  "search_type": "semantic",
  "processing_time": 0.8
}
```

### List Documents
```http
GET /api/v1/rag/documents
```

**Query Parameters:**
- `limit` (optional): Number of documents to return (default: 50)
- `offset` (optional): Offset for pagination (default: 0)
- `search` (optional): Search term to filter documents

**Response:**
```json
{
  "documents": [
    {
      "document_id": "doc_abc123",
      "title": "Material Analysis Report",
      "description": "Comprehensive analysis of...",
      "tags": ["steel", "analysis"],
      "chunks_count": 25,
      "created_at": "2025-01-04T10:00:00Z",
      "status": "processed"
    }
  ],
  "total": 100,
  "limit": 50,
  "offset": 0
}
```

### Get Document Details
```http
GET /api/v1/rag/documents/{document_id}
```

### Delete Document
```http
DELETE /api/v1/rag/documents/{document_id}
```

### RAG Health Check
```http
GET /api/v1/rag/health
```

### RAG Statistics
```http
GET /api/v1/rag/stats
```

## 🤖 **AI Analysis API** (`/api/semantic-analysis`)

### Semantic Analysis with LLaMA Vision
```http
POST /api/semantic-analysis
Content-Type: multipart/form-data
```

**Parameters:**
- `image` (required): Image file for analysis
- `prompt` (optional): Custom analysis prompt
- `model` (optional): Model to use (default: meta-llama/Llama-3.2-90B-Vision-Instruct-Turbo)

**Response:**
```json
{
  "success": true,
  "message": "Semantic analysis completed successfully",
  "timestamp": "2025-01-04T10:00:00Z",
  "analysis": "This material appears to be polished granite with...",
  "confidence": 0.95,
  "model_used": "meta-llama/Llama-3.2-90B-Vision-Instruct-Turbo",
  "processing_time_ms": 1500,
  "metadata": {
    "cache_hit": false,
    "request_id": "req_abc123"
  }
}
```

## 🔍 **Search API** (`/api/search/`)

### Semantic Search
```http
POST /api/search/semantic
Content-Type: application/json
```

### Vector Search
```http
POST /api/search/vector
Content-Type: application/json
```

### Hybrid Search
```http
POST /api/search/hybrid
Content-Type: application/json
```

### Get Recommendations
```http
POST /api/search/recommendations
Content-Type: application/json
```

## 📊 **Analytics API**

### Get Analytics
```http
GET /api/analytics
```

## 🎵 **Audio API** (`/api/audio/`)

### Audio Transcription
```http
POST /api/audio/transcribe
Content-Type: multipart/form-data
```

## 💬 **Chat API** (`/api/chat/`)

### Chat Completions
```http
POST /api/chat/completions
Content-Type: application/json
```

### Contextual Response
```http
POST /api/chat/contextual
Content-Type: application/json
```

## 🔗 **Embeddings API** (`/api/embeddings/`)

### Generate Embedding
```http
POST /api/embeddings/generate
Content-Type: application/json
```

**Request:**
```json
{
  "text": "Steel is a strong material",
  "model": "text-embedding-ada-002",
  "dimensions": 1536
}
```

**Response:**
```json
{
  "success": true,
  "embedding": [0.1, -0.2, 0.3, ...],
  "dimensions": 1536,
  "model": "text-embedding-ada-002",
  "processing_time": 0.5
}
```

### Generate Batch Embeddings
```http
POST /api/embeddings/batch
Content-Type: application/json
```

### Generate CLIP Embeddings
```http
POST /api/embeddings/clip-generate
Content-Type: multipart/form-data
```

## 🏥 **Health & Monitoring API**

### Service Health Check
```http
GET /health
```

**Response:**
```json
{
  "service": "MIVAA PDF Extractor",
  "version": "1.0.0",
  "status": "running",
  "timestamp": "2025-01-04T10:00:00Z",
  "endpoints": {
    "health": "/health",
    "metrics": "/metrics",
    "performance": "/performance/summary",
    "docs": "/docs",
    "pdf_markdown": "/api/v1/extract/markdown",
    "pdf_tables": "/api/v1/extract/tables",
    "pdf_images": "/api/v1/extract/images",
    "api_health": "/api/v1/health",
    "rag_upload": "/api/v1/rag/documents/upload",
    "rag_query": "/api/v1/rag/query",
    "rag_chat": "/api/v1/rag/chat",
    "rag_search": "/api/v1/rag/search",
    "rag_documents": "/api/v1/rag/documents",
    "rag_health": "/api/v1/rag/health"
  }
}
```

### API Health Check
```http
GET /api/v1/health
```

### Performance Metrics
```http
GET /metrics
```

### Performance Summary
```http
GET /performance/summary
```

## 🔌 **MIVAA Gateway Integration**

The Material Kai Vision Platform uses a unified gateway to communicate with MIVAA services:

### Gateway Endpoint
```http
POST /api/mivaa/gateway
Content-Type: application/json
```

**Request:**
```json
{
  "action": "generate_embedding",
  "data": {
    "text": "Steel is a strong material",
    "model": "text-embedding-ada-002"
  },
  "workspace_id": "workspace-uuid"
}
```

### Available Gateway Actions

| Action | Description | MIVAA Endpoint |
|--------|-------------|----------------|
| `generate_embedding` | Generate text embeddings | `/api/embeddings/generate` |
| `generate_batch_embeddings` | Generate batch embeddings | `/api/embeddings/batch` |
| `semantic_search` | Perform semantic search | `/api/search/semantic` |
| `vector_search` | Perform vector search | `/api/search/vector` |
| `hybrid_search` | Perform hybrid search | `/api/search/hybrid` |
| `get_recommendations` | Get search recommendations | `/api/search/recommendations` |
| `get_analytics` | Get analytics data | `/api/analytics` |
| `semantic_analysis` | Semantic analysis with LLaMA Vision | `/api/semantic-analysis` |
| `llama_vision_analysis` | LLaMA Vision analysis | `/api/vision/llama-analyze` |
| `clip_embedding_generation` | Generate CLIP embeddings | `/api/embeddings/clip-generate` |
| `chat_completion` | Chat completions | `/api/chat/completions` |
| `contextual_response` | Contextual chat response | `/api/chat/contextual` |
| `audio_transcription` | Audio transcription | `/api/audio/transcribe` |
| `batch_embedding` | Batch embedding processing | `/api/embeddings/batch` |
| `extract_text` | Extract text from PDF | `/api/documents/extract` |
| `process_document` | Full document processing | `/api/documents/process` |
| `analyze_material` | Material analysis | `/api/materials/analyze` |

### Gateway Health Check
```http
GET /api/mivaa/health
```
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

#### Enhanced RAG Search
```http
POST /enhanced-rag-search
Content-Type: application/json
```

**Request:**
```json
{
  "query": "What are the properties of steel?",
  "search_type": "hybrid",
  "match_threshold": 0.7,
  "max_results": 10,
  "include_context": true
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "results": [
      {
        "id": "chunk_123",
        "content": "Steel properties include...",
        "similarity": 0.95,
        "metadata": {...}
      }
    ],
    "query_intent": "material_search",
    "processing_time": 1.2
  }
}
```

#### RAG Knowledge Search
```http
POST /rag-knowledge-search
Content-Type: application/json
```

**Request:**
```json
{
  "query": "corrosion resistance materials",
  "search_type": "semantic",
  "embedding_types": ["openai"],
  "match_threshold": 0.7,
  "match_count": 10,
  "include_context": true
}
```

#### Material Recognition
```http
POST /material-recognition
Content-Type: application/json
```

**Request:**
```json
{
  "fileUrl": "https://example.com/material-image.jpg",
  "description": "Analyze this material sample",
  "options": {
    "detection_methods": ["visual", "ai_vision"],
    "confidence_threshold": 0.7,
    "include_similar_materials": true,
    "extract_properties": true,
    "use_ai_vision": true
  }
}
```

#### CrewAI 3D Generation
```http
POST /crewai-3d-generation
Content-Type: application/json
```

**Request:**
```json
{
  "material_description": "Polished steel with reflective surface",
  "generation_type": "pbr_material",
  "quality": "high",
  "output_format": "gltf"
}
```

#### Material Scraper
```http
POST /material-scraper
Content-Type: application/json
```

**Request:**
```json
{
  "url": "https://material-database.com/steel-properties",
  "scrape_type": "material_properties",
  "extract_images": true,
  "extract_specifications": true
}
```

#### OCR Processing
```http
POST /ocr-processing
Content-Type: application/json
```

**Request:**
```json
{
  "image_url": "https://example.com/document.jpg",
  "language": "en",
  "extract_tables": true,
  "extract_text": true
}
```

#### SVBRDF Extractor
```http
POST /svbrdf-extractor
Content-Type: application/json
```

**Request:**
```json
{
  "image_url": "https://example.com/material-sample.jpg",
  "extraction_method": "ai_based",
  "output_resolution": "1024x1024"
}
```

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

## 🔧 Admin & Monitoring Endpoints

### Package Status Monitoring
```http
GET /api/packages/status
Host: mivaa-pdf-extractor:8000
```

**Description**: Get the status of all system packages and dependencies

**Response**:
```json
{
  "success": true,
  "data": {
    "packages": {
      "critical": {
        "fastapi": {
          "available": true,
          "version": "0.104.1",
          "description": "FastAPI web framework",
          "critical": true
        },
        "opencv-python-headless": {
          "available": true,
          "version": "4.8.0",
          "description": "Computer vision library (headless)",
          "critical": true
        }
      },
      "optional": {
        "llama-index": {
          "available": true,
          "version": "0.10.36",
          "description": "RAG framework for LLM applications",
          "critical": false
        }
      }
    },
    "summary": {
      "critical_missing": 0,
      "total_critical": 8,
      "total_optional": 10
    },
    "deployment_ready": true
  },
  "timestamp": "2025-10-05T13:30:00Z"
}
```

**Use Cases**:
- Monitor system health in admin panel
- Verify deployment readiness
- Track package versions
- Identify missing dependencies

### System Health Monitoring
```http
GET /api/health/detailed
Host: mivaa-pdf-extractor:8000
```

**Description**: Comprehensive system health check including dependencies

**Response**:
```json
{
  "service": "MIVAA PDF Extractor",
  "status": "healthy",
  "timestamp": "2025-10-05T13:30:00Z",
  "dependencies": {
    "opencv": {
      "available": true,
      "version": "4.8.0",
      "type": "headless"
    },
    "supabase": {
      "connected": true,
      "response_time": "45ms"
    },
    "database": {
      "status": "connected",
      "tables": 12
    }
  },
  "performance": {
    "cpu_usage": 15.2,
    "memory_usage": 45.8,
    "disk_usage": 23.1
  }
}
```

## 🔗 Related Documentation

- [Security & Authentication](./security-authentication.md) - API security
- [Setup & Configuration](./setup-configuration.md) - API configuration
- [AI & ML Services](./ai-ml-services.md) - AI API integrations
- [Admin Panel Guide](./admin-panel-guide.md) - Admin interface documentation
