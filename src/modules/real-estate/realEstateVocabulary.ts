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

/**
 * `property_kyc_checks_check_type_check`.
 *
 * The three checks an anti-money-laundering file needs on a property transaction. Kept in
 * this module's vocabulary rather than its own file: it was declared as an inline union
 * in `realEstateService` and as an array in `real-estate-api`, which is the same two-copy
 * shape as `property_type` above and belongs in the same place.
 */
export const KYC_CHECK_TYPES = ['identity', 'source_of_funds', 'pep_sanctions'] as const;
export type KycCheckType = (typeof KYC_CHECK_TYPES)[number];

export function isKycCheckType(v: unknown): v is KycCheckType {
  return typeof v === 'string' && (KYC_CHECK_TYPES as readonly string[]).includes(v);
}
