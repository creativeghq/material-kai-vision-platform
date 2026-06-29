# Sourcing & Fulfillment

The **sourcing spine** answers one operational question: *for a customer demand, where does the stock come from, and who is it reserved for?* It ties **warehouse + supplier + customer** together through a single lifecycle ledger so you always know what needs ordering, what's on its way, and what's already committed to a customer.

It sits **on top of** the [Orders System](orders-system.md): the order (sales) is the demand; sourcing is how that demand is satisfied. A purchase order to a supplier is an `orders` row with `order_type='purchase'` — **not** a separate table. (The legacy `purchase_orders`/`purchase_order_items` tables were retired 2026-06-28; everything runs on the live `orders(purchase)` surface.)

> Scope: this documents the **shipped** spine (#237 A0–A4). Marketplace sourcing, the KAI agent tools, the sales-scoped board view, and the global-supplier-identity/portal are tracked in **#243/#244/#245** and are not yet built.

## The boundary

**The catalog owner is the merchant of record.** An order placed through a catalog/storefront is created in that owner's workspace; the underlying supplier is never the merchant and is never exposed to the buyer. *"The order"* belongs to the catalog owner; *"sourcing the order"* is this downstream spine. If the owner is a reseller, fulfilment can cascade (operator → dealer → dealer's supplier), each hop its own margin — but each layer is invisible to the one above it.

## Data model

| Object | Role |
|---|---|
| `stock_allocations` | The **lifecycle ledger**. One row per (demand line → supply) commitment. `status`: `pending` → `on_order` → `reserved` → `dispatched` / `cancelled`. `source_type`: `warehouse` (→ `warehouse_item_id`) or `purchase_order` (→ `supply_order_item_id` = an `order_items` row of a purchase order). Polymorphic demand via `demand_type` (`order_item`/`quote_item`) + `demand_id`. Workspace-scoped (the merchant's). RLS: read = member, write = finance manager. |
| `supplier_products` | The **supplier cost tier** below operator cost — `supplier_company_id` + `product_id` + `cost`/`currency`/`moq`/`lead_time_days`/`availability`/`is_preferred`/`valid_until`. `UNIQUE NULLS NOT DISTINCT (workspace_id, supplier_company_id, product_id, supplier_sku)` for clean upserts. Feeds the pricing pyramid (#227) `cost_basis`. |
| `warehouse_coverage` | Ship-from routing — `(warehouse_id, country_code/region/postal_prefix, priority)`. Ranks which warehouse serves a delivery destination. |
| `warehouse_items.qty_reserved` | A **shared running counter** of physically-present stock that is committed. Both the surplus marketplace (#219) and sourcing allocations contribute to it incrementally (`greatest(0, …)` deltas) — it is **not** an allocation-only derived cache. A reserved, warehouse-sourced allocation adds its quantity; leaving `reserved` releases it. |

## The flow, step by step

1. **Resolve** — `resolve_sourcing_options(workspace, product, qty, deliver_to_address_unit_id)` returns ranked supply options across three sources (a fourth, marketplace, is stubbed pending #243/A5):
   - **own free stock** (`qty_on_hand − qty_reserved`), ranked by `warehouse_coverage` proximity to the destination (postal → region → country);
   - **uncommitted qty on inbound POs** (`orders(purchase)` in `confirmed`/`partially_fulfilled`, minus what's already allocated);
   - **`supplier_products`** (preferred → cheapest → shortest lead, with a `meets_moq` flag).
   It also returns the operator's own sell price via `get_product_price_for_workspace` (the #227 pyramid breakdown) as a margin reference. `SECURITY DEFINER` + workspace-membership assert.

2. **Commit** — `commit_sourcing_options(workspace, demand_type, demand_id, selections[], …)` turns the chosen options into ledger rows (finance-gated):
   - warehouse picks → `reserved` allocations (immediately hold free stock; bumps `qty_reserved`);
   - inbound-PO picks → `on_order` allocations against the existing `order_items` line;
   - supplier picks → **grouped into draft purchase orders** (one `orders(purchase)` per supplier, with `order_items`) + `on_order` allocations.

3. **Send to supplier** — the **"Send to supplier"** action on a purchase order's detail (`OrderDetailDialog`) calls `generate-purchase-sheet-pdf` with `{ order_id, send: true }`. That edge function:
   - renders the PO as a PDF and uploads it to `pdf-documents/purchase-order/{order_id}/`;
   - emails it to the supplier (recipient resolved from the order's **own-workspace** supplier contact/company; base64 attachment via `email-api`);
   - marks the order placed (`draft → confirmed`);
   - emits a `purchase_order.sent` Flows event (a seeded system-default flow turns it into a notification).

4. **Receive** — receiving the PO into the warehouse (`receive_order_into_warehouse`) increases `qty_on_hand`, writes a `stock_movements` row, **flips the matching `on_order` allocations to `reserved`** (source becomes `warehouse` + `warehouse_item_id`, so `qty_reserved` now reflects the now-physical, customer-committed stock), and emits `purchase_order.received`.

5. **See the pipeline** — **Finance → Sourcing** (`SourcingBoardPanel`, backed by `get_sourcing_board`) shows the ledger in three lanes: **Needs ordering** (`pending`), **On order** (`on_order`, with supplier/PO/ETA), **Arrived · reserved** (`reserved`, ready to dispatch).

## Notifications (Flows)

`purchase_order.sent` and `purchase_order.received` are first-class Flows trigger types (in the builder palette under **Finance**). Both ship with an active, locked `system-default` flow (trigger → `create_notification`) and a `flow_area_registry` entry, so they notify out of the box and admins can retarget/extend them without a deploy. See [flows-notification-system.md](flows-notification-system.md).

## Key files

- DB (via Supabase migrations): `stock_allocations`, `supplier_products`, `warehouse_coverage`; RPCs `resolve_sourcing_options`, `commit_sourcing_options`, `get_sourcing_board`; `receive_order_into_warehouse` (extended).
- Edge: [`generate-purchase-sheet-pdf`](../supabase/functions/generate-purchase-sheet-pdf/index.ts) (`order_id` PO mode + send).
- Frontend: [`SourcingBoardPanel`](../src/modules/finance/components/SourcingBoardPanel.tsx), the "Send to supplier" action in [`OrdersPanel`](../src/modules/finance/components/OrdersPanel.tsx).

## Roadmap (not built — tracked separately)

- **#243** — KAI agent tools (`source_product`/`create_purchase_order`/`send_purchase_order`) + AgentHub cards · marketplace sourcing (inquiry-first, reuses #219) · sales-scoped board view · **global supplier identity / portal / ERP feed** (the cross-workspace upgrade, full locked design).
- See also #219 (surplus marketplace), #227 (pricing pyramid).
