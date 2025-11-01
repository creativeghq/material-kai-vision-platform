# Consistency Guarantees & Metafield Handling

## Overview

This document ensures that the category-based extraction system maintains consistency across all processing stages and properly handles metafields for ANY category.

---

## Consistency Guarantees

### **Guarantee 1: Same Pages Processed Across All Stages**

**Problem**: Currently, chunks are filtered by `focused_extraction` but images are not, causing inconsistency.

**Solution**: Use single `pages_to_process` set throughout pipeline.

```python
# Stage 1: Build pages_to_process
pages_to_process, page_to_category = await build_pages_to_process(
    catalog, categories, total_pages
)

# Stage 2: Chunking - Use pages_to_process
for chunk in chunks:
    if chunk.page_number in pages_to_process:
        save_chunk(chunk)

# Stage 3: Images - Use pages_to_process
for image in images:
    if image.page_number in pages_to_process:
        save_image(image)

# Stage 4: Products - Use discovery (always correct)
for product in catalog.products:
    save_product(product)

# Stage 5: Metafields - Use pages_to_process
for chunk in chunks:
    if chunk.page_number in pages_to_process:
        link_metafields(chunk)
```

### **Guarantee 2: Category Tags Consistent**

**Problem**: Images might have different category than chunks from same page.

**Solution**: Use `page_to_category` mapping for all entities.

```python
# All entities from same page get same category
page_num = 5
category = page_to_category[page_num]  # "product"

# Chunk from page 5
chunk.category = category  # "product"

# Image from page 5
image.category = category  # "product"

# Metafield from page 5
metafield.category = category  # "product"
```

### **Guarantee 3: Metafields Linked to Correct Entities**

**Problem**: Metafields might be linked to wrong entity type.

**Solution**: Track entity type and category together.

```python
# For chunks
chunk_metafield = {
    'chunk_id': chunk_id,
    'field_id': field_id,
    'entity_type': 'chunk',
    'category': 'product',
    'value': value
}

# For products
product_metafield = {
    'product_id': product_id,
    'field_id': field_id,
    'entity_type': 'product',
    'category': 'product',
    'value': value
}

# For certificates
cert_metafield = {
    'certificate_id': cert_id,
    'field_id': field_id,
    'entity_type': 'certificate',
    'category': 'certificate',
    'value': value
}
```

### **Guarantee 4: No Data Loss**

**Problem**: When switching categories, might lose previously extracted data.

**Solution**: Append to existing data, don't replace.

```python
# When re-extracting with different categories
existing_chunks = get_chunks(document_id)  # 16 chunks
new_chunks = extract_chunks(document_id, categories=["certificates"])  # 2 new chunks

# Result: 18 chunks total (16 + 2)
# NOT: 2 chunks (replaced)

# Track which extraction added which chunks
chunk.metadata.extraction_categories = ["products", "certificates"]
```

---

## Metafield Handling for ANY Category

### **Step 1: Identify Metafields During Discovery**

**Stage 0 - Product Discovery**:
```python
# Claude identifies metafields for each category
catalog.metafield_categories = {
    "products": [
        "slip_resistance",
        "fire_rating",
        "thickness",
        "water_absorption"
    ],
    "certificates": [
        "certification_type",
        "issue_date",
        "expiry_date",
        "certifying_body"
    ],
    "logos": [
        "logo_type",
        "color",
        "brand_name"
    ],
    "specifications": [
        "spec_type",
        "page_count",
        "language"
    ]
}
```

### **Step 2: Create Metafield Records**

**Stage 5 - Metafield Linking**:
```python
async def ensure_metafields_exist(
    metafield_names: List[str],
    category: str,
    workspace_id: str
):
    """Create metafield records if they don't exist"""

    for name in metafield_names:
        # Check if metafield exists
        existing = supabase.client.table('metafields').select('*').eq(
            'name', name
        ).eq('workspace_id', workspace_id).execute()

        if not existing.data:
            # Create new metafield
            metafield = {
                'id': str(uuid4()),
                'workspace_id': workspace_id,
                'name': name,
                'type': 'text',  # Default type
                'category': category,  # NEW: Track category
                'metadata': {
                    'auto_created': True,
                    'created_from_extraction': True,
                    'discovered_category': category
                }
            }
            supabase.client.table('metafields').insert(metafield).execute()
```

### **Step 3: Extract Metafield Values**

**For Products**:
```python
product_metafields = {
    'slip_resistance': 'R11',
    'fire_rating': 'A1',
    'thickness': '8mm',
    'water_absorption': 'Class 3'
}

for field_name, value in product_metafields.items():
    # Get or create metafield
    metafield = ensure_metafield_exists(field_name, 'products')

    # Create metafield value
    metafield_value = {
        'id': str(uuid4()),
        'product_id': product_id,
        'field_id': metafield['id'],
        'value_text': str(value),
        'confidence_score': 0.95,
        'extraction_method': 'ai_extraction',
        'category': 'product'
    }
    supabase.client.table('product_metafield_values').insert(
        metafield_value
    ).execute()
```

### **Step 4: Link Metafields to Chunks and Images**

```python
async def link_chunk_metafields(
    chunk_id: str,
    page_num: int,
    category: str,
    document_id: str
):
    """Link metafields to chunk based on page content"""

    # Get chunk content
    chunk = get_chunk(chunk_id)

    # Extract metafields from chunk content
    extracted_metafields = await extract_metafields_from_text(
        chunk.content,
        category
    )

    # Link each metafield
    for field_name, value in extracted_metafields.items():
        metafield = ensure_metafield_exists(field_name, category)

        metafield_value = {
            'id': str(uuid4()),
            'chunk_id': chunk_id,
            'field_id': metafield['id'],
            'value_text': str(value),
            'confidence_score': 0.85,
            'extraction_method': 'ai_extraction',
            'category': category
        }
        supabase.client.table('chunk_metafield_values').insert(
            metafield_value
        ).execute()
```

---

## Database Schema for Metafields

### **New Tables**

```sql
-- Metafield values for certificates
CREATE TABLE certificate_metafield_values (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    certificate_id UUID NOT NULL REFERENCES certificates(id),
    field_id UUID NOT NULL REFERENCES metafields(id),
    value_text VARCHAR(1000),
    confidence_score FLOAT DEFAULT 0.8,
    extraction_method VARCHAR(50),
    category VARCHAR(50),
    created_at TIMESTAMP DEFAULT NOW()
);

-- Metafield values for logos
CREATE TABLE logo_metafield_values (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    logo_id UUID NOT NULL REFERENCES logos(id),
    field_id UUID NOT NULL REFERENCES metafields(id),
    value_text VARCHAR(1000),
    confidence_score FLOAT DEFAULT 0.8,
    extraction_method VARCHAR(50),
    category VARCHAR(50),
    created_at TIMESTAMP DEFAULT NOW()
);

-- Metafield values for specifications
CREATE TABLE specification_metafield_values (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    specification_id UUID NOT NULL REFERENCES specifications(id),
    field_id UUID NOT NULL REFERENCES metafields(id),
    value_text VARCHAR(1000),
    confidence_score FLOAT DEFAULT 0.8,
    extraction_method VARCHAR(50),
    category VARCHAR(50),
    created_at TIMESTAMP DEFAULT NOW()
);

-- Add category column to existing tables
ALTER TABLE product_metafield_values ADD COLUMN category VARCHAR(50);
ALTER TABLE chunk_metafield_values ADD COLUMN category VARCHAR(50);
ALTER TABLE image_metafield_values ADD COLUMN category VARCHAR(50);
ALTER TABLE metafields ADD COLUMN category VARCHAR(50);

-- Create indexes
CREATE INDEX idx_cert_metafield_values_cert ON certificate_metafield_values(certificate_id);
CREATE INDEX idx_logo_metafield_values_logo ON logo_metafield_values(logo_id);
CREATE INDEX idx_spec_metafield_values_spec ON specification_metafield_values(specification_id);
CREATE INDEX idx_metafields_category ON metafields(category);
```

---

## Validation & Testing

### **Consistency Checks**

```python
async def validate_extraction_consistency(
    document_id: str,
    categories: List[str]
):
    """Validate that extraction is consistent across all stages"""

    # Get all entities
    chunks = get_chunks(document_id)
    images = get_images(document_id)

    # Check 1: All chunks have category
    for chunk in chunks:
        assert chunk.category is not None, f"Chunk {chunk.id} missing category"

    # Check 2: All images have category
    for image in images:
        assert image.category is not None, f"Image {image.id} missing category"

    # Check 3: All metafields have category
    metafields = get_metafields(document_id)
    for mf in metafields:
        assert mf.category is not None, f"Metafield {mf.id} missing category"

    logger.info(f"✅ Extraction consistency validated for {document_id}")
```

---

## Summary

✅ Same pages processed across all stages
✅ Category tags consistent for all entities
✅ Metafields linked to correct entity types
✅ No data loss when re-extracting
✅ Metafields extracted for ANY category
✅ New metafields created if not in database
✅ Confidence scores stored
✅ Extraction method tracked

