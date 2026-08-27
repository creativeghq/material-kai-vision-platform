// GENERATED MIRROR of src/modules/real-estate/realEstateVocabulary.ts — do not edit here.
// Regenerate: npm run vocab:mirror (part of gen:all). Freshness is enforced by
// tests/unit/vocabularyMirrors.test.ts, which fails the build on any drift.

/**
 * The real-estate value-sets, written ONCE (#391).
 *
 * `property_type` was declared in four files — `CmaReportDialog`, `PropertyWorkbench`,
 * `realEstateService` and `real-estate-import` — as an array, an array, a union and a
 * `Set` respectively. Four shapes of one fact, agreeing only by memory.
 *
 * THE DATABASE IS THE ENFORCER
 * -----------------------------
 * `properties_property_type_check` admits exactly these four, and this set is pinned to
 * the constraint text by `tests/unit/realEstateVocabulary.test.ts`.
 *
 * A NOTE ON `other`
 * -----------------
 * `PropertyWorkbench` branches on `cat === 'residential' || cat === 'other'` to decide
 * whether to show residential fields. That is a UI grouping, not a fifth value, and it
 * stays where it is: folding it in here would turn a display decision into something that
 * looks like part of the database's vocabulary.
 *
 * THIS FILE IS IMPORT-FREE, ON PURPOSE — it is byte-mirrored to the edge by
 * `npm run vocab:mirror`.
 */

/** `properties_property_type_check`. */
export const PROPERTY_TYPES = ['residential', 'commercial', 'land', 'other'] as const;
export type PropertyType = (typeof PROPERTY_TYPES)[number];

export function isPropertyType(v: unknown): v is PropertyType {
  return typeof v === 'string' && (PROPERTY_TYPES as readonly string[]).includes(v);
}
