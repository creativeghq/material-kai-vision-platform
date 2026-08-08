# AI Models Architecture - Complete Overview

**Last Updated**: 2026-06-13
**Status**: Production

> **⚠️ 2026-06-13:** The PDF layout/OCR engine changed. **Surya-2 was deleted** (and earlier the same day Surya-2 had replaced **YOLO DocParser + Chandra OCR + `merge_layout`**) — the backbone is now a single **PaddleOCR-VL** two-stage parser (`PaddlePaddle/PaddleOCR-VL-1.6`, 0.9B: PP-DocLayoutV2 RT-DETR + 0.9B VLM) that returns layout regions + OCR text + figure boxes in one pass, run **before discovery** (structure-first). It is hosted on **Modal**, NOT HuggingFace. The active endpoints are now **SLIG on Modal + PaddleOCR-VL on Modal** — HuggingFace hosts nothing in this platform anymore. Anywhere below that names YOLO, Chandra, or Surya, read "PaddleOCR-VL structural pass on Modal". See [ai-models-complete-list.md](./ai-models-complete-list.md) + the PaddleOCR section in `CLAUDE.md`.

## Executive Summary

MIVAA Platform uses AI models from **5 providers** for distinct purposes. Vision is **Anthropic-only** (post-2026-05-01 migration);

| Provider | Models Used | Primary Purpose |
|----------|-------------|-----------------|
| **Anthropic** | Claude Opus 4.7, Claude Sonnet 4.6, Claude Haiku 4.5 | Vision analysis (tool-use schema-locked), chunking, agents, validation |
| **Voyage AI** | voyage-4 | Text embeddings (1024D) + understanding embeddings (1024D) — sole text embedder |
| **Google (Modal)** | SigLIP2 base (768D) (SLIG) | Visual embeddings (768D) — cloud endpoint, 5 specialized types |
| **PaddlePaddle (Modal)** | PaddleOCR-VL 1.6 (0.9B: PP-DocLayoutV2 RT-DETR + VLM) | Structural pass — layout + OCR + figure boxes, sole layout/OCR engine (Surya-2/YOLO/Chandra all deleted 2026-06-13) |
| **OpenAI** | GPT-4o, GPT-5 | Optional alternative for product discovery / agents |

---

## Complete Model Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         PDF UPLOAD & PROCESSING                          │
└─────────────────────────────────────────────────────────────────────────┘
                                    ↓
┌─────────────────────────────────────────────────────────────────────────┐
│ STAGE 1 — STRUCTURAL PASS: Layout + Page OCR + figure boxes             │
│   (structure-first — runs BEFORE discovery)                            │
│ Model: PaddleOCR-VL 1.6 (PaddlePaddle on Modal)                        │
│ Two-stage: PP-DocLayoutV2 (RT-DETR + pointer net) → regions/labels/    │
│            reading-order; 0.9B VLM → content (text, tables→md,          │
│            formulas→LaTeX, charts). One /parse call per page.           │
│ Persists: document_layout_analysis (processing_version='paddleocr-vl') │
│ Failure marker: OCRResult.method='paddleocr_failed'                     │
└─────────────────────────────────────────────────────────────────────────┘
                                    ↓
┌─────────────────────────────────────────────────────────────────────────┐
│ DISCOVERY: Product Discovery                                            │
│ Model: Claude Opus 4.7 OR GPT-5                                         │
│ Purpose: Identify products, count pages, map image-to-product           │
│ Reads PaddleOCR reading-order text from the Stage 1 cache (not raw text) │
└─────────────────────────────────────────────────────────────────────────┘
                                    ↓
┌─────────────────────────────────────────────────────────────────────────┐
│ CHUNKING (text)                                                         │
│ Model: Claude Sonnet 4.6             │
│ Setting: Settings.chunking_primary_model = 'claude-sonnet-4-6'          │
│ Why Sonnet: chunking is a text task at the quality ceiling — Sonnet     │
│             matches Opus output quality at lower cost;
│             silently 404-ing for months                                 │
└─────────────────────────────────────────────────────────────────────────┘
                                    ↓
┌─────────────────────────────────────────────────────────────────────────┐
│ VISION: Image Classification + Vision Analysis (per image)              │
│ Primary: Claude Opus 4.7 (Anthropic tool use)                           │
│ Validation pass: confidence < threshold OR primary failure → re-run     │
│   on classification_validation_model (default: claude-opus-4-7)         │
│   Profiles: FAST/COST_OPTIMIZED use claude-haiku-4-5 for validation     │
│ Schema: app.models.vision_analysis.VisionAnalysis (Pydantic)            │
│ Tool:   VISION_ANALYSIS_TOOL                                            │
│ Why tool use: hard schema adherence — eliminates JSON regex recovery,   │
│               protects Voyage's understanding-embedding space from drift│
└─────────────────────────────────────────────────────────────────────────┘
                                    ↓
┌─────────────────────────────────────────────────────────────────────────┐
│ PHASE 3 OCR: Per-image OCR for text-bearing images                      │
│ Model: PaddleOCR-VL block OCR (mode=block on the crop)                  │
│ Runs AFTER vision_analysis. Consumed by: icon-metadata extraction +     │
│   image-search labels. NOT consumed by chunker (Stage 1.5 is canonical) │
│   and NOT a vision_analysis prompt input (vision already ran).          │
│ Filter: yolo_crop ∈ {TABLE,TEXT,TITLE,CAPTION} OR                       │
│         embedded with text_detected=True                                │
│ Stored on document_images: ocr_text, ocr_blocks, ocr_failed,            │
│         ocr_attempts, ocr_skipped_reason                                │
└─────────────────────────────────────────────────────────────────────────┘
                                    ↓
┌─────────────────────────────────────────────────────────────────────────┐
│ IMAGE EMBEDDINGS (6 collections) — VECS-Only, halfvec                   │
│                                                                          │
│ Visual (SLIG SigLIP2 768D) — pixel-similarity:                          │
│   image_slig_embeddings (key: visual_768)                               │
│                                                                          │
│ Aspect (Voyage voyage-4 1024D):                                          │
│   image_color_embeddings    (key: color_aspect_1024)                    │
│   image_texture_embeddings  (key: texture_aspect_1024)                  │
│   image_style_embeddings    (key: style_aspect_1024)                    │
│   image_material_embeddings (key: material_aspect_1024)                 │
│   ↑ Each is the Voyage embedding of a deterministic per-image text      │
│   string derived from VisionAnalysis fields (colors[], textures[]+      │
│   finish, style+surface_pattern+applications, material_type+category).  │
│                                                                          │
│ Understanding (Voyage voyage-4 1024D):                                  │
│   image_understanding_embeddings (key: understanding_1024)              │
│   ↑ Voyage embedding of the full serialized VisionAnalysis text.        │
└─────────────────────────────────────────────────────────────────────────┘
                                    ↓
┌─────────────────────────────────────────────────────────────────────────┐
│ UNDERSTANDING EMBEDDING (1024D) — runs in parallel with VISUAL          │
│ Pipeline: VisionAnalysis JSON →                                         │
│           serialize_vision_analysis_to_text() →                         │
│           Voyage AI voyage-4 (input_type="document") → 1024D            │
│ Provenance persisted: embedding_model, schema_version on every row      │
│ No fallback embedder at all — Voyage or nothing (deleted 2026-08-08)   │
└─────────────────────────────────────────────────────────────────────────┘
                                    ↓
┌─────────────────────────────────────────────────────────────────────────┐
│ TEXT EMBEDDINGS                                                         │
│ Model: Voyage AI voyage-4 (sole text embedder; OpenAI retired 2026-04)  │
│ Output: 1024D vectors, dict key text_1024                               │
│ Input types: "document" for indexing, "query" for search                │
└─────────────────────────────────────────────────────────────────────────┘
                                    ↓
┌─────────────────────────────────────────────────────────────────────────┐
│                         STORAGE (Supabase + VECS)                       │
│ - products (text_embedding_1024 + text_embedding_1024_model +           │
│             text_embedding_schema_version)                              │
│ - document_images (has_*_slig flags + understanding_embedding_model +   │
│                    understanding_schema_version + ocr_*)                │
│ - 6× VECS image collections (1× 768D SLIG visual + 4× 1024D Voyage aspect │
│   color/texture/style/material + 1× 1024D Voyage understanding)        │
│ - document_chunks (text_embedding_1024 — Voyage)                        │
└─────────────────────────────────────────────────────────────────────────┘
                                    ↓
┌─────────────────────────────────────────────────────────────────────────┐
│ SEARCH: 7-vector RAG (Claude Opus 4.7 + Multi-Vector)                   │
│ Models:                                                                 │
│   - Text embeddings: Voyage AI voyage-4 (1024D)                         │
│   - Visual embeddings: 5× SLIG specialized (768D each)                  │
│   - Understanding: Voyage AI 1024D (from VisionAnalysis JSON)           │
│   - Synthesis LLM: Claude Opus 4.7 (200K context)                       │
└─────────────────────────────────────────────────────────────────────────┘
                                    ↓
┌─────────────────────────────────────────────────────────────────────────┐
│ AGENTS: Agent Hub                                                    │
│ Models Available:                                                       │
│   - Claude Opus 4.7 (kai default)                                       │
│   - Claude Haiku 4.5 (demo agent, fast responses)                       │
│   - GPT-5 (advanced reasoning, optional)                                │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 🔍 Detailed Model Breakdown

### 1. **Claude Opus 4.7 — Vision Analysis (PRIMARY)** 🎨

**Files**:
- `mivaa-pdf-extractor/app/models/vision_analysis.py` — Pydantic schema (`VisionAnalysis` + `VISION_ANALYSIS_TOOL`)
- `mivaa-pdf-extractor/app/services/real_image_analysis_service.py`

The vision pipeline calls `claude-opus-4-7` via Anthropic tool use. The tool schema is the `VisionAnalysis` Pydantic model — Anthropic's tool-use enforcement guarantees the response matches the schema, eliminating fragile JSON regex recovery and protecting the understanding-embedding space from drift.

**Used for**:
- Image classification (material vs non-material)
- Material analysis (`vision_analysis` JSON for understanding embeddings)
- Segmentation
- Stage 4 product validation / enrichment
- Product discovery (Stage 0, alternative to GPT-5)
- JARVIS agent (Mastra)

**Cost**: $5.00 per 1M input tokens, $25.00 per 1M output tokens
**Speed**: 3-8 seconds per image
**Output**: Schema-locked JSON via tool use

---

### 2. **Claude Sonnet 4.6 — Chunking** ✂️

**Setting**: `Settings.chunking_primary_model = 'claude-sonnet-4-6'`

Chunking is a text task at the quality ceiling — Sonnet matches Opus output quality on chunking work, so the extra Opus spend buys nothing.

**Cost**: $3.00 per 1M input tokens, $15.00 per 1M output tokens
**Speed**: 2-4 seconds per chunk batch

---

### 3. **Claude Haiku 4.5** ⚡

**Files**:
- `supabase/functions/agent-chat/index.ts` (demo agent)
- `mivaa-pdf-extractor/app/services/integrations/product_identity_service.py` (price-monitoring identity classifier)
- Various low-stakes classifiers

**Used for**:
- Demo agent (fast responses)
- Price-monitoring product-identity classifier (with few-shot from `match_corrections`)
- Saved-search semantic dedupe
- Quick validation tasks

**Cost**: $1.00 per 1M input tokens, $5.00 per 1M output tokens
**Speed**: 1-3 seconds

---

### 4. **Voyage AI voyage-4 — Text & Understanding Embeddings** 📝

**File**: `mivaa-pdf-extractor/app/services/real_embeddings_service.py`

Voyage `voyage-4` is the sole text embedder. It produces 1024D vectors stored as halfvec in VECS. The dict key is `text_1024` (was `text_1536` under OpenAI text-embedding-3-small, which was retired 2026-04).

**Two production uses**:
1. **Chunk + product text embeddings** (`text_embedding_1024`)
2. **Understanding embeddings**: vision_analysis JSON → `serialize_vision_analysis_to_text()` → voyage-4 with `input_type="document"` → 1024D → `image_understanding_embeddings` collection

**Provenance** persisted on every row (`embedding_model`, `schema_version`) so the admin UI / backfill cron can detect drift and stale-schema rows. There is **no fallback embedder** — the Voyage→OpenAI fallback was deleted 2026-08-08, so a second provider's vectors cannot co-exist in a VECS collection by construction rather than by per-call discipline.

**Hardening (2026-05-01)**:
- 429 explicit handling with `Retry-After` honoring
- `ai_usage_logs` mirror retries twice + ERRORs on persistent failure
- OpenAI legacy fallback pinned to 1024D — since **deleted outright** (2026-08-08); pinning the dimension only made a wrong-space vector harder to notice, because dimension agreement is exactly what makes the substitution invisible

**Cost**: $0.06 per 1M tokens
**Speed**: 100-300ms
**Output**: 1024D list

---

### 5. **SLIG (SigLIP2 base, 768D) Cloud Endpoint** 🎯

**File**: `mivaa-pdf-extractor/app/services/embeddings/slig_client.py`
**Modal endpoint**: app `slig`, URL `https://basilakis--slig-sligservice-web.modal.run`, serving the custom model `basiliskan/slig` which duplicates **`google/siglip2-base-patch16-512`** — stock SigLIP2 base, **native 768D, no projection head** (`SLIG_EMBEDDING_DIMENSION=768`).

Modal endpoint (app: slig). Modes: `zero_shot`, `image_embedding`, `text_embedding`, `similarity`. For specialized embeddings (color, texture, material, style), the client obtains the base image embedding, scores it against a text prompt, retrieves the text embedding, and blends them with weighted averaging before normalizing to a unit vector.

**Output**: 768D specialized embeddings (5 types per image), all halfvec in VECS. The previous-generation 1152D SigLIP-SO400M collections (image_siglip_embeddings + 1152D specialized) were dropped 2026-04 as 100% orphans from the pre-SLIG era.

**Hardening (2026-05-01)**:
- 3-attempt retry on dim-mismatch (was silent abort — single wrong-dim response caused mass data loss)
- Atomic specialized VECS upsert: writes all 4 vectors first, then sets flags only for those that landed

**Cost**: Modal endpoint, scale-to-zero ($0 idle)
**Speed**: 150-400ms per image
**Output**: 768D float16 (halfvec) per type

---

### 6. **PaddleOCR-VL 1.6 — Structural Pass (layout + OCR + figure boxes, sole engine)** 📜

**Files**:
- `mivaa-pdf-extractor/app/services/pdf/paddleocr_endpoint_manager.py` (`PaddleOCRManager`; `run_structural_pass`=page, `run_block_ocr`=block)
- `mivaa-pdf-extractor/app/services/pdf/paddleocr_pipeline.py` (maps `/parse` JSON onto the unchanged `document_layout_analysis.layout_elements[]` schema)
- `mivaa-pdf-extractor/modal_app/paddleocr_vl.py` (the Modal app)

`PaddlePaddle/PaddleOCR-VL-1.6` (0.9B) is a **two-stage** document parser hosted **in-process on Modal** (the full `paddleocr[doc-parser]` `PaddleOCRVL` pipeline on `paddlepaddle-gpu`, **NOT vLLM**): **PP-DocLayoutV2** (RT-DETR detector + pointer network) localizes regions, labels them, and predicts reading order; the **0.9B VLM** recognizes the content inside each region (text, tables→markdown, formulas→LaTeX, charts).

**Replaced Surya-2 on 2026-06-13** — tighter RT-DETR crop boxes (→ cleaner product crops → better SLIG visual embeddings) and reading order from a dedicated model; validated ~1-3s/page warm, near-perfect Greek OCR, figure boxes within ~8px. (Surya-2 had earlier replaced YOLO + Chandra + `merge_layout`; pytesseract + EasyOCR were removed before that in 2026-05.) `surya_endpoint_manager.py`, `surya_blocks.py`, `modal_app/surya_vllm.py`, and all `surya_*` config are deleted.

**Used for**:
- Stage 1 document-level structural pass (runs **before discovery** — structure-first), persisted to `document_layout_analysis` with `processing_version='paddleocr-vl'`
- Phase 3 per-image OCR + icon metadata + the admin re-OCR endpoint (`ocr_service._call_paddleocr` via `run_structural_pass` on the crop; `ocr_engine` setting = `paddleocr`)

**Contract** (custom, NOT OpenAI/vLLM): `GET /health` (unauth warmup probe) + `POST /parse {image_b64, mode}` → `{"regions":[{bbox:[x0,y0,x1,y1] px, label, content, order}], width, height}`. `mode=page` for the structural pass, `mode=block` for per-crop OCR. Pixel bboxes are normalized to 0..1 at the parser boundary.

**Failure marker**: `OCRResult.method='paddleocr_failed'` — consumers must check `method`, not emptiness, to distinguish failure from "no text on page".

**Per-call metrics**: `paddleocr_metrics` table.

**Host — Modal only**: app `paddleocr-vl` (workspace `basilakis`) at `https://basilakis--paddleocr-vl-paddleservice-web.modal.run`. GPU L4, `min_containers=0` + `scaledown_window=120` (=$0 idle), `max_containers=4`, forces `device="gpu"`. Cold start ~90s (model load + first-call JIT), paid once per job at warmup. Only required runtime secret: **`PADDLEOCR_MODAL_API_KEY`** (URL baked as config default). CI auto-deploys on `modal_app/**` via the `deploy-modal` job (`MODAL_TOKEN_ID` / `MODAL_TOKEN_SECRET`); manual redeploy via `modal deploy modal_app/paddleocr_vl.py`.

**Cost**: Modal GPU L4, scale-to-zero ($0 idle)
**Speed**: ~1-3 seconds per page warm; ~90s cold start

---

### 7. **GPT-4o / GPT-5 (optional)** 🤖

**Files**:
- `mivaa-pdf-extractor/app/services/product_discovery_service.py`
- `mivaa-pdf-extractor/app/services/rag_service.py`

GPT models are available as alternatives to Claude for product discovery and agents. Not used for vision (Anthropic-only post-2026-05-01).

**Cost**: GPT-4o $2.50/$10.00 per 1M tokens, GPT-5 TBD
**Speed**: 2-6 seconds

---

### 8. **VisionProvider.

The `VisionProvider.vision_provider` still validate. No code path produces new rows with this value.py` file, all `Settings.


---

## 🔄 Model Selection Logic

### PDF Processing Pipeline

| Stage | Default Model | Alternative |
|-------|---------------|-------------|
| Layout + Page OCR + figure boxes (Stage 1, before discovery) | PaddleOCR-VL 1.6 (Modal) | — |
| Discovery | Claude Opus 4.7 | GPT-5 |
| Chunking | Claude Sonnet 4.6 | — |
| Vision (primary) | Claude Opus 4.7 (tool use) | — |
| Vision (validation, low-confidence) | Claude Opus 4.7 (default profile) | Claude Haiku 4.5 (FAST / COST_OPTIMIZED) |
| Phase 3 OCR (per-image) | PaddleOCR-VL block OCR | — |
| Visual Embeddings | SLIG (SigLIP2 base 768D, 5×768D) | — |
| Understanding Embedding | Voyage AI voyage-4 (1024D) | — |
| Text Embeddings | Voyage AI voyage-4 (1024D) | — |

### Search & Agents

7-vector RAG uses Voyage AI voyage-4 for text + understanding (1024D), 5× SLIG specialized 768D for visual, and Claude Opus 4.7 for synthesis. The Agent Hub supports Claude Opus 4.7 (default), Claude Haiku 4.5 (demo), and GPT-5 (optional).

---

## 💰 Cost Impact Analysis

### Per PDF Processing (100 pages, 50 images) — canonical estimate

These numbers are the source of truth; Doc #4's profile cost lines reference this same workload.

| Model | Usage | Cost |
|-------|-------|------|
| **PaddleOCR-VL 1.6** | Stage 1 layout + page OCR (100 pages, before discovery) | Modal GPU (scale-to-zero) |
| **Claude Opus 4.7** | Product discovery (1 call) | ~$0.08 |
| **Claude Sonnet 4.6** | Chunking (~500 chunks) | ~$0.10 |
| **Claude Opus 4.7** | Vision analysis (50 images, tool use) | ~$0.13 |
| **PaddleOCR-VL 1.6** | Phase 3 per-image OCR (text-bearing only) | Modal GPU (scale-to-zero) |
| **SLIG** | Visual embeddings (250 total, 5× per image) | endpoint |
| **Voyage AI** | Understanding (50) + text chunks (500) | ~$0.05 |
| **TOTAL** | Per PDF | **~$0.36** |

The pre-migration documented estimate (~$0. Today's number reflects honest accounting at Opus 4.7's current $5/$25 pricing.

### Per Search Query

| Model | Usage | Cost |
|-------|-------|------|
| **Voyage AI voyage-4** | Query embedding | ~$0.001 |
| **SLIG + Voyage** | 7-way parallel search | endpoint |
| **Claude Opus 4.7** | Answer synthesis | ~$0.02 |
| **TOTAL** | Per query | **~$0.02** |

---

## 🎯 Why This Architecture?

### 1. **Schema integrity for understanding embeddings**
Anthropic tool use guarantees the `VisionAnalysis` payload matches the Pydantic schema, so Voyage doesn't embed garbage. Provenance fields (`embedding_model`, `schema_version`) persist on every row so drift is detectable.

### 2. **Honest pricing**
Pre. The platform was 100% Claude vision and the bill reflected it. The migration aligned the docs with reality.

### 3. **Structure-first layout + OCR**
PaddleOCR-VL's dedicated RT-DETR detector produces tighter region boxes than the prior merge-based pipelines (→ cleaner product crops → better SLIG visual embeddings), and reading order comes from a dedicated pointer network rather than a heuristic merge. Running it as Stage 1 before discovery means every downstream consumer reads reading-order text from one cache. (Earlier OCR stacks — pytesseract + EasyOCR, then YOLO + Chandra, then Surya-2 — were all retired.)

### 4. **VECS-only embeddings**
No more dual-store. All vectors live in `vecs.image_*_embeddings` collections, all halfvec for 50% storage savings vs full-precision vector. Boolean presence flags on `document_images` give O(1) presence checks.

---

## 📈 Performance Metrics

| Metric | Pre-2026-05-01 | Post-Migration |
|--------|----------------|----------------|
| **Vision schema integrity** | JSON regex recovery (best effort) | Tool-use schema guarantee |
| **Layout + OCR engine** | ~60% (pytesseract broken in prod) | PaddleOCR-VL 1.6 structural pass on Modal (RT-DETR boxes + 0.9B VLM, ~1-3s/page warm) |
| **Voyage drift detection** | None | `embedding_model` + `schema_version` on every row |

---

## 🔮 Future Considerations

1. **Voyage `voyage-multimodal-3.5` for the UNDERSTANDING path** — would replace the JSON-serialize-then-Voyage path with direct multimodal embedding. The model is now GA (and is what the page channel uses), but swapping it into `image_understanding_embeddings` means re-embedding that whole collection: the two are different latent spaces, and a half-migrated collection is worse than either.
2. **Schema versioning** — the `schema_version` field is in place; bumps will trigger backfill via `POST /admin/understanding-embeddings/backfill`.

### ✅ Realized: `voyage-multimodal` page embedding (#239, 2026-08-08)

The 8th fusion vector. Each catalog page is rendered and embedded — picture and text
together — into `vecs.page_embeddings` (halfvec(1024)), and scored as the `page`
channel in fusion search. It exists for one specific gap: PaddleOCR-VL treats
`Image`/`Figure`/`chart` regions as crop sources and never reads text inside them, so
a product name printed across a photograph is invisible to every other channel.

- **Model**: `settings.voyage_multimodal_model`, default `voyage-multimodal-3.5`. Do not change it on a populated collection — same latent-space reason as above.
- **Billing is two-axis** ($0.12/1M text tokens **and** $0.60/1B pixels, clamped to 2M pixels per image). `AIPricingConfig.calculate_multimodal_embedding_cost()` is the only correct costing path; the token-only `calculate_cost()` under-reports a page ~20×. Render DPI defaults to 144 — an A4 page lands just under the pixel ceiling, above which you pay the capped price for pixels Voyage discards. ~$0.0012/page, so a 500-page catalog is ~$0.62.
- **Query side**: `generate_page_query_embedding()`. It must NOT reuse the voyage-4 text vector — both are 1024D, so a wrong-space query is accepted and scores confident nonsense rather than erroring. Pinned by [tests/unit/test_page_embeddings.py](../mivaa-pdf-extractor/tests/unit/test_page_embeddings.py).

---

## 📚 Related Documentation

- [PDF Processing Pipeline](./pdf-processing-pipeline.md)
- [Embedding Generation Improvements](./embedding-generation-improvements.md)
- [AI Models Complete List](./ai-models-complete-list.md)
- [AI Models Guide](./ai-models-guide.md)
