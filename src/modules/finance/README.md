# Sales & Finance module (`sales-finance`)

> `category: core` · `priceTier: pro` · `manifest.json`
> Multi-tenant Greek e-invoicing + AR/AP. **Tenant = workspace.**

This module is the platform's accounting and AADE/myDATA e-invoicing layer. Full architecture lives in the docs — this README is the in-code map.

## Docs
- **[docs/finance-system.md](../../../docs/finance-system.md)** — finance core (myDATA/Novus/AADE, reports, credit notes, inbound, secrets).
- **[docs/pos-retail-system.md](../../../docs/pos-retail-system.md)** — POS, Law 5155, vPOS shifts, thermal receipts.
- **[docs/online-storefront.md](../../../docs/online-storefront.md)** — `/store/:slug` + Stripe Connect.
- **[docs/warehouse-and-billing.md](../../../docs/warehouse-and-billing.md)** — inventory, time-tracking, project billing.
- **[docs/sales-and-marketplace.md](../../../docs/sales-and-marketplace.md)** — sales portal, catalog access, procurement routing.
- **[docs/capabilities-and-tenancy.md](../../../docs/capabilities-and-tenancy.md)** — `finance.manage`/`invoice.issue` capabilities + `sales-finance` entitlement.
- **[docs/api/finance-api.md](../../../docs/api/finance-api.md)** — `finance-*` edge function reference.

## Layout (`src/modules/finance/`)
- `pages/` — `DocumentsPage` (Invoices / Credit Notes / Delivery Notes / Supplier Bills / Inbound / Parties / Planning / Reports / Settings), `PosPage`.
- `tabs/` — `ReportsTab`, `PartiesTab`, `SettingsTab`, `PlanningTab`, `TimeBillingTab`.
- `services/` — `financeService` (single merged service, all document/fiscal/payment/report/pay/digest ops + canonical `VAT_CATEGORIES`), `accountingExportService`, `inboundService`, `posSessionService`, `timeTrackingService`, `warehouseService`, `deliveryNotesService`, `projectsService` (billing).
- `components/` — `AccountingExportCard`, `PosTerminalsCard`, `StorefrontCard`, `WarehousePanel`, `InboundSetupCard`, `BranchesCard`, `TeamInviteCard`, `CustomerFinanceTabs`, etc.

## Edge functions (`supabase/functions/`)
`finance-issue-invoice`, `finance-invoice-pdf`, `finance-pay-invoice`, `finance-send-invoice-email`, `finance-send-statement`, `finance-inbound-sync`, `finance-fiscal-offline-recovery`, `finance-digest-aggregate`, `finance-storefront`. Shared fiscal layer: `_shared/fiscal/{registry,invoice-builder,novus}.ts`; entitlement: `_shared/entitlement.ts`.

## Conventions
- **SQL via `mcp__supabase__apply_migration`** only — no local `supabase/migrations/*.sql` files.
- Every workspace-scoped `SECURITY DEFINER` RPC starts with `PERFORM public.assert_workspace_member(p_workspace_id);`.
- The gapless legal counter advances **only** in `mark_invoice_issued`.
- Secrets resolve env-first, DB-second; Novus uses one platform-wide `NOVUS_API_KEY` with per-tenant issuer VAT from `finance_settings.business_vat`.

## Removed
The Oxygen ERP connector was deleted 2026-06-07 (single-key model wrong for multi-tenancy). Replaced by Novus → AADE/myDATA per-tenant transmission. See [docs/finance-system.md §10](../../../docs/finance-system.md#10-removed-the-oxygen-connector).
