/** What we call a building, everywhere. */

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
