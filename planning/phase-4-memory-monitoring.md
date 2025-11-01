# Phase 4: Memory Usage Monitoring

## Overview
Add comprehensive memory monitoring to production environment for visibility and early warning.

---

## Current State Analysis

### Monitoring Gaps
1. No real-time memory tracking
2. No per-stage memory metrics
3. No per-component memory tracking
4. No historical memory data
5. No early warning system

### Desired State
- Real-time memory monitoring
- Per-stage memory metrics
- Per-component memory tracking
- Historical memory data (24-48 hours)
- Early warning system (>80% usage)

---

## Implementation Steps

### Step 1: Create Memory Tracker Service

**File:** `app/services/memory_tracker_service.py` (NEW)

**Add:**
```python
import psutil
import logging
from datetime import datetime
from typing import Dict, List, Optional
from collections import deque

logger = logging.getLogger(__name__)

class MemoryTracker:
    """Track memory usage across pipeline stages."""
    
    def __init__(self, max_history: int = 1000):
        self.max_history = max_history
        self.history = deque(maxlen=max_history)
        self.stage_metrics = {}
        self.component_metrics = {}
        self.process = psutil.Process()
    
    def get_current_memory(self) -> Dict:
        """Get current memory usage."""
        memory_info = self.process.memory_info()
        return {
            'rss_mb': memory_info.rss / 1024 / 1024,  # Resident Set Size
            'vms_mb': memory_info.vms / 1024 / 1024,  # Virtual Memory Size
            'percent': self.process.memory_percent(),
            'timestamp': datetime.utcnow().isoformat()
        }
    
    def record_stage_start(self, stage: str):
        """Record memory at stage start."""
        memory = self.get_current_memory()
        if stage not in self.stage_metrics:
            self.stage_metrics[stage] = {}
        self.stage_metrics[stage]['start'] = memory
        logger.info(f"📊 Stage {stage} start: {memory['rss_mb']:.1f}MB")
    
    def record_stage_end(self, stage: str):
        """Record memory at stage end."""
        memory = self.get_current_memory()
        if stage in self.stage_metrics:
            self.stage_metrics[stage]['end'] = memory
            start_mem = self.stage_metrics[stage]['start']['rss_mb']
            end_mem = memory['rss_mb']
            delta = end_mem - start_mem
            logger.info(f"📊 Stage {stage} end: {memory['rss_mb']:.1f}MB (delta: {delta:+.1f}MB)")
    
    def record_component_load(self, component: str):
        """Record memory when component loads."""
        memory = self.get_current_memory()
        if component not in self.component_metrics:
            self.component_metrics[component] = {}
        self.component_metrics[component]['load'] = memory
        logger.info(f"📦 Component {component} loaded: {memory['rss_mb']:.1f}MB")
    
    def record_component_unload(self, component: str):
        """Record memory when component unloads."""
        memory = self.get_current_memory()
        if component in self.component_metrics:
            self.component_metrics[component]['unload'] = memory
            load_mem = self.component_metrics[component]['load']['rss_mb']
            unload_mem = memory['rss_mb']
            freed = load_mem - unload_mem
            logger.info(f"🧹 Component {component} unloaded: {memory['rss_mb']:.1f}MB (freed: {freed:.1f}MB)")
    
    def get_metrics(self) -> Dict:
        """Get all collected metrics."""
        return {
            'current': self.get_current_memory(),
            'stages': self.stage_metrics,
            'components': self.component_metrics,
            'history_size': len(self.history)
        }
```

### Step 2: Add Metrics Collection to Pipeline

**File:** `app/api/rag_routes.py`

**In `process_document_with_discovery()` function:**

**At function start:**
```python
# Initialize memory tracker
from app.services.memory_tracker_service import MemoryTracker
memory_tracker = MemoryTracker()
logger.info("📊 Memory tracking initialized")
```

**At each stage:**
```python
# Stage 0: Product Discovery
memory_tracker.record_stage_start("Stage 0: Product Discovery")
# ... stage processing ...
memory_tracker.record_stage_end("Stage 0: Product Discovery")

# Stage 1: Focused Extraction
memory_tracker.record_stage_start("Stage 1: Focused Extraction")
# ... stage processing ...
memory_tracker.record_stage_end("Stage 1: Focused Extraction")

# ... repeat for all stages ...
```

**For component loading:**
```python
# Load component
memory_tracker.record_component_load("llamaindex_service")
llamaindex_service = await component_manager.load("llamaindex_service")

# ... use component ...

# Unload component
await component_manager.unload("llamaindex_service")
memory_tracker.record_component_unload("llamaindex_service")
```

### Step 3: Create Admin Dashboard Endpoint

**File:** `app/api/admin.py`

**Add:**
```python
@router.get("/memory-stats")
async def get_memory_statistics():
    """Get current memory statistics."""
    try:
        import psutil
        process = psutil.Process()
        memory_info = process.memory_info()
        
        return JSONResponse(content={
            "timestamp": datetime.utcnow().isoformat(),
            "memory": {
                "rss_mb": memory_info.rss / 1024 / 1024,
                "vms_mb": memory_info.vms / 1024 / 1024,
                "percent": process.memory_percent(),
                "available_mb": psutil.virtual_memory().available / 1024 / 1024,
                "total_mb": psutil.virtual_memory().total / 1024 / 1024
            },
            "system": {
                "cpu_percent": psutil.cpu_percent(interval=1),
                "disk_percent": psutil.disk_usage('/').percent
            }
        })
    except Exception as e:
        logger.error(f"Failed to get memory stats: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/memory-history")
async def get_memory_history(job_id: str):
    """Get memory history for a specific job."""
    try:
        # Query job metrics from database
        supabase_client = get_supabase_client()
        result = supabase_client.client.table('job_metrics').select('*').eq('job_id', job_id).execute()
        
        metrics = result.data if result.data else []
        
        return JSONResponse(content={
            "job_id": job_id,
            "metrics": metrics,
            "count": len(metrics)
        })
    except Exception as e:
        logger.error(f"Failed to get memory history: {e}")
        raise HTTPException(status_code=500, detail=str(e))
```

### Step 4: Add Logging Integration

**File:** `app/utils/logging.py` (extend existing)

**Add:**
```python
def log_memory_warning(current_mb: float, threshold_mb: float = 2400):
    """Log warning if memory usage exceeds threshold."""
    if current_mb > threshold_mb:
        percent = (current_mb / threshold_mb) * 100
        logger.warning(f"⚠️ MEMORY WARNING: {current_mb:.1f}MB ({percent:.0f}% of threshold)")
    
    if current_mb > threshold_mb * 1.1:
        logger.error(f"🚨 CRITICAL MEMORY: {current_mb:.1f}MB (exceeds threshold by 10%)")
```

### Step 5: Create Database Schema for Metrics

**File:** `planning/database-schema-metrics.sql`

**Add:**
```sql
-- Job metrics table
CREATE TABLE IF NOT EXISTS job_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id UUID NOT NULL REFERENCES background_jobs(id),
    stage VARCHAR(50),
    component VARCHAR(50),
    memory_rss_mb FLOAT,
    memory_vms_mb FLOAT,
    memory_percent FLOAT,
    timestamp TIMESTAMP DEFAULT NOW(),
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_job_metrics_job_id ON job_metrics(job_id);
CREATE INDEX idx_job_metrics_timestamp ON job_metrics(timestamp);

-- Memory alerts table
CREATE TABLE IF NOT EXISTS memory_alerts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id UUID NOT NULL REFERENCES background_jobs(id),
    alert_type VARCHAR(50),  -- 'warning', 'critical'
    memory_mb FLOAT,
    threshold_mb FLOAT,
    message TEXT,
    timestamp TIMESTAMP DEFAULT NOW(),
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_memory_alerts_job_id ON memory_alerts(job_id);
CREATE INDEX idx_memory_alerts_timestamp ON memory_alerts(timestamp);
```

### Step 6: Testing

**Test Script:** `scripts/testing/memory-monitoring-test.js` (NEW)

**Validation Points:**
1. ✅ Memory metrics collected accurately
2. ✅ Admin endpoint returns real-time data
3. ✅ Historical data stored in database
4. ✅ Alerts triggered at thresholds
5. ✅ Dashboard displays data correctly

**Commands:**
```bash
# Run test with monitoring
node scripts/testing/memory-monitoring-test.js

# Check real-time memory stats
curl -s https://v1api.materialshub.gr/api/admin/memory-stats | jq .

# Check memory history for job
curl -s "https://v1api.materialshub.gr/api/admin/memory-history?job_id=<job_id>" | jq .
```

---

## Expected Results

- ✅ Real-time memory monitoring
- ✅ Historical memory data (24-48 hours)
- ✅ Early warning system functional
- ✅ Production visibility improved
- ✅ Proactive issue detection

---

## Success Criteria

- ✅ Memory metrics collected accurately
- ✅ Admin dashboard displays real-time data
- ✅ Historical data available for analysis
- ✅ Early warning system functional
- ✅ No performance impact from monitoring

---

## Notes

- Install psutil: `pip install psutil`
- Monitor memory trends over time
- Set appropriate thresholds based on server capacity
- Document memory baselines for each stage

