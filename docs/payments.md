# Payments

Payment processing + invoice provider routing. The Payments module is the **parent / shared surface**: business identity printed on every invoice, the **built-in invoice generator**, and a **provider registry** that lists every enabled payment-provider module + routes invoice issuance to the active ERP.

Specific payment processors are **sibling modules** (`payments-stripe` today; future `payments-paypal`, `payments-adyen`, `payments-viva`, `payments-bank-transfer`). ERPs that bring native payment processing can also declare `provides: { payments: true }` and slot into the same registry.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│  payments  (parent module)                                          │
│  ─────────                                                          │
│  Owns:                                                              │
│   • Business identity (name / VAT / address) → finance_settings    │
│   • Built-in invoice generator (numbering / templates)             │
│   • Provider routing                                                │
│       - useInvoiceProvider()  →  single-winner (Oxygen vs built-in) │
│       - useActivePaymentProviders()  →  multi-provider array       │
└─────────────────────────────────────────────────────────────────────┘
       ▲                                  ▲
       │ provides.invoicing               │ provides.payments
       │                                  │
┌──────┴──────────┐               ┌───────┴────────────┐
│  oxygen         │               │  payments-stripe   │
│  ──────         │               │  ──────────────    │
│  Greek          │               │  Checkout for      │
│  e-invoicing    │               │  subs + credits    │
│  (notices only) │               │  + invoice pay-    │
│                 │               │  link, webhooks    │
└─────────────────┘               └────────────────────┘

  Future ERPs (xero, quickbooks, sap) can declare BOTH flags.
  Future payment providers (paypal, adyen, viva, bank-transfer)
  declare provides.payments only.
```

---

## Two capability flags

Modules declare what they bring in their `manifest.json`:

```jsonc
{
  "slug": "...",
  "provides": {
    "invoicing": true,   // handles invoice issuance end-to-end (ERP-style)
    "payments":  true    // accepts payments from customers (provider-style)
  }
}
```

- **`provides.invoicing`** — **single-winner**. Only one ERP wins the active-provider role at a time (alphabetical sort by slug on ties). When an ERP wins:
  - Built-in numbering + template UI on Payments → Invoicing tab **deactivates** with a banner
  - `IssueInvoiceButton` on the quote admin page **hides** for new quotes
  - The ERP's own push button (e.g. `OxygenPreInvoiceButton`) is the active surface
  - **Payment collection is unaffected** — customers still pay ERP-issued invoices through whichever payment providers are enabled

- **`provides.payments`** — **multi-provider**. Every enabled provider is listed on the Payments → Providers tab. Admins may operate several simultaneously (Stripe + PayPal + bank-transfer) and the checkout UI offers the customer a choice.

These flags are independent. An ERP may declare both (Xero or QuickBooks if you add them, for example, since they handle both invoicing AND payment processing). The parent Payments module declares neither — it's the registry / shared surface, not a provider itself.

---

## Module folders

### `src/modules/payments/` (parent)

```
src/modules/payments/
├── manifest.json                          ← slug='payments', no provides flags
├── index.ts                               ← registers 3 settingsPanels
├── services/
│   └── invoiceProviderService.ts          ← useInvoiceProvider, useActivePaymentProviders
└── components/
    ├── BusinessDetailsPanel.tsx           ← Business tab
    ├── ProvidersPanel.tsx                 ← Providers tab (lists active payment providers)
    └── InvoicingPanel.tsx                 ← Invoicing tab (numbering + design uploader + ERP banner)
```

Four tabs on `/admin/modules/payments/settings`:
- **Keys** — auto-mounted. Shows Stripe secrets that are linked to this module via `platform_secret_module_links` (the primary location is `payments-stripe`, but they appear here for convenience too).
- **Business** — legal entity printed on invoices.
- **Providers** — list of enabled payment-provider modules with "Configure" deep-links.
- **Invoicing** — built-in numbering + invoice template uploader. Banner-and-dim when an ERP wins.

### `src/modules/payments-stripe/` (child — Stripe provider)

```
src/modules/payments-stripe/
├── manifest.json                          ← slug='payments-stripe', provides.payments=true
├── index.ts                               ← registers 1 settingsPanel
└── components/
    └── StripeConfigPanel.tsx              ← webhook URL, dashboard links, product/price ID docs
```

Two tabs on `/admin/modules/payments-stripe/settings`:
- **Keys** — STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET (primary location, `platform_secrets.primary_module_slug='payments-stripe'`)
- **Configure** — webhook URL with copy button, Stripe Dashboard quick links

Stripe edge functions (`stripe-checkout`, `stripe-webhooks`, `stripe-customer-portal`, `finance-pay-invoice`) **stay in their current locations** — `supabase/functions/`. The module split is logical (config + UI surface); the runtime code wasn't co-located before and doesn't need to be now. Secrets are bootstrapped into `Deno.env` at function start regardless of which module slug owns them.

---

## Storage

All persistent config lives on **`finance_settings`** (one row per workspace). Same row read by the Finance module's SettingsTab — single source of truth.

| Column | Purpose | Tab |
|---|---|---|
| `business_name`, `business_vat`, `business_tax_office`, `business_address`, `business_city`, `business_postal_code`, `business_country_code`, `business_phone`, `business_email`, `business_website` | Legal entity on invoices + Stripe statement descriptor source | Payments → **Business** |
| `invoice_number_prefix` (default `INV-`), `invoice_next_number` (default 1), `invoice_number_pad` (default 6) | Built-in invoice numbering. Atomic increment by `finance-issue-invoice`. **Ignored when ERP wins.** | Payments → **Invoicing** |
| `default_payment_terms_days`, `default_vat_rate` | Stamp `due_at` + VAT on issued invoices | Payments → **Invoicing** |
| `invoice_template_cover_path`, `invoice_template_footer_path` | Storage paths in `quote-templates` bucket. Signed-URL'd at PDF generation time. | Payments → **Invoicing** |
| (existing) `statement_template_cover_path`, `statement_template_footer_path`, `digest_*`, `statements_*` | Owned by Finance — not edited from Payments. | Finance module |

**Stripe secrets** in `platform_secrets`:
- `STRIPE_SECRET_KEY` — `primary_module_slug='payments-stripe'`, also linked to `payments` + `sales-finance` (visible on all three Keys tabs)
- `STRIPE_WEBHOOK_SECRET` — same scope as above
- `STRIPE_CREDITS_PRODUCT_ID`, `STRIPE_PRO_PRICE_ID`, `STRIPE_ENTERPRISE_PRICE_ID` — env vars on MIVAA + checkout function (not stored in `platform_secrets` — they're lower-sensitivity and admins rotate them through the Stripe Dashboard)

Env vars always win over DB rows (`_shared/secrets.ts → resolveSecret`).

---

## Provider routing

### Invoice provider — single winner

[`useInvoiceProvider()`](../src/modules/payments/services/invoiceProviderService.ts):

```
useInvoiceProvider()
  ↓
registeredModules                   ← in-memory from src/modules/*/manifest.json
  .filter(m => m.manifest.provides?.invoicing === true)
  .filter(m => enabledSlugs.has(m.slug))   ← from /admin/modules toggle state (React Query)
  .sort((a, b) => a.slug.localeCompare(b.slug))
  [0]                               ← winner, or built-in 'payments' fallback
```

Returns `{ slug, name, isErp }`.

### Payment providers — multi-provider

[`useActivePaymentProviders()`](../src/modules/payments/services/invoiceProviderService.ts):

```
useActivePaymentProviders()
  ↓
registeredModules
  .filter(m => m.manifest.provides?.payments === true)
  .filter(m => enabledSlugs.has(m.slug))
  .sort((a, b) => a.slug.localeCompare(b.slug))
  → PaymentProvider[]               ← every active provider listed
```

Returns `Array<{ slug, name }>`. The Providers tab renders this list directly. Future checkout-time picker UIs (when there's more than one provider) read from the same hook.

---

## Adding a new provider

### A new payment processor (e.g. PayPal)

```
src/modules/payments-paypal/
├── manifest.json                          { "provides": { "payments": true } }
├── index.ts                               (settings panel for PayPal-specific config)
└── components/PaypalConfigPanel.tsx
```

Plus:
- DB migration: insert the module row, set PayPal-specific secrets with `primary_module_slug='payments-paypal'`
- Edge functions: `supabase/functions/paypal-checkout/`, `supabase/functions/paypal-webhooks/`
- It auto-appears on Payments → Providers as soon as the migration ships + the module is enabled

**No code change in the parent Payments module.** No change to `IssueInvoiceButton`. No change to the registry.

### A new ERP (e.g. Xero)

```
src/modules/xero/
├── manifest.json                          { "provides": { "invoicing": true } }
├── index.ts                               (settings panel, push button)
└── services/xeroService.ts                (integration logic)
```

If Xero also handles payment processing (some ERPs do — they ride their own merchant-of-record), add `"payments": true` too:

```json
{ "provides": { "invoicing": true, "payments": true } }
```

It will then appear on BOTH the invoice-provider single-winner race AND the Providers tab list.

### Multi-ERP priority (future)

If two ERPs are ever enabled simultaneously, the alphabetical sort by slug wins. That's deterministic but probably not what you want when this becomes real. Three ways to handle:

1. Add a numeric `priority` field under `provides.invoicing` and sort by it.
2. One-ERP-at-a-time rule — disable enabling a second one without explicit confirmation.
3. Per-workspace operator dropdown in Payments → Invoicing: "Active provider: [Oxygen ▼ / Xero / Built-in]".

(3) is the right answer when you actually have two ERPs. Multi-payment-provider doesn't have this problem (it's already a list).

---

## What stays in the parent Payments module regardless of provider

Even when an ERP wins invoice issuance, the parent Payments module continues to own:

- **Business identity** (Business tab) — used by Stripe statement descriptors AND for any payment-provider that needs a billing entity
- **Provider registry** (Providers tab) — lists enabled payment processors
- **Pay-token flow** for invoice payment — `finance-pay-invoice` edge function. The invoice the pay-link is for can come from EITHER the built-in provider OR the ERP; the pay-link flow doesn't care
- **Stripe webhook reconciliation** — `stripe-webhooks` handles `payment_intent.succeeded` and writes to `payments` + `payment_allocations`, marks invoices as paid

Only **invoice numbering + design** in the Invoicing tab deactivates when an ERP is on (because the ERP supplies its own number + PDF). Everything else stays live.

---

## Migration history

| Migration | What |
|---|---|
| `payments_module_phase_1` | Initial. `provides_invoicing` column on `modules`, business + numbering + template columns on `finance_settings`, registered the `payments` module row, re-scoped STRIPE_* secrets to `primary_module_slug='payments'`, linked to `sales-finance`. |
| `payments_module_drop_provides_invoicing_column` | Cleanup. Dropped `modules.provides_invoicing` — runtime is manifest-driven; the column was redundant. |
| `payments_stripe_module_split` | Split. Inserted the `payments-stripe` module row, re-scoped STRIPE_* secrets to `primary_module_slug='payments-stripe'`, added link to `payments` so secrets stay visible on the parent's Keys tab. |

Applied via `mcp__supabase__apply_migration` per the platform's [SQL workflow rule](../CLAUDE.md). No local `.sql` migration files.

---

## What we deliberately don't do

- **Don't move Stripe edge functions into `src/modules/payments-stripe/`** — they live under `supabase/functions/` and there's no benefit to relocating them (the deploy.yml + main.py + agent-chat references would all need updating for zero behavior change). The MODULE is the config + UI surface; the edge functions are the runtime.
- **Don't auto-deactivate any tab other than Invoicing** when an ERP wins. Business + Providers + Keys all stay active because they're orthogonal to who issues invoices.
- **Don't hide existing internal invoices** when an ERP becomes active. History is always reachable via the "Open invoice" link on the quote admin page.
- **Don't add a public partner API** (`/api/v1/payments/*`) yet. Payment processing is inherently customer-facing — pay-links, Checkout sessions, webhooks — not partner-facing data the way Projects / Mention / Job tracking are. Revisit when there's demand.
- **Don't enforce one-provider-only** for payments. Multi-provider checkout (e.g. customer picks Stripe vs PayPal at checkout time) is a real use case for future providers.

---

## Integration points

| Module | Integration |
|---|---|
| **`payments-stripe`** | Sibling. Owns Stripe-specific config + secrets. Declares `provides.payments=true`. |
| **`sales-finance`** | Shares storage on `finance_settings` (business details + invoice config). Finance's `SettingsTab` and Payments' `BusinessDetailsPanel`/`InvoicingPanel` edit the same rows. STRIPE_SECRET_KEY linked here too for the pay-token flow. |
| **`oxygen`** | Declares `provides.invoicing=true` in its manifest → wins the active-invoice-provider role when enabled. Has no `provides.payments` (it does NOT process payments — invoices it issues are still paid via whichever payment-provider is enabled here). |
| **`quotes`** | The `IssueInvoiceButton` on the quote admin page is a consumer of `useInvoiceProvider()` — hides for new quotes when ERP wins. |
| **Stripe edge functions** | `stripe-checkout`, `stripe-webhooks`, `stripe-customer-portal`, `finance-pay-invoice` — unchanged behaviour. Read STRIPE_* secrets via env, bootstrapped from `platform_secrets` regardless of module slug. |

---

## Shared edge-function helpers

Two complementary helpers cover every edge function that calls an external API:

### 1. [`_shared/api-provider-errors.ts`](../supabase/functions/_shared/api-provider-errors.ts) — generic

Used by `email-api`, `messaging-api`, `messaging-processor`, `mivaa-gateway`, `generate-pbr-maps`, and any other edge function that calls a third-party API (Resend, Twilio, Replicate, OpenAI, Anthropic, MIVAA, etc.) when the required secret is unset.

```typescript
import { notConfiguredResponse } from '../_shared/api-provider-errors.ts';

if (!resendApiKey()) {
  return notConfiguredResponse({
    provider: 'Resend',
    envVarHint: 'Set RESEND_API_KEY on the host, or paste it',
    settingsPath: '/admin/modules/email/settings → Keys',
  });
}
```

Returns 503 with uniform shape `{ error, code: 'provider_not_configured', provider: '<lowercase-slug>' }` so a single frontend hook can branch on the code regardless of which provider failed.

### 2. [`_shared/stripe-clients.ts`](../supabase/functions/_shared/stripe-clients.ts) — Stripe-specific

Stripe-touching edge functions (`stripe-api/*`, `stripe-webhooks`, `finance-pay-invoice`, future processors) get extra ergonomics on top of the generic helper:

- `stripeSecretKey()`, `stripeWebhookSecret()`, `supabaseUrlEnv()`, `supabaseServiceKeyEnv()` — lazy env getters
- `getStripe(): Stripe | null` — memoised Stripe client built on first call
- `getSupabase(): SupabaseClient | null` — same for the service-role Supabase client
- `noPaymentProviderResponse(extraHeaders)` — wraps `notConfiguredResponse({ provider: 'Stripe', ... })` with the canonical customer-facing copy and `code: 'no_payment_provider_configured'` (the customer-facing variant; admin-facing services use `provider_not_configured`)
- `resetStripeClients()` — drops memoised clients for tests / post-rotation flows

```typescript
import { bootstrapForFunction } from '../_shared/secrets-bootstrap.ts';
import { getStripe, getSupabase, noPaymentProviderResponse } from '../_shared/stripe-clients.ts';

Deno.serve(async (req) => {
  await bootstrapForFunction();           // populate Deno.env from platform_secrets
  const stripe = getStripe();
  const supabase = getSupabase();
  if (!stripe || !supabase) return noPaymentProviderResponse();
  // … use stripe / supabase normally
});
```

Both helpers are the canonical pattern for new and existing edge functions touching external APIs. The error-code split (`provider_not_configured` vs `no_payment_provider_configured`) lets the frontend distinguish customer-facing payment failures from back-office service outages.

---

## Pending follow-ups

- **Wire the shared `stripe-clients.ts` helper into existing call sites** — `stripe-api/handlers/checkout.ts`, `stripe-api/handlers/customer-portal.ts`, `stripe-webhooks/index.ts`, and `finance-pay-invoice/index.ts` are still on the per-file module-load capture pattern. The helper is ready; adopting it makes DB-fallback secrets work without a cold restart and surfaces a clean 503 (`no_payment_provider_configured`) when Stripe isn't configured.
- **Multi-ERP picker** when a second ERP integration ships (Xero / QuickBooks). See "Multi-ERP priority" above.
- **Checkout-time provider picker** when there's a second payment provider (PayPal etc.) — today the platform implicitly assumes Stripe; the UI needs a small refactor to ask the customer which provider to use.
- **Invoice template preview in PDF context** — today the cover/footer uploader shows the raw image. A side-by-side preview rendering the cover + a fake invoice body + the footer would help operators verify alignment before issuing real invoices.
- **Consolidate quote PDF business fields** — quote PDFs currently read `system_settings.company_*` (separate path). Should consolidate to the `finance_settings.business_*` columns this module manages. Tracked as a Phase 2 cleanup.

---

## See also

- [docs/payments-stripe.md](payments-stripe.md) — Stripe sibling module reference
- [docs/billing-credits-system.md](billing-credits-system.md) — subscription + credit purchase flows
- [docs/quotes-system-architecture.md](quotes-system-architecture.md) — quote → invoice handoff
- [docs/projects.md](projects.md) — example of the documentation pattern this doc follows
- [src/modules/payments/services/invoiceProviderService.ts](../src/modules/payments/services/invoiceProviderService.ts) — provider resolver source
- [src/modules/_core/ModuleDefinition.ts](../src/modules/_core/ModuleDefinition.ts) — `ModuleManifest.provides` typing
