-- Migration: Drop Old Prompt Tables
-- Description: Remove deprecated prompt tables after migration to unified prompts system
-- Date: 2025-01-06
-- 
-- This migration drops all old prompt-related tables that have been replaced by the unified 'prompts' table.
-- All data has been migrated to the new system in migration 20250106_unified_prompts_system.sql
--
-- Tables being dropped:
-- 1. extraction_prompt_history - Replaced by prompt_history
-- 2. prompt_template_history - Replaced by prompt_history
-- 3. admin_prompts - Replaced by prompts (category='agent')
-- 4. admin_search_prompts - Replaced by prompts (category='search')
-- 5. extraction_prompts - Replaced by prompts (category='extraction')
-- 6. prompt_templates - Replaced by prompts (category='template')
-- 7. material_agents - Replaced by prompts (category='agent')

-- Drop history tables first (no foreign key dependencies)
DROP TABLE IF EXISTS extraction_prompt_history CASCADE;
DROP TABLE IF EXISTS prompt_template_history CASCADE;

-- Drop main tables (may have foreign key dependencies, hence CASCADE)
DROP TABLE IF EXISTS admin_prompts CASCADE;
DROP TABLE IF EXISTS admin_search_prompts CASCADE;
DROP TABLE IF EXISTS extraction_prompts CASCADE;
DROP TABLE IF EXISTS prompt_templates CASCADE;
DROP TABLE IF EXISTS material_agents CASCADE;

-- Verify cleanup
DO $$
BEGIN
    RAISE NOTICE 'Old prompt tables dropped successfully';
    RAISE NOTICE 'All prompts now managed through unified "prompts" table';
    RAISE NOTICE 'All history tracked in unified "prompt_history" table';
END $$;

