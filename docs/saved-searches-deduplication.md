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
```
User Query → AI Analysis → Extract:
├── Core Material: "cement tile"
├── Attributes: ["grey", "outdoor", "floor"]
├── Application Context: "outdoor flooring"
├── Intent Category: "product_search"
└── Semantic Fingerprint: embedding vector
```

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

```
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
```

## Implementation

### Database Schema Enhancement

```sql
-- Add deduplication fields to saved_searches table
ALTER TABLE saved_searches ADD COLUMN IF NOT EXISTS
  semantic_fingerprint vector(1536),  -- CLIP embedding
  normalized_query text,               -- Cleaned query text
  core_material text,                  -- Extracted material name
  material_attributes jsonb,           -- {color, texture, finish, etc}
  application_context text,            -- floor, wall, outdoor, indoor, etc
  intent_category text,                -- product_search, comparison, recommendation
  merged_from_ids uuid[],              -- Track merged search IDs
  merge_count integer DEFAULT 1,       -- How many searches merged
  last_merged_at timestamptz;          -- Last merge timestamp

-- Index for fast similarity search
CREATE INDEX IF NOT EXISTS idx_saved_searches_semantic_fingerprint 
  ON saved_searches USING ivfflat (semantic_fingerprint vector_cosine_ops);

-- Index for normalized query lookup
CREATE INDEX IF NOT EXISTS idx_saved_searches_normalized_query 
  ON saved_searches (normalized_query);

-- Index for material + context lookup
CREATE INDEX IF NOT EXISTS idx_saved_searches_material_context 
  ON saved_searches (core_material, application_context);
```

### AI Analysis Function

```python
# Backend: mivaa-pdf-extractor/app/services/search_deduplication_service.py

async def analyze_search_query(query: str) -> SearchAnalysis:
    """
    Use Claude Haiku 4.5 to extract semantic components from search query.
    
    Returns:
        SearchAnalysis with:
        - core_material: Main material being searched
        - attributes: Color, texture, finish, etc
        - application_context: Where it will be used
        - intent_category: Type of search
        - semantic_fingerprint: CLIP embedding
    """
    
    prompt = f"""Analyze this material search query and extract structured information:

Query: "{query}"

Extract:
1. Core Material: The main material/product (e.g., "cement tile", "oak flooring")
2. Attributes: Specific properties (color, texture, finish, size, etc)
3. Application Context: Where it will be used (floor, wall, outdoor, indoor, kitchen, bathroom, etc)
4. Intent Category: product_search, comparison, recommendation, or specification

Return as JSON:
{{
  "core_material": "...",
  "attributes": {{"color": "...", "texture": "...", ...}},
  "application_context": "...",
  "intent_category": "..."
}}

Be precise. If attribute not mentioned, omit it. Context is critical for matching."""

    response = await anthropic_client.messages.create(
        model="claude-haiku-4.5",
        max_tokens=500,
        messages=[{"role": "user", "content": prompt}]
    )
    
    analysis = json.loads(response.content[0].text)
    
    # Generate CLIP embedding for semantic similarity
    embedding = await generate_clip_embedding(query)
    
    return SearchAnalysis(
        core_material=analysis["core_material"],
        attributes=analysis["attributes"],
        application_context=analysis["application_context"],
        intent_category=analysis["intent_category"],
        semantic_fingerprint=embedding
    )
```

### Deduplication Logic

```python
async def find_or_merge_search(
    user_id: str,
    query: str,
    filters: dict,
    material_filters: dict
) -> tuple[str, bool]:  # (search_id, was_merged)
    """
    Find existing similar search or create new one.
    Returns (search_id, was_merged) tuple.
    """
    
    # 1. Analyze query with AI
    analysis = await analyze_search_query(query)
    
    # 2. Normalize query for exact matching
    normalized = normalize_query(query)
    
    # 3. Find similar searches (multi-layer)
    similar_searches = await find_similar_searches(
        user_id=user_id,
        normalized_query=normalized,
        core_material=analysis.core_material,
        semantic_fingerprint=analysis.semantic_fingerprint,
        application_context=analysis.application_context
    )
    
    # 4. Check if any match our merge criteria
    for existing in similar_searches:
        if should_merge(existing, analysis, filters, material_filters):
            # MERGE: Update existing search
            merged_id = await merge_into_existing(
                existing_id=existing.id,
                new_query=query,
                new_filters=filters,
                new_material_filters=material_filters,
                analysis=analysis
            )
            return (merged_id, True)
    
    # 5. No match found - create new search
    new_id = await create_new_search(
        user_id=user_id,
        query=query,
        filters=filters,
        material_filters=material_filters,
        analysis=analysis
    )
    return (new_id, False)


def should_merge(
    existing: SavedSearch,
    new_analysis: SearchAnalysis,
    new_filters: dict,
    new_material_filters: dict
) -> bool:
    """
    Determine if new search should merge with existing.
    
    Merge Criteria:
    1. Semantic similarity > 0.85
    2. Same core material
    3. Same application context (or both null)
    4. Compatible attributes (no conflicts)
    5. Similar filters (within tolerance)
    """
    
    # 1. Semantic similarity check
    similarity = cosine_similarity(
        existing.semantic_fingerprint,
        new_analysis.semantic_fingerprint
    )
    if similarity < 0.85:
        return False
    
    # 2. Core material must match
    if existing.core_material != new_analysis.core_material:
        return False
    
    # 3. Application context must match (critical!)
    if existing.application_context != new_analysis.application_context:
        # Exception: if both are null/generic, allow merge
        if existing.application_context and new_analysis.application_context:
            return False
    
    # 4. Check for conflicting attributes
    if has_conflicting_attributes(
        existing.material_attributes,
        new_analysis.attributes
    ):
        return False
    
    # 5. Check filter compatibility
    if not filters_compatible(
        existing.material_filters,
        new_material_filters
    ):
        return False
    
    return True


def has_conflicting_attributes(
    existing_attrs: dict,
    new_attrs: dict
) -> bool:
    """
    Check if attributes conflict.
    
    Examples:
    - {"color": "grey"} + {"color": "white"} → CONFLICT
    - {"color": "grey"} + {"texture": "smooth"} → NO CONFLICT (additive)
    - {"outdoor": true} + {"indoor": true} → CONFLICT
    """
    
    conflicts = [
        ("color", "color"),           # Different colors
        ("outdoor", "indoor"),        # Outdoor vs indoor
        ("wall", "floor"),            # Wall vs floor
        ("matte", "glossy"),          # Finish conflicts
    ]
    
    for key1, key2 in conflicts:
        if key1 in existing_attrs and key2 in new_attrs:
            if key1 == key2:  # Same key, different value
                if existing_attrs[key1] != new_attrs[key2]:
                    return True
            else:  # Mutually exclusive keys
                return True
    
    return False
```

### Merge Strategy

```python
async def merge_into_existing(
    existing_id: str,
    new_query: str,
    new_filters: dict,
    new_material_filters: dict,
    analysis: SearchAnalysis
) -> str:
    """
    Merge new search into existing one.
    
    Strategy:
    1. Keep most specific query as primary
    2. Merge attributes (union, no conflicts)
    3. Update filters to be more inclusive
    4. Increment merge_count
    5. Track merged_from_ids
    6. Update last_merged_at
    """
    
    existing = await get_saved_search(existing_id)
    
    # Choose better query (more specific wins)
    updated_query = choose_better_query(existing.query, new_query)
    
    # Merge attributes (union)
    merged_attributes = {
        **existing.material_attributes,
        **analysis.attributes
    }
    
    # Merge filters (more inclusive)
    merged_filters = merge_filters(
        existing.material_filters,
        new_material_filters
    )
    
    # Update search
    await supabase.from_("saved_searches").update({
        "query": updated_query,
        "material_attributes": merged_attributes,
        "material_filters": merged_filters,
        "merge_count": existing.merge_count + 1,
        "last_merged_at": "now()",
        "updated_at": "now()"
    }).eq("id", existing_id).execute()
    
    return existing_id


def choose_better_query(existing: str, new: str) -> str:
    """
    Choose more specific/descriptive query.
    
    Heuristics:
    - Longer query usually more specific
    - More attributes mentioned = better
    - Proper grammar = better
    """
    
    # Simple heuristic: longer with more detail wins
    if len(new.split()) > len(existing.split()):
        return new
    return existing
```

## User Experience

### Save Search Flow with Deduplication

```
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
```

### Merge Confirmation Modal

```typescript
// Frontend: src/components/Search/MergeSearchModal.tsx

<Dialog>
  <DialogHeader>
    <DialogTitle>Similar Search Found</DialogTitle>
    <DialogDescription>
      We found a similar saved search. Would you like to merge or save separately?
    </DialogDescription>
  </DialogHeader>
  
  <div className="space-y-4">
    {/* Existing Search */}
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Existing Search</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="font-medium">{existingSearch.name}</p>
        <p className="text-sm text-muted-foreground">{existingSearch.query}</p>
        <div className="flex gap-2 mt-2">
          <Badge>Used {existingSearch.use_count} times</Badge>
          <Badge>Merged {existingSearch.merge_count} searches</Badge>
        </div>
      </CardContent>
    </Card>
    
    {/* New Search */}
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">New Search</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm">{newQuery}</p>
      </CardContent>
    </Card>
    
    {/* Similarity Score */}
    <div className="flex items-center gap-2">
      <span className="text-sm">Similarity:</span>
      <Progress value={similarityScore * 100} />
      <span className="text-sm font-medium">{(similarityScore * 100).toFixed(0)}%</span>
    </div>
  </div>
  
  <DialogFooter>
    <Button variant="outline" onClick={() => saveAsNew()}>
      Save as New Search
    </Button>
    <Button onClick={() => mergeIntoExisting()}>
      Merge into Existing
    </Button>
  </DialogFooter>
</Dialog>
```

## Performance Optimization

### Caching Strategy

```python
# Cache AI analysis results for 1 hour
@cache(ttl=3600)
async def analyze_search_query(query: str) -> SearchAnalysis:
    # ... AI analysis
    pass

# Cache similarity searches for 5 minutes
@cache(ttl=300)
async def find_similar_searches(user_id: str, **kwargs) -> list[SavedSearch]:
    # ... database query
    pass
```

### Batch Processing

```python
# For bulk imports or migrations
async def deduplicate_existing_searches(user_id: str):
    """
    Background job to deduplicate existing saved searches.
    Run nightly or on-demand.
    """
    
    searches = await get_all_user_searches(user_id)
    
    # Group by core material
    by_material = defaultdict(list)
    for search in searches:
        analysis = await analyze_search_query(search.query)
        by_material[analysis.core_material].append((search, analysis))
    
    # Process each material group
    for material, group in by_material.items():
        await deduplicate_group(group)
```

## Analytics & Monitoring

### Deduplication Metrics

```sql
-- Track deduplication effectiveness
CREATE MATERIALIZED VIEW search_deduplication_stats AS
SELECT
  DATE_TRUNC('day', created_at) as date,
  COUNT(*) as total_searches,
  SUM(merge_count) as total_merges,
  AVG(merge_count) as avg_merges_per_search,
  COUNT(*) FILTER (WHERE merge_count > 1) as deduplicated_searches,
  ROUND(
    COUNT(*) FILTER (WHERE merge_count > 1)::numeric / COUNT(*)::numeric * 100,
    2
  ) as deduplication_rate_percent
FROM saved_searches
GROUP BY DATE_TRUNC('day', created_at);
```

### Admin Dashboard Widget

```typescript
// Show deduplication savings
<Card>
  <CardHeader>
    <CardTitle>Search Deduplication</CardTitle>
  </CardHeader>
  <CardContent>
    <div className="space-y-2">
      <div className="flex justify-between">
        <span>Total Searches:</span>
        <span className="font-bold">{stats.total_searches}</span>
      </div>
      <div className="flex justify-between">
        <span>Merged Searches:</span>
        <span className="font-bold text-green-600">{stats.total_merges}</span>
      </div>
      <div className="flex justify-between">
        <span>Database Savings:</span>
        <span className="font-bold text-green-600">
          {((stats.total_merges / stats.total_searches) * 100).toFixed(1)}%
        </span>
      </div>
    </div>
  </CardContent>
</Card>
```

## Configuration

### Tunable Parameters

```python
# config/deduplication.py

DEDUPLICATION_CONFIG = {
    # Similarity thresholds
    "semantic_similarity_threshold": 0.85,  # 0.0 - 1.0
    "exact_match_threshold": 0.95,          # For normalized queries
    
    # Context matching
    "require_context_match": True,          # Must match application context
    "allow_null_context_merge": True,       # Merge if both contexts are null
    
    # Attribute handling
    "merge_compatible_attributes": True,    # Union of attributes
    "block_on_conflicts": True,             # Don't merge if conflicts
    
    # Filter tolerance
    "price_range_tolerance": 0.2,           # 20% difference allowed
    "color_tolerance": "exact",             # exact, similar, any
    
    # AI model
    "analysis_model": "claude-haiku-4.5",
    "embedding_model": "openai-clip",
    
    # Performance
    "enable_caching": True,
    "cache_ttl_seconds": 3600,
    "max_similar_searches": 10,
    
    # User experience
    "auto_merge_threshold": 0.95,           # Auto-merge if > 95% similar
    "show_merge_suggestion": True,          # Show modal for 85-95%
    "min_similarity_to_suggest": 0.85,
}
```

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

```
User 1 saves: "grey cement tiles for kitchen floor"
  → Analysis: {
       core_material: "cement tile",
       attributes: {color: "grey"},
       application_context: "kitchen floor"
     }

User 1 later searches: "gray cement tile kitchen"
  → Analysis: {
       core_material: "cement tile",
       attributes: {color: "grey"},  // normalized
       application_context: "kitchen floor"
     }
  → Similarity: 0.92
  → Context Match: ✅
  → Attributes Compatible: ✅
  → RESULT: Merge suggested, user accepts
  → Database: 1 entry instead of 2

User 1 searches: "grey cement tile for bathroom"
  → Analysis: {
       core_material: "cement tile",
       attributes: {color: "grey"},
       application_context: "bathroom floor"
     }
  → Similarity: 0.88
  → Context Match: ❌ (kitchen ≠ bathroom)
  → RESULT: Save as new search
  → Database: 2 entries (correct!)
```

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

