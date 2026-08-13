/**
 * The Balance tile must say something the tiles beside it do not.
 *
 * Reported from a real screen: a party holding €1,373 of unallocated credit and nothing else
 * rendered "On account €1,373" next to "Balance · we owe them €1,373". Both were correct. Balance
 * is a NET of three terms, and when only one of them is non-zero it nets nothing — it reprints
 * that one term with a direction word.
 *
 * Nothing in the stack could catch that: the number was right, the layout was valid, and the two
 * tiles agreeing is exactly what you would expect them to do. Only the rule "a net of one term is
 * not a net" makes it visible, so that rule gets a test.
 */
import { describe, it, expect } from 'vitest';
import {
  netPositionDirection, netPositionTotal, netPositionVisible,
} from '@/modules/finance/utils/netPosition';

type T = {
  customerOutstanding?: number; heldCredit?: number;
  supplierOutstanding?: number; orderOutstanding?: number;
};
const terms = (t: T) => ({
  customerOutstanding: t.customerOutstanding ?? 0,
  heldCredit: t.heldCredit ?? 0,
  supplierOutstanding: t.supplierOutstanding ?? 0,
  orderOutstanding: t.orderOutstanding ?? 0,
});
const show = (t: T) => netPositionVisible(terms(t));
const total = (t: T) => netPositionTotal(terms(t));

describe('the Balance tile only appears when it nets something', () => {
  it('hides when unallocated credit is the only term — the reported duplicate', () => {
    // On account already prints €1,373; Balance would print it again as "we owe them".
    expect(show({ heldCredit: 1373 })).toBe(false);
  });

  it('hides when a single role balance is the only term', () => {
    // "They owe us" / "We owe them" already appear in the role row below.
    expect(show({ customerOutstanding: 5000 })).toBe(false);
    expect(show({ supplierOutstanding: 900 })).toBe(false);
  });

  it('hides when the party is settled everywhere', () => {
    expect(show({})).toBe(false);
  });

  it('shows when credit offsets what they owe — the net is genuinely a third number', () => {
    // On account €1,373 · They owe us €5,000 · Balance €3,627. None restates another.
    expect(show({ customerOutstanding: 5000, heldCredit: 1373 })).toBe(true);
  });

  it('shows when both roles carry a balance', () => {
    expect(show({ customerOutstanding: 5000, supplierOutstanding: 900 })).toBe(true);
  });

  it('shows when credit exactly cancels the debt — "settled · €0" is real information', () => {
    expect(show({ customerOutstanding: 1373, heldCredit: 1373 })).toBe(true);
  });

  it('treats sub-cent noise as zero, so rounding dust cannot resurrect the tile', () => {
    expect(show({ customerOutstanding: 5000, heldCredit: 0.004 })).toBe(false);
  });

  /**
   * The rule is "does not restate a tile rendered beside it", not "more than one term". Three of
   * the four terms have their own tile; un-invoiced order cash does not, so it is the one term
   * that can stand alone. Getting this backwards hides the balance of a party whose only position
   * is an open order — the case that started this.
   */
  it('shows when un-invoiced order cash is the only term — it has no tile of its own', () => {
    expect(show({ orderOutstanding: 150 })).toBe(true);
    expect(show({ orderOutstanding: -850 })).toBe(true);
  });

  it('still hides when a mirrored term stands alone, even with order cash at zero', () => {
    expect(show({ heldCredit: 1373, orderOutstanding: 0 })).toBe(false);
  });
});

/**
 * A sales order they owe on and a purchase order we owe on are opposite sides of the trade. The
 * caller signs `orderOutstanding` before it gets here; this pins the direction the balance applies
 * to each term, so a future edit cannot quietly turn a credit into a debt.
 */
describe('the account balance nets every term in the right direction', () => {
  it('adds what they owe on invoices and on un-invoiced orders', () => {
    expect(total({ customerOutstanding: 5000, orderOutstanding: 150 })).toBe(5150);
  });

  it('subtracts cash of theirs we hold and anything we owe them as a supplier', () => {
    expect(total({ customerOutstanding: 5000, heldCredit: 1000, supplierOutstanding: 900 })).toBe(3100);
  });

  it('goes negative when they have paid ahead — the case a one-directional tile could not show', () => {
    // Paid €3,850 against a €3,000 order: the account holds €850 of theirs.
    expect(total({ orderOutstanding: -850 })).toBe(-850);
    expect(netPositionDirection(total({ orderOutstanding: -850 }))).toBe('in their favour');
  });

  it('never lets a purchase order we owe on read as the customer owing us more', () => {
    // Sales order €150 due to us, purchase order €400 due to them → €250 in their favour.
    expect(total({ orderOutstanding: 150 - 400 })).toBe(-250);
  });
});

/**
 * The direction word sits on a CRM relationship page that account managers open in front of the
 * customer. "They owe us" states the same fact as an accusation; a ledger says it neutrally.
 */
describe('the balance direction reads neutrally', () => {
  it('names which way the money sits without accusing anyone', () => {
    expect(netPositionDirection(3627)).toBe('due to us');
    expect(netPositionDirection(-1373)).toBe('in their favour');
    expect(netPositionDirection(0)).toBe('settled');
  });

  it('never phrases the balance as someone owing', () => {
    for (const n of [5000, -5000, 0]) {
      expect(netPositionDirection(n)).not.toMatch(/\bowe\b/i);
    }
  });
});
