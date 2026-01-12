# 🚀 Cloud Infrastructure Limits Review & Optimization

**Date**: 2026-01-10  
**Context**: Migrated from local processing to cloud infrastructure  
**Goal**: Identify and increase limits that were constrained by local hardware

---

## 📊 Current Limits Analysis

### 1. **File Processing Limits**

#### Max File Size
- **Current**: 100 MB (`MAX_FILE_SIZE`)
- **Location**: `config.py:55`
- **Constraint**: Originally set for local disk/memory
- **Cloud Recommendation**: ✅ **Increase to 500 MB**
  - Server has 16GB RAM
  - Supabase Storage supports large files
  - Most material catalogs are 50-200 MB

#### Max Pages
- **Current**: No hard limit (processes all pages)
- **Location**: `models/processing.py:41-45`
- **Constraint**: None currently enforced
- **Cloud Recommendation**: ✅ **Keep unlimited** (good for cloud)

---

### 2. **Concurrency & Workers**

#### Max Workers
- **Current**: 4 (`MAX_WORKERS`)
- **Location**: `config.py:67`
- **Constraint**: Local CPU cores (4-8 cores typical)
- **Cloud Recommendation**: ✅ **Increase to 8-12**
  - Server likely has 8+ cores
  - Better parallelization for PDF processing
  - Check with: `nproc` on server

#### Max Concurrent Batches
- **Current**: 3 (`maxConcurrentBatches`)
- **Location**: `src/services/batch/batchProcessingService.ts:184`
- **Constraint**: Local memory limits
- **Cloud Recommendation**: ✅ **Increase to 8-10**
  - 16GB RAM can handle more concurrent batches
  - Each batch ~500MB-1GB memory

#### Database Pool Size
- **Current**: 10 connections (`DATABASE_POOL_SIZE`)
- **Location**: `config.py:165`
- **Constraint**: Local PostgreSQL connection limits
- **Cloud Recommendation**: ✅ **Increase to 20-30**
  - Supabase supports higher connection pools
  - Better for concurrent requests

---

### 3. **Timeout Values**

#### Request Timeout
- **Current**: 300 seconds (5 minutes)
- **Location**: `config.py:68`
- **Constraint**: Local processing speed
- **Cloud Recommendation**: ⚠️ **Keep at 300s or increase to 600s**
  - Large PDFs (200+ pages) may need more time
  - Cloud endpoints are fast but vision models take time

#### Qwen Timeout
- **Current**: 180 seconds (3 minutes)
- **Location**: `config.py:346`
- **Constraint**: HuggingFace endpoint warmup time
- **Cloud Recommendation**: ✅ **Keep at 180s** (appropriate for auto-resume)

#### Processing Timeout
- **Current**: 300 seconds
- **Location**: `models/processing.py:88-93`
- **Max**: 1800 seconds (30 minutes)
- **Cloud Recommendation**: ✅ **Increase default to 600s** (10 minutes)
  - Large catalogs benefit from longer processing
  - Max of 30 minutes is good safety net

---

### 4. **Batch & Queue Sizes**

#### Batch Size
- **Current**: 10 (`batchSize`)
- **Location**: Multiple locations
  - `batchProcessingService.ts:185` - 10
  - `material_kai_batch_size` - 10
  - `multimodal_batch_size` - 5
- **Constraint**: Local memory for batch processing
- **Cloud Recommendation**: ✅ **Increase to 20-50**
  - More efficient API usage
  - Better throughput for embeddings

#### Queue Max Size
- **Current**: 10,000 (`maxSize`)
- **Location**: `batchJobQueue.ts:149`
- **Constraint**: Local memory for queue storage
- **Cloud Recommendation**: ✅ **Keep at 10,000** (already generous)

#### Embedding Cache Max Size
- **Current**: 10,000 entries
- **Location**: `config.py:104`
- **Constraint**: Local memory
- **Cloud Recommendation**: ✅ **Increase to 50,000**
  - 16GB RAM can handle larger cache
  - Better hit rate for repeated queries

---

### 5. **Image Processing**

#### Image DPI
- **Current**: 250 DPI
- **Location**: `models/processing.py:56-61`
- **Constraint**: Local processing speed & storage
- **Cloud Recommendation**: ✅ **Keep at 250 DPI** (optimal for materials)

#### Max Image Dimension
- **Current**: 2048 pixels
- **Location**: `config.py:294-301`
- **Constraint**: Vision model limits (Claude 2000px)
- **Cloud Recommendation**: ✅ **Keep at 2048** (matches API limits)

#### Min Image Size
- **Current**: 100 pixels
- **Location**: `models/processing.py:62-66`
- **Cloud Recommendation**: ✅ **Keep at 100** (filters noise)

---

### 6. **AI Model Limits**

#### Max Tokens
- **Current**: 4096 tokens (most models)
- **Locations**:
  - OpenAI: 4096
  - Anthropic: 4096
  - Qwen: 4096
- **Constraint**: API costs & response time
- **Cloud Recommendation**: ✅ **Keep at 4096** (cost-optimized)
  - Can increase to 8192 for complex extractions if needed
  - Monitor costs first

#### Chunk Sizes
- **Current**:
  - RAG chunk: 1024 tokens
  - Parent chunk: 2048 tokens
  - Child chunk: 256 tokens
- **Cloud Recommendation**: ✅ **Keep current values** (well-optimized)

---

### 7. **Rate Limits**

#### Max Requests Per Minute
- **Current**: 60 (`MAX_REQUESTS_PER_MINUTE`)
- **Location**: `config.py:148`
- **Constraint**: Local server capacity
- **Cloud Recommendation**: ✅ **Increase to 120-200**
  - Cloud server can handle more load
  - Better for multi-user scenarios

---

## 🎯 Priority Recommendations

### **HIGH PRIORITY** (Immediate Impact)

1. **Max File Size: 100 MB → 500 MB**
   ```bash
   # In .env or systemd service
   MAX_FILE_SIZE=524288000  # 500 MB
   ```
   **Impact**: Handle larger material catalogs (currently rejecting 200+ MB files)

2. **Max Workers: 4 → 8**
   ```bash
   MAX_WORKERS=8
   ```
   **Impact**: 2x faster PDF processing with parallel page extraction

3. **Database Pool: 10 → 25**
   ```bash
   DATABASE_POOL_SIZE=25
   DATABASE_MAX_OVERFLOW=50
   ```
   **Impact**: Better concurrent request handling

4. **Batch Size: 10 → 30**
   ```bash
   MATERIAL_KAI_BATCH_SIZE=30
   MULTIMODAL_BATCH_SIZE=15
   ```
   **Impact**: More efficient API usage, faster embedding generation

5. **Request Rate Limit: 60 → 150**
   ```bash
   MAX_REQUESTS_PER_MINUTE=150
   ```
   **Impact**: Support more concurrent users

### **MEDIUM PRIORITY** (Performance Optimization)

6. **Processing Timeout: 300s → 600s**
   ```bash
   REQUEST_TIMEOUT=600
   ```
   **Impact**: Handle 200+ page catalogs without timeout

7. **Embedding Cache: 10,000 → 50,000**
   ```bash
   EMBEDDING_CACHE_MAX_SIZE=50000
   ```
   **Impact**: Better cache hit rate, reduced API calls

8. **Max Concurrent Batches: 3 → 8**
   ```typescript
   // In batchProcessingService.ts
   maxConcurrentBatches: 8
   ```
   **Impact**: Process multiple documents simultaneously

### **LOW PRIORITY** (Keep Current)

9. **Image Settings** - Already optimized for vision models
10. **Chunk Sizes** - Well-tuned for RAG performance
11. **AI Token Limits** - Cost-optimized at 4096

---

## 📋 Implementation Checklist

### Step 1: Check Server Resources
```bash
# SSH into server
ssh user@server

# Check CPU cores
nproc
# Expected: 8-16 cores

# Check RAM
free -h
# Expected: 16GB total

# Check disk space
df -h /var/www
# Expected: 50GB+ available
```

### Step 2: Update Environment Variables
```bash
# Edit systemd service file
sudo nano /etc/systemd/system/mivaa-pdf-extractor.service

# Add/update these lines in [Service] section:
Environment="MAX_FILE_SIZE=524288000"
Environment="MAX_WORKERS=8"
Environment="DATABASE_POOL_SIZE=25"
Environment="DATABASE_MAX_OVERFLOW=50"
Environment="MATERIAL_KAI_BATCH_SIZE=30"
Environment="MULTIMODAL_BATCH_SIZE=15"
Environment="MAX_REQUESTS_PER_MINUTE=150"
Environment="REQUEST_TIMEOUT=600"
Environment="EMBEDDING_CACHE_MAX_SIZE=50000"

# Reload and restart
sudo systemctl daemon-reload
sudo systemctl restart mivaa-pdf-extractor
```

### Step 3: Update TypeScript Configs
```typescript
// src/services/batch/batchProcessingService.ts
processing: {
  maxConcurrentBatches: 8,  // Was: 3
  batchSize: 30,            // Was: 10
  maxDocumentsPerBatch: 100,
  timeoutMs: 600000,        // Was: 300000 (10 minutes)
}
```

### Step 4: Monitor & Validate
```bash
# Check service status
sudo systemctl status mivaa-pdf-extractor

# Monitor logs for errors
sudo journalctl -u mivaa-pdf-extractor -f

# Test with large file
curl -X POST http://localhost:8000/api/v1/extract \
  -H "Content-Type: application/json" \
  -d '{"url": "https://example.com/large-catalog.pdf"}'

# Monitor resource usage
htop
```

---

## 🔍 Monitoring Metrics

After implementing changes, monitor these metrics:

1. **Memory Usage**
   - Target: < 80% of 16GB (< 12.8GB)
   - Alert if: > 90% (> 14.4GB)

2. **CPU Usage**
   - Target: < 70% average
   - Alert if: > 85% sustained

3. **Request Success Rate**
   - Target: > 95%
   - Alert if: < 90%

4. **Processing Time**
   - Small PDFs (< 20 pages): < 30s
   - Medium PDFs (20-100 pages): < 2 minutes
   - Large PDFs (100-300 pages): < 10 minutes

5. **Database Connections**
   - Monitor active connections
   - Alert if: > 20 concurrent (approaching pool limit)

---

## ⚠️ Risks & Mitigation

### Risk 1: Memory Exhaustion
- **Cause**: Too many concurrent large file processes
- **Mitigation**:
  - Keep `MAX_WORKERS=8` (not higher)
  - Monitor with `htop`
  - Set up swap space (8GB) as safety net

### Risk 2: Database Connection Pool Exhaustion
- **Cause**: High concurrent requests
- **Mitigation**:
  - Pool size: 25 + overflow: 50 = 75 max
  - Supabase supports 100+ connections
  - Monitor connection count

### Risk 3: API Rate Limits
- **Cause**: Increased batch sizes hitting provider limits
- **Mitigation**:
  - Voyage AI: 300 RPM (safe with batch=30)
  - OpenAI: 500 RPM (safe)
  - Anthropic: 50 RPM (already managed)

### Risk 4: Disk Space
- **Cause**: Larger files + more caching
- **Mitigation**:
  - Monitor `/var/www` disk usage
  - Set up log rotation
  - Clean temp files regularly

---

## 📈 Expected Performance Improvements

| Metric | Before | After | Improvement |
|--------|--------|-------|-------------|
| Max File Size | 100 MB | 500 MB | **5x** |
| Concurrent Workers | 4 | 8 | **2x** |
| Batch Throughput | 10/batch | 30/batch | **3x** |
| Request Rate | 60/min | 150/min | **2.5x** |
| Large PDF Timeout | 5 min | 10 min | **2x** |
| Cache Capacity | 10K | 50K | **5x** |

**Overall Expected Improvement**: **2-3x faster processing** for typical workloads

---

## 🚀 Next Steps

1. ✅ Review this document
2. ⬜ Check server resources (CPU, RAM, disk)
3. ⬜ Implement HIGH PRIORITY changes
4. ⬜ Test with large files (200+ MB, 200+ pages)
5. ⬜ Monitor for 24-48 hours
6. ⬜ Implement MEDIUM PRIORITY changes if stable
7. ⬜ Document final configuration
8. ⬜ Update deployment documentation

---

---

## 🖥️ **ACTUAL SERVER SPECS** (Verified 2026-01-10)

```
CPU:    4 cores (DO-Premium-Intel)
RAM:    16 GB (14 GB available)
Swap:   4 GB
Disk:   154 GB total, 89 GB free (43% used)
Load:   0.57 (very light - can handle much more)
```

### **Analysis**:
- ✅ **CPU**: 4 cores is moderate - can support MAX_WORKERS=6-8
- ✅ **RAM**: 16GB is excellent - plenty of headroom (only 1.3GB used)
- ✅ **Disk**: 89GB free is plenty for large files
- ✅ **Load**: 0.57 average is very low - server is underutilized

### **Revised Recommendations Based on Actual Hardware**:

Since we have **4 CPU cores** (not 8-16 as initially assumed), we need to be more conservative with worker counts:

1. **MAX_WORKERS: 4 → 6** (not 8)
   - 1.5x CPU cores is optimal for I/O-bound tasks
   - PDF processing is I/O-heavy (disk + network)

2. **MAX_CONCURRENT_BATCHES: 3 → 6** (not 8)
   - Matches worker count
   - Each batch can run on separate worker

3. **All other recommendations remain valid**
   - 16GB RAM can easily handle larger files, caches, and pools
   - Disk space is not a constraint

---

## 🎯 **FINAL OPTIMIZED CONFIGURATION**

### Environment Variables to Add/Update

```bash
# File Processing
MAX_FILE_SIZE=524288000                    # 500 MB (was: 100 MB)

# Concurrency (Conservative for 4-core CPU)
MAX_WORKERS=6                              # 6 workers (was: 4)

# Database
DATABASE_POOL_SIZE=25                      # 25 connections (was: 10)
DATABASE_MAX_OVERFLOW=50                   # 50 overflow (was: 20)

# Batch Processing
MATERIAL_KAI_BATCH_SIZE=30                 # 30 items (was: 10)
MULTIMODAL_BATCH_SIZE=15                   # 15 items (was: 5)

# Rate Limiting
MAX_REQUESTS_PER_MINUTE=150                # 150 req/min (was: 60)

# Timeouts
REQUEST_TIMEOUT=600                        # 10 minutes (was: 5)

# Caching
EMBEDDING_CACHE_MAX_SIZE=50000             # 50K entries (was: 10K)
```

### TypeScript Configuration Updates

```typescript
// src/services/batch/batchProcessingService.ts
const DEFAULT_CONFIG: BatchProcessingConfig = {
  processing: {
    maxConcurrentBatches: 6,     // Was: 3
    batchSize: 30,               // Was: 10
    maxDocumentsPerBatch: 100,   // Keep
    timeoutMs: 600000,           // Was: 300000 (10 min)
  },
  performance: {
    memoryLimitMB: 8192,         // Was: 4096 (8GB limit)
  }
}
```

---

## 📝 **IMPLEMENTATION SCRIPT**

Save this as `scripts/update-cloud-limits.sh`:

```bash
#!/bin/bash
# Update MIVAA PDF Extractor limits for cloud optimization
# Date: 2026-01-10

set -e

echo "🚀 Updating MIVAA PDF Extractor cloud limits..."

# Backup current service file
sudo cp /etc/systemd/system/mivaa-pdf-extractor.service \
        /etc/systemd/system/mivaa-pdf-extractor.service.backup-$(date +%Y%m%d)

# Update service file with new environment variables
sudo tee -a /etc/systemd/system/mivaa-pdf-extractor.service > /dev/null <<'EOF'

# Cloud Optimization Limits (Added 2026-01-10)
Environment="MAX_FILE_SIZE=524288000"
Environment="MAX_WORKERS=6"
Environment="DATABASE_POOL_SIZE=25"
Environment="DATABASE_MAX_OVERFLOW=50"
Environment="MATERIAL_KAI_BATCH_SIZE=30"
Environment="MULTIMODAL_BATCH_SIZE=15"
Environment="MAX_REQUESTS_PER_MINUTE=150"
Environment="REQUEST_TIMEOUT=600"
Environment="EMBEDDING_CACHE_MAX_SIZE=50000"
EOF

echo "✅ Service file updated"

# Reload systemd
sudo systemctl daemon-reload
echo "✅ Systemd reloaded"

# Restart service
sudo systemctl restart mivaa-pdf-extractor
echo "✅ Service restarted"

# Wait for service to start
sleep 5

# Check status
if sudo systemctl is-active --quiet mivaa-pdf-extractor; then
    echo "✅ Service is running"

    # Test health endpoint
    if curl -s http://localhost:8000/health | grep -q "healthy"; then
        echo "✅ Health check passed"
        echo ""
        echo "🎉 Cloud optimization complete!"
        echo ""
        echo "📊 New limits:"
        echo "  - Max file size: 500 MB"
        echo "  - Max workers: 6"
        echo "  - Database pool: 25 (overflow: 50)"
        echo "  - Batch size: 30"
        echo "  - Request rate: 150/min"
        echo "  - Request timeout: 10 minutes"
        echo "  - Cache size: 50,000 entries"
    else
        echo "⚠️  Service running but health check failed"
        echo "Check logs: sudo journalctl -u mivaa-pdf-extractor -n 50"
    fi
else
    echo "❌ Service failed to start"
    echo "Check logs: sudo journalctl -u mivaa-pdf-extractor -n 50"
    exit 1
fi
```

### Run the script:

```bash
# Make executable
chmod +x scripts/update-cloud-limits.sh

# Run
sudo ./scripts/update-cloud-limits.sh
```

---

**Questions to Answer Before Implementation:**

1. ✅ **Server specs**: 4 cores, 16GB RAM, 89GB free disk
2. ⬜ **Largest PDF expected**: Need to know for timeout tuning
3. ⬜ **Concurrent user count**: Need to know for rate limit tuning
4. ⬜ **Supabase plan limits**: Check connection limits
5. ⬜ **API budget**: More batching = more API calls (but faster)


