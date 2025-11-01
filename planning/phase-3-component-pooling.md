# Phase 3: Component Pooling for Frequently Used Services

## Overview
Implement pooling for services that are loaded/unloaded frequently to reduce overhead and improve performance.

---

## Current State Analysis

### Services to Pool
1. **LlamaIndex Service** - Used in Stage 3 (Image Processing)
2. **Embeddings Service** - Used in Stages 2, 3, 4
3. **Supabase Client** - Used throughout pipeline

### Current Behavior
- Services loaded and unloaded per job
- Overhead: 2-5 seconds per load/unload cycle
- With 100 concurrent jobs: 200-500 seconds wasted

---

## Implementation Steps

### Step 1: Design Component Pool Architecture

**File:** `app/services/lazy_loader.py` (extend existing)

**Add:**
```python
class ComponentPool:
    """Pool for frequently used components."""
    def __init__(self, name: str, factory_func, cleanup_func, max_size: int = 3):
        self.name = name
        self.factory_func = factory_func
        self.cleanup_func = cleanup_func
        self.max_size = max_size
        self.available = asyncio.Queue(maxsize=max_size)
        self.in_use = set()
        self.stats = {
            'created': 0,
            'acquired': 0,
            'released': 0,
            'reused': 0
        }
    
    async def acquire(self):
        """Acquire component from pool."""
        try:
            component = self.available.get_nowait()
            self.stats['reused'] += 1
            logger.debug(f"♻️ Reused {self.name} from pool")
        except asyncio.QueueEmpty:
            component = await self.factory_func()
            self.stats['created'] += 1
            logger.debug(f"🆕 Created new {self.name}")
        
        self.in_use.add(id(component))
        self.stats['acquired'] += 1
        return component
    
    async def release(self, component):
        """Release component back to pool."""
        self.in_use.discard(id(component))
        await self.available.put(component)
        self.stats['released'] += 1
    
    def get_stats(self):
        """Get pool statistics."""
        return {
            'name': self.name,
            'max_size': self.max_size,
            'in_use': len(self.in_use),
            'available': self.available.qsize(),
            'stats': self.stats
        }
```

### Step 2: Extend Component Manager with Pooling

**File:** `app/services/lazy_loader.py`

**Add to LazyComponentManager:**
```python
class LazyComponentManager:
    def __init__(self):
        self.components = {}
        self.pools = {}
    
    def register_pool(self, name: str, factory_func, cleanup_func, max_size: int = 3):
        """Register a pooled component."""
        pool = ComponentPool(name, factory_func, cleanup_func, max_size)
        self.pools[name] = pool
        logger.info(f"✅ Registered pool: {name} (max_size={max_size})")
    
    async def acquire_from_pool(self, name: str):
        """Acquire component from pool."""
        if name not in self.pools:
            raise ValueError(f"Pool {name} not registered")
        return await self.pools[name].acquire()
    
    async def release_to_pool(self, name: str, component):
        """Release component back to pool."""
        if name not in self.pools:
            raise ValueError(f"Pool {name} not registered")
        await self.pools[name].release(component)
    
    def get_pool_stats(self):
        """Get statistics for all pools."""
        return {name: pool.get_stats() for name, pool in self.pools.items()}
```

### Step 3: Register Pooled Services

**File:** `app/main.py`

**Add:**
```python
# Register pooled services
component_manager.register_pool(
    "llamaindex_service",
    load_llamaindex,
    cleanup_llamaindex,
    max_size=3
)

component_manager.register_pool(
    "embeddings_service",
    load_embeddings_service,
    cleanup_embeddings_service,
    max_size=3
)

logger.info("✅ Component pools registered")
```

### Step 4: Update Pipeline to Use Pooling

**File:** `app/api/rag_routes.py`

**In `process_document_with_discovery()` function:**

**Before Stage 3:**
```python
# Acquire LlamaIndex from pool
logger.info("📦 Acquiring LlamaIndex service from pool...")
llamaindex_service = await component_manager.acquire_from_pool("llamaindex_service")
loaded_components.append(("llamaindex_service", llamaindex_service))
logger.info("✅ LlamaIndex service acquired from pool")
```

**After Stage 3:**
```python
# Release LlamaIndex back to pool
if loaded_components:
    for component_name, component in loaded_components:
        if component_name == "llamaindex_service":
            logger.info("🔄 Releasing LlamaIndex service back to pool...")
            await component_manager.release_to_pool("llamaindex_service", component)
            logger.info("✅ LlamaIndex service released to pool")
```

### Step 5: Add Pool Monitoring Endpoint

**File:** `app/api/admin.py`

**Add:**
```python
@router.get("/pool-stats")
async def get_pool_statistics():
    """Get component pool statistics."""
    try:
        component_manager = get_component_manager()
        stats = component_manager.get_pool_stats()
        
        return JSONResponse(content={
            "timestamp": datetime.utcnow().isoformat(),
            "pools": stats
        })
    except Exception as e:
        logger.error(f"Failed to get pool stats: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to retrieve pool statistics: {str(e)}"
        )
```

### Step 6: Testing

**Test Script:** `scripts/testing/concurrent-jobs-test.js` (NEW)

**Validation Points:**
1. ✅ Multiple concurrent jobs complete successfully
2. ✅ Pool reuse reduces load/unload overhead
3. ✅ Memory usage stable with concurrent jobs
4. ✅ No resource leaks detected
5. ✅ Pool statistics accurate

**Commands:**
```bash
# Run concurrent jobs test
node scripts/testing/concurrent-jobs-test.js

# Monitor pool statistics
curl -s https://v1api.materialshub.gr/api/admin/pool-stats | jq .

# Monitor memory
watch -n 1 'ps aux | grep uvicorn'
```

---

## Expected Results

| Metric | Before | After | Improvement |
|--------|--------|-------|-------------|
| Load/Unload Overhead | 2-5 sec | 0.5-1 sec | 60-80% reduction |
| Concurrent Job Performance | Slow | Fast | 40-60% faster |
| Memory Stability | Fluctuating | Stable | Better utilization |

---

## Success Criteria

- ✅ Component pooling reduces load/unload overhead
- ✅ Concurrent jobs perform better
- ✅ No resource leaks detected
- ✅ Pool statistics accurate
- ✅ Memory usage stable
- ✅ Proper cleanup on shutdown

---

## Notes

- Pool size should be configurable via environment variables
- Monitor pool utilization in production
- Consider dynamic pool sizing based on load
- Document pool configuration in deployment guide

