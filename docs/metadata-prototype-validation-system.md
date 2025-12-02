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

The **Metadata Prototype Validation System** enhances MIVAA's existing dynamic metadata extraction by adding **semantic validation** using CLIP text embeddings. This ensures that Llama Vision's free-text metadata extractions are standardized to consistent, validated property values.

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

**Storage Example**:
```json
{
  "id": "prod-123",
  "name": "NOVA Ceramic Tile",
  "metadata": {
    // Critical
    "material_category": "ceramic_tile",
    "factory_name": "Castellón Ceramics",

    // Discovered (predefined categories)
    "finish": "shiny",  // ❌ Inconsistent - should be "glossy"
    "slip_resistance": "R11",
    "color": "beige",
    "dimensions": "15×38",

    // Custom (discovered by AI, not in predefined list)
    "_custom_installation_time": "2 hours",
    "_custom_warranty_years": "10",
    "_custom_special_coating": "anti-bacterial"
  }
}
```

### How New System Enhances This (Non-Breaking)

**MetadataPrototypeValidator** adds validation layer WITHOUT changing storage:

1. **Check if property has prototypes**:
   ```python
   # Query material_properties table
   property = await db.material_properties.get(property_key="finish")

   if property and property.prototype_descriptions:
       # Property has prototypes → validate
       validated_value = await validate_against_prototypes(
           property_key="finish",
           extracted_value="shiny",
           prototype_embedding=property.text_embedding_512
       )
   else:
       # No prototypes → store as-is (custom metadata)
       validated_value = extracted_value
   ```

2. **Validate against prototypes** (if they exist):
   ```python
   # Generate embedding for extracted value
   value_embedding = await generate_clip_embedding("shiny")

   # Compare to prototype embedding
   similarity = cosine_similarity(value_embedding, prototype_embedding)

   if similarity > 0.80:
       # High confidence → use prototype value
       return {
           "value": "glossy",  # Standardized
           "validated": True,
           "confidence": 0.92,
           "original_value": "shiny"
       }
   else:
       # Low confidence → keep original
       return {
           "value": "shiny",
           "validated": False,
           "confidence": 0.65,
           "original_value": "shiny"
       }
   ```

3. **Track validation metadata**:
   ```json
   {
     "metadata": {
       // Validated properties (standardized)
       "finish": "glossy",  // ✅ Validated: "shiny" → "glossy"
       "slip_resistance": "R11",  // ✅ Validated: exact match

       // Custom properties (no validation)
       "_custom_installation_time": "2 hours",
       "_custom_warranty_years": "10",

       // Validation tracking
       "_validation": {
         "finish": {
           "original_value": "shiny",
           "validated_value": "glossy",
           "confidence": 0.92,
           "prototype_matched": true,
           "timestamp": "2024-01-15T10:30:00Z"
         },
         "slip_resistance": {
           "original_value": "R11",
           "validated_value": "R11",
           "confidence": 1.0,
           "prototype_matched": true,
           "timestamp": "2024-01-15T10:30:00Z"
         }
       }
     }
   }
   ```

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

Track all extracted values for each property:

```sql
-- New table for tracking metadata value frequency
CREATE TABLE metadata_value_frequency (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    property_key VARCHAR(100) NOT NULL,
    extracted_value VARCHAR(500) NOT NULL,
    frequency_count INT DEFAULT 1,
    first_seen_at TIMESTAMP DEFAULT NOW(),
    last_seen_at TIMESTAMP DEFAULT NOW(),
    workspace_ids UUID[],  -- Which workspaces use this value
    product_ids UUID[],    -- Which products have this value
    validation_status VARCHAR(50) DEFAULT 'unvalidated',  -- 'validated', 'unvalidated', 'rejected'

    UNIQUE(property_key, extracted_value)
);

CREATE INDEX idx_metadata_frequency_property ON metadata_value_frequency(property_key);
CREATE INDEX idx_metadata_frequency_count ON metadata_value_frequency(frequency_count DESC);
```

**Automatic Updates**:
```python
# After metadata extraction, track frequency
async def track_metadata_frequency(property_key: str, value: str, product_id: str, workspace_id: str):
    await db.execute("""
        INSERT INTO metadata_value_frequency (property_key, extracted_value, workspace_ids, product_ids)
        VALUES ($1, $2, ARRAY[$3], ARRAY[$4])
        ON CONFLICT (property_key, extracted_value)
        DO UPDATE SET
            frequency_count = metadata_value_frequency.frequency_count + 1,
            last_seen_at = NOW(),
            workspace_ids = array_append(metadata_value_frequency.workspace_ids, $3),
            product_ids = array_append(metadata_value_frequency.product_ids, $4)
    """, property_key, value, workspace_id, product_id)
```

#### Phase 2: Admin Review Dashboard

**Admin Panel** (`/admin/metadata-prototypes`) shows:

```
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
```

**API Endpoint**:
```python
@router.get("/api/admin/metadata-prototypes/suggestions")
async def get_prototype_suggestions(
    property_key: Optional[str] = None,
    min_frequency: int = 10
):
    """Get suggested prototype additions based on frequency analysis."""

    # Query unvalidated values with high frequency
    suggestions = await db.execute("""
        SELECT
            mf.property_key,
            mf.extracted_value,
            mf.frequency_count,
            mf.product_ids,
            mp.name as property_name,
            mp.prototype_descriptions
        FROM metadata_value_frequency mf
        JOIN material_properties mp ON mp.property_key = mf.property_key
        WHERE mf.frequency_count >= $1
          AND mf.validation_status = 'unvalidated'
          AND ($2 IS NULL OR mf.property_key = $2)
        ORDER BY mf.frequency_count DESC
    """, min_frequency, property_key)

    # For each suggestion, calculate similarity to existing prototypes
    enriched_suggestions = []
    for suggestion in suggestions:
        # Generate embedding for suggested value
        value_embedding = await generate_clip_embedding(suggestion.extracted_value)

        # Compare to existing prototypes
        similarities = []
        for prototype_value in suggestion.prototype_descriptions.keys():
            prototype_embedding = await generate_clip_embedding(prototype_value)
            similarity = cosine_similarity(value_embedding, prototype_embedding)
            similarities.append({
                "prototype": prototype_value,
                "similarity": similarity
            })

        enriched_suggestions.append({
            **suggestion,
            "similar_prototypes": sorted(similarities, key=lambda x: x["similarity"], reverse=True)[:3]
        })

    return enriched_suggestions
```

#### Phase 3: Admin Actions

**Action 1: Add as New Prototype**
```python
@router.post("/api/admin/metadata-prototypes/add")
async def add_prototype_value(
    property_key: str,
    prototype_value: str,
    variations: List[str]
):
    """Add new prototype value to property."""

    # 1. Update material_properties.prototype_descriptions
    await db.execute("""
        UPDATE material_properties
        SET prototype_descriptions = jsonb_set(
            COALESCE(prototype_descriptions, '{}'::jsonb),
            ARRAY[$2],
            to_jsonb($3::text[])
        ),
        prototype_updated_at = NOW()
        WHERE property_key = $1
    """, property_key, prototype_value, variations)

    # 2. Regenerate CLIP embedding for property
    await regenerate_property_embedding(property_key)

    # 3. Mark value as validated in frequency table
    await db.execute("""
        UPDATE metadata_value_frequency
        SET validation_status = 'validated'
        WHERE property_key = $1 AND extracted_value = $2
    """, property_key, prototype_value)

    # 4. Queue re-validation job for affected products
    product_ids = await db.fetch_val("""
        SELECT product_ids FROM metadata_value_frequency
        WHERE property_key = $1 AND extracted_value = $2
    """, property_key, prototype_value)

    await queue_revalidation_job(property_key, product_ids)

    return {"success": True, "products_queued": len(product_ids)}
```

**Action 2: Merge with Existing**
```python
@router.post("/api/admin/metadata-prototypes/merge")
async def merge_with_existing(
    property_key: str,
    extracted_value: str,
    target_prototype: str
):
    """Merge extracted value with existing prototype."""

    # 1. Add extracted_value as variation of target_prototype
    await db.execute("""
        UPDATE material_properties
        SET prototype_descriptions = jsonb_set(
            prototype_descriptions,
            ARRAY[$2],
            (
                SELECT jsonb_agg(elem)
                FROM jsonb_array_elements_text(prototype_descriptions->$2) elem
                UNION
                SELECT to_jsonb($3::text)
            )
        ),
        prototype_updated_at = NOW()
        WHERE property_key = $1
    """, property_key, target_prototype, extracted_value)

    # 2. Regenerate embedding
    await regenerate_property_embedding(property_key)

    # 3. Update all products with extracted_value to use target_prototype
    await db.execute("""
        UPDATE products
        SET metadata = jsonb_set(
            metadata,
            ARRAY[$1],
            to_jsonb($2::text)
        )
        WHERE metadata->>$1 = $3
    """, property_key, target_prototype, extracted_value)

    # 4. Mark as validated
    await db.execute("""
        UPDATE metadata_value_frequency
        SET validation_status = 'validated'
        WHERE property_key = $1 AND extracted_value = $2
    """, property_key, extracted_value)
```

**Action 3: Ignore**
```python
@router.post("/api/admin/metadata-prototypes/ignore")
async def ignore_suggestion(property_key: str, extracted_value: str):
    """Mark suggestion as rejected (won't show again)."""
    await db.execute("""
        UPDATE metadata_value_frequency
        SET validation_status = 'rejected'
        WHERE property_key = $1 AND extracted_value = $2
    """, property_key, extracted_value)
```

---

## 🎯 ANSWERS TO KEY QUESTIONS

### Question 1: How do we track user search patterns to identify missing prototypes?

**Answer**: Implemented comprehensive search query tracking system.

**Architecture**:

1. **search_query_tracking** table tracks EVERY search:
   ```sql
   CREATE TABLE search_query_tracking (
       id UUID PRIMARY KEY,
       workspace_id UUID NOT NULL,
       query_text TEXT,
       query_metadata JSONB,  -- {"finish": "shiny", "material_type": "ceramic"}
       search_type VARCHAR(50),
       result_count INT,
       zero_results BOOLEAN,  -- Flag for zero-result queries

       -- Track what matched vs what didn't
       searched_terms TEXT[],   -- ["shiny", "ceramic"]
       matched_terms TEXT[],    -- ["ceramic"] (validated)
       unmatched_terms TEXT[],  -- ["shiny"] (not validated)

       validation_results JSONB,  -- Full validation details
       response_time_ms INT
   );
   ```

2. **unmatched_term_frequency** table aggregates patterns:
   ```sql
   CREATE TABLE unmatched_term_frequency (
       id UUID PRIMARY KEY,
       term TEXT NOT NULL,
       property_key VARCHAR(100),
       frequency_count INT,  -- How many times users searched this
       workspace_ids UUID[],

       -- Similarity to existing prototypes
       similar_prototypes JSONB,  -- [{"prototype": "glossy", "similarity": 0.78}]

       -- Admin review workflow
       review_status VARCHAR(50) DEFAULT 'pending'
   );
   ```

**How It Works**:

```python
# Automatic tracking in multi_vector_search (enabled by default)
async def multi_vector_search(...):
    # ... perform search ...

    # Track query asynchronously
    tracker = get_search_tracker()
    await tracker.track_query(
        workspace_id=workspace_id,
        query_text=query,
        query_metadata=material_filters,  # {"finish": "shiny"}
        result_count=len(results)
    )

    # Tracker automatically:
    # 1. Validates each filter term against prototypes
    # 2. Identifies unmatched terms
    # 3. Updates frequency counts
    # 4. Flags zero-result queries
```

**Admin Dashboard** (`/admin/prototype-suggestions`):

```
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
```

**Benefits**:
- Identifies missing prototypes from real user behavior
- Prioritizes by frequency (most-searched terms first)
- Shows semantic similarity to existing prototypes
- Enables data-driven prototype expansion

---

### Question 2: Is metadata validation enabled by default in multi-vector search?

**Answer**: YES - Enabled by default with automatic scoring boost.

**Implementation**:

```python
# In llamaindex_service.py, line 5348
async def multi_vector_search(...):
    # ... execute vector search ...

    # ENABLED BY DEFAULT - no flag needed
    if material_filters and results:
        validator = get_metadata_validator()
        await validator.load_prototypes()

        # Enhance each result with validation scoring
        for result in results:
            metadata_boost = await self._calculate_metadata_validation_boost(
                product_metadata=result["metadata"],
                query_filters=material_filters,
                validator=validator
            )

            # Apply up to 20% score boost
            result["score"] = result["score"] * (1.0 + metadata_boost * 0.2)

        # Re-sort by enhanced scores
        results.sort(key=lambda x: x["score"], reverse=True)
```

**Scoring Formula**:

```python
# For each query filter (e.g., {"finish": "shiny"})
for filter_key, filter_value in query_filters.items():
    product_value = product.metadata.get(filter_key)

    if filter_key in validated_properties:
        # Check if product has validation metadata
        validation_info = product.metadata.get('_validation', {}).get(filter_key)

        if validation_info.get('prototype_matched'):
            # Both query and product are validated
            if product_value == filter_value:
                score += 1.0  # Exact match
            else:
                # Semantic similarity
                similarity = cosine_similarity(
                    embedding(filter_value),
                    embedding(product_value)
                )
                if similarity > 0.70:
                    score += similarity  # Partial match
        else:
            # Product not validated → penalty
            if product_value == filter_value:
                score += 0.8  # Exact match but unvalidated
    else:
        # No prototypes → exact match only
        if product_value == filter_value:
            score += 1.0

# Normalize and apply boost
metadata_boost = score / len(query_filters)
final_score = original_score * (1.0 + metadata_boost * 0.2)
```

**Example**:

Query: `{"finish": "shiny", "slip_resistance": "R-11"}`

**Product A** (validated):
- `finish: "glossy"` (validated from "shiny", confidence 0.92)
- `slip_resistance: "R11"` (validated from "R-11", confidence 1.0)
- **Metadata boost**: (0.92 + 1.0) / 2 = 0.96
- **Final score**: 0.85 * 1.192 = **1.013** ✅

**Product B** (unvalidated):
- `finish: "shiny surface"` (not validated)
- `slip_resistance: "R-11"` (not validated)
- **Metadata boost**: 0.0
- **Final score**: 0.85 * 1.0 = **0.85** ❌

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

```
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
│                                                              │
│ UPDATE material_properties                                  │
│ SET prototype_descriptions = {                              │
│   "quick": ["1 hour", "fast", "quick install"],             │
│   "standard": ["2 hours", "2-3 hours", "normal"],           │
│   "extended": ["3-4 hours", "4+ hours", "complex"]          │
│ }                                                            │
│ WHERE property_key = "_custom_installation_time"            │
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
```

**Key Points**:

1. **Automatic Property Creation**:
   - Every discovered field gets a `material_properties` entry
   - No manual intervention needed
   - Enables future prototype addition

2. **Graceful Degradation**:
   - Properties without prototypes still work (exact match only)
   - No validation errors or failures
   - System remains functional

3. **Progressive Enhancement**:
   - Start with no prototypes (exact match)
   - Add prototypes when patterns emerge
   - Automatically upgrade to semantic matching

4. **Data-Driven Workflow**:
   - Frequency tracking identifies candidates
   - Admin reviews and approves
   - System learns from real usage

**Example Timeline**:

```
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
```

---

## 🏗️ Architecture

### Integration with Existing System

```
┌─────────────────────────────────────────────────────────────────────┐
│ EXISTING: PDF Processing Pipeline (UNCHANGED)                       │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  Stage 0A: Product Discovery                                        │
│  └── Discover products with basic metadata                          │
│                                                                      │
│  Stage 0B: Metadata Extraction (DynamicMetadataExtractor)           │
│  └── Extract 200+ fields across 9 categories                        │
│      Returns: {                                                      │
│        "critical": {"material_category": "ceramic tile"},           │
│        "discovered": {                                               │
│          "material_properties": {"finish": "glossy"},                │
│          "performance": {"slip_resistance": "R11"}                   │
│        }                                                             │
│      }                                                               │
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
│      Output: {                                                       │
│        "finish": {                                                   │
│          "value": "glossy",                                          │
│          "validated": true,                                          │
│          "confidence": 0.94,                                         │
│          "original": "glossy"                                        │
│        }                                                             │
│      }                                                               │
│                                                                      │
│  Stage 1-8: Continue as normal (UNCHANGED)                          │
│  └── Image extraction, embeddings, chunking, etc.                   │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

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

```python
# Multi-vector search scoring (llamaindex_service.py, line 5209)
final_score = (
    0.4 * text_similarity +      # Text embedding match
    0.3 * visual_similarity +    # Image embedding match
    0.2 * metadata_match +       # Exact metadata match
    0.1 * confidence_score       # Extraction confidence
)
```

**Problem**: Metadata matching is binary (exact match or no match)
- "shiny" doesn't match "glossy" (even though they're semantically similar)
- "R-11" doesn't match "R11" (formatting variation)
- "ceramic tiles" doesn't match "ceramic" (plural variation)

### Enhanced Scoring with Prototype Validation

```python
# Calculate metadata_prototype_match score
metadata_prototype_match = 0.0
validated_fields = 0
total_query_fields = 0

for field, query_value in query_metadata.items():
    total_query_fields += 1

    # Check if this field has prototype validation
    if field in VALIDATED_PROPERTIES:
        product_value = product.metadata.get(field)
        validation_info = product.metadata.get('_validation', {}).get(field, {})

        if validation_info.get('prototype_matched'):
            # Both query and product values are validated
            # Check if they match the same prototype
            if product_value == query_value:
                # Exact match → full score
                metadata_prototype_match += 1.0
                validated_fields += 1
            else:
                # Different prototypes → check semantic similarity
                query_embedding = await generate_clip_embedding(query_value)
                product_embedding = await generate_clip_embedding(product_value)
                similarity = cosine_similarity(query_embedding, product_embedding)

                if similarity > 0.70:
                    # Semantically similar → partial score
                    metadata_prototype_match += similarity
                    validated_fields += 1
        else:
            # Product value not validated → fuzzy match
            similarity = fuzzy_match(query_value, product_value)
            if similarity > 0.70:
                metadata_prototype_match += similarity * 0.8  # Penalty for unvalidated
                validated_fields += 1
    else:
        # No prototype validation → exact match only
        if product.metadata.get(field) == query_value:
            metadata_prototype_match += 1.0
            validated_fields += 1

# Normalize score
if total_query_fields > 0:
    metadata_prototype_match /= total_query_fields

# New scoring formula
final_score = (
    0.3 * text_similarity +           # Reduced from 0.4
    0.3 * visual_similarity +          # Same
    0.2 * metadata_prototype_match +   # NEW - validated metadata boost
    0.1 * metadata_match +             # Reduced from 0.2 - exact match fallback
    0.1 * confidence_score             # Same
)
```

**Benefits**:
1. **Semantic Matching**: "shiny" query finds "glossy" products (0.92 similarity)
2. **Fuzzy Matching**: "R-11" query finds "R11" products (formatting normalized)
3. **Validation Boost**: Products with validated metadata rank higher
4. **Consistent Terminology**: All products use standardized values

### Example Scoring Comparison

**Query**: `{"finish": "shiny", "slip_resistance": "R-11"}`

**Product A** (validated metadata):
```json
{
  "metadata": {
    "finish": "glossy",  // Validated: "shiny" → "glossy" (0.92 similarity)
    "slip_resistance": "R11",  // Validated: "R-11" → "R11" (1.0 similarity)
    "_validation": {
      "finish": {"prototype_matched": true, "confidence": 0.92},
      "slip_resistance": {"prototype_matched": true, "confidence": 1.0}
    }
  }
}
```
**Metadata Score**: `(0.92 + 1.0) / 2 = 0.96` ✅ High score

**Product B** (unvalidated metadata):
```json
{
  "metadata": {
    "finish": "shiny surface",  // Not validated
    "slip_resistance": "R-11"   // Not validated
  }
}
```
**Metadata Score**: `(0.7 * 0.8 + 0.0) / 2 = 0.28` ❌ Low score

**Result**: Product A ranks significantly higher despite not having exact text match!

### Integration Points

**1. Multi-Vector Search** (`llamaindex_service.py`, line 5209):
```python
# Add metadata_prototype_match to scoring
results = await self._score_with_metadata_validation(
    results=results,
    query_metadata=filters.get('metadata', {}),
    enable_prototype_matching=True  # Enabled by default
)
```

**2. Material Visual Search** (`material_visual_search_service.py`, line 411):
```python
# Use validated category for filtering
validated_category = await validate_metadata_value(
    property_key="material_type",
    value=category_filter
)
products = await self._filter_by_category(validated_category)
```

**3. Semantic Search** (`llamaindex_service.py`, line 4800):
```python
# Boost results with validated metadata
for result in results:
    validation_boost = calculate_validation_boost(result.metadata)
    result.score *= (1.0 + validation_boost * 0.2)  # Up to 20% boost
```

---

## 📊 Database Schema

### material_properties Table (ENHANCED)

**Existing Columns** (UNCHANGED):
```sql
id UUID PRIMARY KEY
property_key VARCHAR UNIQUE  -- e.g., "material_type", "finish", "slip_resistance"
name VARCHAR                  -- e.g., "Material Type", "Finish", "Slip Resistance"
display_name VARCHAR
description TEXT
data_type VARCHAR             -- "string", "number", "enum", "boolean"
validation_rules JSONB
is_searchable BOOLEAN
is_filterable BOOLEAN
is_ai_extractable BOOLEAN
```

**NEW Columns** (ADDED):
```sql
-- Prototype validation columns
prototype_descriptions TEXT[]        -- Array of 3-5 prototype descriptions per value
text_embedding_512 VECTOR(512)      -- Averaged CLIP embedding for prototypes
prototype_updated_at TIMESTAMP      -- Last update timestamp

-- Example for "finish" property:
-- prototype_descriptions: {
--   "glossy": ["High gloss reflective surface", "Polished shiny appearance", "Mirror-like finish"],
--   "matte": ["Non-reflective flat surface", "No shine or gloss", "Flat appearance"],
--   "satin": ["Semi-gloss subtle sheen", "Soft luster finish", "Between matte and glossy"]
-- }
```

**Vector Index**:
```sql
CREATE INDEX idx_material_properties_embedding 
ON material_properties 
USING ivfflat (text_embedding_512 vector_cosine_ops) 
WITH (lists = 100);
```

---

## 🔄 How Prototype Validation Works

### Step-by-Step Process

**1. Llama Extracts Free Text**
```python
llama_result = {
    "materials_identified": ["ceramic tile with glossy finish"],
    "properties": {
        "finish": "glossy",
        "pattern": "marble-like veining"
    }
}
```

**2. Prototype Validator Processes Each Field**
```python
validator = MetadataPrototypeValidator()

# Validate "finish" property
validated_finish = await validator.validate_property(
    property_key="finish",
    extracted_value="glossy"
)
# Returns: {
#   "value": "glossy",
#   "validated": True,
#   "confidence": 0.94,
#   "similarity_scores": {"glossy": 0.94, "matte": 0.12, "satin": 0.45}
# }
```

**3. Validation Algorithm**
```python
# Generate CLIP embedding for extracted value
extracted_embedding = generate_clip_embedding("glossy")  # 512D vector

# Get property from database
property = get_property("finish")

# Compare against all prototype values
similarities = {}
for value_name, prototype_embedding in property.prototypes.items():
    similarity = cosine_similarity(extracted_embedding, prototype_embedding)
    similarities[value_name] = similarity

# Get best match
best_match = max(similarities.items(), key=lambda x: x[1])
# Returns: ("glossy", 0.94)

# Validate confidence threshold
if best_match[1] >= 0.80:
    return {"value": best_match[0], "validated": True, "confidence": best_match[1]}
else:
    return {"value": extracted_value, "validated": False, "confidence": best_match[1]}
```

**4. Store Validated Metadata**
```python
product.metadata = {
    "material_type": "ceramic",      # Validated
    "finish": "glossy",               # Validated
    "slip_resistance": "R11",         # Validated
    "pattern": "marble-like veining", # Free text (no prototype)
    "_validation_metadata": {
        "material_type": {"validated": True, "confidence": 0.92},
        "finish": {"validated": True, "confidence": 0.94},
        "slip_resistance": {"validated": True, "confidence": 0.96}
    }
}
```

---

## 🔍 Integration with Search

### Enhanced Search Capabilities

**1. Exact Metadata Filtering (EXISTING - UNCHANGED)**
```python
# Search for products with specific metadata
POST /api/search/products
{
    "filters": {
        "metadata.finish": "glossy",
        "metadata.slip_resistance": "R11"
    }
}
```

**2. Semantic Metadata Search (NEW - ADDED)**
```python
# Search using natural language
POST /api/search/products/semantic
{
    "query": "shiny ceramic tiles for wet areas",
    "use_metadata_prototypes": true
}

# Process:
# 1. Generate CLIP embedding for "shiny" → matches "glossy" prototype (0.89)
# 2. Generate CLIP embedding for "wet areas" → matches "R11 slip resistance" (0.87)
# 3. Boost products with validated metadata matching prototypes
```

**3. Metadata Similarity Scoring (NEW - ADDED)**
```python
# Rank products by metadata similarity
search_score = (
    0.4 * text_similarity +           # Existing
    0.3 * visual_similarity +          # Existing
    0.2 * metadata_prototype_match +   # NEW: Prototype similarity
    0.1 * confidence_score             # Existing
)
```

### Search Enhancement Benefits

**Better Fuzzy Matching**: "shiny" → "glossy", "non-slip" → "R11"
**Standardized Filters**: All variations map to same validated value
**Confidence Boosting**: High-confidence validated metadata ranks higher
**Semantic Understanding**: Natural language queries match technical terms

---

## 📋 Property Prototypes Definition

### Core Material Properties

**material_type** (Primary classification)
```python
PROTOTYPES = {
    "ceramic": [
        "Ceramic tiles with glazed surface for interior applications",
        "Porcelain ceramic with uniform texture and color patterns",
        "Glazed ceramic tiles with smooth finish for residential use"
    ],
    "marble": [
        "Natural marble stone with characteristic veining patterns",
        "Polished marble with high gloss finish and natural variations",
        "Marble slabs with unique patterns and premium appearance"
    ],
    "porcelain": [
        "Porcelain tiles with high density and low water absorption",
        "Vitrified porcelain with uniform color throughout the body",
        "Porcelain stoneware for high-traffic commercial applications"
    ],
    "wood": [
        "Natural wood with visible grain patterns and organic texture",
        "Hardwood flooring with warm appearance and natural variations",
        "Wood planks with authentic texture and natural characteristics"
    ],
    "granite": [
        "Natural granite stone with speckled appearance and high durability",
        "Polished granite with crystalline structure and premium finish",
        "Granite slabs with natural variations and exceptional hardness"
    ]
}
```

**finish** (Surface treatment)
```python
PROTOTYPES = {
    "glossy": [
        "High gloss reflective surface finish with mirror-like quality",
        "Polished shiny appearance with maximum light reflection",
        "Glossy coating with brilliant shine and reflective properties"
    ],
    "matte": [
        "Non-reflective matte surface finish with flat appearance",
        "Matte coating with no shine or gloss, low light reflection",
        "Flat finish without sheen, ideal for hiding imperfections"
    ],
    "satin": [
        "Semi-gloss satin finish with subtle sheen and soft luster",
        "Satin coating between matte and glossy, elegant appearance",
        "Soft sheen finish with moderate light reflection"
    ]
}
```

**slip_resistance** (Safety rating)
```python
PROTOTYPES = {
    "R9": [
        "Low slip resistance rating R9 suitable for dry interior areas",
        "R9 classification for minimal slip protection in dry conditions",
        "Basic slip resistance R9 for residential dry spaces"
    ],
    "R10": [
        "Medium slip resistance rating R10 for wet areas and bathrooms",
        "R10 classification for moderate slip protection in damp conditions",
        "Standard slip resistance R10 for kitchens and wet rooms"
    ],
    "R11": [
        "High slip resistance rating R11 for commercial wet areas",
        "R11 classification for enhanced slip protection in wet conditions",
        "Superior slip resistance R11 for high-traffic wet environments"
    ],
    "R12": [
        "Very high slip resistance rating R12 for industrial applications",
        "R12 classification for maximum slip protection in extreme conditions",
        "Industrial-grade slip resistance R12 for outdoor wet areas"
    ]
}
```

---

## Technical Implementation

### Database Schema

The system adds prototype validation columns to the `material_properties` table:

```sql
-- Add prototype columns
ALTER TABLE material_properties
ADD COLUMN prototype_descriptions JSONB DEFAULT '{}',  -- Store prototypes per value
ADD COLUMN text_embedding_512 VECTOR(512),
ADD COLUMN prototype_updated_at TIMESTAMP;

-- Create vector index
CREATE INDEX idx_material_properties_embedding
ON material_properties
USING ivfflat (text_embedding_512 vector_cosine_ops)
WITH (lists = 100);
```

### Property Population

The `material_properties` table is populated with 50+ meta fields organized into categories:

- **Material Properties**: material_type, composition, texture, finish, pattern, weight, density
- **Dimensions**: length, width, height, thickness, diameter, size
- **Appearance**: color, color_code, gloss_level, sheen, transparency
- **Performance**: slip_resistance, fire_rating, water_resistance, wear_rating
- **Application**: recommended_use, installation_method, room_type, traffic_level
- **Compliance**: certifications, standards, eco_friendly, sustainability_rating
- **Design**: designer, studio, collection, series, aesthetic_style
- **Manufacturing**: factory, manufacturer, country_of_origin
- **Commercial**: pricing, availability, supplier, sku, warranty

### Prototype Definitions

The system uses a PROPERTY_PROTOTYPES dictionary with 3-5 descriptions per property value:

```python
PROPERTY_PROTOTYPES = {
    "material_type": {
        "ceramic": ["Ceramic tiles with glazed surface...", ...],
        "marble": ["Natural marble stone with veining...", ...],
        "porcelain": ["Porcelain tiles with high density...", ...]
    },
    "finish": {
        "glossy": ["High gloss reflective surface...", ...],
        "matte": ["Non-reflective flat surface...", ...],
        "satin": ["Semi-gloss subtle sheen...", ...]
    },
    "slip_resistance": {
        "R9": ["Low slip resistance rating R9...", ...],
        "R10": ["Medium slip resistance rating R10...", ...],
        "R11": ["High slip resistance rating R11...", ...]
    }
}
```

### Embedding Generation

The system generates CLIP embeddings for all prototype values using averaged embeddings:

```python
for property_key, values in PROPERTY_PROTOTYPES.items():
    for value_name, descriptions in values.items():
        # Generate embeddings for all descriptions
        embeddings = [generate_clip_embedding(desc) for desc in descriptions]
        # Average embeddings
        avg_embedding = np.mean(embeddings, axis=0)
        # Store in database
        update_property_prototype(property_key, value_name, descriptions, avg_embedding)
```

### Validation Service

The `MetadataPrototypeValidator` service provides validation logic:

```python
class MetadataPrototypeValidator:
    async def validate_property(self, property_key: str, extracted_value: str) -> Dict
    async def validate_metadata(self, metadata: Dict) -> Dict
    async def get_property_prototypes(self, property_key: str) -> Dict
```

The validator:
- Generates CLIP embedding for extracted values
- Compares to all prototype embeddings for that property
- Returns best match with confidence score
- Uses confidence threshold (0.80 default)
- Falls back to original value if confidence < threshold

### Pipeline Integration

The validation is integrated into the PDF processing pipeline after metadata extraction:

```python
# Extract metadata
extracted = await metadata_extractor.extract_metadata(
    pdf_text=product_text,
    category_hint=category_hint
)

# Validate metadata
validator = MetadataPrototypeValidator()
validated = await validator.validate_metadata(extracted)

# Merge with validation metadata
enriched_metadata = {
    **validated,  # Validated values
    "_validation_metadata": {
        # Store validation details
    }
}
```

### Search Integration

The system integrates prototype validation into all search endpoints:

1. `/api/rag/search?strategy=multi_vector` (PRIMARY - enabled by default)
2. `/api/rag/search?strategy=material`
3. `/api/rag/search?strategy=all`
4. `/api/search/multimodal`
5. `/api/search/material-visual`

**Multi-Vector Search Enhancement**:

```python
# Prototype-based fuzzy matching
if material_filters:
    validator = MetadataPrototypeValidator()
    for key, value in material_filters.items():
        # Validate filter value against prototypes
        validated = await validator.validate_property(key, value)

        if validated['validated']:
            # Use validated value for exact match
            metadata_conditions.append(f"p.metadata->>'{key}' = '{validated['value']}'")

            # ALSO match similar values (similarity > 0.7)
            similar_values = validated.get('similar_values', [])
            if similar_values:
                similar_str = "', '".join(similar_values)
                metadata_conditions.append(f"OR p.metadata->>'{key}' IN ('{similar_str}')")
```

**Scoring Enhancement**:

```python
# Add metadata validation score
for result in results:
    metadata_match_score = 0.0
    if material_filters:
        # Calculate how well product metadata matches validated filters
        for key, filter_value in material_filters.items():
            product_value = result['metadata'].get(key)
            if product_value:
                # Compare using prototype embeddings
                similarity = await validator.compare_values(key, product_value, filter_value)
                metadata_match_score += similarity
        metadata_match_score /= len(material_filters)

    # Update combined score with 10% weight for metadata validation
    result['combined_score'] = (
        text_weight * result['text_score'] +
        visual_weight * result['visual_score'] +
        color_weight * result['color_score'] +
        texture_weight * result['texture_score'] +
        style_weight * result['style_score'] +
        material_weight * result['material_score'] +
        0.10 * metadata_match_score
    )
```

---

## Benefits

### For Metadata Extraction
- **Standardization**: Llama's free text → validated property values
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

**Populate Property Prototypes**
```bash
POST /api/metadata/properties/populate-prototypes
{
    "property_key": "finish",  # Optional: specific property
    "regenerate": false        # Optional: regenerate embeddings
}
```

**Validate Metadata**
```bash
POST /api/metadata/validate
{
    "metadata": {
        "finish": "glossy",
        "slip_resistance": "R11"
    }
}

Response:
{
    "validated_metadata": {
        "finish": {"value": "glossy", "validated": true, "confidence": 0.94},
        "slip_resistance": {"value": "R11", "validated": true, "confidence": 0.96}
    }
}
```

**Get Property Prototypes**
```bash
GET /api/metadata/properties/{property_key}/prototypes

Response:
{
    "property_key": "finish",
    "prototypes": {
        "glossy": ["High gloss reflective surface", ...],
        "matte": ["Non-reflective flat surface", ...],
        "satin": ["Semi-gloss subtle sheen", ...]
    }
}
```

---

## 📝 Notes

- **Backward Compatibility**: All existing metadata extraction continues to work
- **Gradual Rollout**: Prototypes can be added incrementally (start with top 20 properties)
- **Fallback Logic**: If validation fails, original extracted value is preserved
- **Admin Control**: Prototypes can be edited via admin panel
- **Performance**: CLIP embedding generation cached, validation is fast (<100ms)



