# API Documentation

This directory contains per-function deep docs for Supabase Edge Function APIs.

> **📑 Looking for the master list?** See [**api-master-reference.md**](../api-master-reference.md) — single page covering all **107 edge functions + MIVAA Python endpoints** (auth models, categories, call patterns). Start there if you're integrating; come here for endpoint details.
>
> **🧪 Machine-readable / Swagger.** Three OpenAPI surfaces cover the platform:
> 1. **MIVAA Python API** — FastAPI-generated spec at `https://v1api.materialshub.gr/openapi.json` (Swagger UI `/docs`). Auto-generated; nothing to maintain.
> 2. **Supabase Edge Functions (Deno)** — **not** in MIVAA's spec; their own OpenAPI at [**openapi-edge.json**](../../public/api/openapi-edge.json), browsable via [**edge-swagger.html**](../../public/api/edge-swagger.html). Covers all **107 edge functions**. (Single source: `public/api/` — committed to git AND served live; there is no second copy under `docs/api/`.)
> 3. **Supabase PostgREST (tables/views/RPCs)** — PostgREST auto-serves a Swagger 2.0 spec at the REST root `https://<project>.supabase.co/rest/v1/`. **As of 2026-06 this endpoint is locked to the `service_role` key** (anon/publishable keys get `401 "Only the service_role API key can be used for this endpoint"`), so fetch it server-side: `curl -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" https://<project>.supabase.co/rest/v1/` → ~2.9 MB, 700+ paths / 340+ RPCs (includes every table + RPC, e.g. the Workstream-F `platform_suppliers` / `supplier_claim_requests` / `request_supplier_claim`). It's auto-generated from the live schema — fetch on demand rather than committing the blob.
>
> **Live URLs** (served from the frontend's `public/api/` after the next build+deploy; `/api/*` is excluded from the SPA rewrite in `vercel.json`):
> - Swagger UI → `https://app.materialshub.gr/api/edge-swagger.html`
> - Spec JSON → `https://app.materialshub.gr/api/openapi-edge.json`
>
> Regenerate the **edge** spec after changing a function: edit [`scripts/edge-endpoints.json`](../../scripts/edge-endpoints.json), run `npm run openapi:edge` (or `node scripts/build-openapi-edge.mjs`). It writes `public/api/openapi-edge.json` AND regenerates the complete edge-function index + count in [`api-master-reference.md`](../api-master-reference.md) (between the `AUTO-INDEX` markers) from the same single source, so the spec and the human index cannot drift apart.

## Overview

All APIs are implemented as Supabase Edge Functions running on Deno and are accessible via:

**Base URL:** `https://bgbavxtjlbvgplozizxu.supabase.co/functions/v1/`

## Available APIs

### Core Business APIs

#### [Email API](./email-api.md)
Email sending, domain verification, and analytics using **Resend** (migrated 2026-03-11; webhooks via `email-webhooks`, Svix signature).
- **Function:** `email-api` (+ `email-webhooks` for delivery/bounce events)
- **Features:** Template-based emails, domain verification, analytics, sending stats, per-workspace Resend BYOK
- **Access:** Authenticated users

#### [Messaging API](./messaging-api.md)
WhatsApp messaging via **Zernio** (Meta Cloud API). SMS + the former Twilio integration were removed 2026-06-08.
- **Functions:** `messaging-api`, `zernio-webhook-handler` (shared with social)
- **Features:** WhatsApp templates, per-recipient campaigns, reply capture + assign-on-reply, delivery tracking. Requires Zernio's Inbox add-on for sending.
- **Access:** Authenticated users

#### [CRM API](./crm-api.md)
Consolidated CRM — the `crm-api` edge function routes by first path segment to `companies` / `contacts` / `users` / `stripe` handlers. (The former separate `crm-companies-api` / `crm-contacts-api` / `crm-users-api` / `crm-stripe-api` functions were merged into one.)
- **Functions:** `crm-api`, plus `crm-lead-score`, `company-enrich`, `crm-meeting-reminders`
- **Features:** Company + contact CRUD, multiple named addresses and phone numbers per party, user/contact linking, potential-matches, platform user admin, Stripe customer/subscription/credits state, meetings + reminders, shared record-activity feed
- **Enrichment:** one shared research chain — ΑΑΔΕ → ΓΕΜΗ → web/Apollo enrichment — behind a single `researchCompany()` entry point, reachable from every CRM surface and from the agent. ΓΕΜΗ is paced to its published 8-requests-per-minute budget and **stops** rather than retrying; a throttle response is never cached as "company not found".
- **Lead scoring:** `crm-lead-score` is the canonical platform scorer. It writes the shared `crm_contacts.lead_score` + `health_score` so CRM, Sales and Real Estate render the same number instead of three private ones. Anthropic tool-use (`emit_lead_score`) keeps the verdict schema-locked; credit-metered reserve→settle with a 3-credit ceiling and automatic refund on empty output.
- **Access:** Admin / Factory (per resource); `manager` role removed 2026-05-23

#### [Quotes API](./quotes-api.md)
Quote requests and proposal management.
- **Function:** `quotes-api`
- **Features:** Quote requests, proposals, status tracking, **price audit fields** (`price_source`, `price_lookup_call_id`), `product_prices` cache table, **revision chain** (`parent_quote_id` + `revision_number`)
- **Access:** Authenticated users (admin/owner for pricing fields)

#### [Project Workspace API](./projects-api.md) <span style="color:#ec4899">(NEW — 2026-05-24)</span>
Container above moodboards and quotes for one engagement — rooms, budget vs actual, tasks (with subtasks), revisions, append-only timeline, passwordless email collaborator invites.
- **Endpoint surface:** MIVAA Python — `/api/v1/projects/*` (16 endpoints across project CRUD, rooms, tasks, collaborators, events)
- **Auth:** `Authorization: Bearer kai_*` (same `api_keys` flow as price / mention / job tracking)
- **Tag in OpenAPI:** `Project Workspace (Public API)` — filter at https://v1api.materialshub.gr/docs
- **Credits:** writes 0 cr (DB-only) except `invite_collaborator` = 1 cr (covers the transactional email)
- **Module doc:** [docs/projects.md](../projects.md) — full architecture, RLS, triggers, frontend integration
- **Access:** Authenticated users (every project / room / task / collaborator scoped to the API key's user via RLS)

#### [Pricing API](./pricing-api.md) <span style="color:#ec4899">(NEW — 2026-04)</span>
Admin-only API for sourcing, composing, and committing prices from the
"Pricing" Knowledge Base category. Covers: category setup, ingesting price
docs, AI-mode lookup via `price_lookup` agent tool, quick-pick direct
search, commit flow, and audit trail.
- **Endpoints used:** `agent-chat` (AI mode), `mivaa-gateway` action
  `search_knowledge_base` (quick mode), Supabase PostgREST for commits
- **Features:** Streaming `price_proposal` reasoning chain, `price_doc_type`
  sub-types (price_list / discount_rule / contract_terms / promotion),
  upsert-by-title doc ingestion, full audit trail via `agent_tool_call_logs`
- **Access:** Admin / Owner only (every layer enforced)

#### [Recommendations API](./recommendations-api.md)
Collaborative filtering recommendations and interaction tracking.
- **Function:** `recommendations-api`
- **Features:** User interactions, personalized recommendations, similar materials
- **Access:** Authenticated users

### AI & Agent APIs

#### [Agent Chat API](./agent-chat-api.md)
Unified multi-agent AI system powered by LangChain.js and Claude.
- **Function:** `agent-chat`
- **Agents:** `kai` (default, Opus), `interior-designer` (Opus), `demo` (Haiku). Legacy aliases `search`/`insights`/`seo` resolve to `kai`.
- **Features:** RBAC tool gating, skills system (`load_skill`), multimodal images, SSE streaming, long-term memory
- **Access:** JWT (all users for core tools; admin/owner for B2B/SEO/sub-agents)

#### [Agent Chat Partner API](./agent-chat-partner-api.md)
External `kai_*` API-key access to the agent-chat surface for partner integrations.
- **Access:** `Authorization: Bearer kai_*` (api_keys), per-call credit metering

#### [MIVAA Gateway API](./mivaa-gateway-api.md)
Gateway to Python backend services (RAG, search, AI services).
- **Function:** `mivaa-gateway`
- **Features:** 100+ endpoints for RAG, search, AI, admin operations
- **Access:** Authenticated users or API key

### Processing APIs

#### [PDF Batch Process API](./pdf-batch-process-api.md)
Batch processing of PDF documents.
- **Function:** `pdf-batch-process`
- **Features:** Batch extraction, status tracking, priority processing
- **Access:** Authenticated users

#### [XML Import Orchestrator API](./xml-import-orchestrator-api.md)
Intelligent XML file imports with AI-powered field mapping.
- **Function:** `xml-import-orchestrator`
- **Features:** Field detection, mapping suggestions, preview mode, bulk import
- **Access:** Authenticated users

### Public / Lead-gen APIs

#### [Public Tools API](./public-tools-api.md)
Unauthenticated price + mention scan API that backs the `/tools` page.
- **Endpoints:** `GET /api/v1/public/quota`, `POST /api/v1/public/price-scan`, `POST /api/v1/public/mention-scan`
- **Features:** 2 scans/day per IP, Cloudflare Turnstile required, 24h result cache, stateless (no DB writes to `tracked_*` tables)
- **Access:** Public (no auth). Optional Bearer JWT switches quota keying to `user_id`.
- **Configuration:** `TURNSTILE_SITE_KEY` + `TURNSTILE_SECRET_KEY` in MIVAA env (preferred) or `/admin/operations → Keys` (DB fallback)

### Automation APIs

#### [Price Monitoring Cron API](./price-monitoring-cron-api.md)
Scheduled price monitoring from competitor sources.
- **Function:** `price-monitoring-cron`
- **Features:** Automated price checks, alerts, history tracking
- **Access:** Cron secret (scheduled)

### Tracking / Monitoring (Partner) APIs

External `kai_*` API-key flows for partner integrations (per-call credit metering).

#### [Price Monitoring API](./price-monitoring-api.md)
Full price-tracking reference for external consumers (`/api/v1/prices/track/*`).
- See also: [price-monitoring-v3-partner-update.md](./price-monitoring-v3-partner-update.md) — v3 partner changelog.

#### [Mention Monitoring API](./mention-monitoring-api.md)
Multi-source mention tracking + LLM visibility (`/api/v1/mentions/track/*`).

#### [Job Research API](./job-research-api.md)
Background job-discovery + consolidated digest (`/api/v1/jobs/track/*`).

#### [Flow Engine API](./flow-engine-api.md)
Visual workflow automation — execute, test, and event-trigger flows.
- **Function:** `flow-engine`, `flow-scheduler-cron`, `flow-webhook`
- **Features:** Execute/test flows, cron scheduling, webhook triggers, template variable resolution
- **Access:** Authenticated users

### AI Generation APIs

#### [Interior Video Generation API](./generate-interior-video-v2-api.md)
Multi-model AI video generation for interior design.
- **Function:** `generate-interior-video-v2`, `generate-social-video`
- **Features:** Veo-2, Kling v3.0, Wan 2.1, Runway Gen4 — auto-routed by video type, async polling
- **Credits:** 12–40 per video
- **Access:** Authenticated users

#### [Virtual Staging API](./generate-virtual-staging-api.md)
Transform empty room photos into furnished renders.
- **Function:** `generate-virtual-staging`
- **Features:** 8 room types, 8 furniture styles, Replicate proplabs model
- **Credits:** 20 per generation
- **Access:** Authenticated users

#### [Gemini Interior Generation API](./generate-interior-gemini-api.md)
Gemini-powered interior image generation with 4 modes.
- **Function:** `generate-interior-gemini`
- **Features:** text-to-image, image-edit, floor-plan-render, floor-plan-text; two-step style-transfer pipeline
- **Credits:** 6 (flash) or 15 (pro) per generation
- **Access:** Authenticated users

#### [Region Edit API](./generate-region-edit-api.md)
Masked inpainting — regenerate a painted zone in a room image.
- **Function:** `generate-region-edit`
- **Features:** Grok Aurora inpainting with binary mask, SAM 2 mask generation, Pillow fallback
- **Credits:** 20 per call
- **Access:** Authenticated users

#### VR World Generation
Generate 3D Gaussian Splat worlds from interior images via WorldLabs Marble.
- **Function:** `generate-vr-world`
- **Models:** `marble-1.0-draft` (18 cr, ~30–45s), `marble-1.1` (190 cr, ~5min). Legacy `0.1-mini`/`0.1-plus` deprecated.
- **Output:** SPZ splat files (100k/500k/full), collider GLB, panorama, caption — stored in `vr_worlds`
- **Documentation:** [vr-world-generation.md](../vr-world-generation.md)
- **Access:** JWT

#### Material Maps (AR)
Derive a tileable albedo from a product's own photo, for the AR/lighting material preview.
- **Function:** `generate-interior-gemini` with `mode: 'material-texture'` — there is no
  `generate-pbr-maps` function and there never has been; the endpoint documented here until
  2026-08-11 did not exist, and `metadata.pbr_maps` was written 0 times.
- **Output:** a tileable albedo, stored per product/option in `product_material_maps`
- **Credits:** set by `resolveGenerationRouting` for the chosen provider (Gemini or Grok)
- **Access:** JWT

#### [AI Re-rank API](./ai-rerank-api.md)
Claude-powered search result re-ordering for improved relevance.
- **Function:** `ai-rerank`
- **Features:** Semantic re-ranking, optional explanations, opus/haiku model choice
- **Access:** Authenticated users

### Knowledge Base APIs

#### KB Embedding Generation
Voyage AI 1024D embedding generation for Knowledge Base documents.
- **Function:** `kb-generate-embedding`
- **Features:** Auto-triggered on `kb_docs` insert/content change. Idempotent via content hash.
- **Access:** JWT or service-role
- **Documentation:** [knowledge-base-implementation.md](../knowledge-base-implementation.md)

### Pinterest Integration

#### Pinterest OAuth
Pinterest account linking with board/pin access.
- **Function:** `pinterest-oauth`
- **Actions:** `get-auth-url`, `callback`, `get-boards`, `get-board-pins`, `disconnect`
- **Storage:** `social_accounts` table (`platform='pinterest'`)
- **Env:** `PINTEREST_APP_ID`, `PINTEREST_APP_SECRET`, `PINTEREST_REDIRECT_URI`
- **Access:** JWT

#### Pinterest Import
Import pins into moodboards (works pre-OAuth via oEmbed).
- **Function:** `pinterest-import`
- **Actions:** `extract-pin`, `import-pin`, `import-pins-bulk`
- **Pipeline:** Extract → download image → MIVAA visual-search for matching catalog products
- **Access:** JWT

### Business Profile / Verification

#### VIES VAT Validation
Public EU VAT validation via the official VIES REST API. No secrets — VIES is unauthenticated.
- **Function:** `vies-validate`
- **Features:** EU-only (skips with `non_eu` reason for non-EU country codes); returns `valid`, `legal_name`, `trade_name`, `address`, `address_parsed` (per-country structured street/number/postal/city for EL/DE/FR/IT/ES/NL/AT/BE/PT). Caches result on `crm_companies.vat_validated*` (90-day refresh policy) when `company_id` is passed.
- **Access:** JWT (any authenticated user)

#### myAADE — RgWsPublic2 (Greek business lookup)
SOAP wrapper for ΑΑΔΕ's `rgWsPublic2AfmMethod`. Returns the basic record + ΚΑΔ activities for a Greek ΑΦΜ.
- **Function:** `myaade-rgwspublic2` (first of the `myaade-*` family)
- **Features:** Auto-fill business profile (legal name, ΔΟΥ, ΚΑΔ, legal form, structured address). 90-day cache on `crm_companies.aade_data_at`. Every lookup writes an audit entry to the looked-up ΑΦΜ's TAXISnet inbox — module only calls when the user is verifying their OWN business.
- **Secrets:** `AADE_USERNAME`, `AADE_PASSWORD`, `AADE_AFM_CALLED_BY` via `platform_secrets` (env-first → DB)
- **Access:** JWT
- **Documentation:** [`src/modules/myaade/README.md`](../../src/modules/myaade/README.md)

#### Role Upgrade Requests
Dealer/Factory promotion workflow. User submits → admin reviews → approval flips `user_profiles.role_id`.
- **Function:** `role-upgrade-requests` (action: `submit` | `approve` | `reject` in body)
- **Features:** Gated on `entity_type='business'`. Re-validates VAT via VIES on submit, snapshots `vat_validated*` on the request row. Fans out bell notifications + emails (templates `role_upgrade_request.{submitted,approved,rejected}`) via `email-api`. Partial unique index prevents duplicate pending applications per (user, role).
- **Tables:** `role_upgrade_requests`
- **Access:** JWT (submit own); admin/super_admin/owner (approve/reject)

### SEO & Content APIs

The former five separate functions (`seo-research` / `seo-plan` / `seo-write` / `seo-analyze` / `seo-pipeline`) were **consolidated into one action-discriminated `seo-api`**. Three companion functions add the per-website intelligence layer introduced 2026-07.

| Function | Actions | Purpose |
|----------|---------|---------|
| `seo-api` | `research`, `plan`, `write`, `analyze`, `pipeline`, `toolkit_research`, `toolkit_audit` | Keyword research (DataForSEO), article structure + meta + FAQ schema, full article via Claude, 15+ quality checks with auto-fix, and the end-to-end orchestrator. Inter-link suggestions are inserted **into** the article, not just offered on the clipboard. |
| `gsc-api` | `authorize`, `GET ?code&state`, `list_properties`, `set_property`, `sync`, `disconnect`, `cron-sync` | Google Search Console per connected website. The OAuth callback is **server-side** so supabase-js can't hijack Google's `?code`. Pulls full performance: queries, pages, devices, countries, appearance and trend. Nightly refresh + 180-day retention prune. |
| `seo-site-audit` | `run`, `cron-run` | Site Health — on-page audit (instant) plus Lighthouse gauges when the async run returns. The on-page score *is* the live Site Health; Lighthouse is shown only when present rather than blocking on it. |
| `seo-domain-tracker` | `run`, `cron-run` | Weekly Rankings & Links — tracked DataForSEO domain intel (ranked keywords, positions, backlinks) per connected website. Movement fires workspace-scoped alerts through the Flows engine. |

**Connected Websites** is the organising unit: a workspace connects a site once, then Site Health, Rankings & Links, GSC and the writing toolkits are all scoped to it. Surfaced to the `kai` agent as first-class tools. Full reference: [**seo-api.md**](./seo-api.md).

### Social Media APIs

#### [Zernio Social API](./zernio-social-api.md)
Social media OAuth, publishing, analytics, and content generation.
- **Functions:** `zernio-api`, `zernio-webhook-handler`, `generate-social-content`, `generate-social-image`, `generate-social-video`
- **Features:** 8 platforms, publish/schedule, engagement sync, AI caption/image/video generation
- **Credits:** 2–30 per generation; publishing uses Zernio subscription
- **Access:** Authenticated users

### Payment APIs

#### CRM Stripe (subscriptions & credits)
Subscriptions and credit purchases via Stripe. The CRM `stripe` resource is part of the consolidated [crm-api](./crm-api.md) router.
- **Functions:** `crm-api` (stripe resource), `stripe-checkout`, `stripe-customer-portal`
- **Features:** Subscription checkout, credit packages, customer portal, balance queries
- **Access:** Authenticated users

#### [Stripe API](./stripe-api.md)
Stripe checkout, customer portal, and credit/subscription purchase reference.
- **Functions:** `stripe-checkout`, `stripe-customer-portal`, `crm-api` (stripe resource)
- **Access:** Authenticated users

#### [Stripe Webhooks API](./stripe-webhooks-api.md)
Stripe webhook event handling for subscriptions and payments.
- **Function:** `stripe-webhooks`
- **Features:** Subscription management, payment processing, user tier updates
- **Access:** Stripe signature verification

### Finance APIs (Greek e-invoicing, AADE/myDATA)

#### [Finance API](./finance-api.md)
Multi-tenant Greek invoicing, AADE/myDATA transmission (Novus connector), AR/AP, POS, storefront, statements, digest.
- **Functions:** `finance-issue-invoice`, `finance-invoice-pdf`, `finance-pay-invoice`, `finance-send-invoice-email`, `finance-send-statement`, `finance-inbound-sync`, `finance-fiscal-offline-recovery`, `finance-digest-aggregate`, `finance-storefront`
- **Features:** Issue → series/AA allocation → myDATA transmit → MARK/offline-recovery; credit notes (5.1/5.2); delivery notes (9.3); retail receipts (11.1, POS Law 5155); inbound `RequestDocs` sync; Stripe Connect pay links; VAT/reconciliation/ledger reports
- **Credits:** 2 per myDATA transmission (root workspace free); PDF/pay/email = 0
- **Access:** JWT `admin/super_admin/owner/finance/accountant`; storefront is public (slug-keyed); crons via `x-cron-secret`. Gated on `sales-finance` module entitlement.
- **Architecture:** [finance-system.md](../finance-system.md) · [pos-retail-system.md](../pos-retail-system.md) · [online-storefront.md](../online-storefront.md) · [capabilities-and-tenancy.md](../capabilities-and-tenancy.md)

#### Stripe Connect (tenant payouts)
- **Function:** `stripe-connect` — `onboard` / `status`. Creates the workspace Stripe Express account on `workspace_payment_config`.
- **Access:** owner/admin JWT

#### [Supplier Orders API](./supplier-orders-api.md)
External ERP-facing API for the sourcing/fulfillment spine (Workstream F) — supplier order retrieval and status.
- **Access:** partner API key / supplier portal auth
- **Architecture:** [sourcing-fulfillment.md](../sourcing-fulfillment.md)

#### Stock API
Inventory / warehouse as a **paid add-on** (promoted out of Finance; mirrors the HR entitlement model).
- **Function:** `stock-api`
- **Features:** Items, warehouses, adjustments + transfers, movement ledger, low-stock + reorder, stocktakes, inbound shipments, shipping quotes, valuation. Order fulfilment decrements through the same movement ledger, with per-line warehouse and automatic reservation.
- **Access:** JWT; gate chain authenticate → `userCanAccessWorkspace` → `isModuleEnabled('stock')` → `assertEntitled(ws,'stock')` → finance-manager RBAC on writes
- **Architecture:** [warehouse-and-billing.md](../warehouse-and-billing.md) · [orders-system.md](../orders-system.md)
- **Spec:** OpenAPI tag **Stock**

#### Contracts API
Contract lifecycle with e-signature — draft → send → countersign → archive.
- **Functions:** `contracts-api`, `generate-contract-pdf`; public signing via `/sign/:token`
- **Features:** Counterparty prefilled from the mounted entity (CRM company/contact, project, order), captured value + currency, `signer_role` stamped on each signature, signed-PDF download, `contract_signed` flow event, daily auto-expire cron
- **Access:** JWT + module entitlement; the signing surface is token-gated and anonymous
- **Architecture:** [contracts-system.md](../contracts-system.md)
- **Spec:** OpenAPI tag **Contracts**

### Real Estate APIs

#### [Real Estate API](./real-estate-api.md) <span style="color:#ec4899">(NEW — 2026-07)</span>
Full property module (#249) with two paid sub-modules (#281). Five functions, deliberately split so the authenticated and anonymous surfaces never share code.
- **Functions:** `real-estate-api` (agent/broker surface), `real-estate-public` (public listing page, buyer portal, discovery, lead capture), `real-estate-feed` (portal syndication XML), `real-estate-buyer-digests` + `real-estate-rent-invoicing` (crons)
- **Features:** Listings + photo AI analysis, leads → CRM conversion, viewings, offers, sales + commission invoicing, buyer requirements with two-way auto-matching and a `/buyer/:token` portal, CMA reports, deals pipeline; **lettings** (tenancies, rent schedules, maintenance, landlord statements) and **investments** (yield/ROI) behind their own add-ons
- **Access:** JWT + `real-estate` entitlement + persona RBAC (operator / broker / agent / member). Ownership failures return **404**, not 403. Public surface is bound to opaque capability tokens and rate-limits anonymous lead writes to 8/hour/IP
- **Spec:** OpenAPI tag **Real Estate**

### HR APIs

#### [HR API](./hr-api.md)
Tenant HR add-on — employee records + absences (first paid module on the entitlements framework).
- **Function:** `hr-api`
- **Features:** Employees as tagged `crm_contacts` + `hr_employees` (1:1) + `hr_absences`; gate chain authenticate → `userCanAccessWorkspace` → `isModuleEnabled` → `assertEntitled` (402) → `hr.view` / `hr.manage`
- **Access:** JWT, workspace-admin for PII; module entitlement required
- **Architecture:** [hr-system.md](../hr-system.md)

#### [Careers API](./careers-api.md)
Public, anonymous careers surface for a workspace — a machine-readable **job board** plus the careers-page actions.
- **Function:** `hr-careers` (`verify_jwt = false`)
- **GET** `?slug=<company>[&job=<job-slug>]` — Greenhouse/Lever/Ashby-style JSON board for aggregators, scripts and partner sites. Jobs only (no Turnstile key / `apply_config`); each job carries `absolute_url` + `updated_at`; `Cache-Control: public, max-age=300`.
- **POST** `{ action }` — `meta` / `get-job` / `apply`, used by our own careers page (includes the Turnstile site key + apply config it needs to render).
- **Visibility:** a posting is public only while `status='open'` **and** not past `closes_at` — identical for both surfaces.
- **Access:** none (public). `apply` is Turnstile-gated when configured (fail-open) + throttled 8/IP/10 min.

### Background Processing APIs

#### Background Agent Runner
Universal executor for all background agent types.
- **Function:** `background-agent-runner`
- **Features:** Run agents by `agent_id`, catalog endpoint, chain/event/cron/manual triggers
- **Access:** Authenticated users or service-role key
- **Documentation:** [background-agents.md](../background-agents.md)

#### SLIG Inference
SigLIP2 visual embedding generation.
- **Function:** See [slig-inference.md](./slig-inference.md)
- **Access:** Internal / service-role

### Cron / Scheduled Functions (service-role only)

Not user-callable. pg_cron invokes these on a schedule. Auth is the shared cron gate (`isCronAuthorized`): an `x-cron-secret` header **or** a service-role bearer — either satisfies it, so a vault/env secret-name drift can no longer 401 every scheduled job at once.

| Function | Schedule (UTC) | Purpose |
|----------|----------------|---------|
| `agent-scheduler-cron` | every min | Dispatch background agents whose cron is due |
| `flow-scheduler-cron` | every min | Run due scheduled flows |
| `campaign-processor` | every min | Email campaign dispatcher (Resend, 8/min) |
| `messaging-processor` | every min *(currently inactive)* | WhatsApp campaign batch sender (Zernio) |
| `auto-recovery-cron` | every 5 min | Re-dispatch stuck runs (>8 min no heartbeat, <3 attempts) |
| `crm-meeting-reminders` | every 5 min | Send + retry meeting reminders (email / ICS) |
| `hr-checkin-cron` | every 5 min | Late-arrival attendance alerts |
| `scheduled-import-runner` | every 15 min | Run due XML imports |
| `finance-fiscal-offline-recovery` | every 15 min | Backfill myDATA MARK on offline-queued documents (Novus `RequestTransmittedDocs`) |
| `kb-embedding-backfill` | every 3 min | Drain the KB chunk-embedding queue |
| `monitoring-cron` | hourly (`?task=…`) | **Unified** dispatcher for the 5 monitoring sweeps — `price-refresh` (:15), `mention-refresh` (:30), `job-refresh` (:45), `job-digest` (:05), `mention-probe` (03:00). Each gates on its own module toggle before spending |
| `seo-site-audit` (cron-run) | hourly / weekly | Lighthouse + on-page audit per connected website |
| `seo-domain-tracker` (cron-run) | weekly (Mon) | DataForSEO rankings + backlinks snapshot per website |
| `gsc-api` (cron-sync) | daily 03:30 | Google Search Console performance pull + 180-day prune |
| `crawl-user-website` | every 6 h | Re-crawl connected websites |
| `finance-send-statement` (cron_batch) | hourly :20 | Auto-send party statements per `finance_settings.auto_statement_*` |
| `finance-inbound-sync` (cron mode) | daily 05:00 | Pull AADE `RequestDocs` into `inbound_documents` (2 cr/workspace) |
| `finance-digest-aggregate` | daily | AR/AP + P&L + follow-up digest email |
| `real-estate-rent-invoicing` | daily 06:00 | Draft Finance invoices for rent charges due within 7 days |
| `real-estate-buyer-digests` | daily 08:00 | Saved-search digest email to buyers with new matches |
| `check-material-alerts` | daily 08:00 | Run saved searches + email subscribers |
| `email-contacts-sync-cron` | daily 03:20 | Sync CRM contacts into marketing audiences |
| `moodboard-dormancy-cron` | daily 05:00 | Notify-then-delete lifecycle for idle moodboards (warn → remind → remove) |
| `storage-orphan-cleanup-cron` | daily 04:00 | GC unreferenced storage objects (per-bucket grace windows) |
| `data-integrity-runner` | daily 04:25 | Run the detect/heal integrity registry; surfaces at `/admin/data-health` |
| `job-cleanup-cron` | weekly (Sun 03:00) | Purge old jobs, logs, stale progress |
| `ai-pricing-updater` | weekly | Sync AI model pricing into `ai_model_pricing` |

Around 57 pg_cron jobs are scheduled in total; the rest are pure-SQL retention/prune jobs with no edge function behind them (`system-logs-daily-cleanup`, `api-usage-logs-cleanup-daily`, `cron-run-details-cleanup-daily`, `retention-sweep-daily`, `contracts-expire-daily`, `quotes-expire-daily`, `tenant-purity-audit-daily`, …). Query `cron.job` for the live list rather than trusting this table.

### Admin / Maintenance

#### Platform Reset
Wipe derived data while preserving accounts/KB/CRM/prompts.
- **Function:** `reset-platform`
- **Documentation:** [deployment-guide.md § Platform Reset](../deployment-guide.md#-platform-reset-admin-destructive-operation)
- **Access:** Service-role (admin-only, via admin UI confirmation modal)

#### Health Check
Aggregated health status across AI providers + MIVAA + external APIs.
- **Function:** `health-check`
- **Access:** Public (no auth)

#### Data Integrity Runner
Executes the detect/heal check registry nightly and surfaces violations at `/admin/data-health`.
- **Function:** `data-integrity-runner`
- **Features:** Each check is a pair of SQL functions (`detect_fn()` / `heal_fn()`, both zero-arg, heal returns `integer`) registered in a table. Includes the `ops.silent_zero` probe (activity happened but the metric it should have produced is zero) and `ops.test_artifacts_accumulating` (watches a janitor's *output*, not its exit code). Adding a check is a migration, not an admin-editable SQL row — a table of admin-authored SQL run by a `SECURITY DEFINER` function would be a privilege-escalation surface.
- **Access:** cron gate; results readable by admins

> **Removed:** the former `field-templates` and `suggest-fields` functions no longer exist. Field
> detection and mapping suggestion were folded into `xml-import-orchestrator` (`analyze` mode, backed
> by the dictionary-first classifier in `_shared/xml-field-dictionary.ts`).

## Authentication

Most APIs require authentication via Supabase Auth:

```typescript
Authorization: Bearer <supabase_access_token>
```

### Getting an Access Token

```typescript
import { supabase } from '@/integrations/supabase/client';

const { data: { session } } = await supabase.auth.getSession();
const accessToken = session?.access_token;
```

### Using the API

```typescript
// Using Supabase client (recommended)
const { data, error } = await supabase.functions.invoke('email-api', {
  body: {
    action: 'send',
    to: 'user@example.com',
    subject: 'Hello',
    html: '<p>Hello World</p>'
  }
});

// Using fetch
const response = await fetch(
  'https://bgbavxtjlbvgplozizxu.supabase.co/functions/v1/email-api',
  {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      action: 'send',
      to: 'user@example.com',
      subject: 'Hello',
      html: '<p>Hello World</p>'
    })
  }
);
```

## Error Handling

All APIs return errors in a consistent format:

```typescript
{
  success: false,
  error: string,
  code?: string,
  details?: object
}
```

### Common HTTP Status Codes

- `200` - Success
- `201` - Created
- `400` - Bad Request (validation error)
- `401` - Unauthorized (missing or invalid token)
- `403` - Forbidden (insufficient permissions)
- `404` - Not Found
- `500` - Internal Server Error
- `503` - Service Unavailable

## Rate Limiting

Default rate limits apply to all APIs:
- **Standard:** 60 requests per minute per user
- **Streaming:** 30 requests per minute per user
- **Webhooks:** No rate limit (verified by signature)

## CORS

All APIs support CORS with the following headers:

```typescript
Access-Control-Allow-Origin: *
Access-Control-Allow-Headers: authorization, x-client-info, apikey, content-type
Access-Control-Allow-Methods: POST, GET, OPTIONS, PUT, DELETE, PATCH
```

## Related Documentation

- [API Endpoints](../api-endpoints.md) - Complete list of all backend endpoints
- [Email System](../email-system.md) - Email system architecture
- [Agent System](../agent-system.md) - AI agent architecture
- [CRM System](../crm-system.md) - CRM architecture
- [Price Monitoring](../price-monitoring-system.md) - Price monitoring system
- [Real Estate System](../real-estate-system.md) - Property module architecture
- [Stock & Warehouse](../warehouse-and-billing.md) - Inventory add-on architecture
- [SEO & Content](../seo-system.md) - Connected websites, GSC, Site Health, Rankings
- [Data Integrity](../data-integrity-framework.md) - detect/heal checks + the silent-zero probe

## Support

For API support or questions:
- Check the specific API documentation
- Review the [Troubleshooting Guide](../troubleshooting-guide.md)
- Contact the development team

