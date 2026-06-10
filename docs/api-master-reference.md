# API Master Reference

Single source of truth for every API surface in the platform. Two layers:

1. **Supabase Edge Functions** (Deno/TypeScript) — 88 functions, base URL `https://bgbavxtjlbvgplozizxu.supabase.co/functions/v1/{name}`
2. **MIVAA Python API** (FastAPI) — 140+ endpoints, base URL `https://v1api.materialshub.gr`

For deep per-endpoint docs see [`docs/api/`](api/) (edge) and [`docs/api-endpoints.md`](api-endpoints.md) (Python).

**Machine-readable specs / Swagger:**
- **Edge Functions** → [`docs/api/openapi-edge.json`](api/openapi-edge.json) (hand-maintained OpenAPI 3.0.3, all 88 functions) · browse via [`docs/api/edge-swagger.html`](api/edge-swagger.html). Regenerate: edit [`scripts/edge-endpoints.json`](../scripts/edge-endpoints.json), run `node scripts/build-openapi-edge.mjs`.
- **MIVAA Python** → FastAPI-generated `https://v1api.materialshub.gr/openapi.json` + Swagger UI at `/docs`. (Edge functions are a separate runtime and are **not** in that spec.)

---

## Auth models

| Model | Header | Who uses it |
|-------|--------|-------------|
| **JWT** | `Authorization: Bearer <supabase_access_token>` | Frontend (normal user sessions) |
| **Service-role** | `Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY>` | Cron jobs, server-to-server, admin-only functions |
| **Webhook signature** | Provider-specific (Svix `svix-signature`, Stripe `stripe-signature`, AWS SNS, Zernio `X-Zernio-Signature`) | Inbound webhooks — no bearer token |
| **API key** | `Authorization: Bearer <MIVAA_API_KEY>` | Server-to-server calls into MIVAA Python backend |
| **Public** | — | Health checks, OAuth callbacks, debug stubs |

All responses use consistent error shape:

```json
{ "success": false, "error": "…", "code": "OPTIONAL_CODE", "details": { } }
```

Common status codes: `200` ok · `201` created · `400` validation · `401` unauth · `403` forbidden · `404` not found · `429` rate-limited · `500` server · `503` upstream unavailable.

Default rate limits: 60 req/min user (standard), 30 req/min user (streaming), webhooks uncapped (verified by signature).

---

## 1. Supabase Edge Functions (88)

Base URL: `https://bgbavxtjlbvgplozizxu.supabase.co/functions/v1/{function-name}`

> Machine-readable: [`docs/api/openapi-edge.json`](api/openapi-edge.json) (browse via [`edge-swagger.html`](api/edge-swagger.html)). The table below is the complete index (auth column: JWT = user session, `kai_*` = partner key, secret = admin `apikey`, cron = `x-cron-secret`, sig = webhook signature, token = share/query token, public = none). The §1.x subsections that follow add call-pattern detail for the high-traffic groups.

### 1.0 Complete edge-function index
<!-- AUTO-DERIVED from scripts/edge-endpoints.json — keep in sync when adding functions. -->
**AI Agents**

| Function | Auth | Summary |
|---|---|---|
| `agent-chat` | JWT / kai_* | Multi-agent LangGraph chat with tool execution and SSE streaming |

**AI Generation**

| Function | Auth | Summary |
|---|---|---|
| `generate-interior-gemini` | JWT | Multi-mode interior design image generation (Gemini, FLUX, Grok) |
| `generate-interior-video-v2` | JWT | Multi-model interior design video generation with async polling fallback |
| `generate-pbr-maps` | JWT | Generate PBR texture maps (albedo, normal, roughness, metalness) from a product image |
| `generate-region-edit` | JWT | Masked inpainting: regenerate a user-painted area of a room image via Grok Aurora |
| `generate-virtual-staging` | JWT | AI virtual staging of an empty room via Replicate proplabs/virtual-staging |
| `generate-vr-world` | JWT | Generate explorable 3D Gaussian Splat VR world from an interior image via WorldLabs Marble |

**Social**

| Function | Auth | Summary |
|---|---|---|
| `generate-social-content` | JWT | Generate platform-optimised social media captions and hashtags via Claude |
| `generate-social-image` | JWT | Generate a social media image via Aurora, Gemini, or FLUX based on content type |
| `generate-social-video` | JWT | Generate a short-form social video via Kling or Veo-2 |
| `zernio-api` | JWT | Social media publishing, OAuth account management, and analytics via Zernio. |
| `zernio-webhook-handler` | sig | Receives Zernio webhooks for social post events and WhatsApp messaging events. |

**Search**

| Function | Auth | Summary |
|---|---|---|
| `ai-rerank` | JWT | Re-rank search results using Claude LLM |

**MIVAA Gateway**

| Function | Auth | Summary |
|---|---|---|
| `mivaa-gateway` | JWT / secret | Authenticated proxy to MIVAA Python backend with per-action credit billing |

**Knowledge Base**

| Function | Auth | Summary |
|---|---|---|
| `kb-generate-embedding` | JWT / secret | Generate or regenerate a Voyage AI 1024D embedding for a kb_docs row |

**Finance**

| Function | Auth | Summary |
|---|---|---|
| `finance-digest-aggregate` | JWT | Send finance digest emails and dispatch quote follow-up bell notifications |
| `finance-fiscal-offline-recovery` | cron | Re-query connector for pending MARK on offline-accepted fiscal documents |
| `finance-inbound-sync` | JWT / cron | Pull inbound documents from myDATA (RequestDocs) for configured workspaces |
| `finance-invoice-pdf` | JWT | Render a legal invoice, credit note, or delivery note as a PDF |
| `finance-issue-invoice` | JWT | Issue, transmit, or POS-complete a fiscal invoice/credit note/delivery note |
| `finance-pay-invoice` | JWT / token / public | Create a Stripe Checkout session or pay-link for an invoice |
| `finance-send-invoice-email` | JWT | Email an invoice to its customer with optional PDF attachment |
| `finance-send-statement` | JWT / cron | Render and email a party account-statement PDF (ledger / Καρτέλα) |
| `finance-storefront` | public | Public online storefront: browse products and submit cart checkout |
| `parse-supplier-cost-list` | JWT | Parse a KB doc supplier cost list and apply costs to matching products |

**Payments**

| Function | Auth | Summary |
|---|---|---|
| `stripe-api` | JWT | Stripe Checkout and Customer Portal session creator |
| `stripe-connect` | JWT | Stripe Connect onboarding and status for per-workspace payouts |
| `stripe-webhooks` | sig | Stripe webhook receiver for subscription, payment, and invoice events |

**Quotes**

| Function | Auth | Summary |
|---|---|---|
| `generate-quote-pdf` | JWT | Generate or return cached PDF for a quote |
| `quote-public-share` | token / public | Public token-based quote share lookup (anonymous-friendly) |
| `quotes-api` | JWT | REST API for quote requests and proposals (customer-facing) |
| `send-quote-email` | JWT | Email a quote to a recipient with a public share link |

**CRM**

| Function | Auth | Summary |
|---|---|---|
| `crm-api` | JWT / secret | REST CRM resource router for companies, contacts, users, and Stripe. |

**Business Profile**

| Function | Auth | Summary |
|---|---|---|
| `myaade-rgwspublic2` | JWT | Greek business lookup by ΑΦΜ via ΑΑΔΕ RgWsPublic2 SOAP service. |
| `role-upgrade-requests` | JWT | Dealer/factory role promotion workflow — submit, approve, and reject requests. |
| `vies-validate` | JWT | Server-side EU VAT validation via the VIES REST API with optional crm_companies cache write. |

**Catalogs**

| Function | Auth | Summary |
|---|---|---|
| `catalog-access` | public | Public email-gate for shared catalog pages (/c/:slug) |
| `catalog-extract-from-pdfs` | JWT | Claude Sonnet vision pass over source PDFs to find materials matching a query |
| `catalog-image-search` | JWT | Find candidate images for a catalog material via platform DB then web fallback |
| `catalog-render-pdf-page` | cron | Proxy to MIVAA rasterize-pdf-page; returns signed URL to a PNG crop of a PDF page |
| `catalog-send-to-customers` | JWT | Admin sends a published catalog to CRM-category recipients via email |
| `catalog-translate-pdf` | JWT | Whole-PDF vision pass to populate a catalog's body_data from a source PDF |
| `generate-catalog-pdf` | JWT | Render a presentation catalog to a PDF and store it in pdf-documents |

**Moodboard & Sheets**

| Function | Auth | Summary |
|---|---|---|
| `generate-moodboard-sheet-pdf` | JWT | Render a moodboard presentation sheet or project client-view to PDF |
| `moodboard-sheet-share` | public | Public token resolver for shared presentation sheets and project client views |

**PDF Processing**

| Function | Auth | Summary |
|---|---|---|
| `pdf-batch-process` | JWT | Queue, status-check, and cancel batch PDF extraction jobs |

**Data Import**

| Function | Auth | Summary |
|---|---|---|
| `field-templates` | JWT | CRUD API for reusable XML field-mapping templates scoped to a workspace. |
| `scheduled-import-runner` | cron | Cron runner that fetches due scheduled XML imports and re-invokes xml-import-orchestrator. |
| `suggest-fields` | JWT | Scrape a product page URL with Firecrawl then use Claude to suggest importable field mappings. |
| `xml-import-orchestrator` | JWT | Parse and import supplier XML feeds; supports field detection, preview, and full import modes. |

**Scraping**

| Function | Auth | Summary |
|---|---|---|
| `crawl-user-website` | JWT / cron | Sitemap-driven indexer for SEO inter-linking; preview or full crawl mode |
| `firecrawl-webhook` | token | Receives async Firecrawl crawl callbacks and persists pages; triggers product creation on completion. |
| `parse-sitemap` | JWT | Fetch and parse a sitemap XML, returning a list of page URLs |
| `scrape-preview` | JWT | Single-URL Firecrawl preview that returns extracted materials and markdown |
| `scrape-session-manager` | JWT | Start, pause, resume, or stop a web-scraping session |
| `scrape-single-page` | JWT | Scrape one page within a scraping session using Firecrawl v2 |

**Email**

| Function | Auth | Summary |
|---|---|---|
| `email-api` | JWT / secret | Action-discriminated email sending, domain management, logs, and analytics via Resend. |
| `email-webhooks` | sig | Receives Resend delivery event webhooks and updates email_logs. |
| `ses-webhook` | sig | Processes SNS notifications from Amazon SES for bounces, complaints, and deliveries. |

**Messaging**

| Function | Auth | Summary |
|---|---|---|
| `messaging-api` | JWT / secret | WhatsApp messaging via Zernio — send, bulk send, channel management, and analytics. |
| `messaging-processor` | cron | Cron-invoked processor that advances scheduled WhatsApp campaigns per-recipient. |

**Pinterest**

| Function | Auth | Summary |
|---|---|---|
| `pinterest-api` | JWT | Pinterest pin import and OAuth board browsing for moodboard population. |

**Notifications**

| Function | Auth | Summary |
|---|---|---|
| `notification-dispatcher` | JWT / secret | Dispatches browser push notifications (VAPID) and signed webhook deliveries with retry. |

**Recommendations**

| Function | Auth | Summary |
|---|---|---|
| `recommendations-api` | JWT / secret | Collaborative filtering interaction tracking, recommendations, and analytics. |

**SEO**

| Function | Auth | Summary |
|---|---|---|
| `seo-api` | JWT / cron | Unified SEO API — action-discriminated keyword research, planning, writing, analysis, and toolkit. |

**Flows**

| Function | Auth | Summary |
|---|---|---|
| `flow-engine` | JWT | Execute, test, or event-trigger workflow automations by walking the xyflow graph. |
| `flow-scheduler-cron` | cron | Per-minute cron that fires scheduled flows whose cron expression matches current UTC time. |
| `flow-webhook` | token | Receives external HTTP requests and routes them to the matching webhook-triggered flow. |

**Alerts**

| Function | Auth | Summary |
|---|---|---|
| `check-material-alerts` | JWT | Daily cron (08:00 UTC) that matches new products against active saved searches and sends bell notifications. |

**Monitoring Crons**

| Function | Auth | Summary |
|---|---|---|
| `job-research-cron` | cron | Hourly cron (at :45) that refreshes due internal job-research tracked jobs via MIVAA. |
| `job-research-digest-cron` | cron | Hourly cron (at :05) that dispatches consolidated daily job-research digest emails per user. |
| `llm-mention-probe-cron` | cron | Daily cron (03:00 UTC) that runs LLM visibility probes for tracked mention subjects. |
| `mention-monitoring-cron` | cron | Hourly cron that refreshes due internal mention-monitoring subjects via MIVAA. |
| `price-monitoring-cron` | cron | Hourly cron that refreshes due internal price-monitoring tracked queries via MIVAA. |

**Background Agents**

| Function | Auth | Summary |
|---|---|---|
| `background-agent-runner` | JWT / secret | Execute a registered background agent by agent_id |

**Crons**

| Function | Auth | Summary |
|---|---|---|
| `agent-scheduler-cron` | cron | Every-minute cron: dispatch background agents whose cron schedule is due |
| `ai-pricing-updater` | cron | Weekly cron (Sunday 00:00 UTC): sync AI model prices from hardcoded reference tables |
| `auto-recovery-cron` | cron | Every-5-minute cron: detect and recover stuck PDF, XML, scraping, and agent runs |
| `campaign-processor` | secret | Every-minute cron: start scheduled campaigns and drip-send emails to recipients |
| `job-cleanup-cron` | cron | Weekly cron (Sunday 03:00 UTC): purge old completed/failed jobs and logs |
| `storage-orphan-cleanup-cron` | cron | Nightly cron (04:00 UTC): delete storage objects with no live DB reference |

**Admin**

| Function | Auth | Summary |
|---|---|---|
| `batch-update-sessions` | JWT | Batch-update field_mappings on multiple scraping_sessions |
| `health-check` | JWT | Check liveness and key validity of all AI providers and external services |
| `platform-secrets-admin` | JWT | CRUD for the platform_secrets key store (admin/super_admin only) |
| `reset-platform` | JWT / secret | Destructively clear all user-generated data while preserving system config |
| `seed-sheet-references` | secret | One-shot admin tool: generate and upload reference preview images for all sheet types |
| `trigger-factory-enrichment` | JWT | Propagate factory fields within a scope and queue a factory-enrichment agent if needed |

**Internal**

| Function | Auth | Summary |
|---|---|---|
| `canonicalize-attributes` | public | Proxy product attribute canonicalization to MIVAA facet service |

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
| `seo-api` | Consolidated SEO toolkit router (research/plan/write/analyze/pipeline + toolkit audit/research handlers) |
| `crawl-user-website` | Sitemap-driven crawler (JWT owner / `x-cron-secret`). Firecrawl-scrapes a user's own site into `user_website_pages` with Voyage 1024D embeddings for SEO interlinking. `mode:'preview'` samples 5 URLs; `mode:'full'` crawls up to `min(max_pages,1000)`. |

Reference: the KAI agent exposes `seo_*` sub-agent tools that call these.

### 1.4 Knowledge Base & Embeddings

| Function | Method | Auth | Purpose |
|----------|--------|------|---------|
| `kb-generate-embedding` | POST | JWT or service-role | Generate Voyage AI 1024D embedding for a `kb_docs` row (triggered on insert/content change). Idempotent via content hash. |
| `canonicalize-attributes` | POST | internal (agents) | Thin proxy → MIVAA `/api/admin/facets/canonicalize`. Called by `material-tagger` / `product-enrichment` agents to canonicalize raw product attributes (3-layer facet pipeline: normalize → Voyage cosine cluster → `facet_canonical_values`). Local-fast-path then external MIVAA URL. |

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
| `messaging-processor` | every 1 min | Batches outbound WhatsApp campaign sends (Zernio) |
| `finance-fiscal-offline-recovery` | hourly | Backfills myDATA MARK on offline-queued documents (Novus `RequestTransmittedDocs`) |
| `finance-inbound-sync` (cron mode) | scheduled | Pulls AADE `RequestDocs` into `inbound_documents` |
| `finance-digest-aggregate` | scheduled | AR/AP + P&L + follow-up digest email |

### 1.7 CRM

All JWT-authenticated. Role-gated (admin/manager/factory for mutations).

| Function | Methods | Purpose | Deep docs |
|----------|---------|---------|-----------|
| `crm-api` | GET/POST/PATCH/DELETE | **Consolidated CRM router** — `companies` / `contacts` / `users` / `stripe` by first path segment (the former separate `crm-*-api` functions were merged) | [crm-api](api/crm-api.md) |

### 1.8 Stripe / billing

| Function | Method | Auth | Purpose |
|----------|--------|------|---------|
| `stripe-checkout` | POST | JWT | Create checkout session for credit packages and subscription plans |
| `stripe-customer-portal` | POST | JWT | Create customer portal session (subscription / payment method mgmt) |
| `stripe-webhooks` | POST | signature | Handle Stripe events — sub created/updated/cancelled, invoice paid, payment failed. See [stripe-webhooks-api](api/stripe-webhooks-api.md) |

### 1.9 Messaging (email / WhatsApp)

WhatsApp moved from Twilio (SMS+WA) to **Zernio** (WhatsApp via Meta Cloud API) on 2026-06-08; SMS removed.

| Function | Method | Auth | Purpose | Deep docs |
|----------|--------|------|---------|-----------|
| `email-api` | POST | JWT | Send transactional email via AWS SES. Templates, analytics, domain verification. | [email-api](api/email-api.md) |
| `messaging-api` | POST | JWT | Send WhatsApp via Zernio. Actions: `send`, `create-campaign`, `connect-whatsapp`, `sync-channels`, conversation/reply ops. | [messaging-api](api/messaging-api.md) |
| `messaging-processor` | POST | service-role | WhatsApp campaign batch dispatcher (cron-invoked, see §1.6) | — |
| `zernio-webhook-handler` | POST | signature (Zernio) | One webhook for social `post.*` + WhatsApp `message.*` (delivery + reply capture) | [zernio-social-api](api/zernio-social-api.md) |
| `email-webhook` | POST | signature (Resend) | Campaign email events (delivered/bounced/opened/clicked) | — |
| `email-webhooks` | POST | signature (Svix/Resend) | Transactional email events | — |
| `ses-webhook` | POST | signature (SNS) | Amazon SES bounce/complaint notifications | — |

### 1.9b Finance (Greek e-invoicing, AADE/myDATA)

Multi-tenant (tenant = workspace). Gated on the `sales-finance` module entitlement. 2 credits per myDATA transmission (root free). Full reference: [finance-api](api/finance-api.md) · architecture [finance-system](finance-system.md), [pos-retail-system](pos-retail-system.md), [online-storefront](online-storefront.md).

| Function | Method | Auth | Purpose |
|----------|--------|------|---------|
| `finance-issue-invoice` | POST | JWT (finance roles) | Create-from-quote, issue (series/AA), transmit to AADE via Novus, POS card/IRIS, credit/delivery notes |
| `finance-invoice-pdf` | POST | JWT | Render A4 PDF (invoice / credit note / delivery note) |
| `finance-pay-invoice` | POST | JWT or public `pay_token` | Pay link / Stripe Checkout session (Connect-routed) |
| `finance-send-invoice-email` | POST | JWT | Email invoice PDF via `email-api` |
| `finance-send-statement` | POST | JWT / `x-cron-secret` | Party ledger (καρτέλα) PDF + email; cron auto-statements |
| `finance-inbound-sync` | POST | JWT / `x-cron-secret` | Pull AADE `RequestDocs` into `inbound_documents` |
| `finance-fiscal-offline-recovery` | POST | `x-cron-secret` | Backfill MARK on offline documents |
| `finance-digest-aggregate` | POST | Flows / `x-cron-secret` / admin | AR/AP + P&L + follow-up digest |
| `finance-storefront` | POST | public (slug) | Mini-store meta/products/checkout |
| `stripe-connect` | POST | owner/admin JWT | Workspace Stripe Express onboarding/status |

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
| Finance | `/api/v1/...` (edge) | Greek e-invoicing / AADE myDATA via Novus, AR/AP, POS, storefront — see §1.9b + [finance-api](api/finance-api.md) |
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
