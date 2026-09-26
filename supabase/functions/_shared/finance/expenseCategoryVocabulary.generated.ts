// GENERATED MIRROR of src/modules/finance/expenseCategoryVocabulary.ts — do not edit here.
// Regenerate: npm run vocab:mirror (part of gen:all). Freshness is enforced by
// tests/unit/vocabularyMirrors.test.ts, which fails the build on any drift.

/**
 * The closed chart of expense categories a received document can be filed under. Import-free so
 * the classifier and the review dialog read ONE list; mirrored to Deno by `vocab:mirror`.
 */

export interface ExpenseCategoryDef {
  /** Stable slug. Renaming the label must never orphan a stored rule. */
  readonly key: string;
  /** The `finance_categories.name` this key creates or adopts. */
  readonly name: string;
  /** What belongs here — read by the reviewer and by the classifier. */
  readonly hint: string;
}

export const EXPENSE_CATEGORY_CHART: readonly ExpenseCategoryDef[] = [
  { key: 'materials_supplies', name: 'Materials & supplies', hint: 'Tiles, timber, sanitary ware, electrical and plumbing material, paint, fixings — goods that go into a job.' },
  { key: 'inventory_purchases', name: 'Inventory purchases', hint: 'Goods bought to resell from stock rather than for a specific job.' },
  { key: 'subcontractors', name: 'Subcontractors', hint: 'Fitters, installers, tradespeople and labour marketplaces invoicing for work done.' },
  { key: 'shipping_freight', name: 'Shipping & freight', hint: 'Couriers, haulage, customs agents, pallet and container transport.' },
  { key: 'equipment', name: 'Equipment', hint: 'Tools, machinery, vehicles and durable kit, including hire.' },
  { key: 'rent', name: 'Rent', hint: 'Premises, warehouse, yard and parking rent. Usually no VAT.' },
  { key: 'utilities', name: 'Utilities', hint: 'Electricity, water, gas, fixed and mobile telephony, internet.' },
  { key: 'salaries_wages', name: 'Salaries & wages', hint: 'Payroll and employer contributions, including your own self-billed payroll entries.' },
  { key: 'sales_commissions', name: 'Sales commissions', hint: 'Commission and introducer fees paid on a sale, to agents or sales staff.' },
  { key: 'insurance', name: 'Insurance', hint: 'Vehicle, premises, liability and goods-in-transit cover.' },
  { key: 'marketing_advertising', name: 'Marketing & advertising', hint: 'Advertising, print, photography, exhibitions, agency and sponsorship spend.' },
  { key: 'software_subscriptions', name: 'Software & subscriptions', hint: 'SaaS, hosting, domains, licences and platform fees.' },
  { key: 'professional_fees', name: 'Professional fees', hint: 'Accountant, lawyer, notary, engineer, architect, consultant and certification bodies.' },
  { key: 'bank_payment_fees', name: 'Bank & payment fees', hint: 'Bank charges, card acquiring, payment-provider and factoring fees, loan interest.' },
  { key: 'travel', name: 'Travel', hint: 'Fuel, tolls, car hire, flights, hotels, taxis and subsistence while travelling.' },
  { key: 'office_supplies', name: 'Office supplies', hint: 'Stationery, consumables, cleaning, kitchen and small office items.' },
  { key: 'maintenance_repairs', name: 'Maintenance & repairs', hint: 'Servicing and repair of premises, vehicles and equipment.' },
  { key: 'taxes_duties', name: 'Taxes & duties', hint: 'Duties, levies, chamber fees and municipal charges — not VAT itself.' },
  { key: 'other_expense', name: 'Other expense', hint: 'Genuinely does not fit any category above. Not a place to put a document nobody read.' },
];

const BY_KEY = new Map(EXPENSE_CATEGORY_CHART.map((c) => [c.key, c]));
const BY_NAME = new Map(EXPENSE_CATEGORY_CHART.map((c) => [c.name.trim().toLowerCase(), c]));

export const EXPENSE_CATEGORY_KEYS: readonly string[] = EXPENSE_CATEGORY_CHART.map((c) => c.key);

export function expenseCategoryByKey(key: string | null | undefined): ExpenseCategoryDef | null {
  return key ? BY_KEY.get(key.trim()) ?? null : null;
}

/** Matches an existing `finance_categories.name` back onto the chart. */
export function expenseCategoryByName(name: string | null | undefined): ExpenseCategoryDef | null {
  return name ? BY_NAME.get(name.trim().toLowerCase()) ?? null : null;
}

/** Where the document type IS the answer: 17.1 is a self-billed payroll entry. */
const FISCAL_CATEGORY_BY_DOC_TYPE: Readonly<Record<string, string>> = {
  '17.1': 'salaries_wages',
};

export function fiscalCategoryForDocType(docType: string | null | undefined): string | null {
  return docType ? FISCAL_CATEGORY_BY_DOC_TYPE[docType.trim()] ?? null : null;
}

/** One issuer identity. Must equal `inbound_issuer_key()` in SQL or no rule ever matches. */
export function issuerKeyOf(issuerVat: string | null | undefined, issuerName: string | null | undefined): string | null {
  const vat = (issuerVat ?? '').replace(/\s+/g, '').toUpperCase();
  if (vat) return `vat:${vat}`;
  const name = (issuerName ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
  return name ? `name:${name}` : null;
}

export type CategoryDecidedBy = 'ai' | 'manual' | 'fiscal_code';

/** A proposal is only actionable above this; below it the reviewer is being asked, not told. */
export const CATEGORY_CONFIDENCE_FLOOR = 0.5;
