# Color & Style Analysis to Vector Recognition System

**Last Updated**: 2025-10-18

## 📋 Overview

The Material Kai Vision Platform includes a comprehensive color and style analysis system that extracts visual features from images, generates semantic vectors, and enables intelligent material recognition and search. This document explains how color analysis, style classification, and vector embeddings work together to power the admin panel and vector-based recognition system.

## 🎨 1. Color Analysis Engine

### Purpose
Extracts detailed color information from images using advanced clustering and color space analysis.

### Key Features
- **K-means Clustering**: Extracts 8 dominant colors from images
- **Multi-Color Space Support**: RGB, HSV, LAB, LCH color spaces
- **Industry Standards**: Maps to Pantone and RAL color codes
- **Color Harmony Analysis**: Calculates balance, contrast, and vibrancy
- **Psychological Profiling**: Analyzes emotions, mood, warmth, trustworthiness
- **Palette Recommendations**: Generates complementary, analogous, and triadic palettes

### Data Structure
```typescript
interface Color {
  rgb: { r: number; g: number; b: number };
  hsv: { h: number; s: number; v: number };
  lab: { l: number; a: number; b: number };
  hex: string;
  pantone: string;
  ral: string;
  percentage: number;  // Distribution percentage
  name: string;        // Human-readable color name
}

interface ColorAnalysisResult {
  dominantColors: Color[];
  colorHarmony: ColorHarmony;
  colorCategories: ColorCategory[];
  colorSpaces: ColorSpaces;
  culturalAssociations: CulturalAssociation[];
  psychologicalProfile: PsychologicalProfile;
  paletteRecommendations: ColorPalette[];
}
```

### Implementation Location
- **Service**: `src/services/ml/colorAnalysisEngine.ts`
- **Configuration**: `src/config/embeddingConfig.ts`

---

## 🎭 2. Style Analysis Service

### Purpose
Classifies design styles and analyzes aesthetic properties of materials.

### Style Classification
The system classifies materials into design styles based on visual features:

| Style | Criteria | Use Case |
|-------|----------|----------|
| **Minimalist** | High edge sharpness + low color variance | Clean, simple designs |
| **Traditional** | High pattern complexity + 5+ colors | Classic, ornate designs |
| **Industrial** | High metallic detection | Metal, steel materials |
| **Rustic** | High warmth score | Natural, earthy materials |
| **Contemporary** | High saturation | Modern, vibrant designs |
| **Transitional** | Balanced features | Mixed style materials |

### Aesthetic Properties Analyzed
- **Warmth**: Color temperature (warm vs. cool)
- **Saturation**: Color intensity and vibrancy
- **Brightness**: Overall lightness/darkness
- **Edge Sharpness**: Pattern definition and clarity
- **Pattern Complexity**: Ornamental detail level
- **Metallic Detection**: Reflective surface properties
- **Glossiness**: Surface shine and reflection
- **Naturalness**: Natural vs. synthetic appearance

### Implementation Location
- **Service**: `src/services/ml/styleAnalysisService.ts`
- **Supabase Function**: `supabase/functions/style-analysis/index.ts`

---

## 🔢 3. Vector Generation & Embeddings

### Three Embedding Types

#### 1. CLIP Embeddings (512-1024D)
- **Purpose**: Image-text understanding for semantic search
- **Model**: `openai/clip-vit-base-patch32`
- **Use Case**: Finding visually similar materials across different descriptions
- **Advantage**: Bridges visual and textual understanding

#### 2. Custom Material Embeddings (Variable Dimensions)
- **Purpose**: Material-specific feature vectors
- **Features**: Color, texture, style, surface properties
- **Use Case**: Material-to-material similarity matching
- **Advantage**: Captures domain-specific material characteristics

#### 3. Text Embeddings (1536D)
- **Purpose**: Semantic understanding of descriptions and metadata
- **Model**: `text-embedding-ada-002`
- **Use Case**: Text-based search and semantic matching
- **Advantage**: Unified embedding space for all text content

### Embedding Generation Flow
```
Image Input
    ↓
Color Analysis → Color Features
Style Analysis → Style Features
Material Analysis → Texture Features
    ↓
Feature Vectors
    ↓
CLIP Model → CLIP Embeddings (512-1024D)
Custom Encoder → Material Embeddings (Variable)
Text Encoder → Text Embeddings (1536D)
    ↓
Supabase Storage (image_embeddings table)
```

### Implementation Location
- **Service**: `mivaa-pdf-extractor/app/services/material_visual_search_service.py`
- **Unified Search**: `supabase/functions/_shared/unified-vector-search.ts`

---

## 📊 4. Admin Panel Integration

### Material Knowledge Base - Images Tab

The admin panel displays extracted images with complete analysis results:

#### Image Card Display
- **Thumbnail**: Visual preview of the image
- **Image Type**: Classification (photo, diagram, chart, etc.)
- **Confidence Score**: AI confidence percentage
- **Page Number**: Source document page
- **Processing Status**: Current processing state
- **OCR Text**: Extracted text from image

#### Details Modal
When clicking "Details" on an image card, users see:
- **Full Image Preview**: High-resolution image display
- **Color Palette**: Dominant colors with percentages
- **Color Harmony**: Balance, contrast, vibrancy metrics
- **Style Classification**: Primary style with confidence
- **Design Tags**: Extracted design characteristics
- **Aesthetic Properties**: Warmth, saturation, brightness, etc.
- **Material Type**: Detected material classification
- **Confidence Metrics**: AI confidence for each analysis
- **Metadata**: Page number, source document, extraction timestamp

### Implementation Location
- **Component**: `src/components/Admin/MaterialKnowledgeBase.tsx`
- **Image Display**: `src/components/PDF/PDFImageGallery.tsx`

---

## 💾 5. Database Storage

### Supabase Tables

#### `images` Table
```sql
- id: UUID (primary key)
- document_id: UUID (foreign key)
- image_url: TEXT
- caption: TEXT
- alt_text: TEXT
- image_type: TEXT
- confidence: FLOAT
- page_number: INTEGER
- processing_status: TEXT
- contextual_name: TEXT
- nearest_heading: TEXT
- ocr_extracted_text: TEXT
- created_at: TIMESTAMP
```

#### `image_embeddings` Table
```sql
- id: UUID (primary key)
- image_id: UUID (foreign key)
- embedding_type: TEXT ('clip', 'custom', 'text')
- embedding_vector: VECTOR (1536D for text, variable for others)
- dimensions: INTEGER
- generation_timestamp: TIMESTAMP
- model_version: TEXT
```

#### `image_analysis_results` Table
```sql
- id: UUID (primary key)
- image_id: UUID (foreign key)
- color_analysis: JSONB
- style_analysis: JSONB
- material_analysis: JSONB
- aesthetic_properties: JSONB
- confidence_scores: JSONB
- created_at: TIMESTAMP
```

---

## 🔍 6. Vector Search & Recognition

### Unified Vector Search Process

1. **Query Input**: User searches for materials
2. **Query Embedding**: Convert query to vector using same models
3. **Similarity Matching**: Compare against stored embeddings
4. **Threshold Filtering**: Filter results by similarity score (default: 0.7)
5. **Result Ranking**: Sort by relevance score
6. **Return Results**: Similar materials with metadata

### Search Types

| Search Type | Method | Use Case |
|------------|--------|----------|
| **Color Search** | CLIP + Custom embeddings | Find materials with similar colors |
| **Style Search** | Custom embeddings | Find materials with similar design style |
| **Semantic Search** | Text embeddings | Find materials by description |
| **Hybrid Search** | All embeddings combined | Comprehensive material search |

### Implementation Location
- **Search Function**: `supabase/functions/_shared/unified-vector-search.ts`
- **RAG Search**: `supabase/functions/rag-knowledge-search/index.ts`

---

## 🔄 7. Complete Data Flow

```
Image Upload
    ↓
[Color Analysis Engine]
├─ Extract dominant colors (K-means)
├─ Analyze color harmony
├─ Generate psychological profile
└─ Map to Pantone/RAL standards
    ↓
[Style Analysis Service]
├─ Classify design style
├─ Analyze aesthetic properties
├─ Calculate trend score
└─ Generate design tags
    ↓
[Material Analyzer]
├─ Detect material type
├─ Analyze texture
└─ Extract surface properties
    ↓
[Vector Generation]
├─ CLIP embeddings (image-text understanding)
├─ Custom material embeddings (color/style/texture)
└─ Text embeddings (descriptions)
    ↓
[Supabase Storage]
├─ images table (metadata)
├─ image_embeddings table (vectors)
└─ image_analysis_results table (analysis data)
    ↓
[Admin Panel Display]
├─ Material Knowledge Base → Images Tab
├─ Shows thumbnails, metadata, confidence
└─ Details modal with full analysis
    ↓
[Vector Search & Recognition]
├─ User searches for similar materials
├─ Query is embedded using same models
├─ Similarity matching against stored vectors
└─ Returns color-matched, style-matched, similar items
```

---

## 🎯 8. Key Integration Points

| Component | Purpose | Data Used |
|-----------|---------|-----------|
| **ColorAnalysisEngine** | Extract color features | RGB, HSV, LAB, Pantone, psychological profile |
| **StyleAnalysisService** | Classify design style | Visual features, aesthetic properties, design tags |
| **MaterialAnalyzer** | Detect material type | Texture, surface properties, material classification |
| **CLIP Embeddings** | Image-text understanding | Visual features + text descriptions |
| **Custom Embeddings** | Material-specific matching | Color, style, texture vectors |
| **Text Embeddings** | Semantic search | Image descriptions, metadata, OCR text |
| **Admin Panel** | Visualization | All analysis results, confidence scores, metadata |
| **Vector Search** | Find similar items | Query embedding vs. stored embeddings |

---

## 💡 9. Practical Example

When a user uploads a material image:

1. **Color Analysis** finds:
   - Red #FF0000 (40%)
   - White #FFFFFF (35%)
   - Gray #808080 (25%)

2. **Style Analysis** classifies:
   - "Modern Minimalist" (0.87 confidence)

3. **Material Analyzer** detects:
   - "Ceramic" with "Glossy" finish

4. **Vectors generated**:
   - CLIP: `[0.234, 0.567, ..., 0.891]` (512D)
   - Custom: `[color_features, style_features, texture_features]`
   - Text: `[0.123, 0.456, ..., 0.789]` (1536D)

5. **Admin Panel shows**:
   - Red/white/gray palette
   - Modern style tag
   - Ceramic material
   - Confidence scores

6. **Search finds**:
   - Other red ceramic items
   - Modern white materials
   - Similar glossy finishes
   - Complementary color palettes

---

## 📚 Related Documentation

- [Platform Functionality](./platform-functionality.md)
- [Material Recognition](./platform-functionality.md#8-material-recognition--ai-analysis)
- [Admin Panel Guide](./admin-panel-guide.md)
- [API Documentation](./api-documentation.md)
- [Database Schema](./database-schema.md)

