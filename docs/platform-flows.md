# Platform Flows & User Workflows

Complete guide to all user workflows and feature flows in the Material Kai Vision Platform.

---

## 📋 Table of Contents

1. [PDF Processing Flow](#1-pdf-processing-flow)
2. [Search & Discovery Flow](#2-search--discovery-flow)
4. [Data Import Flow](#4-data-import-flow)
5. [3D Generation Flow](#5-3d-generation-flow)
6. [Knowledge Base Flow](#6-knowledge-base-flow)
7. [Agent Chat Flow](#7-agent-chat-flow)
8. [VR World Generation Flow](#8-vr-world-generation-flow) ✨ NEW

---

## 1. PDF Processing Flow

**Purpose:** Transform material catalog PDFs into searchable, intelligent knowledge

**User Journey:**
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
   - Stage 4: Text Embeddings (Voyage AI 1024D)
   - Stage 5: Image Extraction
   - Stage 6: Image Analysis (Qwen Vision)
   - Stages 7-10: Multi-Vector SLIG 768D Embeddings (5 types) + Voyage 1024D understanding
   - Stage 11: Product Creation & Entity Linking
   - Stage 12: Entity Relationship Mapping
   - Stage 13: Quality Enhancement
   - Stage 14: Cleanup & Completion
   ↓
5. Real-time progress updates to frontend
   ↓
6. Results displayed in Materials Catalog

**API Endpoint:** `POST /api/rag/documents/upload`
**Frontend Component:** `EnhancedPDFProcessor.tsx`
**Documentation:** [pdf-processing-pipeline.md](pdf-processing-pipeline.md)

---

## 2. Search & Discovery Flow

**Purpose:** Find materials using text, images, or natural language

**User Journey:**
1. User enters search query or uploads image
   ↓
2. Frontend calls MIVAA search API
   ↓
3. Query processing:
   - Text: Generate embedding (Voyage AI 1024D)
   - Image: Generate SLIG embedding (768D)
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

**API Endpoint:** `POST /api/rag/search`
**Frontend Component:** `SearchHub.tsx`
**Documentation:** [search-strategies.md](search-strategies.md)

---

## 4. Data Import Flow

**Purpose:** Import materials from XML files or web scraping

**User Journey (XML Import):**
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

**API Endpoint:** `POST /api/data-import/xml`
**Frontend Component:** `DataImportHub.tsx`
**Documentation:** [data-import-system.md](data-import-system.md)

---

## 5. 3D Designer Flow

**Purpose:** Interactive 3D room designer for material visualization

**User Journey:**
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

**Frontend Component:** `DesignerPage.tsx` → `DesignerLayout.tsx`
**Route:** `/designer`

---

## 6. Knowledge Base Flow

**Purpose:** Create and manage documentation with AI assistance

**User Journey:**
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
5. AI generates embeddings (Voyage AI 1024D)
   ↓
6. Document saved to knowledge_base table
   ↓
7. Available in semantic search

**API Endpoint:** `POST /api/knowledge-base/documents`
**Frontend Component:** `KnowledgeBaseHub.tsx`
**Documentation:** [knowledge-base-implementation.md](knowledge-base-implementation.md)

---

## 7. Agent Chat Flow

**Purpose:** Interactive AI assistance for various tasks

**User Journey:**
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

**Edge Function:** `agent-chat`
**Frontend Component:** `AgentHub.tsx`
**AI Model:** Claude Sonnet 4.5
**Documentation:** [agent-system.md](agent-system.md)

---

## 8. VR World Generation Flow

**Purpose:** Generate explorable 3D worlds from interior design images

**User Journey:**
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
| Data Import | Upload XML | Claude | 1-5 min | Products, Images |
| 3D Generation | Text prompt | Stable Diffusion | 10-30 sec | 3D models, Images |
| Knowledge Base | Create doc | OpenAI | <1 sec | Searchable docs |
| Agent Chat | Send message | Claude | 1-3 sec | AI responses |
| **VR World** ✨ | **Generate VR button** | **WorldLabs Marble** | **30s-5min** | **Explorable 3D world** |
| **Flow Automation** ✨ | **Admin flow canvas** | **Claude (actions)** | **Real-time** | **Automated actions** |
| **Interior Video** ✨ | **Video type + image** | **Veo-2/Kling/Wan/Runway** | **1-5 min** | **MP4 video** |
| **Virtual Staging** ✨ | **Empty room image** | **Replicate proplabs** | **~56s** | **Furnished render** |
| **Social Publish** ✨ | **Post content + account** | **Claude + Late.dev** | **<5s** | **Published post** |
| **Background Agent** ✨ | **Cron / event / manual** | **Claude + MIVAA API** | **Varies** | **Enriched data** |

---

## 9. Flow Automation Flow

**Purpose:** Execute multi-step automated workflows in response to triggers

**User Journey (Cron-triggered flow):**
1. Admin builds flow on xyflow canvas at `/admin/flows`
   ↓
2. Flow saved to `flows` table (nodes + edges JSON)
   ↓
3. `flow-scheduler-cron` (every minute) detects flow is due
   ↓
4. Invokes `flow-engine` with `action: 'execute-flow'`
   ↓
5. Engine walks the graph:
   - Trigger node: extracts input data
   - Condition nodes: evaluate if_else / switch / filter
   - Action nodes: send SMS, send email, HTTP call, create notification
   ↓
6. Execution result written to `flow_runs`

**User Journey (Webhook-triggered flow):**
1. External system POSTs to `flow-webhook?flow_id=<uuid>`
   ↓
2. Payload passed as `trigger.data` to `flow-engine`
   ↓
3. Same graph execution as above

**Edge Functions:** `flow-engine`, `flow-scheduler-cron`, `flow-webhook`
**Frontend Component:** Flow canvas at `/admin/flows`
**Documentation:** [flow-engine.md](flow-engine.md)

---

## 10. Social Media Publishing Flow

**Purpose:** Generate and publish AI content to social platforms

**User Journey:**
1. User connects social account at `/profile` (Social Accounts tab)
   ↓
2. `late-oauth` redirects to Late.dev OAuth → returns `late_account_id`
   ↓
3. Account stored in `social_accounts`
   ↓
4. User (or KAI agent) generates content:
   - Caption: `generate-social-content` (2cr) → 3 variants
   - Image: `generate-social-image` (5-10cr) → stored in Supabase Storage
   - Video: `generate-social-video` (15-30cr) → stored in Supabase Storage
   ↓
5. User selects caption variant + media → clicks Publish or Schedule
   ↓
6. `late-publish` action: `publish_now` or `schedule` with `scheduled_at`
   ↓
7. Late.dev publishes to connected platform
   ↓
8. `late-analytics` syncs engagement metrics back to `social_post_analytics`

**Edge Functions:** `late-oauth`, `generate-social-content`, `generate-social-image`, `generate-social-video`, `late-publish`, `late-analytics`
**Admin UI:** `/admin/social-media/accounts`
**Documentation:** [social-media-system.md](social-media-system.md)

---

**Last Updated:** March 2026
**Version:** 3.5.0
**Status:** Production
