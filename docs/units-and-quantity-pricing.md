# Units of measure & quantity pricing

Buying per m², counting per piece, selling per pallet — and the price breaks that go with it.

## The problem this solves

A 1200×2400 gypsum board is 2.88 m². A supplier may invoice it per square metre, the warehouse
counts it in pieces, and a customer orders it by the pallet. Until this landed, **nothing in the
platform related those three numbers.**

`record_stock_movement(p_item_id, p_direction, p_quantity, …)` takes a bare numeric with no unit.
So did `deliver_order_line`. A supplier line of **288 m² added 288 pieces** to the stock row, and
a dispatch of 28.8 m² removed 28.8 boards. The quantities were off by 2.88× and nothing could
tell: 288 is a perfectly ordinary number, so no CHECK constraint, no typecheck and no integrity
probe could see it. This is the platform's canonical failure shape — a wrong number that is a
valid number.

The two units were *allowed* to differ on purpose (`products.measurement_unit_code` is the
invoicing unit, `warehouse_items.unit` is the counting unit, and "buy by pallet, sell by m²" is a
real trade). What was missing was the factor between them.

## The ladder

`public.product_packaging` holds **only the irreducible facts**, one row per product:

| Column | Meaning |
|---|---|
| `base_unit` | what the product is COUNTED in — what `qty_on_hand` means |
| `pieces_per_box`, `boxes_per_pallet` | supplier packaging; not derivable from anything |
| `m2_per_piece_override`, `kg_per_piece` | escape hatches for when geometry can't answer |

Everything else is **derived in SQL** and never stored:

- `product_m2_per_piece(product)` — from the product's own dimensions
  (`products.metadata.dimensions[0]`, falling back to the stock row's parsed millimetres), or the
  override. NULL means a piece↔m² conversion is *not possible* for this product.
- `get_product_uom(product)` → `{ base_unit, factors, m2_per_piece, pieces_per_pallet, m2_per_pallet, … }`.
  `factors[unit]` is **how many base units are in one of that unit**.
- `convert_to_base_unit(product, qty, unit)` — the one conversion entry point.

TypeScript formats, SQL derives. There is no second place to type 2.88.

> **A unit absent from `factors` cannot be converted, and that is not the same as 1:1.**
> `convert_to_base_unit` returns NULL, `convertToBase` in [src/lib/uom.ts](../src/lib/uom.ts)
> returns `null`, and every caller must refuse rather than default. A silent 1:1 fallback *is*
> the bug. [tests/unit/uom.test.ts](../tests/unit/uom.test.ts) pins it.

### A rounding trap worth knowing

Factors are stored to 12 decimal places and rounding happens **once, on the result**. Rounding
the reciprocal first (1/2.88 to 6 dp) and then multiplying by 288 gives **99.999936 boards**. The
first implementation did exactly that.

## Where conversion is applied

Deliberately narrow — at the two points where a unit is actually *stated*, not as a blanket
rewrite of every stock movement:

1. **Inbound / expense intake.** When a document line's unit differs from the target stock row's
   unit, `ReceiveToWarehouseDialog` converts and **says so** in the result toast ("288 m² → 100
   pcs"). When the units differ and no factor exists it **refuses the receipt** and names the
   product to fix. Silently receiving the wrong count is the failure being prevented; a blocked
   receipt is recoverable.
2. **Pricing.** A break quoted per pallet is restated per the product's price unit by the
   resolver, so callers never mix units themselves.

Ordinary movements (manual issue, transfer, adjust) are untouched: they are entered in the stock
row's own unit, so there is nothing to convert.

## Quantity discounts

`public.product_price_breaks` — "from 5 pallets, 15% off" or "from 5 pallets, €450 each".

A break is stored in **whatever unit the seller thinks in** and compared against the order after
both sides are converted to base units, so a threshold of *1 pallet* correctly fires on an order
of *288 m²*. A break whose unit cannot be converted for that product simply never matches — it is
never treated as base units, which would make "5 pallets" fire at 5 pieces. The UI shows the
threshold restated in base units, or says the break will never fire.

Resolution happens inside **`get_product_price_for_workspace`** — the same function quotes,
orders, the POS and the agent already call. A break is one more source in the existing discount
ladder, not a second pricing path.

### Precedence — discounts do not stack

| Source | |
|---|---|
| `customer_override` | a per-contact / per-company negotiated rate |
| `level_category` → `level_all` → `level_default` | the customer's pricing tier |
| `quantity_break` | a percentage break, applied when it beats the above |
| `quantity_break_price` | a fixed unit price — **replaces** the computed sell outright |

A customer on 10% ordering a pallet that carries 15% pays **15%, not 23.5%**. The resolver takes
whichever is better for the buyer and reports which won in `discount_source`, because "why is
this price what it is" has to stay answerable. `price_unit` and the matched `price_break` come
back in the payload too.

### Quantity and unit travel together, or not at all

`get_product_price_break` resolves the threshold with
`coalesce(convert_to_base_unit(product, qty, unit), qty)`. A quantity passed **without** its unit
therefore does not fail — it falls back to the raw number and is compared against a threshold expressed
in base units, so "5 pallets" matches a break meant for 5 pieces. Every call site builds its
`p_quantity` / `p_unit` pair as one spreadable object that is `{}` when the unit is missing, and
[tests/unit/pricingChain.test.ts](../tests/unit/pricingChain.test.ts) fails the build if the two are
ever separated. A product with no `metadata.unit` consequently gets no break — silently, and correctly.

Whichever rung priced a line is recorded on it: `quote_items.price_source` and (since #332)
`order_items.price_source`. It is **evidence, never an input to money** — but without it no probe could
ask whether a configured break had ever actually reached a document, which is what
`finance.quantity_breaks_never_fire` now watches.

## Markup — cost becomes retail

Before any discount there is a **markup ladder**, and it has exactly one implementation:
`public._pricing_markup_ladder`. `_pricing_retail` is now only *"a pinned `product_prices.list_price`,
else the ladder"*, and the two preview entry points call the same function rather than a copy of it.

| Rung | `pricing_rules.scope` | matched on |
|---|---|---|
| 1 | `product` | the product itself |
| 2 | `brand` | `products.brand_company_id` |
| 3 | `supplier` | `products.supplier_company_id` |
| 4 | `category` | `products.metadata->>'material_category'`, nearest ancestor first |
| 5 | — | `finance_settings.default_markup_pct` |

Each rung is either a fixed `sell_price` or a `markup_pct` on cost; the first match wins outright.
Supplier sits **below** brand deliberately: a brand is what the customer is buying, a supplier is only
who we happen to buy it from, and the same brand arriving through two distributors should not move the
shelf price.

Editors are one card per rung under *Finance → Settings → Pricing* — `PricingRulesCard`,
`BrandMarkupCard`, `SupplierMarkupCard`. The scope vocabulary exists in three places at once (the
`pricing_rules_scope_check` CHECK, the `PricingRuleScope` union, and one card each), which is why
[tests/unit/pricingChain.test.ts](../tests/unit/pricingChain.test.ts) pins all three together: `brand`
was in the resolver and in the UI but **not in the CHECK** for months, so every brand-markup save
raised a constraint violation and that rung could never hold a row.

### Asking the ladder before a product exists

Two RPCs expose it so no caller ever re-implements a rung:

- `preview_pending_item_sell_price(pending_item_id, cost, material_category, manufacturer)` — the
  invoice queue's suggestion. For a matched line it prices the real product; for a new one the last
  two arguments are what makes the **brand** and **category** rungs reachable at all.

  They were added on 2026-08-20 because both were hardcoded `NULL` — along with the brand argument
  in `warehouse_intake_lines` — so a new product could only ever match the supplier rung or fall
  through to the workspace default. An EGGER worktop reported *"No pricing rule matches and the
  workspace default markup is 0% — this would be sold at cost"* while a `brand` rule for EGGER sat
  in the table unreachable. Worse, approval called `_pricing_retail` on the product it had just
  written, and *that* reads `metadata->>'material_category'` and `brand_company_id` off the row — so
  the preview and the approval could reach different rungs and show different numbers. Measured
  against the live functions: rung `unpriced` at €53.60 became rung `brand` at €76.11, and approval
  produced €76.11. Guarded by the "intake preview passes the maker and the material category" case
  in [tests/unit/pricingChain.test.ts](../tests/unit/pricingChain.test.ts).

  The brand rung also needs `products.brand_company_id`, which nothing on the intake path ever set.
  Approval now resolves it from the maker with **`_brand_company_match`** — the SELECT half of
  `resolve_brand_company`, split out so intake can match without minting. `resolve_brand_company`
  find-or-CREATEs, which is right for catalog ingestion (a PDF names its own maker) and wrong for a
  free-text field on an invoice line, where the value is as likely to be a typo, an abbreviation or
  the distributor. A maker the CRM does not know stays unresolved, and the queue says so with an
  "Add … as a manufacturer" action that goes through the usual duplicate probe.
- `preview_markup_ladder_price(workspace, cost, …)` — the generic form, used to seed the
  receive-to-warehouse form.

**Never fetch a markup policy and apply it in TypeScript.** Three copies of `cost × (1 + margin/100)`
existed at once — one reading `finance_categories.margin_pct` (a *second* markup system, keyed on the
accounting taxonomy; now dropped), one in the browser, one seeding from `default_markup_pct` alone.
All three produced a valid number, so nothing complained. Arithmetic on a markup the **operator typed**
is fine; fetching the policy is not.

## Supplier minimums (MOQ)

`supplier_products.moq` is the supplier's minimum. Whether it *bites* is a property of the product:
**`products.enforce_moq`**, `NOT NULL DEFAULT false`.

- **Off (the default)** — the MOQ is information. `resolve_sourcing_options` still reports `meets_moq`
  so the operator can see the order may be refused, and nothing changes the quantity.
- **On** — `raise_cover_purchase_orders` and `reorder_warehouse_item` round the quantity up to the next
  multiple, **and say so**: `moq_rounded` / `quantity_requested` / a `rounded[]` array, surfaced as
  *"Rounded up to 50 (supplier minimum 50)"*. A purchase order that quietly buys more than the operator
  asked for is its own bug.

`finance.moq_enforcement_mismatch` reports a confirmed purchase line whose quantity is not a multiple
of an enforced MOQ. The inverse — "rounded while the flag is off" — is deliberately **not** checked: a
quantity that happens to be a multiple of the MOQ is not evidence of rounding.

## Who can edit it

**Packaging & units** sits on the product modal's *Fiscal & Customs* tab (next to the invoicing
unit it relates to); **Quantity discounts** on the *Pricing* tab. Both follow the visibility
matrix in [warehouse-and-billing.md](warehouse-and-billing.md#who-sees-stock-on-the-product-record).
Writes require `is_workspace_finance_manager` at the RLS boundary.

## Integrity

`stock_unit_mismatch` fires when a product is invoiced in one unit and counted in another **with
no conversion between them** — the exact state in which document quantities move stock 1:1. It
does not fire merely because the units differ, which is legitimate.

## A caution about the resolver's caller gate

`get_product_price_for_workspace` is SECURITY DEFINER and distinguishes a *buyer* payload from a
*seller* payload (which carries `cost_basis` and margin). Getting that gate right took three
attempts, recorded here because the trade-off is not obvious:

1. `(auth.uid() is null) => member` let an **anonymous** caller ask for the seller audience and
   receive cost and margin.
2. Demoting every NULL-uid caller fixed that — and also demoted **service-role** callers, which
   share the NULL uid. `quote-tools` and `finance-customer-documents` both ask for `'seller'` and
   read `suggested_sell` / `cost_basis`; they would have started writing NULL prices onto quote
   and invoice lines. A silent zero introduced by a security fix is worse than the hole.
3. `current_user` cannot be used at all: inside a SECURITY DEFINER function it is the function
   **owner**, not the caller.

The shipped version detects *anonymity* from `request.jwt.claims` and denies only that; every
other caller keeps its previous behaviour. The real control is that `anon` holds no EXECUTE
grant — the claim check is the second layer so a future re-grant cannot quietly reopen it.

## Not built

- **Unit-aware `record_stock_movement` / `deliver_order_line`.** Both still take a bare numeric.
  Intake now converts before calling them, but a dispatch whose document unit differs from the
  stock unit is still 1:1. That is the next step, and it needs the order and delivery-note paths
  to carry a unit through.
- **AADE codes for box/pallet.** `UNITS` gives them `mydataCode: null` by design; a line must be
  converted to a coded unit before transmission, and nothing enforces that yet.
