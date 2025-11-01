# Dynamic Metafield Extraction Strategy

## Problem Statement

**Your Question**: "How do we define pages to process? Based on AI step, it defines which pages have the products. But as we need to extract also meta that are related to it (existing categories for example), it also needs to search for those, no? Without an extra category added or definition, meta needs to always be included, like for example Size, Colors etc. How that will be handled?"

**The Issue**:
- Current approach: Extract metafields ONLY from product pages
- Problem: Metafields like "Size", "Color", "Material" might appear on non-product pages (cover pages, specification sheets, etc.)
- Result: Missing metafield data even though it's in the PDF

**Solution**: **Dynamic, multi-source metafield extraction** that searches the ENTIRE PDF for metafields, regardless of category boundaries.

---

## Architecture Overview

### **Key Principle**

```
Pages to Process (for chunks/images) ≠ Pages to Search for Metafields

┌─────────────────────────────────────────────────────────────┐
│ ENTIRE PDF (All Pages 1-11)                                 │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ Metafield Search Scope (ALL PAGES)                   │   │
│  │ - Search for: Size, Color, Material, Finish, etc.    │   │
│  │ - Link to: Products, Certificates, Logos, Specs      │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ Content Processing Scope (Selected Pages)            │   │
│  │ - Categories: ["products", "certificates"]           │   │
│  │ - Pages: [5, 6, 7, 8, 9, 10, 11] (product pages)    │   │
│  │ - Create: Chunks, Images, Products                   │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## Three-Layer Metafield Extraction

### **Layer 1: Global Metafields (ALL PAGES)**

**Scope**: Search entire PDF for universal metafields

**Metafields**:
- Material composition
- Color
- Size/Dimensions
- Finish
- Pattern
- Weight
- Texture
- Designer
- Brand
- Collection

**Why**: These appear everywhere - cover pages, spec sheets, product pages

**Example**:
```
Page 1 (Cover): "NOVA Collection by SG NY"
  → Extract: Designer="SG NY", Collection="NOVA"

Page 2 (Spec Sheet): "Available in 5 colors: White, Black, Gray, Beige, Taupe"
  → Extract: Color=["White", "Black", "Gray", "Beige", "Taupe"]

Page 5 (Product): "NOVA Tile - 300x600mm, White, Matte Finish"
  → Extract: Size="300x600mm", Color="White", Finish="Matte"
```

### **Layer 2: Category-Specific Metafields (SELECTED PAGES)**

**Scope**: Search only pages in `pages_to_process` for category-specific metafields

**For Products**:
- Slip resistance (R11, R10, etc.)
- Fire rating (A1, A2-s1, d0, etc.)
- Water absorption
- Durability rating
- Installation method
- Maintenance instructions

**For Certificates**:
- Certification type (EPD, LEED, FSC)
- Issue date
- Expiry date
- Certifying body
- Standard compliance

**For Logos**:
- Logo type (company, certification, brand)
- Color scheme
- Brand name
- Logo dimensions

**For Specifications**:
- Specification type (installation, technical, care)
- Page count
- Language
- Technical details

**Example**:
```
Pages to Process: [5, 6, 7, 8, 9, 10, 11] (products)

Page 5: "NOVA Tile - R11 Slip Resistance, A1 Fire Rating"
  → Extract: SlipResistance="R11", FireRating="A1"

Page 2 (NOT in pages_to_process): "EPD Certificate - Valid until 2026"
  → Skip: Don't extract certificate metafields here
  → But: Extract global metafields (Designer, Brand, etc.)
```

### **Layer 3: Entity-Specific Metafields (LINKED ENTITIES)**

**Scope**: Extract metafields specific to discovered entities

**For Each Product**:
- Product name
- Product type
- Variants
- Related products
- Complementary products

**For Each Certificate**:
- Certificate ID
- Scope of certification
- Linked products

**For Each Logo**:
- Logo name
- Logo usage rights
- Brand guidelines

**Example**:
```
Product: NOVA
  → Extract: ProductName="NOVA", ProductType="Tile", Variants=["300x600", "600x600"]

Certificate: EPD-2023-001
  → Extract: CertificateID="EPD-2023-001", Scope="Ceramic Tiles"
```

---

## Implementation Strategy

### **Stage 0: Enhanced Product Discovery**

```python
async def discover_products_and_metafields(
    pdf_text: str,
    total_pages: int,
    categories: List[str]
) -> EnhancedProductCatalog:
    """
    Discover products AND identify all metafields in PDF
    """

    prompt = f"""
    Analyze this PDF and:

    1. IDENTIFY PRODUCTS (pages {categories})
       - Product name, pages, dimensions, variants
       - Product-specific metafields: slip resistance, fire rating, etc.

    2. IDENTIFY GLOBAL METAFIELDS (ALL PAGES)
       - Material composition
       - Color (all variations mentioned)
       - Size/Dimensions (all sizes mentioned)
       - Designer/Brand/Collection
       - Finish, Pattern, Texture
       - Weight, Density

    3. IDENTIFY CATEGORY-SPECIFIC METAFIELDS
       - Certificates: type, dates, body
       - Logos: type, colors, brand
       - Specifications: type, details

    Return JSON with:
    {{
        "products": [...],
        "global_metafields": {{
            "material_composition": ["Ceramic", "White Body"],
            "color": ["White", "Black", "Gray", "Beige", "Taupe"],
            "size": ["300x600mm", "600x600mm"],
            "designer": "SG NY",
            "collection": "NOVA",
            "finish": ["Matte", "Glossy"]
        }},
        "category_metafields": {{
            "products": ["slip_resistance", "fire_rating", "water_absorption"],
            "certificates": ["certification_type", "issue_date"],
            "logos": ["logo_type", "color_scheme"]
        }},
        "metafield_sources": {{
            "material_composition": {{"pages": [1, 2, 5, 6], "confidence": 0.95}},
            "color": {{"pages": [2, 5, 6, 7], "confidence": 0.92}},
            "slip_resistance": {{"pages": [5, 6, 7], "confidence": 0.98}}
        }}
    }}
    """

    # Call Claude
    response = await claude_client.messages.create(
        model="claude-sonnet-4-5",
        max_tokens=4000,
        messages=[{"role": "user", "content": prompt}]
    )

    # Parse and return
    catalog = parse_discovery_response(response)
    return catalog
```

### **Stage 1: Build Processing Scope**

```python
async def build_extraction_scopes(
    catalog: EnhancedProductCatalog,
    categories: List[str],
    total_pages: int
) -> ExtractionScopes:
    """
    Define three extraction scopes
    """

    # Scope 1: Pages to process for content (chunks, images)
    pages_to_process, page_to_category = await build_pages_to_process(
        catalog, categories, total_pages
    )

    # Scope 2: Global metafield search (ALL PAGES)
    global_metafield_pages = set(range(1, total_pages + 1))

    # Scope 3: Category-specific metafield search (SELECTED PAGES)
    category_metafield_pages = {}
    for category in categories:
        if category == "products":
            category_metafield_pages["products"] = pages_to_process
        elif category == "certificates":
            # Find certificate pages from discovery
            cert_pages = set()
            for cert in catalog.certificates:
                cert_pages.update(cert.page_range)
            category_metafield_pages["certificates"] = cert_pages
        # ... similar for logos, specifications

    return ExtractionScopes(
        content_pages=pages_to_process,
        page_to_category=page_to_category,
        global_metafield_pages=global_metafield_pages,
        category_metafield_pages=category_metafield_pages,
        metafield_sources=catalog.metafield_sources
    )
```
### **Stages 2-3: Extract Content with Metafield Tracking**

```python
async def extract_chunks_and_track_metafields(
    pdf_pages: List[str],
    scopes: ExtractionScopes,
    document_id: str
):
    """Extract chunks from content_pages, track metafields"""

    for page_num, page_text in enumerate(pdf_pages, 1):
        # Only process if in content_pages
        if page_num not in scopes.content_pages:
            continue

        # Create chunks
        chunks = create_semantic_chunks(page_text)

        for chunk in chunks:
            # Extract metafields from chunk content
            global_mfs = await extract_global_metafields(chunk.text)
            category = scopes.page_to_category[page_num]
            category_mfs = await extract_category_metafields(
                chunk.text, category
            )

            # Save chunk with metafields
            chunk_record = {
                'id': chunk_id,
                'document_id': document_id,
                'content': chunk.text,
                'page_number': page_num,
                'category': category,
                'metadata': {
                    'category': category,
                    'metafields_found': global_mfs + category_mfs
                }
            }
            save_chunk(chunk_record)
```

### **Stage 4: Image Processing with Metafield Extraction**

```python
async def extract_images_and_metafields(
    pdf_pages: List[str],
    scopes: ExtractionScopes,
    document_id: str
):
    """Extract images, analyze for visual metafields"""

    for page_num, page_image in enumerate(pdf_pages, 1):
        # Only process if in content_pages
        if page_num not in scopes.content_pages:
            continue

        # Extract images
        images = extract_images_from_page(page_image)

        for image in images:
            # Analyze image for visual metafields
            visual_mfs = await analyze_image_for_metafields(image)

            # Save image with metafields
            image_record = {
                'id': image_id,
                'document_id': document_id,
                'image_url': storage_url,
                'page_number': page_num,
                'category': scopes.page_to_category[page_num],
                'metadata': {
                    'category': scopes.page_to_category[page_num],
                    'metafields_found': visual_mfs
                }
            }
            save_image(image_record)
```

### **Stage 5: Metafield Linking**

```python
async def link_all_metafields(
    document_id: str,
    scopes: ExtractionScopes,
    catalog: EnhancedProductCatalog
):
    """Link metafields to products, chunks, images"""

    # 1. Link to products
    for product in catalog.products:
        product_mfs = {}

        # From discovery
        if hasattr(product, 'metafields'):
            product_mfs.update(product.metafields)

        # From chunks
        chunks = get_chunks_for_product(product.id, document_id)
        for chunk in chunks:
            for mf in chunk.metadata.get('metafields_found', []):
                product_mfs[mf['name']] = mf['value']

        # From images
        images = get_images_for_product(product.id, document_id)
        for image in images:
            for mf in image.metadata.get('metafields_found', []):
                product_mfs[mf['name']] = mf['value']

        # Link to product
        await link_product_metafields(product.id, product_mfs)

    # 2. Link to chunks
    chunks = get_all_chunks(document_id)
    for chunk in chunks:
        chunk_mfs = chunk.metadata.get('metafields_found', [])
        await link_chunk_metafields(chunk.id, chunk_mfs)

    # 3. Link to images
    images = get_all_images(document_id)
    for image in images:
        image_mfs = image.metadata.get('metafields_found', [])
        await link_image_metafields(image.id, image_mfs)
```

---

## Metafield Hierarchy

```
┌─────────────────────────────────────────────────────────────┐
│ GLOBAL METAFIELDS (Search ALL Pages)                        │
│ - Material, Color, Size, Finish, Pattern, Weight, Texture   │
│ - Designer, Brand, Collection, Studio                       │
│ - Linked to: Products, Chunks, Images                       │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ CATEGORY-SPECIFIC METAFIELDS (Search Selected Pages)        │
│                                                              │
│ Products: Slip Resistance, Fire Rating, Water Absorption    │
│ Certificates: Type, Issue Date, Expiry Date                 │
│ Logos: Type, Color Scheme, Brand Name                       │
│ Specifications: Type, Technical Details, Language           │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ ENTITY-SPECIFIC METAFIELDS (Linked to Entities)             │
│ - Product Name, Type, Variants, Related Products            │
│ - Certificate ID, Scope, Linked Products                    │
│ - Logo Name, Usage Rights, Brand Guidelines                 │
└─────────────────────────────────────────────────────────────┘
```

---

## Example: NOVA Product Processing

### **Input**
```
categories = ["products"]
pages_to_process = [5, 6, 7, 8, 9, 10, 11]
```

### **Stage 0: Discovery**
```
Global Metafields (ALL PAGES):
- Designer: "SG NY"
- Collection: "NOVA"
- Material: "Ceramic"
- Colors: ["White", "Black", "Gray", "Beige", "Taupe"]

Product Metafields (Pages 5-11):
- Product Name: "NOVA"
- Sizes: ["300x600mm", "600x600mm"]
- Slip Resistance: "R11"
- Fire Rating: "A1"
- Finish: ["Matte", "Glossy"]
```

### **Stage 2-3: Extraction**
```
Chunk from Page 5:
- Content: "NOVA Tile - 300x600mm, White, Matte Finish, R11"
- Metafields Found:
  - Global: Designer="SG NY", Collection="NOVA", Material="Ceramic"
  - Category: Size="300x600mm", Finish="Matte", SlipResistance="R11"

Image from Page 6:
- Visual Analysis: Color="White", Texture="Smooth", Finish="Matte"
- Metafields Found:
  - Global: Color="White", Material="Ceramic"
  - Visual: Texture="Smooth", Finish="Matte"
```

### **Stage 5: Linking**
```
Product NOVA:
- Global: Designer="SG NY", Collection="NOVA", Material="Ceramic"
- Colors: ["White", "Black", "Gray", "Beige", "Taupe"]
- Sizes: ["300x600mm", "600x600mm"]
- Performance: SlipResistance="R11", FireRating="A1"
- Appearance: Finish=["Matte", "Glossy"], Texture="Smooth"

Chunks:
- Chunk 1: Linked to Designer, Collection, Material, Color, Size
- Chunk 2: Linked to Designer, Collection, Material, Color, Finish

Images:
- Image 1: Linked to Color, Material, Texture, Finish
- Image 2: Linked to Color, Material, Texture, Finish
```

---

## Summary

### **Key Principles**

✅ **Global metafields** extracted from ALL pages
✅ **Category-specific metafields** extracted from selected pages
✅ **Entity-specific metafields** linked to discovered entities
✅ **Multi-source extraction** - text, images, OCR
✅ **Confidence tracking** - store extraction confidence
✅ **Relationship preservation** - link to products, chunks, images

### **Benefits**

✅ No missing metafields (even if on non-product pages)
✅ Proper categorization of metafields
✅ Flexible extraction based on categories
✅ Rich metadata for search and filtering
✅ Scalable to new categories and metafield types
