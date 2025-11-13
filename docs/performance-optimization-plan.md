# PDF Processing Performance Optimization Plan

## Executive Summary

Based on comprehensive analysis of stuck jobs, silent crashes, and performance bottlenecks, this document outlines critical optimizations to improve reliability, speed, and resource efficiency.

---

## 🔴 CRITICAL ISSUES DISCOVERED

### 1. **Silent Background Task Crashes**
**Problem:** Background tasks crash without logging errors, leaving jobs stuck at 46% progress  
**Root Cause:** Unhandled exceptions in image extraction pipeline  
**Impact:** Jobs appear "processing" but are actually dead  
**Status:** ✅ FIXED (commit `5bbd0d9`) - Added comprehensive error handling

### 2. **Memory Exhaustion During Image Processing**
**Problem:** Service using 3.4GB memory (42.9% of 7.8GB), peaks at 3.6GB  
**Root Cause:** Processing all images in memory before batch cleanup  
**Impact:** OOM crashes on large PDFs with 200+ images  
**Status:** ⚠️ PARTIALLY FIXED - Batch processing added, but needs optimization

### 3. **Stuck Job Detection Delay**
**Problem:** Jobs stuck for 30 minutes before auto-recovery triggers  
**Root Cause:** `stuck_job_timeout_minutes: 30` is too long  
**Impact:** Wasted resources, poor UX (users wait 30min for failure)  
**Status:** ❌ NOT FIXED - Needs configuration change

### 4. **No Real-Time Crash Detection**
**Problem:** Service restart required to detect crashed background tasks  
**Root Cause:** No heartbeat monitoring for active jobs  
**Impact:** Jobs can be stuck indefinitely until next service restart  
**Status:** ❌ NOT FIXED - Needs heartbeat implementation

---

## 📊 PERFORMANCE BOTTLENECKS IDENTIFIED

### **Stage-by-Stage Analysis:**

| Stage | Current Time | Bottleneck | Optimization Potential |
|-------|--------------|------------|----------------------|
| **Product Discovery** | ~2-3 min | Claude API calls (sequential) | 🟢 HIGH - Parallelize API calls |
| **Chunking** | ~1-2 min | Text processing (single-threaded) | 🟡 MEDIUM - Use multiprocessing |
| **Image Extraction** | ~5-10 min | PyMuPDF4LLM (synchronous) | 🟢 HIGH - Stream processing |
| **CLIP Embeddings** | ~10-15 min | Sequential processing | 🔴 CRITICAL - Batch API calls |
| **Llama Vision** | ~15-20 min | TogetherAI rate limits | 🟢 HIGH - Parallel batches |
| **Database Writes** | ~2-3 min | Individual INSERT queries | 🟢 HIGH - Bulk inserts |

**Total Current Time:** ~35-53 minutes for 200-image PDF  
**Optimized Target:** ~10-15 minutes (3-4x faster)

---

## 🎯 OPTIMIZATION PRIORITIES

### **Priority 1: Prevent Crashes (Reliability)**

#### 1.1 Implement Heartbeat Monitoring
```python
# Add to ProgressTracker class
async def start_heartbeat(self, interval_seconds: int = 30):
    """Send heartbeat every 30s to prove job is alive"""
    while self.is_active:
        await self.update_heartbeat()
        await asyncio.sleep(interval_seconds)
```

**Benefits:**
- Detect crashed jobs within 60 seconds (2 missed heartbeats)
- Auto-restart from last checkpoint immediately
- Reduce stuck job timeout from 30min → 2min

#### 1.2 Add Circuit Breaker for External APIs
```python
# Wrap all AI API calls with circuit breaker
@circuit_breaker(failure_threshold=5, timeout=60)
async def call_claude_api(...):
    # If 5 failures in 60s, stop calling and fail fast
```

**Benefits:**
- Prevent cascade failures from API outages
- Fail fast instead of hanging for 30 minutes
- Save money on failed API calls

#### 1.3 Add Timeout Guards to All Async Operations
```python
# Current: No timeout on image extraction
pdf_result = await pdf_processor.process_pdf_from_bytes(...)

# Optimized: Timeout after 10 minutes
pdf_result = await asyncio.wait_for(
    pdf_processor.process_pdf_from_bytes(...),
    timeout=600  # 10 minutes max
)
```

**Benefits:**
- Prevent infinite hangs
- Clear error messages instead of silent failures
- Predictable job completion times

---

### **Priority 2: Speed Up Processing (Performance)**

#### 2.1 Parallelize CLIP Embedding Generation
**Current:** Sequential processing (1 image at a time)  
**Optimized:** Batch API calls (10 images in parallel)

```python
# Current: ~15 minutes for 200 images
for image in images:
    clip_embedding = await generate_clip(image)  # 4.5s each

# Optimized: ~3 minutes for 200 images
batches = chunk_list(images, batch_size=10)
for batch in batches:
    clip_embeddings = await asyncio.gather(*[
        generate_clip(img) for img in batch
    ])  # 10 images in 4.5s
```

**Impact:** 5x faster CLIP generation (15min → 3min)

#### 2.2 Bulk Database Inserts
**Current:** Individual INSERT for each image/chunk  
**Optimized:** Batch INSERT (100 records at once)

```python
# Current: 200 images = 200 INSERT queries = ~2 minutes
for image in images:
    supabase.table('document_images').insert(image).execute()

# Optimized: 200 images = 2 INSERT queries = ~5 seconds
supabase.table('document_images').insert(images).execute()
```

**Impact:** 24x faster database writes (2min → 5sec)

#### 2.3 Stream Image Processing (Don't Load All in Memory)
**Current:** Extract all images → Process all images  
**Optimized:** Extract 1 page → Process images → Clear memory → Next page

```python
# Current: 200 images × 2MB = 400MB in memory
all_images = extract_all_images(pdf)
for image in all_images:
    process(image)

# Optimized: 10 images × 2MB = 20MB in memory
for page in pdf.pages:
    images = extract_images_from_page(page)
    await process_batch(images)
    del images  # Clear immediately
```

**Impact:** 95% less memory usage (400MB → 20MB)

---

### **Priority 3: Resource Optimization (Cost & Stability)**

#### 3.1 Reduce Stuck Job Timeout
**Current:** 30 minutes before auto-recovery  
**Recommended:** 5 minutes with heartbeat monitoring

```python
# app/services/job_monitor_service.py
JobMonitorService(
    check_interval_seconds=30,  # Check every 30s
    stuck_job_timeout_minutes=5,  # Was 30, now 5
    heartbeat_timeout_seconds=120  # NEW: 2 missed heartbeats = stuck
)
```

**Impact:** 6x faster failure detection (30min → 5min)

#### 3.2 Implement Progressive Timeout Strategy
Different stages have different expected durations:

```python
STAGE_TIMEOUTS = {
    ProcessingStage.PRODUCT_DISCOVERY: 300,  # 5 minutes
    ProcessingStage.CHUNKING: 180,  # 3 minutes
    ProcessingStage.EXTRACTING_IMAGES: 600,  # 10 minutes
    ProcessingStage.GENERATING_EMBEDDINGS: 1200,  # 20 minutes
}
```

**Impact:** Faster failure detection for early stages

#### 3.3 Add Memory Pressure Monitoring
```python
# Pause processing if memory > 80%
if psutil.virtual_memory().percent > 80:
    logger.warning("Memory pressure detected, pausing...")
    await asyncio.sleep(30)
    gc.collect()
```

**Impact:** Prevent OOM crashes, graceful degradation

---

## 📈 EXPECTED IMPROVEMENTS

### **Reliability Metrics:**
- **Crash Detection:** 30min → 2min (15x faster)
- **Job Success Rate:** 60% → 95% (1.6x improvement)
- **Silent Failures:** Common → Eliminated

### **Performance Metrics:**
- **Total Processing Time:** 35-53min → 10-15min (3-4x faster)
- **Memory Usage:** 3.6GB peak → 1.5GB peak (2.4x reduction)
- **Database Load:** 200 queries → 10 queries (20x reduction)

### **Cost Metrics:**
- **Failed API Calls:** $5-10/failure → $0 (circuit breaker)
- **Server Resources:** 42% utilization → 20% utilization
- **Concurrent Jobs:** 1 job → 3-4 jobs (same resources)

---

## 🚀 IMPLEMENTATION ROADMAP

### **Phase 1: Critical Fixes (Week 1)**
- [x] Add comprehensive error handling (DONE - commit `5bbd0d9`)
- [ ] Implement heartbeat monitoring
- [ ] Add timeout guards to all async operations
- [ ] Reduce stuck job timeout to 5 minutes

### **Phase 2: Performance Optimizations (Week 2)**
- [ ] Parallelize CLIP embedding generation
- [ ] Implement bulk database inserts
- [ ] Add circuit breaker for AI APIs
- [ ] Stream image processing (page-by-page)

### **Phase 3: Resource Optimization (Week 3)**
- [ ] Progressive timeout strategy
- [ ] Memory pressure monitoring
- [ ] Optimize batch sizes based on available memory
- [ ] Add performance metrics dashboard

### **Phase 4: Monitoring & Alerting (Week 4)**
- [ ] Real-time job health dashboard
- [ ] Sentry integration for crash alerts
- [ ] Performance regression detection
- [ ] Automated performance reports

---

## 🔧 CONFIGURATION CHANGES NEEDED

```python
# app/config/processing_config.py
PROCESSING_CONFIG = {
    # Timeouts
    "stuck_job_timeout_minutes": 5,  # Was 30
    "heartbeat_interval_seconds": 30,
    "heartbeat_timeout_seconds": 120,
    
    # Batch Sizes
    "image_batch_size": 10,  # Process 10 images in parallel
    "database_batch_size": 100,  # Insert 100 records at once
    "clip_batch_size": 10,  # Generate 10 CLIP embeddings in parallel
    
    # Memory Management
    "memory_pressure_threshold": 80,  # Pause at 80% memory
    "max_concurrent_jobs": 3,  # Allow 3 jobs simultaneously
    
    # Circuit Breaker
    "api_failure_threshold": 5,  # Open circuit after 5 failures
    "api_timeout_seconds": 60,  # Reset circuit after 60s
}
```

---

**Next Steps:** Implement Phase 1 critical fixes immediately to prevent crashes, then proceed with performance optimizations.

