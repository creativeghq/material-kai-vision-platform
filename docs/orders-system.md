# Orders System

Orders are the **commercial hub** that ties together quotes, invoices, receivables/payables,
payments/receipts, dispatch, products/warehouse and projects. Sales orders (to customers) and
purchase orders (to suppliers) both live in one model; every money/document/fulfilment event hangs
off an order so you can see, per order, what was invoiced, what was received, what was paid to
suppliers, what's been delivered, and the **profit**.

> **Sourcing:** how a customer demand gets satisfied — own stock vs a purchase order to a supplier, the allocation ledger, send-to-supplier, and the Finance Sourcing board — is documented in [sourcing-fulfillment.md](sourcing-fulfillment.md). A purchase order is an `orders` row with `order_type='purchase'`.

> **Money vocabulary** (used throughout the order UI)
> - **Invoice / Pre-invoice** — the demand (what they owe). A *pre-invoice* is a **draft invoice** (`status='draft'`, no gapless myDATA series until issued).
> - **Receivable** — an un-invoiced amount owed.
> - **Payment (received)** — money actually in; moves the order's `payment_status`.
> - **Receipt** — the myDATA document for a received payment (Finance → Documents → Receipts).

## Data model

### `orders`
`order_type` (`sales` | `purchase`), party (`customer_company_id`/`customer_contact_id` for sales,
`supplier_company_id`/`supplier_contact_id` for purchase — person→business rollup applies), optional
`project_id`, `source_quote_id`, `order_number`, `status`, `payment_status`, `currency`,
`subtotal_net`/`vat_amount`/`total`, `notes`.
- `status`: `draft` (= **Pre-order**) → `confirmed` → `partially_fulfilled` → `fulfilled` (= **Completed**) → `cancelled`.
- `payment_status` (derived): `unpaid` / `partial` / `paid` — recomputed from order-linked payments.

### `order_items`
`product_id` (**nullable → ad-hoc product**, not in the warehouse/catalog), `description`, `quantity`,
`unit_price`, `net_value`/`vat_amount`/`line_total`, `quantity_delivered`, **`update_warehouse`**
(when false the line never touches stock counts), `sort_order`.

### Attach points (every finance/fulfilment doc links to an order)
`orders.source_quote_id` → quotes · `invoices.order_id` · `supplier_bills.order_id` ·
`finance_manual_entries.order_id` · `payments.order_id` · `delivery_notes.order_id` ·
`credit_notes.order_id` · `supplier_credit_notes.order_id`.

RLS mirrors invoices: read = `is_workspace_member(workspace_id)`, write = `is_workspace_finance_manager(workspace_id)`; `order_items` carry `workspace_id` for the same policy.

## Flows

### Quote accepted → Order + Pre-invoice (automatic)
Trigger `generate_order_from_quote(quote_id)` fires `AFTER UPDATE OF status ON quotes` when a quote
becomes `accepted` (admin or public path). It creates a **sales order** (`confirmed`,
`source_quote_id`, party + project copied) with `order_items` from `quote_items`, then — best-effort
(never blocks the accept) — a **draft pre-invoice** (`next_invoice_number`, `status='draft'`,
`quote_id` + `order_id`) with its items. Idempotent (one order per quote). Issuing that draft later
runs the normal "Issue invoice" path (gapless number + myDATA transmit).

### POS checkout → Order (automatic)
`generate_order_from_invoice(invoice_id, mark_delivered)` builds a sales order from an invoice + its
items (idempotent, links `invoices.order_id`). POS `finalizeSale` calls it with `mark_delivered=true`,
so every POS receipt becomes a **fulfilled, paid, delivered** order.

### Payments → `payment_status`
Trigger on `payments` calls `recompute_order_payment_status(order_id)`: sales order paid = Σ
payments(`in`, order_id); purchase order paid = Σ payments(`out`, order_id) → `unpaid`/`partial`/`paid`.

### Profit per order
On the order detail: **Received** (payments in) − **Paid to suppliers** (payments out on the order)
= **Profit**, alongside the attached invoices and payments.

### Dispatch (invoice-driven — not duplicated)
Dispatch + warehouse stock is the existing flow: a **paid invoice flagged for shipping** appears on
the **Dispatch board**, which cuts the delivery note and writes `stock_movements`. Catalog lines
(`product_id`) move stock; ad-hoc lines (and `update_warehouse=false`) stay off-warehouse. The order
detail links to the Dispatch board for sales orders.

### Business-contact rollup (XOR-aware)
A quote/invoice created for a contact who belongs to a business rolls up to that **company**
(`quote_rollup_to_company`, `invoice_rollup_to_company`). **Quotes** enforce `quotes_customer_xor`
(at most one of contact/company), so on a quote the rollup sets the company **and nulls the contact**;
invoices allow both (company takes billing precedence). Linking a contact to a company
(`reassign_contact_financials_to_company`) re-points their existing contact-level quotes/invoices to
the company the same way.

## UI

- **Finance → Documents → Orders** (first tab): list with **type** (sales/purchase) + **status**
  filters + search; **New order** / **Pre-order** / **Purchase order** create modal (CRM party
  search, catalog product search + ad-hoc lines); order detail (items, delivered, status incl. **Mark
  completed**, Received/Paid/Profit, attached invoices + payments, Dispatch-board link).
- **CRM company page → Orders tab** (scoped to that company). The old per-doc tabs (Quotes / Invoices
  / Payments) are gone — those documents are now viewed **inside each order**. The **Account** tab
  stays (balance + ledger).
- **Account balance** — the CRM/Account net figure reads *"Account balance (they owe us / we owe
  them / settled)"*.
- **Cash in bank** — Finance dashboard KPI = Σ payments in − out.

## RPCs
`generate_order_from_quote(uuid)` · `generate_order_from_invoice(uuid, boolean)` ·
`recompute_order_payment_status(uuid)`.

## Not an edge function
Orders are accessed via direct, RLS-gated Supabase table access (`ordersService.ts`) + the DB
triggers/RPCs above — there is **no `orders` edge function**, so orders do not appear in the edge
OpenAPI (`docs/api/openapi-edge.json`).

## Known follow-ups (not yet built)
- "Record payment / issue Receipt" action **on the order** (today payments are recorded elsewhere and
  linked; the order shows them).
- AR / AP tabs grouped **by order** (received-vs-owed + profit per order).
- Planning: per-customer expected payments by due-day with tick-when-paid, linked to the settling payment.
- Honoring `order_items.update_warehouse` inside the dispatch stock-matching (today product_id presence already gates it).
