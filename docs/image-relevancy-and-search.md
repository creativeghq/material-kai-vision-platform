# Image Relevancy & Search System

**Last Updated:** 2025-01-15  
**Version:** 2.0.0  
**Status:** ✅ Production

---

## Overview

The MIVAA Image Relevancy System uses **multi-vector embeddings** and **AI-powered analysis** to link images to products, chunks, and enable intelligent image search. This system powers:

1. **Image-to-Product Linking** - Automatically connect images to products they depict
2. **Image-to-Chunk Linking** - Connect images to text chunks that reference them
3. **Image Similarity Search** - Find similar materials from uploaded images
4. **Material Recognition** - Identify materials from images and return similar products

---

## 🎯 Core Components

### 1. Multi-Vector Image Embeddings

Every image gets **5 specialized embeddings** for different search types:

| Embedding Type | Model | Dimension | Purpose |
|---------------|-------|-----------|---------|
| **Visual SigLIP** | Google SigLIP SO400M | 512 | General visual similarity (+19-29% accuracy) |
| **Color** | SigLIP (color-focused) | 512 | Color-based search |
| **Texture** | SigLIP (texture-focused) | 512 | Texture pattern matching |
| **Application** | SigLIP (use-case) | 512 | Use-case similarity |
| **Material** | SigLIP (material-focused) | 512 | Material type matching |

**Storage**: All embeddings stored in `document_images` table columns:
- `visual_clip_embedding_512`
- `color_clip_embedding_512`
- `texture_clip_embedding_512`
- `application_clip_embedding_512`
- `material_clip_embedding_512`

---

### 2. AI Image Analysis

**Two-Stage Analysis Pipeline**:

#### Stage 1: Llama 4 Scout 17B Vision (Primary)
- **Model**: `meta-llama/Llama-4-Scout-17B-16E-Instruct`
- **Purpose**: Fast, accurate material detection
- **Output**: Material type, colors, textures, quality score (0-1)
- **Storage**: `llama_analysis` JSONB column

#### Stage 2: Claude Validation (Optional)
- **Model**: Claude Sonnet 4.5
- **Purpose**: Validate low-quality Llama results
- **Trigger**: Quality score < 0.7
- **Output**: Enhanced analysis with corrections
- **Storage**: `claude_validation` JSONB column

---

## 🔗 Image Relevancy Linking

### 1. Image → Product Relationships

**Table**: `product_image_relationships`

**Relevance Algorithm**:
```
relevance_score = (page_overlap × 0.4) + (visual_similarity × 0.4) + (detection_confidence × 0.2)
```

**Components**:
- **Page Overlap (40%)**: Same page = 0.4, adjacent = 0.2, else 0.0
- **Visual Similarity (40%)**: From AI detection (default 0.3)
- **Detection Confidence (20%)**: AI confidence score (default 0.2)

**Relationship Types**:
- `depicts` - Image directly shows the product (score > 0.7)
- `illustrates` - Image illustrates product features (score 0.5-0.7)
- `variant` - Image shows a product variant (score 0.4-0.6)
- `related` - Image is related to the product (score < 0.5)

**Implementation**: `entity_linking_service.py` → `link_images_to_products()`

---

### 2. Image → Chunk Relationships

**Table**: `chunk_image_relationships`

**Relevance Algorithm**:
```
relevance_score = 1.0 if same_page else 0.5 if adjacent_page else 0.0
```

**Relationship Types**:
- `page_proximity` - Image and chunk on same/adjacent pages

**Implementation**: `entity_linking_service.py` → `link_images_to_chunks()`

---

## 🔍 Image Search Workflows

### Workflow 1: User Uploads Image from Agency

**Use Case**: Designer uploads material photo, wants similar materials

**Process**:
1. **Upload Image** → Supabase Storage (`material-images` bucket)
2. **Generate Embeddings** → Call `/api/search/material-embeddings`
   - Generates all 5 CLIP embeddings
   - Returns embedding vectors
3. **Search Similar Images** → Call `/api/images/search-similar`
   - Uses VECS service for vector similarity search
   - Searches `image_clip_embeddings` collection
   - Returns top K similar images (default: 10)
4. **Get Products** → For each similar image:
   - Query `product_image_relationships` table
   - Get products with `relevance_score > 0.5`
   - Return product details with images

**API Endpoints**:
```typescript
// Step 1: Generate embeddings
POST /api/search/material-embeddings
Body: { image_url: string, material_properties: {...} }
Response: { embeddings: { visual: [...], color: [...], ... } }

// Step 2: Search similar images
POST /api/images/search-similar
Body: { query_embedding: [...], limit: 10 }
Response: { images: [...], similarity_scores: [...] }

// Step 3: Get products for images
GET /api/products?image_ids=id1,id2,id3
Response: { products: [...] }
```

---

### Workflow 2: 3D Generation Returns Material Image

**Use Case**: 3D generation service returns rendered material, need to identify it

**Process**:
1. **Receive 3D Image** → From Mastra 3D Generation service
2. **Material Recognition** → Call `/api/images/analyze-material`
   - Uses Llama 4 Scout 17B Vision
   - Extracts: material_type, colors, textures, finish
3. **Generate Embeddings** → Automatic during analysis
   - All 5 CLIP embeddings generated
   - Stored in temporary record
4. **Search Database** → Vector similarity search
   - Query `document_images` table
   - Use `visual_clip_embedding_512 <=> query_embedding`
   - Filter by material_type if detected
5. **Return Matches** → Top similar materials
   - Include product details
   - Include relevance scores
   - Include image URLs

**API Endpoints**:
```typescript
// Combined endpoint for 3D workflow
POST /api/images/identify-material
Body: { image_url: string, context: { source: '3d_generation' } }
Response: {
  material_type: string,
  similar_products: [...],
  confidence: number,
  embeddings: {...}
}
```

---

## 📊 Database Schema

### document_images Table
```sql
CREATE TABLE document_images (
  id UUID PRIMARY KEY,
  document_id UUID REFERENCES documents(id),
  workspace_id UUID REFERENCES workspaces(id),
  image_url TEXT NOT NULL,  -- Supabase Storage URL
  storage_path TEXT,         -- Storage bucket path
  page_number INTEGER,
  
  -- AI Analysis
  llama_analysis JSONB,      -- Llama 4 Scout analysis
  claude_validation JSONB,   -- Claude validation (optional)
  
  -- Multi-Vector Embeddings (512D each)
  visual_clip_embedding_512 vector(512),
  color_clip_embedding_512 vector(512),
  texture_clip_embedding_512 vector(512),
  application_clip_embedding_512 vector(512),
  material_clip_embedding_512 vector(512),
  
  -- Metadata
  metadata JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);
```

### product_image_relationships Table
```sql
CREATE TABLE product_image_relationships (
  id UUID PRIMARY KEY,
  product_id UUID REFERENCES products(id) ON DELETE CASCADE,
  image_id UUID REFERENCES document_images(id) ON DELETE CASCADE,
  relationship_type VARCHAR(50),  -- 'depicts', 'illustrates', 'variant', 'related'
  relevance_score FLOAT CHECK (relevance_score >= 0 AND relevance_score <= 1),
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(product_id, image_id)
);

CREATE INDEX idx_product_image_relevance ON product_image_relationships(relevance_score DESC);
```

---

## 🚀 Performance Optimization

### VECS Vector Search
- **Library**: Supabase VECS (pgvector wrapper)
- **Index**: IVFFlat index on all embedding columns
- **Query Time**: < 100ms for 10K images
- **Similarity Metric**: Cosine similarity (1 - distance)

### Caching Strategy
- **Embedding Cache**: 1 hour TTL
- **Search Results**: 15 minutes TTL
- **Product Images**: CDN cached (24 hours)

---

## 🔧 Troubleshooting

### Images Not Showing in Frontend

**Common Issues**:
1. **Missing `image_url`** → Check `document_images.image_url` is populated
2. **Storage Path Wrong** → Verify `storage_path` points to correct bucket
3. **No Relationships** → Run entity linking: `entity_linking_service.link_images_to_products()`
4. **Empty Embeddings** → Check background job processed images

**Fix**:
```sql
-- Check image URLs
SELECT id, image_url, storage_path FROM document_images WHERE document_id = 'your-doc-id';

-- Check relationships
SELECT * FROM product_image_relationships WHERE product_id = 'your-product-id';

-- Check embeddings
SELECT id, 
  visual_clip_embedding_512 IS NOT NULL as has_visual,
  color_clip_embedding_512 IS NOT NULL as has_color
FROM document_images WHERE document_id = 'your-doc-id';
```

---

## 📚 Related Documentation

- [Relevancy System](./relevancy-system.md) - Overall relevancy architecture
- [PDF Processing Pipeline](./pdf-processing-pipeline.md) - Image extraction process
- [Search Strategies](./search-strategies.md) - Search implementation details

