# Complete Extraction Architecture - Full System Design

## Executive Summary

This document defines the complete PDF extraction architecture that answers all your questions about:
1. How pages are defined for processing
2. How metafields are extracted regardless of category
3. How consistency is maintained across all stages
4. How the system works when `focused_extraction=False`

---

## System Architecture Overview

### **The Problem We're Solving**

**Old Approach**:
```
User uploads PDF with categories=["products"]
  ↓
AI discovers product pages: [5, 6, 7, 8, 9, 10, 11]
  ↓
Extract chunks from pages [5-11]
Extract images from pages [5-11]
Extract metafields from pages [5-11]  ← WRONG! Missing data from pages 1-4
  ↓
Result: Missing Designer, Collection, Color variations
```

**New Approach**:
```
User uploads PDF with categories=["products"]
  ↓
AI discovers product pages: [5, 6, 7, 8, 9, 10, 11]
AI discovers global metafields: ALL PAGES
AI discovers category metafields: PRODUCT PAGES
  ↓
Extract chunks from pages [5-11]
Extract images from pages [5-11]
Extract global metafields from pages [1-11]  ← CORRECT!
Extract category metafields from pages [5-11]
  ↓
Result: Complete metafield extraction!
```

---

## Three-Scope Extraction Model

### **Scope 1: Content Processing Scope**

**Purpose**: Define which pages to create chunks and images from

**Determined by**: User's `categories` parameter + AI discovery

**Example**:
```
categories = ["products"]
AI discovers: product_pages = [5, 6, 7, 8, 9, 10, 11]
content_pages = [5, 6, 7, 8, 9, 10, 11]
```

**What happens**:
- Create chunks from these pages
- Extract images from these pages
- Create products from these pages

### **Scope 2: Global Metafield Search Scope**

**Purpose**: Find universal metafields that appear everywhere

**Determined by**: ALWAYS ALL PAGES (regardless of categories)

**Example**:
```
categories = ["products"]
global_metafield_pages = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]  ← ALL!
```

**What happens**:
- Search for: Material, Color, Size, Finish, Designer, Brand, Collection, etc.
- Link to: Products, Chunks, Images

**Why ALL pages**:
- Designer info on page 1 (cover)
- Color variations on page 2 (spec sheet)
- Material info on page 3 (intro)
- Product details on pages 5-11

### **Scope 3: Category-Specific Metafield Search Scope**

**Purpose**: Find metafields specific to each category

**Determined by**: User's `categories` parameter + AI discovery

**Example**:
```
categories = ["products"]
category_metafield_pages = {
  "products": [5, 6, 7, 8, 9, 10, 11]
}
```

**What happens**:
- Search for product-specific metafields: Slip Resistance, Fire Rating, etc.
- Link to: Products only

**If categories = ["products", "certificates"]**:
```
category_metafield_pages = {
  "products": [5, 6, 7, 8, 9, 10, 11],
  "certificates": [12, 13, 14]  ← Certificate pages from discovery
}
```

---

## Complete Processing Pipeline

### **Stage 0: Enhanced Product Discovery**

**Input**: Full PDF text, total pages, requested categories

**Process**:
```python
# Claude analyzes ENTIRE PDF
prompt = """
1. Identify products (pages, names, variants, metafields)
2. Identify global metafields (ALL PAGES)
3. Identify category-specific metafields (selected pages)
4. Return page numbers and confidence scores
"""

response = {
  "products": [
    {
      "name": "NOVA",
      "page_range": [5, 6, 7, 8, 9, 10, 11],
      "metafields": {
        "slip_resistance": "R11",
        "fire_rating": "A1"
      }
    }
  ],
  "global_metafields": {
    "designer": "SG NY",
    "collection": "NOVA",
    "material": "Ceramic",
    "color": ["White", "Black", "Gray", "Beige", "Taupe"],
    "finish": ["Matte", "Glossy"]
  },
  "metafield_sources": {
    "designer": {"pages": [1, 2], "confidence": 0.95},
    "color": {"pages": [2, 5, 6, 7], "confidence": 0.92},
    "slip_resistance": {"pages": [5, 6, 7], "confidence": 0.98}
  }
}
```

**Output**: EnhancedProductCatalog with all three metafield layers

### **Stage 1: Build Extraction Scopes**

**Input**: EnhancedProductCatalog, categories, total_pages

**Process**:
```python
# Define three scopes
content_pages = [5, 6, 7, 8, 9, 10, 11]
global_metafield_pages = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]
category_metafield_pages = {
  "products": [5, 6, 7, 8, 9, 10, 11]
}

# Track page categories
page_to_category = {
  5: "product", 6: "product", 7: "product", 8: "product",
  9: "product", 10: "product", 11: "product"
}
```

**Output**: ExtractionScopes object

### **Stage 2: Extract Chunks**

**Input**: PDF pages, ExtractionScopes

**Process**:
```python
for page_num in content_pages:  # [5, 6, 7, 8, 9, 10, 11]
  chunks = create_semantic_chunks(page_text)
  
  for chunk in chunks:
    # Extract global metafields from chunk
    global_mfs = extract_global_metafields(chunk.text)
    
    # Extract category metafields from chunk
    category = page_to_category[page_num]
    category_mfs = extract_category_metafields(chunk.text, category)
    
    # Save chunk with metafields
    save_chunk({
      'content': chunk.text,
      'page_number': page_num,
      'category': category,
      'metadata': {
        'metafields_found': global_mfs + category_mfs
      }
    })
```

**Output**: Chunks with metafield metadata

### **Stage 3: Extract Images**

**Input**: PDF pages, ExtractionScopes

**Process**:
```python
for page_num in content_pages:  # [5, 6, 7, 8, 9, 10, 11]
  images = extract_images_from_page(page_image)
  
  for image in images:
    # Analyze image for visual metafields
    visual_mfs = analyze_image_for_metafields(image)
    
    # Save image with metafields
    save_image({
      'image_url': storage_url,
      'page_number': page_num,
      'category': page_to_category[page_num],
      'metadata': {
        'metafields_found': visual_mfs
      }
    })
```

**Output**: Images with metafield metadata

### **Stage 4: Link Metafields**

**Input**: All extracted entities, ExtractionScopes, EnhancedProductCatalog

**Process**:
```python
# 1. Link to products
for product in catalog.products:
  product_mfs = {}
  
  # From discovery
  product_mfs.update(product.metafields)
  
  # From chunks
  for chunk in get_chunks_for_product(product.id):
    for mf in chunk.metadata['metafields_found']:
      product_mfs[mf['name']] = mf['value']
  
  # From images
  for image in get_images_for_product(product.id):
    for mf in image.metadata['metafields_found']:
      product_mfs[mf['name']] = mf['value']
  
  link_product_metafields(product.id, product_mfs)

# 2. Link to chunks
for chunk in get_all_chunks():
  link_chunk_metafields(chunk.id, chunk.metadata['metafields_found'])

# 3. Link to images
for image in get_all_images():
  link_image_metafields(image.id, image.metadata['metafields_found'])
```

**Output**: All entities linked to metafields

---

## Behavior When `categories="all"`

**Input**: `categories = "all"`

**Stage 0 Discovery**:
```
AI analyzes ENTIRE PDF
Returns: All products, certificates, logos, specifications
Returns: All global metafields
Returns: All category-specific metafields
```

**Stage 1 Scopes**:
```
content_pages = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]  ← ALL!
global_metafield_pages = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]
category_metafield_pages = {
  "products": [5, 6, 7, 8, 9, 10, 11],
  "certificates": [12, 13, 14],
  "logos": [15, 16],
  "specifications": [17, 18]
}
```

**Result**: Everything extracted, all metafields linked

---

## Consistency Guarantees

### **Guarantee 1: Same Pages Processed Across All Stages**

```
Stage 2 (Chunks): Process pages [5, 6, 7, 8, 9, 10, 11]
Stage 3 (Images): Process pages [5, 6, 7, 8, 9, 10, 11]
Stage 4 (Linking): Link from pages [5, 6, 7, 8, 9, 10, 11]
```

### **Guarantee 2: Category Tags Consistent**

```
Chunk from page 5: category = "product"
Image from page 5: category = "product"
Metafield link: category = "product"
```

### **Guarantee 3: Metafields Linked to Correct Entities**

```
Global metafields: Linked to products, chunks, images
Category metafields: Linked to products only
```

### **Guarantee 4: No Data Loss**

```
If categories = ["products"]
  → Still extract global metafields from ALL pages
  → Still extract category metafields from product pages
  → No data loss!
```

---

## Database Schema Updates

### **New Columns**

```sql
-- document_chunks
ALTER TABLE document_chunks ADD COLUMN category TEXT;
ALTER TABLE document_chunks ADD COLUMN metadata JSONB;

-- document_images
ALTER TABLE document_images ADD COLUMN category TEXT;
ALTER TABLE document_images ADD COLUMN metadata JSONB;
```

### **New Tables**

```sql
-- For certificates
CREATE TABLE certificates (
  id UUID PRIMARY KEY,
  document_id UUID REFERENCES documents(id),
  name TEXT,
  type TEXT,
  page_range INT[],
  metadata JSONB
);

-- For logos
CREATE TABLE logos (
  id UUID PRIMARY KEY,
  document_id UUID REFERENCES documents(id),
  name TEXT,
  type TEXT,
  page_range INT[],
  metadata JSONB
);

-- For specifications
CREATE TABLE specifications (
  id UUID PRIMARY KEY,
  document_id UUID REFERENCES documents(id),
  name TEXT,
  type TEXT,
  page_range INT[],
  metadata JSONB
);
```

---

## API Endpoint Updates

### **New Unified Endpoint**

```
POST /api/rag/documents/upload

Parameters:
- file: PDF file
- categories: "products" | "certificates" | "logos" | "specifications" | "all"
- discovery_model: "claude" | "gpt"
- custom_prompt: Optional NLP prompt

Response:
{
  "job_id": "...",
  "status": "processing",
  "stages": {
    "discovery": 0,
    "extraction": 0,
    "linking": 0
  }
}
```

### **Query Endpoints**

```
GET /api/rag/chunks?document_id={id}&category=products
GET /api/rag/images?document_id={id}&category=product
GET /api/rag/products?document_id={id}
GET /api/rag/certificates?document_id={id}
GET /api/rag/logos?document_id={id}
GET /api/rag/specifications?document_id={id}
GET /api/rag/metafields?document_id={id}&category=products
```

---

## Summary

✅ **Three separate scopes** for extraction  
✅ **Global metafields** from ALL pages  
✅ **Category metafields** from selected pages  
✅ **Consistency** across all stages  
✅ **No data loss** regardless of categories  
✅ **Scalable** to new categories  
✅ **Complete** metafield extraction  

---

## Related Documents

- **metafield-dynamic-extraction-strategy.md** - Detailed implementation
- **METAFIELD-STRATEGY-SUMMARY.md** - Quick reference
- **consistency-and-metafields.md** - Consistency details
- **category-based-extraction-architecture.md** - Architecture overview

