# AI Models Integration Guide

**Last Updated:** 2026-05-02

Complete reference of all AI models used across the Material KAI Vision Platform.

> **Big change (2026-05-01)**: Vision is now **Anthropic-only**. Qwen has been retired from every vision call site (it had been 404-ing in 0.7s for months and silently falling through to Claude — the migration just made it honest). All segmentation, image classification, vision_analysis, and material analysis runs on `claude-opus-4-7` via Anthropic tool use, with hard schema guarantees via the `VisionAnalysis` Pydantic model.

---

## AI Models Overview

| Model | Provider | Purpose | Capability | Cost (per 1M tokens) |
|-------|----------|---------|-----------|---------------------|
| **Text Generation** |
| Claude Opus 4.7 | Anthropic | **Vision (PRIMARY, tool use)**, product discovery, enrichment, complex reasoning | Highest accuracy + schema-locked vision | $15 input / $75 output |
| Claude Sonnet 4.6 | Anthropic | **Chunking (PRIMARY)**, mid-tier reasoning | Quality ceiling for chunking | $3 input / $15 output |
| Claude Haiku 4.5 | Anthropic | Fast classification, demo agent, price-monitoring identity | Real-time | $0.80 input / $4 output |
| GPT-4o | OpenAI | Alternative discovery (not vision) | 94%+ accuracy | $2.50 input / $10 output |
| GPT-5 | OpenAI | Alternative discovery / agents (not vision) | Future | TBD |
| **Text Embeddings** |
| voyage-4 | Voyage AI | **PRIMARY** text + understanding embeddings | 1024D vectors | $0.06 input |
| voyage-3 | Voyage AI | Alternative text embeddings | 1024D vectors | $0.06 input |
| voyage-3-lite | Voyage AI | Lightweight embeddings | 512D vectors | $0.02 input |
| text-embedding-3-small | OpenAI | **LEGACY** (CI changelog only, retired 2026-04) | 1536D vectors | $0.02 input |
| **Visual Embeddings** |
| SLIG (SigLIP2) Visual | HuggingFace Endpoint | General visual embeddings | 768D | endpoint |
| SLIG (SigLIP2) Color | HuggingFace Endpoint | Color-guided embeddings | 768D | endpoint |
| SLIG (SigLIP2) Texture | HuggingFace Endpoint | Texture-guided embeddings | 768D | endpoint |
| SLIG (SigLIP2) Style | HuggingFace Endpoint | Style-guided embeddings | 768D | endpoint |
| SLIG (SigLIP2) Material | HuggingFace Endpoint | Material-guided embeddings | 768D | endpoint |
| **OCR** |
| Chandra v2 | Datalab (HuggingFace) | **SOLE OCR ENGINE** (with retry-jitter) | >95% success | endpoint |

---

## Model Details

### 1. Claude Opus 4.7 (Anthropic) — PRIMARY VISION MODEL

**Purpose**: Schema-locked vision analysis + complex reasoning

**Vision capabilities** (post-2026-05-01):
- Image classification (material vs non-material)
- Material analysis (vision_analysis JSON for understanding embeddings)
- Segmentation
- OCR-aware quality scoring
- Material property extraction
- Color and texture analysis

**Schema enforcement**: Uses Anthropic tool use with the `VisionAnalysis` Pydantic schema (`app/models/vision_analysis.py`) and `VISION_ANALYSIS_TOOL`. The tool-use mechanism guarantees schema adherence — eliminates fragile JSON regex recovery, protects Voyage's understanding-embedding space from drift.

**Other capabilities**:
- Product discovery from PDFs / web scraping
- XML field mapping
- Quality validation
- KAI agent (default model)

**Performance**:
- Vision accuracy: schema-locked (no malformed payloads)
- Latency: 3-8 seconds per image
- Context: 200K tokens (1M with extended-context beta)
- Cost: $15/$75 per 1M tokens

---

### 2. Claude Sonnet 4.6 (Anthropic) — PRIMARY CHUNKING MODEL

**Purpose**: Document chunking (sole primary chunker post-2026-05-01)

**Setting**: `Settings.chunking_primary_model = 'claude-sonnet-4-6'` (was `Qwen/Qwen3.6-35B-A3B-FP8` pre-2026-05-01)

**Why Sonnet for chunking**: chunking is a text task at the quality ceiling — Opus would be 5× the cost for marginal gain. Qwen had been silently failing for months.

**Capabilities**:
- Semantic chunking
- Layout-aware chunking
- Hybrid (fixed + semantic)

**Performance**:
- Chunk quality: 0.85-0.95
- Latency: 1-2 seconds per 10K chars
- Cost: $3/$15 per 1M tokens

---

### 3. Claude Haiku 4.5 (Anthropic)

**Purpose**: Fast classification, demo agent, price-monitoring identity classifier

**Capabilities**:
- Demo agent (fast responses)
- Price-monitoring identity classifier (with few-shot from `match_corrections`)
- Saved-search semantic dedupe
- Quick validation
- Real-time processing

**Performance**:
- Accuracy: 92%+
- Latency: 500ms-1s
- Cost: $0.80/$4 per 1M tokens

---

### 4. GPT-4o / GPT-5 (OpenAI)

**Purpose**: Alternative product discovery / agents (not vision)

**NOT used for vision** post-2026-05-01 — vision is Anthropic-only.

**Capabilities**:
- Product discovery (alternative to Claude Opus 4.7)
- KAI Agent Hub (optional)

**Performance**:
- Accuracy: 94%+
- Latency: 3-6 seconds
- Cost: GPT-4o $2.50/$10 per 1M tokens; GPT-5 TBD

---

### 5. Voyage AI voyage-4 — SOLE TEXT + UNDERSTANDING EMBEDDER

**Purpose**: All text and understanding embeddings (1024D)

**Capabilities**:
- Convert text to 1024D vectors (stored as halfvec in VECS)
- Enable semantic similarity search
- Supports `document` and `query` input types
- Embeds `serialize_vision_analysis_to_text(VisionAnalysis)` for the understanding-embedding pipeline
- Dict key: `text_1024` (was `text_1536` under OpenAI text-embedding-3-small, retired 2026-04)

**Provenance**: Every row persists `embedding_model` + `schema_version` (in VECS metadata + mirrored on `document_images.understanding_embedding_model` / `understanding_schema_version` and `products.text_embedding_1024_model` / `text_embedding_schema_version`). Enables drift detection and targeted backfill.

**OpenAI fallback**: DISABLED for the understanding path so Voyage and OpenAI vectors never co-exist in the same VECS collection. The OpenAI legacy fallback (if ever invoked) is now pinned to 1024D.

**Performance**:
- Dimension: 1024D
- Latency: 100-300ms
- Cost: $0.06 per 1M tokens

**Hardening (2026-05-01)**: 429 explicit handling with `Retry-After` honoring; `ai_usage_logs` mirror retries twice + ERRORs on persistent failure.

---

### 6-10. SLIG (SigLIP2) Specialized Embeddings

**Purpose**: 5 specialized 768D visual embeddings per image via HuggingFace cloud endpoint (`mh-siglip2`, namespace basiliskan)

**5 Embedding Types** (all 768D halfvec, written directly to VECS):

#### Visual (768D) → `image_slig_embeddings`
- Overall visual appearance, enables visual similarity search
- Producer key: `visual_768`

#### Color (768D) → `image_color_embeddings`
- Text-guided color palette analysis
- Producer key: `color_slig_768`

#### Texture (768D) → `image_texture_embeddings`
- Text-guided surface texture analysis
- Producer key: `texture_slig_768`

#### Style (768D) → `image_style_embeddings`
- Text-guided design aesthetic
- Producer key: `style_slig_768`

#### Material (768D) → `image_material_embeddings`
- Text-guided material classification
- Producer key: `material_slig_768`

Plus an **Understanding Embedding** (1024D Voyage AI from Claude Opus 4.7 `vision_analysis` JSON) → `image_understanding_embeddings`.

**Hardening (2026-05-01)**:
- 3-attempt retry on dim-mismatch (was silent abort — single wrong-dim response caused mass data loss)
- Atomic specialized VECS upsert: writes all 4 vectors first, then sets flags only for those that landed

**Performance**:
- Dimension: 768D (specialized) / 1024D (understanding)
- Latency: 150-400ms per image
- Cost: HuggingFace endpoint, auto-pause enabled

---

### 11. Chandra v2 — SOLE OCR ENGINE

**File**: `mivaa-pdf-extractor/app/services/ocr/chandra_endpoint_manager.py`

**Purpose**: All OCR — page-level (Stage 1.5) and per-image (Phase 3)

**Replaced**: pytesseract + EasyOCR (both removed entirely 2026-05). Pytesseract had been broken on production for months (TESSDATA_PREFIX unset, no traineddata installed). Even when "working" it produced bbox-less text that silently degraded layout-merge to UNCLASSIFIED orphans.

**Retry-with-jitter**: 3 attempts at temperatures 0.0 / 0.1 / 0.2. Chandra freelances ("The image is...") ~50% at temp=0; jittering breaks the sticky-prose state and lifts success rate to >95%.

**Failure marker**: `OCRResult.method='chandra_failed'` (not empty list). Consumers must check `method`, not emptiness, to distinguish failure from "no text on page".

**Per-attempt metrics**: `chandra_ocr_metrics` table — `outcome` (`success`/`success_after_retry`/`failed_prose`/`failed_malformed_json`/`failed_http_error`), `attempt_number`, `temperature`, `latency_ms`, `failure_mode_head`, `caller`.

**Phase 3 expansion (2026-05)**: Was icons-only OCR, regular product images had zero per-image OCR. Now `_run_phase_3_ocr_for_product` runs Chandra v2 on every text-bearing image:
- `yolo_crop` of region_type ∈ {TABLE, TEXT, TITLE, CAPTION}: OCR'd
- `embedded` with `metadata.text_detected=True`: OCR'd
- `full_render`: SKIPPED (Stage 1.5 already covered the page)
- photo / IMAGE-region yolo_crop: SKIPPED (`ocr_skipped_reason='photo_not_text_bearing'`)

**Storage**: `document_images` columns — `ocr_text`, `ocr_blocks` (per-fragment bbox in image-local coords), `ocr_failed`, `ocr_attempts`, `ocr_skipped_reason`. **NEVER consumed by chunker** (Stage 1.5 is canonical text source). Consumed by: vision_analysis prompt enrichment, icon-metadata extraction, image-search labels.

---

### 12. 7-Vector Search RAG (Claude Opus 4.7)

**Purpose**: Retrieval-Augmented Generation with multi-vector search

**Vectors**:
1. Text (Voyage 1024D) — `text_embedding_1024` on chunks + products
2. Visual (SLIG 768D) — `image_slig_embeddings`
3. Color (SLIG 768D) — `image_color_embeddings`
4. Texture (SLIG 768D) — `image_texture_embeddings`
5. Style (SLIG 768D) — `image_style_embeddings`
6. Material (SLIG 768D) — `image_material_embeddings`
7. Understanding (Voyage 1024D) — `image_understanding_embeddings`

**Synthesis**: Claude Opus 4.7 (200K context)

**Performance**:
- Retrieval latency: 300-500ms (parallel execution)
- Accuracy: 90%+ (multi-vector fusion)

---

## 📊 Model Usage by Pipeline Stage

| Stage | Primary Model | Notes |
|-------|---------------|-------|
| 0 — Product Discovery | Claude Opus 4.7 (or GPT-5) | |
| 1.5 — Layout + Page OCR | YOLO + **Chandra v2** | retry-with-jitter |
| 2 — Chunking | **Claude Sonnet 4.6** | was Qwen pre-2026-05-01 |
| 3 — Vision Analysis | **Claude Opus 4.7 (tool use)** | was Qwen pre-2026-05-01 |
| 3 — Phase 3 per-image OCR | **Chandra v2** | text-bearing images only |
| 4 — Text Embeddings | Voyage AI voyage-4 (1024D) | sole text embedder |
| 5 — Visual Embeddings | SLIG (SigLIP2, 5 types, 768D) | |
| 5 — Understanding Embedding | Voyage AI voyage-4 (1024D) | from Claude vision_analysis JSON |
| 9 — Product Validation | Claude Haiku 4.5 / Opus 4.7 | |

---

## 💰 Cost Optimization

**Strategies**:
1. **Claude Sonnet for chunking** — 5× cheaper than Opus, equal quality at the chunking ceiling
2. **Claude Haiku for high-volume classification** — 20× cheaper than Opus
3. **Voyage AI for text + understanding** — superior to OpenAI at $0.06/1M
4. **SLIG cloud endpoint with auto-pause** — pay-as-you-process
5. **Chandra v2 retry caps at 3** — most pages succeed on attempt 1

**Example Cost per PDF**:
- Small PDF (10 pages): $0.40-$0.80
- Medium PDF (50 pages): $1.50-$3.00
- Large PDF (200 pages): $6.00-$12.00

---

## 🔐 API Keys & Configuration

**Required Environment Variables**:

- `ANTHROPIC_API_KEY` — Anthropic Claude API key (vision + chunking + agents)
- `OPENAI_API_KEY` — OpenAI API key (optional alternatives)
- `VOYAGE_API_KEY` — Voyage AI API key (sole text + understanding embedder)
- `SLIG_ENDPOINT_URL` — HuggingFace SLIG endpoint URL
- `SLIG_ENDPOINT_TOKEN` — HuggingFace SLIG endpoint token
- `CHANDRA_ENDPOINT_URL` — HuggingFace Chandra endpoint URL
- `CHANDRA_ENDPOINT_TOKEN` — HuggingFace Chandra endpoint token

> **Removed (2026-05-01)**: `QWEN_ENDPOINT_URL`, `QWEN_ENDPOINT_TOKEN`, and all `Settings.qwen_*` fields are gone. The HF Qwen endpoint env vars on the systemd unit can be deleted at the next deploy.

The model configuration maps each task to its designated model:
- `discovery` → `claude-opus-4-7`
- `chunking` → `claude-sonnet-4-6`
- `vision` → `claude-opus-4-7` (with `VISION_ANALYSIS_TOOL`)
- `validation` → `claude-haiku-4-5`
- `text_embeddings` → `voyage-4`
- `understanding_embeddings` → `voyage-4`
- `visual_embeddings` → `SLIG`
- `ocr` → `Chandra v2`

---

## 📈 Performance Benchmarks

**Accuracy**:
- Product detection: 95%+
- Material recognition: schema-locked via tool use (no malformed payloads)
- Metafield extraction: 88%+
- Search relevance: 85%+
- OCR success rate: >95% (Chandra v2 with retry-jitter)

**Speed**:
- Product discovery: 3-5 seconds
- Vision analysis (Opus tool use): 3-8 seconds per image
- Chunking (Sonnet): 1-2 seconds per 10K chars
- OCR (Chandra v2 avg): 1-3 seconds per page
- Embedding generation: 100-300ms
- Search query: 200-800ms

**Cost**:
- Per PDF: $0.40-$12.00 (size-dependent)
- Per search: $0.001-$0.02
- Per image (vision): $0.05-$0.20

---

## Model Selection Guide

### Vision Analysis
1. **Claude Opus 4.7 with tool use** (PRIMARY, sole) — schema-locked via `VisionAnalysis`
   - No fallback. Anthropic-only post-2026-05-01.

### Chunking
1. **Claude Sonnet 4.6** (PRIMARY)
   - `Settings.chunking_primary_model = 'claude-sonnet-4-6'`

### OCR
1. **Chandra v2 with retry-jitter** (PRIMARY, sole)
   - Failure → `OCRResult.method='chandra_failed'`

### Text Embeddings
1. **Voyage voyage-4** (PRIMARY, sole) — All production text + understanding embeddings
2. Voyage voyage-3-lite — Simple/fast tasks
3. text-embedding-3-small — Retired 2026-04 (CI changelog only)

### Visual Embeddings
1. **SLIG (SigLIP2)** (PRIMARY) — 5 specialized 768D types
2. 3-attempt retry on dim-mismatch
3. Skip + flag if all fail

### Text Generation
1. **Claude Opus 4.7** — Vision, complex reasoning, KAI agent
2. **Claude Sonnet 4.6** — Chunking, mid-tier
3. **Claude Haiku 4.5** — Fast classification, demo agent
4. **GPT-4o / GPT-5** — Alternative discovery (not vision)

---

**Last Updated**: 2026-05-02
**Version**: 4.0.0
**Status**: Production
