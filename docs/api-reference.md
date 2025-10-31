# API Reference

**Material Kai Vision Platform** - Complete API Documentation

---

## Overview

The Material Kai Vision Platform provides **74+ REST API endpoints** across **14 categories** for document processing, AI analysis, search, and material intelligence. All APIs use JSON for request/response and support JWT authentication.

### Base URLs

- **MIVAA API**: `https://v1api.materialshub.gr`
- **Supabase Edge Functions**: `https://bgbavxtjlbvgplozizxu.supabase.co/functions/v1`
- **Frontend**: `https://materialshub.gr`

### Authentication

All API requests require JWT authentication via Bearer token:

```http
Authorization: Bearer <jwt_token>
```

### API Documentation

- **Swagger UI**: `https://v1api.materialshub.gr/docs`
- **ReDoc**: `https://v1api.materialshub.gr/redoc`
- **OpenAPI Schema**: `https://v1api.materialshub.gr/openapi.json`

---

## API Categories

### 1. RAG & Document Processing (15 endpoints)

#### Upload Document with Product Discovery
```http
POST /api/rag/documents/upload-with-discovery
Content-Type: multipart/form-data

Parameters:
- file: PDF file (required)
- workspace_id: UUID (required)
- category_id: UUID (optional)
- focused_extraction: boolean (default: true)
```

**Response**:
```json
{
  "job_id": "uuid",
  "document_id": "uuid",
  "status": "processing",
  "estimated_time": 180
}
```

#### Query RAG System
```http
POST /api/rag/query
Content-Type: application/json

{
  "query": "What materials are suitable for outdoor furniture?",
  "top_k": 5,
  "similarity_threshold": 0.7,
  "include_metadata": true,
  "enable_reranking": true,
  "document_ids": ["uuid1", "uuid2"]
}
```

**Response**:
```json
{
  "results": [
    {
      "chunk_id": "uuid",
      "content": "...",
      "similarity_score": 0.92,
      "metadata": {...},
      "document_id": "uuid",
      "page_number": 5
    }
  ],
  "query_time_ms": 245
}
```

#### Chat with RAG
```http
POST /api/rag/chat
Content-Type: application/json

{
  "message": "Tell me about sustainable materials",
  "conversation_id": "uuid",
  "context_window": 5,
  "temperature": 0.7,
  "max_tokens": 500
}
```

#### Get Document Content
```http
GET /api/rag/documents/{document_id}/content

Response:
{
  "document": {...},
  "chunks": [...],
  "images": [...],
  "products": [...],
  "ai_usage": {...}
}
```

#### List Documents
```http
GET /api/rag/documents?page=1&page_size=20&workspace_id=uuid
```

#### Delete Document
```http
DELETE /api/rag/documents/{document_id}
```

#### Get RAG Statistics
```http
GET /api/rag/stats?workspace_id=uuid

Response:
{
  "total_documents": 45,
  "total_chunks": 1234,
  "total_embeddings": 1234,
  "total_images": 567,
  "total_products": 89,
  "storage_used_mb": 1234.5
}
```

---

### 2. Search APIs (6 endpoints)

#### Semantic Search
```http
POST /api/search/semantic
Content-Type: application/json

{
  "query": "modern minimalist furniture",
  "top_k": 10,
  "workspace_id": "uuid",
  "filters": {
    "category": "furniture",
    "price_range": [100, 1000]
  }
}
```

#### Vector Search
```http
POST /api/search/vector
Content-Type: application/json

{
  "embedding": [0.123, 0.456, ...],
  "top_k": 10,
  "similarity_threshold": 0.75
}
```

#### Hybrid Search
```http
POST /api/search/hybrid
Content-Type: application/json

{
  "query": "sustainable wood materials",
  "top_k": 10,
  "weights": {
    "semantic": 0.6,
    "keyword": 0.4
  }
}
```

#### Get Search Recommendations
```http
GET /api/search/recommendations?query=furniture&limit=5
```

#### Search Analytics
```http
GET /api/analytics?workspace_id=uuid&start_date=2025-01-01&end_date=2025-01-31
```

---

### 3. Embedding APIs (5 endpoints)

#### Generate Text Embedding
```http
POST /api/embeddings/generate
Content-Type: application/json

{
  "text": "Modern sustainable furniture design",
  "model": "text-embedding-3-small"
}

Response:
{
  "embedding": [0.123, 0.456, ...],
  "dimensions": 1536,
  "model": "text-embedding-3-small"
}
```

#### Generate Batch Embeddings
```http
POST /api/embeddings/batch
Content-Type: application/json

{
  "texts": ["text1", "text2", "text3"],
  "model": "text-embedding-3-small"
}
```

#### Generate CLIP Embeddings
```http
POST /api/embeddings/clip-generate
Content-Type: application/json

{
  "image_url": "https://...",
  "text": "modern chair design"
}

Response:
{
  "image_embedding": [...],
  "text_embedding": [...],
  "dimensions": 512
}
```

---

### 4. Products API (8 endpoints)

#### List Products
```http
GET /api/products?workspace_id=uuid&page=1&page_size=20&category=furniture
```

#### Get Product
```http
GET /api/products/{product_id}

Response:
{
  "id": "uuid",
  "name": "NOVA Chair",
  "description": "...",
  "metadata": {...},
  "images": [...],
  "chunks": [...],
  "created_at": "2025-01-01T00:00:00Z"
}
```

#### Create Product
```http
POST /api/products
Content-Type: application/json

{
  "name": "Product Name",
  "description": "...",
  "workspace_id": "uuid",
  "metadata": {...}
}
```

#### Update Product
```http
PUT /api/products/{product_id}
Content-Type: application/json

{
  "name": "Updated Name",
  "metadata": {...}
}
```

#### Delete Product
```http
DELETE /api/products/{product_id}
```

#### Link Product to Chunks
```http
POST /api/products/{product_id}/chunks
Content-Type: application/json

{
  "chunk_ids": ["uuid1", "uuid2", "uuid3"]
}
```

#### Link Product to Images
```http
POST /api/products/{product_id}/images
Content-Type: application/json

{
  "image_ids": ["uuid1", "uuid2"]
}
```

---

### 5. Images API (6 endpoints)

#### List Images
```http
GET /api/images?workspace_id=uuid&page=1&page_size=20
```

#### Get Image
```http
GET /api/images/{image_id}

Response:
{
  "id": "uuid",
  "url": "https://...",
  "metadata": {...},
  "ai_analysis": {
    "llama_analysis": {...},
    "claude_validation": {...},
    "quality_score": 85
  },
  "embeddings": {
    "clip": [...],
    "color": [...],
    "texture": [...]
  }
}
```

#### Upload Image
```http
POST /api/images/upload
Content-Type: multipart/form-data

Parameters:
- file: Image file (required)
- workspace_id: UUID (required)
- metadata: JSON (optional)
```

#### Analyze Image
```http
POST /api/images/{image_id}/analyze
Content-Type: application/json

{
  "models": ["llama", "claude", "clip"],
  "generate_embeddings": true
}
```

#### Delete Image
```http
DELETE /api/images/{image_id}
```

---

### 6. AI Services (7 endpoints)

#### Llama Vision Analysis
```http
POST /api/vision/llama-analyze
Content-Type: application/json

{
  "image_url": "https://...",
  "prompt": "Analyze this material image",
  "max_tokens": 500
}

Response:
{
  "analysis": "...",
  "material_type": "wood",
  "quality_score": 85,
  "properties": {...}
}
```

#### Semantic Analysis
```http
POST /api/semantic-analysis
Content-Type: application/json

{
  "text": "Analyze this product description",
  "model": "llama-4-scout"
}
```

#### Chat Completion
```http
POST /api/chat/completions
Content-Type: application/json

{
  "messages": [
    {"role": "user", "content": "What is sustainable design?"}
  ],
  "model": "gpt-4o",
  "temperature": 0.7,
  "max_tokens": 500
}
```

#### Contextual Response
```http
POST /api/chat/contextual
Content-Type: application/json

{
  "query": "Tell me about this material",
  "context": {...},
  "conversation_id": "uuid"
}
```

---

### 7. Background Jobs (5 endpoints)

#### Get Job Status
```http
GET /api/jobs/{job_id}/status

Response:
{
  "job_id": "uuid",
  "status": "processing",
  "progress": 65,
  "current_stage": "IMAGE_EMBEDDINGS_GENERATED",
  "stages_completed": 9,
  "total_stages": 14,
  "products_found": 14,
  "chunks_created": 156,
  "images_extracted": 89,
  "estimated_time_remaining": 45,
  "errors": []
}
```

#### List Jobs
```http
GET /api/jobs?workspace_id=uuid&status=processing&page=1&page_size=20
```

#### Retry Job
```http
POST /api/jobs/{job_id}/retry
```

#### Cancel Job
```http
POST /api/jobs/{job_id}/cancel
```

#### Get Job Logs
```http
GET /api/jobs/{job_id}/logs
```

---

### 8. Admin & Monitoring (12 endpoints)

#### System Health
```http
GET /health

Response:
{
  "status": "healthy",
  "timestamp": "2025-01-01T00:00:00Z",
  "version": "2.0.0",
  "service": "MIVAA PDF Extractor",
  "database": "connected",
  "storage": "available"
}
```

#### Performance Metrics
```http
GET /metrics

Response:
{
  "requests_total": 12345,
  "requests_per_minute": 45,
  "average_response_time_ms": 245,
  "error_rate": 0.02,
  "active_jobs": 3
}
```

#### Performance Summary
```http
GET /performance/summary
```

#### AI Metrics
```http
GET /api/ai-metrics?start_date=2025-01-01&end_date=2025-01-31

Response:
{
  "total_api_calls": 5678,
  "cost_usd": 123.45,
  "models_used": {
    "claude-sonnet-4.5": 1234,
    "gpt-4o": 567,
    "llama-4-scout": 890
  }
}
```

---

## Error Responses

All errors follow this format:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid request parameters",
    "details": {...}
  },
  "timestamp": "2025-01-01T00:00:00Z",
  "request_id": "uuid"
}
```

### Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `VALIDATION_ERROR` | 400 | Invalid request parameters |
| `UNAUTHORIZED` | 401 | Missing or invalid authentication |
| `FORBIDDEN` | 403 | Insufficient permissions |
| `NOT_FOUND` | 404 | Resource not found |
| `RATE_LIMIT_EXCEEDED` | 429 | Too many requests |
| `INTERNAL_ERROR` | 500 | Server error |
| `SERVICE_UNAVAILABLE` | 503 | Service temporarily unavailable |

---

## Rate Limits

| Tier | Requests/Minute | Requests/Day |
|------|----------------|--------------|
| Free | 60 | 1,000 |
| Pro | 600 | 10,000 |
| Enterprise | Unlimited | Unlimited |

---

**Last Updated**: 2025-10-31  
**Version**: 2.0.0  
**Status**: Production

