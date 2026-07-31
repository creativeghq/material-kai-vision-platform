/**
 * Pure helpers for a party's money position. Deliberately free of any Supabase/component import so
 * the rules below can be unit-tested without booting a client.
 */

/**
 * How many non-zero terms the net Balance is actually made of.
 *
 * The Balance tile is a NET of three terms. Netting one term is not netting — it reprints that term
 * with a direction word beside it, which is how a party holding €1,373 of unallocated credit and
 * nothing else showed "On account €1,373" next to "Balance · €1,373": the same number twice, the
 * second derived entirely from the first. Both were valid numbers in a valid layout, so nothing
 * else in the stack could see it.
 */
export function netPositionTermCount(t: {
  customerOutstanding: number; heldCredit: number; supplierOutstanding: number;
}): number {
  return [t.customerOutstanding, t.heldCredit, t.supplierOutstanding]
    .filter((v) => Math.abs(v) > 0.005).length;
}

/**
 * How a net balance reads on a party's record.
 *
 * Neutral by design. This sits on a CRM relationship page that account managers open in front of
 * the customer, and "they owe us" states a debt as an accusation — it is the language of a
 * collections letter, not of a ledger. The direction is the same fact either way, so it is said
 * the way an accountant says it: money due TO us, or money held IN THEIR favour.
 */
export function netPositionDirection(net: number): 'due to us' | 'in their favour' | 'settled' {
  if (net > 0) return 'due to us';
  if (net < 0) return 'in their favour';
  return 'settled';
}
