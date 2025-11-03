# ⚡ Quick Reference: Chunks vs Metadata vs Embeddings

## Three Different Things

### **1. CHUNKS** 📚
- **What:** Full text content from PDF
- **Where:** `document_chunks` table
- **Example:** "NOVA Tile - Premium porcelain ceramic, R11 class, Beige color, 15×38 size"
- **Use:** Detailed search, full content access
- **Query:** Search by text embedding (semantic)

### **2. METADATA** 🏷️
- **What:** Extracted structured attributes
- **Where:** `products.metadata` JSONB field
- **Example:** `{"material_type": "Porcelain", "class": "R11", "color": "Beige"}`
- **Use:** Fast filtering, exact matching
- **Query:** Direct filter (WHERE metadata->>'class' = 'R11')

### **3. EMBEDDINGS** 🔢
- **What:** Numerical vectors for search
- **Where:** `embeddings` table (chunks), `products` table (products), `document_images` table (images)
- **Example:** `[0.23, -0.45, 0.67, ...]` (1536 dimensions)
- **Use:** Semantic search, similarity matching
- **Query:** Vector similarity (WHERE embedding <-> query_embedding < 0.5)

---

## Your Question: "If we keep them as chunks, can't we just search?"

### **Answer: YES! ✅**

```
Chunks contain: "NOVA Tile - Porcelain, R11, Beige, 15×38"
                ↓
Text Embedding: [0.23, -0.45, 0.67, ...]
                ↓
User searches: "Find R11 tiles"
                ↓
Search embedding: [0.21, -0.43, 0.65, ...]
                ↓
Compare: similarity(text_embedding, search_embedding) = 0.98 ✅
                ↓
Result: Found! Return chunk + product
```

**This works perfectly!** You can find everything by searching chunks.

---

## Your Question: "Why delete color/texture embeddings if we want to extract them later?"

### **Answer: They're redundant! ❌**

```
color_embedding_256 = downsample(text_embedding_1536)
                    = same information, just smaller
                    = WASTE OF STORAGE
```

**You can extract color later from:**
1. **Metadata:** `product.metadata.color` (instant)
2. **Chunks:** Search chunks for "color" (semantic)
3. **Text embedding:** Already contains color info

**You don't need a separate color_embedding_256!**

---

## Two Ways to Access Attributes

### **Way 1: Fast (Metadata)**
```python
# Already extracted during product creation
color = product['metadata']['color']  # "Beige"
class = product['metadata']['class']  # "R11"
# Speed: ⚡ Instant
```

### **Way 2: Search (Chunks)**
```python
# Search chunks if not in metadata
chunks = search_chunks("What color is this?", product_id)
# Extract from chunk text
# Speed: ⚡ Fast (vector search)
```

**Both work! Use metadata for fast access, use chunks for detailed search.**

---

## What to Keep vs Delete

### **KEEP ✅**
- `text_embedding_1536` (chunks) - Semantic search
- `text_embedding_1536` (products) - Product search
- `visual_clip_embedding_512` (images) - Visual search
- `multimodal_fusion_embedding_2048` (images) - Combined search
- `metadata` JSONB (products) - Structured attributes

### **DELETE ❌**
- `color_embedding_256` - Redundant with text_embedding_1536
- `texture_embedding_256` - Redundant with text_embedding_1536
- `application_embedding_512` - Redundant with text_embedding_1536

---

## Real Example: NOVA Tile

### **What Gets Stored:**

```
CHUNKS TABLE:
├─ id: chunk-123
├─ content: "NOVA Tile - Premium porcelain ceramic, R11 class, Beige color, 15×38 size"
└─ text_embedding_1536: [0.23, -0.45, 0.67, ...]

PRODUCTS TABLE:
├─ id: product-789
├─ name: "NOVA Tile"
├─ metadata: {
│   "material_type": "Porcelain",
│   "class": "R11",
│   "color": "Beige",
│   "sizes": ["15×38", "20×40"]
│ }
├─ text_embedding_1536: [0.24, -0.44, 0.68, ...]
└─ source_chunks: ["chunk-123"]
```

### **How to Access:**

```python
# Get color
color = product['metadata']['color']  # "Beige" ✅

# Search for R11 tiles
results = search("R11 tiles")  # Uses text_embedding_1536 ✅

# Get full content
chunks = get_chunks(product['source_chunks'])  # Full text ✅
```

---

## The Flow

```
1. PDF → Extract text
2. Text → Create chunks (full content)
3. Chunks → Generate text_embedding_1536
4. Chunks → Extract attributes → Store in metadata
5. User searches:
   - Exact: Use metadata filter
   - Fuzzy: Use text_embedding_1536
   - Visual: Use visual_clip_embedding_512
```

---

## Why This Architecture?

| Need | Solution | Why |
|------|----------|-----|
| Full text content | Chunks | Preserve everything |
| Fast exact filtering | Metadata | Indexed, instant |
| Semantic search | text_embedding_1536 | Finds similar meanings |
| Visual search | visual_clip_embedding_512 | Image similarity |
| Extract attributes later | Metadata + Chunks | Both available |

---

## Bottom Line

✅ **Keep chunks** - They have everything
✅ **Extract to metadata** - For fast filtering
✅ **Use text_embedding_1536** - For semantic search
❌ **Delete fake embeddings** - They're redundant

**You can access attributes in TWO ways:**
1. Fast: From metadata
2. Search: From chunks

**No need for separate color/texture/application embeddings!**

