# Modular PDF Processing Pipeline - API Endpoints Documentation

## Overview

The PDF processing pipeline has been refactored into **6 modular internal API endpoints** that work together in sequence. Each endpoint receives the output from the previous stage and processes it further. All endpoints support **dynamic AI model configuration** via optional `ai_config` parameter.

**Key Concept**: Each endpoint knows what to process because it receives **filtered/processed data** from the previous endpoint, not raw data.

---

## 🔄 Data Flow Between Endpoints

10. classify-images      → Receives: ALL extracted images
    ↓                      Returns: material_images + non_material_images

20. upload-images        → Receives: ONLY material_images (from step 10)
    ↓                      Returns: uploaded_images with storage URLs

30. save-images-db       → Receives: ONLY uploaded material images (from step 20)
    ↓                      Returns: images_saved + visual embeddings count (SLIG 768D)

40. extract-metadata     → Receives: product_ids + PDF text
    ↓                      Returns: enriched products with extracted metadata

50. create-chunks        → Receives: Full extracted text + product_ids
    ↓                      Returns: chunks + text embeddings + relationships

60. create-relationships → Receives: document_id + product_ids
                           Returns: chunk-image + product-image relationships

**Important**: Each endpoint receives **pre-filtered data** from the orchestrator, which calls them in sequence and passes the output of one as input to the next.

---

## 🤖 AI Model Configuration

All endpoints support **dynamic AI model configuration** via the optional `ai_config` parameter. This allows you to customize which AI models are used for different stages of the pipeline.

### Configuration Parameters

The `ai_config` object accepts the following optional fields:

- `visual_embedding_model` — Default: "SLIG"
- `visual_embedding_dimensions` — Default: 768
- `text_embedding_model` — Default: "voyage-4"
- `text_embedding_dimensions` — Default: 1024
- `text_embedding_input_type` — Default: "document"
- `classification_primary_model` — Default: "Qwen/Qwen3-VL-32B-Instruct"
- `classification_validation_model` — Default: "claude-sonnet-4-6-20260217"
- `classification_confidence_threshold` — Default: 0.7
- `discovery_model` — Default: "claude-sonnet-4-6-20260217"
- `metadata_extraction_model` — Default: "claude"
- `chunking_model` — Default: "gpt-4o"
- `discovery_temperature` — Default: 0.1
- `classification_temperature` — Default: 0.1
- `metadata_temperature` — Default: 0.1
- `discovery_max_tokens` — Default: 4096
- `classification_max_tokens` — Default: 512
- `metadata_max_tokens` — Default: 4096

### Pre-configured Profiles

**DEFAULT_AI_CONFIG** (Balanced):
- Best overall accuracy and reliability
- Uses Claude Sonnet 4.5 for discovery and metadata
- Uses SLIG (SigLIP2) for visual embeddings (768D, HuggingFace endpoint)
- Uses Voyage AI voyage-4 for text embeddings (1024D)
- Uses Qwen3-VL-32B-Instruct for vision classification (HuggingFace endpoint) with Claude validation

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
- **Stage 1 - Qwen Vision (Fast & Accurate)**:
  - Model: `Qwen/Qwen3-VL-32B-Instruct` (HuggingFace Endpoint)
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

**AI Processing - Visual Embeddings (SLIG via HuggingFace Endpoint)**:
- **Model**: SLIG (SigLIP2) via HuggingFace Inference Endpoint
  - Cloud-based GPU inference for consistent performance
  - Auto-pause enabled to reduce costs
  - Superior to CLIP for material understanding
- **Embedding Dimension**: 768D per embedding
- **5 Embedding Types Per Image**:
  1. **Visual** (768D): General visual features from SLIG image encoder (image_embedding mode)
  2. **Color** (768D): Text-guided SLIG embedding optimized for color matching (text_embedding mode)
  3. **Texture** (768D): Text-guided SLIG embedding optimized for texture matching (text_embedding mode)
  4. **Style** (768D): Text-guided SLIG embedding optimized for style matching (text_embedding mode)
  5. **Material** (768D): Text-guided SLIG embedding optimized for material type matching (text_embedding mode)

**Technical Details**:
- Uses SLIG HuggingFace endpoint exclusively for all visual embeddings
- Generates base visual embedding (768D) using SLIG image_embedding mode
- Creates 4 text-guided specialized embeddings using SLIG text_embedding mode with prompts
- Each embedding is normalized to unit vector (L2 normalization)
- Total: 5 × 768D = 3,840 dimensions per image
- All embeddings use SLIG endpoint (mh-siglip2)

**Storage**:
- Saves to `document_images` table (PostgreSQL) with embedding columns:
  - visual_slig_768 (SLIG base embedding)
  - color_slig_768 (SLIG color embedding)
  - texture_slig_768 (SLIG texture embedding)
  - style_slig_768 (SLIG style embedding)
  - material_slig_768 (SLIG material embedding)

**Calculation**: 65 images × 5 embeddings = 325 total SLIG embeddings (768D each)

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
  - Model: Voyage AI `voyage-4`
  - Dimension: 1024D
  - Input Type: `document`
  - One embedding per chunk
  - Uses Voyage AI API (sole text embedder; OpenAI fallback retired 2026-04)

- **Relationships**:
  - Creates chunk-to-product relationships
  - Links chunks to products based on page ranges

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
  - Method: Cosine similarity between chunk text embeddings (1024D) and image SLIG embeddings (768D)
  - Threshold: 0.5 (default)
  - Links semantically related chunks and images
  - Example: A chunk describing "oak wood texture" links to images of oak textures

- **Product-Image Relationships**:
  - Method: Page range matching
  - Links images to products based on page numbers
  - Uses product page ranges from discovery
  - Example: Product on pages 5-8 links to all images on those pages

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
  - Generates SLIG embeddings (768D) ONLY for material images
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
2. **Image Classification**: Qwen3-VL-32B-Instruct (HuggingFace Endpoint) → Claude Sonnet 4.5 (validation)
3. **Visual Embeddings**: SLIG (SigLIP2) via HuggingFace Endpoint - 5 types per image, 768D each
4. **Text Embeddings**: Voyage AI voyage-4 (1024D) — sole provider (updated 2026-04)

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
- **50-60%**: Image Classification (Qwen3-VL-32B + Claude)
- **60-65%**: Image Upload (Supabase Storage)
- **65-75%**: Save Images & SLIG Embeddings (5 per image, 768D each)
- **75-85%**: Chunking & Text Embeddings (Voyage AI 1024D)
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

1. **classify-images**: AI classification (Qwen3-VL-32B → Claude) to filter material vs non-material images
2. **upload-images**: Upload material images to Supabase Storage (receives pre-filtered list)
3. **save-images-db**: Save to DB + generate 5 visual embeddings per image (SLIG 768D via HuggingFace endpoint)
4. **create-chunks**: Semantic chunking + text embeddings (Voyage AI voyage-4 1024D)
5. **create-relationships**: Chunk-image and product-image relationships via similarity

### Default Processing Flow

1. Extract ALL images from PDF
2. Classify ALL images with AI (Qwen3-VL-32B + Claude) → **material_images** + non_material_images
3. Upload ONLY **material_images** to storage → **uploaded_images**
4. Save ONLY **uploaded_images** to database
5. Generate 5 visual embeddings per saved image (SLIG 768D via HuggingFace endpoint)
6. Create semantic chunks from text
7. Generate text embeddings for chunks (Voyage AI voyage-4 1024D)
8. Create relationships between chunks, images, and products

### Key Features

- ✅ **Focused extraction by default** (only material images)
- ✅ **Two-stage AI classification** (Qwen3-VL-32B fast, Claude validation)
- ✅ **5 visual embeddings per image** (SLIG 768D via HuggingFace endpoint: visual, color, texture, style, material)
- ✅ **High-quality text embeddings** (Voyage AI voyage-4 1024D)
- ✅ **Semantic chunking** with product boundary respect
- ✅ **Comprehensive progress tracking** (5% increments)
- ✅ **Checkpoint creation** at each stage for recovery
- ✅ **Retry logic** with exponential backoff
- ✅ **Error handling** with Sentry integration
- ✅ **Real-time database sync** after each stage
- ✅ **Pre-filtered data flow** (each endpoint receives processed output from previous stage)
