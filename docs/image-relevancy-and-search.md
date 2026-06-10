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

The platform uses Claude Opus 4.7 vision_analysis via Anthropic tool use as the **sole vision pass** post-2026-05-01:

**Schema-locked Vision Analysis** — Claude Opus 4.7 via Anthropic tool use, schema-locked via `VisionAnalysis` Pydantic + `VISION_ANALYSIS_TOOL` (in `app/models/vision_analysis.py`).
- Identifies material types, colors, and textures
- Provides quality scores for each analysis
- Tool use eliminates JSON regex recovery and provides a hard guarantee of schema adherence — the only path that protects Voyage's understanding-embedding space from drift.

**Historical (pre-2026-05-01)**: A two-stage pipeline ran Qwen3-VL on a HuggingFace endpoint as the primary analyzer with Claude as a fallback validator. Audit revealed the Qwen endpoint had been 404-ing for months — every Qwen call timed out in 0.7s and silently fell through to Claude. The migration retired the Qwen call entirely so the architecture matches what was actually running.

### Multi-Vector Search Architecture

The platform uses a sophisticated **7-embedding fusion system** that combines multiple AI models in parallel for maximum search accuracy:

**Embedding Types & Default Weights (Balanced Profile):**
- **Text Embedding (15%)** - Semantic understanding from product names, descriptions, and metadata
- **Visual Embedding (15%)** - General visual similarity using SigLIP 768D embeddings
- **Understanding Embedding (20%)** - Spec-based search from Claude Opus 4.7 vision_analysis (Anthropic tool use → `serialize_vision_analysis_to_text` → Voyage AI 1024D). Pre-2026-05-01 used Qwen3-VL JSON; migration retired Qwen vision (HF endpoint 404-ing for months). Provenance fields `embedding_model` + `schema_version` persisted on every row.
- **Color Embedding (12.5%)** - Specialized color palette matching
- **Texture Embedding (12.5%)** - Surface pattern and texture recognition
- **Style Embedding (12.5%)** - Design aesthetic and style matching
- **Material Embedding (12.5%)** - Material type and category classification

> **Note:** These are the default "balanced" weights. The system dynamically adjusts weights per-query using **Query-Adaptive Weight Profiles** — see below.

**How It Works:**

1. **Query Understanding** - GPT-4o-mini parses the query into structured fields (colors, finish, dimensions, pattern, style, etc.)
2. **Weight Profile Selection** - `_select_weight_profile()` picks optimal weights based on detected fields (e.g., color queries upweight color embedding to 30%)
3. **Query Processing** - Your search query is converted into visual and understanding embeddings
4. **Parallel Search** - All 6 embedding collections are searched simultaneously using async processing
5. **Text Scoring** - Keyword matching is performed on product metadata in parallel
6. **Score Fusion** - Results from all 7 embeddings are combined using the selected weight profile
7. **Metadata Filtering** - Your filters are applied as soft boosts to improve relevance
8. **Final Ranking** - Products are sorted by combined score and returned

**Query-Adaptive Weight Profiles:**

The system selects from 7 weight profiles based on query intent:

| Profile | When Selected | Key Emphasis |
|---------|--------------|--------------|
| `product_name` | Brand or product name detected | Text 40% |
| `color_finish` | Color or finish terms present | Color 30% |
| `specification` | Dimensions detected (e.g., 60x120cm) | Understanding 40% |
| `texture_pattern` | Pattern terms present | Texture 30% |
| `style_aesthetic` | Style or application terms | Style 25% |
| `material_search` | Explicit material type | Material 25% |
| `balanced` | No specific signal (default) | Even distribution |

Profile selection is tracked in `search_query_tracking` for analytics.

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
- **Parallel Processing** - All 6 embedding collections searched simultaneously
- **Efficient Storage** - Images are optimized and cached for quick loading
- **Scalable** - Handles thousands of images without slowing down
- **Reliable** - Built on enterprise-grade infrastructure

## Technical Implementation

### True Async Parallel Execution

The multi-vector search uses advanced async programming to achieve maximum performance:

**Architecture:**

Query → Generate Embeddings → Search 6 Collections in Parallel
                               ├─ Visual (SigLIP2 768D)
                               ├─ Understanding (Voyage AI 1024D)
                               ├─ Color (Voyage AI 1024D, post-2026-05-04)
                               ├─ Texture (Voyage AI 1024D, post-2026-05-04)
                               ├─ Style (Voyage AI 1024D, post-2026-05-04)
                               └─ Material (Voyage AI 1024D, post-2026-05-04)
                               ↓
                          Combine Scores → Apply Filters → Return Results

> **Note**: Pre-2026-05-04 Color/Texture/Style/Material were 768D SLIG-blend vectors. Post-v2 they are 1024D Voyage AI embeddings of deterministic per-image VisionAnalysis field serializations.

**Key Technologies:**
- **asyncio.gather()** - Executes all searches simultaneously
- **asyncio.to_thread()** - Runs blocking VECS queries in thread pool
- **VECS (pgvector)** - Vector similarity search on PostgreSQL
- **SigLIP2** - Vision-language model (768D visual embeddings only, via SLIG cloud endpoint)
- **Voyage AI** - Text embedding model for understanding embeddings (1024D) and all four aspect embeddings (color/texture/style/material, 1024D, post-2026-05-04)

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

The multi-vector search returns detailed scoring information for each result, including combined score, per-embedding scores (text, visual, understanding, color, texture, style, material), filter boost, and total processing time. This transparency allows you to understand why each result was returned and debug search quality.

## Related Features

- **Material Search** - Search for materials using text descriptions
- **PDF Processing** - Automatic extraction of images from PDF catalogs
- **Product Discovery** - Intelligent product identification and organization
