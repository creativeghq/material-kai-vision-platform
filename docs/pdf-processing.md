# PDF Processing Pipeline

**Material Kai Vision Platform** - Comprehensive PDF Processing System

---

## Overview

The PDF Processing Pipeline is a sophisticated 14-stage system that transforms material catalog PDFs into searchable, structured knowledge. The pipeline uses AI models at multiple stages to extract products, analyze images, generate embeddings, and create a comprehensive material database.

### Key Features

- **14-stage processing pipeline** with checkpoint recovery
- **Product-focused extraction** - processes only identified product pages
- **Two-stage AI classification** - fast discovery + deep analysis
- **Multi-vector embeddings** - 6 types for comprehensive search
- **Async job queue** - background processing with real-time progress
- **Checkpoint recovery** - resume from any stage on failure
- **Real-time progress tracking** - live updates to frontend

---

## Pipeline Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  Stage 1: PDF Upload & Validation                               │
│  • File validation (size, type, corruption)                     │
│  • Upload to Supabase Storage                                   │
│  • Create document record                                       │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│  Stage 2: Background Job Creation                               │
│  • Create background_jobs record                                │
│  • Initialize progress tracking                                 │
│  • Return job_id to frontend                                    │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│  Stage 3: PDF Analysis & Strategy Selection                     │
│  • Extract PDF metadata (pages, size, structure)                │
│  • Analyze document type                                        │
│  • Select processing strategy                                   │
│  Checkpoint: PDF_EXTRACTED                                      │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│  Stage 4: Product Discovery (AI)                                │
│  • Claude Haiku 4.5: Fast product identification                │
│  • Identify product count and page ranges                       │
│  • Claude Sonnet 4.5: Validate and enrich metadata              │
│  • Extract product names, dimensions, variants                  │
│  Output: Product list with page ranges                          │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│  Stage 5: Text Extraction (Focused)                             │
│  • PyMuPDF4LLM: Extract text from product pages only            │
│  • Preserve structure and formatting                            │
│  • Extract metadata (fonts, colors, layout)                     │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│  Stage 6: Semantic Chunking (AI)                                │
│  • Anthropic Chunking API: Split text semantically              │
│  • Max tokens: 800, Overlap: 100                                │
│  • Preserve context and meaning                                 │
│  • Create document_chunks records                               │
│  Checkpoint: CHUNKS_CREATED                                     │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│  Stage 7: Text Embedding Generation (AI)                        │
│  • OpenAI text-embedding-3-small: Generate 1536D embeddings    │
│  • Store in pgvector for similarity search                      │
│  • Link embeddings to chunks                                    │
│  Checkpoint: TEXT_EMBEDDINGS_GENERATED                          │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│  Stage 8: Image Extraction & Upload                             │
│  • Extract images from product pages                            │
│  • Upload to Supabase Storage (pdf-tiles bucket)                │
│  • Create document_images records                               │
│  • Extract image metadata (dimensions, format)                  │
│  Checkpoint: IMAGES_EXTRACTED                                   │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│  Stage 9: Image Analysis (AI)                                   │
│  • Llama 4 Scout 17B Vision: Analyze each image                 │
│  • Extract material properties                                  │
│  • Quality scoring (0-100)                                      │
│  • Classify image type (product, detail, mood, etc.)            │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│  Stage 10: CLIP Embedding Generation (AI)                       │
│  • CLIP ViT-B/32: Generate 512D visual embeddings               │
│  • Store in database for visual search                          │
│  • Link to document_images                                      │
│  Checkpoint: IMAGE_EMBEDDINGS_GENERATED                         │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│  Stage 11: Product Creation (Two-Stage AI)                      │
│  • Stage 1: Content classification (product/supporting/admin)   │
│  • Stage 2: Product boundary detection                          │
│  • Create products records with metadata                        │
│  • Link chunks and images to products                           │
│  Checkpoint: PRODUCTS_CREATED                                   │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│  Stage 12: Metafield Extraction                                 │
│  • Extract dynamic metadata from chunks                         │
│  • Create metafield_values records                              │
│  • Link to chunks, products, images                             │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│  Stage 13: Deferred AI Analysis (Async Background Job)          │
│  • Claude Sonnet 4.5: Validate low-scoring images               │
│  • Generate specialized embeddings:                             │
│    - Color embeddings (256D)                                    │
│    - Texture embeddings (256D)                                  │
│    - Application embeddings (512D)                              │
│    - Multimodal embeddings (2048D)                              │
│  • Enhanced metadata extraction                                 │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│  Stage 14: Cleanup & Completion                                 │
│  • Delete temporary files from disk                             │
│  • Kill background processes                                    │
│  • Update job status to 'completed'                             │
│  • Send completion notification                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Processing Modes

### 1. Focused Extraction (Default)
- **Description**: Processes only product pages identified during discovery
- **Use Case**: Material catalogs with mixed content
- **Advantages**: Faster processing, lower cost, higher accuracy
- **API Parameter**: `focused_extraction=true` (default)

### 2. Full Extraction
- **Description**: Processes entire PDF regardless of content type
- **Use Case**: Technical documents, research papers
- **Advantages**: Complete coverage
- **API Parameter**: `focused_extraction=false`

---

## Checkpoint Recovery System

The pipeline includes 9 checkpoints for recovery on failure:

### Checkpoint Stages

1. **PDF_EXTRACTED** - PDF analysis complete
2. **CHUNKS_CREATED** - Text chunking complete
3. **TEXT_EMBEDDINGS_GENERATED** - Text embeddings complete
4. **IMAGES_EXTRACTED** - Image extraction complete
5. **IMAGE_EMBEDDINGS_GENERATED** - Visual embeddings complete
6. **PRODUCTS_CREATED** - Product creation complete
7. **METAFIELDS_EXTRACTED** - Metafield extraction complete
8. **DEFERRED_ANALYSIS_QUEUED** - Background jobs queued
9. **COMPLETED** - All processing complete

### Recovery Process

```python
# On job restart
if job.checkpoint_stage:
    resume_from_checkpoint(job.checkpoint_stage)
else:
    start_from_beginning()
```

---

## Product Discovery

### Two-Stage AI Classification

#### Stage 1: Fast Discovery (Claude Haiku 4.5)
- **Purpose**: Quickly identify products and page ranges
- **Input**: Full PDF text
- **Output**: Product count, page ranges, basic metadata
- **Time**: 5-15 seconds
- **Accuracy**: 90%+

#### Stage 2: Deep Analysis (Claude Sonnet 4.5)
- **Purpose**: Validate and enrich product metadata
- **Input**: Product pages from Stage 1
- **Output**: Detailed metadata (names, dimensions, variants, designers)
- **Time**: 10-30 seconds
- **Accuracy**: 95%+

### Product Metadata Extracted

- Product name
- Designer/studio
- Dimensions (width, height, depth)
- Variants (colors, finishes, sizes)
- Page ranges
- Image types (product shots, details, mood boards)
- Material properties
- Application areas

---

## Image Processing

### Image Classification

Images are classified into types:
- **Product Images**: Main product photos
- **Detail Images**: Close-ups of materials/textures
- **Dimension Diagrams**: Technical drawings
- **Mood Boards**: Lifestyle/context images
- **Text Labels**: Specification tables

### Quality Scoring

Each image receives a quality score (0-100) based on:
- Resolution and clarity
- Relevance to material specifications
- Information density
- Technical content

### Validation Workflow

```
Image Extracted
    ↓
Llama Analysis → Quality Score
    ↓
Score < 70? → Queue for Claude Validation (async)
Score ≥ 70? → Accept and continue
```

---

## API Endpoints

### Upload with Product Discovery

```http
POST /api/rag/documents/upload-with-discovery
Content-Type: multipart/form-data

Parameters:
- file: PDF file (required)
- workspace_id: UUID (required)
- category_id: UUID (optional)
- focused_extraction: boolean (default: true)
```

**Response**:
```json
{
  "job_id": "uuid",
  "document_id": "uuid",
  "status": "processing",
  "estimated_time": 180
}
```

### Check Job Status

```http
GET /api/rag/jobs/{job_id}/status

Response:
{
  "job_id": "uuid",
  "status": "processing",
  "progress": 65,
  "current_stage": "IMAGE_EMBEDDINGS_GENERATED",
  "stages_completed": 9,
  "total_stages": 14,
  "products_found": 14,
  "chunks_created": 156,
  "images_extracted": 89,
  "estimated_time_remaining": 45
}
```

---

## Performance Metrics

### Processing Times

| PDF Size | Pages | Products | Time |
|----------|-------|----------|------|
| Small | 1-20 | 1-5 | 1-2 min |
| Medium | 21-50 | 6-15 | 2-4 min |
| Large | 51-100 | 16-30 | 4-8 min |
| Extra Large | 100+ | 30+ | 8-15 min |

### Resource Usage

- **Memory**: 2-4 GB per PDF
- **CPU**: 2-4 cores
- **Storage**: 2-5x PDF size (images + embeddings)
- **API Calls**: 50-200 per PDF (depending on size)

### Accuracy

- **Product Detection**: 95%+
- **Chunk Quality**: 90%+
- **Image Classification**: 88%+
- **Metadata Extraction**: 85%+

---

## Error Handling

### Common Errors

1. **PDF Corruption**: Validate before processing
2. **Timeout**: Increase function timeout or split PDF
3. **API Rate Limits**: Implement exponential backoff
4. **Storage Limits**: Monitor bucket usage
5. **Memory Limits**: Process images in batches

### Retry Strategy

```python
max_retries = 3
retry_delay = [5, 15, 30]  # seconds

for attempt in range(max_retries):
    try:
        process_stage()
        break
    except Exception as e:
        if attempt < max_retries - 1:
            time.sleep(retry_delay[attempt])
        else:
            mark_job_failed(e)
```

---

## Best Practices

### For Users

1. **PDF Quality**: Use high-resolution PDFs with clear text
2. **File Size**: Keep PDFs under 50MB for optimal performance
3. **Content**: Ensure PDFs contain material specifications
4. **Categories**: Assign categories during upload for better organization

### For Developers

1. **Monitoring**: Track job progress and error rates
2. **Cleanup**: Always delete temporary files after processing
3. **Checkpoints**: Save progress at each stage
4. **Logging**: Log all AI model calls with timestamps
5. **Testing**: Use Harmony PDF as validation benchmark (14+ products)

---

**Last Updated**: 2025-10-31  
**Version**: 2.0.0  
**Status**: Production

