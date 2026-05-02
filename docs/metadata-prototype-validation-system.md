# Metadata Prototype Validation System

## Overview

The Metadata Prototype Validation System is a semantic validation system that standardizes AI-extracted material metadata using CLIP text embeddings. It eliminates inconsistent naming, enables fuzzy search, validates AI outputs, and improves search accuracy by comparing extracted values to prototype embeddings and standardizing them to canonical values.

### Key Features

- Uses `material_properties` table as single source of truth
- Integrates with all search endpoints (multi-vector, semantic, material, etc.)
- Enabled by default in multi-vector search (recommended strategy)
- Non-breaking integration with existing DynamicMetadataExtractor
- Semantic matching capabilities (e.g., "shiny" → "glossy")

### Search Integration

- **Multi-vector search**: Fuzzy metadata matching + validation scoring (enabled by default)
- **Material property search**: Semantic value matching
- **All strategies search**: Validated filters passed to all strategies
- **Multimodal search**: Metadata validation scoring
- **Material visual search**: Prototype-based filtering

---

## 🎯 Overview

The **Metadata Prototype Validation System** enhances MIVAA's existing dynamic metadata extraction by adding **semantic validation** using CLIP text embeddings. This ensures that the vision model's free-text metadata extractions (Claude Opus 4.7 vision_analysis via Anthropic tool use, sole vision pass post-2026-05-01 — schema-locked via `VisionAnalysis` Pydantic + `VISION_ANALYSIS_TOOL`; pre-2026-05-01 was Qwen3-VL with Claude fallback, retired because the Qwen HF endpoint had been 404-ing for months) are standardized to consistent, validated property values. Note: with Anthropic tool use the schema is hard-enforced at the model boundary, so this validator now mainly catches lexical drift on enum-like fields rather than malformed JSON.

---

## 🔄 Dynamic Custom Metadata Integration

### How Current System Works (Preserved)

**DynamicMetadataExtractor** discovers metadata in 3 tiers:

1. **Critical Metadata** (Always extracted):
   - `material_category`, `factory_name`, `factory_group_name`
   - Stored directly in `products.metadata` JSONB
   - Required for product classification

2. **Discovered Metadata** (200+ dynamic fields):
   - AI discovers ANY metadata present in PDF
   - Organized into 9 categories:
     - `material_properties`: composition, texture, finish, pattern, weight, density
     - `dimensions`: length, width, height, thickness, diameter, size
     - `appearance`: color, color_code, gloss_level, sheen, transparency
     - `performance`: water_resistance, fire_rating, slip_resistance, wear_rating
     - `application`: recommended_use, installation_method, room_type, traffic_level
     - `compliance`: certifications, standards, eco_friendly, sustainability_rating
     - `design`: designer, studio, collection, series, aesthetic_style
     - `manufacturing`: factory, manufacturer, country_of_origin
     - `commercial`: pricing, availability, supplier, sku, warranty
   - Stored in `products.metadata` JSONB
   - **NO validation** - free text values accepted as-is

3. **Unknown Metadata** (Custom fields):
   - AI finds metadata NOT in predefined categories
   - Stored in `products.metadata` with `_custom_` prefix
   - Examples: `_custom_installation_time`, `_custom_warranty_years`, `_custom_special_coating`
   - Completely dynamic - no schema required

**Storage Example**: Products have a `metadata` JSONB field containing critical fields (e.g., `material_category: "ceramic_tile"`, `factory_name: "Castellón Ceramics"`), discovered fields (e.g., `finish: "shiny"` — inconsistent, should be "glossy"), and custom fields with `_custom_` prefix. This illustrates the problem the validation system solves.

### How New System Enhances This (Non-Breaking)

**MetadataPrototypeValidator** adds a validation layer WITHOUT changing storage:

1. **Check if property has prototypes**: Query the `material_properties` table. If the property has `prototype_descriptions`, validate the extracted value against them. Otherwise, store as-is (custom metadata).

2. **Validate against prototypes** (if they exist): Generate a CLIP embedding for the extracted value, compare it to the prototype embedding using cosine similarity. If similarity exceeds 0.80, return the standardized prototype value with `validated: True` and the confidence score. Otherwise, keep the original with `validated: False`.

3. **Track validation metadata**: The `metadata._validation` dictionary stores per-property validation details including `original_value`, `validated_value`, `confidence`, `prototype_matched`, and `timestamp`.

**Key Benefits**:
- Custom metadata still works (no validation required)
- Predefined properties get validated (if prototypes exist)
- Validation is optional - system works without it
- Admin can promote custom properties to validated properties later

---

## 📊 Identifying New Keywords for Prototypes

### Problem Statement

**Question**: How do we identify when new prototype values should be added?

**Example Scenario**:
- System has prototypes for `finish`: glossy, matte, satin, textured, brushed
- AI extracts "brushed metal" from 23 different products
- Should "brushed metal" be added as a new prototype value?

### Solution: Frequency Analysis + Admin Review

#### Phase 1: Automatic Frequency Tracking

Track all extracted values for each property using a `metadata_value_frequency` table with columns: `property_key`, `extracted_value`, `frequency_count`, `first_seen_at`, `last_seen_at`, `workspace_ids` (UUID array), `product_ids` (UUID array), and `validation_status` (unvalidated/validated/rejected). A unique constraint on `(property_key, extracted_value)` prevents duplicates. After each metadata extraction, an upsert increments the frequency count and appends the workspace and product IDs.

#### Phase 2: Admin Review Dashboard

**Admin Panel** (`/admin/metadata-prototypes`) shows:

┌─────────────────────────────────────────────────────────────────┐
│ Metadata Prototype Management                                   │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│ Property: finish                                                 │
│ Current Prototypes: 9 values (glossy, matte, satin, ...)       │
│                                                                  │
│ Suggested Additions (frequency > 10):                           │
│                                                                  │
│ ┌──────────────────────────────────────────────────────────┐   │
│ │ "brushed metal" (23 occurrences)                         │   │
│ │ Similarity to existing: brushed (0.78)                   │   │
│ │ Products: HAR-001, HAR-002, ...                          │   │
│ │ [Add as New] [Merge with "brushed"] [Ignore]            │   │
│ └──────────────────────────────────────────────────────────┘   │
│                                                                  │
│ ┌──────────────────────────────────────────────────────────┐   │
│ │ "semi-gloss" (18 occurrences)                            │   │
│ │ Similarity to existing: satin (0.87), glossy (0.72)      │   │
│ │ Products: CER-045, CER-046, ...                          │   │
│ │ [Add as New] [Merge with "satin"] [Ignore]              │   │
│ └──────────────────────────────────────────────────────────┘   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘

The API endpoint `GET /api/admin/metadata-prototypes/suggestions` queries unvalidated values with frequency >= a threshold, calculates CLIP embedding similarity against existing prototypes for each suggestion, and returns enriched suggestions ordered by frequency.

#### Phase 3: Admin Actions

**Action 1: Add as New Prototype** — `POST /api/admin/metadata-prototypes/add` updates the `prototype_descriptions` JSONB on the `material_properties` row, regenerates the CLIP embedding for the property, marks the value as validated in the frequency table, and queues a re-validation job for all affected products.

**Action 2: Merge with Existing** — `POST /api/admin/metadata-prototypes/merge` adds the extracted value as a variation of an existing prototype, regenerates the embedding, updates all products that had the extracted value to use the target prototype, and marks the value as validated.

**Action 3: Ignore** — `POST /api/admin/metadata-prototypes/ignore` marks the suggestion as rejected so it won't appear in the dashboard again.

---

## 🎯 ANSWERS TO KEY QUESTIONS

### Question 1: How do we track user search patterns to identify missing prototypes?

**Answer**: Implemented comprehensive search query tracking system.

**Architecture**:

1. A `search_query_tracking` table records every search with: `workspace_id`, `query_text`, `query_metadata` (JSONB, e.g., `{"finish": "shiny"}`), `search_type`, `result_count`, `zero_results` flag, `searched_terms` array, `matched_terms` array (those that validated), `unmatched_terms` array (those that didn't), `validation_results` JSONB, and `response_time_ms`.

2. An `unmatched_term_frequency` table aggregates patterns with: `term`, `property_key`, `frequency_count`, `workspace_ids`, `similar_prototypes` JSONB (e.g., `[{"prototype": "glossy", "similarity": 0.78}]`), and `review_status` (pending/approved/rejected).

**How It Works**: The `multi_vector_search` function automatically tracks each query asynchronously. The tracker validates each filter term against prototypes, identifies unmatched terms, updates frequency counts, and flags zero-result queries.

**Admin Dashboard** (`/admin/prototype-suggestions`):

┌─────────────────────────────────────────────────────────────┐
│ Unmatched Terms Requiring Review                            │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│ Property: finish                                             │
│                                                              │
│ ┌────────────────────────────────────────────────────────┐  │
│ │ "shiny" (47 searches, 0 results)                       │  │
│ │ Similar to: glossy (0.92), polished (0.85)             │  │
│ │ Workspaces: 12 different workspaces                    │  │
│ │ [Add as "glossy" variation] [Create new prototype]    │  │
│ └────────────────────────────────────────────────────────┘  │
│                                                              │
│ ┌────────────────────────────────────────────────────────┐  │
│ │ "semi-gloss" (23 searches, 0 results)                  │  │
│ │ Similar to: satin (0.87), glossy (0.72)                │  │
│ │ [Add as "satin" variation] [Create new prototype]     │  │
│ └────────────────────────────────────────────────────────┘  │
│                                                              │
└─────────────────────────────────────────────────────────────┘

**Benefits**:
- Identifies missing prototypes from real user behavior
- Prioritizes by frequency (most-searched terms first)
- Shows semantic similarity to existing prototypes
- Enables data-driven prototype expansion

---

### Question 2: Is metadata validation enabled by default in multi-vector search?

**Answer**: YES - Enabled by default with automatic scoring boost.

**Implementation**: In `rag_service.py`, the `multi_vector_search` function automatically applies validation scoring when `material_filters` and results are both present. It loads the `MetadataPrototypeValidator`, calculates a metadata boost (up to +20% of the original score) for each result based on how well the product's validated metadata matches the query filters, and re-sorts results by their enhanced scores.

**Scoring Formula**: For each query filter field and value, the system checks whether the product has validation metadata. If both are validated and match the same prototype, the field scores 1.0. If they're different prototypes, cosine similarity determines a partial score (if > 0.70). Unvalidated product values receive an exact-match score of 0.8 or a fuzzy match with 0.8× penalty. Unvalidated properties use exact match only. The per-field scores are averaged and multiplied by 0.2 to produce the final boost factor.

**Example**:

Query: `{"finish": "shiny", "slip_resistance": "R-11"}`

**Product A** (validated): `finish: "glossy"` (validated from "shiny", confidence 0.92), `slip_resistance: "R11"` (validated from "R-11", confidence 1.0). Metadata boost: (0.92 + 1.0) / 2 = 0.96. Final score: 0.85 × 1.192 = **1.013** ✅

**Product B** (unvalidated): `finish: "shiny surface"`, `slip_resistance: "R-11"`. Metadata boost: 0.0. Final score: 0.85 × 1.0 = **0.85** ❌

**Result**: Product A ranks 19% higher!

**Configuration**:
- Enabled by default (no flag needed)
- Confidence threshold: 0.80
- Max boost: 20% of original score
- Graceful fallback if validation fails

---

### Question 3: How does this work with dynamic property creation?

**Answer**: Fully integrated - new properties automatically get validation support.

**Flow**:

┌─────────────────────────────────────────────────────────────┐
│ 1. AI Discovers New Metadata Field                          │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│ DynamicMetadataExtractor finds:                             │
│   "installation_time": "2 hours"                             │
│                                                              │
│ This field is NOT in predefined categories                  │
│ → Classified as "unknown" metadata                          │
│ → Stored with _custom_ prefix                               │
│                                                              │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ 2. Auto-Create material_properties Entry                    │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│ _ensure_properties_exist() automatically creates:           │
│                                                              │
│ INSERT INTO material_properties (                           │
│   property_key: "_custom_installation_time",                │
│   name: "Installation Time",                                │
│   data_type: "string",                                      │
│   is_searchable: true,                                      │
│   is_filterable: true,                                      │
│   is_ai_extractable: true,                                  │
│   category: "custom",                                       │
│   prototype_descriptions: NULL,  ← No prototypes yet        │
│   text_embedding_512: NULL                                  │
│ )                                                            │
│                                                              │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ 3. Property Stored Without Validation (Initially)           │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│ products.metadata = {                                        │
│   "_custom_installation_time": "2 hours",                   │
│   "_validation": {}  ← No validation (no prototypes)        │
│ }                                                            │
│                                                              │
│ Search behavior:                                             │
│ - Exact match only (no semantic matching)                   │
│ - No validation boost                                       │
│ - Still searchable and filterable                           │
│                                                              │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ 4. Frequency Tracking Identifies Pattern                    │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│ After 50 products extracted with this field:                │
│                                                              │
│ unmatched_term_frequency:                                   │
│   term: "2 hours" (frequency: 23)                           │
│   term: "1 hour" (frequency: 15)                            │
│   term: "3-4 hours" (frequency: 12)                         │
│   property_key: "_custom_installation_time"                 │
│                                                              │
│ Admin sees suggestion:                                       │
│ "Add prototypes for _custom_installation_time?"             │
│                                                              │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ 5. Admin Adds Prototypes                                    │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│ Admin creates prototypes:                                    │
│   "quick": ["1 hour", "fast", "quick install"]              │
│   "standard": ["2 hours", "2-3 hours", "normal"]            │
│   "extended": ["3-4 hours", "4+ hours", "complex"]          │
│                                                              │
│ System generates 512D CLIP embeddings                       │
│                                                              │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ 6. Future Extractions Get Validated                         │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│ Next PDF extraction:                                         │
│   AI extracts: "fast installation"                          │
│   Validator matches: "quick" (confidence 0.89)              │
│                                                              │
│ products.metadata = {                                        │
│   "_custom_installation_time": "quick",  ← Standardized!    │
│   "_validation": {                                           │
│     "_custom_installation_time": {                          │
│       "original_value": "fast installation",                │
│       "validated_value": "quick",                           │
│       "confidence": 0.89,                                   │
│       "prototype_matched": true                             │
│     }                                                        │
│   }                                                          │
│ }                                                            │
│                                                              │
│ Search now supports:                                         │
│ - Semantic matching ("fast" finds "quick")                  │
│ - Validation boost in scoring                               │
│ - Consistent terminology                                    │
│                                                              │
└─────────────────────────────────────────────────────────────┘

**Key Points**:

1. **Automatic Property Creation**: Every discovered field gets a `material_properties` entry. No manual intervention needed. Enables future prototype addition.

2. **Graceful Degradation**: Properties without prototypes still work (exact match only). No validation errors or failures. System remains functional.

3. **Progressive Enhancement**: Start with no prototypes (exact match), add prototypes when patterns emerge, automatically upgrade to semantic matching.

4. **Data-Driven Workflow**: Frequency tracking identifies candidates, admin reviews and approves, system learns from real usage.

**Example Timeline**:

Day 1:  AI discovers "_custom_warranty_years"
        → Auto-created in material_properties (no prototypes)
        → Stored as-is: "10 years", "5 years", "lifetime"

Day 30: Frequency analysis shows:
        → "10 years" (45 occurrences)
        → "5 years" (32 occurrences)
        → "lifetime" (18 occurrences)

Day 31: Admin adds prototypes:
        → "standard": ["5 years", "5-year", "five years"]
        → "extended": ["10 years", "10-year", "decade"]
        → "lifetime": ["lifetime", "permanent", "forever"]

Day 32: New extractions get validated:
        → "5-year warranty" → "standard" (confidence 0.95)
        → "decade coverage" → "extended" (confidence 0.88)

---

## 🏗️ Architecture

### Integration with Existing System

┌─────────────────────────────────────────────────────────────────────┐
│ EXISTING: PDF Processing Pipeline (UNCHANGED)                       │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  Stage 0A: Product Discovery                                        │
│  └── Discover products with basic metadata                          │
│                                                                      │
│  Stage 0B: Metadata Extraction (DynamicMetadataExtractor)           │
│  └── Extract 200+ fields across 9 categories                        │
│      Returns critical metadata and discovered metadata              │
│                                                                      │
├─────────────────────────────────────────────────────────────────────┤
│ NEW: Prototype Validation Layer (ADDED)                             │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  Stage 0C: Metadata Validation (MetadataPrototypeValidator)         │
│  └── Validate extracted metadata against prototypes                 │
│      Input: {"finish": "glossy", "slip_resistance": "R11"}          │
│      Process:                                                        │
│        1. Generate CLIP embedding for "glossy"                      │
│        2. Compare to finish prototypes (glossy, matte, satin)       │
│        3. Return best match with confidence                         │
│      Output: validated value, validated flag, confidence score      │
│                                                                      │
│  Stage 1-8: Continue as normal (UNCHANGED)                          │
│  └── Image extraction, embeddings, chunking, etc.                   │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘

### Key Principle: **NON-BREAKING ADDITION**

**Existing functionality preserved:**
- DynamicMetadataExtractor continues to work exactly as before
- All 200+ metadata fields still extracted
- Confidence scores still calculated
- Manual overrides still supported

**New validation layer added:**
- Runs AFTER extraction, BEFORE database storage
- Validates and standardizes property values
- Adds validation metadata without changing structure
- Falls back gracefully if validation fails

---

## Implementation Status

### Core Features
- Database schema with 3 new columns
- 36 material properties populated
- 52 prototype values defined for 6 properties
- 512D CLIP embeddings generated
- MetadataPrototypeValidator service created
- Integrated into PDF processing pipeline

### Search Integration
- Multi-vector search with metadata validation scoring (enabled by default)
- Search query tracking for zero-result discovery
- Unmatched term frequency analysis
- Automatic prototype suggestions

### Dynamic Property Creation
- Auto-create material_properties entries for new discovered fields
- Integrated with DynamicMetadataExtractor
- Support for custom fields with _custom_ prefix

---

## 🔍 Relevancy Scoring Enhancement

### Current Search Scoring (Before Prototype Validation)

The current scoring formula weights: 40% text similarity, 30% visual similarity, 20% metadata match (exact), 10% confidence score.

**Problem**: Metadata matching is binary (exact match or no match)
- "shiny" doesn't match "glossy" (even though they're semantically similar)
- "R-11" doesn't match "R11" (formatting variation)
- "ceramic tiles" doesn't match "ceramic" (plural variation)

### Enhanced Scoring with Prototype Validation

For each query filter field, the system checks whether the property has prototype validation. If so, and the product's value is prototype-matched, it scores 1.0 for an exact prototype match or a cosine similarity score (if > 0.70) for a different prototype. Unvalidated product values receive fuzzy match scores with a penalty. Properties without prototypes use exact match only. Scores are averaged across all query fields to produce `metadata_prototype_match`.

The new scoring formula weights: 30% text similarity, 30% visual similarity, 20% metadata_prototype_match (NEW), 10% metadata_match (reduced, exact fallback), 10% confidence score.

**Benefits**:
1. **Semantic Matching**: "shiny" query finds "glossy" products (0.92 similarity)
2. **Fuzzy Matching**: "R-11" query finds "R11" products (formatting normalized)
3. **Validation Boost**: Products with validated metadata rank higher
4. **Consistent Terminology**: All products use standardized values

### Example Scoring Comparison

**Query**: `{"finish": "shiny", "slip_resistance": "R-11"}`

**Product A** (validated metadata): `finish: "glossy"` validated from "shiny" at confidence 0.92, `slip_resistance: "R11"` validated from "R-11" at confidence 1.0. **Metadata Score**: (0.92 + 1.0) / 2 = 0.96 ✅ High score

**Product B** (unvalidated metadata): `finish: "shiny surface"` not validated, `slip_resistance: "R-11"` not validated. **Metadata Score**: approximately 0.28 ❌ Low score

**Result**: Product A ranks significantly higher despite not having exact text match!

### Integration Points

**1. Multi-Vector Search** (`rag_service.py`): Results are scored using `_score_with_metadata_validation` with `enable_prototype_matching=True` (enabled by default).

**2. Material Visual Search** (`material_visual_search_service.py`, line 411): The category filter value is validated against prototypes before being used to filter products.

**3. Semantic Search** (`rag_service.py`): Each result's score is multiplied by `(1.0 + validation_boost * 0.2)` where `validation_boost` is calculated from the product's validation metadata.

---

## 📊 Database Schema

### material_properties Table (ENHANCED)

**Existing Columns** (UNCHANGED): `id`, `property_key` (unique), `name`, `display_name`, `description`, `data_type` (string/number/enum/boolean), `validation_rules` (JSONB), `is_searchable`, `is_filterable`, `is_ai_extractable`.

**NEW Columns** (ADDED):
- `prototype_descriptions` — JSONB mapping value names to arrays of 3-5 prototype descriptions. For example, the "finish" property maps "glossy" to descriptions like "High gloss reflective surface, Polished shiny appearance, Mirror-like finish".
- `text_embedding_512` — VECTOR(512) containing the averaged CLIP embedding for all prototypes of that property
- `prototype_updated_at` — TIMESTAMP of last update

A vector index using `ivfflat` with `vector_cosine_ops` is created on `text_embedding_512` for fast similarity search.

---

## 🔄 How Prototype Validation Works

### Step-by-Step Process

**1. Vision Model Extracts Structured Values**: The vision model (Claude Opus 4.7 via Anthropic tool use, sole vision pass post-2026-05-01; pre-2026-05-01 was Qwen3-VL, retired) produces structured property values such as `finish: "glossy"` and `pattern: "marble-like veining"`. With tool use the JSON shape is hard-enforced — the validator below mainly normalizes free-text values to a known prototype.

**2. Prototype Validator Processes Each Field**: The `MetadataPrototypeValidator.validate_property(property_key, extracted_value)` method is called for each field. It returns the best-matching prototype value, a `validated` boolean, a `confidence` score, and the similarity scores against all prototypes.

**3. Validation Algorithm**: A CLIP embedding is generated for the extracted value. The property's prototypes are retrieved from the database. Cosine similarity is computed between the extracted embedding and each prototype embedding. The best match is selected; if its similarity exceeds 0.80, the prototype value is returned as validated, otherwise the original value is kept.

**4. Store Validated Metadata**: The product metadata is saved with both validated values and a `_validation_metadata` dictionary tracking which properties were validated and at what confidence.

---

## 🔍 Integration with Search

### Enhanced Search Capabilities

**1. Exact Metadata Filtering (EXISTING - UNCHANGED)**: Search products by exact metadata values using `POST /api/search/products` with a `filters` object (e.g., `{"metadata.finish": "glossy", "metadata.slip_resistance": "R11"}`).

**2. Semantic Metadata Search (NEW - ADDED)**: Search using natural language via `POST /api/search/products/semantic` with `use_metadata_prototypes: true`. The system generates CLIP embeddings for query terms (e.g., "shiny" → matches "glossy" prototype at 0.89), then boosts products whose validated metadata matches the inferred prototypes.

**3. Metadata Similarity Scoring (NEW - ADDED)**: The combined score formula now includes a 20% weight for `metadata_prototype_match` alongside text similarity (40%), visual similarity (30%), and confidence score (10%).

### Search Enhancement Benefits

**Better Fuzzy Matching**: "shiny" → "glossy", "non-slip" → "R11"
**Standardized Filters**: All variations map to same validated value
**Confidence Boosting**: High-confidence validated metadata ranks higher
**Semantic Understanding**: Natural language queries match technical terms

---

## 📋 Property Prototypes Definition

### Core Material Properties

**material_type** (Primary classification) has prototypes for: "ceramic" (glazed surfaces, interior applications), "marble" (natural stone with veining, polished high gloss), "porcelain" (high density, low water absorption, vitrified), "wood" (natural grain, hardwood flooring, organic texture), and "granite" (speckled appearance, crystalline structure, exceptional hardness). Each prototype value has 3 descriptive sentences for averaging.

**finish** (Surface treatment) has prototypes for: "glossy" (high gloss reflective surface, mirror-like quality, brilliant shine), "matte" (non-reflective flat surface, no shine, ideal for hiding imperfections), and "satin" (semi-gloss with subtle sheen, between matte and glossy, soft luster).

**slip_resistance** (Safety rating) has prototypes for R9 (low, dry interior areas), R10 (medium, wet areas/bathrooms), R11 (high, commercial wet areas), and R12 (very high, industrial/outdoor). Each has 3 descriptive sentences.

---

## Technical Implementation

### Database Schema

Three new columns are added to `material_properties`: `prototype_descriptions` (JSONB, default `{}`), `text_embedding_512` (VECTOR(512)), and `prototype_updated_at` (TIMESTAMP). A vector index using `ivfflat` with `vector_cosine_ops` is created on `text_embedding_512`.

### Property Population

The `material_properties` table is populated with 50+ meta fields organized into categories: Material Properties, Dimensions, Appearance, Performance, Application, Compliance, Design, Manufacturing, and Commercial.

### Prototype Definitions

A `PROPERTY_PROTOTYPES` dictionary maps property keys to value names, each with 3-5 descriptive sentences. For example, `material_type` → `ceramic` → list of 3 descriptions. This dictionary is used to populate the database.

### Embedding Generation

For each property/value combination, embeddings are generated for all descriptions and then averaged to produce a single representative embedding that is stored in the database.

### Validation Service

The `MetadataPrototypeValidator` class provides three main methods: `validate_property(property_key, extracted_value)` for single-field validation, `validate_metadata(metadata)` for batch validation, and `get_property_prototypes(property_key)` for inspection. The validator generates CLIP embeddings for extracted values, compares them against all prototype embeddings for the property, returns the best match with confidence, uses a 0.80 confidence threshold, and falls back to the original value if confidence is below threshold.

### Pipeline Integration

After metadata extraction, the `MetadataPrototypeValidator` is called to validate the extracted values. The validated results are merged with validation tracking metadata before being stored in the database.

### Search Integration

The system integrates prototype validation into all search endpoints:

1. `/api/rag/search?strategy=multi_vector` (PRIMARY - enabled by default)
2. `/api/rag/search?strategy=material`
3. `/api/rag/search?strategy=all`
4. `/api/search/multimodal`
5. `/api/search/material-visual`

In multi-vector search, filter values are validated against prototypes before building SQL conditions, and similar values (similarity > 0.7) are also included in the match. The combined score is recalculated to include a 10% weight for the metadata validation match score.

---

## Benefits

### For Metadata Extraction
- **Standardization**: Vision model's free text (Claude Opus 4.7 via Anthropic tool use post-2026-05-01; Qwen3-VL retired) → validated property values
- **Consistency**: Same material gets same label across PDFs
- **Validation**: Prevents hallucinations and invalid values
- **Confidence**: Semantic similarity scores for each validation

### For Search
- **Better Matching**: "shiny" finds "glossy" products
- **Fuzzy Filters**: Variations map to standard values
- **Semantic Search**: Natural language queries work better
- **Ranking**: Validated metadata boosts search scores

### For System Architecture
- **Single Source of Truth**: `material_properties` table for everything
- **No Duplication**: Categories merged into meta system
- **Extensible**: Add new properties without code changes
- **Non-Breaking**: Existing functionality preserved

---

## 🔧 API Endpoints

### Validation Endpoints (NEW)

**Populate Property Prototypes** — `POST /api/metadata/properties/populate-prototypes` with optional `property_key` (specific property) and `regenerate` (boolean) fields.

**Validate Metadata** — `POST /api/metadata/validate` with a `metadata` object containing property key-value pairs. Returns a `validated_metadata` object where each field has `value`, `validated` (boolean), and `confidence`.

**Get Property Prototypes** — `GET /api/metadata/properties/{property_key}/prototypes` returns the property's `prototypes` dictionary mapping value names to their description arrays.

---

## 📝 Notes

- **Backward Compatibility**: All existing metadata extraction continues to work
- **Gradual Rollout**: Prototypes can be added incrementally (start with top 20 properties)
- **Fallback Logic**: If validation fails, original extracted value is preserved
- **Admin Control**: Prototypes can be edited via admin panel
- **Performance**: CLIP embedding generation cached, validation is fast (<100ms)

