# PDF Integration Edge Functions API Documentation

## Overview

This document provides comprehensive API documentation for the PDF Integration service implemented as Supabase Edge Functions. The service provides serverless endpoints for PDF processing, extraction, and batch operations using the Mivaa PDF extractor service.

## Base URL

```
https://your-project.supabase.co/functions/v1/
```

## Authentication

All endpoints support two authentication methods:

### 1. JWT Bearer Token (Supabase Auth)
```http
Authorization: Bearer <jwt_token>
```

### 2. API Key Authentication
```http
X-API-Key: kai_<your_api_key>
```

## Edge Functions

### 1. Health Check and Status Monitoring

**Endpoint:** `GET /pdf-integration-health`

**Description:** Provides health status and monitoring information for the PDF integration service.

#### Request

```http
GET /pdf-integration-health
Authorization: Bearer <jwt_token>
```

#### Response

```json
{
  "success": true,
  "data": {
    "status": "healthy",
    "timestamp": "2025-01-27T10:00:00.000Z",
    "version": "1.0.0",
    "uptime": 3600,
    "checks": {
      "mivaa_service": {
        "status": "healthy",
        "responseTime": 150,
        "lastChecked": "2025-01-27T10:00:00.000Z"
      },
      "supabase_connection": {
        "status": "healthy",
        "responseTime": 25,
        "lastChecked": "2025-01-27T10:00:00.000Z"
      },
      "integration_config": {
        "status": "healthy",
        "configVersion": "1.0.0",
        "lastUpdated": "2025-01-27T09:00:00.000Z"
      }
    },
    "metrics": {
      "totalRequests": 1250,
      "successfulRequests": 1200,
      "failedRequests": 50,
      "averageResponseTime": 2500,
      "activeConnections": 5
    }
  }
}
```

#### Error Response

```json
{
  "success": false,
  "error": "Service unavailable",
  "statusCode": 503,
  "data": {
    "status": "unhealthy",
    "failedChecks": ["mivaa_service"],
    "timestamp": "2025-01-27T10:00:00.000Z"
  }
}
```

---

### 2. PDF Extraction

**Endpoint:** `POST /pdf-extract`

**Description:** Extracts content from a PDF document using the Mivaa service and optionally processes it for RAG systems.

#### Request

```http
POST /pdf-extract
Content-Type: application/json
Authorization: Bearer <jwt_token>
```

```json
{
  "documentId": "doc_123456789",
  "extractionType": "markdown",
  "workspaceId": "workspace_abc123",
  "userId": "user_xyz789",
  "options": {
    "includeImages": true,
    "includeMetadata": true,
    "chunkSize": 1000,
    "overlapSize": 100,
    "outputFormat": "json"
  }
}
```

#### Request Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `documentId` | string | Yes | Unique identifier for the PDF document |
| `extractionType` | string | Yes | Type of extraction: `markdown`, `tables`, `images`, or `all` |
| `workspaceId` | string | No | Workspace identifier for access control |
| `userId` | string | No | User identifier (auto-detected from auth if not provided) |
| `options` | object | No | Additional processing options |

#### Options Object

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `includeImages` | boolean | false | Include image extraction |
| `includeMetadata` | boolean | true | Include document metadata |
| `chunkSize` | number | 1000 | Text chunk size for RAG processing (100-10000) |
| `overlapSize` | number | 100 | Overlap size between chunks (0-1000) |
| `outputFormat` | string | "json" | Output format: `json` or `markdown` |

#### Response

```json
{
  "success": true,
  "data": {
    "extractionId": "ext_987654321",
    "status": "completed",
    "results": {
      "markdown": "# Document Title\n\nDocument content...",
      "tables": [
        {
          "pageNumber": 1,
          "tableData": [["Header1", "Header2"], ["Row1Col1", "Row1Col2"]],
          "csvData": "Header1,Header2\nRow1Col1,Row1Col2"
        }
      ],
      "images": [
        {
          "pageNumber": 1,
          "imageUrl": "https://storage.url/image1.png",
          "description": "Chart showing quarterly results"
        }
      ],
      "metadata": {
        "pageCount": 10,
        "title": "Quarterly Report",
        "author": "John Doe",
        "creationDate": "2025-01-15T00:00:00.000Z",
        "fileSize": 2048576
      }
    },
    "processingTime": 2500,
    "ragDocuments": [
      {
        "id": "doc_123456789_chunk_0",
        "content": "Document content chunk...",
        "metadata": {
          "documentId": "doc_123456789",
          "chunkIndex": 0,
          "totalChunks": 5
        }
      }
    ]
  }
}
```

#### Error Responses

```json
{
  "success": false,
  "error": "Document not found",
  "statusCode": 404
}
```

```json
{
  "success": false,
  "error": "PDF processing timeout - document may be too large or complex",
  "statusCode": 500
}
```

---

### 3. Batch Processing

**Endpoint:** `POST /pdf-batch-process` (Create Batch Job)

**Description:** Creates a batch job to process multiple PDF documents.

#### Request

```http
POST /pdf-batch-process
Content-Type: application/json
Authorization: Bearer <jwt_token>
```

```json
{
  "documents": [
    {
      "documentId": "doc_123456789",
      "extractionType": "markdown",
      "priority": "high"
    },
    {
      "documentId": "doc_987654321",
      "extractionType": "all",
      "priority": "normal"
    }
  ],
  "workspaceId": "workspace_abc123",
  "options": {
    "includeImages": true,
    "includeMetadata": true,
    "chunkSize": 1000,
    "maxConcurrent": 3,
    "notifyOnComplete": true,
    "webhookUrl": "https://your-app.com/webhook/batch-complete"
  }
}
```

#### Request Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `documents` | array | Yes | Array of documents to process (max 100) |
| `workspaceId` | string | No | Workspace identifier |
| `options` | object | No | Batch processing options |

#### Document Object

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `documentId` | string | Yes | Document identifier |
| `extractionType` | string | Yes | Extraction type: `markdown`, `tables`, `images`, `all` |
| `priority` | string | No | Processing priority: `low`, `normal`, `high` |

#### Batch Options

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `maxConcurrent` | number | 3 | Maximum concurrent processing (1-10) |
| `notifyOnComplete` | boolean | false | Send webhook notification on completion |
| `webhookUrl` | string | - | Webhook URL for notifications |

#### Response

```json
{
  "success": true,
  "data": {
    "batchId": "batch_1706356800_abc123def",
    "status": "queued",
    "totalDocuments": 2,
    "processedDocuments": 0,
    "failedDocuments": 0,
    "estimatedCompletionTime": "2025-01-27T10:05:00.000Z",
    "results": [
      {
        "documentId": "doc_123456789",
        "status": "pending"
      },
      {
        "documentId": "doc_987654321",
        "status": "pending"
      }
    ]
  }
}
```

---

**Endpoint:** `GET /pdf-batch-process` (Get Batch Status)

**Description:** Retrieves the status and results of a batch processing job.

#### Request

```http
GET /pdf-batch-process?batchId=batch_1706356800_abc123def
Authorization: Bearer <jwt_token>
```

#### Query Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `batchId` | string | Yes | Batch job identifier |

#### Response

```json
{
  "success": true,
  "data": {
    "batchId": "batch_1706356800_abc123def",
    "status": "completed",
    "totalDocuments": 2,
    "processedDocuments": 2,
    "failedDocuments": 0,
    "results": [
      {
        "documentId": "doc_123456789",
        "status": "completed",
        "extractionId": "ext_111111111",
        "processingTime": 2300
      },
      {
        "documentId": "doc_987654321",
        "status": "completed",
        "extractionId": "ext_222222222",
        "processingTime": 3100
      }
    ]
  }
}
```

---

**Endpoint:** `DELETE /pdf-batch-process` (Cancel Batch Job)

**Description:** Cancels a queued or processing batch job.

#### Request

```http
DELETE /pdf-batch-process?batchId=batch_1706356800_abc123def
Authorization: Bearer <jwt_token>
```

#### Response

```json
{
  "success": true,
  "message": "Batch job cancelled"
}
```

## Status Codes

| Code | Description |
|------|-------------|
| 200 | Success |
| 202 | Accepted (for async operations) |
| 400 | Bad Request - Invalid parameters |
| 401 | Unauthorized - Authentication required |
| 403 | Forbidden - Insufficient permissions |
| 404 | Not Found - Resource not found |
| 429 | Too Many Requests - Rate limit exceeded |
| 500 | Internal Server Error |
| 503 | Service Unavailable |

## Rate Limiting

All endpoints are subject to rate limiting:

- **Health Check:** 60 requests per minute
- **PDF Extract:** 10 requests per minute per user
- **Batch Process:** 5 requests per minute per user

Rate limit headers are included in responses:

```http
X-RateLimit-Limit: 10
X-RateLimit-Remaining: 7
X-RateLimit-Reset: 1706356860
```

## Error Handling

All endpoints return consistent error responses:

```json
{
  "success": false,
  "error": "Error description",
  "statusCode": 400,
  "details": {
    "field": "documentId",
    "message": "Document ID is required"
  }
}
```

## Environment Variables

The following environment variables must be configured:

| Variable | Description | Required |
|----------|-------------|----------|
| `SUPABASE_URL` | Supabase project URL | Yes |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key | Yes |
| `MIVAA_BASE_URL` | Mivaa PDF extractor service URL | Yes |
| `MIVAA_API_KEY` | Mivaa service API key | No |
| `PDF_PROCESSING_TIMEOUT` | Processing timeout in milliseconds | No (default: 300000) |

## Database Schema

### Required Tables

#### `pdf_processing_results`
```sql
CREATE TABLE pdf_processing_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id TEXT NOT NULL,
  user_id UUID REFERENCES auth.users(id),
  workspace_id UUID,
  extraction_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  results JSONB,
  error TEXT,
  processing_time INTEGER,
  batch_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);
```

#### `pdf_batch_jobs`
```sql
CREATE TABLE pdf_batch_jobs (
  id TEXT PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id),
  workspace_id UUID,
  status TEXT NOT NULL DEFAULT 'queued',
  total_documents INTEGER NOT NULL,
  processed_documents INTEGER DEFAULT 0,
  failed_documents INTEGER DEFAULT 0,
  documents JSONB NOT NULL,
  options JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);
```

#### `rag_documents`
```sql
CREATE TABLE rag_documents (
  id TEXT PRIMARY KEY,
  content TEXT NOT NULL,
  metadata JSONB,
  document_id TEXT,
  user_id UUID REFERENCES auth.users(id),
  workspace_id UUID,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

#### `api_usage_logs`
```sql
CREATE TABLE api_usage_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  endpoint_id UUID,
  user_id UUID,
  ip_address INET,
  user_agent TEXT,
  request_method TEXT,
  request_path TEXT,
  response_status INTEGER,
  response_time_ms INTEGER,
  is_internal_request BOOLEAN DEFAULT false,
  rate_limit_exceeded BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

## Security Considerations

1. **Authentication:** All endpoints require valid authentication
2. **Authorization:** Users can only access their own documents or workspace documents
3. **Input Validation:** All inputs are validated and sanitized
4. **Rate Limiting:** Prevents abuse and ensures fair usage
5. **CORS:** Properly configured for cross-origin requests
6. **Timeout Protection:** Prevents long-running requests from consuming resources

## Integration Examples

### JavaScript/TypeScript

```typescript
// PDF Extraction
const response = await fetch('/functions/v1/pdf-extract', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`,
  },
  body: JSON.stringify({
    documentId: 'doc_123456789',
    extractionType: 'markdown',
    options: {
      includeImages: true,
      chunkSize: 1000,
    },
  }),
});

const result = await response.json();
```

### Python

```python
import requests

response = requests.post(
    'https://your-project.supabase.co/functions/v1/pdf-extract',
    headers={
        'Content-Type': 'application/json',
        'Authorization': f'Bearer {token}',
    },
    json={
        'documentId': 'doc_123456789',
        'extractionType': 'markdown',
        'options': {
            'includeImages': True,
            'chunkSize': 1000,
        },
    }
)

result = response.json()
```

### cURL

```bash
curl -X POST \
  https://your-project.supabase.co/functions/v1/pdf-extract \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer YOUR_JWT_TOKEN' \
  -d '{
    "documentId": "doc_123456789",
    "extractionType": "markdown",
    "options": {
      "includeImages": true,
      "chunkSize": 1000
    }
  }'
```

## Monitoring and Observability

### Health Monitoring

Use the health check endpoint to monitor service status:

```bash
curl https://your-project.supabase.co/functions/v1/pdf-integration-health
```

### Metrics Collection

The service automatically collects metrics including:
- Request counts and response times
- Success/failure rates
- Active connections
- Processing times

### Logging

All operations are logged with appropriate detail levels:
- Request/response logging
- Error tracking
- Performance metrics
- Security events

## Support and Troubleshooting

### Common Issues

1. **Authentication Errors (401)**
   - Verify JWT token is valid and not expired
   - Check API key format (must start with 'kai_')

2. **Document Not Found (404)**
   - Verify document exists in database
   - Check user permissions for the document

3. **Processing Timeout (500)**
   - Document may be too large or complex
   - Consider splitting large documents
   - Check Mivaa service availability

4. **Rate Limit Exceeded (429)**
   - Implement exponential backoff
   - Consider upgrading rate limits
   - Use batch processing for multiple documents

### Performance Optimization

1. **Batch Processing:** Use batch endpoints for multiple documents
2. **Caching:** Implement client-side caching for repeated requests
3. **Chunking:** Optimize chunk sizes based on your RAG system requirements
4. **Concurrent Limits:** Adjust `maxConcurrent` based on your infrastructure

---

*Last updated: January 27, 2025*
*API Version: 1.0.0*