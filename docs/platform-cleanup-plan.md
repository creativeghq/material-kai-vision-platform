# Material Kai Vision Platform - Complete Cleanup Plan

**Date**: 2025-10-31  
**Purpose**: Comprehensive cleanup of unused API endpoints and Supabase Edge Functions

---

## 🎯 Executive Summary

After deep code analysis across both repositories, here's what we found:

### API Endpoints (MIVAA Backend)
- **Total**: 74+ endpoints
- **Can Remove**: 5-8 endpoints (~10% reduction)
- **Must Consolidate**: 3 duplicate endpoints
- **Must Keep**: 60+ endpoints (all actively used)

### Supabase Edge Functions
- **Total**: 67 functions
- **Can Remove**: ~25-30 functions (~40% reduction)
- **Must Keep**: ~35-40 functions (actively used)

### Overall Impact
- **Cleaner codebase**: ~30% reduction in unused code
- **Better maintainability**: No confusion about which endpoints/functions to use
- **Faster deployments**: Less code to deploy
- **Reduced attack surface**: Fewer endpoints to secure

---

## 📋 Phase 1: API Endpoint Cleanup

### ❌ Safe to Remove (5-8 endpoints)

#### 1. Unused Search Endpoints (2)
```
DELETE /api/search/recommendations
DELETE /api/analytics
```
**Reason**: No frontend calls found  
**Impact**: None - not used  
**Files to update**:
- `mivaa-pdf-extractor/app/api/search_routes.py`
- `mivaa-pdf-extractor/app/main.py`
- `docs/api-reference.md`

#### 2. Test/Legacy Document Endpoints (3)
```
DELETE /api/documents/test-batch
DELETE /api/documents/new-batch-process
DELETE /api/documents/batch-process-fixed
```
**Reason**: Test endpoints, replaced by background jobs  
**Impact**: None - test/legacy code  
**Files to update**:
- `mivaa-pdf-extractor/app/api/documents_routes.py`
- `mivaa-pdf-extractor/app/main.py`
- `docs/api-reference.md`

#### 3. Duplicate PDF Extraction Endpoints (3) - **AFTER consolidation**
```
DELETE /api/v1/extract/markdown
DELETE /api/v1/extract/tables
DELETE /api/v1/extract/images
```
**Reason**: Duplicates of `/api/pdf/extract/*`  
**Impact**: Must update references first  
**Files to update**:
- `mivaa-pdf-extractor/app/api/pdf_routes.py`
- `src/config/mivaaStandardization.ts` (update to use `/api/pdf/extract/*`)
- `docs/api-reference.md`
- Test scripts

---

### ⚠️ Consolidation Required

**Problem**: Two sets of endpoints doing the SAME thing:
1. `/api/pdf/extract/*` (used by `pdf-extract` Edge Function)
2. `/api/v1/extract/*` (referenced in config but NOT called)

**Solution**: Keep `/api/pdf/extract/*`, remove `/api/v1/extract/*`

**Steps**:
1. Update `src/config/mivaaStandardization.ts`:
   ```typescript
   // BEFORE
   'pdf_extract_markdown': { path: '/api/v1/extract/markdown', method: 'POST' },
   
   // AFTER
   'pdf_extract_markdown': { path: '/api/pdf/extract/markdown', method: 'POST' },
   ```

2. Update `supabase/functions/mivaa-gateway/index.ts` (if needed)

3. Remove `/api/v1/extract/*` endpoint definitions from backend

4. Test `pdf-extract` Edge Function still works

---

### ✅ Must Keep (60+ endpoints)

All these are actively used:
- **Document Processing**: `/api/documents/process-url` (14-stage pipeline)
- **PDF Extraction**: `/api/pdf/extract/*` (used by Edge Function)
- **Search**: `/api/search/semantic`, `/api/search/vector`, `/api/search/hybrid`
- **RAG System**: All 7 endpoints
- **Embeddings**: All 3 endpoints
- **Products**: All 8 endpoints
- **Images**: All 5 endpoints (Material Kai integration)
- **AI Services**: TogetherAI, Anthropic, Claude (all fully implemented)
- **Background Jobs**: All 5 endpoints
- **Admin & Monitoring**: All 13 endpoints

---

## 📋 Phase 2: Supabase Edge Functions Cleanup

### ✅ Must Keep (35-40 functions)

#### Core Functions (28 verified)
1. `mivaa-gateway` ⭐ **CRITICAL** - Gateway to MIVAA API
2. `pdf-extract` - Simple PDF extraction
3. `pdf-batch-process` - Batch processing
4. `extract-material-knowledge` - Material knowledge extraction
5. `get-material-categories` - Dynamic categories
6. `rag-knowledge-search` - RAG search
7. `unified-material-search` - Unified search
8. `visual-search-query` - Visual search
9. `visual-search-analyze` - Image analysis
10. `visual-search-batch` - Batch visual search
11. `visual-search-status` - Status monitoring
12. `spaceformer-analysis` - Spatial analysis
13. `crewai-3d-generation` - 3D generation
14. `svbrdf-extractor` - SVBRDF extraction
15. `voice-to-material` - Voice search
16. `extract-categories` - Category extraction
17. `admin-kb-detections` - Admin monitoring
18. `admin-kb-embeddings-stats` - Admin monitoring
19. `admin-kb-metadata` - Admin monitoring
20. `admin-kb-patterns` - Admin monitoring
21. `admin-kb-quality-dashboard` - Admin monitoring
22. `admin-kb-quality-scores` - Admin monitoring
23. `crm-contacts-api` - CRM
24. `crm-users-api` - CRM
25. `crm-stripe-api` - Payments
26. `shopping-cart-api` - E-commerce
27. `quote-request-api` - E-commerce
28. `proposals-api` - E-commerce

#### Recently Verified (7 more)
29. `material-agent-orchestrator` - Material agent search
30. `material-scraper` - Scraping
31. `scrape-session-manager` - Scraping
32. `scrape-single-page` - Scraping
33. `moodboard-products-api` - Moodboard
34. `moodboard-quote-api` - Moodboard
35. `parse-sitemap` - Sitemap parsing (likely used by scraper)

---

### ❌ Likely Can Remove (~25-30 functions)

**⚠️ IMPORTANT**: Must verify EACH function before removal!

#### Duplicate/Test Functions (3)
- `pdf-processor` - Replaced by `pdf-extract`
- `pdf-integration-health` - Health check not used
- `mivaa-gateway-test` - Test function

#### Unused Analysis Functions (~10)
- `analyze-embedding-stability`
- `analyze-knowledge-content`
- `apply-quality-scoring`
- `auto-analyze-image`
- `canonical-metadata-extraction`
- `chunk-aware-search`
- `chunk-type-classification`
- `classify-content`
- `detect-boundaries`
- `document-vector-search`

#### Unused Processing Functions (~8)
- `enhanced-clip-integration`
- `enhanced-product-processing`
- `enrich-products`
- `process-ai-analysis-queue`
- `process-image-queue`
- `process-image-semantic-linking`
- `quality-control-operations`
- `validate-images`

#### Unused Utility Functions (~4-9)
- `advanced-search-recommendation`
- `huggingface-model-trainer`
- `hybrid-material-analysis`
- `material-images-api`
- `material-recognition`
- `mivaa-jwt-generator`
- `multi-vector-operations`
- `ocr-processing`
- `retrieval-api`
- `style-analysis`

---

## 🚀 Execution Plan

### Step 1: Backup Everything ✅
```bash
# Create backup branch
git checkout -b backup-before-cleanup
git push origin backup-before-cleanup

# Export Supabase Edge Functions
# (Manual backup via Supabase dashboard)
```

### Step 2: API Endpoint Cleanup

#### 2.1 Remove Unused Search Endpoints
```bash
# Edit mivaa-pdf-extractor/app/api/search_routes.py
# Remove /recommendations and /analytics endpoints
# Update main.py router
# Update documentation
```

#### 2.2 Remove Test Document Endpoints
```bash
# Edit mivaa-pdf-extractor/app/api/documents_routes.py
# Remove test-batch, new-batch-process, batch-process-fixed
# Update main.py router
# Update documentation
```

#### 2.3 Consolidate Duplicate PDF Endpoints
```bash
# 1. Update src/config/mivaaStandardization.ts
# 2. Update supabase/functions/mivaa-gateway/index.ts
# 3. Test pdf-extract Edge Function
# 4. Remove /api/v1/extract/* from backend
# 5. Update documentation
```

### Step 3: Supabase Edge Functions Cleanup

#### 3.1 Verify Each Function Before Removal
```powershell
# For EACH function, run:
Get-ChildItem -Path src -Recurse -Include *.ts,*.tsx | Select-String -Pattern "function-name"
Get-ChildItem -Path supabase/functions -Recurse -Include *.ts | Select-String -Pattern "function-name"
```

#### 3.2 Remove Verified Unused Functions
```bash
# Only remove if ZERO references found
# Delete function directory
# Update documentation
```

### Step 4: Update Documentation

#### 4.1 Update API Documentation
- `docs/api-reference.md` - Remove deleted endpoints
- `docs/overview.md` - Update endpoint counts
- `mivaa-pdf-extractor/README.md` - Update examples

#### 4.2 Update FastAPI Docs
- `mivaa-pdf-extractor/app/main.py` - Update OpenAPI schema
- Test `/docs` and `/redoc` endpoints

### Step 5: Testing

#### 5.1 Test Core Functionality
```bash
# Run existing test scripts
node scripts/testing/nova-product-focused-test.js
node scripts/testing/comprehensive-production-validation.js
```

#### 5.2 Test Edge Functions
```bash
# Test each active Edge Function
# Verify no 404 errors
# Check logs for errors
```

#### 5.3 E2E Testing
- Upload PDF → Verify 14-stage pipeline works
- Test search functionality
- Test visual search
- Test admin dashboard
- Test CRM features
- Test moodboard features
- Test scraper features

### Step 6: Deploy

#### 6.1 Deploy MIVAA Backend
```bash
cd mivaa-pdf-extractor
git add .
git commit -m "cleanup: Remove unused API endpoints"
git push origin main
# Deployment happens automatically via GitHub Actions
```

#### 6.2 Deploy Frontend
```bash
cd material-kai-vision-platform
git add .
git commit -m "cleanup: Update API endpoint references"
git push origin main
# Vercel deployment happens automatically
```

#### 6.3 Monitor
- Check deployment logs
- Monitor error rates
- Verify all features work

---

## 📊 Expected Results

### Before Cleanup
- **API Endpoints**: 74+
- **Edge Functions**: 67
- **Total Code**: ~100% baseline

### After Cleanup
- **API Endpoints**: ~65 (-10%)
- **Edge Functions**: ~40 (-40%)
- **Total Code**: ~70% of baseline

### Benefits
1. ✅ **Cleaner codebase** - Easier to understand and maintain
2. ✅ **Faster deployments** - Less code to build and deploy
3. ✅ **Better documentation** - Only document what's actually used
4. ✅ **Reduced confusion** - No duplicate endpoints
5. ✅ **Improved security** - Smaller attack surface
6. ✅ **Better performance** - Less code to load and execute

---

## ⚠️ Risks & Mitigation

### Risk 1: Accidentally Remove Used Function
**Mitigation**: 
- Verify EACH function with PowerShell search
- Check both frontend AND Edge Function calls
- Create backup before any deletions
- Test thoroughly after each removal

### Risk 2: Break Existing Integrations
**Mitigation**:
- Keep all documented endpoints
- Test all core user flows
- Monitor error logs after deployment
- Have rollback plan ready

### Risk 3: Miss Internal Dependencies
**Mitigation**:
- Check Edge Function → Edge Function calls
- Verify MIVAA API → MIVAA API calls
- Review all import statements
- Test integration points

---

## 🎯 Success Criteria

- ✅ All unused endpoints/functions removed
- ✅ All duplicate endpoints consolidated
- ✅ All documentation updated
- ✅ All tests passing
- ✅ Zero production errors
- ✅ All features working as before
- ✅ Deployment successful
- ✅ User experience unchanged


