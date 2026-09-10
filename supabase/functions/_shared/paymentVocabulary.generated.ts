// GENERATED MIRROR of src/modules/finance/paymentVocabulary.ts — do not edit here.
// Regenerate: npm run vocab:mirror (part of gen:all). Freshness is enforced by
// tests/unit/vocabularyMirrors.test.ts, which fails the build on any drift.

/** The payment value-sets, written ONCE (#391). */

/** `payments_method_check` — how the money actually moved. */
export const PAYMENT_METHODS = [
  'bank_transfer', 'cash', 'card', 'iris', 'check', 'other',
] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

/** `revolut_bank_transactions_provider_check` — whose money movement this feed row is. */
export const PAYMENT_PROVIDER_SLUGS = ['stripe', 'viva', 'revolut'] as const;
export type PaymentProviderSlug = (typeof PAYMENT_PROVIDER_SLUGS)[number];

/**
 * AADE Appendix table 8.12 — the `paymentMethods[].type` an invoice envelope transmits, and
 * the code stored on `invoices.payment_method_code`.
 */
export const MYDATA_PAYMENT_CODE = {
  domestic_account: 1,
  foreign_account: 2,
  cash: 3,
  cheque: 4,
  on_credit: 5,
  web_banking: 6,
  pos: 7,
  iris: 8,
} as const;
export type MydataPaymentCode = (typeof MYDATA_PAYMENT_CODE)[keyof typeof MYDATA_PAYMENT_CODE];

/**
 * Printed names, bilingual because the document is (`invoices.doc_language`). The Greek is
 * AADE's own wording — a παραστατικό names the method the way the tax authority does, so
 * this is the one place the English-only-UI rule does not apply.
 */
export const MYDATA_PAYMENT_METHOD_LABELS: Record<number, { en: string; el: string }> = {
  1: { en: 'Domestic payments account', el: 'Επαγ. Λογαριασμός Πληρωμών Ημεδαπής' },
  2: { en: 'Foreign payments account', el: 'Επαγ. Λογαριασμός Πληρωμών Αλλοδαπής' },
  3: { en: 'Cash', el: 'Μετρητά' },
  4: { en: 'Cheque', el: 'Επιταγή' },
  5: { en: 'On credit', el: 'Επί Πιστώσει' },
  6: { en: 'Web banking', el: 'Web Banking' },
  7: { en: 'POS / e-POS', el: 'POS / e-POS' },
  8: { en: 'IRIS', el: 'IRIS' },
};

/**
 * The printed name for a transmitted code. Falls back to the code itself rather than to a
 * blank or to a guessed name: an unrecognised code on a legal document must READ as
 * unrecognised, never quietly render as some other method.
 */
export function mydataPaymentLabel(code: number | string | null | undefined, lang: 'el' | 'en' = 'en'): string {
  if (code == null || code === '') return '';
  const n = Number(code);
  return MYDATA_PAYMENT_METHOD_LABELS[n]?.[lang] ?? String(code);
}

/**
 * Ledger method → the code that gets transmitted. `other` is deliberately `null`: AADE has no
 * "other", and picking the nearest one would file a payment method nobody chose. A caller with
 * a `null` here must ask rather than default.
 *
 * `bank_transfer` maps to the DOMESTIC account. A Greek issuer's professional account is the
 * overwhelming case; a foreign one (code 2) is a per-invoice fact this map cannot know, so set
 * `payment_method_code` explicitly on those.
 */
export const MYDATA_PAYMENT_CODE_BY_LEDGER_METHOD: Record<PaymentMethod, number | null> = {
  bank_transfer: MYDATA_PAYMENT_CODE.domestic_account,
  cash: MYDATA_PAYMENT_CODE.cash,
  card: MYDATA_PAYMENT_CODE.pos,
  iris: MYDATA_PAYMENT_CODE.iris,
  check: MYDATA_PAYMENT_CODE.cheque,
  other: null,
};

export function isPaymentMethod(v: unknown): v is PaymentMethod {
  return typeof v === 'string' && (PAYMENT_METHODS as readonly string[]).includes(v);
}
export function isPaymentProviderSlug(v: unknown): v is PaymentProviderSlug {
  return typeof v === 'string' && (PAYMENT_PROVIDER_SLUGS as readonly string[]).includes(v);
}
