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
