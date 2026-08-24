/**
 * Issue #377 Phase 1b — the rule that makes complete-the-document safe.
 *
 * `total_net` is transmitted, carries a MARK and is not editable. The lines are ours. If they do
 * not add up to it, the document states two different amounts for one purchase — and both are
 * valid numbers, so nothing downstream can tell which is real: warehouse intake would derive unit
 * costs from the typed side while payables reads the AADE side, and the two would part company
 * silently. `inbound_doc_set_lines` is the authority; this is the half the dialog uses, and it has
 * to agree with the server or the save button lights up on something that will be refused.
 */
import { describe, it, expect } from 'vitest';
import { FOOTING_TOLERANCE, footLines, isBlankLine, type DraftLine } from '@/modules/finance/utils/lineFooting';

const line = (over: Partial<DraftLine> = {}): DraftLine => ({
  item_description: 'AMALFI GRIS 80X80', unit: 'm2', item_code: null,
  quantity: 17.92, net_value: 295.86, vat_category: null, vat_amount: null,
  ...over,
});

describe('footing against the myDATA anchor', () => {
  it('accepts lines that add up exactly', () => {
    const v = footLines([line({ net_value: 800 }), line({ net_value: 326.22 })], 1126.22);
    expect(v.foots).toBe(true);
    expect(v.problem).toBeNull();
    expect(v.linesTotal).toBe(1126.22);
    expect(v.difference).toBe(0);
  });

  it('accepts one cent of drift and refuses two', () => {
    // A cent absorbs a single rounding step off the supplier's own PDF. A transcription error is
    // never a cent, so nothing meaningful can hide inside the tolerance.
    expect(footLines([line({ net_value: 1126.23 })], 1126.22).foots).toBe(true);
    expect(footLines([line({ net_value: 1126.21 })], 1126.22).foots).toBe(true);
    expect(footLines([line({ net_value: 1126.24 })], 1126.22).foots).toBe(false);
    expect(FOOTING_TOLERANCE).toBe(0.01);
  });

  it('says which way it is wrong, not just that it is', () => {
    const over = footLines([line({ net_value: 1200 })], 1126.22);
    expect(over.foots).toBe(false);
    expect(over.problem).toContain('over by 73.78');

    const short = footLines([line({ net_value: 1000 })], 1126.22);
    expect(short.problem).toContain('short by 126.22');
  });

  it('does not accumulate float error across many lines', () => {
    // 0.1 + 0.2 !== 0.3 in binary floating point; ten lines of 112.622 must still foot.
    const lines = Array.from({ length: 10 }, () => line({ net_value: 112.622 }));
    const v = footLines(lines, 1126.22);
    expect(v.linesTotal).toBe(1126.22);
    expect(v.foots).toBe(true);
  });

  it('refuses when the document states no net at all', () => {
    // Nothing to reconcile against. Saving here would mean the typed lines ARE the total, which
    // is exactly the authority this feature is built to not have.
    const v = footLines([line()], null);
    expect(v.foots).toBe(false);
    expect(v.target).toBeNull();
    expect(v.problem).toMatch(/no net total/i);
  });
});

describe('what counts as a line', () => {
  it('ignores the empty row the grid always shows', () => {
    const blank: DraftLine = {
      item_description: '', unit: null, item_code: null,
      quantity: null, net_value: null, vat_category: null, vat_amount: null,
    };
    expect(isBlankLine(blank)).toBe(true);
    // One real line plus the trailing blank still foots — a blank row is not a mistake.
    expect(footLines([line({ net_value: 1126.22 }), blank], 1126.22).foots).toBe(true);
  });

  it('does not treat a line with a value as blank just because it is unnamed', () => {
    const unnamed = line({ item_description: '   ', net_value: 500 });
    expect(isBlankLine(unnamed)).toBe(false);
    const v = footLines([unnamed, line({ net_value: 626.22 })], 1126.22);
    // It adds up, and it is still refused: "Line 3" is not a product, and a value-only line is
    // precisely what lines_source='none' already meant. Saving one would leave the document
    // marked complete while still carrying nothing anybody can receive into stock.
    expect(v.linesTotal).toBe(1126.22);
    expect(v.foots).toBe(false);
    expect(v.problem).toContain('Line 1');
  });

  it('refuses an empty set', () => {
    expect(footLines([], 1126.22).problem).toMatch(/at least one line/i);
  });

  it('refuses a line with no value before complaining about the total', () => {
    const v = footLines([line({ net_value: null }), line({ net_value: 1126.22 })], 1126.22);
    expect(v.foots).toBe(false);
    expect(v.problem).toContain('Line 1');
    expect(v.problem).toMatch(/no net value/i);
  });

  it('refuses a zero or negative quantity', () => {
    // The unit cost is net / quantity, so a zero divides and a negative inverts. Both produce a
    // number, and that number reaches products.cost and then the markup ladder.
    expect(footLines([line({ quantity: 0, net_value: 1126.22 })], 1126.22).problem).toContain('quantity of 0');
    expect(footLines([line({ quantity: -3, net_value: 1126.22 })], 1126.22).problem).toContain('quantity of -3');
    // Absent is fine — plenty of service lines have no meaningful quantity at all.
    expect(footLines([line({ quantity: null, net_value: 1126.22 })], 1126.22).foots).toBe(true);
  });
});
