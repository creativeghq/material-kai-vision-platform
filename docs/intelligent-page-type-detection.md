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

The response for each product includes a `page_types` dictionary mapping page numbers to their type classification (e.g., `"24": "IMAGE"`, `"25": "MIXED"`, `"26": "TEXT"`).

### Stage 0B: Intelligent Extraction Routing

Based on page types from Stage 0A, the system routes each page to the optimal extraction method:

| Page Type | Extraction Method | Speed | Quality |
|-----------|------------------|-------|---------|
| **TEXT** | PyMuPDF4LLM | Fast (~2s for 30 pages) | High for text |
| **IMAGE** | Claude Vision data (from Stage 0A) | Instant (0s) | High for visual content |
| **MIXED** | PyMuPDF4LLM | Fast (~2s) | Gets embedded text |
| **EMPTY** | Skip | Instant | N/A |

**Processing Flow:**

1. Separate pages by type (TEXT, IMAGE, MIXED, EMPTY)
2. Extract TEXT pages → PyMuPDF4LLM batch extraction
3. Extract IMAGE pages → Use existing Claude Vision data
4. Extract MIXED pages → PyMuPDF4LLM batch extraction
5. Skip EMPTY pages
6. Combine all results

## Benefits

✅ **No more "not a textpage" errors** - Know which pages are image-based BEFORE extraction
✅ **Same processing time** - ~2-3 seconds total (no extra AI calls, no OCR)
✅ **Better quality** - Right extraction method for each page type
✅ **Complete visibility** - Know exactly what type each page is
✅ **Handles ALL PDFs** - Text-based, image-based, or mixed catalogs

## Implementation Details

### ProductInfo Dataclass

The `ProductInfo` dataclass (`mivaa-pdf-extractor/app/services/product_discovery_service.py`) was updated to include a `page_types` field: a dictionary mapping page numbers (int) to type strings (`"TEXT"`, `"IMAGE"`, `"MIXED"`, or `"EMPTY"`).

### Vision Discovery Prompt

Updated to request page type classification for EACH page in the product's `page_range`. The model classifies each page and returns `page_types` for ALL pages in the range.

### Stage 0B Extraction Logic

Pages are separated by type, then:
- TEXT and MIXED pages are batched and extracted via PyMuPDF4LLM
- IMAGE pages reuse the Claude Vision data already collected in Stage 0A
- EMPTY pages are skipped entirely

## Logging Example

The log output shows page type distribution (e.g., "30 TEXT, 20 IMAGE, 2 MIXED"), then reports character counts as each batch completes: TEXT pages extracted via PyMuPDF4LLM (~45,000 chars), IMAGE pages resolved from Stage 0A vision data (0s, instant), MIXED pages extracted via PyMuPDF4LLM (~3,000 chars), and a final total (e.g., "48,000 characters from 52 pages").

## Files Modified

1. **mivaa-pdf-extractor/app/services/product_discovery_service.py**
   - Added `page_types` field to `ProductInfo` dataclass
   - Updated vision discovery prompt to request page type classification
   - Updated `_parse_discovery_results()` to extract page_types
   - Rewrote Stage 0B extraction with intelligent routing

2. **mivaa-pdf-extractor/app/api/pdf_processing/stage_3_images.py**
   - Fixed `global_memory_monitor` import alias issue

## Testing

Run the NOVA test to validate. Expected results:
- No "not a textpage" errors
- Page type distribution logged
- IMAGE pages use vision data
- All 7 metrics reported correctly

