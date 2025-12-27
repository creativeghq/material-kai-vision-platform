# AI Models Integration Guide

**Last Updated:** 2025-12-26

Complete reference of all AI models used across the Material KAI Vision Platform.

---

## AI Models Overview

| Model | Provider | Purpose | Capability | Cost (per 1M tokens) |
|-------|----------|---------|-----------|---------------------|
| **Text Generation** |
| Claude Sonnet 4.5 | Anthropic | Product discovery, enrichment | 95%+ accuracy | $3 input / $15 output |
| Claude Haiku 4.5 | Anthropic | Fast validation | Real-time | $0.80 input / $4 output |
| Claude Opus 4.5 | Anthropic | Complex reasoning | Highest accuracy | $15 input / $75 output |
| GPT-4o | OpenAI | Alternative discovery | 94%+ accuracy | $2.50 input / $10 output |
| GPT-4o Mini | OpenAI | Lightweight tasks | Fast & cheap | $0.15 input / $0.60 output |
| Qwen3-VL 17B | Together AI | Open-source alternative | Good performance | $0.20 input / $0.20 output |
| **Text Embeddings** |
| Voyage-3 | Voyage AI | **PRIMARY** Text embeddings | 1024D vectors | $0.06 input |
| Voyage-3 Lite | Voyage AI | Lightweight embeddings | 512D vectors | $0.02 input |
| text-embedding-3-small | OpenAI | Legacy text embeddings | 1536D vectors | $0.02 input |
| text-embedding-3-large | OpenAI | Large text embeddings | 3072D vectors | $0.13 input |
| **Vision Models** |
| Qwen3-VL-32B | Together AI | **PRIMARY** Vision analysis | State-of-the-art | $0.50 input / $1.50 output |
| Qwen3-VL-8B | Together AI | Lightweight vision | Fast vision | $0.08 input / $0.50 output |
| CLIP (Visual) | OpenAI | Visual embeddings | 512D vectors | Free |
| CLIP (Color) | OpenAI | Color analysis | 512D vectors | Free |
| CLIP (Texture) | OpenAI | Texture analysis | 512D vectors | Free |
| CLIP (Style) | OpenAI | Style analysis | 512D vectors | Free |
| CLIP (Material) | OpenAI | Material classification | 512D vectors | Free |

---

## Model Details

### 1. Claude Sonnet 4.5 (Anthropic)

**Purpose**: Product discovery, enrichment, validation

**Capabilities**:
- Analyze complex product catalogs
- Extract structured metadata
- Validate product completeness
- Generate product descriptions

**Usage**:
```python
from anthropic import Anthropic

client = Anthropic(api_key=ANTHROPIC_API_KEY)
response = client.messages.create(
    model="claude-sonnet-4-5",
    max_tokens=8000,
    temperature=0.1,
    messages=[{
        "role": "user",
        "content": "Analyze this product catalog..."
    }]
)
```

**Performance**:
- Accuracy: 95%+
- Latency: 2-5 seconds
- Cost: $3 per 1M input tokens

**When to Use**:
- Product discovery
- Complex analysis
- Detailed enrichment
- Quality validation

---

### 2. Claude Haiku 4.5 (Anthropic)

**Purpose**: Fast validation, real-time processing

**Capabilities**:
- Quick product candidate identification
- Basic metadata extraction
- Real-time validation

**Usage**:
```python
response = client.messages.create(
    model="claude-haiku-4-5",
    max_tokens=1000,
    messages=[{
        "role": "user",
        "content": "Is this a product?"
    }]
)
```

**Performance**:
- Accuracy: 92%+
- Latency: 500ms-1s
- Cost: $0.80 per 1M input tokens

**When to Use**:
- Fast validation
- Real-time processing
- Cost-sensitive operations
- Batch processing

---

### 3. GPT-4o (OpenAI)

**Purpose**: Alternative product discovery

**Capabilities**:
- Product identification
- Metadata extraction
- Alternative to Claude

**Usage**:
```python
import openai

response = openai.ChatCompletion.create(
    model="gpt-4o",
    messages=[{
        "role": "user",
        "content": "Analyze this product catalog..."
    }],
    response_format={"type": "json_object"}
)
```

**Performance**:
- Accuracy: 94%+
- Latency: 3-6 seconds
- Cost: $5 per 1M input tokens

**When to Use**:
- Alternative discovery model
- Comparison validation
- Fallback option

---

### 4. text-embedding-3-small (OpenAI)

**Purpose**: Generate text embeddings for semantic search

**Capabilities**:
- Convert text to 1536D vectors
- Enable semantic similarity search
- Fast embedding generation

**Usage**:
```python
response = openai.Embedding.create(
    model="text-embedding-3-small",
    input="Material description text"
)
embedding = response['data'][0]['embedding']  # 1536D vector
```

**Performance**:
- Dimension: 1536D
- Latency: 100-200ms
- Cost: $0.02 per 1M tokens

**When to Use**:
- Text embedding generation
- Semantic search
- Similarity comparison

---

### 5. Qwen3-VL 17B Vision (Together AI)

**Purpose**: Image analysis, OCR, material recognition

**Capabilities**:
- Optical Character Recognition (OCR)
- Material property extraction
- Image quality scoring
- Material identification

**Specifications**:
- MMMU Score: 69.4% (#1 for OCR)
- Vision Capability: Excellent
- Speed: Fast inference

**Usage**:
```python
import together

response = together.Complete.create(
    model="Qwen/Qwen3-VL-8B-Instruct",
    prompt="Analyze this material image...",
    image_url="https://..."
)
```

**Performance**:
- Accuracy: 90%+ for material recognition
- Latency: 2-4 seconds per image
- Cost: $0.40 per 1M tokens

**When to Use**:
- Image analysis
- OCR on material specs
- Material property extraction
- Quality scoring

---

### 6-10. OpenAI CLIP Models

**Purpose**: Multi-modal visual embeddings

**5 Embedding Types**:

#### Visual Embeddings (512D)
- Overall visual appearance
- Enables visual similarity search
- General visual features

#### Large Visual Embeddings (1536D)
- High-resolution visual features
- Better accuracy
- More detailed representation

#### Color Embeddings (256D)
- Color palette analysis
- Color-based search
- Dominant colors extraction

#### Texture Embeddings (256D)
- Surface texture analysis
- Texture-based search
- Material texture classification

#### Application Embeddings (512D)
- Use case classification
- Application-based search
- Context understanding

**Usage**:
```python
from PIL import Image
import openai

# Load image
image = Image.open("material.jpg")

# Generate visual embedding
response = openai.Embedding.create(
    model="text-embedding-3-small",
    input="visual_embedding",
    image=image
)
```

**Performance**:
- Dimension: 256D-1536D (varies)
- Latency: 200-500ms per image
- Cost: $0.02 per 1M tokens

**When to Use**:
- Visual similarity search
- Color-based discovery
- Texture analysis
- Application classification

---

### 11. Anthropic Semantic Chunking

**Purpose**: Intelligent text segmentation

**Capabilities**:
- Split text at semantic boundaries
- Preserve context
- Quality scoring
- Multiple strategies

**Strategies**:
- **Semantic**: Paragraph/sentence boundaries
- **Fixed Size**: Fixed character count
- **Hybrid**: Combination of both
- **Layout-Aware**: Respect document layout

**Usage**:
```python
from app.services.unified_chunking_service import UnifiedChunkingService

chunker = UnifiedChunkingService()
chunks = chunker.chunk_text(
    text=document_text,
    document_id="doc_1",
    strategy="semantic"
)
```

**Performance**:
- Chunk quality: 0.85-0.95
- Latency: 1-2 seconds per 10K chars
- Cost: Included in Anthropic API

---

### 12. Direct Vector DB RAG System (Claude 4.5)

**Purpose**: Retrieval-Augmented Generation with Multi-Vector Search

**Capabilities**:
- Direct vector database queries (no intermediate indexing)
- 6-way parallel multi-vector search
- Claude 4.5 synthesis (200K context)
- Intelligent embedding fusion

**Usage**:
```python
from app.services.rag_service import RAGService

rag = RAGService()
result = await rag.search(
    query="What materials are available?",
    strategy="multi_vector",
    top_k=10
)
response = result['answer']  # Claude 4.5 synthesis
```

**Performance**:
- Retrieval latency: 300-500ms (parallel execution)
- Accuracy: 90%+ (multi-vector fusion)
- Scalability: 1M+ documents

---

## 📊 Model Usage by Pipeline Stage

| Stage | Primary Model | Secondary Model | Purpose |
|-------|---------------|-----------------|---------|
| 0 | Claude Sonnet 4.5 | GPT-4o | Product discovery |
| 2 | Anthropic Chunking | - | Text segmentation |
| 4 | text-embedding-3-small | - | Text embeddings |
| 6 | Qwen3-VL 17B | - | Image analysis |
| 7-10 | CLIP (5 types) | - | Visual embeddings |
| 11 | Claude Haiku 4.5 | Claude Sonnet 4.5 | Product validation |
| 13 | Claude Sonnet 4.5 | - | Quality enhancement |

---

## 💰 Cost Optimization

**Strategies**:
1. Use Haiku for fast validation (10x cheaper)
2. Batch embeddings to reduce API calls
3. Cache results for repeated queries
4. Use focused extraction to reduce image analysis

**Example Cost per PDF**:
- Small PDF (10 pages): $0.50-$1.00
- Medium PDF (50 pages): $2.00-$4.00
- Large PDF (200 pages): $8.00-$15.00

---

## 🔐 API Keys & Configuration

**Required Environment Variables**:
```
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...
TOGETHER_AI_API_KEY=...
```

**Configuration**:
```python
# models/config.py
MODELS = {
    "discovery": "claude-sonnet-4-5",
    "validation": "claude-haiku-4-5",
    "embeddings": "text-embedding-3-small",
    "vision": "Qwen/Qwen3-VL-8B-Instruct"
}
```

---

## 📈 Performance Benchmarks

**Accuracy**:
- Product detection: 95%+
- Material recognition: 90%+
- Metafield extraction: 88%+
- Search relevance: 85%+

**Speed**:
- Product discovery: 3-5 seconds
- Image analysis: 2-4 seconds per image
- Embedding generation: 100-200ms
- Search query: 200-800ms

**Cost**:
- Per PDF: $0.50-$15.00
- Per search: $0.001-$0.01
- Per image: $0.05-$0.20

---

## New Models (2025-12-26)

### Voyage-3 (Voyage AI) - PRIMARY TEXT EMBEDDINGS

**Purpose**: High-quality text embeddings for semantic search and retrieval

**Capabilities**:
- Generate 1024-dimensional text embeddings
- Superior semantic understanding vs OpenAI
- Optimized for retrieval tasks
- Better performance on domain-specific content

**Usage**:
```python
import voyageai

vo = voyageai.Client(api_key=VOYAGE_API_KEY)
result = vo.embed(
    texts=["Product description text..."],
    model="voyage-3",
    input_type="document"
)
embeddings = result.embeddings
```

**Performance**:
- Dimensions: 1024D
- Latency: 100-300ms
- Cost: $0.06 per 1M tokens
- Quality: Superior to text-embedding-3-small

**When to Use**:
- **PRIMARY** choice for all text embeddings
- Product descriptions
- Material specifications
- Document chunks
- Semantic search

**Migration**: Replaced text-embedding-3-small (1536D → 1024D)

---

### Qwen3-VL-32B (Together AI) - PRIMARY VISION MODEL

**Purpose**: State-of-the-art vision-language model for image analysis

**Capabilities**:
- Advanced image understanding
- OCR and text extraction
- Material identification
- Color and texture analysis
- Multi-image reasoning

**Usage**:
```python
from together import Together

client = Together(api_key=TOGETHER_API_KEY)
response = client.chat.completions.create(
    model="Qwen/Qwen3-VL-32B-Instruct",
    messages=[{
        "role": "user",
        "content": [
            {"type": "image_url", "image_url": {"url": image_url}},
            {"type": "text", "text": "Analyze this material image..."}
        ]
    }]
)
```

**Performance**:
- Accuracy: State-of-the-art vision understanding
- Latency: 2-5 seconds
- Cost: $0.50 input / $1.50 output per 1M tokens
- Quality: Superior to GPT-4V and Qwen Vision

**When to Use**:
- **PRIMARY** choice for vision tasks
- Material image analysis
- PDF image extraction
- Product photo analysis
- Quality assessment

**Migration**: Replaced Qwen3-VL 90B Vision and GPT-4V

---

### Qwen3-VL-8B (Together AI) - LIGHTWEIGHT VISION

**Purpose**: Fast, cost-effective vision model for simple tasks

**Capabilities**:
- Basic image understanding
- Fast OCR
- Simple material identification
- Quick validation

**Performance**:
- Accuracy: Good for simple tasks
- Latency: 500ms-2s
- Cost: $0.08 input / $0.50 output per 1M tokens
- Quality: 6x cheaper than Qwen3-VL-32B

**When to Use**:
- Simple image validation
- Fast OCR tasks
- Cost-sensitive operations
- Batch processing

---

### Voyage-3-Lite (Voyage AI) - LIGHTWEIGHT EMBEDDINGS

**Purpose**: Fast, cost-effective embeddings for simple tasks

**Capabilities**:
- Generate 512-dimensional embeddings
- Faster than Voyage-3
- Lower cost

**Performance**:
- Dimensions: 512D
- Latency: 50-150ms
- Cost: $0.02 per 1M tokens
- Quality: Good for simple tasks

**When to Use**:
- Simple semantic search
- Fast lookups
- Cost-sensitive operations
- Non-critical embeddings

---

## Model Selection Guide

### Text Embeddings
1. **Voyage-3** (PRIMARY) - All production text embeddings
2. **Voyage-3-Lite** - Simple/fast tasks only
3. **text-embedding-3-small** - Legacy (being phased out)

### Vision Analysis
1. **Qwen3-VL-32B** (PRIMARY) - All production vision tasks
2. **Qwen3-VL-8B** - Simple/fast vision tasks
3. **CLIP models** - Visual embeddings only (not analysis)

### Text Generation
1. **Claude Sonnet 4.5** (PRIMARY) - Complex reasoning
2. **Claude Haiku 4.5** - Fast validation
3. **GPT-4o** - Alternative/fallback

---

**Last Updated**: December 26, 2025
**Version**: 2.0.0
**Status**: Production

