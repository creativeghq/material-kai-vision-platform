/**
 * Canonical units of measure, tied to the AADE myDATA `measurement_unit` codes.
 *
 * The codebase grew six independent unit lists (order lines, quote lines, invoice PDF label
 * map, blueprint picker, and two Python category-default maps) that agree on nothing — one
 * says `sqm`, another `m2`, a third `m²`. This is the canonical one, keyed to the codes AADE
 * actually accepts (`mydata_reference` category `measurement_unit`), so a unit chosen here
 * can always be transmitted. New surfaces should use this; the older lists are being folded
 * in as each is touched.
 */

export interface UnitDef {
  /** Stable key persisted in `warehouse_items.unit`, `product_prices.unit`, etc. */
  key: string;
  /** What the operator sees. */
  label: string;
  /** AADE myDATA measurement_unit code, null when the unit has no AADE equivalent. */
  mydataCode: number | null;
  /** True when quantity is an area — drives the per-m² cost wording at intake. */
  isArea?: boolean;
}

export const UNITS: UnitDef[] = [
  { key: 'pcs', label: 'pieces', mydataCode: 1 },
  { key: 'kg', label: 'kg', mydataCode: 2 },
  { key: 'lt', label: 'litres', mydataCode: 3 },
  { key: 'm', label: 'metres', mydataCode: 4 },
  { key: 'm2', label: 'm² (square metres)', mydataCode: 5, isArea: true },
  { key: 'm3', label: 'm³ (cubic metres)', mydataCode: 6 },
  // No AADE code — these are packaging/commercial units. They must be converted to a coded
  // unit before a line is transmitted, which is why mydataCode is explicitly null.
  { key: 'box', label: 'box', mydataCode: null },
  { key: 'pallet', label: 'pallet', mydataCode: null },
  { key: 'set', label: 'set', mydataCode: null },
  { key: 'hour', label: 'hour', mydataCode: null },
];

const BY_KEY = new Map(UNITS.map((u) => [u.key, u]));

/** Tolerant lookup — historical rows carry 'sqm', 'm²', 'item', 'τεμ' and friends. */
const ALIASES: Record<string, string> = {
  sqm: 'm2', 'm²': 'm2', sq_m: 'm2', squaremeter: 'm2', square_meters: 'm2',
  cbm: 'm3', 'm³': 'm3',
  item: 'pcs', items: 'pcs', piece: 'pcs', pieces: 'pcs', unit: 'pcs', τεμ: 'pcs', pc: 'pcs',
  lm: 'm', meter: 'm', meters: 'm', metre: 'm', metres: 'm',
  liters: 'lt', litres: 'lt', l: 'lt',
  boxes: 'box', rolls: 'box', pairs: 'pcs', sets: 'set',
};

export function normalizeUnit(raw: string | null | undefined): string {
  const v = String(raw ?? '').trim().toLowerCase();
  if (!v) return 'pcs';
  if (BY_KEY.has(v)) return v;
  return ALIASES[v] ?? v;
}

export function unitDef(raw: string | null | undefined): UnitDef | null {
  return BY_KEY.get(normalizeUnit(raw)) ?? null;
}

export function unitLabel(raw: string | null | undefined): string {
  return unitDef(raw)?.label ?? String(raw ?? 'pcs');
}

/** Short suffix for money-per-unit wording: "€16.51 / m²". */
export function unitSuffix(raw: string | null | undefined): string {
  const k = normalizeUnit(raw);
  return k === 'm2' ? 'm²' : k === 'm3' ? 'm³' : k;
}

export function isAreaUnit(raw: string | null | undefined): boolean {
  return !!unitDef(raw)?.isArea;
}
