# PDF Processing Pipeline - Complete Technical Guide

> **⚠️ ARCHITECTURE UPDATED 2026-06-13 — PaddleOCR-VL structural backbone (structure-first).**
> The layout + OCR front-end is now a single **PaddleOCR-VL** two-stage document parser
> (`PaddlePaddle/PaddleOCR-VL-1.6`, 0.9B) hosted on **Modal**: **PP-DocLayoutV2** (RT-DETR
> detector + pointer network) localizes regions, labels them, and predicts reading order; the
> **0.9B VLM** recognizes the content inside each region (text, tables→markdown, formulas→LaTeX,
> charts). It runs as **Stage 1, BEFORE discovery**, persisting `document_layout_analysis` rows
> with `processing_version='paddleocr-vl'`; discovery (via `build_page_text_from_layout_cache`),
> Stage 2 chunking, and Stage 3 image crops all read that cache. It **replaced Surya-2 on
> 2026-06-13**; Surya-2 had earlier replaced **YOLO + Chandra + `merge_layout`** — so YOLO,
> Chandra, Surya, and `merge_layout` (and their managers) are all **deleted with no consumer**.
> OCR is also PaddleOCR (`ocr_service._call_paddleocr`). Both GPU endpoints — **SLIG**
> (visual embeddings) and PaddleOCR-VL (the structural pass) — run on **Modal**; HuggingFace
> hosts nothing (SLIG migrated off HuggingFace 2026-06-14).
> See the **"PDF Pipeline — PaddleOCR-VL structural backbone"** section in `CLAUDE.md` and
> [ai-models-complete-list.md](./ai-models-complete-list.md) for the current model map.
> **Reading note:** older sub-sections below still carry YOLO/Chandra wording inline — wherever
> this doc says "YOLO detects regions" or "Chandra OCRs the page", that is the **retired** design;
> read "PaddleOCR-VL does both in one structural pass on Modal". The remaining stages (vision
> analysis = Claude Opus 4.7, embeddings, chunking = Sonnet 4.6, products) are unchanged.

14-stage intelligent pipeline for transforming material catalogs into searchable knowledge.

> **📚 Related Documentation:**
> - [Async Processing & Limits](./async-processing-and-limits.md) - Concurrency limits and async architecture
> - [Product Discovery Architecture](./product-discovery-architecture.md) - AI-powered product extraction
> - [System Architecture](./system-architecture.md) - Overall platform architecture

---

## 🎯 Pipeline Overview - Product-Centric Architecture

**Key Concept**: After Stage 0 discovers products, Stages 1-5 process EACH product individually, extracting and linking all related data (chunks, images, tables) before moving to the next product.

┌─────────────────────────────────────────────────────────────────┐
│ STAGE 0A: Product Discovery (0-10%)                             │
│ AI Model: Claude Opus 4.7 / GPT-4o                           │
│ Purpose: Extract products with ALL metadata (inseparable)      │
│ Output: Products with metadata JSONB (factory, specs, etc.)    │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ STAGE 0B: Document Entity Discovery (10-15%) - OPTIONAL         │
│ AI Model: Claude Opus 4.7 / GPT-4o                           │
│ Purpose: Extract certificates, logos, specifications           │
│ Output: Document entities stored separately with relationships │
└─────────────────────────────────────────────────────────────────┘
                              ↓
        ┌─────────────────────────────────────────┐
        │  FOR EACH PRODUCT (Product-Centric Loop) │
        └─────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ STAGE 1: Extract Product Pages (15-25%)                        │
│ Tool: PyMuPDF                                                  │
│ Process: Extract pages for THIS product only                  │
│ Output: Product pages ready for processing                     │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ STAGE 2: Product-Centric Text Extraction (25-35%)              │
│ Tool: PyMuPDF4LLM + UnifiedChunkingService                    │
│ Process: Extract text for THIS product only                   │
│ Output: Text chunks with product_id                            │
│                                                                 │
│ 📝 PRODUCT-AWARE CHUNKING:                                     │
│   - Only process pages in product's page range                │
│   - Add product_id and product_name to each chunk             │
│   - Respect semantic boundaries (paragraphs, sentences)       │
│                                                                 │
│ Database: chunks (with product_id foreign key)                │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ STAGE 3: Product-Centric Image Extraction (35-45%)             │
│ Tool: VisionGuidedImageExtractor                              │
│ Process: Extract images for THIS product only                 │
│ Output: Images with product_id                                 │
│                                                                 │
│ 🖼️ IMAGE EXTRACTION:                                           │
│   - Only process pages in product's page range                │
│   - Upload to Supabase Storage immediately                    │
│   - Link to product via product_id                            │
│                                                                 │
│ Database: product_images (with product_id foreign key)        │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ STAGE 4: Product Creation (45-50%)                             │
│ Service: ProductService + Database Queries                     │
│ Process: Create product record in database                    │
│ Output: Product with UUID (product_id)                         │
│                                                                 │
│ 🏭 PRODUCT CREATION:                                           │
│   - Create product record in database                         │
│   - Generate UUID (product_id)                                │
│   - Store metadata JSONB (factory, specs, etc.)               │
│   - Consolidate visual metadata from associated images        │
│                                                                 │
│ Database: products                                             │
└─────────────────────────────────────────────────────────────────┘
                              ↓
        ┌─────────────────────────────────────┐
        │  END OF PRODUCT LOOP — ALL PRODUCTS │
        └─────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ STAGE 4.5: Cross-Product Field Propagation (68-72%)            │
│ File: app/api/pdf_processing/stage_4_products.py              │
│ Process: Share common catalog-level fields across siblings    │
│ Progress: 70 → 72%   Monitor stage: "field_propagation"       │
│                                                                 │
│ 🔄 FIELDS PROPAGATED (first non-empty sibling wins):          │
│   Top-level:                                                   │
│     - factory_name / factory_group_name                       │
│     - country_of_origin / origin                              │
│     - material_category (upload override always wins)         │
│     - manufacturing_location / process / country              │
│     - available_sizes  ← shared across catalog siblings       │
│   Nested (material_properties):                               │
│     - thickness, body_type, composition                       │
│                                                                 │
│ ⚠️ Only fills EMPTY fields — existing values never overwritten │
│ DB sync: tracker._sync_to_database("field_propagation")       │
│ Timeout: 2 min (DB reads/writes only, no AI calls)            │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ STAGE 4.6: Dimension Extraction from Text Chunks (72-76%)      │
│ File: app/api/pdf_processing/stage_4_products.py              │
│ Process: Regex scan of extracted text for sizes/thickness     │
│ Progress: 74 → 76%   Monitor stage: "dimension_extraction"    │
│                                                                 │
│ 📐 WHAT IT DOES (no AI calls — pure regex):                   │
│   1. Merges all document_chunks.content for this document     │
│   2. Extracts size patterns: WxH cm (5–300 cm sanity check)   │
│   3. Extracts thickness near keywords (thickness/spessore/    │
│      épaisseur/Stärke) or bare "X.Ymm" fallback              │
│   4. Fills products still missing these fields after 4.5      │
│      - available_sizes: list of found sizes                   │
│      - material_properties.thickness: {value, confidence:     │
│        0.65, source: "document_text"}                         │
│                                                                 │
│ Timeout: 2 min                                                 │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ STAGE 5: Entity Linking (65-70%)                               │
│ Service: EntityLinkingService                                  │
│ Process: Link all entities to product                         │
│ Output: Complete product with all relationships                │
│                                                                 │
│ 🔗 ENTITY LINKING:                                             │
│   - Link chunks via product_id foreign key                    │
│   - Link images via product_id foreign key                    │
│   - Link tables via product_id foreign key                    │
│   - Link layout regions via product_id foreign key            │
│                                                                 │
│ Database: products, chunks, product_images, product_tables,   │
│           product_layout_regions                               │
└─────────────────────────────────────────────────────────────────┘

                              ↓
        ┌─────────────────────────────────────────┐
        │  REPEAT FOR NEXT PRODUCT                 │
        └─────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ STAGE 6: AI Classification (70-75%) - URL-BASED PROCESSING      │
│ Model: Claude Opus 4.7 (Anthropic tool use)                    │
│ Schema: VisionAnalysis Pydantic + VISION_ANALYSIS_TOOL          │
│ Process: Download from Supabase URLs → Classify → Delete       │
│ Output: Material vs non-material classification                │
│                                                                 │
│ 🚀 URL-BASED ARCHITECTURE:                                     │
│   1. Download image from Supabase URL to RAM                  │
│   2. Convert to base64 on-the-fly                             │
│   3. Classify with Claude Opus 4.7 (schema-locked tool call)  │
│   4. Delete from RAM immediately                               │
│   5. Delete non-material images from Supabase                 │
│                                                                 │
│ Memory: ~1-2MB per image (temporary download)                  │
│ Time: ~3-8 seconds per image                                   │
│ Disk: 0 images (everything in RAM)                            │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ STAGE 7: SLIG + Voyage Embeddings (75-85%) - URL-BASED          │
│ Models: SigLIP2/SLIG (768D, 1 visual) + Voyage voyage-4        │
│         (1024D, 4 aspect: color/texture/style/material)        │
│ Process: Use Supabase URLs directly (NO download!)            │
│ Output: 1×768D visual + 4×1024D aspect + 1×1024D understanding │
│                                                                 │
│ 🚀 ZERO-DOWNLOAD ARCHITECTURE:                                │
│   1. Pass Supabase URL to SLIG cloud endpoint                 │
│   2. SLIG fetches internally                                  │
│   3. Generate 5 embeddings (visual, color, texture, style, mat)│
│   4. Save directly to VECS collections (updated 2026-04)       │
│   5. Auto-cleanup (no manual deletion needed)                  │
│                                                                 │
│ Memory: ~100MB per batch                                      │
│ Time: ~2-3 seconds per image                                   │
│ Disk: 0 images (URL-based)                                    │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ STAGE 8: Vision Analysis (85-90%) - URL-BASED PROCESSING       │
│ Model: Claude Opus 4.7 (Anthropic tool use)                    │
│ Schema: VisionAnalysis Pydantic + VISION_ANALYSIS_TOOL          │
│ Process: Download from Supabase URLs → Analyze → Delete       │
│ Output: Quality scores, material properties, confidence        │
│                                                                 │
│ 🚀 ON-DEMAND DOWNLOAD ARCHITECTURE:                           │
│   1. Download image from Supabase URL to RAM                  │
│   2. Convert to base64 on-the-fly                             │
│   3. Analyze with Claude Opus 4.7 (schema-locked tool call)   │
│   4. Delete from RAM immediately                               │
│   5. Batch cleanup after every 10 images                       │
│                                                                 │
│ Memory: ~1-2MB per image (temporary download)                  │
│ Time: ~3-8 seconds per image                                   │
│ Disk: 0 images (everything in RAM)                            │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ STAGE 9: Product Creation (90-95%)                              │
│ Models: Claude Haiku 4.5 → Claude Opus 4.7                     │
│ Output: Product records with relationships                     │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ STAGE 10: Entity Linking (95-98%)                               │
│ Process: Link products, chunks, images, document entities      │
│ Output: Relationships with relevance scores                    │
│                                                                 │
│ Relationships Created:                                          │
│   - Product → Image (relevance scores)                         │
│   - Chunk → Image (relevance scores)                           │
│   - Chunk → Product (relevance scores)                         │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ STAGE 11: Completion (98-100%)                                  │
│ Process: Final validation and cleanup                          │
│ Output: Complete processed document                            │
│ Note: All images stored in Supabase, 0 local files            │
└─────────────────────────────────────────────────────────────────┘

---

## 🏗️ Product-Centric Architecture

### Why Product-Centric?

**Traditional Approach (Document-Centric)**:
1. Extract ALL text from entire document
2. Extract ALL images from entire document
3. Extract ALL tables from entire document
4. Try to link everything together at the end
5. **Problem**: Hard to maintain relationships, data scattered

**Product-Centric Approach (Current)**:
1. Discover products first (Stage 0)
2. **For each product individually**:
   - Extract ONLY its pages (Stage 1)
   - Extract ONLY its text chunks (Stage 2)
   - Extract ONLY its images (Stage 3)
   - Create product record (Stage 4)
   - Validate all relationships (Stage 5)
3. **Benefit**: All data linked via `product_id` foreign key from the start

### Data Flow Example

**Product: "NOVA" (Pages 12-14)**

Stage 0 discovers: `name="NOVA"`, `page_range=[12,13,14]`

Stage 1 (Layout + Tables, FOR NOVA ONLY): the PaddleOCR-VL structural pass detects 15 regions on pages 12-14 and recognizes their content (table regions → markdown/HTML preserved in `metadata.html`). Stage 2.5 parses those 3 table regions on page 13 into `product_tables` rows with product_id = NOVA's ID. (Note: the structural pass actually runs once per document as Stage 1 BEFORE discovery; this per-product framing reflects how each product reads its slice of the shared `document_layout_analysis` cache.)

Stage 2 (Text Chunking, FOR NOVA ONLY): Extracts text from pages 12-14 only, creates 45 chunks, each with product_id = NOVA's ID.

Stage 3 (Image Extraction, FOR NOVA ONLY): Extracts images from pages 12-14 only, uploads 12 images to Supabase, each with product_id = NOVA's ID.

Stage 4 (Product Creation): Creates product record for NOVA with metadata stored in JSONB.

Stage 5 (Validation): Counts 45 chunks, 12 images, 3 tables — all linked via product_id foreign key. Logs: "Product 'NOVA' entities linked: 45 chunks, 12 images, 3 tables".

### Database Relationships

**Foreign Key Architecture**: All entities link to products via `product_id`. Specifically:
- `chunks.product_id → products.id`
- `product_images.product_id → products.id`
- `product_tables.product_id → products.id`
- `product_layout_regions.product_id → products.id`

**No Separate Relationship Tables Needed**:
- ❌ No `product_chunk_relationships` table
- ❌ No `product_image_relationships` table
- ❌ No `product_table_relationships` table
- ✅ Direct foreign key relationships only

### Benefits

1. **Data Integrity**: All entities linked from creation
2. **Simple Queries**: `SELECT * FROM chunks WHERE product_id = ?`
3. **Easy Validation**: Count entities per product
4. **Clean Architecture**: No orphaned data
5. **Efficient Processing**: Process one product at a time

---

## 📋 Detailed Stage Breakdown

### Stage 0A: Product Discovery (0-10%)

**Purpose**: Extract products with ALL metadata (Products + Metadata = Inseparable)

**AI Model**: Claude Opus 4.7 or GPT-4o

**Process**:
1. Extract full PDF text
2. Analyze content structure
3. Identify product boundaries
4. Extract products WITH all metadata in one pass
5. Store in products table with metadata JSONB

**Output**: A JSON structure with a `products` array, each entry containing fields like `name`, `description`, `page_range`, `metadata` (with designer, studio, category, dimensions, variants, factory, factory_group, manufacturer, country_of_origin, slip_resistance, fire_rating, thickness, water_absorption, finish, material), `image_indices`, and `confidence`. Also includes `total_products` and `confidence_score` at the top level.

**Database Storage**:
- Table: `products`
- ALL metadata stored in `metadata` JSONB column
- Products and metadata are inseparable

**Example (Harmony PDF)**:
- 14 distinct products identified
- 95% confidence score
- Processing time: 3-5 seconds

---

### Stage 0B: Document Entity Discovery (10-15%) - OPTIONAL

**Purpose**: Extract certificates, logos, specifications as separate knowledge base

**AI Model**: Claude Opus 4.7 or GPT-4o

**Process**:
1. Analyze PDF for document entities
2. Extract certificates (ISO, CE, quality certifications)
3. Extract logos (company, brand, certification marks)
4. Extract specifications (technical docs, installation guides)
5. Identify factory/group for each entity
6. Store in document_entities table

**Output**: A JSON structure with `certificates`, `logos`, and `specifications` arrays. Each certificate includes `name`, `certificate_type`, `issuer`, `issue_date`, `expiry_date`, `standards`, `page_range`, `factory_name`, `factory_group`, and `confidence`. Logos include `name`, `logo_type`, `description`, `page_range`, and `confidence`. Specifications include `name`, `spec_type`, `description`, `page_range`, and `confidence`.

**Database Storage**:
- Table: `document_entities`
- Linked to products via `product_document_relationships`
- Supports factory/group filtering for agentic queries

**Agentic Query Examples**:
- "Get certifications for Castellón Factory"
- "Get logos for Harmony Group"
- "Get specifications for product NOVA"

---

### Stage 1: Structure-First Layout + OCR (PaddleOCR-VL) — runs BEFORE discovery

**File**: `app/api/pdf_processing/stage_1_layout_precompute.py` (structural pass) + `app/api/pdf_processing/stage_1_focused_extraction.py` (per-product slice + tables)

> **Architecture (2026-06-13)**: This stage is now a single **PaddleOCR-VL** structural pass run
> **once per document, BEFORE discovery** — not a per-product YOLO step. The text below has been
> rewritten to the current design. The retired YOLO + Chandra + `merge_layout` front-end (and
> Surya-2 before it) had no equivalent of structure-first ordering.

**Purpose**: In one pass, localize + label every region, recognize its content, predict reading order, and persist a `document_layout_analysis` cache (`processing_version='paddleocr-vl'`) that discovery, chunking, and image crops all read.

**Process**:
1. **Page Mapping**: Map catalog pages to physical PDF pages
2. **PaddleOCR-VL structural pass** (`mode=page`): **PP-DocLayoutV2** (RT-DETR detector + pointer network) localizes regions + labels them + predicts reading order; the **0.9B VLM** recognizes content inside each region (text, tables→markdown/HTML, formulas→LaTeX, charts).
3. **Layout cache persistence**: Map the `/parse` JSON onto the unchanged `document_layout_analysis.layout_elements[]` schema and persist with `processing_version='paddleocr-vl'`.
4. **Table content**: table region `content` (markdown/HTML recognized by the VLM) is preserved in `metadata.html`. It is parsed into `product_tables` by **Stage 2.5**, not here — see below.

**Services Used**:
- `PaddleOCRManager.from_config` (`paddleocr_endpoint_manager.py`) — `run_structural_pass` (page) holds inference + retry + `paddleocr_metrics` telemetry; lifecycle (warmup `/health` probe / scale-to-zero) delegated to `ModalEndpointProvider` in `endpoint_providers.py`
- `paddleocr_pipeline.py` — maps `/parse` JSON onto `document_layout_analysis.layout_elements[]`; PP-DocLayout labels (`doc_title`/`paragraph_title`/`text`/`table`/`image`/`figure`/`chart`/…) → existing `region_type` vocab via `PADDLE_LABEL_TO_REGION_TYPE`. RT-DETR **pixel** bboxes → normalized 0..1 at the parser boundary → denormalized at crop render in `region_to_layout_element`
- `TableExtractor` (`app/services/pdf/table_extraction.py`) — parses the VLM's `metadata.html` (markdown OR `<table>` HTML) into `product_tables` rows. Called from **Stage 2.5**. Never reopens the PDF: the pdfplumber implementation that did was dead from #248 and was removed 2026-08-02 along with the dependency.

**Hosting**: Modal app `paddleocr-vl` at `https://basilakis--paddleocr-vl-paddleservice-web.modal.run`, GPU L4, scale-to-zero (`min_containers=0` + `scaledown_window=120` = $0 idle, `max_containers=4`). Custom contract: `GET /health` (unauth warmup probe) + `POST /parse {image_b64, mode}` → `{regions:[{bbox:[x0,y0,x1,y1] px, label, content, order}], width, height}`; `mode=page` = structural pass, `mode=block` = per-crop OCR. Cold start ~90s (paid once per job at warmup); ~1-3s/page warm.

**Data Extracted**:

1. **Page Mapping**
   - Catalog page numbers → PDF page indices
   - Handles 2-page spreads and standard layouts

2. **Layout Regions** (PaddleOCR-VL, with content + reading order)
   - `text` / `paragraph_title` / `doc_title` regions — body text, headings (content recognized inline)
   - `image` / `figure` / `chart` regions — product images, diagrams (these are the product-crop sources)
   - `table` regions — specification tables (content preserved as markdown/HTML in `metadata.html`)
   - formula regions — recognized to LaTeX

3. **Tables**
   - Markdown/HTML from the VLM in `metadata.html`, parsed by Stage 2.5 into structured headers + rows
   - Table type classification (specifications, dimensions, etc.)
   - Confidence scores for extraction quality
   - Page numbers for linking to products

**Database Storage**:
- `document_layout_analysis` table — PaddleOCR-VL regions + recognized content + reading order (`processing_version='paddleocr-vl'`)
- `product_layout_regions` table — per-product region slice
- `product_tables` table — extracted tables with metadata

**Returns**: A dict with `product_pages` (set of physical PDF page indices), `layout_regions` (list of LayoutRegion objects mapped from the PaddleOCR-VL `/parse` output), `layout_stats` (total_regions, text_regions, image_regions, table_regions, title_regions counts), and `tables_extracted` (integer count).

**Benefits**:
- 40-60% reduction in processing time
- Focused on relevant content
- Reduced noise in embeddings
- **Layout-aware chunking** — respects document structure
- **Structure-first reading order** — discovery reads reading-order text from the cache instead of raw `page.get_text()`
- **Table extraction** — structured data for product specs
- **Tighter product crops** — dedicated RT-DETR boxes → cleaner crops → better SLIG visual embeddings

---

### Stage 1.5: Page-Level Layout + OCR cache (folded into the PaddleOCR-VL structural pass)

> **Architecture (2026-06-13)**: Layout + OCR are now a **single PaddleOCR-VL pass** (Stage 1
> above). There is no longer a separate YOLO-layout-plus-Chandra-OCR merge step — the VLM
> recognizes content inside every detected region in the same call, so `merge_layout` is deleted.
> This sub-section is retained to document the resume-skip / cache-status mechanics, reframed to
> PaddleOCR-VL. The historical Chandra/`merge_layout` retry mechanics below the divider are kept as
> a **tombstone** of the retired design.

**Purpose**: Run the PaddleOCR-VL structural pass, persist results to `document_layout_analysis` (`processing_version='paddleocr-vl'`), drive resume-skip logic, and feed canonical reading-order page text into discovery + chunking (via `build_page_text_from_layout_cache`).

**Model**: **PaddleOCR-VL** (`PaddlePaddle/PaddleOCR-VL-1.6`, 0.9B) on **Modal**, called through `PaddleOCRManager.run_structural_pass` (`mode=page`).

**Failure marker**: `OCRResult.method='paddleocr'` / `'paddleocr_failed'` (not empty list). Consumers must check `method`, not emptiness, to distinguish failure from "no text on page".

**Per-attempt metrics** — `paddleocr_metrics` table (inference + retry telemetry held by `PaddleOCRManager`). The legacy `chandra_ocr_metrics` table describes the retired engine.

**`processing_version` / `cache_status` semantics** — every `document_layout_analysis` row is stamped `processing_version='paddleocr-vl'`. `analysis_metadata.cache_status` still distinguishes "ran clean" from "ran but failed and should be retried":

| cache_status | Meaning |
|--------------|---------|
| `success` | PaddleOCR-VL ran clean and produced regions + text |
| `empty_page` | the page is empty (no recovery needed) |
| `ocr_failed` | the structural pass failed — page should be retried, NOT skipped on resume |

> **Retired cache_status values**: `yolo_only` ("YOLO ran, Chandra produced no text") and
> `page_failed` ("YOLO itself failed") belonged to the YOLO+Chandra design and no longer occur —
> there is no separate detector that can succeed while OCR fails, since one VLM does both.

**Resume-skip query** in `precompute_document_layout` filters out `ocr_failed` rows (and accepts `processing_version='paddleocr-vl'`), so transient structural-pass failures no longer permanently "skip" pages on every subsequent run.

**Image extraction bbox normalization**: bbox is normalized 0..1 in both `pdf_processor.py` extraction paths (RT-DETR pixel boxes are normalized at the parser boundary) — fixed a Stage 3 spread-assignment bug that had been treating it as PDF-points (every image was getting mis-assigned to the left page).

**Returns**: A dict with `pages_processed`, `pages_succeeded`, `pages_with_ocr_failure`, plus per-page `cache_status`.

---

> **TOMBSTONE — retired layout/OCR front-end (history, do not implement):** Before 2026-06-13 the
> backbone was YOLO + Chandra + `merge_layout` (then briefly Surya-2). Chandra v2 was the sole OCR
> engine via a HuggingFace endpoint (`chandra_endpoint_manager.run_inference`) with retry-with-jitter
> (3 attempts at temperatures 0.0 / 0.4 / 0.8, widened 2026-05-03 from 0.0/0.1/0.2 after a ~55%
> cumulative failure rate), a balanced-bracket trimmer (`_strip_fences_and_junk`), the
> `chandra_ocr_metrics` table, `OCRResult.method='chandra_failed'`, and `MIN_CONTAINMENT_RATIO=0.30`
> in `merge_layout`. Pytesseract + EasyOCR were removed entirely in 2026-05. All of this is deleted.


**Output**:
- Focused PDF with product content
- Layout regions for intelligent processing
- Extracted tables linked to products

---

### Stage 2: Product-Centric Text Extraction (30-40%)

**File**: `app/api/pdf_processing/stage_2_chunking.py`

**Tool**: PyMuPDF4LLM + Product-Aware Chunking

**Process**:
1. **Per-Product Processing**: Extract text for EACH product individually
2. **Page Range Filtering**: Only process pages in product's page range
3. **Layout-Aware Chunking**: Use the PaddleOCR-VL layout regions + reading order (from the `document_layout_analysis` cache) to guide chunking
4. **Semantic Boundaries**: Respect paragraph/sentence structure
5. **Product Context**: Add product_id and product_name to each chunk

**Services Used**:
- `UnifiedChunkingService` - Product-aware semantic chunking
- `PyMuPDF4LLM` - Text extraction with layout preservation

**Data Created**:

1. **Text Chunks**
   - Content: Extracted text segments
   - Product ID: Links chunk to specific product
   - Product Name: For context and filtering
   - Page Numbers: Source pages for chunk
   - Quality Score: Semantic completeness score

2. **Chunk Metadata**
   - Layout regions used (TEXT, TITLE, CAPTION)
   - Semantic boundaries (paragraph, sentence)
   - Product context (name, ID)

**Database Storage**:
- `chunks` table - Text chunks with product_id foreign key
- `chunk_metadata` - Additional metadata and quality scores

**Returns**: A dict with `chunks_created` (count), `total_characters`, `avg_chunk_size`, and `quality_scores` (avg, min, max).

**Output**:
- Extracted text formatted as markdown with product name header, specification subsection, and description subsection
- Chunks stored in database linked by product_id

---

### Stage 2.5: Persist VLM tables → `product_tables` (added 2026-08-02)

**File**: `app/services/pdf/table_extraction.py` → `TableExtractor.persist_tables_from_layout_cache`, called from `product_processor.py` right after Stage 2.

**Purpose**: parse the table content PaddleOCR-VL already recognized in Stage 1 into structured rows, so `TableMetadataExtractor` (Stage 5) can mine it.

**Process**:
1. Read this product's pages from the `document_layout_analysis` cache (the same reader Stage 2 chunking uses — no PDF is reopened, no inference re-run)
2. Keep `region_type='TABLE'` elements with non-empty `metadata.html`
3. Parse markdown pipe tables **or** `<table>` HTML into a header row + data rows
4. Classify (`dimensions` / `packaging` / `specifications` / `pricing` / `comparison` / `other`, multilingual)
5. Delete this product's existing rows, then insert — idempotent, so resume is safe

**Why it is NOT gated on `skip_chunking`**: a job resuming from a run that predates this stage has chunks but no tables, and a gated call would never give it any.

> **The regression this closes.** #248 (2026-07-04) deleted the per-product table writer,
> stating that TABLE content "is preserved as metadata.html … and consumed by Stage 2."
> Nothing consumed it. `product_tables` was written by **no stage at all** for a month:
> `TableMetadataExtractor` ran on every product against an empty table, packaging and
> performance specs were never populated, and `available_sizes` / `thickness` fell
> through to the Stage 4.6 regex net at 0.65 confidence. Guarded now by the
> `product_tables_never_written` probe in `ops.silent_zero` and by
> `tests/unit/test_table_extraction.py` in the MIVAA repo.

**Fields this unlocks** (previously unreachable — the regex layers have no patterns for them): `packaging.pieces_per_box`, `boxes_per_pallet`, `weight_per_box_kg`, `coverage_per_box_m2`, and `performance.{slip_resistance, water_absorption, frost_resistance, abrasion_resistance, breaking_strength, chemical_resistance, fire_rating}`.

**Confidence ladder for thickness** (one home: `metadata.material_properties.thickness`):

| Source | Confidence | Stage |
|---|---|---|
| `product_table` | 0.95 | 5 (entity linking, from Stage 2.5 rows) |
| `sibling_product` | 0.75 | 4.5 |
| `image_text` | 0.70 | Phase 1 inline |
| `document_text` | 0.65 | 4.6 |

---

### Stage 3: Product-Centric Image Extraction (40-50%)

**File**: `app/api/pdf_processing/stage_3_images.py`

**Tool**: PyMuPDF + Layout-Region-Guided Extraction (PaddleOCR-VL cache)

**Process**:
1. **Per-Product Processing**: Extract images for EACH product individually
2. **Region Filtering**: Only extract `IMAGE` / `FIGURE` / `chart` regions from the PaddleOCR-VL `document_layout_analysis` cache (these are the product-crop sources)
3. **Page Range Filtering**: Only process pages in product's page range
4. **Immediate Upload**: Upload to Supabase Storage immediately
5. **Product Linking**: Link images to product via product_id

**Services Used**:
- `VisionGuidedImageExtractor` - layout-region-guided image extraction (reads PaddleOCR-VL crop sources from the cache)
- `PyMuPDF` - Image extraction from PDF
- `Supabase Storage` - Cloud storage for images

**Data Created**:

1. **Product Images**
   - Image file (PNG/JPEG)
   - Product ID: Links image to specific product
   - Page Number: Source page for image
   - Bounding Box: PaddleOCR-VL (RT-DETR) detected region coordinates
   - Image Type: Product image, diagram, detail shot
   - Supabase URL: Public URL for image access

2. **Image Metadata**
   - Dimensions (width, height)
   - File size
   - Format (PNG, JPEG)
   - Extraction confidence score

**Database Storage**:
- `product_images` table - Images with product_id foreign key
- `image_metadata` - Additional metadata and quality scores

**Returns**: A dict with `images_extracted`, `images_uploaded`, `total_size_mb`, `avg_confidence`, and `image_types` (product, detail, diagram counts).

**Output**:
- Images stored in Supabase Storage
- Image records in database with product_id
- Public URLs for image access

---

### Stage 4: Product Creation & Entity Linking (50-60%)

**File**: `app/api/pdf_processing/stage_4_products.py`

**Purpose**: Create product records and link all extracted entities

**Process**:
1. **Product Record Creation**: Create product in database
2. **Chunk Linking**: Link all chunks to product
3. **Image Linking**: Link all images to product
4. **Table Linking**: Link all tables to product (NEW!)
5. **Metadata Storage**: Store product metadata (specs, factory, etc.)

**Services Used**:
- `ProductService` - Product CRUD operations
- Database queries for entity linking

**Data Created**:

1. **Product Record**
   - Product name, description
   - Page range (start, end)
   - Metadata JSONB (factory, specs, dimensions, etc.)
   - Document ID (parent document)

2. **Entity Relationships**
   - Chunks → Product (via product_id foreign key)
   - Images → Product (via product_id foreign key)
   - Tables → Product (via product_id foreign key) (NEW!)

**Database Storage**:
- `products` table - Product records
- `chunks` table - Chunks with product_id
- `product_images` table - Images with product_id
- `product_tables` table - Tables with product_id (NEW!)

**Returns**: A dict with `product_id`, `product_name`, `chunks_linked`, `images_linked`, `tables_linked`, and `metadata_fields` counts.

**Output**:
- Product record in database
- All entities linked to product
- Ready for embedding generation

---

### Stage 4.5: Cross-Product Field Propagation (68-72%)

**File**: `app/api/pdf_processing/stage_4_products.py`
**Function**: `propagate_common_fields_to_products()`
**Monitor stage**: `field_propagation`
**Timeout**: 2 min (DB reads/writes only — no AI calls)

**Purpose**: After all products are created, fill empty metadata fields by borrowing values from sibling products in the same document. Catalog-level attributes (factory, origin, available sizes, etc.) are typically the same for every product in a catalog — this stage enforces that uniformity without overwriting any values that were already extracted.

**Process**:
1. Fetch all products for the document
2. For each propagatable field, find the first sibling that has a non-empty value
3. Write that value to every sibling that still has it empty
4. Update `progress_monitor` and `tracker` before and after

**Fields Propagated (first non-empty sibling wins)**:

*Top-level metadata fields:*
- `factory_name`, `factory_group_name`
- `country_of_origin`, `origin`
- `material_category` *(upload category always wins over propagated value)*
- `manufacturing_location`, `manufacturing_process`, `manufacturing_country`
- `available_sizes` — list of sizes shared across the catalog

*Nested fields (under `material_properties`):*
- `thickness` — propagated with `{value, confidence: 0.75, source: "sibling_product"}`
- `body_type` — e.g., `"porcelain"`, `"ceramic"`
- `composition` — material composition string

**Safety rule**: Only empty/null/empty-list/empty-dict fields are touched. Existing values are **never overwritten**.

**Returns**: A dict with `products_updated`, `total_products`, `fields_propagated` (list of field names), and `source: "stage_4_5_propagation"`.

---

### Stage 4.6: Dimension Extraction from Text Chunks (72-76%)

**File**: `app/api/pdf_processing/stage_4_products.py`
**Function**: `extract_dimensions_from_document_chunks()`
**Monitor stage**: `dimension_extraction`
**Timeout**: 2 min (pure regex — no AI calls)

**Purpose**: After Stage 4.5 sibling propagation, some products may still have empty `available_sizes` or `material_properties.thickness`. This stage merges all text chunks for the document and runs regex patterns to extract dimensions and thickness values, filling the remaining gaps.

**Process**:
1. Fetch all `document_chunks.content` for the document, merge into one text blob
2. Run size regex: `(\d+)[xX×](\d+)\s*(?:cm|CM)` with sanity check (5–300 cm per axis)
3. Run thickness regex: near keywords (`thickness|spessore|épaisseur|Stärke`) or bare `X.Ymm` pattern
4. For each product still missing `available_sizes` → insert found sizes
5. For each product still missing `material_properties.thickness` → insert `{value, confidence: 0.65, source: "document_text"}`

**Coverage**: This stage acts as a safety net — even if Stage 0 AI extraction and Stage 4.5 sibling propagation both missed a dimension, the raw text almost always contains it somewhere.

**Returns**: A dict with `products_updated`, `sizes_found` (list), `thickness_found`, and `source: "document_text"`.

---

### Image OCR Dimension Extraction (inline, updated 2026-04)

**Note (2026-04)**: The former asynchronous "Phase 2 background image processor" (`app/services/images/background_image_processor.py`) was deleted — it called a non-existent `generate_material_embeddings` method and produced no output. Image-text dimension extraction is now handled inline during Phase 1 image processing by `_enrich_product_metadata_from_spec_image()` in the image processing service, using the same regex patterns against the vision_analysis output.

**Logic**:
- If `keyword_hits >= 3` → image is a spec table → handled by `_enrich_product_metadata_from_spec_image()` as a spec table
- If `keyword_hits < 3` → image is a product photo with possible text overlay → regex extraction against the vision_analysis OCR output

**Regex patterns applied** (same as Stage 4.6 but on the per-image OCR output):
- Size: `(\d+)[xX×](\d+)\s*(?:cm|CM|mm|MM)?`
- Thickness: near keywords or bare `X.Ymm` pattern

**Confidence**: `0.70`, **source**: `"image_text"`

**Three-Layer Coverage Summary**:

| Layer | Stage | Source | Confidence | AI? |
|-------|-------|--------|-----------|-----|
| Sibling propagation | 4.5 | Sibling product DB | 0.75 | No |
| Text chunk regex | 4.6 | document_chunks text | 0.65 | No |
| Image OCR regex | Phase 1 (inline) | PaddleOCR OCR output (`document_images.ocr_text`) | 0.70 | Yes (PaddleOCR) |

---

### Stage 5: Entity Linking & Relationship Mapping (60-70%)

**File**: `app/services/discovery/entity_linking_service.py`

**Purpose**: Link all extracted entities to products and create relationships

**Process**:
1. **Query All Entities**: Fetch chunks, images, tables by product_id
2. **Count Statistics**: Count linked entities for each product
3. **Validate Relationships**: Ensure all entities are properly linked
4. **Update Product Stats**: Store entity counts in product metadata

**Services Used**:
- `EntityLinkingService` - Entity relationship management
- Database queries for entity counting

**Data Validated**:

1. **Chunks → Product**: Query counts chunks by product_id, validates foreign key linkage.
2. **Images → Product**: Query counts product_images by product_id, validates foreign key linkage.
3. **Tables → Product** (NEW!): Query counts product_tables by product_id, validates foreign key linkage.

**Database Storage**:
- No new tables created
- Updates product metadata with entity counts

**Returns**: A dict with `product_id`, `chunks_linked`, `images_linked`, `tables_linked`, `total_entities`, and `validation_passed`.

**Logging Output**: Produces a structured log entry like "Product 'NOVA' entities linked: Chunks: 45, Images: 12, Tables: 3, Total: 60 entities".

**Output**:
- Entity counts validated
- Product metadata updated
- Ready for embedding generation

---

### Stage 6: AI Classification (70-75%) - URL-Based Processing

**🚀 ON-DEMAND DOWNLOAD ARCHITECTURE**

**Model**: Claude Opus 4.7 via Anthropic tool use

**Schema enforcement**: `VisionAnalysis` Pydantic schema + `VISION_ANALYSIS_TOOL` (`app/models/vision_analysis.py`). Tool-use guarantees the response matches the schema, so Voyage's understanding-embedding space stays clean.

**Process (Per Image)**:
1. **Download image from Supabase URL to RAM**
2. Convert to base64 on-the-fly (no disk I/O)
3. Classify with Claude Opus 4.7 (schema-locked tool call: material vs non-material)
4. **Delete from RAM immediately**
5. Delete non-material images from Supabase Storage

**Why URL-Based?**
- **Zero Disk Usage**: Everything in RAM temporarily
- **No Cumulative Memory**: Each image deleted after processing
- **Supabase as Source of Truth**: Single storage location
- **Automatic Cleanup**: Non-material images deleted from cloud

**Output**: A JSON result with `total_images_classified`, `material_images`, `non_material_images`, `classification_errors`, `non_material_deleted_from_supabase`, `memory_usage`, and `processing_time`.

**Performance Metrics**:
- Time per image: 3-8 seconds (Claude Opus tool-use call)
- Memory per image: ~1-2MB (temporary)
- Disk usage: 0 images
- Total time for 249 images: 12-30 minutes

---

### Stage 7: SLIG Embeddings (75-85%) - URL-Based Processing (updated 2026-04)

**🚀 ZERO-DOWNLOAD ARCHITECTURE**

**Models**:
- SLIG SigLIP2 (768D, raw image): produces ONE visual vector per image
- Voyage `voyage-4` (1024D, text): produces FOUR per-aspect vectors per image, embedding deterministic strings derived from VisionAnalysis fields

Pre-v2: SLIG produced all 5 vectors via the blend trick (4 fixed global text prompts blended at 10-30% into the base visual vector). Legacy SigLIP ViT-SO400M (1152D) was retired in 2026-04 — its collections were 100% orphans.

**Process (Per Image)**:
1. **Pass Supabase URL to SLIG service** for the visual embedding (no manual download)
2. SLIG fetches internally → 1 × 768D visual vector → `image_slig_embeddings`
3. Pull cached `VisionAnalysis` JSON from `document_images.vision_analysis` (already produced by Stage 3)
4. Run 4 deterministic aspect serializers on the JSON → 4 short strings
5. Voyage-embed each non-empty aspect string → 4 × 1024D vectors → `image_color_embeddings` / `image_texture_embeddings` / `image_style_embeddings` / `image_material_embeddings`
6. Auto-cleanup

**Why Zero-Download?**
- **URL-native**: No need to download manually
- **Faster Processing**: No extra download step
- **Same Quality**: URL vs base64 produces identical embeddings

**Embeddings Generated Per Image** (post-v2):

1. **Visual** (SLIG SigLIP2 768D) — Overall visual appearance, enables visual similarity search. Collection: `image_slig_embeddings`. Producer key: `visual_768`.
2. **Color** (Voyage 1024D) — Per-image color text from `VisionAnalysis.colors[]`. Collection: `image_color_embeddings`. Producer key: `color_aspect_1024` (was `color_slig_768` 768D pre-v2).
3. **Texture** (Voyage 1024D) — Per-image texture text from `VisionAnalysis.textures[] + finish`. Collection: `image_texture_embeddings`. Producer key: `texture_aspect_1024` (was `texture_slig_768` 768D pre-v2).
4. **Style** (Voyage 1024D) — Per-image style text from `VisionAnalysis.style + surface_pattern + applications`. Collection: `image_style_embeddings`. Producer key: `style_aspect_1024` (was `style_slig_768` 768D pre-v2).
5. **Material** (Voyage 1024D) — Per-image material text from `VisionAnalysis.material_type + category + subcategory`. Collection: `image_material_embeddings`. Producer key: `material_aspect_1024` (was `material_slig_768` 768D pre-v2).

**Output**: A JSON result with `material_images_processed`, `slig_embeddings_generated`, `total_embeddings`, `memory_usage`, `processing_time`, and `embeddings_by_type` (visual, color, texture, style, material counts).

**Performance Metrics**:
- Time per image: 2-3 seconds
- Memory per batch: ~100MB
- Disk usage: 0 images
- Total time for 150 images: 5-8 minutes

---

### Stage 8: Vision Analysis (85-90%) - URL-Based Processing

**🚀 ON-DEMAND DOWNLOAD ARCHITECTURE**

**Model**: Claude Opus 4.7 via Anthropic tool use (post-2026-05-01)

**Schema enforcement**: `VisionAnalysis` Pydantic schema + `VISION_ANALYSIS_TOOL`. The tool-use mechanism guarantees schema adherence — eliminates fragile JSON regex recovery, protects Voyage's understanding-embedding space from drift.

**Process (Per Image)**:
1. **Download image from Supabase URL to RAM**
2. Convert to base64 on-the-fly
3. Analyze with Claude Opus 4.7 (tool call → `VisionAnalysis` payload: quality, material properties, OCR-aware fields)
4. **Delete from RAM immediately**
5. **Batch cleanup after every 10 images**

**Why On-Demand Download?**
- **Anthropic accepts base64**: image content blocks via the SDK
- **Temporary RAM Usage**: Download → Process → Delete
- **Batch Cleanup**: Aggressive memory management
- **Zero Disk Usage**: Everything in RAM

**Output**: A JSON result with `images_analyzed`, `quality_scores_generated`, `material_properties_extracted`, `memory_usage`, and `processing_time`. The per-image payload conforms to the `VisionAnalysis` Pydantic schema.

**Performance Metrics**:
- Time per image: 3-8 seconds
- Memory per image: ~1-2MB (temporary)
- Disk usage: 0 images
- Total time for 150 images: 15-30 minutes
- Success rate: 99%+ (schema-locked, malformed payloads are impossible)

---

### Stage 6 (alternate): Image Analysis (80-85%) - ASYNC JOB

**Model**: Claude Opus 4.7 via Anthropic tool use

**Process**:
1. Runs as background job (non-blocking)
2. Analyze each image for material properties
3. Extract OCR-aware fields (Phase 3 per-image OCR via PaddleOCR — `ocr_service._call_paddleocr` / `run_block_ocr`, `OCRResult.method='paddleocr'`/`'paddleocr_failed'`; filter rules and the `document_images` OCR columns `ocr_text`/`ocr_blocks`/`ocr_failed`/`ocr_attempts`/`ocr_skipped_reason` are unchanged — only the engine changed from Chandra)
4. Calculate quality scores

**Output**: A JSON structure per image with `image_id`, `ocr_text`, `materials` (list), `properties` (dict with fields like weight and weave), and `quality_score`.

**Quality Scoring**:
- Text clarity (0-1)
- Material visibility (0-1)
- Spec completeness (0-1)
- Final score: Average

**Note**: This stage runs asynchronously and does not block pipeline completion

---

### Stage 7 (alternate): Product Creation (85-92%)

**Models**: Claude Haiku 4.5 → Claude Opus 4.7

**Two-Stage Validation**:

**Stage 1 (Haiku - Fast)**:
- Analyze all chunks
- Identify product candidates
- Extract basic information
- Processing time: 3-5 seconds

**Stage 2 (Opus - Deep)**:
- For each candidate, perform deep analysis
- Validate product completeness
- Extract detailed metadata
- Create product records

**Output**: A JSON structure per product with `product_id`, `name`, `description`, `metadata` (factory, dimensions, material), `chunks` (list of IDs), `images` (list of IDs), and `confidence_score`.

---

### Stage 8 (alternate): Entity Linking (92-97%)

**Process**:
1. Link products to images (page-proximity based)
2. Link chunks to images via `entity_linking_service.link_images_to_chunks` (page proximity — NOT cosine similarity)
3. Link chunks to products (relevance scores)
4. Create relationship records

> **Note (2026-04)**: `chunk_image_relationships` are populated by `entity_linking_service.link_images_to_chunks` using **page_proximity**. The former `create_chunk_image_relationships()` method in RelevancyService was deleted — it computed cosine similarity between 1024D text and 768D visual vectors, which was mathematically invalid.

**Output**: A JSON result with `product_image_relationships`, `chunk_image_relationships`, `chunk_product_relationships`, and `total_relationships` counts.

**Database Tables**:
- `product_image_relationships`
- `chunk_image_relationships`
- `chunk_product_relationships`

---

### Stage 9: Completion (97-100%)

**Process**:
1. Final validation
2. Update job status
3. Generate completion summary
4. Trigger async jobs (if any)

**Output**: Complete processed document with all relationships

---

## 🔄 Checkpoint Recovery

9 checkpoints for failure recovery:

1. **INITIALIZED** - Job created
2. **PDF_EXTRACTED** - PDF analysis complete
3. **CHUNKS_CREATED** - Text chunking complete
4. **TEXT_EMBEDDINGS_GENERATED** - Text embeddings complete
5. **IMAGES_EXTRACTED** - Images uploaded to Supabase Storage ✅ UPDATED
6. **IMAGE_EMBEDDINGS_GENERATED** - SLIG 768D embeddings + Claude Opus 4.7 vision_analysis (tool use) + Voyage understanding 1024D complete ✅ UPDATED
7. **PRODUCTS_DETECTED** - Products identified
8. **PRODUCTS_CREATED** - Product creation complete
9. **COMPLETED** - All processing complete

**Recovery Process**: On startup, if a job has a saved `checkpoint_stage`, the pipeline resumes from that checkpoint rather than starting from the beginning.

**Note**:
- Stage 5 (IMAGES_EXTRACTED): All images uploaded to Supabase Storage, 0 local files
- Stage 6 (IMAGE_EMBEDDINGS_GENERATED): 1× SLIG visual (768D) + 4× Voyage aspect embeddings (1024D: color/texture/style/material) + Claude Opus 4.7 vision_analysis (tool use) + understanding embedding (1024D Voyage from VisionAnalysis JSON) complete
- Recovery uses Supabase URLs for all subsequent processing (no local files needed)

---

## 📊 Performance Metrics

**NOVA PDF Example (71 pages, 249 images)**:
- Total pages: 71
- Products identified: 11
- Chunks created: 110
- Images extracted: 249
- Material images: 150
- Non-material images: 99 (deleted from Supabase)
- SLIG embeddings generated: 150 (1 visual × 150 material images, 768D) + 600 aspect embeddings (4 × 150 images, 1024D Voyage)
- Processing time: 2-3 minutes (vs 30+ minutes before)
- Memory usage: <3GB peak (vs 7.7GB OOM before)
- Disk usage: 0 images (vs 249 cumulative before)
- Success rate: 100%

**Accuracy Metrics**:
- Product detection: 95%+
- Material recognition: 90%+
- Metadata extraction: 88%+
- Search relevance: 85%+
- Visual embedding quality (SLIG SigLIP2): 95%+

**URL-Based Architecture Impact**:
- **Before**: 7.7GB memory → OOM crash at 249 images
- **After**: <3GB memory → Can process unlimited images
- **Before**: 30+ minutes timeout (cumulative reprocessing)
- **After**: 2-3 minutes completion (process once via URLs)
- **Before**: 249 images on disk (cumulative accumulation)
- **After**: 0 images on disk (all in Supabase Storage)

---

## 🏗️ Modular Architecture (Refactored)

The pipeline has been refactored from a monolithic 2900+ line function into modular services and API endpoints for better debugging, testing, and retry capabilities.

### Service Layer

**ImageProcessingService** (`app/services/image_processing_service.py`)
- `classify_images()` - Claude Opus 4.7 via Anthropic tool use (schema-locked)
- `upload_images_to_storage()` - Upload to Supabase Storage
- `save_images_and_generate_clips()` - DB save + SLIG 768D embeddings (name retained for backwards compat; writes directly to VECS)

**UnifiedChunkingService** (`app/services/unified_chunking_service.py`)
- `chunk_text()` - Semantic/hybrid/fixed-size/layout-aware chunking
- Supports 4 chunking strategies with quality scoring

**RelevancyService** (`app/services/relevancy_service.py`) (updated 2026-04)
- `create_product_image_relationships()` - Based on page ranges
- `create_all_relationships()` - Orchestrate all relationships
- Note: chunk-image relationships are populated by `entity_linking_service.link_images_to_chunks` using **page_proximity**. The former `create_chunk_image_relationships()` method was deleted in 2026-04 — it computed cosine similarity between 1024D text and 768D visual vectors, which was mathematically invalid.

### Internal API Endpoints

Each pipeline stage has a dedicated endpoint for independent testing and retry. The available internal endpoints are:
- `POST /api/internal/classify-images/{job_id}`
- `POST /api/internal/upload-images/{job_id}`
- `POST /api/internal/save-images-db/{job_id}`
- `POST /api/internal/create-chunks/{job_id}`
- `POST /api/internal/create-relationships/{job_id}`

### Main Orchestrator Endpoint

The main orchestrator is `POST /api/rag/documents/upload` accepting multipart/form-data with parameters: `file` (PDF), `workspace_id` (UUID), `category` (default: `"products"`), and `focused_extraction` (default: `true`). It returns a JSON response with `job_id`, `document_id`, `status: "processing"`, `progress: 0`, and `current_stage: "INITIALIZED"`.

**Orchestrator Flow**:
1. Upload PDF and create job
2. Call `/api/internal/classify-images/{job_id}`
3. Call `/api/internal/upload-images/{job_id}`
4. Call `/api/internal/save-images-db/{job_id}`
5. Call `/api/internal/create-chunks/{job_id}`
6. Call `/api/internal/create-relationships/{job_id}`
7. Update job status to COMPLETED

**Benefits**:
- Each stage independently testable
- Failed stages can be retried without reprocessing
- Clear error boundaries for debugging
- Progress tracking per stage
- 200 lines per service vs 2900+ monolith

---

## 🛡️ Production Hardening

PDF processing implements **complete production hardening** for reliability and monitoring:

### Source Tracking ✅

Every product, chunk, image, and embedding is tagged with `source_type: 'pdf_processing'` and `source_job_id: job_id` at insert time. This applies to the `products`, `document_chunks`, `document_images`, and `embeddings` tables.

**Benefits:**
- Filter Materials Data page by specific PDF job
- Trace any data back to its source PDF
- Delete all data from a specific PDF import
- Audit data quality by source

---

### Heartbeat Monitoring ✅

Updates `last_heartbeat` field every stage to detect stuck jobs. The heartbeat update sets `last_heartbeat`, `current_stage`, and `progress_percent` on the `background_jobs` record for the active job.

**Stuck Job Detection:**
- Threshold: >10 minutes without heartbeat
- Auto-recovery: Automatic retry of stuck jobs
- Monitoring: Real-time job health dashboard

---

### Sentry Error Tracking ✅

Comprehensive error tracking and performance monitoring using `sentry_sdk.start_transaction` with `op="pdf_processing"` and `name="process_stage"`. Tags include `job_id` and `stage`, and data includes `total_pages`. Breadcrumbs are added at each processing step. On success, the transaction status is set to `"ok"`. On exception, `sentry_sdk.capture_exception()` is called and status set to `"internal_error"` before re-raising.

**Features:**
- Transaction tracking for performance monitoring
- Breadcrumbs for debugging context
- Exception capture with full stack traces
- AI model usage tracking
- Performance bottleneck identification

---

### Production Hardening Status

| Feature | Status | Details |
|---------|--------|---------|
| **Source Tracking** | ✅ COMPLETE | All tables have `source_type` and `source_job_id` |
| **Heartbeat Monitoring** | ✅ COMPLETE | Updates every stage, 10-minute stuck threshold |
| **Sentry Tracking** | ✅ COMPLETE | Transactions, breadcrumbs, exception capture |
| **Error Handling** | ✅ COMPLETE | Comprehensive try-catch with Sentry integration |
| **Progress Tracking** | ✅ COMPLETE | Real-time progress updates via `background_jobs` table (`stage_history` JSONB; `job_progress` table was dropped 2026-04-25) |
| **Checkpoint Recovery** | ✅ COMPLETE | Resume from last successful stage |
| **Auto-Recovery** | ✅ COMPLETE | Automatic retry of stuck/failed jobs |

---

## 📡 Product API Endpoint

### GET /api/rag/products

**Purpose**: Retrieve products with all linked entities (chunks, images, tables)

**File**: `mivaa-pdf-extractor/app/api/rag_routes.py`

**Query Parameters**:
- `document_id` (required): Document ID to filter products
- `include_tables` (optional, default: `true`): Include tables in response

**Response Format**: A JSON object with a `products` array and a `total` count. Each product entry contains `id`, `name`, `description`, `page_range`, `metadata` (with factory, dimensions, material), a `chunks` array (each with `id`, `content`, `page_number`), an `images` array (each with `id`, `url`, `page_number`), and a `tables` array (each with `id`, `page_number`, `table_type`, `headers`, and `table_data` containing a `rows` array).

**Implementation Details**:

1. **Efficient Batch Query**: Single query fetches all tables for all products
2. **Grouping**: Tables grouped by `product_id` for efficient lookup
3. **Backward Compatible**: Can disable tables with `include_tables=false`
4. **Consistent Pattern**: Follows same pattern as chunks and images

Usage: `GET /api/rag/products?document_id=YOUR_DOC_ID` (with tables, default) or append `&include_tables=false` to exclude tables.

**Benefits**:
- ✅ Single API call for complete product data
- ✅ Includes structured table data for specs
- ✅ Efficient batch query (no N+1 problem)
- ✅ Backward compatible with optional parameter

---

## 🎯 Layout-Aware Chunking

> **Note (2026-06-13)**: layout regions now come from the **PaddleOCR-VL** structural pass
> (Stage 1, before discovery), not YOLO. The chunking logic that consumes them is unchanged.

### Overview

The Layout-Aware Chunking system uses the PaddleOCR-VL layout regions (with predicted reading order) to create intelligent, boundary-respecting chunks that preserve document structure and semantic meaning.

### How It Works

**Stage 1 (PaddleOCR-VL structural pass)** → **Stage 2 (Layout-Aware Chunking)**

1. **PaddleOCR-VL detects + labels layout regions and predicts reading order** (Stage 1, before discovery)
   - Persists regions to the `document_layout_analysis` cache (`processing_version='paddleocr-vl'`); the per-product slice lands in `product_layout_regions`
   - Each region has: type, bbox, confidence, reading_order, text_content (recognized inline by the VLM)

2. **Chunking service reads regions** (Stage 2)
   - Fetches regions for current product
   - Sorts by reading_order
   - Creates chunks based on region types

### Chunking Strategy by Region Type

#### 1. **TABLE Regions** 📊
- **Strategy**: Keep entire table together
- **Rationale**: Tables are atomic units of information
- **Metadata**: Includes bbox, confidence, region_type='TABLE'

A TABLE region chunk contains the full table text (headers and rows), a `region_type` of `"TABLE"`, and a `reading_order` value.

#### 2. **TITLE + TEXT Regions** 📝
- **Strategy**: Combine title with following text
- **Rationale**: Titles provide context for content
- **Metadata**: Includes both title and text bbox

A TITLE+TEXT chunk combines the section heading with its body paragraph, with `region_type: "TITLE+TEXT"` and a `reading_order` value.

#### 3. **TEXT Regions** 📄
- **Strategy**: Respect region boundaries, split if too large
- **Rationale**: Preserve semantic paragraphs
- **Fallback**: Use semantic chunking if text > max_chunk_size

A TEXT region chunk contains body text, with `region_type: "TEXT"` and a `reading_order` value.

#### 4. **IMAGE + CAPTION Regions** 🖼️
- **Strategy**: Link captions to images
- **Rationale**: Captions describe images
- **Metadata**: Includes image bbox for reference

A CAPTION region chunk contains the caption text, `region_type: "CAPTION"`, a `reading_order` value, and a `linked_image_bbox` reference.

### Configuration

Layout-aware chunking is activated by passing `layout_regions_by_page` (a dict mapping 1-based page_number → list of PaddleOCR-VL layout regions, read from the `document_layout_analysis` cache) into `chunk_pages()`. The chunking config stays at the default `HYBRID` strategy (`max_chunk_size=1000`, `min_chunk_size=100`); per-page, if regions are provided, `_chunk_with_layout_regions` runs instead of the strategy dispatcher.

**Fallback Behavior:**
- If no regions are provided for a page → falls back to the configured strategy (HYBRID by default)
- If no layout regions found → Falls back to semantic chunking
- If the structural pass fails → Pipeline continues with semantic chunking

### Benefits

✅ **Preserves Document Structure**
- Respects section boundaries
- Maintains title-content relationships
- Keeps tables intact

✅ **Improves Search Quality**
- Chunks have clear semantic meaning
- Better context for embeddings
- More accurate retrieval

✅ **Reduces Fragmentation**
- No mid-sentence splits
- No broken tables
- No orphaned titles

### Performance

- **Processing Time**: ~1-3 seconds per page warm (PaddleOCR-VL structural pass on Modal L4; ~90s cold start paid once per job at warmup)
- **Chunk Quality**: 30-40% improvement in semantic coherence
- **Search Accuracy**: 20-25% improvement in retrieval precision

---

## 🚀 Future Enhancements

### 1. Sophisticated Title-Content Relationships

**Current Implementation:**
- Combines TITLE with next TEXT region
- Single-level hierarchy

**Planned Enhancements:**

#### Multi-Level Title Hierarchy
The system would detect H1, H2, and H3 heading levels and associate body content with its full parent hierarchy (e.g., "Outdoor Furniture → Chairs → Ergonomic Series").

#### Title Propagation
- Include parent titles in child chunks
- Enables hierarchical search
- Better context for embeddings

A chunk would include a `hierarchy` object with `h1`, `h2`, and `h3` keys alongside its `content`.

#### Smart Boundary Detection
- Don't combine if TEXT is too large
- Split large TEXT while preserving title context
- Adaptive chunk sizing based on content

**Benefits:**
- 📈 Better search relevance (hierarchical context)
- 🎯 More precise retrieval (multi-level filtering)
- 🧠 Richer embeddings (contextual information)

---

### 2. Monitoring & Metrics for Structural-Pass Performance

> **Note (2026-06-13)**: per-attempt PaddleOCR-VL inference/retry telemetry already lands in the
> `paddleocr_metrics` table; the items below are additional per-page metrics still on the roadmap.

**Planned Metrics:**

#### Processing Metrics
Metrics to track per-page: `structural_pass_time_per_page`, `regions_detected_per_page`, `confidence_score_avg`, `confidence_score_min`, and `table_extraction_success_rate`.

#### Region Distribution
Region counts by type: text, title, table, image/figure, chart, formula counts per document.

#### Performance Tracking
- **Processing time** per page (identify slow pages; warm vs cold-start)
- **Modal container utilization** during the structural pass
- **Error rates** and failure patterns
- **Cost tracking** (`PADDLEOCR_PRICING`; Modal L4 scale-to-zero = $0 idle)

**Benefits:**
- 🔍 Identify performance bottlenecks
- 📊 Optimize confidence thresholds
- 💰 Track processing costs
- 🐛 Detect when the structural pass is struggling

Metrics would be stored on the `background_jobs` row (as `stage_history` events) with a `stage: 'layout_precompute'` key. (The legacy `job_progress` table was dropped in 2026-04-25 — all stage data lives in `background_jobs.stage_history` JSONB.)

---

### 3. GPU Acceleration

> **Status (2026-06-13): realized.** The structural pass already runs GPU-accelerated on **Modal
> GPU L4** (PaddleOCR-VL forces `device="gpu"` — the pipeline defaults to CPU, which is minutes/page).
> Scale-to-zero (`min_containers=0` + `scaledown_window=120`) keeps idle cost at $0, with
> `max_containers=4` for parallel fan-out. The local-CUDA auto-detect plan below is obsolete.

**Current Performance:**
- **Modal GPU L4 (warm)**: ~1-3 seconds per page
- **Cold start**: ~90s (model load + first-call JIT), paid once per job at warmup

~~The system would auto-detect GPU availability using `torch.cuda.is_available()`...~~ *(obsolete — superseded by Modal GPU hosting)*

**Benefits:**
- ⚡ Faster processing
- 📦 Parallel containers for efficiency (`max_containers=4`)
- 💾 $0 idle via scale-to-zero
- 🎯 Production-ready performance

---

### 4. Advanced Chunking Rules

**Beyond Title-Content Relationships:**

#### List Detection
Keep bullet and numbered lists together as atomic units with `region_type: "LIST"` and `list_type: "bullet"`.

#### Table Context
Include surrounding prose context (introductory text before a table and notes after) in the same chunk as the table data, with `region_type: "TABLE_WITH_CONTEXT"`.

#### Image-Caption Linking
Link captions to their specific images by including a `linked_image_id` field in CAPTION chunks.

#### Cross-Reference Detection
Detect phrases like "see Figure 3" and record `cross_references` and `linked_chunks` in the chunk metadata.

#### Section Boundaries
Never split across major sections. Track `section` and `subsection` fields in chunk metadata.

#### Formula Preservation
Keep mathematical formulas intact with `region_type: "FORMULA"` and a `formula_type` descriptor.

**Benefits:**
- 🎯 More precise chunking
- 🔗 Better entity relationships
- 📊 Richer metadata
- 🧠 Improved search quality

---

**Last Updated**: June 13, 2026
**Pipeline Version**: Product-Centric Architecture with PaddleOCR-VL structure-first Layout + OCR, Table Extraction & Cross-Product Field Propagation
**Status**: Production

**Major Features**:
- ✅ **Product-Centric Architecture**: Process each product individually (Stages 1-4)
- ✅ **PaddleOCR-VL Structure-First Layout + OCR** (Stage 1, BEFORE discovery; replaced Surya-2 → which had replaced YOLO+Chandra+`merge_layout`)
  - Two-stage parser on Modal: PP-DocLayoutV2 (RT-DETR + pointer network) localizes/labels regions + predicts reading order; 0.9B VLM recognizes content (text, tables→markdown, formulas→LaTeX, charts)
  - Persists `document_layout_analysis` rows with `processing_version='paddleocr-vl'`; discovery/chunking/crops all read the cache
  - Region labels via `PADDLE_LABEL_TO_REGION_TYPE`; `image`/`figure`/`chart` are product-crop sources
  - Modal-hosted (GPU L4, scale-to-zero = $0 idle); only required secret `PADDLEOCR_MODAL_API_KEY`
  - OCR is also PaddleOCR (`OCRResult.method='paddleocr'`/`'paddleocr_failed'`, `ocr_engine='paddleocr'`)
  - Graceful degradation if the structural pass fails (resume-skip via `cache_status='ocr_failed'`)
- ✅ **Table Extraction**: Structured table data linked to products
  - Automatic extraction from TABLE regions
  - Multiple formats: JSON, CSV, Markdown
  - Stored in `product_tables` table
- ✅ **Layout-Aware Chunking**: Boundary-respecting chunks
  - Reads PaddleOCR-VL regions from the `document_layout_analysis` cache
  - Combines TITLE + TEXT intelligently
  - Keeps tables intact
  - Preserves reading order
  - Falls back to semantic chunking if no regions
- ✅ **Entity Linking**: All entities linked via product_id foreign key
- ✅ **Product API**: Includes tables in product response
- ✅ **Cross-Product Field Propagation (Stage 4.5)**: Catalog-level fields shared across siblings
  - factory_name, country_of_origin, manufacturing info
  - available_sizes propagated catalog-wide
  - material_properties.thickness, body_type, composition
  - Only fills empty fields — existing values never overwritten
  - Monitored via `field_propagation` stage, 2-min timeout
- ✅ **Dimension Extraction from Text (Stage 4.6)**: Pure-regex fallback for sizes & thickness
  - Merges all document text chunks
  - Regex patterns for WxH cm sizes and Xmm thickness
  - Fills products still missing data after Stage 4.5
  - No AI calls, confidence 0.65, source: "document_text"
- ✅ **Image OCR Dimension Extraction (inline, updated 2026-04)**: Regex on PaddleOCR OCR output (`document_images.ocr_text`) — moved from vision-output regex when OCR was decoupled from vision_analysis (OCR engine cut over from Chandra → PaddleOCR on 2026-06-13)
  - Runs inline during Phase 1 image processing (no separate Phase 2)
  - Catches dimensions from product photo text overlays
  - Confidence 0.70, source: "image_text"
- ✅ **URL-Based Architecture**: All image processing uses Supabase URLs (zero disk usage)
- ✅ **Streaming Batch Extraction**: Extract 2-3 pages at a time, upload immediately, delete local files
- ✅ **On-Demand Downloads**: Download from URLs to RAM, process, delete immediately
- ✅ **Zero Cumulative Reprocessing**: Each image processed once (vs 21× before)
- ✅ **10× Faster**: 2-3 minutes vs 30+ minutes timeout
- ✅ **60% Less Memory**: <3GB vs 7.7GB OOM crash
- ✅ **Aggressive Batch Cleanup**: Delete batch data between batches to prevent memory leaks
- ✅ **Production Hardening**: Complete source tracking, heartbeat monitoring, and Sentry integration

**Future Enhancements** (Planned):
- 🔮 Multi-level title hierarchy (H1, H2, H3)
- 🔮 Structural-pass performance monitoring & metrics (beyond the existing `paddleocr_metrics` table)
- ✅ GPU acceleration — *realized* (PaddleOCR-VL on Modal GPU L4, scale-to-zero)
- 🔮 Advanced chunking rules (lists, cross-references, formulas)
- 🔮 Voyage `voyage-multimodal-3` page embedding → `vecs.page_embeddings` (8th fusion vector) for catalog-Q&A retrieval (known residual: `image`/`figure`/`chart` regions are crop sources but not OCR'd, so a product name baked inside a photo is still unread)

---

## 🩺 Document Health Panel (Admin Observability)

A per-document health view, surfaced as a third tab on completed jobs in the Admin → Async Job Queue Monitor (alongside "Product Extraction Pipeline" and "Technical Logs"). It only appears when the job's `status === 'completed'`.

**Frontend**: `src/components/Admin/AsyncJobQueueMonitor/DocumentHealthPanel.tsx`
**Backend**: `GET /api/internal/document-extraction-status/{document_id}` (MIVAA)
**Re-run action**: `POST /api/internal/run-catalog-knowledge/{document_id}?force=true`

### What it shows

| Section | Detail |
|---------|--------|
| **Average coverage %** | Big number, color-coded by health (green ≥75%, amber 50–75%, red <50%) |
| **Layer 1 — Catalog Layout** | Run state + page-type breakdown (`legend_pages`, `product_spec_pages`, `product_photo_pages`, `named_products_detected`) |
| **Layer 2 — Catalog Legends** | Run state + `legend_types_found` + `global_certifications` propagated catalog-wide |
| **Coverage bucket bar chart** | Distribution of products across 0–25% / 25–50% / 50–75% / 75–100% buckets |
| **Per-product drilldown** | Sample of products with their `missing_critical` fields and a source-breakdown chip set per product |
| **Issues banner** | Detected problems + one-click "Re-run Catalog Knowledge" remediation |

### Source-breakdown chips (extraction tier provenance)

Each chip indicates which tier produced a given field on that product. The same labels are used throughout the admin UI:

| Source key | Tier label |
|------------|------------|
| `pymupdf_text_dict` | PyMuPDF Tier A |
| `claude_opus_vision` / `claude_spec_vision` | Claude Opus Tier B |
| `catalog_legend` | Catalog Legend Tier C |
| `chunk_regex` | Chunk Regex |
| `vision_rollup` | Image Vision Rollup |
| `ai_text_extraction` | AI Text (Stage 0) |

### Why this exists

Coverage and source mix are the two best signals for "did this catalog actually parse well?" The bucket chart spots catalogs where average coverage is fine but the long tail is empty; the source chips spot catalogs where one tier silently failed and another is doing all the work. The "Re-run Catalog Knowledge" button is the standard one-click fix when Layer 2 needs to retry.
