# AI Models Architecture - Complete Overview

## Executive Summary

MIVAA Platform uses **7 different AI models** across **4 providers** for different purposes:

| Provider | Models Used | Primary Purpose |
|----------|-------------|-----------------|
| **Google (HuggingFace)** | SigLIP2 ViT-SO400M (SLIG) | Visual embeddings (768D) - Cloud endpoint |
| **Voyage AI** | voyage-4 | Text embeddings (1024D) - Primary for semantic search |
| **OpenAI** | GPT-4o, GPT-5 | Chat, product discovery (OpenAI text embeddings retired 2026-04 — Voyage AI is the sole text embedder) |
| **Anthropic** | Claude Opus 4.7, Claude Haiku 4.5 | Vision analysis, validation, agents |
| **Qwen (HuggingFace)** | Qwen3-VL-32B-Instruct | Image analysis, OCR, material detection - Cloud endpoint |

---

## Complete Model Flow Diagram

┌─────────────────────────────────────────────────────────────────────────┐
│                         PDF UPLOAD & PROCESSING                          │
└─────────────────────────────────────────────────────────────────────────┘
                                    ↓
┌─────────────────────────────────────────────────────────────────────────┐
│ STAGE 1: Product Discovery (BEFORE extraction)                          │
│ Model: Claude Opus 4.7 OR GPT-5                                        │
│ Purpose: Identify products, count pages, map image-to-product          │
│ Input: PDF pages (images)                                              │
│ Output: Product list with page ranges                                  │
└─────────────────────────────────────────────────────────────────────────┘
                                    ↓
┌─────────────────────────────────────────────────────────────────────────┐
│ STAGE 2: Image Extraction & OCR Filtering                              │
│ Model: SLIG (SigLIP2 cloud endpoint, 768D)                             │
│ Purpose: Filter images - only OCR technical specs, skip lifestyle      │
│ Input: Extracted images                                                │
│ Output: Filtered images for OCR processing                             │
└─────────────────────────────────────────────────────────────────────────┘
                                    ↓
┌─────────────────────────────────────────────────────────────────────────┐
│ STAGE 3: Image Analysis (Primary)                                      │
│ Model: Qwen3-VL-32B-Instruct (HuggingFace Endpoint)                   │
│ Endpoint: https://gbz6krk3i2is85b0.us-east-1.aws.endpoints.huggingface.cloud │
│ Service: mh-qwen332binstruct (namespace: basiliskan)                   │
│ Purpose: Detailed material analysis, color detection, texture          │
│ Input: Product images                                                  │
│ Output: Material properties, colors, textures, quality scores          │
│ Why: State-of-the-art vision-language model, superior OCR, cloud-based│
└─────────────────────────────────────────────────────────────────────────┘
                                    ↓
┌─────────────────────────────────────────────────────────────────────────┐
│ STAGE 4: Image Analysis (Validation - Optional)                        │
│ Model: Claude Opus 4.7 Vision                                         │
│ Purpose: Validate low-quality Qwen results, enrich metadata           │
│ Input: Images with quality_score < 0.7                                │
│ Output: Enhanced analysis, validation                                  │
│ Why: Higher accuracy, better reasoning, used only when needed         │
└─────────────────────────────────────────────────────────────────────────┘
                                    ↓
┌─────────────────────────────────────────────────────────────────────────┐
│ STAGE 5: Visual Embeddings (5 types) - 100% CLOUD                     │
│ Model: SLIG (SigLIP2 ViT-SO400M) - HuggingFace Endpoint               │
│ Endpoint: https://xxxxxxxx.us-east-1.aws.endpoints.huggingface.cloud  │
│ Service: mh-siglip2 (namespace: basiliskan)                           │
│ Purpose: Generate 5 specialized 768D embeddings per image             │
│ Types:                                                                 │
│   1. Visual (general appearance) - image_embedding mode                │
│   2. Color (color palette) - text_embedding mode                      │
│   3. Texture (surface patterns) - text_embedding mode                 │
│   4. Style (design aesthetic) - text_embedding mode                   │
│   5. Material (material type) - text_embedding mode                   │
│ Why: Cloud-based, auto-pause enabled, 0GB local RAM, superior quality │
└─────────────────────────────────────────────────────────────────────────┘
                                    ↓
┌─────────────────────────────────────────────────────────────────────────┐
│ STAGE 6: Text Embeddings (updated 2026-04)                             │
│ Model: Voyage AI voyage-4 (sole provider)                           │
│ Purpose: Generate 1024D embeddings for text chunks                    │
│ Input: Product descriptions, specifications, chunk text               │
│ Output: 1024D text embeddings (dict key: text_1024)                   │
│ Input Types: "document" for indexing, "query" for search             │
│ Why: Superior quality, optimized for retrieval, $0.06/1M tokens      │
└─────────────────────────────────────────────────────────────────────────┘
                                    ↓
┌─────────────────────────────────────────────────────────────────────────┐
│                         STORAGE (Supabase)                              │
│ - Products table (metadata)                                            │
│ - VECS Collections (5x 768D visual + 1x 1024D understanding per image)│
│   • image_slig_embeddings (768D — primary visual, SLIG)               │
│   • image_color_embeddings (768D — text-guided color SLIG)            │
│   • image_texture_embeddings (768D — text-guided texture SLIG)        │
│   • image_material_embeddings (768D — text-guided material SLIG)      │
│   • image_style_embeddings (768D — text-guided style SLIG)            │
│   • image_understanding_embeddings (1024D — Voyage from Qwen3-VL)     │
│ - Chunks table (1024D text embeddings - Voyage AI)                    │
└─────────────────────────────────────────────────────────────────────────┘
                                    ↓
┌─────────────────────────────────────────────────────────────────────────┐
│                    USER SEARCH & AGENT QUERIES                          │
└─────────────────────────────────────────────────────────────────────────┘
                                    ↓
┌─────────────────────────────────────────────────────────────────────────┐
│ SEARCH: Direct Vector DB RAG (Claude 4.5 + Multi-Vector)              │
│ Models:                                                                │
│   - Text Embeddings: Voyage AI voyage-4 (1024D)                    │
│   - Visual Embeddings: 5x SLIG specialized (768D each)               │
│     • Visual, Color, Texture, Material, Style                        │
│   - LLM: Claude Opus 4.7 (200K context)                              │
│ Purpose: Multi-vector search + intelligent synthesis                  │
│ Why: Direct vector DB queries, no intermediate indexing layer         │
└─────────────────────────────────────────────────────────────────────────┘
                                    ↓
┌─────────────────────────────────────────────────────────────────────────┐
│ AGENTS: Mastra Framework (Agent Hub)                                   │
│ Models Available:                                                      │
│   - Claude Opus 4.7 (default for agents)                             │
│   - Claude Haiku 4.5 (fast responses)                                │
│   - GPT-5 (advanced reasoning)                                        │
│   - Qwen3-VL 17B (cost-effective)                               │
│ Purpose: Conversational AI, material search, recommendations          │
│ Why: Mastra provides agent orchestration, tool calling                │
└─────────────────────────────────────────────────────────────────────────┘

---

## 🔍 Detailed Model Breakdown

### 1. **SLIG (SigLIP2) Cloud Endpoint** 🎯

**File**: `mivaa-pdf-extractor/app/services/embeddings/slig_client.py`

**Cloud-Only Architecture** (HuggingFace Inference Endpoint): The SLIG client supports 4 modes — `zero_shot`, `image_embedding`, `text_embedding`, and `similarity`. For general visual embeddings it uses `image_embedding` mode to retrieve a 768D vector. For specialized embeddings (color, texture, material, style), it uses the similarity mode: it obtains the base image embedding, scores it against a text prompt, retrieves the text embedding, and blends the two with weighted averaging before normalizing to a unit vector.

**Benefits**:
- ✅ No local model loading (faster startup, lower memory)
- ✅ 768D embeddings (replaces legacy 1152D local SigLIP-SO400M, retired 2026-04)
- ✅ Automatic endpoint pause/resume (cost control)
- ✅ Specialized embeddings via similarity mode

**Purpose**:
- Generate 768D visual embeddings for images
- 5 specialized embeddings per image (visual, color, texture, style, material)
- Cloud-only architecture: No local model loading, faster startup, lower memory

**Impact on Flow**:
- ✅ **PDF Processing**: Generates all 5 visual embeddings (65-75% progress)
- ✅ **Search**: Enables visual similarity search
- ✅ **Specialized Embeddings**: Text-guided embeddings via similarity mode
- ✅ **Cost Control**: Automatic endpoint pause/resume
- ✅ **Metadata Tracking**: Records which model was actually used

**Cost**: Free (Hugging Face)
**Speed**: 150-400ms per image (SigLIP), 100-300ms (CLIP)
**Output**: 512D numpy array → normalized → list

---

### 2. **Voyage AI voyage-4** 📝 (updated 2026-04)

**File**: `mivaa-pdf-extractor/app/services/real_embeddings_service.py`

The service calls Voyage AI's embeddings endpoint with the model `voyage-4`. This produces a 1024D text embedding used for chunk indexing, product text, and semantic search. OpenAI `text-embedding-3-small` (1536D) was retired in 2026-04 — Voyage is now the sole text embedder, and the embedding dict key is `text_1024` (previously `text_1536`).

**Purpose**:
- Generate 1024D text embeddings for chunks
- Text-based semantic search
- Multimodal search (combine with visual)

**Impact on Flow**:
- ✅ **PDF Processing**: Embeds all text chunks (Stage 5, 60-70%)
- ✅ **Search**: Primary text search mechanism
- ✅ **RAG**: Voyage AI 3.5 for semantic retrieval

**Cost**: $0.06 per 1M tokens
**Speed**: 100-300ms
**Output**: 1024D list

---

### 3. **Qwen3-VL 17B Vision** 🦙

**File**: `mivaa-pdf-extractor/app/services/real_image_analysis_service.py`

Requests are sent to the Together AI chat completions endpoint using the `Qwen/Qwen3-VL-8B-Instruct` model. The message structure requires the text prompt to appear **before** the image content block — this ordering is critical for Qwen models. The image is provided as a base64-encoded data URL.

**Purpose**:
- **Primary image analysis** for all product images
- Material identification, color detection, texture analysis
- Quality scoring, OCR text extraction
- Cost-effective vision model

**Impact on Flow**:
- ✅ **PDF Processing**: Analyzes ALL images (Stage 6, 70-80%)
- ✅ **Material Detection**: Identifies materials, colors, textures
- ✅ **Quality Scoring**: Scores image quality (0.0-1.0)
- ✅ **OCR**: Extracts text from technical diagrams
- ⚠️ **Validation**: Low scores (<0.7) trigger Claude validation

**Why Qwen**:
- 69.4% MMMU score (multimodal understanding)
- #1 OCR performance among open models
- Cost-effective ($0.18 per 1M tokens vs Claude $3.00)
- Fast inference (2-5 seconds)

**Cost**: $0.18 per 1M input tokens, $0.18 per 1M output tokens
**Speed**: 2-5 seconds per image
**Output**: JSON with material properties, colors, quality scores

---

### 4. **Claude Opus 4.7 Vision** 🎨

**File**: `mivaa-pdf-extractor/app/services/real_image_analysis_service.py`

Uses the Anthropic Python client to call `claude-opus-4-7` with `max_tokens=4096`. The message includes an image block (base64 source, JPEG media type) followed by a text validation prompt.

**Purpose**:
- **Validation** of low-quality Qwen results
- **Enrichment** of metadata
- **Product Discovery** (alternative to GPT-5)
- **Agent responses** (Mastra framework)

**Impact on Flow**:
- ✅ **PDF Processing**: Validates images with quality_score < 0.7 (async job)
- ✅ **Product Discovery**: Identifies products BEFORE extraction (Stage 1)
- ✅ **Agents**: Powers conversational AI in Agent Hub
- ❌ **RAG**: Claude 4.5 is now the primary RAG LLM

**Why Claude**:
- Superior reasoning and accuracy
- Better at complex material analysis
- Excellent vision capabilities
- Used selectively to control costs

**Cost**: $15.00 per 1M input tokens, $75.00 per 1M output tokens
**Speed**: 3-8 seconds per image
**Output**: JSON with enhanced analysis

---

### 5. **GPT-4o / GPT-5** 🤖

**Files**:
- `mivaa-pdf-extractor/app/services/product_discovery_service.py`
- `mivaa-pdf-extractor/app/services/rag_service.py` (Direct Vector DB)

GPT-5 is used for product discovery via the OpenAI chat completions endpoint. GPT-4o is available for Direct Vector DB RAG as the synthesis LLM.

**Purpose**:
- **Product Discovery**: Alternative to Claude for identifying products
- ❌ **RAG**: Claude 4.5 is now the primary RAG LLM
- **Agent**: Available in Agent Hub for advanced reasoning

**Impact on Flow**:
- ✅ **PDF Processing**: Product discovery (Stage 1, optional)
- ✅ **Search**: Generates answers from retrieved chunks
- ✅ **Agents**: Available for user queries

**Cost**: GPT-4o: $2.50/$10.00 per 1M tokens, GPT-5: TBD
**Speed**: 2-6 seconds
**Output**: Text responses, JSON

---

### 6. **Claude Haiku 4.5** ⚡

**File**: `src/components/AI/AgentHub.tsx`

The frontend invokes the `agent-chat` Supabase Edge Function with `model: 'anthropic/claude-haiku-4-20250514'` for fast agent responses.

**Purpose**:
- **Fast agent responses** in Agent Hub
- **Quick queries** that don't need Opus's power
- **Cost optimization** for simple tasks

**Impact on Flow**:
- ✅ **Agents**: Fast conversational responses
- ✅ **Simple queries**: Material lookups, basic questions

**Cost**: $0.25 per 1M input tokens, $1.25 per 1M output tokens
**Speed**: 1-3 seconds
**Output**: Text responses

---

### 7. **Multi-Vector SLIG Embeddings** (Direct Vector DB) 🔗 (updated 2026-04)

**File**: `mivaa-pdf-extractor/app/services/rag_service.py`

The RAG service uses 7 specialized embedding collections for multi-vector search (all halfvec in VECS): `image_slig_embeddings` (visual, 768D), `image_color_embeddings` (768D), `image_texture_embeddings` (768D), `image_style_embeddings` (768D), `image_material_embeddings` (768D), `image_understanding_embeddings` (1024D, Voyage from Qwen3-VL vision_analysis), plus `text` (Voyage AI 3.5 1024D). These are queried in parallel for maximum retrieval accuracy. Legacy 1152D SigLIP-SO400M and CLIP 512D collections were dropped 2026-04.

**Purpose**:
- **Multi-vector semantic search** across 6 specialized dimensions
- **Direct vector DB queries** (no intermediate indexing)
- **Parallel search** for maximum accuracy

**Impact on Flow**:
- ✅ **Search**: 6-way parallel vector search with intelligent fusion
- ✅ **PDF Processing**: SigLIP for visual embeddings

**Cost**: ~$0.001 per query (Voyage AI)
**Speed**: 300-500ms (parallel execution)
**Output**: 6 different embedding types

---

### 8. **~~Stable Diffusion / FLUX~~ (REMOVED)** ❌

**Status**: REMOVED - AI-powered image generation has been removed from the platform

**Previously Used For**:
- ~~3D material visualization~~
- ~~Interior design generation~~
- ~~Material texture generation~~

**Replacement**: Manual 3D designer at `/designer` route using React Three Fiber

**Cost**: Varies by provider
**Speed**: 5-30 seconds
**Output**: Generated images

---

## 🔄 Model Selection Logic

### PDF Processing Pipeline

Product Discovery (Stage 1): Default model is Claude Opus 4.7, with GPT-5 as an alternative. OCR Filtering (Stage 2) uses SLIG (SigLIP2 cloud) zero-shot classification. Image Analysis (Stage 6) uses Qwen3-VL 17B Vision for all images, with Claude Opus 4.7 used for validation when quality_score < 0.7. Visual Embeddings (Stages 7-10) use SLIG (SigLIP2 via HuggingFace cloud endpoint, 768D). Text Embeddings (Stage 5) use Voyage AI voyage-4 (1024D) as the only model — OpenAI text-embedding-3-small was retired in 2026-04.

### Search & Agents

Direct Vector DB RAG uses Voyage AI voyage-4 (1024D) for text embeddings, 5x SLIG specialized 768D embeddings + 1x Voyage understanding 1024D embedding for multi-vector visual search, and Claude Opus 4.7 (200K context) for synthesis. The Agent Hub (Mastra) supports Claude Opus 4.7 as default, Claude Haiku 4.5 for fast responses, GPT-5 for advanced reasoning, and Qwen3-VL 17B as a cost-effective option.

---

## 💰 Cost Impact Analysis

### Per PDF Processing (100 pages, 50 images)

| Model | Usage | Cost |
|-------|-------|------|
| **Claude Opus 4.7** | Product discovery (1 call) | ~$0.25 |
| **SigLIP** | OCR filtering (50 images) | $0.00 (free) |
| **Qwen3-VL** | Image analysis (50 images) | ~$0.02 |
| **Claude Opus 4.7** | Validation (10 low-quality) | ~$0.75 |
| **SigLIP** | Visual embeddings (250 total) | $0.00 (free) |
| **OpenAI Embeddings** | Text chunks (500 chunks) | ~$0.01 |
| **TOTAL** | Per PDF | **~$0.23** |

### Per Search Query

| Model | Usage | Cost |
|-------|-------|------|
| **Voyage AI 3.5** | Query embedding | ~$0.001 |
| **Multi-Vector CLIP** | 6-way parallel search | $0.00 |
| **Claude 4.5** | Answer synthesis | ~$0.02 |
| **TOTAL** | Per query | **~$0.01** |

---

## 🎯 Why This Architecture?

### 1. **Cost Optimization**
- Qwen3-VL for bulk image analysis (cheap)
- Claude only for validation (selective)
- SigLIP for embeddings (free)

### 2. **Quality Optimization**
- SigLIP: +19-29% accuracy over CLIP
- Claude: Best-in-class vision for validation
- Qwen: 69.4% MMMU, excellent OCR

### 3. **Speed Optimization**
- Qwen: Fast inference (2-5s)
- SigLIP: Fast embeddings (150-400ms)
- Parallel processing where possible

### 4. **Compatibility**
- Direct Vector DB: Multi-vector CLIP for specialized search
- Mastra: Support multiple agent models
- OpenAI: Industry standard embeddings

---

## 📈 Performance Metrics

| Metric | Before (CLIP) | After (SigLIP) | Improvement |
|--------|---------------|----------------|-------------|
| **Visual Search Accuracy** | 70-75% | 89-94% | +19-29% |
| **Embedding Generation** | 100-300ms | 150-400ms | Acceptable |
| **Model Size** | 350MB | 1.5GB | Larger but worth it |
| **Cost** | $0.00 | $0.00 | Same (free) |

---

## 🔮 Future Considerations

1. **Regenerate Existing Embeddings**: Batch job to upgrade CLIP → SigLIP
2. **Monitor Qwen Quality**: Track validation rate (should be <20%)
3. **A/B Test Models**: Compare Claude vs GPT-5 for product discovery
4. **Add More Agents**: Expand Mastra agent capabilities

---

**Last Updated**: 2025-01-17
**Status**: ✅ Production Ready
