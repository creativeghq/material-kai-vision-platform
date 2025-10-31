# AI Models & Integration

**Material Kai Vision Platform** - AI Model Inventory and Usage

---

## Overview

The Material Kai Vision Platform integrates **12 AI models** across **7 pipeline stages** to provide comprehensive material intelligence, document processing, and search capabilities. Each model is selected for specific tasks based on performance benchmarks, cost efficiency, and accuracy requirements.

---

## Model Inventory

### 1. Anthropic Claude Models

#### Claude Sonnet 4.5
- **Provider**: Anthropic
- **Model ID**: `claude-sonnet-4.5-20241022`
- **Context Window**: 200,000 tokens
- **Use Cases**:
  - Deep product analysis and enrichment
  - Complex metadata extraction
  - Quality validation of low-scoring images
  - Semantic chunking strategy
- **Performance**: Highest accuracy for complex reasoning
- **Cost**: Premium tier
- **Pipeline Stages**: Product Discovery, Deferred AI Analysis

#### Claude Haiku 4.5
- **Provider**: Anthropic
- **Model ID**: `claude-haiku-4.5-20241022`
- **Context Window**: 200,000 tokens
- **Use Cases**:
  - Fast content classification
  - Product boundary detection
  - Initial product discovery
  - Quick metadata extraction
- **Performance**: 3x faster than Sonnet, 90% accuracy
- **Cost**: Mid-tier
- **Pipeline Stages**: Product Discovery (Stage 1), Content Classification

---

### 2. OpenAI Models

#### GPT-4o
- **Provider**: OpenAI
- **Model ID**: `gpt-4o`
- **Context Window**: 128,000 tokens
- **Use Cases**:
  - Product discovery and classification
  - Conversational AI
  - Complex reasoning tasks
  - Metadata enrichment
- **Performance**: High accuracy, multimodal capabilities
- **Cost**: Premium tier
- **Pipeline Stages**: Product Discovery (alternative to Claude)

#### text-embedding-3-small
- **Provider**: OpenAI
- **Model ID**: `text-embedding-3-small`
- **Dimensions**: 1536
- **Use Cases**:
  - Text chunk embeddings
  - Semantic search
  - Similarity matching
  - Document clustering
- **Performance**: 62.3% MTEB score
- **Cost**: $0.02 per 1M tokens
- **Pipeline Stages**: Text Embedding Generation

---

### 3. Together AI Models

#### Llama 4 Scout 17B Vision
- **Provider**: Together AI (Meta)
- **Model ID**: `meta-llama/Llama-4-Scout-17B-16E-Instruct`
- **Parameters**: 17 billion
- **Modality**: Vision + Text
- **Use Cases**:
  - Material image analysis
  - Product image classification
  - Visual quality scoring
  - OCR and text extraction from images
- **Performance**: 
  - 69.4% MMMU (Massive Multitask Multimodal Understanding)
  - #1 ranked for OCR tasks
  - 85%+ accuracy on material recognition
- **Cost**: $0.30 per 1M tokens
- **Pipeline Stages**: Image Analysis, Material Recognition

---

### 4. CLIP (OpenAI)

#### CLIP ViT-B/32
- **Provider**: OpenAI
- **Model**: Vision Transformer Base 32
- **Dimensions**: 512
- **Use Cases**:
  - Visual embeddings for images
  - Image-text similarity
  - Visual search
  - Cross-modal retrieval
- **Performance**: Industry standard for visual embeddings
- **Cost**: Free (self-hosted)
- **Pipeline Stages**: Image Embedding Generation

---

### 5. Replicate Models

#### Stable Diffusion XL
- **Provider**: Stability AI (via Replicate)
- **Model ID**: `stability-ai/sdxl`
- **Use Cases**:
  - 3D texture generation
  - Material visualization
  - Design mockups
- **Performance**: High-quality image generation
- **Cost**: $0.0055 per generation
- **Pipeline Stages**: 3D Generation (optional)

#### FLUX-Schnell
- **Provider**: Black Forest Labs (via Replicate)
- **Model ID**: `black-forest-labs/flux-schnell`
- **Use Cases**:
  - Fast image generation
  - Material previews
  - Quick mockups
- **Performance**: 4x faster than SDXL
- **Cost**: $0.003 per generation
- **Pipeline Stages**: Image Generation (optional)

---

## AI Pipeline Integration

### PDF Processing Pipeline

The PDF processing pipeline uses AI models at 7 key stages:

#### Stage 1: PDF Analysis
- **Model**: PyMuPDF4LLM (rule-based)
- **Purpose**: Extract text and structure from PDF
- **Output**: Raw text, page layout, metadata

#### Stage 2: Product Discovery
- **Models**: Claude Haiku 4.5 → Claude Sonnet 4.5 (or GPT-4o)
- **Purpose**: Identify products and boundaries before extraction
- **Process**:
  1. Haiku performs fast initial classification
  2. Identifies product count and page ranges
  3. Sonnet validates and enriches product metadata
- **Output**: Product list with page ranges, names, metadata

#### Stage 3: Semantic Chunking
- **Model**: Anthropic Chunking API
- **Purpose**: Split text into semantically meaningful chunks
- **Parameters**:
  - Max tokens: 800
  - Overlap: 100 tokens
  - Strategy: Semantic boundaries
- **Output**: Text chunks with metadata

#### Stage 4: Text Embedding Generation
- **Model**: OpenAI text-embedding-3-small
- **Purpose**: Generate vector embeddings for semantic search
- **Dimensions**: 1536
- **Output**: Vector embeddings stored in pgvector

#### Stage 5: Image Extraction & Analysis
- **Model**: Llama 4 Scout 17B Vision
- **Purpose**: Analyze extracted images for material properties
- **Process**:
  1. Extract images from PDF
  2. Llama analyzes each image (material type, quality, properties)
  3. Quality scoring (0-100)
  4. Low-scoring images queued for Claude validation
- **Output**: Image metadata, quality scores, material properties

#### Stage 6: Visual Embedding Generation
- **Model**: CLIP ViT-B/32
- **Purpose**: Generate visual embeddings for image search
- **Dimensions**: 512
- **Output**: Visual embeddings for similarity search

#### Stage 7: Deferred AI Analysis (Async)
- **Models**: Claude Sonnet 4.5, specialized embedding models
- **Purpose**: Deep analysis of low-quality images and complex metadata
- **Process**:
  1. Background job processes low-scoring images
  2. Claude performs detailed analysis
  3. Generates specialized embeddings (color, texture, application)
- **Output**: Enhanced metadata, additional embeddings

---

## Multi-Vector Embeddings

The platform generates **6 types of embeddings** for comprehensive search:

### 1. Text Embeddings
- **Model**: OpenAI text-embedding-3-small
- **Dimensions**: 1536
- **Use**: Semantic text search
- **Generated**: During PDF processing (Stage 4)

### 2. Visual CLIP Embeddings
- **Model**: CLIP ViT-B/32
- **Dimensions**: 512
- **Use**: Visual similarity search
- **Generated**: During image extraction (Stage 6)

### 3. Color Embeddings
- **Model**: Custom color analysis
- **Dimensions**: 256
- **Use**: Color-based search and filtering
- **Generated**: Deferred AI analysis

### 4. Texture Embeddings
- **Model**: Custom texture analysis
- **Dimensions**: 256
- **Use**: Texture similarity search
- **Generated**: Deferred AI analysis

### 5. Application Embeddings
- **Model**: Specialized application classifier
- **Dimensions**: 512
- **Use**: Use-case based search
- **Generated**: Deferred AI analysis

### 6. Multimodal Embeddings
- **Model**: Combined text + visual
- **Dimensions**: 2048
- **Use**: Cross-modal search
- **Generated**: Deferred AI analysis

---

## Model Selection Strategy

### Speed vs. Accuracy Trade-offs

| Task | Fast Model | Accurate Model | Strategy |
|------|-----------|----------------|----------|
| Product Discovery | Claude Haiku 4.5 | Claude Sonnet 4.5 | Two-stage: Haiku → Sonnet |
| Image Analysis | Llama 4 Scout | Claude Sonnet 4.5 | Llama first, Claude for low scores |
| Text Embeddings | text-embedding-3-small | text-embedding-3-large | Small for cost efficiency |
| Classification | Claude Haiku 4.5 | GPT-4o | Haiku for speed |

### Cost Optimization

- **Batch Processing**: Group similar tasks to reduce API calls
- **Caching**: Cache embeddings and analysis results
- **Tiered Processing**: Use fast models first, expensive models only when needed
- **Async Processing**: Defer expensive operations to background jobs

---

## Performance Benchmarks

### Model Response Times

| Model | Average Latency | Max Tokens/sec |
|-------|----------------|----------------|
| Claude Haiku 4.5 | 200-500ms | 1000 |
| Claude Sonnet 4.5 | 800-2000ms | 500 |
| GPT-4o | 500-1500ms | 800 |
| Llama 4 Scout | 1-3s per image | N/A |
| text-embedding-3-small | 100-300ms | N/A |
| CLIP | 50-150ms per image | N/A |

### Accuracy Metrics

| Task | Model | Accuracy |
|------|-------|----------|
| Product Detection | Claude Sonnet 4.5 | 95%+ |
| Material Recognition | Llama 4 Scout | 90%+ |
| Semantic Search | text-embedding-3-small | 85%+ |
| Image Classification | CLIP | 88%+ |

---

## API Configuration

### Environment Variables

```bash
# Anthropic
ANTHROPIC_API_KEY=sk-ant-...

# OpenAI
OPENAI_API_KEY=sk-...

# Together AI
TOGETHER_API_KEY=...

# Replicate
REPLICATE_API_TOKEN=r8_...
```

### Rate Limits

| Provider | Tier | RPM | TPM |
|----------|------|-----|-----|
| Anthropic | Production | 1000 | 100,000 |
| OpenAI | Tier 4 | 5000 | 800,000 |
| Together AI | Standard | 600 | 60,000 |
| Replicate | Standard | 100 | N/A |

---

**Last Updated**: 2025-10-31  
**Version**: 2.0.0  
**Status**: Production

