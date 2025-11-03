# 📋 How to Extract & Store Product Attributes (Material Type, R11, Color, etc.)

## Current Flow (What You Have)

```
PDF → Chunks → Product Creation → Product.metadata JSONB
                                   ↓
                          {
                            "material_type": "Porcelain",
                            "class": "R11",
                            "color": "Beige",
                            "factory_name": "Castellón",
                            "sizes": ["15×38", "20×40"],
                            "texture": "Matte"
                          }
```

---

## ✅ CORRECT: Store Attributes in Product.metadata

### **Product Table Structure:**
```sql
CREATE TABLE products (
  id UUID PRIMARY KEY,
  name VARCHAR(255),
  description TEXT,
  source_document_id UUID,
  workspace_id UUID,
  
  -- ALL attributes stored here as JSONB
  metadata JSONB,
  
  -- Embeddings for search
  text_embedding_1536 VECTOR(1536),
  visual_clip_embedding_512 VECTOR(512),
  multimodal_fusion_embedding_2048 VECTOR(2048),
  
  created_at TIMESTAMP,
  updated_at TIMESTAMP
);
```

### **Example Product Record:**
```json
{
  "id": "uuid-123",
  "name": "NOVA Tile",
  "description": "Premium porcelain tile...",
  "metadata": {
    "material_type": "Porcelain",
    "class": "R11",
    "color": "Beige",
    "factory_name": "Castellón Factory",
    "sizes": ["15×38", "20×40"],
    "texture": "Matte",
    "designer": "SG NY",
    "page_range": [86, 97],
    "confidence": 0.95
  },
  "text_embedding_1536": [0.23, -0.45, ...],
  "visual_clip_embedding_512": [0.12, 0.34, ...],
  "multimodal_fusion_embedding_2048": [...]
}
```

---

## 🔍 How Attributes Are Extracted

### **Stage 1: From Chunks**
```python
# Chunks contain: "Porcelain tile, R11 class, Beige color, 15×38 size"
chunk_text = "NOVA Tile - Premium porcelain ceramic, R11 slip resistance, Beige color, 15×38 and 20×40 sizes"

# Extract attributes using regex + AI
attributes = {
  "material_type": extract_material_type(chunk_text),  # "Porcelain"
  "class": extract_class(chunk_text),                  # "R11"
  "color": extract_color(chunk_text),                  # "Beige"
  "sizes": extract_sizes(chunk_text),                  # ["15×38", "20×40"]
  "texture": extract_texture(chunk_text)               # "Matte"
}
```

### **Stage 2: From Image Analysis**
```python
# Image analysis returns material properties
image_analysis = {
  "material_properties": {
    "color": "Beige",
    "finish": "Matte",
    "texture": "Smooth",
    "composition": "Porcelain"
  }
}

# Merge with chunk attributes
attributes.update(image_analysis["material_properties"])
```

### **Stage 3: Store in Product.metadata**
```python
product_data = {
  "name": "NOVA Tile",
  "description": "...",
  "metadata": {
    **attributes,  # All extracted attributes
    "source_chunks": [chunk_id_1, chunk_id_2],
    "related_images": [image_id_1, image_id_2],
    "extraction_confidence": 0.95
  }
}

supabase.client.table('products').insert(product_data).execute()
```

---

## 🔎 How to Query Attributes

### **1. Exact Match (Fast):**
```sql
-- Find all Porcelain tiles with R11 class
SELECT * FROM products 
WHERE metadata->>'material_type' = 'Porcelain'
AND metadata->>'class' = 'R11'
```

### **2. Array Contains (Fast):**
```sql
-- Find products with specific size
SELECT * FROM products 
WHERE metadata->'sizes' @> '"15×38"'
```

### **3. Semantic Search (Fuzzy):**
```sql
-- Find products similar to query
SELECT * FROM products 
WHERE text_embedding_1536 <-> query_embedding < 0.5
ORDER BY text_embedding_1536 <-> query_embedding
LIMIT 10
```

### **4. Combined Search:**
```sql
-- Find Porcelain tiles that look similar to image
SELECT * FROM products 
WHERE metadata->>'material_type' = 'Porcelain'
AND visual_clip_embedding_512 <-> image_embedding < 0.3
ORDER BY visual_clip_embedding_512 <-> image_embedding
```

---

## 📊 Attribute Extraction Patterns

### **Material Type:**
```python
patterns = [
  r'(porcelain|ceramic|stone|marble|granite|tile|wood|metal)',
  r'(natural stone|engineered stone|composite)'
]
```

### **Class (R11, R12, etc.):**
```python
pattern = r'r[-\s]?(?:value|rating|class)?\s*[:\-]?\s*(r?(?:9|10|11|12|13))'
# Matches: "R11", "R-11", "R 11", "R value 11", "Class R11"
```

### **Color:**
```python
colors = [
  'beige', 'brown', 'white', 'black', 'gray', 'red', 'blue',
  'cream', 'taupe', 'charcoal', 'ivory'
]
```

### **Sizes:**
```python
pattern = r'(\d+)\s*[×x]\s*(\d+)'
# Matches: "15×38", "20x40", "15 × 38"
```

### **Texture:**
```python
textures = [
  'matte', 'glossy', 'polished', 'rough', 'smooth',
  'textured', 'embossed', 'natural'
]
```

---

## ❌ What NOT to Do

### **DON'T create embeddings for attributes:**
```python
# WRONG - Don't do this!
color_embedding = generate_embedding("Beige")  # Wasteful
class_embedding = generate_embedding("R11")    # Redundant
```

### **DON'T store attributes separately:**
```python
# WRONG - Don't do this!
CREATE TABLE product_attributes (
  product_id UUID,
  attribute_name VARCHAR,
  attribute_value VARCHAR
);
```

### **DON'T use fuzzy matching for exact data:**
```python
# WRONG - Don't do this!
SELECT * FROM products 
WHERE similarity(color_embedding, beige_embedding) > 0.8
```

---

## ✅ Summary: Best Practice

| Task | Method | Storage | Query |
|------|--------|---------|-------|
| Store R11 class | metadata JSONB | `metadata->>'class'` | Exact match |
| Store color | metadata JSONB | `metadata->>'color'` | Exact match |
| Store sizes | metadata JSONB array | `metadata->'sizes'` | Array contains |
| Semantic search | Text embedding | `text_embedding_1536` | Vector similarity |
| Visual search | CLIP embedding | `visual_clip_embedding_512` | Vector similarity |

**Your current architecture is CORRECT!** Just ensure all attributes are extracted to metadata.

