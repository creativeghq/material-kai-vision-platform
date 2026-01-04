# Product-Centric Pipeline Refactoring Plan

## Executive Summary

**Goal**: Refactor PDF processing pipeline from batch-stage processing to product-centric processing.

**Current**: Process ALL products through each stage sequentially
**Proposed**: Process EACH product through ALL stages before moving to next product

**Status**: ✅ **VALIDATED - This is an excellent architectural improvement**

---

## Current Architecture Problems

### 1. Memory Accumulation
- All product data (images, chunks, metadata) stays in memory across all stages
- Memory footprint grows linearly with number of products
- No cleanup until final stage completes

### 2. Late Failure Detection
- If Product 50/100 fails in Stage 4, you've already processed 49 products through Stages 1-3
- Wasted computation and resources
- Difficult to identify which product caused the failure

### 3. Poor Recovery
- Checkpoints are stage-based: `CHUNKS_CREATED`, `IMAGES_EXTRACTED`
- Recovery means reprocessing ALL products from that stage
- Cannot resume from "Product 42 failed"

### 4. Limited Monitoring
- Progress shows: "Stage 3: 67% complete"
- Cannot show: "Processing Product 23/100: Acme Widget Pro"
- No per-product success/failure tracking

### 5. No Parallelization Potential
- Current architecture blocks parallel processing
- Must complete Stage N for ALL products before Stage N+1

---

## Proposed Architecture

### High-Level Flow

```
┌─────────────────────────────────────────────────────────────┐
│ Stage 0: Product Discovery (UNCHANGED)                      │
│ - Discover ALL products from PDF                            │
│ - Output: catalog with N products                           │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ FOR EACH PRODUCT (Product 1 to N):                          │
│                                                              │
│   ┌──────────────────────────────────────────────────────┐  │
│   │ Product Processing Pipeline                          │  │
│   ├──────────────────────────────────────────────────────┤  │
│   │ 1. Focused Extraction (this product's pages)         │  │
│   │ 2. Text Chunking (this product's content)            │  │
│   │ 3. Image Processing (this product's images)          │  │
│   │ 4. Product Creation (save to DB)                     │  │
│   │ 5. Relationships (link chunks/images)                │  │
│   │ 6. Checkpoint: product_<id>_complete                 │  │
│   │ 7. Memory Cleanup (release this product's data)      │  │
│   └──────────────────────────────────────────────────────┘  │
│                                                              │
│   Status: ✓ Product 1 complete                              │
│   Memory: Released                                           │
│   Next: Product 2                                            │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ Global Finalization                                          │
│ - Document Entities (certificates, logos, specs)            │
│ - Quality Enhancement Summary                               │
│ - Final Validation                                           │
└─────────────────────────────────────────────────────────────┘
```

---

## Benefits

### ✅ 1. Immediate Failure Detection
- Product fails → Stop processing that product
- Other products already complete and saved
- Clear error: "Product 'Acme Widget Pro' failed at Stage 3"

### ✅ 2. Memory Efficiency
- Memory footprint = 1 product at a time
- Aggressive cleanup after each product
- No accumulation across products

### ✅ 3. Granular Checkpointing
```json
{
  "job_id": "abc123",
  "products_total": 100,
  "products_completed": 42,
  "current_product": {
    "id": "product_43",
    "name": "Acme Widget Pro",
    "stage": "image_processing",
    "progress": 65
  },
  "failed_products": [
    {"id": "product_17", "name": "Bad Product", "error": "Invalid image format"}
  ]
}
```

### ✅ 4. Better UX
- Show product-level progress
- Accordion UI: Click product → See detailed stages
- Real-time per-product status

### ✅ 5. Future Parallelization
- Can process multiple products in parallel
- Independent product pipelines
- Better resource utilization

---

## Implementation Plan

See detailed phases in task list.

### Phase 1: Data Structures (Week 1)
- New checkpoint schema with product tracking
- Product-level progress tracking
- Memory management hooks

### Phase 2: Processing Loop (Week 2)
- Refactor main orchestration
- Product iteration logic
- Per-product stage execution

### Phase 3: UI Updates (Week 1)
- Product accordion modal
- Per-product progress bars
- Detailed stage breakdown

### Phase 4: Memory Management (Week 1)
- Per-product cleanup
- Async process memory handling
- Resource pooling

### Phase 5: Testing (Week 1)
- Small PDFs (1-5 products)
- Medium PDFs (10-50 products)
- Large PDFs (100+ products)
- Memory profiling

---

---

## Code Cleanup & Refactoring Requirements

### Files That Need Major Changes

#### 1. **mivaa-pdf-extractor/app/api/rag_routes.py** (Main Orchestrator)
**Current**: Lines 2603-2900 - `process_document_with_discovery()` calls all stages sequentially for ALL products
**Changes Needed**:
- Rename to `process_document_with_discovery_v1()` (keep for backward compatibility)
- Create new `process_document_with_discovery_v2()` with product loop
- Add feature flag to switch between v1/v2
- Extract common initialization logic

#### 2. **mivaa-pdf-extractor/app/api/pdf_processing/stage_2_chunking.py**
**Current**: Processes chunks for ALL products at once (line 16-210)
**Changes Needed**:
- Keep existing `process_stage_2_chunking()` for v1 compatibility
- Create new `process_product_chunking()` for single product
- Extract product-specific pages from catalog
- Filter chunks by product page range

#### 3. **mivaa-pdf-extractor/app/api/pdf_processing/stage_3_images.py**
**Current**: Extracts/processes ALL images in batches (line 78-700)
**Changes Needed**:
- Keep existing `process_stage_3_images()` for v1 compatibility
- Create new `process_product_images()` for single product
- Filter images by product page range
- Reduce batch size (currently 12 images, reduce to 5 for single product)

#### 4. **mivaa-pdf-extractor/app/api/pdf_processing/stage_4_products.py**
**Current**: Creates ALL products in loop (line 71-193)
**Changes Needed**:
- Keep existing `process_stage_4_products()` for v1 compatibility
- Create new `create_single_product()` for individual product
- Move product creation logic to new function
- Simplify entity linking for single product

#### 5. **mivaa-pdf-extractor/app/api/pdf_processing/stage_1_focused_extraction.py**
**Current**: Extracts ALL product pages at once (line 56-112)
**Changes Needed**:
- Keep existing `process_stage_1_focused_extraction()` for v1 compatibility
- Create new `extract_product_pages()` for single product
- Accept product page range as parameter
- Return only relevant pages

### New Files to Create

#### 1. **mivaa-pdf-extractor/app/api/pdf_processing/product_processor.py**
**Purpose**: Single product processing pipeline
**Functions**:
- `process_single_product()` - Main product pipeline
- `cleanup_product_memory()` - Memory cleanup
- `update_product_progress()` - Progress tracking

#### 2. **mivaa-pdf-extractor/app/services/product_progress_tracker.py**
**Purpose**: Track per-product progress
**Functions**:
- `ProductProgressTracker` class
- `update_product_stage()`
- `mark_product_complete()`
- `mark_product_failed()`

#### 3. **mivaa-pdf-extractor/app/schemas/product_progress.py**
**Purpose**: Product progress data models
**Classes**:
- `ProductProgress` - Single product status
- `ProductStage` - Product processing stages
- `ProductProcessingResult` - Product completion result

### Database Migrations

#### Migration 1: Add product tracking tables
```sql
-- File: supabase/migrations/20240104_product_tracking.sql

-- Add product-level tracking to job_checkpoints
ALTER TABLE job_checkpoints
ADD COLUMN IF NOT EXISTS product_id VARCHAR(255),
ADD COLUMN IF NOT EXISTS product_name TEXT,
ADD COLUMN IF NOT EXISTS product_index INTEGER;

CREATE INDEX IF NOT EXISTS idx_checkpoints_product
ON job_checkpoints(job_id, product_id);

-- New table for product processing status
CREATE TABLE IF NOT EXISTS product_processing_status (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES background_jobs(id) ON DELETE CASCADE,
  product_id VARCHAR(255) NOT NULL,
  product_name TEXT,
  product_index INTEGER,
  status VARCHAR(50) NOT NULL DEFAULT 'pending',
  current_stage VARCHAR(100),
  stages_completed JSONB DEFAULT '[]'::jsonb,
  error_message TEXT,
  metrics JSONB DEFAULT '{}'::jsonb,
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),

  CONSTRAINT unique_job_product UNIQUE(job_id, product_id)
);

CREATE INDEX idx_product_status_job ON product_processing_status(job_id);
CREATE INDEX idx_product_status_status ON product_processing_status(status);
CREATE INDEX idx_product_status_updated ON product_processing_status(updated_at DESC);

-- Add RLS policies
ALTER TABLE product_processing_status ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view product status in their workspace"
  ON product_processing_status FOR SELECT
  USING (
    job_id IN (
      SELECT id FROM background_jobs
      WHERE workspace_id IN (
        SELECT workspace_id FROM workspace_members
        WHERE user_id = auth.uid()
      )
    )
  );
```

### Frontend Changes

#### 1. **src/components/Admin/AsyncJobQueueMonitor.tsx**
**Current**: Shows 14 global stages (line 124-138)
**Changes Needed**:
- Add product accordion UI
- Update progress calculation for product-based tracking
- Add product filtering/search
- Handle product-level errors

#### 2. **src/services/realtime/PDFProcessingWebSocketService.ts**
**Current**: Tracks global job progress (line 11-38)
**Changes Needed**:
- Add `ProductProgress` interface
- Update `PDFProcessingProgress` to include products array
- Handle product-level updates
- Emit product completion events

#### 3. **src/services/pdf/pdfProcessingMonitor.ts**
**Current**: Maps checkpoints to global stages (line 147-160)
**Changes Needed**:
- Add product checkpoint mapping
- Handle `PRODUCT_COMPLETED` checkpoint
- Calculate per-product progress

### Configuration Changes

#### 1. **mivaa-pdf-extractor/app/config.py**
**Add**:
```python
class Settings(BaseSettings):
    # ... existing settings ...

    # Product-centric processing
    enable_product_centric_processing: bool = Field(
        default=False,
        description="Enable product-centric processing pipeline (v2)"
    )
    product_processing_batch_size: int = Field(
        default=1,
        description="Number of products to process in parallel (future use)"
    )
    product_memory_cleanup_enabled: bool = Field(
        default=True,
        description="Enable aggressive memory cleanup after each product"
    )
```

---

## Detailed Technical Specifications

### Phase 1: Checkpoint Schema Design

#### New Checkpoint Structure
```python
# Current checkpoint (stage-based)
{
  "job_id": "abc123",
  "stage": "CHUNKS_CREATED",
  "data": {
    "chunk_ids": [...],  # ALL chunks for ALL products
    "total_chunks": 500
  }
}

# Proposed checkpoint (product-based)
{
  "job_id": "abc123",
  "stage": "PRODUCT_PROCESSING",
  "data": {
    "products_total": 100,
    "products_completed": 42,
    "products_failed": 3,
    "current_product_index": 43,
    "completed_product_ids": ["prod_1", "prod_2", ...],
    "failed_products": [
      {
        "product_id": "prod_17",
        "product_name": "Bad Product",
        "failed_at_stage": "image_processing",
        "error": "Invalid image format",
        "timestamp": "2024-01-04T10:30:00Z"
      }
    ]
  },
  "metadata": {
    "last_completed_product": {
      "id": "prod_42",
      "name": "Acme Widget Pro",
      "completed_at": "2024-01-04T10:29:55Z",
      "stages_completed": ["extraction", "chunking", "images", "creation", "relationships"]
    }
  }
}
```

#### Database Schema Updates
```sql
-- Add product-level tracking to job_checkpoints
ALTER TABLE job_checkpoints
ADD COLUMN product_id VARCHAR(255),
ADD COLUMN product_name TEXT,
ADD COLUMN product_index INTEGER;

-- Create index for product-based queries
CREATE INDEX idx_checkpoints_product
ON job_checkpoints(job_id, product_id);

-- New table for product processing status
CREATE TABLE product_processing_status (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES background_jobs(id),
  product_id VARCHAR(255) NOT NULL,
  product_name TEXT,
  product_index INTEGER,
  status VARCHAR(50) NOT NULL, -- 'pending', 'processing', 'completed', 'failed'
  current_stage VARCHAR(100),
  stages_completed JSONB DEFAULT '[]'::jsonb,
  error_message TEXT,
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),

  CONSTRAINT unique_job_product UNIQUE(job_id, product_id)
);

CREATE INDEX idx_product_status_job ON product_processing_status(job_id);
CREATE INDEX idx_product_status_status ON product_processing_status(status);
```

---

### Phase 2: Processing Loop Implementation

#### New Main Orchestration Function
```python
async def process_document_with_discovery_v2(
    job_id: str,
    document_id: str,
    file_path: str,
    filename: str,
    # ... other params
):
    """
    Product-centric processing pipeline.
    """

    # Stage 0: Product Discovery (UNCHANGED)
    stage_0_result = await process_stage_0_discovery(...)
    catalog = stage_0_result["catalog"]

    # NEW: Initialize product tracking
    total_products = len(catalog.products)
    completed_products = []
    failed_products = []

    # NEW: Main product processing loop
    for product_index, product in enumerate(catalog.products, start=1):
        logger.info(f"🔄 Processing Product {product_index}/{total_products}: {product.name}")

        try:
            # Process this single product through all stages
            product_result = await process_single_product(
                product=product,
                product_index=product_index,
                total_products=total_products,
                job_id=job_id,
                document_id=document_id,
                file_content=file_content,
                # ... other params
            )

            completed_products.append(product.id)

            # Checkpoint after each product
            await checkpoint_recovery_service.create_checkpoint(
                job_id=job_id,
                stage=CheckpointStage.PRODUCT_COMPLETED,
                data={
                    "product_id": product.id,
                    "product_name": product.name,
                    "product_index": product_index,
                    "products_completed": len(completed_products),
                    "products_total": total_products
                }
            )

            # CRITICAL: Memory cleanup after each product
            await cleanup_product_memory(product_result)

        except Exception as e:
            logger.error(f"❌ Product {product.name} failed: {e}")
            failed_products.append({
                "product_id": product.id,
                "product_name": product.name,
                "error": str(e)
            })
            # Continue to next product (don't fail entire job)
            continue

    # Global finalization
    await process_global_entities(...)

    return {
        "products_completed": len(completed_products),
        "products_failed": len(failed_products),
        "failed_products": failed_products
    }
```

#### New Single Product Processor
```python
async def process_single_product(
    product: Product,
    product_index: int,
    total_products: int,
    job_id: str,
    document_id: str,
    file_content: bytes,
    tracker: ProgressTracker,
    # ... other params
) -> Dict[str, Any]:
    """
    Process a single product through all stages.
    """

    logger.info(f"📦 Product {product_index}/{total_products}: {product.name}")
    logger.info(f"   Pages: {product.page_range}")
    logger.info(f"   Categories: {product.categories}")

    # Update tracker for this product
    await tracker.update_current_product(
        product_id=product.id,
        product_name=product.name,
        product_index=product_index,
        total_products=total_products
    )

    # Stage 1: Extract THIS product's pages
    product_pages = set(product.page_range)
    pdf_result = await extract_product_pages(
        file_content=file_content,
        product_pages=product_pages,
        document_id=document_id
    )

    # Stage 2: Create chunks for THIS product
    chunks_result = await create_product_chunks(
        pdf_result=pdf_result,
        product=product,
        document_id=document_id,
        job_id=job_id
    )

    # Stage 3: Process images for THIS product
    images_result = await process_product_images(
        file_content=file_content,
        product_pages=product_pages,
        product=product,
        document_id=document_id,
        job_id=job_id
    )

    # Stage 4: Create product in DB
    product_db_result = await create_product_in_db(
        product=product,
        chunks=chunks_result["chunks"],
        images=images_result["images"],
        document_id=document_id,
        workspace_id=workspace_id
    )

    # Stage 5: Create relationships
    relationships_result = await create_product_relationships(
        product_id=product_db_result["product_id"],
        chunk_ids=chunks_result["chunk_ids"],
        image_ids=images_result["image_ids"]
    )

    return {
        "product_id": product.id,
        "product_name": product.name,
        "chunks_created": len(chunks_result["chunks"]),
        "images_processed": len(images_result["images"]),
        "relationships_created": relationships_result["count"],
        # Keep references for memory cleanup
        "_cleanup_refs": {
            "pdf_result": pdf_result,
            "chunks": chunks_result,
            "images": images_result
        }
    }
```

---

### Phase 3: UI Modal Redesign

#### New Modal Structure
```typescript
// AsyncJobQueueMonitor.tsx - New product accordion structure

interface ProductProgress {
  productId: string;
  productName: string;
  productIndex: number;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  currentStage?: string;
  stagesCompleted: string[];
  error?: string;
  metrics: {
    chunksCreated: number;
    imagesProcessed: number;
    relationshipsCreated: number;
  };
}

interface JobProgressV2 {
  jobId: string;
  status: string;
  overallProgress: number;

  // Product-level tracking
  productsTotal: number;
  productsCompleted: number;
  productsFailed: number;
  currentProductIndex: number;

  // Product details
  products: ProductProgress[];

  // Global stages (run after all products)
  globalStages: {
    documentEntities: StageStatus;
    qualityEnhancement: StageStatus;
  };
}

// UI Component
<Dialog>
  <DialogContent>
    <DialogHeader>
      <DialogTitle>
        Job Progress: {job.filename}
      </DialogTitle>
      <DialogDescription>
        {job.productsCompleted}/{job.productsTotal} products completed
        {job.productsFailed > 0 && ` (${job.productsFailed} failed)`}
      </DialogDescription>
    </DialogHeader>

    {/* Overall Progress */}
    <Progress value={job.overallProgress} />

    {/* Product Accordions */}
    <Accordion type="multiple">
      {job.products.map((product, index) => (
        <AccordionItem key={product.productId} value={product.productId}>
          <AccordionTrigger>
            <div className="flex items-center gap-2">
              {/* Status Icon */}
              {product.status === 'completed' && <CheckCircle className="text-green-500" />}
              {product.status === 'processing' && <Loader2 className="text-blue-500 animate-spin" />}
              {product.status === 'failed' && <XCircle className="text-red-500" />}
              {product.status === 'pending' && <Clock className="text-gray-400" />}

              {/* Product Name */}
              <span className="font-medium">
                Product {product.productIndex}: {product.productName}
              </span>

              {/* Quick Stats */}
              <span className="text-sm text-muted-foreground ml-auto">
                {product.metrics.chunksCreated} chunks, {product.metrics.imagesProcessed} images
              </span>
            </div>
          </AccordionTrigger>

          <AccordionContent>
            {/* Product Stage Details */}
            <div className="space-y-2 pl-6">
              <StageItem
                name="Page Extraction"
                status={product.stagesCompleted.includes('extraction') ? 'completed' : 'pending'}
              />
              <StageItem
                name="Text Chunking"
                status={product.stagesCompleted.includes('chunking') ? 'completed' : 'pending'}
              />
              <StageItem
                name="Image Processing"
                status={product.stagesCompleted.includes('images') ? 'completed' : 'pending'}
              />
              <StageItem
                name="Product Creation"
                status={product.stagesCompleted.includes('creation') ? 'completed' : 'pending'}
              />
              <StageItem
                name="Relationships"
                status={product.stagesCompleted.includes('relationships') ? 'completed' : 'pending'}
              />

              {/* Error Details */}
              {product.error && (
                <Alert variant="destructive">
                  <AlertDescription>{product.error}</AlertDescription>
                </Alert>
              )}

              {/* Metrics */}
              <div className="grid grid-cols-3 gap-2 mt-4">
                <MetricCard label="Chunks" value={product.metrics.chunksCreated} />
                <MetricCard label="Images" value={product.metrics.imagesProcessed} />
                <MetricCard label="Links" value={product.metrics.relationshipsCreated} />
              </div>
            </div>
          </AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>

    {/* Global Stages */}
    <Separator className="my-4" />
    <div className="space-y-2">
      <h4 className="font-semibold">Global Processing</h4>
      <StageItem
        name="Document Entities"
        status={job.globalStages.documentEntities.status}
        details={`${job.globalStages.documentEntities.count} entities`}
      />
      <StageItem
        name="Quality Enhancement"
        status={job.globalStages.qualityEnhancement.status}
      />
    </div>
  </DialogContent>
</Dialog>
```

---

### Phase 4: Memory Management Strategy

#### Per-Product Memory Cleanup
```python
async def cleanup_product_memory(product_result: Dict[str, Any]):
    """
    Aggressively cleanup memory after each product completes.
    """
    import gc

    logger.info(f"🧹 Cleaning up memory for product: {product_result['product_name']}")

    # Get memory stats before cleanup
    mem_before = memory_monitor.get_memory_stats()
    logger.info(f"   💾 Memory before: {mem_before.used_mb:.1f} MB ({mem_before.percent_used:.1f}%)")

    # Delete large objects
    cleanup_refs = product_result.get('_cleanup_refs', {})

    # 1. Delete PDF result (contains extracted text/images)
    if 'pdf_result' in cleanup_refs:
        del cleanup_refs['pdf_result']

    # 2. Delete chunks data
    if 'chunks' in cleanup_refs:
        del cleanup_refs['chunks']

    # 3. Delete images data (base64 strings are large)
    if 'images' in cleanup_refs:
        del cleanup_refs['images']

    # 4. Delete the cleanup refs dict itself
    del cleanup_refs
    del product_result['_cleanup_refs']

    # 5. Force garbage collection
    gc.collect()

    # 6. Small delay for OS to reclaim memory
    await asyncio.sleep(0.5)

    # Get memory stats after cleanup
    mem_after = memory_monitor.get_memory_stats()
    mem_freed = mem_before.used_mb - mem_after.used_mb

    logger.info(f"   💾 Memory after: {mem_after.used_mb:.1f} MB ({mem_after.percent_used:.1f}%)")
    logger.info(f"   ✅ Freed: {mem_freed:.1f} MB")

    return {
        "memory_before_mb": mem_before.used_mb,
        "memory_after_mb": mem_after.used_mb,
        "memory_freed_mb": mem_freed
    }
```

#### Async Process Memory Handling
```python
# Key principle: Don't keep ALL products in memory

# ❌ BAD (current approach)
all_products = catalog.products  # Keep all in memory
for product in all_products:
    process(product)  # All products still in memory

# ✅ GOOD (proposed approach)
for i in range(len(catalog.products)):
    product = catalog.products[i]  # Get one product
    process(product)  # Process it
    cleanup_product_memory(...)  # Clean it up
    catalog.products[i] = None  # Release reference
    # Only current product in memory
```

---

## Next Steps

1. ✅ Review and approve this plan
2. [ ] Start Phase 1: Implement checkpoint schema changes
3. [ ] Create prototype with 2-3 products
4. [ ] Validate memory improvements
5. [ ] Roll out to production

---

## Risk Mitigation

### Risk 1: Breaking Existing Functionality
**Mitigation**:
- Keep old pipeline as `process_document_with_discovery_v1`
- New pipeline as `process_document_with_discovery_v2`
- Feature flag to switch between versions
- Gradual rollout

### Risk 2: Performance Regression
**Mitigation**:
- Benchmark both approaches
- Monitor processing time per product
- Optimize hot paths
- Consider parallel processing in future

### Risk 3: Database Load
**Mitigation**:
- Batch DB operations where possible
- Use connection pooling
- Monitor DB performance
- Add indexes for product queries

### Risk 4: UI Complexity
**Mitigation**:
- Progressive disclosure (collapsed by default)
- Virtualized lists for 100+ products
- Pagination if needed
- Performance testing with large catalogs


