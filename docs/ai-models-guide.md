# AI Models Integration Guide

**Last Updated:** 2026-05-03

Complete reference of all AI models used across the Material KAI Vision Platform.

> **Big change (2026-05-01)**: Vision is now **Anthropic-only**. Qwen has been retired from every vision call site (it had been 404-ing in 0.7s for months and silently falling through to Claude — the migration just made it honest). All segmentation, image classification, vision_analysis, and material analysis runs on `claude-opus-4-7` via Anthropic tool use, with hard schema guarantees via the `VisionAnalysis` Pydantic model.

---

## AI Models Overview

| Model | Provider | Purpose | Capability | Cost (per 1M tokens) |
|-------|----------|---------|-----------|---------------------|
| **Text Generation** |
| Claude Opus 4.7 | Anthropic | **Vision (PRIMARY, tool use)**, product discovery, enrichment, complex reasoning | Highest accuracy + schema-locked vision | $5 input / $25 output |
| Claude Sonnet 4.6 | Anthropic | **Chunking (PRIMARY)**, mid-tier reasoning | Quality ceiling for chunking | $3 input / $15 output |
| Claude Haiku 4.5 | Anthropic | Fast classification, demo agent, price-monitoring identity, vision validation pass (FAST/COST_OPTIMIZED profiles) | Real-time | $1 input / $5 output |
| GPT-4o | OpenAI | Alternative discovery (not vision) | 94%+ accuracy | $2.50 input / $10 output |
| GPT-5 | OpenAI | Alternative discovery / agents (not vision) | Future | TBD |
| **Text Embeddings** |
| voyage-4 | Voyage AI | **PRIMARY, sole** text + understanding embedder | 1024D vectors | $0.06 input |
| text-embedding-3-small | OpenAI | LEGACY (CI changelog only, retired 2026-04 from production); in-code fallback pinned to 1024D so legacy callers can't store wrong-dim text embeddings | 1536D historical | $0.02 input |
| **Visual Embeddings** |
| SLIG (SigLIP2 SO400M, 768D projected) Visual | HuggingFace Endpoint | General visual embeddings | 768D | endpoint |
| SLIG (SigLIP2 SO400M, 768D projected) Color | HuggingFace Endpoint | Color-guided embeddings | 768D | endpoint |
| SLIG (SigLIP2 SO400M, 768D projected) Texture | HuggingFace Endpoint | Texture-guided embeddings | 768D | endpoint |
| SLIG (SigLIP2 SO400M, 768D projected) Style | HuggingFace Endpoint | Style-guided embeddings | 768D | endpoint |
| SLIG (SigLIP2 SO400M, 768D projected) Material | HuggingFace Endpoint | Material-guided embeddings | 768D | endpoint |
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
- Context: 200K tokens (1M with extended context)
- Cost: $5/$25 per 1M tokens

---

### 2. Claude Sonnet 4.6 (Anthropic) — PRIMARY CHUNKING MODEL

**Purpose**: Document chunking (sole primary chunker post-2026-05-01)

**Setting**: `Settings.chunking_primary_model = 'claude-sonnet-4-6'` (was `Qwen/Qwen3.6-35B-A3B-FP8` pre-2026-05-01)

**Why Sonnet for chunking**: chunking is a text task at the quality ceiling — Sonnet matches Opus output quality on chunking work, so the extra Opus spend buys nothing. Qwen had been silently failing for months.

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
- Cost: $1/$5 per 1M tokens

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
- Dimension: 1024D (storage parity with every other embedding column in the platform)
- Latency: 100-300ms
- Cost: $0.06 per 1M tokens

**Hardening (2026-05-01)**: 429 explicit handling with `Retry-After` honoring; `ai_usage_logs` mirror retries twice + ERRORs on persistent failure.

---

### 6-10. SLIG (SigLIP2 SO400M, 768D projected) Specialized Embeddings

**Purpose post-2026-05-04**: SLIG produces ONE per-image visual embedding (768D, `image_slig_embeddings`) via the `mh-slig` HuggingFace endpoint (`basiliskan` namespace, custom HF model `basiliskan/slig`, SigLIP2 SO400M with a 1152D → 768D projection head). The four "specialized" aspect collections (color/texture/style/material) are NOT produced by SLIG anymore — see Aspect Embeddings below.

**Visual (768D) → `image_slig_embeddings`**
- Overall visual appearance, enables visual similarity search
- Producer key: `visual_768`

**Aspect Embeddings (v2, 2026-05-04)** — see [docs/aspect-embeddings-v2-runbook.md](aspect-embeddings-v2-runbook.md).

The four aspect collections are now Voyage `voyage-3` (1024D) text embeddings of deterministic strings derived from `VisionAnalysis` (Claude Opus 4.7's structured output):

| Collection | Aspect text source | Producer key (v2) |
|---|---|---|
| `image_color_embeddings` (1024D) | `VisionAnalysis.colors[]` | `color_aspect_1024` |
| `image_texture_embeddings` (1024D) | `VisionAnalysis.textures[] + finish` | `texture_aspect_1024` |
| `image_style_embeddings` (1024D) | `VisionAnalysis.style + surface_pattern + applications` | `style_aspect_1024` |
| `image_material_embeddings` (1024D) | `VisionAnalysis.material_type + category + subcategory` | `material_aspect_1024` |

Pre-v2 these collections held 768D SLIG-blend vectors (computed as `0.7-0.9 × base_image + 0.1-0.3 × fixed_global_text_for_aspect`). The pre-v2 vectors carried near-zero independent signal because the text portion was the same fixed string for every image regardless of content — they were ~80% identical to `image_slig_embeddings` and to each other. Producer keys during the rollout window: `color_slig_768` / `texture_slig_768` / `style_slig_768` / `material_slig_768` (legacy, retained behind feature flag `EMBED_ASPECTS_FROM_VISION_ANALYSIS`).

Plus the **Understanding Embedding** (1024D Voyage AI from Claude Opus 4.7 `vision_analysis` JSON) → `image_understanding_embeddings`.

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

**Storage**: `document_images` columns — `ocr_text`, `ocr_blocks` (per-fragment bbox in image-local coords), `ocr_failed`, `ocr_attempts`, `ocr_skipped_reason`. **NEVER consumed by chunker** (Stage 1.5 is canonical text source). Phase 3 OCR runs *after* `vision_analysis` ([stage_3_images.py:485-553](mivaa-pdf-extractor/app/api/pdf_processing/stage_3_images.py#L485-L553)), so it does NOT enrich the vision prompt — it is consumed by icon-metadata extraction and image-search labels only.

---

### 12. 7-Vector Search RAG (Claude Opus 4.7)

**Purpose**: Retrieval-Augmented Generation with multi-vector search

**Vectors** (post-2026-05-04):
1. Text (Voyage 1024D) — `text_embedding_1024` on chunks + products
2. Visual (SLIG 768D) — `image_slig_embeddings`
3. Color (Voyage 1024D, was SLIG 768D pre-v2) — `image_color_embeddings`
4. Texture (Voyage 1024D, was SLIG 768D pre-v2) — `image_texture_embeddings`
5. Style (Voyage 1024D, was SLIG 768D pre-v2) — `image_style_embeddings`
6. Material (Voyage 1024D, was SLIG 768D pre-v2) — `image_material_embeddings`
7. Understanding (Voyage 1024D) — `image_understanding_embeddings`

**Synthesis**: Claude Opus 4.7 (200K context)

**Performance**:
- Retrieval latency: 300-500ms (parallel execution)
- Accuracy: 90%+ (multi-vector fusion)

---

## 📊 Model Usage by Pipeline Stage

| Stage | Primary Model | Notes |
|-------|---------------|-------|
| Discovery | Claude Opus 4.7 (or GPT-5) | |
| Layout + Page OCR | YOLO + **Chandra v2** | retry-with-jitter |
| Chunking | **Claude Sonnet 4.6** | was Qwen pre-2026-05-01 |
| Vision (primary) | **Claude Opus 4.7 (tool use)** | was Qwen pre-2026-05-01 |
| Vision (validation pass) | Claude Opus 4.7 *or* Claude Haiku 4.5 | fires when primary confidence < threshold OR primary fails. DEFAULT/HIGH_ACCURACY → Opus; FAST/COST_OPTIMIZED → Haiku. Set via `classification_validation_model`. |
| Phase 3 per-image OCR | **Chandra v2** | text-bearing images only; runs AFTER vision |
| Visual Embeddings | SLIG (SigLIP2 SO400M (768D projected), 5 types, 768D) | |
| Understanding Embedding | Voyage AI voyage-4 (1024D) | from Claude vision_analysis JSON, parallel with Visual Embeddings |
| Text Embeddings | Voyage AI voyage-4 (1024D) | sole text embedder |

---

## 💰 Cost Optimization

**Strategies**:
1. **Claude Sonnet for chunking** — Sonnet matches Opus output quality on chunking, so paying for Opus on this stage buys nothing
2. **Claude Haiku for high-volume classification** — ~5× cheaper than Opus on input, ~5× on output
3. **Voyage AI for text + understanding** — superior to OpenAI at $0.06/1M
4. **SLIG cloud endpoint with auto-pause** — pay-as-you-process
5. **Chandra v2 retry caps at 3** — most pages succeed on attempt 1

**Example Cost per PDF** (recomputed at current Anthropic pricing — Opus 4.7 at $5/$25, Haiku 4.5 at $1/$5):
- Small PDF (10 pages): $0.10-$0.25
- Medium PDF (50 pages, 25 images): $0.20-$0.40
- Large PDF (200 pages, 100 images): $1.00-$2.50

The canonical 100-page / 50-image reference workload lands at ~$0.36 — see the [AI Models Architecture](./ai-models-architecture.md) cost table for the line-item breakdown.

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
- Per PDF: $0.10-$2.50 (size-dependent, post-pricing-correction 2026-05-03)
- Per search: $0.001-$0.02
- Per image (vision): $0.02-$0.07

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
1. **Voyage voyage-4** (PRIMARY, sole) — All production text + understanding embeddings (1024D)
2. text-embedding-3-small — Retired 2026-04 (CI changelog only); in-code fallback pinned to 1024D so legacy 1536D callers can't silently store wrong-dim text embeddings

### Visual Embeddings
1. **SLIG (SigLIP2 SO400M, 768D projected)** (PRIMARY) — 5 specialized 768D types
2. 3-attempt retry on dim-mismatch
3. Skip + flag if all fail

### Text Generation
1. **Claude Opus 4.7** — Vision, complex reasoning, KAI agent
2. **Claude Sonnet 4.6** — Chunking, mid-tier
3. **Claude Haiku 4.5** — Fast classification, demo agent
4. **GPT-4o / GPT-5** — Alternative discovery (not vision)

---

**Last Updated**: 2026-05-03
**Version**: 4.1.0
**Status**: Production
