# Platform Flows & User Workflows

Complete guide to all user workflows and feature flows in the Material Kai Vision Platform.

---

## 📋 Table of Contents

1. [PDF Processing Flow](#1-pdf-processing-flow)
2. [Search & Discovery Flow](#2-search--discovery-flow)
3. [Spatial Analysis Flow (Spaceformer)](#3-spatial-analysis-flow-spaceformer) ✨ NEW
4. [Data Import Flow](#4-data-import-flow)
5. [3D Generation Flow](#5-3d-generation-flow)
6. [Knowledge Base Flow](#6-knowledge-base-flow)
7. [Agent Chat Flow](#7-agent-chat-flow)
8. [VR World Generation Flow](#8-vr-world-generation-flow) ✨ NEW

---

## 1. PDF Processing Flow

**Purpose:** Transform material catalog PDFs into searchable, intelligent knowledge

**User Journey:**
```
1. User uploads PDF file
   ↓
2. Frontend uploads to Supabase Storage
   ↓
3. MIVAA API creates background job
   ↓
4. 14-Stage Processing Pipeline:
   - Stage 0A: Product Discovery (Claude/GPT-4o)
   - Stage 0B: Entity Discovery (Certificates, Logos, Specs)
   - Stage 1: Focused Extraction (product pages only)
   - Stage 2: Text Extraction (PyMuPDF4LLM)
   - Stage 3: Semantic Chunking
   - Stage 4: Text Embeddings (OpenAI 1536D)
   - Stage 5: Image Extraction
   - Stage 6: Image Analysis (Qwen Vision)
   - Stages 7-10: Multi-Vector CLIP Embeddings
   - Stage 11: Product Creation & Entity Linking
   - Stage 12: Entity Relationship Mapping
   - Stage 13: Quality Enhancement
   - Stage 14: Cleanup & Completion
   ↓
5. Real-time progress updates to frontend
   ↓
6. Results displayed in Materials Catalog
```

**API Endpoint:** `POST /api/rag/documents/upload`  
**Frontend Component:** `EnhancedPDFProcessor.tsx`  
**Documentation:** [pdf-processing-pipeline.md](pdf-processing-pipeline.md)

---

## 2. Search & Discovery Flow

**Purpose:** Find materials using text, images, or natural language

**User Journey:**
```
1. User enters search query or uploads image
   ↓
2. Frontend calls MIVAA search API
   ↓
3. Query processing:
   - Text: Generate embedding (OpenAI 1536D)
   - Image: Generate CLIP embedding (512D)
   - Natural language: AI query enhancement
   ↓
4. Multi-vector similarity search (pgvector)
   ↓
5. Results ranked by:
   - Relevance (40%)
   - Quality (30%)
   - Semantic similarity (20%)
   - Recency (10%)
   ↓
6. Optional AI re-ranking (Claude Sonnet 4.5)
   ↓
7. Results displayed with:
   - Product cards
   - Images
   - Metadata
   - Relevance scores
```

**API Endpoint:** `POST /api/rag/search`  
**Frontend Component:** `SearchHub.tsx`  
**Documentation:** [search-strategies.md](search-strategies.md)

---

## 3. Spatial Analysis Flow (Spaceformer) ✨ NEW

**Purpose:** AI-powered room layout optimization, material placement, and accessibility analysis

**User Journey:**
```
1. User uploads room image or provides URL
   ↓
2. User selects:
   - Room type (living room, bedroom, kitchen, etc.)
   - Analysis type (full, layout, materials, accessibility)
   - Optional: Room dimensions, preferences, constraints
   ↓
3. Frontend calls Spaceformer API
   ↓
4. Claude Vision (Sonnet 4.5) analyzes image:
   - Detects spatial features (windows, doors, furniture)
   - Analyzes room layout and dimensions
   - Identifies traffic patterns
   - Evaluates accessibility compliance
   ↓
5. AI generates recommendations:
   - Layout suggestions (furniture placement)
   - Material placements (flooring, walls, accents)
   - Accessibility improvements (ADA compliance)
   - Flow optimization (traffic patterns, bottlenecks)
   ↓
6. Results saved to database (spatial_analysis table)
   ↓
7. Frontend displays:
   - 3D visualization of suggestions
   - Confidence scores
   - Alternative placements
   - Detailed reasoning
   - Accessibility report
```

**API Endpoint:** `POST /api/spaceformer/analyze`  
**Frontend Service:** `spaceformerAnalysisService.ts`  
**AI Model:** Claude Sonnet 4.5 (Vision)  
**Database Table:** `spatial_analysis`

**Analysis Types:**
- **Full** - Complete analysis (all features)
- **Layout** - Furniture placement only (~2-3 seconds)
- **Materials** - Material selection and placement
- **Accessibility** - ADA compliance and barrier-free paths

**Use Cases:**
- Interior design planning
- Accessibility compliance verification
- Material selection for specific spaces
- Furniture layout optimization
- Traffic flow analysis
- Space utilization optimization

**Documentation:** [api-endpoints.md](api-endpoints.md#18-spaceformer-routes)

---

## 4. Data Import Flow

**Purpose:** Import materials from XML files or web scraping

**User Journey (XML Import):**
```
1. User uploads XML file
   ↓
2. Edge Function parses XML and detects fields
   ↓
3. AI suggests field mappings (Claude Sonnet 4.5)
   ↓
4. User reviews and confirms mappings
   ↓
5. Edge Function creates import job
   ↓
6. Python API processes job in batches:
   - Parse XML entries
   - Download images concurrently
   - Create products in database
   - Link images to products
   - Queue text processing (async)
   ↓
7. Job marked as completed
   ↓
8. Results displayed in Import History
```

**API Endpoint:** `POST /api/data-import/xml`  
**Frontend Component:** `DataImportHub.tsx`  
**Documentation:** [data-import-system.md](data-import-system.md)

---

## 5. 3D Designer Flow

**Purpose:** Interactive 3D room designer for material visualization

**User Journey:**
```
1. User accesses /designer route
   ↓
2. DesignerLayout loads with:
   - Asset Library Panel (materials, furniture)
   - 3D Canvas (React Three Fiber)
   - Properties Panel (object properties)
   - Toolbar (transform tools)
   ↓
3. User can:
   - Drag and drop materials/objects
   - Transform objects (move, rotate, scale)
   - Adjust room dimensions
   - Configure lighting
   ↓
4. Real-time 3D rendering with:
   - Camera controls (orbit, pan, zoom)
   - Grid snapping
   - Material previews
```

**Frontend Component:** `DesignerPage.tsx` → `DesignerLayout.tsx`
**Route:** `/designer`

---

## 6. Knowledge Base Flow

**Purpose:** Create and manage documentation with AI assistance

**User Journey:**
```
1. User creates new document or uploads PDF
   ↓
2. For text input:
   - User writes content in markdown editor
   - AI assistant provides suggestions
   - Auto-save with version history
   ↓
3. For PDF upload:
   - PyMuPDF extracts text
   - Content converted to markdown
   - User reviews and edits
   ↓
4. User attaches to products (optional)
   ↓
5. AI generates embeddings (OpenAI 1536D)
   ↓
6. Document saved to knowledge_base table
   ↓
7. Available in semantic search
```

**API Endpoint:** `POST /api/knowledge-base/documents`  
**Frontend Component:** `KnowledgeBaseHub.tsx`  
**Documentation:** [knowledge-base-implementation.md](knowledge-base-implementation.md)

---

## 7. Agent Chat Flow

**Purpose:** Interactive AI assistance for various tasks

**User Journey:**
```
1. User selects agent type:
   - PDF Processor
   - Search Assistant
   - Product Expert
   - Admin Helper
   ↓
2. User sends message (text, images, or PDF)
   ↓
3. Frontend calls agent-chat Edge Function
   ↓
4. Mastra Agent processes request:
   - Loads agent-specific prompt from database
   - Analyzes user input
   - Executes tools (search, PDF processing, etc.)
   - Generates response
   ↓
5. Response streamed to frontend
   ↓
6. User continues conversation
```

**Edge Function:** `agent-chat`  
**Frontend Component:** `AgentHub.tsx`  
**AI Model:** Claude Sonnet 4.5  
**Documentation:** [agent-system.md](agent-system.md)

---

## 8. VR World Generation Flow

**Purpose:** Generate explorable 3D worlds from interior design images

**User Journey:**
```
1. User generates interior design image via Agent
   ↓
2. User clicks "Generate VR" button on DesignCanvas
   ↓
3. AgentHub calls vrWorldService.generateVRWorld()
   ↓
4. Edge function (generate-vr-world) orchestrates:
   - Authenticates user
   - Debits credits (50 mini / 200 plus)
   - Inserts vr_worlds row (status: uploading)
   - Uploads design image to WorldLabs (signed URL)
   - Calls WorldLabs worlds:generate API
   - Polls operations endpoint with backoff (2s → 10s)
   - Extracts asset URLs (SPZ, GLB, panorama, thumbnail)
   - Updates vr_worlds row (status: completed)
   ↓
5. New assistant message added to chat with WorldViewer
   ↓
6. WorldViewer polls vr_worlds table for status
   ↓
7. On completion: Spark.js loads SPZ and renders 3D scene
   ↓
8. User explores world:
   - Orbit mode: drag to rotate, scroll to zoom
   - First-person mode: WASD to move, mouse to look
   - Quality selector: Draft / Standard / Full
   - Fullscreen toggle
```

**Edge Function:** `generate-vr-world`
**Frontend Component:** `WorldViewer.tsx`
**Service:** `vrWorldService.ts`
**External API:** WorldLabs Marble (`marble-0.1-mini`, `marble-0.1-plus`)
**Documentation:** [vr-world-generation.md](vr-world-generation.md)

---

## 📊 Flow Summary

| Flow | Entry Point | AI Models | Processing Time | Output |
|------|-------------|-----------|-----------------|--------|
| PDF Processing | Upload PDF | Claude, GPT-4o, Qwen | 2-10 min | Products, Images, Metadata |
| Search | Search query | OpenAI, Claude | <1 sec | Ranked results |
| **Spaceformer** ✨ | **Room image** | **Claude Vision** | **2-5 sec** | **Layout, Materials, Accessibility** |
| Data Import | Upload XML | Claude | 1-5 min | Products, Images |
| 3D Generation | Text prompt | Stable Diffusion | 10-30 sec | 3D models, Images |
| Knowledge Base | Create doc | OpenAI | <1 sec | Searchable docs |
| Agent Chat | Send message | Claude | 1-3 sec | AI responses |
| **VR World** ✨ | **Generate VR button** | **WorldLabs Marble** | **30s-5min** | **Explorable 3D world** |

---

**Last Updated:** December 3, 2025  
**Version:** 2.4.0  
**Status:** Production

