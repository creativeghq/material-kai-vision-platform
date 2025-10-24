# 🖼️ Image Processing Improvements Plan

## Current Issues Identified

### Issue 1: Only 1 Related Chunk Shown
**Problem:** Image 24-25-133.jpg shows only 1 chunk (eb7c43f3-57e1-4c13-8ab3-1b58bd09d25c) in "Related Chunk" section
**Expected:** Should show ALL semantically related chunks from the document
**Impact:** Users can't see full context of the material/product

### Issue 2: Empty Material Properties
**Current Data:**
```json
{
  "confidence": 0,
  "properties": {
    "color": "unknown",
    "finish": "unknown",
    "pattern": "unknown",
    "texture": "unknown",
    "composition": {},
    "safety_ratings": {},
    "thermal_properties": {},
    "mechanical_properties": {}
  },
  "material_type": "unknown",
  "analysis_method": "material_visual_search",
  "extracted_features": {},
  "processing_time_ms": 0,
  "classification_scores": {}
}
```
**Problem:** All properties are "unknown" or empty
**Expected:** Real material properties extracted from image and related chunks
**Impact:** No useful information about the material

### Issue 3: Missing Metadata
**Problem:** No metadata about sizes, factory, group, specifications
**Expected:** Extract from related chunks and populate
**Impact:** Users can't find product details

### Issue 4: Image Quality
**Problem:** Extracted images may be low quality
**Expected:** High-quality, properly upscaled images
**Impact:** Poor visual representation

---

## Solution Architecture

### 1. Semantic Chunk Linking (Using Embeddings)
```
Image → Generate Image Embedding
         ↓
      Compare with ALL chunk embeddings
         ↓
      Find chunks with similarity > 0.7
         ↓
      Link ALL related chunks (not just 1)
```

### 2. Material Property Extraction
```
Image → Visual Analysis (CLIP, Color Analysis, Texture)
         ↓
      Related Chunks → Extract text properties
         ↓
      Combine visual + text properties
         ↓
      Populate material_type, color, finish, pattern, texture
```

### 3. Metadata Extraction
```
Related Chunks → Parse for:
  - Sizes (dimensions, measurements)
  - Factory/Group/Collection
  - Specifications
  - Product codes
  - Availability
         ↓
      Store in image metadata
```

### 4. Image Quality Enhancement
```
Original Image → Upscaling (if needed)
                 ↓
              Denoising
                 ↓
              Color correction
                 ↓
              Enhanced Image
```

---

## Implementation Steps

### Step 1: Create Image-Chunk Linking Service
- Use embeddings to find ALL related chunks
- Store relationships in database
- Update chunk_image_relationships table

### Step 2: Create Material Property Extraction Service
- Analyze image visually (colors, textures, patterns)
- Extract properties from related chunks
- Combine and populate image_analysis_results

### Step 3: Create Metadata Extraction Service
- Parse related chunks for metadata
- Extract sizes, factory, group, specifications
- Store in image metadata field

### Step 4: Enhance Image Quality
- Implement upscaling for low-res images
- Add denoising and color correction
- Store enhanced version

### Step 5: Update Admin UI
- Show ALL related chunks (paginated)
- Display extracted metadata
- Show material properties with confidence scores
- Display enhanced image

---

## Database Changes Needed

### New Table: image_chunk_relationships
```sql
CREATE TABLE image_chunk_relationships (
  id UUID PRIMARY KEY,
  image_id UUID REFERENCES document_images(id),
  chunk_id UUID REFERENCES document_chunks(id),
  similarity_score FLOAT,
  relationship_type TEXT, -- 'primary', 'related', 'context'
  created_at TIMESTAMPTZ
);
```

### Update: document_images table
```sql
ALTER TABLE document_images
ADD COLUMN IF NOT EXISTS related_chunks_count INT DEFAULT 0,
ADD COLUMN IF NOT EXISTS extracted_metadata JSONB DEFAULT '{}',
ADD COLUMN IF NOT EXISTS material_properties JSONB DEFAULT '{}',
ADD COLUMN IF NOT EXISTS quality_score FLOAT DEFAULT 0;
```

---

## Expected Improvements

### Before
- 1 related chunk
- All properties "unknown"
- No metadata
- Basic image quality

### After
- 10-50 related chunks (depending on document)
- Real material properties (color, finish, pattern, texture)
- Complete metadata (sizes, factory, group, specs)
- High-quality enhanced images
- Confidence scores for all properties
- Proper categorization of relationships

---

## Implementation Priority

1. **High Priority:** Semantic chunk linking (most impactful)
2. **High Priority:** Material property extraction
3. **Medium Priority:** Metadata extraction
4. **Medium Priority:** Image quality enhancement
5. **Low Priority:** UI improvements (depends on above)

---

## Success Metrics

- [ ] Image 24-25-133.jpg shows 10+ related chunks
- [ ] Material properties populated (not "unknown")
- [ ] Metadata extracted and displayed
- [ ] Image quality improved
- [ ] Confidence scores > 0.7 for properties
- [ ] All relationships properly stored in database

