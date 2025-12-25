# 🔄 Refactor Scraping & XML Processing - Planning Document

**Status**: Planning  
**Priority**: High  
**Estimated Effort**: 3-5 days  
**Created**: 2025-12-25

---

## 📋 Executive Summary

Currently, PDF processing uses a robust 14-stage checkpoint-based pipeline, while web scraping and XML import use simpler architectures. This creates:

1. **Inconsistent monitoring** - Different progress tracking mechanisms
2. **No unified job queue** - XML uses separate `data_import_jobs` table
3. **Scalability issues** - XML batch processing will fail on large files
4. **Limited recovery** - Web scraping and XML lack granular checkpoint recovery
5. **Fragmented UI** - 14-stage modal only works for PDF jobs

**Goal**: Unify all job types to use the checkpoint-based pipeline architecture for consistent monitoring, recovery, and scalability.

---

## 🎯 Objectives

### Primary Goals
- ✅ Migrate XML import from batch processing to async checkpoint-based pipeline
- ✅ Migrate web scraping to use checkpoint system instead of session-based tracking
- ✅ Unify all jobs in `background_jobs` table (deprecate `data_import_jobs`)
- ✅ Enable 14-stage modal for all job types with job-specific stages
- ✅ Implement proper chunking for large XML files (prevent memory issues)

### Secondary Goals
- ✅ Consistent heartbeat monitoring across all job types
- ✅ Unified auto-recovery system
- ✅ Better progress visualization in UI
- ✅ Improved error handling and retry logic

---

## 🏗️ Architecture Changes

### Current State

```
PDF Processing:
  background_jobs → job_checkpoints (14 stages) → Real-time progress

Web Scraping:
  background_jobs → scraping_sessions → Page-by-page tracking

XML Import:
  data_import_jobs → Batch processing → Product counters
```

### Target State

```
All Job Types:
  background_jobs → job_checkpoints (job-specific stages) → Real-time progress
```

---

## 📊 Stage Definitions

### PDF Processing (Existing - 14 Stages)
1. `initialized` - Job Initialization
2. `products_detected` - Product Discovery
3. `pdf_extracted` - Focused Extraction
4. `chunks_created` - Chunking
5. `text_embeddings_generated` - Text Embeddings
6. `images_extracted` - Image Extraction
7. `images_extracted` - Image Classification
8. `images_extracted` - Image Analysis
9. `image_embeddings_generated` - CLIP Embeddings
10. `products_created` - Product Creation
11. `relationships_created` - Relationship Mapping
12. `document_entities_created` - Document Entities
13. `metadata_extracted` - Metadata Extraction
14. `completed` - Quality Enhancement

### Web Scraping (New - 8 Stages)
1. `initialized` - Job Initialization
2. `session_created` - Scraping Session Setup
3. `pages_scraped` - Page Scraping (with progress: X/Y pages)
4. `content_extracted` - Content Extraction & Markdown Conversion
5. `products_discovered` - AI Product Discovery
6. `products_created` - Product Creation
7. `embeddings_generated` - Text & Image Embeddings
8. `completed` - Finalization

### XML Import (New - 7 Stages)
1. `initialized` - Job Initialization
2. `xml_parsed` - XML Parsing & Validation
3. `products_validated` - Product Data Validation
4. `products_created` - Product Creation (chunked batches)
5. `images_processed` - Image Download & Processing
6. `embeddings_generated` - Text Embeddings
7. `completed` - Finalization

---

## 🔧 Implementation Plan

### Phase 1: Database Schema Updates (Day 1)

#### 1.1 Migrate XML Import Jobs

**Action**: Create migration to move XML import jobs to `background_jobs` table

```sql
-- Migration: Unify XML import jobs into background_jobs
-- File: supabase/migrations/YYYYMMDD_unify_xml_import_jobs.sql

-- Step 1: Migrate existing data_import_jobs to background_jobs
INSERT INTO background_jobs (
  id,
  workspace_id,
  job_type,
  status,
  progress,
  current_stage,
  metadata,
  created_at,
  updated_at,
  started_at,
  completed_at,
  error_message
)
SELECT
  id,
  workspace_id,
  'xml_import' as job_type,
  status,
  CASE
    WHEN total_products > 0 THEN (processed_products::float / total_products * 100)::int
    ELSE 0
  END as progress,
  current_stage,
  jsonb_build_object(
    'import_type', import_type,
    'source_name', source_name,
    'total_products', total_products,
    'processed_products', processed_products,
    'failed_products', failed_products,
    'category', category,
    'field_mappings', field_mappings,
    'mapping_template_id', mapping_template_id,
    'parent_job_id', parent_job_id,
    'original_metadata', metadata
  ) as metadata,
  created_at,
  updated_at,
  started_at,
  completed_at,
  error_message
FROM data_import_jobs
WHERE NOT EXISTS (
  SELECT 1 FROM background_jobs WHERE background_jobs.id = data_import_jobs.id
);

-- Step 2: Add indexes for XML import queries
CREATE INDEX IF NOT EXISTS idx_background_jobs_xml_import
  ON background_jobs(workspace_id, job_type)
  WHERE job_type = 'xml_import';

-- Step 3: Keep data_import_jobs for backward compatibility (mark as deprecated)
COMMENT ON TABLE data_import_jobs IS 'DEPRECATED: Use background_jobs with job_type=xml_import instead';
```

#### 1.2 Add Checkpoint Support for Web Scraping

**Action**: Ensure `job_checkpoints` table supports web scraping stages

```sql
-- No schema changes needed - job_checkpoints already supports any job_type
-- Just need to ensure proper indexes exist

CREATE INDEX IF NOT EXISTS idx_job_checkpoints_web_scraping
  ON job_checkpoints(job_id, stage)
  WHERE job_id IN (SELECT id FROM background_jobs WHERE job_type = 'web_scraping');
```

#### 1.3 Update Background Jobs Metadata Schema

**Action**: Document expected metadata structure for each job type

```typescript
// Type definitions for job metadata
interface PDFProcessingMetadata {
  filename: string;
  file_size: number;
  total_pages: number;
  extracted_pages?: number;
  discovery_model?: string;
  products_detected?: number;
  chunks_created?: number;
  images_saved?: number;
  embeddings_generated?: number;
}

interface WebScrapingMetadata {
  session_id: string;
  source_url: string;
  scraping_mode: 'single' | 'multi' | 'sitemap';
  total_pages: number;
  completed_pages?: number;
  failed_pages?: number;
  products_discovered?: number;
  products_created?: number;
  field_mappings?: Record<string, string>[];
}

interface XMLImportMetadata {
  source_name: string;
  import_type: 'xml';
  total_products: number;
  processed_products?: number;
  failed_products?: number;
  category: string;
  batch_size: number; // NEW: For chunked processing
  current_batch?: number; // NEW: Current batch being processed
  field_mappings?: Record<string, string>;
  mapping_template_id?: string;
  xml_file_size?: number;
  xml_validation_errors?: string[];
}
```

---

### Phase 2: Backend Service Refactoring (Days 2-3)

#### 2.1 Create XML Import Pipeline Service

**File**: `mivaa-pdf-extractor/app/services/xml_import_pipeline_service.py`

**Purpose**: Replace batch processing with checkpoint-based async pipeline

```python
"""
XML Import Pipeline Service
Handles async XML import with checkpoint-based progress tracking
"""

from typing import Dict, Any, List
from datetime import datetime
import logging
from xml.etree import ElementTree as ET

from app.services.checkpoint_recovery_service import CheckpointRecoveryService, ProcessingStage
from app.services.progress_tracker import ProgressTracker
from app.services.supabase_client import get_supabase_client

logger = logging.getLogger(__name__)

class XMLImportStage:
    """XML Import processing stages"""
    INITIALIZED = "initialized"
    XML_PARSED = "xml_parsed"
    PRODUCTS_VALIDATED = "products_validated"
    PRODUCTS_CREATED = "products_created"
    IMAGES_PROCESSED = "images_processed"
    EMBEDDINGS_GENERATED = "embeddings_generated"
    COMPLETED = "completed"

class XMLImportPipelineService:
    """
    Async XML import pipeline with checkpoint recovery

    Features:
    - Chunked processing (batch_size=50 products at a time)
    - Checkpoint after each batch
    - Memory-efficient streaming for large XML files
    - Progress tracking with heartbeat
    - Auto-recovery on failure
    """

    def __init__(self, batch_size: int = 50):
        self.supabase = get_supabase_client()
        self.checkpoint_service = CheckpointRecoveryService()
        self.batch_size = batch_size

    async def process_xml_import(
        self,
        job_id: str,
        workspace_id: str,
        xml_content: str,
        category: str,
        field_mappings: Dict[str, str] = None,
        source_name: str = None
    ) -> Dict[str, Any]:
        """
        Process XML import with checkpoint-based pipeline

        Pipeline Stages:
        1. Initialize job
        2. Parse & validate XML (streaming for large files)
        3. Validate product data
        4. Create products in batches (checkpoint after each batch)
        5. Process images (async download & upload)
        6. Generate embeddings
        7. Complete
        """

        tracker = ProgressTracker(job_id, self.supabase)

        try:
            # Stage 1: Initialize
            await tracker.update_progress(0, "Initializing XML import...")
            await self.checkpoint_service.create_checkpoint(
                job_id=job_id,
                stage=XMLImportStage.INITIALIZED,
                checkpoint_data={"workspace_id": workspace_id, "category": category}
            )

            # Stage 2: Parse XML (streaming for large files)
            await tracker.update_progress(10, "Parsing XML file...")
            products = await self._parse_xml_streaming(xml_content, field_mappings)

            await self.checkpoint_service.create_checkpoint(
                job_id=job_id,
                stage=XMLImportStage.XML_PARSED,
                checkpoint_data={
                    "total_products": len(products),
                    "xml_size_bytes": len(xml_content)
                }
            )

            # Stage 3: Validate products
            await tracker.update_progress(20, "Validating product data...")
            validated_products = await self._validate_products(products)

            await self.checkpoint_service.create_checkpoint(
                job_id=job_id,
                stage=XMLImportStage.PRODUCTS_VALIDATED,
                checkpoint_data={
                    "validated_products": len(validated_products),
                    "validation_errors": len(products) - len(validated_products)
                }
            )

            # Stage 4: Create products in batches (CHUNKED PROCESSING)
            await tracker.update_progress(30, "Creating products...")
            created_products = await self._create_products_batched(
                job_id=job_id,
                workspace_id=workspace_id,
                products=validated_products,
                category=category,
                tracker=tracker
            )

            await self.checkpoint_service.create_checkpoint(
                job_id=job_id,
                stage=XMLImportStage.PRODUCTS_CREATED,
                checkpoint_data={
                    "products_created": len(created_products),
                    "batches_processed": (len(created_products) // self.batch_size) + 1
                }
            )

            # Stage 5: Process images (async)
            await tracker.update_progress(70, "Processing product images...")
            images_processed = await self._process_images_async(
                products=created_products,
                tracker=tracker
            )

            await self.checkpoint_service.create_checkpoint(
                job_id=job_id,
                stage=XMLImportStage.IMAGES_PROCESSED,
                checkpoint_data={"images_processed": images_processed}
            )

            # Stage 6: Generate embeddings
            await tracker.update_progress(90, "Generating embeddings...")
            embeddings_count = await self._generate_embeddings(created_products)

            await self.checkpoint_service.create_checkpoint(
                job_id=job_id,
                stage=XMLImportStage.EMBEDDINGS_GENERATED,
                checkpoint_data={"embeddings_generated": embeddings_count}
            )

            # Stage 7: Complete
            await tracker.update_progress(100, "Import complete!")
            await self.checkpoint_service.create_checkpoint(
                job_id=job_id,
                stage=XMLImportStage.COMPLETED,
                checkpoint_data={
                    "total_products_created": len(created_products),
                    "total_images_processed": images_processed,
                    "total_embeddings": embeddings_count
                }
            )

            return {
                "success": True,
                "products_created": len(created_products),
                "images_processed": images_processed,
                "embeddings_generated": embeddings_count
            }

        except Exception as e:
            logger.error(f"XML import failed: {e}")
            await tracker.update_progress(
                progress=tracker.current_progress,
                message=f"Error: {str(e)}",
                status="failed"
            )
            raise

    async def _parse_xml_streaming(
        self,
        xml_content: str,
        field_mappings: Dict[str, str] = None
    ) -> List[Dict[str, Any]]:
        """
        Parse XML using streaming to handle large files
        Memory-efficient: processes one product at a time
        """
        products = []

        # Use iterparse for streaming (memory-efficient for large XML)
        context = ET.iterparse(io.StringIO(xml_content), events=("start", "end"))

        current_product = None

        for event, elem in context:
            if event == "start" and elem.tag in ["product", "item", "material"]:
                current_product = {}

            elif event == "end" and elem.tag in ["product", "item", "material"]:
                if current_product:
                    products.append(current_product)
                    current_product = None

                # Clear element to free memory
                elem.clear()

            elif event == "end" and current_product is not None:
                # Map XML field to product field
                field_name = field_mappings.get(elem.tag, elem.tag) if field_mappings else elem.tag
                current_product[field_name] = elem.text

        return products

    async def _create_products_batched(
        self,
        job_id: str,
        workspace_id: str,
        products: List[Dict[str, Any]],
        category: str,
        tracker: ProgressTracker
    ) -> List[str]:
        """
        Create products in batches to avoid memory issues
        Checkpoint after each batch for recovery
        """
        created_product_ids = []
        total_batches = (len(products) // self.batch_size) + 1

        for batch_idx in range(0, len(products), self.batch_size):
            batch = products[batch_idx:batch_idx + self.batch_size]
            current_batch_num = (batch_idx // self.batch_size) + 1

            # Update progress
            progress = 30 + int((current_batch_num / total_batches) * 40)  # 30-70%
            await tracker.update_progress(
                progress=progress,
                message=f"Creating products (batch {current_batch_num}/{total_batches})..."
            )

            # Create batch
            batch_ids = await self._create_product_batch(
                workspace_id=workspace_id,
                products=batch,
                category=category
            )

            created_product_ids.extend(batch_ids)

            # Update job metadata with current batch
            await self.supabase.table('background_jobs').update({
                'metadata': {
                    'current_batch': current_batch_num,
                    'total_batches': total_batches,
                    'products_created_so_far': len(created_product_ids)
                }
            }).eq('id', job_id).execute()

            # Heartbeat
            await tracker.heartbeat()

        return created_product_ids
```

**Key Features**:
- ✅ Streaming XML parsing (handles large files without memory issues)
- ✅ Batched product creation (50 products at a time)
- ✅ Checkpoint after each batch (recovery support)
- ✅ Progress tracking with heartbeat
- ✅ Memory-efficient processing

---

#### 2.2 Create Web Scraping Pipeline Service

**File**: `mivaa-pdf-extractor/app/services/web_scraping_pipeline_service.py`

**Purpose**: Migrate from session-based to checkpoint-based tracking

```python
"""
Web Scraping Pipeline Service
Handles async web scraping with checkpoint-based progress tracking
"""

from typing import Dict, Any, List
from datetime import datetime
import logging

from app.services.checkpoint_recovery_service import CheckpointRecoveryService
from app.services.progress_tracker import ProgressTracker
from app.services.product_discovery_service import ProductDiscoveryService

logger = logging.getLogger(__name__)

class WebScrapingStage:
    """Web scraping processing stages"""
    INITIALIZED = "initialized"
    SESSION_CREATED = "session_created"
    PAGES_SCRAPED = "pages_scraped"
    CONTENT_EXTRACTED = "content_extracted"
    PRODUCTS_DISCOVERED = "products_discovered"
    PRODUCTS_CREATED = "products_created"
    EMBEDDINGS_GENERATED = "embeddings_generated"
    COMPLETED = "completed"

class WebScrapingPipelineService:
    """
    Async web scraping pipeline with checkpoint recovery

    Features:
    - Page-by-page scraping with checkpoints
    - Resume from last scraped page on failure
    - Progress tracking with heartbeat
    - Unified with PDF processing architecture
    """

    def __init__(self, model: str = "claude"):
        self.checkpoint_service = CheckpointRecoveryService()
        self.discovery_service = ProductDiscoveryService(model=model)

    async def process_scraping_session(
        self,
        job_id: str,
        session_id: str,
        workspace_id: str,
        categories: List[str] = None
    ) -> Dict[str, Any]:
        """
        Process web scraping session with checkpoint-based pipeline

        Pipeline Stages:
        1. Initialize job
        2. Create scraping session
        3. Scrape pages (checkpoint after each page)
        4. Extract content
        5. Discover products (AI)
        6. Create products
        7. Generate embeddings
        8. Complete
        """

        tracker = ProgressTracker(job_id, self.supabase)

        try:
            # Stage 1: Initialize
            await self.checkpoint_service.create_checkpoint(
                job_id=job_id,
                stage=WebScrapingStage.INITIALIZED,
                checkpoint_data={"session_id": session_id, "workspace_id": workspace_id}
            )

            # Stage 2: Session created (fetch session data)
            session = await self._get_session(session_id)
            await self.checkpoint_service.create_checkpoint(
                job_id=job_id,
                stage=WebScrapingStage.SESSION_CREATED,
                checkpoint_data={
                    "total_pages": session.get("total_pages", 0),
                    "source_url": session.get("source_url")
                }
            )

            # Stage 3: Scrape pages (checkpoint after each page)
            scraped_content = await self._scrape_pages_with_checkpoints(
                job_id=job_id,
                session=session,
                tracker=tracker
            )

            # Stage 4: Extract content
            markdown_content = await self._extract_content(scraped_content)
            await self.checkpoint_service.create_checkpoint(
                job_id=job_id,
                stage=WebScrapingStage.CONTENT_EXTRACTED,
                checkpoint_data={
                    "content_size_kb": len(markdown_content) / 1024,
                    "pages_processed": len(scraped_content)
                }
            )

            # Stage 5: Discover products
            discovery_result = await self.discovery_service.discover_products_from_text(
                markdown_text=markdown_content,
                source_type="web_scraping",
                categories=categories or ["products"],
                workspace_id=workspace_id,
                job_id=job_id
            )

            await self.checkpoint_service.create_checkpoint(
                job_id=job_id,
                stage=WebScrapingStage.PRODUCTS_DISCOVERED,
                checkpoint_data={
                    "products_discovered": len(discovery_result.get("products", [])),
                    "discovery_model": discovery_result.get("model_used")
                }
            )

            # Stages 6-8: Product creation, embeddings, completion
            # ... (similar to XML import)

            return {
                "success": True,
                "products_created": len(discovery_result.get("products", [])),
                "pages_scraped": len(scraped_content)
            }

        except Exception as e:
            logger.error(f"Web scraping failed: {e}")
            raise

    async def _scrape_pages_with_checkpoints(
        self,
        job_id: str,
        session: Dict[str, Any],
        tracker: ProgressTracker
    ) -> List[Dict[str, Any]]:
        """
        Scrape pages one by one with checkpoint after each page
        Enables resume from last scraped page on failure
        """
        pages = session.get("pages", [])
        scraped_content = []

        for idx, page in enumerate(pages):
            # Scrape page
            content = await self._scrape_single_page(page)
            scraped_content.append(content)

            # Update progress
            progress = 20 + int((idx + 1) / len(pages) * 30)  # 20-50%
            await tracker.update_progress(
                progress=progress,
                message=f"Scraped page {idx + 1}/{len(pages)}"
            )

            # Checkpoint after each page (for recovery)
            await self.checkpoint_service.create_checkpoint(
                job_id=job_id,
                stage=WebScrapingStage.PAGES_SCRAPED,
                checkpoint_data={
                    "pages_scraped": idx + 1,
                    "total_pages": len(pages),
                    "last_scraped_url": page.get("url")
                },
                metadata={"current_page": idx + 1}
            )

            # Heartbeat
            await tracker.heartbeat()

        return scraped_content
```

**Key Features**:
- ✅ Checkpoint after each scraped page (granular recovery)
- ✅ Resume from last page on failure
- ✅ Unified with PDF processing architecture
- ✅ Progress tracking with heartbeat

---

### Phase 3: Edge Function Updates (Day 3)

#### 3.1 Update XML Import Orchestrator

**File**: `supabase/functions/xml-import-orchestrator/index.ts`

**Changes**:
1. Create job in `background_jobs` instead of `data_import_jobs`
2. Call new `XMLImportPipelineService` instead of batch processing
3. Use checkpoint system for progress tracking

```typescript
// OLD: Create job in data_import_jobs
const { data: jobData } = await supabase
  .from('data_import_jobs')
  .insert({ ... });

// NEW: Create job in background_jobs
const { data: jobData } = await supabase
  .from('background_jobs')
  .insert({
    id: crypto.randomUUID(),
    workspace_id,
    job_type: 'xml_import',
    status: 'pending',
    progress: 0,
    current_stage: 'initialized',
    metadata: {
      source_name,
      total_products: products.length,
      category,
      field_mappings,
      batch_size: 50  // NEW: Chunked processing
    }
  });

// Call new pipeline service
const response = await fetch(`${MIVAA_API_URL}/api/xml-import/process`, {
  method: 'POST',
  body: JSON.stringify({
    job_id: jobData.id,
    workspace_id,
    xml_content,
    category,
    field_mappings,
    source_name
  })
});
```

#### 3.2 Update Web Scraping Session Manager

**File**: `supabase/functions/scrape-session-manager/index.ts`

**Changes**:
1. Call new `WebScrapingPipelineService` instead of old service
2. Use checkpoint system for progress tracking

```typescript
// Call new pipeline service
const response = await fetch(`${MIVAA_API_URL}/api/scraping/process-session-v2`, {
  method: 'POST',
  body: JSON.stringify({
    job_id: jobData.id,
    session_id,
    workspace_id,
    categories
  })
});
```

---

### Phase 4: Frontend Updates (Day 4)

#### 4.1 Update AsyncJobQueueMonitor Component

**File**: `src/components/Admin/AsyncJobQueueMonitor.tsx`

**Changes**:

1. **Add stage definitions for web scraping and XML import**:

```typescript
// Web Scraping Stages (8 stages)
const WEB_SCRAPING_STAGES = [
  { id: 1, name: 'Job Initialization', checkpoint: 'initialized' },
  { id: 2, name: 'Session Setup', checkpoint: 'session_created' },
  { id: 3, name: 'Page Scraping', checkpoint: 'pages_scraped' },
  { id: 4, name: 'Content Extraction', checkpoint: 'content_extracted' },
  { id: 5, name: 'Product Discovery', checkpoint: 'products_discovered' },
  { id: 6, name: 'Product Creation', checkpoint: 'products_created' },
  { id: 7, name: 'Embeddings', checkpoint: 'embeddings_generated' },
  { id: 8, name: 'Completion', checkpoint: 'completed' },
];

// XML Import Stages (7 stages)
const XML_IMPORT_STAGES = [
  { id: 1, name: 'Job Initialization', checkpoint: 'initialized' },
  { id: 2, name: 'XML Parsing', checkpoint: 'xml_parsed' },
  { id: 3, name: 'Product Validation', checkpoint: 'products_validated' },
  { id: 4, name: 'Product Creation', checkpoint: 'products_created' },
  { id: 5, name: 'Image Processing', checkpoint: 'images_processed' },
  { id: 6, name: 'Embeddings', checkpoint: 'embeddings_generated' },
  { id: 7, name: 'Completion', checkpoint: 'completed' },
];
```

2. **Update modal to show job-specific stages**:

```typescript
{/* Pipeline Stages - Job-Type Specific */}
{selectedJob && (
  <Card>
    <CardHeader>
      <CardTitle className="text-base flex items-center gap-2">
        <Activity className="h-4 w-4" />
        {selectedJob.job_type === 'pdf_processing' || selectedJob.job_type === 'product_discovery_upload'
          ? '14-Stage Processing Pipeline'
          : selectedJob.job_type === 'web_scraping'
          ? '8-Stage Scraping Pipeline'
          : selectedJob.job_type === 'xml_import'
          ? '7-Stage Import Pipeline'
          : 'Processing Pipeline'}
      </CardTitle>
      <CardDescription>
        Click on completed stages (green) to see detailed metrics
      </CardDescription>
    </CardHeader>
    <CardContent>
      <div className="space-y-2">
        {(() => {
          // Select stages based on job type
          const stages =
            selectedJob.job_type === 'pdf_processing' || selectedJob.job_type === 'product_discovery_upload'
              ? PROCESSING_STAGES
              : selectedJob.job_type === 'web_scraping'
              ? WEB_SCRAPING_STAGES
              : selectedJob.job_type === 'xml_import'
              ? XML_IMPORT_STAGES
              : [];

          return stages.map((stage) => {
            // ... existing stage rendering logic
          });
        })()}
      </div>
    </CardContent>
  </Card>
)}
```

3. **Add batch progress indicator for XML import**:

```typescript
{/* XML Import Batch Progress */}
{selectedJob?.job_type === 'xml_import' && selectedJob?.metadata?.current_batch && (
  <div className="mt-2 text-xs text-muted-foreground">
    Processing batch {selectedJob.metadata.current_batch} of {selectedJob.metadata.total_batches}
    ({selectedJob.metadata.products_created_so_far} products created)
  </div>
)}
```

4. **Add page scraping progress for web scraping**:

```typescript
{/* Web Scraping Page Progress */}
{selectedJob?.job_type === 'web_scraping' && selectedJob?.metadata?.completed_pages && (
  <div className="mt-2 text-xs text-muted-foreground">
    Scraped {selectedJob.metadata.completed_pages} of {selectedJob.metadata.total_pages} pages
  </div>
)}
```

---

### Phase 5: Testing & Validation (Day 5)

#### 5.1 Unit Tests

**Files to create**:
- `mivaa-pdf-extractor/tests/test_xml_import_pipeline.py`
- `mivaa-pdf-extractor/tests/test_web_scraping_pipeline.py`

**Test cases**:
1. ✅ XML parsing with large files (>10MB)
2. ✅ Batched product creation (verify checkpoints)
3. ✅ Recovery from failure mid-batch
4. ✅ Web scraping page-by-page checkpoints
5. ✅ Resume from last scraped page
6. ✅ Progress tracking accuracy
7. ✅ Heartbeat monitoring

#### 5.2 Integration Tests

**Test scenarios**:
1. ✅ Import 1000-product XML file (verify chunking works)
2. ✅ Scrape 50-page website (verify checkpoints)
3. ✅ Simulate failure during XML import (verify recovery)
4. ✅ Simulate failure during web scraping (verify resume)
5. ✅ Verify UI shows correct stages for each job type
6. ✅ Verify auto-recovery works for all job types

#### 5.3 Performance Tests

**Benchmarks**:
1. ✅ XML import: 10,000 products in <5 minutes
2. ✅ Web scraping: 100 pages in <10 minutes
3. ✅ Memory usage: <500MB for large XML files
4. ✅ Checkpoint overhead: <5% performance impact

---

## 📝 Migration Checklist

### Pre-Migration
- [ ] Backup `data_import_jobs` table
- [ ] Backup `scraping_sessions` table
- [ ] Document current job counts and statuses
- [ ] Create rollback plan

### Migration Steps
- [ ] Run database migration (Phase 1)
- [ ] Deploy new backend services (Phase 2)
- [ ] Update Edge Functions (Phase 3)
- [ ] Deploy frontend updates (Phase 4)
- [ ] Run integration tests (Phase 5)
- [ ] Monitor for 24 hours
- [ ] Deprecate old tables (after 1 week of stable operation)

### Post-Migration
- [ ] Update documentation
- [ ] Train team on new architecture
- [ ] Monitor Sentry for errors
- [ ] Verify all jobs complete successfully
- [ ] Archive old `data_import_jobs` table

---

## 🚨 Risk Mitigation

### Risk 1: Large XML Files Cause Memory Issues
**Mitigation**: Streaming XML parser + batched processing (50 products at a time)

### Risk 2: Migration Breaks Existing Jobs
**Mitigation**: Keep old tables for 1 week, dual-write during transition

### Risk 3: Performance Degradation
**Mitigation**: Benchmark before/after, optimize batch size if needed

### Risk 4: Checkpoint Overhead
**Mitigation**: Batch checkpoints (not after every product, only after batches)

---

## 📊 Success Metrics

### Performance
- ✅ XML import handles 10,000+ products without memory issues
- ✅ Web scraping completes 100+ pages without failures
- ✅ Checkpoint overhead <5%

### Reliability
- ✅ 99% job completion rate
- ✅ Auto-recovery works for all job types
- ✅ Zero data loss on failures

### User Experience
- ✅ Unified job monitoring UI
- ✅ Real-time progress for all job types
- ✅ Clear error messages and recovery status

---

## 📚 Related Documentation

- [PDF Processing Pipeline](./pdf-processing-pipeline.md)
- [Unified Job Tracking](./unified-job-tracking.md)
- [Web Scraping Integration](./web-scraping-integration.md)
- [Monitoring and Alerting](./monitoring-and-alerting.md)

---

## 🎯 Next Steps

1. **Review this plan** with the team
2. **Estimate effort** for each phase
3. **Assign tasks** to developers
4. **Create Jira tickets** for tracking
5. **Schedule implementation** (target: 1 week sprint)

---

**Document Version**: 1.0
**Last Updated**: 2025-12-25
**Author**: AI Assistant
**Status**: Ready for Review

