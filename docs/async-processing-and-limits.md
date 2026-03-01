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

All three methods use `AsyncQueueService` for background job processing. PDF Processing uses `process_pdf_document()`, Web Scraping uses `process_scraping_session()`, and XML Import uses `process_import_job()`. All are fully async and use the same downstream services for chunking, embedding, and image processing.

### 2. Background Job Processing

The `AsyncQueueService` is shared across all three methods. It queues jobs for chunking, embedding generation, and product enrichment via its `queue_ai_analysis_jobs()` method.

### 3. Progress Tracking

All methods update the `background_jobs` table in real-time with the current job status, progress percentage, and metadata about the current stage.

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

**Why these limits?**
- **HuggingFace/Qwen (5)**: HuggingFace Endpoint (Qwen3-VL 32B) → higher concurrency
- **Claude (2)**: Expensive, rate-limited → lower concurrency
- **Batch (15)**: Prevents OOM on large PDFs with 500+ images

---

### 2. Image Upload to Storage

**Applies to**: PDF, Web Scraping, XML Import
**Service**: `ImageProcessingService`

| Limit | Value | Purpose |
|-------|-------|---------|
| **Concurrent Uploads** | 10 | Supabase Storage upload limit |

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

---

### 2. PDF Extraction Timeouts

**Applies to**: PDF Processing
**Service**: `PDFProcessor`

| Operation | Timeout | Purpose |
|-----------|---------|---------|
| **Full PDF Extraction** | 7200s (2 hours) | Large PDFs with OCR |
| **Per-page Extraction** | Dynamic | Based on file size |

The per-page timeout is calculated dynamically: `max(300, file_size_mb * 10 + num_pages * 5)`. This means a small PDF (10 pages, 5MB) gets ~300s, while a large PDF (500 pages, 50MB) gets ~3000s (50 min).

---

### 3. Image Download Timeouts

**Applies to**: XML Import
**Service**: `ImageDownloadService`

| Operation | Timeout | Purpose |
|-----------|---------|---------|
| **Per-image Download** | 30s | Single image download |

---

### 4. AI Classification Timeouts

**Applies to**: PDF, Web Scraping, XML Import
**Service**: `QwenEndpointService`, `AIClientService`

| Operation | Timeout | Purpose |
|-----------|---------|---------|
| **Qwen Vision Request** | 120s | Image classification |
| **Claude Request** | 120s | Validation |

---

## Rate Limiting

### 1. HuggingFace Endpoint (Qwen3-VL Vision)

**Applies to**: PDF, Web Scraping, XML Import
**Service**: `QwenEndpointService`

| Limit | Value | Purpose |
|-------|-------|---------|
| **Requests per Minute** | 10 | API rate limit |
| **Burst Limit** | 5 | Short-term burst |

---

### 2. Claude API (Circuit Breaker)

**Applies to**: PDF, Web Scraping, XML Import
**Service**: `CircuitBreaker`

| Limit | Value | Purpose |
|-------|-------|---------|
| **Failure Threshold** | 5 | Open circuit after 5 failures |
| **Recovery Timeout** | 60s | Try again after 60s |

---

### 3. Image Export Rate Limiting

**Applies to**: All methods
**Service**: `images.py` API

| Limit | Value | Purpose |
|-------|-------|---------|
| **Exports per Hour** | 5 | Prevent abuse |

---

## Shared Services

All three methods use the **SAME** services with **SAME** limits:

### 1. ImageProcessingService

**Used by**: PDF, Web Scraping, XML Import

Shared limits across all methods: 5 concurrent HuggingFace Endpoint (Qwen3-VL) requests, 2 concurrent Claude requests, 10 concurrent uploads, classification batch size of 15 images, and CLIP batch size of 20 images.

---

### 2. RealEmbeddingsService

**Used by**: PDF, Web Scraping, XML Import

Uses the `google/siglip-so400m-patch14-384` (SigLIP 1152D) model and generates five specialized embedding types: `color_siglip_1152`, `texture_siglip_1152`, `material_siglip_1152`, `style_siglip_1152`, and `visual_siglip_1152`.

---

### 3. AsyncQueueService

**Used by**: PDF, Web Scraping, XML Import

Shared background job processing for chunking, embedding generation, and product enrichment.

---

### 4. ChunkingService

**Used by**: PDF, Web Scraping, XML Import

Shared chunking logic with chunk size of 1000 characters and overlap of 200 characters.

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
| **HuggingFace (Qwen3-VL)** | 10 req/min | Semaphore (5 concurrent) |
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

Always log batch progress including the current batch number, total batches, and progress percentage to enable real-time tracking.

### 2. Error Handling

Use try/except blocks with detailed logging around every batch processing call. On failure, log the error with context and continue processing the next batch rather than aborting the entire job.

### 3. Resource Cleanup

After each batch, explicitly delete the batch data reference and call the garbage collector to free memory, particularly important for large image batches.

### 4. Progress Tracking

Always update the `background_jobs` table after each stage with the current progress percentage and stage name so the frontend can display accurate real-time progress.

---

## Summary

✅ **All methods fully async**: PDF, Web Scraping, XML Import
✅ **Same concurrency limits**: 5 HuggingFace/Qwen, 2 Claude, 10 uploads, 20 SLIG
✅ **Same timeout guards**: 300s discovery, 120s AI, 30s downloads
✅ **Same rate limiting**: 10 req/min HuggingFace/Qwen, circuit breaker Claude
✅ **Same shared services**: ImageProcessingService, RealEmbeddingsService, AsyncQueueService
✅ **Memory optimized**: Batch processing prevents OOM
✅ **Network optimized**: Semaphores prevent congestion
✅ **API optimized**: Rate limiting prevents throttling

**The architecture is unified, consistent, and production-ready!** 🚀
