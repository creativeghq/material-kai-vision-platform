# Material KAI Vision Platform — Complete API Reference

> **Base URL**: `https://bgbavxtjlbvgplozizxu.supabase.co`
> **Edge Functions Base**: `https://bgbavxtjlbvgplozizxu.supabase.co/functions/v1`
> **REST API Base**: `https://bgbavxtjlbvgplozizxu.supabase.co/rest/v1`
> **Last Updated**: 2026-04-17

---

## Authentication

All endpoints require one of the following authentication methods:

| Method | Header | Notes |
|--------|--------|-------|
| **User JWT** | `Authorization: Bearer <jwt-token>` | Standard user authentication via Supabase Auth |
| **Service Role Key** | `apikey: <service-role-key>` + `Authorization: Bearer <service-role-key>` | Admin/server-side access; bypasses Row Level Security |
| **Anon Key** | `apikey: <anon-key>` | Public read-only access (RLS-restricted tables only) |

Obtain tokens via `POST https://bgbavxtjlbvgplozizxu.supabase.co/auth/v1/token`.

### CORS
All edge functions accept `*` for `Access-Control-Allow-Origin`. Send `OPTIONS` preflight — all functions respond with `200/204`.

---

## Table of Contents

1. [AI Agent Chat](#1-ai-agent-chat)
2. [MIVAA Gateway (AI Services Proxy)](#2-mivaa-gateway-ai-services-proxy)
3. [AI Re-Rank](#3-ai-re-rank)
4. [Quotes and Proposals API](#4-quotes-and-proposals-api)
5. [CRM Contacts](#5-crm-contacts)
6. [CRM Companies](#6-crm-companies)
7. [CRM Users Admin](#7-crm-users-admin)
8. [CRM Stripe Billing](#8-crm-stripe-billing)
9. [Stripe Checkout](#9-stripe-checkout)
10. [Stripe Customer Portal](#10-stripe-customer-portal)
11. [Email API](#11-email-api)
12. [Messaging API SMS WhatsApp](#12-messaging-api-sms-whatsapp)
13. [Recommendations API](#13-recommendations-api)
14. [Generate VR World](#14-generate-vr-world)
15. [Generate Quote PDF](#15-generate-quote-pdf)
16. [Web Scraping Session Manager](#16-web-scraping-session-manager)
17. [Web Scraping Single Page](#17-web-scraping-single-page)
18. [Web Scraping Sitemap Parser](#18-web-scraping-sitemap-parser)
19. [Web Scraping Preview](#19-web-scraping-preview)
20. [PDF Batch Process](#20-pdf-batch-process)
21. [Price Monitoring](#21-price-monitoring)
22. [SEO Pipeline](#22-seo-pipeline)
23. [SEO Sub-functions](#23-seo-sub-functions)
24. [Background Agent Runner](#24-background-agent-runner)
25. [Flow Engine and Webhooks](#25-flow-engine-and-webhooks)
26. [Field Templates and Suggest Fields](#26-field-templates-and-suggest-fields)
27. [Batch Update Sessions](#27-batch-update-sessions)
28. [Health Check](#28-health-check)
29. [Supabase REST API Direct Table Access](#29-supabase-rest-api-direct-table-access)
30. [Supabase Auth API](#30-supabase-auth-api)
31. [Supabase Storage API](#31-supabase-storage-api)
32. [Generate Interior (Gemini)](#32-generate-interior-gemini)
33. [Generate Interior Video v2](#33-generate-interior-video-v2)
34. [Generate PBR Maps](#34-generate-pbr-maps)
35. [Generate Region Edit](#35-generate-region-edit)
36. [Generate Virtual Staging](#36-generate-virtual-staging)
37. [Social Content Generation](#37-social-content-generation)
38. [Social Image Generation](#38-social-image-generation)
39. [Social Video Generation](#39-social-video-generation)
40. [Social Publishing (Late.dev)](#40-social-publishing-latedev)
41. [Pinterest Integration](#41-pinterest-integration)
42. [Webhook Receivers](#42-webhook-receivers)
43. [Internal Utilities](#43-internal-utilities)

---

## 1. AI Agent Chat

**Endpoint**: `POST /functions/v1/agent-chat`
**Auth**: User JWT or Service Role Key
**Description**: Streams AI agent responses using Claude. Supports multimodal input (images). Returns a Server-Sent Events stream.

### Request Body

```json
{
  "messages": [
    { "role": "user", "content": "Show me marble tiles with warm tones" }
  ],
  "agentId": "kai",
  "images": ["data:image/jpeg;base64,..."],
  "conversation_id": "uuid-or-null"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `messages` | `Array<{role, content}>` | Yes | Conversation history. `role` is `"user"` or `"assistant"` |
| `agentId` | `string` | No | Agent to invoke. Default: `"kai"` |
| `images` | `string[]` | No | Base64 data URLs for image attachments |
| `conversation_id` | `string or null` | No | Supabase conversation ID for chat history persistence |

### Available Agent IDs

| `agentId` | Description | Required Role |
|-----------|-------------|--------------|
| `kai` | Default general-purpose KAI agent (Claude Opus) | Any authenticated user |
| `interior-designer` | Interior design specialist | Any authenticated user |
| `demo` | Demo agent (Claude Haiku, cheaper) | Any authenticated user |
| `search` | Legacy alias resolves to `kai` | Any authenticated user |
| `insights` | Legacy alias resolves to `kai` | Any authenticated user |
| `seo` | Legacy alias resolves to `kai` | Any authenticated user |

> Sub-agent tools, B2B manufacturer search, SEO tools, and the `price_lookup` tool are gated to `admin` or `owner` roles.

### Admin-Only Tool: price_lookup (2026-04)

Searches the "Pricing" KB category and composes a price with a reasoning chain. Only available to admin/owner. See [pricing-api.md](./pricing-api.md) for the full contract.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `product_name` | string | Yes | Full product name |
| `sku` | string | No | SKU for exact matching |
| `manufacturer` | string | No | Narrows discount rule scope |
| `quantity` | number | No | For MOQ/tier math |
| `unit` | string | No | Expected unit (m², piece, box) |
| `product_id` | string | No | UUID threaded into `price_proposal` |

The agent emits these chunks during/after execution:
- `tool_call_ids` — contains `log_id` (FK to `agent_tool_call_logs.id`) for each tool. Use the `price_lookup` entry to populate `quote_items.price_lookup_call_id` or `product_prices.price_lookup_call_id` on commit.
- `price_lookup_matches` — raw KB chunks grouped by `price_doc_type`
- `price_proposal` — structured result: `list_price`, `discount_percent`, `final_unit_price`, `currency`, `unit`, `reasoning_chain[]`, `source_doc_ids[]`, `warnings[]`, `confidence`

### Response

Newline-delimited JSON stream (NOT SSE `data:` prefixed — each line is a raw JSON object followed by `\n`).

```
{"type":"status","message":"Initializing agent..."}
{"type":"heartbeat","timestamp":1712345678901}
{"type":"tool_progress","status":"Searching price knowledge base..."}
{"type":"tool_call_ids","mapping":[{"tool_name":"price_lookup","log_id":"<uuid>"}]}
{"type":"price_lookup_matches","matches":[...],"hints":{...}}
{"type":"price_proposal","list_price":85,"discount_percent":27,"final_unit_price":62,...}
{"type":"text","text":"Based on Factory X Q2 pricing..."}
{"type":"done"}
```

### Error Responses

| Status | Description |
|--------|-------------|
| `401` | Missing or invalid authentication |
| `402` | Insufficient credits |
| `403` | Agent requires higher role |

---

## 2. MIVAA Gateway (AI Services Proxy)

**Endpoint**: `POST /functions/v1/mivaa-gateway`
**Auth**: User JWT (billable) or Service Role Key (free)
**Description**: Unified gateway to all Python AI backend services. Accepts `action` + `payload`. Handles credit billing, path parameter substitution, and response wrapping.

### Standard Request Format

```json
{
  "action": "<action_name>",
  "payload": { }
}
```

### File Upload (multipart)

Send `multipart/form-data` directly — auto-routed to `POST /api/rag/documents/upload-async`.

### Job Status Check (URL path)

`GET /functions/v1/mivaa-gateway/job-status/{job_id}`

---

### Available Actions

#### Knowledge Base

| Action | Method | Description | Billable |
|--------|--------|-------------|----------|
| `kb_create_document` | POST | Create/upsert KB document by (workspace, title, category) — accepts `price_doc_type` for Pricing category. Re-embeds only on content change. | Yes |
| `kb_get_document` | GET | Get document by ID (`doc_id` required) | No |
| `kb_update_document` | PATCH | Update document with smart re-embedding (`doc_id`). Accepts `price_doc_type`. | Yes |
| `kb_delete_document` | DELETE | Delete document (`doc_id`) | No |
| `kb_create_from_pdf` | POST | Create document from PDF | Yes |
| `kb_search` | POST | Admin KB search (semantic/full-text/hybrid). Accepts `category_id`, `category_slug`, `price_doc_type`, `require_published` (default false), `allowed_access_levels`, `match_threshold`. Returns `category_slug`, `category_name`, `price_doc_type` per result. | Yes |
| `search_knowledge_base` | POST | Agent-facing multi-type KB search (products/entities/chunks/kb_docs). Accepts `category_slug`, `category_id`, `price_doc_type`, `caller` (`admin`/`agent`/`public`). Use with `category_slug:"pricing"` for price lookup quick-pick mode (no LLM). **(2026-04)** | Yes |
| `kb_create_category` | POST | Create KB category. Include `slug` (e.g. `"pricing"`), `access_level`, `trigger_keyword`. | No |
| `kb_list_categories` | GET | List all KB categories | No |
| `kb_create_attachment` | POST | Attach document to product | No |
| `kb_get_doc_attachments` | GET | Get attachments for document (`doc_id`) | No |
| `kb_get_product_docs` | GET | Get documents for product (`product_id`) | No |
| `kb_health` | GET | KB service health | No |

#### RAG / Document Processing

| Action | Method | Description | Billable |
|--------|--------|-------------|----------|
| `rag_upload` | POST | Upload file/URL for processing | Yes |
| `rag_search` | POST | Search with 6 strategies: semantic, visual, hybrid, etc. | Yes |
| `rag_query` | POST | RAG query with auto-detecting modality | Yes |
| `rag_chat` | POST | RAG chat completions | Yes |
| `rag_get_job` | GET | Get job status (`job_id`) | No |
| `rag_list_jobs` | GET | List all jobs | No |
| `rag_get_checkpoints` | GET | Get job checkpoints (`job_id`) | No |
| `rag_restart_job` | POST | Restart failed job (`job_id`) | No |
| `rag_resume_job` | POST | Resume job from checkpoint (`job_id`) | No |
| `rag_get_chunks` | GET | Get document chunks (filter: `document_id`) | No |
| `rag_get_images` | GET | Get document images (filter: `document_id`) | No |
| `rag_get_products` | GET | Get products with filters | No |
| `rag_get_embeddings` | GET | Get embeddings with filters | No |
| `rag_get_document_content` | GET | Get full document content (`document_id`) | No |
| `rag_list_documents` | GET | List all documents | No |
| `rag_delete_document` | DELETE | Delete document (`document_id`) | No |
| `rag_health` | GET | RAG service health | No |
| `rag_stats` | GET | RAG statistics | No |
| `rag_search_mmr` | POST | MMR diversity search | Yes |
| `rag_search_advanced` | POST | Advanced semantic query | Yes |
| `rag_ai_tracking` | GET | AI model usage for job (`job_id`) | No |
| `rag_ai_tracking_stage` | GET | AI tracking by stage (`job_id`, `stage`) | No |
| `rag_ai_tracking_model` | GET | AI tracking by model (`job_id`, `model_name`) | No |

#### Admin

| Action | Method | Description |
|--------|--------|-------------|
| `admin_list_jobs` | GET | List all processing jobs |
| `admin_job_statistics` | GET | Job statistics |
| `admin_get_job` | GET | Get job details (`job_id`) |
| `admin_get_job_status` | GET | Get job status (`job_id`) |
| `admin_delete_job` | DELETE | Cancel/delete job (`job_id`) |
| `admin_system_health` | GET | System health |
| `admin_system_metrics` | GET | System metrics |
| `admin_cleanup_data` | DELETE | Cleanup old data |
| `admin_backup_data` | POST | Create backup |
| `admin_export_data` | GET | Export data |
| `admin_packages_status` | GET | Package status |
| `admin_job_progress` | GET | Job progress (`job_id`) |
| `admin_active_progress` | GET | Active jobs progress |
| `admin_job_pages` | GET | Job page progress (`job_id`) |
| `admin_job_stream` | GET | Stream job progress SSE (`job_id`) |
| `admin_job_products` | GET | Product progress for job (`job_id`) |
| `admin_test_product` | POST | Test product creation |
| `admin_process_ocr` | POST | Process OCR for image (`image_id`) |
| `admin_generate_product_embeddings` | POST | Generate product embeddings |

#### Admin Prompts

| Action | Method | Description |
|--------|--------|-------------|
| `admin_prompts_list` | GET | List all prompts |
| `admin_prompts_get` | GET | Get prompt (`stage`, `category`) |
| `admin_prompts_update` | PUT | Update prompt (`stage`, `category`) |
| `admin_prompts_history` | GET | Prompt version history (`prompt_id`) |
| `admin_prompts_test` | POST | Test a prompt |

#### Web Scraping

| Action | Method | Description |
|--------|--------|-------------|
| `process_scraping_session` | POST | Process session to products (`session_id`) |
| `get_scraping_session_status` | GET | Session status (`session_id`) |
| `retry_scraping_session` | POST | Retry failed session (`session_id`) |

#### Images

| Action | Method | Description | Billable |
|--------|--------|-------------|----------|
| `images_analyze` | POST | Analyze single image | Yes |
| `images_analyze_batch` | POST | Analyze batch of images | Yes |
| `images_search` | POST | Image similarity search | Yes |
| `images_upload_analyze` | POST | Upload and analyze | Yes |
| `images_reclassify` | POST | Re-classify image (`image_id`) | Yes |
| `images_health` | GET | Images service health | No |

#### Embeddings

| Action | Method | Description | Billable |
|--------|--------|-------------|----------|
| `embeddings_clip_image` | POST | Generate CLIP image embedding | Yes |
| `embeddings_clip_text` | POST | Generate CLIP text embedding | Yes |
| `embeddings_health` | GET | Embeddings service health | No |

#### AI Services

| Action | Method | Description | Billable |
|--------|--------|-------------|----------|
| `ai_classify_document` | POST | Classify document | Yes |
| `ai_classify_batch` | POST | Batch classification | Yes |
| `ai_detect_boundaries` | POST | Detect product boundaries | Yes |
| `ai_group_by_product` | POST | Group chunks by product | Yes |
| `ai_validate_product` | POST | Validate product data | Yes |
| `ai_consensus_validate` | POST | Consensus validation | Yes |
| `ai_is_critical` | GET | Check if task type is critical (`task_type`) | No |
| `ai_escalation_stats` | GET | Escalation statistics | No |
| `ai_process_pdf_enhanced` | POST | Enhanced PDF processing | Yes |
| `ai_services_health` | GET | AI services health | No |

#### Anthropic (Claude) Direct

| Action | Method | Description | Billable |
|--------|--------|-------------|----------|
| `anthropic_validate_image` | POST | Validate image with Claude | Yes |
| `anthropic_enrich_product` | POST | Enrich product with Claude | Yes |
| `anthropic_test` | POST | Test Claude integration | Yes |

#### Search Analytics & Recommendations

| Action | Method | Description |
|--------|--------|-------------|
| `search_recommendations` | GET | Search recommendations |
| `search_analytics` | POST | Search analytics |

#### Search Suggestions

| Action | Method | Description |
|--------|--------|-------------|
| `autocomplete` | POST | Autocomplete suggestions |
| `trending_searches` | GET | Trending searches |
| `typo_correction` | POST | Typo correction |
| `query_expansion` | POST | Query expansion |
| `track_suggestion_click` | POST | Track suggestion click |

#### Monitoring

| Action | Method | Description |
|--------|--------|-------------|
| `monitoring_supabase_status` | GET | Supabase connectivity status |
| `monitoring_health` | GET | Monitoring service health |
| `monitoring_storage_estimate` | GET | Storage estimate |

#### Documentation

| Action | Method | Description |
|--------|--------|-------------|
| `docs` | GET | Swagger UI (HTML) |
| `redoc` | GET | ReDoc (HTML) |
| `openapi_json` | GET | OpenAPI schema JSON |

### Path Parameters

Include path params directly in `payload`:

| Param | Used in |
|-------|---------|
| `job_id` | All `rag_*` and `admin_*` job endpoints |
| `document_id` | `rag_delete_document`, `rag_get_document_content` |
| `doc_id` | KB document endpoints |
| `product_id` | `kb_get_product_docs` |
| `session_id` | Scraping endpoints |
| `image_id` | `images_reclassify`, `admin_process_ocr` |
| `entity_id` | Entity endpoints |
| `factory_name` | `entities_by_factory` |
| `task_type` | `ai_is_critical` |
| `model_name` | `rag_ai_tracking_model` |
| `stage` | `admin_prompts_get/update`, `rag_ai_tracking_stage` |
| `category` | `admin_prompts_get/update` |
| `prompt_id` | `admin_prompts_history` |

### Credit Costs (Approximate)

| Operation | Credits |
|-----------|---------|
| RAG search (text) | 0.5 |
| RAG search (visual) | 1 |
| Image analysis | 1 |
| CLIP embedding | 0.25 |
| Document upload/process | 2 |

### Response Format

```json
{
  "success": true,
  "data": { }
}
```

For async file upload (202 Accepted):
```json
{
  "success": true,
  "data": {
    "job_id": "abc-123",
    "status": "pending",
    "message": "Document processing started. Use job_id to check status."
  }
}
```

---

## 3. AI Re-Rank

**Endpoint**: `POST /functions/v1/ai-rerank`
**Auth**: None required (open endpoint)
**Description**: Re-ranks search results using Claude AI for improved relevance.

### Request Body

```json
{
  "query": "warm marble tiles for bathroom",
  "results": [
    {
      "id": "product-uuid",
      "name": "Calacatta Gold Marble",
      "description": "White marble with gold veining",
      "category": "Natural Stone",
      "relevanceScore": 0.82,
      "semanticScore": 0.78,
      "understandingScore": 0.85
    }
  ],
  "maxResults": 10,
  "includeExplanations": false,
  "model": "claude-opus-4-7"
}
```

| Field | Type | Required | Default |
|-------|------|----------|---------|
| `query` | `string` | Yes | — |
| `results` | `SearchResult[]` | Yes | — |
| `maxResults` | `number` | No | All results |
| `includeExplanations` | `boolean` | No | `false` |
| `model` | `string` | No | `"claude-opus-4-7"` |

Valid models: `"claude-opus-4-7"` or `"claude-haiku-4-5"`

### Response

```json
{
  "rerankedResults": [...],
  "explanations": { "product-uuid": "Ranked #1 because..." },
  "processingTimeMs": 420,
  "model": "claude-opus-4-7",
  "cost": 0.0012,
  "usage": { "inputTokens": 1200, "outputTokens": 150 }
}
```

---

## 4. Quotes and Proposals API

**Endpoint Base**: `/functions/v1/quotes-api`
**Auth**: User JWT or Service Role Key

> **Pricing audit fields (2026-04):** `quote_items` rows now carry `price_source` (provenance tag: `manual | catalog | kb:ai:<log_id> | kb:quick:<doc_id> | product_price:<id>`) and `price_lookup_call_id` (FK → `agent_tool_call_logs.id`). Admin can update these via `PATCH /rest/v1/quote_items` directly or through the `QuotesService.updateItem()` frontend method. See [pricing-api.md](./pricing-api.md) for full contract.

### POST /functions/v1/quotes-api/quote-requests
Create a quote request.

**Request Body**:
```json
{
  "quote_id": "uuid",
  "workspace_id": "uuid",
  "notes": "Optional notes"
}
```

**Response** `201`:
```json
{ "data": { } }
```

---

### GET /functions/v1/quotes-api/quote-requests
List current user's quote requests (ordered newest first).

**Response** `200`:
```json
{ "data": [] }
```

---

### GET /functions/v1/quotes-api/quote-requests/{id}
Get specific quote request (must be owned by current user).

---

### PATCH /functions/v1/quotes-api/quote-requests/{id}
Update quote request status.

**Request Body**:
```json
{ "status": "pending" }
```

Valid statuses: `"pending"`, `"updated"`, `"approved"`, `"rejected"`

---

### GET /functions/v1/quotes-api/proposals
List all proposals for current user's quote requests. Includes related `quote_requests` data.

---

### GET /functions/v1/quotes-api/proposals/{id}
Get specific proposal. Verifies user owns the linked quote request.

---

### PATCH /functions/v1/quotes-api/proposals/{id}
Accept or reject a proposal.

**Request Body**:
```json
{ "status": "accepted" }
```

Valid statuses: `"accepted"`, `"rejected"`

---

## 5. CRM Contacts

**Endpoint Base**: `/functions/v1/crm-contacts-api`
**Auth**: User JWT (requires `admin`, `manager`, or `factory` role) or Service Role Key

### POST /functions/v1/crm-contacts-api
Create a contact.

**Request Body**:
```json
{
  "name": "John Smith",
  "email": "john@example.com",
  "phone": "+1234567890",
  "company": "Acme Corp",
  "notes": "Met at trade show"
}
```

`name` is required. All other fields are optional.

---

### GET /functions/v1/crm-contacts-api
List contacts.

**Query Params**:

| Param | Type | Default |
|-------|------|---------|
| `limit` | number | 50 |
| `offset` | number | 0 |

---

### GET /functions/v1/crm-contacts-api/{id}
Get contact by ID. Includes `crm_contact_relationships`.

---

### PATCH /functions/v1/crm-contacts-api/{id}
Update contact. Pass any updatable fields in body.

---

### DELETE /functions/v1/crm-contacts-api/{id}
Delete contact and all its relationships.

---

### POST /functions/v1/crm-contacts-api/{id}/link-user
Link a platform user to a contact.

**Request Body**:
```json
{ "userId": "auth-user-uuid" }
```

---

### DELETE /functions/v1/crm-contacts-api/{id}/unlink-user
Unlink a user from a contact.

---

### GET /functions/v1/crm-contacts-api/potential-matches
Find contacts whose emails match existing platform users (for bulk linking).

**Response**:
```json
{
  "data": [
    {
      "contact": { "id": "...", "name": "...", "email": "..." },
      "user": { "id": "...", "email": "...", "profile": {} }
    }
  ],
  "count": 3
}
```

---

### POST /functions/v1/crm-contacts-api/bulk-link
Bulk link contacts to users.

**Request Body**:
```json
{
  "links": [
    { "contactId": "uuid", "userId": "auth-uuid" }
  ]
}
```

**Response**:
```json
{
  "data": [],
  "errors": [],
  "successCount": 2,
  "errorCount": 0
}
```

---

### GET /functions/v1/crm-contacts-api/by-user/{userId}
Get the contact linked to a specific user ID.

---

## 6. CRM Companies

**Endpoint Base**: `/functions/v1/crm-companies-api`
**Auth**: User JWT (requires `admin`, `manager`, or `factory` role) or Service Role Key

### POST /functions/v1/crm-companies-api
Create a company.

**Request Body**:
```json
{
  "name": "Acme Corp",
  "website": "https://acme.com",
  "industry": "Manufacturing",
  "employee_count": 500,
  "annual_revenue": 10000000,
  "email": "info@acme.com",
  "phone": "+1234567890",
  "address": "123 Main St",
  "city": "Athens",
  "state": "Attica",
  "postal_code": "10431",
  "country": "Greece",
  "linkedin": "https://linkedin.com/company/acme",
  "twitter": "@acme",
  "facebook": "acme",
  "description": "Tile manufacturer",
  "notes": "Key supplier"
}
```

`name` is required. All other fields are optional.

---

### GET /functions/v1/crm-companies-api
List companies.

**Query Params**:

| Param | Type | Default |
|-------|------|---------|
| `limit` | number | 50 |
| `offset` | number | 0 |
| `search` | string | — |

Search filters by `name`, `email`, and `website`.

---

### GET /functions/v1/crm-companies-api/{id}
Get company with related contacts. Includes `crm_company_contacts` with nested `crm_contacts`.

---

### PATCH /functions/v1/crm-companies-api/{id}
Update company. Pass any updatable fields.

---

### DELETE /functions/v1/crm-companies-api/{id}
Delete company.

---

### POST /functions/v1/crm-companies-api/{id}/contacts
Attach a contact to a company.

**Request Body**:
```json
{
  "contact_id": "uuid",
  "role": "CEO",
  "is_primary": true,
  "notes": "Main decision maker"
}
```

`contact_id` is required.

---

### DELETE /functions/v1/crm-companies-api/{companyId}/contacts/{relationshipId}
Detach a contact from a company by relationship record ID.

---

## 7. CRM Users Admin

**Endpoint Base**: `/functions/v1/crm-users-api`
**Auth**: User JWT (requires `admin` role) or Service Role Key

### GET /functions/v1/crm-users-api
List all platform users. Merges auth users, profiles, and credits.

**Query Params**:

| Param | Type | Default |
|-------|------|---------|
| `limit` | number | 1000 |
| `offset` | number | 0 |

**Response**:
```json
{
  "data": [
    {
      "id": "profile-uuid",
      "user_id": "auth-uuid",
      "email": "user@example.com",
      "role_id": "uuid",
      "subscription_tier": "pro",
      "status": "active",
      "credits": 150.0,
      "created_at": "2026-01-01T00:00:00Z",
      "roles": { "id": "uuid", "name": "admin", "level": 100 }
    }
  ],
  "count": 42
}
```

---

### GET /functions/v1/crm-users-api/{userId}
Get single user with role, subscription, and credits.

---

### GET /functions/v1/crm-users-api/{userId}/ai-usage
Get user AI usage history and cost summary.

**Query Params**:

| Param | Type | Default |
|-------|------|---------|
| `limit` | number | 50 |

**Response**:
```json
{
  "data": {
    "usage": [],
    "totals": {
      "total_calls": 120,
      "total_input_tokens": 450000,
      "total_output_tokens": 120000,
      "total_raw_cost_usd": 2.45,
      "total_billed_cost_usd": 3.67,
      "total_credits_debited": 367.0
    },
    "byModel": [
      { "model": "claude-opus-4-7", "calls": 80, "cost": 2.10, "credits": 210 }
    ]
  }
}
```

---

### PATCH /functions/v1/crm-users-api/{userId}
Update user role, status, or subscription tier.

**Request Body**:
```json
{
  "role_id": "uuid",
  "status": "active",
  "subscription_tier": "pro"
}
```

Valid statuses: `"active"`, `"suspended"`
Valid subscription tiers: `"free"`, `"starter"`, `"pro"`, `"enterprise"`

---

### DELETE /functions/v1/crm-users-api/{userId}
Delete user profile and credits. Does NOT delete the auth account.

---

## 8. CRM Stripe Billing

**Endpoint Base**: `/functions/v1/crm-stripe-api`
**Auth**: User JWT or Service Role Key

### POST /functions/v1/crm-stripe-api/subscriptions/create-checkout
Initiate subscription checkout.

**Request Body**:
```json
{ "plan_id": "uuid" }
```

---

### POST /functions/v1/crm-stripe-api/credits/purchase
Initiate credit package purchase.

**Request Body**:
```json
{ "package_id": "uuid" }
```

---

### GET /functions/v1/crm-stripe-api/subscriptions
Get current user's active subscription with plan details.

**Response**:
```json
{
  "data": {
    "id": "uuid",
    "status": "active",
    "current_period_start": "2026-01-01T00:00:00Z",
    "current_period_end": "2026-02-01T00:00:00Z",
    "subscription_plans": { "name": "Pro", "price": 99, "description": "..." }
  }
}
```

---

### GET /functions/v1/crm-stripe-api/credits
Get current user's credit balance.

**Response**:
```json
{ "data": { "balance": 150.0, "user_id": "uuid" } }
```

---

## 9. Stripe Checkout

**Endpoint**: `POST /functions/v1/stripe-checkout`
**Auth**: User JWT or Service Role Key
**Description**: Creates a Stripe Checkout session for credit purchases or subscriptions.

### Request Body

For credit purchase:
```json
{
  "type": "credit_purchase",
  "credits": 100,
  "price": 9.99,
  "successUrl": "https://yourapp.com/success",
  "cancelUrl": "https://yourapp.com/cancel"
}
```

For subscription:
```json
{
  "type": "subscription",
  "priceId": "price_stripe_id",
  "successUrl": "https://yourapp.com/success",
  "cancelUrl": "https://yourapp.com/cancel"
}
```

| Field | Type | Description |
|-------|------|-------------|
| `type` | `string` | `"credit_purchase"` or `"subscription"` |
| `priceId` | `string` | Stripe price ID (subscription only) |
| `credits` | `number` | Credits to grant (credit_purchase only) |
| `price` | `number` | Price in EUR (credit_purchase only) |
| `successUrl` | `string` | Redirect after success |
| `cancelUrl` | `string` | Redirect after cancel |

### Response `200`

```json
{ "url": "https://checkout.stripe.com/c/pay/..." }
```

---

## 10. Stripe Customer Portal

**Endpoint**: `POST /functions/v1/stripe-customer-portal`
**Auth**: User JWT or Service Role Key
**Description**: Creates a Stripe Customer Portal session for subscription management.

### Request Body

```json
{ "returnUrl": "https://yourapp.com/settings/billing" }
```

### Response `200`

```json
{ "url": "https://billing.stripe.com/session/..." }
```

---

## 11. Email API

**Endpoint**: `POST /functions/v1/email-api`
**Auth**: User JWT or Service Role Key
**Description**: Action-based email service powered by **Resend**.

> **Migration note (2026-03-11):** Email provider migrated from Amazon SES to Resend. Actions `verify-domain`, `check-domain`, `list-ses-domains`, and `sending-stats` have been removed. Domain verification is now managed directly in the [Resend Dashboard](https://resend.com/domains).

All requests use `POST` with `{ "action": "<action>", ...params }` in the body.

### Action: send
Send a transactional, marketing, or notification email. Supports plain HTML/text or a pre-saved template.

**Request Body**:
```json
{
  "action": "send",
  "to": "recipient@example.com",
  "from": "sender@yourdomain.com",
  "fromName": "Your Name",
  "subject": "Hello!",
  "html": "<h1>Hello</h1>",
  "text": "Hello",
  "templateSlug": "welcome-email",
  "variables": { "name": "John", "link": "https://..." },
  "cc": ["cc@example.com"],
  "bcc": ["bcc@example.com"],
  "replyTo": "reply@example.com",
  "tags": { "campaign": "launch-2026" },
  "emailType": "transactional"
}
```

Either `html`/`text` or `templateSlug` is required. `templateSlug` renders a React Email or HTML template stored in the database.

`emailType` values: `"transactional"`, `"marketing"`, `"notification"`

**Response**:
```json
{ "success": true, "messageId": "resend-email-uuid", "logId": "uuid" }
```

---

### Action: add-domain (Admin only)
Register a domain in the platform database. DNS verification must be completed separately in the [Resend Dashboard](https://resend.com/domains).

```json
{ "action": "add-domain", "domain": "yourdomain.com" }
```

**Response**:
```json
{
  "success": true,
  "domain": {
    "id": "uuid",
    "domain": "yourdomain.com",
    "verification_status": "pending",
    "created_at": "2026-03-11T00:00:00Z"
  },
  "message": "Domain added. Verify it in your Resend dashboard at resend.com/domains, then mark it verified here."
}
```

---

### Action: mark-domain-verified (Admin only)
Mark a domain as verified after confirming DNS records in the Resend dashboard.

```json
{ "action": "mark-domain-verified", "domain": "yourdomain.com" }
```

**Response**:
```json
{ "success": true }
```

---

### Action: domains
List all registered email domains from the database.

```json
{ "action": "domains" }
```

**Response**:
```json
{
  "success": true,
  "domains": [
    {
      "id": "uuid",
      "domain": "yourdomain.com",
      "verification_status": "verified",
      "is_default": true,
      "bounce_rate": 0.5,
      "complaint_rate": 0.1,
      "reputation_status": "healthy",
      "created_at": "2026-03-11T00:00:00Z"
    }
  ]
}
```

---

### Action: logs
Get email send logs.

```json
{ "action": "logs" }
```

Optional body fields: `status`, `emailType`, `limit` (default 50).

Valid `status` values: `"queued"`, `"sent"`, `"delivered"`, `"bounced"`, `"complained"`, `"failed"`

---

### Action: analytics
Get email delivery analytics. Data is sourced from the `email_analytics` table, populated by Resend webhook events.

```json
{
  "action": "analytics",
  "dateRange": { "start": "2026-01-01", "end": "2026-01-31" }
}
```

**Response**:
```json
{
  "success": true,
  "totalSent": 1500,
  "totalDelivered": 1450,
  "totalBounced": 25,
  "totalComplained": 3,
  "totalOpened": 600,
  "totalClicked": 120,
  "deliveryRate": 96.67,
  "bounceRate": 1.67,
  "complaintRate": 0.20,
  "openRate": 41.38,
  "clickRate": 20.0,
  "dailyData": []
}
```

---

### Actions Summary

| Action | Description | Auth |
|--------|-------------|------|
| `send` | Send an email (HTML, text, or template) | User |
| `add-domain` | Add a domain to the database | Admin |
| `mark-domain-verified` | Mark domain verified after Resend dashboard confirmation | Admin |
| `domains` | List all domains from database | User |
| `logs` | Get email sending logs | User |
| `analytics` | Get aggregated email analytics | User |

### Webhook Events

Resend sends delivery events to `POST /functions/v1/email-webhooks`. Configure this endpoint in the [Resend Dashboard → Webhooks](https://resend.com/webhooks). Signatures are verified using `RESEND_WEBHOOK_SECRET` (Svix HMAC-SHA256).

| Resend Event | Description |
|---|---|
| `email.sent` | Email accepted by Resend |
| `email.delivered` | Successfully delivered to recipient |
| `email.delivery_delayed` | Temporary delivery delay |
| `email.bounced` | Permanent bounce |
| `email.complained` | Spam complaint |
| `email.opened` | Recipient opened the email |
| `email.clicked` | Recipient clicked a link |

---

## 12. Messaging API SMS WhatsApp

**Endpoint**: `POST /functions/v1/messaging-api`
**Auth**: User JWT or Service Role Key
**Description**: Action-based provider-agnostic messaging via Twilio. Supports SMS and WhatsApp.

All requests use `POST` with `{ "action": "<action>", ...params }`.

### Action: send
Send a message to one or more recipients.

```json
{
  "action": "send",
  "channel": "sms",
  "to": "+1234567890",
  "content": "Hello from Material KAI!",
  "from": "+0987654321",
  "templateId": "template-uuid",
  "templateVariables": { "name": "John" },
  "mediaUrl": "https://example.com/image.jpg",
  "messageType": "transactional"
}
```

| Field | Type | Values |
|-------|------|--------|
| `channel` | string | `"sms"` or `"whatsapp"` |
| `to` | string or string[] | Phone number(s) in E.164 format |
| `messageType` | string | `"transactional"`, `"marketing"`, `"otp"`, `"notification"` |

**Response**:
```json
{
  "success": true,
  "sent": 1,
  "failed": 0,
  "results": [{ "success": true, "messageId": "SM...", "status": "queued", "to": "+1234567890" }]
}
```

---

### Action: send-bulk
Send to multiple recipients with per-recipient variable substitution.

```json
{
  "action": "send-bulk",
  "channel": "sms",
  "recipients": [
    { "to": "+1234567890", "variables": { "name": "John" } },
    { "to": "+0987654321", "variables": { "name": "Jane" } }
  ],
  "content": "Hi {{name}}, your order is ready!",
  "messageType": "notification"
}
```

---

### Action: channels
List configured messaging channels.

---

### Action: templates
List message templates.

---

### Action: logs
Get message send logs.

```json
{
  "action": "logs",
  "limit": 50,
  "offset": 0,
  "channel": "sms",
  "status": "delivered"
}
```

---

### Action: analytics
Get messaging analytics for a date range.

```json
{
  "action": "analytics",
  "startDate": "2026-01-01T00:00:00Z",
  "endDate": "2026-01-31T00:00:00Z"
}
```

**Response**:
```json
{
  "total": 500,
  "byStatus": { "delivered": 480, "failed": 20 },
  "byChannel": { "sms": 400, "whatsapp": 100 }
}
```

---

### Action: balance
Get Twilio account balance.

---

### Action: sync-channels
Sync phone numbers from Twilio account as messaging channels.

---

### Action: send-test
Send a test message.

```json
{
  "action": "send-test",
  "channel": "sms",
  "testNumber": "+1234567890",
  "content": "Test message"
}
```

---

### Action: get-settings
Get messaging provider settings.

---

### Action: update-settings
Update messaging settings.

```json
{
  "action": "update-settings",
  "settings": { "provider": "twilio" }
}
```

---

## 13. Recommendations API

**Endpoint Base**: `/functions/v1/recommendations-api`
**Auth**: User JWT or Service Role Key

### POST /functions/v1/recommendations-api/track-interaction
Track a user interaction with a material. Triggers recommendation cache invalidation.

**Request Body**:
```json
{
  "workspace_id": "uuid",
  "material_id": "uuid",
  "interaction_type": "view",
  "interaction_value": 1.0,
  "session_id": "optional-session-id",
  "metadata": {}
}
```

Valid `interaction_type` values: `view`, `click`, `save`, `purchase`, `rate`, `add_to_quote`, `share`

**Response** `201`:
```json
{ "data": {}, "message": "Interaction tracked successfully" }
```

---

### GET /functions/v1/recommendations-api/for-user
Get recommendations for the current user (cache-first).

**Query Params**:

| Param | Required | Default |
|-------|----------|---------|
| `workspace_id` | Yes | — |
| `limit` | No | 20 |
| `algorithm` | No | `"user_user"` |

**Response**:
```json
{
  "data": [
    { "material_id": "uuid", "score": 0.92, "confidence": 0.8, "algorithm": "user_user" }
  ],
  "cached": true
}
```

---

### GET /functions/v1/recommendations-api/similar-materials/{material_id}
Get materials similar to a given material using item-item collaborative filtering.

**Query Params**:

| Param | Required | Default |
|-------|----------|---------|
| `workspace_id` | Yes | — |
| `limit` | No | 10 |

---

### GET /functions/v1/recommendations-api/analytics/{workspace_id}
Get interaction and recommendation analytics for a workspace.

**Query Params**:

| Param | Default |
|-------|---------|
| `days` | 30 |

---

### DELETE /functions/v1/recommendations-api/cache
Invalidate recommendation cache for the current user.

**Query Params**:

| Param | Description |
|-------|-------------|
| `workspace_id` | Filter by workspace |
| `material_id` | Filter by material |

---

## 14. Generate VR World

**Endpoint**: `POST /functions/v1/generate-vr-world`
**Auth**: User JWT (required)
**Description**: Generates an explorable 3D Gaussian Splat world from an interior design image using WorldLabs Marble API. Debits credits on start and refunds on failure. Polls until complete synchronously.

### Request Body

```json
{
  "source_image_url": "https://storage.supabase.co/...",
  "prompt": "Modern living room with marble floors and warm lighting",
  "room_type": "living_room",
  "style": "modern",
  "model": "marble-0.1-mini"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `source_image_url` | `string` | Yes | Publicly accessible image URL |
| `prompt` | `string` | Yes | Text description of the desired world |
| `room_type` | `string` | No | Room type hint (e.g. `"living_room"`) |
| `style` | `string` | No | Style hint (e.g. `"modern"`) |
| `model` | `string` | No | `"marble-0.1-mini"` or `"marble-0.1-plus"` |

### Credit Costs

| Model | Credits | Estimated Time |
|-------|---------|---------------|
| `marble-0.1-mini` | 75 | 30-45 seconds |
| `marble-0.1-plus` | 300 | ~5 minutes |

### Response `200`

```json
{
  "success": true,
  "data": {
    "id": "vr-world-uuid",
    "world_id": "worldlabs-id",
    "status": "completed",
    "splat_url_100k": "https://...",
    "splat_url_500k": "https://...",
    "splat_url_full": "https://...",
    "collider_glb_url": "https://...",
    "panorama_url": "https://...",
    "thumbnail_url": "https://...",
    "caption": "A modern living room...",
    "credits_charged": 75,
    "completed_at": "2026-03-07T12:00:00Z"
  }
}
```

### Error Responses

| Status | Description |
|--------|-------------|
| `401` | Unauthorized |
| `402` | Insufficient credits |
| `405` | Method not allowed (not POST) |
| `500` | Generation failed (credits automatically refunded) |

---

## 15. Generate Quote PDF

**Endpoint**: `POST /functions/v1/generate-quote-pdf`
**Auth**: User JWT or Service Role Key
**Description**: Generates a branded PDF for a quote and uploads to Supabase Storage. Returns a signed URL valid for 7 days.

### Request Body

```json
{
  "quote_id": "uuid",
  "regenerate": false
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `quote_id` | `string` | Yes | Quote UUID from the `quotes` table |
| `regenerate` | `boolean` | No | Force regeneration even if PDF already exists |

### Response `200`

```json
{
  "success": true,
  "quote_number": "Q-2026-001",
  "pdf_url": "https://bgbavxtjlbvgplozizxu.supabase.co/storage/v1/object/sign/...",
  "pdf_storage_path": "quotes/{id}/quote-Q-2026-001.pdf"
}
```

---

## 16. Web Scraping Session Manager

**Endpoint**: `POST /functions/v1/scrape-session-manager`
**Auth**: User JWT or Service Role Key
**Description**: Controls the lifecycle of a web scraping session.

### Request Body

```json
{
  "sessionId": "uuid",
  "action": "start"
}
```

| Field | Type | Values |
|-------|------|--------|
| `sessionId` | `string` | UUID from `scraping_sessions` table |
| `action` | `string` | `"start"`, `"pause"`, `"resume"`, `"stop"` |

### Response

```json
{
  "success": true,
  "action": "start",
  "sessionId": "uuid"
}
```

Starting a session triggers async background processing. Pages are processed in batches of 3. On completion, automatically triggers product creation via the Python backend with exponential-backoff retry (up to 3 attempts).

---

## 17. Web Scraping Single Page

**Endpoint**: `POST /functions/v1/scrape-single-page`
**Auth**: User JWT or Service Role Key
**Description**: Scrapes a single URL using Firecrawl v2 API and extracts material data using structured AI extraction.

### Request Body

```json
{
  "pageUrl": "https://example.com/products/marble-tile",
  "sessionId": "uuid",
  "pageId": "uuid",
  "options": {
    "prompt": "Extract all materials...",
    "systemPrompt": null,
    "schema": {},
    "timeout": 30000
  }
}
```

All three of `pageUrl`, `sessionId`, and `pageId` are required.

### Response

```json
{
  "success": true,
  "pageId": "uuid",
  "materialsFound": 3,
  "processingTimeMs": 4200,
  "error": null
}
```

---

## 18. Web Scraping Sitemap Parser

**Endpoint**: `POST /functions/v1/parse-sitemap`
**Auth**: User JWT or Service Role Key
**Description**: Parses a sitemap XML and extracts page URLs for scraping sessions.

### Request Body

```json
{
  "url": "https://example.com/sitemap.xml"
}
```

---

## 19. Web Scraping Preview

**Endpoint**: `POST /functions/v1/scrape-preview`
**Auth**: User JWT or Service Role Key
**Description**: Preview extractable content from a URL without creating a session.

### Request Body

```json
{
  "url": "https://example.com/products"
}
```

---

## 20. PDF Batch Process

**Endpoint Base**: `/functions/v1/pdf-batch-process`
**Auth**: User JWT or Service Role Key
**Description**: Batch-process up to 100 documents for PDF extraction. Returns immediately with a `batchId` for polling.

### POST /functions/v1/pdf-batch-process
Create a batch processing job.

**Request Body**:
```json
{
  "documents": [
    {
      "documentId": "uuid",
      "extractionType": "all",
      "priority": "normal"
    }
  ],
  "workspaceId": "uuid",
  "options": {
    "includeImages": true,
    "includeMetadata": true,
    "chunkSize": 1000,
    "overlapSize": 100,
    "outputFormat": "json",
    "maxConcurrent": 3,
    "notifyOnComplete": true,
    "webhookUrl": "https://yourapp.com/webhook"
  }
}
```

| Field | Values |
|-------|--------|
| `extractionType` | `"markdown"`, `"tables"`, `"images"`, `"all"` |
| `priority` | `"low"`, `"normal"`, `"high"` |
| `maxConcurrent` | 1 to 10 |
| `chunkSize` | 100 to 10000 |

**Response** `202`:
```json
{
  "success": true,
  "data": {
    "batchId": "batch_1741234567_abc123",
    "status": "queued",
    "totalDocuments": 5,
    "processedDocuments": 0,
    "failedDocuments": 0,
    "estimatedCompletionTime": "2026-03-07T12:05:00Z",
    "results": [
      { "documentId": "uuid", "status": "pending" }
    ]
  }
}
```

---

### GET /functions/v1/pdf-batch-process?batchId={id}
Poll batch job status and results.

---

### DELETE /functions/v1/pdf-batch-process?batchId={id}
Cancel a queued or processing batch job.

---

## 21. Price Monitoring

> **Heads-up**: this section only covers the lightweight Supabase *edge function*
> shim. The actual price monitoring pipeline (Perplexity Sonar + DataForSEO
> Merchant discovery → Firecrawl verification → Haiku identity classification)
> runs on the MIVAA backend and is documented in full at
> [docs/api/price-monitoring-api.md](price-monitoring-api.md). Every row returned
> now carries `match_kind`, `match_score`, `match_note`, `product_title`,
> `original_price`, `verified`, and `source` — see that doc for the response
> schema.

**Endpoint**: `POST /functions/v1/price-monitoring`
**Auth**: User JWT or Service Role Key
**Description**: Entry point for Factory/Store users to toggle monitoring for a product. Delegates the actual scraping + identity verification to the MIVAA backend.

### Request Body

```json
{
  "action": "start_monitoring",
  "productId": "uuid",
  "monitoringSettings": {
    "frequency": "weekly",
    "enabled": true
  }
}
```

### Actions

| Action | Description |
|--------|-------------|
| `start_monitoring` | Enable monitoring with frequency setting |
| `stop_monitoring` | Pause monitoring for a product |
| `check_now` | On-demand price check against all competitor sources |
| `get_status` | Get monitoring config, latest prices, and recent jobs |

Valid frequencies: `"hourly"`, `"daily"`, `"weekly"`, `"on_demand"`

### Response for get_status

```json
{
  "success": true,
  "monitoring": {},
  "latestPrices": [],
  "recentJobs": [],
  "sources": []
}
```

### Response for check_now

```json
{
  "success": true,
  "message": "Price check completed",
  "jobId": "uuid",
  "results": {
    "sourcesChecked": 3,
    "pricesFound": 2,
    "creditsConsumed": 3
  }
}
```

---

## 22. SEO Pipeline

**Endpoint**: `POST /functions/v1/seo-pipeline`
**Auth**: User JWT (required)
**Description**: Full 5-stage SEO article pipeline: Research → Plan → Write → Analyze → Finalize. Long-running (2 to 5 minutes). Creates an `seo_articles` record immediately; poll that record for progress updates.

### Request Body

```json
{
  "topic": "Marble bathroom tiles guide",
  "target_keyword": "marble bathroom tiles",
  "language_code": "en",
  "location_code": 2840,
  "content_brief": {
    "contentType": "guide",
    "targetAudience": "homeowners",
    "toneOfVoice": "professional",
    "targetWordCount": 2000
  },
  "additional_instructions": "Focus on maintenance tips",
  "auto_fix": true,
  "max_fix_iterations": 3,
  "skip_research": false,
  "existing_research": null
}
```

| Field | Required | Description |
|-------|----------|-------------|
| `topic` | Yes | Article topic |
| `target_keyword` | Yes | Primary SEO keyword |
| `language_code` | No | Default: `"en"` |
| `location_code` | No | DataForSEO location code. Default: `2840` (US) |
| `content_brief` | No | Content configuration object |
| `auto_fix` | No | Auto-fix quality issues. Default: `true` |
| `max_fix_iterations` | No | Max auto-fix rounds. Default: `3` |
| `skip_research` | No | Skip keyword research (requires `existing_research`) |

### Response `200`

```json
{
  "success": true,
  "data": {
    "article_id": "uuid",
    "article": {
      "id": "uuid",
      "title": "Complete Guide to Marble Bathroom Tiles",
      "contentMarkdown": "# Complete Guide...",
      "contentHtml": "<h1>Complete Guide...</h1>",
      "wordCount": 2150,
      "metaTitle": "...",
      "metaDescription": "...",
      "slug": "marble-bathroom-tiles-guide",
      "schemaMarkup": {},
      "faqSchema": [],
      "optimize": { "contentScore": 87, "avgCompetitorScore": 72 },
      "status": "completed"
    }
  }
}
```

Poll the `seo_articles` table by `id` for `status`, `progress_percentage`, and `current_stage`.

**Status values**: `"researching"` → `"planning"` → `"writing"` → `"analyzing"` → `"completed"` / `"failed"`

---

## 23. SEO Sub-functions

Called internally by `seo-pipeline` but also callable directly.

### POST /functions/v1/seo-research
Keyword research via DataForSEO.

```json
{
  "topic": "marble tiles",
  "target_keyword": "marble bathroom tiles",
  "language_code": "en",
  "location_code": 2840,
  "user_id": "uuid"
}
```

---

### POST /functions/v1/seo-plan
Generate article plan and structure from research data.

```json
{
  "topic": "marble tiles",
  "target_keyword": "marble bathroom tiles",
  "keyword_research": {},
  "content_brief": {},
  "additional_instructions": "...",
  "user_id": "uuid"
}
```

---

### POST /functions/v1/seo-write
Write article content from a plan.

```json
{
  "article_plan": {},
  "content_brief": {},
  "keyword_research_summary": {},
  "user_id": "uuid"
}
```

---

### POST /functions/v1/seo-analyze
Analyze and optionally auto-fix article content for SEO quality.

```json
{
  "content_markdown": "# Article content...",
  "article_plan": {},
  "content_brief": {},
  "auto_fix": true,
  "max_iterations": 3,
  "user_id": "uuid"
}
```

---

## 24. Background Agent Runner

**Endpoint Base**: `/functions/v1/background-agent-runner`
**Auth**: User JWT or Service Role Key
**Description**: Executes registered background agents. Supports chain triggers, Python backend delegation, and chat callback posting.

### GET /functions/v1/background-agent-runner?catalog=1
Get the agent type catalog.

**Response**:
```json
{ "catalog": [] }
```

---

### POST /functions/v1/background-agent-runner
Run a background agent.

**Request Body**:
```json
{
  "agent_id": "uuid",
  "run_id": null,
  "input_data": { "custom_param": "value" },
  "triggered_by": "manual"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `agent_id` | `string` | Yes | UUID from `background_agents` table |
| `run_id` | `string` | No | Resume an existing pending run |
| `input_data` | `object` | No | Override or augment agent config input |
| `triggered_by` | `string` | No | `"cron"`, `"event"`, `"manual"`, `"chain"`, or `"api"` |

**Response (completed)**:
```json
{
  "success": true,
  "run_id": "uuid",
  "status": "completed",
  "duration_ms": 4200,
  "output": {}
}
```

**Response (delegated to Python backend)**:
```json
{
  "success": true,
  "run_id": "uuid",
  "status": "processing",
  "delegated_to_python": true,
  "duration_ms": 100
}
```

---

## 25. Flow Engine and Webhooks

### POST /functions/v1/flow-engine
Execute an automation flow.

```json
{
  "flow_id": "uuid",
  "trigger_data": {}
}
```

---

### POST /functions/v1/flow-webhook
Receive external webhook events to trigger flows.

```json
{
  "event_type": "product_created",
  "data": {}
}
```

---

## 26. Field Templates and Suggest Fields

### GET or POST /functions/v1/field-templates
Manage field mapping templates for web scraping schemas.

---

### POST /functions/v1/suggest-fields
AI-powered field suggestion for scraping extraction schemas.

**Request Body**:
```json
{
  "url": "https://example.com/products",
  "context": "tile manufacturer catalog"
}
```

---

## 27. Batch Update Sessions

**Endpoint**: `POST /functions/v1/batch-update-sessions`
**Auth**: User JWT or Service Role Key
**Description**: Batch-update multiple scraping session records.

---

## 28. Health Check

**Endpoint**: `GET /functions/v1/health-check`
**Auth**: User JWT or Service Role Key (JWT verification enabled)
**Description**: Platform health check endpoint.

**Response**:
```json
{
  "status": "ok",
  "timestamp": "2026-03-07T12:00:00Z"
}
```

---

## 29. Supabase REST API Direct Table Access

All tables are accessible via the Supabase PostgREST API with Row Level Security enforced.

**Base URL**: `https://bgbavxtjlbvgplozizxu.supabase.co/rest/v1`

**Required Headers**:
```
apikey: <anon-key-or-service-role-key>
Authorization: Bearer <jwt-token>
Content-Type: application/json
```

### Key Tables

| Table | Description |
|-------|-------------|
| `products` | Material/product catalog |
| `workspaces` | Workspace records |
| `workspace_members` | Workspace membership |
| `user_profiles` | User profile data (role, subscription, stripe_customer_id) |
| `user_credits` | Credit balance |
| `ai_usage_logs` | AI usage and billing history |
| `quotes` | Quote records |
| `quote_items` | Line items for quotes |
| `quote_requests` | Customer quote requests |
| `proposals` | Admin responses to quote requests |
| `crm_contacts` | CRM contact records |
| `crm_companies` | CRM company records |
| `crm_company_contacts` | Company-contact relationships |
| `scraping_sessions` | Web scraping session records |
| `scraping_pages` | Individual pages in a scraping session |
| `scraped_materials_temp` | Extracted materials awaiting approval |
| `background_agents` | Background agent configuration |
| `agent_runs` | Agent execution history |
| `agent_run_logs` | Agent run log entries (Realtime enabled) |
| `agent_chat_conversations` | Chat conversation records |
| `agent_chat_messages` | Chat message history |
| `seo_articles` | SEO article records (poll for pipeline status) |
| `email_templates` | Email template library |
| `email_logs` | Email send history |
| `email_analytics` | Daily email analytics aggregates |
| `email_domains` | Verified email domains |
| `messaging_channels` | Twilio messaging channels |
| `messaging_templates` | Message templates |
| `messaging_logs` | Message send history |
| `vr_worlds` | WorldLabs VR world records |
| `price_monitoring_products` | Price monitoring configuration |
| `price_history` | Historical competitor price records |
| `competitor_sources` | Competitor URLs for price monitoring |
| `product_prices` | **Admin-only (RLS).** Confirmed KB-sourced prices cached per product. `(workspace_id, product_id)` unique. Includes `source_kb_doc_ids`, `price_lookup_call_id` audit link. **(2026-04)** |
| `subscription_plans` | Available subscription plans |
| `roles` | User role definitions |
| `kb_categories` | KB category hierarchy (includes `slug`, `access_level`, `trigger_keyword`) |
| `kb_docs` | KB document records (includes `price_doc_type` for Pricing category docs) |
| `agent_tool_call_logs` | Per-tool-call logs with `tool_name`, `tool_args`, `result_summary`. Use `tool_name='price_lookup'` for pricing analytics. |

### Common Query Patterns

**List products**:
```
GET /rest/v1/products?select=*&order=created_at.desc&limit=20
```

**Filter by workspace**:
```
GET /rest/v1/products?workspace_id=eq.{uuid}&select=id,name,category
```

**Full-text search**:
```
GET /rest/v1/products?or=(name.ilike.*marble*,description.ilike.*marble*)
```

**Pagination**:
```
GET /rest/v1/products?limit=20&offset=40
```

**Insert**:
```
POST /rest/v1/products
Prefer: return=representation
Body: { "name": "...", "workspace_id": "..." }
```

**Update**:
```
PATCH /rest/v1/products?id=eq.{uuid}
Body: { "name": "Updated Name" }
```

**Delete**:
```
DELETE /rest/v1/products?id=eq.{uuid}
```

**Realtime subscription** (via Supabase client):
```js
supabase
  .channel('agent_runs')
  .on('postgres_changes', { event: '*', schema: 'public', table: 'agent_runs' }, callback)
  .subscribe()
```

---

## 30. Supabase Auth API

**Base URL**: `https://bgbavxtjlbvgplozizxu.supabase.co/auth/v1`

### Sign Up
```
POST /auth/v1/signup
Body: { "email": "user@example.com", "password": "..." }
```

### Sign In (Password)
```
POST /auth/v1/token?grant_type=password
Body: { "email": "user@example.com", "password": "..." }
Response: { "access_token": "...", "refresh_token": "...", "expires_in": 3600 }
```

### Refresh Token
```
POST /auth/v1/token?grant_type=refresh_token
Body: { "refresh_token": "..." }
```

### Get Current User
```
GET /auth/v1/user
Authorization: Bearer <access_token>
```

### Update User
```
PUT /auth/v1/user
Authorization: Bearer <access_token>
Body: { "email": "new@example.com", "password": "newpassword" }
```

### Sign Out
```
POST /auth/v1/logout
Authorization: Bearer <access_token>
```

### Password Reset (Send Email)
```
POST /auth/v1/recover
Body: { "email": "user@example.com" }
```

### Magic Link
```
POST /auth/v1/magiclink
Body: { "email": "user@example.com" }
```

### OAuth Redirect
```
GET /auth/v1/authorize?provider=google&redirect_to=https://yourapp.com/callback
```

Supported providers: `google`, `github`, `discord`, `facebook`, `twitter`, `apple`, `azure`

---

## 31. Supabase Storage API

**Base URL**: `https://bgbavxtjlbvgplozizxu.supabase.co/storage/v1`

### Storage Buckets

| Bucket | Description |
|--------|-------------|
| `product-images` | Product and material images |
| `workspace-assets` | Workspace logos and banners |
| `quote-documents` | Generated quote PDFs |
| `quote-templates` | PDF template images (cover, background, back cover) |
| `knowledge-base` | KB document files |

### Upload File
```
POST /storage/v1/object/{bucket}/{path}
Authorization: Bearer <token>
Content-Type: image/jpeg
Body: <binary content>
```

### Get Public URL
```
GET /storage/v1/object/public/{bucket}/{path}
```

### Get Signed URL (Private Buckets)
```
POST /storage/v1/object/sign/{bucket}/{path}
Body: { "expiresIn": 3600 }
Response: { "signedURL": "https://..." }
```

### Download File (Authenticated)
```
GET /storage/v1/object/authenticated/{bucket}/{path}
Authorization: Bearer <token>
```

### Delete File
```
DELETE /storage/v1/object/{bucket}
Body: { "prefixes": ["path/to/file.jpg"] }
```

---

## 32. Generate Interior (Gemini)

**Endpoint**: `POST /functions/v1/generate-interior-gemini`
**Auth**: User JWT or Service Role Key (with `user_id` in body)
**Description**: Multi-mode interior design image generation. Supports text-to-image, image editing, redesign with style transfer, floor plan rendering, and materials boards.

### Request Body

```json
{
  "mode": "text-to-image",
  "prompt": "Modern minimalist kitchen with marble countertops",
  "room_type": "kitchen",
  "style": "modern",
  "sqm": 25,
  "aspect_ratio": "16:9",
  "model_tier": "fast",
  "material_images": ["https://...product-image-1.jpg"],
  "reference_image_url": "https://...room-photo.jpg",
  "edit_instruction": "Replace the floor with dark oak",
  "style_reference_url": "https://...mood-image.jpg",
  "board_mode": "presentation-board",
  "user_id": "uuid",
  "workspace_id": "uuid"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `mode` | string | No | `text-to-image` \| `image-edit` \| `redesign` \| `copy-style` \| `floor-plan-render` \| `floor-plan-text` \| `materials-selection-board` |
| `prompt` | string | No | Generation or instruction text |
| `room_type` | string | No | Room type hint |
| `style` | string | No | Style hint |
| `sqm` | number | No | Square meters |
| `aspect_ratio` | string | No | e.g. `16:9` |
| `model_tier` | string | No | `fast` \| `pro` \| `grok` |
| `material_images` | string[] | No | Up to 14 catalog product image URLs |
| `reference_image_url` | string | Conditional | Required for image-edit, redesign, floor-plan-render, materials-selection-board |
| `edit_instruction` | string | No | Edit-mode instruction |
| `style_reference_url` | string | No | Style/mood reference image for dual-image modes |
| `board_mode` | string | No | `presentation-board` \| `selection-board` \| `photorealistic-render` |
| `user_id` | string | Conditional | Required when called with service role key |
| `workspace_id` | string | No | Workspace context |

### Credit Cost

| Model Tier | Credits |
|------------|---------|
| `fast` (gemini-3.1-flash-image-preview) | 6 |
| `pro` (gemini-3-pro-image-preview) | 15 |
| `grok` (grok-aurora) | 20 |
| flux-depth-pro (auto for certain modes) | 20 |

### Response `200`

```json
{
  "success": true,
  "job_id": "uuid",
  "mode": "text-to-image",
  "board_mode": null,
  "model": "gemini-3.1-flash-image-preview",
  "image_url": "https://storage.supabase.co/...",
  "credits_used": 6
}
```

---

## 33. Generate Interior Video v2

**Endpoint**: `POST /functions/v1/generate-interior-video-v2`
**Auth**: User JWT or Service Role Key (with `user_id` in body)
**Description**: Multi-model interior video generation. Supports async polling for long generations.

### Request Body

```json
{
  "source_image_url": "https://...room.jpg",
  "video_type": "walkthrough",
  "model": "veo-2",
  "prompt": "Slow pan through living room",
  "aspect_ratio": "16:9",
  "duration_seconds": 8,
  "before_image_url": "https://...before.jpg",
  "workspace_id": "uuid",
  "user_id": "uuid"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `source_image_url` | string | Yes | Public URL of source image |
| `video_type` | string | No | `walkthrough` \| `product_spotlight` \| `before_after` \| `floorplan_flythrough` \| `social_reel`. Default: `walkthrough` |
| `model` | string | No | `veo-2` \| `kling-v3.0` \| `wan2.1-i2v-720p` \| `runway-gen4-turbo`. Auto-selected by type if omitted |
| `prompt` | string | No | Video description |
| `aspect_ratio` | string | No | `16:9` \| `9:16` \| `1:1`. Default: `16:9` |
| `duration_seconds` | number | No | Default 8, max 8 (veo) or 10 (kling) |
| `before_image_url` | string | Conditional | Required for `before_after` type |

### Credit Cost

| Model | Credits |
|-------|---------|
| `veo-2` | 30 |
| `kling-v3.0` | 20 |
| `wan2.1-i2v-720p` | 12 |
| `runway-gen4-turbo` | 40 |

### Response `200`

```json
{
  "success": true,
  "job_id": "uuid",
  "video_url": "https://... or null (if async)",
  "model_used": "veo-2",
  "credits_used": 30,
  "video_type": "walkthrough",
  "status": "completed",
  "async_job": true,
  "prediction_id": "replicate-id-or-null"
}
```

When `async_job: true`, poll the `generation_videos` table by `job_id` for `status` and `video_url`.

---

## 34. Generate PBR Maps

**Endpoint**: `POST /functions/v1/generate-pbr-maps`
**Auth**: User JWT or Service Role Key (with `user_id` in body)
**Description**: Generates PBR texture maps (albedo, normal, roughness, metalness, tileable) from product images. Tries MIVAA SVBRDF extraction first, falls back to Replicate.

### Request Body

```json
{
  "product_id": "uuid",
  "source_image_url": "https://...material.jpg",
  "generate_tileable": true,
  "user_id": "uuid"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `product_id` | string | Yes | Product UUID |
| `source_image_url` | string | Yes | Material image URL |
| `generate_tileable` | boolean | No | Default: `true` |

### Credit Cost: 8 credits (fixed)

### Response `200`

```json
{
  "success": true,
  "product_id": "uuid",
  "pbr_maps": {
    "albedo_url": "https://...",
    "normal_url": "https://...",
    "roughness_url": "https://...",
    "metalness_url": "https://...",
    "tileable_url": "https://...",
    "status": "completed",
    "generated_at": "2026-04-17T12:00:00Z"
  },
  "credits_used": 8
}
```

---

## 35. Generate Region Edit

**Endpoint**: `POST /functions/v1/generate-region-edit`
**Auth**: User JWT or Service Role Key (with `user_id` in body)
**Description**: Masked inpainting — regenerates only painted areas while preserving the rest. Uses Grok Aurora.

### Request Body

```json
{
  "image_url": "https://...room.jpg",
  "mask_data_url": "data:image/png;base64,...",
  "prompt": "Replace with travertine stone flooring",
  "user_id": "uuid",
  "workspace_id": "uuid"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `image_url` | string | Yes | Public URL of room image |
| `mask_data_url` | string | Yes | PNG data URL (white=regenerate, black=keep) |
| `prompt` | string | Yes | What to change in the masked area |

### Credit Cost: 20 credits (fixed)

### Response `200`

```json
{
  "success": true,
  "job_id": "uuid",
  "image_url": "https://storage.supabase.co/...",
  "model": "grok-2-aurora",
  "credits_used": 20
}
```

---

## 36. Generate Virtual Staging

**Endpoint**: `POST /functions/v1/generate-virtual-staging`
**Auth**: User JWT or Service Role Key (with `user_id` in body)
**Description**: AI-powered virtual staging — adds furniture to empty rooms. Uses Replicate proplabs/virtual-staging model (~56s).

### Request Body

```json
{
  "source_image_url": "https://...empty-room.jpg",
  "room": "living_room",
  "furniture_style": "Modern Minimalist",
  "furniture_items": "sofa, coffee table, floor lamp",
  "workspace_id": "uuid",
  "user_id": "uuid"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `source_image_url` | string | Yes | Empty room image URL |
| `room` | string | Yes | Room type |
| `furniture_style` | string | No | Default: `"Default (AI decides)"` |
| `furniture_items` | string | No | Comma-separated furniture list |

### Credit Cost: 20 credits (fixed)

### Response `200`

```json
{
  "success": true,
  "job_id": "uuid",
  "image_url": "https://storage.supabase.co/...",
  "credits_used": 20,
  "room": "living_room",
  "furniture_style": "Modern Minimalist"
}
```

---

## 37. Social Content Generation

**Endpoint**: `POST /functions/v1/generate-social-content`
**Auth**: User JWT
**Description**: Generates 3 caption variants + hashtags + posting tips using Claude Haiku. Platform-optimized (Instagram 2200 chars, LinkedIn 3000, TikTok 2200, etc.).

### Request Body

```json
{
  "topic": "New marble collection launch",
  "platform": "instagram",
  "tone": "professional",
  "product_info": "Calacatta Gold marble tiles, 60x60cm",
  "include_hashtags": true,
  "hashtag_count": 10,
  "workspace_id": "uuid",
  "post_id": "uuid"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `topic` | string | Yes | Content topic |
| `platform` | string | Yes | `instagram` \| `facebook` \| `linkedin` \| `tiktok` \| `pinterest` \| `youtube` \| `twitter` \| `threads` |
| `tone` | string | No | Default: `"professional"` |
| `product_info` | string | No | Product context |
| `include_hashtags` | boolean | No | Default: `true` |
| `hashtag_count` | number | No | Default: 10 |
| `post_id` | string | No | Update existing social_posts record |

### Credit Cost: 2 credits (flat)

### Response `200`

```json
{
  "success": true,
  "post_id": "uuid",
  "captions": [
    { "variant": 1, "caption": "...", "char_count": 180 },
    { "variant": 2, "caption": "...", "char_count": 195 },
    { "variant": 3, "caption": "...", "char_count": 210 }
  ],
  "hashtags": ["#marble", "#interiordesign", "..."],
  "best_time_hint": "Tuesday 10-11 AM or Thursday 7-8 PM",
  "platform": "instagram",
  "credits_used": 2,
  "credits_remaining": 148
}
```

---

## 38. Social Image Generation

**Endpoint**: `POST /functions/v1/generate-social-image`
**Auth**: User JWT
**Description**: Routes to the best image model based on content type. Uploads result to Supabase Storage.

### Request Body

```json
{
  "prompt": "Elegant bathroom with marble walls, morning light",
  "image_type": "interior",
  "model": "auto",
  "aspect_ratio": "1:1",
  "workspace_id": "uuid",
  "post_id": "uuid"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `prompt` | string | Yes | Image description |
| `image_type` | string | No | `lifestyle` \| `product` \| `interior` \| `artistic`. Default: `lifestyle` |
| `model` | string | No | `aurora` \| `gemini` \| `flux` \| `auto`. Default: `auto` |
| `aspect_ratio` | string | No | `1:1` \| `4:5` \| `9:16` \| `16:9`. Default: `1:1` |

### Credit Cost

| Model | Credits | Auto-selected for |
|-------|---------|------------------|
| aurora (grok-2-aurora) | 10 | `lifestyle` |
| gemini (Gemini Imagen) | 5 | `product`, `interior` |
| flux (FLUX 2 Pro) | 6 | `artistic` |

### Response `200`

```json
{
  "success": true,
  "image_url": "https://storage.supabase.co/...",
  "model_used": "gemini",
  "credits_used": 5,
  "credits_remaining": 143,
  "aspect_ratio": "1:1"
}
```

---

## 39. Social Video Generation

**Endpoint**: `POST /functions/v1/generate-social-video`
**Auth**: User JWT
**Description**: Generates social reels via Replicate (Kling) or delegates veo-2 to generate-interior-video-v2. Supports async polling.

### Request Body

```json
{
  "source_image_url": "https://...room.jpg",
  "prompt": "Slow zoom into bathroom vanity",
  "model": "kling-3.0",
  "aspect_ratio": "9:16",
  "duration_seconds": 10,
  "workspace_id": "uuid",
  "post_id": "uuid"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `source_image_url` | string | Yes | Source image URL |
| `model` | string | No | `kling-3.0` \| `kling-1.6-pro` \| `veo-2`. Default: `kling-3.0` |
| `prompt` | string | No | Video description |
| `aspect_ratio` | string | No | Default: `9:16` |
| `duration_seconds` | number | No | Default: 10 |

### Credit Cost

| Model | Credits |
|-------|---------|
| `kling-3.0` | 20 |
| `kling-1.6-pro` | 15 |
| `veo-2` | 30 |

### Response `200`

```json
{
  "success": true,
  "video_url": "https://... or null (if async)",
  "job_id": "uuid",
  "prediction_id": "replicate-id-or-null",
  "model_used": "kling-3.0",
  "credits_used": 20,
  "status": "completed"
}
```

When `status: "processing"`, poll using `prediction_id`.

---

## 40. Social Publishing (Late.dev)

### POST /functions/v1/late-oauth

**Auth**: User JWT
**Description**: Manage social account connections via Late.dev OAuth.

**GET** — List connected accounts:
```
GET /functions/v1/late-oauth?workspace_id=uuid&include_inactive=false
```

**POST** — Connect/disconnect:
```json
{
  "action": "connect",
  "platform": "instagram",
  "workspace_id": "uuid"
}
```

| Action | Description |
|--------|-------------|
| `connect` | Returns `oauth_url` to redirect user to |
| `callback` | Complete OAuth (pass `code`, `state`) |
| `disconnect` | Disconnect account (`late_account_id`) |

Supported platforms: `instagram`, `facebook`, `linkedin`, `tiktok`, `pinterest`, `youtube`, `twitter`, `threads`

---

### POST /functions/v1/late-publish

**Auth**: User JWT
**Description**: Publish or schedule social posts via Late.dev.

```json
{
  "post_id": "uuid",
  "social_account_id": "uuid",
  "action": "publish_now",
  "workspace_id": "uuid",
  "scheduled_at": "2026-04-20T10:00:00Z"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `post_id` | string | Yes | social_posts record ID |
| `social_account_id` | string | Yes | Connected account ID |
| `action` | string | Yes | `publish_now` \| `schedule` |
| `scheduled_at` | string | Conditional | Required for `schedule` action |

**Response:**
```json
{
  "success": true,
  "action": "publish_now",
  "post_id": "uuid",
  "late_post_id": "late-uuid",
  "platform": "instagram",
  "handle": "@materialkai"
}
```

---

### POST /functions/v1/late-analytics

**Auth**: User JWT
**Description**: Fetch and sync analytics from Late.dev.

```json
{
  "action": "get_post_analytics",
  "post_ids": ["uuid"],
  "workspace_id": "uuid"
}
```

| Action | Description |
|--------|-------------|
| `get_post_analytics` | Fetch analytics for specific post IDs |
| `get_account_insights` | Sync account-level insights (`social_account_id`) |
| `get_best_time` | Get best posting times for a platform |

---

### POST /functions/v1/late-webhook-handler

**Auth**: None (validates `X-Late-Signature` HMAC-SHA256)
**Description**: Webhook receiver from Late.dev. Updates social_posts status on publish/fail/schedule events.

Event types: `post.published`, `post.failed`, `account.disconnected`, `post.scheduled`

---

## 41. Pinterest Integration

### POST /functions/v1/pinterest-import

**Auth**: User JWT
**Description**: Extract pin metadata and import pins into moodboards. Works without OAuth via oEmbed.

```json
{
  "action": "extract_pin",
  "pin_url": "https://pinterest.com/pin/123..."
}
```

| Action | Fields | Description |
|--------|--------|-------------|
| `extract_pin` | `pin_url` | Extract pin metadata via oEmbed |
| `import_pin` | `pin_url`, `moodboard_id`, `auto_match?` | Import single pin to moodboard, optionally auto-match against MIVAA materials |
| `import_pins_bulk` | `pin_urls[]`, `moodboard_id`, `auto_match?` | Bulk import pins |

**Response (import_pin):**
```json
{
  "success": true,
  "pin": { "title": "...", "image_url": "...", "author": "..." },
  "moodboard_item_id": "uuid",
  "image_url": "https://...",
  "matches": [{ "product_id": "...", "name": "...", "score": 0.87 }]
}
```

---

### POST /functions/v1/pinterest-oauth

**Auth**: User JWT
**Description**: Pinterest OAuth 2.0 flow for board browsing and authenticated pin import.

| Action | Fields | Description |
|--------|--------|-------------|
| `get_auth_url` | — | Returns OAuth redirect URL + state |
| `callback` | `code`, `state` | Complete OAuth exchange, store tokens |
| `get_boards` | — | List user's boards (paginated) |
| `get_board_pins` | `board_id`, `bookmark?` | List pins in a board (cursor-paginated) |
| `disconnect` | — | Remove stored tokens |

---

## 42. Webhook Receivers

These endpoints receive events from external services. They perform their own validation (HMAC signatures, query params) and do not require JWT auth.

### POST /functions/v1/email-webhook

**Source**: Resend
**Auth**: None (Svix HMAC-SHA256 signature validation via `RESEND_WEBHOOK_SECRET`)
**Description**: Processes email delivery events: `email.sent`, `email.delivered`, `email.bounced`, `email.complained`, `email.opened`, `email.clicked`. Updates `email_logs` and `campaign_recipients`.

---

### POST /functions/v1/ses-webhook

**Source**: AWS SES via SNS
**Auth**: None (SNS subscription confirmation flow)
**Description**: Legacy SES webhook. Handles `SubscriptionConfirmation` and `Notification` (Bounce/Complaint/Delivery). Updates `email_logs` and `campaign_recipients`.

---

### POST /functions/v1/firecrawl-webhook

**Source**: Firecrawl
**Auth**: None (validates `session_id` + `crawl_id` query params)
**Description**: Receives crawled pages during web scraping sessions. Events: `crawl.page` (stores pages), `crawl.completed` (triggers product creation via MIVAA), `crawl.failed`.

---

### POST /functions/v1/messaging-webhook

**Source**: Twilio
**Auth**: None (Twilio callback validation)
**Description**: Handles SMS/WhatsApp delivery status updates and incoming messages. Responds with TwiML. Auto-processes opt-out/opt-in keywords (STOP, START, HELP).

Query param `type`: `status` | `delivery` | `incoming`

---

## 43. Internal Utilities

These functions are callable but intended for internal/admin use. Not part of the standard 3rd-party API surface.

### POST /functions/v1/ai-pricing-updater

**Auth**: None (internal cron or manual trigger)
**Description**: Updates AI model pricing table (`ai_model_pricing`) from hardcoded reference prices for Anthropic, OpenAI, Voyage, Google, and Firecrawl. (Qwen pricing entries retired 2026-05-01 alongside the Qwen-removal migration; vision is now Anthropic-only and chunking moved to Claude Sonnet 4.6.)

```json
{ "force_update": false, "provider": "anthropic" }
```

**Response:**
```json
{
  "success": true,
  "stats": { "models_checked": 35, "models_updated": 3, "models_skipped": 32 }
}
```

---

### POST /functions/v1/check-material-alerts

**Auth**: Service Role Key
**Description**: Daily cron job (08:00 UTC). Finds products matching users' saved searches, inserts `material_alerts` and `user_notifications`.

**Response:**
```json
{ "processed": 15, "new_alerts": 3 }
```

---

### POST /functions/v1/trigger-factory-enrichment

**Auth**: Service Role Key
**Description**: Propagates factory metadata within a scope (document/session). Queues background enrichment agent if completeness < 90%.

```json
{
  "workspace_id": "uuid",
  "product_ids": ["uuid"],
  "scope_column": "source_document_id",
  "scope_value": "uuid",
  "force_enrichment": false
}
```

**Response:**
```json
{ "propagated": 12, "queued_job_id": "uuid" }
```

---

### POST /functions/v1/messaging-processor

**Auth**: None (cron-triggered)
**Description**: Processes scheduled messaging campaigns. Sends SMS/WhatsApp batches via Twilio with opt-out handling and retries.

**Response:**
```json
{
  "success": true,
  "stats": { "campaignsProcessed": 2, "messagesSent": 150, "messagesFailed": 3 }
}
```

---

### GET /functions/v1/agent-chat-debug

**Auth**: None
**Description**: Stub endpoint — returns `"ok"`. No implementation.

---

## Appendix A: Error Response Format

All edge functions return errors in a consistent format:

```json
{
  "error": "Human-readable error message"
}
```

Or with additional detail:
```json
{
  "success": false,
  "error": "Validation failed: reason",
  "message": "Additional details"
}
```

### Common HTTP Status Codes

| Code | Meaning |
|------|---------|
| `200` | Success |
| `201` | Created |
| `202` | Accepted (async job started) |
| `204` | No Content |
| `400` | Bad Request / Validation Error |
| `401` | Unauthorized (missing or invalid token) |
| `402` | Insufficient Credits |
| `403` | Forbidden (insufficient role) |
| `404` | Not Found |
| `405` | Method Not Allowed |
| `422` | Unprocessable Entity (agent disabled, no runner) |
| `500` | Internal Server Error |

---

## Appendix B: Internal / Cron Functions

The following functions are internal automation functions not intended for direct external calls:

| Function | Description |
|----------|-------------|
| `agent-scheduler-cron` | Runs background agents on schedule (pg_cron, every minute) |
| `auto-recovery-cron` | Recovers stuck agent runs older than 8 minutes (pg_cron) |
| `price-monitoring-cron` | Triggers scheduled price checks (pg_cron) |
| `job-cleanup-cron` | Cleans up old processing jobs (pg_cron) |
| `flow-scheduler-cron` | Triggers scheduled flows (pg_cron) |
| `scheduled-import-runner` | Runs scheduled XML product imports |
| `xml-import-orchestrator` | Orchestrates XML product import batches |
| `campaign-processor` | Processes and sends email campaigns |
| `notification-dispatcher` | Dispatches in-platform notifications |
| `email-webhooks` | Receives Resend delivery event webhooks (bounce, complaint, delivery, open, click) |
| `messaging-webhook` | Receives Twilio status callbacks |
| `messaging-processor` | Processes inbound messages |
| `ai-pricing-updater` | AI-assisted product pricing updates |
| `reset-platform` | Full platform data reset (admin only, destructive) |
| `kb-generate-embedding` | Generates embeddings for Knowledge Base documents |

---

## Appendix C: Rate Limits and Credits

### Credit System

The platform uses a credit system for AI operations. Credits are debited per operation.

| Operation Type | Approximate Cost |
|---------------|-----------------|
| KAI agent message (Opus) | 0.5-5 credits depending on length |
| KAI agent message (Haiku) | 0.1-1 credit |
| VR World generation (mini) | 75 credits |
| VR World generation (plus) | 300 credits |
| RAG text search | 0.5 credits |
| RAG visual search | 1 credit |
| Image analysis | 1 credit |
| CLIP embedding generation | 0.25 credits |
| Document upload and processing | 2 credits |
| SEO pipeline | 40-50 credits (full pipeline) |

Check balance via `GET /functions/v1/crm-stripe-api/credits` or the `user_credits` table.

### Rate Limiting

Edge functions do not impose explicit rate limits beyond Supabase's platform limits. Credit system provides natural throttling for AI operations.
