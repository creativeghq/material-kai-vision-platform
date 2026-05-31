# Stripe API

**Edge Function:** `stripe-api`
**Base URL:** `https://bgbavxtjlbvgplozizxu.supabase.co/functions/v1/stripe-api`

Customer-facing actions only. `stripe-webhooks` stays a separate function — Stripe's webhook URL points there.
CRM stripe (subscriptions/credits admin) lives under `crm-api/stripe/*` — see [crm-api.md](./crm-api.md).

## Actions

| Action | Body | Result |
|---|---|---|
| `checkout` | `{ type: 'credit_purchase' \| 'subscription', priceId?, credits?, price?, successUrl, cancelUrl }` | `{ url }` — redirect target |
| `customer_portal` | `{ returnUrl }` | `{ url }` — Stripe Customer Portal session URL |

## Authentication

Bearer JWT or admin secret key.

## Request

```http
POST /functions/v1/stripe-api
Content-Type: application/json
Authorization: Bearer <supabase_access_token>

{ "action": "checkout", "type": "credit_purchase", "credits": 1000, "price": 9.99, "successUrl": "...", "cancelUrl": "..." }
```
