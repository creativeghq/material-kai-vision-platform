# API Documentation

This directory contains per-function deep docs for Supabase Edge Function APIs.

> **📑 Looking for the master list?** See [**api-master-reference.md**](../api-master-reference.md) — single page covering all **68 edge functions + MIVAA Python endpoints** (auth models, categories, call patterns). Start there if you're integrating; come here for endpoint details.

## Overview

All APIs are implemented as Supabase Edge Functions running on Deno and are accessible via:

**Base URL:** `https://bgbavxtjlbvgplozizxu.supabase.co/functions/v1/`

## Available APIs

### Core Business APIs

#### [Email API](./email-api.md)
Email sending, domain verification, and analytics using AWS SES.
- **Function:** `email-api`
- **Features:** Template-based emails, domain verification, analytics, sending stats
- **Access:** Authenticated users

#### [Messaging API](./messaging-api.md)
Multi-channel messaging (SMS, WhatsApp) using Twilio.
- **Function:** `messaging-api`
- **Features:** SMS, WhatsApp messaging, templates, delivery tracking, analytics
- **Access:** Authenticated users

#### [CRM Contacts API](./crm-contacts-api.md)
Contact management for CRM system.
- **Function:** `crm-contacts-api`
- **Features:** CRUD operations, user linking, relationship management
- **Access:** Admin, Manager, Factory roles

#### [CRM Users API](./crm-users-api.md)
User account and profile management.
- **Function:** `crm-users-api`
- **Features:** User listing, profile updates, role management
- **Access:** Admin only

#### [CRM Companies API](./crm-companies-api.md)
Company records management.
- **Function:** `crm-companies-api`
- **Features:** Company CRUD, contact linking, search
- **Access:** Authenticated users

#### [Quotes API](./quotes-api.md)
Quote requests and proposal management.
- **Function:** `quotes-api`
- **Features:** Quote requests, proposals, status tracking, **price audit fields** (`price_source`, `price_lookup_call_id`), `product_prices` cache table
- **Access:** Authenticated users (admin/owner for pricing fields)

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
- **Agents:** `kai` (default, Sonnet), `interior-designer` (Sonnet), `demo` (Haiku). Legacy aliases `search`/`insights`/`seo` resolve to `kai`.
- **Features:** RBAC tool gating, skills system (`load_skill`), multimodal images, SSE streaming, long-term memory
- **Access:** JWT (all users for core tools; admin/owner for B2B/SEO/sub-agents)

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

#### [Scrape Session Manager API](./scrape-session-manager-api.md)
Web scraping session control and management.
- **Function:** `scrape-session-manager`
- **Features:** Start, pause, resume, stop scraping sessions
- **Access:** Authenticated users

#### [XML Import Orchestrator API](./xml-import-orchestrator-api.md)
Intelligent XML file imports with AI-powered field mapping.
- **Function:** `xml-import-orchestrator`
- **Features:** Field detection, mapping suggestions, preview mode, bulk import
- **Access:** Authenticated users

### Automation APIs

#### [Price Monitoring Cron API](./price-monitoring-cron-api.md)
Scheduled price monitoring from competitor sources.
- **Function:** `price-monitoring-cron`
- **Features:** Automated price checks, alerts, history tracking
- **Access:** Cron secret (scheduled)

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

#### PBR Maps (AR)
Generate PBR texture maps for AR preview rendering.
- **Function:** `generate-pbr-maps`
- **Outputs:** albedo, normal, roughness, metalness (Replicate)
- **Credits:** 8 per generation
- **Documentation:** [ar-material-preview.md](../ar-material-preview.md)
- **Access:** JWT

#### [AI Re-rank API](./ai-rerank-api.md)
Claude-powered search result re-ordering for improved relevance.
- **Function:** `ai-rerank`
- **Features:** Semantic re-ranking, optional explanations, sonnet/haiku model choice
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

### SEO Pipeline (admin/owner only)

Complete SEO content generation pipeline — 5 functions, all POST + JWT.

| Function | Purpose |
|----------|---------|
| `seo-research` | DataForSEO keyword research (6 parallel API calls) |
| `seo-plan` | Article structure + meta tags + FAQ schema |
| `seo-write` | Full article via Claude Sonnet |
| `seo-analyze` | 15+ SEO quality checks, auto-fix via Gemini |
| `seo-pipeline` | Orchestrator: research → plan → write → analyze |

Surfaced to the `kai` agent as sub-agent tools (admin-gated).

### Social Media APIs

#### [Late.dev Social API](./late-social-api.md)
Social media OAuth, publishing, analytics, and content generation.
- **Functions:** `late-oauth`, `late-publish`, `late-analytics`, `generate-social-content`, `generate-social-image`, `generate-social-video`
- **Features:** 8 platforms, publish/schedule, engagement sync, AI caption/image/video generation
- **Credits:** 2–30 per generation; publishing uses Late.dev subscription
- **Access:** Authenticated users

### Payment APIs

#### [CRM Stripe API](./crm-stripe-api.md)
Subscriptions and credit purchases via Stripe.
- **Functions:** `crm-stripe-api`, `stripe-checkout`, `stripe-customer-portal`
- **Features:** Subscription checkout, credit packages, customer portal, balance queries
- **Access:** Authenticated users

#### [Stripe Webhooks API](./stripe-webhooks-api.md)
Stripe webhook event handling for subscriptions and payments.
- **Function:** `stripe-webhooks`
- **Features:** Subscription management, payment processing, user tier updates
- **Access:** Stripe signature verification

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

Not user-callable. pg_cron invokes these on a schedule. No auth header from frontend — they use `SUPABASE_SERVICE_ROLE_KEY`.

| Function | Schedule | Purpose |
|----------|----------|---------|
| `agent-scheduler-cron` | 1 min | Dispatch background agents whose cron is due |
| `auto-recovery-cron` | 5 min | Re-dispatch stuck runs (>8 min no heartbeat, <3 attempts) |
| `job-cleanup-cron` | weekly | Purge old jobs, logs, stale progress |
| `flow-scheduler-cron` | 1 min | Run due scheduled flows |
| `ai-pricing-updater` | weekly | Sync AI model pricing into `ai_model_pricing` |
| `campaign-processor` | 1 min | Email campaign dispatcher (Resend, 8/min) |
| `check-material-alerts` | daily | Run saved searches + email subscribers |
| `scheduled-import-runner` | 5 min | Run due XML imports |
| `messaging-processor` | 1 min | SMS/WhatsApp batch sender (Twilio, 10/batch) |

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

#### Field Templates
Reusable field-mapping templates for XML/scraping imports.
- **Function:** `field-templates`
- **Access:** JWT

#### Suggest Fields
AI-suggested field mappings from HTML analysis.
- **Function:** `suggest-fields`
- **Access:** JWT

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

## Support

For API support or questions:
- Check the specific API documentation
- Review the [Troubleshooting Guide](../troubleshooting-guide.md)
- Contact the development team

