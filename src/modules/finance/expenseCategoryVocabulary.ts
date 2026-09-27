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

/**
 * ΚΑΔ prefix → category: the activity the supplier registered with ΑΑΔΕ, which beats anything
 * inferred from a name. LONGEST PREFIX FIRST, so 77.11 (car hire) does not fall into 77. Partial
 * on purpose — 47.x retail could be office supplies or materials, so it goes to the classifier.
 */
const KAD_CATEGORY_PREFIXES: ReadonlyArray<readonly [string, string]> = [
  // Goods we buy to sell or to fit.
  ['16', 'materials_supplies'],
  ['22', 'materials_supplies'],
  ['23', 'materials_supplies'],
  ['25', 'materials_supplies'],
  ['27', 'materials_supplies'],
  ['31', 'materials_supplies'],
  ['4647', 'materials_supplies'],
  ['4643', 'materials_supplies'],
  ['4650', 'equipment'],          // wholesale of IT and communications equipment
  ['4669', 'materials_supplies'],
  ['4673', 'materials_supplies'],
  ['4674', 'materials_supplies'],
  ['4683', 'materials_supplies'],
  ['4684', 'materials_supplies'],
  ['4740', 'equipment'],          // retail of IT equipment
  ['4752', 'materials_supplies'], // retail of hardware, paint and glass
  ['28', 'equipment'],
  // Labour on site.
  ['41', 'subcontractors'],
  ['42', 'subcontractors'],
  ['43', 'subcontractors'],
  ['78', 'subcontractors'],
  // Getting things there.
  ['49', 'shipping_freight'],
  ['4932', 'travel'],             // taxi
  ['50', 'shipping_freight'],
  ['51', 'shipping_freight'],
  ['5110', 'travel'],             // air PASSENGER transport — a flight, not freight
  ['52', 'shipping_freight'],
  ['53', 'shipping_freight'],
  // Running the business.
  ['35', 'utilities'],
  ['36', 'utilities'],
  ['37', 'utilities'],
  ['61', 'utilities'],
  ['582', 'software_subscriptions'],
  ['62', 'software_subscriptions'],
  ['631', 'software_subscriptions'],
  ['69', 'professional_fees'],
  ['702', 'professional_fees'],
  ['71', 'professional_fees'],
  ['74', 'professional_fees'],
  ['731', 'marketing_advertising'],
  ['64', 'bank_payment_fees'],
  ['65', 'insurance'],
  ['6622', 'insurance'],          // insurance agents and brokers
  ['66', 'bank_payment_fees'],
  ['682', 'rent'],
  ['771', 'travel'],              // motor vehicle rental
  ['773', 'equipment'],           // machinery and equipment rental
  ['55', 'travel'],
  ['56', 'travel'],
  ['79', 'travel'],
  ['33', 'maintenance_repairs'],
  ['452', 'maintenance_repairs'],
  ['95', 'maintenance_repairs'],
];

const KAD_SORTED = [...KAD_CATEGORY_PREFIXES].sort((a, b) => b[0].length - a[0].length);

/** The category a ΚΑΔ decides on its own, or null where the code does not settle it. */
export function categoryForKad(kad: string | null | undefined): string | null {
  const digits = (kad ?? '').replace(/\D/g, '');
  if (digits.length < 2) return null;
  for (const [prefix, key] of KAD_SORTED) {
    if (digits.startsWith(prefix)) return key;
  }
  return null;
}

export type CategoryDecidedBy = 'ai' | 'manual' | 'fiscal_code' | 'kad';

/** A proposal is only actionable above this; below it the reviewer is being asked, not told. */
export const CATEGORY_CONFIDENCE_FLOOR = 0.5;
