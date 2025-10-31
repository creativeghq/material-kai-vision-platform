# Phase 1: Hybrid Architecture Migration Guide

**Status**: IN PROGRESS  
**Date**: 2025-10-31  
**Goal**: Migrate from 67 Edge Functions to 12, reduce latency by 50%, reduce costs by 90%

---

## ✅ **Completed Steps**

### **Step 1: Audit Complete** ✅
- Created `docs/phase1-edge-functions-final-audit.md`
- Categorized all 67 Edge Functions
- **Decision**: KEEP 12 | DELETE 55 (82% reduction)

### **Step 2: MIVAA API Client Created** ✅
- Created `src/services/mivaaApiClient.ts`
- Centralized client for all MIVAA backend calls
- Features:
  - Direct calls to MIVAA backend (no proxy overhead)
  - Supabase auth token integration
  - Automatic retry logic
  - Error handling
  - Type safety

### **Step 3: MIVAA Backend Updated** ✅
- Updated `mivaa-pdf-extractor/app/middleware/jwt_auth.py`
- Added Supabase JWT validation support
- Now accepts both:
  - Supabase JWT tokens (from frontend)
  - MIVAA JWT tokens (internal)
  - Simple API keys (Material Kai API key)

---

## 🚀 **Next Steps**

### **Step 4: Update Frontend Services** (IN PROGRESS)

We need to update **40+ frontend files** to use the new MIVAA API client instead of Edge Functions.

#### **Files to Update** (from audit):

1. **AI Material Analysis** (1 file)
   - `src/services/aiMaterialAPI.ts` (line 126)
   - Replace: `supabase.functions.invoke('ai-material-analysis')`
   - With: `mivaaApi.analyzeMaterial()`

2. **Knowledge Content Analysis** (2 files)
   - `src/services/ml/unifiedMLService.ts` (line 524)
   - `src/services/enhancedRAGService.ts` (line 225)
   - Replace: `supabase.functions.invoke('analyze-knowledge-content')`
   - With: `mivaaApi.analyzeKnowledge()`

3. **Enhanced RAG Search** (4 files)
   - `src/services/enhancedRAGService.ts` (line 141)
   - `src/services/integratedWorkflowService.ts` (lines 133, 330)
   - `src/components/Admin/MaterialSuggestionsPanel.tsx` (line 73)
   - Replace: `supabase.functions.invoke('enhanced-rag-search')`
   - With: `mivaaApi.searchSemantic()`

4. **Hybrid Material Analysis** (3 files)
   - `src/services/hybridAIService.ts` (line 307)
   - `src/components/Admin/AITestingPanel.tsx` (line 458)
   - `src/components/PDF/PDFReviewWorkflow.tsx` (line 260)
   - Replace: `supabase.functions.invoke('hybrid-material-analysis')`
   - With: `mivaaApi.analyzeMaterial()`

5. **Material Agent Orchestrator** (3 files)
   - `src/services/integratedAIService.ts` (line 138)
   - `src/components/AI/MaterialAgentSearchInterface.tsx` (lines 599, 618)
   - Replace: `supabase.functions.invoke('material-agent-orchestrator')`
   - With: `mivaaApi.orchestrateAgent()`

6. **OCR Processing** (1 file)
   - `src/services/integratedWorkflowService.ts` (line 272)
   - Replace: `supabase.functions.invoke('ocr-processing')`
   - With: `mivaaApi.extractOcr()`

7. **Spaceformer Analysis** (2 files)
   - `src/services/integratedAIService.ts` (line 284)
   - `src/services/spaceformerAnalysisService.ts` (line 102)
   - Replace: `supabase.functions.invoke('spaceformer-analysis')`
   - With: `mivaaApi.analyzeSpaceformer()`

8. **SVBRDF Extraction** (2 files)
   - `src/services/integratedWorkflowService.ts` (line 302)
   - `src/services/svbrdfExtractionAPI.ts` (line 55)
   - Replace: `supabase.functions.invoke('svbrdf-extractor')`
   - With: `mivaaApi.extractSvbrdf()`

9. **Unified Material Search** (2 files)
   - `src/services/materialSearchService.ts` (lines 62, 110)
   - Replace: `supabase.functions.invoke('unified-material-search')`
   - With: `mivaaApi.searchMaterials()`

10. **Visual Search** (1 file)
    - `src/services/ml/unifiedMLService.ts` (line 479)
    - Replace: `supabase.functions.invoke('visual-search-analyze')`
    - With: `mivaaApi.searchVisual()`

11. **Voice to Material** (2 files)
    - `src/services/aiMaterialAPI.ts` (line 173)
    - `src/services/voiceToMaterialService.ts` (line 56)
    - Replace: `supabase.functions.invoke('voice-to-material')`
    - With: `mivaaApi.voiceToMaterial()`

12. **Style Analysis** (1 file) - SPECIAL CASE
    - `src/services/ml/hybridStyleAnalysisService.ts` (line 110)
    - Replace: `supabase.functions.invoke('style-analysis')` (returns MOCK data!)
    - With: Use only client-side analysis (already in `styleAnalysisService.ts`)

13. **PDF Processor** (1 file)
    - `src/services/pdfContentService.ts` (line 145)
    - Replace: `supabase.functions.invoke('pdf-processor')`
    - With: Keep using `mivaa-gateway` Edge Function (file upload)

14. **Material Properties** (1 file)
    - `src/services/ml/materialPropertiesService.ts` (lines 98, 171)
    - Replace: `supabase.functions.invoke('material-properties-analysis')`
    - With: `mivaaApi.analyzeProperties()`

15. **Additional Files** (20+ more)
    - See `docs/phase1-edge-functions-final-audit.md` for complete list

---

### **Step 5: Delete Edge Functions** (NOT STARTED)

After all frontend files are updated and tested, delete 55 Edge Functions:

```bash
# Delete proxy functions
rm -rf supabase/functions/ai-material-analysis
rm -rf supabase/functions/analyze-knowledge-content
rm -rf supabase/functions/document-vector-search
rm -rf supabase/functions/enhanced-rag-search
rm -rf supabase/functions/extract-material-knowledge
rm -rf supabase/functions/hybrid-material-analysis
rm -rf supabase/functions/material-agent-orchestrator
rm -rf supabase/functions/material-images-api
rm -rf supabase/functions/material-properties-analysis
rm -rf supabase/functions/ocr-processing
rm -rf supabase/functions/rag-knowledge-search
rm -rf supabase/functions/spaceformer-analysis
rm -rf supabase/functions/svbrdf-extractor
rm -rf supabase/functions/unified-materials-api
rm -rf supabase/functions/unified-material-search
rm -rf supabase/functions/vector-similarity-search
rm -rf supabase/functions/visual-search-analyze
rm -rf supabase/functions/voice-to-material
rm -rf supabase/functions/style-analysis
rm -rf supabase/functions/huggingface-model-trainer
rm -rf supabase/functions/pdf-processor
rm -rf supabase/functions/advanced-search-recommendation
rm -rf supabase/functions/pdf-integration-health
rm -rf supabase/functions/mivaa-gateway-test
# ... and 31 more (see audit document)

# Commit changes
git add .
git commit -m "Phase 1: Delete 55 unused Edge Functions (proxy to MIVAA)"
git push
```

---

### **Step 6: Delete MIVAA API Endpoints** (NOT STARTED)

Delete unused/duplicate endpoints from MIVAA backend:

1. `GET /api/search/recommendations` (functionality in frontend)
2. `GET /api/analytics` (not used)
3. `POST /api/documents/test-batch` (test endpoint)
4. `POST /api/documents/new-batch-process` (legacy)
5. `POST /api/documents/batch-process-fixed` (legacy)

---

### **Step 7: Update Test Scripts** (NOT STARTED)

Update all test scripts in `scripts/testing/` to use new architecture:

- `test-frontend-pdf-workflow.js` - Update to call MIVAA directly
- `nova-product-focused-test.js` - Update to use new client
- All other test scripts

---

### **Step 8: Clean Up Documentation** (NOT STARTED)

1. Delete obsolete .md files:
   - `docs/supabase-usage-analysis.md` (analysis complete)
   - `docs/queue-job-mechanism-analysis.md` (for Phase 2)
   - `docs/accurate-deletion-plan.md` (superseded by audit)
   - `docs/supabase-edge-functions-audit.md` (superseded by audit)

2. Update remaining documentation:
   - `docs/complete-platform-architecture.md` - Update to reflect Hybrid Architecture
   - `README.md` - Update architecture section
   - `mivaa-pdf-extractor/README.md` - Update API documentation

3. Create new documentation:
   - `docs/hybrid-architecture-guide.md` - How the new architecture works
   - `docs/mivaa-api-client-usage.md` - How to use the new MIVAA API client

---

### **Step 9: End-to-End Testing** (NOT STARTED)

Test all platform features:

1. PDF upload and processing
2. Search functionality (semantic, visual, hybrid)
3. CRM features
4. Admin dashboard
5. Moodboard features
6. All AI features (OCR, style analysis, material recognition)
7. Verify no errors in browser console
8. Verify no errors in MIVAA backend logs

---

### **Step 10: Deploy and Verify** (NOT STARTED)

1. Deploy frontend to Vercel (git push triggers automatic deployment)
2. Deploy MIVAA backend (git push triggers GitHub Actions deployment)
3. Verify all functionality in production
4. Monitor for errors
5. Verify performance improvements (50% faster response times expected)

---

## 📊 **Expected Impact**

### **Performance**
- ⚡ **50% faster** response times (no proxy overhead)
- 🚀 **200-500ms latency reduction** per request

### **Cost**
- 💰 **90% cheaper** (55 fewer Edge Functions)
- 📉 **Reduced Supabase Edge Function invocations** from 1M+/month to ~100K/month

### **Maintainability**
- 🧹 **82% fewer Edge Functions** (67 → 12)
- 📝 **Simpler architecture** (direct calls instead of proxies)
- 🔧 **Easier debugging** (fewer layers)

---

## 🔐 **Security Considerations**

### **Authentication Flow**

**Before** (Edge Function proxy):
```
Frontend → Supabase Edge Function → MIVAA Backend
         (Supabase auth)         (Material Kai API key)
```

**After** (Direct call):
```
Frontend → MIVAA Backend
         (Supabase JWT token)
```

### **Environment Variables Required**

**Frontend** (Vercel):
- `VITE_MIVAA_API_URL=https://v1api.materialshub.gr`

**MIVAA Backend** (Server):
- `SUPABASE_JWT_SECRET=<your-supabase-jwt-secret>` (from Supabase project settings)
- `JWT_SECRET_KEY=<your-mivaa-jwt-secret>` (existing)
- `MATERIAL_KAI_API_KEY=<your-api-key>` (existing)
- `MATERIAL_KAI_WORKSPACE_ID=<your-workspace-id>` (existing)

---

## 🎯 **Current Status**

- [x] Step 1: Audit Complete
- [x] Step 2: MIVAA API Client Created
- [x] Step 3: MIVAA Backend Updated
- [ ] Step 4: Update Frontend Services (IN PROGRESS)
- [ ] Step 5: Delete Edge Functions
- [ ] Step 6: Delete MIVAA API Endpoints
- [ ] Step 7: Update Test Scripts
- [ ] Step 8: Clean Up Documentation
- [ ] Step 9: End-to-End Testing
- [ ] Step 10: Deploy and Verify

**Next Action**: Start updating frontend services (Step 4)


