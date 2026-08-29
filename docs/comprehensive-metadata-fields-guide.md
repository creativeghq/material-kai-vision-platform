# 📚 Comprehensive Metadata Fields Guide

## 📋 Overview

The MIVAA platform extracts **200+ metadata fields** from PDF catalogs using AI-powered dynamic discovery. All metadata is organized into **9 functional categories** and stored in the `products.metadata` JSONB field in the database.

---

## 🎯 Metadata Extraction Architecture

### ⚙️ How It Works

┌─────────────────────────────────────────────────────────────┐
│ Stage 0: Product Discovery & Metadata Extraction            │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  0A: Product Discovery (Claude/GPT)                         │
│  ├── Identify product names                                 │
│  ├── Extract page ranges                                    │
│  ├── Extract basic metadata (designer, dimensions)          │
│  └── Classify content by category                           │
│                                                              │
│  0B: Metadata Enrichment (DynamicMetadataExtractor)         │
│  ├── For each discovered product:                           │
│  │   ├── Extract product-specific text from PDF             │
│  │   ├── Call DynamicMetadataExtractor (Claude/GPT)         │
│  │   ├── Extract 200+ fields across 9 categories            │
│  │   └── Merge with discovery metadata                      │
│  │                                                           │
│  └── Store enriched products in database                    │
│                                                              │
└─────────────────────────────────────────────────────────────┘

### 🤖 AI Models Used

- **Primary**: Claude Opus 5 (`claude-opus-5`)
- **Alternative**: GPT-4o (`gpt-4o`)
- **Temperature**: 0.1 (low for consistent extraction)
- **Max Tokens**: 8000 (comprehensive responses)

### 🔝 Metadata Priority

When merging metadata from multiple sources, the system uses this priority:

1. **Discovery Metadata** (Highest Priority)
   - Extracted during product discovery (Stage 0A)
   - Includes: product name, designer, dimensions, variants

2. **Critical Metadata** (High Priority)
   - Always extracted: `material_category`, `factory_name`, `factory_group_name`
   - Required for product classification

3. **Discovered Metadata** (Standard Priority)
   - 200+ dynamic fields extracted by DynamicMetadataExtractor
   - Organized into 9 functional categories

---

## 📦 The 9 Metadata Categories

### 🧱 1. Material Properties

**Purpose**: Physical and structural characteristics of the material

**Fields** (11 total):
- `material_type` - Type of material (e.g., "ceramic", "porcelain", "wood")
- `composition` - Material composition (e.g., "100% ceramic", "oak wood")
- `type` - Specific type classification
- `blend` - Material blend information
- `fiber_content` - Fiber composition (for textiles)
- `texture` - Surface texture (e.g., "smooth", "rough", "embossed")
- `finish` - Surface finish (e.g., "matte", "glossy", "satin")
- `pattern` - Pattern type (e.g., "wood grain", "marble veins")
- `weight` - Material weight (e.g., "800 kg/m³")
- `density` - Material density
- `durability_rating` - Durability classification

---

### 📏 2. Dimensions

**Purpose**: Physical measurements and sizing information

**Fields** (8 total):
- `size` - Overall size (e.g., "15×38 cm", "20×40 cm")
- `length` - Length measurement
- `width` - Width measurement
- `height` - Height measurement
- `thickness` - Thickness (e.g., "8mm", "10mm")
- `diameter` - Diameter (for circular products)
- `area` - Surface area (e.g., "0.57 m²")
- `volume` - Volume measurement

---

### 🎨 3. Appearance

**Purpose**: Visual and aesthetic characteristics

**Fields** (7 total):
- `color` - Color name (e.g., "beige", "white", "gray")
- `color_code` - Color code (e.g., "RAL 9010", "#F5F5DC")
- `gloss_level` - Gloss percentage (e.g., "60%", "matte")
- `sheen` - Sheen level (e.g., "satin", "semi-gloss")
- `transparency` - Transparency level
- `grain` - Grain pattern (e.g., "wood grain", "marble veins")
- `visual_effect` - Special visual effects

---

### ✅ 6. Compliance & Certifications

**Purpose**: Regulatory compliance and environmental certifications

**Fields** (6 total):
- `certifications` - Certifications held (e.g., "ISO 9001:2015", "CE certified")
- `standards` - Standards compliance (e.g., "EN 14411", "ISO 10545")
- `eco_friendly` - Eco-friendly status (true/false)
- `sustainability_rating` - Sustainability rating
- `voc_rating` - VOC (Volatile Organic Compounds) rating (e.g., "low VOC", "zero VOC")
- `safety_rating` - Safety rating

---

### 🎨 7. Design

**Purpose**: Design attribution and aesthetic classification

**Fields** (6 total):
- `designer` - Designer name (e.g., "SG NY", "Patricia Urquiola")
- `studio` - Design studio
- `collection` - Collection name (e.g., "Harmony Collection", "Urban Series")
- `series` - Series name
- `aesthetic_style` - Aesthetic style (e.g., "contemporary", "minimalist", "rustic")
- `design_era` - Design era (e.g., "modern", "vintage")

---

### 🏭 8. Manufacturing

**Purpose**: Production and sourcing information

**Fields** (6 total):
- `factory` - Factory name (e.g., "Castellón Factory")
- `manufacturer` - Manufacturer name
- `factory_group` - Factory group/parent company (e.g., "Harmony Group")
- `country_of_origin` - Country of origin (e.g., "Spain", "Italy")
- `manufacturing_process` - Manufacturing process description
- `construction` - Construction method

---

### 💰 9. Commercial

**Purpose**: Business and commercial information

**Fields** (5 total):
- `pricing` - Price information (e.g., "€45/m²", "$50/sqft")
- `availability` - Availability status (e.g., "in stock", "made to order")
- `supplier` - Supplier name
- `sku` - SKU/product code
- `warranty` - Warranty information (e.g., "5-year warranty", "lifetime warranty")

---

## 🔧 Technical Implementation

### 🗄️ Database Schema

All metadata is stored in the `products` table in the `metadata` JSONB field. The products table has columns: `id` (UUID), `sku`, `name`, `description`, `category`, `type`, `status`, `metadata` (JSONB — all 200+ metadata fields), `properties` (JSONB), `specifications` (JSONB), `created_at`, and `updated_at`.

### 📝 Example Product Metadata

A complete product record has a `metadata` JSONB field containing fields from all 9 categories: material properties (material_type, composition, texture, finish, pattern, weight, density), dimensions (size, thickness, area), appearance (color, color_code, gloss_level, grain), performance (water_absorption, fire_rating, slip_resistance, wear_rating, breaking_strength), application (recommended_use, installation_method, room_type, traffic_level), compliance (certifications, standards, eco_friendly, voc_rating), design (designer, collection, aesthetic_style), manufacturing (factory, factory_group, country_of_origin), commercial (pricing, availability, warranty), and `_extraction_metadata` (extraction_timestamp, extraction_method, model_used, confidence_score, validation_passed).

---

## 🚀 API Usage

### 📤 Extract Metadata from PDF

**Endpoint**: `POST /api/rag/process-pdf`

Upload a PDF file with `extract_categories` parameter. The response contains a `job_id`, `status`, `message`, `products_discovered` count, and `metadata_extraction` status.

### 📥 Get Product with Metadata

**Endpoint**: `GET /api/products/{product_id}`

Returns the product record with its complete `metadata` object containing all extracted fields.

### 🔍 Search Products by Metadata

**Endpoint**: `POST /api/search/products`

Send a `filters` object with dot-notation keys like `"metadata.slip_resistance": "R11"`, `"metadata.fire_rating": "A1"`, or `"metadata.country_of_origin": "Spain"` to filter products by their metadata values.

---

## 📊 Frontend Display

### ProductDetailModal Component

The frontend displays metadata organized by category in the `ProductDetailModal` component:

**Location**: `src/components/AI/ProductDetailModal.tsx`

**Features**:
- ✅ Displays all 9 metadata categories
- ✅ Dynamic rendering - only shows categories with data
- ✅ Organized, clean UI with hover effects
- ✅ Proper handling of empty/null values
- ✅ Support for nested metadata structures

**Example UI**:
┌─────────────────────────────────────────────────────────┐
│ NOVA - Product Details                                  │
├─────────────────────────────────────────────────────────┤
│                                                          │
│ [Product Image]                                          │
│                                                          │
│ ┌─────────────────────────────────────────────────────┐ │
│ │ Material Properties                                  │ │
│ ├─────────────────────────────────────────────────────┤ │
│ │ Material Type: ceramic                               │ │
│ │ Texture: smooth                                      │ │
│ │ Finish: matte                                        │ │
│ │ Weight: 800 kg/m³                                    │ │
│ └─────────────────────────────────────────────────────┘ │
│                                                          │
│ ┌─────────────────────────────────────────────────────┐ │
│ │ Dimensions                                           │ │
│ ├─────────────────────────────────────────────────────┤ │
│ │ Size: 15×38 cm                                       │ │
│ │ Thickness: 8mm                                       │ │
│ │ Area: 0.057 m²                                       │ │
│ └─────────────────────────────────────────────────────┘ │
│                                                          │
│ ┌─────────────────────────────────────────────────────┐ │
│ │ Performance                                          │ │
│ ├─────────────────────────────────────────────────────┤ │
│ │ Slip Resistance: R11                                 │ │
│ │ Fire Rating: A1                                      │ │
│ │ Water Absorption: Class 3                            │ │
│ │ Breaking Strength: 1200 N                            │ │
│ └─────────────────────────────────────────────────────┘ │
│                                                          │
│ ... (6 more categories)                                 │
│                                                          │
└─────────────────────────────────────────────────────────┘

---

## 🔍 How Metadata Extraction Works

### Step-by-Step Process

#### 1. PDF Upload
User uploads PDF → MIVAA API receives file → Job created

#### 2. Product Discovery (Stage 0A)
The `ProductDiscoveryService` analyzes the PDF and returns products with basic metadata including name, page_range, and initial fields (designer, dimensions, variants).

#### 3. Metadata Enrichment (Stage 0B)
For each product, the system extracts product-specific text from the page range, initializes `DynamicMetadataExtractor`, and runs extraction to get 200+ fields organized into `critical` (material_category, factory_name, factory_group_name), `discovered` (all dynamic fields), and `metadata` (extraction tracking info).

#### 4. Metadata Merging
Metadata is merged with this priority: `discovered` fields as base, then `critical` fields override, then `discovery metadata` (highest priority) overrides those, plus `_extraction_metadata` added separately.

#### 5. Database Storage
The product record is stored with its complete metadata JSONB containing all 200+ fields.

#### 6. Frontend Display
The `ProductDetailModal` component reads the metadata object and renders each category section dynamically, showing only categories that have data.

---

## 🎯 Confidence Scoring

Each extracted metadata field has a confidence score (0.0-1.0):

- **0.9-1.0**: High confidence - explicitly stated in PDF
- **0.7-0.9**: Medium-high confidence - strongly implied
- **0.5-0.7**: Medium confidence - inferred from context
- **0.3-0.5**: Low-medium confidence - weak inference
- **0.0-0.3**: Low confidence - uncertain extraction

Confidence scores are stored alongside field values, tracking both the value and the source location (e.g., "page 6, line 23" or "inferred from image description").

---

## 📝 Best Practices

### For PDF Catalog Creators

1. **Be Explicit**: Clearly state all technical specifications
2. **Use Standard Terminology**: Use industry-standard terms (R11, PEI 4, etc.)
3. **Organize by Product**: Group all product information together
4. **Include Units**: Always include units (mm, kg/m³, etc.)
5. **Provide Certifications**: List all certifications and standards

### For Platform Users

1. **Review Extracted Metadata**: Always review AI-extracted metadata for accuracy
2. **Use Filters**: Filter products by metadata fields for precise searches
3. **Check Confidence Scores**: Pay attention to confidence scores for critical fields
4. **Report Issues**: Report incorrect extractions to improve AI models

### For Developers

1. **Validate Critical Fields**: Always validate critical fields (material_category, factory_name)
2. **Handle Missing Data**: Gracefully handle missing metadata fields
3. **Use JSONB Queries**: Leverage PostgreSQL JSONB queries for efficient filtering
4. **Monitor Extraction Quality**: Track extraction accuracy and confidence scores

---

## 🔧 Troubleshooting

### Common Issues

**Issue**: Metadata not extracted
- **Cause**: PDF text not readable (scanned images)
- **Solution**: Use OCR preprocessing or manual entry

**Issue**: Incorrect metadata values
- **Cause**: Ambiguous or unclear PDF content
- **Solution**: Review and manually correct in admin panel

**Issue**: Missing metadata fields
- **Cause**: Information not present in PDF
- **Solution**: Add missing information manually or contact supplier

**Issue**: Low confidence scores
- **Cause**: Weak or implicit information in PDF
- **Solution**: Review and validate manually

---

## 📚 Related Documentation

- [Metadata Management System](./metadata-management-system.md) - Complete metadata architecture
- [PDF Processing Pipeline](./pdf-processing-pipeline.md) - Full PDF processing flow
- [Product Discovery Architecture](./product-discovery-architecture.md) - Product discovery details
- [API Endpoints](./api-endpoints.md) - Complete API reference

---

**Last Updated**: 2025-01-12
**Version**: 2.0 (Comprehensive Metadata Extraction)

### ⚡ 4. Performance

**Purpose**: Technical performance metrics and ratings

**Fields** (8 total):
- `water_resistance` - Water resistance rating
- `water_absorption` - Water absorption class (e.g., "Class 3", "<0.5%")
- `fire_rating` - Fire resistance rating (e.g., "A1", "B-s1,d0")
- `slip_resistance` - Slip resistance (e.g., "R11", "R10")
- `wear_rating` - Wear resistance rating (e.g., "PEI 4", "Class 3")
- `abrasion_resistance` - Abrasion resistance level
- `tensile_strength` - Tensile strength measurement
- `breaking_strength` - Breaking strength (e.g., "1200 N")
- `hardness` - Material hardness (e.g., "Mohs 7")

---

### 🔧 5. Application

**Purpose**: Usage recommendations and installation guidance

**Fields** (6 total):
- `recommended_use` - Recommended applications (e.g., "residential flooring", "wall cladding")
- `application` - Application type
- `installation_method` - Installation method (e.g., "adhesive", "floating", "nailed")
- `room_type` - Suitable room types (e.g., "bathroom", "kitchen", "living room")
- `traffic_level` - Traffic level suitability (e.g., "high traffic", "residential")
- `care_instructions` - Care and maintenance instructions
- `maintenance` - Maintenance requirements

