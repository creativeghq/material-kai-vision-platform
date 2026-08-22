/**
 * What we call a building, everywhere.
 *
 * There were FOUR answers to this before the file existed, and the differences were not stylistic:
 *
 *   • `title || address || reference_code || 'Untitled property'`  — the finance link surfaces
 *   • `title || 'Untitled listing'`                                — the listing workbench header
 *   • `title || 'Untitled'`                                        — the portfolio's property select
 *   • `title || name || reference_code || 'Untitled'`              — the CRM pipeline subject picker
 *
 * So the same untitled building was "Untitled property" in the order's link field, "Untitled
 * listing" on its own page, and "Untitled" in the deal it was attached to — three names for one
 * record, and only the first one ever fell back to the address, which is the thing a person
 * actually recognises a building by.
 *
 * TWO shapes, not one, because the surfaces genuinely differ and pretending otherwise is how the
 * copies came back the last time:
 *
 *   • `propertyLabel` — a single self-contained string that must identify the building ALONE:
 *     a dropdown row, a link field, a board card. It falls through to the reference code, because
 *     a bare code beats "Untitled property" when it is all we have.
 *   • `propertyName`  — for a surface that ALREADY renders the reference separately (a header with
 *     `#ABC-123` underneath it, a select option with `· #ABC-123` appended). It stops before the
 *     code, so the same string does not appear twice in one control.
 *
 * Both end at the SAME words. Two shapes with one vocabulary is one source of truth; two files
 * with two vocabularies is what this replaces.
 *
 * Neutral home on purpose: finance link fields, the real-estate workbench and the CRM pipeline all
 * need it, and none of those modules should have to import another to name a building.
 * Guarded by tests/unit/orderLinkTargets.test.ts.
 */

/** The subset any caller can supply — deliberately not tied to one module's row type. */
export interface PropertyNameParts {
  title?: string | null;
  address?: string | null;
  reference_code?: string | null;
}

/** Identifies the building on its own. Use in dropdowns, link fields and board cards. */
export function propertyLabel(p: PropertyNameParts): string {
  return p.title?.trim() || p.address?.trim() || p.reference_code?.trim() || 'Untitled property';
}

/**
 * The NAME half only, for a surface that prints the reference code beside it. Falling through to
 * the code here would render it twice in the same control.
 */
export function propertyName(p: PropertyNameParts): string {
  return p.title?.trim() || p.address?.trim() || 'Untitled property';
}
