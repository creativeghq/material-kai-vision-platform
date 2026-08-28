// GENERATED MIRROR of src/services/crm/vatNormalize.ts — do not edit here.
// Regenerate: npm run vocab:mirror (part of gen:all). Freshness is enforced by
// tests/unit/vocabularyMirrors.test.ts, which fails the build on any drift.

/**
 * The single normalised form of a VAT number (#353 CRM-4).
 *
 * This replaced `vatDedupeForms`, which produced a LIST of spellings a row might be stored under
 * — the raw string, the digits, and `EL` + digits — and matched them against the raw
 * `vat_number` column. Enumerating what a human might type is unbounded, and it missed the
 * ordinary case: a row saved as `GR 800 370 260` is none of the three, so a user typing
 * `800370260` was told there was no duplicate and created the business a second time.
 *
 * Both sides are normalised instead. The stored side is the generated `vat_norm` column
 * (`public.crm_vat_norm`); this is its client twin.
 *
 * THE GREEK PREFIX IS DROPPED; OTHERS ARE KEPT. `EL` is the EU VAT prefix for Greece and `GR`
 * the ISO country code, and Greek documents use both interchangeably — myDATA sends bare digits,
 * an invoice header carries `EL`, an operator types `GR`. One number, three spellings. For every
 * other country the prefix stays: `DE123456789` and `FR123456789` are different taxpayers and
 * stripping to digits would collide them. `country_code` carries the country separately.
 *
 * IMPORT-FREE, ON PURPOSE — byte-mirrored to Deno by `npm run vocab:mirror`, because the
 * `vat_validation_receipts` key is written by an edge function and read by another (#353 CRM-7).
 * Three runtimes, one rule; parity with the SQL is pinned by
 * `tests/unit/greekTransliterationParity.test.ts`.
 */

/** The column `normalizeVat` is matched against. Same name on both CRM tables. */
export const CRM_VAT_COLUMN = 'vat_norm';

export const normalizeVat = (vat: string | null | undefined): string | null => {
  const compact = (vat ?? '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  // The digit lookahead is what stops a name like "GREECE" losing its first two letters.
  return compact.replace(/^(EL|GR)(?=[0-9])/, '') || null;
};
