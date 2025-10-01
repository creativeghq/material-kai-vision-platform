# 🗄️ Database Schema Analysis
## Material Kai Vision Platform - Supabase Database

**Analysis Date:** 2025-09-30  
**Database Type:** Supabase (PostgreSQL)  
**Schema Version:** Unknown (No migrations found)

---

## 📊 Executive Summary

### Tables Defined in TypeScript: 14
### Tables Actually Used in Code: ~10
### Missing Tables Referenced: 5
### Migration Files: 0 ⚠️

**Critical Finding:** No migration files exist in `supabase/migrations/` directory. All schema changes are untracked.

---

## 📋 EXISTING TABLES (Defined in types.ts)

### 1. **agent_ml_tasks**
**Purpose:** Track ML operations performed by agents  
**Status:** ✅ Defined in types  
**Usage:** Referenced in agent orchestration  
**Key Fields:**
- `id` (string, PK)
- `agent_task_id` (string, FK)
- `ml_operation_type` (string)
- `ml_results` (Json)
- `confidence_scores` (Json)
- `model_versions` (Json)
- `processing_time_ms` (number)

**Issues:** None identified

---

### 2. **agent_tasks**
**Purpose:** Main task tracking for agent orchestration  
**Status:** ✅ Defined in types  
**Usage:** ✅ Used in `integratedAIService.ts:518`  
**Key Fields:**
- `id` (string, PK)
- `user_id` (string)
- `workspace_id` (string)
- `task_name` (string)
- `task_type` (string)
- `task_status` (string)
- `priority` (string)
- `input_data` (Json)
- `output_data` (Json)
- `progress_percentage` (number)
- `assigned_agent` (string)

**Issues:** None identified

---

### 3. **analytics_events**
**Purpose:** Track user analytics and events  
**Status:** ✅ Defined in types  
**Usage:** Unknown (not found in search)  
**Key Fields:**
- `id` (string, PK)
- `user_id` (string)
- `event_type` (string)
- `event_data` (Json)
- `created_at` (timestamp)

**Issues:** May be unused - needs verification

---

### 4. **api_keys**
**Purpose:** Store API keys for external services  
**Status:** ✅ Defined in types  
**Usage:** ✅ Used in `apiGatewayService.ts:213`  
**Key Fields:**
- `id` (string, PK)
- `user_id` (string)
- `key_name` (string)
- `key_value` (string) ⚠️ Should be encrypted
- `is_active` (boolean)
- `created_at` (timestamp)

**Issues:** 
- ⚠️ **SECURITY:** API keys stored in database (should use secrets manager)
- No encryption mentioned in schema

---

### 5. **api_usage_logs**
**Purpose:** Log API usage for billing/monitoring  
**Status:** ✅ Defined in types  
**Usage:** Unknown  
**Key Fields:**
- `id` (string, PK)
- `user_id` (string)
- `api_endpoint` (string)
- `request_data` (Json)
- `response_status` (number)
- `created_at` (timestamp)

**Issues:** May be unused

---

### 6. **scraped_materials_temp**
**Purpose:** Temporary storage for scraped materials  
**Status:** ✅ Defined in types  
**Usage:** Unknown  
**Key Fields:**
- `id` (string, PK)
- `session_id` (string)
- `material_data` (Json)
- `source_url` (string)
- `created_at` (timestamp)

**Issues:** "temp" suffix suggests this should be cleaned up periodically

---

### 7. **scraping_sessions**
**Purpose:** Track web scraping sessions  
**Status:** ✅ Defined in types  
**Usage:** ✅ Used in scraper components  
**Key Fields:**
- `id` (string, PK)
- `user_id` (string)
- `session_status` (string)
- `target_url` (string)
- `pages_scraped` (number)
- `materials_found` (number)
- `created_at` (timestamp)

**Issues:** None identified

---

### 8. **scraping_pages**
**Purpose:** Track individual pages in scraping sessions  
**Status:** ✅ Defined in types  
**Usage:** ⚠️ **MOCK DATA** in `PageQueueViewer.tsx:75`  
**Key Fields:**
- `id` (string, PK)
- `session_id` (string, FK)
- `url` (string)
- `status` (string)
- `materials_found` (number)
- `error_message` (string)
- `processing_time_ms` (number)

**Issues:** 
- ⚠️ **CRITICAL:** Component uses mock data instead of real queries
- Table may not exist in actual database

---

### 9. **materials_catalog**
**Purpose:** Main materials catalog/database  
**Status:** ✅ Defined in types  
**Usage:** ✅ **HEAVILY USED** across multiple services  
**Key Fields:**
- `id` (string, PK)
- `name` (string)
- `category` (string)
- `description` (text)
- `properties` (Json)
- `image_urls` (Json)
- `created_at` (timestamp)

**Usage Locations:**
- `unified-material-search/index.ts:89`
- `material-recognition/index.ts:502`
- `enhanced-rag-search/index.ts:60`
- Multiple other edge functions

**Issues:** None - Core table

---

### 10. **material_visual_analysis**
**Purpose:** Store visual analysis results for materials  
**Status:** ✅ Defined in types  
**Usage:** ✅ Used in visual search functions  
**Key Fields:**
- `id` (string, PK)
- `material_id` (string, FK)
- `analysis_type` (string)
- `color_analysis` (Json)
- `texture_analysis` (Json)
- `confidence_scores` (Json)
- `created_at` (timestamp)

**Issues:** None identified

---

### 11. **visual_analysis_queue**
**Purpose:** Queue for pending visual analysis jobs  
**Status:** ✅ Defined in types  
**Usage:** ✅ Used in batch processing  
**Key Fields:**
- `id` (string, PK)
- `image_url` (string)
- `status` (string)
- `priority` (number)
- `retry_count` (number)
- `created_at` (timestamp)

**Issues:** None identified

---

### 12. **visual_search_history**
**Purpose:** Track visual search queries  
**Status:** ✅ Defined in types  
**Usage:** ✅ Used in search analytics  
**Key Fields:**
- `id` (string, PK)
- `user_id` (string)
- `query_data` (Json)
- `results_count` (number)
- `search_time_ms` (number)
- `created_at` (timestamp)

**Issues:** None identified

---

### 13. **processing_results**
**Purpose:** Store processing results  
**Status:** ✅ Defined in types  
**Usage:** Unknown  
**Key Fields:**
- `id` (string, PK)
- `task_id` (string)
- `result_data` (Json)
- `status` (string)
- `created_at` (timestamp)

**Issues:** May be unused

---

### 14. **workspaces**
**Purpose:** Multi-tenancy workspace management  
**Status:** ✅ Defined in types  
**Usage:** ✅ Used across platform  
**Key Fields:**
- `id` (string, PK)
- `name` (string)
- `owner_id` (string)
- `created_at` (timestamp)

**Issues:** None identified

---

## ❌ MISSING TABLES (Referenced but not defined)

### 1. **material_agents** ⚠️ CRITICAL
**Referenced In:** `integratedAIService.ts:210`  
**Expected Purpose:** Store agent configurations  
**Impact:** Agent listing features will fail  
**Code:**
```typescript
const { data: agents } = await supabase
  .from('material_agents')
  .select('*');
```

**Fix Required:** Create table or remove feature

---

### 2. **nerf_reconstructions** ⚠️ CRITICAL
**Referenced In:** `integratedAIService.ts:515`  
**Expected Purpose:** Store NeRF 3D reconstruction data  
**Impact:** Analytics will fail  
**Code:**
```typescript
supabase.from('nerf_reconstructions').select('*').eq('user_id', user.id)
```

**Fix Required:** Create table or remove analytics

---

### 3. **svbrdf_extractions** ⚠️ CRITICAL
**Referenced In:** `integratedAIService.ts:516`  
**Expected Purpose:** Store SVBRDF material extraction data  
**Impact:** Analytics will fail  
**Code:**
```typescript
supabase.from('svbrdf_extractions').select('*').eq('user_id', user.id)
```

**Fix Required:** Create table or remove analytics

---

### 4. **spatial_analysis** ⚠️ CRITICAL
**Referenced In:** `integratedAIService.ts:517`  
**Expected Purpose:** Store spatial analysis results  
**Impact:** Analytics will fail  
**Code:**
```typescript
supabase.from('spatial_analysis').select('*').eq('user_id', user.id)
```

**Fix Required:** Create table or remove analytics

---

### 5. **api_endpoints** ⚠️ HIGH
**Referenced In:** `apiGatewayService.ts:80`  
**Expected Purpose:** Store API endpoint configurations  
**Impact:** API gateway management will fail  
**Code:**
```typescript
const { data, error } = await supabase
  .from('api_endpoints')
  .select('*')
```

**Fix Required:** Create table or use static configuration

---

### 6. **internal_networks** ⚠️ MEDIUM
**Referenced In:** `apiGatewayService.ts`  
**Expected Purpose:** Store internal network configurations  
**Impact:** Network access control will fail  

**Fix Required:** Create table or remove feature

---

### 7. **visual_search_analysis** ⚠️ HIGH
**Referenced In:** `visual-search-status/index.ts:133`  
**Expected Purpose:** Store visual search analysis results  
**Impact:** Visual search status checks will fail  

**Fix Required:** Create table

---

### 8. **visual_search_batch_jobs** ⚠️ HIGH
**Referenced In:** `visual-search-status/index.ts:230`  
**Expected Purpose:** Track batch visual search jobs  
**Impact:** Batch processing status will fail  

**Fix Required:** Create table

---

### 9. **visual_search_queries** ⚠️ HIGH
**Referenced In:** `visual-search-query/index.ts:456`  
**Expected Purpose:** Store search query analytics  
**Impact:** Search analytics will fail  

**Fix Required:** Create table

---

### 10. **visual_search_embeddings** ⚠️ CRITICAL
**Referenced In:** `visual-search-query/index.ts:188`  
**Expected Purpose:** Store visual embeddings for similarity search  
**Impact:** **CORE FEATURE** - Visual search will completely fail  
**Code:**
```typescript
let query = supabase
  .from('visual_search_embeddings')
  .select(`
    analysis_id,
    image_url,
    embedding_vector,
    ...
  `);
```

**Fix Required:** **MUST CREATE** - This is a core feature table

---

## 🚨 CRITICAL ISSUES

### 1. **No Migration System** ⚠️ BLOCKER
**Issue:** `supabase/migrations/` directory is empty  
**Impact:**
- No schema version control
- Cannot track changes
- Cannot rollback
- Risk of schema drift between environments

**Fix Required:**
```bash
# Initialize migrations
supabase db diff --schema public > supabase/migrations/001_initial_schema.sql

# For each missing table, create migration
supabase migration new create_missing_tables
```

---

### 2. **Mock Data in Production Code** ⚠️ BLOCKER
**File:** `src/components/Scraper/PageQueueViewer.tsx:75`  
**Issue:** Component uses hardcoded mock data instead of database queries  
**Impact:** Feature appears to work but shows fake data

**Fix Required:** Either:
1. Create `scraping_pages` table and implement real queries
2. Remove the feature entirely

---

### 3. **Missing Core Tables** ⚠️ BLOCKER
**Tables:**
- `visual_search_embeddings` - **CRITICAL** for visual search
- `visual_search_analysis` - Required for search status
- `visual_search_batch_jobs` - Required for batch processing
- `visual_search_queries` - Required for analytics

**Impact:** Visual search (core feature) will completely fail

---

### 4. **API Key Storage Security** ⚠️ SECURITY
**Table:** `api_keys`  
**Issue:** API keys stored in database without encryption mentioned  
**Impact:** Security vulnerability

**Fix Required:**
- Use Supabase Vault for secrets
- Or use environment variables only
- Never store API keys in regular database tables

---

## 📊 TABLE USAGE ANALYSIS

### Heavily Used (Core Tables):
1. ✅ `materials_catalog` - Used in 10+ locations
2. ✅ `agent_tasks` - Used in agent orchestration
3. ✅ `workspaces` - Used for multi-tenancy
4. ✅ `scraping_sessions` - Used in scraper

### Moderately Used:
1. ✅ `material_visual_analysis` - Visual search
2. ✅ `visual_analysis_queue` - Batch processing
3. ✅ `visual_search_history` - Analytics

### Potentially Unused:
1. ⚠️ `analytics_events` - No references found
2. ⚠️ `api_usage_logs` - No references found
3. ⚠️ `processing_results` - No references found
4. ⚠️ `scraped_materials_temp` - No references found

**Recommendation:** Audit unused tables and remove if not needed

---

## 🔧 RECOMMENDED ACTIONS

### Immediate (This Week):
1. **Create missing core tables:**
   - `visual_search_embeddings` (CRITICAL)
   - `visual_search_analysis`
   - `visual_search_batch_jobs`
   - `visual_search_queries`

2. **Initialize migration system:**
   ```bash
   supabase db diff --schema public > supabase/migrations/001_initial_schema.sql
   ```

3. **Fix mock data:**
   - Either create `scraping_pages` table or remove feature

### Short Term (This Month):
1. **Create analytics tables:**
   - `nerf_reconstructions`
   - `svbrdf_extractions`
   - `spatial_analysis`

2. **Create management tables:**
   - `api_endpoints`
   - `material_agents`
   - `internal_networks`

3. **Security audit:**
   - Move API keys to Supabase Vault
   - Add encryption for sensitive data
   - Implement Row Level Security (RLS) policies

### Long Term:
1. **Audit unused tables** - Remove if not needed
2. **Add indexes** - Optimize query performance
3. **Add constraints** - Ensure data integrity
4. **Document schema** - Add comments to tables/columns
5. **Implement backups** - Configure automated backups

---

## 📝 MIGRATION SCRIPT TEMPLATE

```sql
-- Migration: Create missing visual search tables
-- Created: 2025-09-30

-- 1. Visual Search Embeddings (CRITICAL)
CREATE TABLE IF NOT EXISTS visual_search_embeddings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  analysis_id UUID REFERENCES material_visual_analysis(id),
  image_url TEXT NOT NULL,
  embedding_vector vector(512), -- Adjust dimension as needed
  analysis_metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Visual Search Analysis
CREATE TABLE IF NOT EXISTS visual_search_analysis (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id),
  workspace_id UUID REFERENCES workspaces(id),
  image_url TEXT NOT NULL,
  color_analysis JSONB,
  texture_analysis JSONB,
  material_classification JSONB,
  confidence_scores JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Visual Search Batch Jobs
CREATE TABLE IF NOT EXISTS visual_search_batch_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id TEXT UNIQUE NOT NULL,
  user_id UUID REFERENCES auth.users(id),
  status TEXT NOT NULL DEFAULT 'pending',
  total_items INTEGER DEFAULT 0,
  processed_items INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);

-- 4. Visual Search Queries
CREATE TABLE IF NOT EXISTS visual_search_queries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  query_id TEXT UNIQUE NOT NULL,
  user_id UUID REFERENCES auth.users(id),
  workspace_id UUID REFERENCES workspaces(id),
  search_type TEXT NOT NULL,
  query_method TEXT,
  similarity_threshold FLOAT,
  max_results INTEGER,
  distance_metric TEXT,
  matches_found INTEGER,
  average_similarity FLOAT,
  search_time_ms INTEGER,
  applied_filters JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add indexes for performance
CREATE INDEX idx_visual_search_embeddings_analysis_id ON visual_search_embeddings(analysis_id);
CREATE INDEX idx_visual_search_analysis_user_id ON visual_search_analysis(user_id);
CREATE INDEX idx_visual_search_batch_jobs_user_id ON visual_search_batch_jobs(user_id);
CREATE INDEX idx_visual_search_queries_user_id ON visual_search_queries(user_id);

-- Add RLS policies (example)
ALTER TABLE visual_search_embeddings ENABLE ROW LEVEL SECURITY;
ALTER TABLE visual_search_analysis ENABLE ROW LEVEL SECURITY;
ALTER TABLE visual_search_batch_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE visual_search_queries ENABLE ROW LEVEL SECURITY;
```

---

*Generated: 2025-09-30*
*Status: Analysis Complete*
*Next Step: Create migration files*

