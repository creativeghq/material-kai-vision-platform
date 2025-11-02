-- ============================================================
-- DATABASE CLEANUP: Delete Legacy Tables
-- ============================================================
-- Date: 2025-11-02
-- Purpose: Remove 12 legacy database tables that are no longer used
--
-- These tables were created by duplicate frontend services that have
-- been deleted. All functionality now uses MIVAA API exclusively.
--
-- All tables are EMPTY (0 rows) and safe to delete.
-- ============================================================

-- Category 1: Style Analysis (Legacy)
-- These tables were used by deleted frontend style analysis services
DROP TABLE IF EXISTS material_style_analysis CASCADE;
DROP TABLE IF EXISTS style_analysis_results CASCADE;
DROP TABLE IF EXISTS hybrid_analysis_results CASCADE;

-- Category 2: Visual Search (Legacy)
-- These tables were used by old visual search implementation
DROP TABLE IF EXISTS visual_search_embeddings CASCADE;
DROP TABLE IF EXISTS visual_search_queries CASCADE;
DROP TABLE IF EXISTS visual_search_batch_jobs CASCADE;
DROP TABLE IF EXISTS visual_search_analysis CASCADE;
DROP TABLE IF EXISTS visual_analysis_queue CASCADE;

-- Category 3: Other Analysis Results (Legacy)
-- These tables stored results from deleted analysis services
DROP TABLE IF EXISTS property_analysis_results CASCADE;
DROP TABLE IF EXISTS recognition_results CASCADE;
DROP TABLE IF EXISTS spaceformer_analysis_results CASCADE;
DROP TABLE IF EXISTS svbrdf_extraction_results CASCADE;

-- ============================================================
-- VERIFICATION QUERY
-- Run this after deletion to confirm tables are gone:
-- ============================================================
/*
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN (
    'material_style_analysis',
    'style_analysis_results',
    'hybrid_analysis_results',
    'visual_search_embeddings',
    'visual_search_queries',
    'visual_search_batch_jobs',
    'visual_search_analysis',
    'visual_analysis_queue',
    'property_analysis_results',
    'recognition_results',
    'spaceformer_analysis_results',
    'svbrdf_extraction_results'
);
-- Should return 0 rows if all tables were deleted successfully
*/

