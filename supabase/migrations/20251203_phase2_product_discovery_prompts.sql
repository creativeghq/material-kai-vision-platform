-- Phase 2: Product Discovery Prompts Migration
-- Insert default prompts for product discovery and vision extraction

-- 1. Product Vision Extraction Prompt (for Llama 4 Scout Vision)
-- Note: Using 'image_analysis' stage and 'products' category for vision-based extraction
INSERT INTO extraction_prompts (
  workspace_id,
  stage,
  category,
  prompt_template,
  system_prompt,
  is_custom,
  version,
  created_at,
  updated_at
) VALUES (
  'ffafc28b-1b8b-4b0d-b226-9f9a6154004e',  -- Default workspace
  'image_analysis',
  'products',
  'Analyze this product catalog image and extract ALL product information visible. This is a material/design catalog page.{context}

Extract and return in JSON format:
{
  "products": [
    {
      "product_name": "<exact product name from image>",
      "product_code": "<product code/SKU if visible>",
      "dimensions": {"width": "<value>", "height": "<value>", "depth": "<value>"},
      "colors": ["<color1>", "<color2>"],
      "materials": ["<material1>", "<material2>"],
      "finish": "<matte/glossy/satin/textured/etc>",
      "pattern": "<solid/striped/geometric/etc>",
      "designer": "<designer name if visible>",
      "collection": "<collection name if visible>",
      "description": "<brief description>",
      "confidence": <0.0-1.0>
    }
  ],
  "page_type": "<product_page/moodboard/collection_overview/technical_specs>",
  "layout_type": "<single_product/multi_product/grid/comparison_table>",
  "text_extracted": ["<any text visible in image>"]
}

IMPORTANT:
- Extract ALL products visible on the page (there may be multiple)
- Pay special attention to tables, diagrams, and technical specifications
- Extract dimensions even if they''re in tables or diagrams
- Look for product codes, SKUs, or reference numbers
- Identify designer/studio names (e.g., "ESTUDI{{H}}AC", "SG NY")
- Note finish types (matte, glossy, polished, textured, etc.)
- Respond ONLY with valid JSON, no additional text.',
  'You are an expert at analyzing product catalog images and extracting structured product information.',
  false,  -- Default prompt
  1,
  NOW(),
  NOW()
) ON CONFLICT (workspace_id, stage, category, version) DO UPDATE
SET 
  prompt_template = EXCLUDED.prompt_template,
  system_prompt = EXCLUDED.system_prompt,
  updated_at = NOW();

-- 2. Product Discovery Default Prompt (already exists in database - this is v2 with enhanced instructions)
-- Updating existing discovery/products prompt with more comprehensive instructions
INSERT INTO extraction_prompts (
  workspace_id,
  stage,
  category,
  prompt_template,
  system_prompt,
  is_custom,
  version,
  created_at,
  updated_at
) VALUES (
  'ffafc28b-1b8b-4b0d-b226-9f9a6154004e',
  'discovery',
  'products',
  'You are analyzing a material/product catalog PDF with {total_pages} pages.

Your task is to identify and extract PRODUCTS with ALL metadata (inseparable).

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
- Variants: color, finish, texture
- Factory: factory name, group, manufacturer, country
- Technical: slip resistance, fire rating, thickness, water absorption, finish, material
- Image pages: full page range of product spread

{agent_context}

**OUTPUT FORMAT (JSON):**
```json
{
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
        "factory": "Castellón Factory",
        "material": "ceramic"
      }
    }
  ]
}
```',
  'You are an expert at analyzing product catalogs and identifying main featured products with comprehensive metadata extraction.',
  false,
  2,  -- Version 2 (v1 already exists)
  NOW(),
  NOW()
) ON CONFLICT (workspace_id, stage, category, version) DO UPDATE
SET
  prompt_template = EXCLUDED.prompt_template,
  system_prompt = EXCLUDED.system_prompt,
  updated_at = NOW();

-- Log migration
DO $$
BEGIN
  RAISE NOTICE 'Phase 2 Migration Complete: Inserted 2 product discovery prompts (image_analysis/products v1, discovery/products v2)';
END $$;

