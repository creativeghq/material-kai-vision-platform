# Metafield Quick Reference

## 🎯 What Are Metafields?

Structured metadata attributes extracted from PDFs and linked to products, chunks, and images.

**Examples**: Material, Color, Dimensions, Texture, Finish, Weight, Application, Certifications, Pricing

---

## 🔄 5-Stage Metafield Processing

### Stage 0: Identify (0-15%)
**AI**: Claude Sonnet 4.5 / GPT-4o
- Analyze PDF
- Identify products
- Detect metafield types
- **Output**: Product catalog with metafield types

### Stage 2: Extract from Text (30-50%)
**AI**: Anthropic Claude
- Create semantic chunks
- Preserve metafield info
- Generate embeddings (1536D)
- **Output**: Chunks with metafield metadata

### Stage 3: Extract from Images (50-70%)
**AI**: Llama Vision + CLIP
- Analyze images
- Detect colors, texture, finish
- Generate embeddings (512D)
- **Output**: Images with visual metafields

### Stage 4: Consolidate (70-90%)
**AI**: Claude Haiku 4.5 → Claude Sonnet 4.5
- Merge metafields from all sources
- Validate completeness
- Create product records
- **Output**: Product with consolidated metafields

### Stage 12: Link (95-97%)
**Process**: Extract & Link
- Parse metafield values
- Create database records
- Link to products/chunks/images
- **Output**: metafield_values in database

---

## 📊 Metafield Types (200+)

| Category | Examples | Count |
|----------|----------|-------|
| **Material** | Composition, Texture, Finish, Pattern, Weight | 20+ |
| **Dimensions** | Length, Width, Height, Thickness, Diameter | 10+ |
| **Appearance** | Color, Gloss, Surface, Transparency, Grain | 15+ |
| **Performance** | Durability, Water Resistance, Fire Rating | 15+ |
| **Application** | Use, Installation, Maintenance, Care | 20+ |
| **Compliance** | Certifications, Standards, Safety | 15+ |
| **Commercial** | Pricing, Availability, Lead Time, SKU | 20+ |
| **Other** | Designer, Studio, Category, Variants | 20+ |

---

## 💾 Database Schema

### metafields table
```sql
id UUID PRIMARY KEY
workspace_id UUID
name VARCHAR(255)           -- "material", "color", "dimensions"
type VARCHAR(50)            -- "text", "number", "select", "multiselect"
metadata JSONB
created_at TIMESTAMP
```

### metafield_values table
```sql
id UUID PRIMARY KEY
metafield_id UUID           -- Links to metafields
product_id UUID             -- Links to products
chunk_id UUID               -- Links to document_chunks
image_id UUID               -- Links to document_images
value_text VARCHAR(1000)    -- Text value
value_number FLOAT          -- Numeric value
value_boolean BOOLEAN       -- Boolean value
value_date DATE             -- Date value
value_json JSONB            -- Complex value
confidence_score FLOAT      -- 0.0-1.0
extraction_method VARCHAR   -- "ai_extraction", "ocr", "manual"
created_at TIMESTAMP
```

---

## 🔍 Extraction Accuracy

| Metric | Accuracy |
|--------|----------|
| Product Detection | 95%+ |
| Material Recognition | 90%+ |
| Metafield Extraction | 88%+ |
| Dimension Extraction | 92%+ |
| Color Detection | 94%+ |
| Texture Detection | 85%+ |

---

## 🚀 API Quick Reference

### Get Product with Metafields
```http
GET /api/products/{product_id}

Response: {
  "id": "prod_456",
  "name": "VALENOVA",
  "metafields": {
    "material": "White Body Tile",
    "dimensions": "11.8×11.8",
    "finish": "matte"
  }
}
```

### Search by Metafields
```http
GET /api/search/properties?material=ceramic&color=white

Response: {
  "products": [...],
  "count": 15
}
```

### Get Metafield Values
```http
GET /api/products/{product_id}/metafields

Response: {
  "metafields": [
    {
      "field_id": "mf_001",
      "name": "material",
      "value": "White Body Tile",
      "confidence_score": 0.98,
      "extraction_method": "ai_extraction"
    }
  ]
}
```

---

## 📈 Processing Flow

```
PDF Upload
    ↓
Stage 0: Identify metafield types (Claude)
    ↓
Stage 1: Extract product pages
    ↓
Stage 2: Create chunks with metafield info (Anthropic)
    ↓
Stage 3: Analyze images for visual metafields (Llama + CLIP)
    ↓
Stage 4: Create products, consolidate metafields (Claude)
    ↓
Stage 12: Link metafields to database (Extract & Link)
    ↓
✅ Complete - All metafields extracted and linked
```

---

## 🔗 Linking Relationships

```
Product
  ├── product_metafield_values
  │   └── metafield_id → metafields
  │
  ├── document_chunks
  │   └── chunk_metafield_values
  │       └── metafield_id → metafields
  │
  └── document_images
      └── image_metafield_values
          └── metafield_id → metafields
```

---

## ✅ Key Features

✅ Automatic identification of metafield types
✅ Multi-source extraction (text, images, chunks)
✅ Confidence scoring (0.0-1.0)
✅ Extraction method tracking (AI, OCR, manual)
✅ 200+ metafield types supported
✅ Relationship linking (products, chunks, images)
✅ Search integration
✅ Dynamic metafield creation
✅ Type validation
✅ Multi-value support

---

## 📝 Example: VALENOVA Product

### Identified Metafields (Stage 0)
```json
{
  "material": "White Body Tile",
  "dimensions": "11.8×11.8",
  "finish": "Matte",
  "colors": ["clay", "sand", "white", "taupe"],
  "patterns": "12 patterns"
}
```

### Extracted from Chunks (Stage 2)
```json
{
  "dimensions": "11.8×11.8 inches",
  "material": "White Body Tile",
  "patterns": "12 patterns"
}
```

### Extracted from Images (Stage 3)
```json
{
  "colors": ["clay", "sand", "white", "taupe"],
  "texture": "matte",
  "finish": "smooth",
  "material_type": "ceramic"
}
```

### Final Product Record (Stage 4)
```json
{
  "name": "VALENOVA",
  "metafields": {
    "material": "White Body Tile",
    "dimensions": ["11.8×11.8"],
    "finish": "matte",
    "colors": ["clay", "sand", "white", "taupe"],
    "patterns": "12 patterns",
    "designer": "SG NY",
    "studio": "Stacy Garcia",
    "category": "tiles"
  }
}
```

### Database Records (Stage 12)
```sql
-- Product metafield
INSERT INTO product_metafield_values
VALUES ('uuid_1', 'prod_456', 'mf_001', 'White Body Tile', 0.98, 'ai_extraction');

-- Chunk metafield
INSERT INTO chunk_metafield_values
VALUES ('uuid_2', 'chunk_123', 'mf_002', '11.8×11.8', 0.95, 'ai_extraction');

-- Image metafield
INSERT INTO image_metafield_values
VALUES ('uuid_3', 'img_789', 'mf_003', 'matte', 0.92, 'ai_extraction');
```

---

## 🎯 Best Practices

1. **Validate Confidence** - Use metafields with confidence > 0.85
2. **Link Multiple Sources** - Link same metafield to product, chunks, images
3. **Support Multiple Values** - Use multiselect for colors, patterns, variants
4. **Track Extraction Method** - Document AI, OCR, or manual extraction
5. **Monitor Accuracy** - Track extraction accuracy over time
6. **Update Regularly** - Refresh when products are updated

---

## 📚 Related Docs

- **Full Guide**: `docs/metafield-extraction-guide.md`
- **Workflow**: `docs/metafield-workflow-summary.md`
- **Pipeline**: `docs/pdf-processing-pipeline.md`
- **Database**: `docs/database-schema-complete.md`
- **API**: `docs/api-endpoints.md`

