# 🗑️ DATABASE CLEANUP PLAN

**Date**: 2025-10-16  
**Status**: Ready for Implementation  
**Priority**: HIGH - Clean database before proceeding

---

## 📊 FINDINGS SUMMARY

### ✅ Good News
- All 6 newly created tables ARE being used ✅
- No completely unused new tables ✅
- All functions have storage implemented ✅

### ⚠️ Issues Found
- **4 functions have DUAL STORAGE** (unnecessary duplication)
- **25 unused tables** in database (from original audit)
- **Inconsistent storage patterns** across functions

---

## 🔴 DUAL STORAGE ISSUES

### 1. svbrdf-extractor
**Current Storage**:
- `processing_results` table (original)
- `svbrdf_extraction_results` table (newly added)

**Issue**: Stores same data in 2 tables  
**Solution**: Keep `svbrdf_extraction_results`, remove `processing_results` storage

---

### 2. material-recognition
**Current Storage**:
- `material_recognition_results` table (original)
- `recognition_results` table (newly added)

**Issue**: Stores same data in 2 tables  
**Solution**: Keep `recognition_results`, remove `material_recognition_results` storage

---

### 3. voice-to-material
**Current Storage**:
- `voice_analysis_results` table (original)
- `voice_conversion_results` table (newly added)
- `analytics_events` table (logging)

**Issue**: Stores same data in 2 tables + logging  
**Solution**: Keep `voice_conversion_results`, remove `voice_analysis_results` storage

---

### 4. pdf-integration-health
**Current Storage**:
- `pdf_processing_results` table (original)
- `api_usage_logs` table (logging)
- `pdf_integration_health_results` table (newly added)

**Issue**: Stores same data in 2 tables + logging  
**Solution**: Keep `pdf_integration_health_results`, remove `pdf_processing_results` storage

---

## 🗑️ UNUSED TABLES TO DELETE (25 total)

### MIVAA-related (6 tables)
- mivaa_api_keys
- mivaa_api_usage_logs
- mivaa_api_usage_summary
- mivaa_batch_jobs
- mivaa_batch_jobs_summary
- mivaa_service_health_metrics

### PDF-related (5 tables)
- pdf_document_structure
- pdf_documents
- pdf_extracted_images
- pdf_material_correlations
- pdf_processing_tiles

### Legacy/Unused (14 tables)
- api_access_control
- image_text_associations
- images
- knowledge_entries
- material_knowledge
- material_metafield_values
- material_relationships
- mivaa_processing_results
- mivaa_processing_results_summary
- mivaa_rag_documents
- profiles
- semantic_similarity_cache
- user_roles
- visual_search_history

---

## 📋 CLEANUP STEPS

### Step 1: Remove Dual Storage (4 functions)
1. **svbrdf-extractor**: Remove `processing_results` storage call
2. **material-recognition**: Remove `material_recognition_results` storage call
3. **voice-to-material**: Remove `voice_analysis_results` storage call
4. **pdf-integration-health**: Remove `pdf_processing_results` storage call

**Time**: 30 minutes

### Step 2: Delete Unused Tables (25 tables)
1. Create backup SQL script
2. Delete tables from database
3. Verify no code references remain

**Time**: 30 minutes

### Step 3: Update TypeScript Types
1. Remove type definitions for deleted tables
2. Remove unused interfaces
3. Update imports

**Time**: 30 minutes

### Step 4: Verify & Test
1. Run codebase analysis to confirm no references
2. Test all functions still work
3. Verify database integrity

**Time**: 30 minutes

---

## 🎯 EXPECTED OUTCOME

**Before Cleanup**:
- 68 tables in database
- 4 functions with dual storage
- 25 unused tables
- Inconsistent storage patterns

**After Cleanup**:
- 43 tables in database (68 - 25 = 43)
- 0 functions with dual storage
- 0 unused tables
- Consistent storage patterns
- Clean, maintainable database

---

## ⚠️ IMPORTANT NOTES

1. **Backup First**: Create backup before deleting tables
2. **Verify References**: Ensure no code references deleted tables
3. **Test Thoroughly**: Test all functions after cleanup
4. **Document Changes**: Update documentation with new schema

---

## 🚀 NEXT STEPS

1. Approve cleanup plan
2. Execute Step 1: Remove dual storage
3. Execute Step 2: Delete unused tables
4. Execute Step 3: Update types
5. Execute Step 4: Verify & test

**Estimated Total Time**: 2 hours

---

**Status**: Ready for User Approval


