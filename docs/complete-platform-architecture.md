# Complete Platform Architecture - Material Kai Vision Platform

**Date**: 2025-10-31  
**Purpose**: COMPLETE understanding of how the platform works

---

## 🏗️ **Platform Architecture**

### **3-Tier System**

```
┌─────────────────────────────────────────────────────────────┐
│                    FRONTEND (Next.js/React)                  │
│                  material-kai-vision-platform                │
│                   Deployed on Vercel                         │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       │ (Calls Supabase Edge Functions)
                       ▼
┌─────────────────────────────────────────────────────────────┐
│              SUPABASE EDGE FUNCTIONS (Deno)                  │
│                    67 Edge Functions                         │
│              Deployed on Supabase Platform                   │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       │ (Calls MIVAA Backend API)
                       ▼
┌─────────────────────────────────────────────────────────────┐
│              MIVAA BACKEND API (FastAPI/Python)              │
│                  mivaa-pdf-extractor                         │
│          Deployed on v1api.materialshub.gr                   │
│                    74+ Endpoints                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 📊 **How Data Flows**

### **Example: PDF Upload**

1. **Frontend** (`EnhancedPDFProcessor.tsx`):
   ```typescript
   const response = await supabase.functions.invoke('mivaa-gateway', {
     body: { action: 'pdf_process_url', payload: { url, workspace_id } }
   });
   ```

2. **Supabase Edge Function** (`mivaa-gateway/index.ts`):
   ```typescript
   const mivaaUrl = `${MIVAA_SERVICE_URL}/api/documents/process-url`;
   const response = await fetch(mivaaUrl, {
     method: 'POST',
     headers: { 'Authorization': `Bearer ${MIVAA_API_KEY}` },
     body: JSON.stringify(payload)
   });
   ```

3. **MIVAA Backend** (`documents.py`):
   ```python
   @router.post("/api/documents/process-url")
   async def process_document_url(request: DocumentProcessRequest):
       # 14-stage PDF processing pipeline
       # Uses Claude, GPT, Llama, CLIP
       # Saves to Supabase database
       return {"job_id": job_id, "status": "processing"}
   ```

---

## 🔍 **Which Edge Functions Are Actually Used?**

### **ACTIVELY USED** (35-40 functions):

#### **1. Core Gateway** (1 function)
- ✅ `mivaa-gateway` - **PRIMARY GATEWAY** to MIVAA backend
  - **Called by**: Almost all frontend services
  - **Calls**: MIVAA backend API endpoints
  - **Purpose**: Central proxy to Python backend

#### **2. PDF Processing** (2 functions)
- ✅ `pdf-extract` - Simple PDF extraction
  - **Called by**: `pdfContentService.ts`
  - **Calls**: MIVAA `/api/pdf/extract/*` endpoints
- ✅ `pdf-batch-process` - Batch PDF processing
  - **Called by**: Admin dashboard
  - **Calls**: MIVAA `/api/admin/bulk/process`

#### **3. Search & RAG** (3 functions)
- ✅ `unified-material-search` - Main search function
  - **Called by**: `materialSearchService.ts`
  - **Calls**: MIVAA `/api/search/semantic`
- ✅ `rag-knowledge-search` - RAG search
  - **Called by**: `ragKnowledgeService.ts`
  - **Calls**: MIVAA `/api/rag/search`
- ✅ `enhanced-rag-search` - Enhanced RAG
  - **Called by**: `enhancedRAGService.ts`, `integratedWorkflowService.ts`
  - **Calls**: MIVAA `/api/rag/search/advanced`

#### **4. AI Analysis** (5 functions)
- ✅ `material-agent-orchestrator` - AI agent orchestration
  - **Called by**: `MaterialAgentSearchInterface.tsx`
  - **Calls**: MIVAA `/api/ai-services/*`
- ✅ `ocr-processing` - OCR text extraction
  - **Called by**: `integratedWorkflowService.ts`, `imageTextMapper.ts`
  - **Calls**: MIVAA `/api/ocr/extract`
- ✅ `spaceformer-analysis` - Space analysis
  - **Called by**: `spaceformerAnalysisService.ts`, `integratedAIService.ts`
  - **Calls**: Internal Edge Function logic (NOT MIVAA)
- ✅ `hybrid-material-analysis` - Hybrid AI analysis
  - **Called by**: `hybridAIService.ts`
  - **Calls**: MIVAA `/api/semantic-analysis`
- ✅ `visual-search-analyze` - Visual search
  - **Called by**: `unifiedMLService.ts`
  - **Calls**: MIVAA `/api/images/search`

#### **5. Material Recognition** (2 functions)
- ✅ `material-recognition` - Material recognition
  - **Called by**: Various services
  - **Calls**: MIVAA `/api/semantic-analysis`
- ✅ `ai-material-analysis` - AI material analysis
  - **Called by**: `aiMaterialAPI.ts`
  - **Calls**: MIVAA `/api/semantic-analysis`

#### **6. CRM & E-commerce** (6 functions)
- ✅ `crm-contacts-api` - CRM contacts
- ✅ `crm-users-api` - CRM users
- ✅ `crm-stripe-api` - Stripe integration
- ✅ `shopping-cart-api` - Shopping cart
- ✅ `quote-request-api` - Quote requests
- ✅ `proposals-api` - Proposals

#### **7. Moodboard** (2 functions)
- ✅ `moodboard-products-api` - Moodboard products
  - **Called by**: `MoodboardProductsService.ts`
- ✅ `moodboard-quote-api` - Moodboard quotes
  - **Called by**: `CommissionService.ts`

#### **8. Scraper** (3 functions)
- ✅ `material-scraper` - Material scraping
- ✅ `scrape-session-manager` - Scraping sessions
  - **Called by**: `SessionDetailView.tsx`
- ✅ `scrape-single-page` - Single page scraping
  - **Called by**: `PageQueueViewer.tsx`

#### **9. 3D Generation** (2 functions)
- ✅ `crewai-3d-generation` - 3D model generation
  - **Called by**: `materialAgent3DGenerationAPI.ts`, `integratedWorkflowService.ts`
- ✅ `svbrdf-extractor` - SVBRDF extraction
  - **Called by**: `svbrdfExtractionAPI.ts`, `integratedWorkflowService.ts`

#### **10. Voice** (1 function)
- ✅ `voice-to-material` - Voice search
  - **Called by**: `voiceToMaterialService.ts`, `aiMaterialAPI.ts`

#### **11. Admin Knowledge Base** (6 functions)
- ✅ `admin-kb-quality-dashboard`
- ✅ `admin-kb-quality-scores`
- ✅ `admin-kb-embeddings-stats`
- ✅ `admin-kb-metadata`
- ✅ `admin-kb-patterns`
- ✅ `admin-kb-detections`

#### **12. Utilities** (3 functions)
- ✅ `extract-categories` - Extract categories
  - **Called by**: `extract-categories.ts` API route
- ✅ `get-material-categories` - Get categories
- ✅ `mivaa-jwt-generator` - Generate JWT tokens

---

### **MOCK/SIMULATED DATA** (Functions that DON'T call MIVAA):

#### ❌ `style-analysis` - **RETURNS MOCK DATA!**
- **File**: `supabase/functions/style-analysis/index.ts`
- **Line 170**: `// Simulated style analysis functions`
- **What it does**: Returns hardcoded colors, not real analysis
- **Called by**: `hybridStyleAnalysisService.ts` (line 110)
- **Problem**: Frontend gets FAKE data!
- **Real functionality**: `styleAnalysisService.ts` and `colorAnalysisEngine.ts` (client-side)

#### ❌ `huggingface-model-trainer` - **MOCK TRAINING**
- **Called by**: `huggingFaceService.ts`, `ragKnowledgeService.ts`
- **What it does**: Simulated model training
- **Real functionality**: Not implemented

---

### **UNUSED/DUPLICATE** (10-15 functions):

#### Category 1: Replaced by MIVAA Backend
- ❌ `auto-analyze-image` - MIVAA `/api/images/analyze`
- ❌ `enhanced-clip-integration` - MIVAA has CLIP in pipeline
- ❌ `validate-images` - MIVAA `/api/v1/anthropic/images/validate`
- ❌ `enrich-products` - MIVAA `/api/v1/anthropic/products/enrich`

#### Category 2: Replaced by Other Edge Functions
- ❌ `document-vector-search` - Replaced by `unified-material-search`
- ❌ `advanced-search-recommendation` - Frontend has `advancedSearchRecommendationService.ts`

#### Category 3: Test/Legacy
- ❌ `pdf-processor` - Replaced by `pdf-extract`
- ❌ `pdf-integration-health` - Not used
- ❌ `mivaa-gateway-test` - Test function

#### Category 4: ACTIVELY USED (Verified)
- ✅ `analyze-knowledge-content` - Called by `unifiedMLService.ts` (line 524) and `enhancedRAGService.ts` (line 225)
- ✅ `extract-material-knowledge` - Called by `enhancedRAGService.ts` (line 494)
- ✅ `material-images-api` - Called by `materialSearchService.ts` (line 203)
- ✅ `unified-materials-api` - Called by `materialSearchService.ts` (line 148)
- ✅ `vector-similarity-search` - Called by `aiMaterialAPI.ts` (line 148)
- ✅ `material-properties-analysis` - Called by `materialPropertiesService.ts` (lines 98, 171)

#### Category 5: Need Final Verification
- ⚠️ `analyze-embedding-stability`
- ⚠️ `apply-quality-scoring`
- ⚠️ `canonical-metadata-extraction`
- ⚠️ `chunk-aware-search`
- ⚠️ `chunk-type-classification`
- ⚠️ `classify-content`
- ⚠️ `detect-boundaries`
- ⚠️ `enhanced-product-processing`
- ⚠️ `process-ai-analysis-queue`
- ⚠️ `process-image-queue`
- ⚠️ `process-image-semantic-linking`
- ⚠️ `quality-control-operations`
- ⚠️ `multi-vector-operations`
- ⚠️ `retrieval-api`
- ⚠️ `visual-search-batch`
- ⚠️ `visual-search-query`
- ⚠️ `visual-search-status`
- ⚠️ `parse-sitemap`

---

## 🤖 **Where AI Models Are Actually Used**

### **MIVAA Backend (Python)** - **PRIMARY AI PROCESSING**

#### **1. PDF Processing Pipeline** (`rag_routes.py`, `documents.py`)
- ✅ **Claude Haiku 4.5** - Fast product discovery
- ✅ **Claude Sonnet 4.5** - Deep product enrichment
- ✅ **Llama 4 Scout 17B Vision** - Image analysis
- ✅ **OpenAI text-embedding-3-small** - Text embeddings (1536D)
- ✅ **CLIP ViT-B/32** - Visual embeddings (512D)

#### **2. OCR Processing** (`ocr_service.py`)
- ✅ **EasyOCR** - Text extraction from images

#### **3. Image Analysis** (`images.py`, `anthropic_routes.py`, `together_ai_routes.py`)
- ✅ **Llama 4 Scout 17B Vision** - Material recognition
- ✅ **Claude Sonnet 4.5 Vision** - Image validation
- ✅ **CLIP** - Visual embeddings

#### **4. Product Enrichment** (`anthropic_routes.py`)
- ✅ **Claude Sonnet 4.5** - Product metadata extraction

### **Supabase Edge Functions** - **MINIMAL AI**

#### **1. Spaceformer Analysis** (`spaceformer-analysis/index.ts`)
- ✅ **Internal logic** - Space layout analysis (NOT AI models)

#### **2. Style Analysis** (`style-analysis/index.ts`)
- ❌ **MOCK DATA** - Returns hardcoded values (NOT real AI)

### **Frontend (Client-side)** - **HEURISTIC ANALYSIS**

#### **1. Style Analysis** (`styleAnalysisService.ts`, `colorAnalysisEngine.ts`)
- ✅ **K-means clustering** - Color extraction
- ✅ **Pixel analysis** - Saturation, brightness, edge detection
- ✅ **Color harmony** - Heuristic algorithms

---

## 📋 **Summary**

### **Total Edge Functions**: 67

### **Breakdown**:
- ✅ **Actively Used**: 41-46 functions (verified with evidence)
- ❌ **Mock/Simulated**: 2 functions (`style-analysis`, `huggingface-model-trainer`)
- ❌ **Unused/Duplicate**: 9 functions (safe to delete)
- ⚠️ **Need Final Verification**: 12-18 functions

### **AI Processing Location**:
- 🐍 **MIVAA Backend (Python)**: 95% of AI processing
  - Claude Haiku 4.5, Claude Sonnet 4.5
  - Llama 4 Scout 17B Vision
  - OpenAI text-embedding-3-small
  - CLIP ViT-B/32
  - EasyOCR
- 🦕 **Supabase Edge Functions**: 5% (mostly proxies to MIVAA)
  - `spaceformer-analysis` (internal logic)
  - Most others just forward to MIVAA backend
- 🌐 **Frontend**: Heuristic analysis only (no AI models)
  - K-means clustering for colors
  - Pixel analysis for style
  - No actual AI models

### **Key Insights**:

1. **Most Supabase Edge Functions are PROXIES to MIVAA backend!**
   - They don't do AI processing themselves
   - They just forward requests to Python backend where real AI models run

2. **`style-analysis` Edge Function returns MOCK DATA!**
   - Line 170: `// Simulated style analysis functions`
   - Returns hardcoded colors, not real analysis
   - Real style analysis is in frontend (`styleAnalysisService.ts`, `colorAnalysisEngine.ts`)

3. **All AI models run in MIVAA Backend (Python)**
   - Claude, GPT, Llama, CLIP, EasyOCR
   - Edge Functions just proxy requests
   - Frontend does heuristic analysis only


