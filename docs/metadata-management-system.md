# Metadata Management System

## Overview

The MIVAA Metadata Management System provides intelligent extraction, classification, and application of metadata from PDF catalogs. The system handles 250+ possible metadata attributes through AI-powered dynamic discovery, scope detection, and override logic.

## Architecture

### Core Components

1. **Dynamic Metadata Extractor** - AI-powered extraction of metadata from text chunks
2. **Metadata Scope Detector** - Classifies metadata as product-specific vs catalog-general
3. **Metadata Application Service** - Applies metadata to products with override logic
4. **Metadata API** - RESTful endpoints for metadata management

### Key Features

- **Dynamic Discovery**: AI discovers any metadata attributes present in PDFs
- **Scope Detection**: Automatically classifies metadata scope (product-specific, catalog-general, category-specific)
- **Implicit Detection**: Identifies catalog-general metadata even when not explicitly stated
- **Override Logic**: Product-specific metadata can override catalog-general metadata
- **Relevancy Scoring**: All metadata relationships have confidence scores (0.0-1.0)

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

