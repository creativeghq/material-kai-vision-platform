# Metadata Management System

## Overview

The MIVAA Metadata Management System provides comprehensive, AI-powered extraction of 200+ metadata attributes from PDF catalogs. The system uses **DynamicMetadataExtractor** integrated into the Product Discovery pipeline to extract metadata across 9 functional categories during PDF processing.

## Architecture

### Core Components

1. **DynamicMetadataExtractor** - AI-powered extraction of comprehensive metadata (200+ fields)
   - Integrated into Product Discovery Service (Stage 0)
   - Uses Claude Sonnet 4.5 or GPT-4o
   - Extracts metadata across 9 functional categories
   - Supports both critical fields and dynamic discovery

2. **Product Discovery Service** - Discovers products and enriches with metadata
   - Stage 0A: Discover products with basic metadata
   - Stage 0B: Enrich products with comprehensive metadata via DynamicMetadataExtractor
   - Single source of truth for all product metadata

3. **Metadata Scope Detector** - Classifies metadata as product-specific vs catalog-general
4. **Metadata Application Service** - Applies metadata to products with override logic
5. **Metadata API** - RESTful endpoints for metadata management

### Key Features

- **Comprehensive Extraction**: 200+ metadata fields across 9 functional categories
- **AI-Powered Discovery**: Claude/GPT dynamically discovers any metadata present
- **Organized Categories**: Material Properties, Dimensions, Appearance, Performance, Application, Compliance, Design, Manufacturing, Commercial
- **Single Source of Truth**: DynamicMetadataExtractor is THE metadata extraction service
- **Scope Detection**: Automatically classifies metadata scope (product-specific, catalog-general, category-specific)
- **Override Logic**: Product-specific metadata can override catalog-general metadata
- **Confidence Scoring**: All metadata has confidence scores (0.0-1.0)

## Metadata Categories

The DynamicMetadataExtractor organizes metadata into 9 comprehensive functional categories:

### 1. Material Properties
- **Fields**: composition, type, blend, fiber_content, texture, finish, pattern, weight, density, durability_rating
- **Purpose**: Physical and structural characteristics of the material
- **Examples**: "ceramic", "matte finish", "800 kg/m³ density"

### 2. Dimensions
- **Fields**: length, width, height, thickness, diameter, size, area, volume
- **Purpose**: Physical measurements and sizing information
- **Examples**: "15×38 cm", "8mm thickness", "0.57 m² area"

### 3. Appearance
- **Fields**: color, color_code, gloss_level, sheen, transparency, grain, visual_effect
- **Purpose**: Visual and aesthetic characteristics
- **Examples**: "beige", "RAL 9010", "60% gloss", "wood grain"

### 4. Performance
- **Fields**: water_resistance, fire_rating, slip_resistance, wear_rating, abrasion_resistance, tensile_strength, breaking_strength, hardness
- **Purpose**: Technical performance metrics and ratings
- **Examples**: "R11 slip resistance", "A1 fire rating", "Class 3 water absorption"

### 5. Application
- **Fields**: recommended_use, installation_method, room_type, traffic_level, care_instructions, maintenance
- **Purpose**: Usage recommendations and installation guidance
- **Examples**: "residential flooring", "adhesive installation", "high traffic areas"

### 6. Compliance & Certifications
- **Fields**: certifications, standards, eco_friendly, sustainability_rating, voc_rating, safety_rating
- **Purpose**: Regulatory compliance and environmental certifications
- **Examples**: "ISO 9001:2015", "LEED certified", "low VOC"

### 7. Design
- **Fields**: designer, studio, collection, series, aesthetic_style, design_era
- **Purpose**: Design attribution and aesthetic classification
- **Examples**: "SG NY", "Harmony Collection", "contemporary style"

### 8. Manufacturing
- **Fields**: factory, manufacturer, factory_group, country_of_origin, manufacturing_process, construction
- **Purpose**: Production and sourcing information
- **Examples**: "Castellón Factory", "Harmony Group", "Made in Spain"

### 9. Commercial
- **Fields**: pricing, availability, supplier, sku, warranty
- **Purpose**: Business and commercial information
- **Examples**: "€45/m²", "in stock", "5-year warranty"

## Metadata Scopes

### 1. Product-Specific

Metadata that mentions a specific product name and applies only to that product.

**Example:**
```
Text: "NOVA tile has R11 slip resistance"
Scope: product_specific
Applies To: ["NOVA"]
Relevance: 0.95 (HIGH)
```

### 2. Catalog-General (Explicit)

Metadata that explicitly states it applies to all products.

**Example:**
```
Text: "All tiles in this catalog are made in Spain"
Scope: catalog_general_explicit
Applies To: "all"
Relevance: 0.5 (MEDIUM)
```

### 3. Catalog-General (Implicit)

Metadata mentioned once without product context, implicitly applying to all products.

**Example:**
```
Text: "Available in 15×38"
Scope: catalog_general_implicit
Applies To: "all"
Relevance: 0.5 (MEDIUM)
```

**Detection Patterns:**
- "Available in [dimensions]"
- "Comes in [dimensions]"
- "Factory: [name]"
- "Made in [country]"
- "Dimensions: [size]"

### 4. Category-Specific

Metadata that applies to a specific product category.

**Example:**
```
Text: "All matte tiles have R11 slip resistance"
Scope: category_specific
Applies To: ["matte_tiles"]
Relevance: 0.7 (MEDIUM-HIGH)
```

## Processing Flow

### NEW Architecture: Integrated Metadata Extraction

Metadata extraction is now integrated directly into the Product Discovery pipeline (Stage 0):

```
Stage 0: Product Discovery
├── 0A: Discover Products (Claude/GPT)
│   ├── Identify product names
│   ├── Extract page ranges
│   ├── Extract basic metadata (designer, dimensions, variants)
│   └── Classify content by category
│
└── 0B: Enrich Products with Comprehensive Metadata
    ├── For each discovered product:
    │   ├── Extract product-specific text
    │   ├── Call DynamicMetadataExtractor
    │   ├── Extract 200+ metadata fields across 9 categories
    │   └── Merge with discovery metadata
    │
    └── Store enriched products in database
```

### Metadata Extraction Process

```python
# 1. Product Discovery discovers products
catalog = await discovery_service.discover_products(
    pdf_content=pdf_bytes,
    pdf_text=pdf_text,
    extract_categories=["products", "certificates", "logos"]
)

# 2. Automatic metadata enrichment (happens inside discover_products)
for product in catalog.products:
    # Extract product-specific text
    product_text = extract_product_text(pdf_text, product.page_range)

    # Initialize DynamicMetadataExtractor
    metadata_extractor = DynamicMetadataExtractor(model="claude", job_id=job_id)

    # Extract comprehensive metadata
    extracted = await metadata_extractor.extract_metadata(
        pdf_text=product_text,
        category_hint=product.metadata.get("category")
    )

    # Merge metadata (priority: discovery > critical > discovered)
    product.metadata = {
        **extracted["discovered"],  # 200+ dynamic fields
        **extracted["critical"],    # material_category, factory_name, factory_group
        **product.metadata,         # Original discovery metadata (highest priority)
    }

# 3. Products are created with comprehensive metadata
# All 200+ fields are stored in products.metadata JSONB field
```

### OLD Architecture: Chunk-Based Scope Detection (Still Available)

The legacy chunk-based metadata application is still available for post-processing:

### Stage 1: Chunk Creation

PDF content is split into semantic chunks during document processing.

```
PDF → PyMuPDF4LLM → Markdown → Semantic Chunking → Document Chunks
```

### Stage 2: Scope Detection

Each chunk is analyzed to determine its metadata scope.

```python
# For each chunk
scope_result = await scope_detector.detect_scope(
    chunk_content=chunk.text,
    product_names=["NOVA", "HARMONY", "ESSENCE"],
    document_context="Tile catalog"
)

# Returns:
{
    "scope": "catalog_general_implicit",
    "confidence": 0.85,
    "applies_to": "all",
    "extracted_metadata": {"dimensions": "15×38"},
    "is_override": False
}
```

### Stage 3: Metadata Application

Metadata is applied to products in a specific order to handle overrides correctly.

```python
# Processing Order (CRITICAL!)
# STEP 1: Catalog-general FIRST (implicit + explicit)
apply_catalog_general_metadata()

# STEP 2: Category-specific
apply_category_specific_metadata()

# STEP 3: Product-specific LAST (allows overrides)
apply_product_specific_metadata()
```

### Stage 4: Override Tracking

When product-specific metadata overrides catalog-general metadata, the system tracks it.

```json
{
  "name": "HARMONY",
  "metadata": {
    "dimensions": "20×40",
    "slip_resistance": "R12",
    "country_of_origin": "Spain",
    "_overrides": ["dimensions"]
  }
}
```

## Real-World Example

### Input: Tile Catalog PDF

```
Page 1: General Information
"Available in 15×38"
"Made in Spain"
"Factory: Castellón Ceramics"

Page 12: NOVA Product
"NOVA tile - R11 slip resistance"
"Matte finish"
[No dimensions mentioned]

Page 15: HARMONY Product
"HARMONY tile - R12 slip resistance"
"Glossy finish"
"Dimensions: 20×40"

Page 18: ESSENCE Product
"ESSENCE tile - R10 slip resistance"
[No dimensions mentioned]
```

### Output: Product Metadata

```json
// NOVA - Inherits catalog-general dimensions
{
  "name": "NOVA",
  "metadata": {
    "dimensions": "15×38",
    "slip_resistance": "R11",
    "finish": "matte",
    "country_of_origin": "Spain",
    "factory_name": "Castellón Ceramics"
  }
}

// HARMONY - Overrides catalog-general dimensions
{
  "name": "HARMONY",
  "metadata": {
    "dimensions": "20×40",
    "slip_resistance": "R12",
    "finish": "glossy",
    "country_of_origin": "Spain",
    "factory_name": "Castellón Ceramics",
    "_overrides": ["dimensions"]
  }
}

// ESSENCE - Inherits catalog-general dimensions
{
  "name": "ESSENCE",
  "metadata": {
    "dimensions": "15×38",
    "slip_resistance": "R10",
    "country_of_origin": "Spain",
    "factory_name": "Castellón Ceramics"
  }
}
```

## Critical Metadata Fields

Three metadata fields are always required and extracted:

1. **material_category** - Auto-detected from keywords (tile, porcelain, etc.) or manually set
2. **factory_name** - Extracted from PDF or manually set
3. **factory_group_name** - Extracted from PDF or manually set

These fields are validated during PDF processing and must be present for successful processing.

## API Endpoints

### POST /api/rag/metadata/detect-scope

Detect metadata scope for a text chunk.

**Request:**
```json
{
  "chunk_content": "Available in 15×38",
  "product_names": ["NOVA", "HARMONY", "ESSENCE"],
  "document_context": "Tile catalog"
}
```

**Response:**
```json
{
  "success": true,
  "scope_result": {
    "scope": "catalog_general_implicit",
    "confidence": 0.85,
    "reasoning": "Dimensions mentioned without product name",
    "applies_to": "all",
    "extracted_metadata": {"dimensions": "15×38"},
    "is_override": false
  },
  "processing_time": 0.45
}
```

### POST /api/rag/metadata/apply-to-products

Apply metadata to products with scope-aware override logic.

**Request:**
```json
{
  "document_id": "69cba085-9c2d-405c-aff2-8a20caf0b568",
  "chunks_with_scope": [
    {
      "chunk_id": "chunk-123",
      "content": "Available in 15×38",
      "scope": "catalog_general_implicit",
      "applies_to": "all",
      "extracted_metadata": {"dimensions": "15×38"},
      "is_override": false
    }
  ]
}
```

**Response:**
```json
{
  "success": true,
  "products_updated": 3,
  "overrides_detected": 1,
  "metadata_applied": {
    "NOVA": {"dimensions": "15×38"},
    "HARMONY": {"dimensions": "20×40"},
    "ESSENCE": {"dimensions": "15×38"}
  },
  "processing_time": 1.2
}
```

### GET /api/rag/metadata/list

List metadata with filtering and pagination.

**Query Parameters:**
- `document_id` - Filter by document ID
- `product_id` - Filter by product ID
- `scope` - Filter by scope type
- `metadata_key` - Filter by metadata key
- `limit` - Maximum results (default: 100)
- `offset` - Offset for pagination (default: 0)

**Response:**
```json
{
  "success": true,
  "total_count": 45,
  "items": [
    {
      "product_id": "prod-123",
      "product_name": "NOVA",
      "metadata_key": "dimensions",
      "metadata_value": "15×38",
      "scope": "catalog_general_implicit",
      "is_override": false
    }
  ],
  "limit": 100,
  "offset": 0
}
```

### GET /api/rag/metadata/statistics

Get metadata statistics and analytics.

**Response:**
```json
{
  "total_products": 14,
  "total_metadata_fields": 156,
  "catalog_general_count": 42,
  "product_specific_count": 98,
  "override_count": 16,
  "most_common_fields": [
    {"field": "dimensions", "count": 14},
    {"field": "slip_resistance", "count": 14},
    {"field": "finish", "count": 12}
  ]
}
```

## Integration with PDF Processing

The metadata system is integrated into the PDF processing pipeline at Stage 4 (after product creation):

```
Stage 0: Product Discovery (Claude/GPT)
Stage 1: PDF Extraction (PyMuPDF4LLM)
Stage 2: Chunk Creation (Semantic Chunking)
Stage 3: Product Creation (Vision Analysis)
Stage 4: Metadata Application ← NEW
Stage 5: Image Processing
Stage 6: Embedding Generation
```

## Database Schema

### Products Table

```sql
CREATE TABLE products (
  id UUID PRIMARY KEY,
  workspace_id UUID,
  name VARCHAR(255),
  metadata JSONB,  -- All metadata stored here
  created_at TIMESTAMP,
  updated_at TIMESTAMP
);
```

### Metadata Structure

```json
{
  "dimensions": "15×38",
  "slip_resistance": "R11",
  "finish": "matte",
  "country_of_origin": "Spain",
  "factory_name": "Castellón Ceramics",
  "_overrides": ["dimensions"],
  "_scope": {
    "dimensions": "catalog_general_implicit",
    "slip_resistance": "product_specific"
  }
}
```

## Best Practices

1. **Always process catalog-general metadata first** - This ensures proper inheritance
2. **Track overrides** - Use `_overrides` array to know which fields were overridden
3. **Use confidence scores** - Filter by confidence >= 0.7 for high-quality metadata
4. **Validate critical fields** - Ensure material_category, factory_name, factory_group_name are present
5. **Review implicit detections** - Catalog-general implicit metadata should be reviewed for accuracy

## Future Enhancements

- **Admin UI for metadata review** - Visual interface to review and edit metadata
- **Metadata templates** - Pre-defined templates for common catalog types
- **Batch metadata updates** - Update metadata across multiple products
- **Metadata versioning** - Track changes to metadata over time
- **Custom extraction rules** - Allow admins to define custom extraction patterns

