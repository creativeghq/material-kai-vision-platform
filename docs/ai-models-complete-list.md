# Complete AI Models Inventory

**Last Updated**: 2026-05-02
**Version**: 4.0.0
**Status**: Production (post-Qwen-removal migration)

---

## 📊 AI Models by Provider

### 1. Anthropic (Claude) — PRIMARY VISION + CHUNKING + AGENTS

#### Claude Opus 4.7
- **Use Cases**:
  - **Vision analysis (PRIMARY)** — segmentation, image classification, material analysis, vision_analysis JSON via Anthropic tool use
  - Product discovery from PDFs (Stage 0)
  - Deep metadata extraction
  - Quality validation
  - Web scraping product discovery
  - XML field mapping
  - KAI agent (default)
- **Schema enforcement**: `VisionAnalysis` Pydantic model + `VISION_ANALYSIS_TOOL` (`app/models/vision_analysis.py`)
- **Context**: 200,000 tokens (1M with extended-context beta)
- **Cost**: $15 input / $75 output per 1M tokens
- **Performance**: Highest accuracy for complex reasoning + vision

#### Claude Sonnet 4.6
- **Use Cases**:
  - **Chunking (PRIMARY)** — `Settings.chunking_primary_model` default since 2026-05-01
  - Mid-tier reasoning where Opus is overkill
- **Context**: 200,000 tokens
- **Cost**: $3 input / $15 output per 1M tokens
- **Why for chunking**: chunking is at the quality ceiling — Opus would be 5× cost for marginal gain

#### Claude Haiku 4.5
- **Use Cases**:
  - Demo agent (fast responses)
  - Price-monitoring product-identity classifier (with few-shot from `match_corrections`)
  - Saved-search semantic dedupe
  - Quick validation tasks
- **Context**: 200,000 tokens
- **Cost**: $0.80 input / $4 output per 1M tokens
- **Performance**: 3× faster than Opus, 90%+ accuracy

---

### 2. Voyage AI — SOLE TEXT EMBEDDER + UNDERSTANDING EMBEDDINGS

#### voyage-4
- **Use Cases**:
  - Text chunk embeddings (`text_embedding_1024`)
  - Product text embeddings (name + description + metadata)
  - Semantic search query embeddings
  - **Understanding embeddings** — embeds `serialize_vision_analysis_to_text(VisionAnalysis)` from Claude Opus 4.7 vision pass
- **Dimensions**: 1024D (stored as halfvec in VECS)
- **Dict key**: `text_1024`
- **Cost**: $0.06 per 1M tokens
- **Provenance**: `embedding_model` + `schema_version` persisted on every row for drift detection
- **OpenAI fallback**: DISABLED for understanding path (would produce mixed-vector VECS collections)

---

### 3. HuggingFace Inference Endpoints

#### SLIG (SigLIP2 ViT-SO400M) — VISUAL EMBEDDINGS
- **Use Cases**:
  - 5 specialized 768D visual embeddings per image (visual, color, texture, style, material)
  - Image-text similarity via similarity mode
  - Visual search
  - Multi-vector search
- **Dimensions**: 768D per type (halfvec in VECS)
- **Modes**: `zero_shot`, `image_embedding`, `text_embedding`, `similarity`
- **Endpoint**: `mh-siglip2` (namespace: basiliskan)
- **Cost**: HuggingFace endpoint with auto-pause
- **Performance**: superior to legacy CLIP 512D and SigLIP-SO400M 1152D (both retired 2026-04)

**5 Embedding Types Generated** (all 768D → VECS, all halfvec):
1. **Visual** → `image_slig_embeddings` (producer key `visual_768`)
2. **Color** → `image_color_embeddings` (producer key `color_slig_768`)
3. **Texture** → `image_texture_embeddings` (producer key `texture_slig_768`)
4. **Style** → `image_style_embeddings` (producer key `style_slig_768`)
5. **Material** → `image_material_embeddings` (producer key `material_slig_768`)

Plus an **Understanding Embedding** (1024D Voyage AI from Claude Opus 4.7 `vision_analysis` JSON) → `image_understanding_embeddings` for spec-based semantic search.

#### Chandra v2 (Datalab) — SOLE OCR ENGINE
- **Use Cases**:
  - Stage 1.5 page-level OCR
  - Phase 3 per-image OCR for text-bearing images
- **Retry strategy**: 3 attempts at temperatures 0.0 / 0.1 / 0.2 (jittering breaks the model's sticky-prose state, lifts success rate to >95%)
- **Failure marker**: `OCRResult.method='chandra_failed'` — consumers must check `method`, not emptiness
- **Per-attempt metrics**: `chandra_ocr_metrics` table
- **Endpoint**: HuggingFace, auto-pause
- **Replaced**: pytesseract + EasyOCR (both removed entirely 2026-05 — pytesseract had been broken in prod for months)

---

### 4. OpenAI — OPTIONAL ALTERNATIVES (NOT VISION)

#### GPT-5
- **Use Cases**:
  - Product discovery (alternative to Claude Opus 4.7)
  - Conversational AI agents (optional)
- **Cost**: TBD

#### GPT-4o
- **Use Cases**:
  - Product discovery (alternative)
- **Context**: 128,000 tokens
- **Cost**: $2.50 input / $10.00 output per 1M tokens

#### text-embedding-3-small (RETIRED FROM PRODUCTION 2026-04)
- **Status**: Retired. Voyage AI `voyage-4` is the sole production text embedder.
- **Used only by**: legacy CI changelog workflow
- **Dimensions**: 1536D (historical)

---

### 5. Replicate (14 Models for Interior Design)

#### Text-to-Image Models (7 models)

1. **FLUX.1-dev** — `black-forest-labs/flux-dev`, $0.025/gen, ✅
2. **FLUX.1-schnell** — $0.015/gen, ✅
3. **SDXL (Stable Diffusion XL)** — $0.020/gen, ✅
4. **Playground v2.5** — `playgroundai/playground-v2.5-1024px-aesthetic`, $0.010/gen, ✅
5. **Stable Diffusion 3** — `stability-ai/stable-diffusion-3`, $0.055/gen, ✅
6. **Kandinsky 2.2** — $0.015/gen, ✅
7. **Proteus v0.2** — $0.018/gen, ✅

#### Image-to-Image Models (7 models)

**Production-Ready**:
1. **ComfyUI Interior Remodel** — `jschoormans/comfyui-interior-remodel`, $0.020/gen, ✅
2. **Interiorly Gen1 Dev** — `julian-at/interiorly-gen1-dev`, $0.015/gen, ✅
3. **Designer Architecture** — `davisbrown/designer-architecture`, $0.018/gen, ✅

**Experimental**: Interior AI, Interior V2, Adirik Interior Design, Interior Design SDXL

---

### 6. Other API-Backed Vision / Search Tools

| Tool | Provider | Purpose |
|------|----------|---------|
| Perplexity Sonar / Sonar-Pro | Perplexity | Price discovery (web search with deep page reading) |
| DataForSEO Merchant | DataForSEO | Google Shopping merchant discovery |
| Firecrawl | Firecrawl | URL scrape + Pydantic-extracted price verification |
| WorldLabs Marble | WorldLabs | 3D Gaussian Splat world generation from images |
| Anthropic `web_search_20250305` | Anthropic | B2B manufacturer search (claude-haiku-4-5 + web-search beta) |

---

## 📈 Model Usage by Feature

### PDF Processing Pipeline
- **Stage 0 (Product Discovery)**: Claude Opus 4.7 or GPT-5
- **Stage 1.5 (Layout + Page OCR)**: YOLO + **Chandra v2** (with retry-jitter)
- **Stage 2 (Chunking)**: **Claude Sonnet 4.6** (was Qwen pre-2026-05-01)
- **Stage 3 (Vision Analysis)**: **Claude Opus 4.7 via tool use** (was Qwen pre-2026-05-01 — but Qwen had been 404-ing for months)
- **Stage 3 (Phase 3 per-image OCR)**: **Chandra v2** (text-bearing images only)
- **Stage 5 (Visual + Understanding Embeddings)**: SLIG (5×768D) + Voyage AI (1024D understanding)
- **Stage 6 (Text Embeddings)**: Voyage AI voyage-4 (1024D, sole embedder)

### Web Scraping Integration
- **Product Discovery**: Claude Opus 4.7 (default), GPT-5, or Claude Haiku 4.5

### XML Import
- **Field Mapping**: Claude Opus 4.7

### Interior Design Generation
- **Text-to-Image**: 7 Replicate models (FLUX, SDXL, etc.)
- **Image-to-Image**: 3 production-ready Replicate models
- **Parallel processing**: 3 concurrent generations

### Saved Searches Deduplication
- **Similarity Analysis**: Claude Haiku 4.5

### Price Monitoring
- **Discovery (Stage A)**: Perplexity Sonar-Pro + DataForSEO Merchant (parallel) — Greek marketplaces (Skroutz/Bestprice/Shopflix) + Idealo (DACH/IT/UK/ES/FR)
- **Verification (Stage B)**: Firecrawl + Pydantic `PriceExtraction` schema
- **Identity classifier**: Claude Haiku 4.5 with few-shot from `match_corrections`

### B2B Manufacturer Search
- **Tool**: Anthropic `web_search_20250305` (claude-haiku-4-5 + beta header)

---

## 💰 Cost Optimization Strategy

### High-Volume Operations (Use Cheaper Models)
- **Quick classification**: Claude Haiku 4.5 ($0.80/1M tokens)
- **Chunking**: Claude Sonnet 4.6 ($3/1M input)
- **Text embeddings**: Voyage AI voyage-4 ($0.06/1M tokens)
- **Visual embeddings**: SLIG endpoint (auto-pause)

### High-Accuracy Operations (Use Premium Models)
- **Vision analysis**: Claude Opus 4.7 (tool-use schema-locked)
- **Product discovery**: Claude Opus 4.7
- **Metadata extraction**: Claude Opus 4.7

### Parallel Processing
- **Interior Design**: 3 models concurrently
- **SLIG embeddings**: batch 20 images at a time
- **Image downloads**: 5 concurrent

---

## 🎯 Model Selection Guidelines

### When to Use Claude Opus 4.7
- Vision analysis (tool-use schema enforcement)
- Complex reasoning, high accuracy
- Detailed metadata extraction
- KAI agent default

### When to Use Claude Sonnet 4.6
- Chunking (default since 2026-05-01)
- Mid-tier reasoning where Opus is overkill

### When to Use Claude Haiku 4.5
- Simple classification (price-monitoring identity classifier)
- Quick validation
- High-volume operations
- Demo agent

### When to Use GPT-4o/GPT-5
- Alternative product discovery (load balancing)
- Optional agent fallback
- **Not used for vision** (Anthropic-only post-2026-05-01)

### When to Use SLIG (SigLIP2)
- Visual similarity search (5 specialized 768D types)
- High-volume image processing

---

## 📊 Performance Benchmarks

| Model | Use Case | Speed | Accuracy | Cost/Operation |
|-------|----------|-------|----------|----------------|
| Claude Opus 4.7 | Vision analysis (tool use) | 3-8s | schema-locked | $0.05-0.15 |
| Claude Opus 4.7 | Product discovery | 3-5s | 95%+ | $0.05-0.15 |
| Claude Sonnet 4.6 | Chunking | 2-4s | quality ceiling | $0.01-0.04 |
| Claude Haiku 4.5 | Classification | 0.5-1s | 90%+ | $0.001-0.005 |
| GPT-4o | Discovery | 2-4s | 93%+ | $0.04-0.12 |
| Chandra v2 | Page OCR (3-attempt avg) | 1-3s | >95% | endpoint |
| SLIG | Embeddings (5 types) | 0.15-0.4s | 89-94% | endpoint |
| Voyage voyage-4 | Text/understanding embedding | 0.1-0.3s | superior to OAI | $0.06/1M |
| FLUX Dev | Interior design | 5-13s | 92%+ | $0.025 |

---

## 🔄 Model Fallback Strategy

### Vision Analysis
1. **Claude Opus 4.7 via tool use** (PRIMARY — schema-locked)
2. No fallback — Anthropic-only post-2026-05-01

### Product Discovery
1. Claude Opus 4.7 (primary)
2. GPT-5 / GPT-4o (alternative)
3. Claude Haiku 4.5 (tertiary, lower accuracy)

### OCR
1. **Chandra v2 with retry-jitter** (3 attempts, temps 0.0/0.1/0.2)
2. No fallback — `OCRResult.method='chandra_failed'` set on all attempts failing

### Visual Embeddings
1. SLIG SigLIP2 cloud endpoint (primary)
2. 3-attempt retry on dim-mismatch
3. Skip if all attempts fail (graceful degradation, image flagged)

### Text Embeddings
1. Voyage AI voyage-4 (primary, sole)
2. OpenAI text-embedding-3-small (legacy CI changelog only — pinned to 1024D in code if ever called)
3. Understanding path has **no** fallback — disabled to prevent VECS collection drift

---

## 🆕 Recent Model Changes

**2026-05-01 — Qwen removal migration**:
- ❌ Qwen vision models retired (HF endpoint had been 404-ing for months, falling through to Claude)
- ❌ `qwen_endpoint_manager.py` deleted; all `Settings.qwen_*` removed; qwen warmup, dashboard widgets, pricing entries gone
- ✅ Vision moved to **Claude Opus 4.7 via Anthropic tool use** (`VisionAnalysis` Pydantic schema)
- ✅ Chunking moved from Qwen to **Claude Sonnet 4.6**
- ✅ Voyage drift detection: `embedding_model` + `schema_version` on every understanding-embedding row; OpenAI fallback disabled for understanding path
- ✅ `VisionProvider.QWEN` enum value retained for historical row validation

**2026-05-01 — OCR consolidation**:
- ❌ pytesseract + EasyOCR removed entirely (`requirements.txt`, `deploy.yml`, `ocr_service.py`)
- ✅ **Chandra v2** as sole OCR engine, with retry-with-jitter (3 attempts at temps 0.0/0.1/0.2)
- ✅ `chandra_ocr_metrics` table for per-attempt telemetry
- ✅ Phase 3 per-image OCR expanded from icons-only to all text-bearing images

**2026-04 — Embedding consolidation**:
- ✅ All vector columns migrated from `vector` → `halfvec` (50% storage savings)
- ✅ Legacy 1152D SigLIP-SO400M and 512D CLIP collections dropped (100% orphans)
- ✅ Voyage `voyage-4` replaced OpenAI `text-embedding-3-small` (1536D → 1024D)

**Earlier (2025-12)**:
- ✅ Upgraded to Claude Opus 4.7
- ✅ Upgraded to Claude Haiku 4.5
- ✅ SigLIP added as primary visual embedder

---

## 📚 Related Documentation

- [PDF Processing Pipeline](./pdf-processing-pipeline.md) — Detailed pipeline with model usage
- [AI Models Architecture](./ai-models-architecture.md) — Architecture flow + provider table
- [Embedding Generation Improvements](./embedding-generation-improvements.md) — Voyage understanding pipeline
- [Interior Design Models](./interior-design-models.md) — 14 Replicate models
- [Web Scraping Integration](./web-scraping-integration.md) — AI-powered product discovery

---

**Total Investment**: 25+ AI models across 5 providers
**Total Cost Range**: $0.001 - $0.15 per operation (varies by model and task)
**Vision integrity**: schema-locked via Anthropic tool use (post-2026-05-01)
**Uptime**: 99.5%+ (production environment)
