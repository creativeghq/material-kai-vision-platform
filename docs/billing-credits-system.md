# Billing & Credits System

Subscription plans and credit-based usage billing via Stripe.

---

## Overview

The platform uses a two-track billing model:

1. **Subscriptions** — Monthly/annual plans that include a credit allowance and feature access
2. **Credits** — Consumable units spent on AI generation features (images, video, VR worlds, etc.)

**Frontend Routes:**
- `/billing/subscriptions` — Manage subscription plan
- `/billing/credits` — View balance, purchase credit top-ups

**Edge Functions:**
- `crm-stripe-api` — Subscriptions + credit purchases (action-based routing)
- `stripe-checkout` — Creates Stripe Checkout sessions
- `stripe-customer-portal` — Opens Stripe's hosted billing portal
- `stripe-webhooks` — Processes Stripe webhook events (payment success, subscription changes)

---

## Credits

Credits are workspace-scoped. Each generation feature deducts a fixed amount.

### Credit Costs by Feature

| Feature | Credits | Edge Function |
|---|---|---|
| Interior image (Gemini flash) | 6 | `generate-interior-gemini` |
| Interior image (Gemini pro / 4K) | 15 | `generate-interior-gemini` |
| Region edit (Grok inpainting) | 20 | `generate-region-edit` |
| Virtual staging | 20 | `generate-virtual-staging` |
| Social caption generation | 2 | `generate-social-content` |
| Social image (Gemini) | 5 | `generate-social-image` |
| Social image (FLUX Dev) | 6 | `generate-social-image` |
| Social image (xAI Aurora) | 10 | `generate-social-image` |
| Social video (Kling 1.6 Pro) | 15 | `generate-social-video` |
| Interior video (Wan 2.1) | 12 | `generate-interior-video-v2` |
| Interior video (Kling v3.0) | 20 | `generate-interior-video-v2` |
| Interior video (Veo-2) | 30 | `generate-interior-video-v2` |
| Interior video (Runway Gen4 Turbo) | 40 | `generate-interior-video-v2` |
| VR World (Marble mini) | 50 | `generate-vr-world` |
| VR World (Marble plus) | 200 | `generate-vr-world` |
| AI search re-ranking | Usage-based | `ai-rerank` |

### Credit Balance

Stored in `user_credits` table:

| Column | Description |
|---|---|
| `user_id` | Owner |
| `workspace_id` | Workspace scope |
| `balance` | Current credit balance |
| `total_purchased` | Lifetime credits purchased |
| `total_used` | Lifetime credits consumed |
| `stripe_customer_id` | Linked Stripe customer |

---

## Subscriptions

Subscription plans are defined in the `subscription_plans` table and managed via Stripe Products + Prices.

### Database Tables

**`subscription_plans`**

| Column | Description |
|---|---|
| `id` | UUID primary key |
| `name` | Plan name (e.g., "Starter", "Pro", "Enterprise") |
| `price` | Monthly price |
| `description` | Plan description |
| `stripe_price_id` | Stripe Price ID for recurring billing |
| `credits_included` | Credits included per billing period |
| `features` | JSONB feature flags |

**`user_subscriptions`**

| Column | Description |
|---|---|
| `user_id` | User |
| `plan_id` | FK to `subscription_plans` |
| `stripe_subscription_id` | Stripe subscription ID |
| `status` | `active` \| `past_due` \| `cancelled` \| `trialing` |
| `current_period_start` | Billing period start |
| `current_period_end` | Billing period end |

**`credit_packages`**

| Column | Description |
|---|---|
| `id` | UUID |
| `credits` | Credit amount in package |
| `stripe_price_id` | Stripe Price ID for one-time charge |
| `price` | Display price |

---

## API Endpoints

### Create subscription checkout

```
POST /functions/v1/crm-stripe-api
Content-Type: application/json

{
  "path": ["subscriptions", "create-checkout"],
  "method": "POST",
  "plan_id": "uuid",
  "success_url": "https://...",
  "cancel_url": "https://..."
}
```

Returns: Stripe Checkout session URL.

### Purchase credits

```
POST /functions/v1/crm-stripe-api

{
  "path": ["credits", "purchase"],
  "method": "POST",
  "package_id": "uuid",
  "success_url": "https://...",
  "cancel_url": "https://..."
}
```

Returns: Stripe Checkout session URL.

### Get current subscription

```
POST /functions/v1/crm-stripe-api

{
  "path": ["subscriptions"],
  "method": "GET"
}
```

Returns: Current subscription with plan details.

### Get credit balance

```
POST /functions/v1/crm-stripe-api

{
  "path": ["credits"],
  "method": "GET"
}
```

Returns: `{ balance, total_purchased, total_used }`.

### Create Stripe Checkout session directly

```
POST /functions/v1/stripe-checkout
Authorization: Bearer <jwt>

{
  "type": "subscription" | "credit_purchase",
  "priceId": "price_...",
  "credits": 100,
  "price": 9.99,
  "successUrl": "https://...",
  "cancelUrl": "https://..."
}
```

### Open customer billing portal

```
POST /functions/v1/stripe-customer-portal
Authorization: Bearer <jwt>

{
  "return_url": "https://..."
}
```

Returns: Stripe Customer Portal URL for self-service plan changes and payment method updates.

---

## Webhook Processing

`stripe-webhooks` handles Stripe events:

| Event | Action |
|---|---|
| `checkout.session.completed` | Activates subscription or adds credits |
| `customer.subscription.updated` | Updates `user_subscriptions` status |
| `customer.subscription.deleted` | Cancels subscription |
| `invoice.payment_failed` | Marks subscription `past_due` |

---

## Stripe Customer Management

On first purchase, a Stripe Customer is created for the user and the `stripe_customer_id` is stored in `user_profiles` and `user_credits`. Subsequent purchases reuse the same customer.

---

**Last Updated:** March 2026
