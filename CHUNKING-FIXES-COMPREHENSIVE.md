# Comprehensive Chunking Fixes

## Problems Identified

### Problem 1: Index Pages Being Chunked ❌
**Example:**
```
MAISON → LINS → VALENOVA → FOLD → ONA → MAISON
```
**Issue**: Multiple product names listed together (index/navigation page)
**Should**: Be classified as INDEX_CONTENT and EXCLUDED from chunks
**Currently**: Being chunked as regular content

### Problem 2: Technical Specs in Chunks ❌
**Example:**
```
TECHNICAL CHARACTERISTICS PACKING
MATT GLOSS SHADE VARIATION FLOOR TRAFFIC...
Porcelain tile ― 22,3 x 22,3 / 8.7 x 8.7"
```
**Issue**: Structured metadata (specs table) in chunks
**Should**: Be in `products.metadata` JSONB field ONLY
**Currently**: Being chunked AND in metadata (duplicate)

### Problem 3: Garbled Text ❌
**Example:**
```
/nine.LP/eight.LP → should be "98"
/emdash.cap → should be "—"
/two.LP/zero.LP/percent.LP → should be "20%"
```
**Issue**: PDF glyph names not converted to Unicode
**Should**: Post-process text to replace glyph names
**Currently**: Raw glyph names stored

---

## Root Causes

1. **Chunk Classifier Not Filtering**: `_is_index_content()` exists but chunks still created
2. **No Exclusion Logic**: Classified chunks (INDEX, TECHNICAL_SPECS) not excluded from storage
3. **No Deduplication**: Content in metadata also stored as chunks
4. **No Glyph Conversion**: pymupdf4llm output not post-processed

---

## Solutions

### Solution 1: Exclude Non-Content Chunks ✅

**Location**: `llamaindex_service.py` line ~2896

**Add BEFORE storing chunk**:
```python
# Classify chunk type
classification_result = await self.chunk_classifier.classify_chunk(node.text)

# ✅ EXCLUDE non-content chunks
EXCLUDED_TYPES = [
    ChunkType.INDEX_CONTENT,           # Index pages
    ChunkType.TECHNICAL_SPECS,         # Specs (goes in metadata)
    ChunkType.CERTIFICATION_INFO,      # Certs (separate entity)
    ChunkType.UNCLASSIFIED             # Too short/unclear
]

if classification_result.chunk_type in EXCLUDED_TYPES:
    rejection_stats['excluded_type'] += 1
    rejection_stats['total_rejected'] += 1
    rejection_details.append({
        'chunk_index': i,
        'reason': 'excluded_chunk_type',
        'chunk_type': classification_result.chunk_type.value,
        'confidence': classification_result.confidence
    })
    self.logger.info(f"⚠️ Chunk {i} excluded: {classification_result.chunk_type.value}")
    continue  # Skip storing this chunk
```

### Solution 2: Improve Index Detection ✅

**Location**: `chunk_type_classification_service.py` line ~327

**Enhance `_is_index_content()`**:
```python
def _is_index_content(self, content: str) -> bool:
    """Check if content represents index/navigation content"""
    content_lower = content.lower()
    
    # ✅ NEW: Detect multiple product names listed together
    # Pattern: UPPERCASE words separated by minimal text
    uppercase_words = re.findall(r'\b[A-Z]{2,}\b', content)
    if len(uppercase_words) >= 3:  # 3+ product names = likely index
        # Check if they're close together (index pattern)
        lines = content.split('\n')
        short_lines = [l for l in lines if len(l.strip()) < 50]
        if len(short_lines) >= 3:
            return True
    
    # ✅ NEW: Detect "by DESIGNER" pattern repeated (index)
    by_pattern_count = len(re.findall(r'by\s+[A-Z]+', content))
    if by_pattern_count >= 3:
        return True
    
    # Existing logic...
    index_keywords = ['table of contents', 'index', 'contents', 'navigation']
    keyword_matches = sum(1 for keyword in index_keywords if keyword in content_lower)
    has_page_numbers = bool(re.search(r'\.\.\.\s*\d+', content))
    has_numbered_list = bool(re.search(r'^\d+\.', content.strip()))
    
    return keyword_matches >= 1 or has_page_numbers or has_numbered_list
```

### Solution 3: Glyph Name Post-Processing ✅

**Location**: `llamaindex_service.py` - add new method

```python
def _fix_glyph_names(self, text: str) -> str:
    """Convert PDF glyph names to actual Unicode characters"""
    replacements = {
        '/nine.LP': '9', '/eight.LP': '8', '/seven.LP': '7',
        '/six.LP': '6', '/five.LP': '5', '/four.LP': '4',
        '/three.LP': '3', '/two.LP': '2', '/one.LP': '1', '/zero.LP': '0',
        '/emdash.cap': '—', '/threequarteremdash': '—',
        '/percent.LP': '%', '/parenleft.cap': '(', '/parenright.cap': ')',
        '/periodcentered.cap': '·', '/minus.cap': '-'
    }
    
    for glyph, char in replacements.items():
        text = text.replace(glyph, char)
    
    return text
```

**Apply BEFORE chunking** (line ~2750):
```python
# Extract text from PDF
text = await self._extract_text_from_pdf(file_path)

# ✅ FIX GLYPH NAMES
text = self._fix_glyph_names(text)

# Continue with chunking...
```

### Solution 4: Deduplicate Metadata Chunks ✅

**After product metadata extraction**, delete chunks for those pages:

```python
# After extracting product metadata
if product_metadata_extracted and product.page_range:
    # Delete chunks from product pages (metadata already extracted)
    await supabase_client.client.table('document_chunks')\
        .delete()\
        .eq('document_id', document_id)\
        .in_('page_number', product.page_range)\
        .execute()
    
    self.logger.info(f"✅ Deleted chunks for pages {product.page_range} (metadata extracted)")
```

---

## Implementation Order

1. ✅ **Glyph Fix** - IMPLEMENTED
2. ✅ **Exclude Non-Content Chunks** - IMPLEMENTED
3. ✅ **Improve Index Detection** - IMPLEMENTED
4. ⏳ **Deduplicate Metadata** (cleanup existing data) - TODO

---

## Implementation Status

### ✅ Solution 1: Glyph Name Post-Processing
**Status**: COMPLETE
**Files Modified**:
- `mivaa-pdf-extractor/app/core/extractor.py`
  - Added `_fix_glyph_names()` function
  - Applied to all extraction functions:
    - `extract_pdf_to_markdown()`
    - `extract_json_and_images()` (all 3 code paths)
    - `extract_json_and_images_streaming()`

**Impact**: All PDF text extraction now converts glyph names to actual characters

### ✅ Solution 2: Exclude Non-Content Chunks
**Status**: COMPLETE
**Files Modified**:
- `mivaa-pdf-extractor/app/services/llamaindex_service.py`
  - Added classification BEFORE chunk storage (line ~2854)
  - Excluded chunk types: INDEX_CONTENT, TECHNICAL_SPECS, CERTIFICATION_INFO, UNCLASSIFIED
  - Updated rejection stats tracking

**Impact**: Index pages and specs no longer stored as chunks

### ✅ Solution 3: Improve Index Detection
**Status**: COMPLETE
**Files Modified**:
- `mivaa-pdf-extractor/app/services/chunk_type_classification_service.py`
  - Enhanced `_is_index_content()` with 4 new detection patterns:
    1. Multiple product names (3+ UPPERCASE words)
    2. Repeated "by DESIGNER" pattern (3+ occurrences)
    3. "COLLECTIONS INDEX" text detection
    4. Multiple size patterns without descriptions

**Impact**: Better detection of index/listing pages

---

## Expected Results

✅ **No more index pages in chunks** (excluded during processing)
✅ **No more technical specs in chunks** (only in metadata)
✅ **No more garbled text** (glyphs converted to Unicode)
✅ **Smaller database** (less junk stored)
✅ **Better search** (only relevant content indexed)
⏳ **No duplicate data** (requires metadata deduplication - next step)

---

## Additional Improvements Suggested

### 1. Product Boundary Detection Enhancement
**Problem**: Chunks don't respect product boundaries
**Solution**: Use existing `boundary_detector.py` service to split chunks at product boundaries
**Benefit**: Each chunk contains content from only ONE product

### 2. Semantic Chunking for Descriptions
**Problem**: Fixed-size chunking breaks mid-sentence
**Solution**: Use semantic chunking (already available in `unified_chunking_service.py`)
**Benefit**: Chunks end at natural boundaries (paragraphs, sentences)

### 3. Chunk Quality Scoring
**Problem**: Some chunks are low-quality (too short, no context)
**Solution**: Already implemented! Quality scores calculated and stored
**Benefit**: Can filter low-quality chunks from search results

### 4. Metadata Extraction Before Chunking
**Problem**: Specs/colors extracted during chunking AND metadata extraction (duplicate)
**Solution**: Extract metadata FIRST, then exclude those pages from chunking
**Benefit**: No duplication, cleaner architecture

### 5. Context-Aware Chunking
**Problem**: Chunks lack context (which product they belong to)
**Solution**: Add product_id to chunk metadata during chunking
**Benefit**: Better search relevance, easier filtering

