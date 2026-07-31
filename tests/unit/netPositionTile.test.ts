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
import { netPositionTermCount, netPositionDirection } from '@/modules/finance/utils/netPosition';

const show = (t: { customerOutstanding?: number; heldCredit?: number; supplierOutstanding?: number }) =>
  netPositionTermCount({
    customerOutstanding: t.customerOutstanding ?? 0,
    heldCredit: t.heldCredit ?? 0,
    supplierOutstanding: t.supplierOutstanding ?? 0,
  }) > 1;

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
