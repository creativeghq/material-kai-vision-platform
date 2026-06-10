# Multi-Source Meta Extraction Strategy

## Overview

This plan outlines a comprehensive strategy for extracting metadata from **multiple sources** to ensure the highest quality and completeness of product metadata. The system will leverage:

1. **Text Extraction** from PDF content (AI-powered)
2. **Visual Analysis** from product images (5 specialized embeddings)
3. **Embedding-to-Text Conversion** (convert visual embeddings to searchable text)
4. **Pattern Matching** from document chunks
5. **Factory-Level Defaults** (fallback for missing data)

## Current System Architecture

### Embedding Types (7 Total, updated 2026-04)

1. **text_1024** - Voyage AI voyage-4 text embedding (1024D) — sole text embedder (was `text_1536` OpenAI)
2. **visual_768** - SigLIP2 SLIG primary visual embedding (768D, cloud endpoint) → `image_slig_embeddings`
3. **color_aspect_1024** - Voyage `voyage-4` of `VisionAnalysis.colors[]` (1024D, post-2026-05-04) → `image_color_embeddings` (was `color_slig_768` 768D SLIG-blend pre-v2)
4. **texture_aspect_1024** - Voyage `voyage-4` of `VisionAnalysis.textures[] + finish` (1024D, post-v2) → `image_texture_embeddings` (was `texture_slig_768` 768D pre-v2)
5. **material_aspect_1024** - Voyage `voyage-4` of `VisionAnalysis.material_type + category + subcategory` (1024D, post-v2) → `image_material_embeddings` (was `material_slig_768` 768D pre-v2)
6. **style_aspect_1024** - Voyage `voyage-4` of `VisionAnalysis.style + surface_pattern + applications` (1024D, post-v2) → `image_style_embeddings` (was `style_slig_768` 768D pre-v2)
7. **understanding_1024** - Voyage AI embedding (1024D) of Claude Opus 4.7 vision_analysis JSON via Anthropic tool use → `serialize_vision_analysis_to_text` → Voyage. Pre-2026-05-01 used Qwen3-VL JSON; the migration retired Qwen vision (HF endpoint had been 404-ing for months — was already 100% Claude in practice). Provenance fields `embedding_model` + `schema_version` persisted on every row. → `image_understanding_embeddings`

Legacy 1152D SigLIP-SO400M and 512D CLIP collections, as well as the fused `multimodal_2048` vector, were dropped in 2026-04.

### Per-aspect text generation (v2, 2026-05-04)

Pre-v2: the 4 aspect collections held SLIG-blend vectors built from a global fixed text prompt per aspect ("focus on color palette and color relationships" etc.) blended at 10-30% into the base SLIG visual embedding. The fixed prompts produced the same nudge direction for every image regardless of content — so every "color" vector ended up ~80% identical to the visual vector, carrying near-zero independent signal.

Post-v2: each aspect string is a deterministic Python serialization of the per-image `VisionAnalysis` fields produced by Claude Opus 4.7 (Anthropic tool use, schema-locked). See `app.models.vision_analysis.serialize_aspect_*`.

## Problem Statement

**Current Issue**: Specialized embeddings (color, texture, material, style) are generated but **NOT converted to text metadata**. This means:
- ❌ Color embeddings exist but no "color: beige" in metadata
- ❌ Texture embeddings exist but no "finish: matte" in metadata
- ❌ Material embeddings exist but no "material: ceramic" in metadata
- ❌ Style embeddings exist but no "style: modern" in metadata

**Impact**: Search and filtering rely on text metadata, so visual information is not fully utilized.

## Proposed Solution: Multi-Source Meta Extraction

### Architecture

┌─────────────────────────────────────────────────────────────┐
│                    METADATA SOURCES                         │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  1. AI Text Extraction (Claude/GPT)                         │
│     ├─ Product Discovery (Stage 0)                          │
│     ├─ Dynamic Metadata Extractor (Stage 4)                 │
│     └─ Confidence: 0.85-0.95                                │
│                                                             │
│  2. Visual Embedding Analysis (SigLIP2 + Voyage AI)          │
│     ├─ Color Embedding (Voyage 1024D) → Color Text          │
│     ├─ Texture Embedding (Voyage 1024D) → Finish/Texture    │
│     ├─ Material Embedding (Voyage 1024D) → Material Type    │
│     ├─ Style Embedding (Voyage 1024D) → Design Style        │
│     └─ Confidence: 0.75-0.90                                │
│                                                             │
│  3. Pattern Matching (Chunks)                               │
│     ├─ Regex patterns for technical specs                   │
│     ├─ NLP extraction from chunk text                       │
│     └─ Confidence: 0.60-0.80                                │
│                                                             │
│  4. Factory-Level Defaults                                  │
│     ├─ Global metadata from factory documents               │
│     ├─ Applied when product-specific data missing           │
│     └─ Confidence: 0.50-0.70                                │
│                                                             │
│  5. Manual Overrides (Admin)                                │
│     ├─ User-provided corrections                            │
│     └─ Confidence: 1.00                                     │
│                                                             │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│              METADATA CONSOLIDATION ENGINE                  │
├─────────────────────────────────────────────────────────────┤
│  • Merge metadata from all sources                          │
│  • Resolve conflicts using confidence scores                │
│  • Track extraction source for each field                   │
│  • Generate final product.metadata JSONB                    │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│                  FINAL PRODUCT METADATA                     │
├─────────────────────────────────────────────────────────────┤
│  {                                                          │
│    "color": "beige",                                        │
│    "finish": "matte",                                       │
│    "material": "ceramic",                                   │
│    "style": "modern minimalist",                            │
│    "slip_resistance": "R11",                                │
│    "_extraction_metadata": {                                │
│      "color": {                                             │
│        "source": "visual_embedding",                        │
│        "confidence": 0.88,                                  │
│        "alternatives": ["warm beige", "sand"]               │
│      },                                                     │
│      "slip_resistance": {                                   │
│        "source": "ai_text_extraction",                      │
│        "confidence": 0.95                                   │
│      }                                                      │
│    }                                                        │
│  }                                                          │
└─────────────────────────────────────────────────────────────┘

## Implementation Plan

### Phase 1: Embedding-to-Text Conversion Service

**File**: `mivaa-pdf-extractor/app/services/embedding_to_text_service.py`

**Purpose**: Convert specialized embeddings to textual metadata

**Method**: Use SigLIP's text-image matching in reverse:
1. Generate embedding for product image with text prompt "focus on color palette"
2. Compare against predefined color embeddings (database of color names)
3. Find top 3 matches with confidence scores
4. Return: `["beige", "warm tones", "sand"]` with scores `[0.92, 0.85, 0.78]`

**Predefined Vocabularies**:
- **Colors**: 50+ color names (beige, white, grey, black, blue, green, etc.)
- **Textures**: 30+ texture terms (matte, glossy, textured, smooth, rough, etc.)
- **Materials**: 40+ material types (ceramic, porcelain, stone, wood, metal, etc.)
- **Styles**: 25+ design styles (modern, rustic, industrial, minimalist, etc.)

### Phase 2: Multi-Source Metadata Consolidation

**File**: `mivaa-pdf-extractor/app/services/metadata_consolidation_service.py`

**Purpose**: Merge metadata from all sources with conflict resolution

**Algorithm**: The `consolidate_metadata(sources)` function receives a dictionary of source names to their extracted metadata dictionaries. For each metadata field, it collects all candidate values from all sources along with their confidence scores (determined by source type). The candidate with the highest confidence becomes the final value, with alternatives tracked. The output is a flat metadata dictionary plus `_extraction_metadata` tracking source, confidence, and alternatives for each field.

### Phase 3: Confidence Scoring System

**Confidence Levels by Source**:

| Source | Confidence Range | Use Case |
|--------|-----------------|----------|
| Manual Overrides | 1.00 | Admin corrections |
| AI Text Extraction (Claude/GPT) | 0.85-0.95 | Explicit text in PDF |
| Visual Embedding Analysis | 0.75-0.90 | Image-based inference |
| Pattern Matching | 0.60-0.80 | Regex/NLP from chunks |
| Factory Defaults | 0.50-0.70 | Fallback values |

**Confidence Modifiers**:
- **+0.05**: Multiple sources agree
- **-0.10**: Conflicting values from other sources
- **+0.10**: Validated against prototype (material_properties table)

### Phase 4: Integration into PDF Processing Pipeline

**Current Pipeline** (9 stages):
1. INITIALIZED
2. PDF_EXTRACTED
3. CHUNKS_CREATED
4. TEXT_EMBEDDINGS_GENERATED
5. IMAGES_EXTRACTED
6. IMAGE_EMBEDDINGS_GENERATED ← **Add embedding-to-text here**
7. PRODUCTS_DETECTED
8. PRODUCTS_CREATED ← **Add metadata consolidation here**
9. COMPLETED

**New Stage 6.5: EMBEDDING_TO_TEXT_CONVERSION**
- After image embeddings generated
- Convert specialized embeddings to text metadata
- Store in temporary metadata cache

**Enhanced Stage 8: PRODUCTS_CREATED**
- Collect metadata from all sources:
  1. Product discovery metadata (Stage 0)
  2. Dynamic metadata extraction (Stage 4)
  3. Embedding-to-text metadata (Stage 6.5)
  4. Pattern matching from chunks
  5. Factory defaults
- Consolidate using confidence scoring
- Save final metadata to products table

## Database Schema Changes

### New Table: `metadata_vocabulary`

A new `metadata_vocabulary` table stores: `id` (UUID), `field_name` (e.g., 'color', 'texture', 'material', 'style'), `value` (e.g., 'beige', 'matte', 'ceramic', 'modern'), `embedding` (HALFVEC(1024) — pre-computed Voyage `voyage-4` embedding, post-2026-05-04; was HALFVEC(768) SLIG/SigLIP2 pre-v2), `category` (e.g., 'warm_colors', 'neutral_colors'), and `synonyms` (TEXT array). Indexes are created on `field_name` and on the embedding column using `ivfflat` with `halfvec_cosine_ops`.

### Enhanced `products.metadata` Structure

The enriched metadata includes the core fields (color, finish, material, style, slip_resistance, fire_rating), plus an `_extraction_metadata` dictionary tracking source, confidence, alternatives, and extraction timestamp for each field, plus `_sources_used` (array of source names used) and `_overall_confidence` (float).

## Implementation Steps

### Step 1: Create Extraction Prompts in Database ✅

**Action**: Create AI prompts for embedding interpretation and metadata consolidation

**Prompts Created**:
1. **Embedding-to-Text Interpretation** (stage: image_analysis, category: embedding_to_text) — Contains vocabulary of 50+ colors, 30+ finishes, 40+ materials, 25+ styles. AI interprets embedding patterns and returns structured JSON with confidence scoring 0.60–1.00.

2. **Metadata Consolidation** (stage: entity_creation, category: metadata_consolidation) — Priority order: manual > AI text > visual > pattern > factory defaults. Agreement bonus: +0.05 when sources agree. Conflict penalty: -0.10 when sources disagree. Returns consolidated metadata with extraction tracking.

### Step 2: Implement Embedding-to-Text Service ✅

**File**: `mivaa-pdf-extractor/app/services/embedding_to_text_service.py`

**Architecture**: Prompt-based AI interpretation (not vocabulary similarity search)

**Key Methods**:
- `convert_embeddings_to_metadata(image_id, embeddings)` - Main conversion using AI
- `_load_prompt()` - Load prompt from database
- `_calculate_cost(usage)` - Track AI costs

**How It Works**:
1. Load prompt from `prompts` table (category: embedding_to_text)
2. Pass embedding data to Claude Opus 4.7
3. AI interprets embeddings using vocabulary guidelines in prompt
4. Returns structured JSON with primary/secondary values and confidence scores

### Step 3: Implement Metadata Consolidation Service ✅

**File**: `mivaa-pdf-extractor/app/services/metadata_consolidation_service.py`

**Architecture**: Prompt-based AI consolidation (not hardcoded rules)

**Key Methods**:
- `consolidate_metadata(product_id, sources, existing_metadata)` - Main consolidation using AI
- `_load_prompt()` - Load prompt from database
- `_calculate_cost(usage)` - Track AI costs

**How It Works**:
1. Load prompt from `prompts` table (category: metadata_consolidation)
2. Collect metadata from all 5 sources (manual, AI text, visual, pattern, factory)
3. Pass all sources to Claude Opus 4.7
4. AI intelligently merges with conflict resolution
5. Returns consolidated metadata with extraction tracking

### Step 4: Add visual_metadata Column to document_images ✅

**Migration**: Added JSONB column `visual_metadata` (default `{}`) to `document_images` to store AI-extracted metadata from embeddings. The structure contains per-field objects with `primary` value, `secondary` alternatives array, and `confidence` score.

### Step 5: Integrate into PDF Processing Pipeline ✅

**Stage 3.5: Embedding-to-Text Conversion** (added to stage_3_images.py)
- Runs after specialized embeddings are generated
- Fetches embeddings from VECS collections
- Calls `EmbeddingToTextService` to convert to text
- Saves results to `document_images.visual_metadata`

**Stage 4: Metadata Consolidation** (modified stage_4_products.py)
- Collects metadata from 3 sources:
  1. AI text extraction (from product discovery)
  2. Visual embeddings (from document_images.visual_metadata)
  3. Factory defaults (from catalog)
- Calls `MetadataConsolidationService` to merge intelligently
- Saves consolidated metadata to `products.metadata`

## Expected Results

### Before (Current System)

Product metadata only contains explicitly stated fields like designer, dimensions, and slip_resistance — missing color, finish, material, and style even though the visual embeddings for those properties exist.

### After (Multi-Source System)

Product metadata includes all the above plus visually-derived fields (color, finish, material, style, texture), each tracked in `_extraction_metadata` with their source and confidence, and an `_overall_confidence` summary score.

**Gained**: 5 additional metadata fields from visual analysis!

## Success Metrics

1. **Metadata Completeness**: 80%+ of products have color, finish, material, style
2. **Confidence Scores**: Average confidence > 0.85
3. **Search Accuracy**: Improved search results using visual metadata
4. **User Satisfaction**: Reduced manual metadata corrections

## Implementation Status

1. ✅ Create extraction prompts in database (Embedding-to-Text, Metadata Consolidation)
2. ✅ Implement EmbeddingToTextService (prompt-based AI interpretation)
3. ✅ Implement MetadataConsolidationService (prompt-based AI consolidation)
4. ✅ Add visual_metadata column to document_images table
5. ✅ Integrate Stage 3.5 (embedding-to-text conversion) into pipeline
6. ✅ Integrate metadata consolidation into Stage 4 (product creation)
7. ⏳ Test with Harmony PDF (14 products) - NEXT STEP
8. ⏳ Deploy to production

## Key Differences from Original Plan

**Original Plan**: Use vocabulary database with similarity search
**Actual Implementation**: Use AI with database prompts (follows platform standards)

**Why Changed**:
- Platform uses prompt-based architecture for ALL extraction
- AI interpretation is more flexible than hardcoded vocabulary
- Vocabulary is embedded in prompts, not separate database table
- Easier to customize and update (just edit prompts)
- Consistent with other extraction services

## Next Steps

1. **Test End-to-End** with Harmony PDF
   - Upload Harmony.pdf
   - Verify 14 products extracted
   - Check metadata completeness (color, finish, material, style)
   - Validate confidence scores
   - Review extraction tracking

2. **Monitor Performance**
   - AI call costs (Claude Opus 4.7)
   - Processing time impact
   - Memory usage

3. **Iterate on Prompts**
   - Refine vocabulary lists
   - Adjust confidence thresholds
   - Improve consolidation rules

