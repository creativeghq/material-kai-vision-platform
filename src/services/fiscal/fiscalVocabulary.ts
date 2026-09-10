/** The fiscal-connector value-set, written ONCE (#391). */

/** `workspace_fiscal_bindings_capability_check`. */
export const FISCAL_CAPABILITIES = [
  'legal_invoice',
  'pre_invoice_notice',
  'pdf_render',
  'tax_submission',
  'numbering',
  'payment_reconciliation',
] as const;
export type FiscalCapability = (typeof FISCAL_CAPABILITIES)[number];

export function isFiscalCapability(v: unknown): v is FiscalCapability {
  return typeof v === 'string' && (FISCAL_CAPABILITIES as readonly string[]).includes(v);
}

/** myDATA `movePurpose` — AADE's Σκοπός Διακίνησης table, the reason goods are on a lorry. */
export interface MydataMovePurpose {
  code: number;
  en: string;
  el: string;
  /**
   * False for the five codes withdrawn from myDATA v1.0.11 onwards (6, 15, 16, 17, 18).
   * They stay in the table because HISTORICAL documents carry them and must still render
   * their real name — they are only kept out of the pickers for new documents. Deliberately
   * NOT a transmit-time refusal: the withdrawal is sourced from provider documentation
   * rather than from a table we hold, so AADE rejecting the code is the authority, not us.
   */
  submittable: boolean;
}

export const MYDATA_MOVE_PURPOSES: readonly MydataMovePurpose[] = [
  { code: 1,  submittable: true,  en: 'Sale',                                  el: 'Πώληση' },
  { code: 2,  submittable: true,  en: 'Sale on behalf of third parties',       el: 'Πώληση για Λογαριασμό Τρίτων' },
  { code: 3,  submittable: true,  en: 'Sampling',                              el: 'Δειγματισμός' },
  { code: 4,  submittable: true,  en: 'Exhibition',                            el: 'Έκθεση' },
  { code: 5,  submittable: true,  en: 'Return',                                el: 'Επιστροφή' },
  { code: 6,  submittable: false, en: 'Storage',                               el: 'Φύλαξη' },
  { code: 7,  submittable: true,  en: 'Processing / assembly / disassembly',   el: 'Επεξεργασία - Συναρμολόγηση - Αποσυναρμολόγηση' },
  { code: 8,  submittable: true,  en: 'Movement between own premises',         el: 'Ενδοδιακίνηση' },
  { code: 9,  submittable: true,  en: 'Purchase',                              el: 'Αγορά' },
  { code: 10, submittable: true,  en: 'Supply of ships and aircraft',          el: 'Εφοδιασμός πλοίων και αεροσκαφών' },
  { code: 11, submittable: true,  en: 'Free distribution',                     el: 'Δωρεάν διάθεση' },
  { code: 12, submittable: true,  en: 'Warranty',                              el: 'Εγγύηση' },
  { code: 13, submittable: true,  en: 'Loan for use',                          el: 'Χρησιδανεισμός' },
  { code: 14, submittable: true,  en: 'Storage with third parties',            el: 'Αποθήκευση σε Τρίτους' },
  { code: 15, submittable: false, en: 'Return from storage',                   el: 'Επιστροφή από Φύλαξη' },
  { code: 16, submittable: false, en: 'Recycling',                             el: 'Ανακύκλωση' },
  { code: 17, submittable: false, en: 'Destruction of waste material',         el: 'Καταστροφή άχρηστου υλικού' },
  { code: 18, submittable: false, en: 'Fixed-asset transfer',                  el: 'Διακίνηση Παγίων (Ενδοδιακίνηση)' },
  { code: 19, submittable: true,  en: 'Other transfers',                       el: 'Λοιπές Διακινήσεις' },
  { code: 20, submittable: true,  en: 'Transport / courier',                   el: 'Μεταφορές - Ταχυμεταφορές' },
];

/** The code that takes a free-text title (`otherMovePurposeTitle`) instead of a fixed name. */
export const MYDATA_MOVE_PURPOSE_OTHER = 19;

/** What a picker offers for a NEW document — the withdrawn five are not choices. */
export const SELECTABLE_MOVE_PURPOSES: readonly MydataMovePurpose[] =
  MYDATA_MOVE_PURPOSES.filter((p) => p.submittable);

/**
 * The printed / transmitted name for a purpose code. Falls back to the code itself: an
 * unrecognised purpose on a movement document must READ as unrecognised rather than borrow
 * a neighbour's name, which is the whole defect this replaces.
 */
export function movePurposeLabel(code: number | string | null | undefined, lang: 'el' | 'en' = 'en'): string {
  if (code == null || code === '') return '';
  const n = Number(code);
  const found = MYDATA_MOVE_PURPOSES.find((p) => p.code === n);
  return found ? found[lang] : String(code);
}

export function isMydataMovePurpose(code: unknown): boolean {
  const n = Number(code);
  return Number.isInteger(n) && MYDATA_MOVE_PURPOSES.some((p) => p.code === n);
}

/** AADE income classification, DERIVED FROM THE DOCUMENT TYPE. */
export function mydataIncomeClassificationType(documentType: string | null | undefined): string {
  const t = String(documentType ?? '');
  // A self-delivery / self-supply (6.x) is not a sale to anybody — AADE refuses the sales pair
  // on it (331) and validates `E3_595` + `category1_6` instead. Verified against the sandbox.
  if (t.startsWith('6.')) return 'E3_595';
  return t.startsWith('11.') ? 'E3_561_003' : 'E3_561_001';
}

export function mydataIncomeClassificationCategory(documentType: string | null | undefined): string {
  const t = String(documentType ?? '');
  if (t.startsWith('6.')) return 'category1_6';
  return t.startsWith('2.') || t === '11.2' ? 'category1_3' : 'category1_1';
}

/** WHICH LEDGER A DOCUMENT TYPE CLASSIFIES INTO — or neither. */
export type MydataClassificationLedger = 'income' | 'expenses' | 'none';

export function mydataClassificationLedger(
  documentType: string | null | undefined,
  opts: { selfPricing?: boolean } = {},
): MydataClassificationLedger {
  if (opts.selfPricing) return 'none';
  return String(documentType ?? '').startsWith('3.') ? 'expenses' : 'income';
}
