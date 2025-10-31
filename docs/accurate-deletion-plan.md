# Accurate Deletion Plan - Material Kai Vision Platform

**Date**: 2025-10-31  
**Status**: Ready for Execution  
**Based on**: Complete platform architecture review with evidence

---

## ✅ **VERIFIED: What Can Be Safely Deleted**

### **Supabase Edge Functions** (11 functions safe to delete)

#### **Category 1: Mock/Simulated Data** (2 functions)

##### 1. `style-analysis`
**Evidence**: Line 170 in `supabase/functions/style-analysis/index.ts`:
```typescript
// Simulated style analysis functions
async function analyzeColors(contentData: any, contentType: string): Promise<ColorAnalysis> {
  // Simulate color extraction and analysis
  const dominantColors = [
    { hex: '#2C3E50', rgb: [44, 62, 80] as [number, number, number], ... },
    // Hardcoded colors!
  ];
```

**Called by**: `hybridStyleAnalysisService.ts` (line 110)  
**Problem**: Returns FAKE data, not real analysis  
**Real functionality**: `styleAnalysisService.ts` and `colorAnalysisEngine.ts` (client-side)  
**Action**: DELETE and update `hybridStyleAnalysisService.ts` to use only client-side analysis

##### 2. `huggingface-model-trainer`
**Called by**: `huggingFaceService.ts` (line 101), `ragKnowledgeService.ts` (line 229)  
**Problem**: Mock training, not real implementation  
**Action**: DELETE

---

#### **Category 2: Functionality in MIVAA Backend** (4 functions)

##### 3. `auto-analyze-image`
**Functionality**: MIVAA `/api/images/analyze` endpoint  
**Evidence**: No frontend calls found  
**Action**: DELETE

##### 4. `enhanced-clip-integration`
**Functionality**: CLIP embeddings integrated in MIVAA PDF processing pipeline  
**Evidence**: No frontend calls found  
**Action**: DELETE

##### 5. `validate-images`
**Functionality**: MIVAA `/api/v1/anthropic/images/validate` endpoint  
**Evidence**: No frontend calls found  
**Action**: DELETE

##### 6. `enrich-products`
**Functionality**: MIVAA `/api/v1/anthropic/products/enrich` endpoint  
**Evidence**: No frontend calls found  
**Action**: DELETE

---

#### **Category 3: Replaced by Other Functions** (2 functions)

##### 7. `document-vector-search`
**Called by**: `documentVectorStoreService.ts` (line 426)  
**Replaced by**: `unified-material-search` and `rag-knowledge-search`  
**Action**: DELETE after updating `documentVectorStoreService.ts` to use `unified-material-search`

##### 8. `advanced-search-recommendation`
**Functionality**: Frontend has `advancedSearchRecommendationService.ts` (1500+ lines)  
**Evidence**: No frontend calls to Edge Function found  
**Action**: DELETE

---

#### **Category 4: Test/Legacy** (3 functions)

##### 9. `pdf-processor`
**Replaced by**: `pdf-extract` Edge Function  
**Evidence**: Only called by `pdfContentService.ts` (line 145) - can be updated to use `pdf-extract`  
**Action**: DELETE after updating `pdfContentService.ts`

##### 10. `pdf-integration-health`
**Functionality**: Health check not actively used  
**Evidence**: No frontend calls found  
**Action**: DELETE

##### 11. `mivaa-gateway-test`
**Functionality**: Test function  
**Evidence**: No frontend calls found  
**Action**: DELETE

---

### **MIVAA API Endpoints** (5-8 endpoints safe to delete)

#### **Category 1: Unused Search** (2 endpoints)

##### 1. `GET /api/search/recommendations`
**Evidence**: No frontend calls, functionality in `advancedSearchRecommendationService.ts`  
**Action**: DELETE from `search.py`

##### 2. `GET /api/analytics`
**Evidence**: No frontend calls found  
**Action**: DELETE from `search.py`

---

#### **Category 2: Test/Legacy Documents** (3 endpoints)

##### 3. `POST /api/documents/test-batch`
**Evidence**: Test endpoint, line 807 in `documents.py`  
**Action**: DELETE

##### 4. `POST /api/documents/new-batch-process`
**Evidence**: Legacy endpoint, line 851 in `documents.py`  
**Action**: DELETE

##### 5. `POST /api/documents/batch-process-fixed`
**Evidence**: Legacy endpoint, line 864 in `documents.py`  
**Action**: DELETE

---

#### **Category 3: Duplicate PDF Extraction** (3 endpoints - AFTER consolidation)

##### 6. `POST /api/v1/extract/markdown`
##### 7. `POST /api/v1/extract/tables`
##### 8. `POST /api/v1/extract/images`

**Evidence**: Duplicates of `/api/pdf/extract/*` endpoints  
**Used by**: `pdf-extract` Edge Function calls `/api/pdf/extract/*`  
**Action**: 
1. **FIRST**: Verify all calls use `/api/pdf/extract/*`
2. **THEN**: DELETE `/api/v1/extract/*` endpoints from `pdf_routes.py`

---

## ⚠️ **NEED FINAL VERIFICATION** (12-18 functions)

These functions need one more check before deletion:

### **Potentially Unused** (need to verify no internal Edge Function → Edge Function calls)

1. `analyze-embedding-stability`
2. `apply-quality-scoring`
3. `canonical-metadata-extraction`
4. `chunk-aware-search`
5. `chunk-type-classification`
6. `classify-content`
7. `detect-boundaries`
8. `enhanced-product-processing`
9. `process-ai-analysis-queue`
10. `process-image-queue`
11. `process-image-semantic-linking`
12. `quality-control-operations`
13. `multi-vector-operations`
14. `retrieval-api`
15. `visual-search-batch`
16. `visual-search-query`
17. `visual-search-status`
18. `parse-sitemap`

**Next Step**: Search for internal calls within Edge Functions themselves

---

## 🚀 **Execution Plan**

### **Phase 1: Update Frontend Code** (Before Deletion)

#### 1. Update `hybridStyleAnalysisService.ts`
**File**: `src/services/ml/hybridStyleAnalysisService.ts`  
**Change**: Remove call to `style-analysis` Edge Function (line 110)  
**Use**: Only client-side `styleAnalysisService.ts`

#### 2. Update `documentVectorStoreService.ts`
**File**: `src/services/documentVectorStoreService.ts`  
**Change**: Replace `document-vector-search` with `unified-material-search` (line 426)

#### 3. Update `pdfContentService.ts`
**File**: `src/services/pdfContentService.ts`  
**Change**: Replace `pdf-processor` with `pdf-extract` (line 145)

---

### **Phase 2: Delete Edge Functions**

```bash
cd material-kai-vision-platform

# Delete mock/simulated functions
rm -rf supabase/functions/style-analysis
rm -rf supabase/functions/huggingface-model-trainer

# Delete functions with functionality in MIVAA backend
rm -rf supabase/functions/auto-analyze-image
rm -rf supabase/functions/enhanced-clip-integration
rm -rf supabase/functions/validate-images
rm -rf supabase/functions/enrich-products

# Delete replaced functions
rm -rf supabase/functions/document-vector-search
rm -rf supabase/functions/advanced-search-recommendation

# Delete test/legacy functions
rm -rf supabase/functions/pdf-processor
rm -rf supabase/functions/pdf-integration-health
rm -rf supabase/functions/mivaa-gateway-test

git add .
git commit -m "cleanup: Remove 11 unused/mock Supabase Edge Functions"
```

---

### **Phase 3: Delete MIVAA API Endpoints**

```bash
cd mivaa-pdf-extractor

# Edit files:
# - app/api/search.py (remove /recommendations and /analytics)
# - app/api/documents.py (remove test-batch, new-batch-process, batch-process-fixed)
# - app/api/pdf_routes.py (remove /api/v1/extract/* after verification)
# - app/main.py (update router if needed)

git add .
git commit -m "cleanup: Remove 5-8 unused API endpoints"
```

---

### **Phase 4: Update Documentation**

```bash
# Update all docs
# - docs/api-reference.md
# - docs/supabase-edge-functions-audit.md
# - docs/complete-platform-architecture.md
# - mivaa-pdf-extractor/README.md
# - Update FastAPI OpenAPI schema

git add docs/
git commit -m "docs: Update after cleanup"
```

---

### **Phase 5: Test**

```bash
# Test core functionality
# - PDF upload and processing
# - Search functionality
# - Visual search
# - Admin dashboard
# - CRM features
# - Style analysis (client-side only)
```

---

## 📊 **Expected Results**

### **Before Cleanup**:
- Supabase Edge Functions: 67
- MIVAA API Endpoints: 74+
- Total: 141+

### **After Cleanup**:
- Supabase Edge Functions: 56 (-11, -16%)
- MIVAA API Endpoints: 66-69 (-5-8, -7-11%)
- Total: 122-125 (-13-19, -9-13%)

### **Benefits**:
- ✅ No more mock/fake data
- ✅ Cleaner codebase
- ✅ Faster deployments
- ✅ Better documentation
- ✅ Reduced confusion
- ✅ Smaller attack surface

---

## ⚠️ **CRITICAL: What NOT to Delete**

### **MUST KEEP** (41-46 functions verified with evidence):

1. `mivaa-gateway` - PRIMARY GATEWAY
2. `pdf-extract` - PDF extraction
3. `pdf-batch-process` - Batch processing
4. `unified-material-search` - Main search
5. `rag-knowledge-search` - RAG search
6. `enhanced-rag-search` - Enhanced RAG
7. `material-agent-orchestrator` - AI orchestration
8. `ocr-processing` - OCR extraction
9. `spaceformer-analysis` - Space analysis
10. `hybrid-material-analysis` - Hybrid AI
11. `visual-search-analyze` - Visual search
12. `material-recognition` - Material recognition
13. `ai-material-analysis` - AI analysis
14. All CRM functions (6)
15. All moodboard functions (2)
16. All scraper functions (3)
17. All 3D generation functions (2)
18. `voice-to-material` - Voice search
19. All admin KB functions (6)
20. All utility functions (3)
21. `analyze-knowledge-content` - Knowledge analysis
22. `extract-material-knowledge` - Knowledge extraction
23. `material-images-api` - Material images
24. `unified-materials-api` - Materials API
25. `vector-similarity-search` - Vector search
26. `material-properties-analysis` - Properties analysis


