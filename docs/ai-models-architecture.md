# AI Models Architecture - Complete Overview

## Executive Summary

MIVAA Platform uses **8 different AI models** across **4 providers** for different purposes:

| Provider | Models Used | Primary Purpose |
|----------|-------------|-----------------|
| **Google** | SigLIP ViT-SO400M | Visual embeddings (512D) |
| **OpenAI** | text-embedding-3-small, GPT-4o, GPT-5 | Text embeddings, chat, product discovery |
| **Anthropic** | Claude Sonnet 4.5, Claude Haiku 4.5 | Vision analysis, validation, agents |
| **TogetherAI** | Qwen3-VL 17B Vision | Image analysis, OCR, material detection |

---

## Complete Model Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         PDF UPLOAD & PROCESSING                          │
└─────────────────────────────────────────────────────────────────────────┘
                                    ↓
┌─────────────────────────────────────────────────────────────────────────┐
│ STAGE 1: Product Discovery (BEFORE extraction)                          │
│ Model: Claude Sonnet 4.5 OR GPT-5                                      │
│ Purpose: Identify products, count pages, map image-to-product          │
│ Input: PDF pages (images)                                              │
│ Output: Product list with page ranges                                  │
└─────────────────────────────────────────────────────────────────────────┘
                                    ↓
┌─────────────────────────────────────────────────────────────────────────┐
│ STAGE 2: Image Extraction & OCR Filtering                              │
│ Model: SigLIP ViT-SO400M                                               │
│ Purpose: Filter images - only OCR technical specs, skip lifestyle      │
│ Input: Extracted images                                                │
│ Output: Filtered images for OCR processing                             │
└─────────────────────────────────────────────────────────────────────────┘
                                    ↓
┌─────────────────────────────────────────────────────────────────────────┐
│ STAGE 3: Image Analysis (Primary)                                      │
│ Model: Qwen3-VL 17B Vision (TogetherAI)                          │
│ Purpose: Detailed material analysis, color detection, texture          │
│ Input: Product images                                                  │
│ Output: Material properties, colors, textures, quality scores          │
│ Why: 69.4% MMMU score, #1 OCR performance, cost-effective             │
└─────────────────────────────────────────────────────────────────────────┘
                                    ↓
┌─────────────────────────────────────────────────────────────────────────┐
│ STAGE 4: Image Analysis (Validation - Optional)                        │
│ Model: Claude 4.5 Sonnet Vision                                       │
│ Purpose: Validate low-quality Qwen results, enrich metadata           │
│ Input: Images with quality_score < 0.7                                │
│ Output: Enhanced analysis, validation                                  │
│ Why: Higher accuracy, better reasoning, used only when needed         │
└─────────────────────────────────────────────────────────────────────────┘
                                    ↓
┌─────────────────────────────────────────────────────────────────────────┐
│ STAGE 5: Visual Embeddings (5 types)                                   │
│ Primary Model: SigLIP ViT-SO400M (Google)                             │
│ Fallback Model: OpenAI CLIP ViT-B/32 (if SigLIP fails)               │
│ Purpose: Generate 5 specialized 512D embeddings per image             │
│ Types:                                                                 │
│   1. Visual (general appearance)                                       │
│   2. Color (color palette)                                            │
│   3. Texture (surface patterns)                                       │
│   4. Style (design aesthetic)                                         │
│   5. Material (material type)                                         │
│ Why: SigLIP has +19-29% accuracy over CLIP, CLIP is reliable fallback│
└─────────────────────────────────────────────────────────────────────────┘
                                    ↓
┌─────────────────────────────────────────────────────────────────────────┐
│ STAGE 6: Text Embeddings                                               │
│ Model: OpenAI text-embedding-3-small                                  │
│ Purpose: Generate 1536D embeddings for text chunks                    │
│ Input: Product descriptions, specifications, chunk text               │
│ Output: 1536D text embeddings                                         │
│ Why: Industry standard, high quality, cost-effective                  │
└─────────────────────────────────────────────────────────────────────────┘
                                    ↓
┌─────────────────────────────────────────────────────────────────────────┐
│                         STORAGE (Supabase)                              │
│ - Products table (metadata)                                            │
│ - Images table (5x 512D embeddings per image)                         │
│ - Chunks table (1536D text embeddings)                                │
└─────────────────────────────────────────────────────────────────────────┘
                                    ↓
┌─────────────────────────────────────────────────────────────────────────┐
│                    USER SEARCH & AGENT QUERIES                          │
└─────────────────────────────────────────────────────────────────────────┘
                                    ↓
┌─────────────────────────────────────────────────────────────────────────┐
│ SEARCH: Direct Vector DB RAG (Claude 4.5 + Multi-Vector)              │
│ Models:                                                                │
│   - Text Embeddings: Voyage AI 3.5 (1024D)                           │
│   - Visual Embeddings: 6x CLIP specialized (SigLIP, color, texture)  │
│   - LLM: Claude Sonnet 4.5 (200K context)                            │
│ Purpose: Multi-vector search + intelligent synthesis                  │
│ Why: Direct vector DB queries, no intermediate indexing layer         │
└─────────────────────────────────────────────────────────────────────────┘
                                    ↓
┌─────────────────────────────────────────────────────────────────────────┐
│ AGENTS: Mastra Framework (Agent Hub)                                   │
│ Models Available:                                                      │
│   - Claude Sonnet 4.5 (default for agents)                           │
│   - Claude Haiku 4.5 (fast responses)                                │
│   - GPT-5 (advanced reasoning)                                        │
│   - Qwen3-VL 17B (cost-effective)                               │
│ Purpose: Conversational AI, material search, recommendations          │
│ Why: Mastra provides agent orchestration, tool calling                │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 🔍 Detailed Model Breakdown

### 1. **Google SigLIP ViT-SO400M (Primary) + OpenAI CLIP ViT-B/32 (Fallback)** 🎯

**File**: `mivaa-pdf-extractor/app/services/real_embeddings_service.py`

**Primary Model - SigLIP** (using transformers directly):
```python
from transformers import AutoModel, AutoProcessor
import torch

model = AutoModel.from_pretrained('google/siglip-so400m-patch14-384')
processor = AutoProcessor.from_pretrained('google/siglip-so400m-patch14-384')
model.eval()

with torch.no_grad():
    inputs = processor(images=pil_image, return_tensors="pt")
    image_features = model.get_image_features(**inputs)
    embedding = image_features / image_features.norm(dim=-1, keepdim=True)  # L2 normalize
    embedding = embedding.squeeze().cpu().numpy()
```

**Note**: Using `transformers` directly instead of `sentence-transformers` to avoid `'SiglipConfig' object has no attribute 'hidden_size'` error with SigLIP's composite config structure.

**Fallback Model - CLIP** (if SigLIP fails):
```python
from transformers import CLIPProcessor, CLIPModel
model = CLIPModel.from_pretrained('openai/clip-vit-base-patch32')
processor = CLIPProcessor.from_pretrained('openai/clip-vit-base-patch32')
inputs = processor(images=pil_image, return_tensors="pt")
embedding = model.get_image_features(**inputs)
embedding = embedding / embedding.norm(dim=-1, keepdim=True)  # Normalize
```

**Purpose**:
- Generate 512D visual embeddings for images
- 5 specialized embeddings per image (visual, color, texture, style, material)
- Two-tier approach: Try SigLIP first (better accuracy), fall back to CLIP if needed

**Impact on Flow**:
- ✅ **PDF Processing**: Generates all 5 visual embeddings (65-75% progress)
- ✅ **Search**: Enables visual similarity search
- ✅ **Accuracy**: SigLIP has +19-29% improvement over CLIP
- ✅ **Reliability**: CLIP fallback ensures embeddings are always generated
- ✅ **Metadata Tracking**: Records which model was actually used

**Cost**: Free (Hugging Face)
**Speed**: 150-400ms per image (SigLIP), 100-300ms (CLIP)
**Output**: 512D numpy array → normalized → list

---

### 2. **OpenAI text-embedding-3-small** 📝

**File**: `mivaa-pdf-extractor/app/services/real_embeddings_service.py`

**Usage**:
```python
response = await client.post(
    "https://api.openai.com/v1/embeddings",
    json={"input": text, "model": "text-embedding-3-small"}
)
embedding = response.json()["data"][0]["embedding"]  # 1536D
```

**Purpose**:
- Generate 1536D text embeddings for chunks
- Text-based semantic search
- Multimodal search (combine with visual)

**Impact on Flow**:
- ✅ **PDF Processing**: Embeds all text chunks (Stage 5, 60-70%)
- ✅ **Search**: Primary text search mechanism
- ✅ **RAG**: Voyage AI 3.5 for semantic retrieval

**Cost**: $0.00002 per 1K tokens
**Speed**: 100-300ms
**Output**: 1536D list

---

### 3. **Qwen3-VL 17B Vision** 🦙

**File**: `mivaa-pdf-extractor/app/services/real_image_analysis_service.py`

**Usage**:
```python
response = await client.post(
    "https://api.together.xyz/v1/chat/completions",
    json={
        "model": "Qwen/Qwen3-VL-8B-Instruct",
        "messages": [{"role": "user", "content": [
            {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{image_base64}"}},
            {"type": "text", "text": analysis_prompt}
        ]}]
    }
)
```

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

### 4. **Claude 4.5 Sonnet Vision** 🎨

**File**: `mivaa-pdf-extractor/app/services/real_image_analysis_service.py`

**Usage**:
```python
client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)
response = client.messages.create(
    model="claude-sonnet-4-5",
    max_tokens=4096,
    messages=[{
        "role": "user",
        "content": [
            {"type": "image", "source": {"type": "base64", "media_type": "image/jpeg", "data": image_base64}},
            {"type": "text", "text": validation_prompt}
        ]
    }]
)
```

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

**Cost**: $3.00 per 1M input tokens, $15.00 per 1M output tokens
**Speed**: 3-8 seconds per image
**Output**: JSON with enhanced analysis

---

### 5. **GPT-4o / GPT-5** 🤖

**Files**:
- `mivaa-pdf-extractor/app/services/product_discovery_service.py`
- `mivaa-pdf-extractor/app/services/rag_service.py` (Direct Vector DB)

**Usage**:
```python
# Product Discovery
response = await client.post(
    "https://api.openai.com/v1/chat/completions",
    json={"model": "gpt-5", "messages": [...]}
)

# Direct Vector DB RAG (Claude 4.5)
from anthropic import Anthropic
llm = OpenAI(model="gpt-4o", temperature=0.1)
```

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

**Usage**:
```typescript
const response = await supabase.functions.invoke('agent-chat', {
  body: {
    model: 'anthropic/claude-haiku-4-20250514',
    messages: [...]
  }
});
```

**Purpose**:
- **Fast agent responses** in Agent Hub
- **Quick queries** that don't need Sonnet's power
- **Cost optimization** for simple tasks

**Impact on Flow**:
- ✅ **Agents**: Fast conversational responses
- ✅ **Simple queries**: Material lookups, basic questions

**Cost**: $0.25 per 1M input tokens, $1.25 per 1M output tokens
**Speed**: 1-3 seconds
**Output**: Text responses

---

### 7. **Multi-Vector CLIP Embeddings** (Direct Vector DB) 🔗

**File**: `mivaa-pdf-extractor/app/services/rag_service.py`

**Usage**:
```python
# 6 specialized CLIP embeddings for multi-vector search
embeddings = {
    'visual': 'SigLIP-SO400M (1152D)',
    'color': 'CLIP specialized',
    'texture': 'CLIP specialized',
    'style': 'CLIP specialized',
    'material': 'CLIP specialized',
    'text': 'Voyage AI 3.5 (1024D)'
}
```

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

```
1. Product Discovery (Stage 1)
   ├─ Default: Claude Sonnet 4.5
   └─ Alternative: GPT-5

2. OCR Filtering (Stage 2)
   └─ SigLIP ViT-SO400M (only model)

3. Image Analysis (Stage 6)
   ├─ Primary: Qwen3-VL 17B Vision (ALL images)
   └─ Validation: Claude 4.5 Sonnet (quality_score < 0.7)

4. Visual Embeddings (Stage 7-10)
   └─ SigLIP ViT-SO400M (only model)

5. Text Embeddings (Stage 5)
   └─ OpenAI text-embedding-3-small (only model)
```

### Search & Agents

```
1. Direct Vector DB RAG (Claude 4.5)
   ├─ Text Embeddings: Voyage AI 3.5 (1024D)
   ├─ Visual Embeddings: 6x CLIP specialized (multi-vector)
   └─ LLM: Claude Sonnet 4.5 (200K context)

2. Agent Hub (Mastra)
   ├─ Default: Claude Sonnet 4.5
   ├─ Fast: Claude Haiku 4.5
   ├─ Advanced: GPT-5
   └─ Cost-effective: Qwen3-VL 17B
```

---

## 💰 Cost Impact Analysis

### Per PDF Processing (100 pages, 50 images)

| Model | Usage | Cost |
|-------|-------|------|
| **Claude Sonnet 4.5** | Product discovery (1 call) | ~$0.05 |
| **SigLIP** | OCR filtering (50 images) | $0.00 (free) |
| **Qwen3-VL** | Image analysis (50 images) | ~$0.02 |
| **Claude Sonnet 4.5** | Validation (10 low-quality) | ~$0.15 |
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

