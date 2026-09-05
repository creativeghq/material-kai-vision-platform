# MIVAA API Documentation

**Version:** 2.6.0
**Last Updated:** 2026-06-22
**Base URL:** `https://v1api.materialshub.gr`

> **This is a hand-written index.** The authoritative, always-current schema is the FastAPI-generated **OpenAPI** at `/openapi.json` below (the MIVAA Python backend lives in a separate repo, `creativeghq/mivaa-pdf-extractor`). For the **Supabase Edge Functions** surface (a separate Deno runtime with no auto-generated schema), see the companion hand-maintained spec at [public/api/openapi-edge.json](../public/api/openapi-edge.json) (served live at `/api/edge-swagger.html`).

---

## 📚 Interactive Documentation

- **Swagger UI**: [https://v1api.materialshub.gr/docs](https://v1api.materialshub.gr/docs)
- **ReDoc**: [https://v1api.materialshub.gr/redoc](https://v1api.materialshub.gr/redoc)
- **OpenAPI Schema**: [https://v1api.materialshub.gr/openapi.json](https://v1api.materialshub.gr/openapi.json)

---

## 🧱 PDF structural backbone: PaddleOCR-VL (since 2026-06-13)

The catalog/PDF pipeline's layout + OCR backbone is **PaddleOCR-VL** (`PaddlePaddle/PaddleOCR-VL-1.6`, 0.9B), a two-stage document parser hosted on **Modal**: **PP-DocLayoutV3** localizes/labels regions and predicts reading order, then the 0.9B VLM recognizes content inside each region (text, tables→markdown, formulas→LaTeX, charts). It **replaced Surya-2** (which had earlier replaced YOLO + Chandra). The structural pass runs as **Stage 1, before product discovery**, persisting `document_layout_analysis` rows with `processing_version="paddleocr-vl"`; discovery, chunking, and crop stages all read from that cache. Per-image OCR also runs on PaddleOCR. There is **no longer any HuggingFace-hosted model** — both GPU endpoints (PaddleOCR-VL and SLIG/SigLIP2) are **Modal-only** (SLIG moved off HF 2026-06-14). See `CLAUDE.md` and `docs/pdf-processing-pipeline.md` for the full architecture.

---

## 🎯 Multi-Vector Search (the comprehensive search solution)

### Overview

The multi-vector search has been **significantly enhanced** to be the single comprehensive search solution for the MIVAA platform.

### What's New

✅ **7 Specialized Embeddings** (SigLIP2 / SLIG + Voyage AI, updated 2026-04)
- text_embedding (15%) - Semantic understanding (Voyage AI 1024D, dict key `text_1024`, stored in document_chunks.text_embedding)
- visual_768 / image_slig_embeddings (15%) - Visual similarity (SigLIP2 cloud 768D)
- understanding_1024 / image_understanding_embeddings (20%) - Spec-based semantic (Voyage AI 1024D from Claude Opus 5 vision_analysis JSON via Anthropic tool use → `serialize_vision_analysis_to_text` → Voyage. Pre; Provenance fields `embedding_model` + `schema_version` persisted on every row.)
- color_aspect_1024 / image_color_embeddings (12.5%) - Color matching (Voyage 1024D of `VisionAnalysis.colors[]`)
- texture_aspect_1024 / image_texture_embeddings (12.5%) - Texture matching (Voyage 1024D of `VisionAnalysis.textures[] + finish`)
- style_aspect_1024 / image_style_embeddings (12.5%) - Style matching (Voyage 1024D of `VisionAnalysis.style + surface_pattern + applications`)
- material_aspect_1024 / image_material_embeddings (12.5%) - Material matching (Voyage 1024D of `VisionAnalysis.material_type + category + subcategory`)

**Note (2026-04)**: All image embeddings now live **exclusively in the VECS collections** (`vecs.image_*_embeddings`, halfvec). The former dual-store columns on `document_images` (`visual_clip_embedding_512`, `color_embedding_256`, `texture_embedding_256`, `application_embedding_512`, `multimodal_fusion_embedding_2688`) were dropped — they had been broken since the CLIP→SLIG dimension change. Presence is tracked via boolean flags on `document_images` (`has_slig_embedding`, `has_understanding_embedding`, `has_color_slig`, `has_texture_slig`, `has_style_slig`, `has_material_slig`) for O(1) lookup. Text embeddings remain in `document_chunks.text_embedding`.

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

**What happens with query understanding (DEFAULT):**
1. GPT-4o-mini parses the query
2. Extracts filters:
   - material_type: "ceramic tiles"
   - properties: ["waterproof", "outdoor"]
   - finish: "matte"
   - colors: ["light beige"]
   - application: "patio"
3. Multi-vector search executes with 6 embeddings + filters
4. Returns highly accurate, filtered results

---

## 🔍 Search Strategies

### Multi-Vector Search (⭐ RECOMMENDED DEFAULT)

**Endpoint:** `POST /api/rag/search?strategy=multi_vector`

**Features:**
- 7 VECS-based embeddings with intelligent weighting (SLIG SigLIP2 768D + Voyage AI 1024D × 6)
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

All API endpoints require JWT authentication via the `Authorization: Bearer YOUR_JWT_TOKEN` header.

Get your token from:
1. Frontend application (automatic)
2. Supabase authentication
3. `/auth/login` endpoint

---

## 📊 Response Format

All endpoints return JSON with a consistent structure indicating success/failure, results array, processing metadata, weights applied, filters applied, and the search type used.

---

## 🚀 Getting Started

1. **Get API Access**
   - Sign up at [materialshub.gr](https://materialshub.gr)
   - Get your JWT token from the dashboard

2. **Make Your First Request**
   - POST to `https://v1api.materialshub.gr/api/rag/search?strategy=multi_vector` with your query and workspace_id

3. **Explore Interactive Docs**
   - Visit [https://v1api.materialshub.gr/docs](https://v1api.materialshub.gr/docs)
   - Try out endpoints directly in the browser

---

## 📖 Additional Resources

- **Search Strategies Guide**: [docs/search-strategies.md](./search-strategies.md)
- **Multi-Vector Enhancement Summary**: [docs/embedding-generation-improvements.md](./embedding-generation-improvements.md)
- **Platform Overview**: [docs/README.md](./README.md)
- **Deployment Guide**: [docs/deployment-guide.md](./deployment-guide.md)

---

**Questions?** Contact support or check the interactive documentation at `/docs`.
