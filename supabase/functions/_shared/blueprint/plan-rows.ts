/**
 * A derived composition → the plan rows that MATERIALIZE it.
 *
 * WHY THIS IS ITS OWN FILE
 * ------------------------
 * It used to live inside `project-plan-engine`, which cannot be imported by a unit test: the
 * module graph pulls in `Deno.serve`, the Supabase client and the api-logger. So the step that
 * decides what a plan — and therefore a QUOTE, a material list and every version — actually says
 * about the configured kitchen had no test at all. It is pure, so it belongs somewhere a test can
 * reach it.
 *
 * Two rules the rows encode:
 *
 *  - Zone lines are regenerated WHOLESALE on every reprice and carry `source='composition'`. A hand
 *    edit to one is expected to be overwritten and the marker is how a reader can tell. The rate
 *    goes into `material_cost` with `margin_pct: 0` because `deriveComposition` already ran it
 *    through `computeLinePricing` with the module's margin — re-applying it charges twice.
 *
 *  - An appliance the customer already owns produces NO priced line, and still has to appear.
 *    "Client's own fridge-freezer, in a tall unit" is scope: it is what tells the fitter to leave
 *    the aperture and the electrician to leave the socket. Dropping it because it costs nothing is
 *    the same €0 blind spot that hid these appliances from the enquiry email — a quote you cannot
 *    fit a kitchen from. It is emitted as a SCHEDULE row, so it is visible everywhere plan lines
 *    are read and can never move the money.
 */

import type { DerivedComposition } from './composition.ts';

/** The subset of a project_plan_item this module writes. Structurally a plan ItemRow. */
export interface CompositionPlanRow {
  id: string;
  parent_id: string | null;
  sort_order: number;
  kind: string;
  label: string;
  notes: string | null;
  unit: string | null;
  quantity_formula: string | null;
  default_quantity?: number;
  quantity?: number;
  line_kind: string;
  service_id: string | null;
  product_id: string | null;
  material_cost: number | null;
  labor_rate: number | null;
  margin_pct: number;
  option_group: string | null;
  tier: string | null;
  is_selected?: boolean;
  is_allowance: boolean;
  allowance_amount: number | null;
  is_schedule?: boolean;
  option_key?: string | null;
  suggests_quantity?: string | null;
  source: string;
}

const uuid = () =>
  (typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `row-${Math.floor(performance.now() * 1000)}`);

/**
 * One section per enabled zone, its priced lines beneath it, plus a scope row for every appliance
 * the customer is supplying themselves.
 *
 * `makeId` exists so a test can be deterministic; the engine passes nothing and gets UUIDs.
 */
export function compositionRows(
  derived: DerivedComposition,
  startOrder: number,
  makeId: () => string = uuid,
): CompositionPlanRow[] {
  const rows: CompositionPlanRow[] = [];
  let order = startOrder;

  for (const zone of derived.zones) {
    const zoneLines = derived.lines.filter((l) => l.zone_key === zone.key);
    const clientSupplied = derived.appliances.filter((a) => a.zone_key === zone.key && a.supply === 'existing');
    // A zone that priced nothing AND has nothing to say is genuinely absent from the plan.
    if (!zone.enabled || (zoneLines.length === 0 && clientSupplied.length === 0)) continue;

    const sectionId = makeId();
    rows.push({
      id: sectionId, parent_id: null, sort_order: order++, kind: 'section', label: zone.label,
      notes: null, unit: null, quantity_formula: null, line_kind: 'materials',
      service_id: null, product_id: null, material_cost: null, labor_rate: null, margin_pct: 0,
      option_group: null, tier: null, is_selected: true, is_allowance: false, allowance_amount: null,
      is_schedule: false, option_key: null, suggests_quantity: null,
      source: 'composition',
    });

    let childOrder = 0;
    for (const line of zoneLines) {
      rows.push({
        id: makeId(), parent_id: sectionId, sort_order: childOrder++, kind: 'task',
        label: line.label, notes: null, unit: line.unit, quantity_formula: null,
        default_quantity: line.quantity, quantity: line.quantity,
        line_kind: line.line_kind, service_id: null, product_id: null,
        material_cost: line.unit_price, labor_rate: null, margin_pct: 0,
        option_group: null, tier: null, is_selected: true, is_allowance: false, allowance_amount: null,
        is_schedule: false, option_key: null, suggests_quantity: null,
        source: 'composition',
      });
    }

    for (const a of clientSupplied) {
      rows.push({
        id: makeId(), parent_id: sectionId, sort_order: childOrder++, kind: 'task',
        label: `${a.label}${a.placement_label ? ` — ${a.placement_label.toLowerCase()}` : ''} (supplied by the client)`,
        notes: null, unit: 'pcs', quantity_formula: null,
        default_quantity: a.qty, quantity: a.qty,
        line_kind: 'materials', service_id: null, product_id: null,
        // Zero because somebody else is buying it — NOT because nobody has priced it. The two
        // states read differently downstream (a null rate prints "needs a price"), and only one
        // of them is true here.
        material_cost: 0, labor_rate: null, margin_pct: 0,
        option_group: null, tier: null, is_selected: true, is_allowance: false, allowance_amount: null,
        is_schedule: true, option_key: null, suggests_quantity: null,
        source: 'composition',
      });
    }
  }

  return rows;
}
