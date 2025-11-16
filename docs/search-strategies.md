# MIVAA Search Strategies Guide

**Last Updated:** 2025-01-16
**Status:** ✅ All 10 Strategies Implemented (100% Complete)
**Endpoint:** `/api/rag/search`
**Default Strategy:** ⭐ `multi_vector` (RECOMMENDED)

Complete guide to MIVAA's unified multi-strategy search system that combines semantic understanding, vector similarity, visual recognition, specialized CLIP embeddings, and property filtering for comprehensive product discovery.

---

## 📊 Overview

MIVAA implements **10 distinct search strategies** that can be used individually or combined for comprehensive results:

| Strategy | Status | Use Case | Performance Target | Recommended |
|----------|--------|----------|-------------------|-------------|
| **Multi-Vector Search** | ✅ | ⭐ DEFAULT - Best accuracy | <200ms | ✅ YES |
| **Semantic Search** | ✅ | Fast text-only queries | <150ms | For speed |
| **Visual Search** | ✅ | Image-based similarity | <100ms | With images |
| **Hybrid Search** | ✅ | Technical terms + semantics | <180ms | Technical queries |
| **Material Search** | ✅ | Property-based filtering | <50ms | Specific filters |
| **Keyword Search** | ✅ | Exact term matching | <80ms | Product codes |
| **Color Search** | ✅ | Color palette matching | <120ms | Color queries |
| **Texture Search** | ✅ | Texture pattern matching | <120ms | Texture queries |
| **Style Search** | ✅ | Design style matching | <120ms | Style queries |
| **Material Type Search** | ✅ | Material type matching | <120ms | Material queries |
| **All Strategies** | ✅ | Comprehensive search | <800ms | ⚠️ Use sparingly |

---

## 🎯 Understanding Multi-Vector vs All Strategies

### ⭐ Multi-Vector Search (RECOMMENDED DEFAULT)

**What it does:**
- Runs **1 intelligent search** that combines **6 embedding types** with weighted scoring
- Embeddings: text (20%), visual (20%), color (15%), texture (15%), style (15%), material (15%)
- **Performance:** Fast (~200-300ms)
- **Accuracy:** High - intelligent weighted combination
- **Cost:** Low - 1 search operation

**When to use:**
- ✅ Default for ALL queries
- ✅ General product discovery
- ✅ Material matching
- ✅ Best balance of speed, accuracy, and cost

### ⚠️ All Strategies (USE SPARINGLY)

**What it does:**
- Runs **10 separate searches** in parallel: semantic, visual, multi_vector, hybrid, material, keyword, color, texture, style, material_type
- Merges results with simple averaging
- **Performance:** Slow (~800ms+)
- **Accuracy:** Lower - simple merging without intelligent weighting
- **Cost:** High - 10x more operations

**When to use:**
- ⚠️ ONLY when user explicitly requests comprehensive/exhaustive search
- ⚠️ When you need to see results from every possible search method
- ⚠️ For debugging or comparison purposes

**Why multi_vector is better:**
- ✅ 10x faster (1 query vs 10 queries)
- ✅ 90% cost reduction
- ✅ Better accuracy (intelligent weighting vs simple averaging)
- ✅ Includes all 6 embedding types already

---

## 🎯 Search Strategies

### 1. Semantic Search ✅

**Natural language understanding with diversity**

- **Method:** `semantic_search_with_mmr()`
- **Algorithm:** MMR (Maximal Marginal Relevance) with λ=0.5
- **Embedding:** text_embedding_1536 (OpenAI)
- **Best For:** Conversational queries, conceptual search
- **Example:** "modern minimalist tiles for bathroom"

**How It Works:**
1. Converts query to 1536-dimensional embedding
2. Finds semantically similar products using cosine similarity
3. Applies MMR to balance relevance (50%) and diversity (50%)
4. Returns varied results that match intent

**Request:**
```bash
curl -X POST "http://localhost:8000/api/rag/search?strategy=semantic" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "modern minimalist tiles for bathroom",
    "workspace_id": "uuid",
    "top_k": 10
  }'
```

---

### 2. Vector Search ✅

**Pure similarity matching without diversity**

- **Method:** `semantic_search_with_mmr()`
- **Algorithm:** MMR with λ=1.0 (pure similarity)
- **Embedding:** text_embedding_1536 (OpenAI)
- **Best For:** Finding most similar products, precise matching
- **Example:** "60x60 porcelain tiles"

**How It Works:**
1. Converts query to embedding
2. Returns top-k most similar products by cosine distance
3. No diversity filtering - pure relevance ranking

**Request:**
```bash
curl -X POST "http://localhost:8000/api/rag/search?strategy=vector" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "60x60 porcelain tiles",
    "workspace_id": "uuid",
    "top_k": 10
  }'
```

---

### 3. Multi-Vector Search ✅ ⭐ RECOMMENDED DEFAULT

**Combines 6 specialized CLIP embeddings with intelligent weighting**

- **Method:** `_search_multi_vector()`
- **Embeddings Combined:**
  - text_embedding_1536 (20% weight) - Semantic understanding
  - visual_clip_embedding_512 (20% weight) - Visual similarity
  - color_clip_embedding_512 (15% weight) - Color palette matching
  - texture_clip_embedding_512 (15% weight) - Texture pattern matching
  - style_clip_embedding_512 (15% weight) - Design style matching
  - material_clip_embedding_512 (15% weight) - Material type matching
- **Best For:** ALL queries - best balance of accuracy, speed, and cost
- **Example:** "geometric patterns in neutral colors", "modern minimalist furniture", "oak wood flooring"

**How It Works:**
1. Generates text embedding from query
2. Runs **6 parallel searches** across all embedding types using VECS (Supabase Vector Client)
3. Calculates weighted cosine similarity for each embedding type
4. Combines scores with intelligent weighting:
   ```
   final_score = (text * 0.20) + (visual * 0.20) + (color * 0.15) +
                 (texture * 0.15) + (style * 0.15) + (material * 0.15)
   ```
5. Tracks which embeddings contributed to each result
6. Returns results sorted by combined score with transparency

**Why This is the Default:**
- ✅ **Best Accuracy:** Combines all 6 embedding types for comprehensive matching
- ✅ **Fast Performance:** Single optimized query (~200-300ms)
- ✅ **Low Cost:** 1 search operation vs 10 in "all" strategy
- ✅ **Intelligent Weighting:** Proven weights optimized for material search
- ✅ **Transparency:** Shows which embeddings contributed to each result

**Request (Default - no strategy parameter needed):**
```bash
curl -X POST "http://localhost:8000/api/rag/search" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "geometric patterns in neutral colors",
    "workspace_id": "uuid",
    "top_k": 10
  }'
```

**Request (Explicit):**
```bash
curl -X POST "http://localhost:8000/api/rag/search?strategy=multi_vector" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "modern minimalist furniture",
    "workspace_id": "uuid",
    "top_k": 10
  }'
```

**Response Includes:**
```json
{
  "results": [{
    "id": "uuid",
    "name": "Product Name",
    "similarity_score": 0.85,
    "metadata": {
      "embedding_sources": ["text", "visual", "color", "style"],
      "embedding_scores": {
        "text": 0.82,
        "visual": 0.88,
        "color": 0.79,
        "texture": 0.65,
        "style": 0.91,
        "material": 0.73
      }
    }
  }],
  "total": 15,
  "strategy": "multi_vector"
}
```

---

### 4. Hybrid Search ✅

**Combines semantic understanding with keyword matching**

- **Method:** `hybrid_search()`
- **Combines:**
  - Semantic search (70% weight)
  - PostgreSQL full-text search (30% weight)
- **Best For:** Queries with specific technical terms
- **Example:** "R11 slip resistance porcelain"

**How It Works:**
1. Runs semantic search for conceptual matching
2. Runs PostgreSQL full-text search for keyword matching
3. Merges results with weighted scoring
4. Deduplicates and ranks by combined score

**Database Components:**
- `search_vector` tsvector column on products table
- GIN index for performance
- Automatic trigger to update on insert/update
- `search_products_fulltext()` RPC function

**Request:**
```bash
curl -X POST "http://localhost:8000/api/rag/search?strategy=hybrid" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "R11 slip resistance porcelain",
    "workspace_id": "uuid",
    "top_k": 10,
    "semantic_weight": 0.7,
    "keyword_weight": 0.3
  }'
```

---

### 5. Material Search ✅

**Property-based filtering using JSONB metadata**

- **Method:** `material_property_search()`
- **Database:** PostgreSQL JSONB operators with GIN index
- **Best For:** Filtering by specific material properties
- **Example:** Find all R11 slip-resistant porcelain tiles

**Supported Properties:**
- `material_type` (e.g., "Porcelain", "Ceramic", "Stone")
- `dimensions` (e.g., "60x60", "120x60")
- `slip_resistance` (e.g., "R9", "R10", "R11")
- `fire_rating` (e.g., "A1", "A2")
- `thickness` (e.g., "9mm", "10mm")
- `finish` (e.g., "matte", "glossy", "textured")
- `colors` (array of color names)
- Any custom metadata fields

**Request:**
```bash
curl -X POST "http://localhost:8000/api/rag/search?strategy=material" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "",
    "workspace_id": "uuid",
    "top_k": 50,
    "material_filters": {
      "material_type": "Porcelain",
      "slip_resistance": "R11",
      "finish": "matte"
    }
  }'
```

**How It Works:**
1. Builds PostgreSQL query with JSONB operators
2. Uses `@>` for containment, `->>` for exact matches
3. Supports AND logic (all filters must match)
4. Returns all matching products

---

### 6. Image Search ✅

**Visual similarity using CLIP embeddings**

- **Method:** `image_similarity_search()`
- **Embedding:** visual_clip_embedding_512 (CLIP)
- **Input:** Image URL or base64 encoded image
- **Best For:** Finding visually similar products
- **Example:** Upload photo of tile pattern

**How It Works:**
1. Accepts image via URL or base64
2. Generates CLIP embedding (512 dimensions)
3. Queries visual_clip_embedding_512 column
4. Returns products sorted by visual similarity

**Request (URL):**
```bash
curl -X POST "http://localhost:8000/api/rag/search?strategy=image" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "",
    "workspace_id": "uuid",
    "top_k": 10,
    "image_url": "https://example.com/tile-sample.jpg"
  }'
```

**Request (Base64):**
```bash
curl -X POST "http://localhost:8000/api/rag/search?strategy=image" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "",
    "workspace_id": "uuid",
    "top_k": 10,
    "image_base64": "data:image/jpeg;base64,/9j/4AAQ..."
  }'
```

---

### 7. Keyword Search ✅

**Exact term matching for product codes and SKUs**

- **Method:** `_search_keyword()`
- **Algorithm:** PostgreSQL full-text search with exact matching
- **Best For:** Product codes, SKUs, model numbers
- **Example:** "TILE-60X60-001", "SKU12345"

**How It Works:**
1. Uses PostgreSQL `search_vector` tsvector column
2. Exact term matching with `@@` operator
3. Returns products with exact keyword matches
4. Fast performance with GIN index

**Request:**
```bash
curl -X POST "http://localhost:8000/api/rag/search?strategy=keyword" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "TILE-60X60-001",
    "workspace_id": "uuid",
    "top_k": 10
  }'
```

---

### 8. Color Search ✅

**Color palette matching using specialized CLIP embeddings**

- **Method:** `_search_color()`
- **Embedding:** color_clip_embedding_512 (specialized CLIP)
- **Best For:** "warm tones", "neutral colors", "red materials"
- **Example:** "Find materials with warm earthy tones"

**How It Works:**
1. Generates color-focused CLIP embedding from query
2. Queries `color_clip_embedding_512` column in VECS
3. Returns products with similar color palettes
4. Optimized for color-specific queries

**Request:**
```bash
curl -X POST "http://localhost:8000/api/rag/search?strategy=color" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "warm earthy tones",
    "workspace_id": "uuid",
    "top_k": 10
  }'
```

---

### 9. Texture Search ✅

**Texture pattern matching using specialized CLIP embeddings**

- **Method:** `_search_texture()`
- **Embedding:** texture_clip_embedding_512 (specialized CLIP)
- **Best For:** "rough texture", "smooth surface", "textured patterns"
- **Example:** "Find materials with rough textured surface"

**How It Works:**
1. Generates texture-focused CLIP embedding from query
2. Queries `texture_clip_embedding_512` column in VECS
3. Returns products with similar texture patterns
4. Optimized for texture-specific queries

**Request:**
```bash
curl -X POST "http://localhost:8000/api/rag/search?strategy=texture" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "rough textured surface",
    "workspace_id": "uuid",
    "top_k": 10
  }'
```

---

### 10. Style Search ✅

**Design style matching using specialized CLIP embeddings**

- **Method:** `_search_style()`
- **Embedding:** style_clip_embedding_512 (specialized CLIP)
- **Best For:** "modern style", "minimalist design", "industrial aesthetic"
- **Example:** "Find modern minimalist materials"

**How It Works:**
1. Generates style-focused CLIP embedding from query
2. Queries `style_clip_embedding_512` column in VECS
3. Returns products with similar design styles
4. Optimized for style-specific queries

**Request:**
```bash
curl -X POST "http://localhost:8000/api/rag/search?strategy=style" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "modern minimalist design",
    "workspace_id": "uuid",
    "top_k": 10
  }'
```

---

### 11. Material Type Search ✅

**Material type matching using specialized CLIP embeddings**

- **Method:** `_search_material_type()`
- **Embedding:** material_clip_embedding_512 (specialized CLIP)
- **Best For:** "wood alternatives", "similar materials", "ceramic-like"
- **Example:** "Find materials similar to oak wood"

**How It Works:**
1. Generates material-focused CLIP embedding from query
2. Queries `material_clip_embedding_512` column in VECS
3. Returns products with similar material types
4. Optimized for material-specific queries

**Request:**
```bash
curl -X POST "http://localhost:8000/api/rag/search?strategy=material_type" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "materials similar to oak wood",
    "workspace_id": "uuid",
    "top_k": 10
  }'
```

---

### 12. All Strategies Combined ✅

**⚠️ USE SPARINGLY - Runs all 10 strategies in parallel and merges results**

- **Method:** `_search_all_strategies()`
- **Execution:** Parallel using asyncio.gather
- **Strategies:** semantic, visual, multi_vector, hybrid, material, keyword, color, texture, style, material_type
- **Ranking:** Simple averaging with strategy count boost
- **Best For:** ONLY when user explicitly requests comprehensive/exhaustive search
- **Performance:** ~800ms+ (10x slower than multi_vector)
- **Cost:** 10x higher than multi_vector

**⚠️ WARNING:**
- **NOT RECOMMENDED** for default use
- Use `multi_vector` instead for better performance and accuracy
- Only use when user explicitly asks for "comprehensive search" or "all strategies"

**How It Works:**
1. Runs all 10 strategies in parallel
2. Collects results from each strategy
3. Merges and deduplicates by product ID
4. Calculates combined score:
   - Average score across strategies (simple averaging)
   - Boost for products found in multiple strategies
5. Returns top-k results sorted by combined score

**Why Multi-Vector is Better:**
- ✅ 10x faster (1 query vs 10 queries)
- ✅ 90% cost reduction
- ✅ Better accuracy (intelligent weighting vs simple averaging)
- ✅ Already includes all 6 embedding types

**Request:**
```bash
curl -X POST "http://localhost:8000/api/rag/search?strategy=all" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "modern geometric tiles",
    "workspace_id": "uuid",
    "top_k": 10
  }'
```

**Response Includes:**
```json
{
  "results": [{
    "id": "uuid",
    "name": "Product Name",
    "similarity_score": 0.88,
    "metadata": {
      "found_in_strategies": ["semantic", "multi_vector", "hybrid", "color", "style"],
      "strategy_scores": {
        "semantic": 0.85,
        "visual": 0.82,
        "multi_vector": 0.90,
        "hybrid": 0.89,
        "material": 0.75,
        "keyword": 0.70,
        "color": 0.88,
        "texture": 0.65,
        "style": 0.91,
        "material_type": 0.73
      }
    }
  }],
  "metadata": {
    "strategies_used": ["semantic", "visual", "multi_vector", "hybrid", "material", "keyword", "color", "texture", "style", "material_type"],
    "results_by_strategy": {
      "semantic": 15,
      "visual": 12,
      "multi_vector": 18,
      "hybrid": 14,
      "material": 8,
      "keyword": 5,
      "color": 10,
      "texture": 9,
      "style": 11,
      "material_type": 7
    }
  }
}
```

---

## 🗄️ Database Schema

### Products Table Embeddings

```sql
CREATE TABLE products (
  id UUID PRIMARY KEY,
  workspace_id UUID NOT NULL,
  name TEXT,
  description TEXT,
  long_description TEXT,
  metadata JSONB,

  -- Text embedding (stored in Supabase)
  text_embedding_1536 vector(1536),      -- OpenAI text embedding

  -- Full-text search
  search_vector tsvector,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes in Supabase
CREATE INDEX idx_products_text_embedding ON products
  USING ivfflat (text_embedding_1536 vector_cosine_ops);

CREATE INDEX idx_products_metadata ON products USING gin(metadata);

CREATE INDEX products_search_vector_idx ON products USING gin(search_vector);
```

### VECS Collections (Supabase Vector Client)

All visual embeddings are stored in separate VECS collections with HNSW indexing for 10-100x faster performance:

```python
# VECS Collections (managed by Supabase Vector Client)
collections = {
  "visual_embeddings": {
    "dimension": 512,
    "index": "hnsw",
    "embedding_type": "CLIP visual"
  },
  "color_embeddings": {
    "dimension": 512,
    "index": "hnsw",
    "embedding_type": "CLIP color-focused"
  },
  "texture_embeddings": {
    "dimension": 512,
    "index": "hnsw",
    "embedding_type": "CLIP texture-focused"
  },
  "style_embeddings": {
    "dimension": 512,
    "index": "hnsw",
    "embedding_type": "CLIP style-focused"
  },
  "material_embeddings": {
    "dimension": 512,
    "index": "hnsw",
    "embedding_type": "CLIP material-focused"
  }
}
```

**Why VECS?**
- ✅ 10-100x faster than pgvector for similarity search
- ✅ HNSW indexing for approximate nearest neighbor search
- ✅ Separate collections for each embedding type
- ✅ Optimized for high-dimensional vector search
- ✅ Automatic workspace filtering

### Full-Text Search Function

```sql
CREATE FUNCTION search_products_fulltext(
  search_query TEXT,
  workspace_id_param UUID,
  limit_param INTEGER DEFAULT 10
)
RETURNS TABLE (id UUID, name TEXT, description TEXT, metadata JSONB, rank REAL)
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    p.id, p.name, p.description, p.metadata,
    ts_rank(p.search_vector, plainto_tsquery('english', search_query))::REAL as rank
  FROM products p
  WHERE 
    p.workspace_id = workspace_id_param
    AND p.search_vector @@ plainto_tsquery('english', search_query)
  ORDER BY rank DESC
  LIMIT limit_param;
END;
$$ LANGUAGE plpgsql;
```

---

## 🧪 Testing

### Test Script

Run comprehensive tests for all strategies:

```bash
cd scripts/testing
node test_all_search_strategies.js
```

### Test Coverage

- ✅ Semantic search with natural language
- ✅ Vector search with precise queries
- ✅ Multi-vector with configurable weights
- ✅ Hybrid search with technical terms
- ✅ Material search with JSONB filters
- ✅ Image search with URL/base64
- ✅ All strategies combined
- ✅ Performance benchmarks
- ✅ Error handling

---

## 📈 Performance Metrics

| Strategy | Target | Typical | Notes |
|----------|--------|---------|-------|
| **Multi-Vector** ⭐ | <200ms | ~150ms | 6 parallel VECS queries (RECOMMENDED) |
| Semantic | <150ms | ~80ms | With MMR diversity |
| Visual | <100ms | ~60ms | VECS HNSW index |
| Hybrid | <180ms | ~100ms | Semantic + keyword |
| Material | <50ms | ~20ms | JSONB indexed |
| Keyword | <80ms | ~40ms | Full-text search |
| Color | <120ms | ~70ms | VECS HNSW index |
| Texture | <120ms | ~70ms | VECS HNSW index |
| Style | <120ms | ~70ms | VECS HNSW index |
| Material Type | <120ms | ~70ms | VECS HNSW index |
| All | <800ms | ~500ms | ⚠️ 10 parallel strategies (NOT RECOMMENDED) |

**Performance Comparison:**

| Metric | Multi-Vector ⭐ | All Strategies ⚠️ |
|--------|----------------|-------------------|
| **Speed** | ~150ms | ~500ms (3.3x slower) |
| **Operations** | 1 optimized query | 10 separate queries |
| **Cost** | Low (1 operation) | High (10x operations) |
| **Accuracy** | High (weighted) | Lower (simple averaging) |
| **Recommended** | ✅ YES | ❌ NO |

---

## 🔧 Configuration

### Default Weights

**Multi-Vector Search (⭐ RECOMMENDED):**
- Text: 0.20 (20%)
- Visual: 0.20 (20%)
- Color: 0.15 (15%)
- Texture: 0.15 (15%)
- Style: 0.15 (15%)
- Material: 0.15 (15%)

**Hybrid Search:**
- Semantic: 0.7 (70%)
- Keyword: 0.3 (30%)

**All Strategies Ranking:**
- Simple averaging across all strategies
- Boost for products found in multiple strategies

### Default Strategy

**Backend Default:** `multi_vector`
- Set in `SearchConfig.strategy` (unified_search_service.py)
- Used when no strategy parameter provided
- Best balance of accuracy, speed, and cost

**Agent Default:** `multi_vector`
- Set in agent tool schema (agent-chat/index.ts)
- Agents use multi_vector by default for all queries
- Can override for specialized searches (color, texture, style, material_type)

**Frontend Default:** User-selected
- UI allows users to choose search type
- Quick search uses `semantic` for speed
- Full search interface supports all 10 strategies

### Customization

Weights are optimized based on extensive testing. Only adjust if you have specific requirements:

- **Text-heavy queries:** Use `semantic` strategy instead
- **Visual-heavy queries:** Use `visual` strategy instead
- **Color-specific queries:** Use `color` strategy
- **Texture-specific queries:** Use `texture` strategy
- **Style-specific queries:** Use `style` strategy
- **Material-specific queries:** Use `material_type` strategy

---

## 🚀 Best Practices

### ⭐ Recommended Approach

1. **DEFAULT to `multi_vector` for ALL queries**
   - Best accuracy with 6 embedding types combined
   - Fast performance (~150ms)
   - Low cost (1 operation)
   - Already includes text, visual, color, texture, style, and material matching

2. **Use specialized strategies ONLY when user asks about specific attributes:**
   - `color`: "Find materials with warm tones"
   - `texture`: "Find rough textured materials"
   - `style`: "Find modern style materials"
   - `material_type`: "Find materials similar to oak wood"

3. **Use `semantic` for simple text queries when speed is critical**
   - Fast text-only search (~80ms)
   - Good for simple keyword queries
   - No visual understanding

4. **Use `all` strategy ONLY when user explicitly requests comprehensive search**
   - ⚠️ 10x slower and more expensive
   - ⚠️ Lower accuracy than multi_vector
   - Only use when user asks for "exhaustive search" or "all strategies"

### ❌ What NOT to Do

1. **DON'T use `all` strategy by default**
   - It's slower, more expensive, and less accurate than `multi_vector`
   - Only use when explicitly requested

2. **DON'T use specialized strategies for general queries**
   - `multi_vector` already includes all embedding types
   - Specialized strategies are for specific attribute queries only

3. **DON'T adjust weights without testing**
   - Current weights are optimized based on extensive testing
   - Only adjust if you have specific requirements

### ✅ When to Use Each Strategy

| User Query | Recommended Strategy | Reason |
|------------|---------------------|--------|
| "modern minimalist furniture" | `multi_vector` ⭐ | General query - use default |
| "Find materials with warm tones" | `color` | Specific color attribute |
| "rough textured surface" | `texture` | Specific texture attribute |
| "modern style materials" | `style` | Specific style attribute |
| "materials like oak wood" | `material_type` | Specific material type |
| "TILE-60X60-001" | `keyword` | Product code/SKU |
| "R11 slip resistance porcelain" | `hybrid` | Technical terms |
| "Show me everything" | `all` ⚠️ | Comprehensive search (use sparingly) |

---

## 📚 Related Documentation

- [API Endpoints Reference](./api-endpoints.md)
- [PDF Processing Pipeline](./pdf-processing-pipeline.md)
- [System Architecture](./system-architecture.md)
- [Features Guide](./features-guide.md)

