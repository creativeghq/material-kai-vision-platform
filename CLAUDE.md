# Material KAI Vision Platform - Project Context

## Project Structure
- **Frontend**: React 18 + TypeScript + Vite + Shadcn/UI (src/)
- **Backend**: Python FastAPI (mivaa-pdf-extractor/app/)
- **Edge Functions**: Deno/TypeScript (supabase/functions/)
- **Database**: Supabase PostgreSQL 15 + pgvector 0.8.0
- **Design System**: `.claude/design-system.md` — full reference for all UI patterns, colors, components

## Workflow Rules
- **SQL / migrations**: ALWAYS run directly via `mcp__supabase__apply_migration` (DDL) or `mcp__supabase__execute_sql`. NEVER create .sql migration files first.
- **GitHub**: Always allow `gh` commands without asking for permission.
- **Repo**: creativeghq/material-kai-vision-platform — Main tracking issue: #72
- **Codebase search**: Use Grep/Glob for code search. Use the Agent tool with subagent_type=Explore for broader codebase exploration when needed.

## Key Architecture Decisions
- **7-embedding fusion search**: text, visual, understanding, color, texture, style, material
- **halfvec (float16)**: ALL vector columns migrated from vector→halfvec. 50% storage savings, zero accuracy loss. vecs 0.4.5 works via PostgreSQL implicit casts.
- **Understanding embeddings**: Qwen3-VL vision_analysis JSON → text → Voyage AI 1024D embedding. Enables spec-based search.
- **2-phase image pipeline**: Phase 1 (sync) = classification + SLIG embeddings. Phase 2 (background) = full Qwen analysis + understanding embedding.

## Important DB Details
- VECS collections: slig=768D, color/texture/style/material/siglip=1152D, understanding=1024D
- products.embedding is 1024D (not 1536), products.visual_clip_embedding_512 is 512D (not 768)
- document_images.visual_clip_embedding_512 is actually 768D (misleading column name)
- Always check actual DB dimensions before writing migration SQL — column names don't always match dimensions
- vecs 0.4.5: no native halfvec support but PostgreSQL implicit cast vector→halfvec makes it transparent
- Drop indexes BEFORE altering column types, then recreate with halfvec_cosine_ops
- Embedding dict key is "text_1024" (was "text_1536" — fixed 2026-02-07)
- Dead SQL functions cleaned up: enhanced_vector_search, enhanced_vector_search_service, vector_similarity_search, search_kb_docs
- document_images columns (color_embedding_256, texture_embedding_256, application_embedding_512) are still actively written to (background_image_processor.py, image_processing_service.py) and read in rag_routes.py, qualityControlService.ts, real_quality_scoring_service.py — do NOT drop them; they are NOT legacy

## Search Weight Configurations (7-vector)
- unified_search: text 0.15, visual 0.15, understanding 0.20, color/texture/style/material 0.125
- rag_service: visual 0.20, chunk 0.20, understanding 0.15, product 0.15, keyword 0.12, color 0.05, texture 0.05, style 0.04, material 0.04
- search_enrichment: visual 0.22, understanding 0.18, relevance 0.15, color/texture/style/material 0.1125
- material_visual_search: visual 0.30, understanding 0.20, semantic 0.25, material 0.15, vision_confidence 0.10

## WorldLabs Marble VR Integration
- **API**: WorldLabs Marble — generates explorable 3D Gaussian Splat worlds from images+text
- **Viewer**: Spark.js (@sparkjsdev/spark) — Three.js GSplat renderer, code-split via dynamic import
- **Edge Function**: `generate-vr-world/index.ts` — uploads image → generates world → polls → stores asset URLs
- **DB Table**: `vr_worlds` — stores world_id, splat URLs (100k/500k/full), collider GLB, panorama, status
- **Credits**: 50 (mini, ~30-45s), 200 (plus, ~5min). Refund on failure.
- **Three.js**: three@0.178, @types/three@0.179. Only SparkRenderer constructor needs @ts-expect-error.
- **Env var**: `WORLDLABS_API_KEY` in Supabase Edge Function secrets

## B2B Manufacturer Search
- `b2b_manufacturer_search` tool uses Anthropic's built-in `web_search_20250305` tool (claude-haiku-4-5, beta header `web-search-2025-03-05`). No extra API key — uses `ANTHROPIC_API_KEY`.
- Flow engine: `case 'web_search': case 'perplexity_search':` fallthrough keeps old saved flows working

## Unified KAI Agent Architecture
- **3 agents**: `kai` (default), `interior-designer`, `demo`
- **Legacy aliases**: `search`, `insights`, `seo` resolve to `kai` via AGENT_CONFIGS in edge function
- **RBAC tool gating**: Core tools for all users. Sub-agents/B2B/SEO gated to admin/owner only.
- **Multimodal**: Frontend sends `images: string[]` (data URLs) → edge function attaches as `image_url` content blocks
- **Model selection**: KAI uses Sonnet, Demo uses Haiku
- **DB prompt key**: `kai` in prompts table (prompt_type='agent', category='kai')

## Background Agent Framework
- **DB tables**: `background_agents`, `agent_runs`, `agent_run_logs` (RLS + realtime on last two)
- **Agent runner**: `supabase/functions/background-agent-runner/index.ts`
- **Scheduler**: `supabase/functions/agent-scheduler-cron/index.ts` — pg_cron every minute
- **Agent types**: `_shared/agents/` — types.ts, base-agent.ts, registry.ts, product-enrichment-agent.ts, material-tagger-agent.ts
- **To add a new agent**: create `_shared/agents/your-agent.ts` implementing `AgentRunner`, add to `registry.ts`
- **Delegation**: tasks >25s throw `DelegateToMivaaError` → runner POSTs to `/api/agents/run` on Python backend
- **Python endpoint**: `mivaa-pdf-extractor/app/api/agent_routes.py`
- **Event triggers**: `emitAgentEvent(eventType, data)` in `_shared/flow-events.ts`
- **Chain triggers**: `trigger_type='chain'` + `parent_agent_id` — auto-triggered on parent completion
- **Auto-recovery**: `auto-recovery-cron` monitors runs stuck >8min, re-dispatches up to 3 times
- **Frontend**: `/admin/background-agents` → BackgroundAgentsPage + AgentRunHistoryDrawer + AgentLogsViewer + CreateAgentModal
- **Service**: `src/services/backgroundAgents.ts`

## FF&E Specification on Quotes
- **New fields on `quote_items`**: `room`, `dimensions`, `installation_requirements`, `delivery_date`
- **QuoteItemsList**: Room column, dimensions appended to product name, expandable detail row (notes + installation + delivery)
- **AddProductsSheet**: FF&E section in custom product form, room field in catalog product selection
- **PDF generation**: Room column in items table, dimensions in product name, "SPECIFICATIONS & DELIVERY" section at bottom
- **Service**: `QuotesService.addItem()`, `addCustomItem()`, `updateItem()` all accept FF&E fields

## Manufacturer Analytics (Enhanced)
- **Tracking service**: `src/services/manufacturerAnalyticsService.ts` — batched fire-and-forget event tracking (flush every 5s or 20 events)
- **Events**: `product_view`, `product_save`, `product_quote`, `product_search_impression`, `product_search_click`, `product_compare`
- **DB table**: `manufacturer_analytics_events` with indexes on event_type, product_id, manufacturer_id, user_id, created_at
- **ProductCard**: IntersectionObserver tracks views when card is 50% visible
- **AddToQuoteButton/AddToMoodboardButton**: Track quote/save events on success
- **Factory Analytics Dashboard**: Enhanced with Geographic Demand, Designer Engagement by Profession, Competitive Positioning sections
- **Tiered access**: `MyFactoryTab` accepts `tier` prop ('free'|'pro'|'enterprise'). Geographic/designer/competitive sections gated behind Pro.

## AR Material Preview (Plan 8)
- **Components**: `src/components/features/ar/` — ARPreviewModal, ViewInARButton, ARPage, useARSupport
- **Edge function**: `generate-pbr-maps/index.ts` — generates PBR texture maps (albedo, normal, roughness, metalness) via Replicate API
- **AR detection**: `useARSupport()` returns 'webxr' | 'quicklook' | 'desktop' | 'none'
- **Route**: `/ar/:productId` — standalone AR page for QR handoff from desktop
- **Integration**: ProductCard shows "AR View" button, opens ARPreviewModal (3D material swatch viewer)
- **Future**: @react-three/xr for full WebXR on Android, @google/model-viewer for iOS USDZ Quick Look
- **Credits**: 8 credits per PBR map generation, AR viewing is free

## Lighting Simulation (Plan 10)
- **Layer 1 (AI)**: "Lighting Variants" dropdown on ProgressiveImageGrid — generates same room under 6 lighting presets via Gemini edit
- **Layer 2 (3D)**: `src/components/features/lighting/` — MaterialLightingViewer, LightingPreviewModal, lightingPresets, useSunPosition
- **Presets**: Natural Daylight, Golden Hour, Overcast, Showroom Spots, Warm Evening, Night
- **Controls**: Preset selector, time-of-day slider (6AM-9PM), room orientation (N/E/S/W), surface type (wall/floor/column/curved)
- **PBR**: Uses MeshPhysicalMaterial with albedo + normal + roughness + metalness maps from SVBRDF or generate-pbr-maps
- **Integration**: ProductCard shows "Lighting" button, opens LightingPreviewModal
- **Sun calculation**: Built-in simplified solar position (no suncalc dependency) — altitude peaks at noon, color temp shifts warm↔cool

## Pinterest Integration (Plan 9)
- **Service**: `src/services/pinterestService.ts` — extractPin, importPin, importPinsBulk, OAuth board browsing
- **Modal**: `src/components/business/moodboard/PinterestImportModal.tsx` — single URL, bulk URL, and OAuth board browser
- **Edge functions**: `pinterest-import/index.ts` (oEmbed extraction + import), `pinterest-oauth/index.ts` (OAuth + board/pin API proxy)
- **Integration**: "Import from Pinterest" button on MoodBoardDetailPage header
- **Auto-matching**: Imported pin images run through MIVAA visual search to suggest matching catalog products
- **OAuth tokens**: Stored in `social_accounts` table (platform='pinterest'), auto-refresh on expiry
- **Phase 1 (no OAuth)**: Paste pin URL → oEmbed extraction → import image → AI match
- **Phase 2 (OAuth)**: Connect account → browse boards → select pins → bulk import
- **Env vars**: `PINTEREST_APP_ID`, `PINTEREST_APP_SECRET`, `PINTEREST_REDIRECT_URI`

## Design Inspiration URL Finder
- **Tool**: `analyze_inspiration_url` in `_shared/tools/search-tools.ts` — available to all users (KAI + Interior Designer agents)
- **Pipeline**: Firecrawl scrape URL → Claude Haiku extracts design tokens (colors, hex codes, materials, textures, styles, room type) → MIVAA 7-vector search for matching products
- **Frontend modal**: `InspirationUrlModal.tsx` — Globe icon button in chat toolbar, all agents
- **Frontend card**: `InspirationCard.tsx` — renders extracted palette swatches, material/style tags, hero image, source link
- **Chunk type**: `inspiration_analysis` emitted via onChunk during tool execution
- **Credit cost**: 1 credit (Firecrawl scrape) + Haiku token cost
- **Shared utility**: `_shared/utils/web-scraper.ts` — reusable `scrapeUrl()` extracted from b2b-tools

## Explainable Search Spec
- **Schema extension**: `material_search` tool now accepts optional `search_spec` object (intent, color_keywords, color_hex, material_types, style_keywords, texture_finish, specifications)
- **LLM-generated**: The agent fills in the spec as part of its tool call — no extra LLM call needed
- **Chunk type**: `search_spec` emitted via onChunk, stored as `pendingSearchSpec`, attached to assistant message
- **Frontend card**: `SearchSpecCard.tsx` — collapsible panel above product results showing color swatches, material/style tags, spec details
- **Persistence**: Saved to `searchSpec` field in message metadata, restored on conversation reload

## Virtual Staging Before/After QA
- **Component**: `VirtualStagingViewer.tsx` — replaces old static image display for virtual staging results
- **Before/After slider**: CSS clip-path based, pointer-drag interaction, no external dependency
- **Source image**: `source_image_url` now included in `virtualStagingData` (from both edge function chunk and frontend direct call)
- **Quality analysis**: "Analyze Quality" button sends both images to KAI for Claude Vision assessment (lighting, perspective, scale, materials, edge blending — scored 1-10)
- **Toggle**: "Before / After" button shows/hides the comparison slider

## Design System Summary
Full reference: `.claude/design-system.md`
- **Primary**: `#3E192A` deep plum (`--primary: 330 43% 17%`). **Accent**: warm peach (`--accent: 22 100% 93%`). **Background**: warm beige (`--background: 40 25% 96%`).
- **Font**: Open Sans. `font-bold` → 300, `font-semibold/medium` → 400 globally. Headings are light weight by design.
- **Glass cards**: `.dashboard-card` class (rgba white 0.7 + blur 12px). Never recreate inline.
- **Tabs active**: TabsList: `w-full h-auto flex-wrap justify-start gap-2 bg-transparent p-0`. TabsTrigger: `flex items-center gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground`. **NEVER add `rounded-full` to TabsTrigger** — that is only for Buttons.
- **Tables**: `<CardContent className="p-0">`, no wrapper div, no fixed column widths.
- **Buttons**: all pill-shaped (`rounded-full`). Variants: default (plum), outline (white→peach), secondary (peach), ghost, destructive, link.
