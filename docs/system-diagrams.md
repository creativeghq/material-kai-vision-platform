# System Diagrams - Knowledge Base & Products

**Document Version**: 2.0
**Date**: 2025-10-25
**Status**: ✅ Production Ready

---

## 1. COMPLETE SYSTEM ARCHITECTURE

```
┌─────────────────────────────────────────────────────────────────┐
│                        FRONTEND (React/TypeScript)              │
│                    PDFProcessing.tsx Component                  │
└────────────────────────────┬──────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                    EDGE FUNCTION (Supabase)                     │
│                    mivaa-gateway/index.ts                       │
│              handleFileUpload() → POST /api/rag/...             │
└────────────────────────────┬──────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                    FASTAPI BACKEND (Python)                     │
│                  mivaa-pdf-extractor/app/api/                   │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ POST /api/rag/documents/upload-async                    │  │
│  │ ├─ PDFProcessor.process_document()                      │  │
│  │ │  ├─ Extract text & images                             │  │
│  │ │  ├─ RealImageAnalysisService.analyze_image()          │  │
│  │ │  │  ├─ Llama 3.2 90B Vision                           │  │
│  │ │  │  ├─ Claude 4.5 Sonnet Vision                       │  │
│  │ │  │  └─ CLIP embeddings                                │  │
│  │ │  ├─ UnifiedChunkingService.chunk_text()               │  │
│  │ │  │  ├─ Semantic chunking                              │  │
│  │ │  │  ├─ Fixed-size chunking                            │  │
│  │ │  │  ├─ Hybrid chunking                                │  │
│  │ │  │  └─ Layout-aware chunking                          │  │
│  │ │  └─ ProductEnrichmentService.enrich_products()        │  │
│  │ │     ├─ RealEmbeddingsService.generate_all_embeddings()│  │
│  │ │     │  ├─ Text (1536D)                                │  │
│  │ │     │  ├─ Visual CLIP (512D)                          │  │
│  │ │     │  ├─ Multimodal (2048D)                          │  │
│  │ │     │  ├─ Color (256D)                                │  │
│  │ │     │  ├─ Texture (256D)                              │  │
│  │ │     │  └─ Application (512D)                          │  │
│  │ │     └─ RealQualityScoringService.calculate_scores()   │  │
│  │ │        ├─ Image quality                               │  │
│  │ │        ├─ Chunk quality                               │  │
│  │ │        └─ Product quality                             │  │
│  │ └─ Store in Supabase                                    │  │
│  │                                                          │  │
│  ├─ POST /api/search/unified-search                        │  │
│  │ └─ UnifiedSearchService.search()                        │  │
│  │    ├─ Semantic search                                   │  │
│  │    ├─ Visual search                                     │  │
│  │    ├─ Multi-vector search                               │  │
│  │    ├─ Hybrid search                                     │  │
│  │    ├─ Material search                                   │  │
│  │    └─ Keyword search                                    │  │
│  │                                                          │  │
│  └─ Other RAG endpoints                                    │  │
│     ├─ /api/rag/documents/list                             │  │
│     ├─ /api/rag/documents/{id}                             │  │
│     ├─ /api/rag/query                                      │  │
│     └─ /api/rag/search                                     │  │
│                                                                 │
└────────────────────────────┬──────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                    SUPABASE (PostgreSQL)                        │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ Tables:                                                  │  │
│  │ ├─ documents                                             │  │
│  │ ├─ document_chunks                                       │  │
│  │ │  ├─ id, content, document_id                           │  │
│  │ │  ├─ text_embedding_1536 (vector)                       │  │
│  │ │  ├─ visual_clip_embedding_512 (vector)                 │  │
│  │ │  ├─ multimodal_fusion_embedding_2048 (vector)          │  │
│  │ │  ├─ color_embedding_256 (vector)                       │  │
│  │ │  ├─ texture_embedding_256 (vector)                     │  │
│  │ │  ├─ application_embedding_512 (vector)                 │  │
│  │ │  ├─ quality_score, quality_metrics                     │  │
│  │ │  └─ metadata                                           │  │
│  │ ├─ products                                              │  │
│  │ │  ├─ All 6 embedding types                              │  │
│  │ │  ├─ quality_score, quality_metrics                     │  │
│  │ │  └─ metadata                                           │  │
│  │ ├─ images                                                │  │
│  │ │  ├─ visual_clip_embedding_512 (vector)                 │  │
│  │ │  ├─ quality_score                                      │  │
│  │ │  └─ metadata                                           │  │
│  │ └─ Other tables (metafields, etc.)                       │  │
│  │                                                          │  │
│  └─ Vector Search Functions:                               │  │
│     ├─ search_chunks_by_embedding()                         │  │
│     ├─ search_images_by_embedding()                         │  │
│     ├─ search_materials()                                   │  │
│     └─ search_chunks_keyword()                              │  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 2. AI MODELS & SERVICES ARCHITECTURE

```
┌─────────────────────────────────────────────────────────────────┐
│                        AI MODELS LAYER                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ LLAMA (LlamaIndex RAG)                                   │  │
│  │ ├─ Document parsing                                      │  │
│  │ ├─ Semantic chunking                                     │  │
│  │ ├─ Semantic analysis                                     │  │
│  │ └─ Knowledge graph construction                          │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ ANTHROPIC CLAUDE                                         │  │
│  │ ├─ Claude 4.5 Sonnet - Image validation & enrichment    │  │
│  │ ├─ Claude 4.5 Haiku - Fast classification               │  │
│  │ └─ Vision capabilities for image analysis               │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ OPENAI                                                   │  │
│  │ ├─ CLIP - Visual embeddings (512D)                      │  │
│  │ ├─ text-embedding-3-small - Text embeddings (1536D)     │  │
│  │ └─ GPT-5 - Advanced reasoning & validation              │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ SPECIALIZED EMBEDDINGS                                   │  │
│  │ ├─ Color Embedding Service (256D)                       │  │
│  │ ├─ Texture Embedding Service (256D)                     │  │
│  │ └─ Application Embedding Service (512D)                 │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 3. MULTI-VECTOR STORAGE SYSTEM

```
┌─────────────────────────────────────────────────────────────────┐
│                    MULTI-VECTOR EMBEDDINGS                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Entity: CHUNK / PRODUCT / IMAGE                               │
│  │                                                              │
│  ├─ Text Embedding (1536D)                                     │
│  │  └─ OpenAI text-embedding-3-small                           │
│  │                                                              │
│  ├─ Visual CLIP Embedding (512D)                               │
│  │  └─ OpenAI CLIP                                             │
│  │                                                              │
│  ├─ Multimodal Fusion Embedding (2048D)                        │
│  │  └─ Combined text + visual                                  │
│  │                                                              │
│  ├─ Color Embedding (256D)                                     │
│  │  └─ Specialized color analysis                              │
│  │                                                              │
│  ├─ Texture Embedding (256D)                                   │
│  │  └─ Specialized texture analysis                            │
│  │                                                              │
│  └─ Application Embedding (512D)                               │
│     └─ Specialized application/use-case analysis               │
│                                                                 │
│  TOTAL: 6 embedding types, 3584 dimensions                     │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 4. QUALITY SCORING SYSTEM

```
┌─────────────────────────────────────────────────────────────────┐
│                    5-DIMENSIONAL QUALITY SCORING                │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ 1. Semantic Completeness (28% weight)                   │  │
│  │    ├─ Content coherence                                 │  │
│  │    ├─ Topic coverage                                    │  │
│  │    └─ Information density                               │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ 2. Boundary Quality (30% weight)                        │  │
│  │    ├─ Clean sentence breaks                             │  │
│  │    ├─ Paragraph integrity                               │  │
│  │    └─ Section coherence                                 │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ 3. Context Preservation (15% weight)                    │  │
│  │    ├─ Reference continuity                              │  │
│  │    ├─ Contextual links                                  │  │
│  │    └─ Semantic relationships                            │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ 4. Structural Integrity (20% weight)                    │  │
│  │    ├─ Heading preservation                              │  │
│  │    ├─ List structure                                    │  │
│  │    └─ Table integrity                                   │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ 5. Metadata Richness (7% weight)                        │  │
│  │    ├─ Extracted properties                              │  │
│  │    ├─ Entity recognition                                │  │
│  │    └─ Relationship mapping                              │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                 │
│  FINAL SCORE: Weighted average (0-100)                         │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 5. LEGACY SYSTEM ARCHITECTURE (For Reference)

```
┌─────────────────────────────────────────────────────────────────┐
│                     MATERIAL KAI VISION PLATFORM                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌──────────────────┐         ┌──────────────────┐              │
│  │   PDF UPLOAD     │         │  XML/SCRAPING    │              │
│  │   (Frontend)     │         │   (External)     │              │
│  └────────┬─────────┘         └────────┬─────────┘              │
│           │                            │                         │
│           └────────────┬───────────────┘                         │
│                        ▼                                         │
│        ┌──────────────────────────────┐                         │
│        │  PDF PROCESSING PIPELINE     │                         │
│        │  (MIVAA Integration)         │                         │
│        ├──────────────────────────────┤                         │
│        │ • Extract text               │                         │
│        │ • Create chunks              │                         │
│        │ • Extract images             │                         │
│        │ • Generate embeddings        │                         │
│        └────────────┬─────────────────┘                         │
│                     │                                            │
│        ┌────────────┴────────────┐                              │
│        ▼                         ▼                              │
│   ┌─────────────┐         ┌──────────────┐                     │
│   │  KNOWLEDGE  │         │   PRODUCT    │                     │
│   │    BASE     │         │   BUILDER    │                     │
│   │  (Storage)  │         │  (Service)   │                     │
│   └─────────────┘         └──────┬───────┘                     │
│        │                         │                              │
│        │                         ▼                              │
│        │                  ┌──────────────┐                     │
│        │                  │   PRODUCTS   │                     │
│        │                  │  (Database)  │                     │
│        │                  └──────┬───────┘                     │
│        │                         │                              │
│        └────────────┬────────────┘                              │
│                     ▼                                            │
│        ┌──────────────────────────────┐                         │
│        │   UNIFIED SEARCH SERVICE     │                         │
│        │  (Embeddings + Keywords)     │                         │
│        └────────────┬─────────────────┘                         │
│                     │                                            │
│        ┌────────────┴────────────┐                              │
│        ▼                         ▼                              │
│   ┌─────────────┐         ┌──────────────┐                     │
│   │  MATERIALS  │         │    AGENT     │                     │
│   │    PAGE     │         │ RECOMMENDER  │                     │
│   │ (Discovery) │         │ (AI)         │                     │
│   └─────────────┘         └──────────────┘                     │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
```

---

## 2. DATA FLOW - PDF TO PRODUCT

```
PDF Document
│
├─ Metadata
│  ├─ filename: "materials.pdf"
│  ├─ upload_date: 2025-10-19
│  ├─ file_size: 2.5MB
│  └─ page_count: 45
│
├─ Chunks (Text Segments)
│  ├─ Chunk 1: "Ceramic tiles are durable..."
│  │  ├─ Embedding: [0.234, -0.156, 0.892, ...]
│  │  ├─ Page: 5
│  │  └─ Position: 1
│  │
│  ├─ Chunk 2: "Available in red, blue, green..."
│  │  ├─ Embedding: [0.445, 0.123, -0.234, ...]
│  │  ├─ Page: 6
│  │  └─ Position: 2
│  │
│  └─ Chunk 3: "Fire resistant properties..."
│     ├─ Embedding: [0.156, 0.234, 0.567, ...]
│     ├─ Page: 7
│     └─ Position: 3
│
├─ Images (Extracted)
│  ├─ Image 1: red_tile_1.jpg
│  │  ├─ Page: 5
│  │  ├─ Embedding: [0.300, 0.200, 0.500, ...]
│  │  └─ Confidence: 0.95
│  │
│  └─ Image 2: red_tile_2.jpg
│     ├─ Page: 6
│     ├─ Embedding: [0.310, 0.210, 0.510, ...]
│     └─ Confidence: 0.92
│
└─ Product (Built from Chunks)
   ├─ Name: "Fire-Resistant Red Ceramic Tiles"
   ├─ Description: "Durable ceramic tiles with fire resistance"
   ├─ Properties:
   │  ├─ color: "red"
   │  ├─ material: "ceramic"
   │  ├─ fireResistant: true
   │  └─ durability: "high"
   ├─ Images: [red_tile_1.jpg, red_tile_2.jpg]
   ├─ Embedding: [0.330, 0.190, 0.520, ...] (combined)
   └─ Source Chunks: [Chunk1, Chunk2, Chunk3]
```

---

## 3. KNOWLEDGE BASE UI STRUCTURE

```
┌─────────────────────────────────────────────────────────────┐
│                    KNOWLEDGE BASE                            │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  Tabs: [Overview] [Documents] [Chunks] [Images] [Embeddings]│
│         [Products] [Metadata]                                │
│                                                               │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │ DOCUMENTS TAB                                           │ │
│  ├─────────────────────────────────────────────────────────┤ │
│  │                                                           │ │
│  │  📄 materials.pdf                                        │ │
│  │  ├─ Filename: materials.pdf                             │ │
│  │  ├─ Upload Date: 2025-10-19                             │ │
│  │  ├─ File Size: 2.5 MB                                   │ │
│  │  ├─ Pages: 45                                           │ │
│  │  ├─ Chunks: 127                                         │ │
│  │  ├─ Images: 23                                          │ │
│  │  ├─ Status: ✅ Processed                                │ │
│  │  └─ [View Details Modal]                                │ │
│  │                                                           │ │
│  │  📄 specifications.pdf                                   │ │
│  │  ├─ Filename: specifications.pdf                        │ │
│  │  ├─ Upload Date: 2025-10-18                             │ │
│  │  ├─ File Size: 1.8 MB                                   │ │
│  │  ├─ Pages: 32                                           │ │
│  │  ├─ Chunks: 89                                          │ │
│  │  ├─ Images: 15                                          │ │
│  │  ├─ Status: ✅ Processed                                │ │
│  │  └─ [View Details Modal]                                │ │
│  │                                                           │ │
│  └─────────────────────────────────────────────────────────┘ │
│                                                               │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │ CHUNKS TAB                                              │ │
│  ├─────────────────────────────────────────────────────────┤ │
│  │                                                           │ │
│  │  📝 Chunk #1                                            │ │
│  │  ├─ Source: materials.pdf (Page 5)                      │ │
│  │  ├─ Content: "Ceramic tiles are durable..."             │ │
│  │  ├─ Embedding: ✅ Generated (1536D)                     │ │
│  │  ├─ Related Chunks: 3 (similarity: 0.92, 0.85, 0.78)   │ │
│  │  ├─ Related Images: 2                                   │ │
│  │  └─ [View Details Modal]                                │ │
│  │                                                           │ │
│  │  📝 Chunk #2                                            │ │
│  │  ├─ Source: materials.pdf (Page 6)                      │ │
│  │  ├─ Content: "Available in red, blue, green..."         │ │
│  │  ├─ Embedding: ✅ Generated (1536D)                     │ │
│  │  ├─ Related Chunks: 2 (similarity: 0.88, 0.81)         │ │
│  │  ├─ Related Images: 3                                   │ │
│  │  └─ [View Details Modal]                                │ │
│  │                                                           │ │
│  └─────────────────────────────────────────────────────────┘ │
│                                                               │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │ IMAGES TAB                                              │ │
│  ├─────────────────────────────────────────────────────────┤ │
│  │                                                           │ │
│  │  [Image Grid]                                           │ │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐              │ │
│  │  │ Image 1  │  │ Image 2  │  │ Image 3  │              │ │
│  │  │ red_tile │  │ red_tile │  │ blue_tile│              │ │
│  │  │ Page: 5  │  │ Page: 6  │  │ Page: 8  │              │ │
│  │  │ Conf: 95%│  │ Conf: 92%│  │ Conf: 88%│              │ │
│  │  │ [Details]│  │ [Details]│  │ [Details]│              │ │
│  │  └──────────┘  └──────────┘  └──────────┘              │ │
│  │                                                           │ │
│  └─────────────────────────────────────────────────────────┘ │
│                                                               │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │ PRODUCTS TAB (NEW)                                      │ │
│  ├─────────────────────────────────────────────────────────┤ │
│  │                                                           │ │
│  │  🏷️ Fire-Resistant Red Ceramic Tiles                    │ │
│  │  ├─ Status: Published                                   │ │
│  │  ├─ Source Chunks: 3                                    │ │
│  │  ├─ Images: 2                                           │ │
│  │  ├─ Embedding: ✅ Generated                             │ │
│  │  ├─ Properties: color=red, material=ceramic, ...        │ │
│  │  └─ [Edit] [View] [Delete]                              │ │
│  │                                                           │ │
│  │  🏷️ Waterproof Blue Porcelain Tiles                     │ │
│  │  ├─ Status: Draft                                       │ │
│  │  ├─ Source Chunks: 2                                    │ │
│  │  ├─ Images: 1                                           │ │
│  │  ├─ Embedding: ✅ Generated                             │ │
│  │  ├─ Properties: color=blue, material=porcelain, ...     │ │
│  │  └─ [Edit] [View] [Delete]                              │ │
│  │                                                           │ │
│  └─────────────────────────────────────────────────────────┘ │
│                                                               │
└─────────────────────────────────────────────────────────────┘
```

---

## 4. SEARCH FLOW DIAGRAM

```
User Query: "red waterproof tiles"
│
├─ Query Preprocessing
│  ├─ Normalize: "red waterproof tiles"
│  ├─ Remove stopwords: "red waterproof tiles"
│  └─ Identify intent: "find material"
│
├─ Generate Query Embedding
│  └─ Result: [0.210, -0.145, 0.895, ...] (1536D)
│
├─ Parallel Search
│  │
│  ├─ Search A: Product Embeddings
│  │  ├─ Query: product_embeddings table
│  │  ├─ Find similar: cosine_similarity > 0.7
│  │  └─ Results:
│  │     ├─ Product1 (0.92) - "Fire-Resistant Red Ceramic Tiles"
│  │     ├─ Product2 (0.85) - "Waterproof Red Porcelain Tiles"
│  │     └─ Product3 (0.78) - "Red Tile Collection"
│  │
│  ├─ Search B: Chunk Embeddings
│  │  ├─ Query: document_vectors table
│  │  ├─ Find similar: cosine_similarity > 0.7
│  │  └─ Results:
│  │     ├─ Chunk1 (0.88) - "Red tiles are ideal for bathrooms..."
│  │     ├─ Chunk2 (0.81) - "Waterproof properties ensure durability..."
│  │     └─ Chunk3 (0.75) - "Available in red, blue, green..."
│  │
│  └─ Search C: Keyword Search
│     ├─ Match: "red", "waterproof", "tiles"
│     └─ Results: [Product4, Chunk4, Chunk5]
│
├─ Result Merging & Ranking
│  ├─ Combine all results
│  ├─ Remove duplicates
│  ├─ Calculate final score:
│  │  score = (embedding_similarity * 0.6) + (keyword_match * 0.3) + (popularity * 0.1)
│  └─ Sort by score
│
└─ Return Results
   ├─ 1. Product1 (0.92) - "Fire-Resistant Red Ceramic Tiles"
   ├─ 2. Product2 (0.85) - "Waterproof Red Porcelain Tiles"
   ├─ 3. Chunk1 (0.88) - "Red tiles are ideal for bathrooms..."
   ├─ 4. Chunk2 (0.81) - "Waterproof properties ensure durability..."
   └─ 5. Product3 (0.78) - "Red Tile Collection"
```

---

## 5. DATABASE RELATIONSHIPS

```
┌──────────────────┐
│   documents      │
├──────────────────┤
│ id (PK)          │
│ filename         │
│ file_size        │
│ processing_status│
│ created_at       │
└────────┬─────────┘
         │ 1:N
         │
    ┌────▼──────────────────┐
    │                        │
    ▼                        ▼
┌──────────────────┐  ┌──────────────────┐
│ document_chunks  │  │ document_images  │
├──────────────────┤  ├──────────────────┤
│ id (PK)          │  │ id (PK)          │
│ document_id (FK) │  │ document_id (FK) │
│ content          │  │ image_url        │
│ chunk_index      │  │ page_number      │
│ metadata         │  │ confidence       │
└────┬─────────────┘  └────┬─────────────┘
     │ 1:1                 │ 1:1
     │                     │
     ▼                     ▼
┌──────────────────┐  ┌──────────────────┐
│ document_vectors │  │ image_embeddings │
├──────────────────┤  ├──────────────────┤
│ id (PK)          │  │ id (PK)          │
│ chunk_id (FK)    │  │ image_id (FK)    │
│ embedding        │  │ embedding        │
│ model_name       │  │ embedding_type   │
└──────────────────┘  └──────────────────┘

┌──────────────────┐
│    products      │ (NEW)
├──────────────────┤
│ id (PK)          │
│ name             │
│ description      │
│ category_id      │
│ embedding        │
│ status           │
└────┬─────────────┘
     │ 1:N
     │
    ┌┴──────────────────────┐
    │                        │
    ▼                        ▼
┌──────────────────┐  ┌──────────────────┐
│ product_images   │  │product_embeddings│
├──────────────────┤  ├──────────────────┤
│ id (PK)          │  │ id (PK)          │
│ product_id (FK)  │  │ product_id (FK)  │
│ image_url        │  │ embedding        │
│ display_order    │  │ embedding_type   │
└──────────────────┘  └──────────────────┘

┌──────────────────────────────┐
│product_chunk_relationships   │ (NEW)
├──────────────────────────────┤
│ id (PK)                      │
│ product_id (FK)              │
│ chunk_id (FK)                │
│ relationship_type            │
│ relevance_score              │
└──────────────────────────────┘
```

---

## 6. MATERIALS PAGE LAYOUT

```
┌─────────────────────────────────────────────────────────────┐
│                    MATERIALS PAGE                            │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  Search: [red waterproof tiles          ] [Search]           │
│                                                               │
│  ┌──────────────────┐  ┌─────────────────────────────────┐  │
│  │ FILTERS          │  │ PRODUCTS (127 results)          │  │
│  ├──────────────────┤  ├─────────────────────────────────┤  │
│  │ Category         │  │                                 │  │
│  │ ☑ Tiles          │  │  ┌──────────┐  ┌──────────┐    │  │
│  │ ☑ Ceramics       │  │  │ Product1 │  │ Product2 │    │  │
│  │ ☐ Stone          │  │  │ Red      │  │ Blue     │    │  │
│  │ ☐ Wood           │  │  │ Ceramic  │  │ Porcelain│    │  │
│  │                  │  │  │ Tiles    │  │ Tiles    │    │  │
│  │ Color            │  │  │ $45/m²   │  │ $52/m²   │    │  │
│  │ ☑ Red            │  │  │ [Details]│  │ [Details]│    │  │
│  │ ☐ Blue           │  │  └──────────┘  └──────────┘    │  │
│  │ ☐ Green          │  │                                 │  │
│  │ ☐ White          │  │  ┌──────────┐  ┌──────────┐    │  │
│  │                  │  │  │ Product3 │  │ Product4 │    │  │
│  │ Properties       │  │  │ Red Tile │  │ Waterproof   │  │
│  │ ☑ Waterproof     │  │  │ Collection   │ Tiles    │    │  │
│  │ ☑ Fire Resistant │  │  │ $38/m²   │  │ $48/m²   │    │  │
│  │ ☐ Slip Resistant │  │  │ [Details]│  │ [Details]│    │  │
│  │ ☐ Eco-Friendly   │  │  └──────────┘  └──────────┘    │  │
│  │                  │  │                                 │  │
│  │ [Clear Filters]  │  │  [Load More Products]           │  │
│  │                  │  │                                 │  │
│  └──────────────────┘  └─────────────────────────────────┘  │
│                                                               │
└─────────────────────────────────────────────────────────────┘
```

---

## 7. AGENT RECOMMENDATION FLOW

```
User Query: "I need red waterproof tiles for a bathroom"
│
├─ Agent Receives
│  ├─ Search Results: [Product1, Product2, Chunk1, Chunk2]
│  └─ User Context: bathroom, red, waterproof
│
├─ Agent Analysis
│  ├─ Identify Needs:
│  │  ├─ Color: red
│  │  ├─ Property: waterproof
│  │  ├─ Use case: bathroom
│  │  └─ Type: tiles
│  │
│  ├─ Match Products:
│  │  ├─ Product1: Matches all (score: 0.95)
│  │  ├─ Product2: Matches 3/4 (score: 0.85)
│  │  └─ Product3: Matches 2/4 (score: 0.65)
│  │
│  └─ Generate Recommendations:
│     ├─ Primary: Product1 (perfect match)
│     ├─ Alternative: Product2 (good alternative)
│     └─ Consider: Product3 (budget option)
│
└─ Agent Response
   ├─ "I recommend Product1 - it's perfect for your needs"
   ├─ "It's red, waterproof, and ideal for bathrooms"
   ├─ "Alternative: Product2 is also excellent"
   ├─ [Product1 Card with Images]
   ├─ [Product2 Card with Images]
   └─ [Link to Materials Page]
```

---

## 8. IMPLEMENTATION PHASES

```
Week 1-2: Knowledge Base Fixes
├─ Fix UI Issues (12 items)
├─ Implement Modals
└─ Add Real-time Updates
    ▼
Week 2-3: Database & APIs
├─ Create Tables
├─ Implement CRUD
└─ Set up Relationships
    ▼
Week 3-4: Product Creation
├─ Build ProductBuilderService
├─ Implement Embeddings
└─ Create Product UI
    ▼
Week 4-5: Search & Materials
├─ Unified Search
├─ Materials Page
└─ Agent Integration
    ▼
Week 5-6: Testing & Deploy
├─ Comprehensive Testing
├─ Performance Optimization
└─ Deployment
    ▼
✅ COMPLETE SYSTEM LIVE
```

