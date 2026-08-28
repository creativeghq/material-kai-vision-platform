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
 * NOT the myDATA CODE map. `invoice-templates/labels.ts` exports a
 * `PAYMENT_METHOD_LABELS: Record<number, string>` — 1 = Cash, 2 = Check, 6 = IRIS — which
 * is AADE's numbering, a different fact that happens to carry the same variable name in
 * `finance-invoice-pdf`. Do not unify them: one is what the ledger stores, the other is
 * what the envelope transmits, and they are keyed by different things.
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

export function isPaymentMethod(v: unknown): v is PaymentMethod {
  return typeof v === 'string' && (PAYMENT_METHODS as readonly string[]).includes(v);
}
export function isPaymentProviderSlug(v: unknown): v is PaymentProviderSlug {
  return typeof v === 'string' && (PAYMENT_PROVIDER_SLUGS as readonly string[]).includes(v);
}
