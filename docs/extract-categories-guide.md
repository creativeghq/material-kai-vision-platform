# Extract Categories Guide

## Overview

The `extract_categories` parameter allows you to control **what content** is extracted from PDFs during processing. This enables focused extraction of specific content types (products, certificates, logos, specifications) while skipping irrelevant content.

---

## How It Works

### **1. Product Discovery (Stage 0)**
Claude/GPT analyzes the **entire PDF** and classifies content into categories:
- **Products**: Product specifications, materials, dimensions
- **Certificates**: Environmental certifications (EPD, LEED, etc.)
- **Logos**: Company logos, brand marks
- **Specifications**: Technical specifications, installation guides
- **Other**: Marketing content, company history, administrative pages

### **2. Focused Extraction (Stage 1)**
Based on `focused_extraction` and `extract_categories` parameters:
- If `focused_extraction=True`: Extract **only** pages matching `extract_categories`
- If `focused_extraction=False`: Extract **all** pages (ignore `extract_categories`)

### **3. Content Processing (Stages 2-5)**
- **Chunks**: Created only from extracted pages
- **Images**: Saved only from extracted pages (filtered by category)
- **Products**: Created from Claude discovery results
- **Embeddings**: Generated for extracted content only

---

## API Parameters

### **`focused_extraction`** (boolean, default: `True`)
Controls whether to filter content by categories.

- **`True`**: Process only pages matching `extract_categories`
- **`False`**: Process entire PDF (all pages, all images)

### **`extract_categories`** (string, default: `"products"`)
Comma-separated list of categories to extract.

**Available Categories**:
- `products` - Product pages (Fully Implemented)
- `certificates` - Certification pages (Planned)
- `logos` - Logo/branding pages (Planned)
- `specifications` - Technical specification pages (Planned)
- `all` - All content (same as `focused_extraction=False`)

**Examples**:
```
extract_categories="products"                    # Only products
extract_categories="products,certificates"       # Products + certificates
extract_categories="all"                         # Everything
```

---

## Use Cases

### **Use Case 1: Product Catalog (Default)**
Extract only product information, skip marketing/admin content.

```bash
POST /api/rag/documents/upload-with-discovery
{
  "file": "catalog.pdf",
  "focused_extraction": true,
  "extract_categories": "products"
}
```

**Result**:
- Chunks from product pages only
- Images from product pages only
- Products created from discovery
- Marketing content skipped
- Company history skipped

---

### **Use Case 2: Products + Certificates**
Extract products and environmental certifications.

```bash
POST /api/rag/documents/upload-with-discovery
{
  "file": "catalog.pdf",
  "focused_extraction": true,
  "extract_categories": "products,certificates"
}
```

**Result** (when certificates category is implemented):
- Chunks from product pages
- Chunks from certificate pages
- Images from product pages
- Images from certificate pages
- Products created
- Certificates extracted and linked to products

---

### **Use Case 3: Full PDF Processing**
Extract everything from the PDF.

```bash
POST /api/rag/documents/upload-with-discovery
{
  "file": "catalog.pdf",
  "focused_extraction": false
}
```

**OR**:

```bash
POST /api/rag/documents/upload-with-discovery
{
  "file": "catalog.pdf",
  "focused_extraction": true,
  "extract_categories": "all"
}
```

**Result**:
- Chunks from all pages
- Images from all pages
- Products created from discovery
- All content processed

---

## Implementation Status

### Fully Implemented: Products Category

**How it works**:
1. Claude analyzes PDF → identifies products on pages 5-11
2. `product_pages = {5, 6, 7, 8, 9, 10, 11}`
3. If `extract_categories="products"`:
   - Chunks created from pages 5-11 only
   - Images saved from pages 5-11 only
   - Products created from discovery

**Code Location**: `mivaa-pdf-extractor/app/api/rag_routes.py`
- Lines 2057-2071: Product page filtering
- Lines 2202-2264: Image filtering by category

---

### Planned Categories

**Certificates, Logos, Specifications** are planned for future implementation.

**Implementation Requirements**:
1. Update Product Discovery Service to classify content into categories
2. Add category-specific page sets (like `product_pages`, add `certificate_pages`, `logo_pages`, etc.)
3. Update image filtering logic to handle multiple categories
4. Create database tables for certificates, logos, specifications
5. Add API endpoints to retrieve category-specific content

**Current Implementation**:
The codebase includes placeholder support for additional categories. The `products` category is fully functional and serves as the template for implementing additional categories.

---

## Database Schema

### **Image Metadata**
Images now include category information:

```json
{
  "id": "uuid",
  "document_id": "uuid",
  "page_number": 5,
  "image_url": "https://...",
  "metadata": {
    "category": "product",              // NEW: Image category
    "extract_categories": ["products"], // NEW: What was requested
    "focused_extraction": true,
    "product_page": true
  }
}
```

---

## Migration Path

### Phase 1: Products Only (Current)
- Extract products
- Filter images by product pages
- Skip non-product content

### Phase 2: Add Certificates
- Update Claude prompt to identify certificate pages
- Create `certificates` table
- Link certificates to products
- Filter images by certificate pages

### Phase 3: Add Logos & Specifications
- Identify logo pages (usually first few pages)
- Identify specification pages (technical details)
- Create appropriate database tables
- Link to products

### Phase 4: Advanced Classification
- AI-powered content classification
- Automatic category detection
- Smart filtering based on user preferences

---

## Testing

### **Test 1: Products Only (Default)**
```bash
curl -X POST "https://v1api.materialshub.gr/api/rag/documents/upload-with-discovery" \
  -F "file=@harmony.pdf" \
  -F "focused_extraction=true" \
  -F "extract_categories=products"
```

**Expected**:
- Images only from product pages (5-11)
- Chunks only from product pages
- Non-product pages skipped

### **Test 2: Full PDF**
```bash
curl -X POST "https://v1api.materialshub.gr/api/rag/documents/upload-with-discovery" \
  -F "file=@harmony.pdf" \
  -F "focused_extraction=false"
```

**Expected**:
- Images from all pages (1-11)
- Chunks from all pages
- All content processed

---

## Summary

### Current Behavior
- `extract_categories="products"` → Only product pages processed
- `focused_extraction=True` → Filtering enabled
- `focused_extraction=False` → All content processed
- Image metadata includes category information

### Future Enhancements
- Implement `certificates` category
- Implement `logos` category
- Implement `specifications` category
- Add category-specific database tables
- Add category-specific API endpoints

### Key Benefits
- **Focused Processing**: Only extract what you need
- **Cost Savings**: Skip irrelevant content (fewer AI calls)
- **Faster Processing**: Less content to process
- **Cleaner Data**: No marketing/admin clutter
- 🔧 **Configurable**: Choose what to extract per upload

