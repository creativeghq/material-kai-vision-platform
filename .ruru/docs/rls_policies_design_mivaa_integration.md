+++
id = "rls-policies-design-mivaa-integration"
title = "RLS Policies Design for Mivaa-JWT Integration"
context_type = "documentation"
scope = "Database security design for multi-tenant workspace isolation"
target_audience = ["data-specialist", "backend-developer", "security-specialist"]
granularity = "detailed"
status = "active"
last_updated = "2025-08-05"
tags = ["rls", "security", "multi-tenant", "jwt", "workspace", "supabase", "postgresql"]
related_context = [
    ".ruru/docs/database_schema_analysis_mivaa_integration.md",
    ".ruru/tasks/PLATFORM_INTEGRATION/TASK-BACKEND-20250805-103810.md"
]
+++

# RLS Policies Design for Mivaa-JWT Integration

## Executive Summary

This document defines comprehensive Row Level Security (RLS) policies to enable secure multi-tenant data isolation between Mivaa PDF extractor and the existing RAG system within the shared Supabase database. The design implements workspace-aware access control using JWT token context extraction.

## 1. Architecture Overview

### 1.1 Multi-Tenant Strategy
- **Isolation Level**: Workspace-based data segregation
- **Authentication**: JWT tokens containing workspace context
- **Authorization**: RLS policies enforcing workspace boundaries
- **Shared Resources**: Database instance, schema, and infrastructure

### 1.2 Key Components
1. **JWT Context Extraction Functions**: Extract workspace information from JWT tokens
2. **Workspace Validation Functions**: Verify user access to specific workspaces
3. **Table-Specific RLS Policies**: Granular access control per table
4. **Performance Optimization**: Efficient indexing for RLS queries

## 2. JWT Token Structure Analysis

Based on the Mivaa middleware analysis, JWT tokens contain:

```json
{
  "sub": "user_id",
  "workspace_id": "uuid",
  "role": "admin|member|viewer",
  "permissions": ["read", "write", "delete"],
  "exp": 1234567890,
  "iat": 1234567890
}
```

## 3. Core Security Functions

### 3.1 JWT Context Extraction Function

```sql
-- Function to extract workspace_id from JWT token
CREATE OR REPLACE FUNCTION auth.get_workspace_id()
RETURNS UUID
LANGUAGE SQL
STABLE
SECURITY DEFINER
AS $$
  SELECT COALESCE(
    (auth.jwt() ->> 'workspace_id')::UUID,
    NULL
  );
$$;

-- Function to extract user role within workspace
CREATE OR REPLACE FUNCTION auth.get_workspace_role()
RETURNS TEXT
LANGUAGE SQL
STABLE
SECURITY DEFINER
AS $$
  SELECT COALESCE(
    auth.jwt() ->> 'role',
    'viewer'
  );
$$;

-- Function to extract user permissions
CREATE OR REPLACE FUNCTION auth.get_user_permissions()
RETURNS TEXT[]
LANGUAGE SQL
STABLE
SECURITY DEFINER
AS $$
  SELECT COALESCE(
    ARRAY(SELECT jsonb_array_elements_text(auth.jwt() -> 'permissions')),
    ARRAY['read']::TEXT[]
  );
$$;
```

### 3.2 Workspace Membership Validation

```sql
-- Function to verify user membership in workspace
CREATE OR REPLACE FUNCTION auth.user_has_workspace_access(target_workspace_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 
    FROM workspace_members wm
    WHERE wm.user_id = auth.uid()
      AND wm.workspace_id = target_workspace_id
      AND wm.status = 'active'
  );
$$;

-- Function to check if user has specific permission in workspace
CREATE OR REPLACE FUNCTION auth.user_has_permission(permission TEXT)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
AS $$
  SELECT permission = ANY(auth.get_user_permissions());
$$;
```

## 4. Table-Specific RLS Policies

### 4.1 Documents Table (Mivaa Primary)

```sql
-- Enable RLS on documents table
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only access documents in their workspace
CREATE POLICY "workspace_isolation_documents_select" ON documents
  FOR SELECT
  USING (
    workspace_id = auth.get_workspace_id()
    AND auth.user_has_workspace_access(workspace_id)
  );

-- Policy: Users can insert documents only in their workspace with write permission
CREATE POLICY "workspace_isolation_documents_insert" ON documents
  FOR INSERT
  WITH CHECK (
    workspace_id = auth.get_workspace_id()
    AND auth.user_has_workspace_access(workspace_id)
    AND auth.user_has_permission('write')
  );

-- Policy: Users can update documents in their workspace with write permission
CREATE POLICY "workspace_isolation_documents_update" ON documents
  FOR UPDATE
  USING (
    workspace_id = auth.get_workspace_id()
    AND auth.user_has_workspace_access(workspace_id)
    AND auth.user_has_permission('write')
  )
  WITH CHECK (
    workspace_id = auth.get_workspace_id()
    AND auth.user_has_workspace_access(workspace_id)
    AND auth.user_has_permission('write')
  );

-- Policy: Users can delete documents in their workspace with delete permission
CREATE POLICY "workspace_isolation_documents_delete" ON documents
  FOR DELETE
  USING (
    workspace_id = auth.get_workspace_id()
    AND auth.user_has_workspace_access(workspace_id)
    AND auth.user_has_permission('delete')
  );
```

### 4.2 PDF Documents Table (Mivaa Specific)

```sql
-- Enable RLS on pdf_documents table
ALTER TABLE pdf_documents ENABLE ROW LEVEL SECURITY;

-- Policy: Workspace isolation for PDF documents
CREATE POLICY "workspace_isolation_pdf_documents_select" ON pdf_documents
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM documents d
      WHERE d.id = pdf_documents.document_id
        AND d.workspace_id = auth.get_workspace_id()
        AND auth.user_has_workspace_access(d.workspace_id)
    )
  );

CREATE POLICY "workspace_isolation_pdf_documents_insert" ON pdf_documents
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM documents d
      WHERE d.id = pdf_documents.document_id
        AND d.workspace_id = auth.get_workspace_id()
        AND auth.user_has_workspace_access(d.workspace_id)
        AND auth.user_has_permission('write')
    )
  );

CREATE POLICY "workspace_isolation_pdf_documents_update" ON pdf_documents
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM documents d
      WHERE d.id = pdf_documents.document_id
        AND d.workspace_id = auth.get_workspace_id()
        AND auth.user_has_workspace_access(d.workspace_id)
        AND auth.user_has_permission('write')
    )
  );

CREATE POLICY "workspace_isolation_pdf_documents_delete" ON pdf_documents
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM documents d
      WHERE d.id = pdf_documents.document_id
        AND d.workspace_id = auth.get_workspace_id()
        AND auth.user_has_workspace_access(d.workspace_id)
        AND auth.user_has_permission('delete')
    )
  );
```

### 4.3 Processed Documents Table (Mivaa Processing)

```sql
-- Enable RLS on processed_documents table
ALTER TABLE processed_documents ENABLE ROW LEVEL SECURITY;

-- Policy: Workspace isolation for processed documents
CREATE POLICY "workspace_isolation_processed_documents_select" ON processed_documents
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM documents d
      WHERE d.id = processed_documents.document_id
        AND d.workspace_id = auth.get_workspace_id()
        AND auth.user_has_workspace_access(d.workspace_id)
    )
  );

CREATE POLICY "workspace_isolation_processed_documents_insert" ON processed_documents
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM documents d
      WHERE d.id = processed_documents.document_id
        AND d.workspace_id = auth.get_workspace_id()
        AND auth.user_has_workspace_access(d.workspace_id)
        AND auth.user_has_permission('write')
    )
  );

CREATE POLICY "workspace_isolation_processed_documents_update" ON processed_documents
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM documents d
      WHERE d.id = processed_documents.document_id
        AND d.workspace_id = auth.get_workspace_id()
        AND auth.user_has_workspace_access(d.workspace_id)
        AND auth.user_has_permission('write')
    )
  );

CREATE POLICY "workspace_isolation_processed_documents_delete" ON processed_documents
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM documents d
      WHERE d.id = processed_documents.document_id
        AND d.workspace_id = auth.get_workspace_id()
        AND auth.user_has_workspace_access(d.workspace_id)
        AND auth.user_has_permission('delete')
    )
  );
```

### 4.4 Existing RAG System Tables

```sql
-- Enable RLS on existing RAG tables (if not already enabled)
ALTER TABLE document_chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE embeddings ENABLE ROW LEVEL SECURITY;

-- Policy: Workspace isolation for document chunks
CREATE POLICY "workspace_isolation_document_chunks_select" ON document_chunks
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM documents d
      WHERE d.id = document_chunks.document_id
        AND d.workspace_id = auth.get_workspace_id()
        AND auth.user_has_workspace_access(d.workspace_id)
    )
  );

-- Similar policies for INSERT, UPDATE, DELETE on document_chunks...

-- Policy: Workspace isolation for embeddings
CREATE POLICY "workspace_isolation_embeddings_select" ON embeddings
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM document_chunks dc
      JOIN documents d ON d.id = dc.document_id
      WHERE dc.id = embeddings.chunk_id
        AND d.workspace_id = auth.get_workspace_id()
        AND auth.user_has_workspace_access(d.workspace_id)
    )
  );

-- Similar policies for INSERT, UPDATE, DELETE on embeddings...
```

### 4.5 Workspace Members Table

```sql
-- Enable RLS on workspace_members table
ALTER TABLE workspace_members ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see their own workspace memberships
CREATE POLICY "workspace_members_select_own" ON workspace_members
  FOR SELECT
  USING (user_id = auth.uid());

-- Policy: Only workspace admins can manage memberships
CREATE POLICY "workspace_members_admin_manage" ON workspace_members
  FOR ALL
  USING (
    workspace_id = auth.get_workspace_id()
    AND auth.get_workspace_role() = 'admin'
    AND auth.user_has_permission('write')
  );
```

## 5. Performance Optimization

### 5.1 Required Indexes

```sql
-- Index for workspace-based queries on documents
CREATE INDEX IF NOT EXISTS idx_documents_workspace_id 
ON documents(workspace_id);

-- Index for workspace member lookups
CREATE INDEX IF NOT EXISTS idx_workspace_members_user_workspace 
ON workspace_members(user_id, workspace_id) 
WHERE status = 'active';

-- Index for document-based queries on related tables
CREATE INDEX IF NOT EXISTS idx_pdf_documents_document_id 
ON pdf_documents(document_id);

CREATE INDEX IF NOT EXISTS idx_processed_documents_document_id 
ON processed_documents(document_id);

CREATE INDEX IF NOT EXISTS idx_document_chunks_document_id 
ON document_chunks(document_id);

CREATE INDEX IF NOT EXISTS idx_embeddings_chunk_id 
ON embeddings(chunk_id);

-- Composite index for efficient RLS policy evaluation
CREATE INDEX IF NOT EXISTS idx_documents_workspace_user_access 
ON documents(workspace_id, created_by);
```

### 5.2 Function Optimization

```sql
-- Create materialized view for active workspace memberships (optional)
CREATE MATERIALIZED VIEW active_workspace_memberships AS
SELECT user_id, workspace_id, role, permissions
FROM workspace_members
WHERE status = 'active';

-- Create unique index on materialized view
CREATE UNIQUE INDEX idx_active_workspace_memberships_user_workspace
ON active_workspace_memberships(user_id, workspace_id);

-- Refresh function for materialized view
CREATE OR REPLACE FUNCTION refresh_workspace_memberships()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY active_workspace_memberships;
  RETURN NULL;
END;
$$;

-- Trigger to refresh materialized view on workspace_members changes
CREATE TRIGGER trigger_refresh_workspace_memberships
  AFTER INSERT OR UPDATE OR DELETE ON workspace_members
  FOR EACH STATEMENT
  EXECUTE FUNCTION refresh_workspace_memberships();
```

## 6. Security Considerations

### 6.1 JWT Token Validation
- **Token Expiry**: Ensure JWT tokens have reasonable expiration times
- **Token Refresh**: Implement secure token refresh mechanisms
- **Token Revocation**: Support for immediate token invalidation

### 6.2 Workspace Access Control
- **Principle of Least Privilege**: Users only access their assigned workspaces
- **Role-Based Permissions**: Granular permissions within workspaces
- **Audit Logging**: Track all workspace access and modifications

### 6.3 Data Isolation Verification
- **Cross-Workspace Queries**: Prevent accidental data leakage
- **Policy Testing**: Comprehensive testing of all RLS policies
- **Performance Monitoring**: Ensure RLS doesn't degrade performance

## 7. Testing Strategy

### 7.1 Unit Tests for Security Functions

```sql
-- Test workspace_id extraction
SELECT auth.get_workspace_id(); -- Should return workspace_id from JWT

-- Test permission checking
SELECT auth.user_has_permission('write'); -- Should return boolean

-- Test workspace access validation
SELECT auth.user_has_workspace_access('workspace-uuid'); -- Should return boolean
```

### 7.2 Integration Tests for RLS Policies

```sql
-- Test document isolation
-- User A should not see User B's documents in different workspace
SET request.jwt.claims = '{"workspace_id": "workspace-a", "sub": "user-a"}';
SELECT COUNT(*) FROM documents; -- Should only return workspace-a documents

SET request.jwt.claims = '{"workspace_id": "workspace-b", "sub": "user-b"}';
SELECT COUNT(*) FROM documents; -- Should only return workspace-b documents
```

### 7.3 Performance Tests

```sql
-- Test query performance with RLS enabled
EXPLAIN ANALYZE SELECT * FROM documents WHERE title ILIKE '%search%';

-- Test index usage
EXPLAIN (ANALYZE, BUFFERS) 
SELECT d.* FROM documents d 
WHERE d.workspace_id = auth.get_workspace_id();
```

## 8. Migration Strategy

### 8.1 Phased Implementation
1. **Phase 1**: Create security functions and test in development
2. **Phase 2**: Enable RLS on non-critical tables first
3. **Phase 3**: Enable RLS on critical tables with monitoring
4. **Phase 4**: Full production deployment with rollback plan

### 8.2 Rollback Plan
- **Disable RLS**: Quick rollback by disabling RLS on tables
- **Function Removal**: Remove security functions if needed
- **Index Cleanup**: Remove performance indexes if causing issues

## 9. Monitoring and Maintenance

### 9.1 Performance Monitoring
- **Query Performance**: Monitor RLS policy evaluation time
- **Index Usage**: Ensure indexes are being used effectively
- **Resource Consumption**: Track CPU and memory usage

### 9.2 Security Auditing
- **Access Logs**: Log all workspace access attempts
- **Policy Violations**: Alert on potential security breaches
- **Regular Reviews**: Periodic review of RLS policies and permissions

## 10. Implementation Checklist

- [ ] Create JWT context extraction functions
- [ ] Create workspace validation functions
- [ ] Implement RLS policies for all tables
- [ ] Create performance optimization indexes
- [ ] Test security functions and policies
- [ ] Verify workspace isolation
- [ ] Performance test with realistic data
- [ ] Create monitoring and alerting
- [ ] Document deployment procedures
- [ ] Train team on new security model

## Conclusion

This RLS policy design provides comprehensive multi-tenant security for the Mivaa-JWT integration while maintaining performance and usability. The workspace-aware approach ensures complete data isolation between tenants while leveraging the shared Supabase infrastructure efficiently.

The implementation follows PostgreSQL and Supabase best practices for RLS, with careful attention to performance optimization and security validation. Regular monitoring and maintenance will ensure the continued effectiveness of the security model.