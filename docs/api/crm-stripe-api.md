# CRM Stripe API

**Function:** `crm-stripe-api`
**Base URL:** `https://bgbavxtjlbvgplozizxu.supabase.co/functions/v1/crm-stripe-api`
**Auth:** JWT (user) or API key (admin)

Handles subscription plans and credit package purchases via Stripe.

Full documentation: [billing-credits-system.md](../billing-credits-system.md)

---

## Create subscription checkout

```
POST /functions/v1/crm-stripe-api
Authorization: Bearer <jwt>
Content-Type: application/json

{
  "path": ["subscriptions", "create-checkout"],
  "method": "POST",
  "plan_id": "uuid",
  "success_url": "https://yourapp.com/billing?success=1",
  "cancel_url": "https://yourapp.com/billing"
}
```

**Response:** `{ "checkout_url": "https://checkout.stripe.com/..." }`

---

## Purchase credit package

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

**Response:** `{ "checkout_url": "https://checkout.stripe.com/..." }`

---

## Get current subscription

```
POST /functions/v1/crm-stripe-api
{
  "path": ["subscriptions"],
  "method": "GET"
}
```

**Response:**
```json
{
  "subscription": {
    "plan_id": "uuid",
    "status": "active",
    "current_period_end": "2026-04-28T00:00:00Z",
    "subscription_plans": { "name": "Pro", "price": 49 }
  }
}
```

---

## Get credit balance

```
POST /functions/v1/crm-stripe-api
{
  "path": ["credits"],
  "method": "GET"
}
```

**Response:** `{ "balance": 340, "total_purchased": 500, "total_used": 160 }`

---

## Stripe Checkout (direct session creation)

**Function:** `stripe-checkout`

```
POST /functions/v1/stripe-checkout
Authorization: Bearer <jwt>
{
  "type": "subscription",
  "priceId": "price_...",
  "successUrl": "https://...",
  "cancelUrl": "https://..."
}
```

```
POST /functions/v1/stripe-checkout
{
  "type": "credit_purchase",
  "priceId": "price_...",
  "credits": 100,
  "price": 9.99,
  "successUrl": "https://...",
  "cancelUrl": "https://..."
}
```

---

## Customer Portal

**Function:** `stripe-customer-portal`

Opens Stripe's self-service portal (plan changes, payment methods, invoices).

```
POST /functions/v1/stripe-customer-portal
Authorization: Bearer <jwt>
{ "return_url": "https://..." }
```

**Response:** `{ "portal_url": "https://billing.stripe.com/..." }`
