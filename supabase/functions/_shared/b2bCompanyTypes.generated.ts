// GENERATED MIRROR of src/config/b2bCompanyTypes.ts — do not edit here.
// Regenerate: npm run vocab:mirror (part of gen:all). Freshness is enforced by
// tests/unit/vocabularyMirrors.test.ts, which fails the build on any drift.

export const B2B_COMPANY_TYPES = [
  'manufacturer', 'distributor', 'importer_exporter', 'agent', 'stock_trader', 'retailer_showroom', 'contractor_installer',
] as const;
export type B2BCompanyType = (typeof B2B_COMPANY_TYPES)[number];

export const B2B_COMPANY_TYPES_VOCABULARY = 'b2b_company_types';

export const B2B_RECORDED_COMPANY_TYPES = [
  'manufacturer', 'distributor', 'importer_exporter', 'agent', 'stock_trader', 'retailer_showroom', 'contractor_installer', 'other',
] as const;
export type B2BRecordedCompanyType = (typeof B2B_RECORDED_COMPANY_TYPES)[number];

export const B2B_COMPANY_TYPE_PARTY_ROLE: Record<B2BCompanyType, 'supplier' | 'customer'> = {
  manufacturer: 'supplier',
  distributor: 'supplier',
  importer_exporter: 'supplier',
  agent: 'supplier',
  stock_trader: 'supplier',
  retailer_showroom: 'customer',
  contractor_installer: 'customer',
};
