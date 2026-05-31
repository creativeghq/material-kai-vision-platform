# API Master Reference

Single source of truth for every API surface in the platform. Two layers:

1. **Supabase Edge Functions** (Deno/TypeScript) — 68 functions, base URL `https://bgbavxtjlbvgplozizxu.supabase.co/functions/v1/{name}`
2. **MIVAA Python API** (FastAPI) — 140+ endpoints, base URL `https://v1api.materialshub.gr`

For deep per-endpoint docs see [`docs/api/`](api/) (edge) and [`docs/api-endpoints.md`](api-endpoints.md) (Python).

---

## Auth models

| Model | Header | Who uses it |
|-------|--------|-------------|
| **JWT** | `Authorization: Bearer <supabase_access_token>` | Frontend (normal user sessions) |
| **Service-role** | `Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY>` | Cron jobs, server-to-server, admin-only functions |
| **Webhook signature** | Provider-specific (Svix `svix-signature`, Stripe `stripe-signature`, Twilio `x-twilio-signature`, AWS SNS, Zernio) | Inbound webhooks — no bearer token |
| **API key** | `Authorization: Bearer <MIVAA_API_KEY>` | Server-to-server calls into MIVAA Python backend |
| **Public** | — | Health checks, OAuth callbacks, debug stubs |

All responses use consistent error shape:

```json
{ "success": false, "error": "…", "code": "OPTIONAL_CODE", "details": { } }
```

Common status codes: `200` ok · `201` created · `400` validation · `401` unauth · `403` forbidden · `404` not found · `429` rate-limited · `500` server · `503` upstream unavailable.

Default rate limits: 60 req/min user (standard), 30 req/min user (streaming), webhooks uncapped (verified by signature).

---

## 1. Supabase Edge Functions (68)

Base URL: `https://bgbavxtjlbvgplozizxu.supabase.co/functions/v1/{function-name}`

### 1.1 AI Agents & Chat

| Function | Method | Auth | Purpose | Deep docs |
|----------|--------|------|---------|-----------|
| `agent-chat` | POST (SSE) | JWT | Unified multi-agent chat (kai / interior-designer / demo). RBAC-gated tools, multimodal, skills. | [agent-chat-api](api/agent-chat-api.md), [agent-system](agent-system.md) |
| `agent-chat-debug` | POST | public | Dev-only echo/debug stub | — |
| `background-agent-runner` | POST | JWT or service-role | Universal executor for `kai-task`, `product-enrichment`, `material-tagger`, `factory-enrichment`, `social-analytics-sync`, `social-insights-sync`. Accepts `?catalog=1` GET for type listing. | [background-agents](background-agents.md) |

### 1.2 AI Generation (image / video / 3D / VR / PBR)

| Function | Method | Auth | Purpose | Credits | Deep docs |
|----------|--------|------|---------|---------|-----------|
| `generate-interior-gemini` | POST | JWT | 4 modes: text-to-image / image-edit / floor-plan-render / floor-plan-text. Two-step style-transfer pipeline. | 6 (flash) / 15 (pro) | [generate-interior-gemini-api](api/generate-interior-gemini-api.md) |
| `generate-interior-video-v2` | POST | JWT | Auto-routes by video type to Veo-2, Kling v3.0, Wan 2.1, Runway Gen4. Async polling. | 12–40 | [generate-interior-video-v2-api](api/generate-interior-video-v2-api.md) |
| `generate-virtual-staging` | POST | JWT | Furnishes empty room photos (Replicate proplabs, 8 room types × 8 styles). | 20 | [generate-virtual-staging-api](api/generate-virtual-staging-api.md) |
| `generate-region-edit` | POST | JWT | Masked inpainting with Grok Aurora. SAM 2 auto-mask + Pillow fallback. | 20 | [generate-region-edit-api](api/generate-region-edit-api.md) |
| `generate-vr-world` | POST | JWT | WorldLabs Marble → 3D Gaussian Splat worlds (models: `marble-1.0-draft` / `marble-1.1`). Stored in `vr_worlds`. | 18 / 190 | [vr-world-generation](vr-world-generation.md) |
| `generate-pbr-maps` | POST | JWT | PBR texture maps (albedo / normal / roughness / metalness) for AR preview. | 8 | [ar-material-preview](ar-material-preview.md) |
| `generate-quote-pdf` | POST | JWT | Branded quote PDFs with cover/backcover templates from `quote-templates` storage bucket. | — | — |

### 1.3 SEO suite (admin/owner only)

All POST, all JWT-authenticated.

| Function | Purpose |
|----------|---------|
| `seo-research` | Keyword research via DataForSEO (6 parallel API calls, volumes + SERP analysis) |
| `seo-plan` | Generate article structure + meta tags + FAQ schema from research output |
| `seo-write` | Full article generation from plan via Claude Opus |
| `seo-analyze` | 15+ SEO quality checks; auto-fix issues via Gemini |
| `seo-pipeline` | Orchestrator: research → plan → write → analyze in one call |

Reference: the KAI agent exposes `seo_*` sub-agent tools that call these.

### 1.4 Knowledge Base & Embeddings

| Function | Method | Auth | Purpose |
|----------|--------|------|---------|
| `kb-generate-embedding` | POST | JWT or service-role | Generate Voyage AI 1024D embedding for a `kb_docs` row (triggered on insert/content change). Idempotent via content hash. |

### 1.5 Search & Re-rank

| Function | Method | Auth | Purpose | Deep docs |
|----------|--------|------|---------|-----------|
| `ai-rerank` | POST | JWT | Claude-powered re-ordering of search results. Opus/Haiku model choice, optional per-item explanations. | [ai-rerank-api](api/ai-rerank-api.md) |

### 1.6 Background agents & cron jobs

All service-role-authenticated (pg_cron invokes them). No user-facing API.

| Function | Schedule | Purpose |
|----------|----------|---------|
| `agent-scheduler-cron` | every 1 min | Dispatches background agents whose cron schedule is due |
| `auto-recovery-cron` | every 5 min | Re-dispatches stuck runs (>8 min no heartbeat, <3 recovery attempts); marks `failed` after 3 |
| `job-cleanup-cron` | weekly | Purges old jobs, logs, stale progress (retention 5–90 days per table) |
| `flow-scheduler-cron` | every 1 min | Runs due scheduled flows |
| `ai-pricing-updater` | weekly | Syncs AI model pricing from provider sources into `ai_model_pricing` |
| `campaign-processor` | every 1 min | Dispatches scheduled email campaigns via Resend (rate-limited 8/min) |
| `check-material-alerts` | daily | Runs saved-search queries, emails matching results to subscribers |
| `price-monitoring-cron` | every 4 hr | Executes due price checks against competitor URLs |
| `scheduled-import-runner` | every 5 min | Runs due XML imports |
| `messaging-processor` | every 1 min | Batches outbound SMS/WhatsApp (10/batch, Twilio) |

### 1.7 CRM

All JWT-authenticated. Role-gated (admin/manager/factory for mutations).

| Function | Methods | Purpose | Deep docs |
|----------|---------|---------|-----------|
| `crm-companies-api` | GET/POST/PATCH/DELETE | Companies CRUD + contact linking + search | [crm-companies-api](api/crm-companies-api.md) |
| `crm-contacts-api` | GET/POST/PATCH/DELETE | Contacts CRUD + user linking + custom fields | [crm-contacts-api](api/crm-contacts-api.md) |
| `crm-users-api` | GET/POST/PATCH | User account + workspace + role management (admin only) | [crm-users-api](api/crm-users-api.md) |
| `crm-stripe-api` | GET | Stripe invoice / subscription history for CRM contacts | [crm-stripe-api](api/crm-stripe-api.md) |

### 1.8 Stripe / billing

| Function | Method | Auth | Purpose |
|----------|--------|------|---------|
| `stripe-checkout` | POST | JWT | Create checkout session for credit packages and subscription plans |
| `stripe-customer-portal` | POST | JWT | Create customer portal session (subscription / payment method mgmt) |
| `stripe-webhooks` | POST | signature | Handle Stripe events — sub created/updated/cancelled, invoice paid, payment failed. See [stripe-webhooks-api](api/stripe-webhooks-api.md) |

### 1.9 Messaging (email / SMS / WhatsApp)

| Function | Method | Auth | Purpose | Deep docs |
|----------|--------|------|---------|-----------|
| `email-api` | POST | JWT | Send transactional email via AWS SES. Templates, analytics, domain verification. | [email-api](api/email-api.md) |
| `messaging-api` | POST | JWT | Send SMS / WhatsApp via Twilio. Actions: `send`, `create-campaign`, Twilio Content API for WA templates. | [messaging-api](api/messaging-api.md) |
| `messaging-processor` | POST | service-role | Batch dispatcher (cron-invoked, see §1.6) | — |
| `messaging-webhook` | POST | signature (Twilio) | Delivery status callbacks (delivered/failed/read receipts) | — |
| `email-webhook` | POST | signature (Resend) | Campaign email events (delivered/bounced/opened/clicked) | — |
| `email-webhooks` | POST | signature (Svix/Resend) | Transactional email events | — |
| `ses-webhook` | POST | signature (SNS) | Amazon SES bounce/complaint notifications | — |

### 1.10 Quotes

| Function | Methods | Auth | Purpose | Deep docs |
|----------|---------|------|---------|-----------|
| `quotes-api` | GET/POST/PATCH/DELETE | JWT | Quote CRUD + proposal lifecycle + FF&E fields (room, dimensions, installation, delivery) + pricing audit fields on `quote_items` (`price_source`, `price_lookup_call_id`). Actions: `list`, `create`, `update`, `delete`, `addItem`, `addCustomItem`. | [quotes-api](api/quotes-api.md) |

### 1.10.1 Pricing (admin-only, 2026-04)

| Surface | Method | Auth | Purpose | Deep docs |
|---------|--------|------|---------|-----------|
| `agent-chat` tool `price_lookup` | POST (SSE) | JWT (admin/owner) | AI-mode price composition from the KB "Pricing" category. Emits `tool_call_ids`, `price_lookup_matches`, `price_proposal` chunks. | [pricing-api](api/pricing-api.md) |
| `mivaa-gateway` action `search_knowledge_base` + `category_slug:"pricing"` | POST | JWT (admin) | Quick-pick direct semantic search — no LLM cost | ↑ |
| PostgREST `/rest/v1/product_prices` | POST / PATCH | JWT (admin/owner via RLS) | Commit confirmed prices with source doc IDs and `price_lookup_call_id` audit link | ↑ |
| PostgREST `/rest/v1/quote_items` | PATCH | JWT (admin/owner via RLS) | Writes `unit_price` + `price_source` + `price_lookup_call_id` for auditable quote pricing | ↑ |

### 1.11 Social (Zernio)

| Function | Method | Auth | Purpose | Deep docs |
|----------|--------|------|---------|-----------|
| `zernio-api` | GET/POST | JWT | Unified router; `action` selects handler — oauth (`connect`/`callback`/`disconnect`/`list`), publish (`publish_now`/`schedule`), analytics (`get_post_analytics`/`get_account_insights`/`get_best_time`). Publishes to 8 platforms via Zernio. | [zernio-social-api](api/zernio-social-api.md) |
| `zernio-webhook-handler` | POST | signature (`X-Zernio-Signature`) | Receives `post.published` / `post.partial` / `post.failed` / `post.cancelled` / `post.scheduled` / `account.disconnected` | ↑ |
| `generate-social-content` | POST | JWT | 3 caption variants + hashtags per platform | ↑ |
| `generate-social-image` | POST | JWT | Routes to best image model (Aurora / Gemini / FLUX) by content type | ↑ |
| `generate-social-video` | POST | JWT | Short-form video (Kling / Veo2 via Replicate) | ↑ |

### 1.12 Pinterest

| Function | Method | Auth | Purpose |
|----------|--------|------|---------|
| `pinterest-oauth` | POST | JWT | Actions: `get-auth-url`, `callback`, `get-boards`, `get-board-pins`, `disconnect`. Token stored in `social_accounts`. |
| `pinterest-import` | POST | JWT or public | Actions: `extract-pin`, `import-pin`, `import-pins-bulk`. Also works pre-OAuth via oEmbed. |

### 1.13 Price monitoring

| Function | Method | Auth | Purpose |
|----------|--------|------|---------|
| `price-monitoring` | POST | JWT | Actions: `start-monitoring`, `stop-monitoring`, `check-now`, `get-status`. See [price-monitoring-cron-api](api/price-monitoring-cron-api.md) for cron variant. |
| `POST /api/v1/prices/lookup` | POST | API key (Bearer) | **Public curl-callable** one-shot price lookup. Two modes: `url` (Firecrawl) or `search_query` (Perplexity Sonar). Rate-limited per key. Does NOT create a monitoring subscription. |
| `POST /api/v1/prices/track` | POST | API key (Bearer) | **External project integration** — register a tracked query (search_query + country_code + refresh_interval_hours). First refresh runs synchronously; subsequent refreshes via cron on the caller's cadence. CASCADE-deletes on api_key deletion. |
| `GET /api/v1/prices/track` | GET | API key (Bearer) | List all tracked queries owned by this api_key. |
| `GET /api/v1/prices/track/{id}` | GET | API key (Bearer) | Get one tracked query + latest retailer results. |
| `GET /api/v1/prices/track/{id}/history` | GET | API key (Bearer) | Full price-point history across all refresh runs. |
| `PUT /api/v1/prices/track/{id}` | PUT | API key (Bearer) | Update cadence, country, or preferred retailer domains. |
| `POST /api/v1/prices/track/{id}/refresh` | POST | API key (Bearer) | Force refresh now (bypasses cadence). |
| `DELETE /api/v1/prices/track/{id}` | DELETE | API key (Bearer) | Soft delete (`is_active=false`); history preserved. Hard delete by revoking the api_key. |
| `POST /api/v1/price-monitoring/discover` | POST | User JWT | Internal: Perplexity + DataForSEO + Firecrawl discovery for a monitored product (UI-triggered). 6h throttle; admin `force_refresh` bypass. Every row now carries `match_kind` (product-identity verdict), `product_title`, and optional `original_price` / `verified`. |
| `POST /api/v1/price-monitoring/market-check` | POST | User JWT (admin) | Stateless one-shot market scan used by the KB-price drawer. Reuses the monitoring snapshot when the product is already enrolled and ≤6h old (`from_monitoring_cache=true`, 0 credits). Returns `stats {min, median, max, count, verified_count, currency}` computed over exact matches only. |
| `POST /api/v1/price-monitoring/tracked-queries/cron-refresh` | POST | `x-cron-secret` | Internal cron: refreshes all due `tracked_queries` rows. Called hourly from the Supabase price-monitoring-cron edge function. |

**Full external-API reference**: [docs/api/price-monitoring-api.md](api/price-monitoring-api.md) — auth, schemas, error codes, curl/TypeScript/Python recipes.

### 1.14 Data import & scraping

| Function | Method | Auth | Purpose |
|----------|--------|------|---------|
| `xml-import-orchestrator` | POST | JWT | Intelligent XML imports with AI field mapping. See [xml-import-orchestrator-api](api/xml-import-orchestrator-api.md) |
| `scheduled-import-runner` | POST | service-role | Cron runner (see §1.6) |
| `scrape-session-manager` | POST | JWT | Multi-page scrape sessions (start/pause/resume/stop). See [scrape-session-manager-api](api/scrape-session-manager-api.md) |
| `scrape-preview` | POST | JWT | Preview materials from URL before full import |
| `scrape-single-page` | POST | JWT | Extract materials from a single URL with custom schema |
| `parse-sitemap` | POST | JWT | Parse `sitemap.xml` and enumerate URLs |
| `firecrawl-webhook` | POST | signature | Receive async crawl results from Firecrawl |
| `field-templates` | GET/POST/PATCH | JWT | Field-mapping template CRUD (reusable across imports) |
| `suggest-fields` | POST | JWT | AI-suggested field mappings by analyzing website HTML |
| `pdf-batch-process` | POST | JWT | Batch PDF upload → MIVAA extraction. See [pdf-batch-process-api](api/pdf-batch-process-api.md) |

### 1.15 Flows

| Function | Method | Auth | Purpose | Deep docs |
|----------|--------|------|---------|-----------|
| `flow-engine` | POST | JWT | Execute / test / dry-run flows. Template variable resolution. | [flow-engine-api](api/flow-engine-api.md) |
| `flow-scheduler-cron` | POST | service-role | Cron runner (see §1.6) | ↑ |
| `flow-webhook` | POST | signature | Routes external HTTP webhooks to matching flows | ↑ |

### 1.16 Admin & maintenance

| Function | Method | Auth | Purpose |
|----------|--------|------|---------|
| `reset-platform` | POST | service-role | Wipes derived data + VECS + MIVAA `/tmp`, preserves accounts/KB/CRM/prompts. See [deployment-guide § Platform Reset](deployment-guide.md#-platform-reset-admin-destructive-operation) |
| `health-check` | GET | public | Aggregated status: AI providers + MIVAA + external APIs |
| `batch-update-sessions` | POST | JWT + admin key | Admin bulk-update of scraping sessions |
| `trigger-factory-enrichment` | POST | service-role | Propagate factory data, queue enrichment job if needed |
| `notification-dispatcher` | POST | JWT | Send push notifications + webhook deliveries |
| `mivaa-gateway` | POST | JWT or API key | Thin auth-passthrough to MIVAA Python backend (see §2). See [mivaa-gateway-api](api/mivaa-gateway-api.md) |

---

## 2. MIVAA Python API (FastAPI, 140+ endpoints)

Base: `https://v1api.materialshub.gr`
Auth: `Authorization: Bearer <JWT>` (Supabase JWT passed through via `mivaa-gateway`) OR `Authorization: Bearer <MIVAA_API_KEY>` for server-to-server.

Live interactive docs:
- Swagger UI — `https://v1api.materialshub.gr/docs`
- ReDoc — `https://v1api.materialshub.gr/redoc`
- OpenAPI JSON — `https://v1api.materialshub.gr/openapi.json`

Full endpoint-by-endpoint reference: [api-endpoints.md](api-endpoints.md) (1940 lines, all 19 route groups).

### High-level route groups

| Group | Prefix | Purpose |
|-------|--------|---------|
| Core | `/health`, `/status` | Liveness / readiness |
| RAG | `/api/rag/*` | **Consolidated**: upload, search (`?strategy=multi_vector\|semantic\|vector\|hybrid\|image\|color\|texture\|style\|material_type`), query, relationships |
| Knowledge Base | `/api/kb/*` | Document CRUD with auto-embedding (Voyage AI 1024D), categories, attachments, versions, comments, search analytics |
| Admin | `/api/admin/*` | Management ops. Incl. `POST /api/system/cleanup-temp-files?max_age_hours=0&dry_run=false` used by reset-platform |
| Search | `/api/search/*` | Lower-level search primitives (usually use `/api/rag/search` instead) |
| Document Entities | `/api/document-entities/*` | Certificates, logos, specifications extracted from PDFs |
| Products | `/api/products/*` | Product CRUD, embeddings status, deduplication |
| Images | `/api/images/*` | Incl. `POST /api/images/reclassify/{image_id}` — re-run AI material vs non-material classification |
| Embeddings | `/api/embeddings/*` | Manual embedding generation, backfill |
| Metadata | `/api/metadata/*` | Scope detection, field application, stats (4 endpoints) |
| Duplicate Detection | `/api/duplicates/*` | Factory-based duplicate detection, product merging |
| Agents (Python) | `/api/agents/*` | Backend agent execution — edge `background-agent-runner` delegates here via `DelegateToMivaaError` for >25s tasks |
| Internal | `/api/internal/*` | Admin observability. Incl. `GET /api/internal/document-extraction-status/{document_id}` (Document Health panel) and `POST /api/internal/run-catalog-knowledge/{document_id}?force=true` (re-run Layer 1/2) |
| Data Import | `/api/import/*` | XML import with AI field mapping, web scraping, field templates |
| Messaging | `/api/messaging/*` | SMS/WhatsApp (backend Twilio bridge) |
| Modules | `/api/v1/modules/*` | Module-system control + per-module routers — see §2.1 below |

### 2.1 Module system

The platform is divided into 7 toggleable modules. Frontend modules live in `src/modules/<slug>/`; MIVAA-backed modules live in `mivaa-pdf-extractor/app/modules/<slug>/`. Each module's row in `public.modules` controls whether its routes/agents/tools/cards appear at runtime. Toggle from `/admin/modules`.

| Module slug | Frontend | MIVAA backend | Edge tier |
|---|---|---|---|
| `greek-marketplaces` | yes | yes (3 routes mounted at `/api/v1/modules/greek-marketplaces/*`) | no |
| `crm` | yes | no | edge fns: `crm-{users,contacts,companies,stripe}-api` |
| `email` | yes | no | edge fns: `email-api`, `email-webhook(s)`, `campaign-processor`, `ses-webhook` |
| `messaging` | yes | yes (`/api/messaging/*`) | edge fns: `messaging-api`, `messaging-processor`, `messaging-webhook` |
| `quotes` | yes | no | edge fns: `quotes-api`, `generate-quote-pdf` |
| `notifications` | yes (header bell-icon) | no | edge fn: `notification-dispatcher` |
| `social-media` | yes | no | edge fns: `zernio-api`, `zernio-webhook-handler`, `generate-social-{content,image,video}` + 11 LLM tool factories under `_shared/modules/social-media/` |

**Top-level MIVAA endpoints owned by the module system (always present, regardless of which modules are enabled):**

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| `POST` | `/api/v1/modules/_invalidate` | JWT (admin) | Drop the in-process enabled-flag cache. Called by `/admin/modules` toggle UI so backend picks up the change in ~1s instead of waiting up to 5min for the cache TTL. |

**Greek Marketplaces module** (only mounted when `slug='greek-marketplaces'` is enabled):

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| `GET` | `/api/v1/modules/greek-marketplaces/status` | JWT (admin) | Source credential check + 7-day usage stats (Skroutz / Bestprice / Shopflix) |
| `POST` | `/api/v1/modules/greek-marketplaces/search` | JWT (admin) | One-off admin test query against all 3 adapters in parallel |

For the platform-wide architecture (manifest contract, slot patterns, agent gating), see [.claude/plans/modular-architecture.md](../.claude/plans/modular-architecture.md) and [.claude/plans/modules-extraction-roadmap.md](../.claude/plans/modules-extraction-roadmap.md).

---

## 3. Typical call patterns

### Frontend (browser) → Edge function

```ts
import { supabase } from '@/integrations/supabase/client';

const { data: { session } } = await supabase.auth.getSession();

// Via supabase-js helper (recommended)
const { data, error } = await supabase.functions.invoke('quotes-api', {
  body: { action: 'list', workspaceId },
});

// Or raw fetch (needed for SSE streams like agent-chat)
const res = await fetch(
  'https://bgbavxtjlbvgplozizxu.supabase.co/functions/v1/agent-chat',
  {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${session?.access_token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ messages, agentId: 'kai', images: [] }),
  },
);
```

### Frontend → MIVAA (via gateway)

Always go through `mivaa-gateway` — it injects the shared `MIVAA_API_KEY` and handles CORS. Do not call `v1api.materialshub.gr` directly from the browser.

```ts
import { mivaaApi } from '@/services/mivaaApiClient';

const result = await mivaaApi.get(
  `/api/internal/document-extraction-status/${documentId}`,
);
```

### Server-to-server (edge function → MIVAA)

```ts
const res = await fetch(`${MIVAA_GATEWAY_URL}/api/agents/run`, {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${MIVAA_API_KEY}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ job_type, input }),
});
```

---

## 4. Related docs

- [api/README.md](api/README.md) — per-edge-function deep docs index
- [api-endpoints.md](api-endpoints.md) — MIVAA Python endpoint-by-endpoint reference
- [api-docs.md](api-docs.md) — MIVAA search-strategy focused reference
- [api/swagger.md](api/swagger.md) — OpenAPI/Swagger export
- [agent-system.md](agent-system.md), [background-agents.md](background-agents.md), [flow-engine.md](flow-engine.md), [deployment-guide.md](deployment-guide.md)

---

**Last Updated:** April 15, 2026
