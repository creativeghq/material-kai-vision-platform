# PDF Processing Pipeline - Complete Technical Guide

14-stage intelligent pipeline for transforming material catalogs into searchable knowledge.

---

## 🎯 Pipeline Overview

```
┌─────────────────────────────────────────────────────────────────┐
│ STAGE 0: Product Discovery (0-15%)                              │
│ AI Model: Claude Sonnet 4.5 / GPT-4o                           │
│ Purpose: Analyze entire PDF to identify products               │
│ Output: Product catalog with metafields & image mappings       │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ STAGE 1: Focused Extraction (15-30%)                            │
│ Process: Extract ONLY pages containing identified products     │
│ Output: Focused PDF with product content                       │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ STAGE 2: Text Extraction (30-40%)                               │
│ Tool: PyMuPDF4LLM                                              │
│ Output: Structured markdown with preserved layout              │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ STAGE 3: Semantic Chunking (40-50%)                             │
│ Tool: Anthropic Semantic Chunking                              │
│ Output: 229+ semantic chunks (Harmony PDF example)             │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ STAGE 4: Text Embeddings (50-60%)                               │
│ Model: OpenAI text-embedding-3-small                           │
│ Output: 1536D vectors for semantic search                      │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ STAGE 5: Image Extraction (60-70%)                              │
│ Process: Extract all images, store in Supabase Storage         │
│ Output: Images with metadata                                   │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ STAGE 6: Image Analysis (70-80%)                                │
│ Model: Llama 4 Scout 17B Vision                                │
│ Output: OCR, materials, quality scores (0-1 scale)             │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ STAGE 7-10: Multi-Vector Embeddings (80-91%)                    │
│ Models: OpenAI CLIP (5 types)                                  │
│ Output: Visual, color, texture, application embeddings         │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ STAGE 11: Product Creation (91-95%)                             │
│ Models: Claude Haiku 4.5 → Claude Sonnet 4.5                   │
│ Output: Product records with relationships                     │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ STAGE 12: Metafield Extraction (95-97%)                         │
│ Process: Extract structured metadata                           │
│ Output: Metafield values linked to products                    │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ STAGE 13: Quality Enhancement (97-100%) - ASYNC                 │
│ Model: Claude Sonnet 4.5                                       │
│ Output: Enhanced product records                               │
└─────────────────────────────────────────────────────────────────┘
```

---

## 📋 Detailed Stage Breakdown

### Stage 0: Product Discovery (0-15%)

**Purpose**: Analyze entire PDF to identify products before extraction

**AI Model**: Claude Sonnet 4.5 or GPT-4o

**Process**:
1. Extract full PDF text
2. Analyze content structure
3. Identify product boundaries
4. Extract product names, metafields, image mappings
5. Create product catalog

**Output**:
```json
{
  "products": [
    {
      "name": "Product Name",
      "page_range": "1-5",
      "metafields": { "material": "...", "color": "..." },
      "images": ["page_2_image_1", "page_3_image_2"]
    }
  ],
  "total_products": 14,
  "confidence_score": 0.95
}
```

**Example (Harmony PDF)**:
- 14 distinct products identified
- 95% confidence score
- Processing time: 3-5 seconds

---

### Stage 1: Focused Extraction (15-30%)

**Purpose**: Extract ONLY product-related pages

**Process**:
1. Use product discovery results
2. Identify page ranges for each product
3. Extract only those pages
4. Skip marketing/administrative content

**Benefits**:
- 40-60% reduction in processing time
- Focused on relevant content
- Reduced noise in embeddings

**Output**: Focused PDF with product content

---

### Stage 2: Text Extraction (30-40%)

**Tool**: PyMuPDF4LLM

**Process**:
1. Extract text from focused PDF
2. Preserve document structure
3. Handle complex layouts
4. Generate markdown

**Output**:
```markdown
# Product Name

## Specifications
- Material: ...
- Dimensions: ...
- Color: ...

## Description
...
```

---

### Stage 3: Semantic Chunking (40-50%)

**Tool**: Anthropic Semantic Chunking

**Process**:
1. Split text at semantic boundaries
2. Respect paragraph/sentence structure
3. Configurable chunk sizes (512-2048 chars)
4. Calculate quality scores

**Chunking Strategies**:
- **Semantic**: Paragraph/sentence boundaries
- **Fixed Size**: Fixed character count
- **Hybrid**: Combination of both
- **Layout-Aware**: Respect document layout

**Quality Scoring**:
- Completeness (0-1)
- Coherence (0-1)
- Boundary quality (0-1)
- Final score: Average of above

**Output**:
```json
{
  "chunks": [
    {
      "id": "chunk_1",
      "content": "...",
      "quality_score": 0.92,
      "page_range": "1-2",
      "metadata": {}
    }
  ],
  "total_chunks": 229
}
```

---

### Stage 4: Text Embeddings (50-60%)

**Model**: OpenAI text-embedding-3-small

**Process**:
1. Generate embeddings for each chunk
2. Store in pgvector
3. Create similarity indexes

**Output**:
- 1536D vectors
- Stored in `embeddings` table
- Indexed for fast similarity search

---

### Stage 5: Image Extraction (60-70%)

**Process**:
1. Extract all images from PDF
2. Store in Supabase Storage
3. Generate base64 for analysis
4. Create image metadata

**Output**:
```json
{
  "images": [
    {
      "id": "image_1",
      "page": 2,
      "filename": "page_2_image_1.png",
      "url": "https://storage.supabase.co/...",
      "size": "1024x768",
      "format": "png"
    }
  ],
  "total_images": 45
}
```

---

### Stage 6: Image Analysis (70-80%)

**Model**: Llama 4 Scout 17B Vision

**Process**:
1. Analyze each image
2. Perform OCR on material specs
3. Extract material properties
4. Calculate quality score

**Output**:
```json
{
  "image_id": "image_1",
  "ocr_text": "Material: Wool, 100%",
  "materials": ["Wool"],
  "properties": {
    "weight": "400 gsm",
    "weave": "Plain"
  },
  "quality_score": 0.87
}
```

**Quality Scoring**:
- Text clarity (0-1)
- Material visibility (0-1)
- Spec completeness (0-1)
- Final score: Average

---

### Stages 7-10: Multi-Vector Embeddings (80-91%)

**Model**: OpenAI CLIP

**5 Embedding Types**:

1. **Visual Embeddings** (512D)
   - Overall visual appearance
   - Enables visual similarity search

2. **Large Visual Embeddings** (1536D)
   - High-resolution visual features
   - Better accuracy

3. **Color Embeddings** (256D)
   - Color palette analysis
   - Color-based search

4. **Texture Embeddings** (256D)
   - Surface texture analysis
   - Texture-based search

5. **Application Embeddings** (512D)
   - Use case classification
   - Application-based search

---

### Stage 11: Product Creation (91-95%)

**Models**: Claude Haiku 4.5 → Claude Sonnet 4.5

**Two-Stage Validation**:

**Stage 1 (Haiku - Fast)**:
- Analyze all chunks
- Identify product candidates
- Extract basic information
- Processing time: 3-5 seconds

**Stage 2 (Sonnet - Deep)**:
- For each candidate, perform deep analysis
- Validate product completeness
- Extract detailed metadata
- Create product records

**Output**:
```json
{
  "product_id": "prod_1",
  "name": "Product Name",
  "description": "...",
  "metafields": {},
  "chunks": ["chunk_1", "chunk_2"],
  "images": ["image_1", "image_2"],
  "confidence_score": 0.95
}
```

---

### Stage 12: Metafield Extraction (95-97%)

**Process**:
1. Extract structured metadata
2. Link to products and chunks
3. Support 200+ metafield types

**Metafield Types**:
- Material composition
- Dimensions
- Weight
- Color
- Texture
- Application
- Care instructions
- Certifications
- Pricing
- Availability

---

### Stage 13: Quality Enhancement (97-100%) - ASYNC

**Model**: Claude Sonnet 4.5

**Process**:
1. Validate product completeness
2. Enrich with additional metadata
3. Improve descriptions
4. Runs asynchronously

**Output**: Enhanced product records

---

## 🔄 Checkpoint Recovery

9 checkpoints for failure recovery:

1. **INITIALIZED** - Job created
2. **PDF_EXTRACTED** - PDF analysis complete
3. **CHUNKS_CREATED** - Text chunking complete
4. **TEXT_EMBEDDINGS_GENERATED** - Text embeddings complete
5. **IMAGES_EXTRACTED** - Image extraction complete
6. **IMAGE_EMBEDDINGS_GENERATED** - Visual embeddings complete
7. **PRODUCTS_DETECTED** - Products identified
8. **PRODUCTS_CREATED** - Product creation complete
9. **COMPLETED** - All processing complete

**Recovery Process**:
```python
if job.checkpoint_stage:
    resume_from_checkpoint(job.checkpoint_stage)
else:
    start_from_beginning()
```

---

## 📊 Performance Metrics

**Harmony PDF Example**:
- Total pages: 156
- Products identified: 14
- Chunks created: 229
- Images extracted: 45
- Processing time: 8-12 minutes
- Success rate: 100%

**Accuracy Metrics**:
- Product detection: 95%+
- Material recognition: 90%+
- Metafield extraction: 88%+
- Search relevance: 85%+

---

## 🚀 API Endpoint

```http
POST /api/v1/pdf/upload
Content-Type: multipart/form-data

Parameters:
- file: PDF file
- title: Optional document title
- discovery_model: "claude" (default) or "gpt"
- focused_extraction: true (default)

Response: { job_id, status_url, processing_stages }
```

---

**Last Updated**: October 31, 2025  
**Pipeline Version**: 14-Stage  
**Status**: Production

