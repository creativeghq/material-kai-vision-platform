# Intelligent Page Type Detection & Processing

## Overview

The PDF processing pipeline now includes intelligent page type detection in Stage 0A (Vision Discovery), which enables optimal extraction methods for each page type in Stage 0B (Metadata Extraction).

## Architecture

### Stage 0A: Vision Discovery + Page Type Classification

Claude Vision analyzes ALL PDF pages and provides:
1. Product identification (name, page_range, description)
2. **Page type classification** for each page

**Page Types:**
- **TEXT**: Page has embedded text layer (readable, not image-based)
- **IMAGE**: Page is image-based with text as part of image (no text layer)
- **MIXED**: Page has both embedded text AND significant images
- **EMPTY**: Page is blank or has no meaningful content

**Example Response:**
```json
{
  "name": "VALENOVA",
  "page_range": [24, 25, 26, 27, 28, 29],
  "description": "Modern ceramic collection",
  "page_types": {
    "24": "IMAGE",
    "25": "MIXED",
    "26": "TEXT",
    "27": "IMAGE",
    "28": "TEXT",
    "29": "EMPTY"
  }
}
```

### Stage 0B: Intelligent Extraction Routing

Based on page types from Stage 0A, the system routes each page to the optimal extraction method:

| Page Type | Extraction Method | Speed | Quality |
|-----------|------------------|-------|---------|
| **TEXT** | PyMuPDF4LLM | Fast (~2s for 30 pages) | High for text |
| **IMAGE** | Claude Vision data (from Stage 0A) | Instant (0s) | High for visual content |
| **MIXED** | PyMuPDF4LLM | Fast (~2s) | Gets embedded text |
| **EMPTY** | Skip | Instant | N/A |

**Processing Flow:**
```
1. Separate pages by type (TEXT, IMAGE, MIXED, EMPTY)
2. Extract TEXT pages → PyMuPDF4LLM batch extraction
3. Extract IMAGE pages → Use existing Claude Vision data
4. Extract MIXED pages → PyMuPDF4LLM batch extraction
5. Skip EMPTY pages
6. Combine all results
```

## Benefits

✅ **No more "not a textpage" errors** - Know which pages are image-based BEFORE extraction
✅ **Same processing time** - ~2-3 seconds total (no extra AI calls, no OCR)
✅ **Better quality** - Right extraction method for each page type
✅ **Complete visibility** - Know exactly what type each page is
✅ **Handles ALL PDFs** - Text-based, image-based, or mixed catalogs

## Implementation Details

### ProductInfo Dataclass

Added `page_types` field:
```python
@dataclass
class ProductInfo:
    name: str
    page_range: List[int]
    description: Optional[str] = None
    metadata: Dict[str, Any] = None
    image_indices: List[int] = None
    page_types: Dict[int, str] = None  # {page_num: "TEXT"|"IMAGE"|"MIXED"|"EMPTY"}
    confidence: float = 0.0
```

### Vision Discovery Prompt

Updated to request page type classification:
```
For EACH page in the product's page_range, classify it as:
- "TEXT": Page has embedded text layer
- "IMAGE": Page is image-based with text as part of image
- "MIXED": Page has both embedded text AND images
- "EMPTY": Page is blank

Return page_types for ALL pages in page_range.
```

### Stage 0B Extraction Logic

```python
# Separate pages by type
text_pages = [p for p in pages if page_types[p] == "TEXT"]
image_pages = [p for p in pages if page_types[p] == "IMAGE"]
mixed_pages = [p for p in pages if page_types[p] == "MIXED"]

# Extract TEXT pages with PyMuPDF4LLM
if text_pages:
    text_markdown = pymupdf4llm.to_markdown(pdf_path, pages=text_pages)
    
# Use Claude Vision data for IMAGE pages (already have it!)
if image_pages:
    # Vision data already in product.description and product.metadata
    
# Extract MIXED pages with PyMuPDF4LLM
if mixed_pages:
    mixed_markdown = pymupdf4llm.to_markdown(pdf_path, pages=mixed_pages)
```

## Logging Example

```
📊 Page type distribution: 30 TEXT, 20 IMAGE, 2 MIXED
📄 Extracting 30 TEXT pages with PyMuPDF4LLM...
   ✅ Extracted 45000 characters from TEXT pages
🖼️  Using Claude Vision data for 20 IMAGE pages (already extracted in Stage 0A)
🔀 Extracting 2 MIXED pages with PyMuPDF4LLM...
   ✅ Extracted 3000 characters from MIXED pages
✅ Total extracted: 48000 characters from 52 pages
```

## Files Modified

1. **mivaa-pdf-extractor/app/services/product_discovery_service.py**
   - Added `page_types` field to `ProductInfo` dataclass
   - Updated vision discovery prompt to request page type classification
   - Updated `_parse_discovery_results()` to extract page_types
   - Rewrote Stage 0B extraction with intelligent routing

2. **mivaa-pdf-extractor/app/api/pdf_processing/stage_3_images.py**
   - Fixed `global_memory_monitor` import alias issue

## Testing

Run NOVA test to validate:
```bash
cd /var/www/mivaa-pdf-extractor
node scripts/testing/nova-product-focused-test.mjs
```

Expected results:
- No "not a textpage" errors
- Page type distribution logged
- IMAGE pages use vision data
- All 7 metrics reported correctly

