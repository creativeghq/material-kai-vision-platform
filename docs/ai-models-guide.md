# AI Models Integration Guide

**Last Updated:** 2026-06-13

> **⚠️ 2026-06-13:** PDF layout/OCR is now a single **PaddleOCR-VL** two-stage structural pass (`PaddlePaddle/PaddleOCR-VL-1.6`, 0.9B: PP-DocLayoutV2 RT-DETR + 0.9B VLM) — **Surya-2 was deleted** (and Surya-2 had earlier replaced **YOLO + Chandra + `merge_layout`**). It runs before discovery (structure-first) and is hosted on **Modal**, not HuggingFace. Active endpoints are **SLIG on Modal + PaddleOCR-VL on Modal** — HuggingFace hosts nothing in this platform anymore. Read "PaddleOCR-VL on Modal" wherever YOLO/Chandra/Surya appear below. See [ai-models-complete-list.md](./ai-models-complete-list.md).

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
| SLIG (SigLIP2 base, 768D) Visual | Modal Endpoint | General visual embeddings | 768D | endpoint |
| SLIG (SigLIP2 base, 768D) Color | Modal Endpoint | Color-guided embeddings | 768D | endpoint |
| SLIG (SigLIP2 base, 768D) Texture | Modal Endpoint | Texture-guided embeddings | 768D | endpoint |
| SLIG (SigLIP2 base, 768D) Style | Modal Endpoint | Style-guided embeddings | 768D | endpoint |
| SLIG (SigLIP2 base, 768D) Material | Modal Endpoint | Material-guided embeddings | 768D | endpoint |
| **Layout + OCR** |
| PaddleOCR-VL 1.6 (0.9B) | PaddlePaddle (Modal) | **SOLE LAYOUT + OCR ENGINE** — structural pass (PP-DocLayoutV2 RT-DETR + 0.9B VLM), runs before discovery | layout + OCR + figure boxes, ~1-3s/page warm | Modal GPU (scale-to-zero) |

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

### 6-10. SLIG (SigLIP2 base, 768D) Specialized Embeddings

**Purpose post-2026-05-04**: SLIG produces ONE per-image visual embedding (768D, `image_slig_embeddings`) via the SLIG Modal endpoint (app `slig`, custom model `basiliskan/slig` duplicating `google/siglip2-base-patch16-512`, native 768D, no projection head). The four "specialized" aspect collections (color/texture/style/material) are NOT produced by SLIG anymore — see Aspect Embeddings below.

**Visual (768D) → `image_slig_embeddings`**
- Overall visual appearance, enables visual similarity search
- Producer key: `visual_768`

**Aspect Embeddings**

The four aspect collections are now Voyage `voyage-4` (1024D) text embeddings of deterministic strings derived from `VisionAnalysis` (Claude Opus 4.7's structured output):

| Collection | Aspect text source | Producer key (v2) |
|---|---|---|
| `image_color_embeddings` (1024D) | `VisionAnalysis.colors[]` | `color_aspect_1024` |
| `image_texture_embeddings` (1024D) | `VisionAnalysis.textures[] + finish` | `texture_aspect_1024` |
| `image_style_embeddings` (1024D) | `VisionAnalysis.style + surface_pattern + applications` | `style_aspect_1024` |
| `image_material_embeddings` (1024D) | `VisionAnalysis.material_type + category + subcategory` | `material_aspect_1024` |

Pre-v2 these collections held 768D SLIG-blend vectors (computed as `0.7-0.9 × base_image + 0.1-0.3 × fixed_global_text_for_aspect`). The pre-v2 vectors carried near-zero independent signal because the text portion was the same fixed string for every image regardless of content — they were ~80% identical to `image_slig_embeddings` and to each other. Producer keys `color_slig_768` / `texture_slig_768` / `style_slig_768` / `material_slig_768` were legacy keys from this pre-v2 path — **removed** in the v2 rollout cleanup. The producer no longer emits them; consumers no longer accept them.

Plus the **Understanding Embedding** (1024D Voyage AI from Claude Opus 4.7 `vision_analysis` JSON) → `image_understanding_embeddings`.

**Hardening (2026-05-01)**:
- 3-attempt retry on dim-mismatch (was silent abort — single wrong-dim response caused mass data loss)
- Atomic specialized VECS upsert: writes all 4 vectors first, then sets flags only for those that landed

**Performance**:
- Dimension: 768D (specialized) / 1024D (understanding)
- Latency: 150-400ms per image
- Cost: Modal endpoint, scale-to-zero

---

### 11. PaddleOCR-VL 1.6 — SOLE LAYOUT + OCR ENGINE (structural pass)

**Files**:
- `mivaa-pdf-extractor/app/services/pdf/paddleocr_endpoint_manager.py` (`PaddleOCRManager`; `run_structural_pass`=page, `run_block_ocr`=block)
- `mivaa-pdf-extractor/app/services/pdf/paddleocr_pipeline.py` (maps `/parse` JSON onto the unchanged `document_layout_analysis.layout_elements[]` schema)
- `mivaa-pdf-extractor/modal_app/paddleocr_vl.py` (the Modal app)

**Purpose**: The whole layout+OCR backbone — Stage 1 document-level structural pass (layout + reading order + OCR + figure boxes) AND Phase 3 per-image OCR. `PaddlePaddle/PaddleOCR-VL-1.6` (0.9B) is a **two-stage** parser: PP-DocLayoutV2 (RT-DETR detector + pointer network) gives region bboxes + labels + reading order; the 0.9B VLM recognizes content (text, tables→markdown, formulas→LaTeX, charts). Hosted **in-process on Modal** (`paddleocr[doc-parser]` on `paddlepaddle-gpu`, NOT vLLM).

**Replaced**: Surya-2 (2026-06-13) — tighter RT-DETR crop boxes + dedicated reading order; validated ~1-3s/page warm, near-perfect Greek, figure boxes within ~8px. (Surya-2 had earlier replaced YOLO + Chandra + `merge_layout`; pytesseract + EasyOCR were removed before that in 2026-05.) `surya_endpoint_manager.py`, `surya_blocks.py`, `modal_app/surya_vllm.py` + all `surya_*` config are deleted.

**Structure-first**: the structural pass runs as Stage 1, **before discovery**, persisting `document_layout_analysis` rows with `processing_version='paddleocr-vl'`. Discovery, Stage 2 chunking, and Stage 3 crops all read reading-order text from that one cache.

**Contract** (custom, NOT OpenAI/vLLM): `GET /health` (unauth warmup probe) + `POST /parse {image_b64, mode}` → `{"regions":[{bbox:[x0,y0,x1,y1] px, label, content, order}], width, height}`. `mode=page` for the structural pass, `mode=block` for per-crop OCR. Pixel bboxes normalized to 0..1 at the parser boundary. PP-DocLayout labels map onto the existing `region_type` vocab via `PADDLE_LABEL_TO_REGION_TYPE`; `IMAGE`/`FIGURE`/`chart` are the product-crop sources. Table content (markdown) preserved in `metadata.html`.

**OCR is PaddleOCR too**: `ocr_service._call_paddleocr` (via `run_structural_pass` on the crop) backs Phase-3 per-image OCR + icon metadata + the admin re-OCR endpoint. `ocr_engine` setting = `paddleocr`.

**Failure marker**: `OCRResult.method='paddleocr_failed'` (not empty list). Consumers must check `method`, not emptiness, to distinguish failure from "no text on page".

**Per-call metrics**: `paddleocr_metrics` table.

**Phase 3**: `_run_phase_3_ocr_for_product` runs PaddleOCR block OCR on every text-bearing image:
- region_type ∈ {TABLE, TEXT, TITLE, CAPTION}: OCR'd
- `embedded` with `metadata.text_detected=True`: OCR'd
- `full_render`: SKIPPED (Stage 1 already covered the page)
- photo / IMAGE-region crop: SKIPPED (`ocr_skipped_reason='photo_not_text_bearing'`)

**Storage**: `document_images` columns — `ocr_text`, `ocr_blocks` (per-fragment bbox in image-local coords), `ocr_failed`, `ocr_attempts`, `ocr_skipped_reason`. **NEVER consumed by chunker** (Stage 1 is canonical text source). Phase 3 OCR runs *after* `vision_analysis`, so it does NOT enrich the vision prompt — it is consumed by icon-metadata extraction and image-search labels only.

**Host — Modal only**: app `paddleocr-vl` at `https://basilakis--paddleocr-vl-paddleservice-web.modal.run`. GPU L4, `min_containers=0` + `scaledown_window=120` (=$0 idle), `max_containers=4`, forces `device="gpu"`. Cold start ~90s, paid once per job at warmup. Only required runtime secret: **`PADDLEOCR_MODAL_API_KEY`** (URL baked as config default).

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
| Layout + Page OCR + figure boxes (Stage 1) | **PaddleOCR-VL 1.6** (Modal) | structure-first — runs BEFORE discovery |
| Discovery | Claude Opus 4.7 (or GPT-5) | reads PaddleOCR reading-order text from the Stage 1 cache |
| Chunking | **Claude Sonnet 4.6** | was Qwen pre-2026-05-01 |
| Vision (primary) | **Claude Opus 4.7 (tool use)** | was Qwen pre-2026-05-01 |
| Vision (validation pass) | Claude Opus 4.7 *or* Claude Haiku 4.5 | fires when primary confidence < threshold OR primary fails. DEFAULT/HIGH_ACCURACY → Opus; FAST/COST_OPTIMIZED → Haiku. Set via `classification_validation_model`. |
| Phase 3 per-image OCR | **PaddleOCR-VL block OCR** | text-bearing images only; runs AFTER vision |
| Visual Embeddings | SLIG (SigLIP2 base 768D, 5 types, 768D) | |
| Understanding Embedding | Voyage AI voyage-4 (1024D) | from Claude vision_analysis JSON, parallel with Visual Embeddings |
| Text Embeddings | Voyage AI voyage-4 (1024D) | sole text embedder |

---

## 💰 Cost Optimization

**Strategies**:
1. **Claude Sonnet for chunking** — Sonnet matches Opus output quality on chunking, so paying for Opus on this stage buys nothing
2. **Claude Haiku for high-volume classification** — ~5× cheaper than Opus on input, ~5× on output
3. **Voyage AI for text + understanding** — superior to OpenAI at $0.06/1M
4. **SLIG Modal endpoint with scale-to-zero** — pay-as-you-process
5. **PaddleOCR-VL on Modal scales to zero** — $0 idle; cold start (~90s) paid once per job at warmup, then ~1-3s/page warm

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
- `SLIG_MODAL_URL` — SLIG Modal endpoint URL
- `SLIG_MODAL_API_KEY` — SLIG Modal bearer (shared `paddleocr-api-key` Modal secret)
- `PADDLEOCR_MODAL_API_KEY` — Modal PaddleOCR-VL endpoint key (the only required runtime var for the structural pass; the Modal URL is baked as a config default). CI auto-deploys the Modal app on `modal_app/**` changes via `MODAL_TOKEN_ID` / `MODAL_TOKEN_SECRET`.

> **Removed (2026-05-01)**: `QWEN_ENDPOINT_URL`, `QWEN_ENDPOINT_TOKEN`, and all `Settings.qwen_*` fields are gone. The HF Qwen endpoint env vars on the systemd unit can be deleted at the next deploy.

The model configuration maps each task to its designated model:
- `discovery` → `claude-opus-4-7`
- `chunking` → `claude-sonnet-4-6`
- `vision` → `claude-opus-4-7` (with `VISION_ANALYSIS_TOOL`)
- `validation` → `claude-haiku-4-5`
- `text_embeddings` → `voyage-4`
- `understanding_embeddings` → `voyage-4`
- `visual_embeddings` → `SLIG`
- `ocr` → `paddleocr` (PaddleOCR-VL structural pass on Modal)

---

## 📈 Performance Benchmarks

**Accuracy**:
- Product detection: 95%+
- Material recognition: schema-locked via tool use (no malformed payloads)
- Metafield extraction: 88%+
- Search relevance: 85%+
- Layout + OCR: PaddleOCR-VL 1.6 structural pass (RT-DETR boxes + 0.9B VLM; near-perfect Greek, figure boxes within ~8px)

**Speed**:
- Product discovery: 3-5 seconds
- Vision analysis (Opus tool use): 3-8 seconds per image
- Chunking (Sonnet): 1-2 seconds per 10K chars
- Layout + OCR (PaddleOCR-VL avg): ~1-3 seconds per page warm (~90s cold start, once per job)
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

### Layout + OCR
1. **PaddleOCR-VL 1.6 structural pass on Modal** (PRIMARY, sole) — PP-DocLayoutV2 RT-DETR + 0.9B VLM, runs before discovery
   - Failure → `OCRResult.method='paddleocr_failed'`

### Text Embeddings
1. **Voyage voyage-4** (PRIMARY, sole) — All production text + understanding embeddings (1024D)
2. text-embedding-3-small — Retired 2026-04 (CI changelog only); in-code fallback pinned to 1024D so legacy 1536D callers can't silently store wrong-dim text embeddings

### Visual Embeddings
1. **SLIG (SigLIP2 base, 768D)** (PRIMARY) — 5 specialized 768D types
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
