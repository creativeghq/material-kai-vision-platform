# Complete Implementation Roadmap: Chunks-First Architecture

## 🎯 Executive Summary

This is the **SINGLE SOURCE OF TRUTH** for all implementation tasks.

**Decision**: Remove metafields completely from extraction process. Use chunks as primary data.

**Benefits**:
- ✅ 50% less AI consumption (no metafield extraction)
- ✅ 20% faster processing (fewer stages)
- ✅ Simpler architecture (chunks only)
- ✅ Better agent reasoning (full context)
- ✅ Cleaner database (no metafield tables)

**Timeline**: 8 phases, 21-28 days

---

## 📋 Table of Contents

1. [Architectural Decision](#architectural-decision)
2. [Phase 1: Database Schema Updates](#phase-1-database-schema-updates)
3. [Phase 2: Backend Service Updates](#phase-2-backend-service-updates)
4. [Phase 3: PDF Processing Pipeline](#phase-3-pdf-processing-pipeline)
5. [Phase 4: API Endpoint Updates](#phase-4-api-endpoint-updates)
6. [Phase 5: Frontend Updates](#phase-5-frontend-updates)
7. [Phase 6: Testing & Validation](#phase-6-testing--validation)
8. [Phase 7: Deployment & Monitoring](#phase-7-deployment--monitoring)
9. [Implementation Checklist](#implementation-checklist)

---

## 🏗️ Architectural Decision

### **What We Decided**

**Remove metafields completely from extraction process.**

Use chunks as the only primary data source for all operations.

### **Why This Decision**

**For agentic platforms: Chunks are significantly better than metafields.**

| Aspect | Metafields | Chunks |
|--------|-----------|--------|
| **Agent Reasoning** | Limited context | Full context ✅ |
| **Natural Language** | Keyword only | Semantic ✅ |
| **Flexibility** | Rigid schema | Flexible ✅ |
| **Categories** | Confusing | Not needed ✅ |
| **Scalability** | Schema changes | Unlimited ✅ |

### **Old Pipeline (Metafield-Centric)**
```
Stage 0: Discover products + metafields
Stage 1: Build scopes
Stage 2: Create chunks
Stage 3: Extract images
Stage 4: Extract metafields ← REMOVE
Stage 5: Link metafields ← REMOVE
```

### **New Pipeline (Chunks-First)**
```
Stage 0: Discover products + content
Stage 1: Build scopes
Stage 2: Create chunks (PRIMARY)
Stage 3: Extract images
Stage 4: Link everything
```

---

### **Status**: ⏳ PENDING (2-3 days)

### **Tasks**

1. [ ] Backup all metafield tables
2. [ ] Create chunk-product relationship table
3. [ ] Create image-chunk relationship table
4. [ ] Drop metafield tables
5. [ ] Verify database integrity
6. [ ] Test relationships

### **Database Changes**

#### **Tables to Remove**

```sql
DROP TABLE IF EXISTS metafield_values CASCADE;
DROP TABLE IF EXISTS product_metafield_values CASCADE;
DROP TABLE IF EXISTS chunk_metafield_values CASCADE;
DROP TABLE IF EXISTS image_metafield_values CASCADE;
DROP TABLE IF EXISTS certificate_metafield_values CASCADE;
DROP TABLE IF EXISTS logo_metafield_values CASCADE;
DROP TABLE IF EXISTS specification_metafield_values CASCADE;
DROP TABLE IF EXISTS metafields CASCADE;
```

#### **Tables to Keep/Update**

```sql
-- document_chunks (PRIMARY)
CREATE TABLE document_chunks (
  id UUID PRIMARY KEY,
  document_id UUID REFERENCES documents(id),
  content TEXT,
  page_number INT,
  category TEXT,  -- "product", "context", "specification"
  embedding VECTOR(1536),  -- OpenAI embedding
  metadata JSONB,
  created_at TIMESTAMP
);

-- document_images
CREATE TABLE document_images (
  id UUID PRIMARY KEY,
  document_id UUID REFERENCES documents(id),
  image_url TEXT,
  page_number INT,
  category TEXT,
  embedding VECTOR(512),  -- CLIP embedding
  metadata JSONB,
  created_at TIMESTAMP
);

-- products
CREATE TABLE products (
  id UUID PRIMARY KEY,
  document_id UUID REFERENCES documents(id),
  name TEXT,
  page_range INT[],
  metadata JSONB,
  created_at TIMESTAMP
);
```

#### **New Relationship Tables**

```sql
-- Chunk to Product (many-to-many)
CREATE TABLE chunk_product_relationships (
  chunk_id UUID REFERENCES document_chunks(id),
  product_id UUID REFERENCES products(id),
  relevance_score FLOAT,
  PRIMARY KEY (chunk_id, product_id)
);

-- Image to Chunk (many-to-many)
CREATE TABLE image_chunk_relationships (
  image_id UUID REFERENCES document_images(id),
  chunk_id UUID REFERENCES document_chunks(id),
  relevance_score FLOAT,
  PRIMARY KEY (image_id, chunk_id)
);
```

### **Files to Modify**

- `mivaa-pdf-extractor/app/models/database.py`
- Database migration scripts

### **Success Criteria**

- ✅ All metafield tables removed
- ✅ Relationship tables created
- ✅ No data loss
- ✅ Database integrity verified

---

### **Status**: ⏳ PENDING (3-4 days)

### **Tasks**

1. [ ] Remove MetafieldService completely
2. [ ] Remove MetafieldExtractionService
3. [ ] Update DocumentChunkingService
4. [ ] Update ProductDiscoveryService
5. [ ] Create ChunkRelationshipService
6. [ ] Update UnifiedSearchService
7. [ ] Remove all metafield-related imports

### **Services to Remove**

```
- MetafieldService (REMOVE COMPLETELY)
- MetafieldExtractionService (REMOVE COMPLETELY)
- EntityLinkingService (REMOVE - metafield linking)
```

### **Services to Update**

#### **DocumentChunkingService**
- Remove metafield extraction from chunks
- Focus on semantic chunking only
- Add category tracking to chunks

#### **ProductDiscoveryService**
- Remove metafield identification
- Focus on product discovery only
- Update discovery prompt

#### **UnifiedSearchService**
- Remove metafield search
- Focus on semantic chunk search
- Update search endpoints

### **New Services**

#### **ChunkRelationshipService** (NEW)

```python
class ChunkRelationshipService:
    """Link chunks to products and images"""

    async def link_chunks_to_products(
        self,
        chunks: List[DocumentChunk],
        products: List[Product]
    ) -> List[ChunkProductRelationship]:
        """Link chunks to products with relevance scores"""
        pass

    async def link_images_to_chunks(
        self,
        images: List[DocumentImage],
        chunks: List[DocumentChunk]
    ) -> List[ImageChunkRelationship]:
        """Link images to chunks with relevance scores"""
        pass
```

#### **SemanticSearchService** (NEW)

```python
class SemanticSearchService:
    """Search chunks by semantic similarity"""

    async def search_chunks(
        self,
        query: str,
        limit: int = 10,
        threshold: float = 0.7
    ) -> List[SearchResult]:
        """Search chunks by embedding similarity"""
        pass
```

### **Files to Modify**

- `mivaa-pdf-extractor/app/services/metafield_service.py` (DELETE)
- `mivaa-pdf-extractor/app/services/document_chunking_service.py`
- `mivaa-pdf-extractor/app/services/product_discovery_service.py`
- `mivaa-pdf-extractor/app/services/unified_search_service.py`
- Create: `mivaa-pdf-extractor/app/services/chunk_relationship_service.py`
- Create: `mivaa-pdf-extractor/app/services/semantic_search_service.py`

### **Success Criteria**

- ✅ All services updated
- ✅ No metafield references
- ✅ All tests passing
- ✅ Services properly linked

---

### **Status**: ⏳ PENDING (2-3 days)

### **Tasks**

1. [ ] Update Stage 0 discovery (remove metafield identification)
2. [ ] Remove Stage 4 metafield extraction
3. [ ] Update Stage 5 linking (use ChunkRelationshipService)
4. [ ] Update discovery prompt
5. [ ] Test with Harmony PDF
6. [ ] Verify chunk quality

### **New Pipeline Stages**

#### **Stage 0: Enhanced Discovery**

```python
# Discover CONTENT, not metafields
discovery = {
  "products": [
    {
      "name": "NOVA",
      "page_range": [5, 6, 7, 8, 9, 10, 11],
      "content_summary": "Ceramic tile with R11 slip resistance..."
    }
  ],
  "global_content": {
    "designer": "SG NY",
    "collection": "NOVA",
    "material": "Ceramic",
    "colors": ["White", "Black", "Gray", "Beige", "Taupe"]
  }
}
```

#### **Stage 1: Build Extraction Scopes**

```python
scopes = {
  "content_pages": [5, 6, 7, 8, 9, 10, 11],
  "global_context_pages": [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]
}
```

#### **Stage 2: Create Semantic Chunks**

```python
chunks = [
  {
    "id": "chunk_1",
    "content": "NOVA Tile - 300x600mm, White, Matte Finish",
    "page_number": 5,
    "category": "product",
    "embedding": [...],  # OpenAI text embedding
    "metadata": {
      "type": "product_description",
      "contains": ["size", "color", "finish"]
    }
  },
  {
    "id": "chunk_2",
    "content": "Made from ceramic with R11 slip resistance",
    "page_number": 5,
    "category": "product",
    "embedding": [...],
    "metadata": {
      "type": "product_specs",
      "contains": ["material", "slip_resistance"]
    }
  }
]
```

#### **Stage 3: Extract Images**

```python
images = [
  {
    "id": "image_1",
    "page_number": 5,
    "category": "product",
    "embedding": [...],  # CLIP embedding
    "metadata": {
      "visual_properties": ["white", "smooth", "matte"]
    }
  }
]
```

#### **Stage 4: Link Everything**

```python
# Link chunks to products
product.chunks = [chunk_1, chunk_2, chunk_3]

# Link images to chunks
chunk_1.images = [image_1]

# Calculate relevance scores
chunk_product_relationships = {
  "chunk_1": {"product_id": "prod_1", "relevance": 0.95},
  "chunk_2": {"product_id": "prod_1", "relevance": 0.98}
}
```

### **Files to Modify**

- `mivaa-pdf-extractor/app/api/rag_routes.py`
- `mivaa-pdf-extractor/app/services/pdf_processing_service.py`
- Prompts in discovery stage

### **Success Criteria**

- ✅ Chunks extracted correctly
- ✅ Images linked to chunks
- ✅ Products linked to chunks
- ✅ No metafield extraction
- ✅ Harmony PDF test passes

---

## Phase 4: API Endpoint Updates

### **Status**: ⏳ PENDING (2-3 days)

### **Tasks**

1. [ ] Remove metafield endpoints
2. [ ] Update chunk endpoints
3. [ ] Add relationship endpoints
4. [ ] Update product endpoints
5. [ ] Update search endpoints
6. [ ] Update OpenAPI documentation

### **Endpoints to Remove**

```
DELETE /api/metafields/*
DELETE /api/products/{id}/metafields
DELETE /api/search/properties
DELETE /api/search/chunks/by-metafields
```

### **Endpoints to Keep/Update**

```
# Search by semantic similarity (PRIMARY)
GET /api/search/chunks?query=durable+tiles&limit=10

# Search by embedding
POST /api/search/semantic
{
  "query": "durable tiles for wet areas",
  "limit": 10,
  "threshold": 0.7
}

# Get product with chunks
GET /api/products/{id}?include=chunks,images

# Get chunk with relationships
GET /api/chunks/{id}?include=product,images

# Get all chunks for product
GET /api/products/{id}/chunks

# Get all images for chunk
GET /api/chunks/{id}/images

# Get chunk relationships
GET /api/chunks/{id}/relationships

# Get product relationships
GET /api/products/{id}/relationships
```

### **Files to Modify**

- `mivaa-pdf-extractor/app/api/rag_routes.py`
- `mivaa-pdf-extractor/app/api/search_routes.py`
- `mivaa-pdf-extractor/app/api/product_routes.py`

### **Success Criteria**

- ✅ All endpoints working
- ✅ OpenAPI docs updated
- ✅ No metafield endpoints
- ✅ All tests passing

---

## Phase 5: Frontend Updates

### **Status**: ⏳ PENDING (3-4 days)

### **Tasks**

1. [ ] Remove MetafieldViewer component
2. [ ] Remove MetafieldEditor component
3. [ ] Remove MetafieldFilter component
4. [ ] Update ProductDetail component
5. [ ] Update SearchResults component
6. [ ] Update KnowledgeBase component
7. [ ] Update admin dashboard

### **Components to Remove**

```
- MetafieldViewer
- MetafieldEditor
- MetafieldFilter
- MetafieldSearch
```

### **Components to Update**

#### **ProductDetail**
- Show chunks instead of metafields
- Show full context
- Display chunk relationships

#### **SearchResults**
- Show chunks with relevance scores
- Show related images
- Display semantic similarity

#### **KnowledgeBase**
- Show chunks organized by product
- Show chunk relationships
- Display chunk metadata

### **Files to Modify**

- `src/components/MetafieldViewer.tsx` (DELETE)
- `src/components/MetafieldEditor.tsx` (DELETE)
- `src/components/ProductDetail.tsx`
- `src/components/SearchResults.tsx`
- `src/pages/KnowledgeBase.tsx`
- `src/pages/AdminDashboard.tsx`

### **Success Criteria**

- ✅ All components updated
- ✅ No metafield references
- ✅ UI shows chunks instead
- ✅ All tests passing

---

## Phase 6: Testing & Validation

### **Status**: ⏳ PENDING (3-4 days)

### **Tasks**

1. [ ] Unit tests for all services
2. [ ] Integration tests for pipeline
3. [ ] E2E tests for full workflow
4. [ ] Performance tests
5. [ ] Test with Harmony PDF
6. [ ] Validate chunk quality
7. [ ] Validate relationships

### **Test Files**

- `tests/test_chunk_relationship_service.py`
- `tests/test_pdf_processing_pipeline.py`
- `tests/test_search_endpoints.py`
- `tests/e2e_chunk_extraction.py`

### **Success Criteria**

- ✅ All tests passing
- ✅ 50% AI consumption reduction verified
- ✅ 20% speed improvement verified
- ✅ Chunk quality validated
- ✅ Relationships correct

---

## Phase 7: Deployment & Monitoring

### **Status**: ⏳ PENDING (1-2 days)

### **Tasks**

1. [ ] Deploy database changes
2. [ ] Deploy backend changes
3. [ ] Deploy API changes
4. [ ] Deploy frontend changes
5. [ ] Monitor performance
6. [ ] Monitor error rates
7. [ ] Verify AI consumption

### **Deployment Steps**

1. Backup production database
2. Deploy database migrations
3. Deploy backend services
4. Deploy API endpoints
5. Deploy frontend
6. Monitor for 24 hours

### **Success Criteria**

- ✅ All deployments successful
- ✅ No errors in logs
- ✅ Performance improved
- ✅ AI consumption reduced
- ✅ Users can access platform

---

## 📊 Timeline Summary

| Phase | Duration | Status |
|-------|----------|--------|
| 1. Database Schema | 2-3 days | ⏳ PENDING |
| 2. Backend Services | 3-4 days | ⏳ PENDING |
| 3. PDF Pipeline | 2-3 days | ⏳ PENDING |
| 4. API Endpoints | 2-3 days | ⏳ PENDING |
| 5. Frontend | 3-4 days | ⏳ PENDING |
| 6. Testing | 3-4 days | ⏳ PENDING |
| 7. Deployment | 1-2 days | ⏳ PENDING |
| **TOTAL** | **21-28 days** | ⏳ PENDING |

---

## ✅ Success Criteria

### **Functional**
✅ All metafield tables removed
✅ All metafield services removed
✅ All metafield endpoints removed
✅ All metafield components removed
✅ Chunks extracted correctly
✅ Relationships created correctly

### **Performance**
✅ 50% less AI consumption
✅ 20% faster processing
✅ Fewer database queries

### **Architecture**
✅ Simpler design
✅ Fewer services
✅ Cleaner database

### **Functionality**
✅ Better agent reasoning
✅ Full context available
✅ Natural language queries

### **Maintenance**
✅ Easier to maintain
✅ Fewer edge cases
✅ Clearer code

---

## 📋 Implementation Checklist

### **Phase 1: Database**
- [ ] Backup metafield tables
- [ ] Create relationship tables
- [ ] Drop metafield tables
- [ ] Test database integrity

### **Phase 2: Backend Services**
- [ ] Remove MetafieldService
- [ ] Update DocumentChunkingService
- [ ] Update ProductDiscoveryService
- [ ] Create ChunkRelationshipService
- [ ] Test all services

### **Phase 3: PDF Pipeline**
- [ ] Update Stage 0 discovery
- [ ] Remove Stage 4 metafield extraction
- [ ] Update Stage 5 linking
- [ ] Test with Harmony PDF

### **Phase 4: API Endpoints**
- [ ] Remove metafield endpoints
- [ ] Update chunk endpoints
- [ ] Add relationship endpoints
- [ ] Update OpenAPI docs

### **Phase 5: Frontend**
- [ ] Remove metafield components
- [ ] Update product detail view
- [ ] Update search results view
- [ ] Test UI

### **Phase 6: Testing**
- [ ] Unit tests for all services
- [ ] Integration tests for pipeline
- [ ] E2E tests for full workflow
- [ ] Performance tests

### **Phase 7: Deployment**
- [ ] Deploy database changes
- [ ] Deploy backend changes
- [ ] Deploy API changes
- [ ] Deploy frontend changes
- [ ] Monitor performance

---

## 🚀 How to Use This Document

1. **Review** the Architectural Decision section
2. **Understand** the new pipeline (Stages 0-4)
3. **Follow** each phase in order
4. **Check off** tasks as you complete them
5. **Test** thoroughly at each phase
6. **Deploy** only after all phases complete

---

## 📞 Questions?

Refer to these related documents:
- `CHUNKS-VS-METAFIELDS-DECISION.md` - Why this decision
- `METAFIELDS-VS-CHUNKS-ANALYSIS.md` - Detailed comparison
- `REVISED-EXTRACTION-ARCHITECTURE.md` - New architecture
- `COMPLETE-EXTRACTION-ARCHITECTURE.md` - Full system design

---

## ✅ Status

**Phase 1**: ⏳ PENDING
**Phase 2**: ⏳ PENDING
**Phase 3**: ⏳ PENDING
**Phase 4**: ⏳ PENDING
**Phase 5**: ⏳ PENDING
**Phase 6**: ⏳ PENDING
**Phase 7**: ⏳ PENDING

**Overall**: Ready to start implementation

