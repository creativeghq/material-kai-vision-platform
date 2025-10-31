# PDF Processing Enhancement Plans

**Created:** 2025-01-30
**Last Updated:** 2025-10-30
**Status:** Planning

---

## 📑 Table of Contents

1. [Dimension Extraction & Metafield Enhancement](#1-dimension-extraction--metafield-enhancement) - Priority: Medium, Time: 2-3 weeks
2. [Resume Functionality Implementation](#2-resume-functionality-implementation) - Priority: High, Time: 4-6 hours

---

# 1. Dimension Extraction & Metafield Enhancement

**Priority:** Medium (Post-Testing)
**Estimated Time:** 2-3 weeks
**Status:** Planning

---

## 🎯 OBJECTIVE

Enhance PDF processing to properly extract, parse, and store product dimensions (sizes) as structured metafields instead of losing them during quality filtering.

---

## 📊 CURRENT STATE ANALYSIS

### ✅ What's Already Working

1. **Dimension Extraction** - Regex patterns extract dimensions from content:
   - Location: `mivaa-pdf-extractor/app/services/product_creation_service.py` (lines 508-520)
   - Patterns: `15×38`, `20x40`, `11.8×11.8 cm`
   - Storage: `metadata['dimensions']` as string

2. **Metafield System** - Infrastructure exists:
   - Tables: `metafield_definitions`, `metafield_values`
   - Supports: chunks, products, images
   - Types: string, number, boolean, date, select, multiselect, json

3. **Multiple Storage Locations**:
   - `products.metadata` JSONB field
   - `document_chunks.metadata` JSONB field
   - `document_images` metadata via semantic linking

### ❌ Critical Problem: Dimension Chunks Being Rejected

**Example:** Chunk content `"NOVA 15×38"` is being **REJECTED** by quality scoring:

| Metric | Score | Calculation | Why |
|--------|-------|-------------|-----|
| **Length Score** | 0.022 | 11 chars / 500 = 0.022 | Only 11 characters (need 500+) |
| **Boundary Score** | 0.7 | No punctuation | Doesn't end with `.!?:;` |
| **Semantic Score** | 0.0 | 0 sentences / 3 = 0.0 | No sentences detected |
| **TOTAL QUALITY** | **0.287** | (0.022×0.3) + (0.7×0.4) + (0.0×0.3) | **< 0.7 threshold → REJECTED** ❌ |

**Result:** Valuable dimension data is lost because chunks are filtered out before dimensions can be extracted and stored.

---

## 💡 PROPOSED SOLUTIONS

### **Option 1: Special Handling for Dimension Chunks** ✅ RECOMMENDED

**Approach:** Detect and bypass quality scoring for dimension-rich chunks

**Implementation:**
```python
def _is_dimension_chunk(self, content: str) -> bool:
    """Detect if chunk contains product name + dimensions pattern"""
    import re
    
    # Pattern: UPPERCASE product name + dimensions
    pattern = r'\b[A-Z]{2,}(?:\s+[A-Z]{2,})*\b.*?\d+\s*[×x]\s*\d+'
    return bool(re.search(pattern, content))

# In chunk processing loop:
if self._is_dimension_chunk(node.text):
    # Bypass quality scoring - this is valuable metadata
    quality_score = 1.0
    self.logger.info(f"✅ Dimension chunk detected - bypassing quality check")
else:
    quality_score = self._calculate_chunk_quality(node.text)
```

**Pros:**
- Simple implementation
- Fast execution
- No data loss for dimension chunks

**Cons:**
- Adds special case logic
- May save some low-quality chunks

---

### **Option 2: Extract Dimensions BEFORE Quality Filtering**

**Approach:** Parse dimensions from ALL chunks before quality check, store separately

**Implementation:**
```python
# NEW: Pre-processing step before quality filtering
dimension_metadata = {}

for i, node in enumerate(nodes):
    # STEP 1: Extract dimensions FIRST (before quality check)
    dimensions = self._extract_all_dimensions(node.text)
    if dimensions:
        dimension_metadata[i] = dimensions
    
    # STEP 2: Quality filtering (may reject chunk)
    quality_score = self._calculate_chunk_quality(node.text)
    if not self._validate_chunk_quality(node.text, quality_score):
        # Chunk rejected BUT dimensions already saved
        continue
    
    # STEP 3: Save chunk with dimensions metadata
    chunk_data['metadata']['extracted_dimensions'] = dimension_metadata.get(i, [])
```

**Pros:**
- No data loss - dimensions extracted regardless of quality
- More robust architecture
- Separates metadata extraction from quality filtering

**Cons:**
- More complex implementation
- Extra processing for all chunks

---

### **Option 3: Hybrid Approach** ⭐ BEST SOLUTION

**Approach:** Extract dimensions first + save dimension chunks

**Implementation:**
```python
# STEP 1: Extract dimensions from ALL chunks (before quality check)
all_dimensions = []
dimension_chunk_indices = []

for i, node in enumerate(nodes):
    dimensions = self._extract_all_dimensions(node.text)
    if dimensions:
        all_dimensions.extend(dimensions)
        dimension_chunk_indices.append(i)

# STEP 2: Quality filtering with special handling
for i, node in enumerate(nodes):
    quality_score = self._calculate_chunk_quality(node.text)
    
    # Special handling: Bypass quality check for dimension chunks
    if i in dimension_chunk_indices:
        quality_score = max(quality_score, 0.7)  # Boost to minimum threshold
        self.logger.info(f"✅ Dimension chunk {i} - quality boosted to {quality_score}")
    
    if not self._validate_chunk_quality(node.text, quality_score):
        continue
    
    # Save chunk with dimensions
    chunk_data['metadata']['dimensions'] = dimension_metadata.get(i, [])

# STEP 3: Aggregate dimensions for product metadata
product_metadata['all_available_sizes'] = self._deduplicate_dimensions(all_dimensions)
```

**Pros:**
- No data loss
- Keeps dimension chunks for context
- Aggregates all sizes for product
- Best of both worlds

**Cons:**
- Most complex implementation
- Requires careful testing

---

## 🏗️ IMPLEMENTATION PLAN

### **Phase 1: Dimension Parser Utility**

**File:** `mivaa-pdf-extractor/app/utils/dimension_parser.py`

```python
from typing import List, Dict, Any, Optional
import re

class DimensionParser:
    """Parse dimension strings into structured format"""
    
    @staticmethod
    def parse_dimension(text: str) -> Optional[Dict[str, Any]]:
        """
        Parse dimension string like "15×38 cm" into structured format
        
        Returns:
            {
                "width": 15,
                "height": 38,
                "depth": None,  # Optional for 3D
                "unit": "cm",
                "formatted": "15×38 cm"
            }
        """
        # Pattern: 15×38, 20x40, 8 x 45, with optional unit
        pattern = r'(\d+(?:\.\d+)?)\s*[×x]\s*(\d+(?:\.\d+)?)(?:\s*[×x]\s*(\d+(?:\.\d+)?))?\s*(cm|mm|m|inches?|")?'
        
        match = re.search(pattern, text, re.IGNORECASE)
        if not match:
            return None
        
        width, height, depth, unit = match.groups()
        
        return {
            "width": float(width),
            "height": float(height),
            "depth": float(depth) if depth else None,
            "unit": unit or "cm",  # Default to cm
            "formatted": match.group(0).strip()
        }
    
    @staticmethod
    def extract_all_dimensions(text: str) -> List[Dict[str, Any]]:
        """Extract all dimension mentions from text"""
        dimensions = []
        
        # Find all dimension patterns
        pattern = r'\d+(?:\.\d+)?\s*[×x]\s*\d+(?:\.\d+)?(?:\s*[×x]\s*\d+(?:\.\d+)?)?\s*(?:cm|mm|m|inches?|")?'
        matches = re.finditer(pattern, text, re.IGNORECASE)
        
        for match in matches:
            dim = DimensionParser.parse_dimension(match.group(0))
            if dim:
                dimensions.append(dim)
        
        return dimensions
    
    @staticmethod
    def deduplicate_dimensions(dimensions: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Remove duplicate dimensions"""
        seen = set()
        unique = []
        
        for dim in dimensions:
            # Create unique key
            key = f"{dim['width']}x{dim['height']}"
            if dim['depth']:
                key += f"x{dim['depth']}"
            key += f"_{dim['unit']}"
            
            if key not in seen:
                seen.add(key)
                unique.append(dim)
        
        return unique
```

---

### **Phase 2: Update Chunk Quality Scoring**

**File:** `mivaa-pdf-extractor/app/services/llamaindex_service.py`

**Changes:**
1. Add dimension detection method
2. Modify quality scoring to boost dimension chunks
3. Extract dimensions before quality filtering

---

### **Phase 3: Aggregate Dimensions in Product Creation**

**File:** `mivaa-pdf-extractor/app/services/product_creation_service.py`

**Changes:**
1. Collect dimensions from all related chunks
2. Deduplicate and structure
3. Store in `metadata['available_sizes']`

---

### **Phase 4: Create Metafield Definition**

**Database:** Add to `metafield_definitions` table

```sql
INSERT INTO metafield_definitions (
    field_name,
    display_name,
    field_type,
    is_required,
    description,
    extraction_hints,
    applies_to_categories,
    is_global,
    display_order
) VALUES (
    'available_sizes',
    'Available Sizes',
    'json',
    false,
    'All available dimensions/sizes for this product',
    'Extract all dimension patterns like 15×38, 20×40, 8×45. Look for product name followed by dimensions.',
    ARRAY['tiles', 'flooring', 'wall_covering', 'ceramic', 'porcelain'],
    false,
    10
);
```

---

### **Phase 5: Store Dimensions as Metafields**

**File:** `mivaa-pdf-extractor/app/services/product_creation_service.py`

**Changes:**
1. After creating product, store dimensions in `metafield_values` table
2. Link to product via `product_id`
3. Enable querying/filtering by size

---

## 📋 IMPLEMENTATION TASKS

- [ ] **Task 1:** Create dimension parser utility (`dimension_parser.py`)
- [ ] **Task 2:** Update chunk quality scoring for dimension chunks
- [ ] **Task 3:** Aggregate dimensions across chunks in product creation
- [ ] **Task 4:** Create `available_sizes` metafield definition in database
- [ ] **Task 5:** Store dimensions as metafields in `metafield_values` table
- [ ] **Task 6:** Update progress tracking to show dimension extraction stats
- [ ] **Task 7:** Add dimension extraction to job metadata/logging
- [ ] **Task 8:** Test with Harmony PDF (NOVA product should show all sizes)

---

## 🎯 SUCCESS CRITERIA

### **For NOVA Product (Harmony PDF):**

**Expected Dimensions to Extract:**
- 15×38 cm
- 20×40 cm
- 8×45 cm
- (Any other sizes mentioned in the PDF)

**Expected Storage:**
```json
{
  "product_name": "NOVA",
  "available_sizes": [
    {"width": 15, "height": 38, "unit": "cm", "formatted": "15×38 cm"},
    {"width": 20, "height": 40, "unit": "cm", "formatted": "20×40 cm"},
    {"width": 8, "height": 45, "unit": "cm", "formatted": "8×45 cm"}
  ],
  "metadata": {
    "dimensions_extracted": 3,
    "dimension_sources": ["chunk_12", "chunk_15", "chunk_18"]
  }
}
```

**Validation:**
- ✅ All dimension chunks saved (not rejected by quality scoring)
- ✅ All unique sizes extracted and deduplicated
- ✅ Dimensions stored in both `metadata` and `metafield_values`
- ✅ Product shows all available sizes in admin panel
- ✅ Dimensions searchable/filterable via metafield queries

---

## 🔄 NEXT STEPS

1. **Complete current PDF processing testing** with existing 1 product
2. **Review test results** and identify any issues
3. **Return to this plan** and implement dimension extraction enhancements
4. **Test with Harmony PDF** to validate NOVA product extracts all sizes
5. **Deploy to production** after validation

---

## 📝 NOTES

- This enhancement is **post-testing** - don't implement until current PDF processing is stable
- Focus on **Hybrid Approach (Option 3)** for best results
- Ensure backward compatibility with existing products
- Consider adding dimension extraction to existing products via migration script

---

## 🔗 RELATED FILES

- `mivaa-pdf-extractor/app/services/llamaindex_service.py` - Chunk quality scoring
- `mivaa-pdf-extractor/app/services/product_creation_service.py` - Product metadata extraction
- `src/components/Admin/MetadataFieldsManagement.tsx` - Metafield management UI
- `docs/metadata-inventory-system.md` - Metafield system documentation

---
---

# 2. Resume Functionality Implementation

**Priority:** High
**Estimated Time:** 4-6 hours
**Status:** Deferred (Option 2 chosen for faster results)
**Decision Date:** 2025-10-30

---

## 🎯 OBJECTIVE

Implement proper checkpoint-based resume functionality for PDF processing jobs that get interrupted due to service restarts, timeouts, or errors.

---

## 📊 CURRENT STATE

### ✅ What's Working

1. **Checkpoint System** - Jobs save checkpoints at each stage:
   - Table: `job_checkpoints`
   - Stages: `INITIALIZED`, `PDF_EXTRACTED`, `CHUNKS_CREATED`, `TEXT_EMBEDDINGS_GENERATED`, `IMAGES_EXTRACTED`, `IMAGE_EMBEDDINGS_GENERATED`, `PRODUCTS_DETECTED`, `PRODUCTS_CREATED`, `COMPLETED`
   - Location: `mivaa-pdf-extractor/app/services/checkpoint_recovery_service.py`

2. **Job Recovery Service** - Detects interrupted jobs:
   - Marks jobs as `interrupted` on service restart
   - Stores last checkpoint stage
   - Location: `mivaa-pdf-extractor/app/services/job_recovery_service.py`

3. **Resume Endpoint** - API endpoint to resume jobs:
   - Endpoint: `POST /api/rag/documents/job/{job_id}/resume`
   - Downloads file from storage
   - Triggers background task
   - Location: `mivaa-pdf-extractor/app/api/rag_routes.py` (lines 580-720)

4. **Storage Integration** - Files stored in Supabase:
   - Bucket: `pdf-documents`
   - Path format: `pdf-documents/{document_id}/{filename}`
   - Column: `documents.file_path`

### ❌ Critical Problem: Resume Doesn't Actually Process

**Issue:** When a job is resumed, it completes immediately with 0 chunks, 0 images, 0 products.

**Root Cause:** The `process_document_background` function doesn't support resuming from checkpoints. It's designed to process from scratch only.

**Evidence from logs:**
```
2025-10-30 13:06:52 - Job 0105def7-e739-4b13-a0d0-14a876cb80d0 marked for restart from pdf_extracted
2025-10-30 13:06:52 - Background task triggered for job 0105def7-e739-4b13-a0d0-14a876cb80d0
2025-10-30 13:06:53 - BACKGROUND JOB FINISHED: 0105def7-e739-4b13-a0d0-14a876cb80d0
Result: chunks_created=0, images_extracted=0, products_created=0, processing_time=0.886s
```

The job "completes" in less than 1 second without doing any actual processing.

---

## 💡 PROPOSED SOLUTION

### Architecture Changes Required

1. **Modify `process_document_background` Function**
   - Add `resume_from_checkpoint` parameter
   - Check for existing checkpoint data
   - Skip already-completed stages
   - Continue from last checkpoint

2. **Update `llamaindex_service.py`**
   - Add checkpoint awareness to `process_document_with_llamaindex`
   - Implement stage skipping logic
   - Load existing data from database (chunks, images, embeddings)
   - Continue processing from interrupted stage

3. **Enhance Checkpoint Data Storage**
   - Store intermediate results in checkpoint data:
     - Extracted chunks (IDs and content)
     - Extracted images (IDs and metadata)
     - Generated embeddings (IDs and vectors)
     - Created products (IDs and metadata)
   - Enable reconstruction of processing state

4. **Add Data Consistency Checks**
   - Verify database state matches checkpoint data
   - Handle partial data (e.g., some chunks created, some not)
   - Implement rollback for corrupted states

---

## 🔧 IMPLEMENTATION PLAN

### Phase 1: Checkpoint Data Enhancement (2 hours)

**Tasks:**
1. Modify checkpoint saving to include:
   - List of created chunk IDs
   - List of created image IDs
   - List of generated embedding IDs
   - Processing metadata (counts, timestamps)

2. Update `checkpoint_recovery_service.py`:
   - Add methods to load checkpoint data
   - Add methods to verify data consistency
   - Add methods to reconstruct processing state

**Files to modify:**
- `mivaa-pdf-extractor/app/services/checkpoint_recovery_service.py`
- `mivaa-pdf-extractor/app/services/llamaindex_service.py`

### Phase 2: Resume Logic Implementation (2-3 hours)

**Tasks:**
1. Modify `process_document_background`:
   ```python
   async def process_document_background(
       job_id: str,
       document_id: str,
       file_content: bytes,
       filename: str,
       resume_from_checkpoint: Optional[ProcessingStage] = None,
       checkpoint_data: Optional[Dict] = None,
       ...
   ):
       if resume_from_checkpoint:
           # Load existing data from database
           existing_chunks = load_chunks_from_db(document_id)
           existing_images = load_images_from_db(document_id)
           existing_embeddings = load_embeddings_from_db(document_id)

           # Skip completed stages
           if resume_from_checkpoint >= ProcessingStage.CHUNKS_CREATED:
               chunks = existing_chunks
           else:
               chunks = await create_chunks(...)

           # Continue processing from checkpoint
           ...
   ```

2. Update `llamaindex_service.py`:
   - Add `resume_from_stage` parameter to `process_document_with_llamaindex`
   - Implement stage skipping logic
   - Load existing data instead of recreating

**Files to modify:**
- `mivaa-pdf-extractor/app/api/rag_routes.py` (process_document_background)
- `mivaa-pdf-extractor/app/services/llamaindex_service.py`

### Phase 3: Resume Endpoint Integration (1 hour)

**Tasks:**
1. Update resume endpoint to pass checkpoint data:
   ```python
   background_tasks.add_task(
       process_document_background,
       job_id=job_id,
       document_id=document_id,
       file_content=file_content,
       filename=filename,
       resume_from_checkpoint=resume_stage,  # ✅ Add this
       checkpoint_data=last_checkpoint.get('checkpoint_data', {}),  # ✅ Add this
       ...
   )
   ```

**Files to modify:**
- `mivaa-pdf-extractor/app/api/rag_routes.py` (resume endpoint, lines 680-695)

### Phase 4: Testing & Validation (1 hour)

**Tasks:**
1. Test resume from each checkpoint stage:
   - Resume from `PDF_EXTRACTED` → Should create chunks, images, embeddings, products
   - Resume from `CHUNKS_CREATED` → Should create images, embeddings, products
   - Resume from `IMAGES_EXTRACTED` → Should create embeddings, products
   - Resume from `TEXT_EMBEDDINGS_GENERATED` → Should create image embeddings, products

2. Test data consistency:
   - Verify no duplicate chunks/images/embeddings
   - Verify all relationships are maintained
   - Verify final counts match expected values

3. Test error handling:
   - Resume with corrupted checkpoint data
   - Resume with missing database records
   - Resume with partial data

**Test script:**
- Create new test script: `scripts/testing/test-resume-functionality.js`
- Test all checkpoint stages
- Validate data integrity

---

## 🚨 RISKS & CHALLENGES

### High Risk Areas

1. **Data Duplication**
   - Risk: Creating duplicate chunks/images when resuming
   - Mitigation: Check for existing records before creating new ones
   - Validation: Use unique constraints and deduplication logic

2. **State Inconsistency**
   - Risk: Checkpoint data doesn't match database state
   - Mitigation: Add consistency checks before resuming
   - Validation: Verify counts and IDs match checkpoint data

3. **Partial Processing**
   - Risk: Some chunks created, some not (interrupted mid-stage)
   - Mitigation: Use database transactions for atomic operations
   - Validation: Rollback incomplete stages before resuming

4. **Memory Usage**
   - Risk: Loading large amounts of existing data into memory
   - Mitigation: Use pagination and streaming for large datasets
   - Validation: Monitor memory usage during resume

### Medium Risk Areas

1. **Embedding Regeneration**
   - Risk: Regenerating embeddings that already exist
   - Mitigation: Check for existing embeddings before calling AI models
   - Cost Impact: Avoid unnecessary API calls to OpenAI/CLIP

2. **Progress Tracking**
   - Risk: Progress percentage doesn't reflect resume state
   - Mitigation: Calculate progress based on completed + remaining work
   - UX Impact: Show accurate progress to users

---

## 📈 SUCCESS CRITERIA

1. **Functional Requirements:**
   - ✅ Jobs can resume from any checkpoint stage
   - ✅ No duplicate data is created
   - ✅ All relationships are maintained
   - ✅ Final output matches non-resumed job output

2. **Performance Requirements:**
   - ✅ Resume completes in < 50% of original processing time
   - ✅ No unnecessary AI API calls
   - ✅ Memory usage stays within limits

3. **Reliability Requirements:**
   - ✅ 100% success rate for resume from valid checkpoints
   - ✅ Graceful failure for corrupted checkpoints
   - ✅ Automatic rollback for inconsistent states

---

## 🔗 RELATED FILES

- `mivaa-pdf-extractor/app/api/rag_routes.py` - Resume endpoint and background task
- `mivaa-pdf-extractor/app/services/llamaindex_service.py` - Core processing logic
- `mivaa-pdf-extractor/app/services/checkpoint_recovery_service.py` - Checkpoint management
- `mivaa-pdf-extractor/app/services/job_recovery_service.py` - Job recovery on restart
- Database tables: `background_jobs`, `job_checkpoints`, `documents`, `document_chunks`, `document_images`

---

## 📝 DECISION LOG

**2025-10-30:** Chose Option 2 (disable resume, fix initial upload) over Option 1 (implement resume) for faster results:
- **Option 1 Time:** 4-6 hours (this plan)
- **Option 2 Time:** 30-60 minutes
- **Decision:** Implement Option 2 first to get PDF processing working, then return to Option 1 later
- **Rationale:** User needs working PDF processing immediately, resume is a nice-to-have feature

---

## 🎯 NEXT STEPS (When Ready to Implement)

1. Review this plan and update estimates
2. Create feature branch: `feature/resume-functionality`
3. Implement Phase 1 (Checkpoint Data Enhancement)
4. Implement Phase 2 (Resume Logic)
5. Implement Phase 3 (Resume Endpoint Integration)
6. Implement Phase 4 (Testing & Validation)
7. Deploy to staging and test with Harmony PDF
8. Deploy to production after validation

---

**END OF DOCUMENT**
