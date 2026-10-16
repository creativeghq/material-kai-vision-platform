/**
 * Packaging EPR and PPWR (#454).
 *
 * Ν. 2939/2001 is repealed except άρθρο 26 — Ν. 4819/2021 άρθρα 11–14 and 77–94 is what is
 * operative, and much published guidance (including parts of ΕΕΑΑ's own site) still cites the old
 * law. Import-free so the predicates can be tested without a client.
 */

export type PackagingTier = 'primary' | 'secondary' | 'tertiary';

export type RecyclabilityGrade = 'A' | 'B' | 'C' | 'unassessed';

export type DeclarationStatus = 'ok' | 'incomplete_composition' | 'no_movement';

export type SupplierEprStatus = 'verified' | 'unverified' | 'no_suppliers';

export type EsprStatus = 'unknown' | 'not_applicable' | 'from_2030' | 'applies';

export interface MaterialCategory {
  code: string;
  label_el: string;
  label_en: string;
  annex_ii_category: string;
  is_composite: boolean;
  sort_order: number;
}

export interface DeclarationRow {
  material_code: string;
  label_el: string;
  label_en: string;
  annex_ii_category: string;
  is_composite: boolean;
  single_use_primary_pieces: number;
  single_use_primary_kg: number;
  single_use_secondary_tertiary_pieces: number;
  single_use_secondary_tertiary_kg: number;
  reusable_first_placed_pieces: number;
  reusable_total_placed_pieces: number;
  reusable_first_placed_kg: number;
  reusable_total_placed_kg: number;
  average_cycles: number | null;
  unweighed_components: number;
  unweighed_assets: number;
}

export interface PackagingDeclaration {
  year: number;
  status: DeclarationStatus;
  reason: string;
  products_without_composition: number;
  legal_basis: string;
  note: string;
  rows: DeclarationRow[];
}

export interface PackagingComponent {
  id: string;
  product_id: string;
  component_name: string;
  tier: PackagingTier;
  material_code: string;
  grams_per_unit: number | null;
  pieces_per_unit: number;
  is_reusable: boolean;
  recyclability_grade: RecyclabilityGrade;
  recyclability_assessed_on: string | null;
  recycled_content_percent: number | null;
  retention_years: number;
}

export interface ReusableAsset {
  id: string;
  declaration_year: number;
  material_code: string;
  asset_name: string;
  acquired_new_in_year: number;
  acquired_used_in_year: number;
  held_from_prior_year: number;
  average_cycles: number | null;
  kg_per_piece: number | null;
  first_placed_pieces: number;
  total_placed_pieces: number;
}

export interface SupplierRegistration {
  member_state: string;
  registration_number: string;
  verified_at: string | null;
  register_url: string | null;
}

export interface SupplierEprRow {
  company_id: string;
  name: string;
  country: string;
  greek?: GreekRegisterState;
  registrations: SupplierRegistration[];
}

export type GreekRegisterState =
  | 'listed' | 'not_listed' | 'delisted' | 'no_afm' | 'not_greek' | 'never_read' | 'register_unavailable';

export interface GreekRegisterEntry {
  amp: string;
  name: string | null;
  city: string | null;
  scheme: string | null;
  first_seen_at: string;
}

export interface GreekRegisterResult {
  state: GreekRegisterState;
  afm?: string;
  entries?: GreekRegisterEntry[];
  last_listed_at?: string | null;
  checked_at?: string;
}

export interface CompanyRegisterStatus {
  company_id: string;
  name: string;
  country: string;
  is_greek: boolean;
  register: { fresh: boolean; last_ok: string | null; last_attempt: string | null; last_error: string | null };
  greek: GreekRegisterResult;
  own: GreekRegisterResult & { recorded_amp: string | null };
  registrations: SupplierRegistration[];
}

export const EMPA_PUBLIC_SEARCH_URL =
  'https://eoan.gr/%CE%B5%CE%BC%CF%80%CE%B1/%CE%B4%CE%B7%CE%BC%CE%BF%CF%83%CE%B9%CE%BF%CF%80%CE%BF%CE%AF%CE%B7%CF%83%CE%B7-%CE%B5%CE%B3%CE%B3%CE%B5%CE%B3%CF%81%CE%B1%CE%BC%CE%BC%CE%AD%CE%BD%CF%89%CE%BD-%CF%80%CE%B1%CF%81%CE%B1%CE%B3%CF%89%CE%B3/';

export interface SupplierEprPosition {
  status: SupplierEprStatus;
  suppliers: number;
  with_registration: number;
  verified_against_register: number;
  reason: string;
  legal_basis: string;
  rows: SupplierEprRow[];
}

export interface EsprPosition {
  enterprise_size: string | null;
  status: EsprStatus;
  reason: string;
  note: string;
}

export const TIER_LABEL: Record<PackagingTier, string> = {
  primary: 'Primary (sales packaging)',
  secondary: 'Secondary (grouped)',
  tertiary: 'Tertiary (transport)',
};

export const GRADE_LABEL: Record<RecyclabilityGrade, string> = {
  A: 'Grade A',
  B: 'Grade B',
  C: 'Grade C',
  unassessed: 'Not assessed',
};

export const ESPR_LABEL: Record<EsprStatus, string> = {
  unknown: 'Enterprise size not established',
  not_applicable: 'Does not apply',
  from_2030: 'Applies from 19 July 2030',
  applies: 'Applies',
};

/**
 * An unassessed grade is a THIRD state, never a C. A C is a measured verdict with a fee attached,
 * so defaulting to it invents an assessment nobody made.
 */
export const gradeIsAssessed = (g: RecyclabilityGrade): boolean => g !== 'unassessed';

export const componentIsIncomplete = (c: PackagingComponent): boolean =>
  c.grams_per_unit == null || !gradeIsAssessed(c.recyclability_grade);

/** Zero recycled content is a claim; NULL is the absence of a measurement. */
export const recycledContentIsKnown = (c: PackagingComponent): boolean =>
  c.recycled_content_percent != null;

/** Art. 22 — five years single-use, ten reusable. Longer than most order-archive policies. */
export const retentionYearsFor = (isReusable: boolean): number => (isReusable ? 10 : 5);

/**
 * ΕΟΑΝ's own worked example: ten pallets bought SECOND-HAND in the year are zero in the
 * first-placed column and still count in the total. So `first_placed = total − prior` is wrong the
 * moment a second-hand pallet is bought, which is why the ledger holds three counts.
 */
export const firstPlacedPieces = (a: Pick<ReusableAsset, 'acquired_new_in_year'>): number =>
  a.acquired_new_in_year;

export const totalPlacedPieces = (
  a: Pick<ReusableAsset, 'acquired_new_in_year' | 'acquired_used_in_year' | 'held_from_prior_year'>,
): number => a.acquired_new_in_year + a.acquired_used_in_year + a.held_from_prior_year;

export const declarationNeedsAttention = (d: PackagingDeclaration | null): boolean =>
  !!d && d.status === 'incomplete_composition';

export const supplierEprBlocksSale = (p: SupplierEprPosition | null): boolean =>
  !!p && p.status === 'unverified';

export const esprNeedsAnswer = (p: EsprPosition | null): boolean =>
  !!p && p.status === 'unknown';

export const PACKAGING_LEGAL_BASIS =
  'Ν. 4819/2021 άρθρα 11–14 και 77–94. Ν. 2939/2001 is repealed except άρθρο 26.';

export const AMP_ON_EVERY_DOCUMENT =
  'Ν. 4819/2021 άρθρο 11(7) requires the ΕΜΠΑ number on the sales documents of άρθρα 8–14 ν. '
  + '4308/2014, and ΥΑ 181504/2016 άρθρο 9(ε) on όλα τα φορολογικά στοιχεία. Penalty €100–€5.000.';

/** EPR paid abroad does not exempt us here: the contribution is owed where the waste arises. */
export const FOREIGN_EPR_DOES_NOT_EXEMPT =
  'A supplier paying CONAI or Ecoembes settles an Italian or Spanish liability. Ours is Greek and '
  + 'is unaffected by it.';

/** The freight container is not packaging (άρθρο 77(1)(γ)); everything inside it is. */
export const CONTAINER_IS_NOT_PACKAGING =
  'The freight container itself is not packaging. Everything inside it is — including the pallets '
  + 'and the cartons we discard on unpacking.';

/**
 * From 1 Jan 2030, 40% of transport packaging must be reusable. Delegated Decision (EU) 2026/429
 * exempts wraps and straps from the art. 29(2)/(3) 100% requirements — it does NOT take them out of
 * the art. 29(1) 40% pool, so single-use stretch wrap stays in the denominator.
 */
export const REUSE_TARGET_FROM = '2030-01-01';
export const REUSE_TARGET_PERCENT = 40;
export const WRAPS_STAY_IN_THE_POOL =
  'Wraps and straps are exempt from the 100% requirements only. They remain in the 40% pool, so '
  + 'single-use stretch wrap still counts against the ratio and reusable pallets are what carry it.';
