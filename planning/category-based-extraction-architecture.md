# Category-Based Extraction Architecture

## Executive Summary

This document outlines the complete redesign of the PDF extraction pipeline to support **dynamic, category-based extraction** instead of the current boolean `focused_extraction` flag. The new system will:

1. **Replace boolean `focused_extraction`** with **category-based extraction** (e.g., "products", "certificates", "logos")
2. **Support NLP-based prompts** from agents (e.g., "extract products and certificates")
3. **Maintain consistency** across all processing stages (chunks, images, products, metafields)
4. **Preserve relevancy** of chunks and all existing magic
5. **Ensure metafields** are properly extracted and linked for ANY category
6. **Make it configurable** from the admin panel

---

## Current State Analysis

### **Current Architecture Issues**

1. **Boolean `focused_extraction` is too simplistic**
   - Only True/False, doesn't specify WHAT to extract
   - Assumes "products" is the only category
   - Doesn't support future categories (certificates, logos, specifications)

2. **Two conflicting endpoints**
   - `/documents/upload-with-discovery` - Uses Claude discovery (CORRECT)
   - `/documents/upload-focused` - Uses hardcoded product names (WRONG)
   - Should consolidate into ONE endpoint

3. **Inconsistent behavior when `focused_extraction=False`**
   - Chunks: Extracted from ALL pages ✅
   - Images: Extracted from ALL pages ✅
   - Products: Still only from discovery ✅
   - BUT: No way to specify WHAT to extract from those pages

4. **Metafield extraction is product-centric**
   - Only extracts metafields for products
   - Doesn't support metafields for certificates, logos, etc.
   - No dynamic metafield creation for new categories

---

## Proposed Solution: Category-Based Extraction

### **1. Replace `focused_extraction` with `extraction_mode`**

**Current**:
```python
focused_extraction: bool = True  # Too simple
extract_categories: str = "products"  # Partially addresses it
```

**Proposed**:
```python
categories: str = "products"  # "products", "certificates", "logos", "specifications", "all"
```

### **2. Stage 0: Enhanced Product Discovery**

**Current**: Identifies products only

**Proposed**: Identify ALL content types and classify by category

```python
class EnhancedProductCatalog:
    products: List[ProductInfo]
    certificates: List[CertificateInfo]  # NEW
    logos: List[LogoInfo]  # NEW
    specifications: List[SpecificationInfo]  # NEW
    page_classification: Dict[int, ContentClassification]
    metafield_categories: Dict[str, List[str]]
```

### **3. Stage 1: Category-Based Extraction**

**Current Logic**:
```python
if focused_extraction:
    product_pages = {5, 6, 7, 8, 9, 10, 11}
else:
    product_pages = {1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11}
```

**Proposed Logic**:
```python
categories = ["products", "certificates"]
pages_to_process = set()

for category in categories:
    if category == "products":
        pages_to_process.update(catalog.product_pages)
    elif category == "certificates":
        pages_to_process.update(catalog.certificate_pages)
    elif category == "all":
        pages_to_process = set(range(1, total_pages + 1))

# Track category for each page
page_to_category = {}
for page in pages_to_process:
    page_to_category[page] = determine_page_category(page, catalog)
```

### **4. Stages 2-5: Category-Aware Processing**

**Stage 2 (Chunking)**:
- Create chunks from `pages_to_process`
- Tag each chunk with its category
- Extract category-specific metafields

**Stage 3 (Images)**:
- Extract images from `pages_to_process`
- Tag each image with its category
- Analyze based on category

**Stage 4 (Entity Creation)**:
- Create products, certificates, logos, specifications
- All from discovery results

**Stage 5 (Metafield Linking)**:
- Link metafields to products, chunks, images
- Support category-specific metafields
- Create new metafields if not in database

---

## Implementation Plan

### **Phase 1: API Endpoint Updates**

**Consolidate endpoints**:
```python
@router.post("/documents/upload")
async def upload_pdf(
    file: UploadFile,
    categories: str = "products",
    discovery_model: str = "claude",
    custom_prompt: Optional[str] = None,
):
```

**Remove**:
- `/documents/upload-focused` (deprecated)
- `/documents/upload-with-discovery` (consolidate)

### **Phase 2: Product Discovery Service**

**Update `ProductDiscoveryService`**:
1. Add category classification to Claude prompt
2. Return `EnhancedProductCatalog` with all categories
3. Support custom prompts from agents

### **Phase 3: Processing Pipeline**

**Update `process_document_with_discovery`**:
1. Accept `categories` parameter
2. Build `pages_to_process` based on categories
3. Pass category info through all stages
4. Track category for each chunk, image, product

### **Phase 4: Metafield Extraction**

**Update `MetafieldExtractionService`**:
1. Support category-specific metafields
2. Extract for certificates, logos, specifications
3. Create new metafields if not in database
4. Link to correct entity type

### **Phase 5: Admin Panel**

**New admin features**:
1. Category Management
2. Metafield Mapping
3. Custom Prompts
4. Extraction History

---

## NLP-Based Prompt Support

**User/Agent sends**:
```
"extract products and certificates from this catalog"
```

**System processes**:
1. Parse prompt with NLP to extract categories
2. Map to system categories: ["products", "certificates"]
3. Pass to extraction pipeline
4. Return results

---

## Database Schema Updates

**New Fields**:
```sql
ALTER TABLE document_chunks ADD COLUMN category VARCHAR(50);
ALTER TABLE document_images ADD COLUMN category VARCHAR(50);

CREATE TABLE certificates (
    id UUID PRIMARY KEY,
    document_id UUID,
    name VARCHAR(255),
    type VARCHAR(100),
    pages INT[],
    metadata JSONB,
    created_at TIMESTAMP
);

CREATE TABLE logos (
    id UUID PRIMARY KEY,
    document_id UUID,
    name VARCHAR(255),
    pages INT[],
    image_id UUID,
    metadata JSONB,
    created_at TIMESTAMP
);

CREATE TABLE specifications (
    id UUID PRIMARY KEY,
    document_id UUID,
    title VARCHAR(255),
    pages INT[],
    content TEXT,
    metadata JSONB,
    created_at TIMESTAMP
);
```

---

## Consistency Across Stages

### **When `categories=["products"]`**:
- ✅ Stage 0: Identify product pages
- ✅ Stage 1: Build `pages_to_process = product_pages`
- ✅ Stage 2: Create chunks from product pages only
- ✅ Stage 3: Extract images from product pages only
- ✅ Stage 4: Create products from discovery
- ✅ Stage 5: Link metafields to products

### **When `categories=["all"]`**:
- ✅ Stage 0: Identify all content
- ✅ Stage 1: Build `pages_to_process = all pages`
- ✅ Stage 2: Create chunks from all pages
- ✅ Stage 3: Extract images from all pages
- ✅ Stage 4: Create all entities
- ✅ Stage 5: Link metafields to all entities

---

## Metafield Handling for ANY Category

1. **Extract metafields** from discovered content
2. **Identify metafield types** (200+ types supported)
3. **Create metafield records** if not in database
4. **Create metafield_values** for each value
5. **Link to correct entity** (product, certificate, logo, chunk, image)
6. **Store confidence scores** and extraction method
7. **Enable search and filtering**

---

## Success Criteria

✅ All API endpoints updated to use categories  
✅ No debug issues when `categories=["all"]`  
✅ Metafields extracted for ANY category  
✅ NLP prompts supported from agents  
✅ Admin panel configurable  
✅ Backward compatible during migration  
✅ All tests passing  
✅ Documentation complete  

---

## Timeline

- **Week 1**: API endpoint updates + Phase 1 implementation
- **Week 2**: Product discovery service updates
- **Week 3**: Processing pipeline updates + testing
- **Week 4**: Metafield extraction updates + admin panel
- **Week 5**: Migration + deprecation + cleanup

