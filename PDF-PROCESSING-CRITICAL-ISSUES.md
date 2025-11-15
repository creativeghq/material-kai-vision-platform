# PDF Processing - Critical Issues Found

## Issue Summary

After investigating the Harmony PDF processing results, found **5 CRITICAL ISSUES**:

1. ✅ **Embeddings Display** - FALSE ALARM (embeddings exist, frontend display issue)
2. ❌ **Images Not Loading** - URLs exist but not displaying
3. ❌ **Garbled Text** - PDF glyph names not converted to characters
4. ❌ **Colors in Chunks** - Wrong architecture (should only be in products)
5. ❌ **Incomplete Metadata** - Some products missing detailed extraction

---

## 1. Embeddings Display Issue ✅ RESOLVED

**Status**: FALSE ALARM - embeddings ARE being generated

**Evidence**:
- Query shows 249 embeddings for recent 3 documents
- Embeddings stored in separate `embeddings` table (not `document_chunks`)
- Frontend checking wrong field/table

**Fix**: Update frontend to query `embeddings` table joined with `document_chunks`

---

## 2. Images Not Loading ❌ CRITICAL

**Status**: BROKEN - images have URLs but not displaying in frontend

**Evidence**:
- 221 images found for recent 3 documents
- All have `image_url` populated (100% coverage)
- URLs need validation

**Investigation Needed**:
```sql
SELECT image_url, page_number, image_type 
FROM document_images 
WHERE document_id = 'recent_doc_id' 
LIMIT 5;
```

**Possible Causes**:
1. Invalid Supabase storage URLs
2. Missing CORS configuration
3. Frontend not fetching/rendering correctly
4. Storage bucket permissions

---

## 3. Garbled Text in Chunks ❌ CRITICAL

**Status**: MAJOR QUALITY ISSUE - pymupdf4llm not converting glyphs

**Evidence**:
```
/nine.LP/eight.LP  → should be "98"
/emdash.cap        → should be "—"
/one.LP/four.LP/zero.LP → should be "140"
/two.LP/zero.LP/percent.LP → should be "20%"
```

**Example Garbled Content**:
```
"MAISON • • • • C1 • 20,00 1.86 13,00 0,65 7.00 12,58 27.73 90 58,5 629.69 1155,64 2548.19 120X80X84 9,00 0.35Porcelain tile  ―  /two.LP/two.LP,/three.LP  x /two.LP/two.LP,/three.LP  /  /eight.LP./seven.LP x /eight.LP./seven.LP"
```

**Root Cause**: pymupdf4llm using glyph names instead of actual Unicode characters

**Fix Options**:
1. **Switch to PyMuPDF direct extraction** (recommended)
2. Post-process pymupdf4llm output to convert glyph names
3. Use different extraction library (pdfplumber, pypdf)

**Recommended Fix**:
```python
# Replace pymupdf4llm with direct PyMuPDF extraction
import pymupdf as fitz

doc = fitz.open(pdf_path)
for page in doc:
    text = page.get_text("text")  # Gets actual Unicode text
    # OR
    text = page.get_text("dict")  # Gets structured text with positions
```

---

## 4. Colors in Chunks ❌ WRONG ARCHITECTURE

**Status**: ARCHITECTURAL ISSUE - colors should NOT be in chunks

**Current State**:
- Chunks contain color information mixed with text
- Example: "Colors: /emdash.cap /nine.LP/eight.LP"

**Correct Architecture**:
- **Chunks**: Raw text content only (for semantic search)
- **Products**: Structured metadata including colors, SKUs, dimensions
- **Metadata**: Extracted properties in JSONB format

**Fix**: 
1. Remove color extraction from chunking process
2. Ensure colors only extracted during product metadata extraction
3. Update chunking to exclude metadata sections

---

## 5. Incomplete Product Metadata ❌ CRITICAL

**Status**: INCONSISTENT EXTRACTION - some products have full metadata, others minimal

**Evidence**:

**GOOD Example (FOLD product)**:
```json
{
  "design": { "designer": "Dsignio", "studio": "Dsignio", ... },
  "appearance": { "mare_colors": ["white", "silver", "sand"], ... },
  "commercial": { "sku_castello_clay": "34827", ... },
  "dimensions": { "mare_width": "90", "mare_length": "32", ... },
  "technical": { "mare_models": "3 models", ... }
}
```

**BAD Example (MAISON product)**:
```json
{
  "format": "22.3x22.3 cm",
  "category": "tiles",
  "designer": "ONSET",
  "confidence": 0.98,
  "page_range": [120, 121, 122, 123, 124, 125]
}
```

**Missing from MAISON**:
- Colors (should have white, anthracite based on PDF)
- SKUs/product codes
- Detailed dimensions breakdown
- Appearance properties
- Commercial data
- Technical specifications

**Root Cause**: Inconsistent AI extraction - some products get full extraction, others minimal

**Fix**:
1. Review product extraction prompts for consistency
2. Ensure all products go through same extraction pipeline
3. Add validation to reject incomplete extractions
4. Re-process MAISON product with full extraction

---

## Priority Fixes

### P0 - IMMEDIATE (Breaks User Experience)
1. **Fix garbled text** - Switch from pymupdf4llm to PyMuPDF direct extraction
2. **Fix images not loading** - Investigate and fix image URL/display issue

### P1 - HIGH (Data Quality)
3. **Fix incomplete metadata** - Ensure consistent product extraction
4. **Remove colors from chunks** - Fix architectural issue

### P2 - MEDIUM (UI Polish)
5. **Fix embeddings display** - Update frontend to show correct embedding status

---

## Next Steps

1. **Investigate image URLs** - Check actual URLs and storage paths
2. **Test PyMuPDF direct extraction** - Compare quality vs pymupdf4llm
3. **Audit product extraction** - Find why MAISON has minimal metadata
4. **Create fix PRs** - Separate PRs for each issue
5. **Re-process Harmony PDF** - After fixes, re-run full pipeline

