+++
# --- Basic Metadata ---
id = "TASK-SEARCH-CONSOLIDATION-20250816-122746"
title = "Consolidate Search Architecture to RAG-Only System"
context_type = "task"
scope = "Refactor search services to use unified RAG architecture"
target_audience = ["dev-react", "dev-typescript", "lead-backend"]
granularity = "feature"
status = "🟡 To Do"
last_updated = "2025-08-16T12:27:46Z"
tags = ["search", "rag", "refactor", "consolidation", "architecture", "cleanup"]
type = "🔧 Refactor"
assigned_to = "dev-react"
coordinator = "code"
priority = "high"
estimated_effort = "large"
related_docs = [
    "src/components/Search/UnifiedSearchInterface.tsx",
    "src/services/enhancedRAGService.ts",
    "src/services/ragKnowledgeService.ts",
    "supabase/functions/enhanced-rag-search/index.ts",
    "supabase/functions/rag-knowledge-search/index.ts"
]
dependencies = []
+++

# Consolidate Search Architecture to RAG-Only System

## Description

Refactor the current multi-layered search architecture to use a unified RAG (Retrieval-Augmented Generation) system. This will simplify the codebase by eliminating redundant embedding-only search services and consolidating all search functionality through RAG services that can provide both document retrieval and intelligent responses.

## Background

Current search architecture has 11 different search services with overlapping functionality:
- Multiple embedding-only services (MivaaEmbeddingIntegration, vector-similarity-search)
- Multiple RAG services (enhancedRAGService, ragKnowledgeService, ragService)
- Redundant backend functions with similar capabilities

This creates complexity, maintenance overhead, and inconsistent user experiences.

## Acceptance Criteria

- [ ] All search functionality routes through a single unified RAG service
- [ ] UI components use only the unified RAG service
- [ ] Vector similarity and embedding functionality is internal to RAG services
- [ ] Redundant search services are removed
- [ ] All existing search capabilities are preserved
- [ ] Agent UI integration is simplified through single search interface
- [ ] Performance is maintained or improved
- [ ] All tests pass after refactoring

## Implementation Checklist

### Phase 1: Create Unified RAG Service 📣
- [ ] Create new `UnifiedRAGService` class in `src/services/unifiedRAGService.ts`
- [ ] Implement search modes: `quick` (document retrieval), `detailed` (full RAG response), `hybrid`
- [ ] Integrate best features from existing RAG services:
  - [ ] Query optimization from `enhancedRAGService`
  - [ ] Knowledge base search from `ragKnowledgeService`
  - [ ] Analytics and suggestions from existing services
- [ ] Add vector similarity as internal functionality (not exposed)
- [ ] Implement agent-ready response formatting
- [ ] Add comprehensive error handling and fallbacks

### Phase 2: Update Frontend Components 📣
- [ ] Refactor `UnifiedSearchInterface.tsx` to use only `UnifiedRAGService`
- [ ] Remove dependencies on `MivaaSearchIntegration` and `MivaaEmbeddingIntegration`
- [ ] Update search result handling for both quick and detailed modes

## New Supabase Function: `unified-rag-search`

**Function Name:** `supabase/functions/unified-rag-search/index.ts`

**Purpose:** Single consolidated RAG search function that replaces all 11 existing search services

**Key Features:**
- **Base Foundation:** Built upon `enhanced-rag-search` function (most comprehensive existing implementation)
- **Search Modes:** 
  - `quick` - Fast document retrieval with minimal AI processing
  - `detailed` - Full RAG with comprehensive AI-generated responses
  - `hybrid` - Balanced approach with moderate AI enhancement
- **Integrated Capabilities:**
  - Vector similarity search from `vector-similarity-search`
  - Document search from `document-vector-search` 
  - Knowledge search from `rag-knowledge-search`
  - Query intent analysis and optimization
  - Multi-collection support
- **Image Similarity Search:**
  - Vector embeddings for images using CLIP or similar models
  - Cosine similarity calculations with percentage scores
  - Support for image-to-image and text-to-image search
  - Batch image processing capabilities
  - Similarity threshold filtering (e.g., >80% similarity)
  - Results ranked by similarity percentage
  - MMR (Maximal Marginal Relevance) algorithm integration
- **Response Formats:**
  - Documents-only (for embedding-like behavior)
  - Generated response (full RAG)
  - Hybrid (documents + summary)
- **Authentication:** Supabase RLS and API key validation
- **CORS:** Full cross-origin support for web applications

- [ ] Ensure backward compatibility for existing UI patterns
- [ ] Add loading states for different search modes
- [ ] Update TypeScript interfaces for unified search responses

### Phase 3: Consolidate Backend Functions 📣
- [ ] Create new unified Supabase Edge Function: `unified-rag-search/index.ts`
- [ ] Migrate best functionality from existing functions:
  - [ ] Intent analysis from `enhanced-rag-search`
  - [ ] OpenAI integration from `rag-knowledge-search`
  - [ ] Vector search capabilities from `document-vector-search`
  - [ ] Multi-collection support from `vector-similarity-search`
- [ ] Implement response modes: documents-only, generated-response, hybrid
- [ ] Add comprehensive analytics logging
- [ ] Ensure CORS and error handling

### Phase 4: Update Service Integrations 📣
- [ ] Update MIVAA gateway integration to use unified RAG service
- [ ] Modify PDF extractor to route through unified service
- [ ] Update any API controllers using old search services
- [ ] Ensure agent UI integration points use unified service
- [ ] Update search analytics to work with new service
### Phase 4.1: MIVAA API Changes & Integration 📣
- [ ] **MIVAA API Gateway Updates:**
  - [ ] Modify `/api/mivaa/gateway` endpoint to route search requests to unified RAG service
  - [ ] Update MIVAA search endpoint to support new search modes (quick/detailed/hybrid)
  - [ ] Add backward compatibility layer for existing MIVAA search API calls
  - [ ] Update MIVAA response formatting to handle both document lists and generated responses
- [ ] **MIVAA PDF Extractor Integration:**
  - [ ] Update `mivaa-pdf-extractor/app/api/search.py` to use unified RAG service
  - [ ] Modify `mivaa-pdf-extractor/app/services/advanced_search_service.py` to work as internal component of unified RAG
  - [ ] Update PDF extractor search endpoints to route through unified service
  - [ ] Ensure MMR and query optimization features are preserved in unified service
- [ ] **MIVAA Service Configuration:**
  - [ ] Update MIVAA configuration to point to new unified RAG endpoints
  - [ ] Modify authentication and API key handling for unified service
  - [ ] Update rate limiting and caching strategies for new architecture
  - [ ] Test MIVAA integration with unified RAG service
- [ ] **Supabase Functions Decision:**
  - [ ] **RECOMMENDATION: Use Supabase Functions for RAG Search**
  - [ ] Supabase Edge Functions provide better integration with database and vector operations
  - [ ] Keep enhanced-rag-search as base and extend with features from other functions
  - [ ] Maintain CORS support and authentication through Supabase
  - [ ] Leverage Supabase's built-in vector similarity and full-text search capabilities
- [ ] **MIVAA API Removals & Updates:**
  - [ ] Remove direct calls to embedding-only services from MIVAA gateway
  - [ ] Update MIVAA search routing to use single unified RAG endpoint

### Phase 6.1: Platform-Wide Embedding Workflow Updates 📣
- [ ] **Identify Non-Search Embedding Usage:**
  - [ ] Review material recognition workflows that use embeddings
  - [ ] Check image analysis services that generate embeddings
  - [ ] Identify PDF processing workflows using embeddings
  - [ ] Review 3D model analysis that uses vector embeddings
  - [ ] Check SVBRDF extraction workflows with embeddings
- [ ] **Update Embedding Generation Workflows:**
  - [ ] Ensure material recognition still generates embeddings for unified RAG
  - [ ] Update image analysis to store embeddings in unified format
  - [ ] Modify PDF processing to use unified embedding storage
  - [ ] Update 3D analysis to work with unified RAG service
  - [ ] Ensure SVBRDF workflows integrate with unified search
- [ ] **Database Schema Updates:**
  - [ ] Review embedding storage tables and ensure compatibility
  - [ ] Update any embedding-specific indexes for unified RAG
  - [ ] Ensure vector similarity functions work with new architecture
  - [ ] Update any embedding metadata schemas
- [ ] **Workflow Integration Testing:**
  - [ ] Test material upload → embedding generation → searchability
  - [ ] Test image analysis → embedding storage → similarity search
  - [ ] Test PDF processing → embedding creation → RAG search
  - [ ] Verify 3D model analysis → embedding → search integration
  - [ ] Test end-to-end workflows from upload to search results

**Detailed Breakdown - What Gets Removed, Updated, and Changed:**

#### Files to REMOVE Completely:
- [ ] **DELETE** `src/services/mivaaEmbeddingIntegration.ts` - Redundant embedding-only service
- [ ] **DELETE** `supabase/functions/document-vector-search/index.ts` - Replaced by unified-rag-search
- [ ] **DELETE** `supabase/functions/vector-similarity-search/index.ts` - Replaced by unified-rag-search
- [ ] **DELETE** `supabase/functions/rag-knowledge-search/index.ts` - Consolidated into unified-rag-search

#### Files to UPDATE (Major Changes):
- [ ] **UPDATE** `src/services/mivaaSearchIntegration.ts` - Call unified-rag-search instead of multiple endpoints
- [ ] **UPDATE** `src/services/enhancedRAGService.ts` - Use unified-rag-search endpoint only
- [ ] **UPDATE** `src/services/ragKnowledgeService.ts` - Use unified-rag-search endpoint only
- [ ] **UPDATE** `src/services/ragService.ts` - Use unified-rag-search endpoint only
- [ ] **UPDATE** `mivaa-pdf-extractor/app/services/advanced_search_service.py` - Integrate MMR with unified endpoint

#### Files to MODIFY (Minor Changes):
- [ ] **MODIFY** `src/components/Search/UnifiedSearchInterface.tsx` - Remove embedding-only search options, keep RAG options
- [ ] **MODIFY** Import statements across platform that reference deleted services
- [ ] **MODIFY** Configuration files that reference removed Supabase functions

#### Functionality to REMOVE:
- [ ] **REMOVE** Standalone embedding search - Users can no longer search embeddings without RAG generation
- [ ] **REMOVE** Multiple search type selection - Simplified to RAG-only with different modes (text, image, hybrid)
- [ ] **REMOVE** Direct vector similarity calls - All vector operations now go through unified RAG
- [ ] **REMOVE** Separate knowledge base search - Consolidated into unified RAG with knowledge base mode

#### Functionality to ADD:
- [ ] **ADD** Image similarity with percentage scores - New capability in unified RAG
- [ ] **ADD** Single search endpoint - All search goes through unified-rag-search
- [ ] **ADD** Unified search modes - text_rag, image_rag, hybrid_rag, knowledge_rag
- [ ] **ADD** MMR integration - Query optimization from Python service integrated into unified function

#### Database Schema Changes:
- [ ] **REVIEW** Embedding storage tables - Ensure compatibility with unified search
- [ ] **UPDATE** Vector indexes - Optimize for unified RAG queries
- [ ] **CONSOLIDATE** Search result tables - Remove separate tables for different search types

#### Non-Search Embedding Workflows (KEEP but UPDATE):
- [ ] **KEEP** Material Recognition (`supabase/functions/material-recognition/index.ts`) - Keep embedding generation, update compatibility
- [ ] **KEEP** SVBRDF Extraction (`supabase/functions/svbrdf-extractor/index.ts`) - Keep embedding generation, update storage format
- [ ] **KEEP** PDF Processing (`supabase/functions/pdf-extract/index.ts`) - Keep embedding generation, update for unified search
- [ ] **KEEP** Image Analysis workflows - Keep embedding generation, update to store in unified format

#### Configuration Updates:
- [ ] **REMOVE** Environment variables for deleted functions
- [ ] **UPDATE** API routing to point to unified-rag-search
- [ ] **SIMPLIFY** CORS settings to single endpoint
- [ ] **ADJUST** Rate limiting for consolidated endpoint

  - [ ] Remove redundant search method parameters (keep only RAG-based options)
  - [ ] Update MIVAA documentation to reflect unified search architecture


### Phase 5: Remove Redundant Services 📣
- [ ] **Frontend Services to Remove:**
  - [ ] Delete `src/services/mivaaEmbeddingIntegration.ts`
  - [ ] Delete `src/services/ragService.ts` (keep functionality in unified service)
  - [ ] Archive `src/services/enhancedRAGService.ts` and `src/services/ragKnowledgeService.ts`
- [ ] **Backend Functions to Remove:**
  - [ ] Delete `supabase/functions/vector-similarity-search/`
  - [ ] Delete `supabase/functions/document-vector-search/`
  - [ ] Archive `supabase/functions/enhanced-rag-search/` and `supabase/functions/rag-knowledge-search/`
- [ ] **Keep for MIVAA Integration:**
  - [ ] Keep `src/services/mivaaSearchIntegration.ts` (update to use unified service internally)
  - [ ] Keep `mivaa-pdf-extractor/app/services/advanced_search_service.py` (update integration)

### Phase 6: Testing & Validation 📣
- [ ] Create comprehensive test suite for `UnifiedRAGService`
- [ ] Test all search modes: quick, detailed, hybrid
- [ ] Validate agent UI integration works correctly
- [ ] Performance testing to ensure no regression
- [ ] Test error handling and fallback scenarios
- [ ] Validate analytics and logging functionality
- [ ] Cross-browser testing for UI components

### Phase 7: Documentation & Migration 📣
- [ ] Update API documentation for unified search service
- [ ] Create migration guide for any external integrations
- [ ] Update component documentation
- [ ] Add JSDoc comments to new unified service
- [ ] Update README files to reflect new architecture
- [ ] Create architectural decision record (ADR) for the consolidation

## Technical Specifications

### Unified RAG Service Interface
```typescript
interface UnifiedRAGService {
  search(query: string, options: SearchOptions): Promise<SearchResponse>
  suggest(partial: string): Promise<string[]>
  getAnalytics(): Promise<SearchAnalytics>
}

interface SearchOptions {
  mode: 'quick' | 'detailed' | 'hybrid'
  collections?: string[]
  filters?: SearchFilter[]
  maxResults?: number
  includeAnalytics?: boolean
}

interface SearchResponse {
  mode: 'quick' | 'detailed' | 'hybrid'
  documents?: Document[]
  generatedResponse?: string
  suggestions?: string[]
  analytics?: SearchAnalytics
  metadata: ResponseMetadata
}
```

### Backend Function Structure
```typescript
// supabase/functions/unified-rag-search/index.ts
export default async function handler(req: Request) {
  const { query, mode, options } = await req.json()
  
  switch (mode) {
    case 'quick':
      return await retrieveDocuments(query, options)
    case 'detailed':
      return await generateRAGResponse(query, options)
    case 'hybrid':
      return await hybridSearch(query, options)
  }
}
```

## Success Metrics

- **Codebase Simplification**: Reduce search-related files from 11 to 3-4 core files
- **Performance**: Maintain <500ms response time for quick searches, <2s for detailed
- **Functionality**: 100% feature parity with existing search capabilities
- **Agent Ready**: Single integration point for agent UI
- **Maintainability**: Reduced complexity score and improved test coverage

## Risks & Mitigation

- **Risk**: Breaking existing integrations
  - **Mitigation**: Phased rollout with backward compatibility layer
- **Risk**: Performance degradation
  - **Mitigation**: Comprehensive performance testing and optimization
- **Risk**: Feature loss during consolidation
  - **Mitigation**: Detailed feature audit and migration checklist

## Dependencies

- OpenAI API access for embeddings and generation
- Supabase database with vector extensions
- Existing search data and indexes

## Notes

This refactoring will significantly simplify the search architecture while maintaining all existing functionality. The unified RAG service will serve as the single source of truth for all search operations, making the system more maintainable and agent-ready.

The consolidation follows the principle that RAG search includes embedding search as its first step, so we can provide both document retrieval and intelligent responses through a single service with different modes.