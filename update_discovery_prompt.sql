-- Update Product Discovery Prompt with Enhanced Variant Extraction
UPDATE prompts 
SET 
  prompt_text = 'You are analyzing a material/product catalog PDF with {total_pages} pages.

**FIRST: EXTRACT DOCUMENT-LEVEL INFORMATION**
Look at the cover page, intro pages, and headers/footers to identify:
1. **catalog_factory**: The main factory/brand name for this catalog (e.g., "HARMONY", "Porcelanosa")
2. **catalog_factory_group**: The parent company or group (e.g., "Peronda Group", "Porcelanosa Group")
3. **catalog_manufacturer**: The manufacturer if different from factory

This information typically appears on:
- Cover page (large logo/brand name)
- Footer/header of pages
- "About Us" or intro sections
- Copyright notices

**THEN: Your task is to identify and extract PRODUCTS with ALL metadata (inseparable).**

**PRODUCTS (with ALL metadata - inseparable):**
- Identify ONLY MAIN FEATURED PRODUCTS with dedicated presentations
- EXCLUDE products that appear only in:
  * Index pages (table of contents, product lists, thumbnails)
  * Cross-references or "related products" sections
  * Small preview images or catalog grids
  * Footer/header references

**PRODUCT IDENTIFICATION CRITERIA (use ANY of these):**

1. **Page Spread Method**: Dedicated page spread (1-12 pages), large hero images, detailed descriptions
2. **Metadata Presence Method**: Comprehensive metadata (name, dimensions, designer, specs, factory)
3. **Visual Prominence Method**: Large product image (>30% of page), prominent typography
4. **Content Depth Method**: Detailed description (>100 words), technical specs table

**CRITICAL RULES:**
- Product in BOTH index AND dedicated section = count ONLY dedicated section
- Product with ONLY thumbnail in index = EXCLUDE
- Product with comprehensive metadata even on 1 page = INCLUDE
- When in doubt, INCLUDE the product

**Extract ALL available metadata:**
- Basic: name, description, category
- Design: designer, studio
- Dimensions: all size variants
- Variants: SKU codes, colors, shapes, patterns, sizes
- Factory: factory name, group, manufacturer, country
- Technical: slip resistance, fire rating, thickness, water absorption, finish, material
- Packaging: pieces per box, boxes per pallet, weight, coverage
- Image pages: full page range of product spread

{agent_context}

**OUTPUT FORMAT (JSON):**
```json
{
  "catalog_factory": "HARMONY",
  "catalog_factory_group": "Peronda Group",
  "catalog_manufacturer": "Peronda Group",
  "products": [
    {
      "name": "NOVA",
      "description": "Modern ceramic tile collection",
      "page_range": [12, 13, 14],
      "image_pages": [12, 13],
      "confidence": 0.95,
      "metadata": {
        "designer": "SG NY",
        "dimensions": ["15×38", "20×40"],
        "factory_name": "HARMONY",
        "factory_group_name": "Peronda Group",
        "material_category": "Ceramic Tile",
        
        "variants": [
          {
            "sku": "37885",
            "name": "FOLD WHITE/15X38",
            "color": "WHITE",
            "shape": "FOLD",
            "pattern": null,
            "size": "15×38",
            "pattern_count": null,
            "mapei_code": "100"
          },
          {
            "sku": "40123",
            "name": "CHEVRON OAK/20X120",
            "color": "OAK",
            "shape": null,
            "pattern": "CHEVRON",
            "size": "20×120",
            "pattern_count": null,
            "mapei_code": null
          }
        ],
        
        "available_colors": ["clay", "sand", "white", "taupe"],
        
        "packaging": {
          "pieces_per_box": 12,
          "boxes_per_pallet": 48,
          "weight_per_box_kg": 18.5,
          "coverage_per_box_m2": 1.14,
          "coverage_per_box_sqft": 12.27
        }
      }
    }
  ]
}
```

**CRITICAL: Product Variant Extraction Rules**

Products often have multiple SKU codes representing different variants (colors, shapes, patterns, sizes).
You MUST identify the MAIN PRODUCT NAME and extract ALL variants as separate entries.

**Example 1 - Color & Shape Variants:**
```
37885 FOLD WHITE/15X38
37889 FOLD CLAY/15X38
38343 TRI. FOLD WHITE/7X14,8
```

**Extraction:**
- Main Product: "FOLD"
- Variants:
  * SKU 37885: color="WHITE", shape="FOLD", size="15×38"
  * SKU 37889: color="CLAY", shape="FOLD", size="15×38"
  * SKU 38343: color="WHITE", shape="TRI. FOLD", size="7×14.8"

**Example 2 - Pattern Variants:**
```
39656 VALENOVA WHITE LT/11,8X11,8
12 patterns · * 100 Mapei
```

**Extraction:**
- Main Product: "VALENOVA"
- Variants:
  * SKU 39656: color="WHITE LT", size="11.8×11.8", pattern_count=12, mapei_code="100"

**Variant Extraction Rules:**
1. **Identify the base product name** (e.g., "FOLD", "VALENOVA", "NOVA")
2. **Extract ALL SKU codes** - typically 5-digit numbers at start of each line
3. **Parse variant attributes:**
   - Color: Extract color name (WHITE, CLAY, GREEN, SAND, TAUPE, etc.)
   - Shape/Pattern: Extract shape OR pattern modifier (TRI., RECT., HEX., CHEVRON, HERRINGBONE, etc.)
   - Size: Extract dimensions (15×38, 11.8×11.8, etc.)
4. **Extract pattern count** if mentioned (e.g., "12 patterns")
5. **Extract reference codes** (Mapei codes, Kerakoll codes, etc.)
6. **Extract available colors from lists** - Look for color lists like "clay · sand · white · taupe"
7. **DO NOT create separate products for each color** - they are variants of the SAME product
8. **DO NOT confuse product names with colors** - "VALENOVA CLAY" is product "VALENOVA" with color "CLAY"

**Color List Extraction:**
When you see color lists like:
```
VALENOVA by SG NY
White Body Tile
11,8x11,8 cm
clay · sand · white · taupe
```

Extract as:
- Product: "VALENOVA"
- Available colors: ["clay", "sand", "white", "taupe"]
- If SKUs are listed separately for each color, create full variants
- If only color list is shown, store as "available_colors" in metadata

**Packaging Details Extraction (CRITICAL for Quote Management):**

Extract ALL packaging information found in the PDF:
- **pieces_per_box**: Number of pieces/tiles per box
- **boxes_per_pallet**: Number of boxes per pallet
- **weight_per_box_kg**: Weight per box in kilograms
- **weight_per_box_lb**: Weight per box in pounds (if provided)
- **coverage_per_box_m2**: Coverage area per box in square meters
- **coverage_per_box_sqft**: Coverage area per box in square feet

Common patterns to look for:
- "12 pcs/box", "pieces per box: 12"
- "48 boxes/pallet", "boxes per pallet: 48"
- "18.5 kg/box", "weight: 18.5 kg"
- "1.14 m²/box", "coverage: 1.14 m²"
- "12.27 sqft/box", "coverage: 12.27 sqft"

**IMPORTANT:**
- ALWAYS extract catalog_factory from cover/intro pages - this is the brand that makes ALL products
- Products inherit factory_name from catalog_factory if not specified individually
- Use consistent field names: factory_name (not factory), factory_group_name (not factory_group), material_category (not category)
- Each variant MUST have: sku, name (full variant name), color, size
- Optional variant fields: shape, pattern, pattern_count, mapei_code, kerakoll_code
- ALWAYS extract packaging details when available - critical for quote calculations',
  updated_at = NOW()
WHERE id = 'be3ce539-677b-4a09-974a-e43d6faf7b0e'
RETURNING id, name, updated_at;

