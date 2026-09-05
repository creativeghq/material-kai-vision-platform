# Material KAI Vision Platform — Full Business & Product Overview

**Confidential | For Investor & Partner Use**
*Version 3.5 — March 2026*

---

## Executive Summary

Material KAI Vision Platform is an AI-powered B2B SaaS platform for the architecture, interior design, and construction materials industry. It transforms the way professionals discover, specify, visualize, and procure building materials — replacing static PDF catalogs and fragmented manual searches with a unified intelligent platform powered by a focused AI stack: Anthropic-only vision (Claude Opus 5 via tool use), Claude Sonnet 5 chunking, Claude Haiku 4.5 classifiers, Voyage AI embeddings, SigLIP2 visual embeddings, PaddleOCR-VL layout + OCR backbone (Modal-hosted), plus Replicate/Gemini/xAI/WorldLabs/Kling for generation.

The platform serves **5,000+ active users** across three professional groups: buyers (architects, designers, sourcing agents), suppliers (manufacturers, brands), and platform operations. It is live in production at **materialshub.gr** with 99.5%+ uptime, 10,000+ cataloged products, and 1,000+ processed PDFs.

**Core value propositions:**
- For **buyers**: Find the exact material — by look, feel, specification, image, or natural language — in seconds instead of hours. Then visualize it in a 3D interior design, walk through a VR version of the room, and request a quote — all within one platform.
- For **suppliers/manufacturers**: Automatically digitize your entire catalog from a single PDF upload. Get real-time visibility into who is searching for your products, what the market trends are, and receive qualified enquiries directly.
- For **the platform**: A credit-based consumption model tied directly to AI feature usage, Stripe-powered with volume discounts, layered over a marketplace that creates strong network effects as both sides grow.

---

## The Problem

The architecture, interior design, and construction materials industry is a massive, globally fragmented market still running largely on PDFs, trade fairs, and manual outreach.

**Pain for buyers (architects, interior designers, sourcing agents):**
- Finding the right material means searching across hundreds of manufacturer PDFs, websites, and physical showrooms — each with different formats, terminology, and cataloging standards
- No cross-manufacturer visual search exists: "find me something that looks like this image" is impossible in any current tool
- Specification-based search ("slip-resistant matte ceramic, 30×60cm, suitable for external use") requires manual page-by-page reading
- No structured workflow from inspiration → specification → quote → project tracking exists in one tool
- Design visualization requires separate tools (Photoshop, Revit, SketchUp) — completely disconnected from the material catalog

**Pain for manufacturers and suppliers:**
- PDF catalogs are invisible to search engines and AI systems
- No visibility into buyer interest: who viewed what, which products are trending
- No competitive price intelligence without manual monitoring
- No structured digital channel for receiving and managing qualified enquiries
- Maintaining a web presence requires constant manual effort per product

---

## The Solution

Material KAI Vision Platform closes this gap with a fully integrated AI platform that handles the complete lifecycle:

```
Manufacturer uploads PDF → AI extracts, understands & indexes all products
          ↓
Buyer searches by text, image, color, texture, or specification
          ↓
AI agents explain, compare & recommend materials from the catalog
          ↓
Interior Designer agent generates room visualizations using those materials
          ↓
VR generation turns any design into a walkable 3D world (in-browser)
          ↓
Buyer saves materials to Moodboards → builds a Quote → tracks the project
          ↓
Manufacturer sees who is interested, manages enquiries, tracks market trends
```

Every step — ingestion, search, design, visualization, procurement — runs on the same platform, creating a flywheel: more suppliers → richer catalog → better search results → more buyers → more enquiries → more suppliers.

---

## Platform Architecture

| Layer | Technology | Hosting |
|-------|-----------|---------|
| Frontend | React 18 + TypeScript + Vite + Shadcn/UI | Vercel Edge Network (global CDN) |
| Backend API | FastAPI + Python 3.11 (MIVAA service) | Dedicated server (DigitalOcean) |
| Database | Supabase PostgreSQL 15 + pgvector 0.8.0 | Supabase managed cloud |
| Edge Functions | 30+ Deno/TypeScript functions | Supabase managed cloud |

**Production URLs:**
- Platform: `materialshub.gr`
- API: `v1api.materialshub.gr`
- API Docs: `v1api.materialshub.gr/docs`

**Scale characteristics:**
- Frontend served via Vercel global edge — zero latency regardless of user geography
- Backend handles unlimited async job queue with checkpoint-based recovery
- Database uses connection pooling and optimized halfvec (float16) vector indexes
- 170+ API endpoints, 20 categories, 60+ Supabase Edge Functions, fully documented via OpenAPI/Swagger

---

## AI & Intelligence Layer

The platform's core differentiator is not a single AI model — it is the orchestration of **20+ AI models** deeply embedded into every layer: ingestion, enrichment, search, agent interactions, design generation, and analytics.

### Full AI Model Stack

| Provider | Model | Role | Cost |
|----------|-------|------|------|
| Anthropic | Claude Opus 5 | Jarvis agent, deep product analysis, metadata extraction, B2B research | $15 input / $75 output per 1M tokens |
| Anthropic | Claude Haiku 4.5 | Fast classification, content detection, B2B web search | $0.80 input / $4 output per 1M tokens |
| OpenAI | GPT-4o | Alternative product discovery, multimodal tasks | $2.50 input / $10 output per 1M tokens |
| OpenAI | GPT-4o-mini | Query intent parsing, lightweight operations | $0.15 input / $0.60 output per 1M tokens |
| Voyage AI | voyage-4 (1024D) | Primary text embeddings + understanding embeddings | $0.06 per 1M tokens |
| Anthropic | Claude Opus 5 (vision_analysis) | Image analysis, material recognition — sole vision pass post-2026-05-01, schema-locked via `VisionAnalysis` Pydantic + `VISION_ANALYSIS_TOOL` | Anthropic API |
| Modal | PaddleOCR-VL (`PaddlePaddle/PaddleOCR-VL-1.6`, 0.9B) | Layout + OCR backbone (sole engine post-2026-06-13) — two-stage parser (PP-DocLayoutV3 RT-DETR detector + 0.9B VLM), run as Stage 1 before discovery. Per-attempt metrics in `paddleocr_metrics`. Failure marker: `OCRResult.method='paddleocr_failed'`; `ocr_engine='paddleocr'`. Replaced Surya-2 (which had replaced YOLO + Chandra + `merge_layout`). | Modal endpoint (GPU L4, scale-to-zero) |
| Modal | SLIG SigLIP2 (768D × 5 types) | Visual / color / texture / style / material embeddings | Modal endpoint (scale-to-zero; moved off HuggingFace 2026-06-14) |
| Replicate | FLUX.1-dev, FLUX.1-schnell, SDXL, SD3, Playground v2.5, Kandinsky 2.2, Proteus v0.2 | Text-to-image interior design generation | Per image |
| Replicate | ComfyUI Interior Remodel, Interiorly Gen1 Dev, Designer Architecture + 4 others | Image-to-image interior transformation | Per image |
| Replicate | proplabs/virtual-staging | AI room staging from empty photos | 20 credits/run |
| Replicate | Wan 2.1 i2v 720p, Runway Gen4 Turbo | Interior video generation (budget + premium) | 12/40 credits |
| Replicate | meta/sam-2, ali-vilab/anydoor | Pixel-precise mask generation, product placement | Per use |
| WorldLabs | Marble mini + plus | 3D Gaussian Splat VR world generation | 50/200 credits per world |
| Google Gemini | gemini-3.1-flash-image-preview, gemini-3-pro-image-preview | Interior image generation (4 modes) | 6/15 credits |
| xAI (Grok) | grok-2-aurora | Masked inpainting for region editing, social images | 10–20 credits |
| Kling | kling-v3.0 | Interior + social video generation | 20 credits |

### 7-Vector Embedding Fusion — The Search Backbone

Every product in the catalog is represented by **7 distinct AI embedding vectors**, enabling multi-dimensional similarity search. All stored as `halfvec` (float16) — 50% storage cost reduction, zero accuracy loss:

| Embedding Type | Dimensions | Model | What It Powers |
|----------------|-----------|-------|----------------|
| Text | 1024D | Voyage AI voyage-4 | Natural language + keyword search |
| Visual | 768D | SigLIP2 | "Find materials that look like this photo" |
| Color | 768D | SigLIP2 | Color palette matching |
| Texture | 768D | SigLIP2 | Surface texture similarity |
| Style | 768D | SigLIP2 | Design aesthetic matching |
| Material | 768D | SigLIP2 | Material type / composition classification |

Search results are fused dynamically using **7 query-adaptive weight profiles**. The system infers query intent and automatically adjusts how much each embedding type contributes to the final ranking. No competitor in the materials space currently operates at this level of search sophistication.

---

## Complete Feature Set

### Feature 1 — Catalog Ingestion (Three Methods)

**A. PDF Processing Pipeline (14 Stages)**

The primary ingest path. A supplier uploads a product catalog PDF. The platform automatically:

1. Discovers all products using Claude Haiku (fast boundary detection) + Claude Opus (metadata enrichment) — **95%+ detection accuracy**
2. Extracts text with PyMuPDF4LLM (structure-preserving)
3. Semantic chunking via Anthropic API (800 token max, 100 overlap)
4. Generates text + understanding embeddings via Voyage AI
5. Extracts all images from product pages
6. Runs Claude Opus 5 vision_analysis (Anthropic tool use, schema-locked via `VisionAnalysis` Pydantic + `VISION_ANALYSIS_TOOL`) on every image — identifies material type, surface properties, finishes, dimensions visible, color palette. Pre;
7. Generates all 5 SigLIP2 visual embedding types per image
8. Extracts 200+ metadata fields per product (dimensions, material composition, certifications, weight, finish, slip resistance, etc.)
9. PaddleOCR-VL layout detection + OCR (Modal-hosted, structure-first Stage 1) localizes regions, labels them, predicts reading order, and reads text/tables→markdown/formulas→LaTeX inside each region
10. Creates fully searchable product records with all embeddings linked

| PDF Size | Products Extracted | Processing Time |
|----------|-------------------|----------------|
| Small (1–20 pages) | 1–5 | 1–2 min |
| Medium (21–50 pages) | 6–15 | 2–4 min |
| Large (51–100 pages) | 16–30 | 4–8 min |
| Extra Large (100+ pages) | 30+ | 8–15 min |

**9 recovery checkpoints** — failure at any stage resumes from the last checkpoint, not from scratch.

**B. Web Scraping**
Automatic product discovery from manufacturer websites via Firecrawl. Discovers product pages, extracts structured data, and runs the same full AI enrichment pipeline.

**C. XML Import**
Structured data import with AI-powered field mapping (Claude Opus). Supports recurring scheduled imports, batch processing (10 products at a time, 5 concurrent image downloads), and checkpoint recovery.

---

### Feature 2 — Multi-Modal AI Search

Six search strategies, all available simultaneously with results merged and deduplicated:

| Strategy | Mechanism | Best For | Accuracy | Response Time |
|----------|-----------|----------|----------|---------------|
| Semantic | Natural language → text embeddings (1024D) | "sustainable natural stone for wet areas" | 85%+ | <150ms |
| Vector | Pure cosine similarity | Precise technical lookups | 88%+ | <100ms |
| Multi-Vector (7-fusion) | All 7 embeddings, adaptive weights | Complex multi-attribute queries | 90%+ | <200ms |
| Hybrid | Semantic (70%) + PostgreSQL full-text (30%) | Technical product names and codes | 90%+ | <180ms |
| Material Property | JSONB filter on 200+ metadata fields | Specification-driven sourcing | 95%+ | <50ms |
| Visual / Image Upload | Photo → SigLIP2 embedding → cosine similarity | Inspiration-to-specification workflow | 88%+ | <150ms |
| All Combined | All 6 in parallel, merged + ranked | Maximum coverage | Best overall | <800ms |

After retrieval, a secondary AI re-ranking pass scores results on visual, understanding, relevance, and material dimensions — surfacing the most contextually relevant products even when they don't exactly match keywords.

**Saved Searches with AI Deduplication:** Users can save search queries. Claude Haiku automatically detects near-duplicate saved searches (85–95% semantic similarity threshold) and offers to merge them, keeping the search library clean.

---

### Feature 3 — Agent Hub (Three AI Agents)

The Agent Hub (`/agent-hub`) is the conversational AI interface with memory, multi-turn context, image uploads, and tool-use.

**Jarvis — Primary Material Intelligence Agent**
Model: Claude Opus 5 | LangGraph + Supabase checkpointer (conversations resume across sessions)

Tools available to all authenticated users:
- `material_search` — 7-vector fusion search across the catalog, with **Explainable Search Spec** (structured interpretation of query across color/material/style/texture/specification dimensions, displayed as a collapsible card above results)
- `knowledge_base_search` — RAG over the workspace knowledge base
- `visual_search` — automatic image-to-material matching when images are attached
- `analyze_inspiration_url` — **Design Inspiration URL Finder**: scrape any design URL (Houzz, Pinterest, Dezeen, ArchDaily, manufacturer sites) → extract design tokens (colors, materials, textures, styles) → search catalog for matching products. Accessible via a Globe icon button in the chat toolbar that opens a dedicated modal.

Tools gated to Admin/Owner only:
- `b2b_manufacturer_search` — live web search via Anthropic's built-in `web_search_20250305` tool. CEE queries include native-language terms (Polish, Czech, Slovak, etc.)
- `company_website_scrape` — scrapes manufacturer websites via Firecrawl
- `company_enrichment` — enriches company records via Apollo.io
- `contact_discovery` — Hunter.io with Apollo.io fallback
- `email_validate` — ZeroBounce email validation before outreach
- `save_to_crm` — saves enriched company and contact data
- `seo_keyword_research`, `seo_article_planner`, `seo_article_writer`, `seo_content_analyzer`, `create_seo_article` — full SEO content pipeline
- Sub-agents: `research_analysis`, `analytics_analysis`, `business_analysis`, `product_analysis`

**Interior Designer Agent**
Model: Claude Opus 5 | Focused on spatial design and visualization

- Analyzes room photos: layout, dimensions, natural light, spatial relationships, accessibility compliance
- Generates interior design images (text prompt or image reference) — see Feature 4
- Matches generated designs back to real catalog materials using 7-vector search
- Estimates project costs based on matched materials and dimensions
- Generates explorable 3D VR worlds from any design image — see Feature 5
- `analyze_inspiration_url` — paste a design URL to extract materials, colors, and styles and find matching catalog products

**Demo Agent**
Model: Claude Haiku 4.5 | Platform showcases and sales demonstrations. Admin-only.

---

### Feature 4 — Interior Design Generation Suite

The Interior Designer agent generates photorealistic interior design images and videos through **four distinct AI generation systems**:

---

**A. Replicate Text-to-Image (14 models, run in parallel)**

| Mode | Models |
|------|--------|
| Text-to-Image | FLUX.1-dev, FLUX.1-schnell, SDXL, SD3, Playground v2.5, Kandinsky 2.2, Proteus v0.2 (7 variations output simultaneously) |
| Image-to-Image | ComfyUI Interior Remodel, Interiorly Gen1 Dev, Designer Architecture + 4 others |

**B. Gemini Interior Generation (4 modes)**

| Mode | Description | Credits |
|------|-------------|---------|
| Text-to-Image | Narrative prompt → photorealistic room render | 6 (flash) / 15 (4K pro) |
| Image Edit | Existing room + instruction → transformed image | 6 / 15 |
| Floor Plan Render | 2D floor plan → photorealistic perspective interior | 6 / 15 |
| Floor Plan Diagram | Text description → 2D floor plan layout | 6 / 15 |

The Gemini system uses a two-step style-transfer pipeline — an inspiration image is analyzed by Gemini Vision into a structured design specification, which is then used to edit the target room. This prevents spatial "bleed" (the inspiration image never directly influences the generated geometry) and produces far more accurate style transfers than naive image-to-image approaches.

**C. Virtual Staging (with Before/After QA)**

Empty room photos → furnished renders via Replicate `proplabs/virtual-staging` (~56 seconds). 8 room types, 8 furniture styles. 20 credits per run. Accessible as both a standalone tool and a JARVIS agent tool.

Virtual staging results now include a **before/after comparison viewer** (`VirtualStagingViewer` component) with an interactive slider that lets users drag between the original empty room and the staged result. An "Analyze Quality" button triggers a Claude Vision assessment of the staging quality — evaluating lighting consistency, perspective accuracy, furniture scale, material realism, and edge blending — each scored 1–10.

**D. Region Editing (Masked Inpainting)**

Users paint a zone over any room image using the `RegionEditCanvas` tool. SAM 2 (Replicate `meta/sam-2`) generates a pixel-perfect binary mask from drawn hints. Grok Aurora then regenerates only the painted area based on a text prompt (20 credits). For product-specific placement, AnyDoor (`ali-vilab/anydoor`) places a real product photo into the masked zone with accurate lighting adaptation.

---

**Generation workflow (full):**
1. User describes room style or uploads reference via Interior Designer agent
2. Platform runs parallel generation (multiple models, multiple variations)
3. All outputs permanently stored in Supabase Storage
4. Agent runs 7-vector material matching on generated image — surfacing real catalog products that match
5. Agent presents cost estimates based on matched materials and room dimensions
6. User can: generate VR world, create video walkthrough, stage an empty room, or region-edit any element
7. All generations are credit-billed per operation

**E. Interior Video Generation**

Any design image can become a video via four AI models:

| Model | Credits | Best For |
|-------|---------|----------|
| Veo-2 (Google) | 30 | Cinematic walkthroughs, floor-plan flythroughs |
| Kling v3.0 | 20 | Product spotlights, before/after reveals, social reels |
| Wan 2.1 i2v 720p | 12 | Budget general-purpose |
| Runway Gen4 Turbo | 40 | Premium quality |

Video type auto-selects the optimal model. Supports 16:9, 9:16, 1:1 aspect ratios. Async polling for long renders (Veo, Runway) with `job_id` polling pattern.

---

### Feature 5 — VR World Generation (WorldLabs Marble + Spark.js)

Any interior design image — AI-generated or user-uploaded — can be turned into a fully **explorable 3D world** inside the browser. No app, no plugin, no external tool required.

**End-to-end flow:**
1. User clicks "Generate VR" on any design image in the agent chat
2. Selects model tier (mini for quick preview, plus for high-fidelity final)
3. Supabase Edge Function uploads the image to WorldLabs Marble API and triggers world generation
4. Platform polls for completion status, stores all asset URLs in the `vr_worlds` database table
5. WorldViewer component renders the 3D Gaussian Splat inline in the chat via Spark.js (Three.js-based, code-split, ~496KB)
6. The world persists in the database — reloads instantly in future sessions

**Model tiers:**

| Model | Credits | Generation Time | Best For |
|-------|---------|----------------|---------|
| marble-1.1 | 190 credits | ~5 minutes | High-fidelity final walkthroughs |

Credits are refunded automatically on generation failure.

**Output assets per world:**
- Gaussian Splat SPZ files at 3 quality levels: 100k (draft), 500k (standard), full
- Collider GLB (collision mesh for first-person physics)
- 360° panorama equirectangular image
- Thumbnail preview
- AI-generated scene caption

**Navigation controls:**

| Mode | Controls |
|------|---------|
| Orbit (default) | Drag to rotate · Scroll to zoom · Right-click drag to pan |
| Walk (first-person) | WASD to move · Mouse look · Shift for speed boost |

**Business value of VR worlds:**
An architect can go from finding a tile in the catalog → generating a room design with that tile → walking through a VR version of that room → requesting a quote — all in one session on one platform. No competitor offers this workflow. VR generation is also a strong upsell moment: mini worlds generate impulse purchases, plus worlds are high-margin repeat purchases for client presentations.

---

### Feature 6 — Moodboards

Visual material collections that serve as both a design tool and a social/portfolio layer.

**Private workspace use:**
- Create named boards and organize materials from search, agents, or the catalog
- Add materials directly from search results or agent chat output
- Feed a moodboard directly into a Quote (materials pre-populated)
- Notes and descriptions per board
- Export for client presentations

**Public portfolio use (marketplace layer):**
- Any board can be made public — visible on the user's public profile (`/u/:userId`)
- Public boards appear in the Discover directory for other users to browse
- Visitors can comment on public boards (social engagement layer)
- One board can be "featured" — pinned to the profile header as a visual portfolio piece with a full-width image preview

**As a conversion funnel:**
Moodboards are a key step in the discovery-to-quote journey. A designer explores materials → builds a board as a design brief → shares it with a client → client requests a quote on specific items from the board → supplier receives a structured enquiry. The board functions as the visual brief.

---

### Feature 7 — Professional Marketplace

A B2B talent and services marketplace built on top of the platform, enabling professionals to be discovered, followed, and hired.

**The vision:** As the platform grows, it becomes not just a material catalog but the professional network for the design and construction industry. A manufacturer searching for a trusted sourcing agent in a new market, or an architect looking to collaborate with a sustainability consultant, finds and contacts them through the same platform they use daily for material sourcing.

**Public Profiles** (`/u/:userId`) — opt-in (`is_public = true`):

| Section | Detail |
|---------|--------|
| Identity | Name, company, bio, avatar, location, website, professional type badge |
| Skills & Expertise | Free-form skill tags (e.g., "Biophilic Design", "LEED Certified", "CEE Material Sourcing") |
| Services | Rich listings: name, description, price range, previous work portfolio with links |
| Preferred Factories | Curated list of trusted manufacturers the professional works with |
| Featured Moodboard | Pinned visual portfolio piece with full image preview |
| All Public Moodboards | Grid of public boards with previews and comment sections |
| Social | Follow/unfollow, profile view counter, Hire Me CTA button |

**Hire Me Flow:**
1. Visitor clicks "Hire Me" or "Hire" on a specific service card
2. Modal opens with optional service pre-selection
3. Visitor fills in name, email, message
4. Filed in the unified Inbox as a conversation tagged **Public profile**
   (`inbox_threads.metadata.source = 'public_profile'`), owned by the professional — so it can be
   replied to, assigned, labelled and archived like any other. There is no separate contact-request
   table; see [professional-marketplace.md](professional-marketplace.md)
5. `hire_me_received` flow event emitted → triggers configurable automation (email, Slack, CRM)
6. Platform tracks service interest per professional in analytics

**Discover Directory** (`/discover`):
- Grid of all public profiles, sorted by profile views
- Real-time search: name, company, bio, services, skills, location
- Dynamic tag filtering: professional type, services, skill tags
- Follow button per card
- Follower counts as social proof signal
- Up to 60 profiles displayed

**Supported professional types:**
Designer, Interior Designer, Architect, Manufacturer, Brand, Supplier, Sourcing Agent, Consultant

**Monetization pathway (current → planned):**

| Phase | Model |
|-------|-------|
| Now | Free — building network density and liquidity |
| Near-term | Featured listing placements (suppliers/professionals pay to appear higher) |
| Near-term | Verified badge subscription (trust signal for buyers) |
| Longer-term | Lead generation packages for suppliers (qualified buyer contact access) |
| Longer-term | Transaction fee on Hire Me requests (% of project value or flat fee per connected lead) |

---

### Feature 8 — Quotes & Project Management

A complete B2B procurement workflow from material selection to project delivery tracking.

**Buyer workflow:**
1. Build a quote cart — add products from search, agents, or moodboards
2. Per item: dimensions (width, height, sqm), quantities, notes
3. Submit quote request to the supplier
4. Review and accept/reject each upsell/extra individually
5. Accept the quote → project timeline auto-initializes
6. Track 9 predefined milestones from "Quote Accepted" to "Project Completed"

**Supplier/Admin workflow:**
1. View all incoming quote requests filtered by custom status tag
2. Assign color-coded status tags (6 system defaults + unlimited custom)
3. Attach upsells and extras with pricing
4. Monitor which extras the buyer accepted/rejected
5. Update project timeline milestones with notes per step
6. Manage Upsells library and Timeline Steps configuration

**Quote lifecycle:** Auto-expire after 30 days of inactivity. Any user action resets the timer. Activity tracking = quote remains active during active projects.

**Database:** 8 tables — `quotes`, `quote_items`, `status_tags`, `upsells`, `quote_upsells`, `timeline_steps`, `quote_timeline`, `system_settings`.

---

### Feature 9 — Price Monitoring

Competitive intelligence for the materials market:
- Track competitor prices across multiple sources on configurable schedules (hourly, daily, weekly, on-demand)
- Price history database with trend visualization
- Configurable price alerts when prices cross defined thresholds
- Competitor source management (add/remove monitored sources)
- Statistics: min/max/average price trends per product category

Particularly valuable for verified manufacturer/brand users who need competitive pricing intelligence without manual monitoring.

---

### Feature 10 — Knowledge Base & RAG

Document-level intelligence beyond product catalogs:
- Upload spec sheets, technical guidelines, research papers, compliance documents
- AI semantic chunking with quality scoring (0–1 scale)
- Hash-based + semantic deduplication (85–95% threshold)
- Chunk relationship mapping (semantic, sequential, hierarchical)
- 200+ metadata fields extracted per chunk
- Queried live by Jarvis agent for context-aware answers with source attribution
- Full admin view with quality indicators

---

### Feature 11 — Flow Builder & Automation

**Flow Builder** — visual no-code automation engine:

Trigger events include: `hire_me_received`, `profile_followed`, `profile_published`, `quote_requested`, `quote_approved`, `moodboard_shared`, `moodboard_commented`, `material_reviewed`, `user_signup`, `search_executed`, `model_3d_created`, `vr_world_created`, and scheduled (cron).

Actions: send email (Resend), Slack notification, call webhook, trigger AI agent, create CRM record.

**Background Agent Framework** — autonomous long-running AI tasks:
- Product Enrichment Agent: continuously enriches catalog products with AI metadata
- Material Tagger Agent: auto-tags materials with structured labels
- Extensible: new agents implemented via `AgentRunner` interface
- Auto-recovery: tasks stuck >8 minutes re-dispatched automatically (up to 3 retries)
- Chain triggers: agents can trigger subsequent agents on completion
- Full run history, log viewer, manual trigger from admin panel

---

### Feature 12 — Social Media Suite

AI-powered social media content generation and cross-platform publishing via Zernio:

**Content Generation:**
- **Captions**: Claude generates 3 variants per platform (Instagram, Facebook, LinkedIn, TikTok, Pinterest, YouTube, Twitter, Threads), each respecting character limits, hashtag conventions, and platform tone. 2 credits.
- **Images**: Auto-routed by content type — xAI Aurora for lifestyle/people (10cr), Gemini Imagen for product/interior (5cr), FLUX Dev for artistic/textured (6cr). 1:1, 4:5, 9:16, 16:9 aspect ratios.
- **Videos**: Kling 1.6 Pro (15cr, fast) or Veo-2 (30cr, premium) for short-form social videos. Async polling for longer renders.

**Publishing (Zernio):**
- Users connect Instagram, Facebook, LinkedIn, TikTok, Pinterest, YouTube, Twitter, or Threads via OAuth at their profile settings page
- Accounts are per-user (not per workspace — each professional manages their own presence)
- Publish immediately or schedule for a future datetime
- No credit cost for publishing — uses the workspace's Zernio subscription
- Engagement metrics (likes, comments, shares, reach) synced back to local database via `zernio-api`
- Best posting time recommendations per platform

**Business value for the platform:**
Professionals using Material KAI to design rooms and source materials can publish their work directly to social media without leaving the platform. Every post is a word-of-mouth marketing event for the platform, driving organic discovery. The social suite also creates a natural upsell moment — from free content generation into higher-tier credit packages.

---

### Feature 13 — Email System & Campaigns

Full transactional and campaign email infrastructure via Resend:
- Domain verification and management
- React Email templates with personalization
- Per-recipient tracking: sent, delivered, opened, clicked, bounced
- Bounce/complaint handling via Resend webhooks (`email-webhooks`, Svix `whsec_` signature)
- **Campaign system**: bulk email campaigns with audience targeting, scheduling, real-time delivery analytics
- Admin dashboard at `/admin/emails`

---

### Feature 14 — CRM (Companies & Contacts)

Built-in CRM for managing supplier and manufacturer relationships:
- Company records: name, website, industry, country, Apollo.io enrichment data
- Contact records: email (ZeroBounce validated), linked to companies
- Records created directly from B2B manufacturer research agent
- Full CRUD API: company management, contact management, association management

---

### Feature 15 — Admin Dashboard

Full platform operations suite at `/admin`:

| Section | Purpose |
|---------|---------|
| Platform Overview | Cross-workspace analytics, user metrics, hire request funnel, rating distributions |
| PDF Processing Monitor | Real-time job tracking with 9 checkpoint stages, error logs, retry controls |
| Analytics | Search patterns, processing stats, AI model usage, cost tracking, agent chat quality ratings |
| AI Monitoring | Per-model usage, cost breakdown, performance trends, Sentry error integration |
| Knowledge Base | View/edit chunks, images, products with quality scores |
| Agent Configurations | Manage AI agent system prompts in real-time (no deployment needed) |
| Background Agents | Run history, logs, manual trigger, create/edit configurations |
| User Management | Workspace members, roles, permissions |
| Quotes | All quote requests with filtering and detail views |
| Status Tags | Custom color-coded quote status management |
| Upsells | Upsell library with pricing |
| Timeline Steps | Project milestone configuration |
| Email / Campaigns | Email domain management, template library, bulk campaign management |
| Flows | Visual flow builder |
| Push Notifications | Workspace-level push notification management |

---

### Feature 16 — Finance & Business Suite

A multi-tenant finance and business operations stack layered on the core AI catalog. See full docs in the finance cluster:

- **Greek e-invoicing (AADE/myDATA)** — per-tenant direct transmission via Novus connector (`docs/finance-system.md`). Each tenant uses their own issuer VAT and TaxisNet authorization. Replaced a platform-wide legacy ERP connector (removed 2026-06-07).
- **POS** — Two-panel cash register (`docs/pos-retail-system.md`)
- **Online Storefront** (`docs/online-storefront.md`)
- **Warehouse & Billing** (`docs/warehouse-and-billing.md`)
- **Sales Portal & Marketplace** (`docs/sales-and-marketplace.md`)
- **Multi-tenant Capabilities & Tenancy** (`docs/capabilities-and-tenancy.md`)
- **myAADE Module** — Auto-fill business profile from Greek ΑΦΜ via ΑΑΔΕ SOAP API. Cached 90 days per company. Admin UI at `/admin/modules/myaade`.

---

## User Segments, Roles & Access Control

### Four Functional Groups

| Group | Who | Key Privileges |
|-------|-----|----------------|
| **Standard (Buyers)** | Designers, Interior Designers, Architects, Sourcing Agents, Consultants, Other | Full search, agents, 3D generation, VR, moodboards, quotes, marketplace |
| **Verified Factory (Suppliers)** | Manufacturers, Brands, Suppliers with `factory_verified=true` | All above + Factory Analytics (own data + market trends) |
| **Admin / Owner** | `workspace_members.role` = admin or owner | All above + admin panel, B2B tools, SEO pipeline, sub-agents, cross-workspace analytics |
| **Unauthenticated** | Not logged in | Public profiles (`/u/:id`) only |

### Feature Access Matrix

| Feature | Standard | Verified Factory | Admin/Owner |
|---------|:---:|:---:|:---:|
| 7-vector material search | ✅ | ✅ | ✅ |
| Visual (image) search | ✅ | ✅ | ✅ |
| Jarvis agent (material + KB) | ✅ | ✅ | ✅ |
| Interior Designer agent | ✅ | ✅ | ✅ |
| 3D design generation | ✅ | ✅ | ✅ |
| VR world generation | ✅ | ✅ | ✅ |
| Moodboards | ✅ | ✅ | ✅ |
| Quotes & project tracking | ✅ | ✅ | ✅ |
| Discover directory | ✅ | ✅ | ✅ |
| Public profile (opt-in) | ✅ | ✅ | ✅ |
| Factory Analytics — own data | ❌ | ✅ | ✅ |
| Factory Analytics — market trends | ❌ | ✅ | ✅ |
| Platform-wide analytics | ❌ | ❌ | ✅ |
| B2B manufacturer research tools | ❌ | ❌ | ✅ |
| SEO content pipeline | ❌ | ❌ | ✅ |
| Sub-agent orchestration | ❌ | ❌ | ✅ |
| Full admin panel | ❌ | ❌ | ✅ |

---

## Business Model

### Revenue Streams

**1. Credit-Based AI Consumption (Primary)**
1 credit = $0.01 USD. All AI operations consume credits deducted from user balance. Purchased via Stripe with volume discounts:

| Tier | Spend | Credits per $1 | Discount |
|------|-------|-----------------|----------|
| Standard | $1 – $9.99 | 100 | — |
| Silver | $10 – $44.99 | ~111 | 10% |
| Gold | $45 – $79.99 | 125 | 20% |
| Platinum | $80+ | ~143 | 30% |

Volume discounts incentivize larger upfront purchases and reduce churn. A single Stripe product is reused — prices set dynamically at checkout.

**2. Supplier / Manufacturer Subscriptions**
Manufacturers pay a subscription to digitize and publish their catalog on the platform, gaining access to Factory Analytics and appearing in buyer searches. Covers ongoing AI enrichment, updates, and market trend reports.

**3. Professional Marketplace — Hire Me Layer**
Currently free to establish network effects. Planned:
- Featured profile/listing placement (pay to appear higher in directory)
- Verified badge subscription (trust signal)
- Lead generation packages for suppliers (qualified buyer contact access)
- Transaction fees on Hire Me connections (% of project value or flat fee per lead)

**4. Enterprise / API Access**
Custom contracts for large manufacturers or distributor networks:
- White-label catalog intelligence
- API access to 7-vector search against private product database
- Private workspace deployments with dedicated AI processing capacity
- Custom SLA agreements

---

## AI Cost Structure & Margins

All AI costs tracked in real-time via `ai_usage_logs`. The platform charges credits at a markup over raw API costs:

| AI Operation | Raw API Cost (approx.) | Credits Charged | Platform Margin |
|-------------|----------------------|-----------------|-----------------|
| Claude Opus analysis (1K tokens) | ~$0.015–0.075 | 2–40 credits | 20–60%+ |
| Claude Haiku (1K tokens) | ~$0.0008–0.004 | 1–5 credits | 50–80%+ |
| GPT-4o-mini (query parsing) | ~$0.0002 | 1 credit | 50x+ |
| Voyage AI text embedding (1K tokens) | ~$0.00006 | Bundled into search | High |
| VR World — quality (marble-1.1) | WorldLabs | 190 credits | Pass-through + platform overhead |
| Interior design (Replicate) | Replicate variable | Credits per image | Variable |
| Gemini interior (flash) | ~$0.02 | 6 credits | 3x markup |
| Gemini interior (pro/4K) | ~$0.06 | 15 credits | 2.5x markup |
| Virtual staging | ~$0.16 Replicate | 20 credits ($0.20) | 1.25x + overhead |
| Interior video (Kling v3.0) | ~$0.12 | 20 credits ($0.20) | 1.7x markup |
| Interior video (Veo-2) | ~$0.25 | 30 credits ($0.30) | 1.2x + overhead |
| Region edit (Grok Aurora) | ~$0.08 xAI | 20 credits ($0.20) | 2.5x markup |
| Social image (Aurora) | ~$0.04 | 10 credits | 2.5x markup |
| Social caption (Claude) | ~$0.002 | 2 credits | 10x+ markup |
| Web scraping (per Firecrawl credit) | ~$0.001 | ~0.1 platform credits | Variable |

**Blended gross margin target on AI costs: 60–70%.** Highest margin on high-frequency, low-cost operations (query parsing, embeddings). Thinner margins on high-cost generation (VR, image gen) where pass-through pricing builds user trust.

**Fixed infrastructure costs:**
- Vercel: Included in Vercel plan at current scale (global CDN, zero egress cost)
- Supabase: Managed PostgreSQL, storage, edge function invocations — scales with usage
- DigitalOcean: Dedicated server for MIVAA FastAPI backend — predictable fixed monthly cost
- Modal (SLIG): Scale-to-zero endpoint for SigLIP2 (768D visual embeddings); SLIG moved off HuggingFace to Modal 2026-06-14, so HuggingFace hosts nothing. vision is now Anthropic-only via Claude Opus 5 tool use.
- Modal (PaddleOCR-VL): layout + OCR backbone (GPU L4, scale-to-zero → $0 idle, `max_containers=4`). Replaced the Surya-2 backbone 2026-06-13. Sole required runtime secret: `PADDLEOCR_MODAL_API_KEY`.
- Variable: Anthropic, OpenAI, Voyage AI, WorldLabs, Replicate — fully usage-based

---

## Supplier & Market Intelligence

Split in two by issue #350, because the old single page mixed two different questions and keyed
supplier identity off `user_profiles.factory_verified` — a flag no account has ever held, so the
nav tile rendered for nobody.

**Per-supplier — CRM company → Market tab** (`/crm/companies/:id`, companies flagged `is_supplier`).
Keyed on the `products.brand_company_id` FK, so it works off the CRM record with no platform-user
identity behind it:
- Demand — views, saves and quote adds on that supplier's catalogue, and where the interest is
- Pricing — our cost against the live market spread, with per-product monitoring
- Competitors — same-ΚΑΔ matches from the CRM plus live discovery
- Financial — billed / paid / outstanding, and unbooked myDATA invoices from that issuer

**Platform-wide — Market Trends** (`/market-trends`, workspace admins):
- Material category demand trends (which types are searched most)
- Emerging finish and style trends derived from search query analysis
- Seasonal demand patterns and week-over-week momentum
- Rising & declining materials by save-velocity

Follower, hire-request and profile-view metrics are deliberately absent from the per-supplier view:
those belong to a platform supplier account, which a CRM company record does not have.

This analytics layer is a significant standalone upsell — providing market intelligence that currently requires expensive industry research reports or trade show attendance.

---

## Production Metrics

| Metric | Value |
|--------|-------|
| Active users | 5,000+ |
| PDFs processed | 1,000+ |
| Products cataloged | 10,000+ |
| Platform uptime | 99.5%+ |
| Search accuracy | 85–95% |
| Product detection accuracy (PDF) | 95%+ |
| Material recognition accuracy | 90%+ |
| Image classification accuracy | 88%+ |
| Search response time | 200–800ms |
| Concurrent query capacity | 1,000+/minute |
| API endpoints | 170+ |
| AI models integrated | Anthropic (Opus 5 / Sonnet 5 / Haiku 4.5), Voyage AI, SigLIP2, PaddleOCR-VL, OpenAI (optional), Replicate, Gemini, xAI, WorldLabs, Kling, Zernio |
| Edge functions deployed | 60+ |
| Database tables | 40+ |

---

## Technology Differentiation — Why This Is Hard to Replicate

**1. 7-Vector Fusion Search**
Most platforms use one or two embedding types. Fusing 7 specialized vectors with dynamic per-query weight profiles requires custom ML infrastructure, tuned weight profiles per query intent, and deep integration between the vision analysis pipeline and the search layer. This compound in value as more products are added.

**2. Understanding Embeddings (Novel Architecture)**
Claude Opus 5 (Anthropic tool use, schema-locked via `VisionAnalysis` Pydantic + `VISION_ANALYSIS_TOOL`) generates structured JSON analysis of every product image — material properties, surface characteristics, visible dimensions, finish type. The JSON is run through `serialize_vision_analysis_to_text` and embedded via Voyage AI into a 1024D "understanding" vector. This enables queries like *"find matte surfaces with slight veining, suitable for wet external areas"* — which no traditional image or keyword search can handle. This is a proprietary architecture not seen replicated elsewhere.

**3. Full Vertical Integration**
Ingestion + enrichment + search + design generation + VR visualization + quote management + marketplace in one product. Each layer creates switching costs. A user with their catalog ingested, moodboards saved, and project quotes tracked is not going to migrate to a competitor easily.

**4. 14-Stage Pipeline with Checkpoint Recovery**
Enterprise-grade PDF processing at 95%+ accuracy with a structure-first PaddleOCR-VL layout + OCR backbone (RT-DETR region detection, dedicated reading-order prediction, table/formula extraction) and 9-stage checkpoint recovery. This took significant engineering and handles everything from scanned PDFs to complex multi-product catalogs.

**5. Halfvec Storage (50% Infrastructure Cost)**
All 7 embedding types stored as float16 via pgvector. Halves vector storage costs with zero accuracy loss — critical for scaling to millions of products.

**6. Real-Time Automation + Background Agents**
Event-driven flows and autonomous background agents keep improving product data and automating connections without human intervention. Compounds value over time.

**7. Social-to-Platform Flywheel**
Every interior design created on the platform can be published directly to Instagram, LinkedIn, TikTok, etc. via the built-in social media suite. This turns users into organic distributors of platform-created content, each post pointing back to a professional profile on materialshub.gr. No competitor offers this closed loop from design → social publication.

**8. Full Vertical Integration of the Design Workflow**
No competitor currently offers: ingestion → AI search → agent interaction → 3D generation → virtual staging → region editing → interior video → VR walkthrough → social publication → quote → project tracking — all in one product. Each feature layer increases switching costs. A user who has cataloged products, built moodboards, generated designs, and tracked a project on this platform has strong reasons to stay.

---

## Competitive Landscape

| Platform | Category | Gap We Fill |
|----------|---------|-------------|
| Architonic / Archiproducts | Manual product directory | AI ingestion (zero manual effort), 7-vector search, agent interactions, buyer tools |
| Material Bank | Physical sample delivery | Fully digital, globally accessible, no logistics dependency |
| Trade Shows (Coverings, Salone del Mobile) | Periodic offline discovery | Always-on, searchable, data-driven |
| Manufacturer websites | Brand-specific catalogs | Cross-manufacturer search, buyer-side design and procurement tools |
| Generic AI chatbots (ChatGPT, etc.) | General Q&A | Deep material domain knowledge, live catalog integration, visual search, full procurement workflow |
| BIM tools (Revit, ArchiCAD) | Design software | Complementary discovery layer — not competing |
| Spec platforms (NBS, Arcom) | Technical specification databases | Richer visual and AI-assisted discovery, broader product coverage, integrated procurement |

**The defensible position:** No competitor currently offers the combination of auto-ingestion + multi-modal AI search + AI design generation + VR visualization + marketplace in one product. Each element alone is replicable; the vertical integration combined with 7-vector search and the understanding embedding architecture creates a meaningful moat.

---

## Roadmap

### Live in Production (March 2026)
- 7-vector fusion search with query-adaptive weight profiles
- Understanding embeddings
- AI search re-ranking (Claude post-retrieval re-ordering with explanations)
- PDF ingestion pipeline (14 stages, 9 checkpoints, PaddleOCR-VL structure-first layout + OCR backbone on Modal)
- Web scraping ingestion (Firecrawl)
- XML import with AI field mapping
- KAI unified agent (material search, KB RAG, visual search, B2B research, SEO)
- Interior Designer agent (room analysis, 3D generation, material matching, cost estimation)
- 14 Replicate generation models (7 text-to-image, 7 image-to-image)
- Gemini interior generation (4 modes: text-to-image, image-edit, floor-plan-render, floor-plan-text)
- Virtual staging (AI-furnished rooms from empty photos — Replicate proplabs, 20cr)
- Region editing / masked inpainting (SAM 2 + Grok Aurora, 20cr)
- Interior video generation (4 models: Veo-2 30cr, Kling v3.0 20cr, Wan 2.1 12cr, Runway 40cr)
- Social media suite (caption/image/video generation + Zernio publishing across 8 platforms)
- VR world generation (WorldLabs Marble + Spark.js, orbit + first-person walk navigation)
- Professional marketplace (profiles, services, Hire Me, Discover directory)
- Moodboards (private + public, comments, featured board)
- Quotes system (buyer + supplier workflow, upsells, project timeline)
- Price monitoring (multi-source, alerts, trends)
- Knowledge Base & RAG
- Flow builder & automation engine (cron, webhook, event triggers; WhatsApp/email/HTTP actions — send_sms is a legacy alias for send_whatsapp; SMS removed 2026-06-08)
- Background agent framework (6 types: product enrichment, material tagging, social analytics, factory enrichment + auto-recovery)
- Factory Analytics dashboard (own data + market trends + platform-wide for admins)
- Full admin dashboard (analytics, monitoring, prompt management, CRM, campaigns, background agents, flows)
- Email system (Resend, React Email, campaign management)
- Billing & credits (Stripe subscriptions + credit packages, customer portal)
- Duplicate detection & product merging (factory-scoped, undo capability)
- Collaborative filtering recommendations
- CRM (contacts, companies, users with role management)

### Near-Term
- Sourcing Agent elevated B2B tools (without requiring full admin role)
- Credit quota differentiation by user tier
- Verified factory elevated JARVIS agent tools
- User onboarding flow with professional type self-selection
- Hire Me transaction fee monetization layer
- Featured listing placements in Discover directory (paid)

### Strategic / Long-Term
- Mobile app — point camera at a material → instant catalog match
- White-label API for enterprise manufacturers (catalog intelligence as a service)
- Multi-language search and localization (CEE dual-language B2B queries partially implemented)
- Full marketplace transaction layer: RFQ → Quote → Purchase Order → Delivery tracking
- Verified badge subscription for professionals and suppliers
- Third-party integrations: Revit plugin, ArchiCAD plugin (material spec directly to BIM models)
- Carbon footprint and sustainability scoring per product (emerging EU regulatory requirement)

---

## Platform & Team

**Platform:** materialshub.gr
**API:** v1api.materialshub.gr/docs
**Repository:** github.com/creativeghq/material-kai-vision-platform
**Status:** Production — 5,000+ active users, 99.5%+ uptime
**Version:** 3.7.0 — June 2026

---

*This document is confidential and intended for investors, strategic partners, and due diligence purposes only. All metrics are as of June 2026.*
