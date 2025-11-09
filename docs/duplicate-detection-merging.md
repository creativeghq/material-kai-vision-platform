# Duplicate Material Detection & Merging

Complete reference for the duplicate detection and product merging system.

---

## Overview

The Duplicate Material Detection & Merging system helps maintain data quality by identifying and consolidating duplicate products in the knowledge base. **CRITICAL: Duplicates are ONLY detected when products are from the SAME factory/manufacturer.**

### Key Principle

**Duplicates are defined by factory/manufacturer match, NOT visual similarity:**
- ✅ Same factory + similar name = DUPLICATE
- ❌ Different factory + identical appearance = NOT duplicate
- ❌ Same factory + different color/pattern = NOT duplicate (different variants)

---

## Architecture

### Detection Strategy

**Three-Layer Matching (After Factory Verification):**

1. **Layer 1: Factory Match (REQUIRED)**
   - Extract factory/manufacturer from product metadata
   - Check priority keys: `factory`, `manufacturer`, `factory_group`, `brand`, `company`
   - If factories don't match → NOT duplicates (stop here)

2. **Layer 2: Name Similarity (50% weight)**
   - String similarity using sequence matching
   - Normalized comparison (lowercase, trimmed)
   - Threshold: 0.50+

3. **Layer 3: Description & Metadata (30% + 20% weight)**
   - Description text similarity
   - Metadata property comparison (excluding factory keys)
   - Combined threshold: 0.20+

### Similarity Scoring

**Overall Score Calculation:**
```
overall_score = (name_sim × 0.50) + (desc_sim × 0.30) + (meta_sim × 0.20)
```

**Confidence Levels:**
- **High**: 85%+ (very likely duplicate)
- **Medium**: 70-85% (possible duplicate)
- **Low**: 55-70% (review needed)

---

## Database Schema

### product_merge_history Table

Tracks all merge operations with full audit trail and undo capability.

```sql
CREATE TABLE product_merge_history (
  id UUID PRIMARY KEY,
  workspace_id UUID NOT NULL,
  merged_at TIMESTAMP DEFAULT NOW(),
  merged_by UUID REFERENCES auth.users(id),
  
  -- Source products being merged
  source_product_ids UUID[] NOT NULL,
  source_product_names TEXT[] NOT NULL,
  
  -- Target product (kept)
  target_product_id UUID NOT NULL,
  target_product_name TEXT NOT NULL,
  
  -- Merge metadata
  similarity_score FLOAT,
  merge_reason TEXT,
  merge_strategy TEXT, -- 'manual', 'auto', 'suggested'
  
  -- Snapshots for undo
  source_products_snapshot JSONB,
  target_product_before_merge JSONB,
  target_product_after_merge JSONB,
  
  -- Undo tracking
  is_undone BOOLEAN DEFAULT FALSE,
  undone_at TIMESTAMP,
  undone_by UUID REFERENCES auth.users(id)
);
```

### duplicate_detection_cache Table

Stores pre-computed duplicate pairs for quick lookup.

```sql
CREATE TABLE duplicate_detection_cache (
  id UUID PRIMARY KEY,
  workspace_id UUID NOT NULL,
  
  -- Product pair
  product_id_1 UUID NOT NULL,
  product_id_2 UUID NOT NULL,
  
  -- Similarity scores
  overall_similarity_score FLOAT NOT NULL,
  name_similarity FLOAT,
  description_similarity FLOAT,
  metadata_similarity FLOAT,
  similarity_breakdown JSONB,
  
  -- Status tracking
  is_duplicate BOOLEAN DEFAULT FALSE,
  confidence_level TEXT, -- 'high', 'medium', 'low'
  status TEXT DEFAULT 'pending', -- 'pending', 'reviewed', 'merged', 'dismissed'
  
  -- Review tracking
  reviewed_by UUID REFERENCES auth.users(id),
  reviewed_at TIMESTAMP
);
```

---

## API Endpoints

### 1. Detect Duplicates for Single Product

**Endpoint:** `POST /api/duplicates/detect`

Find potential duplicates for a specific product.

**Request:**
```json
{
  "product_id": "uuid",
  "workspace_id": "uuid",
  "similarity_threshold": 0.60
}
```

**Response:**
```json
{
  "success": true,
  "product_id": "uuid",
  "duplicates_found": 3,
  "duplicates": [
    {
      "product_id": "uuid",
      "name": "Product Name",
      "factory": "Factory Name",
      "overall_similarity": 0.92,
      "name_similarity": 0.95,
      "description_similarity": 0.88,
      "metadata_similarity": 0.85,
      "confidence_level": "high"
    }
  ],
  "note": "Only products from the same factory/manufacturer are considered duplicates"
}
```

**CRITICAL:** Returns empty list if product has no factory metadata.

---

### 2. Batch Detect Duplicates

**Endpoint:** `POST /api/duplicates/batch-detect`

Scan entire workspace for duplicate products.

**Request:**
```json
{
  "workspace_id": "uuid",
  "similarity_threshold": 0.75,
  "limit": 1000
}
```

**Response:**
```json
{
  "success": true,
  "workspace_id": "uuid",
  "duplicate_pairs_found": 15,
  "duplicate_pairs": [
    {
      "product_id_1": "uuid",
      "product_id_2": "uuid",
      "product_1_name": "Name 1",
      "product_2_name": "Name 2",
      "factory": "Factory Name",
      "overall_similarity": 0.88,
      "confidence_level": "high"
    }
  ],
  "note": "Only products from the same factory/manufacturer are considered duplicates"
}
```

---

### 3. Get Cached Duplicates

**Endpoint:** `GET /api/duplicates/cached`

Retrieve cached duplicate detections.

**Query Parameters:**
- `workspace_id` (required): Workspace to query
- `status` (optional): Filter by status ('pending', 'reviewed', 'merged', 'dismissed')
- `min_similarity` (optional): Minimum similarity score (default: 0.60)

**Response:**
```json
{
  "success": true,
  "workspace_id": "uuid",
  "cached_duplicates": 42,
  "duplicates": [...]
}
```

---

### 4. Update Duplicate Status

**Endpoint:** `POST /api/duplicates/update-status`

Update the status of a cached duplicate detection.

**Request:**
```json
{
  "cache_id": "uuid",
  "status": "reviewed",
  "user_id": "uuid"
}
```

**Valid Statuses:**
- `pending` - Not yet reviewed
- `reviewed` - Admin has reviewed
- `merged` - Products have been merged
- `dismissed` - Not actually duplicates

**Response:**
```json
{
  "success": true,
  "message": "Status updated to 'reviewed'"
}
```

---

### 5. Merge Products

**Endpoint:** `POST /api/duplicates/merge`

Merge duplicate products into a single product.

**Request:**
```json
{
  "target_product_id": "uuid",
  "source_product_ids": ["uuid1", "uuid2"],
  "workspace_id": "uuid",
  "user_id": "uuid",
  "merge_strategy": "manual",
  "merge_reason": "Duplicate from same factory"
}
```

**Merge Process:**
1. Merges data from source products into target
2. Transfers all relationships (images, chunks, etc.)
3. Deletes source products
4. Records merge in history for undo capability

**Response:**
```json
{
  "success": true,
  "history_id": "uuid",
  "target_product": {...},
  "merged_count": 2,
  "message": "Successfully merged 2 products"
}
```

**Data Merge Strategy:**
- **Name:** Keep target name (primary identifier)
- **Description:** Combine unique descriptions with " | " separator
- **Metadata:** Union of all metadata (no overwrites)
- **Chunks:** Combine all source chunks
- **Relationships:** Transfer all image/document relationships

---

### 6. Undo Merge

**Endpoint:** `POST /api/duplicates/undo-merge`

Undo a product merge operation.

**Request:**
```json
{
  "history_id": "uuid",
  "user_id": "uuid"
}
```

**Undo Process:**
1. Restores all source products from snapshot
2. Reverts target product to pre-merge state
3. Marks merge as undone in history

**Response:**
```json
{
  "success": true,
  "message": "Merge successfully undone",
  "restored_products": 2
}
```

---

### 7. Get Merge History

**Endpoint:** `GET /api/duplicates/merge-history`

Retrieve merge history for a workspace.

**Query Parameters:**
- `workspace_id` (required): Workspace to query
- `limit` (optional): Maximum results (default: 50)

**Response:**
```json
{
  "success": true,
  "workspace_id": "uuid",
  "merge_count": 12,
  "merges": [
    {
      "id": "uuid",
      "merged_at": "2025-11-09T10:30:00Z",
      "merged_by": "uuid",
      "source_product_names": ["Product A", "Product B"],
      "target_product_name": "Product A",
      "similarity_score": 0.92,
      "merge_strategy": "manual",
      "is_undone": false
    }
  ]
}
```

---

## Implementation Details

### Factory Extraction

Factory information is extracted from product metadata in priority order:

```python
FACTORY_KEYS = [
    'factory',           # Primary
    'manufacturer',      # Secondary
    'factory_group',     # Tertiary
    'brand',            # Fallback
    'company'           # Last resort
]
```

**Example:**
```json
{
  "product_id": "uuid",
  "name": "Ceramic Tile",
  "metadata": {
    "factory": "Porcelanosa",
    "manufacturer": "Porcelanosa Group",
    "color": "White",
    "size": "30x30cm"
  }
}
```

Factory extracted: `"porcelanosa"` (normalized to lowercase)

### Similarity Calculation

**Name Similarity:**
```python
# Sequence matching with normalization
similarity = SequenceMatcher(
    None,
    name1.lower().strip(),
    name2.lower().strip()
).ratio()
```

**Description Similarity:**
```python
# Text similarity using word overlap
common_words = set(desc1.split()) & set(desc2.split())
similarity = len(common_words) / max(len(desc1.split()), len(desc2.split()))
```

**Metadata Similarity:**
```python
# Property comparison (excluding factory keys)
matching_properties = count_matching_metadata_properties(meta1, meta2)
similarity = matching_properties / total_properties
```

---

## Usage Examples

### Example 1: Detect Duplicates for Product

```bash
curl -X POST http://localhost:8000/api/duplicates/detect \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "product_id": "550e8400-e29b-41d4-a716-446655440000",
    "workspace_id": "550e8400-e29b-41d4-a716-446655440001",
    "similarity_threshold": 0.70
  }'
```

### Example 2: Merge Duplicate Products

```bash
curl -X POST http://localhost:8000/api/duplicates/merge \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "target_product_id": "550e8400-e29b-41d4-a716-446655440000",
    "source_product_ids": [
      "550e8400-e29b-41d4-a716-446655440002",
      "550e8400-e29b-41d4-a716-446655440003"
    ],
    "workspace_id": "550e8400-e29b-41d4-a716-446655440001",
    "user_id": "550e8400-e29b-41d4-a716-446655440004",
    "merge_strategy": "manual",
    "merge_reason": "Duplicate from Porcelanosa factory"
  }'
```

### Example 3: Undo Merge

```bash
curl -X POST http://localhost:8000/api/duplicates/undo-merge \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "history_id": "550e8400-e29b-41d4-a716-446655440005",
    "user_id": "550e8400-e29b-41d4-a716-446655440004"
  }'
```

---

## Integration Points

### Future Integration

When integrating with the platform:

1. **PDF Processing Pipeline**
   - Call `/api/duplicates/detect` during product creation
   - Check for existing products from same factory
   - Prevent duplicate creation or auto-merge

2. **Admin Dashboard**
   - Add duplicate detection UI
   - Show merge suggestions
   - Provide merge history viewer

3. **Batch Operations**
   - Call `/api/duplicates/batch-detect` for workspace cleanup
   - Bulk merge similar products
   - Generate deduplication reports

---

## Best Practices

1. **Always verify factory match** before considering products as duplicates
2. **Use high confidence threshold (85%+)** for automatic merging
3. **Review medium confidence (70-85%)** duplicates manually
4. **Keep merge history** for audit trail and undo capability
5. **Test with small batches** before large-scale merging
6. **Monitor similarity scores** to tune thresholds over time

---

## Troubleshooting

### No Duplicates Found

**Possible Causes:**
- Products don't have factory metadata
- Factory names don't match exactly (case-sensitive after normalization)
- Similarity scores below threshold

**Solution:**
- Verify factory metadata is populated
- Check factory name normalization
- Lower similarity threshold for testing

### Merge Failed

**Possible Causes:**
- Source product not found
- Target product not found
- Database constraint violation

**Solution:**
- Verify product IDs exist in workspace
- Check workspace_id matches
- Review database logs

### Cannot Undo Merge

**Possible Causes:**
- Merge already undone
- History record deleted
- Source products already modified

**Solution:**
- Check merge history status
- Verify history record exists
- Restore from backup if needed

---

## Performance Considerations

- **Batch detection** can be slow for large workspaces (1000+ products)
- **Caching** improves repeated lookups
- **Factory grouping** reduces comparison pairs
- **Similarity threshold** affects result count and accuracy

---

**Last Updated**: November 9, 2025
**Status**: Production Ready
**API Version**: 1.0

