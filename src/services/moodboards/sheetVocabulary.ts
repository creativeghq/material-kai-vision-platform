/** The presentation-sheet value-sets, written ONCE (#391). */

/**
 * Every sheet type, in the enum's own order.
 *
 * The order is `pg_enum.enumsortorder`, not alphabetical and not display order. Keeping
 * it means this array can be compared to the database directly; a consumer that wants a
 * different order sorts its own copy at the point of display.
 */
export const SHEET_TYPES = [
  'material_board',
  'color_palette',
  'concept_board',
  'lighting_plan',
  'annotated_render',
  'elevation_render_pair',
  'ffe_schedule',
  'full_deck',
  'area_breakdown',
  'plumbing_plan',
  'electrical_plan',
  'scope_of_works',
] as const;

export type SheetType = (typeof SHEET_TYPES)[number];

export function isSheetType(v: unknown): v is SheetType {
  return typeof v === 'string' && (SHEET_TYPES as readonly string[]).includes(v);
}

/**
 * `moodboard_presentation_sheets.status`.
 *
 * Not part of the six-copy finding, but it lives beside `SheetType` in every one of those
 * files and would have been the next one to drift. Moving one and leaving its neighbour
 * behind is how a second pass gets scheduled.
 */
export const SHEET_STATUSES = ['draft', 'generating', 'ready', 'failed'] as const;
export type SheetStatus = (typeof SHEET_STATUSES)[number];

export function isSheetStatus(v: unknown): v is SheetStatus {
  return typeof v === 'string' && (SHEET_STATUSES as readonly string[]).includes(v);
}
