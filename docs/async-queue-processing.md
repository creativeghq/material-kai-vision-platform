# Async Queue Processing - Complete Guide

## Overview

The Material Kai Vision Platform now uses an async job queue architecture to process PDFs efficiently without blocking the service. This enables:

- **Fast Response Times**: <30 seconds (vs 16+ minutes)
- **Real-time Progress**: Updates every 5 seconds
- **100% Service Availability**: No blocking during processing
- **Concurrent Processing**: Handle 10+ PDFs simultaneously
- **Automatic Retries**: Up to 3 attempts per job

## Architecture

### 5-Stage Pipeline

```
Stage 1: Extraction (0-20%, ~30 sec, SYNC)
  ↓ Extract text and images from PDF
Stage 2: Image Processing (20-40%, ~5-10 min, ASYNC)
  ↓ OCR + CLIP embeddings via Edge Function
Stage 3: Chunking (40-60%, ~2 min, SYNC)
  ↓ Create semantic chunks from text
Stage 4: AI Analysis (60-90%, ~5-10 min, ASYNC)
  ↓ Classification + Metadata + Product detection
Stage 5: Product Creation (90-100%, ~1 min, SYNC)
  ↓ Create product records
```

## Database Tables

### image_processing_queue
Tracks image OCR and CLIP embedding jobs:
- `id`: Unique job ID
- `document_id`: Reference to document
- `image_id`: Reference to image
- `status`: pending | processing | completed | failed
- `retry_count`: Number of retry attempts
- `result`: Job result data

### ai_analysis_queue
Tracks AI analysis jobs:
- `id`: Unique job ID
- `document_id`: Reference to document
- `chunk_id`: Reference to chunk
- `analysis_type`: classification | metadata | product_detection
- `status`: pending | processing | completed | failed
- `result`: Analysis result data

### job_progress
Tracks progress for each stage:
- `document_id`: Reference to document
- `stage`: extraction | image_processing | chunking | ai_analysis | product_creation
- `progress`: 0-100 percentage
- `completed_items`: Number of completed items
- `total_items`: Total items to process

## Edge Functions

### process-image-queue
Processes pending image jobs:
- Polls `image_processing_queue` for pending jobs
- Runs OCR via MIVAA API
- Generates CLIP embeddings
- Updates progress in real-time
- Handles retries automatically

**Endpoint**: `POST /functions/v1/process-image-queue`

**Request**:
```json
{
  "batchSize": 10,
  "maxRetries": 3
}
```

**Response**:
```json
{
  "success": true,
  "processed": 10,
  "failed": 0,
  "message": "Processed 10 images, 0 failed"
}
```

### process-ai-analysis-queue
Processes pending AI analysis jobs:
- Polls `ai_analysis_queue` for pending jobs
- Calls appropriate analysis functions
- Stores results in chunk metadata
- Updates progress in real-time
- Handles retries automatically

**Endpoint**: `POST /functions/v1/process-ai-analysis-queue`

**Request**:
```json
{
  "batchSize": 10,
  "maxRetries": 3
}
```

**Response**:
```json
{
  "success": true,
  "processed": 10,
  "failed": 0,
  "message": "Processed 10 analyses, 0 failed"
}
```

## Admin Monitoring Dashboard

**Location**: `/admin/async-queue-monitor`

**Features**:
- Real-time queue metrics (pending, processing, completed, failed)
- Image processing queue status
- AI analysis queue status
- Progress visualization
- Error logging and display
- Auto-refresh every 5 seconds

## API Integration

### Upload PDF (Async)
```bash
POST /documents/upload-async
Content-Type: multipart/form-data

file: <PDF file>
document_type: material_catalog
catalog_name: Harmony Signature Book
```

**Response**:
```json
{
  "status": "success",
  "document_id": "uuid",
  "message": "PDF queued for processing"
}
```

### Get Progress
```bash
GET /job-progress/{document_id}
```

**Response**:
```json
[
  {
    "stage": "extraction",
    "progress": 20,
    "completed_items": 1,
    "total_items": 1
  },
  {
    "stage": "image_processing",
    "progress": 35,
    "completed_items": 32,
    "total_items": 215
  }
]
```

## Testing

### Run Comprehensive Test
```bash
node scripts/testing/async-queue-harmony-test.js
```

This test:
1. Uploads Harmony PDF
2. Monitors all 5 stages
3. Processes image queue
4. Processes AI queue
5. Validates final results
6. Generates detailed report

### Expected Results (Harmony PDF)
- **Images extracted**: 215
- **Chunks created**: 200-300
- **Products identified**: 14+
- **Processing time**: 15-20 minutes total
- **Success rate**: 100%

## Performance Metrics

| Metric | Value |
|--------|-------|
| Response time | <30 seconds |
| Progress updates | Every 5 seconds |
| Memory usage | <500 MB |
| Concurrent PDFs | 10+ |
| Retry attempts | Up to 3 |
| Timeout risk | None |

## Troubleshooting

### Jobs Stuck in Pending
1. Check Edge Function logs
2. Verify MIVAA API is accessible
3. Check Supabase connection
4. Manually trigger queue processing

### High Failure Rate
1. Check error messages in queue
2. Verify image quality
3. Check API rate limits
4. Review retry logic

### Slow Processing
1. Increase batch size
2. Check server resources
3. Monitor network latency
4. Review MIVAA API performance

## Best Practices

1. **Monitor Progress**: Check `/admin/async-queue-monitor` regularly
2. **Set Up Cron Jobs**: Automatically process queues every 30 seconds
3. **Review Errors**: Check failed jobs and retry manually if needed
4. **Optimize Batch Size**: Adjust based on server resources
5. **Test Regularly**: Run test script after deployments

