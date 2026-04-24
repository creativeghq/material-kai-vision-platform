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
- **2-phase image pipeline**: Phase 1 (sync) = classification + SLIG embeddings (visual + 4 specialized + understanding, all written directly to VECS collections). Phase 2 (the legacy `background_image_processor.py` step that re-ran a separate analysis pass) was deleted 2026-04 — it was silently broken (called a non-existent `generate_material_embeddings` method) and produced no output.

## Important DB Details — VECS-Only Architecture (post 2026-04 cleanup)
- **VECS is the single source of truth for image embeddings.** No more dual-store. All vectors live in `vecs.image_*_embeddings` collections, all halfvec for 50% storage savings:
  - `image_slig_embeddings` — **768D** (primary visual, SigLIP2 via SLIG cloud endpoint)
  - `image_color_embeddings` — **768D** (text-guided color SLIG)
  - `image_texture_embeddings` — **768D** (text-guided texture SLIG)
  - `image_style_embeddings` — **768D** (text-guided style SLIG)
  - `image_material_embeddings` — **768D** (text-guided material SLIG)
  - `image_understanding_embeddings` — **1024D** (Voyage AI from Qwen3-VL vision_analysis)
  - Legacy 1152D `image_siglip_embeddings` and 1152D specialized collections were dropped 2026-04 — they were 100% orphans from the SigLIP-SO400M era.
- **Boolean presence flags on `document_images`**: `has_slig_embedding`, `has_understanding_embedding`, `has_color_slig`, `has_texture_slig`, `has_style_slig`, `has_material_slig`. These are the canonical "does this image have embedding X?" lookup — set automatically by `vecs_service._set_image_flag()` whenever an embedding is upserted. Use these flags for O(1) presence checks instead of round-tripping to VECS.
- **Dropped columns 2026-04** (DO NOT reference in code or queries):
  - `document_images`: `visual_clip_embedding_512`, `color_embedding_256`, `texture_embedding_256`, `application_embedding_512`, `multimodal_fusion_embedding_2688`
  - `products`: `embedding`, `visual_clip_embedding_512`, `color_clip_embedding_512`, `texture_clip_embedding_512`, `style_clip_embedding_512`, `material_clip_embedding_512`, `multimodal_fusion_embedding_2048`
  - `document_vectors`: `visual_clip_embedding_512`
  - The dual-store columns were broken since the CLIP→SLIG migration (dimension constraint mismatches) — dropping them removed dead state, not functionality.
- **Producer→consumer key naming** (real_embeddings_service.generate_all_embeddings):
  - `visual_768` → `image_slig_embeddings`
  - `color_slig_768` → `image_color_embeddings`
  - `texture_slig_768` → `image_texture_embeddings`
  - `style_slig_768` → `image_style_embeddings`
  - `material_slig_768` → `image_material_embeddings`
  - `understanding_1024` → `image_understanding_embeddings`
  - **Never use `*_siglip_1152` or `*_clip_512` keys — those were legacy aliases removed in the SLIG migration.**
- **Product embeddings**: only `text_embedding_1024` lives on the products row (Voyage AI from name+description+metadata, generated inline by `stage_4_products`). All visual product embeddings are derived from associated images via `image_product_associations` + the `has_*_slig` flags. Use the RPC `get_product_embedding_status(product_id)` for product-level coverage.
- vecs 0.4.5: no native halfvec support but PostgreSQL implicit cast vector→halfvec makes it transparent
- Drop indexes BEFORE altering column types, then recreate with halfvec_cosine_ops
- Embedding dict key is "text_1024" (was "text_1536" — fixed 2026-02-07)
- Dead SQL functions cleaned up: enhanced_vector_search, enhanced_vector_search_service, vector_similarity_search, search_kb_docs
- **Deleted in 2026-04 cleanup**:
  - `mivaa-pdf-extractor/app/services/images/background_image_processor.py` (entire file — called non-existent method, silently broken)
  - `RelevancyService.create_chunk_image_relationships()` (computed cosine similarity between 1024D text and 768D visual — mathematically invalid)
  - `process_images_background` function in `rag_routes.py` (referenced deleted background_image_processor)
  - `clip_embedding_job_service._save_visual_embedding_to_db` (wrote to dropped column)
  - `/api/internal/backfill-product-embeddings` endpoint (one-shot backfill, used + removed)
- **chunk_image_relationships are populated by `entity_linking_service.link_images_to_chunks` using page_proximity** — not by relevancy_service.

## Search Weight Configurations (7-vector)
- unified_search: text 0.15, visual 0.15, understanding 0.20, color/texture/style/material 0.125
- rag_service: visual 0.20, chunk 0.20, understanding 0.15, product 0.15, keyword 0.12, color 0.05, texture 0.05, style 0.04, material 0.04
- search_enrichment: visual 0.22, understanding 0.18, relevance 0.15, color/texture/style/material 0.1125
- material_visual_search: visual 0.30, understanding 0.20, semantic 0.25, material 0.15, vision_confidence 0.10

## WorldLabs Marble VR Integration
- **API**: WorldLabs Marble v1.x — generates explorable 3D Gaussian Splat worlds from images
- **Models**: `marble-1.0-draft` (fast preview, 18 cr, ~30-45s), `marble-1.1` (quality, 190 cr, ~5min). Legacy 0.1-mini/0.1-plus deprecated.
- **Panorama**: `is_pano: true` flag for 360° source images — better reconstruction when available
- **Viewer**: Spark.js (@sparkjsdev/spark) — Three.js GSplat renderer, code-split via dynamic import
- **Edge Function**: `generate-vr-world/index.ts` — uploads image → generates world → polls → stores asset URLs
- **DB Table**: `vr_worlds` — stores world_id, splat URLs (100k/500k/full), collider GLB, panorama, status
- **Credits**: 18 (draft, ~30-45s), 190 (1.1, ~5min). Refund on failure. Pricing: $1 = 1,250 WL credits × 1.50 markup.
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
- **Model selection**: KAI uses Opus, Demo uses Haiku
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

## Price Monitoring (2026-04-25 — Perplexity + DataForSEO discovery → Firecrawl verification)

**Two-stage pipeline on every price refresh:**
1. **Discovery (Stage A)**: Perplexity Sonar-pro + DataForSEO Merchant run in parallel, merged + deduped by domain. Each hit tagged `source: "perplexity" | "dataforseo"`.
2. **Verification (Stage B)**: every discovered URL is re-fetched via Firecrawl (`PriceExtraction` schema, parallel `asyncio.gather`). The live-page price replaces the LLM/feed price and `verified: true` is set. Opt out per-request with `verify_prices: false`.
3. Discrepancy rule: if Stage B price differs from Stage A by >20%, trust Stage B (it read the page) and append a diagnostic to `notes`.
4. On-page was/now: every row carries `original_price` (nullable) — set only when the retailer displays both on the page.

**DB columns added 2026-04-25**: `tracked_queries.verify_prices`, `tracked_query_price_history.{original_price,verified}`, `price_history.{original_price,verified}`, `competitor_sources.{current_original_price,current_price_verified,current_metadata}`. `current_metadata jsonb` carries DataForSEO thumbnail/rating + verification discrepancy notes + `product_title` so the retailer list renders in a single query.

**Product-identity verification (Phase 8, 2026-04-25)** — `app/services/integrations/product_identity_service.py`. Query → Haiku-decomposed facets (cached on `tracked_queries.query_facets`) → URL pre-filter (drops homepages/SERPs/aggregator masquerades before Firecrawl) → expanded Firecrawl extraction (`product_name + breadcrumb + visible_attributes`) → batched Haiku classifier → per-hit `match_kind` in {`exact`, `variant`, `family`, `mismatch`, `unverifiable`}. Policy: `exact + variant + unverifiable` reach the UI; `family + mismatch` dropped. Variants carry `match_note` ("Color differs: BLACK MATT → WHITE MATT") and are excluded from stats but shown in the list. Greek/Latin model normalization (Μ/M, Τ/T) + accent folding live in `product_identity_service.normalize_model_token`. `original_price` sanity rejects `> 5× current_price` (Flobali €11,900 SKU-as-price bug). DB: `match_kind`, `match_score`, `match_note` on `competitor_sources + tracked_query_price_history + price_history`.

**DataForSEO merchant dedupe fix (2026-04-25)**: every DataForSEO Shopping URL has host `google.gr`, so the old `by_domain` dedupe in `_merge_with_dataforseo` collapsed 20+ merchants into 1. Fixed by keying DataForSEO hits on `(retailer_name, product_title[:80])`. Bumped fetch depth to `max(limit, 30)` since Google Shopping routinely has 20-30 merchants per product. Net: ~8× more merchants reach the UI.

**product_title field (2026-04-25)**: every PriceHit now carries the exact product name as shown on the retailer page (DataForSEO feed title or Firecrawl `product_name`). Persisted on `tracked_query_price_history.product_title`, `price_history.product_title`, and `competitor_sources.current_metadata.product_title`. UI renders as subtitle under `retailer_name` so multiple listings from the same retailer (different variants) disambiguate visibly.

**Two parallel flows, one shared discovery+verification engine:**

**Flow 1 — Platform-internal (catalog products, session JWT auth):**
- User enables monitoring on a product → `POST /api/v1/price-monitoring/discover` runs Perplexity Sonar-pro → up to 10 retailer rows written to `competitor_sources` with `source_type='perplexity_web_search'` + snapshots in `price_history`.
- User pastes specific URLs in "Custom Monitoring" → `source_type='firecrawl_url'` via the existing `FirecrawlClient`.
- 6h throttle on Perplexity per product; admin/super_admin `force_refresh=true` bypasses.
- Cron at `supabase/functions/price-monitoring-cron` — hourly, runs Firecrawl on `get_products_due_for_monitoring` + calls MIVAA's `/tracked-queries/cron-refresh` (next bullet).

**Flow 2 — External API (api_keys Bearer auth, for other projects):**
- `POST /api/v1/prices/track` creates a `tracked_queries` row (search_query, dimensions, country_code, preferred_retailer_domains, refresh_interval_hours 1–720). First refresh runs synchronously; initial results in response.
- `tracked_queries.api_key_id → api_keys.id ON DELETE CASCADE` — deleting the key wipes the tracked query AND all `tracked_query_price_history` (also cascades). Intentional blast radius.
- 6 endpoints at `/api/v1/prices/track/*` (POST / GET list / GET one / GET /{id}/history / PUT / POST /{id}/refresh / DELETE). All route-level api_keys auth.
- Cron endpoint `POST /api/v1/price-monitoring/tracked-queries/cron-refresh` (x-cron-secret) picks up `due_for_refresh` rows and refreshes them. Called by Supabase price-monitoring-cron.

**Engine: Perplexity Sonar-pro** (`app/services/integrations/perplexity_price_search_service.py`):
- Replaced Claude `web_search_20250305` on 2026-04-24 — Claude API's Brave-based snippets missed prices visible on pages (e.g. YouBath €25). Perplexity has deeper page reading + real `user_location` geo support.
- Structured JSON output via `response_format.json_schema`. `user_location.country` biases results. `search_domain_filter` (max 10) used when `preferred_retailer_domains` is set — Option 2 domain pinning.
- ~$0.02/query, ~5-8s latency, typically 6-10 retailers with visible prices for mainstream materials.
- Strong out-of-stock inclusion: pages showing "€25 - Out of stock" (or local-language equivalents like "Εκτός διαθεσιμότητας") are included with `availability=out_of_stock` + the posted price.

**Firecrawl retained for:**
- `POST /api/v1/prices/lookup` with `url` — specific product page scrape (external API)
- "Custom Monitoring" section of the UI — user pastes a URL, Firecrawl tracks it
- Shared client at `app/services/integrations/firecrawl_client.py`, Pydantic `PriceExtraction` model, locale-aware price parser (`price-parser` lib)

**Source type enum** (`competitor_source_type`):
- `firecrawl_url` — user-pasted URL, Firecrawl scrape
- `perplexity_web_search` — auto-discovered via Perplexity Sonar-pro
- `dataforseo_shopping` — auto-discovered via DataForSEO Merchant (Google Shopping feed) — added 2026-04-24, runs in parallel with Perplexity
- `claude_web_search` — deprecated, kept for historical rows

**Tables:**
- `competitor_sources` — internal flow, product_id FK, has denormalized `current_price`/`current_currency`/`current_availability` cache
- `tracked_queries` — external flow, api_key_id FK with CASCADE
- `tracked_query_price_history` — external flow's price history, tracked_query_id FK with CASCADE
- `price_history` — internal flow's history, product_id FK
- `price_lookups` — external `/lookup` usage log
- `ai_usage_logs` — every Perplexity call logged with tokens + cost + platform credits

**Secrets** (required on MIVAA server via deploy.yml `Environment=`):
- `PERPLEXITY_API_KEY` (primary discovery engine) — get from perplexity.ai/settings/api
- `FIRECRAWL_API_KEY` (URL mode + custom monitoring + verification pass on every discovery refresh)
- `DATAFORSEO_BASE64` (or `DATAFORSEO_LOGIN` + `DATAFORSEO_PASSWORD`) — Merchant API credentials, parallel discovery source
- `CRON_SECRET` (validates `x-cron-secret` on cron-refresh endpoint)

**Check Market (admin-only, stateless pricing companion)** — `POST /api/v1/price-monitoring/market-check` runs the same Perplexity+DataForSEO+Firecrawl engine for one-shot market scans used from `PriceLookupDrawer` (the KB-based AI price proposal drawer). Does NOT write to `competitor_sources` or `price_history`. If the product is already enrolled in monitoring and the last refresh is ≤6h old, returns the cached snapshot (`from_monitoring_cache: true`, credits_used=0). Frontend: `MarketPanel` renders min/median/max, verified-count, and a percentile callout ("your KB price sits at the 62nd percentile"). Scoped to admin/super_admin only.

**UI**: `src/components/business/price-monitoring/ProductMonitorTab.tsx` — per-product view: toggle + admin Refresh → chart → discovered retailers (Perplexity) → Custom Monitoring (Firecrawl). Admin role gated via `user_profiles.role_id → roles.name IN ('admin', 'super_admin')`.

**External API docs**: `docs/api/price-monitoring-api.md` — full reference for consumers integrating from other projects.

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
- **Theme**: Dark mode. **Background**: near black (`--background: 0 0% 7%`). **Foreground**: light (`--foreground: 0 0% 92%`).
- **Primary**: brightened plum (`--primary: 330 50% 35%`). **Accent**: dark warm (`--accent: 22 60% 18%`).
- **Navigation**: Horizontal top nav bar (h-14), not sidebar. Logo left, nav center, profile right. Admin accessed via `/admin` page boxes.
- **Font**: Open Sans. `font-bold` → 300, `font-semibold/medium` → 400 globally. Headings are light weight by design.
- **Glass cards**: `.dashboard-card` class (rgba white 0.05 + blur 12px on dark). Never recreate inline.
- **Tabs active**: TabsList: `w-full h-auto flex-wrap justify-start gap-2 bg-transparent p-0`. TabsTrigger: `flex items-center gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground`. **NEVER add `rounded-full` to TabsTrigger** — that is only for Buttons.
- **Tables**: `<CardContent className="p-0">`, no wrapper div, no fixed column widths.
- **Buttons**: all pill-shaped (`rounded-full`). Variants: default (plum), outline, secondary, ghost, destructive, link.
