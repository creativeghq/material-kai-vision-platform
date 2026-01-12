# 📊 Complete Limits Comparison Table

**Date**: 2026-01-10  
**Server**: DigitalOcean Premium (4 cores, 16GB RAM)

---

## File & Processing Limits

| Setting | Current | Recommended | Change | Priority | Rationale |
|---------|---------|-------------|--------|----------|-----------|
| **MAX_FILE_SIZE** | 100 MB | **500 MB** | +400% | 🔴 HIGH | 16GB RAM can handle larger files |
| **MAX_WORKERS** | 4 | **6** | +50% | 🔴 HIGH | Optimal for 4-core CPU (1.5x) |
| **REQUEST_TIMEOUT** | 300s | **600s** | +100% | 🟡 MEDIUM | Large PDFs need more time |
| **DOWNLOAD_TIMEOUT** | 30s | 30s | - | ✅ KEEP | Adequate for network downloads |
| **MAX_PAGES** | Unlimited | Unlimited | - | ✅ KEEP | Good for cloud processing |

---

## Concurrency & Parallelism

| Setting | Current | Recommended | Change | Priority | Rationale |
|---------|---------|-------------|--------|----------|-----------|
| **MAX_CONCURRENT_BATCHES** | 3 | **6** | +100% | 🔴 HIGH | Match worker count |
| **BATCH_SIZE** (general) | 10 | **30** | +200% | 🔴 HIGH | More efficient API usage |
| **MATERIAL_KAI_BATCH_SIZE** | 10 | **30** | +200% | 🔴 HIGH | Faster sync operations |
| **MULTIMODAL_BATCH_SIZE** | 5 | **15** | +200% | 🔴 HIGH | Better vision API throughput |
| **HUGGINGFACE_BATCH_SIZE** | 10 | **20** | +100% | 🟡 MEDIUM | Optimize HF endpoint usage |
| **MAX_CONCURRENT_PROCESSING** | 10 | **15** | +50% | 🟡 MEDIUM | Better parallelization |

---

## Database & Connections

| Setting | Current | Recommended | Change | Priority | Rationale |
|---------|---------|-------------|--------|----------|-----------|
| **DATABASE_POOL_SIZE** | 10 | **25** | +150% | 🔴 HIGH | Support more concurrent requests |
| **DATABASE_MAX_OVERFLOW** | 20 | **50** | +150% | 🔴 HIGH | Handle traffic spikes |
| **DATABASE_TIMEOUT** | 30s | 30s | - | ✅ KEEP | Adequate for queries |
| **DB_CONNECTION_TIMEOUT** | 10s | 10s | - | ✅ KEEP | Fast connection establishment |
| **DB_QUERY_TIMEOUT** | 30s | 30s | - | ✅ KEEP | Adequate for complex queries |

---

## Caching & Memory

| Setting | Current | Recommended | Change | Priority | Rationale |
|---------|---------|-------------|--------|----------|-----------|
| **EMBEDDING_CACHE_MAX_SIZE** | 10,000 | **50,000** | +400% | 🟡 MEDIUM | 16GB RAM can handle larger cache |
| **EMBEDDING_CACHE_TTL** | 86400s | 86400s | - | ✅ KEEP | 24 hours is good |
| **CACHE_TTL** (general) | 3600s | 3600s | - | ✅ KEEP | 1 hour is reasonable |
| **MAX_CACHE_SIZE** (perf) | 5000 | **10,000** | +100% | 🟢 LOW | More cache hits |
| **QUEUE_MAX_SIZE** | 10,000 | 10,000 | - | ✅ KEEP | Already generous |
| **DEAD_LETTER_QUEUE_SIZE** | 1000 | 1000 | - | ✅ KEEP | Adequate for errors |

---

## Rate Limiting & Throttling

| Setting | Current | Recommended | Change | Priority | Rationale |
|---------|---------|-------------|--------|----------|-----------|
| **MAX_REQUESTS_PER_MINUTE** | 60 | **150** | +150% | 🔴 HIGH | Server can handle more load |
| **RATE_LIMIT_HEALTH_CHECK** | 60/min | 60/min | - | ✅ KEEP | Health checks are lightweight |
| **RATE_LIMIT_PDF_EXTRACT** | 10/min | **20/min** | +100% | 🟡 MEDIUM | More concurrent extractions |
| **RATE_LIMIT_BATCH_PROCESS** | 5/min | **10/min** | +100% | 🟡 MEDIUM | Faster batch processing |
| **RATE_LIMIT_RPM** (general) | 1000 | 1000 | - | ✅ KEEP | Already high |

---

## Timeouts (Seconds)

| Setting | Current | Recommended | Change | Priority | Rationale |
|---------|---------|-------------|--------|----------|-----------|
| **REQUEST_TIMEOUT** | 300 | **600** | +100% | 🔴 HIGH | Large PDFs need more time |
| **PDF_PROCESSING_TIMEOUT** | 300 | **600** | +100% | 🔴 HIGH | Match request timeout |
| **QWEN_TIMEOUT** | 180 | 180 | - | ✅ KEEP | Adequate for auto-resume |
| **ANTHROPIC_TIMEOUT** | 60 | 60 | - | ✅ KEEP | Fast API responses |
| **OPENAI_TIMEOUT** | 30 | 30 | - | ✅ KEEP | Fast API responses |
| **VOYAGE_TIMEOUT** | 30 | 30 | - | ✅ KEEP | Fast embedding generation |
| **SLIG_TIMEOUT** | 60 | 60 | - | ✅ KEEP | Adequate for visual embeddings |
| **YOLO_TIMEOUT** | 30 | 30 | - | ✅ KEEP | Fast layout detection |
| **YOLO_WARMUP_TIMEOUT** | 60 | 60 | - | ✅ KEEP | Endpoint warmup time |
| **YOLO_RESUME_TIMEOUT** | 300 | 300 | - | ✅ KEEP | Adequate for auto-resume |
| **CHANDRA_INFERENCE_TIMEOUT** | 30 | 30 | - | ✅ KEEP | Fast OCR inference |
| **CHANDRA_RESUME_TIMEOUT** | 300 | 300 | - | ✅ KEEP | Adequate for auto-resume |
| **MULTIMODAL_TIMEOUT** | 60 | 60 | - | ✅ KEEP | Adequate for vision models |
| **MATERIAL_KAI_TIMEOUT** | 30 | 30 | - | ✅ KEEP | Fast API responses |
| **VALIDATION_TIMEOUT** | 3.0 | 3.0 | - | ✅ KEEP | Fast validation |
| **QUEUE_TIMEOUT** | 3600s | 3600s | - | ✅ KEEP | 1 hour max queue time |

---

## Image Processing

| Setting | Current | Recommended | Change | Priority | Rationale |
|---------|---------|-------------|--------|----------|-----------|
| **IMAGE_DPI** | 250 | 250 | - | ✅ KEEP | Optimal for material details |
| **IMAGE_RESIZE_MAX_WIDTH** | 2048 | 2048 | - | ✅ KEEP | Matches Claude limit (2000px) |
| **IMAGE_RESIZE_MAX_HEIGHT** | 2048 | 2048 | - | ✅ KEEP | Matches Claude limit |
| **MIN_IMAGE_SIZE** | 100 | 100 | - | ✅ KEEP | Filters noise effectively |
| **MAX_IMAGE_SIZE** | 2048 | 2048 | - | ✅ KEEP | Optimal for vision models |
| **IMAGE_COMPRESSION_QUALITY** | 85 | 85 | - | ✅ KEEP | Good quality/size balance |
| **MAX_DIMENSION** (converter) | 1800 | 1800 | - | ✅ KEEP | Under Claude 2000px limit |

---

## AI Model Token Limits

| Setting | Current | Recommended | Change | Priority | Rationale |
|---------|---------|-------------|--------|----------|-----------|
| **OPENAI_MAX_TOKENS** | 4096 | 4096 | - | ✅ KEEP | Cost-optimized |
| **ANTHROPIC_MAX_TOKENS** | 4096 | 4096 | - | ✅ KEEP | Cost-optimized |
| **QWEN_MAX_TOKENS** | 4096 | 4096 | - | ✅ KEEP | Cost-optimized |
| **MULTIMODAL_MAX_TOKENS** | 4096 | 4096 | - | ✅ KEEP | Cost-optimized |
| **VISION_GUIDED_MAX_TOKENS** | 4096 | 4096 | - | ✅ KEEP | Cost-optimized |
| **SLIDING_WINDOW_MAX_TOKENS** | 4000 | 4000 | - | ✅ KEEP | Good for context window |

---

## Chunking & Embeddings

| Setting | Current | Recommended | Change | Priority | Rationale |
|---------|---------|-------------|--------|----------|-----------|
| **RAG_CHUNK_SIZE** | 1024 | 1024 | - | ✅ KEEP | Well-optimized for RAG |
| **RAG_CHUNK_OVERLAP** | 200 | 200 | - | ✅ KEEP | Good overlap for context |
| **PARENT_CHUNK_SIZE** | 2048 | 2048 | - | ✅ KEEP | Good for hierarchical chunking |
| **CHILD_CHUNK_SIZE** | 256 | 256 | - | ✅ KEEP | Good for fine-grained search |
| **CHILD_CHUNK_OVERLAP** | 50 | 50 | - | ✅ KEEP | Adequate overlap |
| **ADAPTIVE_CHUNK_MIN_SIZE** | 256 | 256 | - | ✅ KEEP | Good minimum |
| **ADAPTIVE_CHUNK_MAX_SIZE** | 1500 | 1500 | - | ✅ KEEP | Good maximum |
| **MAX_CHUNK_SIZE** (general) | 10000 | 10000 | - | ✅ KEEP | Safety limit |
| **MAX_OVERLAP_SIZE** | 1000 | 1000 | - | ✅ KEEP | Safety limit |

---

## Confidence Thresholds

| Setting | Current | Recommended | Change | Priority | Rationale |
|---------|---------|-------------|--------|----------|-----------|
| **OCR_CONFIDENCE_THRESHOLD** | 0.6 | 0.6 | - | ✅ KEEP | Balanced for quality |
| **CHANDRA_CONFIDENCE_THRESHOLD** | 0.7 | 0.7 | - | ✅ KEEP | Trigger Chandra fallback |
| **YOLO_CONFIDENCE_THRESHOLD** | 0.5 | 0.5 | - | ✅ KEEP | Good for layout detection |
| **VISION_GUIDED_CONFIDENCE** | 0.8 | 0.8 | - | ✅ KEEP | High confidence for extraction |
| **SEMANTIC_SIMILARITY_THRESHOLD** | 0.8 | 0.8 | - | ✅ KEEP | Good for semantic chunking |
| **CHUNKING_QUALITY_THRESHOLD** | 0.7 | 0.7 | - | ✅ KEEP | Balanced quality check |

---

## Retry & Resilience

| Setting | Current | Recommended | Change | Priority | Rationale |
|---------|---------|-------------|--------|----------|-----------|
| **QWEN_MAX_RETRIES** | 3 | 3 | - | ✅ KEEP | Good for auto-resume |
| **SLIG_MAX_RETRIES** | 3 | 3 | - | ✅ KEEP | Good for auto-resume |
| **YOLO_MAX_RESUME_RETRIES** | 3 | 3 | - | ✅ KEEP | Adequate retries |
| **CHANDRA_MAX_RESUME_RETRIES** | 3 | 3 | - | ✅ KEEP | Adequate retries |
| **MATERIAL_KAI_RETRY_ATTEMPTS** | 3 | 3 | - | ✅ KEEP | Good for API calls |
| **HUGGINGFACE_MAX_RETRIES** | 3 | 3 | - | ✅ KEEP | Standard retry count |
| **MAX_RETRY_ATTEMPTS** (queue) | 3 | 3 | - | ✅ KEEP | Standard retry count |
| **RETRY_BACKOFF_MULTIPLIER** | 2 | 2 | - | ✅ KEEP | Exponential backoff |

---

## Summary Statistics

| Category | Total Settings | Keep Current | Increase | Priority High | Priority Medium |
|----------|----------------|--------------|----------|---------------|-----------------|
| **File & Processing** | 5 | 3 | 2 | 2 | 1 |
| **Concurrency** | 6 | 0 | 6 | 4 | 2 |
| **Database** | 5 | 3 | 2 | 2 | 0 |
| **Caching** | 6 | 4 | 2 | 0 | 1 |
| **Rate Limiting** | 5 | 2 | 3 | 1 | 2 |
| **Timeouts** | 20 | 19 | 1 | 1 | 0 |
| **Image Processing** | 7 | 7 | 0 | 0 | 0 |
| **AI Tokens** | 6 | 6 | 0 | 0 | 0 |
| **Chunking** | 9 | 9 | 0 | 0 | 0 |
| **Confidence** | 6 | 6 | 0 | 0 | 0 |
| **Retry** | 8 | 8 | 0 | 0 | 0 |
| **TOTAL** | **83** | **67 (81%)** | **16 (19%)** | **10** | **6** |

---

## 🎯 Action Items

### Immediate (HIGH Priority - 10 settings)
1. MAX_FILE_SIZE: 100 MB → 500 MB
2. MAX_WORKERS: 4 → 6
3. MAX_CONCURRENT_BATCHES: 3 → 6
4. BATCH_SIZE: 10 → 30
5. MATERIAL_KAI_BATCH_SIZE: 10 → 30
6. MULTIMODAL_BATCH_SIZE: 5 → 15
7. DATABASE_POOL_SIZE: 10 → 25
8. DATABASE_MAX_OVERFLOW: 20 → 50
9. MAX_REQUESTS_PER_MINUTE: 60 → 150
10. REQUEST_TIMEOUT: 300s → 600s

### Soon (MEDIUM Priority - 6 settings)
11. HUGGINGFACE_BATCH_SIZE: 10 → 20
12. MAX_CONCURRENT_PROCESSING: 10 → 15
13. EMBEDDING_CACHE_MAX_SIZE: 10,000 → 50,000
14. RATE_LIMIT_PDF_EXTRACT: 10/min → 20/min
15. RATE_LIMIT_BATCH_PROCESS: 5/min → 10/min
16. MAX_CACHE_SIZE: 5000 → 10,000

### Keep Current (67 settings)
- All timeouts (well-tuned)
- All image settings (optimized for vision models)
- All AI token limits (cost-optimized)
- All chunking settings (well-optimized for RAG)
- All confidence thresholds (balanced)
- All retry settings (adequate)

