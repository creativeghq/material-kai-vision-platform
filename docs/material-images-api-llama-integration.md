# Material Images API - Llama 4 Scout Vision Integration

**Date:** 2025-10-26  
**Status:** ✅ Production Ready  
**Model:** Llama 4 Scout 17B Vision (69.4% MMMU, #1 OCR)

---

## 📋 Overview

The `material-images-api` Supabase Edge Function now includes **automatic image analysis** using Llama 4 Scout Vision. When images are uploaded, they are automatically analyzed to extract:

- **Materials** (ceramic, wood, metal, stone, etc.)
- **Colors** (primary and secondary colors)
- **Textures** (smooth, rough, embossed, etc.)
- **Patterns** (solid, striped, geometric, etc.)
- **Finish** (matte, glossy, satin, polished, etc.)
- **Description** (detailed AI-generated description)
- **Tags** (searchable keywords)
- **Properties** (surface type, style, application, composition)

---

## 🚀 API Usage

### Upload Image with Auto-Analysis (Default)

```typescript
POST /material-images-api
Content-Type: application/json
Authorization: Bearer <supabase-anon-key>

{
  "material_id": "550e8400-e29b-41d4-a716-446655440000",
  "image_data": "data:image/jpeg;base64,/9j/4AAQSkZJRg...",
  "image_type": "primary",
  "title": "White Ceramic Tile",
  "auto_analyze": true  // Optional, defaults to true
}
```

### Response with Analysis Data

```json
{
  "success": true,
  "data": {
    "id": "660e8400-e29b-41d4-a716-446655440001",
    "material_id": "550e8400-e29b-41d4-a716-446655440000",
    "image_url": "https://...supabase.co/storage/v1/object/public/material-images/...",
    "image_type": "primary",
    "title": "White Ceramic Tile",
    "description": "White glossy ceramic tile with smooth surface finish, suitable for wall and floor applications",
    "analysis_data": {
      "materials": ["ceramic", "porcelain"],
      "colors": ["white", "off-white"],
      "textures": ["smooth", "glossy"],
      "patterns": ["solid"],
      "finish": "glossy",
      "description": "White glossy ceramic tile with smooth surface finish...",
      "tags": ["ceramic", "tile", "glossy", "white", "wall", "floor"],
      "properties": {
        "surface_type": "smooth",
        "style": "modern",
        "application": "wall/floor",
        "composition": "ceramic/porcelain"
      },
      "confidence": 0.92
    },
    "tags": ["ceramic", "tile", "glossy", "white", "wall", "floor"],
    "color_palette": {
      "colors": ["white", "off-white"],
      "primary_color": "white"
    },
    "metadata": {
      "auto_analyzed": true,
      "analysis_timestamp": "2025-10-26T04:30:00.000Z",
      "analysis_model": "llama-4-scout-17b-vision"
    },
    "created_at": "2025-10-26T04:30:00.000Z"
  },
  "metadata": {
    "processing_time_ms": 2847
  }
}
```

### Upload Without Auto-Analysis

```typescript
POST /material-images-api
{
  "material_id": "550e8400-e29b-41d4-a716-446655440000",
  "image_data": "data:image/jpeg;base64,/9j/4AAQSkZJRg...",
  "auto_analyze": false  // Disable auto-analysis
}
```

### Upload from URL (No Auto-Analysis)

```typescript
POST /material-images-api
{
  "material_id": "550e8400-e29b-41d4-a716-446655440000",
  "image_url": "https://example.com/image.jpg",
  "image_type": "primary"
}
```

**Note:** Auto-analysis only works with `image_data` (base64 uploads), not with `image_url`.

---

## 🔧 Technical Implementation

### Architecture

```
Upload Request
    ↓
material-images-api Edge Function
    ↓
[1] Decode base64 image
    ↓
[2] Upload to Supabase Storage
    ↓
[3] Call Llama 4 Scout Vision API ← NEW!
    ↓
[4] Parse JSON analysis response
    ↓
[5] Insert to material_images table with analysis_data
    ↓
Response with complete data
```

### Llama 4 Scout Vision Analysis

**Model:** `meta-llama/Llama-4-Scout-17B-16E-Instruct`  
**Provider:** Together.ai (serverless)  
**Timeout:** 60 seconds  
**Max Tokens:** 1024  
**Temperature:** 0.1 (deterministic)

**Prompt Structure:**
```
Analyze this material/product image and extract comprehensive information in JSON format:
{
  "materials": ["<material1>", "<material2>"],
  "colors": ["<color1>", "<color2>"],
  "textures": ["<texture1>", "<texture2>"],
  "patterns": ["<pattern1>", "<pattern2>"],
  "finish": "<matte/glossy/satin/textured/polished/etc>",
  "description": "<detailed description>",
  "tags": ["<tag1>", "<tag2>"],
  "properties": {
    "surface_type": "<smooth/rough/embossed/etc>",
    "style": "<modern/classic/industrial/etc>",
    "application": "<flooring/wall/furniture/etc>",
    "composition": "<estimated material composition>"
  },
  "confidence": <0.0-1.0>
}
```

### Error Handling

**Graceful Fallback:** If Llama analysis fails, the image upload continues without analysis data.

```typescript
try {
  const analysis = await analyzeImageWithLlama(imageData);
  // Use analysis if successful
} catch (error) {
  console.warn('Auto-analysis failed, continuing without analysis');
  // Upload continues with empty analysis_data
}
```

**Common Failure Scenarios:**
- ❌ `TOGETHER_API_KEY` not set → Skip analysis
- ❌ Llama API timeout → Skip analysis
- ❌ Invalid JSON response → Skip analysis
- ❌ Network error → Skip analysis

**Result:** Image is always uploaded successfully, analysis is best-effort.

---

## 📊 Database Schema

### material_images Table

```sql
CREATE TABLE material_images (
  id UUID PRIMARY KEY,
  material_id UUID REFERENCES materials_catalog(id),
  image_url TEXT NOT NULL,
  image_type TEXT,
  title TEXT,
  description TEXT,  -- Auto-populated from analysis
  alt_text TEXT,
  file_name TEXT,
  file_size INTEGER,
  mime_type TEXT,
  width INTEGER,
  height INTEGER,
  storage_path TEXT,
  storage_bucket TEXT,
  display_order INTEGER,
  is_featured BOOLEAN,
  metadata JSONB,  -- Includes auto_analyzed, analysis_timestamp, analysis_model
  variants JSONB,
  analysis_data JSONB,  -- ← Llama 4 Scout analysis results
  tags TEXT[],  -- ← Auto-generated from analysis
  color_palette JSONB,  -- ← Auto-generated from analysis
  source_url TEXT,
  verified_by UUID,
  verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  created_by UUID
);
```

### analysis_data Structure

```typescript
interface AnalysisData {
  materials: string[];        // ["ceramic", "porcelain"]
  colors: string[];           // ["white", "beige"]
  textures: string[];         // ["smooth", "glossy"]
  patterns: string[];         // ["solid"]
  finish: string;             // "glossy"
  description: string;        // "White glossy ceramic tile..."
  tags: string[];             // ["ceramic", "tile", "glossy"]
  properties: {
    surface_type: string;     // "smooth"
    style: string;            // "modern"
    application: string;      // "wall/floor"
    composition: string;      // "ceramic/porcelain"
  };
  confidence: number;         // 0.92
}
```

---

## 🎯 Use Cases

### 1. Knowledge Base Image Upload
```typescript
// Admin uploads material image to knowledge base
const response = await fetch('/material-images-api', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${supabaseAnonKey}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    material_id: materialId,
    image_data: base64Image,
    image_type: 'primary',
    auto_analyze: true  // Get automatic tags and description
  })
});

const { data } = await response.json();
console.log('Auto-generated tags:', data.tags);
console.log('AI description:', data.description);
```

### 2. Bulk Image Import
```typescript
// Import multiple images with auto-analysis
for (const image of images) {
  await fetch('/material-images-api', {
    method: 'POST',
    body: JSON.stringify({
      material_id: image.materialId,
      image_data: image.base64,
      auto_analyze: true
    })
  });
}
```

### 3. Search by Auto-Generated Tags
```sql
-- Find all glossy ceramic tiles
SELECT * FROM material_images
WHERE 'glossy' = ANY(tags)
  AND 'ceramic' = ANY(tags);

-- Find materials by color
SELECT * FROM material_images
WHERE analysis_data->>'finish' = 'matte'
  AND 'blue' = ANY(tags);
```

---

## 🔐 Security & Performance

### Authentication
- Requires valid Supabase authentication token
- Row Level Security (RLS) policies enforced
- Service role key for internal operations

### Performance
- **Analysis Time:** ~2-3 seconds per image
- **Total Upload Time:** ~3-5 seconds (including storage + analysis)
- **Concurrent Uploads:** Supported (serverless scaling)
- **Rate Limits:** Together.ai API limits apply

### Cost Optimization
- Analysis only runs for base64 uploads (not URL uploads)
- Can be disabled with `auto_analyze: false`
- Graceful fallback prevents upload failures

---

## 🧪 Testing

### Manual Test
```bash
curl -X POST https://your-project.supabase.co/functions/v1/material-images-api \
  -H "Authorization: Bearer YOUR_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "material_id": "550e8400-e29b-41d4-a716-446655440000",
    "image_data": "data:image/jpeg;base64,/9j/4AAQSkZJRg...",
    "auto_analyze": true
  }'
```

### Expected Response
```json
{
  "success": true,
  "data": {
    "analysis_data": { ... },
    "tags": ["ceramic", "tile", ...],
    "color_palette": { ... }
  }
}
```

---

## 📚 Related Documentation

- [Llama 4 Scout Implementation Summary](./llama-4-scout-implementation-summary.md)
- [API Documentation](./api-documentation.md)
- [Setup & Configuration](./setup-configuration.md)

