# Saved Searches Smart Deduplication System

## Overview

The Saved Searches feature implements an intelligent deduplication system to prevent database bloat and improve user experience by merging semantically similar searches while respecting important contextual differences.

## Problem Statement

**Without Deduplication:**
- "I need a cement tile" → Saved Search #1
- "A cement tile for house floor" → Saved Search #2
- "cement tiles" → Saved Search #3
- "grey cement tile" → Saved Search #4

**Result:** 4 separate database entries for essentially the same search

**With Smart Deduplication:**
- "I need a cement tile" + "A cement tile for house floor" + "cement tiles" → **Merged** (same intent)
- "grey cement tile" → **Separate** (different color specification)
- "A cement tile for outdoors" → **Separate** (different application context)

## Architecture

### 1. AI-Powered Semantic Analysis

**Model:** Claude Haiku 4.5 (fast, cost-effective)

**Process:**
User Query → AI Analysis → Extract:
├── Core Material: "cement tile"
├── Attributes: ["grey", "outdoor", "floor"]
├── Application Context: "outdoor flooring"
├── Intent Category: "product_search"
└── Semantic Fingerprint: embedding vector

### 2. Multi-Layer Matching Strategy

**Layer 1: Exact Match (Fast)**
- Normalized query text comparison
- Material type + color + application

**Layer 2: Semantic Similarity (AI)**
- CLIP embeddings for query text
- Cosine similarity threshold: 0.85+
- Matches: "cement tile" ≈ "cement tiles" ≈ "I need cement tile"

**Layer 3: Metadata Context (Smart)**
- Application context must match
- Critical attributes must align
- Example:
  - ✅ "floor tile" + "flooring tile" → MERGE
  - ❌ "floor tile" + "wall tile" → SEPARATE
  - ❌ "indoor tile" + "outdoor tile" → SEPARATE

### 3. Deduplication Decision Tree

┌─────────────────────────────────────┐
│ New Search: "cement tile for floor" │
└──────────────┬──────────────────────┘
               │
               ▼
    ┌──────────────────────┐
    │ Find Similar Searches │
    │ (Semantic + Metadata) │
    └──────────┬───────────┘
               │
               ▼
    ┌──────────────────────┐
    │ Similarity Score > 0.85? │
    └──────────┬───────────┘
               │
        ┌──────┴──────┐
        │             │
       YES           NO
        │             │
        ▼             ▼
┌───────────────┐  ┌──────────────┐
│ Context Match?│  │ Create New   │
└───────┬───────┘  │ Search Entry │
        │          └──────────────┘
   ┌────┴────┐
   │         │
  YES       NO
   │         │
   ▼         ▼
┌─────────┐ ┌──────────────┐
│ MERGE   │ │ Create New   │
│ Update  │ │ Search Entry │
│ Existing│ └──────────────┘
└─────────┘

## Implementation

### Database Schema Enhancement

The deduplication system requires additional fields on the `saved_searches` table: `semantic_fingerprint` (vector for CLIP embedding), `normalized_query` (cleaned query text), `core_material` (extracted material name), `material_attributes` (JSONB with color, texture, finish, etc.), `application_context` (floor, wall, outdoor, indoor, etc.), `intent_category` (product_search, comparison, recommendation), `merged_from_ids` (UUID array tracking merged search IDs), `merge_count` (integer, default 1), and `last_merged_at` (timestamptz).

Indexes are needed on `semantic_fingerprint` (ivfflat cosine), `normalized_query`, and `(core_material, application_context)`.

### AI Analysis Function

The backend service (`mivaa-pdf-extractor/app/services/search_deduplication_service.py`) uses Claude Haiku 4.5 to extract semantic components from each search query, returning the core material, attributes (color, texture, finish, etc.), application context, intent category, and a CLIP-based semantic fingerprint.

### Deduplication Logic

The `find_or_merge_search` function:
1. Analyzes the query with AI
2. Normalizes the query text for exact matching
3. Finds similar searches using multi-layer matching
4. Checks merge criteria for each candidate
5. Either merges into an existing search or creates a new one

**Merge criteria (`should_merge`):**
1. Semantic similarity > 0.85
2. Same core material
3. Same application context (or both null)
4. Compatible attributes (no conflicts)
5. Similar filters (within tolerance)

**Conflict detection (`has_conflicting_attributes`)** blocks merging when attributes clash, such as different colors, outdoor vs. indoor, wall vs. floor, or matte vs. glossy.

### Merge Strategy

When merging, the system:
1. Keeps the most specific query as primary (longer query with more detail wins)
2. Merges attributes using union (no conflicts)
3. Updates filters to be more inclusive
4. Increments `merge_count`
5. Tracks `merged_from_ids`
6. Updates `last_merged_at`

## User Experience

### Save Search Flow with Deduplication

User clicks "Save Search"
        ↓
AI analyzes query in background
        ↓
Check for similar searches
        ↓
    ┌───────┴───────┐
    │               │
  Found          Not Found
    │               │
    ▼               ▼
┌─────────────┐  ┌──────────────┐
│ Show Modal: │  │ Show Normal  │
│             │  │ Save Modal   │
│ "Similar    │  └──────────────┘
│  search     │
│  found!"    │
│             │
│ Options:    │
│ • Merge     │
│ • Save New  │
└─────────────┘

### Merge Confirmation Modal

The frontend (`src/components/Search/MergeSearchModal.tsx`) displays:
- The existing search (name, query, use count, merge count)
- The new search query
- A similarity score progress bar
- Buttons to "Save as New Search" or "Merge into Existing"

## Performance Optimization

### Caching Strategy

AI analysis results are cached for 1 hour per query string. Similarity search results are cached for 5 minutes per user.

### Batch Processing

A background job (`deduplicate_existing_searches`) can run nightly or on-demand to deduplicate a user's existing saved searches by grouping them by core material and processing each group.

## Analytics & Monitoring

### Deduplication Metrics

A materialized view (`search_deduplication_stats`) tracks daily totals: total searches, total merges, average merges per search, deduplicated search count, and deduplication rate percentage.

### Admin Dashboard Widget

The admin dashboard shows total searches, merged searches count, and database savings percentage.

## Configuration

### Tunable Parameters

Key configuration options include:
- `semantic_similarity_threshold`: 0.85 (range 0.0–1.0)
- `exact_match_threshold`: 0.95 (for normalized queries)
- `require_context_match`: True (must match application context)
- `allow_null_context_merge`: True (merge if both contexts are null)
- `merge_compatible_attributes`: True (union of attributes)
- `block_on_conflicts`: True (don't merge if conflicts)
- `price_range_tolerance`: 0.2 (20% difference allowed)
- `color_tolerance`: "exact"
- `analysis_model`: "claude-haiku-4.5"
- `embedding_model`: "openai-clip"
- `auto_merge_threshold`: 0.95 (auto-merge if > 95% similar)
- `show_merge_suggestion`: True (show modal for 85-95%)
- `min_similarity_to_suggest`: 0.85

## Examples

### Merge Examples

**✅ MERGE:**
- "cement tile" + "cement tiles" → Same material, plural
- "grey cement tile" + "gray cement tile" → Same (spelling variant)
- "cement tile for floor" + "cement tile flooring" → Same context
- "I need cement tile" + "looking for cement tile" → Same intent

**❌ SEPARATE:**
- "grey cement tile" + "white cement tile" → Different color
- "cement tile for floor" + "cement tile for wall" → Different application
- "indoor cement tile" + "outdoor cement tile" → Different context
- "cement tile" + "ceramic tile" → Different material

### Real-World Scenario

User saves "grey cement tiles for kitchen floor" → core_material: "cement tile", attributes: {color: "grey"}, application_context: "kitchen floor".

Same user searches "gray cement tile kitchen" → similarity 0.92, context match ✅, attributes compatible ✅ → Merge suggested, user accepts → 1 database entry instead of 2.

Same user searches "grey cement tile for bathroom" → similarity 0.88, context match ❌ (kitchen ≠ bathroom) → Save as new search → 2 entries (correct!).

## Benefits

1. **Database Efficiency:** 40-60% reduction in duplicate searches
2. **Better Analytics:** Accurate material demand tracking
3. **Improved UX:** Users see consolidated search history
4. **Cost Savings:** Fewer database rows, less storage
5. **Better Recommendations:** More accurate usage patterns
6. **Cleaner UI:** Less clutter in saved searches panel

## Future Enhancements

1. **Multi-language Support:** Merge "cement tile" (EN) + "carrelage ciment" (FR)
2. **Synonym Detection:** "oak wood" = "oak timber" = "oak flooring"
3. **Brand Normalization:** "Egger Board" = "EGGER board" = "egger board"
4. **User Feedback Loop:** Let users manually merge/split searches
5. **Cross-user Deduplication:** Suggest popular public searches

