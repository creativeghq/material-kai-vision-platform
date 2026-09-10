/** What a blueprint looks like to an ANONYMOUS caller (#382 Phase 1). */
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

/** Collapse a blueprint item's COST BASIS into the single number the visitor is entitled to see. */
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
