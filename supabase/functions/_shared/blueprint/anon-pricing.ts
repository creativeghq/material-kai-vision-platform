/**
 * What a blueprint looks like to an ANONYMOUS caller (#382 Phase 1).
 *
 * Two public surfaces now serve blueprint items to strangers — `public-project-plan` (our own
 * `/tools/kitchen-cost` page, platform starters) and `products-3d-api` (a tenant's own blueprint,
 * on their own website). They must answer identically, and the two things that make that true are
 * both here rather than copied into each:
 *
 *   • the COLUMN LIST, because a column falling behind the table is silent — `is_schedule` missing
 *     turns hardware counts into on/off switches, and `option_key` missing means `opt_gola` is
 *     never published, so every gola formula falls back to a default quantity of 0, forever,
 *     without complaint;
 *   • the COST-BASIS FOLD, because the split it collapses is the operator's supplier cost, labour
 *     rate and margin, itemised.
 *
 * A second copy of either is the drift shape this platform keeps paying for. The first surface
 * held both privately; the second one is what made them shared.
 */
import { computeLinePricing } from './formula.ts';

/**
 * Every column the client-side pricer (`src/utils/blueprintComposition.ts` → `seedPlanItems`)
 * reads. Explicit rather than `*`: `blueprint_items` also carries `service_id`, `product_id`,
 * `notes`, `sub_blueprint_id` and `source`, none of which a visitor needs and two of which are
 * internal joins.
 *
 * Guarded by the "starters payload" case in tests/unit/blueprintComposition.test.ts.
 */
export const ANON_BLUEPRINT_ITEM_COLUMNS =
  'id, blueprint_id, parent_id, sort_order, kind, label, unit, quantity_formula, default_quantity, '
  + 'line_kind, material_cost, labor_rate, margin_pct, is_allowance, allowance_amount, option_group, '
  + 'tier, default_selected, is_schedule, option_key, suggests_quantity';

/**
 * Collapse a blueprint item's COST BASIS into the single number the visitor is entitled to see.
 *
 * The payload is served to an ANONYMOUS caller and carried `material_cost`, `labor_rate` and
 * `margin_pct` separately — the operator's supplier cost, their labour rate and their margin,
 * itemised, to anyone who opened the page (#365 `AD-25`; fourth instance of
 * row-grant-without-column-projection after `PQ-2` #358, `EX-4` #364 and `project_purchase_items`,
 * and the only anonymous one).
 *
 * The page needs the payload because it prices interactively in the browser — that is what
 * `src/utils/blueprintComposition.ts` exists for. It does NOT need the split. `computeLinePricing`
 * folds to `(material + labor) x (1 + margin/100)`, so shipping that product as `material_cost`
 * with `labor_rate: 0` and `margin_pct: 0` yields byte-identical prices downstream while the three
 * inputs never leave the server.
 *
 * `allowance_amount` stays as-is: an allowance IS the customer-facing figure, not a cost basis.
 */
export function foldItemPricingForAnon(item: Record<string, unknown>): Record<string, unknown> {
  const { unit_price } = computeLinePricing({
    is_allowance: Boolean(item.is_allowance),
    allowance_amount: item.allowance_amount as number | null,
    material_cost: item.material_cost as number | null,
    labor_rate: item.labor_rate as number | null,
    margin_pct: item.margin_pct as number | null,
    quantity: 1,
    is_selected: true,
  });
  // A line with NO cost inputs at all is NOT PRICED YET, and on this platform that is `null`,
  // never 0 — schedule lines (hinges, legs, doors) are counts the workshop still has to price,
  // and folding them to 0 would state a price nobody set.
  const unpriced = item.material_cost == null && item.labor_rate == null;

  return {
    ...item,
    // One folded number in the field the client pricer reads first, and the two it would have
    // added zeroed out. Not `undefined` — the client's `?? 0` would treat a missing field the
    // same way, but an explicit 0 makes the payload self-describing.
    material_cost: item.is_allowance || unpriced ? null : unit_price,
    labor_rate: unpriced ? null : 0,
    margin_pct: 0,
  };
}
