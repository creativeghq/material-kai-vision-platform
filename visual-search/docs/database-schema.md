+++
# --- Basic Metadata ---
id = "LLAMA-VISUAL-SEARCH-DB-SCHEMA-V1"
title = "Visual Analysis Database Schema"
context_type = "documentation"
scope = "Database schema design for visual material analysis and search capabilities"
target_audience = ["data-specialist", "dev-python", "lead-backend", "technical-architect"]
granularity = "detailed"
status = "active"
last_updated = "2025-08-28"
tags = ["database", "schema", "visual-analysis", "supabase", "postgresql", "vector-search", "llama-vision", "clip"]
related_context = [
    "visual-search/docs/llama-visual-search-master-plan.md",
    "visual-search/docs/technical-architecture.md",
    "src/integrations/supabase/types.ts"
]
template_schema_doc = ".ruru/templates/toml-md/20_database_schema.README.md"
relevance = "Critical: Defines data storage structure for visual search system"
+++

# Visual Analysis Database Schema

## Overview

This document defines the database schema extensions required for the LLaMA 3.2 Vision + CLIP visual material search system. The schema builds upon the existing Supabase infrastructure while adding specialized tables and functions for visual analysis storage and retrieval.

## Schema Design Principles

- **Extension over Replacement**: Build on existing `materials_catalog` table
- **Vector Optimization**: Efficient storage and search of embeddings
- **Structured Analysis**: Store LLaMA analysis in searchable JSONB format
- **Performance First**: Optimized indexes for multi-modal search
- **Backward Compatibility**: Maintain existing functionality

## Required Extensions

```sql
-- Enable vector operations for embeddings
CREATE EXTENSION IF NOT EXISTS vector;

-- Enable full-text search capabilities
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Enable JSON operations optimization
CREATE EXTENSION IF NOT EXISTS btree_gin;
```

## Core Tables

### 1. Material Visual Analysis Table

**Primary table storing visual analysis results from LLaMA 3.2 Vision and CLIP embeddings.**

```sql
CREATE TABLE material_visual_analysis (
    -- Primary identification
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    material_id UUID NOT NULL REFERENCES materials_catalog(id) ON DELETE CASCADE,
    
    -- LLaMA 3.2 Vision Analysis Results
    material_type TEXT NOT NULL,                    -- Primary material classification
    surface_texture TEXT,                           -- Detailed texture description
    color_description TEXT,                         -- Color analysis
    finish_type TEXT,                              -- Surface finish classification
    pattern_grain TEXT,                            -- Pattern and grain details
    reflectivity TEXT,                             -- Reflectivity characteristics
    visual_characteristics TEXT,                    -- General visual properties
    structural_properties JSONB,                   -- Structured property data
    
    -- LLaMA Analysis Metadata
    llama_model_version TEXT NOT NULL DEFAULT 'meta-llama/Llama-3.2-90B-Vision-Instruct-Turbo',
    llama_analysis_prompt_hash TEXT,               -- Hash of prompt used
    llama_confidence_score FLOAT DEFAULT 0.95,     -- Model confidence
    llama_processing_time_ms INTEGER,              -- Processing duration
    
    -- CLIP Embeddings
    clip_embedding VECTOR(512),                    -- CLIP visual embedding
    clip_model_version TEXT DEFAULT 'clip-vit-base-patch32',
    
    -- Text Embeddings for Hybrid Search
    description_embedding VECTOR(1536),            -- OpenAI embedding of description
    material_type_embedding VECTOR(1536),          -- Embedding of material type
    
    -- Quality and Processing Metadata
    analysis_confidence FLOAT DEFAULT 0.95,        -- Overall analysis confidence
    processing_status TEXT DEFAULT 'completed',    -- Status: pending, processing, completed, failed
    error_message TEXT,                            -- Error details if failed
    
    -- Image Source Information
    source_image_url TEXT,                         -- Original image URL
    source_image_hash TEXT,                        -- Image content hash
    image_dimensions JSONB,                        -- {width: number, height: number}
    
    -- Audit Fields
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID,                               -- User who initiated analysis
    
    -- Constraints
    CONSTRAINT valid_confidence_score CHECK (analysis_confidence >= 0 AND analysis_confidence <= 1),
    CONSTRAINT valid_llama_confidence CHECK (llama_confidence_score >= 0 AND llama_confidence_score <= 1),
    CONSTRAINT valid_processing_status CHECK (processing_status IN ('pending', 'processing', 'completed', 'failed')),
    CONSTRAINT unique_material_analysis UNIQUE (material_id, source_image_hash)
);
```

### 2. Visual Search History Table

**Track search queries and results for analytics and optimization.**

```sql
CREATE TABLE visual_search_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Search Query Information
    query_image_hash TEXT,                         -- Hash of query image
    query_image_url TEXT,                          -- Temporary query image URL
    search_type TEXT NOT NULL,                     -- 'visual', 'hybrid', 'semantic'
    
    -- Search Parameters
    search_filters JSONB,                          -- Applied filters
    similarity_threshold FLOAT DEFAULT 0.75,       -- Search threshold
    max_results INTEGER DEFAULT 20,                -- Result limit
    
    -- Query Analysis
    query_llama_analysis JSONB,                   -- LLaMA analysis of query image
    query_clip_embedding VECTOR(512),             -- CLIP embedding of query
    query_description_embedding VECTOR(1536),      -- Text embedding of description
    
    -- Search Results
    result_count INTEGER DEFAULT 0,                -- Number of results returned
    top_similarity_score FLOAT,                   -- Best match score
    average_similarity_score FLOAT,               -- Average score of results
    search_execution_time_ms INTEGER,             -- Search duration
    
    -- User Context
    user_id UUID,                                  -- User who performed search
    session_id TEXT,                               -- User session identifier
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Constraints
    CONSTRAINT valid_search_type CHECK (search_type IN ('visual', 'hybrid', 'semantic', 'structured')),
    CONSTRAINT valid_similarity_threshold CHECK (similarity_threshold >= 0 AND similarity_threshold <= 1)
);
```

### 3. Visual Analysis Processing Queue

**Manage background processing of visual analysis tasks.**

```sql
CREATE TABLE visual_analysis_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Task Information
    material_id UUID NOT NULL REFERENCES materials_catalog(id) ON DELETE CASCADE,
    image_url TEXT NOT NULL,
    image_hash TEXT NOT NULL,
    
    -- Processing Configuration
    analysis_options JSONB DEFAULT '{}',           -- Analysis configuration
    priority INTEGER DEFAULT 5,                    -- Processing priority (1-10)
    
    -- Status Tracking
    status TEXT DEFAULT 'pending',                 -- pending, processing, completed, failed, retrying
    attempts INTEGER DEFAULT 0,                    -- Number of processing attempts
    max_attempts INTEGER DEFAULT 3,                -- Maximum retry attempts
    
    -- Results
    llama_analysis_result JSONB,                  -- LLaMA analysis output
    clip_embedding_result VECTOR(512),            -- CLIP embedding result
    error_details JSONB,                          -- Error information
    
    -- Processing Metadata
    processing_started_at TIMESTAMP WITH TIME ZONE,
    processing_completed_at TIMESTAMP WITH TIME ZONE,
    processing_duration_ms INTEGER,
    worker_instance TEXT,                          -- Processing worker identifier
    
    -- Audit Fields
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID,
    
    -- Constraints
    CONSTRAINT valid_status CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'retrying')),
    CONSTRAINT valid_priority CHECK (priority >= 1 AND priority <= 10),
    CONSTRAINT valid_attempts CHECK (attempts >= 0 AND attempts <= max_attempts)
);
```

## Optimized Indexes

### Performance Indexes for Visual Search

```sql
-- Primary vector similarity search index
CREATE INDEX CONCURRENTLY idx_material_visual_clip_embedding_cosine 
ON material_visual_analysis 
USING ivfflat (clip_embedding vector_cosine_ops)
WITH (lists = 100);

-- Alternative distance metrics for experimentation
CREATE INDEX CONCURRENTLY idx_material_visual_clip_embedding_l2 
ON material_visual_analysis 
USING ivfflat (clip_embedding vector_l2_ops)
WITH (lists = 100);

-- Text embedding index for hybrid search
CREATE INDEX CONCURRENTLY idx_material_visual_description_embedding 
ON material_visual_analysis 
USING ivfflat (description_embedding vector_cosine_ops)
WITH (lists = 100);

-- Material type embedding for semantic search
CREATE INDEX CONCURRENTLY idx_material_visual_type_embedding 
ON material_visual_analysis 
USING ivfflat (material_type_embedding vector_cosine_ops)
WITH (lists = 100);
```

### Structured Data Indexes

```sql
-- GIN index for JSONB structured properties search
CREATE INDEX CONCURRENTLY idx_material_visual_structural_properties 
ON material_visual_analysis 
USING gin (structural_properties);

-- Material type classification index
CREATE INDEX CONCURRENTLY idx_material_visual_type 
ON material_visual_analysis (material_type);

-- Composite index for filtered searches
CREATE INDEX CONCURRENTLY idx_material_visual_type_confidence 
ON material_visual_analysis (material_type, analysis_confidence DESC)
WHERE analysis_confidence >= 0.8;

-- Full-text search index for descriptions
CREATE INDEX CONCURRENTLY idx_material_visual_descriptions_fulltext 
ON material_visual_analysis 
USING gin (to_tsvector('english', 
    COALESCE(surface_texture, '') || ' ' || 
    COALESCE(color_description, '') || ' ' || 
    COALESCE(visual_characteristics, '')
));
```

### Maintenance and Queue Indexes

```sql
-- Processing queue status index
CREATE INDEX CONCURRENTLY idx_visual_queue_status_priority 
ON visual_analysis_queue (status, priority DESC, created_at);

-- Material lookup index
CREATE INDEX CONCURRENTLY idx_material_visual_material_id 
ON material_visual_analysis (material_id);

-- Search history analytics index
CREATE INDEX CONCURRENTLY idx_visual_search_created_type 
ON visual_search_history (created_at DESC, search_type);

-- Image hash lookup for deduplication
CREATE INDEX CONCURRENTLY idx_material_visual_image_hash 
ON material_visual_analysis (source_image_hash);
```

## Custom Search Functions

### 1. Multi-Modal Visual Search Function

```sql
CREATE OR REPLACE FUNCTION visual_material_search(
    query_clip_embedding vector(512),
    query_description_embedding vector(1536) DEFAULT NULL,
    material_type_filter text DEFAULT NULL,
    structural_filters jsonb DEFAULT NULL,
    similarity_threshold float DEFAULT 0.75,
    description_weight float DEFAULT 0.3,
    visual_weight float DEFAULT 0.7,
    result_limit int DEFAULT 20
) RETURNS TABLE (
    material_id uuid,
    visual_similarity_score float,
    description_similarity_score float,
    combined_score float,
    material_type text,
    visual_properties jsonb,
    confidence_score float,
    material_name text,
    material_description text
) AS $$
BEGIN
    RETURN QUERY
    WITH visual_scores AS (
        SELECT 
            mva.material_id,
            mva.material_type,
            mva.structural_properties as visual_properties,
            mva.analysis_confidence as confidence_score,
            (1 - (mva.clip_embedding <=> query_clip_embedding)) as visual_sim,
            CASE 
                WHEN query_description_embedding IS NOT NULL 
                THEN (1 - (mva.description_embedding <=> query_description_embedding))
                ELSE 0.5
            END as description_sim
        FROM material_visual_analysis mva
        WHERE 
            mva.analysis_confidence >= 0.8
            AND (material_type_filter IS NULL OR mva.material_type = material_type_filter)
            AND (structural_filters IS NULL OR mva.structural_properties @> structural_filters)
            AND (1 - (mva.clip_embedding <=> query_clip_embedding)) >= similarity_threshold
    )
    SELECT 
        vs.material_id,
        vs.visual_sim as visual_similarity_score,
        vs.description_sim as description_similarity_score,
        (vs.visual_sim * visual_weight + vs.description_sim * description_weight) as combined_score,
        vs.material_type,
        vs.visual_properties,
        vs.confidence_score,
        mc.name as material_name,
        mc.description as material_description
    FROM visual_scores vs
    JOIN materials_catalog mc ON vs.material_id = mc.id
    ORDER BY combined_score DESC
    LIMIT result_limit;
END;
$$ LANGUAGE plpgsql;
```

### 2. Similar Materials Recommendation Function

```sql
CREATE OR REPLACE FUNCTION get_similar_materials(
    source_material_id uuid,
    similarity_threshold float DEFAULT 0.8,
    result_limit int DEFAULT 10
) RETURNS TABLE (
    material_id uuid,
    similarity_score float,
    material_type text,
    material_name text,
    visual_properties jsonb
) AS $$
BEGIN
    RETURN QUERY
    WITH source_embedding AS (
        SELECT clip_embedding, material_type as source_type
        FROM material_visual_analysis 
        WHERE material_id = source_material_id
    )
    SELECT 
        mva.material_id,
        (1 - (mva.clip_embedding <=> se.clip_embedding)) as similarity_score,
        mva.material_type,
        mc.name as material_name,
        mva.structural_properties as visual_properties
    FROM material_visual_analysis mva
    CROSS JOIN source_embedding se
    JOIN materials_catalog mc ON mva.material_id = mc.id
    WHERE 
        mva.material_id != source_material_id
        AND (1 - (mva.clip_embedding <=> se.clip_embedding)) >= similarity_threshold
        AND mva.analysis_confidence >= 0.8
    ORDER BY similarity_score DESC
    LIMIT result_limit;
END;
$$ LANGUAGE plpgsql;
```

### 3. Visual Analysis Statistics Function

```sql
CREATE OR REPLACE FUNCTION get_visual_analysis_stats()
RETURNS TABLE (
    total_analyzed_materials bigint,
    avg_confidence_score float,
    material_type_breakdown jsonb,
    processing_performance jsonb,
    embedding_coverage jsonb
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        COUNT(*) as total_analyzed_materials,
        AVG(analysis_confidence) as avg_confidence_score,
        jsonb_object_agg(
            material_type, 
            type_count
        ) as material_type_breakdown,
        jsonb_build_object(
            'avg_processing_time_ms', AVG(llama_processing_time_ms),
            'success_rate', 
            COUNT(*) FILTER (WHERE processing_status = 'completed')::float / COUNT(*)
        ) as processing_performance,
        jsonb_build_object(
            'clip_embedding_coverage', 
            COUNT(*) FILTER (WHERE clip_embedding IS NOT NULL)::float / COUNT(*),
            'description_embedding_coverage',
            COUNT(*) FILTER (WHERE description_embedding IS NOT NULL)::float / COUNT(*)
        ) as embedding_coverage
    FROM (
        SELECT 
            *,
            COUNT(*) OVER (PARTITION BY material_type) as type_count
        FROM material_visual_analysis
    ) stats;
END;
$$ LANGUAGE plpgsql;
```

## Migration Strategy

### 1. Initial Migration (Phase 1)

```sql
-- Migration: Add visual analysis tables
-- Version: 2025_08_28_001_add_visual_analysis

BEGIN;

-- Create the main visual analysis table
CREATE TABLE material_visual_analysis (
    -- [Full table definition from above]
);

-- Create initial indexes for immediate functionality
CREATE INDEX idx_material_visual_material_id 
ON material_visual_analysis (material_id);

CREATE INDEX idx_material_visual_type 
ON material_visual_analysis (material_type);

-- Create processing queue table
CREATE TABLE visual_analysis_queue (
    -- [Full table definition from above]
);

-- Create queue management indexes
CREATE INDEX idx_visual_queue_status_priority 
ON visual_analysis_queue (status, priority DESC, created_at);

COMMIT;
```

### 2. Vector Optimization Migration (Phase 2)

```sql
-- Migration: Add vector indexes
-- Version: 2025_08_28_002_add_vector_indexes

BEGIN;

-- Add vector indexes (done concurrently to avoid blocking)
CREATE INDEX CONCURRENTLY idx_material_visual_clip_embedding_cosine 
ON material_visual_analysis 
USING ivfflat (clip_embedding vector_cosine_ops)
WITH (lists = 100);

CREATE INDEX CONCURRENTLY idx_material_visual_description_embedding 
ON material_visual_analysis 
USING ivfflat (description_embedding vector_cosine_ops)
WITH (lists = 100);

COMMIT;
```

### 3. Search Functions Migration (Phase 3)

```sql
-- Migration: Add search functions
-- Version: 2025_08_28_003_add_search_functions

BEGIN;

-- Create visual search function
CREATE OR REPLACE FUNCTION visual_material_search(
    -- [Full function definition from above]
);

-- Create similarity recommendation function
CREATE OR REPLACE FUNCTION get_similar_materials(
    -- [Full function definition from above]
);

-- Create analytics function
CREATE OR REPLACE FUNCTION get_visual_analysis_stats()
-- [Full function definition from above]

COMMIT;
```

## Data Types and Constraints

### TypeScript Interface Definitions

```typescript
// Core visual analysis record
interface MaterialVisualAnalysis {
  id: string;
  material_id: string;
  
  // LLaMA Analysis
  material_type: string;
  surface_texture?: string;
  color_description?: string;
  finish_type?: string;
  pattern_grain?: string;
  reflectivity?: string;
  visual_characteristics?: string;
  structural_properties?: Record<string, any>;
  
  // Model metadata
  llama_model_version: string;
  llama_analysis_prompt_hash?: string;
  llama_confidence_score: number;
  llama_processing_time_ms?: number;
  
  // Embeddings
  clip_embedding?: number[];
  clip_model_version?: string;
  description_embedding?: number[];
  material_type_embedding?: number[];
  
  // Quality metrics
  analysis_confidence: number;
  processing_status: 'pending' | 'processing' | 'completed' | 'failed';
  error_message?: string;
  
  // Source information
  source_image_url?: string;
  source_image_hash?: string;
  image_dimensions?: { width: number; height: number };
  
  // Audit
  created_at: string;
  updated_at: string;
  created_by?: string;
}

// Search result type
interface VisualSearchResult {
  material_id: string;
  visual_similarity_score: number;
  description_similarity_score?: number;
  combined_score: number;
  material_type: string;
  visual_properties: Record<string, any>;
  confidence_score: number;
  material_name: string;
  material_description: string;
}
```

## Performance Considerations

### 1. Vector Index Tuning

```sql
-- Adjust lists parameter based on dataset size
-- For datasets with:
-- < 1K materials: lists = 10
-- 1K - 10K materials: lists = 100
-- 10K - 100K materials: lists = 1000
-- > 100K materials: lists = 10000

-- Monitor index performance
SELECT 
    schemaname,
    tablename,
    indexname,
    idx_tup_read,
    idx_tup_fetch,
    idx_tup_read / NULLIF(idx_tup_fetch, 0) as selectivity
FROM pg_stat_user_indexes 
WHERE indexname LIKE 'idx_material_visual%';
```

### 2. Maintenance Scripts

```sql
-- Vacuum and analyze for vector indexes
VACUUM ANALYZE material_visual_analysis;

-- Update table statistics
ANALYZE material_visual_analysis;

-- Check index usage
SELECT 
    indexname,
    idx_scan,
    idx_tup_read,
    idx_tup_fetch
FROM pg_stat_user_indexes 
WHERE tablename = 'material_visual_analysis';
```

### 3. Monitoring Queries

```sql
-- Monitor search performance
SELECT 
    avg(search_execution_time_ms) as avg_search_time,
    percentile_cont(0.95) WITHIN GROUP (ORDER BY search_execution_time_ms) as p95_search_time,
    count(*) as total_searches
FROM visual_search_history 
WHERE created_at >= NOW() - INTERVAL '24 hours';

-- Monitor processing queue health
SELECT 
    status,
    count(*) as count,
    avg(processing_duration_ms) as avg_processing_time
FROM visual_analysis_queue 
GROUP BY status;
```

## Backup and Recovery

### Critical Data Backup

```sql
-- Backup visual analysis data
pg_dump --table=material_visual_analysis \
        --table=visual_search_history \
        --table=visual_analysis_queue \
        material_kai_platform > visual_analysis_backup.sql

-- Backup vector indexes separately (they can be rebuilt)
pg_dump --schema-only --table=material_visual_analysis \
        material_kai_platform > visual_analysis_schema.sql
```

### Recovery Procedures

1. **Index Rebuild**: Vector indexes can be rebuilt from data
2. **Embedding Regeneration**: CLIP embeddings can be regenerated from source images
3. **LLaMA Analysis Recovery**: May require re-processing with API calls

---

**Document Status**: Active Database Schema Definition  
**Last Updated**: 2025-08-28  
**Next Review**: After Phase 1 implementation and testing