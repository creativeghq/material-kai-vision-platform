# PHASE 2 STEP 2: IMPLEMENT STORAGE - TIER 3 PLAN

**Date**: 2025-10-16  
**Status**: ANALYSIS COMPLETE  
**Tier**: BATCH & SEARCH (8 functions)

---

## 📊 TIER 3 FUNCTIONS ANALYSIS

### 1. ❌ visual-search-batch - NEEDS STORAGE
**Location**: `supabase/functions/visual-search-batch/index.ts`  
**Status**: NO STORAGE - NEEDS IMPLEMENTATION

**Current Issue**:
- Creates batch jobs but doesn't store batch job metadata
- Returns batch_id but no persistent storage

**Storage Target**: `visual_search_batch_jobs` table

**What to Store**:
- user_id
- input_data (JSONB - items, batch_settings, notification_webhook)
- result_data (JSONB - batch_metadata, processing_details)
- confidence_score (average of all items)
- processing_time_ms

---

### 2. ❌ scrape-session-manager - NEEDS STORAGE
**Location**: `supabase/functions/scrape-session-manager/index.ts`  
**Status**: PARTIAL - Updates scraping_sessions but needs result storage

**Current Issue**:
- Updates session status but doesn't store final results
- Processes pages but doesn't aggregate results

**Storage Target**: `scraping_sessions` table (already exists, needs enhancement)

**What to Store**:
- Session metadata
- Processing results
- Page processing results
- Error tracking

---

### 3. ❌ pdf-integration-health - NEEDS STORAGE
**Location**: `supabase/functions/pdf-integration-health/index.ts`  
**Status**: PARTIAL - Calls logHealthCheck but needs verification

**Current Issue**:
- Performs health checks but storage implementation unclear
- Need to verify logHealthCheck function

**Storage Target**: `pdf_integration_health_results` table

**What to Store**:
- Health check results
- Service status (MIVAA, Supabase, Integration)
- Metrics (requests, success rate, response time)
- Timestamp

---

### 4. ❌ enhanced-rag-search - NEEDS STORAGE
**Location**: `supabase/functions/enhanced-rag-search/index.ts`  
**Status**: NO STORAGE - NEEDS IMPLEMENTATION

**Current Issue**:
- Performs search but doesn't store search results
- Returns results directly

**Storage Target**: `search_analytics` table

**What to Store**:
- user_id
- query
- search_type
- results
- processing_time_ms

---

### 5. ❌ rag-knowledge-search - NEEDS STORAGE
**Location**: `supabase/functions/rag-knowledge-search/index.ts`  
**Status**: NO STORAGE - NEEDS IMPLEMENTATION

**Current Issue**:
- Performs unified vector search but doesn't store results
- Returns results directly

**Storage Target**: `search_analytics` table

**What to Store**:
- user_id
- query
- search_type
- results
- processing_time_ms

---

### 6. ❌ unified-material-search - NEEDS STORAGE
**Location**: `supabase/functions/unified-material-search/index.ts`  
**Status**: NO STORAGE - NEEDS IMPLEMENTATION

**Current Issue**:
- Performs unified search but doesn't store results
- Returns results directly

**Storage Target**: `search_analytics` table

**What to Store**:
- user_id
- query
- search_type
- results
- processing_time_ms

---

### 7. ❌ material-images-api - NEEDS STORAGE
**Location**: `supabase/functions/material-images-api/index.ts`  
**Status**: NO STORAGE - NEEDS IMPLEMENTATION

**Current Issue**:
- Returns material images but doesn't store query results
- Returns results directly

**Storage Target**: `search_analytics` table

**What to Store**:
- user_id
- query
- search_type
- results
- processing_time_ms

---

### 8. ❌ huggingface-model-trainer - NEEDS STORAGE
**Location**: `supabase/functions/huggingface-model-trainer/index.ts`  
**Status**: NO STORAGE - NEEDS IMPLEMENTATION

**Current Issue**:
- Trains models but doesn't store training results
- Returns results directly

**Storage Target**: `ml_training_jobs` table

**What to Store**:
- user_id
- input_data (JSONB - model_name, dataset, hyperparameters)
- result_data (JSONB - training_results, metrics, model_path)
- confidence_score (accuracy/loss)
- processing_time_ms

---

## 🔧 IMPLEMENTATION PRIORITY

1. **visual-search-batch** - Add batch job storage (10 min)
2. **scrape-session-manager** - Enhance session storage (10 min)
3. **pdf-integration-health** - Verify/add health check storage (10 min)
4. **enhanced-rag-search** - Add search result storage (10 min)
5. **rag-knowledge-search** - Add search result storage (10 min)
6. **unified-material-search** - Add search result storage (10 min)
7. **material-images-api** - Add search result storage (10 min)
8. **huggingface-model-trainer** - Add training result storage (10 min)

**Total Estimated Time**: 1.5-2 hours

---

## 📋 IMPLEMENTATION STEPS

### Step 1: visual-search-batch
- Add storage call after batch creation
- Store batch metadata and settings
- Return batch_id with storage confirmation

### Step 2: scrape-session-manager
- Enhance session result storage
- Store final processing results
- Track page processing metrics

### Step 3: pdf-integration-health
- Verify logHealthCheck implementation
- Add storage if missing
- Store health metrics

### Step 4-7: Search Functions
- Add storage calls before return statements
- Store search queries and results
- Track search performance metrics

### Step 8: huggingface-model-trainer
- Add storage call after training
- Store training results and metrics
- Track model performance

---

## ✨ SUCCESS CRITERIA

- [ ] visual-search-batch stores batch jobs
- [ ] scrape-session-manager stores session results
- [ ] pdf-integration-health stores health checks
- [ ] enhanced-rag-search stores search results
- [ ] rag-knowledge-search stores search results
- [ ] unified-material-search stores search results
- [ ] material-images-api stores search results
- [ ] huggingface-model-trainer stores training results
- [ ] All functions return storage IDs
- [ ] Error handling for storage failures

---

## 🚀 NEXT STEPS

1. Implement storage in all 8 Tier 3 functions
2. Test each function
3. Move to Step 3: Create Retrieval Endpoints

---

**Status**: READY TO IMPLEMENT  
**Estimated Time**: 1.5-2 hours

