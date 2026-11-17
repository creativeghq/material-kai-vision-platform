/**
 * Unit-of-measure arithmetic — pure, no Supabase client.
 *
 * Split from `productUomService` so the rules are importable (and testable) from anywhere,
 * including code that has no database handle. The ladder itself is always DERIVED in SQL by
 * `get_product_uom`; this file only applies it.
 */

export interface ProductUom {
  base_unit: string;
  /** unit → how many BASE units are in one of it. Absent = not convertible for this product. */
  factors: Record<string, number>;
  m2_per_piece: number | null;
  pieces_per_box: number | null;
  boxes_per_pallet: number | null;
  pieces_per_pallet: number | null;
  m2_per_box: number | null;
  m2_per_pallet: number | null;
  kg_per_piece: number | null;
}

/**
 * Quantity restated in the product's base unit, or **null when the conversion is unknown**.
 *
 * Null is the whole point. Falling back to the raw number turns 288 m² of gypsum board into
 * 288 pieces — a valid number, wrong by the area of a board, that no constraint downstream can
 * detect. Callers must branch on null and refuse, not default.
 */
export function convertToBase(
  uom: ProductUom | null | undefined,
  qty: number,
  unit: string | null | undefined,
): number | null {
  if (!uom || !Number.isFinite(qty)) return null;
  if (!unit || unit === uom.base_unit) return qty;
  const factor = uom.factors?.[unit];
  if (factor === undefined || factor === null || !Number.isFinite(factor)) return null;
  // Round the RESULT, never the factor: rounding a reciprocal first loses whole units on a
  // large order (1/2.88 to 6dp, times 288, is 99.999936 boards).
  return Math.round(qty * factor * 1e6) / 1e6;
}

/** A price per `fromUnit` restated per `toUnit`. Null when the two cannot be related. */
export function convertPrice(
  uom: ProductUom | null | undefined,
  price: number,
  fromUnit: string,
  toUnit: string,
): number | null {
  if (!Number.isFinite(price)) return null;
  if (fromUnit === toUnit) return price;
  const basePerFrom = convertToBase(uom, 1, fromUnit);
  const basePerTo = convertToBase(uom, 1, toUnit);
  if (!basePerFrom || !basePerTo) return null;
  return Math.round(price * (basePerTo / basePerFrom) * 100) / 100;
}

/** Units this product can be expressed in, base first. */
export function availableUnits(uom: ProductUom | null | undefined): string[] {
  if (!uom) return [];
  const keys = Object.keys(uom.factors ?? {});
  return [uom.base_unit, ...keys.filter((k) => k !== uom.base_unit)];
}
