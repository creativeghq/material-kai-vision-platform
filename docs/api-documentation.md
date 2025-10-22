# API Documentation

**Last Updated**: 2025-10-21
**Phase Status**: Phase 2 ✅ Complete, Phase 3 ⏳ Partial (Chunk Relationships Integrated)
**New Features**: ✅ Two-Stage Product Classification System (Task 6 Complete)

## 🌐 API Architecture Overview

The Material Kai Vision Platform uses a multi-layered API architecture:

1. **Frontend API Layer** - React application API calls
2. **Backend API Gateway** - Node.js/TypeScript API routing
3. **MIVAA Microservice** - Python FastAPI service
4. **Supabase Edge Functions** - Serverless functions (including Phase 2-3 quality & validation)
5. **External API Integrations** - Third-party services

## 📊 Quality & Validation APIs

### Quality Scoring Endpoint

#### Apply Quality Scoring
```http
POST /functions/v1/apply-quality-scoring
Authorization: Bearer {token}
Content-Type: application/json

{
  "document_id": "doc-123"
}
```

**Response**:
```json
{
  "document_id": "doc-123",
  "total_chunks": 45,
  "chunks_scored": 45,
  "average_quality_score": 38.7,
  "quality_breakdown": {
    "semantic_completeness": 42.3,
    "boundary_quality": 35.8,
    "context_preservation": 38.1,
    "structural_integrity": 40.2,
    "metadata_richness": 28.5
  },
  "timestamp": "2025-10-16T10:30:00Z"
}
```

**Purpose**: Scores all chunks in a document using 5-dimensional quality algorithm

### Embedding Stability Endpoint

#### Analyze Embedding Stability
```http
POST /functions/v1/analyze-embedding-stability
Authorization: Bearer {token}
Content-Type: application/json

{
  "document_id": "doc-123"
}
```

**Response**:
```json
{
  "document_id": "doc-123",
  "stability_score": 0.87,
  "variance_score": 0.12,
  "consistency_score": 0.91,
  "anomalies_detected": 2,
  "anomaly_details": [
    {
      "chunk_id": "chunk-5",
      "anomaly_score": 0.78,
      "reason": "High variance in embedding"
    }
  ],
  "timestamp": "2025-10-16T10:30:00Z"
}
```

**Purpose**: Analyzes embedding stability and detects anomalies

### Chunk Relationships Endpoint

#### Build Chunk Relationships
```http
POST /functions/v1/build-chunk-relationships
Authorization: Bearer {token}
Content-Type: application/json

{
  "document_id": "doc-123"
}
```

**Response**:
```json
{
  "document_id": "doc-123",
  "total_relationships": 156,
  "sequential_relationships": 44,
  "semantic_relationships": 89,
  "hierarchical_relationships": 23,
  "average_confidence": 0.82,
  "timestamp": "2025-10-16T10:30:00Z"
}
```

**Purpose**: Builds semantic, sequential, and hierarchical relationships between chunks

### Retrieval Quality Metrics Endpoint

#### Measure Retrieval Quality
```http
POST /functions/v1/rag-knowledge-search
Authorization: Bearer {token}
Content-Type: application/json

{
  "query": "fire resistant materials",
  "include_context": true,
  "measure_quality": true
}
```

**Response** (includes quality metrics):
```json
{
  "success": true,
  "results": [
    {
      "id": "chunk-123",
      "content": "...",
      "similarity_score": 0.92
    }
  ],
  "quality_metrics": {
    "precision": 0.88,
    "recall": 0.85,
    "mrr": 0.95,
    "latency_ms": 245
  },
  "context": "...",
  "response_quality": {
    "coherence_score": 0.92,
    "hallucination_score": 0.05,
    "source_attribution_score": 0.88,
    "factual_consistency_score": 0.90,
    "overall_quality_score": 0.88,
    "quality_assessment": "Excellent"
  }
}
```

**Purpose**: Measures retrieval quality (precision, recall, MRR) and response quality (coherence, hallucination detection, attribution)

**Quality Metrics Stored In**:
- `retrieval_quality_metrics` table - Stores precision, recall, MRR, latency
- `response_quality_metrics` table - Stores coherence, hallucination, attribution, consistency scores

### Response Quality Metrics Endpoint

#### Measure Response Quality
```http
POST /functions/v1/rag-knowledge-search
Authorization: Bearer {token}
Content-Type: application/json

{
  "query": "material properties",
  "include_context": true
}
```

**Response Quality Metrics**:
```json
{
  "response_quality": {
    "response_id": "resp-123",
    "query": "material properties",
    "coherence_score": 0.92,
    "hallucination_score": 0.05,
    "source_attribution_score": 0.88,
    "factual_consistency_score": 0.90,
    "overall_quality_score": 0.88,
    "quality_assessment": "Excellent",
    "issues_detected": []
  }
}
```

**Quality Assessment Levels**:
- **Excellent**: overall_quality_score >= 0.85
- **Good**: overall_quality_score >= 0.70
- **Poor**: overall_quality_score < 0.70

**Purpose**: Validates LLM response quality and detects hallucinations

## 🏭 **Two-Stage Product Classification API** ⭐ **NEW**

### Product Creation with Intelligent Classification

#### Create Products from Chunks (Two-Stage)
```http
POST /api/products/create-from-chunks
Authorization: Bearer {token}
Content-Type: application/json
```

**Request:**
```json
{
  "document_id": "doc-123",
  "workspace_id": "workspace-uuid",
  "max_products": 50,
  "min_chunk_length": 100
}
```

**Response:**
```json
{
  "success": true,
  "products_created": 14,
  "products_failed": 2,
  "chunks_processed": 16,
  "total_chunks": 211,
  "eligible_chunks": 189,
  "stage1_candidates": 16,
  "stage1_time": 3.2,
  "stage2_time": 28.7,
  "total_time": 31.9,
  "message": "Two-stage creation: 14 products from 16 candidates in 31.9s"
}
```

**Purpose**: Advanced two-stage product classification system that reduces processing time by 60% while improving accuracy

**Two-Stage Process**:
1. **Stage 1 (Claude 4.5 Haiku)**: Fast text-only classification for initial filtering
   - Processes chunks in batches of 10 for efficiency
   - Uses cheaper Haiku model for cost optimization
   - Filters out non-product content (index pages, sustainability, certifications)
   - Returns product candidates with confidence scores

2. **Stage 2 (Claude 4.5 Sonnet)**: Deep enrichment for confirmed candidates
   - Uses expensive Sonnet model only for confirmed products
   - Extracts detailed metadata (name, description, designer, dimensions, colors, materials)
   - Applies quality validation with confidence thresholds
   - Creates enriched product records with comprehensive metadata

**Performance Benefits**:
- **60% faster processing** through intelligent model selection
- **Reduced API costs** by using Haiku for initial filtering
- **Higher accuracy** through Sonnet enrichment only for confirmed candidates
- **Quality validation** with confidence thresholds and assessment

#### Products API Health Check
```http
GET /api/products/health
```

**Response:**
```json
{
  "status": "healthy",
  "service": "products-api",
  "version": "1.0.0",
  "features": {
    "two_stage_classification": true,
    "claude_haiku_integration": true,
    "claude_sonnet_integration": true,
    "batch_processing": true,
    "performance_metrics": true
  },
  "endpoints": {
    "create_from_chunks": "/api/products/create-from-chunks",
    "health": "/api/products/health"
  }
}
```

**Purpose**: Health check for the new Products API with two-stage classification capabilities

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

#### Additional Document Processing Endpoints

**Process Document from URL**:
```http
POST /api/documents/process-url
Authorization: Bearer {token}
Content-Type: application/json
```

**Analyze Document**:
```http
POST /api/documents/analyze
Content-Type: multipart/form-data
```

**Batch Process Documents**:
```http
POST /api/documents/batch-process-fixed
Content-Type: application/json
```

**List Documents**:
```http
GET /api/documents/documents
```

**Document Service Health**:
```http
GET /api/documents/health
```

### PDF Processing Endpoints

**Extract Markdown from PDF**:
```http
POST /api/pdf/extract/markdown
Content-Type: multipart/form-data
```

**Extract Tables from PDF**:
```http
POST /api/pdf/extract/tables
Content-Type: multipart/form-data
```

**Extract Images from PDF**:
```http
POST /api/pdf/extract/images
Content-Type: multipart/form-data
```

### Image Analysis Endpoints

**Analyze Image**:
```http
POST /api/images/analyze
Content-Type: application/json
```

**Batch Analyze Images**:
```http
POST /api/images/analyze/batch
Content-Type: application/json
```

**Search Images**:
```http
POST /api/images/search
Content-Type: application/json
```

**Upload and Analyze Image**:
```http
POST /api/images/upload-and-analyze
Content-Type: multipart/form-data
```

**Image Service Health**:
```http
GET /api/images/health
```

### Material Analysis Endpoints

**Analyze Material Image**:
```http
POST /api/analyze/materials/image
Authorization: Bearer {token}
Content-Type: application/json
```

**Visual Material Search**:
```http
POST /api/search/materials/visual
Authorization: Bearer {token}
Content-Type: application/json
```

**Generate Material Embeddings**:
```http
POST /api/embeddings/materials/generate
Authorization: Bearer {token}
Content-Type: application/json
```

**Material Search Health**:
```http
GET /api/search/materials/health
Authorization: Bearer {token}
```

### Search Endpoints

**Semantic Search**:
```http
POST /api/search/semantic
Authorization: Bearer {token}
Content-Type: application/json
```

**Similarity Search**:
```http
POST /api/search/similarity
Authorization: Bearer {token}
Content-Type: application/json
```

**Multimodal Search**:
```http
POST /api/search/multimodal
Authorization: Bearer {token}
Content-Type: application/json
```

**Image Search**:
```http
POST /api/search/images
Authorization: Bearer {token}
Content-Type: application/json
```

**Search Service Health**:
```http
GET /api/search/health
Authorization: Bearer {token}
```

### RAG System Endpoints

**RAG Query**:
```http
POST /api/rag/query
Authorization: Bearer {token}
Content-Type: application/json
```

**RAG Search**:
```http
POST /api/rag/search
Authorization: Bearer {token}
Content-Type: application/json
```

**RAG Chat**:
```http
POST /api/rag/chat
Authorization: Bearer {token}
Content-Type: application/json
```

**Upload RAG Document**:
```http
POST /api/rag/documents/upload
Content-Type: multipart/form-data
```

**List RAG Documents**:
```http
GET /api/rag/documents
Authorization: Bearer {token}
```

**RAG Service Health**:
```http
GET /api/rag/health
Authorization: Bearer {token}
```

**RAG Statistics**:
```http
GET /api/rag/stats
Authorization: Bearer {token}
```

### AI Analysis Endpoints

**Semantic Analysis**:
```http
POST /api/semantic-analysis
Authorization: Bearer {token}
Content-Type: application/json
```

**Multimodal Analysis**:
```http
POST /api/analyze/multimodal
Authorization: Bearer {token}
Content-Type: application/json
```

**Multimodal Query**:
```http
POST /api/query/multimodal
Authorization: Bearer {token}
Content-Type: application/json
```

### Data Management Endpoints

**Export Data**:
```http
GET /api/data/export
Authorization: Bearer {token}
```

**Backup Data**:
```http
POST /api/data/backup
Authorization: Bearer {token}
```

**Cleanup Data**:
```http
DELETE /api/data/cleanup
Authorization: Bearer {token}
```

### System Endpoints

**List Models**:
```http
GET /api/models
Authorization: Bearer {token}
```

**Package Status**:
```http
GET /api/packages/status
Authorization: Bearer {token}
```

**System Health**:
```http
GET /api/system/health
Authorization: Bearer {token}
```

**System Metrics**:
```http
GET /api/system/metrics
Authorization: Bearer {token}
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

### 📊 **MIVAA API Overview**

**Total Endpoints**: 37+ endpoints across 8 categories
**API Version**: v1.0.0
**Embedding Model**: text-embedding-ada-002 (1536 dimensions)
**Recent Enhancements**: Phase 3 - Unified Vector Search System (January 2025)
**Performance**: 80% faster search, 90% error reduction

### 🏥 **Health & Monitoring**

#### Service Health Check
```http
GET /health
```

**Response:**
```json
{
  "service": "MIVAA PDF Extractor",
  "version": "1.0.0",
  "status": "running",
  "timestamp": "2025-01-13T10:00:00Z",
  "endpoints": {
    "health": "/health",
    "metrics": "/metrics",
    "performance": "/performance/summary",
    "docs": "/docs",
    "pdf_markdown": "/api/v1/extract/markdown",
    "rag_upload": "/api/v1/rag/documents/upload"
  },
  "api_info": {
    "total_endpoints": 37,
    "authentication": "JWT Bearer Token Required",
    "embedding_model": "text-embedding-ada-002 (1536 dimensions)"
  }
}
```

#### Performance Metrics
```http
GET /metrics
```

#### Performance Summary
```http
GET /performance/summary
```

#### PDF Service Health
```http
GET /api/v1/extract/health
```

#### RAG Service Health
```http
GET /api/v1/rag/health
```

#### Search Service Health
```http
GET /api/search/health
```

#### Image Service Health
```http
GET /api/images/health
```

#### TogetherAI Service Health
```http
GET /api/health
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

## 📋 **Document Management API** (`/api/documents/`)

### Process Document
```http
POST /api/documents/process
Content-Type: multipart/form-data
```

**Parameters:**
- `file` (required): PDF file to process
- `extract_text` (optional): Extract text content (default: true)
- `extract_images` (optional): Extract images (default: true)
- `extract_tables` (optional): Extract tables (default: true)
- `generate_embeddings` (optional): Generate embeddings (default: true)
- `chunk_size` (optional): Text chunk size (default: 1000)
- `chunk_overlap` (optional): Chunk overlap (default: 200)

**Response:**
```json
{
  "success": true,
  "document_id": "doc_abc123",
  "job_id": "job_xyz789",
  "status": "processing",
  "estimated_completion": "2025-01-13T10:05:00Z",
  "processing_options": {
    "extract_text": true,
    "extract_images": true,
    "extract_tables": true,
    "generate_embeddings": true
  }
}
```

### Process Document from URL
```http
POST /api/documents/process-url
Content-Type: application/json
```

**Request:**
```json
{
  "url": "https://example.com/document.pdf",
  "extract_text": true,
  "extract_images": true,
  "extract_tables": true,
  "generate_embeddings": true
}
```

### Analyze Document Structure
```http
POST /api/documents/analyze
Content-Type: multipart/form-data
```

**Parameters:**
- `file` (required): PDF file to analyze
- `analysis_depth` (optional): Analysis depth level (basic, detailed, comprehensive)

### Get Job Status
```http
GET /api/documents/job/{job_id}
```

**Response:**
```json
{
  "job_id": "job_xyz789",
  "status": "completed",
  "progress": 100,
  "created_at": "2025-01-13T10:00:00Z",
  "completed_at": "2025-01-13T10:04:30Z",
  "result": {
    "document_id": "doc_abc123",
    "pages_processed": 25,
    "chunks_created": 150,
    "images_extracted": 12,
    "tables_extracted": 8
  }
}
```

### List Documents
```http
GET /api/documents/documents
```

**Query Parameters:**
- `page`: Page number (default: 1)
- `page_size`: Items per page (default: 20, max: 100)
- `search`: Search query for document content
- `tags`: Filter by tags (comma-separated)
- `status`: Filter by status (processed, processing, failed)

### Get Document Metadata
```http
GET /api/documents/documents/{document_id}
```

### Get Document Content
```http
GET /api/documents/documents/{document_id}/content
```

**Query Parameters:**
- `include_raw`: Include raw extracted content (default: false)
- `include_markdown`: Include markdown formatted content (default: true)
- `include_chunks`: Include content chunks (default: false)
- `include_images`: Include extracted images (default: false)

### Delete Document
```http
DELETE /api/documents/documents/{document_id}
```

## 🖼️ **Image Analysis API** (`/api/images/`)

### Analyze Image
```http
POST /api/images/analyze
Content-Type: application/json
```

**Request:**
```json
{
  "image_url": "https://example.com/image.jpg",
  "analysis_types": ["description", "ocr", "material_recognition"],
  "confidence_threshold": 0.5,
  "include_metadata": true
}
```

**Response:**
```json
{
  "success": true,
  "analysis_id": "analysis_123",
  "results": {
    "description": "A ceramic tile with blue and white pattern",
    "ocr_text": "Product Code: CT-001",
    "material_recognition": {
      "material_type": "ceramic",
      "confidence": 0.92,
      "properties": ["waterproof", "durable"]
    }
  },
  "metadata": {
    "processing_time": 2.1,
    "model_used": "material-kai-vision-v1"
  }
}
```

### Batch Image Analysis
```http
POST /api/images/analyze/batch
Content-Type: application/json
```

### Search Similar Images
```http
POST /api/images/search
Content-Type: application/json
```

### Upload and Analyze Image
```http
POST /api/images/upload-and-analyze
Content-Type: multipart/form-data
```

**Parameters:**
- `file` (required): Image file to analyze
- `analysis_types` (optional): Analysis types (default: "description,ocr")
- `confidence_threshold` (optional): Confidence threshold (default: 0.5)

## 🔍 **Search API** (`/api/search/`)

### Document Query
```http
POST /api/search/documents/{document_id}/query
Content-Type: application/json
```

**Request:**
```json
{
  "query": "What are the thermal properties?",
  "max_results": 5,
  "include_context": true,
  "similarity_threshold": 0.7
}
```

### Semantic Search
```http
POST /api/search/semantic
Content-Type: application/json
```

**Request:**
```json
{
  "query": "high strength materials",
  "max_results": 10,
  "document_ids": ["doc_1", "doc_2"],
  "similarity_threshold": 0.6,
  "include_metadata": true
}
```

**Response:**
```json
{
  "success": true,
  "query": "high strength materials",
  "results": [
    {
      "document_id": "doc_abc123",
      "chunk_id": "chunk_456",
      "content": "High strength materials include...",
      "similarity_score": 0.89,
      "metadata": {
        "page": 15,
        "section": "Material Properties"
      }
    }
  ],
  "total_results": 25,
  "processing_time": 1.2
}
```

### Vector Similarity Search
```http
POST /api/search/similarity
Content-Type: application/json
```

**Request:**
```json
{
  "text": "corrosion resistant coating",
  "top_k": 10,
  "similarity_threshold": 0.7,
  "include_scores": true
}
```

### Multi-Modal Search
```http
POST /api/search/multimodal
Content-Type: application/json
```

**Request:**
```json
{
  "query": "blue ceramic tiles",
  "image_url": "https://example.com/tile.jpg",
  "search_types": ["text", "image", "combined"],
  "max_results": 15,
  "boost_factors": {
    "text_weight": 0.6,
    "image_weight": 0.4
  }
}
```

### Image Search
```http
POST /api/search/images
Content-Type: application/json
```

**Request:**
```json
{
  "query": "marble texture patterns",
  "image_filters": {
    "material_type": "stone",
    "color_range": ["white", "gray", "black"]
  },
  "analysis_depth": "detailed"
}
```

### Material Visual Search
```http
POST /api/search/materials/visual
Content-Type: application/json
```

**Request:**
```json
{
  "image_url": "https://example.com/material.jpg",
  "material_filters": {
    "category": "tiles",
    "properties": ["waterproof", "slip_resistant"]
  },
  "similarity_threshold": 0.8
}
```

### Find Related Documents
```http
GET /api/search/documents/{document_id}/related
```

**Query Parameters:**
- `max_results`: Maximum number of related documents (default: 10)
- `similarity_threshold`: Minimum similarity score (default: 0.6)
- `include_metadata`: Include document metadata (default: true)

### Document Summarization
```http
POST /api/search/documents/{document_id}/summarize
Content-Type: application/json
```

**Request:**
```json
{
  "summary_type": "extractive",
  "max_length": 500,
  "focus_areas": ["properties", "applications", "specifications"]
}
```

### Entity Extraction
```http
POST /api/search/documents/{document_id}/extract-entities
Content-Type: application/json
```

**Request:**
```json
{
  "entity_types": ["materials", "properties", "measurements", "organizations"],
  "confidence_threshold": 0.7
}
```

### Document Comparison
```http
POST /api/search/documents/compare
Content-Type: application/json
```

**Request:**
```json
{
  "document_ids": ["doc_1", "doc_2", "doc_3"],
  "comparison_aspects": ["content", "structure", "materials"],
  "include_differences": true,
  "include_similarities": true
}
```

### Multi-Modal Analysis
```http
POST /api/search/analyze/multimodal
Content-Type: application/json
```

### Material Image Analysis
```http
POST /api/search/analyze/materials/image
Content-Type: application/json
```

### Generate Material Embeddings
```http
POST /api/search/embeddings/materials/generate
Content-Type: application/json
```

### Find Similar Materials
```http
GET /api/search/materials/{material_id}/similar
```

## 🔗 **Embedding API** (`/api/embeddings/`)

### Generate Embeddings
```http
POST /api/embeddings/generate
Content-Type: application/json
```

**Request:**
```json
{
  "text": "High performance ceramic material with excellent thermal properties",
  "model": "text-embedding-ada-002",
  "normalize": true
}
```

**Response:**
```json
{
  "success": true,
  "embedding": [0.1234, -0.5678, 0.9012, ...],
  "dimensions": 1536,
  "model": "text-embedding-ada-002",
  "processing_time": 0.3
}
```

### Batch Embeddings
```http
POST /api/embeddings/batch
Content-Type: application/json
```

**Request:**
```json
{
  "texts": [
    "Ceramic tile with high durability",
    "Marble surface with natural patterns",
    "Glass panel with UV resistance"
  ],
  "model": "text-embedding-ada-002",
  "normalize": true
}
```

### CLIP Embeddings
```http
POST /api/embeddings/clip-generate
Content-Type: application/json
```

**Request:**
```json
{
  "image_url": "https://example.com/material.jpg",
  "text": "blue ceramic tile",
  "mode": "multimodal"
}
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

**Parameters:**
- `image` (required): Image file for CLIP embedding generation
- `text` (optional): Text to combine with image for multimodal embedding

**Response:**
```json
{
  "success": true,
  "embedding": [0.1234, -0.5678, 0.9012, ...],
  "dimensions": 512,
  "model": "clip-vit-base-patch32",
  "processing_time": 0.8
}
```

## 💬 **Chat API** (`/api/chat/`)

### Chat Completions
```http
POST /api/chat/completions
Content-Type: application/json
```

**Request:**
```json
{
  "messages": [
    {
      "role": "user",
      "content": "What are the best materials for outdoor applications?"
    }
  ],
  "model": "gpt-4",
  "max_tokens": 500,
  "temperature": 0.7,
  "include_sources": true
}
```

**Response:**
```json
{
  "success": true,
  "response": "For outdoor applications, the best materials include...",
  "model": "gpt-4",
  "usage": {
    "prompt_tokens": 45,
    "completion_tokens": 120,
    "total_tokens": 165
  },
  "sources": [
    {
      "document_id": "doc_123",
      "relevance_score": 0.89
    }
  ]
}
```

### Contextual Response
```http
POST /api/chat/contextual
Content-Type: application/json
```

**Request:**
```json
{
  "message": "Compare these two materials",
  "context": {
    "document_ids": ["doc_1", "doc_2"],
    "material_ids": ["mat_1", "mat_2"]
  },
  "response_format": "detailed_comparison"
}
```

## 🔧 **Admin API** (`/api/admin/`)

### Job Management

#### List Jobs
```http
GET /api/admin/jobs
```

**Query Parameters:**
- `status`: Filter by job status (pending, processing, completed, failed)
- `job_type`: Filter by job type (pdf_processing, image_analysis, batch_processing)
- `page`: Page number (default: 1)
- `page_size`: Items per page (default: 20)

#### Get Job Status
```http
GET /api/admin/jobs/{job_id}
```

#### Get Job Statistics
```http
GET /api/admin/jobs/statistics
```

#### Cancel Job
```http
DELETE /api/admin/jobs/{job_id}
```

#### Get Job Progress
```http
GET /api/admin/jobs/{job_id}/progress
```

#### Stream Job Progress
```http
GET /api/admin/jobs/{job_id}/progress/stream
```

**Response**: Server-Sent Events (SSE) stream

### Bulk Operations

#### Bulk Process Documents
```http
POST /api/admin/bulk/process
Content-Type: application/json
```

**Request:**
```json
{
  "documents": [
    {
      "url": "https://example.com/doc1.pdf",
      "title": "Material Guide 1"
    }
  ],
  "processing_options": {
    "extract_text": true,
    "extract_images": true,
    "generate_embeddings": true
  }
}
```

### System Management

#### System Health
```http
GET /api/admin/system/health
```

#### System Metrics
```http
GET /api/admin/system/metrics
```

#### Package Status
```http
GET /api/admin/packages/status
```

### Data Management

#### Data Cleanup
```http
DELETE /api/admin/data/cleanup
```

#### Create Data Backup
```http
POST /api/admin/data/backup
```

#### Export System Data
```http
GET /api/admin/data/export
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

## 🤖 **TogetherAI API** (`/api/`)

### Semantic Analysis
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
  "analysis": "This image shows a ceramic tile with a blue and white geometric pattern...",
  "confidence": 0.95,
  "model_used": "meta-llama/Llama-3.2-90B-Vision-Instruct-Turbo",
  "processing_time_ms": 1500,
  "metadata": {
    "cache_hit": false,
    "request_id": "req_abc123"
  }
}
```

### TogetherAI Health Check
```http
GET /api/health
```

### Available Models
```http
GET /api/models
```

**Response:**
```json
{
  "success": true,
  "models": [
    {
      "id": "meta-llama/Llama-3.2-90B-Vision-Instruct-Turbo",
      "type": "vision",
      "capabilities": ["image_analysis", "text_generation"],
      "status": "available"
    }
  ]
}
```

## 📊 **Complete MIVAA Endpoint Summary**

### **PDF Processing** (4 endpoints)
- `POST /api/v1/extract/markdown` - Extract markdown from PDF
- `POST /api/v1/extract/tables` - Extract tables from PDF
- `POST /api/v1/extract/images` - Extract images from PDF
- `GET /api/v1/extract/health` - PDF service health check

### **Products API** (2 endpoints) ⭐ **NEW**
- `POST /api/products/create-from-chunks` - Two-stage product classification
- `GET /api/products/health` - Products API health check

### **RAG System** (10 endpoints)
- `POST /api/v1/rag/documents/upload` - Upload documents
- `POST /api/v1/rag/query` - Query documents
- `POST /api/v1/rag/chat` - Chat with documents
- `POST /api/v1/rag/search` - Search documents
- `GET /api/v1/rag/documents` - List documents
- `DELETE /api/v1/rag/documents/{id}` - Delete document
- `GET /api/v1/rag/health` - RAG service health
- `GET /api/v1/rag/stats` - RAG statistics
- `POST /api/v1/rag/search/mmr` - MMR search
- `POST /api/v1/rag/search/advanced` - Advanced query search

### **Document Management** (13 endpoints)
- `POST /api/documents/process` - Process document
- `POST /api/documents/process-url` - Process from URL
- `POST /api/documents/analyze` - Analyze document structure
- `GET /api/documents/job/{id}` - Get job status
- `GET /api/documents/documents` - List documents
- `GET /api/documents/documents/{id}` - Get document metadata
- `GET /api/documents/documents/{id}/content` - Get document content
- `DELETE /api/documents/documents/{id}` - Delete document
- `GET /api/documents/health` - Document service health
- `POST /api/documents/test-batch` - Test batch endpoint
- `POST /api/documents/new-batch-process` - New batch process
- `POST /api/documents/batch-process-fixed` - Fixed batch process
- `POST /api/documents/batch-process-test` - Test batch process

### **Search API** (17 endpoints)
- `POST /api/search/documents/{id}/query` - Query specific document
- `POST /api/search/semantic` - Semantic search
- `POST /api/search/similarity` - Vector similarity search
- `GET /api/search/documents/{id}/related` - Find related documents
- `POST /api/search/documents/{id}/summarize` - Generate summary
- `POST /api/search/documents/{id}/extract-entities` - Extract entities
- `POST /api/search/documents/compare` - Compare documents
- `GET /api/search/health` - Search service health
- `POST /api/search/multimodal` - Multi-modal search
- `POST /api/search/query/multimodal` - Multi-modal RAG query
- `POST /api/search/images` - Image-specific search
- `POST /api/search/analyze/multimodal` - Multi-modal analysis
- `POST /api/search/materials/visual` - Material visual search
- `POST /api/search/analyze/materials/image` - Analyze material image
- `POST /api/search/embeddings/materials/generate` - Generate material embeddings
- `GET /api/search/materials/{id}/similar` - Find similar materials
- `GET /api/search/materials/health` - Material search health

### **Image Analysis** (5 endpoints)
- `POST /api/images/analyze` - Analyze image
- `POST /api/images/analyze/batch` - Batch image analysis
- `POST /api/images/search` - Search similar images
- `POST /api/images/upload-and-analyze` - Upload and analyze image
- `GET /api/images/health` - Image service health

### **Admin API** (16 endpoints)
- `GET /api/admin/jobs` - List jobs
- `GET /api/admin/jobs/statistics` - Job statistics
- `GET /api/admin/jobs/{id}` - Get job status
- `GET /api/admin/jobs/{id}/status` - Alternative job status
- `DELETE /api/admin/jobs/{id}` - Cancel job
- `POST /api/admin/bulk/process` - Bulk process documents
- `GET /api/admin/system/health` - System health
- `GET /api/admin/system/metrics` - System metrics
- `DELETE /api/admin/data/cleanup` - Data cleanup
- `POST /api/admin/data/backup` - Create backup
- `GET /api/admin/data/export` - Export data
- `GET /api/admin/packages/status` - Package status
- `GET /api/admin/jobs/{id}/progress` - Job progress
- `GET /api/admin/jobs/progress/active` - Active job progress
- `GET /api/admin/jobs/{id}/progress/pages` - Page progress
- `GET /api/admin/jobs/{id}/progress/stream` - Stream progress

### **TogetherAI API** (3 endpoints)
- `POST /api/semantic-analysis` - Semantic analysis
- `GET /api/health` - TogetherAI health check
- `GET /api/models` - Available models

### **Health & Monitoring** (4 endpoints)
- `GET /health` - Service health check
- `GET /metrics` - Performance metrics
- `GET /performance/summary` - Performance summary
- `GET /api/v1/health` - API health check

**Total MIVAA Endpoints**: 74 endpoints across 9 categories (including new Products API)

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

| Action | Description | MIVAA Endpoint | Status |
|--------|-------------|----------------|---------|
| `health_check` | Check MIVAA service health | `/health` | ✅ Working |
| `pdf_process_document` | Process PDF documents | `/api/documents/process-url` | ✅ Working |
| `semantic_search` | Perform semantic search | `/api/search/semantic` | ✅ Working |
| `multimodal_analysis` | Multi-modal AI analysis | `/api/analyze/multimodal` | ✅ Working |
| `generate_embedding` | Generate text embeddings | `/api/embeddings/generate` | ❌ Endpoint Missing |
| `material_recognition` | Material recognition from images | `/api/vision/analyze` | ❌ Endpoint Missing |
| `llama_vision_analysis` | LLaMA Vision analysis | `/api/vision/llama-analyze` | ⚠️ Requires Image Data |
| `chat_completion` | Chat with AI | `/api/chat/completions` | ❌ Endpoint Missing |
| `vector_search` | Perform vector search | `/api/search/vector` | ❌ Endpoint Missing |
| `clip_embedding_generation` | Generate CLIP embeddings | `/api/embeddings/clip-generate` | ❌ Endpoint Missing |
| `extract_text` | Extract text from PDF | `/api/documents/extract` | ✅ Working |
| `rag_query` | Query RAG system | `/api/rag/query` | ✅ Working |

### Gateway Action Examples

#### Health Check
```http
POST /api/mivaa/gateway
Content-Type: application/json

{
  "action": "health_check",
  "payload": {}
}
```

#### PDF Document Processing
```http
POST /api/mivaa/gateway
Content-Type: application/json

{
  "action": "pdf_process_document",
  "payload": {
    "url": "https://example.com/document.pdf",
    "extract_images": true,
    "extract_tables": true
  }
}
```

#### LLaMA Vision Analysis
```http
POST /api/mivaa/gateway
Content-Type: application/json

{
  "action": "llama_vision_analysis",
  "payload": {
    "image_data": "base64_encoded_image_data",
    "prompt": "Analyze this material image"
  }
}
```

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

### Job Management Endpoints

#### List All Jobs
```http
GET /api/jobs
Authorization: Bearer {token}
```

**Query Parameters**:
- `status` (optional): Filter by job status (queued, running, completed, failed)
- `job_type` (optional): Filter by job type (document_processing, bulk_processing, etc.)
- `page` (optional): Page number for pagination (default: 1)
- `page_size` (optional): Items per page (default: 20, max: 100)

**Response**:
```json
{
  "success": true,
  "message": "Jobs retrieved successfully",
  "timestamp": "2025-01-01T00:00:00Z",
  "jobs": [
    {
      "job_id": "bulk_20251011_175237",
      "job_type": "bulk_processing",
      "status": "completed",
      "priority": "normal",
      "created_at": "2025-01-01T00:00:00Z",
      "completed_at": "2025-01-01T00:02:00Z",
      "progress_percentage": 100,
      "description": "Process research paper",
      "success": true
    }
  ],
  "total_count": 1,
  "page": 1,
  "page_size": 20
}
```

#### Get Job Status
```http
GET /api/jobs/{job_id}
Authorization: Bearer {token}
```

**Note**: This endpoint currently has validation issues. Use the jobs list endpoint as a workaround.

**Response**:
```json
{
  "success": true,
  "message": "Job status retrieved successfully",
  "timestamp": "2025-01-01T00:00:00Z",
  "data": {
    "job_id": "job_123",
    "job_type": "document_processing",
    "status": "running",
    "priority": "normal",
    "created_at": "2025-01-01T00:00:00Z",
    "progress": {
      "current_step": "Processing page 5",
      "completed_steps": 5,
      "total_steps": 10,
      "progress_percentage": 50
    }
  }
}
```

#### Cancel Job
```http
DELETE /api/jobs/{job_id}
Authorization: Bearer {token}
```

**Response**:
```json
{
  "success": true,
  "message": "Job cancelled successfully",
  "timestamp": "2025-01-01T00:00:00Z"
}
```

#### Get Job Statistics
```http
GET /api/jobs/statistics
Authorization: Bearer {token}
```

**Response**:
```json
{
  "success": true,
  "message": "Job statistics retrieved successfully",
  "timestamp": "2025-01-01T00:00:00Z",
  "data": {
    "total_jobs": 150,
    "status_counts": {
      "queued": 5,
      "running": 3,
      "completed": 140,
      "failed": 2
    },
    "average_processing_time": 45.2,
    "success_rate": 0.987
  }
}
```

#### Bulk Processing (Async)
```http
POST /api/bulk/process
Authorization: Bearer {token}
Content-Type: application/json
```

**Request Body**:
```json
{
  "urls": [
    "https://example.com/document1.pdf",
    "https://example.com/document2.pdf"
  ],
  "batch_size": 5,
  "processing_options": {
    "extract_text": true,
    "extract_images": true,
    "extract_tables": true
  }
}
```

**Response**:
```json
{
  "success": true,
  "message": "Bulk processing started successfully",
  "timestamp": "2025-01-01T00:00:00Z",
  "data": {
    "job_id": "bulk_20251011_175237",
    "total_documents": 2,
    "estimated_completion_time": "2025-01-01T00:05:00Z"
  }
}
```

### Async Processing Workflow

The Material Kai Vision Platform supports asynchronous processing for large PDFs and bulk operations to avoid timeout issues.

#### When to Use Async Processing

- **Large PDFs** (>20MB): Files that may take longer than 2-3 minutes to process
- **Bulk Operations**: Processing multiple documents simultaneously
- **Complex Processing**: Full extraction with images, tables, and text analysis
- **Timeout Avoidance**: When synchronous processing hits Supabase Edge Function limits

#### Async Workflow Steps

1. **Submit Job**: Use `/api/bulk/process` endpoint to submit documents for async processing
2. **Get Job ID**: Response contains a unique job ID for tracking
3. **Poll Status**: Use `/api/jobs` to check job status (recommended: 5-second intervals)
4. **Retrieve Results**: When status = "completed", results are available in the job data

#### Example Async Implementation

```javascript
// Step 1: Submit async job
const response = await fetch('/api/bulk/process', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer ' + token,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    urls: [pdfUrl],
    batch_size: 1
  })
});

const { data } = await response.json();
const jobId = data.job_id;

// Step 2: Poll for completion
const pollJob = async () => {
  const jobsResponse = await fetch('/api/jobs', {
    headers: { 'Authorization': 'Bearer ' + token }
  });

  const { jobs } = await jobsResponse.json();
  const job = jobs.find(j => j.job_id === jobId);

  if (job.status === 'completed') {
    return job; // Processing complete
  } else if (job.status === 'failed') {
    throw new Error('Job failed');
  } else {
    // Still processing, wait and retry
    await new Promise(resolve => setTimeout(resolve, 5000));
    return pollJob();
  }
};

const completedJob = await pollJob();
```

### Metrics Endpoints

```http
GET /metrics
GET /api/v1/health
GET /performance/summary
```

## 🔧 Job Management API

### List All Jobs
```http
GET /api/jobs
```

**Response:**
```json
{
  "success": true,
  "message": "Jobs retrieved successfully",
  "timestamp": "2025-01-13T10:00:00Z",
  "jobs": [
    {
      "job_id": "bulk_20250113_100000",
      "job_type": "bulk_processing",
      "status": "completed",
      "priority": "normal",
      "created_at": "2025-01-13T10:00:00Z",
      "completed_at": "2025-01-13T10:05:00Z",
      "progress": 100,
      "total_documents": 5,
      "processed_documents": 5
    }
  ],
  "total_jobs": 1,
  "active_jobs": 0
}
```

### Get Job Status
```http
GET /api/jobs/{job_id}/status
```

**Response:**
```json
{
  "success": true,
  "job_id": "bulk_20250113_100000",
  "status": "completed",
  "progress": 100,
  "total_documents": 5,
  "processed_documents": 5,
  "failed_documents": 0,
  "estimated_completion": "2025-01-13T10:05:00Z",
  "created_at": "2025-01-13T10:00:00Z",
  "updated_at": "2025-01-13T10:05:00Z"
}
```

### Cancel Job
```http
POST /api/jobs/{job_id}/cancel
```

**Response:**
```json
{
  "success": true,
  "message": "Job cancelled successfully",
  "job_id": "bulk_20250113_100000",
  "status": "cancelled",
  "timestamp": "2025-01-13T10:02:00Z"
}
```

### Start Bulk Processing
```http
POST /api/bulk/process
Content-Type: application/json
```

**Request:**
```json
{
  "documents": [
    {
      "url": "https://example.com/doc1.pdf",
      "name": "Document 1"
    },
    {
      "url": "https://example.com/doc2.pdf",
      "name": "Document 2"
    }
  ],
  "options": {
    "extract_images": true,
    "extract_tables": true,
    "priority": "normal"
  }
}
```

**Response:**
```json
{
  "success": true,
  "message": "Bulk processing started successfully",
  "timestamp": "2025-01-13T10:00:00Z",
  "data": {
    "job_id": "bulk_20250113_100000",
    "total_documents": 2,
    "estimated_completion_time": "2025-01-13T10:10:00Z",
    "status": "processing"
  }
}
```

### Get Job Statistics
```http
GET /api/jobs/statistics
```

**Response:**
```json
{
  "success": true,
  "message": "Job statistics retrieved successfully",
  "data": {
    "total_jobs": 25,
    "active_jobs": 3,
    "completed_jobs": 20,
    "failed_jobs": 2,
    "cancelled_jobs": 0,
    "status_distribution": {
      "completed": 20,
      "processing": 3,
      "failed": 2
    },
    "type_distribution": {
      "bulk_processing": 15,
      "single_document": 10
    },
    "average_processing_time_minutes": 5.2,
    "success_rate_percent": 88.0
  }
}
```

## 🚨 Known API Issues

### 1. MIVAA Gateway Endpoint Mismatches
- **Issue**: Several gateway actions fail due to incorrect endpoint mappings
- **Impact**: Material recognition, embeddings, and chat features not working
- **Fix**: Update MIVAA gateway endpoint mappings to match actual API
- **Affected Actions**: `material_recognition`, `generate_embedding`, `chat_completion`, `vector_search`, `clip_embedding_generation`

### 2. Missing Job Management Endpoints
- **Issue**: Job-related endpoints exist in OpenAPI spec but not documented
- **Impact**: Batch processing and job monitoring not properly documented
- **Missing Endpoints**:
  - `GET /api/jobs` - List all jobs
  - `GET /api/jobs/{job_id}/status` - Get job status
  - `POST /api/jobs/{job_id}/cancel` - Cancel job
  - `POST /api/bulk/process` - Start bulk processing
  - `GET /api/jobs/statistics` - Get job statistics

### 3. Multipart File Upload Endpoints
- **Issue**: Several endpoints require multipart/form-data but only documented as JSON
- **Impact**: File upload functionality not properly documented
- **Affected Endpoints**:
  - `POST /api/pdf/extract/markdown`
  - `POST /api/pdf/extract/tables`
  - `POST /api/pdf/extract/images`
  - `POST /api/documents/analyze`
  - `POST /api/documents/process`
  - `POST /api/rag/documents/upload`
  - `POST /api/images/upload-and-analyze`

### 4. Missing Error Handling Documentation
- **Issue**: Inconsistent error responses across services
- **Impact**: Poor debugging experience
- **Fix**: Standardize error response format

### 5. No API Versioning Strategy
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

## 🛍️ Products & E-Commerce APIs

### Shopping Cart API

#### Create Shopping Cart
```http
POST /functions/v1/shopping-cart-api
Authorization: Bearer {token}
Content-Type: application/json

{
  "workspace_id": "workspace-123"
}
```

**Response**:
```json
{
  "data": {
    "id": "cart-123",
    "user_id": "user-456",
    "workspace_id": "workspace-123",
    "status": "active",
    "total_items": 0,
    "created_at": "2025-10-19T10:00:00Z",
    "updated_at": "2025-10-19T10:00:00Z"
  }
}
```

#### Get Cart with Items
```http
GET /functions/v1/shopping-cart-api?cart_id=cart-123
Authorization: Bearer {token}
```

#### Add Item to Cart
```http
POST /functions/v1/shopping-cart-api
Authorization: Bearer {token}
Content-Type: application/json

{
  "cart_id": "cart-123",
  "product_id": "prod-001",
  "quantity": 2,
  "unit_price": 99.99,
  "notes": "Optional notes"
}
```

#### Remove Item from Cart
```http
DELETE /functions/v1/shopping-cart-api
Authorization: Bearer {token}
Content-Type: application/json

{
  "cart_id": "cart-123",
  "item_id": "item-456"
}
```

#### Update Cart Status
```http
PATCH /functions/v1/shopping-cart-api
Authorization: Bearer {token}
Content-Type: application/json

{
  "cart_id": "cart-123",
  "status": "submitted"
}
```

### Quote Request API

#### Submit Quote Request
```http
POST /functions/v1/quote-request-api
Authorization: Bearer {token}
Content-Type: application/json

{
  "cart_id": "cart-123",
  "workspace_id": "workspace-123",
  "notes": "Special requests"
}
```

**Response**:
```json
{
  "data": {
    "id": "quote-123",
    "user_id": "user-456",
    "cart_id": "cart-123",
    "status": "pending",
    "items_count": 3,
    "total_estimated": 349.97,
    "notes": "Special requests",
    "created_at": "2025-10-19T10:00:00Z"
  }
}
```

#### Get Quote Requests
```http
GET /functions/v1/quote-request-api?limit=50&offset=0&admin=false
Authorization: Bearer {token}
```

#### Get Quote Request Details
```http
GET /functions/v1/quote-request-api?request_id=quote-123
Authorization: Bearer {token}
```

#### Update Quote Request Status
```http
PATCH /functions/v1/quote-request-api
Authorization: Bearer {token}
Content-Type: application/json

{
  "request_id": "quote-123",
  "status": "updated"
}
```

### Proposals API

#### Create Proposal (Admin Only)
```http
POST /functions/v1/proposals-api
Authorization: Bearer {admin_token}
Content-Type: application/json

{
  "quote_request_id": "quote-123",
  "items": [
    {
      "product_id": "prod-001",
      "quantity": 2,
      "unit_price": 99.99,
      "total": 199.98
    }
  ],
  "subtotal": 349.97,
  "tax": 34.99,
  "discount": 0,
  "notes": "Proposal notes"
}
```

**Response**:
```json
{
  "data": {
    "id": "proposal-123",
    "quote_request_id": "quote-123",
    "user_id": "user-456",
    "status": "draft",
    "items": [...],
    "subtotal": 349.97,
    "tax": 34.99,
    "discount": 0,
    "total": 384.96,
    "created_at": "2025-10-19T10:00:00Z"
  }
}
```

#### Get Proposals
```http
GET /functions/v1/proposals-api?limit=50&offset=0
Authorization: Bearer {token}
```

#### Get Proposal Details
```http
GET /functions/v1/proposals-api?proposal_id=proposal-123
Authorization: Bearer {token}
```

#### Update Proposal Pricing
```http
PATCH /functions/v1/proposals-api
Authorization: Bearer {admin_token}
Content-Type: application/json

{
  "proposal_id": "proposal-123",
  "subtotal": 349.97,
  "tax": 34.99,
  "discount": 10.00,
  "notes": "Updated notes"
}
```

#### Send Proposal to User
```http
PATCH /functions/v1/proposals-api
Authorization: Bearer {admin_token}
Content-Type: application/json

{
  "proposal_id": "proposal-123",
  "action": "send"
}
```

#### Accept Proposal (User)
```http
PATCH /functions/v1/proposals-api
Authorization: Bearer {token}
Content-Type: application/json

{
  "proposal_id": "proposal-123",
  "action": "accept"
}
```

### Moodboard Products API

#### Add Product to Moodboard
```http
POST /functions/v1/moodboard-products-api
Authorization: Bearer {token}
Content-Type: application/json

{
  "moodboard_id": "moodboard-123",
  "product_id": "prod-001",
  "position_x": 100,
  "position_y": 200,
  "notes": "Optional notes"
}
```

#### Get Moodboard Products
```http
GET /functions/v1/moodboard-products-api?moodboard_id=moodboard-123&limit=50&offset=0
Authorization: Bearer {token}
```

#### Remove Product from Moodboard
```http
DELETE /functions/v1/moodboard-products-api
Authorization: Bearer {token}
Content-Type: application/json

{
  "moodboard_id": "moodboard-123",
  "product_id": "prod-001"
}
```

### Moodboard Quote API

#### Request Quote for Moodboard
```http
POST /functions/v1/moodboard-quote-api
Authorization: Bearer {token}
Content-Type: application/json

{
  "moodboard_id": "moodboard-123",
  "workspace_id": "workspace-123",
  "notes": "Quote request notes"
}
```

**Response**:
```json
{
  "data": {
    "id": "moodboard-quote-123",
    "moodboard_id": "moodboard-123",
    "moodboard_creator_id": "user-789",
    "requester_id": "user-456",
    "quote_request_id": "quote-123",
    "commission_percentage": 10.0,
    "status": "pending",
    "created_at": "2025-10-19T10:00:00Z"
  }
}
```

#### Get Moodboard Quote Requests
```http
GET /functions/v1/moodboard-quote-api?moodboard_id=moodboard-123&limit=50&offset=0
Authorization: Bearer {token}
```

#### Get User Commissions
```http
GET /functions/v1/moodboard-quote-api?endpoint=commissions&limit=50&offset=0
Authorization: Bearer {token}
```

**Response**:
```json
{
  "data": [...],
  "count": 5,
  "totals": {
    "total_commission": 1500.00,
    "pending_commission": 500.00
  }
}
```

## 📦 Products API

### Product Creation from Knowledge Base

#### Extract and Create Products from PDF Chunks
```http
POST /functions/v1/products-api
Authorization: Bearer {token}
Content-Type: application/json

{
  "action": "create_from_chunks",
  "chunk_ids": ["chunk-123", "chunk-124"],
  "document_id": "doc-456"
}
```

**Response**:
```json
{
  "success": true,
  "data": {
    "id": "prod-789",
    "name": "Product from Chunk",
    "description": "Extracted from PDF chunk",
    "long_description": "Full content from chunk",
    "properties": {
      "source_chunk_id": "chunk-123",
      "document_id": "doc-456",
      "page_number": 1,
      "chunk_index": 0
    },
    "metadata": {
      "extracted_from": "knowledge_base_chunk",
      "chunk_metadata": {}
    },
    "status": "draft",
    "created_from_type": "pdf_processing",
    "created_at": "2025-10-19T10:00:00Z"
  }
}
```

**Purpose**: Creates products from actual PDF chunks in knowledge base (not mocked data)

### Product Search & Retrieval

#### Search Products by Description
```http
GET /functions/v1/products-api?action=search&query=marble&limit=20&offset=0
Authorization: Bearer {token}
```

**Response**:
```json
{
  "success": true,
  "data": [
    {
      "id": "prod-001",
      "name": "Premium Italian Marble",
      "description": "White marble with elegant veining",
      "properties": {
        "material_type": "natural_stone",
        "color": "white",
        "finish": "polished"
      },
      "metadata": {
        "supplier": "Italian Quarries Inc",
        "origin": "Italy",
        "price_range": "$100-200 per sq ft"
      },
      "status": "published",
      "created_from_type": "pdf_processing"
    }
  ],
  "count": 1,
  "total": 1
}
```

#### Get Product by ID
```http
GET /functions/v1/products-api?action=get&product_id=prod-001
Authorization: Bearer {token}
```

#### List All Products
```http
GET /functions/v1/products-api?action=list&limit=50&offset=0&status=published
Authorization: Bearer {token}
```

### Product Management

#### Update Product
```http
PUT /functions/v1/products-api
Authorization: Bearer {token}
Content-Type: application/json

{
  "product_id": "prod-001",
  "name": "Updated Product Name",
  "description": "Updated description",
  "properties": {
    "material_type": "natural_stone",
    "color": "white"
  },
  "metadata": {
    "supplier": "Updated Supplier",
    "price_range": "$150-250 per sq ft"
  },
  "status": "published"
}
```

#### Delete Product
```http
DELETE /functions/v1/products-api
Authorization: Bearer {token}
Content-Type: application/json

{
  "product_id": "prod-001"
}
```

### Product Images

#### Add Product Image
```http
POST /functions/v1/products-api
Authorization: Bearer {token}
Content-Type: application/json

{
  "action": "add_image",
  "product_id": "prod-001",
  "image_url": "https://storage.example.com/image.jpg",
  "image_type": "primary",
  "display_order": 1
}
```

#### Get Product Images
```http
GET /functions/v1/products-api?action=get_images&product_id=prod-001
Authorization: Bearer {token}
```

### Product Embeddings

#### Generate Product Embedding
```http
POST /functions/v1/products-api
Authorization: Bearer {token}
Content-Type: application/json

{
  "action": "generate_embedding",
  "product_id": "prod-001",
  "embedding_model": "text-embedding-3-small"
}
```

**Response**:
```json
{
  "success": true,
  "data": {
    "product_id": "prod-001",
    "embedding_model": "text-embedding-3-small",
    "embedding_dimensions": 1536,
    "generated_at": "2025-10-19T10:00:00Z"
  }
}
```

#### Search Products by Embedding Similarity
```http
POST /functions/v1/products-api
Authorization: Bearer {token}
Content-Type: application/json

{
  "action": "search_by_embedding",
  "query": "white marble flooring",
  "limit": 10,
  "similarity_threshold": 0.7
}
```

### Product Data Structure

#### Product Schema
```json
{
  "id": "UUID",
  "name": "string",
  "description": "string (short)",
  "long_description": "string (full content)",
  "category_id": "UUID (optional)",
  "source_document_id": "UUID (optional)",
  "source_chunks": "JSONB array of chunk IDs",
  "properties": "JSONB object (material_type, color, finish, durability, etc.)",
  "specifications": "JSONB object (technical specs)",
  "metadata": "JSONB object (supplier, origin, price_range, availability, certifications)",
  "embedding": "VECTOR(1536) (text embedding)",
  "embedding_model": "string (default: text-embedding-3-small)",
  "status": "enum (draft, published, archived)",
  "created_from_type": "enum (pdf_processing, xml_import, manual, scraping, sample_data)",
  "created_by": "UUID (user ID)",
  "created_at": "TIMESTAMPTZ",
  "updated_at": "TIMESTAMPTZ"
}
```

#### Product Image Schema
```json
{
  "id": "UUID",
  "product_id": "UUID",
  "image_id": "UUID (optional, reference to document_images)",
  "image_url": "string",
  "image_type": "enum (primary, texture, sample, installation, etc.)",
  "display_order": "integer",
  "metadata": "JSONB object",
  "created_at": "TIMESTAMPTZ"
}
```

### Testing Products API

#### Test Script: Extract from Knowledge Base
```bash
# Set your Supabase service role key
export SUPABASE_SERVICE_ROLE_KEY=your_key_here

# Run the test
node scripts/test-products-from-knowledge-base.js
```

**What it does**:
1. Fetches real chunks from `document_chunks` table
2. Displays chunk information (ID, content preview, page number)
3. Extracts products from those chunks
4. Creates product records with real data
5. Shows all created products with full details

**Expected Output**:
- Chunks found count
- Products extracted count
- Products created count
- Full product details with properties and metadata
- Success rate and error count

#### Test Script: Complete E2E Workflow
```bash
# Test cart → quote → proposal → commission workflow
node scripts/test-products-system-complete.js
```

## 🔗 Related Documentation

- [Security & Authentication](./security-authentication.md) - API security
- [Setup & Configuration](./setup-configuration.md) - API configuration
- [AI & ML Services](./ai-ml-services.md) - AI API integrations
- [Admin Panel Guide](./admin-panel-guide.md) - Admin interface documentation
- [Products Mock vs Real Data](./PRODUCTS-MOCK-VS-REAL-DATA-CLARIFICATION.md) - Product creation workflow
