# PHASE 2: ADD STORAGE - DETAILED ANALYSIS

**Date**: 2025-10-16  
**Status**: PLANNING  
**Objective**: Add database storage to 52 functions that extract/process but don't store data

---

## 📊 FUNCTIONS WITHOUT STORAGE - CATEGORIZED

### Category 1: Knowledge & Content Analysis (8 functions)
These functions analyze content but don't store results:

1. **analyze-knowledge-content** ✅ ALREADY HAS STORAGE
   - Status: Has `storeKnowledgeAnalysis()` function
   - Stores: Analysis results in knowledge_analysis table

2. **style-analysis** ⚠️ NEEDS VERIFICATION
   - Location: `supabase/functions/style-analysis/index.ts`
   - Analyzes: Color, typography, layout, material aesthetics
   - Should store: Style analysis results

3. **material-properties-analysis** ⚠️ NEEDS VERIFICATION
   - Location: `supabase/functions/material-properties-analysis/index.ts`
   - Analyzes: Material properties and characteristics
   - Should store: Property analysis results

4. **hybrid-material-analysis** ⚠️ NEEDS VERIFICATION
   - Location: `supabase/functions/hybrid-material-analysis/index.ts`
   - Analyzes: Hybrid material combinations
   - Should store: Hybrid analysis results

5. **spaceformer-analysis** ⚠️ NEEDS VERIFICATION
   - Location: `supabase/functions/spaceformer-analysis/index.ts`
   - Analyzes: Space and form analysis
   - Should store: Space analysis results

6. **visual-search-analyze** ⚠️ NEEDS VERIFICATION
   - Location: `supabase/functions/visual-search-analyze/index.ts`
   - Analyzes: Visual search results
   - Should store: Visual analysis results

7. **svbrdf-extractor** ⚠️ NEEDS VERIFICATION
   - Location: `supabase/functions/svbrdf-extractor/index.ts`
   - Extracts: SVBRDF (Spatially-Varying BRDF) data
   - Should store: SVBRDF extraction results

8. **material-recognition** ⚠️ NEEDS VERIFICATION
   - Location: `supabase/functions/material-recognition/index.ts`
   - Recognizes: Material types from images
   - Should store: Recognition results

---

### Category 2: 3D Generation & Processing (5 functions)
These functions generate 3D models but may not store results:

1. **crewai-3d-generation** ⚠️ NEEDS STORAGE
   - Location: `supabase/functions/crewai-3d-generation/index.ts`
   - Functions: `processModelsDirectly()`, `processModelsSequentially()`, `processGeneration()`
   - Generates: 3D models from prompts
   - Should store: Generation results, model URLs, metadata

2. **huggingface-model-trainer** ⚠️ NEEDS VERIFICATION
   - Location: `supabase/functions/huggingface-model-trainer/index.ts`
   - Trains: ML models
   - Should store: Training results, model artifacts

---

### Category 3: Extraction & Categorization (6 functions)
These functions extract data but may not store results:

1. **extract-categories** ⚠️ PARTIAL STORAGE
   - Location: `supabase/functions/extract-categories/index.ts`
   - Functions: `extractCategoriesWithKeywords()`, `extractCategoriesWithPatterns()`
   - Status: Updates documents table with categories
   - Verify: All extraction methods store results

2. **extract-material-knowledge** ⚠️ PARTIAL STORAGE
   - Location: `supabase/functions/extract-material-knowledge/index.ts`
   - Functions: `extractFromText()`, `extractFromImage()`, `extractFromDocument()`, `extractFromUrl()`
   - Status: Has `storeExtractedKnowledge()` function
   - Verify: All extraction methods call storage

3. **extract-structured-metadata** ✅ ALREADY HAS STORAGE
   - Location: `supabase/functions/extract-structured-metadata/index.ts`
   - Status: Stores metadata in documents table

4. **material-scraper** ⚠️ NEEDS VERIFICATION
   - Location: `supabase/functions/material-scraper/index.ts`
   - Scrapes: Material data from websites
   - Should store: Scraped material data

5. **parse-sitemap** ⚠️ NEEDS VERIFICATION
   - Location: `supabase/functions/parse-sitemap/index.ts`
   - Parses: Sitemaps
   - Should store: Parsed sitemap data

6. **scrape-single-page** ⚠️ NEEDS VERIFICATION
   - Location: `supabase/functions/scrape-single-page/index.ts`
   - Scrapes: Single page content
   - Should store: Scraped page data

---

### Category 4: Search & Retrieval (5 functions)
These functions search but may not store results:

1. **document-vector-search** ✅ ALREADY HAS STORAGE
   - Status: Searches existing vectors, doesn't need to store

2. **enhanced-rag-search** ⚠️ NEEDS VERIFICATION
   - Location: `supabase/functions/enhanced-rag-search/index.ts`
   - Searches: RAG documents
   - Should store: Search results/analytics

3. **rag-knowledge-search** ⚠️ NEEDS VERIFICATION
   - Location: `supabase/functions/rag-knowledge-search/index.ts`
   - Searches: Knowledge base
   - Should store: Search results/analytics

4. **unified-material-search** ⚠️ NEEDS VERIFICATION
   - Location: `supabase/functions/unified-material-search/index.ts`
   - Searches: Materials
   - Should store: Search results/analytics

5. **material-images-api** ⚠️ NEEDS VERIFICATION
   - Location: `supabase/functions/material-images-api/index.ts`
   - Retrieves: Material images
   - Should store: Image retrieval analytics

---

### Category 5: Batch Processing (4 functions)
These functions process batches but may not store results:

1. **pdf-batch-process** ⚠️ NEEDS VERIFICATION
   - Location: `supabase/functions/pdf-batch-process/index.ts`
   - Processes: Batch PDF files
   - Should store: Batch processing results

2. **visual-search-batch** ⚠️ NEEDS VERIFICATION
   - Location: `supabase/functions/visual-search-batch/index.ts`
   - Processes: Batch visual searches
   - Should store: Batch search results

3. **scrape-session-manager** ⚠️ NEEDS VERIFICATION
   - Location: `supabase/functions/scrape-session-manager/index.ts`
   - Manages: Scraping sessions
   - Should store: Session data

4. **pdf-integration-health** ⚠️ NEEDS VERIFICATION
   - Location: `supabase/functions/pdf-integration-health/index.ts`
   - Checks: PDF integration health
   - Should store: Health check results

---

### Category 6: Other Processing (5 functions)
Miscellaneous processing functions:

1. **ocr-processing** ⚠️ NEEDS VERIFICATION
   - Location: `supabase/functions/ocr-processing/index.ts`
   - Processes: OCR on images
   - Should store: OCR results

2. **voice-to-material** ⚠️ NEEDS VERIFICATION
   - Location: `supabase/functions/voice-to-material/index.ts`
   - Converts: Voice to material queries
   - Should store: Conversion results

3. **material-agent-orchestrator** ⚠️ NEEDS VERIFICATION
   - Location: `supabase/functions/material-agent-orchestrator/index.ts`
   - Orchestrates: Material agents
   - Should store: Orchestration results

4. **apply-quality-scoring** ⚠️ NEEDS VERIFICATION
   - Location: `supabase/functions/apply-quality-scoring/index.ts`
   - Scores: Quality metrics
   - Should store: Quality scores

5. **build-chunk-relationships** ⚠️ NEEDS VERIFICATION
   - Location: `supabase/functions/build-chunk-relationships/index.ts`
   - Builds: Chunk relationships
   - Should store: Relationship data

---

## 🎯 NEXT STEPS

1. **Verify Each Function** - Check which ones already have storage
2. **Identify Storage Tables** - Determine where each should store data
3. **Implement Storage** - Add database calls to functions without storage
4. **Create Retrieval Endpoints** - Add endpoints to retrieve stored data
5. **Test End-to-End** - Verify data is stored and retrievable

---

## 📋 STORAGE PATTERN

```typescript
// BEFORE (No storage):
async function analyzeContent(content: string) {
  const result = await ai.analyze(content);
  return result; // Data is lost!
}

// AFTER (With storage):
async function analyzeContent(content: string, userId: string) {
  const result = await ai.analyze(content);
  
  // Store the result
  const { data, error } = await supabase
    .from('analysis_results')
    .insert({
      user_id: userId,
      content_hash: hashContent(content),
      result: result,
      created_at: new Date().toISOString(),
    })
    .select()
    .single();
  
  if (error) throw error;
  
  return {
    ...result,
    analysis_id: data.id,
  };
}
```

---

## 📊 ESTIMATED EFFORT

- **Verification**: 2-3 hours
- **Implementation**: 5-7 hours
- **Testing**: 2-3 hours
- **Total**: 9-13 hours

---

**Status**: Ready to begin Phase 2 implementation

