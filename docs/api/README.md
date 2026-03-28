# API Documentation

This directory contains comprehensive documentation for all Supabase Edge Function APIs in the Material Kai Vision Platform.

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
- **Features:** Quote requests, proposals, status tracking
- **Access:** Authenticated users

#### [Recommendations API](./recommendations-api.md)
Collaborative filtering recommendations and interaction tracking.
- **Function:** `recommendations-api`
- **Features:** User interactions, personalized recommendations, similar materials
- **Access:** Authenticated users

### AI & Agent APIs

#### [Agent Chat API](./agent-chat-api.md)
Multi-agent AI system powered by LangChain.js and Claude.
- **Function:** `agent-chat`
- **Features:** Search agent, interior designer agent, product agent
- **Access:** Role-based (varies by agent)

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

#### [AI Re-rank API](./ai-rerank-api.md)
Claude-powered search result re-ordering for improved relevance.
- **Function:** `ai-rerank`
- **Features:** Semantic re-ranking, optional explanations, sonnet/haiku model choice
- **Access:** Authenticated users

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

