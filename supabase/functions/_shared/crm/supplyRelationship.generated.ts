// GENERATED MIRROR of src/modules/crm/supplyRelationship.ts — do not edit here.
// Regenerate: npm run vocab:mirror (part of gen:all). Freshness is enforced by
// tests/unit/vocabularyMirrors.test.ts, which fails the build on any drift.

/** Mirrors `crm_companies_supply_relationship_check`: how WE supply a supplier's products. Import-free (mirrored to Deno). */
export const SUPPLY_RELATIONSHIPS = [
  { value: 'authorised', label: 'Authorised supply', hint: 'We are an authorised dealer of this maker; content may say so.' },
  { value: 'to_order', label: 'Supplied to order', hint: 'We source their products to order; content never claims import, distribution or partnership.' },
] as const;

export type SupplyRelationship = (typeof SUPPLY_RELATIONSHIPS)[number]['value'];
