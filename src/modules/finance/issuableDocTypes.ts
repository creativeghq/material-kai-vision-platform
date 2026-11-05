export interface SeriesActivity {
  doc_code: string;
  is_active: boolean;
}

/**
 * A type with no series at all is issuable: `_mark_invoice_issued_core` creates its range on the
 * first document. A type whose every series was switched off is not — `ensure_document_series`
 * would hand back that inactive range and number from it.
 */
export function issuableDocTypeCodes(enabledCodes: Iterable<string>, series: readonly SeriesActivity[]): Set<string> {
  const issuable = new Set<string>();
  for (const code of enabledCodes) {
    const own = series.filter((s) => s.doc_code === code);
    if (own.length === 0 || own.some((s) => s.is_active)) issuable.add(code);
  }
  return issuable;
}
