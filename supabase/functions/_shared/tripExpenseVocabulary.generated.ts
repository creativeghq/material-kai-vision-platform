// GENERATED MIRROR of src/modules/finance/tripExpenseVocabulary.ts — do not edit here.
// Regenerate: npm run vocab:mirror (part of gen:all). Freshness is enforced by
// tests/unit/vocabularyMirrors.test.ts, which fails the build on any drift.

/** `trip_expense_reports_card_type_check`, written ONCE (#391). */

export const EXPENSE_CARD_TYPES = ['trip', 'monthly', 'other'] as const;
export type ExpenseCardType = (typeof EXPENSE_CARD_TYPES)[number];

export function isExpenseCardType(v: unknown): v is ExpenseCardType {
  return typeof v === 'string' && (EXPENSE_CARD_TYPES as readonly string[]).includes(v);
}
