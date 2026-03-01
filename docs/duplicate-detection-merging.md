# Duplicate Material Detection & Merging

Complete reference for the duplicate detection and product merging system.

---

## Overview

The Duplicate Material Detection & Merging system helps maintain data quality by identifying and consolidating duplicate products in the knowledge base. **CRITICAL: Duplicates are ONLY detected when products are from the SAME factory/manufacturer.**

### Key Principle

**Duplicates are defined by factory/manufacturer match, NOT visual similarity:**
- Same factory + similar name = DUPLICATE
- Different factory + identical appearance = NOT duplicate
- Same factory + different color/pattern = NOT duplicate (different variants)

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

Fields: `id`, `workspace_id`, `merged_at`, `merged_by`, `source_product_ids`, `source_product_names`, `target_product_id`, `target_product_name`, `similarity_score`, `merge_reason`, `merge_strategy` ('manual', 'auto', 'suggested'), `source_products_snapshot`, `target_product_before_merge`, `target_product_after_merge`, `is_undone`, `undone_at`, `undone_by`.

### duplicate_detection_cache Table

Stores pre-computed duplicate pairs for quick lookup.

Fields: `id`, `workspace_id`, `product_id_1`, `product_id_2`, `overall_similarity_score`, `name_similarity`, `description_similarity`, `metadata_similarity`, `similarity_breakdown`, `is_duplicate`, `confidence_level` ('high', 'medium', 'low'), `status` ('pending', 'reviewed', 'merged', 'dismissed'), `reviewed_by`, `reviewed_at`.

---

## API Endpoints

### 1. Detect Duplicates for Single Product

**Endpoint:** `POST /api/duplicates/detect`

Find potential duplicates for a specific product.

The request takes `product_id`, `workspace_id`, and an optional `similarity_threshold`. The response includes a list of matching products with their `overall_similarity`, `name_similarity`, `description_similarity`, `metadata_similarity`, and `confidence_level`.

**CRITICAL:** Returns empty list if product has no factory metadata.

---

### 2. Batch Detect Duplicates

**Endpoint:** `POST /api/duplicates/batch-detect`

Scan entire workspace for duplicate products.

The request takes `workspace_id`, `similarity_threshold`, and `limit`. The response includes all detected duplicate pairs, each showing both product IDs, names, shared factory, overall similarity, and confidence level.

---

### 3. Get Cached Duplicates

**Endpoint:** `GET /api/duplicates/cached`

Retrieve cached duplicate detections.

**Query Parameters:**
- `workspace_id` (required): Workspace to query
- `status` (optional): Filter by status ('pending', 'reviewed', 'merged', 'dismissed')
- `min_similarity` (optional): Minimum similarity score (default: 0.60)

---

### 4. Update Duplicate Status

**Endpoint:** `POST /api/duplicates/update-status`

Update the status of a cached duplicate detection.

The request takes `cache_id`, `status`, and `user_id`.

**Valid Statuses:**
- `pending` - Not yet reviewed
- `reviewed` - Admin has reviewed
- `merged` - Products have been merged
- `dismissed` - Not actually duplicates

---

### 5. Merge Products

**Endpoint:** `POST /api/duplicates/merge`

Merge duplicate products into a single product.

The request takes `target_product_id`, `source_product_ids`, `workspace_id`, `user_id`, `merge_strategy`, and `merge_reason`.

**Merge Process:**
1. Merges data from source products into target
2. Transfers all relationships (images, chunks, etc.)
3. Deletes source products
4. Records merge in history for undo capability

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

The request takes `history_id` and `user_id`.

**Undo Process:**
1. Restores all source products from snapshot
2. Reverts target product to pre-merge state
3. Marks merge as undone in history

---

### 7. Get Merge History

**Endpoint:** `GET /api/duplicates/merge-history`

Retrieve merge history for a workspace.

**Query Parameters:**
- `workspace_id` (required): Workspace to query
- `limit` (optional): Maximum results (default: 50)

The response includes a list of merge records with `merged_at`, `merged_by`, `source_product_names`, `target_product_name`, `similarity_score`, `merge_strategy`, and `is_undone`.

---

## Implementation Details

### Factory Extraction

Factory information is extracted from product metadata in priority order: `factory` (Primary), `manufacturer` (Secondary), `factory_group` (Tertiary), `brand` (Fallback), `company` (Last resort). The extracted value is normalized to lowercase.

### Similarity Calculation

**Name Similarity:** Uses sequence matching with normalization — lowercase, trimmed comparison of product names.

**Description Similarity:** Text similarity using word overlap — counts common words divided by the maximum word count of either description.

**Metadata Similarity:** Property comparison (excluding factory keys) — counts matching metadata properties divided by total properties.

---

## Usage Examples

### Example 1: Detect Duplicates for Product

Send a POST request to `/api/duplicates/detect` with the `product_id`, `workspace_id`, and `similarity_threshold` in the request body, including your authorization token.

### Example 2: Merge Duplicate Products

Send a POST request to `/api/duplicates/merge` specifying the `target_product_id`, `source_product_ids` array, `workspace_id`, `user_id`, `merge_strategy`, and `merge_reason`.

### Example 3: Undo Merge

Send a POST request to `/api/duplicates/undo-merge` with the `history_id` and `user_id`.

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
