/**
 * `trip_expense_reports_card_type_check`, written ONCE (#391).
 *
 * A union in `tripExpenseService` and a plain array in `trip-expense-tools`.
 *
 * WORTH KNOWING: the tool's `card_type` param currently reads `type: 'string'` in the
 * generated manifest, not `type: 'enum'` — its array was never wired into a `z.enum`. So
 * the agent has always been free to send anything and have the database reject it. Moving
 * the list here does not fix that on its own; whoever wires the z.enum should re-run
 * `npm run tools:manifest` and check the param becomes an enum, per the trap CLAUDE.md
 * documents.
 *
 * THIS FILE IS IMPORT-FREE, ON PURPOSE — byte-mirrored to the edge by
 * `npm run vocab:mirror`.
 */

export const EXPENSE_CARD_TYPES = ['trip', 'monthly', 'other'] as const;
export type ExpenseCardType = (typeof EXPENSE_CARD_TYPES)[number];

export function isExpenseCardType(v: unknown): v is ExpenseCardType {
  return typeof v === 'string' && (EXPENSE_CARD_TYPES as readonly string[]).includes(v);
}
