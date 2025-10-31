# Supabase Edge Functions Audit

**Date**: 2025-10-31  
**Total Functions**: 67  
**Purpose**: Identify which Edge Functions are actively used vs unused

---

## 🎯 Summary

**Total Edge Functions**: 67
**Actively Used**: ~35-40
**Unused/Legacy**: ~25-30
**Reduction Potential**: ~40%

**⚠️ IMPORTANT**: Many functions initially flagged as "unused" ARE actually being used!
**Verification method**: PowerShell search across entire src/ directory

---

## ✅ ACTIVELY USED - KEEP THESE

### 1. **Core PDF Processing** (3 functions)

#### `mivaa-gateway` ⭐ **CRITICAL**
- **Usage**: Called from EVERY frontend component
- **Evidence**: 
  - `EnhancedPDFProcessor.tsx` (line 43, 385)
  - `mivaaIntegrationService.ts` (lines 483-514)
  - `hybridAIService.ts` (lines 333-364)
  - `mivaaSearchIntegration.ts` (lines 63-92)
- **Purpose**: Gateway to MIVAA API backend
- **Status**: **KEEP - Most critical Edge Function**

#### `pdf-extract`
- **Usage**: Called by `pdf-batch-process` (line 538)
- **Evidence**: `supabase/functions/pdf-batch-process/index.ts`
- **Purpose**: Simple PDF extraction (markdown, tables, images)
- **Calls**: `/api/pdf/extract/*` MIVAA endpoints
- **Status**: **KEEP - Used for batch processing**

#### `pdf-batch-process`
- **Usage**: Batch PDF processing
- **Calls**: `pdf-extract` Edge Function internally
- **Status**: **KEEP - Batch processing**

---

### 2. **Material Knowledge & Search** (4 functions)

#### `extract-material-knowledge`
- **Usage**: `enhancedRAGService.ts` (line 1653)
- **Evidence**: Frontend service calls this
- **Purpose**: Extract material knowledge from content
- **Calls**: `mivaa-gateway` internally (line 152)
- **Status**: **KEEP - Active feature**

#### `get-material-categories`
- **Usage**: Called by `pdf-extract` (line 28)
- **Evidence**: `supabase/functions/pdf-extract/index.ts`
- **Purpose**: Fetch dynamic material categories
- **Status**: **KEEP - Used by pdf-extract**

#### `rag-knowledge-search`
- **Usage**: RAG search functionality
- **Purpose**: Knowledge base search
- **Status**: **KEEP - Core RAG feature**

#### `unified-material-search`
- **Usage**: Unified search across materials
- **Status**: **KEEP - Search feature**

---

### 3. **Visual Search** (4 functions)

#### `visual-search-query`
- **Usage**: Visual search queries
- **Calls**: `visual-search-analyze` internally (line 134)
- **Status**: **KEEP - Visual search feature**

#### `visual-search-analyze`
- **Usage**: Called by `visual-search-query`
- **Purpose**: Analyze images for visual search
- **Status**: **KEEP - Used by visual-search-query**

#### `visual-search-batch`
- **Usage**: Batch visual search processing
- **Status**: **KEEP - Batch visual search**

#### `visual-search-status`
- **Usage**: Check visual search job status
- **Status**: **KEEP - Status monitoring**

---

### 4. **AI & Analysis** (5 functions)

#### `spaceformer-analysis`
- **Usage**: `spaceformerAnalysisService.ts` (line 102)
- **Evidence**: Frontend service calls this
- **Purpose**: Spatial analysis
- **Status**: **KEEP - Active feature**

#### `crewai-3d-generation`
- **Usage**: `materialAgent3DGenerationAPI.ts` (line 656)
- **Evidence**: Frontend service calls this
- **Purpose**: 3D generation with CrewAI
- **Status**: **KEEP - 3D generation feature**

#### `svbrdf-extractor`
- **Usage**: `svbrdfExtractionAPI.ts` (line 55)
- **Evidence**: Frontend service calls this
- **Purpose**: SVBRDF material extraction
- **Status**: **KEEP - Material extraction**

#### `voice-to-material`
- **Usage**: `voiceToMaterialService.ts` (line 773)
- **Evidence**: Frontend service calls this
- **Purpose**: Voice-based material search
- **Status**: **KEEP - Voice search feature**

#### `extract-categories`
- **Usage**: `src/pages/api/mivaa/extract-categories.ts` (line 33)
- **Evidence**: API route calls this
- **Purpose**: Category extraction
- **Status**: **KEEP - Category extraction**

---

### 5. **Admin & Monitoring** (6 functions)

#### `admin-kb-detections`
- **Purpose**: Track detection events
- **Status**: **KEEP - Admin monitoring**

#### `admin-kb-embeddings-stats`
- **Purpose**: Embedding statistics
- **Status**: **KEEP - Admin monitoring**

#### `admin-kb-metadata`
- **Purpose**: Metadata management
- **Status**: **KEEP - Admin monitoring**

#### `admin-kb-patterns`
- **Purpose**: Pattern analysis
- **Status**: **KEEP - Admin monitoring**

#### `admin-kb-quality-dashboard`
- **Purpose**: Quality dashboard
- **Status**: **KEEP - Admin monitoring**

#### `admin-kb-quality-scores`
- **Purpose**: Quality scoring
- **Status**: **KEEP - Admin monitoring**

---

### 6. **CRM & E-commerce** (6 functions)

#### `crm-contacts-api`
- **Purpose**: CRM contacts management
- **Status**: **KEEP - CRM feature**

#### `crm-users-api`
- **Purpose**: CRM users management
- **Status**: **KEEP - CRM feature**

#### `crm-stripe-api`
- **Purpose**: Stripe payment integration
- **Status**: **KEEP - Payment processing**

#### `shopping-cart-api`
- **Purpose**: Shopping cart management
- **Status**: **KEEP - E-commerce**

#### `quote-request-api`
- **Purpose**: Quote requests
- **Status**: **KEEP - E-commerce**

#### `proposals-api`
- **Purpose**: Proposal management
- **Status**: **KEEP - E-commerce**

---

## ❌ UNUSED/LEGACY - CAN REMOVE

### 1. **Duplicate/Unused PDF Functions** (3 functions)

#### `pdf-processor`
- **Reason**: Replaced by `pdf-extract` and 14-stage pipeline
- **Status**: ❌ **REMOVE**

#### `pdf-integration-health`
- **Reason**: Health check not actively used
- **Status**: ❌ **REMOVE**

#### `mivaa-gateway-test`
- **Reason**: Test function
- **Status**: ❌ **REMOVE**

---

### 2. **Unused Analysis Functions** (10+ functions)

#### `analyze-embedding-stability`
- **Reason**: No frontend calls found
- **Status**: ❌ **REMOVE**

#### `analyze-knowledge-content`
- **Reason**: No frontend calls found
- **Status**: ❌ **REMOVE**

#### `apply-quality-scoring`
- **Reason**: No frontend calls found
- **Status**: ❌ **REMOVE**

#### `auto-analyze-image`
- **Reason**: No frontend calls found
- **Status**: ❌ **REMOVE**

#### `canonical-metadata-extraction`
- **Reason**: No frontend calls found
- **Status**: ❌ **REMOVE**

#### `chunk-aware-search`
- **Reason**: No frontend calls found
- **Status**: ❌ **REMOVE**

#### `chunk-type-classification`
- **Reason**: No frontend calls found
- **Status**: ❌ **REMOVE**

#### `classify-content`
- **Reason**: No frontend calls found
- **Status**: ❌ **REMOVE**

#### `detect-boundaries`
- **Reason**: No frontend calls found
- **Status**: ❌ **REMOVE**

#### `document-vector-search`
- **Reason**: Replaced by unified search
- **Status**: ❌ **REMOVE**

---

### 3. **Unused Processing Functions** (8 functions)

#### `enhanced-clip-integration`
- **Reason**: No frontend calls found
- **Status**: ❌ **REMOVE**

#### `enhanced-product-processing`
- **Reason**: No frontend calls found
- **Status**: ❌ **REMOVE**

#### `enrich-products`
- **Reason**: No frontend calls found
- **Status**: ❌ **REMOVE**

#### `process-ai-analysis-queue`
- **Reason**: No frontend calls found
- **Status**: ❌ **REMOVE**

#### `process-image-queue`
- **Reason**: No frontend calls found
- **Status**: ❌ **REMOVE**

#### `process-image-semantic-linking`
- **Reason**: No frontend calls found
- **Status**: ❌ **REMOVE**

#### `quality-control-operations`
- **Reason**: No frontend calls found
- **Status**: ❌ **REMOVE**

#### `validate-images`
- **Reason**: No frontend calls found
- **Status**: ❌ **REMOVE**

---

### 4. **Unused Utility Functions** (10+ functions)

#### `advanced-search-recommendation`
- **Reason**: No frontend calls found
- **Status**: ❌ **REMOVE**

#### `huggingface-model-trainer`
- **Reason**: No frontend calls found
- **Status**: ❌ **REMOVE**

#### `hybrid-material-analysis`
- **Reason**: No frontend calls found
- **Status**: ❌ **REMOVE**

#### `material-agent-orchestrator`
- **Usage**: `MaterialAgentSearchInterface.tsx` (lines 599, 618)
- **Evidence**: `integratedAIService.ts` (line 138)
- **Purpose**: Material agent search orchestration
- **Status**: ✅ **KEEP - Active feature**

#### `material-images-api`
- **Reason**: No frontend calls found
- **Status**: ❌ **REMOVE**

#### `material-recognition`
- **Reason**: No frontend calls found
- **Status**: ❌ **REMOVE**

#### `material-scraper`
- **Usage**: `supabaseConfig.ts` (line 185)
- **Purpose**: Material scraping functionality
- **Status**: ✅ **KEEP - Scraper feature**

#### `mivaa-jwt-generator`
- **Reason**: No frontend calls found
- **Status**: ❌ **REMOVE**

#### `multi-vector-operations`
- **Reason**: No frontend calls found
- **Status**: ❌ **REMOVE**

#### `ocr-processing`
- **Reason**: No frontend calls found
- **Status**: ❌ **REMOVE**

#### `parse-sitemap`
- **Reason**: No frontend calls found
- **Status**: ❌ **REMOVE**

#### `retrieval-api`
- **Reason**: No frontend calls found
- **Status**: ❌ **REMOVE**

#### `scrape-session-manager`
- **Usage**: `SessionDetailView.tsx` (line 107)
- **Purpose**: Manage scraping sessions
- **Status**: ✅ **KEEP - Scraper feature**

#### `scrape-single-page`
- **Usage**: `PageQueueViewer.tsx` (line 152)
- **Purpose**: Scrape individual pages
- **Status**: ✅ **KEEP - Scraper feature**

#### `style-analysis`
- **Reason**: No frontend calls found
- **Status**: ❌ **REMOVE**

#### `moodboard-products-api`
- **Usage**: `MoodboardProductsService.ts` (lines 45, 76, 97)
- **Purpose**: Moodboard product management
- **Status**: ✅ **KEEP - Moodboard feature**

#### `moodboard-quote-api`
- **Usage**: `CommissionService.ts` (line 54)
- **Purpose**: Moodboard quote/commission tracking
- **Status**: ✅ **KEEP - Moodboard feature**

---

## 📊 Summary

### ✅ Keep (35+ functions):
- Core PDF Processing: 3
- Material Knowledge & Search: 4
- Visual Search: 4
- AI & Analysis: 5
- Admin & Monitoring: 6
- CRM & E-commerce: 6
- Scraper Functions: 3
- Moodboard Functions: 2
- Material Agent: 1
- Other Active: 1+

### ❌ Remove (~25-30 functions):
- Duplicate/Unused PDF: 3
- Unused Analysis: 10
- Unused Processing: 8
- Unused Utility: 4-9

### Reduction: **~40% fewer Edge Functions**

---

## ⚠️ CRITICAL RECOMMENDATION

**DO NOT remove any Edge Functions yet!**

**Reason**: Initial audit found many "unused" functions ARE actually being used:
- `material-agent-orchestrator` - Used by MaterialAgentSearchInterface
- `material-scraper`, `scrape-session-manager`, `scrape-single-page` - Active scraper features
- `moodboard-products-api`, `moodboard-quote-api` - Active moodboard features

**Next Steps**:
1. ✅ Run comprehensive search for EACH function before removal
2. ✅ Check both `supabase.functions.invoke()` AND `apiService.callSupabaseFunction()` patterns
3. ✅ Verify no internal Edge Function → Edge Function calls
4. ✅ Create backup before any deletions
5. ✅ Test thoroughly after each removal

---

## 🚀 Next Steps

1. ✅ Verify each "unused" function has NO frontend calls
2. ✅ Check if any Edge Functions call other Edge Functions internally
3. ✅ Remove unused functions from Supabase
4. ✅ Update documentation
5. ✅ Test all core functionality still works


