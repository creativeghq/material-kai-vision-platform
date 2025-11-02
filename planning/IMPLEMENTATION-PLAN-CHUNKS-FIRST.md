# Implementation Plan: Chunks-First Architecture (Metafields Removed)

## Executive Summary

**Decision**: Remove metafields completely from extraction process. Use chunks as the only primary data source.

**Benefits**:
- ✅ Faster extraction (no metafield extraction step)
- ✅ Less AI consumption (no separate metafield analysis)
- ✅ Simpler architecture (chunks only)
- ✅ Better agent reasoning (full context)
- ✅ Cleaner database (no metafield tables)

---

## Architecture Overview

### **Old Pipeline (Metafield-Centric)**
```
Stage 0: Discovery (products + metafields)
Stage 1: Build scopes
Stage 2: Create chunks
Stage 3: Extract images
Stage 4: Extract metafields (REMOVED)
Stage 5: Link metafields (REMOVED)
```

### **New Pipeline (Chunks-First)**
```
Stage 0: Discovery (products + content)
Stage 1: Build scopes
Stage 2: Create chunks (PRIMARY)
Stage 3: Extract images
Stage 4: Link everything
```

**Result**: 2 fewer stages, faster processing, less AI usage

---

## Phase 1: Database Schema Updates

### **Tables to Remove**

```sql
-- Remove these tables completely
DROP TABLE IF EXISTS metafield_values CASCADE;
DROP TABLE IF EXISTS product_metafield_values CASCADE;
DROP TABLE IF EXISTS chunk_metafield_values CASCADE;
DROP TABLE IF EXISTS image_metafield_values CASCADE;
DROP TABLE IF EXISTS certificate_metafield_values CASCADE;
DROP TABLE IF EXISTS logo_metafield_values CASCADE;
DROP TABLE IF EXISTS specification_metafield_values CASCADE;
DROP TABLE IF EXISTS metafields CASCADE;
```

### **Tables to Keep/Update**

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

### **New Relationship Tables**

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

---

## Phase 2: API Endpoint Updates

### **Endpoints to Remove**

```
DELETE /api/metafields/*
DELETE /api/products/{id}/metafields
DELETE /api/search/properties (metafield search)
DELETE /api/search/chunks/by-metafields
```

### **Endpoints to Keep/Update**

```
# Search by semantic similarity (PRIMARY)
GET /api/search/chunks?query=durable+tiles&limit=10

# Get product with chunks
GET /api/products/{id}?include=chunks,images

# Get chunk with relationships
GET /api/chunks/{id}?include=product,images

# Get all chunks for product
GET /api/products/{id}/chunks

# Get all images for chunk
GET /api/chunks/{id}/images
```

### **New Endpoints**

```
# Get chunk relationships
GET /api/chunks/{id}/relationships

# Get product relationships
GET /api/products/{id}/relationships

# Search chunks by embedding
POST /api/search/semantic
{
  "query": "durable tiles for wet areas",
  "limit": 10,
  "threshold": 0.7
}
```

---

## Phase 3: Backend Service Updates

### **Services to Remove**

```
- MetafieldService (REMOVE COMPLETELY)
- MetafieldExtractionService (REMOVE COMPLETELY)
- EntityLinkingService (REMOVE - metafield linking)
```

### **Services to Update**

```
- DocumentChunkingService
  - Remove metafield extraction from chunks
  - Focus on semantic chunking only

- ImageProcessingService
  - Remove metafield extraction from images
  - Focus on visual analysis only

- ProductDiscoveryService
  - Remove metafield identification
  - Focus on product discovery only

- UnifiedSearchService
  - Remove metafield search
  - Focus on semantic chunk search
```

### **New Services**

```
- ChunkRelationshipService
  - Link chunks to products
  - Link images to chunks
  - Calculate relevance scores

- SemanticSearchService
  - Search chunks by embedding
  - Return chunks with relevance scores
```

---

## Phase 4: Frontend Updates

### **Components to Remove**

```
- MetafieldViewer
- MetafieldEditor
- MetafieldFilter
- MetafieldSearch
```

### **Components to Update**

```
- ProductDetail
  - Show chunks instead of metafields
  - Show full context

- SearchResults
  - Show chunks with relevance scores
  - Show related images

- KnowledgeBase
  - Show chunks organized by product
  - Show chunk relationships
```

---

## Phase 5: PDF Processing Pipeline

### **Stage 0: Enhanced Discovery**

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

### **Stage 1: Build Extraction Scopes**

```python
scopes = {
  "content_pages": [5, 6, 7, 8, 9, 10, 11],
  "global_context_pages": [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]
}
```

### **Stage 2: Create Semantic Chunks**

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

### **Stage 3: Extract Images**

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

### **Stage 4: Link Everything**

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

---

## Phase 6: Migration Strategy

### **Step 1: Backup Current Data**
```
- Backup all metafield tables
- Backup all metafield_values tables
- Archive for reference
```

### **Step 2: Remove Metafield Extraction**
```
- Remove metafield extraction from Stage 0
- Remove metafield linking from Stage 5
- Update discovery prompt
```

### **Step 3: Update Database**
```
- Drop metafield tables
- Create relationship tables
- Migrate existing data to chunks
```

### **Step 4: Update Services**
```
- Remove MetafieldService
- Update DocumentChunkingService
- Update ProductDiscoveryService
```

### **Step 5: Update APIs**
```
- Remove metafield endpoints
- Update chunk endpoints
- Add relationship endpoints
```

### **Step 6: Update Frontend**
```
- Remove metafield components
- Update product detail view
- Update search results view
```

### **Step 7: Testing**
```
- Test chunk extraction
- Test image extraction
- Test chunk-product relationships
- Test semantic search
```

---

## Phase 7: Performance Improvements

### **AI Consumption Reduction**

**Before**:
```
Stage 0: Claude analyzes PDF for products + metafields
Stage 4: Claude extracts metafields from chunks
Total: 2 Claude calls per document
```

**After**:
```
Stage 0: Claude analyzes PDF for products only
Total: 1 Claude call per document
Savings: 50% AI consumption
```

### **Processing Speed**

**Before**:
```
Stage 0: 15% (discovery + metafields)
Stage 4: 20% (metafield extraction)
Total: 5 stages, ~100% time
```

**After**:
```
Stage 0: 15% (discovery only)
Total: 4 stages, ~80% time
Savings: 20% faster processing
```

---

## Implementation Checklist

### **Phase 1: Database**
- [ ] Backup metafield tables
- [ ] Create relationship tables
- [ ] Drop metafield tables
- [ ] Test database integrity

### **Phase 2: APIs**
- [ ] Remove metafield endpoints
- [ ] Update chunk endpoints
- [ ] Add relationship endpoints
- [ ] Test API responses

### **Phase 3: Backend Services**
- [ ] Remove MetafieldService
- [ ] Update DocumentChunkingService
- [ ] Update ProductDiscoveryService
- [ ] Create ChunkRelationshipService
- [ ] Test all services

### **Phase 4: PDF Pipeline**
- [ ] Update Stage 0 discovery
- [ ] Remove Stage 4 metafield extraction
- [ ] Update Stage 5 linking
- [ ] Test with Harmony PDF

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

## Benefits Summary

✅ **50% less AI consumption** (no metafield extraction)  
✅ **20% faster processing** (fewer stages)  
✅ **Simpler architecture** (chunks only)  
✅ **Better agent reasoning** (full context)  
✅ **Cleaner database** (no metafield tables)  
✅ **Easier maintenance** (fewer services)  
✅ **Scalable** (works with any content)  

---

## Timeline

- **Week 1**: Database schema + API updates
- **Week 2**: Backend services + PDF pipeline
- **Week 3**: Frontend + Testing
- **Week 4**: Deployment + Monitoring

---

## Related Documents

- **CHUNKS-VS-METAFIELDS-DECISION.md** - Decision rationale
- **REVISED-EXTRACTION-ARCHITECTURE.md** - New architecture
- **COMPLETE-EXTRACTION-ARCHITECTURE.md** - Full system design

