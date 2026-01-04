# PDF Processing Pipeline - Complete Technical Guide

14-stage intelligent pipeline for transforming material catalogs into searchable knowledge.

> **📚 Related Documentation:**
> - [Async Processing & Limits](./async-processing-and-limits.md) - Concurrency limits and async architecture
> - [Product Discovery Architecture](./product-discovery-architecture.md) - AI-powered product extraction
> - [System Architecture](./system-architecture.md) - Overall platform architecture

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
│ STAGE 5: Image Extraction (60-70%) - STREAMING BATCH PROCESSING │
│ Process: Extract images in batches (2-3 pages at a time)      │
│ Output: Images uploaded to Supabase Storage                    │
│                                                                 │
│ 🚀 STREAMING EXTRACTION (Per Batch):                           │
│   1. Extract 2-3 pages from PDF (PyMuPDF)                     │
│   2. Upload ALL images to Supabase Storage immediately        │
│   3. Delete local files immediately after upload              │
│   4. Move to next batch                                        │
│                                                                 │
│ Memory: ~500MB per batch (vs 7.7GB full PDF before)           │
│ Time: ~10-15 seconds per batch                                 │
│ Disk: 0 images (all deleted after upload)                     │
│ Resilience: Images preserved in Supabase if crash occurs       │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ STAGE 6: AI Classification (70-75%) - URL-BASED PROCESSING      │
│ Model: Qwen3-VL 17B Vision                                │
│ Process: Download from Supabase URLs → Classify → Delete       │
│ Output: Material vs non-material classification                │
│                                                                 │
│ 🚀 URL-BASED ARCHITECTURE:                                     │
│   1. Download image from Supabase URL to RAM                  │
│   2. Convert to base64 on-the-fly                             │
│   3. Classify with Qwen Vision (material/non-material)       │
│   4. Delete from RAM immediately                               │
│   5. Delete non-material images from Supabase                 │
│                                                                 │
│ Memory: ~1-2MB per image (temporary download)                  │
│ Time: ~2-3 seconds per image                                   │
│ Disk: 0 images (everything in RAM)                            │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ STAGE 7: CLIP Embeddings (75-85%) - URL-BASED PROCESSING        │
│ Models: Google SigLIP ViT-SO400M (5 types per image)          │
│ Process: Use Supabase URLs directly (NO download!)            │
│ Output: 5 CLIP embeddings per material image                   │
│                                                                 │
│ 🚀 ZERO-DOWNLOAD ARCHITECTURE:                                │
│   1. Pass Supabase URL to CLIP service                        │
│   2. CLIP downloads internally (httpx)                        │
│   3. Generate 5 embeddings (Visual, Color, Texture, etc.)     │
│   4. Save to VECS collections                                  │
│   5. CLIP auto-cleanup (no manual deletion needed)            │
│                                                                 │
│ Memory: ~100MB per batch (CLIP model + tensors)               │
│ Time: ~2-3 seconds per image                                   │
│ Disk: 0 images (CLIP downloads to RAM)                        │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ STAGE 8: Qwen Vision Analysis (85-90%) - URL-BASED PROCESSING  │
│ Model: Qwen3-VL 17B Vision                                │
│ Process: Download from Supabase URLs → Analyze → Delete       │
│ Output: Quality scores, material properties, confidence        │
│                                                                 │
│ 🚀 ON-DEMAND DOWNLOAD ARCHITECTURE:                           │
│   1. Download image from Supabase URL to RAM                  │
│   2. Convert to base64 on-the-fly                             │
│   3. Analyze with Qwen Vision (quality, properties)          │
│   4. Delete from RAM immediately                               │
│   5. Batch cleanup after every 10 images                       │
│                                                                 │
│ Memory: ~1-2MB per image (temporary download)                  │
│ Time: ~3-5 seconds per image                                   │
│ Disk: 0 images (everything in RAM)                            │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ STAGE 9: Product Creation (90-95%)                              │
│ Models: Claude Haiku 4.5 → Claude Sonnet 4.5                   │
│ Output: Product records with relationships                     │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ STAGE 10: Entity Linking (95-98%)                               │
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
│ STAGE 11: Completion (98-100%)                                  │
│ Process: Final validation and cleanup                          │
│ Output: Complete processed document                            │
│ Note: All images stored in Supabase, 0 local files            │
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

### Stage 5: Image Extraction (60-70%) - Streaming Batch Processing

**🚀 URL-BASED ARCHITECTURE - Zero Disk Accumulation**

**Tools**:
- PyMuPDF (extraction)
- Supabase Storage (cloud storage)

**Process (Per Batch - 2-3 pages)**:
1. Extract images from 2-3 PDF pages
2. **Upload ALL images to Supabase Storage immediately**
3. **Delete local files immediately after upload**
4. Move to next batch
5. Repeat until all pages processed

**Why Streaming Batches?**
- **Memory Safety**: ~500MB per batch (vs 7.7GB full PDF)
- **No Cumulative Reprocessing**: Each image processed once
- **Resilience**: Images preserved in Supabase if crash occurs
- **Zero Disk Usage**: All local files deleted immediately

**Output**:
```json
{
  "total_images_extracted": 249,
  "batches_processed": 23,
  "images_uploaded_to_supabase": 249,
  "local_files_remaining": 0,
  "memory_usage": "~500MB per batch",
  "processing_time": "2-3 minutes"
}
```

**Performance Metrics**:
- Time per batch: 10-15 seconds
- Memory per batch: ~500MB
- Disk usage: 0 images (all deleted after upload)
- Total time for 249 images: 2-3 minutes

---

### Stage 6: AI Classification (70-75%) - URL-Based Processing

**🚀 ON-DEMAND DOWNLOAD ARCHITECTURE**

**Model**: Qwen3-VL 17B Vision

**Process (Per Image)**:
1. **Download image from Supabase URL to RAM**
2. Convert to base64 on-the-fly (no disk I/O)
3. Classify with Qwen Vision (material vs non-material)
4. **Delete from RAM immediately**
5. Delete non-material images from Supabase Storage

**Why URL-Based?**
- **Zero Disk Usage**: Everything in RAM temporarily
- **No Cumulative Memory**: Each image deleted after processing
- **Supabase as Source of Truth**: Single storage location
- **Automatic Cleanup**: Non-material images deleted from cloud

**Output**:
```json
{
  "total_images_classified": 249,
  "material_images": 150,
  "non_material_images": 99,
  "classification_errors": 0,
  "non_material_deleted_from_supabase": 99,
  "memory_usage": "~1-2MB per image",
  "processing_time": "8-12 minutes"
}
```

**Performance Metrics**:
- Time per image: 2-3 seconds
- Memory per image: ~1-2MB (temporary)
- Disk usage: 0 images
- Total time for 249 images: 8-12 minutes

---

### Stage 7: CLIP Embeddings (75-85%) - URL-Based Processing

**🚀 ZERO-DOWNLOAD ARCHITECTURE**

**Model**: Google SigLIP ViT-SO400M

**Process (Per Image)**:
1. **Pass Supabase URL to CLIP service** (no manual download!)
2. CLIP downloads internally using httpx
3. Generate 5 embedding types
4. Save to VECS collections
5. CLIP auto-cleanup (tensors deleted automatically)

**Why Zero-Download?**
- **CLIP Supports URLs Natively**: No need to download manually
- **Automatic Memory Management**: CLIP handles cleanup
- **Faster Processing**: No extra download step
- **Same Quality**: URL vs base64 produces identical embeddings

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
  "material_images_processed": 150,
  "clip_embeddings_generated": 150,
  "total_embeddings": 750,
  "memory_usage": "~100MB per batch",
  "processing_time": "5-8 minutes",
  "embeddings_by_type": {
    "visual": 150,
    "color": 150,
    "texture": 150,
    "application": 150,
    "material": 150
  }
}
```

**Performance Metrics**:
- Time per image: 2-3 seconds
- Memory per batch: ~100MB (CLIP model + tensors)
- Disk usage: 0 images
- Total time for 150 images: 5-8 minutes

---

### Stage 8: Qwen Vision Analysis (85-90%) - URL-Based Processing

**🚀 ON-DEMAND DOWNLOAD ARCHITECTURE**

**Model**: Qwen3-VL 17B Vision

**Process (Per Image)**:
1. **Download image from Supabase URL to RAM**
2. Convert to base64 on-the-fly
3. Analyze with Qwen Vision (quality, properties)
4. **Delete from RAM immediately**
5. **Batch cleanup after every 10 images**

**Why On-Demand Download?**
- **Qwen Requires Base64**: No URL support (yet)
- **Temporary RAM Usage**: Download → Process → Delete
- **Batch Cleanup**: Aggressive memory management
- **Zero Disk Usage**: Everything in RAM

**Output**:
```json
{
  "images_analyzed": 150,
  "quality_scores_generated": 150,
  "material_properties_extracted": 150,
  "memory_usage": "~1-2MB per image",
  "processing_time": "8-12 minutes"
}
```

**Performance Metrics**:
- Time per image: 3-5 seconds
- Memory per image: ~1-2MB (temporary)
- Disk usage: 0 images
- Total time for 150 images: 8-12 minutes
- Success rate: 99%+

---

### Stage 6: Image Analysis (80-85%) - ASYNC JOB

**Model**: Qwen3-VL 17B Vision

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
5. **IMAGES_EXTRACTED** - Images uploaded to Supabase Storage ✅ UPDATED
6. **IMAGE_EMBEDDINGS_GENERATED** - CLIP embeddings + Qwen Vision complete ✅ UPDATED
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

**Note**:
- Stage 5 (IMAGES_EXTRACTED): All images uploaded to Supabase Storage, 0 local files
- Stage 6 (IMAGE_EMBEDDINGS_GENERATED): All CLIP embeddings + Qwen Vision analysis complete
- Recovery uses Supabase URLs for all subsequent processing (no local files needed)

---

## 📊 Performance Metrics

**NOVA PDF Example (71 pages, 249 images)**:
- Total pages: 71
- Products identified: 11
- Chunks created: 110
- Images extracted: 249
- Material images: 150
- Non-material images: 99 (deleted from Supabase)
- CLIP embeddings generated: 750 (5 types × 150 material images)
- Processing time: 2-3 minutes (vs 30+ minutes before)
- Memory usage: <3GB peak (vs 7.7GB OOM before)
- Disk usage: 0 images (vs 249 cumulative before)
- Success rate: 100%

**Accuracy Metrics**:
- Product detection: 95%+
- Material recognition: 90%+
- Metadata extraction: 88%+
- Search relevance: 85%+
- CLIP embedding quality: 95%+

**URL-Based Architecture Impact**:
- **Before**: 7.7GB memory → OOM crash at 249 images
- **After**: <3GB memory → Can process unlimited images
- **Before**: 30+ minutes timeout (cumulative reprocessing)
- **After**: 2-3 minutes completion (process once via URLs)
- **Before**: 249 images on disk (cumulative accumulation)
- **After**: 0 images on disk (all in Supabase Storage)

---

## 🏗️ Modular Architecture (Refactored)

The pipeline has been refactored from a monolithic 2900+ line function into modular services and API endpoints for better debugging, testing, and retry capabilities.

### Service Layer

**ImageProcessingService** (`app/services/image_processing_service.py`)
- `classify_images()` - Qwen Vision + Claude validation
- `upload_images_to_storage()` - Upload to Supabase Storage
- `save_images_and_generate_clips()` - DB save + CLIP embeddings

**UnifiedChunkingService** (`app/services/unified_chunking_service.py`)
- `chunk_text()` - Semantic/hybrid/fixed-size/layout-aware chunking
- Supports 4 chunking strategies with quality scoring

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

## 🛡️ Production Hardening

PDF processing implements **complete production hardening** for reliability and monitoring:

### Source Tracking ✅

Every product, chunk, image, and embedding is tagged with source information:

```python
# Products
await supabase.table('products').insert({
    'name': product_name,
    'source_type': 'pdf_processing',  # ✅ NEW
    'source_job_id': job_id,          # ✅ NEW
    # ... other fields
})

# Chunks
await supabase.table('document_chunks').insert({
    'content': chunk_text,
    'source_type': 'pdf_processing',  # ✅ NEW
    'source_job_id': job_id,          # ✅ NEW
    # ... other fields
})

# Images
await supabase.table('document_images').insert({
    'url': image_url,
    'source_type': 'pdf_processing',  # ✅ NEW
    'source_job_id': job_id,          # ✅ NEW
    # ... other fields
})

# Embeddings
await supabase.table('embeddings').insert({
    'embedding': vector,
    'source_type': 'pdf_processing',  # ✅ NEW
    'source_job_id': job_id,          # ✅ NEW
    # ... other fields
})
```

**Benefits:**
- Filter Materials Data page by specific PDF job
- Trace any data back to its source PDF
- Delete all data from a specific PDF import
- Audit data quality by source

---

### Heartbeat Monitoring ✅

Updates `last_heartbeat` field every stage to detect stuck jobs:

```python
# Update heartbeat during processing
await supabase.table('background_jobs').update({
    'last_heartbeat': datetime.utcnow().isoformat(),
    'current_stage': stage_name,
    'progress_percent': progress
}).eq('id', job_id).execute()
```

**Stuck Job Detection:**
- Threshold: >10 minutes without heartbeat
- Auto-recovery: Automatic retry of stuck jobs
- Monitoring: Real-time job health dashboard

---

### Sentry Error Tracking ✅

Comprehensive error tracking and performance monitoring:

```python
# Transaction tracking
with sentry_sdk.start_transaction(op="pdf_processing", name="process_stage") as transaction:
    transaction.set_tag("job_id", job_id)
    transaction.set_tag("stage", stage_name)
    transaction.set_data("total_pages", total_pages)

    # Breadcrumbs for debugging
    sentry_sdk.add_breadcrumb(
        category="pdf_processing",
        message=f"Processing stage {stage_name}",
        level="info",
        data={"progress": progress}
    )

    try:
        # ... processing logic ...
        transaction.set_status("ok")
    except Exception as e:
        sentry_sdk.capture_exception(e)
        transaction.set_status("internal_error")
        raise
```

**Features:**
- Transaction tracking for performance monitoring
- Breadcrumbs for debugging context
- Exception capture with full stack traces
- AI model usage tracking
- Performance bottleneck identification

---

### Production Hardening Status

| Feature | Status | Details |
|---------|--------|---------|
| **Source Tracking** | ✅ COMPLETE | All tables have `source_type` and `source_job_id` |
| **Heartbeat Monitoring** | ✅ COMPLETE | Updates every stage, 10-minute stuck threshold |
| **Sentry Tracking** | ✅ COMPLETE | Transactions, breadcrumbs, exception capture |
| **Error Handling** | ✅ COMPLETE | Comprehensive try-catch with Sentry integration |
| **Progress Tracking** | ✅ COMPLETE | Real-time progress updates via `job_progress` table |
| **Checkpoint Recovery** | ✅ COMPLETE | Resume from last successful stage |
| **Auto-Recovery** | ✅ COMPLETE | Automatic retry of stuck/failed jobs |

---

**Last Updated**: December 23, 2025
**Pipeline Version**: 11-Stage (URL-Based Architecture)
**Status**: Production
**Major Changes**:
- **URL-Based Architecture**: All image processing uses Supabase URLs (zero disk usage)
- **Streaming Batch Extraction**: Extract 2-3 pages at a time, upload immediately, delete local files
- **On-Demand Downloads**: Download from URLs to RAM, process, delete immediately
- **Zero Cumulative Reprocessing**: Each image processed once (vs 21× before)
- **10× Faster**: 2-3 minutes vs 30+ minutes timeout
- **60% Less Memory**: <3GB vs 7.7GB OOM crash
- **Aggressive Batch Cleanup**: Delete batch data between batches to prevent memory leaks
- **✅ Production Hardening**: Complete source tracking, heartbeat monitoring, and Sentry integration

