# PDF Processing Complete Flow - Material Kai Vision Platform

**Last Updated**: 2025-10-26  
**Status**: Production Documentation - Verified Against Actual Implementation

---

## 📋 Overview

This document provides a **step-by-step breakdown** of the complete PDF processing pipeline, detailing every AI model used, what data is generated, and where it's stored.

---

## 🔄 Complete Processing Flow

```
Step 1: PDF Upload & Validation
↓
Step 2: Background Job Creation
↓
Step 3: PDF Analysis & Strategy Selection
↓
Step 4: Text Extraction (PyMuPDF4LLM)
↓
Step 5: Image Extraction & Upload
↓
Step 6: Semantic Chunking
↓
Step 7: Text Embeddings Generation ⚠️ BROKEN
↓
Step 8: Product Creation (Two-Stage)
↓
Step 9: Deferred AI Analysis ⚠️ NOT IMPLEMENTED
↓
Step 10: Job Completion
```

---

## 📄 Step-by-Step Breakdown

### **Step 1: PDF Upload & Validation**

**Component**: Frontend → Supabase Edge Function → MIVAA Gateway  
**Duration**: 2-5 seconds

**Process**:
1. User uploads PDF via `MivaaPDFProcessor.tsx`
2. File validated (type: PDF, max size: 50MB)
3. PDF sent to MIVAA gateway: `POST https://v1api.materialshub.gr/api/rag/documents/upload-async`

**AI Models Used**: None

**Data Generated**:
- Document ID (UUID)
- Workspace ID (UUID)
- Filename
- File size

**Database Tables**:
- `documents` table (record created)

**Output**: 
```json
{
  "job_id": "uuid",
  "status": "pending",
  "message": "Document processing started"
}
```

---

### **Step 2: Background Job Creation**

**Component**: MIVAA API (`app/api/rag_routes.py`)  
**Duration**: <1 second

**Process**:
1. Create background job record
2. Set status to "processing"
3. Set progress to 20%
4. Start async processing

**AI Models Used**: None

**Data Generated**:
- Job ID (UUID)
- Status: "processing"
- Progress: 20%
- Created timestamp

**Database Tables**:
- `background_jobs` table

**Code Location**: `mivaa-pdf-extractor/app/api/rag_routes.py` (upload_document_async)

---

### **Step 3: PDF Analysis & Strategy Selection**

**Component**: PDFProcessor (`app/services/pdf_processor.py`)  
**Duration**: 1-2 seconds

**Process**:
1. Analyze PDF structure (page count, text density, image count)
2. Calculate chars/page and images/page ratios
3. Select processing strategy:
   - **Text-first**: chars/page > 500 (use PyMuPDF4LLM)
   - **Image-first**: images/page > 2 (use image extraction)
   - **Hybrid**: Mixed content (use both)

**AI Models Used**: None (rule-based analysis)

**Data Generated**:
```python
{
  "page_count": 71,
  "chars_per_page": 731.9,
  "images_per_page": 0.4,
  "detection": "text_dominant",
  "strategy": "text-first"
}
```

**Example Output** (Harmony PDF):
```
📊 PDF Analysis: 71 pages, 731.9 chars/page, 0.4 images/page
🎯 Detection: Text-first (reason: text_dominant)
```

**Code Location**: `mivaa-pdf-extractor/app/services/pdf_processor.py` (analyze_pdf_structure)

---

### **Step 4: Text Extraction (PyMuPDF4LLM)**

**Component**: LlamaIndex Service (`app/services/llamaindex_service.py`)  
**Duration**: 30-120 seconds (depends on page count)

**Process**:
1. Use PyMuPDF4LLM to extract text with markdown formatting
2. Preserve document structure (headings, paragraphs, lists)
3. Extract text from all 71 pages
4. Generate structured markdown output

**AI Models Used**: 
- **GPT-4o** (via LlamaIndex for text processing)

**Data Generated**:
```python
{
  "total_text": "105,605 characters",
  "word_count": 16494,
  "markdown_formatted": True,
  "structure_preserved": True
}
```

**Example Output** (Harmony PDF):
```
Extracted text: 105,605 characters
Word count: 16,494 words
Pages processed: 71
```

**Code Location**: `mivaa-pdf-extractor/app/services/pdf_processor.py` (process_pdf_from_bytes)

---

### **Step 5: Image Extraction & Upload**

**Component**: PDFProcessor (`app/services/pdf_processor.py`)  
**Duration**: 60-300 seconds (depends on image count)

**Process**:
1. Extract images from PDF pages using PyMuPDF
2. For each image:
   - Calculate quality metrics (resolution, sharpness, contrast)
   - Enhance image (contrast, sharpness)
   - Convert to JPEG format
   - Upload to Supabase storage (bucket: `pdf-tiles`)
   - Save metadata to `document_images` table
3. **CRITICAL**: AI analysis is DEFERRED (not run during extraction)

**AI Models Used**: None (during extraction)

**Data Generated** (per image):
```python
{
  "image_url": "https://supabase.co/storage/.../image.jpg",
  "page_number": 1,
  "quality_score": 0.52,
  "quality_metrics": {
    "resolution_score": 0.6,
    "sharpness_score": 0.5,
    "contrast_score": 0.45
  },
  "processing_status": "completed",
  "bbox": [x, y, width, height]
}
```

**Example Output** (Harmony PDF):
```
✅ Image uploaded to storage, AI analysis deferred: image-26-0.jpg
✅ Image uploaded to storage, AI analysis deferred: image-41-0.jpg
...
Total images extracted: 170
Average quality score: 0.52
```

**Database Tables**:
- `document_images` table (170 records created)

**Storage**:
- Supabase Storage bucket: `pdf-tiles/extracted/{document_id}/`

**Code Location**: `mivaa-pdf-extractor/app/services/pdf_processor.py` (_process_extracted_image)

**⚠️ CRITICAL NOTE**: AI analysis columns remain NULL:
- `llama_analysis`: NULL
- `claude_validation`: NULL
- `visual_clip_embedding_512`: NULL
- `color_embedding_256`: NULL
- `texture_embedding_256`: NULL
- `application_embedding_512`: NULL

---

### **Step 6: Semantic Chunking**

**Component**: LlamaIndex Service (`app/services/llamaindex_service.py`)  
**Duration**: 10-30 seconds

**Process**:
1. Use LlamaIndex's `SemanticSplitterNodeParser`
2. Split text into semantic chunks (not fixed-size)
3. Classify each chunk by type using pattern matching
4. Calculate chunk quality metrics

**AI Models Used**:
- **text-embedding-3-small** (for semantic boundary detection)

**Chunk Types Detected**:
- `product_description` (146 chunks, 85% confidence)
- `technical_specs` (34 chunks, 90% confidence)
- `supporting_content` (29 chunks, 60% confidence)
- `certification_info` (5 chunks, 90% confidence)
- `sustainability_info` (4 chunks, 90% confidence)
- `index_content` (4 chunks, 95% confidence)
- `designer_story` (3 chunks, 85% confidence)
- `collection_overview` (3 chunks, 80% confidence)
- `visual_showcase` (1 chunk, 80% confidence)

**Data Generated** (per chunk):
```python
{
  "chunk_index": 0,
  "content": "text content...",
  "chunk_type": "product_description",
  "chunk_type_confidence": 0.85,
  "metadata": {
    "chunk_size_actual": 5015,
    "word_count": 16494,
    "character_count": 105605,
    "chunk_strategy": "hierarchical",
    "embedding_model": "text-embedding-3-small",
    "embedding_dimension": 1536
  }
}
```

**Example Output** (Harmony PDF):
```
Total chunks created: 229
Chunk strategy: hierarchical
Average chunk size: 461 characters
```

**Database Tables**:
- `document_chunks` table (229 records created)

**Code Location**: `mivaa-pdf-extractor/app/services/llamaindex_service.py` (_store_chunks_in_database)

---

### **Step 7: Text Embeddings Generation** ⚠️ **BROKEN**

**Component**: LlamaIndex Service  
**Expected Duration**: 20-60 seconds  
**Actual Duration**: 0 seconds (not running)

**Expected Process**:
1. For each chunk, generate 1536D embedding using OpenAI
2. Store embedding in `embeddings` table
3. Link embedding to chunk via `chunk_id`

**AI Models Used**:
- **text-embedding-3-small** (OpenAI)

**Expected Data Generated** (per chunk):
```python
{
  "chunk_id": "uuid",
  "embedding": [1536 float values],
  "model_name": "text-embedding-3-small",
  "dimensions": 1536
}
```

**❌ ACTUAL RESULT**:
```
Chunks created: 229
Embeddings created: 0
Success rate: 0%
```

**Database Tables**:
- `embeddings` table (SHOULD have 229 records, has 0)

**⚠️ CRITICAL BUG**: Embeddings are NOT being generated or stored. This breaks:
- Semantic search
- RAG queries
- Similarity matching
- All search functionality

**Code Location**: `mivaa-pdf-extractor/app/services/llamaindex_service.py` (needs investigation)

---

### **Step 8: Product Creation (Two-Stage)**

**Component**: Product Creation Service (`app/services/product_creation_service.py`)  
**Duration**: 10-20 seconds

**Process**:

#### **Stage 1: Fast Classification (Claude Haiku 4.5)**
1. Analyze all 229 chunks with Claude Haiku
2. Identify product candidates vs supporting content
3. Extract basic product information

**AI Model**: `claude-haiku-4-5-20251001`

**Stage 1 Results** (Harmony PDF):
```
Candidates identified: 65
Processing time: 3.27 seconds
Success rate: 100%
```

#### **Stage 2: Deep Validation (Claude Sonnet 4.5)**
1. For each candidate, perform deep analysis with Claude Sonnet
2. Validate product completeness
3. Extract detailed metadata
4. Create product records

**AI Model**: `claude-sonnet-4-5-20250929`

**Stage 2 Results** (Harmony PDF):
```
Products created: 0
Validation failures: 65 (100%)
Processing time: 11.26 seconds
Reason: Model name was invalid (fixed on 2025-10-26)
```

**Expected Data Generated** (per product):
```python
{
  "name": "FOLD Collection",
  "description": "...",
  "properties": {
    "dimensions": "15×38",
    "designer": "ESTUDI{H}AC",
    "material": "ceramic tile"
  },
  "source_chunks": ["chunk_id_1", "chunk_id_2"]
}
```

**Database Tables**:
- `products` table (SHOULD have 14+ records, has 0)

**Code Location**: `mivaa-pdf-extractor/app/services/product_creation_service.py`

---

### **Step 9: Deferred AI Analysis** ⚠️ **NOT IMPLEMENTED**

**Expected Component**: Background worker (NOT IMPLEMENTED)  
**Expected Duration**: 300-600 seconds  
**Actual Duration**: Never runs

**Expected Process**:
1. Query `document_images` where `processing_status = 'completed'` AND AI columns are NULL
2. For each image:
   - Run Llama 4 Scout analysis
   - Run Claude Sonnet validation
   - Generate CLIP embeddings
   - Generate color/texture/application embeddings
3. Update database with results

**AI Models Expected**:
- **Llama 4 Scout 17B Vision**: Material analysis
- **Claude Sonnet 4.5**: Image validation
- **CLIP (vit-base-patch32)**: Visual embeddings (512D)
- **text-embedding-3-small**: Color/texture/application embeddings (with dimension reduction)

**❌ ACTUAL RESULT**:
```
Images with AI analysis: 0 / 170 (0%)
Images with CLIP embeddings: 0 / 170 (0%)
Images with color embeddings: 0 / 170 (0%)
Images with texture embeddings: 0 / 170 (0%)
```

**⚠️ CRITICAL BUG**: No background worker exists to process deferred AI analysis. All AI columns remain NULL.

---

### **Step 10: Job Completion**

**Component**: RAG Routes (`app/api/rag_routes.py`)  
**Duration**: <1 second

**Process**:
1. Update job status to "completed"
2. Set progress to 100%
3. Record completion timestamp
4. Store final metadata

**Data Generated**:
```python
{
  "status": "completed",
  "progress": 100,
  "metadata": {
    "chunks_created": 229,
    "products_created": 0,
    "processing_time": 992.5
  }
}
```

**Database Tables**:
- `background_jobs` table (updated)

---

## 📊 Summary Statistics (Harmony PDF Test)

| Metric | Expected | Actual | Status |
|--------|----------|--------|--------|
| Text Extraction | 105,605 chars | 105,605 chars | ✅ Working |
| Chunks Created | 229 | 229 | ✅ Working |
| Images Extracted | 170 | 170 | ✅ Working |
| Text Embeddings | 229 | 0 | ❌ Broken |
| CLIP Embeddings | 170 | 0 | ❌ Broken |
| Llama Analysis | 170 | 0 | ❌ Broken |
| Claude Validation | 170 | 0 | ❌ Broken |
| Products Created | 14+ | 0 | ❌ Broken |

**Overall Success Rate**: 37.5% (3/8 components working)

---

## 🚨 Critical Issues Identified

### **Issue 1: Text Embeddings Not Generated**
- **Severity**: CRITICAL
- **Impact**: Search functionality completely broken
- **Affected**: All 229 chunks
- **Root Cause**: Unknown - needs investigation

### **Issue 2: Deferred AI Analysis Never Runs**
- **Severity**: CRITICAL
- **Impact**: No AI intelligence on images
- **Affected**: All 170 images
- **Root Cause**: Background worker not implemented

### **Issue 3: Product Creation Failed**
- **Severity**: HIGH
- **Impact**: No products extracted
- **Affected**: 65 candidates rejected
- **Root Cause**: Invalid Claude model names (FIXED on 2025-10-26)

---

## 🔧 Next Steps

1. **Investigate text embeddings generation** - Why are they not being created?
2. **Implement background worker** - Process deferred AI analysis
3. **Re-test product creation** - Verify fix with correct Claude model names
4. **Add monitoring** - Track success rates for each step

