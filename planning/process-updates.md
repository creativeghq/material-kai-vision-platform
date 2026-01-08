# 📋 Material Kai Vision Platform - Remaining Tasks

**Date:** 2026-01-07
**Status:** 🚧 READY FOR WEEK 2-3 IMPLEMENTATION
**Completed:** Week 1 (Image Extraction) ✅ | Chandra OCR Integration ✅
**Remaining:** Layout-aware chunking + Table extraction + Testing

---

## ✅ COMPLETED (Week 1)

- ✅ 4-layer image extraction (Embedded + Full Render + Vision AI + Deduplication)
- ✅ 100% image coverage (no missed vector graphics)
- ✅ Perceptual hash deduplication
- ✅ Chandra OCR integration with HuggingFace Inference Endpoint
- ✅ Auto-pause after 60s idle (cost control)
- ✅ Database schema updates
- ✅ Frontend integration

---

## 🎯 REMAINING TASKS (Week 2-3)

### Week 2: Layout-Aware Chunking & Table Extraction

#### Task 1: YOLOv10 Layout Detection Integration
**Status:** 🔴 Not Started  
**Priority:** HIGH  
**Estimated Time:** 2-3 days

**What to do:**
1. Install YOLOv10 model for layout detection
2. Integrate layout detection into Stage 1 (page extraction)
3. Detect regions: TITLE, TEXT, TABLE, IMAGE, CAPTION
4. Store layout regions in database
5. Use layout for reading order

**Files to modify:**
- `mivaa-pdf-extractor/app/api/pdf_processing/stage_1_focused_extraction.py`
- Add new table: `product_layout_regions`

**Expected outcome:**
- Layout detection runs before text extraction
- Regions identified and stored
- Reading order preserved

---

#### Task 2: Layout-Aware Chunking
**Status:** 🔴 Not Started  
**Priority:** HIGH  
**Estimated Time:** 2-3 days

**What to do:**
1. Update chunking logic to use layout regions
2. Respect semantic boundaries (paragraphs, sections)
3. Keep tables together (don't split)
4. Keep titles with their content
5. Use reading order from layout detection

**Files to modify:**
- `mivaa-pdf-extractor/app/api/pdf_processing/stage_2_chunking.py`

**Current problem:**
```python
# Blind character-count splitting
chunks = split_text_by_chars(text, chunk_size=1000)
```

**New approach:**
```python
# Layout-aware chunking
for region in layout_regions:
    if region.type == "TEXT":
        chunks = split_by_paragraphs(region.text)
    elif region.type == "TABLE":
        chunks.append(region.table_data)  # Keep together
    elif region.type == "TITLE":
        chunks.append(region.text + next_paragraph)
```

**Expected outcome:**
- No mid-sentence splits
- Tables stay together
- Better semantic chunks
- Improved RAG/search quality

---

#### Task 3: Table Extraction with Camelot
**Status:** 🔴 Not Started  
**Priority:** MEDIUM  
**Estimated Time:** 2-3 days

**What to do:**
1. Install Camelot library
2. Add table extraction to pipeline
3. Extract tables as structured JSON
4. Store in new `product_tables` table
5. Link tables to products

**Files to modify:**
- Create new file: `mivaa-pdf-extractor/app/api/pdf_processing/table_extraction.py`
- Add new table: `product_tables`

**Implementation:**
```python
import camelot

def extract_tables(pdf_path, page_numbers):
    tables = camelot.read_pdf(
        pdf_path, 
        pages=page_numbers,
        flavor='lattice'  # or 'stream'
    )
    return [table.df.to_dict() for table in tables]
```

**Expected outcome:**
- Tables extracted as structured data
- Specifications, pricing tables preserved
- Better metadata extraction

---

#### Task 5: Performance Optimization
**Status:** 🔴 Not Started
**Priority:** MEDIUM
**Estimated Time:** 1-2 days

**What to do:**
1. Profile pipeline bottlenecks
2. Optimize YOLOv10 inference (batch processing)
3. Optimize Chandra OCR (only when needed)
4. Add caching for layout detection
5. Parallel processing where possible

**Expected outcome:**
- Further speed improvements
- Reduced GPU usage
- Better resource utilization

---

## 📚 QUICK REFERENCE

### Key Technologies
- **YOLOv10:** Layout detection (TITLE, TEXT, TABLE, IMAGE, CAPTION)
- **Camelot:** Table extraction library
- **Chandra OCR:** Already integrated via HuggingFace (95% accuracy)
- **EasyOCR:** Fallback OCR (85% accuracy)

### Database Schema Updates Needed
```sql
-- Layout regions table
CREATE TABLE product_layout_regions (
    id SERIAL PRIMARY KEY,
    product_id INTEGER REFERENCES products(id),
    page_number INTEGER,
    region_type VARCHAR(50),  -- TITLE, TEXT, TABLE, IMAGE, CAPTION
    bbox JSONB,  -- {x, y, width, height}
    reading_order INTEGER,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Tables table
CREATE TABLE product_tables (
    id SERIAL PRIMARY KEY,
    product_id INTEGER REFERENCES products(id),
    page_number INTEGER,
    table_data JSONB,  -- Structured table as JSON
    bbox JSONB,
    created_at TIMESTAMP DEFAULT NOW()
);
```

### Key Files to Modify
1. **Stage 1 (Extraction):** `mivaa-pdf-extractor/app/api/pdf_processing/stage_1_focused_extraction.py`
2. **Stage 2 (Chunking):** `mivaa-pdf-extractor/app/api/pdf_processing/stage_2_chunking.py`
3. **New Table Extraction:** `mivaa-pdf-extractor/app/api/pdf_processing/table_extraction.py` (create new)

### Expected Performance Improvements
- **Processing time:** 25-40 sec (vs 2 min before) = 3-5x faster
- **OCR accuracy:** 95% (vs 85% before) = +10% improvement
- **Chunking quality:** No mid-sentence splits, semantic boundaries
- **New capability:** Structured table extraction

### Deployment Notes
- **YOLOv10:** Can run on CPU (500ms/page) or GPU (50ms/page)
- **Chandra OCR:** Already deployed on HuggingFace Inference Endpoint
- **Auto-pause:** Chandra pauses after 60s idle (cost control)
- **Cost:** ~$0.02 per 30-page document

---

## 🎯 NEXT STEPS

1. **Start with Task 1:** YOLOv10 Layout Detection Integration
2. **Test incrementally:** Verify each task before moving to next
3. **Measure improvements:** Compare before/after metrics
4. **Document changes:** Update API docs and deployment guides

---

**Last Updated:** 2026-01-07
**Status:** Ready for Week 2-3 implementation

