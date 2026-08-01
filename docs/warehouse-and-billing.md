# Warehouse / Inventory, Time-Tracking & Project Billing

Three [Finance module](finance-system.md) surfaces that feed documents and stock:

1. **Multi-warehouse inventory (#207)** — per-warehouse stock, transfers, intake from inbound myDATA.
2. **Time-tracking & billing (#207)** — log billable hours → draft invoice.
3. **Project → invoice billing (#177)** — full / progress / milestone / final invoices from accepted quotes.

---

## 1. Warehouse / inventory

> **Now a standalone paid add-on: the "Stock" module (`/stock`).** Inventory was extracted from the Finance
> "Warehouse" tab into a first-class entitlement-gated module (`public.modules.slug='stock'`, `is_addon=true`,
> `price_tier='pro'`), mirroring HR (#252). Home is [`src/modules/stock/`](../src/modules/stock/) →
> `StockPage` with Overview / Inventory / Movements / Stock-counts tabs (Inventory reuses `WarehousePanel`).
> Nav item `moduleSlug:'stock'` + `requireCapability:'warehouse.manage'`; the route is EntitlementGuard-wrapped.
> The old Finance tab is a redirect pointer. Backfill granted `stock` to every `sales-finance`-entitled workspace
> (operator root auto-entitled) so no existing user lost access. **The paid gate is REAL at the DB write boundary**:
> `warehouses` / `warehouse_items` / `warehouse_pending_items` / `stock_counts` WRITE policies now require
> `is_workspace_finance_manager(ws) AND is_workspace_entitled(ws,'stock')` (reads stay membership-only so
> finance/marketplace/delivery-note readers never break). `stock_allocations`/`warehouse_coverage` are the #237
> sourcing spine, deliberately NOT coupled to this add-on. Server API: [`stock-api`](../supabase/functions/stock-api/index.ts)
> edge fn (gate chain then a user-JWT client so RLS + RPC guards enforce as the caller). Agent toolkit `manage_stock`.

Workspace-scoped inventory. Each workspace lazily gets one default "Main" warehouse (`ensure_default_warehouse(p_workspace_id)`, called by `WarehousePanel` on mount). Stock is tracked per warehouse in `warehouse_items`; every change is an immutable `stock_movements` row. **Only the workspace's own catalog products are stocked** — operator-catalog reference items (`products.supply_mode='reference_only'`) are excluded from the add-item search.

### Tables
| Table | RLS | Key columns |
|---|---|---|
| `warehouses` | read/write `is_workspace_member` | `name`, `code`, `location`, `is_default` |
| `warehouse_items` | read `is_workspace_member`, write `is_workspace_finance_manager` | `warehouse_id`, `product_id`, `sku`, `name`, `unit`, `qty_on_hand`, `qty_reserved`, `reorder_point`, `location` |
| `stock_movements` | read `is_workspace_member`; writes via RPC only | `item_id`, `direction` (`in`/`out`/`adjust`), `quantity`, `reason`, `source_type`, `source_id`, `occurred_at` |
| `inbound_documents` | read `is_workspace_finance_viewer`, write `is_workspace_finance_manager` | see [finance §4](finance-system.md#4-inbound-document-sync-finance-inbound-sync) |
| `workspace_inbound_credentials` | `is_workspace_finance_manager` | AADE myDATA REST creds |

### Operations (`src/services/warehouseService.ts`)
- **Receive / Issue / Adjust** → `record_stock_movement(p_item_id, p_direction, p_quantity, p_reason, p_source_type, p_source_id)` (checks `is_workspace_finance_manager`, updates `qty_on_hand`, inserts one movement).
- **Transfer** → `transfer_stock(p_from_item_id, p_to_warehouse_id, p_qty)`: validates `is_workspace_member`, sufficient stock, **same-workspace** target (cross-tenant transfer impossible by construction); debits source (`out`), find-or-creates the matching item in the target (by `product_id` else `sku`), credits target (`in`). Both movements carry `source_type='transfer'`.
- **Intake from inbound myDATA** → `inbound_doc_receive_to_warehouse(p_doc_id, p_mappings)`: iterates `{item_id, quantity}` mappings (validates each target belongs to the same workspace), records `in` movements (`source_type='inbound_document'`, `reason='myDATA inbound <mark>'`), marks the document `received`.
  - The **intake form** (`ReceiveToWarehouseDialog`) is an accordion — one collapsible row per supplier line, each with its own ✓ so the operator picks which products enter stock. `parseSupplierLine` reads the line text deterministically (no credits): size (`80X80` → `width_mm`/`length_mm`, cm↔mm inferred by magnitude, Greek `Χ` handled), quality grade (`A'`), supplier article code, maker (matched against CRM/existing stock, defaulting to the issuer), and unit (a 2-D cm size billed at a fractional quantity is **m²**, not pieces). Cost per unit is `net ÷ qty` ex-VAT; markup % and sale price are two views of one number. Anything Haiku already extracted into `warehouse_pending_items` for the same document is reused rather than re-derived.
  - Writes on submit: physical fields + intake photos (`image_urls`) → `warehouse_items`; size/maker/unit → `products.metadata`; cost → `products.cost`; sale price + standing discount → `product_prices.list_price` / `.discount_percent`; **fiscal identity → `products`**. **Money is deliberately not duplicated onto `warehouse_items`.**

#### Where an item's fields live (and why)

| Layer | Table | Fields | Read by |
|---|---|---|---|
| **Fiscal / catalog identity** | `products` | `barcode`, `cpv_code`, `taric_code`, `measurement_unit_code` (invoicing unit), `mydata_vat_category` (sale) + `mydata_purchase_vat_category`, wholesale `mydata_income_classification_*` + retail `*_retail`, `item_type`, `category_id`, `markup_percent`, `prices_include_vat`, `warranty`, `product_url`, `notes`, plus customs `country_of_origin` + the `taric_*` classification trail | `_shared/fiscal/invoice-builder.ts`, POS, `OrdersPanel`, the product modal’s **Fiscal & Customs** tab |
| **Commercial** | `product_prices` | `list_price`, `discount_percent`, `currency`, `unit` | `get_product_price_for_workspace` → quotes/orders/marketplace |
| **Physical stock** | `warehouse_items` | warehouse, `qty_on_hand`, `reorder_point`, `location`, `serial_number`, `unit` (**warehouse** unit), `width/length/thickness_mm`, `weight_kg`, `manufacturer`, `supplier_product_code`, `image_urls`, `is_active` | warehouse panel, stock movements, dispatch |

**Rule: anything that must reach AADE lives on `products`.** `warehouse_items` previously carried its own `barcode` / `cpv_code` / `taric_code` / `mydata_classification_*`; nothing but `WarehousePanel` ever read them, so an operator could fill them in and they were transmitted nowhere. They were dropped (table was empty) and both editors now write the product. The two `unit` columns are **not** duplication — `products.measurement_unit_code` is what an invoice line is billed in, `warehouse_items.unit` is how stock is counted, and they legitimately differ (buy by pallet, sell by m²).

**One editor over the whole set.** These columns are written by three surfaces (warehouse intake, the stock-item editor, the product modal) and the product modal used to render three of them — a write-only path where a value set on intake could never be seen or corrected again. `ProductFiscalCard` is now the single editor; `FISCAL_KEYS` in `warehouseService` stays the single definition of the column list, and [tests/unit/productFiscalCoverage.test.ts](../tests/unit/productFiscalCoverage.test.ts) fails the build when the two drift. Customs classification is documented separately in [taric-customs-classification.md](taric-customs-classification.md).

**Wholesale vs retail classification**: the same product files under different E3 codes depending on the document. `invoice-builder` picks the `*_retail` pair when the document type is family `11.x`, the wholesale pair otherwise; the POS (which only issues 11.x) prefers retail with wholesale as fallback.
  - A line with no `item_description` is not receivable, and most type-2.x (services) documents have none — the dialog says so explicitly instead of showing an empty list.
- **Delivery notes** also move stock: for an order-linked dispatch note `issue_delivery_note` routes each line through `deliver_order_line` (single `order_items.quantity_delivered` ledger — no double-decrement with the Orders UI); a standalone note (no order) calls `record_stock_movement` per line with a `warehouse_item_id`.
- **Opening-balance import** → `import_opening_stock(ws, warehouse, lines[])`: bulk-seed a warehouse from pasted `SKU, Qty[, Name, ReorderPoint]` rows. SKUs auto-match catalog products; each row sets on-hand via an audited `adjust` movement (re-paste = reconcile, not double-count). UI: **Inventory → Import**.

Frontend: `WarehousePanel.tsx` (warehouse selector, item table, receive/issue/transfer/delete, `AddItemDialog` catalog search + `AddDealerProductDialog`, `AddWarehouseDialog`); `inboundService.ts` + `InboundSetupCard.tsx` + the Expenses (Inbox) tab in `DocumentsPage`. Mounted in the Finance "Warehouse" tab (`FinancePage.tsx`).

### Stock counts (stocktake / reconcile)
`create_stock_count(ws, warehouse)` snapshots every item in a warehouse into `stock_count_lines` (blind
count sheet, `system_qty` frozen). The user enters physical `counted_qty` per line; `post_stock_count(count)`
records an `adjust` `stock_movement` for each counted line that differs from the LIVE on-hand (so the ledger
stays the single source of truth), stamps `adjusted_lines`, and flips the count to `posted`. `cancel_stock_count`
discards a draft. `stock_overview(ws)` powers the module dashboard KPIs. All four are `SECURITY DEFINER`,
`authenticated`-only, self-guarded on membership (reads) or finance-manager + `stock` entitlement (writes).

### Gaps
- `qty_reserved` is now co-written by the #237 sourcing spine + marketplace listings + **plain sales-order auto-reservation** (2026-07-26, see [orders-system.md](orders-system.md)) — was "never written".
- **Resupply → bulk reorder** (2026-07-26): the Resupply tab has a **Reorder all flagged** action that drafts a replenishment PO for every stockout-risk / below-reorder item with a supplier (per-item, 2 cr each), on top of the existing per-row Reorder.
- ~~No DB UNIQUE on `(workspace_id, warehouse_id, product_id)`~~ — **fixed**: `uniq_warehouse_items_ws_wh_product` (partial, `product_id not null`).
- ~~`warehouses` write is `is_workspace_member`~~ — **fixed**: tightened to `is_workspace_finance_manager` (+ `stock` entitlement).
- Transfer target selection uses `window.prompt()` with >2 warehouses (placeholder UX).
- Inbound→warehouse mapping is fully manual.

---

## 2. Time-tracking & billing

Log time against a CRM customer with a per-entry hourly rate; batch unbilled entries for one customer into a draft invoice (one `invoice_items` row per entry), which then flows through the normal issue → myDATA path.

### `time_entries`
`user_id`, `customer_company_id` XOR `customer_contact_id`, `work_date`, `minutes` (int; UI enters hours × 60), `hourly_rate`, `description`, `is_billable` (default true), `billed_invoice_id` (null = unbilled), `billed_at`. RLS: single `time_entries_rw` = `is_workspace_member` for ALL — every member sees all entries (no ownership-scoped read).

### Logging & billing (`src/modules/finance/services/timeTrackingService.ts`)
- `create(workspaceId, entry)` — attaches `user_id = auth.uid()`, `minutes = round(hours × 60)`.
- `billToInvoice(workspaceId, customer, entryIds, vatRate)` — filters out already-billed entries, computes per-entry net, mints `next_invoice_number`, inserts a draft `invoices` (`document_type='1.1'`, `notes='Generated from logged time'`) + one `invoice_items` per entry (`"<desc> (Nh @ rate/h)"`, qty = hours), stamps `billed_invoice_id`/`billed_at`, returns the invoice id → caller navigates to the editor.

UI: `TimeBillingTab.tsx` (log form, unbilled table with checkboxes, "Create invoice", billed history). VAT rate read from `finance_settings.default_vat_rate`. UI blocks mixing customers in one invoice.

### Gaps
- `billToInvoice` is client-side multi-step (no transaction — partial state possible on tab close).
- Rate is plain numeric, currency assumed EUR; no approval workflow; all entries visible to all members.

---

## 3. Project → invoice billing (#177)

From an `accepted` quote on a project, generate draft invoices in four modes. Invoices carry `project_id`, `invoice_kind` (`full`/`progress`/`milestone`/`final`), `progress_pct`, and `quote_id`; items carry `source_quote_item_id` for provenance.

- **Full** — `issue_invoice_from_quote(p_quote_id)`: idempotent (returns existing non-void invoice for the quote), `invoice_kind='full'`, totals + items copied verbatim from the quote.
- **Progress / milestone / final** — `create_project_progress_invoice(p_quote_id, p_percent, p_kind)`: validates percent ∈ (0,100], scales all monetary totals + line amounts by `percent/100`, appends `"(progress N%)"` to descriptions. **Quantity is not scaled** (only unit price / line total). Not idempotent — multiple tranches allowed.

Frontend: `BillingTab.tsx` on the project detail page (gated `can('finance.manage')`) — lists project invoices, "New invoice" dialog with quote selector + mode picker + percent input; navigates to `/finance/invoices/:id` (not auto-issued). Service: `projectsService.{listProjectInvoices, createFullInvoiceFromQuote, createProgressInvoice}`.

### Gaps
- **No over-billing guard** — sum of `progress_pct` per quote is unconstrained (multiple 80% invoices possible).
- `issue_invoice_from_quote`'s idempotency check matches any non-void invoice for the `quote_id`, so calling "full" after a progress invoice returns the progress invoice instead.
- Progress-invoice `quantity` stays at full count (e.g. "10 chairs @ €50 (50%)").

---

**Last updated**: 2026-06-09 · Covers #207, #206, #177.
