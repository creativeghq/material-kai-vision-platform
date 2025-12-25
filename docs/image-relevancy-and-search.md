# Image Search & Recognition

## Overview

The Material KAI Vision Platform uses advanced AI to understand and search through material images. When you upload a PDF catalog or search with an image, the system automatically analyzes every image to help you find exactly what you're looking for.

## What It Does

### Intelligent Image Understanding

Every image in your catalogs is analyzed using state-of-the-art AI to understand:

- **Visual Appearance** - Overall look and style of the material
- **Colors** - Dominant colors and color palettes
- **Textures** - Surface patterns and textures
- **Material Type** - What kind of material it is (fabric, tile, wood, etc.)
- **Application** - Where and how the material is typically used

This multi-dimensional understanding allows the platform to find materials that match your needs in different ways.

### Smart Image Search

Upload any image to find similar materials in your catalog:

1. **Visual Similarity** - Find materials that look similar overall
2. **Color Matching** - Find materials with similar color schemes
3. **Texture Matching** - Find materials with similar surface patterns
4. **Material Type** - Find materials of the same type
5. **Application** - Find materials suitable for similar uses

### Automatic Product Linking

The system automatically connects images to the products they represent:

- **Product Images** - Images showing the actual product
- **Detail Shots** - Close-up images of product features
- **Application Examples** - Images showing the product in use
- **Variants** - Images showing different colors or patterns

This ensures that when you search or browse, you see all relevant images for each product.

## How It Works

### AI-Powered Analysis

The platform uses two advanced AI systems working together:

**Primary Analysis** - Fast, accurate material detection using Llama 4 Scout Vision AI
- Identifies material types, colors, and textures
- Provides quality scores for each analysis
- Processes images quickly and efficiently

**Quality Validation** - Claude AI validates uncertain results
- Reviews images that need additional analysis
- Provides enhanced descriptions and corrections
- Ensures high-quality results

### Multi-Vector Search Architecture

The platform uses a sophisticated **6-embedding fusion system** that combines multiple AI models in parallel for maximum search accuracy:

**Embedding Types & Weights:**
- **Text Embedding (20%)** - Semantic understanding from product names, descriptions, and metadata
- **Visual Embedding (20%)** - General visual similarity using SigLIP 1152D embeddings
- **Color Embedding (15%)** - Specialized color palette matching
- **Texture Embedding (15%)** - Surface pattern and texture recognition
- **Style Embedding (15%)** - Design aesthetic and style matching
- **Material Embedding (15%)** - Material type and category classification

**How It Works:**

1. **Query Processing** - Your search query is converted into a visual embedding
2. **Parallel Search** - All 5 visual embedding collections are searched simultaneously using async processing
3. **Text Scoring** - Keyword matching is performed on product metadata in parallel
4. **Score Fusion** - Results from all 6 embeddings are combined with intelligent weighting
5. **Metadata Filtering** - Your filters are applied as soft boosts to improve relevance
6. **Final Ranking** - Products are sorted by combined score and returned

**Performance:**
- Typical search time: 300-500ms
- All searches run in parallel using `asyncio.gather()` and thread pools
- Handles thousands of products efficiently

This multi-dimensional approach ensures you get the most relevant results by considering all aspects of material similarity simultaneously.

### Intelligent Relevancy

Images are automatically linked to products and descriptions based on:

- **Page Location** - Images on the same page as product descriptions
- **Visual Similarity** - How well the image matches the product
- **AI Confidence** - How certain the AI is about the connection

The system assigns relevancy scores to help you find the most important images first.

## Using Image Search

### Search by Uploading an Image

When you have a material image and want to find similar materials in your catalog:

1. **Upload Your Image** - Upload any image of a material you're looking for
2. **AI Analysis** - The system analyzes the image to understand its characteristics
3. **Find Matches** - Get a list of similar materials from your catalog
4. **View Results** - See matching products with images and details

The search can find materials based on:
- Overall visual similarity
- Matching colors
- Similar textures
- Same material type
- Similar applications

### Search from 3D Visualizations

When working with 3D room visualizations:

1. **Generate 3D Scene** - Create a 3D visualization with materials
2. **Identify Materials** - The system automatically identifies materials in the scene
3. **Find Alternatives** - Get suggestions for similar or alternative materials
4. **Compare Options** - View different material options in context

This helps you explore material options and find alternatives that work with your design.

## Benefits

### For Designers and Architects

- **Quick Material Discovery** - Find materials faster than browsing catalogs
- **Visual Search** - Search using images instead of keywords
- **Explore Alternatives** - Discover similar materials you might not have considered
- **Confident Selections** - See all relevant images and details before deciding

### For Material Suppliers

- **Better Product Visibility** - Your products are found through visual search
- **Automatic Organization** - Images are automatically linked to products
- **Rich Product Pages** - All product images are organized and accessible
- **Enhanced Search** - Customers can find your products in multiple ways

## Search Accuracy

The platform uses advanced AI to ensure accurate results:

- **Multi-Dimensional Analysis** - Considers visual appearance, color, texture, and more
- **Quality Validation** - AI validates uncertain results for accuracy
- **Relevancy Scoring** - Results are ranked by how well they match your search
- **Continuous Improvement** - The system learns and improves over time

## Performance

The image search system is designed for speed and accuracy:

- **Fast Search** - Multi-vector search returns results in 300-500ms
- **Parallel Processing** - All 5 visual embeddings searched simultaneously
- **Efficient Storage** - Images are optimized and cached for quick loading
- **Scalable** - Handles thousands of images without slowing down
- **Reliable** - Built on enterprise-grade infrastructure

## Technical Implementation

### True Async Parallel Execution

The multi-vector search uses advanced async programming to achieve maximum performance:

**Architecture:**
```
Query → Generate Embedding → Search 5 Collections in Parallel
                              ├─ Visual (SigLIP 1152D)
                              ├─ Color (CLIP 512D)
                              ├─ Texture (CLIP 512D)
                              ├─ Style (CLIP 512D)
                              └─ Material (CLIP 512D)
                              ↓
                         Combine Scores → Apply Filters → Return Results
```

**Key Technologies:**
- **asyncio.gather()** - Executes all searches simultaneously
- **asyncio.to_thread()** - Runs blocking VECS queries in thread pool
- **VECS (pgvector)** - Vector similarity search on PostgreSQL
- **SigLIP & CLIP** - State-of-the-art vision-language models

**Performance Benefits:**
- 3-4x faster than sequential execution
- Non-blocking event loop for concurrent requests
- Efficient thread pool utilization
- Optimized database queries

### Specialized Endpoints

In addition to the main multi-vector search, individual embedding searches are available:

- `POST /api/search/color` - Color palette matching only
- `POST /api/search/texture` - Texture pattern matching only
- `POST /api/search/style` - Design style matching only
- `POST /api/search/material-type` - Material category matching only

These are useful for:
- UI filter controls (e.g., "Show only warm colors")
- Specialized searches when you know exactly what you want
- A/B testing different embedding types
- Debugging and analysis

### Search Response Format

The multi-vector search returns detailed scoring information:

```json
{
  "results": [{
    "id": "product_123",
    "product_name": "Ceramic Tile",
    "score": 0.87,
    "text_score": 0.85,
    "visual_score": 0.92,
    "color_score": 0.88,
    "texture_score": 0.81,
    "style_score": 0.79,
    "material_score": 0.90,
    "filter_boost": 0.15
  }],
  "total_results": 10,
  "processing_time": 0.345,
  "embeddings_used": ["text", "visual", "color", "texture", "style", "material"]
}
```

This transparency allows you to understand why each result was returned and debug search quality.

## Related Features

- **Material Search** - Search for materials using text descriptions
- **PDF Processing** - Automatic extraction of images from PDF catalogs
- **Product Discovery** - Intelligent product identification and organization
