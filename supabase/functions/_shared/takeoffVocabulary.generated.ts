// GENERATED MIRROR of src/modules/projects/takeoffVocabulary.ts — do not edit here.
// Regenerate: npm run vocab:mirror (part of gen:all). Freshness is enforced by
// tests/unit/vocabularyMirrors.test.ts, which fails the build on any drift.

/** The drawing-takeoff value-sets (#532), written ONCE and mirrored to Deno by `vocab:mirror`. */

/** `project_drawing_measurements.kind`. `quantity` is a printed schedule row in its own unit. */
export const TAKEOFF_KINDS = ['count', 'length', 'area', 'quantity'] as const;
export type TakeoffKind = (typeof TAKEOFF_KINDS)[number];

/** `project_drawing_measurements.element_type`. */
export const TAKEOFF_ELEMENT_TYPES = [
  'door', 'window', 'room', 'wall', 'radiator', 'fixture', 'socket', 'light', 'pipe', 'other',
] as const;
export type TakeoffElementType = (typeof TAKEOFF_ELEMENT_TYPES)[number];

/**
 * `project_drawing_measurements.source` — how the figure was obtained.
 * `detected`/`manual` lengths and areas are stored in page-width units and derived through the
 * sheet's scale in SQL (`drawing_measurement_value`).
 */
export const TAKEOFF_SOURCES = ['printed', 'detected', 'counted', 'vision', 'manual'] as const;
export type TakeoffSource = (typeof TAKEOFF_SOURCES)[number];

export const TAKEOFF_REVIEW_STATUSES = ['proposed', 'confirmed', 'rejected'] as const;
export type TakeoffReviewStatus = (typeof TAKEOFF_REVIEW_STATUSES)[number];

/** `pdm_kind_unit`: the unit a kind is stored in. A printed `quantity` keeps its own unit. */
export const TAKEOFF_KIND_UNIT: Record<Exclude<TakeoffKind, 'quantity'>, string> = {
  count: 'pcs', length: 'm', area: 'm2',
};

/** Sources a person, not a model, can be asked to confirm in bulk from chat. */
export const AGENT_CONFIRMABLE_SOURCES: readonly TakeoffSource[] = ['printed'];

/** Re-analysis replaces these proposals; counted and manual rows are a person's work and stay. */
export const REPLACEABLE_ON_REANALYSIS: readonly TakeoffSource[] = ['printed', 'detected', 'vision'];

export function isTakeoffElementType(v: unknown): v is TakeoffElementType {
  return typeof v === 'string' && (TAKEOFF_ELEMENT_TYPES as readonly string[]).includes(v);
}
