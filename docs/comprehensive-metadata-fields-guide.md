# 📚 Comprehensive Metadata Fields Guide

## 📋 Overview

The MIVAA platform extracts **200+ metadata fields** from PDF catalogs using AI-powered dynamic discovery. All metadata is organized into **9 functional categories** and stored in the `products.metadata` JSONB field in the database.

---

## 🎯 Metadata Extraction Architecture

### ⚙️ How It Works

```
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
```

### 🤖 AI Models Used

- **Primary**: Claude Sonnet 4.5 (`claude-sonnet-4-5`)
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

**Example**:
```json
{
  "material_type": "ceramic",
  "composition": "100% ceramic",
  "texture": "smooth",
  "finish": "matte",
  "pattern": "wood grain",
  "weight": "800 kg/m³",
  "density": "2.3 g/cm³",
  "durability_rating": "high"
}
```

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

**Example**:
```json
{
  "size": "15×38 cm",
  "length": "38 cm",
  "width": "15 cm",
  "thickness": "8mm",
  "area": "0.057 m²"
}
```

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

**Example**:
```json
{
  "color": "beige",
  "color_code": "RAL 1001",
  "gloss_level": "60%",
  "sheen": "satin",
  "grain": "wood grain"
}
```

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

**Example**:
```json
{
  "certifications": "ISO 9001:2015, CE certified",
  "standards": "EN 14411, ISO 10545",
  "eco_friendly": true,
  "sustainability_rating": "LEED certified",
  "voc_rating": "low VOC",
  "safety_rating": "A+"
}
```

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

**Example**:
```json
{
  "designer": "SG NY",
  "studio": "Studio Gronda",
  "collection": "Harmony Collection",
  "series": "Urban Series",
  "aesthetic_style": "contemporary",
  "design_era": "modern"
}
```

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

**Example**:
```json
{
  "factory": "Castellón Factory",
  "manufacturer": "Harmony Ceramics",
  "factory_group": "Harmony Group",
  "country_of_origin": "Spain",
  "manufacturing_process": "digital printing",
  "construction": "pressed ceramic"
}
```

---

### 💰 9. Commercial

**Purpose**: Business and commercial information

**Fields** (5 total):
- `pricing` - Price information (e.g., "€45/m²", "$50/sqft")
- `availability` - Availability status (e.g., "in stock", "made to order")
- `supplier` - Supplier name
- `sku` - SKU/product code
- `warranty` - Warranty information (e.g., "5-year warranty", "lifetime warranty")

**Example**:
```json
{
  "pricing": "€45/m²",
  "availability": "in stock",
  "supplier": "Harmony Distributors",
  "sku": "HAR-NOVA-1538",
  "warranty": "5-year warranty"
}
```

---

## 🔧 Technical Implementation

### 🗄️ Database Schema

All metadata is stored in the `products` table in the `metadata` JSONB field:

```sql
CREATE TABLE products (
  id UUID PRIMARY KEY,
  sku TEXT,
  name TEXT,
  description TEXT,
  category TEXT,
  type TEXT,
  status TEXT,
  metadata JSONB,  -- All 200+ metadata fields stored here
  properties JSONB,
  specifications JSONB,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
);
```

### 📝 Example Product Metadata

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "sku": "HAR-NOVA-1538",
  "name": "NOVA",
  "category": "ceramic_tiles",
  "metadata": {
    // Material Properties
    "material_type": "ceramic",
    "composition": "100% ceramic",
    "texture": "smooth",
    "finish": "matte",
    "pattern": "wood grain",
    "weight": "800 kg/m³",
    "density": "2.3 g/cm³",

    // Dimensions
    "size": "15×38 cm",
    "thickness": "8mm",
    "area": "0.057 m²",

    // Appearance
    "color": "beige",
    "color_code": "RAL 1001",
    "gloss_level": "60%",
    "grain": "wood grain",

    // Performance
    "water_absorption": "Class 3",
    "fire_rating": "A1",
    "slip_resistance": "R11",
    "wear_rating": "PEI 4",
    "breaking_strength": "1200 N",

    // Application
    "recommended_use": "residential flooring",
    "installation_method": "adhesive installation",
    "room_type": "bathroom, kitchen",
    "traffic_level": "high traffic areas",

    // Compliance
    "certifications": "ISO 9001:2015, CE certified",
    "standards": "EN 14411",
    "eco_friendly": true,
    "voc_rating": "low VOC",

    // Design
    "designer": "SG NY",
    "collection": "Harmony Collection",
    "aesthetic_style": "contemporary",

    // Manufacturing
    "factory": "Castellón Factory",
    "factory_group": "Harmony Group",
    "country_of_origin": "Spain",

    // Commercial
    "pricing": "€45/m²",
    "availability": "in stock",
    "warranty": "5-year warranty",

    // Extraction Metadata
    "_extraction_metadata": {
      "extraction_timestamp": "2025-01-12T10:30:00Z",
      "extraction_method": "ai_dynamic_claude",
      "model_used": "claude-sonnet-4-5",
      "confidence_score": 0.92,
      "validation_passed": true
    }
  }
}
```

---

## 🚀 API Usage

### 📤 Extract Metadata from PDF

**Endpoint**: `POST /api/rag/process-pdf`

**Request**:
```bash
curl -X POST "https://v1api.materialshub.gr/api/rag/process-pdf" \
  -H "Content-Type: multipart/form-data" \
  -F "file=@harmony-catalog.pdf" \
  -F "extract_categories=products,certificates,logos"
```

**Response**:
```json
{
  "job_id": "job_abc123",
  "status": "processing",
  "message": "PDF processing started",
  "products_discovered": 14,
  "metadata_extraction": "in_progress"
}
```

### 📥 Get Product with Metadata

**Endpoint**: `GET /api/products/{product_id}`

**Request**:
```bash
curl -X GET "https://v1api.materialshub.gr/api/products/550e8400-e29b-41d4-a716-446655440000"
```

**Response**:
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "sku": "HAR-NOVA-1538",
  "name": "NOVA",
  "category": "ceramic_tiles",
  "metadata": {
    "material_type": "ceramic",
    "size": "15×38 cm",
    "thickness": "8mm",
    "slip_resistance": "R11",
    "fire_rating": "A1",
    "designer": "SG NY",
    "factory": "Castellón Factory",
    "country_of_origin": "Spain",
    // ... all other metadata fields
  }
}
```

### 🔍 Search Products by Metadata

**Endpoint**: `POST /api/search/products`

**Request**:
```bash
curl -X POST "https://v1api.materialshub.gr/api/search/products" \
  -H "Content-Type: application/json" \
  -d '{
    "filters": {
      "metadata.slip_resistance": "R11",
      "metadata.fire_rating": "A1",
      "metadata.country_of_origin": "Spain"
    }
  }'
```

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
```
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
```

---

## 🔍 How Metadata Extraction Works

### Step-by-Step Process

#### 1. PDF Upload
```
User uploads PDF → MIVAA API receives file → Job created
```

#### 2. Product Discovery (Stage 0A)
```python
# ProductDiscoveryService discovers products
catalog = await discovery_service.discover_products(
    pdf_content=pdf_bytes,
    pdf_text=pdf_text,
    extract_categories=["products"]
)

# Result: Products with basic metadata
{
  "products": [
    {
      "name": "NOVA",
      "page_range": [5, 8],
      "metadata": {
        "designer": "SG NY",
        "dimensions": ["15×38", "20×40"],
        "variants": ["matte", "glossy"]
      }
    }
  ]
}
```

#### 3. Metadata Enrichment (Stage 0B)
```python
# For each product, extract comprehensive metadata
for product in catalog.products:
    # Extract product-specific text
    product_text = extract_product_text(pdf_text, product.page_range)

    # Initialize DynamicMetadataExtractor
    extractor = DynamicMetadataExtractor(model="claude", job_id=job_id)

    # Extract 200+ metadata fields
    extracted = await extractor.extract_metadata(
        pdf_text=product_text,
        category_hint=product.metadata.get("category")
    )

    # Result: Comprehensive metadata
    {
      "critical": {
        "material_category": "ceramic",
        "factory_name": "Castellón Factory",
        "factory_group_name": "Harmony Group"
      },
      "discovered": {
        "material_type": "ceramic",
        "size": "15×38 cm",
        "thickness": "8mm",
        "slip_resistance": "R11",
        "fire_rating": "A1",
        "water_absorption": "Class 3",
        "breaking_strength": "1200 N",
        "color": "beige",
        "gloss_level": "60%",
        "designer": "SG NY",
        "collection": "Harmony Collection",
        "country_of_origin": "Spain",
        // ... 180+ more fields
      },
      "metadata": {
        "extraction_timestamp": "2025-01-12T10:30:00Z",
        "extraction_method": "ai_dynamic_claude",
        "confidence_score": 0.92
      }
    }
```

#### 4. Metadata Merging
```python
# Merge metadata with priority: discovery > critical > discovered
product.metadata = {
    **extracted["discovered"],      # 200+ dynamic fields
    **extracted["critical"],         # Critical fields
    **product.metadata,              # Discovery metadata (highest priority)
    "_extraction_metadata": extracted["metadata"]
}
```

#### 5. Database Storage
```python
# Store product with comprehensive metadata
await db.products.insert({
    "id": uuid.uuid4(),
    "sku": "HAR-NOVA-1538",
    "name": "NOVA",
    "category": "ceramic_tiles",
    "metadata": product.metadata  # All 200+ fields stored here
})
```

#### 6. Frontend Display
```typescript
// ProductDetailModal displays metadata by category
const materialProperties = {
  'Material Type': metadata.material_type,
  'Texture': metadata.texture,
  'Finish': metadata.finish,
  // ... other material properties
};

const performance = {
  'Slip Resistance': metadata.slip_resistance,
  'Fire Rating': metadata.fire_rating,
  // ... other performance metrics
};

// Render each category dynamically
```

---

## 🎯 Confidence Scoring

Each extracted metadata field has a confidence score (0.0-1.0):

- **0.9-1.0**: High confidence - explicitly stated in PDF
- **0.7-0.9**: Medium-high confidence - strongly implied
- **0.5-0.7**: Medium confidence - inferred from context
- **0.3-0.5**: Low-medium confidence - weak inference
- **0.0-0.3**: Low confidence - uncertain extraction

**Example**:
```json
{
  "slip_resistance": {
    "value": "R11",
    "confidence": 0.95,
    "source": "page 6, line 23"
  },
  "color": {
    "value": "beige",
    "confidence": 0.85,
    "source": "inferred from image description"
  }
}
```

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

**Example**:
```json
{
  "water_absorption": "Class 3",
  "fire_rating": "A1",
  "slip_resistance": "R11",
  "wear_rating": "PEI 4",
  "breaking_strength": "1200 N",
  "hardness": "Mohs 7"
}
```

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

**Example**:
```json
{
  "recommended_use": "residential flooring",
  "installation_method": "adhesive installation",
  "room_type": "bathroom, kitchen",
  "traffic_level": "high traffic areas",
  "care_instructions": "clean with mild detergent",
  "maintenance": "low maintenance"
}
```

---


