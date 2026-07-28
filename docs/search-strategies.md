# Material Search

## Overview

The Material KAI Vision Platform provides powerful search capabilities to help you find exactly the materials you need. The search system understands natural language, recognizes visual patterns, and can filter by specific material properties.

## How Search Works

### Intelligent Multi-Dimensional Search

When you search for materials, the platform analyzes your query in multiple ways simultaneously:

- **Semantic Understanding** - Understands the meaning and context of your search
- **Visual Similarity** - Finds materials that look similar
- **Vision Understanding** - Matches against detailed AI analysis of material properties, dimensions, finishes, and specifications
- **Color Matching** - Identifies materials with matching color palettes
- **Texture Recognition** - Finds materials with similar surface patterns
- **Style Matching** - Discovers materials with similar design aesthetics
- **Material Type** - Filters by specific material categories

All 7 dimensions are combined intelligently to give you the most relevant results.

### Specification-Based Search

The Understanding embedding enables searching by technical specifications:

- "Porcelain tile 60x120cm matt finish"
- "R10 slip rating bathroom floor"
- "Fire-rated fabric Class 1"
- "3mm thickness vinyl plank"

This works because the platform embeds Claude Opus 4.7's structured `VisionAnalysis` of each image (material type, dimensions, finishes, properties) via Anthropic tool use → `serialize_vision_analysis_to_text` → Voyage AI.

### Natural Language Search

Simply describe what you're looking for in plain language:

- "Modern ceramic tiles with blue tones"
- "Soft fabric for upholstery"
- "Wood-look flooring with natural texture"
- "Metallic finish for accent walls"

The system automatically understands your requirements and finds matching materials.

## Search Features

### Text-Based Search

Search using descriptions, product names, or material properties:

- **Product Names** - Find specific products by name or code
- **Descriptions** - Search through product descriptions and specifications
- **Properties** - Filter by material properties like color, texture, finish
- **Applications** - Find materials suitable for specific uses

### Image-Based Search

Upload an image to find similar materials:

- **Visual Similarity** - Find materials that look similar overall
- **Color Matching** - Match specific color schemes
- **Texture Matching** - Find materials with similar surface patterns
- **Style Matching** - Discover materials with similar design aesthetics

### Property Filters

Refine your search with specific material properties:

- **Material Type** - Fabric, tile, wood, metal, etc.
- **Color** - Specific colors or color families
- **Texture** - Smooth, rough, patterned, etc.
- **Finish** - Matte, glossy, satin, etc.
- **Application** - Flooring, walls, furniture, etc.
- **Manufacturer** - Filter by specific brands or suppliers

## Search Results

### Relevancy Ranking

Results are ranked by how well they match your search:

- **High Relevance** - Materials that closely match all your criteria
- **Medium Relevance** - Materials that match most criteria
- **Related Materials** - Materials that might interest you based on your search

### Result Information

Each search result includes:

- **Product Images** - Multiple views of the material
- **Product Details** - Name, description, specifications
- **Material Properties** - Color, texture, finish, dimensions
- **Manufacturer Information** - Brand, collection, product code
- **Availability** - Stock status and ordering information

## Search Tips

### Getting Better Results

- **Be Specific** - More detailed descriptions give better results
- **Use Multiple Terms** - Combine different aspects (color, texture, style)
- **Try Different Approaches** - Use both text and image search
- **Refine with Filters** - Narrow down results with property filters

### Common Search Patterns

**Finding Alternatives:**
- Search for similar materials to one you like
- Upload an image to find matching options
- Filter by the same material type or application

**Exploring Collections:**
- Search by manufacturer or collection name
- Browse materials with similar styles
- Discover coordinating materials

**Specific Requirements:**
- Use property filters for exact specifications
- Combine multiple filters for precise results
- Search by product codes for specific items

## Search Performance

The search system is optimized for speed and accuracy:

- **Fast Results** - Most searches return in under 200 milliseconds
- **High Accuracy** - Intelligent ranking ensures relevant results appear first
- **Scalable** - Handles large catalogs without slowing down
- **Reliable** - Built on enterprise-grade infrastructure

## Advanced Features

### Query Understanding

The system automatically understands complex queries:

- **Automatic Filter Extraction** - Identifies properties mentioned in your search
- **Context Awareness** - Understands relationships between terms
- **Intent Recognition** - Determines what you're really looking for

### Query-Adaptive Weight Profiles

The 7-vector fusion search dynamically adjusts embedding weights based on what the query is about. Instead of using fixed weights for every search, the system analyzes the parsed query fields and selects the optimal weight profile.

**How It Works:**

1. GPT-4o-mini parses the natural language query into structured fields (colors, finish, material_type, dimensions, pattern, style, designer, collection)
2. `_select_weight_profile()` examines which fields are present and selects the best profile
3. The selected weights are applied to the 7-vector fusion scoring

**Available Profiles:**

| Profile | Trigger | Text | Visual | Understanding | Color | Texture | Style | Material |
|---------|---------|------|--------|---------------|-------|---------|-------|----------|
| **product_name** | Product name or brand detected | 40% | 25% | 15% | 5% | 5% | 5% | 5% |
| **color_finish** | Colors or finish terms present | 10% | 20% | 15% | 30% | 5% | 15% | 5% |
| **specification** | Dimensions detected (e.g., 60x120cm) | 25% | 10% | 40% | 5% | 5% | 5% | 10% |
| **texture_pattern** | Pattern terms present | 10% | 25% | 15% | 5% | 30% | 10% | 5% |
| **style_aesthetic** | Style or application terms | 10% | 25% | 15% | 10% | 10% | 25% | 5% |
| **material_search** | Explicit material type | 15% | 15% | 25% | 5% | 10% | 5% | 25% |
| **balanced** | No specific signal (default) | 15% | 15% | 20% | 12.5% | 12.5% | 12.5% | 12.5% |

**Selection Priority:** dimensions → colors/finish → pattern → material → style/application → balanced

**Examples:**
- `"MAISON by ONSET"` → **product_name** (text weight 40%, find by name)
- `"matte beige tiles"` → **color_finish** (color weight 30%, match the beige)
- `"60x120cm porcelain R10"` → **specification** (understanding weight 40%, match specs)
- `"wood grain pattern ceramic"` → **texture_pattern** (texture weight 30%, match the grain)
- `"minimalist bathroom design"` → **style_aesthetic** (style weight 25%, match the aesthetic)

**Monitoring:**
- Weight profile selection is logged in `ai_call_logs` for every query
- `search_query_tracking` table records `weight_profile`, `dynamic_weights`, and `weight_profile_source`
- Admin monitoring dashboards show which profiles are being selected

**Implementation:** `unified_search_service.py` → `WEIGHT_PROFILES` dict + `_select_weight_profile()` method

### Result Diversity

Search results include variety while maintaining relevance:

- **Balanced Results** - Mix of exact matches and related options
- **Avoid Duplicates** - Similar products are grouped intelligently
- **Explore Options** - Discover materials you might not have considered

## Explainable Search Spec

When the JARVIS agent calls `material_search`, it now provides a structured **search specification** that decomposes the user's query across all 7 embedding dimensions. This spec is displayed as a collapsible `SearchSpecCard` above the product results in the chat.

**Fields in the search spec:**
- `intent` — brief description of what the user is looking for
- `color_keywords` / `color_hex` — extracted color terms and approximate hex codes
- `material_types` — detected material types (e.g., porcelain, marble, wood)
- `style_keywords` — aesthetic/style terms (e.g., minimalist, japandi, industrial)
- `texture_finish` — texture or surface finish description
- `specifications` — technical specs if mentioned (e.g., R11 slip-resistant, outdoor-rated)

The spec is generated by the LLM as part of its tool call (no extra API call) and emitted via `onChunk` with type `search_spec` for real-time display in the frontend.

**Why it matters:** Architects and specifiers need to justify material choices to clients. The search spec shows *why* each result was selected — turning a black-box search into an explainable recommendation.

---

## Design Inspiration URL Search

Users can paste any design URL (Houzz, Pinterest, Dezeen, ArchDaily, manufacturer sites) and the `analyze_inspiration_url` tool will:

1. Scrape the page using Firecrawl API
2. Extract design tokens via Claude Haiku: colors (with hex codes), materials, textures, styles, room type
3. Search the catalog for matching products using the 7-vector fusion search
4. Display results as an `InspirationCard` (color swatches, material/style tags, source thumbnail) followed by matched products

**Accessible to all users** via the Globe icon button in the chat toolbar, which opens a modal for URL input with an optional surface focus selector (floors, walls, countertops, etc.).

**Credit cost:** 1 credit for the Firecrawl scrape + Haiku token cost for extraction.

---

## Related Features

- **Image Search** - Find materials using images instead of text
- **Saved Searches** - Save and reuse your favorite searches
- **Search Suggestions** - Get suggestions as you type
