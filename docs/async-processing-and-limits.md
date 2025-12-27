# Async Processing & Concurrency Limits

Complete documentation for async processing architecture and concurrency limits across all product generation methods.

---

## 📋 Table of Contents

1. [Overview](#overview)
2. [Async Architecture](#async-architecture)
3. [Concurrency Limits](#concurrency-limits)
4. [Timeout Configuration](#timeout-configuration)
5. [Rate Limiting](#rate-limiting)
6. [Shared Services](#shared-services)
7. [Performance Optimization](#performance-optimization)

---

## Overview

All three product generation methods (PDF Processing, Web Scraping, XML Import) use **fully async processing** with **unified concurrency limits** to ensure:

- **Memory efficiency**: Prevent OOM crashes
- **API rate limiting**: Respect external API limits
- **Resource optimization**: Balance speed vs. resource usage
- **Consistent behavior**: Same limits across all methods

### Key Principles

✅ **Fully Async**: All I/O operations use `async/await`  
✅ **Semaphore-based**: Concurrency controlled via `asyncio.Semaphore`  
✅ **Batch Processing**: Large datasets processed in batches  
✅ **Retry Logic**: Automatic retry with exponential backoff  
✅ **Circuit Breakers**: Prevent cascading failures  
✅ **Timeout Guards**: Prevent infinite hangs  

---

## Async Architecture

### 1. Main Processing Flow

All three methods use `AsyncQueueService` for background job processing:

```python
# PDF Processing
async def process_pdf_document(document_id: str, workspace_id: str):
    # Fully async processing
    result = await pdf_processor.process_pdf_from_bytes(...)
    await chunking_service.create_chunks_and_embeddings(...)
    await image_processing_service.process_images(...)

# Web Scraping
async def process_scraping_session(session_id: str, workspace_id: str):
    # Fully async processing
    catalog = await discovery_service.discover_products_from_text(...)
    await chunking_service.create_chunks_and_embeddings(...)
    await image_processing_service.process_images(...)

# XML Import
async def process_import_job(job_id: str, workspace_id: str):
    # Fully async processing
    await self._process_batch(...)
    await self._queue_text_processing(...)
    await image_downloader.download_images(...)
```

### 2. Background Job Processing

```python
# AsyncQueueService - Shared across all methods
class AsyncQueueService:
    async def queue_ai_analysis_jobs(
        self,
        chunks: List[Dict],
        analysis_type: str = 'embedding_generation'
    ):
        # Queue jobs for async processing
        # - Chunking
        # - Embedding generation
        # - Product enrichment
```

### 3. Progress Tracking

All methods update `background_jobs` table in real-time:

```python
await self._update_background_job_status(
    job_id=job_id,
    status='processing',
    progress_percent=50,
    metadata={'stage': 'image_processing'}
)
```

---

## Concurrency Limits

### 1. Image Classification (AI-based filtering)

**Applies to**: PDF, Web Scraping, XML Import  
**Service**: `ImageProcessingService`

| Limit | Value | Purpose |
|-------|-------|---------|
| **Qwen Vision Concurrent** | 5 | Fast material classification |
| **Claude Validation Concurrent** | 2 | Validation for uncertain cases |
| **Batch Size** | 15 images | Memory optimization |

```python
# mivaa-pdf-extractor/app/services/image_processing_service.py
together_semaphore = Semaphore(5)   # 5 concurrent TogetherAI (Qwen) requests
claude_semaphore = Semaphore(2)  # 2 concurrent Claude requests
batch_size = 15  # Process 15 images per batch
```

**Why these limits?**
- **TogetherAI/Qwen (5)**: Fast, cheap model → higher concurrency
- **Claude (2)**: Expensive, rate-limited → lower concurrency
- **Batch (15)**: Prevents OOM on large PDFs with 500+ images

---

### 2. Image Upload to Storage

**Applies to**: PDF, Web Scraping, XML Import  
**Service**: `ImageProcessingService`

| Limit | Value | Purpose |
|-------|-------|---------|
| **Concurrent Uploads** | 10 | Supabase Storage upload limit |

```python
# mivaa-pdf-extractor/app/services/image_processing_service.py
upload_semaphore = Semaphore(10)  # 10 concurrent uploads
```

**Why 10?**
- Supabase Storage can handle ~10 concurrent uploads
- Higher values cause connection pool exhaustion

---

### 3. CLIP Embeddings Generation

**Applies to**: PDF, Web Scraping, XML Import  
**Service**: `ImageProcessingService`

| Limit | Value | Purpose |
|-------|-------|---------|
| **Batch Size** | 20 images | Memory optimization |
| **Max Retries** | 3 | Retry failed embeddings |

```python
# mivaa-pdf-extractor/app/services/image_processing_service.py
async def save_images_and_generate_clips(
    self,
    material_images: List[Dict[str, Any]],
    document_id: str,
    workspace_id: str,
    batch_size: int = 20,  # 20 images per batch
    max_retries: int = 3   # 3 retry attempts
)
```

**Why 20?**
- CLIP model processes ~20 images in 10-15 seconds
- Larger batches cause memory spikes

---

### 4. Image Downloads (XML Import Only)

**Applies to**: XML Import  
**Service**: `ImageDownloadService`

| Limit | Value | Purpose |
|-------|-------|---------|
| **Concurrent Downloads** | 5 | Network bandwidth optimization |
| **Max Retries** | 3 | Retry failed downloads |
| **Timeout** | 30 seconds | Prevent hanging downloads |
| **Max File Size** | 10 MB | Prevent large file downloads |

```python
# mivaa-pdf-extractor/app/services/image_download_service.py
class ImageDownloadService:
    def __init__(self):
        self.max_concurrent = 5  # 5 concurrent downloads
        self.max_retries = 3     # 3 retry attempts
        self.timeout = 30        # 30 seconds timeout
        self.max_file_size = 10 * 1024 * 1024  # 10MB max
```

**Why these limits?**
- **5 concurrent**: Prevents network congestion
- **30s timeout**: Most images download in <10s
- **10MB max**: Prevents downloading huge files

---

### 5. Product Batch Processing (XML Import Only)

**Applies to**: XML Import
**Service**: `DataImportService`

| Limit | Value | Purpose |
|-------|-------|---------|
| **Batch Size** | 10 products | Memory optimization |
| **Image Downloads per Batch** | 5 concurrent | Network optimization |

```python
# mivaa-pdf-extractor/app/services/data_import_service.py
class DataImportService:
    def __init__(self):
        self.batch_size = 10  # Process 10 products at a time
        self.max_concurrent_images = 5  # Download 5 images concurrently
```

**Why 10 products?**
- Each product can have 5-10 images
- 10 products × 5 images = 50 images per batch
- Prevents memory spikes on large imports

---

### 6. PDF Processing Workers

**Applies to**: PDF Processing
**Service**: `PDFProcessor`

| Limit | Value | Purpose |
|-------|-------|---------|
| **Max Workers** | 2 | Memory optimization (reduced from 4) |
| **Pages per Worker** | 5 | Batch size for page processing |
| **Max Pages in Memory** | 10 | 2 workers × 5 pages |

```python
# mivaa-pdf-extractor/app/services/pdf_processor.py
# REDUCED from 4 to 2 workers to prevent OOM kills
# (each worker processes 5 pages = 10 pages max in memory)
max_workers = self.config.get('max_workers', 2)
self.executor = ThreadPoolExecutor(max_workers=max_workers)
```

**Why 2 workers?**
- **Before**: 4 workers × 5 pages = 20 pages in memory → OOM crashes
- **After**: 2 workers × 5 pages = 10 pages in memory → Stable

---

## Timeout Configuration

### 1. Product Discovery Timeouts

**Applies to**: PDF, Web Scraping
**Service**: `ProductDiscoveryService`

| Operation | Timeout | Purpose |
|-----------|---------|---------|
| **Product Discovery** | 300s (5 min) | AI analysis of full document |
| **Per-product Extraction** | 60s | Individual product metadata |

```python
# mivaa-pdf-extractor/app/services/product_discovery_service.py
async def discover_products(self, pdf_content: bytes, pdf_text: str):
    result = await with_timeout(
        self._discover_products_internal(...),
        timeout_seconds=300,  # 5 minutes
        operation_name="Product discovery"
    )
```

---

### 2. PDF Extraction Timeouts

**Applies to**: PDF Processing
**Service**: `PDFProcessor`

| Operation | Timeout | Purpose |
|-----------|---------|---------|
| **Full PDF Extraction** | 7200s (2 hours) | Large PDFs with OCR |
| **Per-page Extraction** | Dynamic | Based on file size |

```python
# Dynamic timeout calculation
file_size_mb = len(pdf_bytes) / (1024 * 1024)
num_pages = len(product_pages)
pdf_extraction_timeout = max(300, file_size_mb * 10 + num_pages * 5)
```

**Why dynamic?**
- Small PDFs (10 pages, 5MB): ~300s
- Large PDFs (500 pages, 50MB): ~3000s (50 min)

---

### 3. Image Download Timeouts

**Applies to**: XML Import
**Service**: `ImageDownloadService`

| Operation | Timeout | Purpose |
|-----------|---------|---------|
| **Per-image Download** | 30s | Single image download |

```python
# mivaa-pdf-extractor/app/services/image_download_service.py
async with httpx.AsyncClient(timeout=30) as client:
    response = await client.get(url)
```

---

### 4. AI Classification Timeouts

**Applies to**: PDF, Web Scraping, XML Import
**Service**: `TogetherAIService`, `AIClientService`

| Operation | Timeout | Purpose |
|-----------|---------|---------|
| **Qwen Vision Request** | 120s | Image classification |
| **Claude Request** | 120s | Validation |

```python
# mivaa-pdf-extractor/app/services/together_ai_service.py
@dataclass
class TogetherAIConfig:
    timeout: int = 120  # 2 minutes
```

---

## Rate Limiting

### 1. TogetherAI (Qwen Vision)

**Applies to**: PDF, Web Scraping, XML Import
**Service**: `TogetherAIService`

| Limit | Value | Purpose |
|-------|-------|---------|
| **Requests per Minute** | 10 | API rate limit |
| **Burst Limit** | 5 | Short-term burst |

```python
# mivaa-pdf-extractor/app/services/together_ai_service.py
@dataclass
class TogetherAIConfig:
    rate_limit_requests_per_minute: int = 10
    rate_limit_burst: int = 5
```

---

### 2. Claude API (Circuit Breaker)

**Applies to**: PDF, Web Scraping, XML Import
**Service**: `CircuitBreaker`

| Limit | Value | Purpose |
|-------|-------|---------|
| **Failure Threshold** | 5 | Open circuit after 5 failures |
| **Recovery Timeout** | 60s | Try again after 60s |

```python
# mivaa-pdf-extractor/app/utils/circuit_breaker.py
claude_breaker = CircuitBreaker(
    failure_threshold=5,
    recovery_timeout=60
)
```

---

### 3. Image Export Rate Limiting

**Applies to**: All methods
**Service**: `images.py` API

| Limit | Value | Purpose |
|-------|-------|---------|
| **Exports per Hour** | 5 | Prevent abuse |

```python
# mivaa-pdf-extractor/app/api/images.py
EXPORT_RATE_LIMIT = 5  # Max exports per hour
EXPORT_RATE_WINDOW = 3600  # 1 hour in seconds
```

---

## Shared Services

All three methods use the **SAME** services with **SAME** limits:

### 1. ImageProcessingService

**Used by**: PDF, Web Scraping, XML Import

```python
# Shared limits across all methods
together_semaphore = Semaphore(5)   # 5 concurrent TogetherAI (Qwen)
claude_semaphore = Semaphore(2)  # 2 concurrent Claude
upload_semaphore = Semaphore(10) # 10 concurrent uploads
batch_size = 15  # Classification batch
clip_batch_size = 20  # CLIP batch
```

---

### 2. RealEmbeddingsService

**Used by**: PDF, Web Scraping, XML Import

```python
# Shared CLIP model and embeddings
model = "google/siglip-so400m-patch14-384"  # SigLIP 1152D
specialized_embeddings = [
    'color_siglip_1152',
    'texture_siglip_1152',
    'material_siglip_1152',
    'style_siglip_1152',
    'visual_siglip_1152'
]
```

---

### 3. AsyncQueueService

**Used by**: PDF, Web Scraping, XML Import

```python
# Shared background job processing
async def queue_ai_analysis_jobs(
    chunks: List[Dict],
    analysis_type: str = 'embedding_generation'
):
    # Queue jobs for:
    # - Chunking
    # - Embedding generation
    # - Product enrichment
```

---

### 4. ChunkingService

**Used by**: PDF, Web Scraping, XML Import

```python
# Shared chunking logic
class UnifiedChunkingService:
    chunk_size = 1000  # Characters per chunk
    chunk_overlap = 200  # Overlap between chunks
```

---

## Performance Optimization

### 1. Memory Optimization

**Batch Processing**: All methods process data in batches to prevent OOM

| Method | Batch Size | Memory Impact |
|--------|-----------|---------------|
| **PDF Image Classification** | 15 images | ~500MB per batch |
| **CLIP Embeddings** | 20 images | ~300MB per batch |
| **XML Product Import** | 10 products | ~200MB per batch |

---

### 2. Network Optimization

**Concurrent Downloads**: Controlled via semaphores

| Operation | Concurrency | Throughput |
|-----------|-------------|------------|
| **Image Downloads (XML)** | 5 concurrent | ~5 images/sec |
| **Image Uploads** | 10 concurrent | ~10 images/sec |

---

### 3. API Optimization

**Rate Limiting**: Prevent API throttling

| API | Limit | Strategy |
|-----|-------|----------|
| **TogetherAI (Qwen)** | 10 req/min | Semaphore (5 concurrent) |
| **Claude** | Circuit breaker | Semaphore (2 concurrent) |
| **OpenAI** | No limit | Batch processing |

---

## Comparison Table

### Async Processing

| Feature | PDF | Web | XML |
|---------|-----|-----|-----|
| **Main Processing** | ✅ Fully async | ✅ Fully async | ✅ Fully async |
| **Background Jobs** | ✅ AsyncQueueService | ✅ AsyncQueueService | ✅ AsyncQueueService |
| **Product Discovery** | ✅ Async + timeout | ✅ Async + timeout | ✅ Async (queued) |
| **Image Processing** | ✅ Async + semaphores | ✅ Async + semaphores | ✅ Async + semaphores |
| **Chunking** | ✅ Async | ✅ Async | ✅ Async (queued) |
| **Embeddings** | ✅ Async | ✅ Async | ✅ Async (queued) |

---

### Concurrency Limits

| Limit | PDF | Web | XML |
|-------|-----|-----|-----|
| **Qwen Vision** | 5 concurrent | 5 concurrent | 5 concurrent |
| **Claude Validation** | 2 concurrent | 2 concurrent | 2 concurrent |
| **Image Classification Batch** | 15 images | 15 images | 15 images |
| **Image Uploads** | 10 concurrent | 10 concurrent | 10 concurrent |
| **CLIP Batch** | 20 images | 20 images | 20 images |
| **Image Downloads** | N/A | N/A | 5 concurrent |
| **Product Batch** | N/A | N/A | 10 products |
| **PDF Workers** | 2 workers | N/A | N/A |

---

### Timeout Limits

| Timeout | PDF | Web | XML |
|---------|-----|-----|-----|
| **Product Discovery** | 300s (5 min) | 300s (5 min) | N/A |
| **PDF Extraction** | 7200s (2 hours) | N/A | N/A |
| **Image Download** | N/A | N/A | 30s |
| **AI Classification** | 120s | 120s | 120s |

---

## Best Practices

### 1. Monitoring

```python
# Always log batch progress
logger.info(f"Processing batch {batch_num}/{total_batches}")
logger.info(f"Progress: {progress_percent}%")
```

### 2. Error Handling

```python
# Always use try/except with detailed logging
try:
    result = await process_batch(...)
except Exception as e:
    logger.error(f"Batch failed: {e}")
    # Continue with next batch
```

### 3. Resource Cleanup

```python
# Always cleanup after batch processing
import gc
del batch_data
gc.collect()
```

### 4. Progress Tracking

```python
# Always update background_jobs table
await self._update_background_job_status(
    job_id=job_id,
    progress_percent=progress,
    metadata={'stage': 'current_stage'}
)
```

---

## Summary

✅ **All methods fully async**: PDF, Web Scraping, XML Import
✅ **Same concurrency limits**: 5 TogetherAI (Qwen), 2 Claude, 10 uploads, 20 CLIP
✅ **Same timeout guards**: 300s discovery, 120s AI, 30s downloads
✅ **Same rate limiting**: 10 req/min TogetherAI, circuit breaker Claude
✅ **Same shared services**: ImageProcessingService, RealEmbeddingsService, AsyncQueueService
✅ **Memory optimized**: Batch processing prevents OOM
✅ **Network optimized**: Semaphores prevent congestion
✅ **API optimized**: Rate limiting prevents throttling

**The architecture is unified, consistent, and production-ready!** 🚀


