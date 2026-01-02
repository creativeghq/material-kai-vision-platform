# PDF Batch Process API

## Overview

The PDF Batch Process API handles batch processing of PDF documents for extraction and analysis.

**Edge Function:** `pdf-batch-process`  
**Base URL:** `https://bgbavxtjlbvgplozizxu.supabase.co/functions/v1/pdf-batch-process`

## Authentication

All requests require authentication via Supabase Auth:

```typescript
Authorization: Bearer <supabase_access_token>
```

## Endpoints

### 1. Create Batch Job

Create a new batch processing job for multiple documents.

**Method:** `POST`  
**Path:** `/`

**Request:**
```typescript
{
  documents: Array<{
    documentId: string,
    extractionType: 'markdown' | 'tables' | 'images' | 'all',
    priority?: 'low' | 'normal' | 'high'
  }>,
  workspaceId?: string,
  userId?: string,
  options?: {
    includeImages?: boolean,
    includeMetadata?: boolean,
    chunkSize?: number,
    overlapSize?: number,
    outputFormat?: 'json' | 'markdown',
    maxConcurrent?: number,
    notifyOnComplete?: boolean,
    webhookUrl?: string
  }
}
```

**Response:**
```typescript
{
  success: true,
  data: {
    batchId: string,
    status: 'queued',
    totalDocuments: number,
    processedDocuments: 0,
    failedDocuments: 0,
    estimatedCompletionTime?: string,
    results: Array<{
      documentId: string,
      status: 'pending',
      extractionId?: string,
      error?: string,
      processingTime?: number
    }>
  }
}
```

**Example:**
```typescript
const { data, error } = await supabase.functions.invoke('pdf-batch-process', {
  body: {
    documents: [
      {
        documentId: 'doc-123',
        extractionType: 'all',
        priority: 'high'
      },
      {
        documentId: 'doc-456',
        extractionType: 'markdown',
        priority: 'normal'
      }
    ],
    workspaceId: 'workspace-789',
    options: {
      includeImages: true,
      includeMetadata: true,
      chunkSize: 1000,
      overlapSize: 200,
      outputFormat: 'json',
      maxConcurrent: 3,
      notifyOnComplete: true
    }
  }
});
```

### 2. Get Batch Status

Get the status of a batch processing job.

**Method:** `GET`  
**Path:** `/?batchId={batchId}`

**Query Parameters:**
- `batchId` (required): Batch job ID

**Response:**
```typescript
{
  success: true,
  data: {
    batchId: string,
    status: 'queued' | 'processing' | 'completed' | 'failed' | 'partial',
    totalDocuments: number,
    processedDocuments: number,
    failedDocuments: number,
    createdAt: string,
    updatedAt: string,
    completedAt?: string,
    results: Array<{
      documentId: string,
      status: 'pending' | 'processing' | 'completed' | 'failed',
      extractionId?: string,
      error?: string,
      processingTime?: number
    }>
  }
}
```

**Example:**
```typescript
const response = await fetch(
  `${API_BASE}/pdf-batch-process?batchId=batch-123`,
  {
    headers: {
      'Authorization': `Bearer ${session.access_token}`
    }
  }
);
```

### 3. Cancel Batch Job

Cancel a running or queued batch job.

**Method:** `DELETE`  
**Path:** `/?batchId={batchId}`

**Query Parameters:**
- `batchId` (required): Batch job ID

**Response:**
```typescript
{
  success: true,
  message: 'Batch job cancelled successfully',
  data: {
    batchId: string,
    status: 'cancelled',
    processedDocuments: number,
    cancelledDocuments: number
  }
}
```

**Example:**
```typescript
const response = await fetch(
  `${API_BASE}/pdf-batch-process?batchId=batch-123`,
  {
    method: 'DELETE',
    headers: {
      'Authorization': `Bearer ${session.access_token}`
    }
  }
);
```

## Extraction Types

| Type | Description |
|------|-------------|
| `markdown` | Extract text content as markdown |
| `tables` | Extract tables from PDF |
| `images` | Extract images from PDF |
| `all` | Extract everything (markdown + tables + images) |

## Priority Levels

| Priority | Description | Processing Order |
|----------|-------------|------------------|
| `high` | Urgent processing | Processed first |
| `normal` | Standard processing | Default queue |
| `low` | Background processing | Processed last |

## Batch Status Flow

```
queued → processing → completed
                   ↘ failed
                   ↘ partial (some docs failed)
```

## Options

### includeImages
Include image extraction in the processing (default: `true`)

### includeMetadata
Include document metadata in results (default: `true`)

### chunkSize
Size of text chunks for processing (default: `1000`)

### overlapSize
Overlap between chunks (default: `200`)

### outputFormat
Output format for results: `json` or `markdown` (default: `json`)

### maxConcurrent
Maximum concurrent document processing (default: `5`)

### notifyOnComplete
Send notification when batch completes (default: `false`)

### webhookUrl
Webhook URL to call when batch completes

## Webhook Payload

If `webhookUrl` is provided, a POST request will be sent on completion:

```typescript
{
  batchId: string,
  status: 'completed' | 'failed' | 'partial',
  totalDocuments: number,
  processedDocuments: number,
  failedDocuments: number,
  completedAt: string,
  results: Array<{
    documentId: string,
    status: string,
    extractionId?: string,
    error?: string
  }>
}
```

## Error Handling

```typescript
{
  success: false,
  error: string,
  statusCode?: number
}
```

**Common Error Codes:**
- `400` - Bad request (invalid documents array, missing documentId)
- `401` - Unauthorized
- `404` - Batch job not found
- `500` - Internal server error

## Related Documentation

- [PDF Processing Pipeline](../pdf-processing-pipeline.md)
- [Data Import System](../data-import-system.md)

