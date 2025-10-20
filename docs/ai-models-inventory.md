# AI Models Inventory - Material Kai Vision Platform

**Last Updated**: 2025-10-20  
**Status**: Complete Platform Audit

---

## 📊 Summary

| Provider | Model | Version | Service | Status |
|----------|-------|---------|---------|--------|
| **Anthropic** | Claude 4.5 Haiku | 20250514 | Content Classification | ✅ Active |
| **Anthropic** | Claude 4.5 Sonnet | 20250514 | Image Validation, Product Enrichment | ✅ Active |
| **Anthropic** | Claude 3.5 Sonnet | 20241022 | Image Validation, Product Enrichment | ✅ Active |
| **OpenAI** | GPT-4o | Latest | LLM, Multimodal, Image Analysis | ✅ Active |
| **OpenAI** | text-embedding-3-small | Latest | Embeddings (1536D) | ✅ Active |
| **OpenAI** | text-embedding-ada-002 | Latest | Embeddings (1536D) | ✅ Active |
| **Meta/Together** | Llama 3.2 90B Vision | Turbo | Vision Analysis, Material ID | ✅ Active |
| **Meta/Together** | Llama 3.2 11B Vision | Turbo | Vision Analysis | ✅ Active |
| **Stability AI** | Stable Diffusion XL | 1.0 | 3D Interior Design | ✅ Active |
| **Stability AI** | Stable Diffusion 2.1 | 2.1 | 3D Interior Design | ✅ Active |
| **Black Forest Labs** | FLUX-Schnell | Latest | 3D Interior Design | ✅ Active |
| **Various** | Interior Design Models | Various | 3D Generation | ✅ Active |

---

## 🔍 Detailed Model Breakdown

### **1. ANTHROPIC CLAUDE MODELS**

#### Claude 4.5 Haiku (Latest)
- **Model ID**: `claude-4-5-haiku-20250514`
- **Service**: Content Classification
- **Purpose**: Fast, lightweight content type classification
- **Location**: 
  - `src/services/ContentClassificationService.ts`
  - `supabase/functions/classify-content/index.ts`
- **Max Tokens**: 1024
- **Temperature**: 0.1
- **Cost**: Low (fastest model)
- **Use Case**: Classifying PDF chunks as product/supporting/administrative/transitional

#### Claude 4.5 Sonnet (Latest)
- **Model ID**: `claude-4-5-sonnet-20250514`
- **Services**: 
  1. Image Validation (Vision)
  2. Product Enrichment
- **Purpose**: Advanced reasoning and vision analysis
- **Location**: 
  - `mivaa-pdf-extractor/app/config.py` (lines 275-281)
  - `mivaa-pdf-extractor/app/api/anthropic_routes.py`
- **Max Tokens**: 4096
- **Temperature**: 0.1
- **Cost**: Medium
- **Use Cases**:
  - Image quality assessment and product matching
  - Product metadata enrichment and description generation

#### Claude 3.5 Sonnet (Previous Generation)
- **Model ID**: `claude-3-5-sonnet-20241022`
- **Services**:
  1. Image Validation (Vision)
  2. Product Enrichment
- **Purpose**: Fallback for image validation and enrichment
- **Location**:
  - `src/services/AnthropicImageValidationService.ts`
  - `src/services/AnthropicProductEnrichmentService.ts`
  - `mivaa-pdf-extractor/app/api/anthropic_routes.py` (lines 127, 247)
- **Max Tokens**: 2048
- **Temperature**: 0.1
- **Cost**: Medium
- **Status**: Active (fallback)

---

### **2. OPENAI MODELS**

#### GPT-4o (Latest)
- **Model ID**: `gpt-4o`
- **Services**:
  1. LLM for LlamaIndex RAG
  2. Multimodal Processing
  3. Image Analysis
  4. General Text Generation
- **Purpose**: Primary LLM for advanced reasoning and multimodal tasks
- **Location**:
  - `mivaa-pdf-extractor/app/config.py` (lines 94, 106, 136, 200)
  - `mivaa-pdf-extractor/app/services/llamaindex_service.py` (lines 115, 122, 621-626)
- **Max Tokens**: 4096
- **Temperature**: 0.1
- **Cost**: Medium-High
- **Use Cases**:
  - PDF text extraction and chunking
  - Multimodal document analysis
  - Image content analysis
  - Query answering over documents

#### text-embedding-3-small
- **Model ID**: `text-embedding-3-small`
- **Service**: Embeddings Generation
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

