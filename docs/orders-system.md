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

### Inbox conversation → Order (approved by a human, #342)
An order that arrives as an **email or WhatsApp conversation** is read into a proposal on
`inbox_threads.metadata.order_intake` and becomes an order only when a member approves it —
`create_order_from_thread_intake(thread_id)` writes a **draft sales order** and stamps
`orders.source_thread_id`. Nothing reaches this table before that click, so the proposal never
consumes an `ORD-YYYY-NNNN`, never notifies upstream, and never trips the integrity checks.
Callable by **owner/admin/sales/sales_manager**: it is the one path that lets a `sales` member write
to `orders`, and it is safe because `order_type` and `status` are literals inside the function.
See [inbox-system.md §11](inbox-system.md#11-order-intake-342).

### POS checkout → Order (automatic)
`generate_order_from_invoice(invoice_id, mark_delivered)` builds a sales order from an invoice + its
items (idempotent, links `invoices.order_id`). POS `finalizeSale` calls it with `mark_delivered=true`,
so every POS receipt becomes a **fulfilled, paid, delivered** order.

### Stock reservation (auto, 2026-07-26)
Confirming a **sales** order (or adding a line to a confirmed one) auto-**reserves** free stock for its
catalog lines: a trigger runs `reserve_order_stock` → `reconcile_order_item_reservation`, which holds
`(ordered − delivered)` per line against the covering warehouse (pinned `warehouse_id` → default →
fullest), **capped at free stock** (`qty_on_hand − qty_reserved`) so it never over-reserves. Delivering
consumes the hold (reserved → dispatched); cancelling the order releases it; lowering a line trims it.
This is why `qty_reserved` is now meaningful for plain orders — not just the #237 sourcing/commit path.

### Payments → `payment_status`
Trigger on `payments` calls `recompute_order_payment_status(order_id)`: sales order paid = Σ
payments(`in`, order_id); purchase order paid = Σ payments(`out`, order_id) → `unpaid`/`partial`/`paid`.

### Profit per order
On the order detail: **Received** (payments in) − **Paid to suppliers** (payments out on the order)
= **Profit**, alongside the attached invoices and payments.

### Dispatch (invoice-driven — not duplicated)
Dispatch + warehouse stock is the existing flow: a **paid invoice flagged for shipping** appears on
the **Dispatch board**, which cuts the delivery note and moves stock. Catalog lines
(`product_id`) move stock; ad-hoc lines (and `update_warehouse=false`) stay off-warehouse. The order
detail links to the Dispatch board for sales orders.

**Single decrement ledger (2026-07-26).** Issuing a dispatch note no longer writes stock movements
directly when the note fulfils an order — `issue_delivery_note` resolves the order (via `order_id` or
`invoices.order_id`) and routes each matched line through the delivered-qty ledger, which moves stock
by the *delta* against `order_items.quantity_delivered`. So a line ships **exactly once** whether the
goods were dispatched by note or by invoice. `update_warehouse=false` / ad-hoc lines are skipped
automatically. Standalone warehouse issues/receipts (a delivery note with no order) keep the direct
`record_stock_movement` path. The board pins the matched warehouse onto `order_items.warehouse_id` so
the delta ships from the same stock row.

**Stock moves only against a fiscal document (#320, 2026-08-07).** Greek law requires an accompanying
document for goods leaving the warehouse (#236 locked decision), so the *delivered quantity is a
picking marker*: it drives `recompute_order_fulfilment` and moves no stock. Three document contexts
move stock, all through `_deliver_order_line_core(..., p_move_stock => true)`:

| Context | Document | Direction |
|---|---|---|
| `issue_delivery_note` | Δελτίο Αποστολής (myDATA 9.3) | sales out |
| `mark_invoice_issued` on an order-linked invoice | τιμολόγιο–δελτίο αποστολής | sales out |
| `receive_order_into_warehouse` | supplier's document on receipt | purchase in |

The public `deliver_order_line` RPC passes a hard `false` and the core is REVOKEd from
`authenticated`, so the gate is the absence of a reachable parameter, not a default. All three route
through the same `quantity_delivered` ledger, so ship-then-invoice cannot double-decrement — the
invoice finds those lines already at quantity and moves nothing.

**Two quantities, because picking and shipping stopped being the same fact.**

| Column | Means | Moves stock? |
|---|---|---|
| `order_items.quantity_delivered` | what has been **picked** — free to move up and down, drives `recompute_order_fulfilment` | no |
| `order_items.quantity_shipped` | what has physically **left**, always under a fiscal document | yes — the delta on this is the movement |

The first cut of #320 used one column for both and created a silent zero: `issue_delivery_note`
selected lines by `quantity_delivered < quantity`, so a line the operator had already ticked as
fully picked was invisible to the document meant to ship it — stock moved neither on the click
(gated) nor on the note (skipped), and nothing complained because both columns held valid numbers.
Caught by [tests/integration/stock-orders.test.ts](../tests/integration/stock-orders.test.ts),
which drives the whole loop against a real database; the single-path unit tests could not see it,
because the bug only appears when the manual path runs *before* the document.

Both document paths now select and target on `quantity_shipped`, shipping implies picking (the
document raises `quantity_delivered` but never lowers it), and the manual path **refuses** to mark
a line below what has already shipped — the goods are with the customer under a numbered document,
and the correction for that is a credit note, not an edit.

**Where the numbers live.** The stock movement is a separate row
in `stock_movements`, and it **cites the document that authorised it**: `source_type` is `invoice` or
`delivery_note` with that document's id, and `reason` carries its human number (`Invoice INV-2026-777`,
`Δελτίο Αποστολής 9.3-45`). It briefly did not — the first cut stamped `source_type='order'`, which
could prove a movement happened but not which paper justified it, and that is the only fact an audit
asks for. The document parameters have no defaults, so a caller cannot move stock while staying
anonymous in the ledger.

Two checks back this up: `finance.order_delivered_without_document` (goods picked >7d with no invoice
and no delivery note — also the probe on the gate's own silent-zero risk, that operators keep picking
and never issue anything) and `finance.stock_bypasses_document_gate` (the SQL shape guard, verified to
fire both when `deliver_order_line` writes stock again and when a non-document function passes `true`).

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

## Taking the margin, and holding a customer's money — two different facts (2026-08-28/29)

Both are money with a button next to them, and stacking them on one screen made them read as one
story in two steps: *"this order made €823.00"* above *"holding €446.34"* invites exactly one
conclusion — that 446.34 is the part of 823.00 you may actually take. It is not. They are
unrelated quantities about different things, so they now live on different screens.

**Point 1 — an order allocates the ORDER; the party account allocates across all of them.**

| Quantity | Derivation | Where the button lives |
|---|---|---|
| **Takeable margin on ONE order** | `get_order_profit_positions(uuid[])` — `revenue_net`, `cogs`, `margin`, `allocated`, `available` | the order screen |
| **Takeable margin across ALL a party's sales orders** | `get_party_profit_position(workspace, company\|contact)` — an **aggregation of the same per-order derivation**, never a second answer | the party's finance record |
| **Customer credit we are holding** | a PARTY fact — an overpayment, a bank charge, money sent ahead — settled across every order they have | the party's finance record, and only there |

`get_order_profit_positions` is the ONE derivation: the dialog's cap, the button's visibility, the
panel's figures and `allocate_order_profit`'s own guard all read it, so **the number offered and the
number enforced cannot drift apart**. Never recompute margin beside it (rule 1, one derivation per
money quantity).

- **`get_party_profit_position` REFUSES (`22000`) when the party's orders span more than one currency.** A cross-currency sum is a confident number in no currency at all, and the per-order door is denominated.
- **It is NOT `getCustomerProfitability().profit_unallocated`.** That one is the P&L view (invoice lines plus uninvoiced orders); this one is the ALLOCATION cap. Showing one beside a button enforcing the other puts two answers to the same question on one screen.
- **A party-wide take writes one `finance_profit_allocations` row PER ORDER**, spread oldest-first and capped per order by the same derivation — never a single party-level row. Each order has to keep telling the truth about itself afterwards, and each share stays separately reversible from the order it came off.
- **`p_allocated_on` is the OPERATOR's local day and is required by the RPC.** The DB session is UTC, so a server-stamped date reads *yesterday* for a Greek operator before 03:00 (rule 1b).
- **Releasing credit was moved OFF the order screen entirely.** Whether to keep a customer's overpayment is a party-wide decision, and offering it from inside one sale asks the operator to make it from a screen that can only see a single order. The `customer_credit_releasable` notification already deep-links to the party's record, so nothing lost its way in.

**A payment says what it settled, and a self-allocation is not an allocation.** "Record payment"
books cash where "Add expense" books a bill, so money-out rows allocated straight onto the order
were being printed as though allocated to nothing. Self-order allocation is filtered out of the
printed list, and the payment row names what it settled — which is what makes it findable in the
bank.

## RPCs
`generate_order_from_quote(uuid)` · `generate_order_from_invoice(uuid, boolean)` ·
`recompute_order_payment_status(uuid)` · `create_order_from_thread_intake(uuid)` (#342) ·
`get_order_settlements(uuid[])` (the ONE settlement derivation — see CLAUDE.md rule 1) ·
`get_order_profit_positions(uuid[])` · `allocate_order_profit(...)` ·
`get_party_profit_position(workspace, company, contact)` · `allocate_party_profit(...)`.

**Order totals are derived in one place, behind two doors.** `_recompute_order_totals_core` holds
the arithmetic and is REVOKEd from every client role; `recompute_order_totals` is the public entry
point and keeps the `is_workspace_finance_manager` gate. The split exists because SECURITY DEFINER
changes the ROLE, not the JWT: `auth.uid()` inside a definer function is still the caller, so the
guarded wrapper raised `order not found` for the sales roles `create_order_from_thread_intake` is
meant to empower — while passing for an owner, which is how the first test missed it. Recomputing
the money inside the approval RPC would have been a second derivation of a money quantity; moving
the arithmetic down and leaving the check at the entry point keeps exactly one. Same shape as
`_deliver_order_line_core`.

## Not an edge function
Orders are accessed via direct, RLS-gated Supabase table access (`ordersService.ts`) + the DB
triggers/RPCs above — there is **no `orders` edge function**, so orders do not appear in the edge
OpenAPI (`public/api/openapi-edge.json`).

## Known follow-ups (not yet built)
- ~~"Record payment / issue Receipt" action **on the order**~~ — **done 2026-08-28**: the order records a payment and each row names what it settled.
- AR / AP tabs grouped **by order** (received-vs-owed + profit per order).
- Planning: per-customer expected payments by due-day with tick-when-paid, linked to the settling payment.
- ~~Honoring `order_items.update_warehouse` inside the dispatch stock-matching~~ — **done 2026-07-26**: dispatch routes through `deliver_order_line`, which honors it.
- Per-line warehouse **picker** in the order editor — `order_items.warehouse_id` exists + is auto-pinned on reserve/dispatch; a manual dropdown is not yet exposed (rarely needed).
