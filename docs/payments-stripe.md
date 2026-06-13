# Payments — Stripe

Stripe as a payment provider. Sibling to the parent [Payments module](payments.md); registers itself via `provides.payments = true` in its manifest. Owns Stripe-specific config, secrets, and the existing edge functions (`stripe-checkout`, `stripe-webhooks`, `stripe-customer-portal`, `finance-pay-invoice`).

For the umbrella architecture — registry, multi-provider model, ERP routing, business identity — see [docs/payments.md](payments.md). This doc covers Stripe specifics only.

---

## Overview

The platform's Stripe integration was scattered across edge functions + platform-wide secrets before being formalised as a module. Nothing about the runtime behaviour changed in the split — `stripe-checkout` still mints Checkout sessions, `stripe-webhooks` still reconciles `payment_intent.succeeded` events, `finance-pay-invoice` still mints public pay-tokens for customer invoice payment. The module is the **config + UI surface**, not the runtime.

Why this is its own module instead of a tab inside the parent Payments module:

1. **Pluggability** — future PayPal / Adyen / Viva / bank-transfer slot in as siblings (`payments-paypal/`, `payments-adyen/`) with their own manifests, edge functions, secrets, and Settings UIs. Same shape as Stripe.
2. **Per-provider toggling** — admins can disable Stripe without disabling the parent Payments module.
3. **Secret scoping** — STRIPE_* keys live under `primary_module_slug='payments-stripe'`. A future `payments-paypal` would scope its secrets to its own slug. No cross-contamination on the Keys tabs.

**Routes:** No top-level routes. Reachable at:
- `/admin/modules` → Stripe card → Keys icon
- `/admin/modules/payments-stripe/settings` → 2 tabs: Keys / Configure

**Module folder:** [`src/modules/payments-stripe/`](../src/modules/payments-stripe/)

---

## Module shape

```
src/modules/payments-stripe/
├── manifest.json                          ← slug='payments-stripe', provides.payments=true
├── index.ts                               ← registers Configure tab
└── components/
    └── StripeConfigPanel.tsx              ← webhook URL, dashboard links, product/price ID docs
```

Two tabs on `/admin/modules/payments-stripe/settings`:

| Tab | Source | Content |
|---|---|---|
| **Keys** | Auto-mounted by `ModuleSettingsPage` (renders `SecretsManagerCard`) | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` |
| **Configure** | This module's `StripeConfigPanel` | Webhook URL (with copy button), Stripe Dashboard quick links, list of product/price ID env vars |

---

## Secrets

In `platform_secrets`:

| Key | Sensitive | Used by | Notes |
|---|---|---|---|
| `STRIPE_SECRET_KEY` | ✅ | All Stripe edge functions | Primary scope: `payments-stripe`. Linked to: `payments` (parent visibility), `sales-finance` (invoice pay-token flow). |
| `STRIPE_WEBHOOK_SECRET` | ✅ | `stripe-webhooks` | Same scope as above. Validated at function startup; missing → boot fails loud. |

Not in `platform_secrets` (env vars only on MIVAA + the checkout function — rotate from the Stripe Dashboard, no platform UI):

| Env var | Used by |
|---|---|
| `STRIPE_CREDITS_PRODUCT_ID` | `stripe-checkout` (credit purchase mode) |
| `STRIPE_PRO_PRICE_ID` | `stripe-checkout` (subscription mode — Pro tier) |
| `STRIPE_ENTERPRISE_PRICE_ID` | `stripe-checkout` (subscription mode — Enterprise tier) |

Env always wins over DB rows ([`_shared/secrets.ts → resolveSecret`](../supabase/functions/_shared/secrets.ts)). The bootstrap pattern ([`_shared/secrets-bootstrap.ts`](../supabase/functions/_shared/secrets-bootstrap.ts)) loads `platform_secrets` into `Deno.env` at function start — so when a function reads `Deno.env.get('STRIPE_SECRET_KEY')`, it sees env first OR the DB row if env was unset. The `primary_module_slug` field only controls UI grouping; the secret's `key` is the runtime identifier.

---

## Edge functions (live in `supabase/functions/` — not under the module folder)

| Function | Path | What it does |
|---|---|---|
| `stripe-api` | [`supabase/functions/stripe-api/`](../supabase/functions/stripe-api/) | Unified action-dispatch endpoint. Body `{action: 'checkout' \| 'customer_portal', ...}`. Creates Checkout sessions for credit purchases + subscriptions, opens Stripe's customer billing portal. Auth: JWT or admin key. |
| `stripe-webhooks` | [`supabase/functions/stripe-webhooks/`](../supabase/functions/stripe-webhooks/) | Handles `payment_intent.succeeded`, `checkout.session.completed`, `customer.subscription.*`, `invoice.payment_failed`. Auth: HMAC signature against `STRIPE_WEBHOOK_SECRET`. Kept separate from `stripe-api` for security boundary + Stripe Dashboard URL stability (see [stripe-api.md](api/stripe-api.md) for rationale). |
| `finance-pay-invoice` | [`supabase/functions/finance-pay-invoice/`](../supabase/functions/finance-pay-invoice/) | Mints invoice pay-tokens (admin auth) + creates Checkout sessions for customer-initiated invoice payment (public token auth). Webhook reconciles back to `payments` + `payment_allocations`. |

The edge functions stay co-located under `supabase/functions/` rather than moving into the module folder — they're deployed via Supabase's per-function deploy command, referenced from `deploy.yml` / `main.py` / `agent-chat`, and relocating them would be churn for zero behavior change.

### Canonical shared helper

New Stripe-touching code should use **[`_shared/stripe-clients.ts`](../supabase/functions/_shared/stripe-clients.ts)** — single source of truth for the lazy-getter pattern (`getStripe()`, `getSupabase()`, `noPaymentProviderResponse()`). See [docs/payments.md → Shared edge-function helper](payments.md#shared-edge-function-helper) for the call-site pattern and rationale.

Migration of the four existing Stripe-touching functions to this helper is a tracked follow-up — the helper is ready, the call-site swap is a small per-file edit.

---

## Webhook setup

On the Configure tab, the panel shows a Webhook URL with a copy button:

```
https://<your-project>.supabase.co/functions/v1/stripe-webhooks
```

Steps to wire it up in the Stripe Dashboard:

1. Navigate to Stripe Dashboard → Developers → Webhooks → Add endpoint
2. Paste the URL from the Configure tab
3. Select events: `payment_intent.succeeded`, `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_failed`
4. Copy the signing secret from Stripe
5. Save it as `STRIPE_WEBHOOK_SECRET` on the Keys tab (or set as env var on MIVAA — env wins)

---

## What this module does NOT do

- **It does not handle invoice issuance.** That's the [parent Payments module](payments.md) (built-in invoicer) or an [ERP module](payments.md#two-capability-flags) (e.g. future Xero, QuickBooks, SAP). Stripe just charges the customer for whatever invoice / subscription / credit purchase exists.
- **It does not own business identity.** Business name, VAT, address are on the parent Payments module → Business tab.
- **It does not declare `provides.invoicing`.** Stripe is a payment processor, not an invoice generator. If Stripe ever offered an invoice-issuance product the platform wanted to use, the flag would be set then.

---

## Migration history

The split from "Stripe inside Payments" → "Stripe as its own module" landed in `payments_stripe_module_split` (applied 2026-05-24). That migration:
- Inserted the `payments-stripe` row into `modules`
- Updated `platform_secrets.primary_module_slug` for STRIPE_* keys from `'payments'` → `'payments-stripe'`
- Added cross-links so STRIPE_* secrets remain visible from the parent Payments module's Keys tab and the Finance module's Keys tab

See [docs/payments.md → Migration history](payments.md#migration-history) for the full chain.

---

## See also

- [docs/payments.md](payments.md) — parent module + provider registry + ERP routing
- [docs/billing-credits-system.md](billing-credits-system.md) — subscription + credit purchase flows (Stripe Checkout details)
- [src/modules/payments-stripe/components/StripeConfigPanel.tsx](../src/modules/payments-stripe/components/StripeConfigPanel.tsx) — panel source
- [supabase/functions/stripe-checkout/index.ts](../supabase/functions/stripe-checkout/index.ts) — Checkout session creation
- [supabase/functions/stripe-webhooks/index.ts](../supabase/functions/stripe-webhooks/index.ts) — webhook handler
