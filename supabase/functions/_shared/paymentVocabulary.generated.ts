// GENERATED MIRROR of src/modules/finance/paymentVocabulary.ts — do not edit here.
// Regenerate: npm run vocab:mirror (part of gen:all). Freshness is enforced by
// tests/unit/vocabularyMirrors.test.ts, which fails the build on any drift.

/**
 * The payment value-sets, written ONCE (#391).
 *
 * `PaymentMethod` was a union in `financeService` and two `Record<string, …>` label maps in
 * `finance-invoice-pdf`; the bank-feed provider was a union in `_shared/payments/types.ts`,
 * a `Record` of display order in `_shared/payments/registry.ts` and four hand-written
 * `<SelectItem>`s in `BankFeedTab`.
 *
 * THE DATABASE IS THE ENFORCER
 * -----------------------------
 * `payments_method_check` and `revolut_bank_transactions_provider_check`. Pinned to the
 * constraint text by `tests/unit/paymentVocabulary.test.ts`.
 *
 * THIS FILE IS IMPORT-FREE, ON PURPOSE — byte-mirrored to the edge by
 * `npm run vocab:mirror`.
 */

/**
 * `payments_method_check` — how the money actually moved.
 *
 * `iris` is a member for a reason worth keeping: the Greek IRIS scheme is its own myDATA
 * payment method, and before it existed here the register recorded an IRIS payment as
 * `card` — which made the ledger disagree with the document filed at AADE and collapsed
 * IRIS into card in the Z-report breakdown. A method that the tax authority distinguishes
 * is not a display detail.
 *
 * NOT the myDATA CODE. That is `MYDATA_PAYMENT_CODE` below — same subject, different fact,
 * keyed by an integer AADE assigns rather than by our own slug. Keep them apart in your head
 * and together in this file: they now live side by side precisely because the copies that
 * lived apart drifted (see the header on `MYDATA_PAYMENT_CODE`).
 *
 * The column is NULLABLE (`method IS NULL OR ...`), so "not recorded" is legitimate and is
 * NOT a member.
 */
export const PAYMENT_METHODS = [
  'bank_transfer', 'cash', 'card', 'iris', 'check', 'other',
] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

/**
 * `revolut_bank_transactions_provider_check` — whose money movement this feed row is.
 *
 * Identical to the payment-provider registry (`payments-<slug>` module slugs) because every
 * feed we ingest today comes from a provider we also transact through: Revolut is the bank
 * feed proper, and Stripe and Viva rows are informational mirrors of settlements their
 * webhooks already recorded.
 *
 * WHAT WOULD SPLIT THESE. A feed from a bank we do NOT take payments through — a plain
 * Piraeus or Alpha statement import — is a provider value with no `payments-<slug>` module
 * behind it. At that point this stops being one set and becomes two, and the right move is
 * a second named set here rather than widening this one, because `resolvePaymentMethods`
 * iterating a bank that cannot take a payment is the failure that follows.
 */
export const PAYMENT_PROVIDER_SLUGS = ['stripe', 'viva', 'revolut'] as const;
export type PaymentProviderSlug = (typeof PAYMENT_PROVIDER_SLUGS)[number];

/**
 * AADE Appendix table 8.12 — the `paymentMethods[].type` an invoice envelope transmits, and
 * the code stored on `invoices.payment_method_code`.
 *
 * WHY THIS IS A NAMED CONSTANT AND NOT AN INTEGER LITERAL. The table was written out five
 * times and TWO DIFFERENT NUMBERINGS were live at once. The register (`PosPage`), the
 * storefront and the fiscal envelope used AADE's: 3 = cash, 7 = POS, 8 = IRIS. The
 * `mydata_reference` seed that feeds the manual invoice picker — and the three label maps
 * that print the result — used the same eight labels rotated by two: 1 = Cash … 6 = IRIS,
 * 7 = Domestic account. So an operator who picked "3 — On credit" in the dialog transmitted
 * **Cash** to AADE, and a register receipt written as 7 (POS) PRINTED as "Domestic account".
 * Both halves were internally consistent; nothing could raise, because every value involved
 * is a valid integer between 1 and 8. Found 2026-08-29 by reading another vendor's public
 * API docs, not by any check we own.
 *
 * The names below are the fix: a call site says `MYDATA_PAYMENT_CODE.pos`, which cannot be
 * rotated. Never reintroduce a bare integer or a second `Record<number, string>` — the guard
 * in `tests/unit/paymentVocabulary.test.ts` fails the build if one appears.
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
