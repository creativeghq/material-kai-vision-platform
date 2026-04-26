# Oxygen Module — Greek e-Invoicing Pre-Invoice (Notice) Integration

Self-contained module that lets admins push an accepted quote to **oxygen.gr** as a **notice (pre-invoice)** via [POST /notices](https://docs.oxygen.gr/oxygen-api.json). Drop-in: delete this folder + remove the import in [QuoteDetailAdminPage.tsx](../quotes/pages/QuoteDetailAdminPage.tsx) to fully uninstall.

## Endpoints touched on Oxygen

| Step | Method | Path | When |
|---|---|---|---|
| Customer lookup | `GET` | `/contacts?vat=…` or `?email=…` | Before each pre-invoice if `oxygen_contact_id` is missing on our row |
| Customer create | `POST` | `/contacts` | When lookup returns nothing |
| Product create | `POST` | `/products` | First time a product appears on a notice (cached as `products.oxygen_product_id`) |
| **Pre-invoice** | `POST` | `/notices` | The actual goal. Idempotent on our side — once `quotes.oxygen_notice_id` is set, button is permanently disabled |

We **never** call `POST /invoices`. Notices only.

## Auth

`Authorization: Bearer <OXYGEN_API_KEY>`. Wrapper in [supabase/functions/_shared/oxygen/client.ts](../../../supabase/functions/_shared/oxygen/client.ts).

## Database surface (added by migrations m1/m2/m3)

| Table | New columns |
|---|---|
| `crm_contacts` | `first_name`, `last_name`, `contact_type`, `vat_number`, `tax_office`, `profession`, `is_client`, `country_code`, `street`, `street_number`, `oxygen_contact_id` |
| `crm_companies` | `tax_office`, `profession`, `country_code`, `street`, `street_number`, `oxygen_contact_id` (already had `vat_number`) |
| `quotes` | `customer_contact_id`, `customer_company_id` (XOR-checked), `oxygen_notice_id` (unique), `oxygen_contact_id`, `oxygen_sync_status` (`pending`/`syncing`/`synced`/`failed`), `oxygen_last_sync_at`, `oxygen_sync_error` |
| `products` | `sku`, `oxygen_product_id` (unique), `oxygen_tax_id` |

## Customer resolution

Quote → customer lookup order (first hit wins):
1. `quotes.customer_company_id` → `crm_companies` row (B2B path, type=2)
2. `quotes.customer_contact_id` → `crm_contacts` row (private path, type=1; or company if `vat_number` is set)
3. Neither — admin is prompted via `CustomerLinkDialog` to search/select a CRM contact or company before the pre-invoice runs

`quotes.user_id` (the platform user who created the quote) is **not** used as the billing customer — that's the operator/designer, not the bill-to party.

## Hard idempotency

- Edge function early-returns if `quotes.oxygen_notice_id IS NOT NULL`.
- DB unique index on `quotes.oxygen_notice_id` + on `oxygen_contact_id`/`oxygen_product_id`.
- Frontend button permanently disabled once a notice id is present (no resend, even on failure).
- Failure path keeps `oxygen_notice_id` NULL so a retry is possible — but `oxygen_sync_status='failed'` and the error is shown in a tooltip.

## Edge function

[supabase/functions/oxygen-create-pre-invoice/index.ts](../../../supabase/functions/oxygen-create-pre-invoice/index.ts)

- Auth: admin/super_admin user JWT only
- Input: `{ quote_id }`
- Steps: idempotency check → status gate (`accepted` only) → customer linkage gate → contact resolve (lookup→create) → per-line product resolve (create-if-missing) → `POST /notices` → persist sync state.

## Required secrets (Supabase Edge Functions)

| Secret | Purpose |
|---|---|
| `OXYGEN_API_KEY` | Bearer token for all Oxygen API calls |
| `OXYGEN_API_BASE_URL` | Optional override, defaults to `https://api.oxygen.gr/v1` |
| `OXYGEN_DEFAULT_TAX_ID_24` | Numeric Oxygen tax id for 24% Greek VAT (line `tax_id` fallback). Look up via `GET /taxes` once and store. |
| `OXYGEN_DEFAULT_WAREHOUSE_ID` | Numeric Oxygen warehouse id (single-warehouse setup). Look up via `GET /warehouses` once and store. |

## Public API

```ts
import { OxygenPreInvoiceButton, oxygenService } from '@/modules/oxygen';

<OxygenPreInvoiceButton quote={quote} onSynced={refetch} />
```

## Removal

```bash
rm -rf src/modules/oxygen
rm -rf supabase/functions/oxygen-create-pre-invoice
rm -rf supabase/functions/_shared/oxygen
# remove the OxygenPreInvoiceButton import + JSX in QuoteDetailAdminPage.tsx
```
DB columns can be dropped with a reverse migration if desired, but they're nullable and self-contained, so leaving them costs nothing.
