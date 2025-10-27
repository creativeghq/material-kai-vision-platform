# PDF Processing Workflow Stability Analysis & Optimization Plan

## Executive Summary

The platform's PDF processing workflow faces critical stability issues related to:
1. **Timeout Problems**: Edge functions and background jobs hitting limits
2. **Job Tracking Failures**: Inconsistent status updates between in-memory and database storage
3. **Resource Limits**: Processing large PDFs exceeds Supabase Edge Function constraints
4. **Background Job Coordination**: Product creation and image processing not properly tracked
5. **Error Recovery**: Insufficient retry logic and failure handling

## Current Architecture Analysis

### Workflow Flow
```
Frontend Upload → Supabase Edge Function (mivaa-gateway) → MIVAA API (FastAPI)
                                                              ↓
                                                    Background Job Processing
                                                              ↓
                                        ┌─────────────────────┴─────────────────────┐
                                        ↓                                           ↓
                                PDF Processing                              Job Status Tracking
                                        ↓                                           ↓
                        ┌───────────────┴───────────────┐                  In-Memory + Database
                        ↓                               ↓
                Chunking + Embeddings          Image Extraction
                        ↓                               ↓
                Product Creation              Image AI Analysis (CLIP + Anthropic)
```

### Critical Issues Identified

#### 1. **Edge Function Timeout (10 minutes)**
- **Location**: `supabase/functions/mivaa-gateway/index.ts`
- **Problem**: Edge function waits for MIVAA response, but large PDFs take >10 minutes
- **Impact**: Frontend receives timeout errors even though processing continues in background

#### 2. **Job Status Tracking Inconsistency**
- **Location**: `mivaa-pdf-extractor/app/api/rag_routes.py` (lines 548-750)
- **Problem**: 
  - Job status stored in both `job_storage` (in-memory) and `background_jobs` table
  - In-memory storage lost on service restart
  - Database updates sometimes fail silently
  - Frontend polls wrong endpoint or gets stale data

#### 3. **Background Job Coordination**
- **Location**: `mivaa-pdf-extractor/app/api/rag_routes.py` (lines 695-722)
- **Problem**:
  - Product creation runs as `asyncio.create_task()` without tracking
  - Image AI analysis runs separately without progress updates
  - Main job marked "completed" at 90% while sub-tasks still running
  - No way to know when ALL processing is truly complete

#### 4. **Resource Limits**
- **Supabase Edge Functions**: 10-minute timeout, 512MB memory
- **MIVAA FastAPI**: No explicit timeout handling for long-running operations
- **Database Connections**: Pool exhaustion during concurrent processing

#### 5. **Error Recovery Gaps**
- No automatic retry for failed chunks/embeddings
- No partial success handling (all-or-nothing approach)
- No dead letter queue for failed jobs
- Limited error context in job status

## Recommended Architecture Changes

### Phase 1: Immediate Stability Fixes (Week 1)

#### 1.1 Fix Edge Function Timeout
**Change**: Make edge function return immediately after job creation

```typescript
// supabase/functions/mivaa-gateway/index.ts
async function handleFileUpload(req: Request): Promise<Response> {
  // Forward to MIVAA async endpoint
  const response = await fetch(mivaaUrl, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${MIVAA_API_KEY}` },
    body: formData,
  });

  // ✅ ALWAYS return 202 immediately with job_id
  // Don't wait for processing to complete
  if (response.status === 202 || response.ok) {
    const data = await response.json();
    return new Response(JSON.stringify({
      success: true,
      data: {
        job_id: data.job_id,
        document_id: data.document_id,
        status: 'pending',
        message: 'Processing started. Poll /job-status/{job_id} for updates.'
      }
    }), { status: 202, headers: corsHeaders });
  }
}
```

#### 1.2 Consolidate Job Status Storage
**Change**: Use database as single source of truth

```python
# mivaa-pdf-extractor/app/api/rag_routes.py

# Remove in-memory job_storage, use database only
async def update_job_status(job_id: str, status: str, progress: int, metadata: dict = None):
    """Single function to update job status in database"""
    supabase_client = get_supabase_client()
    
    update_data = {
        "status": status,
        "progress_percentage": progress,
        "updated_at": datetime.utcnow().isoformat()
    }
    
    if metadata:
        update_data["metadata"] = metadata
    
    if status in ["completed", "failed"]:
        update_data["completed_at"] = datetime.utcnow().isoformat()
    
    # Retry logic for database updates
    for attempt in range(3):
        try:
            supabase_client.client.table("background_jobs")\
                .update(update_data)\
                .eq("id", job_id)\
                .execute()
            break
        except Exception as e:
            if attempt == 2:
                logger.error(f"Failed to update job status after 3 attempts: {e}")
            await asyncio.sleep(1)
```

#### 1.3 Add Sub-Job Tracking
**Change**: Track product creation and image processing as separate jobs

```python
# Create parent-child job relationship
async def create_sub_job(parent_job_id: str, job_type: str, document_id: str):
    """Create a sub-job linked to parent job"""
    sub_job_id = str(uuid.uuid4())
    
    supabase_client.client.table("background_jobs").insert({
        "id": sub_job_id,
        "parent_job_id": parent_job_id,
        "job_type": job_type,
        "document_id": document_id,
        "status": "pending",
        "progress_percentage": 0
    }).execute()
    
    return sub_job_id

# In process_document_background:
if chunks_created > 0:
    product_job_id = await create_sub_job(job_id, "product_creation", document_id)
    asyncio.create_task(create_products_background(
        document_id=document_id,
        workspace_id=workspace_id,
        job_id=product_job_id  # Use sub-job ID
    ))

if images_extracted > 0:
    image_job_id = await create_sub_job(job_id, "image_analysis", document_id)
    asyncio.create_task(start_background_image_processing(
        document_id=document_id,
        job_id=image_job_id  # Use sub-job ID
    ))
```

### Phase 2: Enhanced Monitoring & Recovery (Week 2)

#### 2.1 Add Comprehensive Progress Tracking

```python
# Enhanced progress tracking with detailed stages
PROCESSING_STAGES = {
    "pdf_extraction": {"weight": 20, "description": "Extracting PDF content"},
    "chunking": {"weight": 15, "description": "Creating text chunks"},
    "text_embeddings": {"weight": 20, "description": "Generating text embeddings"},
    "image_extraction": {"weight": 10, "description": "Extracting images"},
    "image_embeddings": {"weight": 15, "description": "Generating image embeddings"},
    "product_detection": {"weight": 15, "description": "Detecting products"},
    "finalization": {"weight": 5, "description": "Finalizing processing"}
}

async def update_progress_with_stage(job_id: str, stage: str, stage_progress: int):
    """Update job progress based on current stage"""
    stage_info = PROCESSING_STAGES[stage]

    # Calculate overall progress
    completed_weight = sum(
        PROCESSING_STAGES[s]["weight"]
        for s in PROCESSING_STAGES
        if s < stage  # Stages before current
    )
    current_stage_contribution = (stage_info["weight"] * stage_progress) / 100
    overall_progress = min(100, completed_weight + current_stage_contribution)

    await update_job_status(job_id, "processing", overall_progress, {
        "current_stage": stage,
        "stage_description": stage_info["description"],
        "stage_progress": stage_progress
    })
```

#### 2.2 Implement Retry Logic with Exponential Backoff

```python
async def retry_with_backoff(func, max_attempts=3, base_delay=1):
    """Retry function with exponential backoff"""
    for attempt in range(max_attempts):
        try:
            return await func()
        except Exception as e:
            if attempt == max_attempts - 1:
                raise
            delay = base_delay * (2 ** attempt)
            logger.warning(f"Attempt {attempt + 1} failed: {e}. Retrying in {delay}s...")
            await asyncio.sleep(delay)

# Use in critical operations
async def generate_embedding_with_retry(chunk_id: str, content: str):
    return await retry_with_backoff(
        lambda: generate_embedding(chunk_id, content),
        max_attempts=3,
        base_delay=2
    )
```

#### 2.3 Add Health Checks and Monitoring

```python
# Add health check endpoint
@router.get("/health/processing")
async def processing_health_check():
    """Check health of processing pipeline"""
    supabase_client = get_supabase_client()

    # Check for stuck jobs (processing > 30 minutes)
    stuck_jobs = supabase_client.client.table("background_jobs")\
        .select("id, status, created_at")\
        .eq("status", "processing")\
        .lt("created_at", (datetime.utcnow() - timedelta(minutes=30)).isoformat())\
        .execute()

    # Check for failed jobs in last hour
    recent_failures = supabase_client.client.table("background_jobs")\
        .select("id, error_message")\
        .eq("status", "failed")\
        .gt("created_at", (datetime.utcnow() - timedelta(hours=1)).isoformat())\
        .execute()

    return {
        "status": "healthy" if len(stuck_jobs.data) == 0 else "degraded",
        "stuck_jobs": len(stuck_jobs.data),
        "recent_failures": len(recent_failures.data),
        "timestamp": datetime.utcnow().isoformat()
    }
```

### Phase 3: Optimize Resource Usage (Week 3)

#### 3.1 Implement Batch Processing for Embeddings

```python
async def generate_embeddings_batch(chunks: List[dict], batch_size: int = 10):
    """Generate embeddings in batches to avoid overwhelming API"""
    results = []

    for i in range(0, len(chunks), batch_size):
        batch = chunks[i:i + batch_size]

        # Process batch concurrently
        batch_tasks = [
            generate_embedding_with_retry(chunk["id"], chunk["content"])
            for chunk in batch
        ]

        batch_results = await asyncio.gather(*batch_tasks, return_exceptions=True)

        # Handle partial failures
        for chunk, result in zip(batch, batch_results):
            if isinstance(result, Exception):
                logger.error(f"Failed to generate embedding for chunk {chunk['id']}: {result}")
                results.append({"chunk_id": chunk["id"], "success": False, "error": str(result)})
            else:
                results.append({"chunk_id": chunk["id"], "success": True, "embedding": result})

        # Rate limiting
        await asyncio.sleep(0.5)

    return results
```

#### 3.2 Add Database Connection Pooling

```python
# In config.py
class Settings(BaseSettings):
    # Optimize database connection pool
    database_pool_size: int = Field(default=20, env="DATABASE_POOL_SIZE")
    database_max_overflow: int = Field(default=40, env="DATABASE_MAX_OVERFLOW")
    database_pool_timeout: int = Field(default=30, env="DATABASE_POOL_TIMEOUT")
    database_pool_recycle: int = Field(default=3600, env="DATABASE_POOL_RECYCLE")
```

#### 3.3 Implement Chunked Database Inserts

```python
async def insert_chunks_batch(chunks: List[dict], batch_size: int = 100):
    """Insert chunks in batches to avoid large transactions"""
    supabase_client = get_supabase_client()

    for i in range(0, len(chunks), batch_size):
        batch = chunks[i:i + batch_size]

        try:
            supabase_client.client.table("document_chunks")\
                .insert(batch)\
                .execute()
        except Exception as e:
            logger.error(f"Failed to insert chunk batch {i}-{i+batch_size}: {e}")
            # Try inserting one by one for this batch
            for chunk in batch:
                try:
                    supabase_client.client.table("document_chunks")\
                        .insert(chunk)\
                        .execute()
                except Exception as chunk_error:
                    logger.error(f"Failed to insert chunk {chunk['id']}: {chunk_error}")
```

### Phase 4: Testing & Validation (Week 4)

#### 4.1 Enhanced End-to-End Test Script

Create `scripts/testing/optimized-pdf-workflow-test.js`:

```javascript
#!/usr/bin/env node

/**
 * OPTIMIZED PDF WORKFLOW TEST
 *
 * Tests the complete optimized workflow:
 * 1. Upload PDF (should return immediately with job_id)
 * 2. Poll job status (with detailed progress tracking)
 * 3. Verify all sub-jobs complete
 * 4. Validate final results (chunks, embeddings, products, images)
 * 5. Check for any errors or warnings
 */

import { createClient } from '@supabase/supabase-js';
import fetch from 'node-fetch';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function testOptimizedWorkflow() {
  console.log('🚀 Starting Optimized PDF Workflow Test\n');

  // Step 1: Upload PDF
  const uploadResult = await uploadPDF();
  if (!uploadResult.success) {
    console.error('❌ Upload failed');
    process.exit(1);
  }

  console.log(`✅ Upload successful. Job ID: ${uploadResult.jobId}\n`);

  // Step 2: Monitor job with detailed progress
  const monitorResult = await monitorJobWithProgress(uploadResult.jobId);
  if (!monitorResult.success) {
    console.error('❌ Job processing failed');
    process.exit(1);
  }

  console.log(`✅ Main job completed\n`);

  // Step 3: Wait for sub-jobs (product creation, image analysis)
  const subJobsResult = await waitForSubJobs(uploadResult.jobId);
  if (!subJobsResult.success) {
    console.warn('⚠️  Some sub-jobs failed or timed out');
  }

  console.log(`✅ All sub-jobs completed\n`);

  // Step 4: Validate results
  const validationResult = await validateResults(monitorResult.documentId);

  console.log('\n📊 FINAL RESULTS:');
  console.log(`   Chunks: ${validationResult.chunks}`);
  console.log(`   Embeddings: ${validationResult.embeddings}`);
  console.log(`   Images: ${validationResult.images}`);
  console.log(`   Products: ${validationResult.products}`);
  console.log(`   Success Rate: ${validationResult.successRate}%`);
}

async function monitorJobWithProgress(jobId) {
  const maxAttempts = 120; // 10 minutes
  const pollInterval = 5000; // 5 seconds

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const status = await getJobStatus(jobId);

    // Display detailed progress
    console.log(`[${attempt}/${maxAttempts}] Status: ${status.status} | ` +
                `Progress: ${status.progress}% | ` +
                `Stage: ${status.metadata?.current_stage || 'N/A'}`);

    if (status.metadata?.stage_description) {
      console.log(`   └─ ${status.metadata.stage_description}`);
    }

    if (status.status === 'completed') {
      return { success: true, documentId: status.document_id };
    }

    if (status.status === 'failed') {
      console.error(`   Error: ${status.error_message}`);
      return { success: false, error: status.error_message };
    }

    await new Promise(resolve => setTimeout(resolve, pollInterval));
  }

  return { success: false, error: 'Timeout' };
}

testOptimizedWorkflow().catch(console.error);
```

## Implementation Checklist

### Week 1: Critical Fixes
- [ ] Update edge function to return 202 immediately
- [ ] Remove in-memory job_storage, use database only
- [ ] Add parent-child job tracking for sub-jobs
- [ ] Implement retry logic for database updates
- [ ] Add error context to job status

### Week 2: Monitoring & Recovery
- [ ] Implement stage-based progress tracking
- [ ] Add retry logic with exponential backoff
- [ ] Create health check endpoint
- [ ] Add stuck job detection and recovery
- [ ] Implement dead letter queue for failed jobs

### Week 3: Resource Optimization
- [ ] Implement batch processing for embeddings
- [ ] Optimize database connection pooling
- [ ] Add chunked database inserts
- [ ] Implement rate limiting for API calls
- [ ] Add memory usage monitoring

### Week 4: Testing & Validation
- [ ] Create optimized end-to-end test script
- [ ] Test with various PDF sizes (small, medium, large)
- [ ] Load test with concurrent uploads
- [ ] Validate error recovery mechanisms
- [ ] Document success rates and performance metrics

## Success Metrics

### Before Optimization
- Success Rate: ~60-70% (many timeouts and failures)
- Average Processing Time: Unknown (jobs timeout)
- Error Recovery: Manual intervention required
- Monitoring: Limited visibility into progress

### After Optimization (Target)
- Success Rate: >95% (with proper error handling)
- Average Processing Time: Tracked per stage
- Error Recovery: Automatic retry with backoff
- Monitoring: Real-time progress with detailed stages

## Next Steps

1. **Review this analysis** with the team
2. **Prioritize fixes** based on impact and effort
3. **Create detailed tasks** for each phase
4. **Set up monitoring** to track improvements
5. **Run baseline tests** before making changes
6. **Implement changes incrementally** with testing at each step
7. **Document lessons learned** for future improvements


