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
- `pages/` — `DocumentsPage` (Invoices / Receipts / Credit Notes / Payments / Expenses inbox / Dispatch board / Delivery Notes / Cheques), `PosPage`.
  - **Dispatch board** (`components/DispatchBoard.tsx`) — daily "what ships today" queue. Lists paid, shippable orders (`invoices.has_shipping` + `status='paid'`) that have no *issued* dispatch note yet, bucketed by `transport_date` (Overdue / Today / Next 7 / Later / No date). Each order matches its lines to warehouse stock (flags shortfalls), cuts a draft dispatch note in one click (`deliveryNotesService.createDispatchFromOrder` → linked via `delivery_notes.invoice_id`), then Issue & ship decrements stock via `issue_delivery_note`. An issued order drops off the board. "Print run sheet" renders a picking checklist client-side.
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
A legacy third-party ERP connector was deleted 2026-06-07 (single-key model wrong for multi-tenancy). Replaced by Novus → AADE/myDATA per-tenant transmission. See [docs/finance-system.md §10](../../../docs/finance-system.md#10-removed-the-legacy-erp-connector).
