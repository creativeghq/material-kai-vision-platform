# Metadata Management System

## Overview

The MIVAA Metadata Management System provides comprehensive, AI-powered extraction of 200+ metadata attributes from PDF catalogs. The system uses **DynamicMetadataExtractor** integrated into the Product Discovery pipeline to extract metadata across 9 functional categories during PDF processing.

## Architecture

### Core Components

1. **DynamicMetadataExtractor** - AI-powered extraction of comprehensive metadata (200+ fields)
   - Integrated into Product Discovery Service (Stage 0)
   - Uses Claude Opus 5 or GPT-4o
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
Text: "NOVA tile has R11 slip resistance"
Scope: product_specific
Applies To: ["NOVA"]
Relevance: 0.95 (HIGH)

### 2. Catalog-General (Explicit)

Metadata that explicitly states it applies to all products.

**Example:**
Text: "All tiles in this catalog are made in Spain"
Scope: catalog_general_explicit
Applies To: "all"
Relevance: 0.5 (MEDIUM)

### 3. Catalog-General (Implicit)

Metadata mentioned once without product context, implicitly applying to all products.

**Example:**
Text: "Available in 15×38"
Scope: catalog_general_implicit
Applies To: "all"
Relevance: 0.5 (MEDIUM)

**Detection Patterns:**
- "Available in [dimensions]"
- "Comes in [dimensions]"
- "Factory: [name]"
- "Made in [country]"
- "Dimensions: [size]"

### 4. Category-Specific

Metadata that applies to a specific product category.

**Example:**
Text: "All matte tiles have R11 slip resistance"
Scope: category_specific
Applies To: ["matte_tiles"]
Relevance: 0.7 (MEDIUM-HIGH)

## Processing Flow

### NEW Architecture: Integrated Metadata Extraction

Metadata extraction is now integrated directly into the Product Discovery pipeline (Stage 0):

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

The enrichment process: Product Discovery identifies products, then for each product the system extracts product-specific text, calls DynamicMetadataExtractor, and merges metadata in priority order — original discovery metadata takes highest priority, followed by critical fields (`material_category`, `factory_name`, `factory_group`), followed by the 200+ dynamically discovered fields. All metadata is stored in the `products.metadata` JSONB field.

### OLD Architecture: Chunk-Based Scope Detection (Still Available)

The legacy chunk-based metadata application is still available for post-processing:

### Stage 1: Chunk Creation

PDF content is split into semantic chunks during document processing.

PDF → PyMuPDF4LLM → Markdown → Semantic Chunking → Document Chunks

### Stage 2: Scope Detection

Each chunk is analyzed to determine its metadata scope. The scope detector returns `scope`, `confidence`, `applies_to`, `extracted_metadata`, and `is_override` for each chunk.

### Stage 3: Metadata Application

Metadata is applied to products in a specific order to handle overrides correctly:
- STEP 1: Catalog-general FIRST (implicit + explicit)
- STEP 2: Category-specific
- STEP 3: Product-specific LAST (allows overrides)

### Stage 4: Override Tracking

When product-specific metadata overrides catalog-general metadata, the system tracks it using an `_overrides` array in the product metadata JSON.

## Real-World Example

### Input: Tile Catalog PDF

A catalog with general information on page 1 ("Available in 15×38", "Made in Spain", "Factory: Castellón Ceramics"), then individual product pages for NOVA (R11 slip resistance, matte finish, no dimensions), HARMONY (R12 slip resistance, glossy finish, 20×40 dimensions), and ESSENCE (R10 slip resistance, no dimensions).

### Output: Product Metadata

- **NOVA** inherits catalog-general dimensions (15×38) and country/factory data, with its own R11 slip resistance and matte finish.
- **HARMONY** overrides catalog-general dimensions with 20×40 (tracked in `_overrides: ["dimensions"]`), and has its own R12 slip resistance and glossy finish.
- **ESSENCE** inherits catalog-general dimensions (15×38) and country/factory data, with its own R10 slip resistance.

## Critical Metadata Fields

Three metadata fields are always required and extracted:

1. **material_category** - Auto-detected from keywords (tile, porcelain, etc.) or manually set
2. **factory_name** - Extracted from PDF or manually set
3. **factory_group_name** - Extracted from PDF or manually set

These fields are validated during PDF processing and must be present for successful processing.

## API Endpoints

### POST /api/rag/metadata/detect-scope

Detect metadata scope for a text chunk.

The request takes `chunk_content`, `product_names` array, and `document_context`. The response includes a `scope_result` with `scope` (e.g., "catalog_general_implicit"), `confidence`, `reasoning`, `applies_to`, `extracted_metadata`, `is_override`, and `processing_time`.

### POST /api/rag/metadata/apply-to-products

Apply metadata to products with scope-aware override logic.

The request takes `document_id` and a `chunks_with_scope` array, each with `chunk_id`, `content`, `scope`, `applies_to`, `extracted_metadata`, and `is_override`. The response includes `products_updated`, `overrides_detected`, `metadata_applied` (per product), and `processing_time`.

### GET /api/rag/metadata/list

List metadata with filtering and pagination.

**Query Parameters:**
- `document_id` - Filter by document ID
- `product_id` - Filter by product ID
- `scope` - Filter by scope type
- `metadata_key` - Filter by metadata key
- `limit` - Maximum results (default: 100)
- `offset` - Offset for pagination (default: 0)

The response includes `total_count`, `items` (each with `product_id`, `product_name`, `metadata_key`, `metadata_value`, `scope`, and `is_override`), `limit`, and `offset`.

### GET /api/rag/metadata/statistics

Get metadata statistics and analytics. Returns `total_products`, `total_metadata_fields`, `catalog_general_count`, `product_specific_count`, `override_count`, and `most_common_fields`.

## Integration with PDF Processing

The metadata system is integrated into the PDF processing pipeline at Stage 4 (after product creation):

Stage 0: Product Discovery (Claude/GPT)
Stage 1: PDF Extraction (PyMuPDF4LLM)
Stage 2: Chunk Creation (Semantic Chunking)
Stage 3: Product Creation (Vision Analysis)
Stage 4: Metadata Application ← NEW
Stage 5: Image Processing
Stage 6: Embedding Generation

## Database Schema

### Products Table

The `products` table stores all metadata in a `metadata JSONB` field, allowing flexible storage of the 200+ dynamic fields extracted by DynamicMetadataExtractor.

### Metadata Structure

The metadata JSONB object contains named fields (e.g., `dimensions`, `slip_resistance`, `finish`, `country_of_origin`, `factory_name`), an `_overrides` array listing which fields were overridden from catalog-general values, and a `_scope` object mapping each field name to its detected scope type (e.g., `catalog_general_implicit` or `product_specific`).

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
