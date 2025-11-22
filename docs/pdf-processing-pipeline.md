# PDF Processing Pipeline - Complete Technical Guide

14-stage intelligent pipeline for transforming material catalogs into searchable knowledge.

---

## 🎯 Pipeline Overview

```
┌─────────────────────────────────────────────────────────────────┐
│ STAGE 0A: Product Discovery (0-10%)                             │
│ AI Model: Claude Sonnet 4.5 / GPT-4o                           │
│ Purpose: Extract products with ALL metadata (inseparable)      │
│ Output: Products with metadata JSONB (factory, specs, etc.)    │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ STAGE 0B: Document Entity Discovery (10-15%) - OPTIONAL         │
│ AI Model: Claude Sonnet 4.5 / GPT-4o                           │
│ Purpose: Extract certificates, logos, specifications           │
│ Output: Document entities stored separately with relationships │
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
│ STAGE 3: Enhanced Semantic Chunking (40-50%)                    │
│ Tool: UnifiedChunkingService with 5 enhancements               │
│ Output: High-quality semantic chunks with relationships        │
│                                                                 │
│ ✅ Enhancement 1: Product Boundary Detection                    │
│    - Splits chunks at product boundaries                       │
│    - Each chunk = ONE product only                             │
│                                                                 │
│ ✅ Enhancement 2: Semantic Chunking                             │
│    - Chunks end at natural boundaries (paragraphs, sentences)  │
│    - Better semantic completeness                              │
│                                                                 │
│ ✅ Enhancement 3: Context Enrichment                            │
│    - Adds product_id and product_name to metadata              │
│    - Enables better search filtering                           │
│                                                                 │
│ ✅ Enhancement 4: Metadata-First Architecture                   │
│    - Excludes product metadata pages from chunking             │
│    - Zero duplication between chunks and metadata              │
│                                                                 │
│ ✅ Enhancement 5: Chunk Relationships                           │
│    - Creates semantic relationships between chunks             │
│    - Enables "show me everything about X" queries              │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ STAGE 4: Text Embeddings (50-60%)                               │
│ Model: OpenAI text-embedding-3-small                           │
│ Output: 1536D vectors for semantic search                      │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ STAGE 5: Image Extraction + CLIP Embeddings (60-80%)            │
│ Process: Extract images ONE AT A TIME with immediate CLIP gen  │
│ Models: Google SigLIP ViT-SO400M (5 types per image)          │
│ Output: Images + 5 CLIP embeddings saved immediately           │
│                                                                 │
│ 🚀 MEMORY OPTIMIZATION (Per Image):                            │
│   1. Extract from PDF (PyMuPDF4LLM, batch_size=1)             │
│   2. Upload to Supabase Storage                                │
│   3. Save metadata to document_images table                    │
│   4. ✅ Generate 5 CLIP embeddings (NEW!)                      │
│      - Visual (512D)                                           │
│      - Color (512D)                                            │
│      - Texture (512D)                                          │
│      - Application (512D)                                      │
│      - Material (512D)                                         │
│   5. ✅ Save embeddings to VECS immediately (NEW!)             │
│   6. Delete image from disk                                    │
│   7. Clear from memory + force GC                              │
│                                                                 │
│ Memory: ~10-15MB constant (vs 2.5GB accumulation before)      │
│ Time: ~3-5 seconds per image (2s CLIP + 1-3s upload/save)     │
│ Resilience: CLIP embeddings preserved if crash occurs          │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ STAGE 6: Image Analysis (80-85%) - ASYNC JOB                    │
│ Model: Llama 4 Scout 17B Vision                                │
│ Output: OCR, materials, quality scores (0-1 scale)             │
│ Note: Runs as background job, not blocking pipeline            │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ STAGE 7: Product Creation (85-92%)                              │
│ Models: Claude Haiku 4.5 → Claude Sonnet 4.5                   │
│ Output: Product records with relationships                     │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ STAGE 8: Entity Linking (92-97%)                                │
│ Process: Link products, chunks, images, document entities      │
│ Output: Relationships with relevance scores                    │
│                                                                 │
│ Relationships Created:                                          │
│   - Product → Image (relevance scores)                         │
│   - Chunk → Image (relevance scores)                           │
│   - Chunk → Product (relevance scores)                         │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ STAGE 9: Completion (97-100%)                                   │
│ Process: Final validation and cleanup                          │
│ Output: Complete processed document                            │
└─────────────────────────────────────────────────────────────────┘
```

---

## 📋 Detailed Stage Breakdown

### Stage 0A: Product Discovery (0-10%)

**Purpose**: Extract products with ALL metadata (Products + Metadata = Inseparable)

**AI Model**: Claude Sonnet 4.5 or GPT-4o

**Process**:
1. Extract full PDF text
2. Analyze content structure
3. Identify product boundaries
4. Extract products WITH all metadata in one pass
5. Store in products table with metadata JSONB

**Output**:
```json
{
  "products": [
    {
      "name": "NOVA",
      "description": "Modern ceramic tile collection",
      "page_range": [12, 13, 14],
      "metadata": {
        "designer": "SG NY",
        "studio": "SG NY",
        "category": "tiles",
        "dimensions": ["15×38", "20×40"],
        "variants": [{"type": "color", "value": "beige"}],
        "factory": "Castellón Factory",
        "factory_group": "Harmony Group",
        "manufacturer": "Harmony Materials",
        "country_of_origin": "Spain",
        "slip_resistance": "R11",
        "fire_rating": "A1",
        "thickness": "8mm",
        "water_absorption": "Class 3",
        "finish": "matte",
        "material": "ceramic"
      },
      "image_indices": [12, 13],
      "confidence": 0.95
    }
  ],
  "total_products": 14,
  "confidence_score": 0.95
}
```

**Database Storage**:
- Table: `products`
- ALL metadata stored in `metadata` JSONB column
- Products and metadata are inseparable

**Example (Harmony PDF)**:
- 14 distinct products identified
- 95% confidence score
- Processing time: 3-5 seconds

---

### Stage 0B: Document Entity Discovery (10-15%) - OPTIONAL

**Purpose**: Extract certificates, logos, specifications as separate knowledge base

**AI Model**: Claude Sonnet 4.5 or GPT-4o

**Process**:
1. Analyze PDF for document entities
2. Extract certificates (ISO, CE, quality certifications)
3. Extract logos (company, brand, certification marks)
4. Extract specifications (technical docs, installation guides)
5. Identify factory/group for each entity
6. Store in document_entities table

**Output**:
```json
{
  "certificates": [
    {
      "name": "ISO 9001:2015",
      "certificate_type": "quality_management",
      "issuer": "TÜV SÜD",
      "issue_date": "2024-01-15",
      "expiry_date": "2027-01-15",
      "standards": ["ISO 9001:2015"],
      "page_range": [45, 46],
      "factory_name": "Castellón Factory",
      "factory_group": "Harmony Group",
      "confidence": 0.92
    }
  ],
  "logos": [
    {
      "name": "Company Logo",
      "logo_type": "company",
      "description": "Main company brand logo",
      "page_range": [1, 2],
      "confidence": 0.98
    }
  ],
  "specifications": [
    {
      "name": "Installation Guide",
      "spec_type": "installation",
      "description": "Step-by-step installation instructions",
      "page_range": [50, 52],
      "confidence": 0.90
    }
  ]
}
```

**Database Storage**:
- Table: `document_entities`
- Linked to products via `product_document_relationships`
- Supports factory/group filtering for agentic queries

**Agentic Query Examples**:
- "Get certifications for Castellón Factory"
- "Get logos for Harmony Group"
- "Get specifications for product NOVA"

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

### Stage 5: Image Extraction + CLIP Embeddings (60-80%)

**🚀 OPTIMIZED FLOW - Memory Safe Processing**

**Models**:
- PyMuPDF4LLM (extraction)
- Google SigLIP ViT-SO400M (CLIP embeddings)

**Process (Per Image)**:
1. Extract image from PDF (batch_size=1)
2. Upload to Supabase Storage
3. Save metadata to `document_images` table
4. **✅ Generate 5 CLIP embeddings immediately**
5. **✅ Save embeddings to VECS collections**
6. Delete image from disk
7. Clear from memory + force garbage collection

**Why This Approach?**
- **Memory Safety**: Constant 10-15MB per image (vs 2.5GB accumulation)
- **Resilience**: CLIP embeddings preserved if crash occurs
- **Simplicity**: Eliminates separate CLIP stage
- **Same Total Time**: Work moved from Stage 6 to Stage 5

**5 CLIP Embedding Types Generated Per Image**:

1. **Visual Embeddings** (512D)
   - Overall visual appearance
   - Enables visual similarity search
   - Collection: `image_clip_embeddings`

2. **Color Embeddings** (512D)
   - Color palette analysis
   - Color-based search
   - Collection: `image_color_embeddings`

3. **Texture Embeddings** (512D)
   - Surface texture analysis
   - Texture-based search
   - Collection: `image_texture_embeddings`

4. **Application Embeddings** (512D)
   - Use case classification
   - Application-based search
   - Collection: `image_application_embeddings`

5. **Material Embeddings** (512D)
   - Material type classification
   - Material-based search
   - Collection: `image_material_embeddings`

**Output**:
```json
{
  "images_saved": 900,
  "clip_embeddings_generated": 900,
  "total_embeddings": 4500,
  "memory_usage": "10-15MB constant",
  "processing_time": "45-75 minutes",
  "embeddings_by_type": {
    "visual": 900,
    "color": 900,
    "texture": 900,
    "application": 900,
    "material": 900
  }
}
```

**Performance Metrics**:
- Time per image: 3-5 seconds (2s CLIP + 1-3s upload/save)
- Memory per image: 10-15MB
- Disk usage: 500KB (1 image at a time)
- Success rate: 99%+

---

### Stage 6: Image Analysis (80-85%) - ASYNC JOB

**Model**: Llama 4 Scout 17B Vision

**Process**:
1. Runs as background job (non-blocking)
2. Analyze each image for OCR
3. Extract material properties
4. Calculate quality scores

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

**Note**: This stage runs asynchronously and does not block pipeline completion

---

### Stage 7: Product Creation (85-92%)

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
  "metadata": {
    "factory": "Castellón Factory",
    "dimensions": ["15×38", "20×40"],
    "material": "ceramic"
  },
  "chunks": ["chunk_1", "chunk_2"],
  "images": ["image_1", "image_2"],
  "confidence_score": 0.95
}
```

---

### Stage 8: Entity Linking (92-97%)

**Process**:
1. Link products to images (relevance scores)
2. Link chunks to images (relevance scores)
3. Link chunks to products (relevance scores)
4. Create relationship records

**Relevance Algorithm**:
- Page overlap (40%): Same page = 0.4, adjacent = 0.2
- Visual similarity (40%): From AI detection
- Detection score (20%): Confidence from discovery

**Output**:
```json
{
  "product_image_relationships": 1000,
  "chunk_image_relationships": 2500,
  "chunk_product_relationships": 1500,
  "total_relationships": 5000
}
```

**Database Tables**:
- `product_image_relationships`
- `chunk_image_relationships`
- `chunk_product_relationships`

---

### Stage 9: Completion (97-100%)

**Process**:
1. Final validation
2. Update job status
3. Generate completion summary
4. Trigger async jobs (if any)

**Output**: Complete processed document with all relationships

---

## 🔄 Checkpoint Recovery

9 checkpoints for failure recovery:

1. **INITIALIZED** - Job created
2. **PDF_EXTRACTED** - PDF analysis complete
3. **CHUNKS_CREATED** - Text chunking complete
4. **TEXT_EMBEDDINGS_GENERATED** - Text embeddings complete
5. **IMAGES_EXTRACTED** - Image extraction + CLIP embeddings complete ✅ UPDATED
6. **IMAGE_EMBEDDINGS_GENERATED** - (Deprecated - now done in Stage 5)
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

**Note**: Stage 5 (IMAGES_EXTRACTED) now includes CLIP embedding generation. If recovery occurs after this stage, both images AND their CLIP embeddings are preserved.

---

## 📊 Performance Metrics

**Harmony PDF Example (71 pages, 900+ images)**:
- Total pages: 71
- Products identified: 11-14
- Chunks created: 107
- Images extracted: 900+
- CLIP embeddings generated: 4,500+ (5 types × 900 images)
- Processing time: 45-75 minutes
- Memory usage: 10-15MB constant (vs 2.5GB before optimization)
- Success rate: 100%

**Accuracy Metrics**:
- Product detection: 95%+
- Material recognition: 90%+
- Metadata extraction: 88%+
- Search relevance: 85%+
- CLIP embedding quality: 95%+

**Memory Optimization Impact**:
- Before: 2.5GB accumulation → CRASH at 900 images
- After: 10-15MB constant → Can process unlimited images

---

## 🏗️ Modular Architecture (Refactored)

The pipeline has been refactored from a monolithic 2900+ line function into modular services and API endpoints for better debugging, testing, and retry capabilities.

### Service Layer

**ImageProcessingService** (`app/services/image_processing_service.py`)
- `classify_images()` - Llama Vision + Claude validation
- `upload_images_to_storage()` - Upload to Supabase Storage
- `save_images_and_generate_clips()` - DB save + CLIP embeddings

**ChunkingService** (`app/services/chunking_service.py`)
- `create_chunks_and_embeddings()` - Semantic chunking + text embeddings + relationships

**RelevancyService** (`app/services/relevancy_service.py`)
- `create_chunk_image_relationships()` - Based on embedding similarity
- `create_product_image_relationships()` - Based on page ranges
- `create_all_relationships()` - Orchestrate all relationships

### Internal API Endpoints

Each pipeline stage has a dedicated endpoint for independent testing and retry:

```http
POST /api/internal/classify-images/{job_id}
POST /api/internal/upload-images/{job_id}
POST /api/internal/save-images-db/{job_id}
POST /api/internal/create-chunks/{job_id}
POST /api/internal/create-relationships/{job_id}
```

### Main Orchestrator Endpoint

```http
POST /api/rag/documents/upload
Content-Type: multipart/form-data

Parameters:
- file: PDF file
- workspace_id: Workspace UUID
- category: Extraction category (default: "products")
- focused_extraction: true (default)

Response:
{
  "job_id": "uuid",
  "document_id": "uuid",
  "status": "processing",
  "progress": 0,
  "current_stage": "INITIALIZED"
}
```

**Orchestrator Flow**:
1. Upload PDF and create job
2. Call `/api/internal/classify-images/{job_id}`
3. Call `/api/internal/upload-images/{job_id}`
4. Call `/api/internal/save-images-db/{job_id}`
5. Call `/api/internal/create-chunks/{job_id}`
6. Call `/api/internal/create-relationships/{job_id}`
7. Update job status to COMPLETED

**Benefits**:
- Each stage independently testable
- Failed stages can be retried without reprocessing
- Clear error boundaries for debugging
- Progress tracking per stage
- 200 lines per service vs 2900+ monolith

---

**Last Updated**: November 18, 2025
**Pipeline Version**: 9-Stage (Optimized)
**Status**: Production
**Major Changes**:
- Combined Image Extraction + CLIP Embeddings into single stage
- Memory-safe processing (10-15MB constant vs 2.5GB accumulation)
- Eliminated separate CLIP stage for better resilience

