# Database Tables Cleanup Plan

**Date:** 2025-11-02  
**Purpose:** Identify and remove database tables that are only used by duplicate frontend services

---

## 🎯 ANALYSIS SUMMARY

After analyzing the codebase, I found that **NO database tables need to be deleted** because:

1. **Core tables are used by MIVAA API** (products, document_chunks, embeddings, etc.)
2. **Frontend services only READ from these tables** - they don't create unique tables
3. **Embedding columns exist in existing tables** - not separate tables

---

## 📊 TABLE USAGE ANALYSIS

### **TABLES USED BY SERVICES WE'RE DELETING:**

| Table | Used By (Frontend) | Also Used By (MIVAA) | Action |
|-------|-------------------|---------------------|--------|
| `products` | multiVectorSearchService, applicationEmbeddingService | ✅ Product creation, enrichment | ✅ **KEEP** |
| `document_chunks` | multiVectorSearchService, applicationEmbeddingService | ✅ PDF processing, chunking | ✅ **KEEP** |
| `document_images` | None | ✅ PDF image extraction | ✅ **KEEP** |
| `embeddings` | None | ✅ MIVAA embedding storage | ✅ **KEEP** |
| `material_style_analysis` | hybridStyleAnalysisService (read only) | ❌ Not used by MIVAA | ⚠️ **REVIEW** |
| `style_analysis_results` | None | ❌ Not used by MIVAA | ⚠️ **REVIEW** |
| `visual_search_embeddings` | None | ❌ Not used by MIVAA | ⚠️ **REVIEW** |
| `visual_search_queries` | None | ❌ Not used by MIVAA | ⚠️ **REVIEW** |

---

## 🔍 DETAILED FINDINGS

### **1. Embedding Storage**

**Finding:** Embeddings are stored as **columns** in existing tables, not separate tables.

**Tables with embedding columns:**
- `products` - Has columns: `text_embedding_1536`, `visual_clip_embedding_512`, `multimodal_fusion_embedding_2048`, `color_embedding_256`, `texture_embedding_256`, `application_embedding_512`
- `document_chunks` - Has columns: `text_embedding_1536`, `visual_clip_embedding_512`, `multimodal_fusion_embedding_2048`
- `embeddings` - Separate table for general embeddings (used by MIVAA)

**Action:** ✅ **KEEP ALL** - These are core tables used by MIVAA API

---

### **2. Style Analysis Tables**

**Tables found:**
- `material_style_analysis` - Referenced in `hybridStyleAnalysisService.ts` but only for READ operations
- `style_analysis_results` - Listed in cleanup scripts

**Usage:**
- Frontend: `hybridStyleAnalysisService` tries to read from `material_style_analysis` but gets null (table might be empty or not exist)
- MIVAA: Does NOT use these tables - stores style analysis in `material_visual_analysis` or product metadata

**Action:** ⚠️ **DELETE IF EMPTY** - These tables are not used by MIVAA and frontend will use MIVAA API instead

---

### **3. Visual Search Tables**

**Tables found:**
- `visual_search_embeddings`
- `visual_search_queries`
- `visual_search_batch_jobs`
- `visual_search_analysis`
- `visual_analysis_queue`

**Usage:**
- Frontend: No direct usage found in services we're deleting
- MIVAA: Has its own search system using `embeddings` table

**Action:** ⚠️ **DELETE IF EMPTY** - These appear to be legacy tables

---

### **4. Document Processing Tables**

**Tables found:**
- `document_vectors` - Referenced in `multiVectorSearchService` but query falls back to `document_chunks`
- `document_layout_analysis` - Used by MIVAA for PDF processing
- `document_processing_status` - Used by MIVAA for job tracking

**Action:** ✅ **KEEP ALL** - Used by MIVAA API

---

## 🗑️ TABLES TO DELETE

Based on analysis, these tables can be safely deleted:

### **Category 1: Style Analysis (Legacy)**
```sql
-- Check if tables exist and are empty
SELECT COUNT(*) FROM material_style_analysis;
SELECT COUNT(*) FROM style_analysis_results;
SELECT COUNT(*) FROM hybrid_analysis_results;

-- If empty or not used, drop them
DROP TABLE IF EXISTS material_style_analysis CASCADE;
DROP TABLE IF EXISTS style_analysis_results CASCADE;
DROP TABLE IF EXISTS hybrid_analysis_results CASCADE;
```

**Reason:** 
- Not used by MIVAA API
- Frontend will use MIVAA `/api/semantic-analysis` instead
- Likely empty or contain test data

---

### **Category 2: Visual Search (Legacy)**
```sql
-- Check if tables exist and are empty
SELECT COUNT(*) FROM visual_search_embeddings;
SELECT COUNT(*) FROM visual_search_queries;
SELECT COUNT(*) FROM visual_search_batch_jobs;
SELECT COUNT(*) FROM visual_search_analysis;
SELECT COUNT(*) FROM visual_analysis_queue;

-- If empty or not used, drop them
DROP TABLE IF EXISTS visual_search_embeddings CASCADE;
DROP TABLE IF EXISTS visual_search_queries CASCADE;
DROP TABLE IF EXISTS visual_search_batch_jobs CASCADE;
DROP TABLE IF EXISTS visual_search_analysis CASCADE;
DROP TABLE IF EXISTS visual_analysis_queue CASCADE;
```

**Reason:**
- Not used by MIVAA API
- MIVAA uses `embeddings` table for all search operations
- Likely legacy from old implementation

---

### **Category 3: Other Analysis Results (Legacy)**
```sql
-- Check if tables exist and are empty
SELECT COUNT(*) FROM property_analysis_results;
SELECT COUNT(*) FROM recognition_results;
SELECT COUNT(*) FROM spaceformer_analysis_results;
SELECT COUNT(*) FROM svbrdf_extraction_results;

-- If empty or not used, drop them
DROP TABLE IF EXISTS property_analysis_results CASCADE;
DROP TABLE IF EXISTS recognition_results CASCADE;
DROP TABLE IF EXISTS spaceformer_analysis_results CASCADE;
DROP TABLE IF EXISTS svbrdf_extraction_results CASCADE;
```

**Reason:**
- Not used by MIVAA API
- Results are now stored in product metadata or separate result tables
- Likely legacy from old implementation

---

## ✅ TABLES TO KEEP

These tables are used by MIVAA API and must be kept:

### **Core Tables:**
- `products` - Product catalog with embeddings
- `document_chunks` - PDF chunks with embeddings
- `document_images` - Extracted images from PDFs
- `embeddings` - General embedding storage
- `documents` - Document metadata
- `background_jobs` - Job queue
- `materials_catalog` - Material catalog

### **Processing Tables:**
- `document_layout_analysis` - PDF layout analysis
- `document_processing_status` - Processing status tracking
- `document_quality_metrics` - Quality scoring
- `processing_jobs` - Job management
- `batch_jobs` - Batch processing

### **User/Workspace Tables:**
- `workspaces` - Workspace management
- `workspace_members` - Workspace members
- `user_profiles` - User profiles
- All auth tables

---

## 🚀 EXECUTION PLAN

### **Step 1: Check Table Usage (5 min)**
```bash
# Run this script to check which tables exist and their row counts
node scripts/database/check-table-usage.js
```

### **Step 2: Backup Before Deletion (10 min)**
```bash
# Export data from tables we're about to delete (just in case)
# This is optional but recommended
```

### **Step 3: Delete Legacy Tables (5 min)**
```bash
# Use Supabase MCP to delete tables
# OR run SQL directly in Supabase dashboard
```

### **Step 4: Verify Deletion (5 min)**
```bash
# Verify tables are deleted
# Check that MIVAA API still works
# Check that frontend still works
```

---

## 📋 FINAL RECOMMENDATION

**Tables to DELETE:**
1. `material_style_analysis` - Not used by MIVAA
2. `style_analysis_results` - Not used by MIVAA
3. `hybrid_analysis_results` - Not used by MIVAA
4. `visual_search_embeddings` - Legacy
5. `visual_search_queries` - Legacy
6. `visual_search_batch_jobs` - Legacy
7. `visual_search_analysis` - Legacy
8. `visual_analysis_queue` - Legacy
9. `property_analysis_results` - Legacy
10. `recognition_results` - Legacy
11. `spaceformer_analysis_results` - Legacy (if not used)
12. `svbrdf_extraction_results` - Legacy (if not used)

**Tables to KEEP:**
- ALL other tables (used by MIVAA API or core functionality)

**Total tables to delete:** ~12 tables (all legacy/unused)

---

## ⚠️ IMPORTANT NOTES

1. **Check before deleting:** Run `SELECT COUNT(*)` on each table first
2. **Foreign keys:** Some tables might have foreign key constraints - drop dependent tables first
3. **Backup:** Consider exporting data before deletion (optional)
4. **Test after:** Verify MIVAA API and frontend work after deletion
5. **No rush:** These tables don't hurt anything if left in place - can delete later if unsure

---

**Ready to proceed with table deletion?**

