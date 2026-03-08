# MIVAA Gateway API

## Overview

The MIVAA Gateway is a Supabase Edge Function that acts as a proxy to the MIVAA Python backend service. It provides access to all backend APIs including RAG, search, AI services, and more.

**Edge Function:** `mivaa-gateway`  
**Base URL:** `https://bgbavxtjlbvgplozizxu.supabase.co/functions/v1/mivaa-gateway`  
**Backend Service:** `https://v1api.materialshub.gr`

## Authentication

Requests can use either:
1. Supabase Auth token (recommended for user-specific operations)
2. MIVAA API key (for service-to-service calls)

```typescript
// Option 1: Supabase Auth
Authorization: Bearer <supabase_access_token>

// Option 2: MIVAA API Key
X-API-Key: <mivaa_api_key>
```

## Request Format

**Method:** `POST`  
**Path:** `/`

**Request:**
```typescript
{
  action: string,              // Required - Endpoint action (see available actions below)
  payload?: object,            // Optional - Request payload
  params?: object,             // Optional - URL parameters
  method?: string              // Optional - HTTP method override
}
```

**Response:**
```typescript
{
  success: boolean,
  data?: any,
  error?: string,
  metadata?: {
    processingTime: number,
    endpoint: string
  }
}
```

## Available Actions

### Core Endpoints

#### Health Check
```typescript
{
  action: 'health_check'
}
```

### Knowledge Base Routes (NEW v2.3.0)

#### Create Document
```typescript
{
  action: 'kb_create_document',
  payload: {
    title: string,
    content: string,
    category_id?: string,
    metadata?: object
  }
}
```

#### Search Documents
```typescript
{
  action: 'kb_search',
  payload: {
    query: string,
    search_type: 'semantic' | 'full_text' | 'hybrid',
    limit?: number,
    category_id?: string
  }
}
```

#### Create from PDF
```typescript
{
  action: 'kb_create_from_pdf',
  payload: {
    file_url: string,
    title?: string,
    category_id?: string
  }
}
```

### RAG Routes

#### Upload Document
```typescript
{
  action: 'rag_upload',
  payload: {
    file_url: string,
    category?: string,
    workspace_id?: string,
    title?: string
  }
}
```

#### RAG Search
```typescript
{
  action: 'rag_search',
  payload: {
    query: string,
    top_k?: number,
    strategy?: 'semantic' | 'vector' | 'hybrid' | 'mmr' | 'multimodal' | 'material',
    include_metadata?: boolean
  }
}
```

#### RAG Query
```typescript
{
  action: 'rag_query',
  payload: {
    query: string,
    context_limit?: number,
    include_sources?: boolean
  }
}
```

#### Get Job Status
```typescript
{
  action: 'rag_get_job',
  params: {
    job_id: string
  }
}
```

### Search Routes

Use `rag_search` with a `strategy` parameter for all search operations. See [RAG/Document Processing actions](#rag--document-processing) above.

### AI Services

#### Classify Document
```typescript
{
  action: 'ai_classify_document',
  payload: {
    document_id: string,
    classification_type: string
  }
}
```

#### Detect Product Boundaries
```typescript
{
  action: 'ai_detect_boundaries',
  payload: {
    chunks: Array<object>,
    threshold?: number
  }
}
```

#### Validate Product
```typescript
{
  action: 'ai_validate_product',
  payload: {
    product_data: object,
    validation_rules?: object
  }
}
```

### Image Processing

#### Analyze Image
```typescript
{
  action: 'images_analyze',
  payload: {
    image_url: string,
    analysis_type?: 'classification' | 'detection' | 'segmentation'
  }
}
```

#### Image Search
```typescript
{
  action: 'images_search',
  payload: {
    query_image_url: string,
    limit?: number
  }
}
```

### Admin Routes

#### List Jobs
```typescript
{
  action: 'admin_list_jobs',
  payload: {
    status?: 'pending' | 'processing' | 'completed' | 'failed',
    limit?: number,
    offset?: number
  }
}
```

#### Job Statistics
```typescript
{
  action: 'admin_job_statistics'
}
```

#### System Health
```typescript
{
  action: 'admin_system_health'
}
```

## File Upload

For file uploads (e.g., PDF processing), use multipart/form-data:

```typescript
const formData = new FormData();
formData.append('file', fileBlob);
formData.append('category', 'technical-specs');
formData.append('workspace_id', 'workspace-123');

const response = await fetch(
  'https://bgbavxtjlbvgplozizxu.supabase.co/functions/v1/mivaa-gateway',
  {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${session.access_token}`
    },
    body: formData
  }
);
```

## Error Handling

```typescript
{
  success: false,
  error: string,
  statusCode?: number,
  details?: object
}
```

**Common Error Codes:**
- `400` - Bad request (invalid action or payload)
- `401` - Unauthorized
- `404` - Endpoint not found
- `500` - Backend service error
- `503` - Service unavailable

## Complete Action List

See the full list of 100+ available actions in the [API Endpoints Documentation](../api-endpoints.md).

## Related Documentation

- [API Endpoints](../api-endpoints.md)
- [RAG System](../pdf-processing-pipeline.md)
- [Knowledge Base Implementation](../knowledge-base-implementation.md)
- [AI Services](../ai-models-architecture.md)

