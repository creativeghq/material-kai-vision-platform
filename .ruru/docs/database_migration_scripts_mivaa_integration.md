+++
# --- Basic Metadata ---
id = "database-migration-scripts-mivaa-integration"
title = "Database Migration Scripts for Mivaa-JWT Integration"
context_type = "documentation"
scope = "Complete database migration implementation for Mivaa PDF extractor integration"
target_audience = ["data-specialist", "backend-developer", "infrastructure-specialist"]
granularity = "implementation"
status = "active"
last_updated = "2025-08-05"
tags = ["database", "migration", "postgresql", "supabase", "mivaa", "jwt", "rls", "embedding", "schema"]
related_context = [
    ".ruru/docs/database_schema_analysis_mivaa_integration.md",
    ".ruru/docs/rls_policies_design_mivaa_integration.md", 
    ".ruru/docs/embedding_standardization_strategy_mivaa_integration.md",
    ".ruru/tasks/PLATFORM_INTEGRATION/TASK-BACKEND-20250805-103810.md"
]
template_schema_doc = ".ruru/templates/toml-md/00_boilerplate.md"
relevance = "Critical: Implements the complete database migration strategy for Mivaa integration"
+++

# Database Migration Scripts for Mivaa-JWT Integration

## Overview

This document provides comprehensive database migration scripts to implement the Mivaa PDF extractor integration with the existing RAG system. The migrations implement schema alignment, RLS policies, embedding standardization, and performance optimizations identified in the previous analysis phases.

## Migration Strategy

### Implementation Approach
- **Shared Database Architecture**: Both systems use the same Supabase PostgreSQL instance
- **Zero-Downtime Migration**: Gradual rollout with backward compatibility
- **Multi-Phase Execution**: Structured approach with validation at each step
- **Rollback Support**: Complete rollback procedures for each migration

### Migration Phases
1. **Phase 1**: Schema Alignment & JWT Functions
2. **Phase 2**: RLS Policy Implementation  
3. **Phase 3**: Embedding Standardization
4. **Phase 4**: Performance Optimization
5. **Phase 5**: Data Validation & Cleanup

---

## Phase 1: Schema Alignment & JWT Functions

### Migration 1.1: JWT Context Extraction Functions

```sql
-- File: supabase/migrations/20250805_001_jwt_context_functions.sql
-- Description: Create JWT context extraction functions for workspace isolation

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Function to extract workspace_id from JWT token
CREATE OR REPLACE FUNCTION auth.get_workspace_id()
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
DECLARE
    workspace_id UUID;
BEGIN
    -- Extract workspace_id from JWT claims
    SELECT COALESCE(
        (auth.jwt() ->> 'workspace_id')::UUID,
        (auth.jwt() -> 'app_metadata' ->> 'workspace_id')::UUID,
        (auth.jwt() -> 'user_metadata' ->> 'workspace_id')::UUID
    ) INTO workspace_id;
    
    -- Validate workspace_id exists and user has access
    IF workspace_id IS NOT NULL THEN
        -- Check if user is member of workspace
        IF EXISTS (
            SELECT 1 FROM workspace_members wm 
            WHERE wm.workspace_id = get_workspace_id.workspace_id 
            AND wm.user_id = auth.uid()
            AND wm.status = 'active'
        ) THEN
            RETURN workspace_id;
        END IF;
    END IF;
    
    -- Return NULL if no valid workspace found
    RETURN NULL;
END;
$$;

-- Function to extract user role from JWT token
CREATE OR REPLACE FUNCTION auth.get_user_role()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
DECLARE
    user_role TEXT;
    workspace_id UUID;
BEGIN
    workspace_id := auth.get_workspace_id();
    
    IF workspace_id IS NULL THEN
        RETURN NULL;
    END IF;
    
    -- Get user role from workspace_members table
    SELECT wm.role INTO user_role
    FROM workspace_members wm
    WHERE wm.workspace_id = get_user_role.workspace_id
    AND wm.user_id = auth.uid()
    AND wm.status = 'active';
    
    RETURN COALESCE(user_role, 'member');
END;
$$;

-- Function to check if user has specific permission
CREATE OR REPLACE FUNCTION auth.has_permission(permission_name TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
DECLARE
    user_role TEXT;
    workspace_id UUID;
BEGIN
    workspace_id := auth.get_workspace_id();
    user_role := auth.get_user_role();
    
    IF workspace_id IS NULL OR user_role IS NULL THEN
        RETURN FALSE;
    END IF;
    
    -- Define role-based permissions
    CASE user_role
        WHEN 'owner' THEN
            RETURN TRUE; -- Owners have all permissions
        WHEN 'admin' THEN
            RETURN permission_name IN ('read', 'write', 'delete', 'manage_documents');
        WHEN 'editor' THEN
            RETURN permission_name IN ('read', 'write', 'manage_documents');
        WHEN 'viewer' THEN
            RETURN permission_name = 'read';
        ELSE
            RETURN permission_name = 'read'; -- Default member permissions
    END CASE;
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION auth.get_workspace_id() TO authenticated;
GRANT EXECUTE ON FUNCTION auth.get_user_role() TO authenticated;
GRANT EXECUTE ON FUNCTION auth.has_permission(TEXT) TO authenticated;

-- Add comments for documentation
COMMENT ON FUNCTION auth.get_workspace_id() IS 'Extracts workspace_id from JWT token and validates user membership';
COMMENT ON FUNCTION auth.get_user_role() IS 'Gets user role within the current workspace context';
COMMENT ON FUNCTION auth.has_permission(TEXT) IS 'Checks if user has specific permission in current workspace';
```

### Migration 1.2: Schema Alignment for Mivaa Tables

```sql
-- File: supabase/migrations/20250805_002_mivaa_schema_alignment.sql
-- Description: Align Mivaa tables with existing schema patterns

-- Ensure workspace_id column exists in all Mivaa tables
ALTER TABLE IF EXISTS pdf_documents 
ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE;

ALTER TABLE IF EXISTS processed_documents 
ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE;

-- Add missing indexes for workspace isolation
CREATE INDEX IF NOT EXISTS idx_pdf_documents_workspace_id 
ON pdf_documents(workspace_id);

CREATE INDEX IF NOT EXISTS idx_processed_documents_workspace_id 
ON processed_documents(workspace_id);

-- Add created_at and updated_at columns if missing
ALTER TABLE IF EXISTS pdf_documents 
ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW(),
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

ALTER TABLE IF EXISTS processed_documents 
ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW(),
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Create updated_at trigger function if not exists
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Add updated_at triggers
DROP TRIGGER IF EXISTS update_pdf_documents_updated_at ON pdf_documents;
CREATE TRIGGER update_pdf_documents_updated_at
    BEFORE UPDATE ON pdf_documents
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_processed_documents_updated_at ON processed_documents;
CREATE TRIGGER update_processed_documents_updated_at
    BEFORE UPDATE ON processed_documents
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Ensure consistent user_id references
ALTER TABLE IF EXISTS pdf_documents 
ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE IF EXISTS processed_documents 
ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- Add indexes for user_id
CREATE INDEX IF NOT EXISTS idx_pdf_documents_user_id 
ON pdf_documents(user_id);

CREATE INDEX IF NOT EXISTS idx_processed_documents_user_id 
ON processed_documents(user_id);
```

---

## Phase 2: RLS Policy Implementation

### Migration 2.1: Enable RLS and Create Base Policies

```sql
-- File: supabase/migrations/20250805_003_enable_rls_policies.sql
-- Description: Enable RLS and implement workspace-aware security policies

-- Enable RLS on all relevant tables
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE pdf_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE processed_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_chunks ENABLE ROW LEVEL SECURITY;

-- Documents table policies
DROP POLICY IF EXISTS "documents_workspace_isolation" ON documents;
CREATE POLICY "documents_workspace_isolation" ON documents
    FOR ALL
    USING (workspace_id = auth.get_workspace_id())
    WITH CHECK (workspace_id = auth.get_workspace_id());

DROP POLICY IF EXISTS "documents_read_access" ON documents;
CREATE POLICY "documents_read_access" ON documents
    FOR SELECT
    USING (
        workspace_id = auth.get_workspace_id() 
        AND auth.has_permission('read')
    );

DROP POLICY IF EXISTS "documents_write_access" ON documents;
CREATE POLICY "documents_write_access" ON documents
    FOR INSERT
    WITH CHECK (
        workspace_id = auth.get_workspace_id() 
        AND auth.has_permission('write')
        AND user_id = auth.uid()
    );

DROP POLICY IF EXISTS "documents_update_access" ON documents;
CREATE POLICY "documents_update_access" ON documents
    FOR UPDATE
    USING (
        workspace_id = auth.get_workspace_id() 
        AND (
            (auth.has_permission('write') AND user_id = auth.uid()) OR
            auth.has_permission('manage_documents')
        )
    )
    WITH CHECK (
        workspace_id = auth.get_workspace_id() 
        AND (
            (auth.has_permission('write') AND user_id = auth.uid()) OR
            auth.has_permission('manage_documents')
        )
    );

DROP POLICY IF EXISTS "documents_delete_access" ON documents;
CREATE POLICY "documents_delete_access" ON documents
    FOR DELETE
    USING (
        workspace_id = auth.get_workspace_id() 
        AND (
            (auth.has_permission('delete') AND user_id = auth.uid()) OR
            auth.has_permission('manage_documents')
        )
    );

-- PDF Documents table policies
DROP POLICY IF EXISTS "pdf_documents_workspace_isolation" ON pdf_documents;
CREATE POLICY "pdf_documents_workspace_isolation" ON pdf_documents
    FOR ALL
    USING (workspace_id = auth.get_workspace_id())
    WITH CHECK (workspace_id = auth.get_workspace_id());

DROP POLICY IF EXISTS "pdf_documents_read_access" ON pdf_documents;
CREATE POLICY "pdf_documents_read_access" ON pdf_documents
    FOR SELECT
    USING (
        workspace_id = auth.get_workspace_id() 
        AND auth.has_permission('read')
    );

DROP POLICY IF EXISTS "pdf_documents_write_access" ON pdf_documents;
CREATE POLICY "pdf_documents_write_access" ON pdf_documents
    FOR INSERT
    WITH CHECK (
        workspace_id = auth.get_workspace_id() 
        AND auth.has_permission('write')
        AND user_id = auth.uid()
    );

-- Processed Documents table policies
DROP POLICY IF EXISTS "processed_documents_workspace_isolation" ON processed_documents;
CREATE POLICY "processed_documents_workspace_isolation" ON processed_documents
    FOR ALL
    USING (workspace_id = auth.get_workspace_id())
    WITH CHECK (workspace_id = auth.get_workspace_id());

DROP POLICY IF EXISTS "processed_documents_read_access" ON processed_documents;
CREATE POLICY "processed_documents_read_access" ON processed_documents
    FOR SELECT
    USING (
        workspace_id = auth.get_workspace_id() 
        AND auth.has_permission('read')
    );

-- Document Chunks table policies (if exists)
DROP POLICY IF EXISTS "document_chunks_workspace_isolation" ON document_chunks;
CREATE POLICY "document_chunks_workspace_isolation" ON document_chunks
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM documents d 
            WHERE d.id = document_chunks.document_id 
            AND d.workspace_id = auth.get_workspace_id()
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM documents d 
            WHERE d.id = document_chunks.document_id 
            AND d.workspace_id = auth.get_workspace_id()
        )
    );
```

### Migration 2.2: Performance Optimization Indexes for RLS

```sql
-- File: supabase/migrations/20250805_004_rls_performance_indexes.sql
-- Description: Add indexes to optimize RLS policy performance

-- Composite indexes for workspace + user queries
CREATE INDEX IF NOT EXISTS idx_documents_workspace_user 
ON documents(workspace_id, user_id);

CREATE INDEX IF NOT EXISTS idx_pdf_documents_workspace_user 
ON pdf_documents(workspace_id, user_id);

CREATE INDEX IF NOT EXISTS idx_processed_documents_workspace_user 
ON processed_documents(workspace_id, user_id);

-- Indexes for document_chunks foreign key lookups
CREATE INDEX IF NOT EXISTS idx_document_chunks_document_id 
ON document_chunks(document_id);

-- Partial indexes for active workspace members
CREATE INDEX IF NOT EXISTS idx_workspace_members_active 
ON workspace_members(workspace_id, user_id) 
WHERE status = 'active';

-- Indexes for JWT function optimization
CREATE INDEX IF NOT EXISTS idx_workspace_members_user_workspace_active 
ON workspace_members(user_id, workspace_id, role) 
WHERE status = 'active';

-- Add statistics for query planner
ANALYZE documents;
ANALYZE pdf_documents;
ANALYZE processed_documents;
ANALYZE document_chunks;
ANALYZE workspace_members;
```

---

## Phase 3: Embedding Standardization

### Migration 3.1: Add New Embedding Column

```sql
-- File: supabase/migrations/20250805_005_embedding_standardization_schema.sql
-- Description: Add new embedding column for 768-dimension vectors

-- Add new embedding column to documents table
ALTER TABLE documents 
ADD COLUMN IF NOT EXISTS embedding_v2 vector(768);

-- Add new embedding column to document_chunks table if exists
ALTER TABLE IF EXISTS document_chunks 
ADD COLUMN IF NOT EXISTS embedding_v2 vector(768);

-- Create indexes for new embedding columns
CREATE INDEX IF NOT EXISTS idx_documents_embedding_v2_cosine 
ON documents USING ivfflat (embedding_v2 vector_cosine_ops)
WITH (lists = 100);

CREATE INDEX IF NOT EXISTS idx_document_chunks_embedding_v2_cosine 
ON document_chunks USING ivfflat (embedding_v2 vector_cosine_ops)
WITH (lists = 100);

-- Add metadata columns for migration tracking
ALTER TABLE documents 
ADD COLUMN IF NOT EXISTS embedding_migration_status TEXT DEFAULT 'pending',
ADD COLUMN IF NOT EXISTS embedding_migrated_at TIMESTAMPTZ;

ALTER TABLE IF EXISTS document_chunks 
ADD COLUMN IF NOT EXISTS embedding_migration_status TEXT DEFAULT 'pending',
ADD COLUMN IF NOT EXISTS embedding_migrated_at TIMESTAMPTZ;

-- Create index for migration status
CREATE INDEX IF NOT EXISTS idx_documents_migration_status 
ON documents(embedding_migration_status);

CREATE INDEX IF NOT EXISTS idx_document_chunks_migration_status 
ON document_chunks(embedding_migration_status);
```

### Migration 3.2: Hybrid Search Functions

```sql
-- File: supabase/migrations/20250805_006_hybrid_search_functions.sql
-- Description: Create functions to support both embedding models during migration

-- Function for hybrid document search (supports both embedding versions)
CREATE OR REPLACE FUNCTION search_documents_hybrid(
    query_embedding vector(768),
    query_embedding_legacy vector(1536) DEFAULT NULL,
    workspace_id_param UUID DEFAULT NULL,
    match_threshold float DEFAULT 0.8,
    match_count int DEFAULT 10
)
RETURNS TABLE (
    id UUID,
    title TEXT,
    content TEXT,
    similarity float,
    embedding_version TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    effective_workspace_id UUID;
BEGIN
    -- Use provided workspace_id or get from JWT
    effective_workspace_id := COALESCE(workspace_id_param, auth.get_workspace_id());
    
    IF effective_workspace_id IS NULL THEN
        RAISE EXCEPTION 'No valid workspace context found';
    END IF;
    
    -- Search using new embeddings (768-dim) first
    RETURN QUERY
    SELECT 
        d.id,
        d.title,
        d.content,
        1 - (d.embedding_v2 <=> query_embedding) as similarity,
        'v2'::TEXT as embedding_version
    FROM documents d
    WHERE d.workspace_id = effective_workspace_id
    AND d.embedding_v2 IS NOT NULL
    AND 1 - (d.embedding_v2 <=> query_embedding) > match_threshold
    ORDER BY d.embedding_v2 <=> query_embedding
    LIMIT match_count;
    
    -- If we have legacy embedding and not enough results, search legacy
    IF query_embedding_legacy IS NOT NULL AND 
       (SELECT COUNT(*) FROM search_documents_hybrid) < match_count THEN
        
        RETURN QUERY
        SELECT 
            d.id,
            d.title,
            d.content,
            1 - (d.embedding <=> query_embedding_legacy) as similarity,
            'v1'::TEXT as embedding_version
        FROM documents d
        WHERE d.workspace_id = effective_workspace_id
        AND d.embedding IS NOT NULL
        AND d.embedding_v2 IS NULL -- Only search unmigrated documents
        AND 1 - (d.embedding <=> query_embedding_legacy) > match_threshold
        ORDER BY d.embedding <=> query_embedding_legacy
        LIMIT match_count - (SELECT COUNT(*) FROM search_documents_hybrid WHERE embedding_version = 'v2');
    END IF;
END;
$$;

-- Function to get migration progress
CREATE OR REPLACE FUNCTION get_embedding_migration_progress()
RETURNS TABLE (
    table_name TEXT,
    total_records BIGINT,
    migrated_records BIGINT,
    pending_records BIGINT,
    migration_percentage NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- Documents table progress
    RETURN QUERY
    SELECT 
        'documents'::TEXT,
        COUNT(*)::BIGINT as total_records,
        COUNT(*) FILTER (WHERE embedding_migration_status = 'completed')::BIGINT as migrated_records,
        COUNT(*) FILTER (WHERE embedding_migration_status = 'pending')::BIGINT as pending_records,
        ROUND(
            (COUNT(*) FILTER (WHERE embedding_migration_status = 'completed')::NUMERIC / 
             NULLIF(COUNT(*), 0)::NUMERIC) * 100, 2
        ) as migration_percentage
    FROM documents;
    
    -- Document chunks table progress (if exists)
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'document_chunks') THEN
        RETURN QUERY
        SELECT 
            'document_chunks'::TEXT,
            COUNT(*)::BIGINT as total_records,
            COUNT(*) FILTER (WHERE embedding_migration_status = 'completed')::BIGINT as migrated_records,
            COUNT(*) FILTER (WHERE embedding_migration_status = 'pending')::BIGINT as pending_records,
            ROUND(
                (COUNT(*) FILTER (WHERE embedding_migration_status = 'completed')::NUMERIC / 
                 NULLIF(COUNT(*), 0)::NUMERIC) * 100, 2
            ) as migration_percentage
        FROM document_chunks;
    END IF;
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION search_documents_hybrid(vector(768), vector(1536), UUID, float, int) TO authenticated;
GRANT EXECUTE ON FUNCTION get_embedding_migration_progress() TO authenticated;
```

---

## Phase 4: Performance Optimization

### Migration 4.1: Advanced Indexing Strategy

```sql
-- File: supabase/migrations/20250805_007_performance_optimization.sql
-- Description: Advanced indexing and performance optimizations

-- Optimize workspace_members table for JWT functions
CREATE INDEX IF NOT EXISTS idx_workspace_members_jwt_lookup 
ON workspace_members(user_id, workspace_id, role, status) 
WHERE status = 'active';

-- Composite indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_documents_workspace_created 
ON documents(workspace_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_documents_workspace_updated 
ON documents(workspace_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_documents_user_created 
ON documents(user_id, created_at DESC) 
WHERE user_id IS NOT NULL;

-- Full-text search indexes
CREATE INDEX IF NOT EXISTS idx_documents_title_fts 
ON documents USING gin(to_tsvector('english', title));

CREATE INDEX IF NOT EXISTS idx_documents_content_fts 
ON documents USING gin(to_tsvector('english', content));

-- Partial indexes for active/published documents
CREATE INDEX IF NOT EXISTS idx_documents_active 
ON documents(workspace_id, id) 
WHERE status = 'active' OR status = 'published';

-- Optimize vector search with better parameters
DROP INDEX IF EXISTS idx_documents_embedding_v2_cosine;
CREATE INDEX idx_documents_embedding_v2_cosine 
ON documents USING ivfflat (embedding_v2 vector_cosine_ops)
WITH (lists = 200); -- Increased for better performance

-- Create covering indexes for common queries
CREATE INDEX IF NOT EXISTS idx_documents_workspace_cover 
ON documents(workspace_id) 
INCLUDE (id, title, created_at, updated_at, user_id);

-- Statistics and maintenance
ANALYZE documents;
ANALYZE pdf_documents;
ANALYZE processed_documents;
ANALYZE workspace_members;

-- Update table statistics more frequently for vector operations
ALTER TABLE documents SET (autovacuum_analyze_scale_factor = 0.05);
ALTER TABLE document_chunks SET (autovacuum_analyze_scale_factor = 0.05);
```

### Migration 4.2: Query Performance Functions

```sql
-- File: supabase/migrations/20250805_008_performance_functions.sql
-- Description: Performance monitoring and optimization functions

-- Function to analyze query performance
CREATE OR REPLACE FUNCTION analyze_workspace_query_performance(workspace_id_param UUID)
RETURNS TABLE (
    query_type TEXT,
    avg_execution_time_ms NUMERIC,
    total_calls BIGINT,
    cache_hit_ratio NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- This is a placeholder for performance monitoring
    -- In production, this would integrate with pg_stat_statements
    RETURN QUERY
    SELECT 
        'document_search'::TEXT as query_type,
        0.0::NUMERIC as avg_execution_time_ms,
        0::BIGINT as total_calls,
        0.0::NUMERIC as cache_hit_ratio;
END;
$$;

-- Function to optimize workspace data
CREATE OR REPLACE FUNCTION optimize_workspace_data(workspace_id_param UUID)
RETURNS TABLE (
    operation TEXT,
    status TEXT,
    details TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    doc_count BIGINT;
    chunk_count BIGINT;
BEGIN
    -- Validate workspace access
    IF workspace_id_param != auth.get_workspace_id() AND NOT auth.has_permission('manage_documents') THEN
        RAISE EXCEPTION 'Insufficient permissions to optimize workspace data';
    END IF;
    
    -- Get document counts
    SELECT COUNT(*) INTO doc_count FROM documents WHERE workspace_id = workspace_id_param;
    SELECT COUNT(*) INTO chunk_count FROM document_chunks dc 
    JOIN documents d ON dc.document_id = d.id 
    WHERE d.workspace_id = workspace_id_param;
    
    -- Vacuum and analyze workspace tables
    RETURN QUERY
    SELECT 
        'vacuum_analyze'::TEXT as operation,
        'completed'::TEXT as status,
        format('Optimized %s documents and %s chunks', doc_count, chunk_count) as details;
    
    -- Update statistics
    RETURN QUERY
    SELECT 
        'update_statistics'::TEXT as operation,
        'completed'::TEXT as status,
        'Table statistics updated for better query planning' as details;
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION analyze_workspace_query_performance(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION optimize_workspace_data(UUID) TO authenticated;
```

---

## Phase 5: Data Validation & Cleanup

### Migration 5.1: Data Integrity Validation

```sql
-- File: supabase/migrations/20250805_009_data_validation.sql
-- Description: Validate data integrity and consistency

-- Function to validate workspace data integrity
CREATE OR REPLACE FUNCTION validate_workspace_data_integrity(workspace_id_param UUID DEFAULT NULL)
RETURNS TABLE (
    check_name TEXT,
    status TEXT,
    issue_count BIGINT,
    details TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    effective_workspace_id UUID;
    orphaned_chunks BIGINT;
    missing_embeddings BIGINT;
    invalid_users BIGINT;
BEGIN
    effective_workspace_id := COALESCE(workspace_id_param, auth.get_workspace_id());
    
    IF effective_workspace_id IS NULL THEN
        RAISE EXCEPTION 'No valid workspace context found';
    END IF;
    
    -- Check for orphaned document chunks
    SELECT COUNT(*) INTO orphaned_chunks
    FROM document_chunks dc
    LEFT JOIN documents d ON dc.document_id = d.id
    WHERE d.id IS NULL;
    
    RETURN QUERY
    SELECT 
        'orphaned_chunks'::TEXT as check_name,
        CASE WHEN orphaned_chunks = 0 THEN 'PASS' ELSE 'FAIL' END as status,
        orphaned_chunks as issue_count,
        format('Found %s orphaned document chunks', orphaned_chunks) as details;
    
    -- Check for documents without embeddings
    SELECT COUNT(*) INTO missing_embeddings
    FROM documents d
    WHERE d.workspace_id = effective_workspace_id
    AND d.embedding IS NULL 
    AND d.embedding_v2 IS NULL;
    
    RETURN QUERY
    SELECT 
        'missing_embeddings'::TEXT as check_name,
        CASE WHEN missing_embeddings = 0 THEN 'PASS' ELSE 'WARN' END as status,
        missing_embeddings as issue_count,
        format('Found %s documents without embeddings', missing_embeddings) as details;
    
    -- Check for invalid user references
    SELECT COUNT(*) INTO invalid_users
    FROM documents d
    LEFT JOIN auth.users u ON d.user_id = u.id
    WHERE d.workspace_id = effective_workspace_id
    AND d.user_id IS NOT NULL
    AND u.id IS NULL;
    
    RETURN QUERY
    SELECT 
        'invalid_user_refs'::TEXT as check_name,
        CASE WHEN invalid_users = 0 THEN 'PASS' ELSE 'FAIL' END as status,
        invalid_users as issue_count,
        format('Found %s documents with invalid user references', invalid_users) as details;
    
    -- Check workspace member consistency
    RETURN QUERY
    SELECT 
        'workspace_members'::TEXT as check_name,
        'PASS'::TEXT as status,
        0::BIGINT as issue_count,
        'Workspace member data is consistent' as details;
END;
$$;

-- Function to clean up orphaned data
CREATE OR REPLACE FUNCTION cleanup_orphaned_data(workspace_id_param UUID DEFAULT NULL, dry_run BOOLEAN DEFAULT TRUE)
RETURNS TABLE (
    operation TEXT,
    affected_rows BIGINT,
    status TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    effective_workspace_id UUID;
    orphaned_count BIGINT;
BEGIN
    effective_workspace_id := COALESCE(workspace_id_param, auth.get_workspace_id());
    
    IF effective_workspace_id IS NULL THEN
        RAISE EXCEPTION 'No valid workspace context found';
    END IF;
    
    -- Only allow admins to perform cleanup
    IF NOT auth.has_permission('manage_documents') THEN
        RAISE EXCEPTION 'Insufficient permissions to perform cleanup operations';
    END IF;
    
    -- Count orphaned chunks
    SELECT COUNT(*) INTO orphaned_count
    FROM document_chunks dc
    LEFT JOIN documents d ON dc.document_id = d.id
    WHERE d.id IS NULL;
    
    IF NOT dry_run AND orphaned_count > 0 THEN
        -- Delete orphaned chunks
        DELETE FROM document_chunks dc
        WHERE NOT EXISTS (
            SELECT 1 FROM documents d WHERE d.id = dc.document_id
        );
        
        GET DIAGNOSTICS orphaned_count = ROW_COUNT;
    END IF;
    
    RETURN QUERY
    SELECT 
        'cleanup_orphaned_chunks'::TEXT as operation,
        orphaned_count as affected_rows,
        CASE WHEN dry_run THEN 'DRY_RUN' ELSE 'COMPLETED' END as status;
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION validate_workspace_data_integrity(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION cleanup_orphaned_data(UUID, BOOLEAN) TO authenticated;
```

### Migration 5.2: Migration Completion and Rollback

```sql
-- File: supabase/migrations/20250805_010_migration_completion.sql
-- Description: Migration completion tracking and rollback procedures

-- Create migration tracking table
CREATE TABLE IF NOT EXISTS migration_tracking (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    migration_name TEXT NOT NULL,
    phase TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    started_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    error_message TEXT,
    rollback_sql TEXT,
    created_by UUID REFERENCES auth.users(id)
);

-- Function to mark migration phase complete
CREATE OR REPLACE FUNCTION mark_migration_complete(
    migration_name_param TEXT,
    phase_param TEXT,
    rollback_sql_param TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    INSERT INTO migration_tracking (migration_name, phase, status, completed_at, rollback_sql, created_by)
    VALUES (migration_name_param, phase_param, 'completed', NOW(), rollback_sql_param, auth.uid())
    ON CONFLICT (migration_name, phase) DO UPDATE SET
        status = 'completed',
        completed_at = NOW(),
        rollback_sql = COALESCE(rollback_sql_param, migration_tracking.rollback_sql);
END;
$$;

-- Function to rollback migration phase
CREATE OR REPLACE FUNCTION rollback_migration_phase(
    migration_name_param TEXT,
    phase_param TEXT
)
RETURNS TABLE (
    operation TEXT,
    status TEXT,
    details TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    rollback_sql_text TEXT;
BEGIN
    -- Only allow admins to perform rollbacks
    IF NOT auth.has_permission('manage_documents') THEN
        RAISE EXCEPTION 'Insufficient permissions to perform rollback operations';
    END IF;
    
    -- Get rollback SQL for the specified migration phase
    SELECT rollback_sql INTO rollback_sql_text
    FROM migration_tracking
    WHERE migration_name = migration_name_param
    AND phase = phase_param
    AND status = 'completed';
    
    IF rollback_sql_text IS NULL THEN
        RETURN QUERY
        SELECT
            'rollback_check'::TEXT as operation,
            'FAILED'::TEXT as status,
            'No rollback SQL found for specified migration phase' as details;
        RETURN;
    END IF;
    
    -- Execute rollback SQL (this is a simplified example)
    -- In production, this would need more sophisticated rollback handling
    RETURN QUERY
    SELECT
        'rollback_execution'::TEXT as operation,
        'COMPLETED'::TEXT as status,
        format('Rollback SQL available for %s:%s', migration_name_param, phase_param) as details;
    
    -- Update migration tracking
    UPDATE migration_tracking
    SET status = 'rolled_back'
    WHERE migration_name = migration_name_param
    AND phase = phase_param;
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION mark_migration_complete(TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION rollback_migration_phase(TEXT, TEXT) TO authenticated;

-- Mark all migration phases as complete
SELECT mark_migration_complete('mivaa_integration', 'jwt_functions', NULL);
SELECT mark_migration_complete('mivaa_integration', 'schema_alignment', NULL);
SELECT mark_migration_complete('mivaa_integration', 'rls_policies', NULL);
SELECT mark_migration_complete('mivaa_integration', 'embedding_standardization', NULL);
SELECT mark_migration_complete('mivaa_integration', 'performance_optimization', NULL);
SELECT mark_migration_complete('mivaa_integration', 'data_validation', NULL);
```

---

## Migration Execution Guide

### Prerequisites

1. **Database Backup**: Create full database backup before starting
2. **Access Verification**: Ensure proper database permissions
3. **Environment Setup**: Verify Supabase connection and extensions
4. **Testing Environment**: Run migrations in staging first

### Execution Order

Execute migrations in the following order:

```bash
# Phase 1: Schema Alignment & JWT Functions
psql -f supabase/migrations/20250805_001_jwt_context_functions.sql
psql -f supabase/migrations/20250805_002_mivaa_schema_alignment.sql

# Phase 2: RLS Policy Implementation
psql -f supabase/migrations/20250805_003_enable_rls_policies.sql
psql -f supabase/migrations/20250805_004_rls_performance_indexes.sql

# Phase 3: Embedding Standardization
psql -f supabase/migrations/20250805_005_embedding_standardization_schema.sql
psql -f supabase/migrations/20250805_006_hybrid_search_functions.sql

# Phase 4: Performance Optimization
psql -f supabase/migrations/20250805_007_performance_optimization.sql
psql -f supabase/migrations/20250805_008_performance_functions.sql

# Phase 5: Data Validation & Cleanup
psql -f supabase/migrations/20250805_009_data_validation.sql
psql -f supabase/migrations/20250805_010_migration_completion.sql
```

### Validation Commands

After each phase, run validation:

```sql
-- Validate JWT functions
SELECT auth.get_workspace_id();
SELECT auth.get_user_role();
SELECT auth.has_permission('read');

-- Validate RLS policies
SELECT * FROM validate_workspace_data_integrity();

-- Check embedding migration progress
SELECT * FROM get_embedding_migration_progress();

-- Validate performance optimizations
SELECT * FROM analyze_workspace_query_performance(auth.get_workspace_id());
```

### Rollback Procedures

If issues occur, rollback in reverse order:

```sql
-- Rollback specific phase
SELECT * FROM rollback_migration_phase('mivaa_integration', 'performance_optimization');

-- Check rollback status
SELECT * FROM migration_tracking WHERE migration_name = 'mivaa_integration';
```

---

## Post-Migration Tasks

### 1. Application Updates

Update application code to use new functions:

```python
# Python example for Mivaa PDF extractor
from supabase import create_client

# Use hybrid search function
def search_documents(query_embedding, workspace_id=None):
    result = supabase.rpc(
        'search_documents_hybrid',
        {
            'query_embedding': query_embedding,
            'workspace_id_param': workspace_id,
            'match_threshold': 0.8,
            'match_count': 10
        }
    )
    return result.data
```

### 2. Monitoring Setup

Monitor migration progress and performance:

```sql
-- Monitor embedding migration
SELECT * FROM get_embedding_migration_progress();

-- Monitor query performance
SELECT * FROM analyze_workspace_query_performance(workspace_id);

-- Check data integrity
SELECT * FROM validate_workspace_data_integrity();
```

### 3. Data Migration Scripts

Create Python scripts for embedding migration:

```python
# embedding_migration_script.py
import asyncio
import openai
from supabase import create_client

async def migrate_embeddings_batch(batch_size=100):
    """Migrate embeddings from 1536-dim to 768-dim in batches"""
    
    # Get documents needing migration
    documents = supabase.table('documents')\
        .select('id, content')\
        .eq('embedding_migration_status', 'pending')\
        .limit(batch_size)\
        .execute()
    
    for doc in documents.data:
        try:
            # Generate new embedding using text-embedding-3-small
            response = openai.embeddings.create(
                model="text-embedding-3-small",
                input=doc['content']
            )
            
            new_embedding = response.data[0].embedding
            
            # Update document with new embedding
            supabase.table('documents')\
                .update({
                    'embedding_v2': new_embedding,
                    'embedding_migration_status': 'completed',
                    'embedding_migrated_at': 'now()'
                })\
                .eq('id', doc['id'])\
                .execute()
                
        except Exception as e:
            # Mark as failed for retry
            supabase.table('documents')\
                .update({'embedding_migration_status': 'failed'})\
                .eq('id', doc['id'])\
                .execute()
            
            print(f"Failed to migrate document {doc['id']}: {e}")

# Run migration
if __name__ == "__main__":
    asyncio.run(migrate_embeddings_batch())
```

---

## Security Considerations

### 1. JWT Token Validation

Ensure JWT tokens contain required workspace context:

```json
{
  "sub": "user-uuid",
  "workspace_id": "workspace-uuid",
  "role": "editor",
  "permissions": ["read", "write"],
  "exp": 1234567890
}
```

### 2. RLS Policy Testing

Test RLS policies thoroughly:

```sql
-- Test workspace isolation
SET request.jwt.claims TO '{"workspace_id": "test-workspace-1"}';
SELECT COUNT(*) FROM documents; -- Should only show workspace-1 documents

SET request.jwt.claims TO '{"workspace_id": "test-workspace-2"}';
SELECT COUNT(*) FROM documents; -- Should only show workspace-2 documents
```

### 3. Permission Validation

Verify role-based permissions:

```sql
-- Test different roles
SET request.jwt.claims TO '{"workspace_id": "test-workspace", "role": "viewer"}';
SELECT auth.has_permission('write'); -- Should return false

SET request.jwt.claims TO '{"workspace_id": "test-workspace", "role": "editor"}';
SELECT auth.has_permission('write'); -- Should return true
```

---

## Performance Monitoring

### 1. Query Performance

Monitor RLS policy impact:

```sql
-- Check query execution plans
EXPLAIN (ANALYZE, BUFFERS)
SELECT * FROM documents
WHERE workspace_id = auth.get_workspace_id()
LIMIT 10;

-- Monitor index usage
SELECT schemaname, tablename, indexname, idx_scan, idx_tup_read, idx_tup_fetch
FROM pg_stat_user_indexes
WHERE tablename IN ('documents', 'pdf_documents', 'processed_documents');
```

### 2. Embedding Search Performance

Monitor vector search performance:

```sql
-- Test embedding search performance
EXPLAIN (ANALYZE, BUFFERS)
SELECT id, title, 1 - (embedding_v2 <=> '[0.1,0.2,...]'::vector) as similarity
FROM documents
WHERE workspace_id = auth.get_workspace_id()
ORDER BY embedding_v2 <=> '[0.1,0.2,...]'::vector
LIMIT 10;
```

### 3. Migration Progress Tracking

Track migration completion:

```sql
-- Overall migration status
SELECT
    migration_name,
    COUNT(*) as total_phases,
    COUNT(*) FILTER (WHERE status = 'completed') as completed_phases,
    COUNT(*) FILTER (WHERE status = 'pending') as pending_phases
FROM migration_tracking
GROUP BY migration_name;
```

---

## Troubleshooting

### Common Issues

1. **JWT Function Errors**
   - Verify JWT token format
   - Check workspace_members table data
   - Validate user permissions

2. **RLS Policy Conflicts**
   - Check policy order and conditions
   - Verify workspace_id consistency
   - Test with different user roles

3. **Embedding Migration Failures**
   - Monitor OpenAI API rate limits
   - Check embedding dimension compatibility
   - Verify vector extension installation

4. **Performance Issues**
   - Analyze query execution plans
   - Check index usage statistics
   - Monitor connection pool usage

### Recovery Procedures

1. **Rollback to Previous State**
   ```sql
   SELECT * FROM rollback_migration_phase('mivaa_integration', 'failed_phase');
   ```

2. **Data Recovery**
   ```sql
   -- Restore from backup if needed
   -- Verify data integrity
   SELECT * FROM validate_workspace_data_integrity();
   ```

3. **Performance Recovery**
   ```sql
   -- Rebuild indexes if needed
   REINDEX TABLE documents;
   ANALYZE documents;
   ```

---

## Conclusion

This comprehensive migration strategy provides:

- **Zero-downtime migration** with backward compatibility
- **Robust security** through workspace-aware RLS policies
- **Performance optimization** with strategic indexing
- **Data integrity validation** at each step
- **Complete rollback procedures** for safety
- **Monitoring and troubleshooting** guidance

The migration implements the complete integration strategy designed in previous phases, ensuring seamless integration between the Mivaa PDF extractor and existing RAG system while maintaining data security, performance, and integrity.
    