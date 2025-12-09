# Monitoring & Analytics System

Comprehensive real-time monitoring and analytics infrastructure for the Material Kai Vision Platform.

---

## 🎯 Overview

The platform includes a complete monitoring and analytics system that tracks:
- **PDF Processing Jobs** - Real-time job tracking with 9 checkpoint stages
- **AI Model Usage** - Cost tracking, model performance, and usage statistics
- **Search Analytics** - Query patterns, response times, and user behavior
- **System Performance** - API latency, error rates, and uptime metrics
- **Agent Chat Analytics** - Agent responses, quality ratings, and costs

---

## 📊 Admin Dashboards

### 1. PDF Processing Monitor (`/admin/async-queue-monitor`)

**Purpose**: Real-time monitoring of PDF processing jobs and pipeline stages

**Features**:
- ✅ Real-time job status updates (no refresh needed)
- ✅ 4 overview cards: Total Documents, Products Created, Success Rate, Avg Processing Time
- ✅ Job status breakdown (Pending, Processing, Completed, Failed, Retrying)
- ✅ Recent jobs list with progress percentages
- ✅ Processing stages analytics
- ✅ Failed jobs section with error details
- ✅ Auto-refresh with Supabase real-time subscriptions

**Data Sources**:
- `background_jobs` table - Main job tracking
- `job_checkpoints` table - Stage-by-stage progress

**Metrics Tracked**:
```typescript
{
  pdf_processing: {
    pending: number,
    processing: number,
    completed: number,
    failed: number,
    retrying: number,
    total: number,
    success_rate: number,
    avg_processing_time: number
  },
  total_documents: number,
  total_products_created: number,
  total_chunks_created: number,
  total_images_extracted: number
}
```

**Real-Time Updates**:
- Supabase real-time subscription on `background_jobs` table
- Automatic UI updates when job status changes
- Backup polling every 10 seconds

---

### 2. Analytics Dashboard (`/admin/analytics`)

**Purpose**: Comprehensive analytics across search, API usage, PDF processing, and quality metrics

**Tabs**:

**Search Analytics**:
- Total searches performed
- Average response time
- Top search queries
- Search success rate
- Query patterns and trends

**API Usage**:
- Total API calls
- Calls by endpoint
- Response time distribution
- Error rate tracking
- Rate limit monitoring

**Agent Chat Analytics**:
- Total chat interactions
- Average response time
- Positive/negative ratings
- Estimated costs per model
- Agent performance metrics

**Quality Metrics**:
- Chunk quality scores (92%)
- Search precision (87%)
- Data stability (99.2%)
- User satisfaction (4.2/5)

**PDF Processing**:
- Documents processed
- Products extracted
- Processing success rate
- Average processing time

---

### 3. AI Monitoring Dashboard (`/admin/ai-monitoring`)

**Purpose**: Track AI model usage, costs, and performance

**Metrics**:
- **Cost Tracking**: Real-time cost per model (Claude, GPT, Llama)
- **Model Usage**: API calls by model and endpoint
- **Confidence Scores**: Distribution of AI confidence scores
- **Latency Metrics**: Response times per model
- **Fallback Rates**: When primary models fail and fallbacks are used

**Time Periods**: 24h, 7d, 30d, 90d

**Models Tracked**:
- Claude Sonnet 4.5
- Claude Haiku 4.5
- GPT-4o
- GPT-5
- Llama 4 Scout 17B Vision
- OpenAI text-embedding-3-small

---

## 🔄 Real-Time Job Tracking

### Background Jobs System

**Table**: `background_jobs`

**Columns**:
```sql
id: UUID
workspace_id: UUID
document_id: UUID
job_type: TEXT (pdf_processing, image_analysis, etc.)
status: TEXT (pending, processing, completed, failed, retrying, cancelled)
progress: INTEGER (0-100)
created_at: TIMESTAMP
started_at: TIMESTAMP
completed_at: TIMESTAMP
failed_at: TIMESTAMP
error: TEXT
metadata: JSONB
```

**Metadata Fields**:
```json
{
  "filename": "harmony.pdf",
  "stage": "IMAGES_EXTRACTED",
  "products_discovered": 14,
  "chunks_created": 229,
  "images_extracted": 249,
  "embeddings_generated": 750,
  "processing_time_ms": 180000,
  "ai_model": "claude-sonnet-4-5",
  "retry_count": 0
}
```

---

## 📈 Monitoring Integration

### Stage 0: Product Discovery

**Metrics Tracked**:
- `products_discovered` - Number of products found
- `certificates_discovered` - Number of certificates found
- `logos_discovered` - Number of logos found
- `specifications_discovered` - Number of specifications found
- `total_entities` - Total entities across all categories
- `discovery_time_ms` - Processing time
- `discovery_model` - AI model used
- `confidence_score` - Overall confidence

**Logging**:
```python
logger.info(f"✅ [STAGE 0] Discovery Complete:")
logger.info(f"   Products: {products_discovered}")
logger.info(f"   Total Entities: {total_entities}")
logger.info(f"   Model: {discovery_model}")
logger.info(f"   Time: {discovery_time_ms}ms")
```

**Checkpoint Metadata**:
```json
{
  "products_discovered": 14,
  "certificates_discovered": 2,
  "logos_discovered": 3,
  "specifications_discovered": 1,
  "total_entities": 20,
  "discovery_time_ms": 5000,
  "discovery_model": "claude-sonnet-4-5",
  "confidence_score": 0.95
}
```

---

### Stage 1: Focused Extraction

**Metrics Tracked**:
- `extracted_pages_count` - Number of pages extracted
- `total_pages_count` - Total pages in PDF
- `text_length` - Length of extracted text
- `extraction_rate` - Percentage of pages extracted
- `focused_extraction` - Boolean flag

**Logging**:
```python
logger.info(f"✅ [STAGE 1] Focused Extraction Complete:")
logger.info(f"   Pages Extracted: {extracted_pages_count}/{total_pages_count}")
logger.info(f"   Extraction Rate: {extraction_rate}%")
logger.info(f"   Text Length: {text_length} chars")
```

---

### Stage 3.5: Embedding-to-Text Conversion

**Purpose**: Convert visual embeddings to text descriptions for enhanced search

**Metrics Tracked**:
- `embedding_to_text_count` - Successful conversions
- `embedding_to_text_failed` - Failed conversions
- `embedding_to_text_ai_calls` - AI API calls made
- `visual_metadata_extracted` - Boolean flag

**Logging**:
```python
logger.info(f"✅ [STAGE 3.5] Embedding-to-Text Complete:")
logger.info(f"   Successful: {embedding_to_text_count}")
logger.info(f"   Failed: {embedding_to_text_failed}")
logger.info(f"   AI Calls: {embedding_to_text_ai_calls}")
```

---

### Stage 4: Metadata Consolidation

**Purpose**: Consolidate metadata from all sources (discovery, extraction, embeddings)

**Metrics Tracked**:
- `metadata_consolidation_count` - Products consolidated
- `metadata_consolidation_failed` - Failed consolidations
- `metadata_consolidation_ai_calls` - AI API calls made
- `metadata_sources_merged` - Number of sources merged

**Logging**:
```python
logger.info(f"✅ [STAGE 4] Metadata Consolidation Complete:")
logger.info(f"   Products Consolidated: {metadata_consolidation_count}")
logger.info(f"   Sources Merged: {metadata_sources_merged}")
logger.info(f"   AI Calls: {metadata_consolidation_ai_calls}")
```

---

## 🎯 Checkpoint System

### 9 Processing Checkpoints

All stages save comprehensive metrics to checkpoints for recovery:

1. **INITIALIZED** - Job created
2. **PDF_EXTRACTED** - Stage 1 complete (focused extraction)
3. **CHUNKS_CREATED** - Stage 2 complete (chunking)
4. **TEXT_EMBEDDINGS_GENERATED** - Stage 3 complete (text embeddings)
5. **IMAGES_EXTRACTED** - Stage 5 complete (image extraction)
6. **IMAGE_EMBEDDINGS_GENERATED** - Stage 7 complete (CLIP embeddings)
7. **PRODUCTS_DETECTED** - Stage 0 complete (product discovery)
8. **PRODUCTS_CREATED** - Stage 9 complete (product creation)
9. **COMPLETED** - All stages complete

**Checkpoint Data Structure**:
```json
{
  "stage": "IMAGES_EXTRACTED",
  "checkpoint_data": {
    "document_id": "uuid",
    "images_extracted": 249,
    "material_images": 150
  },
  "metadata": {
    "processing_time_ms": 120000,
    "ai_model": "llama-4-scout-17b",
    "success_rate": 0.98
  }
}
```

---

## 📊 Sentry Integration

### Exception Tracking

All stages integrate with Sentry for exception capture:

```python
try:
    # Processing logic
    result = await process_stage()
except Exception as e:
    sentry_sdk.capture_exception(e)
    logger.error(f"❌ Stage failed: {e}")
    raise
```

**Sentry Context**:
- Job ID
- Document ID
- Current stage
- Processing metrics
- Error stack trace

---

## 🔍 Search Analytics

### Query Tracking

**Table**: `search_queries`

**Metrics**:
- Query text
- Response time
- Results count
- User satisfaction
- Filters applied
- Search strategy used

**Analytics**:
- Top search queries
- Average response time
- Success rate
- Query patterns
- User behavior

---

## 💰 Cost Tracking

### AI Model Costs

**Per Model Pricing**:
- Claude Sonnet 4.5: $3.00 / 1M input tokens, $15.00 / 1M output tokens
- Claude Haiku 4.5: $0.80 / 1M input tokens, $4.00 / 1M output tokens
- GPT-4o: $2.50 / 1M input tokens, $10.00 / 1M output tokens
- Llama 4 Scout 17B: $0.30 / 1M tokens
- text-embedding-3-small: $0.02 / 1M tokens

**Cost Calculation**:
```typescript
const calculateCost = (model: string, inputTokens: number, outputTokens: number) => {
  const pricing = MODEL_PRICING[model];
  const inputCost = (inputTokens / 1_000_000) * pricing.input;
  const outputCost = (outputTokens / 1_000_000) * pricing.output;
  return inputCost + outputCost;
};
```

---

## 📈 Performance Metrics

### System-Wide Metrics

**Uptime**: 99.5%+
**Users**: 5,000+
**Search Response**: 200-800ms
**PDF Processing**: 1-15 minutes (size-dependent)
**Concurrent Jobs**: Unlimited queue

**Accuracy**:
- Product Detection: 95%+
- Search Accuracy: 85%+
- Material Recognition: 90%+
- Image Classification: 88%+

---

## 🔔 Alerts & Notifications

### Alert Types

**Critical Alerts**:
- API down (>5 minutes)
- Database connection lost
- OOM errors
- Job stuck (>30 minutes)

**Warning Alerts**:
- High error rate (>5%)
- Slow response times (>2s)
- Low success rate (<90%)
- High AI costs (>$100/day)

**Notification Channels**:
- Sentry (exception tracking)
- Email (critical alerts)
- Dashboard (real-time metrics)

---

**Last Updated**: 2025-01-09
**Version**: 1.0.0
**Status**: Production
**Coverage**: All pipeline stages, admin dashboards, and monitoring systems


