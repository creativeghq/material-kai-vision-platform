// GENERATED MIRROR of src/lib/surfaceRenderer/productSpecKeys.ts — do not edit here.
// Regenerate: npm run vocab:mirror (part of gen:all). Freshness is enforced by
// tests/unit/vocabularyMirrors.test.ts, which fails the build on any drift.

/**
 * The product spec fields the format and pack parsers read. Import-free: mirrored to Deno by
 * vocab:mirror.
 *
 * The embed runs the SAME parsers as the app, so the edge sends these keys rather than a derived
 * answer — one derivation, not two. A key missing here makes the parser fall back to its default,
 * which the UI already reports as "assumed" and coverage refuses to call an order, so drift
 * announces itself instead of producing a confident wrong count.
 */

export const PRODUCT_SPEC_KEYS = [
  'width', 'length', 'height', 'unit', 'dimension_unit',
  'dimensions', 'dimensions_cm_from_vision', 'available_sizes', 'slab_size',
  'roll_width_cm', 'roll_length_m', 'plank_width_mm', 'plank_length_mm',
  'm2_per_box', 'sqft_per_box', 'pieces_per_box', 'planks_per_box', 'coverage_per_roll_m2',
] as const;

export type ProductSpecKey = (typeof PRODUCT_SPEC_KEYS)[number];

/** How deep the projection walks: top level, `dimensions`, and an `available_sizes` entry. */
export const PRODUCT_SPEC_MAX_DEPTH = 3;

/**
 * Keep only the spec keys, at any level, so a published surface never carries a field nobody
 * classified. Arrays keep their first few entries; everything else is dropped.
 */
export function pickProductSpec(value: unknown, depth = 0): unknown {
  // Scalars pass at ANY depth; only containers are depth-limited. Testing depth first dropped the
  // leaves of `available_sizes` entries, so a 60x120 slab reached the widget as the assumed 60x60.
  if (value === null) return null;
  if (typeof value === 'number' || typeof value === 'string' || typeof value === 'boolean') return value;
  if (depth >= PRODUCT_SPEC_MAX_DEPTH) return undefined;

  if (Array.isArray(value)) {
    const out = value.slice(0, 8).map((v) => pickProductSpec(v, depth + 1)).filter((v) => v !== undefined);
    return out.length > 0 ? out : undefined;
  }
  if (typeof value !== 'object') return undefined;

  const out: Record<string, unknown> = {};
  for (const key of PRODUCT_SPEC_KEYS) {
    const raw = (value as Record<string, unknown>)[key];
    if (raw === undefined) continue;
    const kept = pickProductSpec(raw, depth + 1);
    if (kept !== undefined) out[key] = kept;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}
