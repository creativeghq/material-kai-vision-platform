/**
 * A post-dated cheque is an asset that changes hands (#423).
 *
 * IMPORT-FREE on purpose. No international product models any of this — it is the one thing they
 * cannot fake, and table stakes in Greece. Two facts carry it: a pledged security is out of reach,
 * and a bounce unwinds everything the cheque settled on its way through.
 */

export type ChequeHolder = 'us' | 'endorsed' | 'discounted' | 'factored' | 'settled';

export type ChequeAction =
  | 'received'
  | 'endorsed'
  | 'discounted'
  | 'factored'
  | 'returned'
  | 'settled'
  | 'bounced';

export const HOLDER_LABEL: Record<ChequeHolder, string> = {
  us: 'In hand',
  endorsed: 'Endorsed on (οπισθογράφηση)',
  discounted: 'Discounted at a bank (προεξόφληση)',
  factored: 'With a factor',
  settled: 'Settled',
};

export const ACTION_LABEL: Record<ChequeAction, string> = {
  received: 'Received',
  endorsed: 'Endorse to a supplier',
  discounted: 'Discount at a bank',
  factored: 'Hand to a factor',
  returned: 'Returned to us',
  settled: 'Settled',
  bounced: 'Bounced (ακάλυπτη)',
};

export interface ChequeRow {
  id: string;
  cheque_number: string | null;
  amount: number;
  due_date: string | null;
  maturity_date: string | null;
  status: 'pending' | 'cleared' | 'bounced' | 'cancelled';
  current_holder: ChequeHolder;
  is_pledged: boolean;
  is_transferable: boolean;
  pledged_reason: string | null;
}

export interface ChequePortfolio {
  status: 'ok' | 'none';
  as_of?: string;
  spendable?: number;
  spendable_count?: number;
  pledged?: number;
  pledged_count?: number;
  endorsed_on?: number;
  discounted?: number;
  bounced?: number;
  matured_unsettled?: number;
  without_maturity?: number;
  reason: string;
}

/**
 * Can this security be spent?
 *
 * Soft1's «Δεσμευμένο» exists precisely so an already-committed cheque cannot be spent twice, so a
 * pledged one drops out of every selection list rather than being shown greyed out somewhere.
 */
export function chequeIsSpendable(c: ChequeRow): boolean {
  return c.status === 'pending' && c.current_holder === 'us' && !c.is_pledged;
}

/** Which moves this cheque will actually accept. */
export function allowedActions(c: ChequeRow): ChequeAction[] {
  if (c.status !== 'pending') return [];
  const out: ChequeAction[] = [];
  if (c.current_holder === 'us' && !c.is_pledged) {
    if (c.is_transferable) out.push('endorsed', 'factored');
    out.push('discounted');
  }
  if (c.current_holder !== 'us') out.push('returned');
  out.push('settled', 'bounced');
  return out;
}

/**
 * A cheque with no maturity date can never show as due.
 *
 * Which is NOT the same as not being due — it is the date nobody entered, and the cheque quietly
 * ages out of every list that sorts by it.
 */
export function chequeIsUndated(c: ChequeRow): boolean {
  return c.status === 'pending' && c.maturity_date == null;
}

/**
 * What a bounce unwinds.
 *
 * If an endorsed cheque bounces the liability comes back to US and the customer's debt REVIVES —
 * two reversals from one event, and the second is the one that gets forgotten.
 */
export function bounceUnwinds(c: ChequeRow): string[] {
  const out = ['The cheque returns to us'];
  if (c.current_holder === 'endorsed') {
    out.push('The payable it settled is open again');
    out.push("The customer's debt revives");
  }
  if (c.current_holder === 'discounted') {
    out.push('The bank reclaims the advance, and the discount fee is already spent');
  }
  return out;
}
