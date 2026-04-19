# Complete AI Models Inventory

**Last Updated**: January 18, 2026
**Version**: 3.0.0
**Total Models**: 30+ across 5 providers

---

## 📊 AI Models by Provider

### 1. Anthropic (Claude)

#### Claude Sonnet 4.5
- **Use Cases**:
  - Product discovery from PDFs (Stage 0A)
  - Deep metadata extraction
  - Quality validation
  - Web scraping product discovery
  - XML field mapping
  - Search deduplication analysis
- **Context**: 200,000 tokens
- **Cost**: ~$0.015 per 1K tokens
- **Performance**: Highest accuracy for complex reasoning

#### Claude Haiku 4.5
- **Use Cases**:
  - Fast content classification
  - Product boundary detection
  - Saved search similarity analysis
  - Quick validation tasks
- **Context**: 200,000 tokens
- **Cost**: ~$0.0025 per 1K tokens
- **Performance**: 3× faster than Sonnet, 90%+ accuracy

---

### 2. OpenAI

#### GPT-4o
- **Use Cases**:
  - Product discovery (alternative to Claude)
  - Conversational AI agents
  - Complex reasoning tasks
  - Document analysis
- **Context**: 128,000 tokens
- **Cost**: ~$0.01 per 1K tokens

#### GPT-5
- **Use Cases**:
  - Advanced conversational AI
  - Complex multi-step reasoning
  - Future model support
- **Context**: TBD
- **Cost**: TBD

#### text-embedding-3-small (retired from production 2026-04)
- **Status**: Retired in 2026-04 from the production path. Still used only for the legacy CI changelog workflow.
- **Replacement**: Voyage AI `voyage-4` (1024D) is now the sole production text embedder. See below.
- **Dimensions**: 1536D (historical)
- **Cost**: $0.02 per 1M tokens

#### Voyage AI voyage-4 (production text embedder, updated 2026-04)
- **Use Cases**:
  - Text chunk embeddings
  - Semantic search
  - Understanding embeddings (from Qwen3-VL vision_analysis JSON)
- **Dimensions**: 1024D (stored as halfvec in VECS)
- **Dict key**: `text_1024`
- **Cost**: $0.06 per 1M tokens

---

### 3. HuggingFace Endpoint

#### Qwen3-VL 32B Vision
- **Use Cases**:
  - Material image analysis
  - Product classification
  - OCR and text extraction from images
  - Image quality scoring
  - Generating structured analysis for understanding embeddings
- **Parameters**: 32 billion
- **Modality**: Vision + Text
- **Deployment**: HuggingFace Dedicated Endpoint (auto-pause enabled)
- **Performance**:
  - 69.4% MMMU score
  - #1 ranked for OCR tasks
  - 85%+ material recognition accuracy
- **Cost**: $0.30 per 1M tokens
- **Pipeline Stages**: Image Analysis (Stage 6, 8)

---

### 4. Google

#### SLIG (SigLIP2 via HuggingFace Cloud Endpoint) — Primary visual embedder, updated 2026-04
- **Use Cases**:
  - Visual embeddings (5 types per image)
  - Image-text similarity via similarity mode
  - Visual search
  - Multi-vector search
- **Dimensions**: 768D per embedding type (halfvec in VECS)
- **Performance**: Superior to legacy CLIP 512D and SigLIP-SO400M 1152D (both retired 2026-04)
- **Cost**: Cloud endpoint (auto-pause enabled)
- **Pipeline Stages**: Image Embedding Generation (Stage 7)

**5 Embedding Types Generated** (all 768D → VECS):
1. **Visual** → `image_slig_embeddings` (producer key `visual_768`)
2. **Color** → `image_color_embeddings` (producer key `color_slig_768`)
3. **Texture** → `image_texture_embeddings` (producer key `texture_slig_768`)
4. **Style** → `image_style_embeddings` (producer key `style_slig_768`)
5. **Material** → `image_material_embeddings` (producer key `material_slig_768`)

Plus an **Understanding Embedding** (1024D Voyage AI from Qwen3-VL vision_analysis JSON) → `image_understanding_embeddings` for spec-based semantic search.

---

### 5. Replicate (14 Models for Interior Design)

#### Text-to-Image Models (7 models)

1. **FLUX.1-dev**
   - Provider: Replicate
   - Model: `black-forest-labs/flux-dev`
   - Cost: $0.025 per generation
   - Status: ✅ Working

2. **FLUX.1-schnell**
   - Provider: Replicate
   - Cost: $0.015 per generation
   - Status: ✅ Working

3. **SDXL (Stable Diffusion XL)**
   - Provider: Replicate
   - Cost: $0.020 per generation
   - Status: ✅ Working

4. **Playground v2.5**
   - Provider: Replicate
   - Model: `playgroundai/playground-v2.5-1024px-aesthetic`
   - Cost: $0.010 per generation
   - Status: ✅ Working

5. **Stable Diffusion 3**
   - Provider: Replicate
   - Model: `stability-ai/stable-diffusion-3`
   - Cost: $0.055 per generation
   - Status: ✅ Working

6. **Kandinsky 2.2**
   - Provider: Replicate
   - Cost: $0.015 per generation
   - Status: ✅ Working

7. **Proteus v0.2**
   - Provider: Replicate
   - Cost: $0.018 per generation
   - Status: ✅ Working

#### Image-to-Image Models (7 models)

**Production-Ready (3 models)**:

1. **ComfyUI Interior Remodel**
   - Provider: Replicate
   - Model: `jschoormans/comfyui-interior-remodel`
   - Cost: $0.020 per generation
   - Status: ✅ Working

2. **Interiorly Gen1 Dev**
   - Provider: Replicate
   - Model: `julian-at/interiorly-gen1-dev`
   - Cost: $0.015 per generation
   - Status: ✅ Working

3. **Designer Architecture**
   - Provider: Replicate
   - Model: `davisbrown/designer-architecture`
   - Cost: $0.018 per generation
   - Status: ✅ Working

**Experimental (4 models)**:

4. **Interior AI** - Status: ⚠️ Experimental
5. **Interior V2** - Status: ⚠️ Experimental
6. **Adirik Interior Design** - Status: ⚠️ Experimental
7. **Interior Design SDXL** - Status: ⚠️ Experimental

---

## 📈 Model Usage by Feature

### PDF Processing Pipeline
- **Stage 0A (Product Discovery)**: Claude Sonnet 4.5 or GPT-4o
- **Stage 0B (Entity Discovery)**: Claude Sonnet 4.5 or GPT-4o
- **Stage 2 (Text Embeddings)**: Voyage AI voyage-4 (1024D, updated 2026-04)
- **Stage 6 (Image Classification)**: Qwen3-VL 17B Vision
- **Stage 7 (SLIG Embeddings)**: SigLIP2 via HuggingFace cloud endpoint (768D, 5 types + understanding 1024D)
- **Stage 8 (Image Analysis)**: Qwen3-VL 17B Vision

### Web Scraping Integration
- **Product Discovery**: Claude Sonnet 4.5 (default), GPT-5, or Claude Haiku 4.5
- **Content Analysis**: Same models as PDF Stage 0A

### XML Import
- **Field Mapping**: Claude Sonnet 4.5
- **Dynamic mapping with AI reasoning**

### Interior Design Generation
- **Text-to-Image**: 7 Replicate models (FLUX, SDXL, etc.)
- **Image-to-Image**: 3 production-ready Replicate models
- **Parallel processing**: 3 concurrent generations

### Saved Searches Deduplication
- **Similarity Analysis**: Claude Haiku 4.5
- **Semantic fingerprinting and merging**

### Price Monitoring
- **Web Content Analysis**: Firecrawl + Claude for price extraction

---

## 💰 Cost Optimization Strategy

### High-Volume Operations (Use Cheaper Models)
- **Quick Classification**: Claude Haiku 4.5 ($0.0025/1K tokens)
- **Text Embeddings**: Voyage AI voyage-4 ($0.06/1M tokens, updated 2026-04)
- **Visual Embeddings**: SLIG SigLIP2 cloud endpoint (auto-pause enabled)

### High-Accuracy Operations (Use Premium Models)
- **Product Discovery**: Claude Sonnet 4.5 ($0.015/1K tokens)
- **Metadata Extraction**: Claude Sonnet 4.5
- **Spatial Analysis**: Claude Sonnet 4.5 Vision

### Parallel Processing
- **Interior Design**: Process 3 models concurrently
- **CLIP Embeddings**: Batch process 20 images at a time
- **Image Downloads**: 5 concurrent downloads

---

## 🎯 Model Selection Guidelines

### When to Use Claude Sonnet 4.5
- Complex reasoning required
- High accuracy needed
- Detailed metadata extraction
- Multi-step analysis
- **Cost**: Higher but worth it for quality

### When to Use Claude Haiku 4.5
- Simple classification tasks
- Quick validation
- High-volume operations
- Real-time analysis
- **Cost**: 6× cheaper than Sonnet

### When to Use GPT-4o/GPT-5
- Conversational AI
- Alternative to Claude (load balancing)
- Multimodal capabilities needed
- **Cost**: Competitive with Claude

### When to Use Qwen3-VL
- Image analysis and OCR
- Material recognition
- Visual quality scoring
- **Cost**: Moderate, excellent value

### When to Use SigLIP CLIP
- Visual similarity search
- Multi-vector embeddings
- High-volume image processing
- **Cost**: Free (self-hosted)

---

## 📊 Performance Benchmarks

| Model | Use Case | Speed | Accuracy | Cost/Operation |
|-------|----------|-------|----------|----------------|
| Claude Sonnet 4.5 | Product Discovery | 3-5s | 95%+ | $0.05-0.15 |
| Claude Haiku 4.5 | Classification | 0.5-1s | 90%+ | $0.01-0.03 |
| GPT-4o | Discovery | 2-4s | 93%+ | $0.04-0.12 |
| Qwen3-VL | Image Analysis | 2-3s | 90%+ | $0.02-0.05 |
| SigLIP CLIP | Embeddings | 0.1-0.3s | 95%+ | $0.00 |
| FLUX Dev | Interior Design | 5-13s | 92%+ | $0.025 |
| ComfyUI | Room Transform | 8-15s | 88%+ | $0.020 |

---

## 🔄 Model Fallback Strategy

### Primary → Secondary → Tertiary

**Product Discovery**:
1. Claude Sonnet 4.5 (primary)
2. GPT-4o (secondary)
3. Claude Haiku 4.5 (tertiary, lower accuracy)

**Image Analysis**:
1. Qwen3-VL 17B (primary)
2. Claude Vision (secondary, more expensive)
3. GPT-4 Vision (tertiary)

**Visual Embeddings**:
1. SigLIP ViT-SO400M (primary)
2. CLIP ViT-B/32 (secondary)
3. Skip if both fail (graceful degradation)

---

## 🆕 Recently Added Models

**January 2026**:
- ✨ Added 14 Replicate models for interior design
- ✨ Expanded SigLIP to generate 5 embedding types (was 1)
- ✨ Added GPT-5 support (future-proofing)

**December 2025**:
- ✨ Upgraded to Claude Sonnet 4.5 (from 3.5)
- ✨ Upgraded to Claude Haiku 4.5 (from 3.5)
- ✨ Added Google SigLIP as primary CLIP model

---

## 📚 Related Documentation

- [PDF Processing Pipeline](./pdf-processing-pipeline.md) - Detailed pipeline with model usage
- [Interior Design Models](./interior-design-models.md) - 14 Replicate models
- [Web Scraping Integration](./web-scraping-integration.md) - AI-powered product discovery
- [Async Processing & Limits](./async-processing-and-limits.md) - Concurrency limits per model

---

**Total Investment**: 30+ AI models across 5 providers
**Total Cost Range**: $0.00 - $0.055 per operation (varies by model and task)
**Success Rate**: 95%+ across all models
**Uptime**: 99.5%+ (production environment)
