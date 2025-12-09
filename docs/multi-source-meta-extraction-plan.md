# Multi-Source Meta Extraction Strategy

## Overview

This plan outlines a comprehensive strategy for extracting metadata from **multiple sources** to ensure the highest quality and completeness of product metadata. The system will leverage:

1. **Text Extraction** from PDF content (AI-powered)
2. **Visual Analysis** from product images (5 specialized embeddings)
3. **Embedding-to-Text Conversion** (convert visual embeddings to searchable text)
4. **Pattern Matching** from document chunks
5. **Factory-Level Defaults** (fallback for missing data)

## Current System Architecture

### Embedding Types (6 Total)

1. **text_1536** - OpenAI text embedding (1536D)
2. **visual_512** - SigLIP visual embedding (512D, downsampled from 1152D)
3. **color_siglip_1152** - Text-guided color embedding (1152D)
4. **texture_siglip_1152** - Text-guided texture embedding (1152D)
5. **material_siglip_1152** - Text-guided material embedding (1152D)
6. **style_siglip_1152** - Text-guided style embedding (1152D)
7. **multimodal_2048** - Fused text+visual embedding (2048D)

### Text-Guided Prompts

```python
text_prompts = {
    "color": "focus on color palette and color relationships",
    "texture": "focus on surface patterns and texture details",
    "material": "focus on material type and physical properties",
    "style": "focus on design style and aesthetic elements"
}
```

## Problem Statement

**Current Issue**: Specialized embeddings (color, texture, material, style) are generated but **NOT converted to text metadata**. This means:
- ❌ Color embeddings exist but no "color: beige" in metadata
- ❌ Texture embeddings exist but no "finish: matte" in metadata
- ❌ Material embeddings exist but no "material: ceramic" in metadata
- ❌ Style embeddings exist but no "style: modern" in metadata

**Impact**: Search and filtering rely on text metadata, so visual information is not fully utilized.

## Proposed Solution: Multi-Source Meta Extraction

### Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    METADATA SOURCES                         │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  1. AI Text Extraction (Claude/GPT)                         │
│     ├─ Product Discovery (Stage 0)                          │
│     ├─ Dynamic Metadata Extractor (Stage 4)                 │
│     └─ Confidence: 0.85-0.95                                │
│                                                             │
│  2. Visual Embedding Analysis (SigLIP)                      │
│     ├─ Color Embedding → Color Text                         │
│     ├─ Texture Embedding → Finish/Texture Text              │
│     ├─ Material Embedding → Material Type Text              │
│     ├─ Style Embedding → Design Style Text                  │
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
```

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

**Algorithm**:
```python
def consolidate_metadata(sources: Dict[str, Dict]) -> Dict:
    """
    sources = {
        "ai_text": {"color": "beige", "finish": "matte"},
        "visual_embedding": {"color": "warm beige", "finish": "matte"},
        "pattern_matching": {"slip_resistance": "R11"},
        "factory_defaults": {"country_of_origin": "Spain"}
    }
    """
    consolidated = {}
    extraction_metadata = {}
    
    for field in all_fields:
        candidates = []
        for source_name, source_data in sources.items():
            if field in source_data:
                candidates.append({
                    "value": source_data[field],
                    "source": source_name,
                    "confidence": get_confidence(source_name, field)
                })
        
        if candidates:
            # Pick highest confidence
            best = max(candidates, key=lambda x: x["confidence"])
            consolidated[field] = best["value"]
            extraction_metadata[field] = {
                "source": best["source"],
                "confidence": best["confidence"],
                "alternatives": [c["value"] for c in candidates if c != best]
            }
    
    return {
        **consolidated,
        "_extraction_metadata": extraction_metadata
    }
```

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

```sql
CREATE TABLE metadata_vocabulary (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  field_name TEXT NOT NULL,  -- 'color', 'texture', 'material', 'style'
  value TEXT NOT NULL,        -- 'beige', 'matte', 'ceramic', 'modern'
  embedding VECTOR(1152),     -- Pre-computed SigLIP embedding
  category TEXT,              -- 'warm_colors', 'neutral_colors', etc.
  synonyms TEXT[],            -- ['sand', 'tan', 'cream'] for 'beige'
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_metadata_vocab_field ON metadata_vocabulary(field_name);
CREATE INDEX idx_metadata_vocab_embedding ON metadata_vocabulary
  USING ivfflat (embedding vector_cosine_ops);
```

### Enhanced `products.metadata` Structure

```json
{
  "color": "beige",
  "finish": "matte",
  "material": "ceramic",
  "style": "modern minimalist",
  "slip_resistance": "R11",
  "fire_rating": "A1",

  "_extraction_metadata": {
    "color": {
      "source": "visual_embedding",
      "confidence": 0.88,
      "alternatives": ["warm beige", "sand"],
      "extraction_timestamp": "2024-01-15T10:30:00Z"
    },
    "finish": {
      "source": "ai_text_extraction",
      "confidence": 0.92,
      "alternatives": [],
      "extraction_timestamp": "2024-01-15T10:25:00Z"
    },
    "slip_resistance": {
      "source": "ai_text_extraction",
      "confidence": 0.95,
      "alternatives": [],
      "extraction_timestamp": "2024-01-15T10:25:00Z"
    }
  },

  "_sources_used": [
    "ai_text_extraction",
    "visual_embedding",
    "pattern_matching"
  ],

  "_overall_confidence": 0.89
}
```

## Implementation Steps

### Step 1: Create Extraction Prompts in Database ✅

**Action**: Create AI prompts for embedding interpretation and metadata consolidation

**Prompts Created**:
1. **Embedding-to-Text Interpretation** (stage: image_analysis, category: embedding_to_text)
   - Vocabulary: 50+ colors, 30+ finishes, 40+ materials, 25+ styles
   - AI interprets embedding patterns and returns structured JSON
   - Confidence scoring: 0.60-1.00 based on clarity

2. **Metadata Consolidation** (stage: entity_creation, category: metadata_consolidation)
   - Priority order: manual > AI text > visual > pattern > factory defaults
   - Agreement bonus: +0.05 when sources agree
   - Conflict penalty: -0.10 when sources disagree
   - Returns consolidated metadata with extraction tracking

### Step 2: Implement Embedding-to-Text Service ✅

**File**: `mivaa-pdf-extractor/app/services/embedding_to_text_service.py`

**Architecture**: Prompt-based AI interpretation (not vocabulary similarity search)

**Key Methods**:
- `convert_embeddings_to_metadata(image_id, embeddings)` - Main conversion using AI
- `_load_prompt()` - Load prompt from database
- `_calculate_cost(usage)` - Track AI costs

**How It Works**:
1. Load prompt from `prompts` table (category: embedding_to_text)
2. Pass embedding data to Claude Sonnet 4.5
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
3. Pass all sources to Claude Sonnet 4.5
4. AI intelligently merges with conflict resolution
5. Returns consolidated metadata with extraction tracking

### Step 4: Add visual_metadata Column to document_images ✅

**Migration**: Added JSONB column to store AI-extracted metadata from embeddings

```sql
ALTER TABLE document_images
ADD COLUMN visual_metadata JSONB DEFAULT '{}'::jsonb;
```

**Structure**:
```json
{
  "color": {"primary": "beige", "secondary": ["warm tones"], "confidence": 0.88},
  "finish": {"primary": "matte", "secondary": [], "confidence": 0.85},
  "material": {"primary": "ceramic", "secondary": ["porcelain"], "confidence": 0.92},
  "style": {"primary": "modern minimalist", "secondary": ["contemporary"], "confidence": 0.80}
}
```

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

```json
{
  "name": "FOLD WHITE",
  "metadata": {
    "designer": "SG NY",
    "dimensions": ["15×38"],
    "slip_resistance": "R11"
  }
}
```

**Missing**: color, finish, material, style (even though embeddings exist!)

### After (Multi-Source System)

```json
{
  "name": "FOLD WHITE",
  "metadata": {
    "designer": "SG NY",
    "dimensions": ["15×38"],
    "slip_resistance": "R11",

    "color": "white",
    "finish": "matte",
    "material": "ceramic",
    "style": "modern minimalist",
    "texture": "smooth",

    "_extraction_metadata": {
      "color": {"source": "visual_embedding", "confidence": 0.92},
      "finish": {"source": "visual_embedding", "confidence": 0.88},
      "material": {"source": "ai_text_extraction", "confidence": 0.95},
      "style": {"source": "visual_embedding", "confidence": 0.85},
      "slip_resistance": {"source": "ai_text_extraction", "confidence": 0.95}
    },
    "_overall_confidence": 0.91
  }
}
```

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
   - AI call costs (Claude Sonnet 4.5)
   - Processing time impact
   - Memory usage

3. **Iterate on Prompts**
   - Refine vocabulary lists
   - Adjust confidence thresholds
   - Improve consolidation rules

