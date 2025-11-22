# Modular PDF Processing Pipeline - API Endpoints Documentation

## Overview

The PDF processing pipeline has been refactored into **6 modular internal API endpoints** that work together in sequence. Each endpoint receives the output from the previous stage and processes it further. All endpoints support **dynamic AI model configuration** via optional `ai_config` parameter.

**Key Concept**: Each endpoint knows what to process because it receives **filtered/processed data** from the previous endpoint, not raw data.

---

## 🔄 Data Flow Between Endpoints

```
10. classify-images      → Receives: ALL extracted images
    ↓                      Returns: material_images + non_material_images

20. upload-images        → Receives: ONLY material_images (from step 10)
    ↓                      Returns: uploaded_images with storage URLs

30. save-images-db       → Receives: ONLY uploaded material images (from step 20)
    ↓                      Returns: images_saved + visual embeddings count (SigLIP/CLIP)

40. extract-metadata     → Receives: product_ids + PDF text
    ↓                      Returns: enriched products with extracted metadata

50. create-chunks        → Receives: Full extracted text + product_ids
    ↓                      Returns: chunks + text embeddings + relationships

60. create-relationships → Receives: document_id + product_ids
                           Returns: chunk-image + product-image relationships
```

**Important**: Each endpoint receives **pre-filtered data** from the orchestrator, which calls them in sequence and passes the output of one as input to the next.

---

## 🤖 AI Model Configuration

All endpoints support **dynamic AI model configuration** via the optional `ai_config` parameter. This allows you to customize which AI models are used for different stages of the pipeline.

### Configuration Parameters

```typescript
interface AIModelConfig {
  // Visual Embedding Models (SigLIP primary, CLIP fallback)
  visual_embedding_primary?: string;          // Default: "google/siglip-so400m-patch14-384"
  visual_embedding_fallback?: string;         // Default: "openai/clip-vit-base-patch32"

  // Text Embedding Model
  text_embedding_model?: string;              // Default: "text-embedding-3-small"

  // Image Classification Models
  classification_primary_model?: string;      // Default: "meta-llama/Llama-4-Scout-17B-16E-Instruct"
  classification_validation_model?: string;   // Default: "claude-sonnet-4-20250514"
  classification_confidence_threshold?: number; // Default: 0.7

  // Product Discovery Model
  discovery_model?: "claude-sonnet-4-20250514" | "gpt-5" | "gpt-4o"; // Default: "claude-sonnet-4-20250514"

  // Metadata Extraction Model
  metadata_extraction_model?: "claude" | "gpt"; // Default: "claude"

  // Chunking Model
  chunking_model?: string;                    // Default: "gpt-4o"

  // Temperature Settings
  discovery_temperature?: number;             // Default: 0.1
  classification_temperature?: number;        // Default: 0.1
  metadata_temperature?: number;              // Default: 0.1

  // Max Tokens
  discovery_max_tokens?: number;              // Default: 4096
  classification_max_tokens?: number;         // Default: 512
  metadata_max_tokens?: number;               // Default: 4096
}
```

### Pre-configured Profiles

**DEFAULT_AI_CONFIG** (Balanced):
- Best overall accuracy and reliability
- Uses Claude Sonnet 4.5 for discovery and metadata
- Uses SigLIP for visual embeddings with CLIP fallback
- Uses Llama Vision for fast classification with Claude validation

**FAST_CONFIG** (Speed Optimized):
- Uses GPT-4o instead of Claude for faster processing
- Uses Claude Haiku for validation (faster than Sonnet)
- Reduced max tokens for faster responses

**HIGH_ACCURACY_CONFIG** (Quality Optimized):
- Uses GPT-5 for discovery (most accurate)
- Higher confidence threshold (0.8) for better quality
- Increased max tokens for more context

**COST_OPTIMIZED_CONFIG** (Budget Friendly):
- Uses GPT-4o and Claude Haiku (cheaper models)
- Lower confidence threshold (0.6) to reduce validation calls
- Reduced max tokens to minimize costs

### Usage Example

```json
{
  "job_id": "abc123",
  "extracted_images": [...],
  "ai_config": {
    "classification_primary_model": "meta-llama/Llama-4-Scout-17B-16E-Instruct",
    "classification_validation_model": "claude-sonnet-4-20250514",
    "classification_confidence_threshold": 0.8,
    "visual_embedding_primary": "google/siglip-so400m-patch14-384"
  }
}
```

If `ai_config` is not provided, the endpoint uses `DEFAULT_AI_CONFIG`.

---

## 🏗️ Architecture

### Main Orchestrator
- **Endpoint**: `POST /api/rag/documents/upload`
- **Purpose**: Main entry point that orchestrates the complete pipeline
- **Calls**: All 6 internal endpoints sequentially
- **Infrastructure**: Manages ProgressTracker, CheckpointRecoveryService, job_storage, heartbeat monitoring

### Internal Endpoints
All internal endpoints are prefixed with `/api/internal/` and tagged as "Internal Pipeline Stages" in OpenAPI docs.

---

## 📋 Endpoint Details

### 10. POST /api/internal/classify-images/{job_id} (10-20%)

**Purpose**: Classify ALL extracted images as material or non-material using two-stage AI classification

**What It Receives**:
- `extracted_images`: ALL images extracted from the PDF (no filtering)
- Each image has: filename, path, page_number, width, height

**How It Knows What to Process**:
- It receives ALL images and classifies each one
- Uses AI to determine if each image is material-related or not

**AI Processing**:
- **Stage 1 - Llama Vision (Fast & Cheap)**:
  - Model: `meta-llama/Llama-4-Scout-17B-16E-Instruct` (TogetherAI)
  - Classifies images into 3 categories:
    - `material_closeup`: Close-up of material texture/surface/pattern
    - `material_in_situ`: Material shown in application/context
    - `non_material`: NOT material-related (faces, logos, charts, text)
  - Returns confidence score (0-1)
  - Concurrency: 5 parallel calls
  
- **Stage 2 - Claude Validation (High Quality)**:
  - Model: `Claude Sonnet 4.5` (Anthropic)
  - Only validates images with confidence < threshold (default: 0.7)
  - Provides detailed reasoning for classification
  - Improves accuracy for edge cases
  - Concurrency: 2 parallel calls

**AI Configuration** (Optional):
All endpoints accept an optional `ai_config` parameter to customize AI models:
```json
{
  "visual_embedding_primary": "google/siglip-so400m-patch14-384",
  "visual_embedding_fallback": "openai/clip-vit-base-patch32",
  "text_embedding_model": "text-embedding-3-small",
  "classification_primary_model": "meta-llama/Llama-4-Scout-17B-16E-Instruct",
  "classification_validation_model": "claude-sonnet-4-20250514",
  "classification_confidence_threshold": 0.7,
  "discovery_model": "claude-sonnet-4-20250514",
  "metadata_extraction_model": "claude",
  "chunking_model": "gpt-4o"
}
```

**Request**:
```json
{
  "job_id": "string",
  "extracted_images": [
    {
      "filename": "image1.jpg",
      "path": "/tmp/image1.jpg",
      "page_number": 5,
      "width": 800,
      "height": 600
    }
  ],
  "ai_config": {
    "classification_primary_model": "meta-llama/Llama-4-Scout-17B-16E-Instruct",
    "classification_validation_model": "claude-sonnet-4-20250514",
    "classification_confidence_threshold": 0.7
  }
}
```

**Response**:
```json
{
  "success": true,
  "material_images": [
    {
      "filename": "material1.jpg",
      "path": "/tmp/material1.jpg",
      "page_number": 5,
      "classification": "material_closeup",
      "confidence": 0.92
    }
  ],
  "non_material_images": [
    {
      "filename": "logo.jpg",
      "path": "/tmp/logo.jpg",
      "page_number": 1,
      "classification": "non_material",
      "confidence": 0.88,
      "reason": "Company logo, not material-related"
    }
  ],
  "total_classified": 100,
  "material_count": 65,
  "non_material_count": 35
}
```

**Defaults**:
- Uses `DEFAULT_AI_CONFIG` if `ai_config` not provided
- Timeout: 600s (10 minutes)

**Progress**: Updates job to 10-20%

**What Happens Next**: The `material_images` list is passed to the next endpoint (upload-images)

---

### 20. POST /api/internal/upload-images/{job_id} (20-30%)

**Purpose**: Upload material images to Supabase Storage

**What It Receives**:
- `material_images`: ONLY the images classified as material-related by endpoint #1
- Each image has: filename, path, page_number (from classification step)

**How It Knows to Process ONLY Material Images**:
- It doesn't decide - it receives a **pre-filtered list** from the orchestrator
- The orchestrator passes only the `material_images` output from classify-images endpoint
- Non-material images are never sent to this endpoint

**Processing**:
- Uploads each image to Supabase Storage
- Storage bucket: `material-images`
- Path format: `{document_id}/{filename}`
- Parallel uploads with rate limiting
- Generates public URLs for each image

**Request**:
```json
{
  "job_id": "string",
  "material_images": [
    {
      "filename": "material1.jpg",
      "path": "/tmp/material1.jpg",
      "page_number": 5
    }
  ],
  "document_id": "uuid"
}
```

**Response**:
```json
{
  "success": true,
  "uploaded_images": [
    {
      "filename": "material1.jpg",
      "storage_url": "https://...supabase.co/storage/v1/object/public/material-images/...",
      "page_number": 5
    }
  ],
  "uploaded_count": 65,
  "failed_count": 0
}
```

**Defaults**:
- Concurrency: 5 parallel uploads
- Timeout: 600s (10 minutes)
- Retry: 3 attempts with exponential backoff

**Progress**: Updates job to 20-30%

**What Happens Next**: The `uploaded_images` list (with storage URLs) is passed to the next endpoint (save-images-db)

---

### 30. POST /api/internal/save-images-db/{job_id} (30-50%)

**Purpose**: Save images to database and generate visual embeddings

**What It Receives**:
- `material_images`: ONLY the successfully uploaded material images from endpoint #2
- Each image has: filename, storage_url, page_number

**How It Knows to Process ONLY Material Images**:
- It receives a **pre-filtered list** from the orchestrator
- The orchestrator passes only the `uploaded_images` output from upload-images endpoint
- These are already filtered twice: (1) AI classification, (2) successful upload

**AI Processing - Visual Embeddings (SigLIP with CLIP Fallback)**:
- **Primary Model**: Google SigLIP ViT-SO400M (`google/siglip-so400m-patch14-384`)
  - +19-29% accuracy improvement over CLIP
  - Better visual understanding for material search
- **Fallback Model**: OpenAI CLIP ViT-B/32 (`openai/clip-vit-base-patch32`)
  - Used if SigLIP fails or encounters errors
  - Reliable fallback with proven performance
- **Embedding Dimension**: 512D per embedding
- **5 Embedding Types Per Image**:
  1. **Visual** (512D): General visual features from SigLIP/CLIP image encoder
  2. **Color** (512D): Same base embedding, optimized for color matching
  3. **Texture** (512D): Same base embedding, optimized for texture matching
  4. **Style** (512D): Same base embedding, optimized for style matching
  5. **Material** (512D): Same base embedding, optimized for material type matching

**Technical Details**:
- Tries SigLIP first for better accuracy
- Falls back to CLIP if SigLIP fails
- Generates base visual embedding using image encoder
- Creates 5 specialized embeddings from the same base embedding
- Each embedding is normalized to unit vector (L2 normalization)
- Total: 5 × 512D = 2,560 dimensions per image
- Metadata tracks which model was actually used (siglip-so400m-patch14-384 or clip-vit-base-patch32)

**Storage**:
- Saves to `document_images` table (PostgreSQL)
- Saves to `embeddings` table (PostgreSQL) - **CRITICAL**: Saves here FIRST
- Upserts to VECS collections (vector search) - After database save

**Request**:
```json
{
  "job_id": "string",
  "material_images": [
    {
      "filename": "material1.jpg",
      "storage_url": "https://...",
      "page_number": 5
    }
  ],
  "document_id": "uuid",
  "workspace_id": "uuid"
}
```

**Response**:
```json
{
  "success": true,
  "images_saved": 65,
  "clip_embeddings_generated": 325
}
```

**Calculation**: 65 images × 5 embeddings = 325 total CLIP embeddings

**Defaults**:
- Embeddings per image: 5 (visual, color, texture, style, material)
- Timeout: 600s (10 minutes)
- Batch processing: All embeddings generated in parallel

**Progress**: Updates job to 30-50%

**What Happens Next**: Images and embeddings are now in the database, ready for relationship creation

---

### 40. POST /api/internal/extract-metadata/{job_id} (50-60%)

**Purpose**: Extract comprehensive metadata from PDF text for products using AI

**What It Receives**:
- `product_ids`: List of product IDs to enrich with metadata
- `pdf_text`: Full PDF text content
- `document_id`: ID of the document being processed

**How It Knows What to Process**:
- It receives **product IDs** from product discovery stage
- Extracts product-specific text based on page ranges
- Uses AI to extract structured metadata from text

**AI Processing**:
- **Model**: Configurable via `ai_config.metadata_extraction_model`
  - Default: `claude` (Claude Sonnet 4.5)
  - Alternative: `gpt` (GPT-4o or GPT-5)
- **Temperature**: Configurable via `ai_config.metadata_temperature` (default: 0.1)
- **Max Tokens**: Configurable via `ai_config.metadata_max_tokens` (default: 4096)
- **Extraction Method**: Dynamic metadata extraction with category hints
- **Metadata Fields**: Dimensions, colors, patterns, materials, finishes, applications, certifications, etc.

**Request**:
```json
{
  "job_id": "string",
  "document_id": "uuid",
  "product_ids": ["uuid1", "uuid2"],
  "pdf_text": "Full PDF text content...",
  "ai_config": {
    "metadata_extraction_model": "claude",
    "metadata_temperature": 0.1,
    "metadata_max_tokens": 4096
  }
}
```

**Response**:
```json
{
  "success": true,
  "products_enriched": 7,
  "metadata_fields_extracted": 42,
  "extraction_method": "ai_dynamic_claude",
  "model_used": "claude"
}
```

**Defaults**:
- `metadata_extraction_model`: "claude"
- `metadata_temperature`: 0.1
- `metadata_max_tokens`: 4096
- Timeout: 600s (10 minutes)

**Progress**: Updates job to 50-60%

**What Happens Next**: Products are enriched with metadata, ready for chunking

---

### 50. POST /api/internal/create-chunks/{job_id} (60-80%)

**Purpose**: Create semantic chunks from extracted text and generate text embeddings

**What It Receives**:
- `extracted_text`: Full text content extracted from the PDF
- `product_ids`: List of product IDs discovered in the PDF
- `chunk_size`: Size of each chunk in characters
- `chunk_overlap`: Overlap between chunks in characters

**How It Knows What to Process**:
- It receives the **full extracted text** from the PDF
- Uses `product_ids` to create chunk-to-product relationships
- Respects product boundaries (doesn't mix content from different products)

**AI Processing**:
- **Text Chunking**:
  - Method: Semantic chunking with overlap
  - Respects product boundaries (doesn't mix content from different products)
  - Excludes index/navigation pages
  - Creates chunks of specified size with overlap

- **Text Embeddings**:
  - Model: OpenAI `text-embedding-3-small`
  - Dimension: 1536D
  - One embedding per chunk
  - Uses OpenAI API (not HuggingFace)

- **Relationships**:
  - Creates chunk-to-product relationships
  - Links chunks to products based on page ranges

**Request**:
```json
{
  "job_id": "string",
  "document_id": "uuid",
  "workspace_id": "uuid",
  "extracted_text": "Full PDF text content...",
  "product_ids": ["uuid1", "uuid2"],
  "chunk_size": 512,
  "chunk_overlap": 50
}
```

**Response**:
```json
{
  "success": true,
  "chunks_created": 107,
  "embeddings_generated": 107,
  "relationships_created": 163
}
```

**Defaults**:
- `chunk_size`: 512 characters
- `chunk_overlap`: 50 characters
- Timeout: 600s (10 minutes)
- Batch processing: All embeddings generated in parallel

**Progress**: Updates job to 60-80%

**What Happens Next**: Chunks and text embeddings are in the database, ready for relationship creation

---

### 60. POST /api/internal/create-relationships/{job_id} (80-100%)

**Purpose**: Create chunk-image and product-image relationships

**What It Receives**:
- `document_id`: ID of the document being processed
- `product_ids`: List of product IDs discovered in the PDF
- `similarity_threshold`: Minimum similarity score for relationships

**How It Knows What to Process**:
- It queries the database for all chunks and images belonging to this document
- Uses the `document_id` to find all relevant entities
- Creates relationships based on similarity and page ranges

**Processing**:
- **Chunk-Image Relationships**:
  - Method: Cosine similarity between chunk text embeddings (1536D) and image CLIP embeddings (512D)
  - Threshold: 0.5 (default)
  - Links semantically related chunks and images
  - Example: A chunk describing "oak wood texture" links to images of oak textures

- **Product-Image Relationships**:
  - Method: Page range matching
  - Links images to products based on page numbers
  - Uses product page ranges from discovery
  - Example: Product on pages 5-8 links to all images on those pages

**Request**:
```json
{
  "job_id": "string",
  "document_id": "uuid",
  "product_ids": ["uuid1", "uuid2"],
  "similarity_threshold": 0.5
}
```

**Response**:
```json
{
  "success": true,
  "chunk_image_relationships": 245,
  "product_image_relationships": 132
}
```

**Defaults**:
- `similarity_threshold`: 0.5 (50% minimum similarity)
- Timeout: 600s (10 minutes)

**Progress**: Updates job to 80-100%

**What Happens Next**: Pipeline complete! All data is in the database with relationships.

---

## 🎯 Default Behavior

### Focused Extraction (Default: ENABLED)
- **Purpose**: Process ONLY material-related images, skip non-material content
- **Default**: `focused_extraction=True`
- **Categories**: `['products']` (only product-related content)
- **Behavior**:
  - Classifies ALL images with AI
  - Uploads ONLY material images to storage
  - Saves ONLY material images to database
  - Generates CLIP embeddings ONLY for material images
  - Skips non-material images (faces, logos, charts, text)

### Extract Categories
- **Options**: `['products', 'certificates', 'logos', 'specifications', 'all']`
- **Default**: `['products']`
- **Behavior**:
  - `products`: Only product pages and images
  - `certificates`: Only certificate pages and images
  - `logos`: Only logo pages and images
  - `specifications`: Only specification pages and images
  - `all`: Process entire PDF (disables focused extraction)

### AI Models Used
1. **Product Discovery**: Claude Sonnet 4.5 or GPT-5 (configurable)
2. **Image Classification**: Llama 4 Scout 17B Vision → Claude Sonnet 4.5 (validation)
3. **Visual Embeddings**: Google SigLIP ViT-SO400M (primary) / OpenAI CLIP ViT-B/32 (fallback) - 5 types per image, 512D each
4. **Text Embeddings**: OpenAI text-embedding-3-small (1536D)

### Thresholds
- **Image Classification Confidence**: 0.7 (70% minimum)
- **Relationship Similarity**: 0.5 (50% minimum)
- **Chunk Size**: 512 characters
- **Chunk Overlap**: 50 characters

### Retry & Timeout
- **Max Retries**: 3 attempts per endpoint
- **Timeout**: 600s (10 minutes) per endpoint
- **Backoff**: Exponential (2^attempt seconds)

---

## 📊 Progress Tracking

### Pipeline Stages (50-100%)
- **50-60%**: Image Classification (Llama + Claude)
- **60-65%**: Image Upload (Supabase Storage)
- **65-75%**: Save Images & CLIP Embeddings (5 per image)
- **75-85%**: Chunking & Text Embeddings
- **85-100%**: Relationships (chunk-image, product-image)

### Infrastructure Integration
- **ProgressTracker**: Real-time progress updates, heartbeat monitoring (30s interval)
- **CheckpointRecoveryService**: Checkpoint creation at each stage for recovery
- **JobTracker**: Database sync after each stage
- **job_storage**: In-memory tracking for fast access
- **Sentry**: Error tracking and monitoring

---

## ✅ Summary

### What Each Endpoint Does

1. **classify-images**: AI classification (Llama → Claude) to filter material vs non-material images
2. **upload-images**: Upload material images to Supabase Storage (receives pre-filtered list)
3. **save-images-db**: Save to DB + generate 5 visual embeddings per image (SigLIP primary / CLIP fallback)
4. **create-chunks**: Semantic chunking + text embeddings (OpenAI text-embedding-3-small)
5. **create-relationships**: Chunk-image and product-image relationships via similarity

### Default Processing Flow

1. Extract ALL images from PDF
2. Classify ALL images with AI (Llama + Claude) → **material_images** + non_material_images
3. Upload ONLY **material_images** to storage → **uploaded_images**
4. Save ONLY **uploaded_images** to database
5. Generate 5 visual embeddings per saved image (SigLIP primary / CLIP fallback)
6. Create semantic chunks from text
7. Generate text embeddings for chunks (OpenAI text-embedding-3-small)
8. Create relationships between chunks, images, and products

### Key Features

- ✅ **Focused extraction by default** (only material images)
- ✅ **Two-stage AI classification** (Llama fast, Claude validation)
- ✅ **5 visual embeddings per image** (SigLIP ViT-SO400M primary / CLIP ViT-B/32 fallback: visual, color, texture, style, material)
- ✅ **Semantic chunking** with product boundary respect
- ✅ **Comprehensive progress tracking** (5% increments)
- ✅ **Checkpoint creation** at each stage for recovery
- ✅ **Retry logic** with exponential backoff
- ✅ **Error handling** with Sentry integration
- ✅ **Real-time database sync** after each stage
- ✅ **Pre-filtered data flow** (each endpoint receives processed output from previous stage)

