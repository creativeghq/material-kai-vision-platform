+++
id = "db-schema-analysis-mivaa-integration"
title = "Database Schema Analysis: Mivaa-JWT Integration"
context_type = "documentation"
scope = "Database schema comparison and alignment strategy for Mivaa PDF extractor integration"
target_audience = ["data-specialist", "backend-developer", "technical-architect"]
granularity = "detailed"
status = "active"
last_updated = "2025-08-05"
tags = ["database", "schema", "mivaa", "integration", "supabase", "rls", "embeddings", "multi-tenant"]
related_context = [
    ".ruru/tasks/PLATFORM_INTEGRATION/TASK-BACKEND-20250805-103810.md",
    "supabase/migrations/20250731_create_enhanced_vector_search.sql",
    "mivaa-pdf-extractor/app/services/supabase_client.py"
]
template_schema_doc = ".ruru/templates/toml-md/16_ai_rule.README.md"
relevance = "Critical: Foundation for database integration strategy"
+++

# Database Schema Analysis: Mivaa-JWT Integration

## Executive Summary

This document provides a comprehensive analysis of the database schema differences between the Mivaa PDF extractor system and the existing RAG platform, identifying key integration challenges and proposing alignment strategies for Phase 2 (Data Foundation) of the Mivaa-JWT Integration Implementation Roadmap.

## Current Architecture Overview

### Shared Infrastructure
- **Database System**: PostgreSQL via Supabase
- **Architecture Pattern**: Both systems use the same Supabase instance
- **Integration Approach**: Shared database with workspace-level isolation via RLS policies

### Key Discovery
The most significant architectural finding is that both Mivaa and the existing RAG system use the **same Supabase instance**, which simplifies integration but requires careful design of Row Level Security (RLS) policies for multi-tenant data isolation.

## Schema Comparison Analysis

### Existing RAG System Tables

Based on migration analysis (`supabase/migrations/20250731_create_enhanced_vector_search.sql`):

#### Core Tables (Inferred from Migration)
- **Documents/Content Tables**: Tables with vector embedding support
- **Embedding Columns**: 1536-dimension vectors (text-embedding-ada-002)
- **Vector Search Infrastructure**: Enhanced vector search functions and optimized indexes

#### Key Characteristics
- **Embedding Model**: text-embedding-ada-002 (1536 dimensions)
- **Vector Search**: Optimized for similarity search with enhanced functions
- **Indexing**: Specialized indexes for vector operations

### Mivaa PDF Extractor Tables

Based on codebase analysis:

#### Core Tables
1. **`documents`** - Primary document storage table
   - Used extensively in API operations
   - Main table for document metadata and status tracking
   - Supports filtering, pagination, and CRUD operations

2. **`pdf_documents`** - PDF-specific document metadata
   - Referenced in health checks
   - Likely contains PDF-specific processing information

3. **`processed_documents`** - Document processing status tracking
   - Used in Supabase client health checks
   - Tracks document processing pipeline status

4. **`workspace_members`** - Multi-tenant workspace membership
   - Used in JWT authentication middleware
   - Maps users to workspaces for access control
   - Critical for workspace-level data isolation

#### Key Characteristics
- **Multi-Tenancy**: Workspace-based isolation via `workspace_members`
- **Processing Pipeline**: Separate tracking of document processing states
- **JWT Integration**: Workspace context extracted from JWT tokens
- **Python/Supabase Client**: Uses Supabase Python client with async operations

## Critical Integration Challenges

### 1. Embedding Dimension Conflict ⚠️

**Current State**:
- **Existing System**: 1536 dimensions (text-embedding-ada-002)
- **Task Requirement**: 768 dimensions (text-embedding-3-small)

**Impact**: 
- Incompatible embedding vectors
- Requires migration strategy for existing embeddings
- Performance implications for vector similarity search

**Resolution Options**:
1. **Dual Model Support**: Support both embedding models during transition
2. **Re-embedding**: Migrate existing content to new model
3. **Model Standardization**: Choose single model for all content

### 2. Multi-Tenant Data Isolation

**Current State**:
- Mivaa implements workspace-based isolation
- Existing RAG system lacks explicit multi-tenancy

**Requirements**:
- Workspace-level data isolation via RLS policies
- JWT-based workspace context extraction
- Secure data access patterns

### 3. Schema Alignment Needs

**Table Structure Harmonization**:
- Align document metadata schemas
- Standardize processing status tracking
- Integrate workspace context into existing tables

**Relationship Mapping**:
- Map Mivaa's document types to existing content types
- Establish foreign key relationships for workspace isolation
- Ensure referential integrity across systems

## Proposed Integration Strategy

### Phase 1: Schema Alignment

#### 1.1 Workspace Infrastructure
```sql
-- Ensure workspace tables exist and are properly structured
CREATE TABLE IF NOT EXISTS workspaces (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS workspace_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
    user_id UUID NOT NULL,
    role TEXT NOT NULL DEFAULT 'member',
    created_at TIMESTAMPTZ DEFAULT NOW()
);
```

#### 1.2 Document Schema Harmonization
```sql
-- Add workspace context to existing document tables
ALTER TABLE documents 
ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES workspaces(id);

-- Ensure Mivaa document tables have consistent structure
-- (Specific DDL depends on current Mivaa schema)
```

#### 1.3 Embedding Standardization
```sql
-- Add new embedding column for text-embedding-3-small (768 dimensions)
ALTER TABLE document_chunks 
ADD COLUMN IF NOT EXISTS embedding_768 vector(768);

-- Maintain existing 1536-dimension embeddings during transition
-- embedding_1536 vector(1536) -- existing column
```

### Phase 2: RLS Policy Implementation

#### 2.1 Workspace-Level Isolation
```sql
-- Enable RLS on all tables requiring workspace isolation
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE processed_documents ENABLE ROW LEVEL SECURITY;

-- Create workspace isolation policies
CREATE POLICY "workspace_isolation_documents" ON documents
    FOR ALL USING (
        workspace_id IN (
            SELECT workspace_id FROM workspace_members 
            WHERE user_id = auth.uid()
        )
    );
```

#### 2.2 JWT Context Extraction
```sql
-- Function to extract workspace from JWT
CREATE OR REPLACE FUNCTION get_user_workspace_ids()
RETURNS UUID[] AS $$
BEGIN
    RETURN ARRAY(
        SELECT workspace_id 
        FROM workspace_members 
        WHERE user_id = auth.uid()
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

### Phase 3: Migration Strategy

#### 3.1 Data Migration
1. **Workspace Assignment**: Assign existing documents to default workspace
2. **Embedding Migration**: Generate 768-dimension embeddings for existing content
3. **Schema Updates**: Apply all structural changes with zero-downtime approach

#### 3.2 Application Updates
1. **Mivaa Integration**: Update Mivaa to use harmonized schema
2. **RAG System Updates**: Add workspace context to existing queries
3. **API Alignment**: Ensure consistent API patterns across systems

## Performance Considerations

### Indexing Strategy
```sql
-- Workspace-aware indexes
CREATE INDEX IF NOT EXISTS idx_documents_workspace_id ON documents(workspace_id);
CREATE INDEX IF NOT EXISTS idx_document_chunks_workspace_embedding_768 
    ON document_chunks(workspace_id, embedding_768) 
    USING ivfflat (embedding_768 vector_cosine_ops);

-- Maintain existing vector indexes for 1536-dimension embeddings
-- during transition period
```

### Query Optimization
- Ensure all queries include workspace context
- Optimize vector similarity search for both embedding dimensions
- Monitor performance impact of RLS policies

## Security Considerations

### RLS Policy Design
- **Principle of Least Privilege**: Users only access their workspace data
- **JWT Validation**: Robust workspace context extraction from tokens
- **Audit Trail**: Log workspace access patterns

### Data Isolation Validation
- **Testing Strategy**: Comprehensive multi-tenant isolation tests
- **Penetration Testing**: Verify no cross-workspace data leakage
- **Monitoring**: Real-time detection of policy violations

## Implementation Roadmap

### Immediate Actions (Phase 2 - Data Foundation)
1. ✅ Complete schema analysis (this document)
2. 🔄 Design RLS policies for workspace isolation
3. 📋 Create migration scripts for schema alignment
4. 📋 Implement embedding standardization strategy
5. 📋 Develop comprehensive testing strategy

### Next Phase Dependencies
- **Phase 3 (API Integration)**: Requires completed schema alignment
- **Phase 4 (Frontend Integration)**: Depends on stable multi-tenant API
- **Phase 5 (Testing & Optimization)**: Requires all database changes

## Risk Assessment

### High Risk
- **Embedding Migration**: Large-scale re-embedding operations
- **RLS Performance**: Potential query performance impact
- **Data Integrity**: Cross-system referential integrity

### Medium Risk
- **Schema Changes**: Coordinated updates across systems
- **JWT Integration**: Workspace context extraction reliability

### Low Risk
- **Supabase Compatibility**: Both systems already use Supabase
- **Python Integration**: Mivaa's existing Supabase client patterns

## Conclusion

The shared Supabase infrastructure significantly simplifies the integration architecture but requires careful implementation of workspace-level data isolation. The primary technical challenges are embedding dimension standardization and comprehensive RLS policy implementation.

The proposed strategy provides a clear path forward with manageable risk and maintains system performance while ensuring robust multi-tenant security.

## Next Steps

1. **RLS Policy Design**: Create detailed workspace isolation policies
2. **Migration Script Development**: Implement schema alignment migrations
3. **Embedding Strategy**: Resolve 768 vs 1536 dimension conflict
4. **Testing Framework**: Develop comprehensive validation tests
5. **Performance Validation**: Benchmark RLS policy impact

---

**Document Status**: ✅ Complete - Ready for RLS policy design phase
**Last Updated**: 2025-08-05 13:24 UTC
**Next Review**: After RLS policy implementation