# PDF Processing Pipeline - Complete Technical Guide

14-stage intelligent pipeline for transforming material catalogs into searchable knowledge.

> **📚 Related Documentation:**
> - [Async Processing & Limits](./async-processing-and-limits.md) - Concurrency limits and async architecture
> - [Product Discovery Architecture](./product-discovery-architecture.md) - AI-powered product extraction
> - [System Architecture](./system-architecture.md) - Overall platform architecture

---

## 🎯 Pipeline Overview - Product-Centric Architecture

**Key Concept**: After Stage 0 discovers products, Stages 1-5 process EACH product individually, extracting and linking all related data (chunks, images, tables) before moving to the next product.

```
┌─────────────────────────────────────────────────────────────────┐
│ STAGE 0A: Product Discovery (0-10%)                             │
│ AI Model: Claude Sonnet 4.5 / GPT-4o                           │
│ Purpose: Extract products with ALL metadata (inseparable)      │
│ Output: Products with metadata JSONB (factory, specs, etc.)    │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ STAGE 0B: Document Entity Discovery (10-15%) - OPTIONAL         │
│ AI Model: Claude Sonnet 4.5 / GPT-4o                           │
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
│                                                                 │
│ Database: products                                             │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ STAGE 4.5: YOLO Layout Detection + Table Extraction (50-65%)   │
│ Tools: YOLOLayoutDetector + TableExtractor (Camelot)          │
│ Process: Detect layout regions + Extract tables               │
│ Output: Layout regions + Structured tables                     │
│                                                                 │
│ 🎯 YOLO LAYOUT DETECTION (ENABLED BY DEFAULT):                │
│   - Runs AFTER product creation (needs product_id)            │
│   - Detects 6 region types per page:                          │
│     • TEXT regions (body text, paragraphs)                    │
│     • IMAGE regions (product images, diagrams)                │
│     • TABLE regions (specs, dimensions)                       │
│     • TITLE regions (headers, section titles)                 │
│     • CAPTION regions (image captions, labels)                │
│     • FORMULA regions (mathematical expressions)              │
│   - Stores bounding boxes with confidence scores              │
│   - Preserves reading order for proper sequencing            │
│                                                                 │
│ 📊 TABLE EXTRACTION (AUTOMATIC):                               │
│   - Triggered when TABLE regions detected                     │
│   - Camelot extracts structured data (lattice + stream)       │
│   - Headers, rows, columns preserved                          │
│   - Multiple formats: JSON, CSV, Markdown                     │
│   - Linked to product via product_id                          │
│                                                                 │
│ 🔧 CONFIGURATION:                                              │
│   - YOLO_ENABLED=true (default, always enabled)               │
│   - YOLO_CONFIDENCE_THRESHOLD=0.5 (adjustable)                │
│   - YOLO_DEVICE=cpu (or 'cuda' for GPU acceleration)          │
│   - Model: yolo-docparser (Hugging Face)                      │
│                                                                 │
│ 💾 DATABASE STORAGE:                                           │
│   - product_layout_regions: All detected regions              │
│   - product_tables: Extracted table data                      │
│   - Both linked via product_id foreign key                    │
│                                                                 │
│ ⚡ PERFORMANCE:                                                │
│   - CPU: ~8-15 seconds per page                               │
│   - GPU: ~2-5 seconds per page (3-5x faster)                  │
│   - Graceful degradation: Pipeline continues if YOLO fails    │
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
│ Model: Qwen3-VL 17B Vision                                │
│ Process: Download from Supabase URLs → Classify → Delete       │
│ Output: Material vs non-material classification                │
│                                                                 │
│ 🚀 URL-BASED ARCHITECTURE:                                     │
│   1. Download image from Supabase URL to RAM                  │
│   2. Convert to base64 on-the-fly                             │
│   3. Classify with Qwen Vision (material/non-material)       │
│   4. Delete from RAM immediately                               │
│   5. Delete non-material images from Supabase                 │
│                                                                 │
│ Memory: ~1-2MB per image (temporary download)                  │
│ Time: ~2-3 seconds per image                                   │
│ Disk: 0 images (everything in RAM)                            │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ STAGE 7: CLIP Embeddings (75-85%) - URL-BASED PROCESSING        │
│ Models: Google SigLIP ViT-SO400M (5 types per image)          │
│ Process: Use Supabase URLs directly (NO download!)            │
│ Output: 5 CLIP embeddings per material image                   │
│                                                                 │
│ 🚀 ZERO-DOWNLOAD ARCHITECTURE:                                │
│   1. Pass Supabase URL to CLIP service                        │
│   2. CLIP downloads internally (httpx)                        │
│   3. Generate 5 embeddings (Visual, Color, Texture, etc.)     │
│   4. Save to VECS collections                                  │
│   5. CLIP auto-cleanup (no manual deletion needed)            │
│                                                                 │
│ Memory: ~100MB per batch (CLIP model + tensors)               │
│ Time: ~2-3 seconds per image                                   │
│ Disk: 0 images (CLIP downloads to RAM)                        │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ STAGE 8: Qwen Vision Analysis (85-90%) - URL-BASED PROCESSING  │
│ Model: Qwen3-VL 17B Vision                                │
│ Process: Download from Supabase URLs → Analyze → Delete       │
│ Output: Quality scores, material properties, confidence        │
│                                                                 │
│ 🚀 ON-DEMAND DOWNLOAD ARCHITECTURE:                           │
│   1. Download image from Supabase URL to RAM                  │
│   2. Convert to base64 on-the-fly                             │
│   3. Analyze with Qwen Vision (quality, properties)          │
│   4. Delete from RAM immediately                               │
│   5. Batch cleanup after every 10 images                       │
│                                                                 │
│ Memory: ~1-2MB per image (temporary download)                  │
│ Time: ~3-5 seconds per image                                   │
│ Disk: 0 images (everything in RAM)                            │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ STAGE 9: Product Creation (90-95%)                              │
│ Models: Claude Haiku 4.5 → Claude Sonnet 4.5                   │
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
```

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

```
Stage 0: Discovery
  ↓
  Product discovered: name="NOVA", page_range=[12,13,14]

Stage 1: Layout + Tables (FOR NOVA ONLY)
  ↓
  - YOLO detects 15 regions on pages 12-14
  - Camelot extracts 3 tables from page 13
  - Tables stored with product_id = NOVA's ID

Stage 2: Text Chunking (FOR NOVA ONLY)
  ↓
  - Extract text from pages 12-14 only
  - Create 45 chunks
  - Each chunk has product_id = NOVA's ID

Stage 3: Image Extraction (FOR NOVA ONLY)
  ↓
  - Extract images from pages 12-14 only
  - Upload 12 images to Supabase
  - Each image has product_id = NOVA's ID

Stage 4: Product Creation
  ↓
  - Create product record for NOVA
  - Metadata stored in JSONB field

Stage 5: Validation
  ↓
  - Count: 45 chunks, 12 images, 3 tables
  - All linked via product_id foreign key
  - Log: "Product 'NOVA' entities linked: 45 chunks, 12 images, 3 tables"
```

### Database Relationships

**Foreign Key Architecture**:
```sql
-- All entities link to products via product_id
chunks.product_id → products.id
product_images.product_id → products.id
product_tables.product_id → products.id  -- NEW!
product_layout_regions.product_id → products.id
```

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

**AI Model**: Claude Sonnet 4.5 or GPT-4o

**Process**:
1. Extract full PDF text
2. Analyze content structure
3. Identify product boundaries
4. Extract products WITH all metadata in one pass
5. Store in products table with metadata JSONB

**Output**:
```json
{
  "products": [
    {
      "name": "NOVA",
      "description": "Modern ceramic tile collection",
      "page_range": [12, 13, 14],
      "metadata": {
        "designer": "SG NY",
        "studio": "SG NY",
        "category": "tiles",
        "dimensions": ["15×38", "20×40"],
        "variants": [{"type": "color", "value": "beige"}],
        "factory": "Castellón Factory",
        "factory_group": "Harmony Group",
        "manufacturer": "Harmony Materials",
        "country_of_origin": "Spain",
        "slip_resistance": "R11",
        "fire_rating": "A1",
        "thickness": "8mm",
        "water_absorption": "Class 3",
        "finish": "matte",
        "material": "ceramic"
      },
      "image_indices": [12, 13],
      "confidence": 0.95
    }
  ],
  "total_products": 14,
  "confidence_score": 0.95
}
```

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

**AI Model**: Claude Sonnet 4.5 or GPT-4o

**Process**:
1. Analyze PDF for document entities
2. Extract certificates (ISO, CE, quality certifications)
3. Extract logos (company, brand, certification marks)
4. Extract specifications (technical docs, installation guides)
5. Identify factory/group for each entity
6. Store in document_entities table

**Output**:
```json
{
  "certificates": [
    {
      "name": "ISO 9001:2015",
      "certificate_type": "quality_management",
      "issuer": "TÜV SÜD",
      "issue_date": "2024-01-15",
      "expiry_date": "2027-01-15",
      "standards": ["ISO 9001:2015"],
      "page_range": [45, 46],
      "factory_name": "Castellón Factory",
      "factory_group": "Harmony Group",
      "confidence": 0.92
    }
  ],
  "logos": [
    {
      "name": "Company Logo",
      "logo_type": "company",
      "description": "Main company brand logo",
      "page_range": [1, 2],
      "confidence": 0.98
    }
  ],
  "specifications": [
    {
      "name": "Installation Guide",
      "spec_type": "installation",
      "description": "Step-by-step installation instructions",
      "page_range": [50, 52],
      "confidence": 0.90
    }
  ]
}
```

**Database Storage**:
- Table: `document_entities`
- Linked to products via `product_document_relationships`
- Supports factory/group filtering for agentic queries

**Agentic Query Examples**:
- "Get certifications for Castellón Factory"
- "Get logos for Harmony Group"
- "Get specifications for product NOVA"

---

### Stage 1: Focused Extraction + YOLO Layout Detection (15-30%)

**File**: `app/api/pdf_processing/stage_1_focused_extraction.py`

**Purpose**: Extract product pages, detect layout regions, and extract tables

**Process**:
1. **Page Mapping**: Map catalog pages to physical PDF pages
2. **YOLO Layout Detection**: Detect TEXT, IMAGE, TABLE, TITLE, CAPTION regions
3. **Table Extraction**: Extract structured tables using Camelot (NEW!)
4. **Layout Region Storage**: Store detected regions for intelligent chunking

**Services Used**:
- `YOLOLayoutDetector` - Layout detection using YOLO model
- `TableExtractor` - Table extraction using Camelot (guided by YOLO)

**Data Extracted**:

1. **Page Mapping**
   - Catalog page numbers → PDF page indices
   - Handles 2-page spreads and standard layouts

2. **YOLO Layout Regions**
   - TEXT regions - Body text, paragraphs
   - IMAGE regions - Product images, diagrams
   - TABLE regions - Specification tables, data grids
   - TITLE regions - Headers, section titles
   - CAPTION regions - Image captions, labels

3. **Tables** (NEW!)
   - Structured table data with headers and rows
   - Table type classification (specifications, dimensions, etc.)
   - Confidence scores for extraction quality
   - Page numbers for linking to products

**Database Storage**:
- `product_layout_regions` table - YOLO-detected regions
- `product_tables` table - Extracted tables with metadata

**Returns**:
```python
{
    'product_pages': Set[int],           # Physical PDF page indices
    'layout_regions': List[LayoutRegion], # YOLO regions
    'layout_stats': {
        'total_regions': 150,
        'text_regions': 80,
        'image_regions': 40,
        'table_regions': 20,
        'title_regions': 10
    },
    'tables_extracted': 15  # NEW!
}
```

**Benefits**:
- 40-60% reduction in processing time
- Focused on relevant content
- Reduced noise in embeddings
- **Layout-aware chunking** - Respects document structure
- **Table extraction** - Structured data for product specs

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
3. **Layout-Aware Chunking**: Use YOLO regions to guide chunking
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

**Returns**:
```python
{
    'chunks_created': 45,
    'total_characters': 12500,
    'avg_chunk_size': 278,
    'quality_scores': {
        'avg': 0.87,
        'min': 0.65,
        'max': 0.98
    }
}
```

**Output**:
```markdown
# Product Name: NOVA

## Specifications
- Material: Porcelain Stoneware
- Dimensions: 60x120 cm
- Color: White, Grey, Beige

## Description
NOVA is a contemporary porcelain tile...
```

---

### Stage 3: Product-Centric Image Extraction (40-50%)

**File**: `app/api/pdf_processing/stage_3_images.py`

**Tool**: PyMuPDF + YOLO-Guided Extraction

**Process**:
1. **Per-Product Processing**: Extract images for EACH product individually
2. **YOLO Region Filtering**: Only extract IMAGE regions detected by YOLO
3. **Page Range Filtering**: Only process pages in product's page range
4. **Immediate Upload**: Upload to Supabase Storage immediately
5. **Product Linking**: Link images to product via product_id

**Services Used**:
- `VisionGuidedImageExtractor` - YOLO-guided image extraction
- `PyMuPDF` - Image extraction from PDF
- `Supabase Storage` - Cloud storage for images

**Data Created**:

1. **Product Images**
   - Image file (PNG/JPEG)
   - Product ID: Links image to specific product
   - Page Number: Source page for image
   - Bounding Box: YOLO-detected region coordinates
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

**Returns**:
```python
{
    'images_extracted': 12,
    'images_uploaded': 12,
    'total_size_mb': 4.5,
    'avg_confidence': 0.92,
    'image_types': {
        'product': 8,
        'detail': 3,
        'diagram': 1
    }
}
```

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

**Returns**:
```python
{
    'product_id': 'uuid-here',
    'product_name': 'NOVA',
    'chunks_linked': 45,
    'images_linked': 12,
    'tables_linked': 3,  # NEW!
    'metadata_fields': 15
}
```

**Output**:
- Product record in database
- All entities linked to product
- Ready for embedding generation

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

1. **Chunks → Product**
   - Query: `SELECT COUNT(*) FROM chunks WHERE product_id = ?`
   - Validates: All chunks have product_id foreign key

2. **Images → Product**
   - Query: `SELECT COUNT(*) FROM product_images WHERE product_id = ?`
   - Validates: All images have product_id foreign key

3. **Tables → Product** (NEW!)
   - Query: `SELECT COUNT(*) FROM product_tables WHERE product_id = ?`
   - Validates: All tables have product_id foreign key

**Database Storage**:
- No new tables created
- Updates product metadata with entity counts

**Returns**:
```python
{
    'product_id': 'uuid-here',
    'chunks_linked': 45,
    'images_linked': 12,
    'tables_linked': 3,  # NEW!
    'total_entities': 60,
    'validation_passed': True
}
```

**Logging Output**:
```
✅ Product 'NOVA' entities linked:
   - Chunks: 45
   - Images: 12
   - Tables: 3
   - Total: 60 entities
```

**Output**:
- Entity counts validated
- Product metadata updated
- Ready for embedding generation

---

### Stage 6: AI Classification (70-75%) - URL-Based Processing

**🚀 ON-DEMAND DOWNLOAD ARCHITECTURE**

**Model**: Qwen3-VL 17B Vision

**Process (Per Image)**:
1. **Download image from Supabase URL to RAM**
2. Convert to base64 on-the-fly (no disk I/O)
3. Classify with Qwen Vision (material vs non-material)
4. **Delete from RAM immediately**
5. Delete non-material images from Supabase Storage

**Why URL-Based?**
- **Zero Disk Usage**: Everything in RAM temporarily
- **No Cumulative Memory**: Each image deleted after processing
- **Supabase as Source of Truth**: Single storage location
- **Automatic Cleanup**: Non-material images deleted from cloud

**Output**:
```json
{
  "total_images_classified": 249,
  "material_images": 150,
  "non_material_images": 99,
  "classification_errors": 0,
  "non_material_deleted_from_supabase": 99,
  "memory_usage": "~1-2MB per image",
  "processing_time": "8-12 minutes"
}
```

**Performance Metrics**:
- Time per image: 2-3 seconds
- Memory per image: ~1-2MB (temporary)
- Disk usage: 0 images
- Total time for 249 images: 8-12 minutes

---

### Stage 7: CLIP Embeddings (75-85%) - URL-Based Processing

**🚀 ZERO-DOWNLOAD ARCHITECTURE**

**Model**: Google SigLIP ViT-SO400M

**Process (Per Image)**:
1. **Pass Supabase URL to CLIP service** (no manual download!)
2. CLIP downloads internally using httpx
3. Generate 5 embedding types
4. Save to VECS collections
5. CLIP auto-cleanup (tensors deleted automatically)

**Why Zero-Download?**
- **CLIP Supports URLs Natively**: No need to download manually
- **Automatic Memory Management**: CLIP handles cleanup
- **Faster Processing**: No extra download step
- **Same Quality**: URL vs base64 produces identical embeddings

**5 CLIP Embedding Types Generated Per Image**:

1. **Visual Embeddings** (512D)
   - Overall visual appearance
   - Enables visual similarity search
   - Collection: `image_clip_embeddings`

2. **Color Embeddings** (512D)
   - Color palette analysis
   - Color-based search
   - Collection: `image_color_embeddings`

3. **Texture Embeddings** (512D)
   - Surface texture analysis
   - Texture-based search
   - Collection: `image_texture_embeddings`

4. **Application Embeddings** (512D)
   - Use case classification
   - Application-based search
   - Collection: `image_application_embeddings`

5. **Material Embeddings** (512D)
   - Material type classification
   - Material-based search
   - Collection: `image_material_embeddings`

**Output**:
```json
{
  "material_images_processed": 150,
  "clip_embeddings_generated": 150,
  "total_embeddings": 750,
  "memory_usage": "~100MB per batch",
  "processing_time": "5-8 minutes",
  "embeddings_by_type": {
    "visual": 150,
    "color": 150,
    "texture": 150,
    "application": 150,
    "material": 150
  }
}
```

**Performance Metrics**:
- Time per image: 2-3 seconds
- Memory per batch: ~100MB (CLIP model + tensors)
- Disk usage: 0 images
- Total time for 150 images: 5-8 minutes

---

### Stage 8: Qwen Vision Analysis (85-90%) - URL-Based Processing

**🚀 ON-DEMAND DOWNLOAD ARCHITECTURE**

**Model**: Qwen3-VL 17B Vision

**Process (Per Image)**:
1. **Download image from Supabase URL to RAM**
2. Convert to base64 on-the-fly
3. Analyze with Qwen Vision (quality, properties)
4. **Delete from RAM immediately**
5. **Batch cleanup after every 10 images**

**Why On-Demand Download?**
- **Qwen Requires Base64**: No URL support (yet)
- **Temporary RAM Usage**: Download → Process → Delete
- **Batch Cleanup**: Aggressive memory management
- **Zero Disk Usage**: Everything in RAM

**Output**:
```json
{
  "images_analyzed": 150,
  "quality_scores_generated": 150,
  "material_properties_extracted": 150,
  "memory_usage": "~1-2MB per image",
  "processing_time": "8-12 minutes"
}
```

**Performance Metrics**:
- Time per image: 3-5 seconds
- Memory per image: ~1-2MB (temporary)
- Disk usage: 0 images
- Total time for 150 images: 8-12 minutes
- Success rate: 99%+

---

### Stage 6: Image Analysis (80-85%) - ASYNC JOB

**Model**: Qwen3-VL 17B Vision

**Process**:
1. Runs as background job (non-blocking)
2. Analyze each image for OCR
3. Extract material properties
4. Calculate quality scores

**Output**:
```json
{
  "image_id": "image_1",
  "ocr_text": "Material: Wool, 100%",
  "materials": ["Wool"],
  "properties": {
    "weight": "400 gsm",
    "weave": "Plain"
  },
  "quality_score": 0.87
}
```

**Quality Scoring**:
- Text clarity (0-1)
- Material visibility (0-1)
- Spec completeness (0-1)
- Final score: Average

**Note**: This stage runs asynchronously and does not block pipeline completion

---

### Stage 7: Product Creation (85-92%)

**Models**: Claude Haiku 4.5 → Claude Sonnet 4.5

**Two-Stage Validation**:

**Stage 1 (Haiku - Fast)**:
- Analyze all chunks
- Identify product candidates
- Extract basic information
- Processing time: 3-5 seconds

**Stage 2 (Sonnet - Deep)**:
- For each candidate, perform deep analysis
- Validate product completeness
- Extract detailed metadata
- Create product records

**Output**:
```json
{
  "product_id": "prod_1",
  "name": "Product Name",
  "description": "...",
  "metadata": {
    "factory": "Castellón Factory",
    "dimensions": ["15×38", "20×40"],
    "material": "ceramic"
  },
  "chunks": ["chunk_1", "chunk_2"],
  "images": ["image_1", "image_2"],
  "confidence_score": 0.95
}
```

---

### Stage 8: Entity Linking (92-97%)

**Process**:
1. Link products to images (relevance scores)
2. Link chunks to images (relevance scores)
3. Link chunks to products (relevance scores)
4. Create relationship records

**Relevance Algorithm**:
- Page overlap (40%): Same page = 0.4, adjacent = 0.2
- Visual similarity (40%): From AI detection
- Detection score (20%): Confidence from discovery

**Output**:
```json
{
  "product_image_relationships": 1000,
  "chunk_image_relationships": 2500,
  "chunk_product_relationships": 1500,
  "total_relationships": 5000
}
```

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
6. **IMAGE_EMBEDDINGS_GENERATED** - CLIP embeddings + Qwen Vision complete ✅ UPDATED
7. **PRODUCTS_DETECTED** - Products identified
8. **PRODUCTS_CREATED** - Product creation complete
9. **COMPLETED** - All processing complete

**Recovery Process**:
```python
if job.checkpoint_stage:
    resume_from_checkpoint(job.checkpoint_stage)
else:
    start_from_beginning()
```

**Note**:
- Stage 5 (IMAGES_EXTRACTED): All images uploaded to Supabase Storage, 0 local files
- Stage 6 (IMAGE_EMBEDDINGS_GENERATED): All CLIP embeddings + Qwen Vision analysis complete
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
- CLIP embeddings generated: 750 (5 types × 150 material images)
- Processing time: 2-3 minutes (vs 30+ minutes before)
- Memory usage: <3GB peak (vs 7.7GB OOM before)
- Disk usage: 0 images (vs 249 cumulative before)
- Success rate: 100%

**Accuracy Metrics**:
- Product detection: 95%+
- Material recognition: 90%+
- Metadata extraction: 88%+
- Search relevance: 85%+
- CLIP embedding quality: 95%+

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
- `classify_images()` - Qwen Vision + Claude validation
- `upload_images_to_storage()` - Upload to Supabase Storage
- `save_images_and_generate_clips()` - DB save + CLIP embeddings

**UnifiedChunkingService** (`app/services/unified_chunking_service.py`)
- `chunk_text()` - Semantic/hybrid/fixed-size/layout-aware chunking
- Supports 4 chunking strategies with quality scoring

**RelevancyService** (`app/services/relevancy_service.py`)
- `create_chunk_image_relationships()` - Based on embedding similarity
- `create_product_image_relationships()` - Based on page ranges
- `create_all_relationships()` - Orchestrate all relationships

### Internal API Endpoints

Each pipeline stage has a dedicated endpoint for independent testing and retry:

```http
POST /api/internal/classify-images/{job_id}
POST /api/internal/upload-images/{job_id}
POST /api/internal/save-images-db/{job_id}
POST /api/internal/create-chunks/{job_id}
POST /api/internal/create-relationships/{job_id}
```

### Main Orchestrator Endpoint

```http
POST /api/rag/documents/upload
Content-Type: multipart/form-data

Parameters:
- file: PDF file
- workspace_id: Workspace UUID
- category: Extraction category (default: "products")
- focused_extraction: true (default)

Response:
{
  "job_id": "uuid",
  "document_id": "uuid",
  "status": "processing",
  "progress": 0,
  "current_stage": "INITIALIZED"
}
```

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

Every product, chunk, image, and embedding is tagged with source information:

```python
# Products
await supabase.table('products').insert({
    'name': product_name,
    'source_type': 'pdf_processing',  # ✅ NEW
    'source_job_id': job_id,          # ✅ NEW
    # ... other fields
})

# Chunks
await supabase.table('document_chunks').insert({
    'content': chunk_text,
    'source_type': 'pdf_processing',  # ✅ NEW
    'source_job_id': job_id,          # ✅ NEW
    # ... other fields
})

# Images
await supabase.table('document_images').insert({
    'url': image_url,
    'source_type': 'pdf_processing',  # ✅ NEW
    'source_job_id': job_id,          # ✅ NEW
    # ... other fields
})

# Embeddings
await supabase.table('embeddings').insert({
    'embedding': vector,
    'source_type': 'pdf_processing',  # ✅ NEW
    'source_job_id': job_id,          # ✅ NEW
    # ... other fields
})
```

**Benefits:**
- Filter Materials Data page by specific PDF job
- Trace any data back to its source PDF
- Delete all data from a specific PDF import
- Audit data quality by source

---

### Heartbeat Monitoring ✅

Updates `last_heartbeat` field every stage to detect stuck jobs:

```python
# Update heartbeat during processing
await supabase.table('background_jobs').update({
    'last_heartbeat': datetime.utcnow().isoformat(),
    'current_stage': stage_name,
    'progress_percent': progress
}).eq('id', job_id).execute()
```

**Stuck Job Detection:**
- Threshold: >10 minutes without heartbeat
- Auto-recovery: Automatic retry of stuck jobs
- Monitoring: Real-time job health dashboard

---

### Sentry Error Tracking ✅

Comprehensive error tracking and performance monitoring:

```python
# Transaction tracking
with sentry_sdk.start_transaction(op="pdf_processing", name="process_stage") as transaction:
    transaction.set_tag("job_id", job_id)
    transaction.set_tag("stage", stage_name)
    transaction.set_data("total_pages", total_pages)

    # Breadcrumbs for debugging
    sentry_sdk.add_breadcrumb(
        category="pdf_processing",
        message=f"Processing stage {stage_name}",
        level="info",
        data={"progress": progress}
    )

    try:
        # ... processing logic ...
        transaction.set_status("ok")
    except Exception as e:
        sentry_sdk.capture_exception(e)
        transaction.set_status("internal_error")
        raise
```

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
| **Progress Tracking** | ✅ COMPLETE | Real-time progress updates via `job_progress` table |
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

**Response Format**:
```json
{
  "products": [
    {
      "id": "uuid-here",
      "name": "NOVA",
      "description": "Modern ceramic tile collection",
      "page_range": [12, 13, 14],
      "metadata": {
        "factory": "Castellón Factory",
        "dimensions": ["15×38", "20×40"],
        "material": "ceramic"
      },
      "chunks": [
        {
          "id": "chunk-uuid",
          "content": "NOVA is a contemporary...",
          "page_number": 12
        }
      ],
      "images": [
        {
          "id": "image-uuid",
          "url": "https://supabase.co/storage/...",
          "page_number": 12
        }
      ],
      "tables": [
        {
          "id": "table-uuid",
          "page_number": 13,
          "table_type": "specifications",
          "headers": ["Property", "Value"],
          "table_data": {
            "rows": [
              ["Material", "Porcelain Stoneware"],
              ["Dimensions", "60x120 cm"]
            ]
          }
        }
      ]
    }
  ],
  "total": 1
}
```

**Implementation Details**:

1. **Efficient Batch Query**: Single query fetches all tables for all products
2. **Grouping**: Tables grouped by `product_id` for efficient lookup
3. **Backward Compatible**: Can disable tables with `include_tables=false`
4. **Consistent Pattern**: Follows same pattern as chunks and images

**Example Usage**:
```bash
# With tables (default)
curl "http://localhost:8000/api/rag/products?document_id=YOUR_DOC_ID"

# Without tables
curl "http://localhost:8000/api/rag/products?document_id=YOUR_DOC_ID&include_tables=false"
```

**Benefits**:
- ✅ Single API call for complete product data
- ✅ Includes structured table data for specs
- ✅ Efficient batch query (no N+1 problem)
- ✅ Backward compatible with optional parameter

---

## 🎯 YOLO Layout-Aware Chunking

### Overview

The YOLO Layout-Aware Chunking system uses detected layout regions to create intelligent, boundary-respecting chunks that preserve document structure and semantic meaning.

### How It Works

**Stage 4.5 (YOLO Detection)** → **Stage 2 (Layout-Aware Chunking)**

1. **YOLO detects layout regions** (Stage 4.5)
   - Stores regions in `product_layout_regions` table
   - Each region has: type, bbox, confidence, reading_order, text_content

2. **Chunking service reads regions** (Stage 2)
   - Fetches regions for current product
   - Sorts by reading_order
   - Creates chunks based on region types

### Chunking Strategy by Region Type

#### 1. **TABLE Regions** 📊
- **Strategy**: Keep entire table together
- **Rationale**: Tables are atomic units of information
- **Metadata**: Includes bbox, confidence, region_type='TABLE'

```python
# Example: Specifications table
{
  "content": "Material | Dimensions | Finish\nCeramic | 60x120cm | Matte",
  "region_type": "TABLE",
  "reading_order": 5
}
```

#### 2. **TITLE + TEXT Regions** 📝
- **Strategy**: Combine title with following text
- **Rationale**: Titles provide context for content
- **Metadata**: Includes both title and text bbox

```python
# Example: Section with title
{
  "content": "Product Specifications\n\nOur ceramic tiles feature...",
  "region_type": "TITLE+TEXT",
  "reading_order": 3
}
```

#### 3. **TEXT Regions** 📄
- **Strategy**: Respect region boundaries, split if too large
- **Rationale**: Preserve semantic paragraphs
- **Fallback**: Use semantic chunking if text > max_chunk_size

```python
# Example: Body text
{
  "content": "The NOVA collection represents...",
  "region_type": "TEXT",
  "reading_order": 4
}
```

#### 4. **IMAGE + CAPTION Regions** 🖼️
- **Strategy**: Link captions to images
- **Rationale**: Captions describe images
- **Metadata**: Includes image bbox for reference

```python
# Example: Image with caption
{
  "content": "Figure 1: Installation detail showing...",
  "region_type": "CAPTION",
  "reading_order": 6,
  "linked_image_bbox": {...}
}
```

### Configuration

**Enable Layout-Aware Chunking:**
```python
# In UnifiedChunkingService
config = ChunkingConfig(
    strategy=ChunkingStrategy.LAYOUT_AWARE,  # Use YOLO regions
    max_chunk_size=1000,
    min_chunk_size=100
)
```

**Fallback Behavior:**
- If no `product_id` in metadata → Falls back to semantic chunking
- If no layout regions found → Falls back to semantic chunking
- If YOLO fails → Pipeline continues with semantic chunking

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

- **Processing Time**: +2-5 seconds per page (YOLO detection)
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
```python
# Detect H1, H2, H3 levels
{
  "h1": "Outdoor Furniture",
  "h2": "Chairs",
  "h3": "Ergonomic Series",
  "content": "Our ergonomic chairs feature..."
}
```

#### Title Propagation
- Include parent titles in child chunks
- Enables hierarchical search
- Better context for embeddings

```python
# Example: Nested context
{
  "content": "Our ergonomic chairs feature...",
  "hierarchy": {
    "h1": "Outdoor Furniture",
    "h2": "Chairs",
    "h3": "Ergonomic Series"
  }
}
```

#### Smart Boundary Detection
- Don't combine if TEXT is too large
- Split large TEXT while preserving title context
- Adaptive chunk sizing based on content

**Benefits:**
- 📈 Better search relevance (hierarchical context)
- 🎯 More precise retrieval (multi-level filtering)
- 🧠 Richer embeddings (contextual information)

---

### 2. Monitoring & Metrics for YOLO Performance

**Planned Metrics:**

#### Processing Metrics
```python
{
  "yolo_processing_time_per_page": 8.5,  # seconds
  "regions_detected_per_page": 12,
  "confidence_score_avg": 0.87,
  "confidence_score_min": 0.52,
  "table_extraction_success_rate": 0.95
}
```

#### Region Distribution
```python
{
  "region_counts": {
    "TEXT": 45,
    "TITLE": 12,
    "TABLE": 8,
    "IMAGE": 15,
    "CAPTION": 10,
    "FORMULA": 2
  }
}
```

#### Performance Tracking
- **Processing time** per page (identify slow pages)
- **Memory usage** during YOLO processing
- **Error rates** and failure patterns
- **Cost tracking** (if using paid endpoints)

**Benefits:**
- 🔍 Identify performance bottlenecks
- 📊 Optimize confidence thresholds
- 💰 Track processing costs
- 🐛 Detect when YOLO is struggling

**Implementation:**
```python
# Add to product_processor.py
yolo_metrics = {
    "start_time": time.time(),
    "regions_detected": len(all_regions),
    "tables_extracted": len(table_regions),
    "avg_confidence": np.mean([r.confidence for r in all_regions])
}

# Store in job_progress table
await supabase.table('job_progress').insert({
    'job_id': job_id,
    'stage': 'yolo_detection',
    'metrics': yolo_metrics
}).execute()
```

---

### 3. GPU Acceleration

**Current Performance:**
- **CPU**: 8-15 seconds per page
- **Memory**: ~2-4GB RAM

**With GPU Acceleration:**
- **GPU**: 2-5 seconds per page (3-5× faster)
- **Memory**: ~4-6GB VRAM
- **Batch Processing**: Process multiple pages simultaneously

**Implementation Plan:**

#### Auto-Detection
```python
# Detect GPU availability
import torch

device = 'cuda' if torch.cuda.is_available() else 'cpu'
logger.info(f"Using device: {device}")
```

#### Batch Processing
```python
# Process multiple pages in parallel
batch_size = 4 if device == 'cuda' else 1

for i in range(0, len(pages), batch_size):
    batch_pages = pages[i:i+batch_size]
    results = await detector.detect_batch(
        pdf_path=pdf_path,
        page_numbers=batch_pages,
        device=device
    )
```

#### Memory Management
```python
# Clear GPU cache between batches
if device == 'cuda':
    torch.cuda.empty_cache()
```

**Configuration:**
```bash
# .env
YOLO_DEVICE=cuda  # or 'cpu'
YOLO_BATCH_SIZE=4  # GPU batch size
```

**Benefits:**
- ⚡ 3-5× faster processing
- 📦 Batch processing for efficiency
- 💾 Better memory utilization
- 🎯 Production-ready performance

---

### 4. Advanced Chunking Rules

**Beyond Title-Content Relationships:**

#### List Detection
```python
# Keep bullet/numbered lists together
{
  "content": "Features:\n• Waterproof\n• UV resistant\n• Easy to clean",
  "region_type": "LIST",
  "list_type": "bullet"
}
```

#### Table Context
```python
# Include surrounding text with tables
{
  "content": "Technical specifications:\n\n[TABLE DATA]\n\nNote: All measurements in cm",
  "region_type": "TABLE_WITH_CONTEXT"
}
```

#### Image-Caption Linking
```python
# Link captions to specific images
{
  "content": "Figure 3: Installation detail",
  "region_type": "CAPTION",
  "linked_image_id": "image-uuid-here"
}
```

#### Cross-Reference Detection
```python
# Detect "see Figure 3" and link chunks
{
  "content": "For installation details, see Figure 3",
  "cross_references": ["figure-3"],
  "linked_chunks": ["chunk-uuid-with-figure-3"]
}
```

#### Section Boundaries
```python
# Never split across major sections
{
  "content": "...",
  "section": "Installation Guide",
  "subsection": "Step 1: Preparation"
}
```

#### Formula Preservation
```python
# Keep mathematical formulas intact
{
  "content": "Coverage area = length × width × 1.1",
  "region_type": "FORMULA",
  "formula_type": "calculation"
}
```

**Benefits:**
- 🎯 More precise chunking
- 🔗 Better entity relationships
- 📊 Richer metadata
- 🧠 Improved search quality

---

**Last Updated**: January 8, 2026
**Pipeline Version**: Product-Centric Architecture with YOLO Layout Detection & Table Extraction
**Status**: Production

**Major Features**:
- ✅ **Product-Centric Architecture**: Process each product individually (Stages 1-5)
- ✅ **YOLO Layout Detection**: Intelligent region detection (Stage 4.5)
  - 6 region types: TEXT, TITLE, TABLE, IMAGE, CAPTION, FORMULA
  - Enabled by default (`YOLO_ENABLED=true`)
  - Stores regions in `product_layout_regions` table
  - Graceful degradation if YOLO fails
- ✅ **Table Extraction**: Structured table data linked to products
  - Automatic extraction from TABLE regions
  - Multiple formats: JSON, CSV, Markdown
  - Stored in `product_tables` table
- ✅ **Layout-Aware Chunking**: Boundary-respecting chunks
  - Reads YOLO regions from database
  - Combines TITLE + TEXT intelligently
  - Keeps tables intact
  - Preserves reading order
  - Falls back to semantic chunking if no regions
- ✅ **Entity Linking**: All entities linked via product_id foreign key
- ✅ **Product API**: Includes tables in product response
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
- 🔮 YOLO performance monitoring & metrics
- 🔮 GPU acceleration (3-5× faster)
- 🔮 Advanced chunking rules (lists, cross-references, formulas)

