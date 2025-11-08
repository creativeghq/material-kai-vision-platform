# MIVAA Search Strategies Guide

**Last Updated:** 2025-11-08  
**Status:** ✅ All 6 Strategies Implemented (100% Complete)  
**Endpoint:** `/api/rag/search`

Complete guide to MIVAA's unified multi-strategy search system that combines semantic understanding, vector similarity, visual recognition, and property filtering for comprehensive product discovery.

---

## 📊 Overview

MIVAA implements **6 distinct search strategies** that can be used individually or combined for comprehensive results:

| Strategy | Status | Use Case | Performance Target |
|----------|--------|----------|-------------------|
| **Semantic Search** | ✅ | Natural language queries | <150ms |
| **Vector Search** | ✅ | Exact similarity matching | <100ms |
| **Multi-Vector Search** | ✅ | Text + visual understanding | <200ms |
| **Hybrid Search** | ✅ | Technical terms + semantics | <180ms |
| **Material Search** | ✅ | Property-based filtering | <50ms |
| **Image Search** | ✅ | Visual similarity | <150ms |
| **All Strategies** | ✅ | Comprehensive search | <800ms |

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

### 3. Multi-Vector Search ✅

**Combines text, visual, and multimodal embeddings**

- **Method:** `multi_vector_search()`
- **Embeddings Combined:**
  - text_embedding_1536 (40% weight)
  - visual_clip_embedding_512 (30% weight)
  - multimodal_fusion_embedding_2048 (30% weight)
- **Best For:** Complex queries requiring text + visual understanding
- **Example:** "geometric patterns in neutral colors"

**How It Works:**
1. Generates text embedding from query
2. Queries all 3 embedding columns in parallel
3. Calculates weighted cosine similarity for each
4. Combines scores: `final_score = (text * 0.4) + (visual * 0.3) + (multimodal * 0.3)`
5. Returns results with score breakdown

**Request:**
```bash
curl -X POST "http://localhost:8000/api/rag/search?strategy=multi_vector" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "geometric patterns in neutral colors",
    "workspace_id": "uuid",
    "top_k": 10,
    "text_weight": 0.4,
    "visual_weight": 0.3,
    "multimodal_weight": 0.3
  }'
```

**Response Includes:**
```json
{
  "results": [{
    "id": "uuid",
    "name": "Product Name",
    "relevance_score": 0.85,
    "score_breakdown": {
      "text_score": 0.82,
      "visual_score": 0.88,
      "multimodal_score": 0.86
    }
  }]
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

### 7. All Strategies Combined ✅

**Runs all 6 strategies in parallel and merges results**

- **Method:** `search_all_strategies()`
- **Execution:** Parallel using asyncio.gather
- **Ranking:** Weighted by score (70%) + strategy count (30%)
- **Best For:** Comprehensive search across all modalities
- **Performance:** <800ms for all strategies

**How It Works:**
1. Runs all 6 strategies in parallel
2. Collects results from each strategy
3. Merges and deduplicates by product ID
4. Calculates combined score:
   - Average score across strategies (70%)
   - Boost for products found in multiple strategies (30%)
5. Returns top-k results sorted by combined score

**Request:**
```bash
curl -X POST "http://localhost:8000/api/rag/search?strategy=all" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "modern geometric tiles",
    "workspace_id": "uuid",
    "top_k": 10,
    "text_weight": 0.4,
    "visual_weight": 0.3,
    "multimodal_weight": 0.3,
    "semantic_weight": 0.7,
    "keyword_weight": 0.3
  }'
```

**Response Includes:**
```json
{
  "results": [{
    "id": "uuid",
    "name": "Product Name",
    "relevance_score": 0.88,
    "found_in_strategies": ["semantic", "multi_vector", "hybrid"],
    "strategy_scores": {
      "semantic": 0.85,
      "multi_vector": 0.90,
      "hybrid": 0.89
    }
  }],
  "strategies_executed": ["semantic", "vector", "multi_vector", "hybrid"],
  "strategies_count": 4
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
  
  -- Embeddings for search
  text_embedding_1536 vector(1536),      -- OpenAI text embedding
  visual_clip_embedding_512 vector(512), -- CLIP visual embedding
  multimodal_fusion_embedding_2048 vector(2048), -- Multimodal fusion
  
  -- Full-text search
  search_vector tsvector,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_products_text_embedding ON products 
  USING ivfflat (text_embedding_1536 vector_cosine_ops);

CREATE INDEX idx_products_visual_embedding ON products 
  USING ivfflat (visual_clip_embedding_512 vector_cosine_ops);

CREATE INDEX idx_products_metadata ON products USING gin(metadata);

CREATE INDEX products_search_vector_idx ON products USING gin(search_vector);
```

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
| Semantic | <150ms | ~80ms | With MMR diversity |
| Vector | <100ms | ~50ms | Pure similarity |
| Multi-Vector | <200ms | ~120ms | 3 parallel queries |
| Hybrid | <180ms | ~100ms | Semantic + keyword |
| Material | <50ms | ~20ms | JSONB indexed |
| Image | <150ms | ~90ms | CLIP embedding |
| All | <800ms | ~400ms | 6 parallel strategies |

---

## 🔧 Configuration

### Default Weights

**Multi-Vector Search:**
- Text: 0.4 (40%)
- Visual: 0.3 (30%)
- Multimodal: 0.3 (30%)

**Hybrid Search:**
- Semantic: 0.7 (70%)
- Keyword: 0.3 (30%)

**All Strategies Ranking:**
- Average Score: 0.7 (70%)
- Strategy Count Boost: 0.3 (30%)

### Customization

All weights are configurable via API parameters. Adjust based on your use case:

- **Text-heavy queries:** Increase text_weight
- **Visual-heavy queries:** Increase visual_weight
- **Technical queries:** Increase keyword_weight
- **Conceptual queries:** Increase semantic_weight

---

## 🚀 Best Practices

1. **Use "all" strategy for comprehensive results** - Recommended for most use cases
2. **Use specific strategies for targeted searches** - When you know the query type
3. **Adjust weights based on query type** - Customize for better results
4. **Combine with filters** - Use material_filters with any strategy
5. **Monitor performance** - Track response times and adjust as needed

---

## 📚 Related Documentation

- [API Endpoints Reference](./api-endpoints.md)
- [PDF Processing Pipeline](./pdf-processing-pipeline.md)
- [System Architecture](./system-architecture.md)
- [Features Guide](./features-guide.md)

