# Relevancy System Architecture

**Last Updated:** November 3, 2025
**Version:** 1.0.0
**Status:** ✅ Production

---

## Overview

The MIVAA Relevancy System establishes intelligent relationships between chunks, products, and images using AI-powered scoring algorithms. This system ensures accurate search results, proper entity linking, and high-quality knowledge base organization.

---

## Core Concepts

### What is Relevancy?

**Relevancy** is a scored relationship (0.0-1.0) between two entities that indicates how closely they are related. Higher scores mean stronger relationships.

### Why Relevancy Matters

1. **Search Accuracy** - Return the most relevant results for user queries
2. **Entity Linking** - Connect related content across the knowledge base
3. **Context Preservation** - Maintain relationships between text, images, and products
4. **Quality Scoring** - Identify high-quality vs low-quality relationships

---

## Relationship Types

MIVAA uses **3 primary relationship tables** to link entities:

### 1. Chunk → Product Relationships

**Table:** `chunk_product_relationships`

**Purpose:** Links text chunks to products they describe

**Relationship Types:**
- `source` - Chunk is primary source describing the product
- `related` - Chunk mentions or relates to the product
- `component` - Chunk describes a component of the product
- `alternative` - Chunk describes an alternative to the product

---

### 2. Product → Image Relationships

**Table:** `product_image_relationships`

**Purpose:** Links products to images that depict them

**Relationship Types:**
- `depicts` - Image directly shows the product
- `illustrates` - Image illustrates product features
- `variant` - Image shows a product variant
- `related` - Image is related to the product

---

### 3. Chunk → Image Relationships

**Table:** `chunk_image_relationships`

**Purpose:** Links text chunks to images they reference

**Relationship Types:**
- `illustrates` - Image illustrates the chunk content
- `depicts` - Image depicts what the chunk describes
- `related` - Image is related to the chunk
- `example` - Image provides an example of chunk content

---

## Relevancy Scoring Algorithms

### Algorithm 1: Chunk → Product Relevancy

**Formula:** relevance_score = page_proximity(40%) + embedding_similarity(30%) + mention_score(30%)

**Components:**

1. **Page Proximity (40%)** - How close is the chunk to the product?
   - Same page: `0.4`
   - Adjacent page: `0.2`
   - Different page: `0.0`

2. **Embedding Similarity (30%)** - How similar is the chunk content to the product?
   - Cosine similarity between chunk and product embeddings
   - Default medium relevance: `0.15`

3. **Mention Score (30%)** - Does the chunk mention the product name?
   - Product name mentioned: `0.3`
   - Product name not mentioned: `0.0`

---

### Algorithm 2: Product → Image Relevancy

**Formula:** relevance_score = page_overlap(40%) + visual_similarity(40%) + detection_score(20%)

**Components:**

1. **Page Overlap (40%)** - Are the product and image on the same page?
   - Same page: `0.4`
   - Adjacent page: `0.2`
   - Different page: `0.0`

2. **Visual Similarity (40%)** - How visually similar is the image to the product?
   - From AI detection (CLIP embeddings)
   - Default: `0.3`

3. **Detection Score (20%)** - How confident is the AI that this image shows the product?
   - From product discovery confidence
   - Default: `0.2`

---

### Algorithm 3: Chunk → Image Relevancy

**Formula:** relevance_score = same_page(50%) + visual_text_similarity(30%) + spatial_proximity(20%)

**Components:**

1. **Same Page (50%)** - Are the chunk and image on the same page?
   - Same page: `0.5`
   - Different page: `0.0`

2. **Visual-Text Similarity (30%)** - Does the image content match the chunk text?
   - From multimodal embeddings
   - Default: `0.2`

3. **Spatial Proximity (20%)** - How close are they on the page?
   - Adjacent: `0.2`
   - Far apart: `0.1`
   - Different page: `0.0`

---

## Implementation

### Backend Service: `entity_linking_service.py`

**Location:** `mivaa-pdf-extractor/app/services/entity_linking_service.py`

**Key Methods:**

- `link_images_to_products(document_id, image_to_product_mapping, product_name_to_id)` - Links images to products with relevance scores
- `link_chunks_to_images(document_id)` - Links chunks to images on the same page
- `link_chunks_to_products(document_id)` - Links chunks to products with relevance scores

---

### Frontend Service: `entityRelationshipService.ts`

**Location:** `src/services/entityRelationshipService.ts`

**Key Methods:**

- `linkChunkToProduct(chunkId, productId, relationshipType, relevanceScore)` - Returns `ChunkProductRelationship`
- `linkProductToImage(productId, imageId, relationshipType, relevanceScore)` - Returns `ProductImageRelationship`
- `linkChunkToImage(chunkId, imageId, relationshipType, relevanceScore)` - Returns `ChunkImageRelationship`

---

## Processing Flow

### Stage 1: Product Discovery (Stage 0)

Claude/GPT analyzes PDF, identifies products and their pages, and creates an image-to-product mapping.

### Stage 2: Chunk Creation (Stage 2)

Semantic chunking creates text chunks which are stored in the document_chunks table, each with a page_number.

### Stage 3: Entity Linking (Stage 3-4)

Products are linked to Images (using image-to-product mapping), then Chunks are linked to Products (using page proximity + embeddings), then Chunks are linked to Images (using same-page detection). All relationships are stored with relevance scores.

---

## Best Practices

### 1. Use Relevance Thresholds

Filter relationships by minimum relevance score. Recommended minimums: 0.7 for high-quality chunk-product relationships, 0.5 for product-image relationships.

### 2. Prioritize Relationship Types

When multiple relationships exist, prioritize by type:

**Chunk → Product:**
1. `source` (primary description)
2. `component` (part of product)
3. `related` (mentions product)
4. `alternative` (alternative to product)

**Product → Image:**
1. `depicts` (shows product directly)
2. `illustrates` (shows features)
3. `variant` (shows variant)
4. `related` (related image)

### 3. Update Relevance Scores

Relevance scores can be updated based on user feedback. Increase score by 0.1 when user confirms a relationship (capped at 1.0), decrease by 0.2 when user rejects (floored at 0.0).

---

## Future Enhancements

1. **Machine Learning** - Train models to improve relevance scoring
2. **User Feedback Loop** - Learn from user interactions
3. **Contextual Relevance** - Consider document structure and hierarchy
4. **Temporal Relevance** - Factor in recency and updates
5. **Cross-Document Relevance** - Link entities across multiple documents

---

**Related Documentation:**
- [Metadata Management System](metadata-management-system.md)
- [Product Discovery Architecture](product-discovery-architecture.md)
- [PDF Processing Pipeline](pdf-processing-pipeline.md)

