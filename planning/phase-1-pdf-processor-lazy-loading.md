# Phase 1: Lazy Load Enhanced PDF Processor

## Overview
Implement lazy loading for PDF processing components to reduce memory footprint and startup time.

---

## Current State Analysis

### PDF Processor Components
1. **PDFProcessor** - Main extraction engine
2. **OCRProcessor** - Text recognition
3. **ImageExtractor** - Image extraction
4. **TextExtractor** - Text parsing

### Current Initialization
- All components loaded at startup in `app/main.py`
- Estimated memory: 400-600MB
- Initialization time: 30-60 seconds

---

## Implementation Steps

### Step 1: Identify PDF Processor in Codebase

**Action Items:**
1. Search for `PDFProcessor` class definition
2. Find initialization code in `app/main.py`
3. Identify all dependencies and imports
4. Document initialization parameters

**Commands:**
```bash
grep -r "class PDFProcessor" app/
grep -r "PDFProcessor()" app/
grep -r "pdf_processor" app/main.py
```

### Step 2: Create PDF Processor Lazy Loader

**File:** `app/services/lazy_loader.py` (extend existing)

**Add:**
```python
async def load_pdf_processor():
    """Load PDF processor on-demand."""
    from app.services.pdf_processor import PDFProcessor
    config = settings.get_pdf_processor_config()
    processor = PDFProcessor(config)
    logger.info("✅ PDF Processor loaded on-demand")
    return processor

def cleanup_pdf_processor(processor):
    """Cleanup PDF processor resources."""
    try:
        if hasattr(processor, 'cleanup'):
            processor.cleanup()
        logger.info("✅ PDF Processor cleaned up")
    except Exception as e:
        logger.warning(f"⚠️ Error cleaning up PDF Processor: {e}")
```

### Step 3: Register in Component Manager

**File:** `app/main.py`

**Add:**
```python
# Register PDF Processor for lazy loading
component_manager.register(
    "pdf_processor",
    load_pdf_processor,
    cleanup_pdf_processor
)
logger.info("✅ PDF Processor registered for lazy loading")
```

### Step 4: Integrate into Pipeline

**File:** `app/api/rag_routes.py`

**In `process_document_with_discovery()` function:**

**Before Stage 1 (Focused Extraction):**
```python
# Load PDF processor for Stage 1
logger.info("📦 Loading PDF Processor for Stage 1...")
try:
    pdf_processor = await component_manager.load("pdf_processor")
    loaded_components.append("pdf_processor")
    logger.info("✅ PDF Processor loaded for Stage 1")
except Exception as e:
    logger.error(f"❌ Failed to load PDF Processor: {e}")
    raise
```

**After Stage 1 (Focused Extraction):**
```python
# Unload PDF processor after Stage 1
if "pdf_processor" in loaded_components:
    logger.info("🧹 Unloading PDF Processor after Stage 1...")
    try:
        await component_manager.unload("pdf_processor")
        loaded_components.remove("pdf_processor")
        logger.info("✅ PDF Processor unloaded, memory freed")
    except Exception as e:
        logger.warning(f"⚠️ Failed to unload PDF Processor: {e}")
```

### Step 5: Testing

**Test Script:** `scripts/testing/nova-product-focused-test.js`

**Validation Points:**
1. ✅ Job completes without crashes
2. ✅ All 11 products extracted
3. ✅ Memory usage < 1.2GB during Stage 1
4. ✅ No performance degradation

**Commands:**
```bash
# Monitor memory during test
watch -n 1 'ps aux | grep uvicorn'

# Run test
node scripts/testing/nova-product-focused-test.js
```

---

## Expected Results

| Metric | Before | After | Improvement |
|--------|--------|-------|-------------|
| Startup Memory | 2.3GB | 1.9GB | 17% reduction |
| Peak Memory | 2.9GB | 2.5GB | 14% reduction |
| Stage 1 Memory | 2.5GB | 2.1GB | 16% reduction |

---

## Rollback Plan

If issues occur:
1. Remove PDF processor lazy loading registration
2. Restore immediate initialization in `app/main.py`
3. Remove lazy loading calls from `rag_routes.py`
4. Restart service
5. Verify functionality

---

## Success Criteria

- ✅ PDF processor lazy loads successfully
- ✅ Memory reduction of 200-400MB
- ✅ NOVA test passes without crashes
- ✅ No performance degradation in Stage 1
- ✅ Proper cleanup on completion
- ✅ Proper cleanup on error

---

## Notes

- Ensure PDF processor has proper cleanup method
- Test with various PDF sizes
- Monitor for resource leaks
- Document any configuration changes

