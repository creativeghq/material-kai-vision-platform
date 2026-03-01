# Page-Aware Chunking Implementation

## Overview

This document describes the implementation of page-aware chunking system that preserves page information from PyMuPDF4LLM extraction through to chunk-product relationship scoring.

## Changes Made

### 1. UnifiedChunkingService (`mivaa-pdf-extractor/app/services/unified_chunking_service.py`)

#### New Method: `chunk_pages()`
- **Purpose**: Process PyMuPDF4LLM's page_chunks output while preserving page metadata
- **Input**: List of page dicts: `[{"metadata": {"page": 0}, "text": "..."}, ...]`
- **Output**: List of chunks with `page_number` in metadata
- **Process**:
  1. Iterates through each page
  2. Chunks the page's text using configured strategy
  3. Stores page number (1-based) in chunk metadata
  4. Maintains global chunk indexing across all pages

#### Updated Method: `_chunk_page_text()`
- **Purpose**: Chunk text from a single page
- **Parameters**: Added `page_number` parameter
- **Process**: Calls appropriate chunking strategy with page number

#### Updated Methods: All Chunking Strategies
- `_chunk_semantic()` - Added `page_number` parameter
- `_chunk_fixed_size()` - Added `page_number` parameter
- `_chunk_hybrid()` - Added `page_number` parameter
- `_chunk_layout_aware()` - Added `page_number` parameter
  - **NEW (Jan 2026)**: Now uses YOLO layout regions from database
  - Reads regions from `product_layout_regions` table
  - Respects region boundaries (TEXT, TITLE, TABLE, IMAGE, CAPTION, FORMULA)
  - Combines TITLE + TEXT intelligently
  - Keeps tables intact
  - Falls back to semantic chunking if no regions found
  - See [PDF Processing Pipeline](./pdf-processing-pipeline.md#yolo-layout-aware-chunking) for details

#### Updated Method: `_create_chunk()`
- **New Parameter**: `page_number: Optional[int]`
- **Behavior**: Stores `page_number` in chunk metadata if provided
- **Storage**: `chunk.metadata["page_number"] = page_number`

### 2. RAGService (`mivaa-pdf-extractor/app/services/rag_service.py`)

#### Updated Method: `index_pdf_content()`
- **Old Behavior**: Called `pymupdf4llm.to_markdown(tmp_path)` returning a single markdown string, then chunked it without page awareness
- **New Behavior**: Calls `pymupdf4llm.to_markdown(tmp_path, page_chunks=True)` returning a list of page dicts, then calls `chunking_service.chunk_pages(pages=pages, ...)`
- **Benefits**:
  - Preserves page metadata from PyMuPDF4LLM
  - Each chunk knows which page it came from
  - Enables accurate page-based relevance scoring

### 3. EntityLinkingService (`mivaa-pdf-extractor/app/services/entity_linking_service.py`)

#### Updated Method: `link_chunks_to_products()`
- **Old**: Used `page_label` (string) from metadata
- **New**: Uses `page_number` (int) from metadata
- **Threshold**: Changed from 0.2 to 0.3

#### Updated Method: `_calculate_chunk_product_relevance()`
- **Old Algorithm**:
  - Base score: 20% (all chunks)
  - Page proximity: 40%
  - Content mentions: 40%
  - Threshold: 0.2

- **New Algorithm**:
  - Page proximity: 40% (same page = 0.4, adjacent = 0.2, 2 away = 0.1)
  - Content mentions: 40% (product name in chunk)
  - Baseline: 20% (medium relevance)
  - Threshold: 0.3

- **Examples**:
  - Chunk on product page: 0.4 + 0.2 = 0.6 ✅ LINKED
  - Chunk mentioning product: 0.4 + 0.2 = 0.6 ✅ LINKED
  - Chunk with both: 0.4 + 0.4 + 0.2 = 1.0 ✅ LINKED
  - Random chunk: 0.2 ❌ NOT LINKED (below threshold)

## Database Schema

### document_chunks Table
- **Column**: `metadata` (JSONB)
- **New Field**: `metadata.page_number` (integer, 1-based)
- **Example**: A chunk's metadata would contain `page_number: 24`, plus `chunk_strategy`, `chunk_size_actual`, and `created_at`.

### chunk_product_relationships Table
- **No schema changes** - uses existing `relevance_score` column
- **New Behavior**: Scores now based on real page proximity

## Migration Notes

### For New Documents
- ✅ All new PDF uploads will use page-aware chunking
- ✅ Chunks will have `page_number` in metadata
- ✅ Relationships will use accurate page-based scoring

### For Existing Documents
- ⚠️ Old chunks do NOT have `page_number` in metadata
- ⚠️ Old relationships will have lower scores (only baseline + mentions)
- 💡 **Recommendation**: Re-upload important documents OR run migration script

## Testing Checklist

- [ ] Upload new PDF and verify chunks have `page_number` in metadata
- [ ] Check chunk_product_relationships have appropriate relevance scores
- [ ] Test search for product on specific page
- [ ] Test RAG/Chat still returns all relevant chunks
- [ ] Verify product search filters out irrelevant chunks

## Expected Results

### Before (Base Score System)
- All 187 chunks linked to MAISON product
- 6 chunks with 0.6 score (mention)
- 181 chunks with 0.2 score (base only)
- Search returns all chunks with low differentiation

### After (Page-Aware System)
- ~50 chunks linked to MAISON product (on pages 24-29)
- Chunks on product pages: 0.6 score
- Chunks mentioning product: 0.6 score
- Chunks with both: 1.0 score
- Other chunks: NOT linked
- Search returns only relevant chunks with high precision

