# Online Storefront (`/store/:slug`)

Part of the [Finance module](finance-system.md). A public mini-store that lets any workspace publish a subset of its priced catalog to a public URL, where anonymous visitors browse, build a cart, and check out via Stripe — handing off to the same `/pay/:token` flow used for invoice payment links (#207).

Edge function: `supabase/functions/finance-storefront/index.ts`. Public page: `src/pages/PublicStorefrontPage.tsx`. Route `/store/:slug` is registered **outside** `<AuthGuard>` in `src/App.tsx` (same pattern as `/board/:id`, `/c/:slug`).

Related: [Finance system](finance-system.md) · [Finance API](finance-system.md).

---

## 1. Configuration

A workspace enables and brands its store through `StorefrontCard` (`src/modules/finance/components/StorefrontCard.tsx`) in `SettingsTab`, writing `workspace_storefront` (one row per workspace, write-gated to `is_workspace_finance_manager`):

| Column | Purpose |
|---|---|
| `enabled` (default false) | master switch — when off, `meta` returns `{enabled:false}` and `products`/`checkout` 403 |
| `headline`, `subheadline` | store-page copy |
| `accent` | brand colour (stored + returned, **not yet applied** by the page) |

The public URL is `{origin}/store/{workspaces.slug}` — requires `workspaces.slug` to be set.

**Product selection / pricing**: products appear only when `product_prices.storefront_published=true AND list_price IS NOT NULL`. Per-product toggle via `storefrontService.setPublished()`. The displayed price is the workspace's own `product_prices.list_price` (gross, VAT-inclusive), with currency from `product_prices.currency`. Image is best-effort from `products.metadata`.

---

## 2. Public page flow

`/store/:slug` → `PublicStorefrontPage` (single component, no auth):

1. `storefrontService.getMeta(slug)` → `meta` — renders "store not open" if disabled.
2. `storefrontService.getProducts(slug)` → `products` — two-column grid + sticky cart.
3. Cart is plain React state (no persistence). Checkout requires `name` + `email` only (no address/shipping).
4. `storefrontService.checkout(slug, items, {name, email})` → `checkout` → `window.location.href = res.pay_url` (`{PUBLIC_APP_URL}/pay/{token}`).
5. `/pay/:token` (`PayInvoicePage`) auto-creates a Stripe Checkout session via `finance-pay-invoice` and redirects to Stripe.

---

## 3. `finance-storefront` edge function

POST-only, **no auth**, always service-role, discriminated by `action`:

- **`meta`** `{slug}` → `{enabled, workspace_name, headline, subheadline, accent}`. Browse always open (no entitlement check).
- **`products`** `{slug}` → array of `{product_id, name, description, unit, item_type, price, currency, image_url}`. 403 if disabled.
- **`checkout`** `{slug, items:[{product_id, qty}], customer:{name, email}}`:
  1. `assertEntitled(ws.id, 'sales-finance')` → 402 if not entitled (#212).
  2. **Server-side price recompute** — re-fetches `product_prices` for every cart item (client amounts never trusted); 409 if any product no longer published.
  3. VAT from `finance_settings.default_vat_rate`; prices treated VAT-inclusive.
  4. `next_invoice_number(workspace_id)` → draft `INV-YYYY-NNNN` (does **not** advance the legal counter).
  5. Inserts `invoices` (`status='draft'`, `document_type='11.1'`, `payment_method_code=7`, `prices_include_vat=true`, `pay_token` + 7-day expiry) + `invoice_items` (with myDATA classification from the product).
  6. → `{invoice_id, pay_token, pay_url, total, currency}`.

---

## 4. Stripe Connect checkout

**Onboarding** (`stripe-connect` edge function, owner/admin JWT): `onboard` creates a Stripe Express account, stores it on `workspace_payment_config.stripe_connect_account_id` with `payout_mode='connect'`, returns an account-onboarding link; `status` refreshes `charges_enabled` / `details_submitted` live from Stripe.

**Checkout session** (`finance-pay-invoice`): resolves the Connect account via `get_workspace_payout_account(workspace_id)` (returns the account only when `payout_mode='connect' AND charges_enabled`), then `stripe.checkout.sessions.create({ mode:'payment', payment_intent_data:{ transfer_data:{ destination: accountId }, metadata:{ type:'invoice_payment', invoice_id, workspace_id, internal_number } } })`.

**Fulfillment** (`stripe-webhooks` → `handleInvoicePaymentSucceeded`): on `payment_intent.succeeded` with `metadata.type='invoice_payment'`, inserts a `payments` row (`direction:'in'`, `method:'card'`) + `payment_allocations` row — the allocation's status-keeper trigger flips the invoice to `paid`/`partially_paid`.

`workspace_payment_config`: `workspace_id` PK, `payout_mode` (`'platform'`|`'connect'`), `stripe_connect_account_id`, `charges_enabled`, `details_submitted` (read `is_workspace_member`, write `is_workspace_finance_manager`).

---

## 5. Platform revenue model (#200)

There is **no application fee** on storefront/invoice payments today — the checkout uses a **destination charge** (`transfer_data.destination`), so the full amount goes to the tenant's Connect account; the platform takes 0%. Platform SaaS revenue (credits, subscriptions) is architecturally isolated on a **separate dedicated Stripe account** via `STRIPE_BILLING_SECRET_KEY` (`_shared/stripe-clients.ts → getPlatformBillingStripe()`, falls back to `STRIPE_SECRET_KEY`). To take a cut of storefront sales, add `application_fee_amount` to the checkout session — the architecture supports it; the storefront path doesn't implement it.

If a workspace has no Connect account configured, `get_workspace_payout_account` returns null, `transfer_data` is omitted, and payment goes to the platform's default Stripe account (the "platform collects" fallback) — silently, with no warning.

---

## 6. Order → finance document → myDATA

Storefront checkout creates a **draft** (`status='draft'`, `issued_at=NULL`, `legal_number=NULL`, `fiscal_status=NULL`). On payment, the webhook flips it to `paid` but does **not** issue or transmit it. A finance admin must manually:

1. Find the paid draft in Finance → Invoices.
2. `finance-issue-invoice { invoice_id, issue_now:true }` → allocates `legal_number`/`series_number`.
3. `finance-issue-invoice { invoice_id, submit_fiscal:true }` → transmits the `11.1` receipt to AADE (2 cr, entitlement-gated).

---

## 7. Known gaps / follow-ups

- **Paid orders are never auto-issued / auto-transmitted** to myDATA (manual step above).
- **No buyer notification** — storefront invoices have `created_by=NULL`, so the webhook's bell-notification insert is skipped; no email receipt either. An admin must poll Finance → Invoices.
- **No platform fee** on storefront sales (§5).
- **Mixed-currency carts** are silently broken — `currency` is overwritten per loop iteration; the invoice takes the last product's currency.
- **Anonymous buyer not persisted as a CRM contact** — `customer_contact_id`/`customer_company_id` NULL; name/email only in `invoices.notes`.
- **`accent`** stored but unused by the page.
- **Draft `internal_number` counter advances on every checkout** (incl. abandoned carts) — cosmetic gaps in the non-legal draft sequence only.
- **No pagination / search** on the public product list.

---

**Last updated**: 2026-06-09 · Covers #207, #200.
