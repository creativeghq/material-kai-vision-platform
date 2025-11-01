# Phase 2: Lazy Load TogetherAI Service

## Overview
Implement lazy loading for TogetherAI service to reduce memory footprint and startup time.

---

## Current State Analysis

### TogetherAI Components
1. **TogetherAIClient** - API client for model inference
2. **LlamaVisionModel** - Vision model for image analysis
3. **ModelCache** - Model caching layer
4. **APIKeyManager** - API key management

### Current Initialization
- TogetherAI client loaded at startup in `app/main.py`
- Estimated memory: 300-500MB
- Initialization time: 20-40 seconds

---

## Implementation Steps

### Step 1: Identify TogetherAI Service in Codebase

**Action Items:**
1. Search for `TogetherAI` class definition
2. Find initialization code in `app/main.py`
3. Identify all dependencies and imports
4. Document initialization parameters
5. Identify API key loading mechanism

**Commands:**
```bash
grep -r "class TogetherAI" app/
grep -r "TogetherAI()" app/
grep -r "together_ai" app/main.py
grep -r "TOGETHER_API_KEY" app/
```

### Step 2: Create TogetherAI Lazy Loader

**File:** `app/services/lazy_loader.py` (extend existing)

**Add:**
```python
async def load_togetherai_service():
    """Load TogetherAI service on-demand."""
    from app.services.togetherai_service import TogetherAIService
    config = settings.get_togetherai_config()
    service = TogetherAIService(config)
    logger.info("✅ TogetherAI service loaded on-demand")
    return service

def cleanup_togetherai_service(service):
    """Cleanup TogetherAI service resources."""
    try:
        if hasattr(service, 'close'):
            service.close()
        if hasattr(service, 'cleanup'):
            service.cleanup()
        logger.info("✅ TogetherAI service cleaned up")
    except Exception as e:
        logger.warning(f"⚠️ Error cleaning up TogetherAI: {e}")
```

### Step 3: Register in Component Manager

**File:** `app/main.py`

**Add:**
```python
# Register TogetherAI service for lazy loading
component_manager.register(
    "togetherai_service",
    load_togetherai_service,
    cleanup_togetherai_service
)
logger.info("✅ TogetherAI service registered for lazy loading")
```

### Step 4: Integrate into Pipeline

**File:** `app/api/rag_routes.py`

**In `process_document_with_discovery()` function:**

**Before Stage 3 (Image Processing):**
```python
# Load TogetherAI service for Stage 3
logger.info("📦 Loading TogetherAI service for image analysis...")
try:
    togetherai_service = await component_manager.load("togetherai_service")
    loaded_components.append("togetherai_service")
    logger.info("✅ TogetherAI service loaded for Stage 3")
except Exception as e:
    logger.error(f"❌ Failed to load TogetherAI service: {e}")
    raise
```

**After Stage 3 (Image Processing):**
```python
# Unload TogetherAI service after Stage 3
if "togetherai_service" in loaded_components:
    logger.info("🧹 Unloading TogetherAI service after Stage 3...")
    try:
        await component_manager.unload("togetherai_service")
        loaded_components.remove("togetherai_service")
        logger.info("✅ TogetherAI service unloaded, memory freed")
    except Exception as e:
        logger.warning(f"⚠️ Failed to unload TogetherAI service: {e}")
```

### Step 5: Connection Pooling (Optional)

**For better performance with concurrent jobs:**

**File:** `app/services/lazy_loader.py`

**Add:**
```python
class ServicePool:
    """Pool for frequently used services."""
    def __init__(self, service_name: str, max_size: int = 3):
        self.service_name = service_name
        self.max_size = max_size
        self.available = asyncio.Queue(maxsize=max_size)
        self.in_use = set()
    
    async def acquire(self):
        """Acquire service from pool."""
        try:
            service = self.available.get_nowait()
        except asyncio.QueueEmpty:
            service = await self._create_service()
        self.in_use.add(id(service))
        return service
    
    async def release(self, service):
        """Release service back to pool."""
        self.in_use.discard(id(service))
        await self.available.put(service)
```

### Step 6: Testing

**Test Script:** `scripts/testing/nova-product-focused-test.js`

**Validation Points:**
1. ✅ Job completes without crashes
2. ✅ All 11 products extracted
3. ✅ Memory usage < 1.2GB during Stage 3
4. ✅ No performance degradation
5. ✅ API connections stable

**Commands:**
```bash
# Monitor memory during test
watch -n 1 'ps aux | grep uvicorn'

# Run test
node scripts/testing/nova-product-focused-test.js

# Check API connectivity
curl -s https://api.together.xyz/health
```

---

## Expected Results

| Metric | Before | After | Improvement |
|--------|--------|-------|-------------|
| Startup Memory | 2.3GB | 1.8GB | 22% reduction |
| Peak Memory | 2.9GB | 2.3GB | 21% reduction |
| Stage 3 Memory | 2.7GB | 2.0GB | 26% reduction |

---

## Rollback Plan

If issues occur:
1. Remove TogetherAI lazy loading registration
2. Restore immediate initialization in `app/main.py`
3. Remove lazy loading calls from `rag_routes.py`
4. Restart service
5. Verify functionality

---

## Success Criteria

- ✅ TogetherAI service lazy loads successfully
- ✅ Memory reduction of 300-500MB
- ✅ NOVA test passes without crashes
- ✅ No performance degradation in Stage 3
- ✅ API connections stable
- ✅ Proper cleanup on completion
- ✅ Proper cleanup on error

---

## Notes

- Ensure API key is properly injected during lazy loading
- Test with various image sizes
- Monitor API rate limits
- Document any configuration changes
- Consider connection pooling for concurrent jobs

