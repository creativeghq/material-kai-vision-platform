/** The single normalised form of a VAT number (#353 CRM-4). */

/** The column `normalizeVat` is matched against. Same name on both CRM tables. */
export const CRM_VAT_COLUMN = 'vat_norm';

export const normalizeVat = (vat: string | null | undefined): string | null => {
  const compact = (vat ?? '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  // The digit lookahead is what stops a name like "GREECE" losing its first two letters.
  return compact.replace(/^(EL|GR)(?=[0-9])/, '') || null;
};
