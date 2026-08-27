/**
 * The company-assets value-sets, written ONCE (#391).
 *
 * `category` and `acquisition_type` were declared in `assetsService` (as unions) and in
 * `company-assets-tools` (as `as const` arrays feeding a `z.enum`) — one fact, two
 * runtimes, agreeing only by memory.
 *
 * `CompanyAssetsPanel` is NOT a third copy: it derives its option lists from the label
 * maps with `Object.keys(...)`, which is the right shape and stays as it is.
 *
 * THE DATABASE IS THE ENFORCER
 * -----------------------------
 * `company_assets_category_check` and `company_assets_acquisition_type_check` admit
 * exactly these. Pinned to the constraint text by `tests/unit/assetVocabulary.test.ts`.
 *
 * THIS FILE IS IMPORT-FREE, ON PURPOSE — byte-mirrored to the edge by
 * `npm run vocab:mirror`.
 */

/** `company_assets_category_check`. */
export const ASSET_CATEGORIES = [
  'vehicle', 'phone', 'laptop', 'payment_card', 'equipment', 'other',
] as const;
export type AssetCategory = (typeof ASSET_CATEGORIES)[number];

/** `company_assets_acquisition_type_check`.
 *
 *  `owned` is the default the create path applies, and the panel branches on it to show
 *  the acquisition-cost fields — leased and financed cost money on a schedule rather than
 *  once. That branch stays in the component: it is a display rule, not part of the set. */
export const ACQUISITION_TYPES = ['owned', 'leased', 'financed'] as const;
export type AcquisitionType = (typeof ACQUISITION_TYPES)[number];

export function isAssetCategory(v: unknown): v is AssetCategory {
  return typeof v === 'string' && (ASSET_CATEGORIES as readonly string[]).includes(v);
}
export function isAcquisitionType(v: unknown): v is AcquisitionType {
  return typeof v === 'string' && (ACQUISITION_TYPES as readonly string[]).includes(v);
}
