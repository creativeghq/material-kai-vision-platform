# Revised Extraction Architecture - Chunks-First Approach

## Key Decision

**For MIVAA (agentic platform): Prioritize CHUNKS over METAFIELDS**

This document revises the previous metafield-centric architecture to be chunks-first, with metafields as optional secondary data.

---

## Why This Change

### **Previous Approach (Metafield-Centric)**
```
Stage 0: Discover products + metafields
Stage 1: Build extraction scopes
Stage 2: Create chunks
Stage 3: Extract images
Stage 4: Extract metafields (PRIMARY)
Stage 5: Link metafields to entities
```

**Problem**: Agents need context, not just structured data

### **New Approach (Chunks-First)**
```
Stage 0: Discover products + content
Stage 1: Build extraction scopes
Stage 2: Create semantic chunks (PRIMARY)
Stage 3: Extract images
Stage 4: Extract metafields (SECONDARY - from chunks)
Stage 5: Link everything together
```

**Benefit**: Agents have full context for reasoning

---

## Three-Scope Model (REVISED)

### **Scope 1: Content Processing (Selected Pages)**
- **Purpose**: Create chunks and images
- **Pages**: [5, 6, 7, 8, 9, 10, 11] (product pages)
- **Output**: Semantic chunks with full context

### **Scope 2: Global Context Search (ALL Pages)**
- **Purpose**: Find context chunks (not metafields!)
- **Pages**: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]
- **Output**: Context chunks (designer, brand, collection, etc.)
- **Example**: "NOVA Collection by SG NY" → chunk, not metafield

### **Scope 3: Category-Specific Content (Selected Pages)**
- **Purpose**: Find category-specific chunks
- **Pages**: [5, 6, 7, 8, 9, 10, 11] (product pages)
- **Output**: Product-specific chunks (specs, features, etc.)
- **Example**: "R11 slip resistance" → chunk, not metafield

---

## New Processing Pipeline

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
  },
  "category_content": {
    "products": ["R11 slip resistance", "A1 fire rating", "water absorption"]
  }
}
```

### **Stage 1: Build Extraction Scopes**

```python
# Same three scopes, but for CHUNKS not metafields
scopes = {
  "content_pages": [5, 6, 7, 8, 9, 10, 11],
  "global_context_pages": [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
  "category_content_pages": {
    "products": [5, 6, 7, 8, 9, 10, 11]
  }
}
```

### **Stage 2: Create Semantic Chunks**

```python
# Create chunks from content_pages
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
  },
  {
    "id": "chunk_3",
    "content": "Suitable for wet areas, bathrooms, kitchens",
    "page_number": 6,
    "category": "product",
    "embedding": [...],
    "metadata": {
      "type": "product_application",
      "contains": ["application_area"]
    }
  }
]
```

### **Stage 3: Extract Images**

```python
# Same as before - extract from content_pages
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

### **Stage 4: Extract Metafields (OPTIONAL)**

```python
# Extract FROM chunks, not separately
metafields = extract_from_chunks(chunks)

# Result:
metafields = {
  "material": {
    "value": "Ceramic",
    "source_chunk": "chunk_2",
    "confidence": 0.98
  },
  "color": {
    "value": "White",
    "source_chunk": "chunk_1",
    "confidence": 0.95
  },
  "slip_resistance": {
    "value": "R11",
    "source_chunk": "chunk_2",
    "confidence": 0.99
  }
}
```

### **Stage 5: Link Everything**

```python
# Link chunks to products
product.chunks = [chunk_1, chunk_2, chunk_3]

# Link images to chunks
chunk_1.images = [image_1]

# Link metafields to chunks (for reference)
chunk_2.metafields = ["material", "slip_resistance"]

# Link metafields to products (for fast filtering)
product.metafields = metafields
```

---

## Agent Workflow

### **Example: "Find durable tiles for wet areas"**

```
1. Agent receives query
2. Searches chunks for semantic similarity:
   - "durable tiles" → finds chunks about durability
   - "wet areas" → finds chunks about bathrooms, kitchens
3. Agent retrieves chunks:
   - "Made from ceramic with R11 slip resistance"
   - "Suitable for wet areas, bathrooms, kitchens"
   - "Durability: 10+ year lifespan"
4. Agent reasons:
   - "These chunks mention durability and wet areas"
   - "R11 slip resistance is good for wet areas"
   - "Ceramic is durable"
5. Agent explains to user:
   - "NOVA tiles are made from durable ceramic with R11 slip resistance,
     making them ideal for wet areas like bathrooms and kitchens"
```

---

## Database Schema (REVISED)

### **Primary Tables**

```sql
-- Chunks (PRIMARY)
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

-- Images
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

-- Products
CREATE TABLE products (
  id UUID PRIMARY KEY,
  document_id UUID REFERENCES documents(id),
  name TEXT,
  page_range INT[],
  metadata JSONB,
  created_at TIMESTAMP
);
```

### **Relationship Tables**

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

-- Metafields (OPTIONAL - for fast filtering)
CREATE TABLE metafields (
  id UUID PRIMARY KEY,
  name TEXT,
  type TEXT,
  created_at TIMESTAMP
);

-- Metafield Values (linked to chunks)
CREATE TABLE metafield_values (
  id UUID PRIMARY KEY,
  metafield_id UUID REFERENCES metafields(id),
  chunk_id UUID REFERENCES document_chunks(id),
  value TEXT,
  confidence_score FLOAT,
  extraction_method TEXT,
  created_at TIMESTAMP
);
```

---

## API Changes

### **New Endpoints**

```
# Search by semantic similarity (PRIMARY)
GET /api/search/chunks?query=durable+tiles&limit=10

# Search by metafields (SECONDARY - for filtering)
GET /api/search/products?material=ceramic&slip_resistance=R11

# Get product with chunks
GET /api/products/{id}?include=chunks,images

# Get chunk with relationships
GET /api/chunks/{id}?include=product,images,metafields
```

---

## Benefits of Chunks-First

✅ **Agents have full context** for reasoning  
✅ **Natural language queries** work seamlessly  
✅ **Flexible schema** - no predefined categories  
✅ **Semantic understanding** - not just keyword matching  
✅ **Scalable** - works with any content type  
✅ **No "metafield category" confusion** - just chunks  
✅ **Agents can explain** their reasoning  
✅ **Metafields optional** - use only for fast filtering  

---

## Migration Path

### **Phase 1: Chunks-First**
- Create chunks from all content
- Store with embeddings
- Link to products

### **Phase 2: Optional Metafields**
- Extract metafields FROM chunks (not separately)
- Use for fast filtering only
- Link back to source chunks

### **Phase 3: Agent Integration**
- Agents query chunks primarily
- Use metafields for filtering
- Reason about full context

### **Phase 4: Optimization**
- Cache frequently accessed chunks
- Optimize embedding search
- Monitor agent reasoning quality

---

## Summary

**Old Approach**: Metafields → Chunks  
**New Approach**: Chunks → Metafields (optional)

**Result**: Agents have full context, better reasoning, no schema confusion.

This is the right architecture for an agentic platform.

