/**
 * Pure helpers for a party's money position. Deliberately free of any Supabase/component import so
 * the rules below can be unit-tested without booting a client.
 */

/**
 * The four terms of a party's account position.
 *
 * `orderOutstanding` is cash on orders that have NOT been invoiced yet, ALREADY NETTED BY
 * DIRECTION by the caller: a sales order they still owe on counts positive, a purchase order we
 * still owe on counts negative. Summing the two raw is the "netted the directions" mistake the
 * money-derivation rule exists to prevent — for a party that both buys and sells, it would report
 * a supplier's unpaid bill as the customer owing us more.
 */
export interface NetPositionTerms {
  customerOutstanding: number;
  heldCredit: number;
  supplierOutstanding: number;
  /** Signed. Positive = owed to us on un-invoiced orders; negative = owed by us. */
  orderOutstanding?: number;
}

/**
 * How many non-zero terms the net Balance is actually made of.
 *
 * Netting one term is not netting — it reprints that term with a direction word beside it, which
 * is how a party holding €1,373 of unallocated credit and nothing else showed "On account €1,373"
 * next to "Balance · €1,373": the same number twice, the second derived entirely from the first.
 * Both were valid numbers in a valid layout, so nothing else in the stack could see it.
 */
export function netPositionTermCount(t: NetPositionTerms): number {
  return [t.customerOutstanding, t.heldCredit, t.supplierOutstanding, t.orderOutstanding ?? 0]
    .filter((v) => Math.abs(v) > 0.005).length;
}

/**
 * THE account balance. One number for everything the party's account holds, in one direction:
 * what is outstanding on their issued invoices, plus what they still owe on orders nobody has
 * invoiced yet, less cash of theirs we are sitting on, less anything outstanding to them as a
 * supplier. Positive = due to us.
 */
export function netPositionTotal(t: NetPositionTerms): number {
  return t.customerOutstanding + (t.orderOutstanding ?? 0) - t.heldCredit - t.supplierOutstanding;
}

/**
 * Does the Balance tile earn its place beside the others?
 *
 * The rule is not "more than one term" but "does not restate a tile rendered next to it". Three of
 * the four terms have a tile of their own — On account, and each role row's Outstanding — so a
 * balance made of one of those alone is an echo. Un-invoiced order cash has no tile: the Balance
 * IS where it is stated, so a party whose only position is an open order still gets a number.
 */
export function netPositionVisible(t: NetPositionTerms): boolean {
  if (netPositionTermCount(t) > 1) return true;
  const mirrored = [t.customerOutstanding, t.heldCredit, t.supplierOutstanding]
    .filter((v) => Math.abs(v) > 0.005).length;
  return mirrored === 0 && Math.abs(t.orderOutstanding ?? 0) > 0.005;
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
