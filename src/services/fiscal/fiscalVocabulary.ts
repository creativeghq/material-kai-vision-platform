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

/**
 * myDATA `receivingNotePurpose` — AADE Appendix §8.24, added in myDATA v2.0.2 and MANDATORY on
 * a Δελτίο Ποσοτικής Παραλαβής (10.1 / 10.2). `validFor` is AADE's own per-type restriction:
 * code 5 is accepted on the correlated note only.
 */
export interface MydataReceivingNotePurpose {
  code: number;
  en: string;
  el: string;
  validFor: readonly string[];
}

export const MYDATA_RECEIVING_NOTE_PURPOSES: readonly MydataReceivingNotePurpose[] = [
  { code: 1, validFor: ['10.1', '10.2'], en: 'Recipient not obliged to issue',           el: 'ΔΠΠ - ΜΗ ΥΠΟΧΡΕΟΣ ΕΚΔΟΣΗΣ' },
  { code: 2, validFor: ['10.1', '10.2'], en: 'Refusal to issue / inadvertent non-issue', el: 'ΔΠΠ - ΑΡΝΗΣΗ ΕΚΔΟΣΗΣ/ΕΚ ΠΑΡΑΔΡΟΜΗΣ ΜΗ ΕΚΔΟΣΗ' },
  { code: 3, validFor: ['10.1', '10.2'], en: 'Intra-Community acquisition',              el: 'ΔΠΠ - ΕΝΔΟΚΟΙΝΟΤΙΚΗ ΑΠΟΚΤΗΣΗ' },
  { code: 4, validFor: ['10.1', '10.2'], en: 'Third-country acquisition',                el: 'ΔΠΠ - ΑΠΟΚΤΗΣΗ ΤΡΙΤΗ ΧΩΡΑ' },
  { code: 5, validFor: ['10.1'],         en: 'Quantity check',                           el: 'ΔΠΠ - ΠΟΣΟΤΙΚΟΣ ΕΛΕΓΧΟΣ' },
  { code: 6, validFor: ['10.1', '10.2'], en: 'Non-delivery / partial delivery',          el: 'ΔΠΠ - ΜΗ/ΜΕΡΙΚΗ ΠΑΡΑΔΟΣΗ' },
  { code: 7, validFor: ['10.1', '10.2'], en: 'Other cases',                              el: 'ΔΠΠ - ΛΟΙΠΕΣ ΠΕΡΙΠΤΩΣΕΙΣ' },
];

/** The code that takes a free-text title (`otherReceivingNotePurposeTitle`). */
export const MYDATA_RECEIVING_NOTE_PURPOSE_OTHER = 7;

/** What a picker offers for a receiving note of this type — code 5 is 10.1 only. */
export function selectableReceivingNotePurposes(
  documentType: string | null | undefined,
): readonly MydataReceivingNotePurpose[] {
  const t = String(documentType ?? '');
  return MYDATA_RECEIVING_NOTE_PURPOSES.filter((p) => p.validFor.includes(t));
}

export function receivingNotePurposeLabel(
  code: number | string | null | undefined,
  lang: 'el' | 'en' = 'en',
): string {
  if (code == null || code === '') return '';
  const n = Number(code);
  const row = MYDATA_RECEIVING_NOTE_PURPOSES.find((p) => p.code === n);
  return row ? row[lang] : String(code);
}

/** A myDATA code table that is nothing but a numeric code and its two names. */
export interface MydataNamedCode {
  code: number;
  en: string;
  el: string;
}

/** myDATA `packagingType` — AADE Appendix §8.23. A COUNT of packages, never a price. */
export const MYDATA_PACKAGING_TYPES: readonly MydataNamedCode[] = [
  { code: 1, en: 'Pallet', el: 'Παλέτα' },
  { code: 2, en: 'Carton', el: 'Κούτα' },
  { code: 3, en: 'Crate',  el: 'Κιβώτιο' },
  { code: 4, en: 'Barrel', el: 'Βαρέλι' },
  { code: 5, en: 'Sack',   el: 'Σάκος' },
  { code: 6, en: 'Other',  el: 'Λοιπά' },
];

/** The code that takes a free-text title (`otherPackagingTypeTitle`, max 150 chars). */
export const MYDATA_PACKAGING_TYPE_OTHER = 6;

export function packagingTypeLabel(
  code: number | string | null | undefined,
  lang: 'el' | 'en' = 'en',
): string {
  if (code == null || code === '') return '';
  const n = Number(code);
  const row = MYDATA_PACKAGING_TYPES.find((p) => p.code === n);
  return row ? row[lang] : String(code);
}

/** myDATA `reverseDeliveryNotePurpose` — AADE Appendix §8.21, why the RECIPIENT issued it. */
export const MYDATA_REVERSE_DELIVERY_PURPOSES: readonly MydataNamedCode[] = [
  { code: 1, en: 'Issuer not obliged to issue',              el: 'ΜΗ ΥΠΟΧΡΕΟΣ ΕΚΔΟΣΗΣ' },
  { code: 2, en: 'Refusal to issue / inadvertent non-issue', el: 'ΑΡΝΗΣΗ ΕΚΔΟΣΗΣ/ΕΚ ΠΑΡΑΔΡΟΜΗΣ ΜΗ ΕΚΔΟΣΗ' },
  { code: 3, en: 'Intra-Community acquisition',              el: 'ΕΝΔΟΚΟΙΝΟΤΙΚΗ ΑΠΟΚΤΗΣΗ' },
  { code: 4, en: 'Third-country acquisition',                el: 'ΑΠΟΚΤΗΣΗ ΤΡΙΤΗ ΧΩΡΑ' },
  { code: 5, en: 'Reverse charge',                           el: 'ΑΝΤΙΣΤΡΟΦΗ ΥΠΟΧΡΕΩΣΗΣ' },
];

export function reverseDeliveryPurposeLabel(
  code: number | string | null | undefined,
  lang: 'el' | 'en' = 'en',
): string {
  if (code == null || code === '') return '';
  const n = Number(code);
  const row = MYDATA_REVERSE_DELIVERY_PURPOSES.find((p) => p.code === n);
  return row ? row[lang] : String(code);
}

/** myDATA `entityType` — AADE Appendix §8.20, what an `otherCorrelatedEntities` party IS. */
export const MYDATA_ENTITY_TYPES: readonly MydataNamedCode[] = [
  { code: 1, en: 'Tax representative',      el: 'Φορολογικός Εκπρόσωπος' },
  { code: 2, en: 'Intermediary',            el: 'Διαμεσολαβητής' },
  { code: 3, en: 'Transporter',             el: 'Μεταφορέας' },
  { code: 4, en: 'Recipient of the sender', el: 'Λήπτης του Αποστολέα (Πωλητή)' },
  { code: 5, en: 'Sender (seller)',         el: 'Αποστολέας (Πωλητής)' },
  { code: 6, en: 'Other correlated entity', el: 'Λοιπές Συσχετιζόμενες Οντότητες' },
];

/** The transporter — the party myDATA v2.0.2 validates `ConfirmDeliveryOutcome` against. */
export const MYDATA_ENTITY_TYPE_TRANSPORTER = 3;

/** Λοιπές Συσχετιζόμενες Οντότητες — what a party that states no category falls back to. */
export const MYDATA_ENTITY_TYPE_OTHER = 6;

export function entityTypeLabel(
  code: number | string | null | undefined,
  lang: 'el' | 'en' = 'en',
): string {
  if (code == null || code === '') return '';
  const n = Number(code);
  const row = MYDATA_ENTITY_TYPES.find((p) => p.code === n);
  return row ? row[lang] : String(code);
}

/**
 * A myDATA code table whose rows AADE restricts to certain document types, and may mark
 * read-only. An empty `validFor` means every type accepts the code.
 */
export interface MydataRestrictedCode {
  code: number;
  en: string;
  el: string;
  submittable: boolean;
  validFor: readonly string[];
}

/** myDATA `specialInvoiceCategory` — AADE Appendix §8.19. */
export const MYDATA_SPECIAL_INVOICE_CATEGORIES: readonly MydataRestrictedCode[] = [
  { code: 1,  submittable: true,  validFor: [], en: 'Subsidies / grants',                         el: 'Επιδοτήσεις – Επιχορηγήσεις' },
  { code: 2,  submittable: true,  validFor: [], en: 'Hotel retail income – room charges',         el: 'Έσοδα Λιανικής Ξενοδοχείων – Χρεώσεις Δωματίου' },
  { code: 3,  submittable: true,  validFor: [], en: 'Accounting entry',                           el: 'Λογιστική Εγγραφή' },
  { code: 4,  submittable: true,  validFor: [], en: 'Tax free',                                   el: 'Tax Free' },
  { code: 5,  submittable: true,  validFor: [], en: 'Composite domestic / foreign transactions',  el: 'Σύνθετες συναλλαγές ημεδαπής – αλλοδαπής' },
  { code: 6,  submittable: true,  validFor: [], en: 'Beneficiaries of art. 3, KYA 139818 ΕΞ2022', el: 'Δικαιούχοι του άρθρου 3 της ΚΥΑ 139818 ΕΞ2022' },
  { code: 7,  submittable: true,  validFor: [], en: 'Purchase of agricultural goods and services (VAT Code art. 41)', el: 'Αγορά αγροτικών αγαθών υπηρεσιών Άρθρο 41 του Κώδικα ΦΠΑ' },
  { code: 8,  submittable: false, validFor: [], en: 'Retail income, AADE ΦΗΜ_1',                  el: 'Έσοδα Λιανικών ΦΗΜ ΑΑΔΕ_1' },
  { code: 9,  submittable: false, validFor: [], en: 'Retail income, AADE ΦΗΜ_2',                  el: 'Έσοδα Λιανικών ΦΗΜ ΑΑΔΕ_2' },
  { code: 10, submittable: true,  validFor: [], en: 'Retail income, business ΦΗΜ variance',       el: 'Έσοδα Λιανικών ΦΗΜ Επιχείρησης Απόκλιση' },
  { code: 11, submittable: true,  validFor: [], en: 'Heating allowance',                          el: 'Επίδομα Θέρμανσης' },
  { code: 12, submittable: true,  validFor: [], en: 'Food-service transactions',                  el: 'Συναλλαγές εστίασης' },
  { code: 13, submittable: true,  validFor: ['11.4', '14.30'], en: 'Correlation difficulty indicator', el: 'Ένδειξη Δυσχέρεια Συσχέτισης' },
];

/**
 * myDATA `invoiceVariationType` — AADE Appendix §8.18. Each code names WHO is transmitting a
 * document the other party omitted or reported differently, and AADE accepts it only on the
 * types listed against it.
 */
export const MYDATA_INVOICE_VARIATION_TYPES: readonly MydataRestrictedCode[] = [
  { code: 1, submittable: true, validFor: ['1.1', '1.6', '2.1', '2.4', '5.2', '8.1', '8.2'], en: 'Omission transmitted by the recipient', el: 'Διαβίβαση Παράλειψης από Λήπτη' },
  { code: 2, submittable: true, validFor: ['11.3', '11.4', '13.1', '13.31'],                 en: 'Omission transmitted by the issuer',    el: 'Διαβίβαση Παράλειψης από Εκδότη' },
  { code: 3, submittable: true, validFor: ['11.3', '11.4', '13.1', '13.31'],                 en: 'Variance transmitted by the recipient', el: 'Διαβίβαση Απόκλισης από Λήπτη' },
  { code: 4, submittable: true, validFor: ['11.3', '11.4', '13.1', '13.31'],                 en: 'Variance transmitted by the issuer',    el: 'Διαβίβαση Απόκλισης από Εκδότη' },
];

/** True when AADE accepts this code on that document type. An empty `validFor` accepts any. */
export function acceptsOnDocumentType(
  row: { validFor: readonly string[] },
  documentType: string | null | undefined,
): boolean {
  if (!row.validFor.length) return true;
  return row.validFor.includes(String(documentType ?? ''));
}

/**
 * The myDATA types that ARE a movement document rather than one that happens to carry goods.
 * 9.x dispatch them, 10.x record a quantitative receipt, and it is the 10.x pair that makes
 * `receivingNotePurpose` mandatory from v2.0.2.
 */
export const MYDATA_MOVEMENT_DOC_TYPES: readonly { code: string; en: string; el: string }[] = [
  { code: '9.1',  en: 'Correlated delivery note',      el: 'Δελτίο Αποστολής Συσχετιζόμενο' },
  { code: '9.2',  en: 'Consolidated delivery note',    el: 'Συγκεντρωτικό Δελτίο Αποστολής' },
  { code: '9.3',  en: 'Delivery note',                 el: 'Δελτίο Αποστολής' },
  { code: '10.1', en: 'Correlated receiving note',     el: 'Δελτίο Ποσοτικής Παραλαβής Συσχετιζόμενο' },
  { code: '10.2', en: 'Non-correlated receiving note', el: 'Δελτίο Ποσοτικής Παραλαβής Μη Συσχετιζόμενο' },
];

/** The Δελτίο Ποσοτικής Παραλαβής pair — the types that REQUIRE a `receivingNotePurpose`. */
export const MYDATA_RECEIVING_NOTE_TYPES: readonly string[] = ['10.1', '10.2'];

export function isReceivingNoteType(documentType: string | null | undefined): boolean {
  return MYDATA_RECEIVING_NOTE_TYPES.includes(String(documentType ?? ''));
}

export function isMovementDocType(documentType: string | null | undefined): boolean {
  return MYDATA_MOVEMENT_DOC_TYPES.some((t) => t.code === String(documentType ?? ''));
}

/** The 9.x dispatch family. `toWeigh` is accepted on these three and nowhere else. */
export const MYDATA_DISPATCH_NOTE_TYPES: readonly string[] = ['9.1', '9.2', '9.3'];

export function isDispatchNoteType(documentType: string | null | undefined): boolean {
  return MYDATA_DISPATCH_NOTE_TYPES.includes(String(documentType ?? ''));
}

export function movementDocTypeLabel(
  code: string | null | undefined,
  lang: 'el' | 'en' = 'en',
): string {
  const row = MYDATA_MOVEMENT_DOC_TYPES.find((t) => t.code === String(code ?? ''));
  return row ? row[lang] : String(code ?? '');
}

/**
 * Document types a PICKER offers `isDeliveryNote` on. myDATA v2.0.2 names 1.4, 3.1, 3.2 and
 * 11.5 as additions to the set, but AADE publishes no enumeration of it — the field table
 * leaves the restriction column blank and only gives 1.1 as an example. So this list is
 * INFERRED, and like `MydataMovePurpose.submittable` it governs what we offer, never a
 * transmit-time refusal: AADE rejecting the combination is the authority, not us.
 */
export const MYDATA_IS_DELIVERY_NOTE_TYPES: readonly string[] = [
  '1.1', '1.2', '1.3', '1.4', '1.5', '1.6',
  '2.1', '2.2', '2.3', '2.4',
  '3.1', '3.2',
  '5.1', '5.2',
  '6.1', '6.2',
  '11.1', '11.2', '11.3', '11.4', '11.5',
];

export function canBeDeliveryNote(documentType: string | null | undefined): boolean {
  return MYDATA_IS_DELIVERY_NOTE_TYPES.includes(String(documentType ?? ''));
}

/** `thirdPartyCollection` — "αποδεκτό μόνο για παραστατικά τύπων 8.4 και 8.5" (POS receipts). */
export const MYDATA_THIRD_PARTY_COLLECTION_TYPES: readonly string[] = ['8.4', '8.5'];

/** `multipleConnectedMarks` — "δεν είναι αποδεκτό" on these three. */
export const MYDATA_NO_MULTIPLE_MARKS_TYPES: readonly string[] = ['1.6', '2.4', '5.1'];
