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
| **Claude Vision Concurrent** | 2 | Vision analysis (post-2026-05-01: schema-locked via tool use) |
| **SLIG Cloud Concurrent** | 20 | Visual + specialized embeddings |
| **PaddleOCR-VL Concurrent** | 8 | Layout + page/block OCR (Modal-hosted structural pass) |
| **Batch Size** | 15 images | Memory optimization |

**Why these limits?**
- **Claude (2)**: vision-via-tool-use is the sole vision path post-2026-05-01; rate-limited → low concurrency
- **SLIG (20)**: Modal endpoint (scale-to-zero) → high concurrency
- **PaddleOCR-VL (8)**: Modal-hosted endpoint (GPU L4, scale-to-zero, `max_containers=4`); concurrency bounded so warm containers aren't oversubscribed (post-2026-06-13: replaced the Surya-2 backbone, which had replaced YOLO + Chandra + merge_layout)
- **Batch (15)**: Prevents OOM on large PDFs with 500+ images
; Gate deleted along with `endpoint_controller.

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

### 3. Embedding Generation (SLIG + Voyage)

**Applies to**: PDF, Web Scraping, XML Import
**Service**: `ImageProcessingService`

| Limit | Value | Purpose |
|-------|-------|---------|
| **Batch Size** | 20 images | Memory optimization |
| **Max Retries** | 3 | Retry failed embeddings |

**Why 20?**
- SLIG/Voyage batch processes ~20 images in 10-15 seconds
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
**Service**: `AIClientService` (Anthropic), `paddleocr_endpoint_manager`, `slig_client`

| Operation | Timeout | Purpose |
|-----------|---------|---------|
| **Claude Vision Request** | 120s | Vision analysis via Anthropic tool use |
| **PaddleOCR-VL Request** | 60s per attempt | Layout + page/block OCR (Modal `/parse`; ~1-3s/page warm, ~90s cold start paid once at warmup) |
| **SLIG Embedding Request** | 30s | 1× visual 768D vector (SigLIP2) |

---

## Rate Limiting

### 1. Inference Endpoints (SLIG SigLIP2 + PaddleOCR-VL, both on Modal)

**Applies to**: PDF, Web Scraping, XML Import
**Services**: `slig_client`, `paddleocr_endpoint_manager`

> **Note (2026-06-13)**: The layout+OCR backbone is **PaddleOCR-VL** (`PaddlePaddle/PaddleOCR-VL-1.6`, two-stage: PP-DocLayoutV3 RT-DETR detector + 0.9B VLM), hosted on **Modal** (app `paddleocr-vl`, GPU L4, scale-to-zero). It replaced Surya-2 (which had replaced YOLO + Chandra + `merge_layout`). Both SLIG and PaddleOCR-VL run on **Modal**; HuggingFace hosts nothing.
> **Note (2026. Vision moved to Anthropic Claude Opus 5 via tool use.

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

Shared limits across all methods (post-2026-06-13): 2 concurrent Claude vision requests, 20 concurrent SLIG embedding requests, 8 concurrent PaddleOCR-VL layout/OCR requests, 10 concurrent uploads, classification batch size of 15 images, SLIG batch size of 20 images.

---

### 2. RealEmbeddingsService

**Used by**: PDF, Web Scraping, XML Import

Generates 6 embedding types written directly to VECS:
- `image_slig_embeddings` (visual, **768D** SigLIP2 via SLIG cloud endpoint)
- `image_color_embeddings`, `image_texture_embeddings`, `image_style_embeddings`, `image_material_embeddings` (aspect embeddings, **1024D** Voyage AI from deterministic per-image `VisionAnalysis` field serializations — post-2026-05-04; pre-v2 these were 768D SLIG-blend vectors)
- `image_understanding_embeddings` (**1024D** Voyage AI from Claude Opus 5 `VisionAnalysis` JSON via `serialize_vision_analysis_to_text`)

Updated 2026-04: legacy `google/siglip-so400m-patch14-384` (1152D) and CLIP 512D collections were dropped. Updated 2026.7 tool use.

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
| **SLIG+Voyage Embeddings** | 20 images | ~300MB per batch |
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
| **Modal (SLIG SigLIP2)** | scale-to-zero | Semaphore (20 concurrent) |
| **Modal (PaddleOCR-VL)** | scale-to-zero, `max_containers=4` | Semaphore (8 concurrent) + retry |
| **Anthropic Claude** | Circuit breaker | Semaphore (2 concurrent — sole vision path) |
| **Voyage AI** | 429 with Retry-After | Honors header, 2 retries |
| **OpenAI** | No limit | Batch processing (optional alternatives only) |

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
| **Claude Vision (tool use)** | 2 concurrent | 2 concurrent | 2 concurrent |
| **SLIG Embeddings** | 20 concurrent | 20 concurrent | 20 concurrent |
| **PaddleOCR-VL** | 8 concurrent | 8 concurrent | 8 concurrent |
| **Image Classification Batch** | 15 images | 15 images | 15 images |
| **Image Uploads** | 10 concurrent | 10 concurrent | 10 concurrent |
| **SLIG Batch** | 20 images | 20 images | 20 images |
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
✅ **Same concurrency limits**: 2 Claude (sole vision path), 20 SLIG, 8 PaddleOCR-VL, 10 uploads
✅ **Same timeout guards**: 300s discovery, 120s AI, 30s downloads
✅ **Same rate limiting**: SLIG (Modal) / PaddleOCR-VL (Modal) endpoint-paced, circuit breaker on Claude, Voyage 429 with Retry-After
✅ **Same shared services**: ImageProcessingService, RealEmbeddingsService, AsyncQueueService
✅ **Memory optimized**: Batch processing prevents OOM
✅ **Network optimized**: Semaphores prevent congestion
✅ **API optimized**: Rate limiting prevents throttling

**The architecture is unified, consistent, and production-ready!** 🚀
