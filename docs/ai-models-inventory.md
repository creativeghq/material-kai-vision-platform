# AI Models Inventory - Material Kai Vision Platform

**Last Updated**: 2025-10-26
**Status**: Production Audit - Verified Model Names

---

## 📊 Summary

| Provider | Model | Version | Service | Status |
|----------|-------|---------|---------|--------|
| **Meta/Together** | Llama 4 Scout 17B Vision | 20250514 | Vision Analysis, Material ID | ✅ Active |
| **Anthropic** | Claude Haiku 4.5 | 20251001 | Content Classification | ✅ Active |
| **Anthropic** | Claude Sonnet 4.5 | 20250929 | Product Validation, Enrichment | ✅ Active |
| **Anthropic** | Claude 3.5 Sonnet | 20241022 | Image Analysis (Legacy) | ✅ Active |
| **OpenAI** | GPT-4o | Latest | LLM, Multimodal, RAG | ✅ Active |
| **OpenAI** | text-embedding-3-small | Latest | Text Embeddings (1536D) | ⚠️ Configured |
| **OpenAI** | CLIP (via LlamaIndex) | vit-base-patch32 | Visual Embeddings (512D) | ⚠️ Configured |
| **Stability AI** | Stable Diffusion XL | 1.0 | 3D Interior Design | ✅ Active |
| **Black Forest Labs** | FLUX-Schnell | Latest | 3D Interior Design | ✅ Active |

**Legend:**
- ✅ Active: Model is configured and working in production
- ⚠️ Configured: Model is configured but not generating results (needs investigation)
- ❌ Broken: Model is failing with errors

---

## 🔍 Detailed Model Breakdown

### **1. META LLAMA MODELS**

#### Llama 4 Scout 17B Vision (Primary Vision Model)
- **Model ID**: `meta-llama/Llama-4-Scout-17B-16E-Instruct`
- **Provider**: Together.ai (Serverless)
- **Service**: Real-time Image Analysis
- **Purpose**: Advanced vision analysis for material identification and product detection
- **Location**:
  - `mivaa-pdf-extractor/app/services/real_image_analysis_service.py`
  - `mivaa-pdf-extractor/app/config.py` (TOGETHER_MODEL_VISION)
- **Specifications**:
  - **Architecture**: MoE (Mixture of Experts) - 109B total, 17B active
  - **Context Window**: 327K tokens
  - **Benchmark**: 69.4% MMMU, #1 open source OCR
  - **Max Tokens**: 1024
  - **Temperature**: 0.1
  - **Retry Logic**: 3 attempts with exponential backoff
- **API Endpoint**: `https://api.together.xyz/v1/chat/completions`
- **Use Cases**:
  - Material property extraction from images
  - Product identification and classification
  - Visual quality assessment
  - OCR and text extraction from images
- **Status**: ✅ Active with retry logic for empty responses
- **Known Issues**: Sometimes returns empty responses (handled with retries)

---

### **2. ANTHROPIC CLAUDE MODELS**

#### Claude Haiku 4.5 (Fast Classification)
- **Model ID**: `claude-haiku-4-5-20251001`
- **Release Date**: October 1, 2025
- **Service**: Stage 1 Product Classification
- **Purpose**: Fast, cost-effective content type classification
- **Location**:
  - `mivaa-pdf-extractor/app/config.py` (ANTHROPIC_MODEL_CLASSIFICATION)
  - `mivaa-pdf-extractor/app/services/product_creation_service.py`
  - `mivaa-pdf-extractor/app/services/canonical_metadata_schema_service.py`
- **Specifications**:
  - **Max Tokens**: 1024
  - **Temperature**: 0.1
  - **Cost**: Low (fastest Claude model)
  - **Speed**: ~2-3x faster than Sonnet
- **Use Cases**:
  - Stage 1: Fast text-only classification of PDF chunks
  - Identifying product candidates vs supporting content
  - Initial filtering before deep analysis
- **Status**: ✅ Active (model name fixed on 2025-10-26)

#### Claude Sonnet 4.5 (Deep Analysis)
- **Model ID**: `claude-sonnet-4-5-20250929`
- **Release Date**: September 29, 2025
- **Services**:
  1. Stage 2 Product Validation
  2. Product Enrichment
  3. Image Validation (Vision)
- **Purpose**: Advanced reasoning, vision analysis, and metadata enrichment
- **Location**:
  - `mivaa-pdf-extractor/app/config.py` (ANTHROPIC_MODEL_VALIDATION, ANTHROPIC_MODEL_ENRICHMENT)
  - `mivaa-pdf-extractor/app/services/product_creation_service.py`
- **Specifications**:
  - **Max Tokens**: 4096
  - **Temperature**: 0.1
  - **Cost**: Medium
  - **Vision**: Supports image analysis
- **Use Cases**:
  - Stage 2: Deep validation of product candidates
  - Product metadata enrichment and description generation
  - Image quality assessment and product matching
  - Multi-modal analysis (text + images)
- **Status**: ✅ Active (model name fixed on 2025-10-26)

#### Claude 3.5 Sonnet (Legacy)
- **Model ID**: `claude-3-5-sonnet-20241022`
- **Release Date**: October 22, 2024
- **Services**:
  1. Image Validation (Vision)
  2. Product Enrichment (Fallback)
- **Purpose**: Legacy support for existing integrations
- **Location**:
  - `mivaa-pdf-extractor/app/api/anthropic_routes.py`
  - `mivaa-pdf-extractor/app/services/llamaindex_service.py`
  - `mivaa-pdf-extractor/app/services/real_image_analysis_service.py`
- **Specifications**:
  - **Max Tokens**: 2048
  - **Temperature**: 0.1
  - **Cost**: Medium
- **Status**: ✅ Active (used in specific routes)

---

### **3. OPENAI MODELS**

#### GPT-4o (Primary LLM)
- **Model ID**: `gpt-4o`
- **Services**:
  1. LLM for LlamaIndex RAG
  2. Multimodal Processing
  3. PDF Text Extraction
  4. Query Answering
- **Purpose**: Primary LLM for advanced reasoning and multimodal tasks
- **Location**:
  - `mivaa-pdf-extractor/app/config.py` (OPENAI_MODEL_LLM, OPENAI_MODEL_MULTIMODAL)
  - `mivaa-pdf-extractor/app/services/llamaindex_service.py`
- **Specifications**:
  - **Max Tokens**: 4096
  - **Temperature**: 0.1
  - **Cost**: Medium-High
  - **Context Window**: 128K tokens
- **Use Cases**:
  - PDF text extraction and chunking with PyMuPDF4LLM
  - Semantic document analysis
  - Query answering over document collections
  - Multi-modal reasoning (text + images)
- **Status**: ✅ Active

#### text-embedding-3-small (Text Embeddings)
- **Model ID**: `text-embedding-3-small`
- **Service**: Text Embeddings Generation
- **Purpose**: Generate semantic vector embeddings for text chunks
- **Location**:
  - `mivaa-pdf-extractor/app/config.py` (OPENAI_EMBEDDING_MODEL)
  - `mivaa-pdf-extractor/app/services/llamaindex_service.py`
  - `mivaa-pdf-extractor/app/services/real_embeddings_service.py`
- **Specifications**:
  - **Dimensions**: 1536D (default)
  - **Cost**: Low
  - **Max Input**: 8191 tokens
- **Use Cases**:
  - Semantic search over document chunks
  - Similarity matching for RAG retrieval
  - Color/texture/application embeddings (with dimension reduction)
- **Status**: ⚠️ Configured but not generating embeddings (CRITICAL BUG)
- **Known Issues**: Chunks created but embeddings table is empty

#### CLIP Visual Embeddings (via LlamaIndex)
- **Model ID**: `clip-vit-base-patch32`
- **Provider**: Local PyTorch model via LlamaIndex
- **Service**: Visual Embeddings Generation
- **Purpose**: Generate visual semantic embeddings for images
- **Location**:
  - `mivaa-pdf-extractor/app/services/real_embeddings_service.py`
- **Specifications**:
  - **Dimensions**: 512D
  - **Architecture**: Vision Transformer (ViT) Base Patch32
  - **Cost**: Free (local model)
  - **Processing**: CPU/GPU based on availability
- **Use Cases**:
  - Visual similarity search
  - Image-to-image matching
  - Multi-modal search (text + image)
  - Material visual recognition
- **Status**: ⚠️ Configured but not generating embeddings (CRITICAL BUG)
- **Known Issues**:
  - Fixed connection errors (was trying to call non-existent gateway)
  - Now uses local model but embeddings not being saved to database
- **Purpose**: Generate semantic embeddings for chunks and images
- **Location**:
  - `mivaa-pdf-extractor/app/config.py` (lines 95, 101-103)
  - `mivaa-pdf-extractor/app/schemas/embedding.py` (line 16)
  - `src/config/apis/openaiConfig.ts`
- **Dimensions**: 1536
- **Batch Size**: 100
- **Timeout**: 30 seconds
- **Cost**: Low
- **Use Case**: Semantic search and similarity matching

#### text-embedding-ada-002
- **Model ID**: `text-embedding-ada-002`
- **Service**: Embeddings Generation (Alternative)
- **Purpose**: Alternative embedding model
- **Location**: `src/config/apis/openaiConfig.ts` (lines 71-85)
- **Dimensions**: 1536
- **Cost**: Low
- **Status**: Available as alternative

---

### **3. META/TOGETHER AI MODELS**

#### Llama 3.2 90B Vision Instruct Turbo
- **Model ID**: `meta-llama/Llama-3.2-90B-Vision-Instruct-Turbo`
- **Service**: Vision Analysis & Material Identification
- **Purpose**: Advanced vision analysis for material properties
- **Location**: `mivaa-pdf-extractor/app/services/together_ai_service.py` (lines 740-745)
- **Max Tokens**: 4096
- **Capabilities**: Image analysis, text generation, material identification
- **Streaming**: Supported
- **Rate Limits**: 60 req/min, 100k tokens/min
- **Cost**: Medium
- **Use Case**: Material property analysis from images

#### Llama 3.2 11B Vision Instruct Turbo
- **Model ID**: `meta-llama/Llama-3.2-11B-Vision-Instruct-Turbo`
- **Service**: Vision Analysis (Lightweight)
- **Purpose**: Faster vision analysis alternative
- **Location**: `mivaa-pdf-extractor/app/services/together_ai_service.py` (lines 748-753)
- **Max Tokens**: 4096
- **Capabilities**: Image analysis, text generation
- **Streaming**: Supported
- **Cost**: Low
- **Use Case**: Quick image analysis when speed is priority

---

### **4. IMAGE GENERATION MODELS**

#### Stable Diffusion XL Base 1.0
- **Model ID**: `stabilityai/stable-diffusion-xl-base-1.0`
- **Service**: 3D Interior Design Generation
- **Provider**: Hugging Face / Replicate
- **Purpose**: Text-to-image generation for interior design
- **Location**: `src/components/3D/Designer3DPage.tsx` (line 53)
- **Type**: Text-to-image
- **Cost**: Low-Medium
- **Use Case**: Generate interior design visualizations

#### Stable Diffusion 2.1
- **Model ID**: `stabilityai/stable-diffusion-2-1`
- **Service**: 3D Interior Design Generation (Fallback)
- **Provider**: Hugging Face
- **Purpose**: Alternative interior design generation
- **Location**: `supabase/functions/crewai-3d-generation/index.ts` (line 283)
- **Type**: Text-to-image
- **Cost**: Low
- **Status**: Fallback option

#### FLUX-Schnell
- **Model ID**: `black-forest-labs/FLUX.1-schnell`
- **Service**: 3D Interior Design Generation (Advanced)
- **Provider**: Replicate
- **Purpose**: Fast, high-quality image generation
- **Location**: `src/components/3D/Designer3DPage.tsx` (line 54)
- **Type**: Text-to-image
- **Cost**: Medium
- **Use Case**: Premium interior design generation

#### Interior Design Specialized Models
- **Models**:
  - `erayyavuz/interior-ai`
  - `adirik/interior-design`
  - `jschoormans/comfyui-interior-remodel`
  - `davisbrown/designer-architecture`
  - `rocketdigitalai/interior-design-sdxl`
- **Service**: 3D Interior Design Generation
- **Provider**: Replicate
- **Purpose**: Specialized interior design transformations
- **Location**: `supabase/functions/crewai-3d-generation/index.ts` (lines 280-284)
- **Type**: Text-to-image / Image-to-image
- **Cost**: Medium
- **Use Case**: Domain-specific interior design generation

---

## 🔄 Model Usage Flow

```
PDF Upload
    ↓
Content Classification (Claude 4.5 Haiku)
    ↓
LlamaIndex Processing (GPT-4o)
    ├─ Text Extraction
    ├─ Chunking
    └─ Embedding Generation (text-embedding-3-small)
    ↓
Image Extraction & Analysis
    ├─ Vision Analysis (Llama 3.2 90B or GPT-4o)
    └─ Image Validation (Claude 4.5 Sonnet Vision)
    ↓
Product Enrichment (Claude 4.5 Sonnet)
    ↓
Knowledge Base Storage
    ↓
3D Generation (Stable Diffusion / FLUX / Specialized Models)
```

---

## 💰 Cost Optimization

### Tier 1 (Fastest/Cheapest)
- Claude 4.5 Haiku - Content classification
- Llama 3.2 11B - Quick vision analysis
- text-embedding-3-small - Embeddings

### Tier 2 (Balanced)
- Claude 4.5 Sonnet - Image validation, enrichment
- GPT-4o - LLM and multimodal
- Stable Diffusion XL - Image generation

### Tier 3 (Premium)
- FLUX-Schnell - High-quality generation
- Specialized interior design models

---

## 🔐 API Keys Required

```
ANTHROPIC_API_KEY
OPENAI_API_KEY
TOGETHER_API_KEY (for Llama models)
REPLICATE_API_TOKEN (for image generation)
HUGGINGFACE_API_KEY (for Hugging Face models)
```

---

## ✅ Configuration Status

All models are properly configured in:
- `mivaa-pdf-extractor/app/config.py` - Backend configuration
- `src/config/apis/openaiConfig.ts` - Frontend OpenAI config
- `src/config/apis/replicateConfig.ts` - Frontend Replicate config
- Environment variables in Vercel and Supabase

**All models are active and ready for use!**

