/** How an expense document is described, in the words the operator reads. Import-free. */

export type ExpenseKind =
  | 'purchase' | 'retail' | 'cross_border' | 'contract' | 'rent' | 'entity'
  | 'credit_note' | 'movement' | 'other';

export type VatTreatment = 'standard' | 'zero_rated' | 'reverse_charge' | 'no_vat' | 'none';

export type ExpenseOrigin = 'domestic' | 'intra_eu' | 'third_country' | 'unknown';

export interface ExpenseSegmentRow {
  expense_kind: ExpenseKind;
  vat_treatment: VatTreatment;
  origin: ExpenseOrigin;
  docs: number;
  net: number;
  vat: number;
  booked_docs: number;
  booked_net: number;
  waiting_docs: number;
  waiting_net: number;
  in_pnl: boolean;
}

const KIND: Record<ExpenseKind, { label: string; detail: string }> = {
  purchase: { label: 'Purchases', detail: 'Invoices a supplier issued to you.' },
  retail: { label: 'Retail & self-recorded', detail: 'Till receipts and the expenses you record against yourself.' },
  cross_border: { label: 'From outside Greece', detail: 'The supplier charged no VAT. You declare it and reclaim it in the same return.' },
  contract: { label: 'Contracts', detail: 'A contract recorded as an expense.' },
  rent: { label: 'Rent', detail: 'Rent your landlord filed. No VAT by nature.' },
  entity: { label: 'Your own entries', detail: 'Payroll, depreciation and the year-end regularisations. ΑΑΔΕ keeps these out of their expense book.' },
  credit_note: { label: 'Supplier credit notes', detail: 'These REDUCE an expense rather than being one.' },
  movement: { label: 'Delivery notes', detail: 'Goods moved, no money stated.' },
  other: { label: 'Other documents', detail: 'Payment receipts and levies — not a purchase.' },
};

const TREATMENT: Record<VatTreatment, { label: string; detail: string }> = {
  standard: { label: 'VAT charged', detail: 'The supplier charged VAT and you deduct it.' },
  zero_rated: { label: 'No VAT charged', detail: 'A document with value and no VAT on it — exempt, or the supplier is outside the VAT system.' },
  reverse_charge: { label: 'Reverse charge', detail: 'No VAT on the document. You declare it as output and reclaim it as input, so the pair nets to nothing.' },
  no_vat: { label: 'Outside VAT', detail: 'Rent, contracts and your own entries carry no VAT at all.' },
  none: { label: 'No value', detail: 'Nothing to tax — a delivery note states goods, not money.' },
};

const ORIGIN: Record<ExpenseOrigin, string> = {
  domestic: 'Greece',
  intra_eu: 'EU',
  third_country: 'Outside the EU',
  unknown: 'Not stated',
};

export const expenseKindCopy = (k: string) =>
  KIND[k as ExpenseKind] ?? { label: k, detail: 'Unrecognised document kind.' };
export const vatTreatmentCopy = (t: string) =>
  TREATMENT[t as VatTreatment] ?? { label: t, detail: 'Unrecognised VAT treatment.' };
export const originLabel = (o: string) => ORIGIN[o as ExpenseOrigin] ?? o;

const KIND_ORDER: ExpenseKind[] = [
  'purchase', 'cross_border', 'rent', 'entity', 'retail', 'contract',
  'credit_note', 'movement', 'other',
];

export function sortExpenseSegments(rows: ExpenseSegmentRow[]): ExpenseSegmentRow[] {
  return [...rows].sort((a, b) => {
    const k = KIND_ORDER.indexOf(a.expense_kind) - KIND_ORDER.indexOf(b.expense_kind);
    return k !== 0 ? k : b.net - a.net;
  });
}

const TREATMENT_ORDER: VatTreatment[] = ['standard', 'reverse_charge', 'zero_rated', 'no_vat', 'none'];

export interface VatTreatmentGroup {
  treatment: VatTreatment;
  label: string;
  detail: string;
  net: number;
  vat: number;
  docs: number;
}

/**
 * The expense side by how VAT was treated. Anything that is not an expense at all is dropped,
 * so the groups add up to the expenses and not to the inbox.
 */
export function byVatTreatment(rows: ExpenseSegmentRow[]): VatTreatmentGroup[] {
  const at = new Map<VatTreatment, VatTreatmentGroup>();
  for (const r of rows) {
    if (!r.in_pnl) continue;
    const copy = vatTreatmentCopy(r.vat_treatment);
    const g = at.get(r.vat_treatment)
      ?? { treatment: r.vat_treatment, label: copy.label, detail: copy.detail, net: 0, vat: 0, docs: 0 };
    g.net += r.net; g.vat += r.vat; g.docs += r.docs;
    at.set(r.vat_treatment, g);
  }
  return [...at.values()].sort(
    (a, b) => TREATMENT_ORDER.indexOf(a.treatment) - TREATMENT_ORDER.indexOf(b.treatment),
  );
}

const ORIGIN_ORDER: ExpenseOrigin[] = ['domestic', 'intra_eu', 'third_country', 'unknown'];

export interface OriginTotal {
  origin: ExpenseOrigin;
  label: string;
  net: number;
  vat: number;
  docs: number;
}

export function byOrigin(rows: ExpenseSegmentRow[]): OriginTotal[] {
  const at = new Map<ExpenseOrigin, OriginTotal>();
  for (const r of rows) {
    if (!r.in_pnl) continue;
    const g = at.get(r.origin)
      ?? { origin: r.origin, label: originLabel(r.origin), net: 0, vat: 0, docs: 0 };
    g.net += r.net; g.vat += r.vat; g.docs += r.docs;
    at.set(r.origin, g);
  }
  return [...at.values()].sort(
    (a, b) => ORIGIN_ORDER.indexOf(a.origin) - ORIGIN_ORDER.indexOf(b.origin),
  );
}

export interface ExpenseSegmentTotals {
  docs: number; net: number;
  inPnlNet: number;
  waitingNet: number; waitingDocs: number;
  notExpenseNet: number;
}

export function totalExpenseSegments(rows: ExpenseSegmentRow[]): ExpenseSegmentTotals {
  const t: ExpenseSegmentTotals = {
    docs: 0, net: 0, inPnlNet: 0, waitingNet: 0, waitingDocs: 0, notExpenseNet: 0,
  };
  for (const r of rows) {
    t.docs += r.docs;
    t.net += r.net;
    if (!r.in_pnl) { t.notExpenseNet += r.net; continue; }
    // An entity entry is counted from the document itself, so it is in the P&L already; every
    // other kind counts only once it is booked.
    t.inPnlNet += r.expense_kind === 'entity' ? r.net : r.booked_net;
    t.waitingNet += r.expense_kind === 'entity' ? 0 : r.waiting_net;
    t.waitingDocs += r.expense_kind === 'entity' ? 0 : r.waiting_docs;
  }
  return t;
}
