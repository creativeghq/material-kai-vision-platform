# Agent Chat — Partner API (kai_* keys)

Conversational access to the **JARVIS agent** (material intelligence, search, insights, research, analytics, SEO, B2B) and the **Interior Designer agent** (spatial analysis + room generation) over HTTP. Streaming NDJSON response. Multimodal — accepts user-attached images. Optional partner-supplied knowledge-base context block in the user message.

> This is the **partner-facing** doc for integrations using a `kai_*` Bearer key, parallel to the Price Tracking + Mention Tracking APIs.
> For the **internal** session-JWT version of the same endpoint (used by our own web app), see [`agent-chat-api.md`](./agent-system.md).

**Host**: `https://<your-supabase-project>.supabase.co`
**Endpoint**: `POST /functions/v1/agent-chat`
**Auth scope**: Partner integrations using an `api_keys` Bearer token (`kai_*` prefix), parallel to `/api/v1/prices/track/*` and `/api/v1/mentions/track/*`.

---

## Changelog

### v0.1.0 — 2026-05-14 — Initial partner release

- 🆕 **Partner kai_\* Bearer auth** added to `agent-chat`. Mirror of the auth used by `/api/v1/prices/track/*` and `/api/v1/mentions/track/*`. Validates against the same `public.api_keys` table.
- 🆕 **Per-turn credit debit**: 10 credits charged on top of any per-tool credit costs that fire mid-turn. Refunded on hard pre-stream failure (agent crashed before producing any real content).
- 🆕 **Partner-mode permission lock**: role forced to `member` server-side regardless of underlying user role. Admin-gated tools (B2B research, SEO article pipeline, sub-agent orchestration, dispatch_background_task, price_lookup, presentation catalogs) are unavailable to partner keys.
- 🆕 **Partner-allowed agents**: `kai`, `interior-designer`. `demo` and legacy aliases (`search`, `insights`, `seo`) rejected.

---

## Auth

```
Authorization: Bearer kai_<32-char-alphanumeric>
Content-Type: application/json
```

The key must be active and not expired. `allowed_endpoints` on the api_keys row must include `/functions/v1/agent-chat` (or a trailing-`*` prefix match), or be `NULL` (allow-all).

Each call is billed against the api_key owner's user balance via `debit_user_credits`. Insufficient balance → `402 Payment Required` BEFORE the agent runs (no partial debit).

---

## Cost

| Item | Credits | Notes |
|---|---|---|
| Per turn (kai or interior-designer) | **10** | Charged BEFORE the agent runs. Refunded if the agent crashes before producing any content. |
| Per tool invocation | varies | Underlying tools that fire (`material_search`, `analyze_inspiration_url`, etc.) bill their own credits on top. Most search tools are 0 credits; sheet generation is 0–3 credits; mention tracking + LLM probes + Firecrawl are 1–15 credits. |
| Per Anthropic + Voyage token | passthrough | Logged in `ai_usage_logs` against the api_key owner's user_id. |

1 credit = $0.01.

The 10-credit per-turn fee covers the orchestration overhead (system prompt, tool routing, conversation memory, streaming). Tools and AI usage are billed at their normal platform rates. There is no "all-included" rate — partner cost scales with what the agent actually does on each turn.

---

## Quickstart

```bash
curl -N -X POST https://<your-project>.supabase.co/functions/v1/agent-chat \
  -H "Authorization: Bearer kai_YOUR_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "agentId": "kai",
    "messages": [
      { "role": "user", "content": "Find me a matte black porcelain tile with a stone-look texture, 60×60." }
    ]
  }'
```

Response is **newline-delimited JSON** (NDJSON). Each line is a single JSON object — parse line by line. Use `curl -N` (no buffering) to see chunks as they arrive.

---

## Request body

```ts
{
  // REQUIRED — Anthropic-style chat history. System prompt is loaded server-side
  // from the agent's database row; do NOT include a 'system' role here.
  messages: Array<{ role: 'user' | 'assistant', content: string }>;

  // REQUIRED — 'kai' or 'interior-designer'. Other values → 403.
  agentId: 'kai' | 'interior-designer';

  // Optional — user-attached images as data URLs (data:image/jpeg;base64,...).
  // Each image is forwarded to Claude as an image_url content block on the
  // last user message.
  images?: string[];

  // Optional — a conversation identifier YOU control. Used to correlate
  // multi-turn calls in our `ai_usage_logs` rows for your billing audit.
  // Pass the same UUID on every call in a thread.
  conversation_id?: string | null;

  // Optional — array of catalog product image URLs (must be hosted by us).
  // Used by the interior-designer agent for multi-reference room generation.
  pinned_material_images?: string[];

  // Optional — toolkit IDs the agent should preload. When null/empty the
  // agent gets Core tools only (search, knowledge_base, inspiration analysis,
  // presentation sheets) plus the `load_toolkit` meta-tool so it can request
  // more on demand.
  selected_toolkits?: string[] | null;

  // Optional — explicit generation-mode override (interior-designer only).
  // Most partners should leave this null and let the agent route on intent.
  generation_mode?: 'restyle' | 'staging' | 'redesign' | null;
}
```

### Injecting partner knowledge-base context

If you want the agent to answer from YOUR knowledge base, do the retrieval on your side and inject the top chunks into the user's message:

```json
{
  "messages": [
    {
      "role": "user",
      "content": "What's the bond strength of our XYZ adhesive on porcelain?\n\n<knowledge_base>\n[chunk 1: ...]\n[chunk 2: ...]\n[chunk 3: ...]\n</knowledge_base>"
    }
  ],
  "agentId": "kai"
}
```

The agent will treat the `<knowledge_base>` block as authoritative context. No server-side change required. You own retrieval, embeddings, and access control on your side; we never touch your DB.

---

## Response — NDJSON chunk stream

Each line is one JSON object. Read the stream until you see `{"type":"done"}`. Possible chunk types:

| `type` | When it fires | Use it for |
|---|---|---|
| `status` | Pre-execution, very first chunk | Show "Initializing..." in your UI |
| `heartbeat` | Every 1s | Keep your HTTP client alive; ignore in UI |
| `tool_call` | Agent invoked a tool | Render "Searching catalog..." UX hint |
| `tool_call_ids` | Tool call IDs mapped | (Internal; safe to ignore) |
| `tool_result` | Tool finished | Render inline result card (see Tool-specific chunks below) |
| `text` | LLM streamed a token chunk | Append to the assistant message bubble |
| `final_result` | Turn complete | Replace the streamed text with the canonical final text; payload also carries `materialResults`, `tool_results`, optional `generation_job` |
| `done` | Stream finished | Close the reader |

### Tool-specific chunks (inline cards in our reference UI)

These emit alongside `tool_result` so your UI can render rich inline cards. Each carries its own payload shape — see the agent's source for the exact schema, or render the raw payload behind a collapsible block.

- `search_spec` — explainable search spec the agent built before searching (color swatches, material/style tags, spec details)
- `inspiration_analysis` — Firecrawl + Haiku design-token extraction from a URL the user shared
- `mention_summary`, `mention_feed`, `mention_tracking_started`, `llm_visibility_result` — mention monitoring cards
- `sheet_canvas_open` — interactive presentation sheet (lighting plan, annotated render, elevation pair) — partner UI needs to mount a canvas widget or present the inputs another way
- `sheet_pdf_ready` — passive presentation sheet (material board, color palette, concept board, F&E schedule, full deck) — payload has `pdf_url` + `page_count`
- `generation_job_created` — async image/video/3D generation kicked off; payload has `job_id` you poll separately

### Final result payload

```json
{
  "type": "final_result",
  "text": "<canonical assistant response>",
  "agentId": "kai",
  "model": "claude-opus-5",
  "materialResults": [ /* if material_search fired */ ],
  "tool_results": [ /* every tool the agent called, with args + result */ ],
  "generation_job": null  // or { job_id, kind, ... } for async generation
}
```

---

## Errors

| Status | Body | Reason |
|---|---|---|
| 401 | `{"error":"Invalid API key"}` | Token not found / inactive |
| 401 | `{"error":"API key expired"}` | `expires_at` in the past |
| 402 | `{"error":"insufficient_credits","required_credits":10,"current_balance":4}` | Balance < per-turn cost. No debit happens. |
| 403 | `{"error":"This API key does not permit access to agent-chat"}` | `allowed_endpoints` excludes this path |
| 403 | `{"error":"Partner API keys may only call agents: kai, interior-designer..."}` | `agentId` rejected (demo / alias) |
| 500 | `{"error":"..."}` | Server-side error. **If this happens before any streaming chunk, the per-turn credit is automatically refunded.** Once streaming starts (any `tool_call`, `text`, `final_result`, etc. has been sent), the credit is non-refundable. |

---

## Tools available in partner mode

Partners run as the `member` role. Available tools:

**Always available**
- `knowledge_base_search` — search our material/product KB
- `material_search` — 7-vector fusion search (text + visual + understanding + 4 aspects)
- `visual_search` — image-as-query catalog search
- `analyze_inspiration_url` — Firecrawl scrape + Haiku design-token extraction → product matching
- `generate_presentation_sheet` — produce moodboard sheets (material_board, color_palette, concept_board, lighting_plan, annotated_render, elevation_render_pair, ffe_schedule, full_deck)
- `seo_research_keyword` — research card for a keyword (DataForSEO + opportunity engine)
- Most SEO toolkit tools (keyword difficulty, SERP audit, domain snapshot, ranked keywords, backlinks, trends, YouTube/Reddit/Pinterest/Amazon/Trustpilot search) — 0-credit user-facing wrappers around DataForSEO
- Mention monitoring tools — `track_product_mentions`, `get_mention_summary`, `check_llm_visibility`, `find_negative_mentions`
- `interior-designer` only — `generate_3d`, `apply_lighting_preset`, `generate_vr_world`

**Blocked for partner keys** (admin/owner-only — server-side gating via the `member` role lock)
- `b2b_manufacturer_search`, `company_website_scrape`, `company_enrichment`, `contact_discovery`, `email_validate`, `save_to_crm`
- `research_analysis`, `analytics_analysis`, `business_analysis`, `product_analysis` (sub-agent orchestration)
- `create_seo_article`, `seo_article_planner`, `seo_article_writer`, `seo_content_analyzer`, `seo_keyword_research`
- `dispatch_background_task`
- `price_lookup`
- Presentation catalog tools (`create_catalog`, `attach_catalog_pdfs`, `extract_from_catalog_pdfs`, `translate_pdf_to_catalog`, `add_material_to_catalog`, `find_image_for_material`, `generate_catalog_pdf`, `publish_catalog`)
- `seo_dataforseo_call` (DataForSEO escape hatch)

If your integration needs anything in the blocked list, contact us — we can either lift the gate on a per-key basis or expose a narrower public surface for that capability.

---

## Operational notes

- **Rate limit**: `rate_limit_override` on the api_keys row caps requests/minute (default 60, max 600). 429 is enforced upstream at the Supabase function gateway, not in this function.
- **Conversation memory**: agent-chat persists conversation history server-side keyed by `conversation_id` (Supabase `conversations` + `conversation_messages` tables). If you pass the same `conversation_id` across turns, the agent will see prior context automatically — you don't need to replay every prior message in `messages`. If you don't pass it (or pass `null`), no server-side memory is written for that thread; you're responsible for sending the full message history yourself.
- **Long-running tools**: some tools (3D generation, VR world generation, full-deck PDF) can take 30s–5min. The agent emits `generation_job_created` immediately with a `job_id` and returns; you poll a separate job-status endpoint for completion. This pattern keeps the agent turn snappy and your HTTP connection from timing out.
- **Multimodal**: pass images as `data:image/jpeg;base64,...` data URLs in the `images` array. Forwarded as `image_url` blocks on the last user message. Recommended max 6 images per turn.
- **No automatic background calls**: agent-chat is purely on-demand. Partners are never billed for cron-driven refreshes of agent state.

---

## OpenAPI

There is no auto-generated OpenAPI spec for this endpoint today — it lives in a Supabase Edge Function (Deno), not the MIVAA FastAPI service that powers `/openapi.json`. A hand-written spec is on the v0.2.0 roadmap. For now, treat this document + the request/response shapes above as the source of truth.

---

## Required api_keys row config

To enable a partner key for agent-chat:

```sql
update public.api_keys
set is_active = true,
    allowed_endpoints = array_append(coalesce(allowed_endpoints, '{}'), '/functions/v1/agent-chat'),
    -- or set allowed_endpoints = null for allow-all (not recommended)
    rate_limit_override = 60
where api_key = 'kai_...';
```

The api_key owner's `user_credits.balance` must cover at least 10 credits at call time.

---

## Comparison with our existing partner APIs

| Trait | `/api/v1/prices/track/*` | `/api/v1/mentions/track/*` | `/functions/v1/agent-chat` |
|---|---|---|---|
| Service | MIVAA FastAPI | MIVAA FastAPI | Supabase Edge (Deno) |
| Auth | `kai_*` Bearer | `kai_*` Bearer | `kai_*` Bearer ✅ same |
| Response | JSON | JSON | NDJSON stream |
| Billing | per-call (2 / 5 / 15 credits) | per-call (2 / 5 / 15 credits) | per-turn (10 credits) + tool passthrough |
| Refund on failure | yes (no-op outcomes) | yes (no-op outcomes) | yes (pre-stream crash only) |
| Auto-generated OpenAPI | yes (`/openapi.json` tag filter) | yes (`/openapi.json` tag filter) | **no** — hand-written reference |
| Background work on partner subjects | none for external keys | none for external keys | none |
