# Lazy Loading Expansion Plan

## Overview
Expand lazy loading implementation to other heavy components and add production monitoring capabilities.

---

## Phase 1: Lazy Load Enhanced PDF Processor

### Objective
Reduce memory footprint by loading PDF processing components only when needed.

### Components to Lazy Load
1. **PDFProcessor** - Main PDF extraction engine
2. **OCRProcessor** - Optical character recognition
3. **ImageExtractor** - Image extraction and processing
4. **TextExtractor** - Text extraction engine

### Implementation Steps

**Step 1.1: Identify PDF Processor Dependencies**
- Search for `PDFProcessor` initialization in `app/main.py`
- Identify all dependencies and initialization parameters
- Document startup sequence

**Step 1.2: Create PDF Processor Lazy Loader**
- Add PDF processor registration to `LazyComponentManager`
- Create loader function that initializes on-demand
- Create cleanup function that releases resources

**Step 1.3: Integrate into Pipeline**
- Load PDF processor at Stage 1 (Focused Extraction)
- Unload after Stage 1 completes
- Add error handling and cleanup

**Step 1.4: Test and Validate**
- Run NOVA product test
- Monitor memory usage during Stage 1
- Verify no performance degradation

### Expected Results
- Memory reduction: 200-400MB
- Startup time: Additional 5-10 seconds saved
- Stage 1 processing: No performance impact

---

## Phase 2: Lazy Load TogetherAI Service

### Objective
Load TogetherAI service only when needed for image analysis.

### Components to Lazy Load
1. **TogetherAIClient** - API client
2. **LlamaVisionModel** - Vision model for image analysis
3. **ModelCache** - Model caching layer

### Implementation Steps

**Step 2.1: Identify TogetherAI Dependencies**
- Search for `TogetherAI` initialization in `app/main.py`
- Identify API key loading and client setup
- Document model loading sequence

**Step 2.2: Create TogetherAI Lazy Loader**
- Add TogetherAI service registration to `LazyComponentManager`
- Create loader function with API key injection
- Create cleanup function for API connections

**Step 2.3: Integrate into Pipeline**
- Load TogetherAI at Stage 3 (Image Processing)
- Unload after Stage 3 completes
- Add connection pooling for efficiency

**Step 2.4: Test and Validate**
- Run NOVA product test
- Monitor memory usage during Stage 3
- Verify API connection stability

### Expected Results
- Memory reduction: 300-500MB
- Startup time: Additional 10-15 seconds saved
- Stage 3 processing: No performance impact

---

## Phase 3: Component Pooling for Frequently Used Services

### Objective
Implement pooling for services that are loaded/unloaded frequently.

### Services to Pool
1. **LlamaIndex Service** - Used in Stage 3
2. **Embeddings Service** - Used in multiple stages
3. **Supabase Client** - Used throughout pipeline

### Implementation Steps

**Step 3.1: Design Component Pool**
- Create `ComponentPool` class in `lazy_loader.py`
- Implement pool size configuration
- Add pool statistics tracking

**Step 3.2: Implement Pool Manager**
- Modify `LazyComponentManager` to support pooling
- Add pool initialization logic
- Add pool cleanup on shutdown

**Step 3.3: Integrate with Pipeline**
- Update Stage 3 to use pooled LlamaIndex service
- Update embedding stages to use pooled embeddings service
- Add pool statistics logging

**Step 3.4: Test and Validate**
- Run multiple concurrent jobs
- Monitor pool utilization
- Verify no resource leaks

### Expected Results
- Reduced load/unload overhead: 30-50%
- Better performance for concurrent jobs
- Improved resource utilization

---

## Phase 4: Memory Usage Monitoring

### Objective
Add comprehensive memory monitoring to production environment.

### Monitoring Components

**Step 4.1: Create Memory Tracker Service**
- File: `app/services/memory_tracker_service.py`
- Track memory usage per stage
- Track memory usage per component
- Track memory peaks and valleys

**Step 4.2: Add Metrics Collection**
- Memory at startup
- Memory per pipeline stage
- Memory per component (lazy loaded)
- Peak memory during processing
- Memory freed after cleanup

**Step 4.3: Create Admin Dashboard Endpoint**
- Endpoint: `/api/admin/memory-stats`
- Return current memory usage
- Return historical memory data
- Return component status

**Step 4.4: Add Logging Integration**
- Log memory usage at each stage
- Log component load/unload events
- Log garbage collection events
- Log memory warnings (>80% usage)

**Step 4.5: Test and Validate**
- Run NOVA product test with monitoring
- Verify metrics accuracy
- Check dashboard display

### Expected Results
- Real-time memory monitoring
- Historical memory data for analysis
- Early warning system for memory issues
- Production visibility

---

## Implementation Timeline

| Phase | Task | Duration | Priority |
|-------|------|----------|----------|
| 1 | Lazy Load PDF Processor | 2-3 hours | High |
| 2 | Lazy Load TogetherAI | 2-3 hours | High |
| 3 | Component Pooling | 3-4 hours | Medium |
| 4 | Memory Monitoring | 3-4 hours | Medium |
| **Total** | **All Phases** | **10-14 hours** | - |

---

## Success Criteria

### Phase 1 Success
- ✅ PDF processor lazy loads successfully
- ✅ Memory reduction of 200-400MB
- ✅ NOVA test passes without crashes
- ✅ No performance degradation

### Phase 2 Success
- ✅ TogetherAI service lazy loads successfully
- ✅ Memory reduction of 300-500MB
- ✅ NOVA test passes without crashes
- ✅ API connections stable

### Phase 3 Success
- ✅ Component pooling reduces load/unload overhead
- ✅ Concurrent jobs perform better
- ✅ No resource leaks detected
- ✅ Pool statistics accurate

### Phase 4 Success
- ✅ Memory metrics collected accurately
- ✅ Admin dashboard displays real-time data
- ✅ Historical data available for analysis
- ✅ Early warning system functional

---

## Risk Mitigation

| Risk | Mitigation |
|------|-----------|
| Component initialization failures | Comprehensive error handling and fallback mechanisms |
| Memory leaks in pooling | Regular pool cleanup and monitoring |
| Performance degradation | Benchmark before/after each phase |
| Production stability | Test thoroughly in staging before deployment |

---

## Notes

- All changes should maintain backward compatibility
- Existing tests should continue to pass
- Performance benchmarks should be documented
- Memory metrics should be tracked over time

