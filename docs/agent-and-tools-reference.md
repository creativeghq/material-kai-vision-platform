# Agents & Tools Reference

Single source of truth: [`src/components/features/ai/agentToolsCatalog.ts`](../src/components/features/ai/agentToolsCatalog.ts).

## Architecture: agents → toolkits → tools

The catalog has three layers:

1. **Tools** (`KAI_TOOLS`, `INTERIOR_DESIGNER_TOOLS`) — individual capabilities (~60 total). Each tool has `id`, `name`, `desc`, `category`, `adminOnly`, `moduleSlug`, `credits`, `examples[]`, optional `workflowOf` + `workflowStep` for multi-step bundles.
2. **Agents** (`AGENTS`) — JARVIS / Interior Designer / Demo. Each owns a subset of tools.
3. **Toolkits** (`TOOLKITS`) — the cluster layer. Bundles related tool_ids with a name, icon, description, optional `adminOnly` / `moduleSlug` / `alwaysOn`, and **`quick_starts`** (1-4 starter prompts that fire workflows). This is what the user actually sees in the discovery UI.

Helpers exposed from the catalog:
- `getAccessibleAgents(role)` / `getAccessibleToolkits(role, enabledModules)` — RBAC + module filters
- `resolveToolkitsToTools(toolkitIds[])` — flatten N toolkit IDs to deduped tool IDs
- `findTool(id)` / `findToolkitsForTool(id)` — lookups
- `getToolkitOwnerAgents(toolkit)` — derives which agents host a toolkit's tools (auto-switch source)
- `toolkitTokenEstimate(toolkit)` — ~250 tokens per tool, rough total
- `ALWAYS_ON_TOOLKIT_IDS` — toolkit IDs the user can't disable

## How users discover & use tools — TWO modals on `/agent-hub`

| Modal | Button | Purpose |
|---|---|---|
| **PromptBuilderModal** | ✨ Sparkles in toolbar | Discovery + click-to-fire. Toolkit-cluster cards with quick-starts. Click a starter → modal closes, agent auto-switches if needed, prompt is set + auto-sent. Search across toolkit names, descriptions, tool ids, quick-start labels. |
| **ToolkitPickerModal** | 🔧 Wrench in toolbar | Selection / restriction. Toggle which toolkits the agent has loaded for the next message. Always-on `core` is locked. Footer shows live ~tokens/turn estimate. |

Both share the same `agentToolsCatalog.ts`.

## Agents

The platform has **3 agents**. There is **no separate "B2B Agent" or "SEO Agent"** — those are categories of tools available on KAI, gated by role.

| Agent ID | Name | Roles allowed | Description |
|---|---|---|---|
| `kai` | JARVIS agent | viewer, member, admin, owner | Material intelligence — search, sub-agents, B2B, SEO, mentions, presentation sheets, pricing. The default agent for most queries. |
| `interior-designer` | Interior Designer | viewer, member, admin, owner | AI-powered interior design with spatial analysis and material matching. 3D + lighting + VR generation. |
| `demo` | Demo Agent | admin, owner only | Platform showcase. |

**Legacy aliases** (resolved server-side to `kai`): `search`, `insights`, `seo`. Old frontends sending these agent IDs continue to work.

## JARVIS tool inventory (by category)

Each tool has: `name` · `id` · `desc` · `adminOnly` flag · optional `moduleSlug` (gates on `public.modules.enabled`) · optional `credits` cost · 1-3 starter prompts.

### Search (all users, 0 credits)

- `knowledge_base_search` — Search platform KB documents
- `material_search` — 7-vector fusion catalog search
- `visual_search` — Image-based catalog search (image required)
- `analyze_inspiration_url` — Scrape webpage → design tokens → match catalog (1 credit, Firecrawl)

**All three search tools rerank their own results** through `_shared/rerank.ts` before returning
them (`claude-haiku-4-5`, prompt at `/admin/ai-configs`, `prompts.category='ai_rerank'`). Vector
search returns candidates scored *per embedding aspect*; reranking is what fuses them into one
ordering. It is inert below 2 candidates — no model call, no cost — and every failure path returns
the source order unchanged, so it can never make search worse. Turn it off platform-wide with
`SEARCH_RERANK_ENABLED=false`. The `ai-rerank` edge function is the same logic for callers outside
the agent runtime.

### Mentions (all users, module-gated `mention-monitoring`)

- `track_product_mentions` — Start/stop monitoring on a product
- `get_mention_summary` — 7d/30d snapshot
- `check_llm_visibility` — Share-of-voice across Haiku/GPT-4o-mini/Gemini Flash/Sonar (2 cr cached, 15 cr force_run)
- `find_negative_mentions` — Reputation triage feed

### SEO Research (all users, 0 user credits)

`seo_research_keyword`, `seo_keyword_difficulty`, `seo_keyword_suggestions`, `seo_search_intent`, `seo_keyword_overview`, `seo_serp_audit`, `seo_audit_url`

### SEO Domain (all users, 0 user credits)

`seo_domain_snapshot`, `seo_ranked_keywords`, `seo_domain_competitors`, `seo_keyword_gap`, `seo_traffic_estimation`, `seo_subdomains`, `seo_relevant_pages`, `seo_categories_for_domain`

### SEO Backlinks (all users, 0 user credits)

`seo_backlinks_summary`, `seo_backlinks_anchors`, `seo_referring_domains`

### SEO OnPage (all users, 0 user credits)

`seo_site_crawl_start`, `seo_site_crawl_status`

### SEO Content / Domain analytics (all users, 0 user credits)

`seo_content_sentiment`, `seo_domain_technologies`, `seo_domain_whois`, `seo_historical_serps`, `seo_ai_keyword_volume`

### SEO Multi-Engine (all users, 0 user credits)

`seo_llm_mentions_search`, `seo_youtube_search`, `seo_local_pack`, `seo_google_trends`

### SEO Niche (all users, 0 user credits)

`seo_amazon_asin`, `seo_app_keywords`, `seo_trustpilot_search`, `seo_pinterest_search`, `seo_reddit_search`

### SEO Composite (all users, 0 user credits)

- `seo_site_review` — domain rank + ranked keywords + competitors + backlinks summary + anchors in ONE call
- `seo_brand_search_audit` — Knowledge Panel + AI Overview + organic listings + paid bids on the brand name

### Sub-Agents (admin/owner only)

- `research_analysis` — deep-research sub-agent
- `analytics_analysis` — analytics sub-agent
- `business_analysis` — business sub-agent
- `product_analysis` — product sub-agent

### B2B Research (admin/owner only)

- `b2b_manufacturer_search` — find manufacturers via web search (Anthropic web_search)
- `company_website_scrape` — Firecrawl a company website
- `company_enrichment` — Apollo.io company data
- `contact_discovery` — find + verify decision-maker emails
- `email_validate` — ZeroBounce
- `save_to_crm` — persist to CRM

### SEO Article Pipeline (admin/owner only)

- `create_seo_article` — full pipeline (research → plan → write → analyze), 30 cr, async
- `seo_keyword_research` — stage 1, 18 cr
- `seo_article_planner` — stage 2, 2 cr
- `seo_article_writer` — stage 3, 20 cr
- `seo_content_analyzer` — stage 4

### Generation / Sheets (all users)

- `generate_presentation_sheet` — A3 moodboard sheet PDFs (per-sheet credit cost gated inside)

### Admin

- `dispatch_background_task` — async long task dispatch (admin)
- `price_lookup` — pricing KB lookup (admin)
- `seo_dataforseo_call` — escape-hatch DataForSEO endpoint (admin)

## Interior Designer tools

- `material_search`, `analyze_inspiration_url`
- `generate_3d` — Replicate/Gemini 3D render (async)
- `apply_lighting_preset` — re-render under different lighting (image required)
- `generate_vr_world` — WorldLabs Marble 3D Gaussian Splat (image required, 18 cr draft / 190 cr v1.1)
- `generate_presentation_sheet`
- `seo_research_keyword`

## Saved searches — what's actually available

**Important**: The platform's `saved_searches` table is for **material/product searches** (used by the search filter UI). It is **not** mounted on any user-visible route today — `SavedSearchesPanel` is referenced only by `EnhancedRAGInterface`, which itself isn't wired into a route.

**Where users save a search today**:

- The `SaveSearchModal` exists at [`src/components/features/search/SaveSearchModal.tsx`](../src/components/features/search/SaveSearchModal.tsx) but is **also only used by the unmounted `EnhancedRAGInterface`**.
- **In practice, users currently cannot save a search via the UI.** This is a latent feature.

**SEO research history** is a separate concern, lives in the `seo_research_runs` table, and is exposed via:

- **`/admin/seo` → Keyword Research tab** — full history with star/unstar, search-by-subject filter, delete. This IS the user-facing "saved SEO searches" surface.
- Every chat-driven SEO research call persists into this table automatically (when wired through `seo-toolkit-research` edge function).

## What's mounted where (the truth)

| Surface | Route | Visible to | Status |
|---|---|---|---|
| KAI chat | `/agent-hub` | all roles | ✓ live |
| KAI Browse Tools modal | `/agent-hub` → ✨ button | all roles, filtered by role | ✓ shipped this turn |
| Tool Picker (restrict tools per message) | `/agent-hub` → 🔧 button | all roles | ✓ catalog refreshed this turn |
| `/admin/seo` dashboard | `/admin/seo` | admin/owner | ✓ shipped earlier |
| ProductDetailModal SEO tab | per-product modal | admin/owner | ✓ shipped earlier |
| CompanyDetailPage SEO tab | `/admin/crm/companies/{id}` | CRM access | ✓ shipped earlier |
| PinterestImportModal SEO bridge | moodboard import | moodboard users | ✓ shipped earlier |
| `SavedSearchesPanel` | NONE | — | not mounted |
| `SaveSearchModal` | NONE | — | not mounted |

## To add a new tool

1. Add a new method on `DataForSEOUnifiedClient` (if it's a DataForSEO endpoint) or a new MIVAA service.
2. Add a route to `seo_agent_routes.py` (or whitelist the kind for the generic dispatcher).
3. Add an agent tool factory in `seo-agent-tools.ts` (or appropriate tool file).
4. Register in `agent-chat/index.ts`: add to `SEO_AGENT_TOOL_NAMES`, lazy-import factory, push when included.
5. Add to JARVIS's `tools` array in `AGENT_CONFIGS`.
6. **Add an entry to `agentToolsCatalog.ts`** — this is what makes it discoverable in the Browse Tools modal.
7. Add a card renderer case in `SEOGenericCard.tsx` (or use the fallback raw-payload card).

If you skip step 6, the tool works but users can't discover it through the modal.
