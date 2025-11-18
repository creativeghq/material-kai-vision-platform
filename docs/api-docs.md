# MIVAA API Documentation

**Version:** 2.3.0  
**Last Updated:** 2025-11-17  
**Base URL:** `https://v1api.materialshub.gr`

---

## 📚 Interactive Documentation

- **Swagger UI**: [https://v1api.materialshub.gr/docs](https://v1api.materialshub.gr/docs)
- **ReDoc**: [https://v1api.materialshub.gr/redoc](https://v1api.materialshub.gr/redoc)
- **OpenAPI Schema**: [https://v1api.materialshub.gr/openapi.json](https://v1api.materialshub.gr/openapi.json)

---

## 🎯 Latest Enhancement: Multi-Vector Search (v2.3.0)

### Overview

The multi-vector search has been **significantly enhanced** to be the single comprehensive search solution for the MIVAA platform.

### What's New

✅ **6 Specialized CLIP Embeddings** (previously 3)
- text_embedding_1536 (20%) - Semantic understanding
- visual_clip_embedding_512 (20%) - Visual similarity
- color_clip_embedding_512 (15%) - Color palette matching
- texture_clip_embedding_512 (15%) - Texture pattern matching
- style_clip_embedding_512 (15%) - Design style matching
- material_clip_embedding_512 (15%) - Material type matching

✅ **JSONB Metadata Filtering**
- Filter by material properties (finish, dimensions, etc.)
- Supports exact match, IN clauses, and array containment
- Merges seamlessly with query understanding

✅ **Query Understanding (ENABLED BY DEFAULT)**
- GPT-4o-mini parses natural language queries
- Auto-extracts: material_type, properties, finish, colors, application, style, dimensions
- Cost: $0.0001 per query (negligible)
- Can be disabled with `enable_query_understanding=false`

### Performance

| Metric | Value |
|--------|-------|
| **Response Time** | 250-350ms (with query understanding), 200-300ms (without) |
| **Accuracy Improvement** | 30-40% for complex queries |
| **Cost** | $0.0001 per query |
| **Recommended For** | 95% of all queries |

### Example Usage

#### Basic Multi-Vector Search
```bash
curl -X POST "https://v1api.materialshub.gr/api/rag/search?strategy=multi_vector" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "query": "modern ceramic tiles",
    "workspace_id": "your-workspace-id",
    "top_k": 10
  }'
```

#### With Manual Filters
```bash
curl -X POST "https://v1api.materialshub.gr/api/rag/search?strategy=multi_vector" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "query": "ceramic tiles",
    "workspace_id": "your-workspace-id",
    "material_filters": {
      "finish": "matte",
      "properties": ["waterproof", "outdoor"]
    },
    "top_k": 10
  }'
```

#### With Query Understanding (DEFAULT)
```bash
# Query understanding is ENABLED BY DEFAULT
curl -X POST "https://v1api.materialshub.gr/api/rag/search?strategy=multi_vector" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "query": "waterproof ceramic tiles for outdoor patio, matte finish, light beige",
    "workspace_id": "your-workspace-id",
    "top_k": 10
  }'
```

**What happens:**
1. GPT-4o-mini parses the query
2. Extracts filters:
   - material_type: "ceramic tiles"
   - properties: ["waterproof", "outdoor"]
   - finish: "matte"
   - colors: ["light beige"]
   - application: "patio"
3. Multi-vector search executes with 6 embeddings + filters
4. Returns highly accurate, filtered results

#### Disable Query Understanding (If Needed)
```bash
curl -X POST "https://v1api.materialshub.gr/api/rag/search?strategy=multi_vector&enable_query_understanding=false" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "query": "tiles",
    "workspace_id": "your-workspace-id",
    "top_k": 10
  }'
```

---

## 🔍 Search Strategies

### Multi-Vector Search (⭐ RECOMMENDED DEFAULT)

**Endpoint:** `POST /api/rag/search?strategy=multi_vector`

**Features:**
- 6 specialized CLIP embeddings with intelligent weighting
- JSONB metadata filtering
- Query understanding (enabled by default)
- Best accuracy and performance for general queries

**When to use:** 95% of all queries

**Performance:** ~250-350ms (with query understanding), ~200-300ms (without)

---

### Other Strategies

| Strategy | Use Case | Performance |
|----------|----------|-------------|
| `semantic` | Fast text-only search | ~80ms |
| `vector` | Pure similarity matching | ~100ms |
| `hybrid` | Semantic + keyword | ~120ms |
| `material` | Property filtering only | ~50ms |
| `image` | Visual similarity | ~150ms |
| `color` | Color-specific search | ~100ms |
| `texture` | Texture-specific search | ~100ms |
| `style` | Style-specific search | ~100ms |
| `material_type` | Material type search | ~100ms |
| `all` | ⚠️ DEPRECATED - Use `multi_vector` | ~800ms |

---

## 🔐 Authentication

All API endpoints require JWT authentication:

```bash
Authorization: Bearer YOUR_JWT_TOKEN
```

Get your token from:
1. Frontend application (automatic)
2. Supabase authentication
3. `/auth/login` endpoint

---

## 📊 Response Format

### Success Response
```json
{
  "success": true,
  "results": [...],
  "total_results": 10,
  "processing_time": 0.25,
  "weights": {
    "text": 0.2,
    "visual": 0.2,
    "color": 0.15,
    "texture": 0.15,
    "style": 0.15,
    "material": 0.15
  },
  "material_filters_applied": {...},
  "query": "...",
  "search_type": "multi_vector_enhanced"
}
```

### Error Response
```json
{
  "success": false,
  "error": "Error message",
  "detail": "Detailed error information"
}
```

---

## 🚀 Getting Started

1. **Get API Access**
   - Sign up at [materialshub.gr](https://materialshub.gr)
   - Get your JWT token from the dashboard

2. **Make Your First Request**
   ```bash
   curl -X POST "https://v1api.materialshub.gr/api/rag/search?strategy=multi_vector" \
     -H "Content-Type: application/json" \
     -H "Authorization: Bearer YOUR_JWT_TOKEN" \
     -d '{"query": "modern tiles", "workspace_id": "your-workspace-id"}'
   ```

3. **Explore Interactive Docs**
   - Visit [https://v1api.materialshub.gr/docs](https://v1api.materialshub.gr/docs)
   - Try out endpoints directly in the browser

---

## 📖 Additional Resources

- **Search Strategies Guide**: [docs/search-strategies.md](./search-strategies.md)
- **Multi-Vector Enhancement Summary**: [docs/multi-vector-enhancement-summary.md](./multi-vector-enhancement-summary.md)
- **Platform Overview**: [docs/README.md](./README.md)
- **Deployment Guide**: [docs/deployment-guide.md](./deployment-guide.md)

---

**Questions?** Contact support or check the interactive documentation at `/docs`.

