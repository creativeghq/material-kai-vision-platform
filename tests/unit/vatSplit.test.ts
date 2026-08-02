import { describe, it, expect } from 'vitest';
import { splitByVatRate, splitGrossLikeTotals } from '../../src/modules/finance/utils/vatSplit';

/**
 * Guards the bug this was extracted from (ORD-2026-0001).
 *
 * The order's "Pay" action pre-filled the Add Expense form with the supplier's OWED figure — a
 * VAT-INCLUSIVE number — into the form's "Subtotal (net)" box, with VAT hardcoded to 0. The IZIDA
 * line is 259.2 × €7 at 24%: €1,814.40 net + €435.46 VAT = €2,249.86 gross. With €2,200 paid the
 * remaining €49.86 landed as "net 49.86 / VAT 0.00", so the P&L cost was overstated and the input
 * VAT was lost. The sibling action ("Mark paid") had the opposite half of the same bug: it passed
 * the net and left VAT at 0, understating the total.
 *
 * Both are valid `number`s in valid fields, so nothing in the stack could see them. These two
 * functions are now the only arithmetic on that path.
 */
describe('vatSplit', () => {
  describe('splitByVatRate — a line whose rate is known', () => {
    it('carries the line VAT instead of leaving it at zero', () => {
      // The IZIDA line: 259.2 units × €7 cost, 24%.
      expect(splitByVatRate(259.2 * 7, 24)).toEqual({ net: 1814.4, vat: 435.46 });
    });

    it('leaves a zero-rated line at zero VAT', () => {
      expect(splitByVatRate(1578, 0)).toEqual({ net: 1578, vat: 0 });
    });

    it('treats a missing rate as zero rather than guessing one', () => {
      expect(splitByVatRate(100, null)).toEqual({ net: 100, vat: 0 });
      expect(splitByVatRate(100, undefined)).toEqual({ net: 100, vat: 0 });
    });

    it('never returns a negative net', () => {
      expect(splitByVatRate(-50, 24)).toEqual({ net: 0, vat: 0 });
    });
  });

  describe('splitGrossLikeTotals — a gross remainder split like the whole cost', () => {
    it('splits the remaining owed amount at the rate the cost carries', () => {
      // IZIDA: cost 1814.40 net / 2249.86 gross, 2200 paid → 49.86 still owed.
      const { net, vat } = splitGrossLikeTotals(49.86, 1814.4, 2249.86);
      expect(net).toBe(40.21);
      expect(vat).toBe(9.65);
      // The bug: the whole 49.86 used to land in `net` with vat 0.
      expect(net).not.toBe(49.86);
    });

    it('adds back to exactly the gross — VAT is the remainder, so rounding cannot leak', () => {
      for (const gross of [0.01, 1, 33.33, 49.86, 100, 2249.86, 9999.99]) {
        const { net, vat } = splitGrossLikeTotals(gross, 1814.4, 2249.86);
        expect(Math.round((net + vat) * 100) / 100).toBe(Math.round(gross * 100) / 100);
      }
    });

    it('puts everything in net for a VAT-free supplier', () => {
      // KEROS on the same order: 1578 net = 1578 gross, 1250 paid → 328 owed, no VAT.
      expect(splitGrossLikeTotals(328, 1578, 1578)).toEqual({ net: 328, vat: 0 });
    });

    it('falls back to all-net rather than dividing by zero', () => {
      expect(splitGrossLikeTotals(100, 0, 0)).toEqual({ net: 100, vat: 0 });
    });

    it('never returns a negative net for an over-paid supplier', () => {
      expect(splitGrossLikeTotals(-20, 1814.4, 2249.86)).toEqual({ net: 0, vat: 0 });
    });
  });
});
