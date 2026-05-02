# AI Models Architecture - Complete Overview

**Last Updated**: 2026-05-02
**Status**: Production

## Executive Summary

MIVAA Platform uses AI models from **4 providers** for distinct purposes. Vision is **Anthropic-only** (post-2026-05-01 migration); Qwen has been retired from every vision call site.

| Provider | Models Used | Primary Purpose |
|----------|-------------|-----------------|
| **Anthropic** | Claude Opus 4.7, Claude Sonnet 4.6, Claude Haiku 4.5 | Vision analysis (tool-use schema-locked), chunking, agents, validation |
| **Voyage AI** | voyage-4 | Text embeddings (1024D) + understanding embeddings (1024D) — sole text embedder |
| **Google (HuggingFace)** | SigLIP2 ViT-SO400M (SLIG) | Visual embeddings (768D) — cloud endpoint, 5 specialized types |
| **Datalab (HuggingFace)** | Chandra v2 | OCR — sole OCR engine (pytesseract + EasyOCR removed 2026-05) |
| **OpenAI** | GPT-4o, GPT-5 | Optional alternative for product discovery / agents |

---

## Complete Model Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         PDF UPLOAD & PROCESSING                          │
└─────────────────────────────────────────────────────────────────────────┘
                                    ↓
┌─────────────────────────────────────────────────────────────────────────┐
│ STAGE 0: Product Discovery (BEFORE extraction)                          │
│ Model: Claude Opus 4.7 OR GPT-5                                         │
│ Purpose: Identify products, count pages, map image-to-product           │
└─────────────────────────────────────────────────────────────────────────┘
                                    ↓
┌─────────────────────────────────────────────────────────────────────────┐
│ STAGE 1.5: Layout + OCR (page-level)                                    │
│ Model: Chandra v2 (Datalab on HuggingFace)                              │
│ Purpose: YOLO layout detection + page OCR (3 retries, jittered temps)   │
│ Failure marker: OCRResult.method='chandra_failed'                       │
│ Cache status persisted: success/yolo_only/empty_page/ocr_failed         │
└─────────────────────────────────────────────────────────────────────────┘
                                    ↓
┌─────────────────────────────────────────────────────────────────────────┐
│ STAGE 2: Chunking (text)                                                │
│ Model: Claude Sonnet 4.6 (default; was Qwen pre-2026-05-01)             │
│ Setting: Settings.chunking_primary_model = 'claude-sonnet-4-6'          │
│ Why Sonnet: chunking is at the quality ceiling — Opus would be 5×       │
│             cost for marginal gain                                      │
└─────────────────────────────────────────────────────────────────────────┘
                                    ↓
┌─────────────────────────────────────────────────────────────────────────┐
│ STAGE 3: Image Classification + Vision Analysis (per image)             │
│ Model: Claude Opus 4.7 (Anthropic tool use)                             │
│ Schema: app.models.vision_analysis.VisionAnalysis (Pydantic)            │
│ Tool:   VISION_ANALYSIS_TOOL                                            │
│ Why tool use: hard schema adherence — eliminates JSON regex recovery,   │
│               protects Voyage's understanding-embedding space from drift│
└─────────────────────────────────────────────────────────────────────────┘
                                    ↓
┌─────────────────────────────────────────────────────────────────────────┐
│ STAGE 3 (Phase 3 OCR): Per-image OCR for text-bearing images            │
│ Model: Chandra v2 (with retry-with-jitter)                              │
│ Filter: yolo_crop ∈ {TABLE,TEXT,TITLE,CAPTION} OR                       │
│         embedded with text_detected=True                                │
│ Stored on document_images: ocr_text, ocr_blocks, ocr_failed,            │
│         ocr_attempts, ocr_skipped_reason                                │
└─────────────────────────────────────────────────────────────────────────┘
                                    ↓
┌─────────────────────────────────────────────────────────────────────────┐
│ STAGE 5: Visual Embeddings (5 types) — VECS-Only, halfvec               │
│ Model: SLIG (SigLIP2 ViT-SO400M) via HuggingFace cloud endpoint         │
│ Purpose: 5 specialized 768D embeddings per image                        │
│   1. Visual    → image_slig_embeddings    (key: visual_768)             │
│   2. Color     → image_color_embeddings   (key: color_slig_768)         │
│   3. Texture   → image_texture_embeddings (key: texture_slig_768)       │
│   4. Style     → image_style_embeddings   (key: style_slig_768)         │
│   5. Material  → image_material_embeddings(key: material_slig_768)      │
│ Plus: Understanding embedding (1024D Voyage) →                          │
│       image_understanding_embeddings (key: understanding_1024)          │
└─────────────────────────────────────────────────────────────────────────┘
                                    ↓
┌─────────────────────────────────────────────────────────────────────────┐
│ STAGE 5 (parallel): Understanding Embedding (1024D)                     │
│ Pipeline: VisionAnalysis JSON →                                         │
│           serialize_vision_analysis_to_text() →                         │
│           Voyage AI voyage-4 (input_type="document") → 1024D            │
│ Provenance persisted: embedding_model, schema_version on every row      │
│ OpenAI fallback: DISABLED for understanding path (drift prevention)     │
└─────────────────────────────────────────────────────────────────────────┘
                                    ↓
┌─────────────────────────────────────────────────────────────────────────┐
│ STAGE 6: Text Embeddings                                                │
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
│ - 6× VECS image collections (5× 768D SLIG + 1× 1024D understanding)     │
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
│ AGENTS: KAI Agent Hub                                                    │
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
- KAI agent (Mastra)

**Cost**: $15.00 per 1M input tokens, $75.00 per 1M output tokens
**Speed**: 3-8 seconds per image
**Output**: Schema-locked JSON via tool use

---

### 2. **Claude Sonnet 4.6 — Chunking** ✂️

**Setting**: `Settings.chunking_primary_model = 'claude-sonnet-4-6'` (was `Qwen/Qwen3.6-35B-A3B-FP8` pre-2026-05-01)

Chunking is a text task at the quality ceiling — Opus would be 5× the cost for marginal gain, and Qwen had been silently down for months.

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

**Cost**: $0.80 per 1M input tokens, $4.00 per 1M output tokens
**Speed**: 1-3 seconds

---

### 4. **Voyage AI voyage-4 — Text & Understanding Embeddings** 📝

**File**: `mivaa-pdf-extractor/app/services/real_embeddings_service.py`

Voyage `voyage-4` is the sole text embedder. It produces 1024D vectors stored as halfvec in VECS. The dict key is `text_1024` (was `text_1536` under OpenAI text-embedding-3-small, which was retired 2026-04).

**Two production uses**:
1. **Chunk + product text embeddings** (`text_embedding_1024`)
2. **Understanding embeddings**: vision_analysis JSON → `serialize_vision_analysis_to_text()` → voyage-4 with `input_type="document"` → 1024D → `image_understanding_embeddings` collection

**Provenance** persisted on every row (`embedding_model`, `schema_version`) so the admin UI / backfill cron can detect drift and stale-schema rows. The OpenAI fallback is **disabled** for the understanding path so Voyage and OpenAI vectors never co-exist in the same VECS collection.

**Hardening (2026-05-01)**:
- 429 explicit handling with `Retry-After` honoring
- `ai_usage_logs` mirror retries twice + ERRORs on persistent failure
- OpenAI legacy fallback pinned to 1024D (was using caller-provided dimensions arg — legacy 1536D callers would silently store wrong-dim text embeddings)

**Cost**: $0.06 per 1M tokens
**Speed**: 100-300ms
**Output**: 1024D list

---

### 5. **SLIG (SigLIP2) Cloud Endpoint** 🎯

**File**: `mivaa-pdf-extractor/app/services/embeddings/slig_client.py`

HuggingFace inference endpoint. Modes: `zero_shot`, `image_embedding`, `text_embedding`, `similarity`. For specialized embeddings (color, texture, material, style), the client obtains the base image embedding, scores it against a text prompt, retrieves the text embedding, and blends them with weighted averaging before normalizing to a unit vector.

**Output**: 768D specialized embeddings (5 types per image), all halfvec in VECS.

**Hardening (2026-05-01)**:
- 3-attempt retry on dim-mismatch (was silent abort — single wrong-dim response caused mass data loss)
- Atomic specialized VECS upsert: writes all 4 vectors first, then sets flags only for those that landed

**Cost**: HuggingFace endpoint with auto-pause
**Speed**: 150-400ms per image
**Output**: 768D float16 (halfvec) per type

---

### 6. **Chandra v2 — OCR (sole OCR engine)** 📜

**File**: `mivaa-pdf-extractor/app/services/ocr/chandra_endpoint_manager.py`

**Pytesseract + EasyOCR were removed entirely in 2026-05** (`requirements.txt`, `deploy.yml`, `ocr_service.py`). Pytesseract had been broken on production for months (TESSDATA_PREFIX unset, no traineddata installed), and even when "working" it produced bbox-less text that silently degraded layout-merge.

**Retry-with-jitter**: 3 attempts at temperatures 0.0 / 0.1 / 0.2. Chandra freelances ("The image is...") ~50% at temp=0; jittering breaks the sticky-prose state and lifts success rate to >95%.

**Used for**:
- Stage 1.5 page-level OCR (with `cache_status` persistence: `success` / `yolo_only` / `empty_page` / `ocr_failed` / `page_failed`)
- Phase 3 per-image OCR (text-bearing images: yolo_crop ∈ {TABLE, TEXT, TITLE, CAPTION} or embedded with `text_detected=True`)

**Failure marker**: `OCRResult.method='chandra_failed'` — consumers must check `method`, not emptiness, to distinguish failure from "no text on page".

**Per-attempt metrics**: `chandra_ocr_metrics` table — `outcome`, `attempt_number`, `temperature`, `latency_ms`, `failure_mode_head`, `caller`.

**Cost**: HuggingFace endpoint with auto-pause
**Speed**: 1-3 seconds per page (3 attempts worst-case)

---

### 7. **GPT-4o / GPT-5 (optional)** 🤖

**Files**:
- `mivaa-pdf-extractor/app/services/product_discovery_service.py`
- `mivaa-pdf-extractor/app/services/rag_service.py`

GPT models are available as alternatives to Claude for product discovery and agents. Not used for vision (Anthropic-only post-2026-05-01).

**Cost**: GPT-4o $2.50/$10.00 per 1M tokens, GPT-5 TBD
**Speed**: 2-6 seconds

---

### 8. **VisionProvider.QWEN enum (legacy)** 🪦

The `VisionProvider.QWEN` enum value is retained **only** so historical pre-2026-05-01 rows in `document_images.vision_provider` still validate. No code path produces new rows with this value. The `qwen_endpoint_manager.py` file, all `Settings.qwen_*` fields, the qwen warmup task, the qwen pricing entries (backend + frontend + edge), the qwen Operations dashboard widgets, and the `endpoint_controller.qwen` AdaptiveConcurrency gate were all deleted on 2026-05-01.

The HF Qwen endpoint env vars (`QWEN_*`) on the systemd unit can be deleted at the next deploy.

---

## 🔄 Model Selection Logic

### PDF Processing Pipeline

| Stage | Default Model | Alternative |
|-------|---------------|-------------|
| 0 — Product Discovery | Claude Opus 4.7 | GPT-5 |
| 1.5 — Layout + Page OCR | YOLO + Chandra v2 | — |
| 2 — Chunking | Claude Sonnet 4.6 | — |
| 3 — Vision Analysis | Claude Opus 4.7 (tool use) | — |
| 3 — Phase 3 OCR | Chandra v2 | — |
| 5 — Visual Embeddings | SLIG (SigLIP2, 5×768D) | — |
| 5 — Understanding Embedding | Voyage AI voyage-4 (1024D) | — |
| 6 — Text Embeddings | Voyage AI voyage-4 (1024D) | — |

### Search & Agents

7-vector RAG uses Voyage AI voyage-4 for text + understanding (1024D), 5× SLIG specialized 768D for visual, and Claude Opus 4.7 for synthesis. The KAI Agent Hub supports Claude Opus 4.7 (default), Claude Haiku 4.5 (demo), and GPT-5 (optional).

---

## 💰 Cost Impact Analysis

### Per PDF Processing (100 pages, 50 images)

| Model | Usage | Cost |
|-------|-------|------|
| **Claude Opus 4.7** | Product discovery (1 call) | ~$0.25 |
| **Chandra v2** | Stage 1.5 page OCR (100 pages × ~1.5 retry avg) | endpoint |
| **Claude Sonnet 4.6** | Chunking (~500 chunks) | ~$0.10 |
| **Claude Opus 4.7** | Vision analysis (50 images, tool use) | ~$0.40 |
| **Chandra v2** | Phase 3 per-image OCR (text-bearing only) | endpoint |
| **SLIG** | Visual embeddings (250 total, 5× per image) | endpoint |
| **Voyage AI** | Understanding (50) + text chunks (500) | ~$0.01 |
| **TOTAL** | Per PDF | **~$0.76** |

Cost moved up vs the pre-migration estimate ($0.23) because Claude Opus is 75× the per-image cost of the (broken) Qwen pricing — but every Qwen call had been silently 404-ing and falling through to Claude anyway, so this just makes the bill match reality.

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
Pre-2026-05-01 the documented architecture said "Qwen for cheap bulk vision, Claude for validation" — but Qwen had been 404-ing for months. The platform was 100% Claude vision and the bill reflected it. The migration aligned the docs with reality.

### 3. **OCR reliability**
Chandra v2 with retry-with-jitter has >95% success rate. Pytesseract + EasyOCR were removed because pytesseract had been broken on production (TESSDATA_PREFIX unset) and even when working produced bbox-less text that silently degraded layout-merge.

### 4. **VECS-only embeddings**
No more dual-store. All vectors live in `vecs.image_*_embeddings` collections, all halfvec for 50% storage savings vs full-precision vector. Boolean presence flags on `document_images` give O(1) presence checks.

---

## 📈 Performance Metrics

| Metric | Pre-2026-05-01 | Post-Migration |
|--------|----------------|----------------|
| **Vision schema integrity** | JSON regex recovery (best effort) | Tool-use schema guarantee |
| **Vision actual cost** | "Qwen $0.18/1M" (false — 404→Claude fallback) | Claude $15/$75 per 1M (honest) |
| **OCR success rate** | ~60% (pytesseract broken in prod) | >95% (Chandra v2 jittered retry) |
| **Voyage drift detection** | None | `embedding_model` + `schema_version` on every row |
| **VECS storage** | 50% saved by halfvec migration | (same) |

---

## 🔮 Future Considerations

1. **Voyage `voyage-multimodal-3`** — would replace the JSON-serialize-then-Voyage path with direct multimodal embedding. Watch for general availability.
2. **Schema versioning** — the `schema_version` field is in place; bumps will trigger backfill via `POST /admin/understanding-embeddings/backfill`.
3. **Chandra v3** — Datalab continues to ship improvements; the retry-with-jitter loop should adapt.

---

## 📚 Related Documentation

- [PDF Processing Pipeline](./pdf-processing-pipeline.md)
- [Embedding Generation Improvements](./embedding-generation-improvements.md)
- [AI Models Complete List](./ai-models-complete-list.md)
- [AI Models Guide](./ai-models-guide.md)
