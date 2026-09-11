/** A document AADE voided must not be bookable, receivable, itemisable — or silent. */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { blankComments } from '../helpers/stripComments';
import { isCancelledDocument } from '../../src/modules/finance/utils/inboundProvenance';
import { inboundOutcomes } from '../../src/modules/finance/components/inboundStatus';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
/** Comments blanked first: a rule mentioned in prose must never satisfy a source gate. */
const code = (rel: string) => blankComments(read(rel));

const SYNC = 'supabase/functions/finance-inbound-sync/index.ts';
const MENU = 'src/modules/finance/components/InboundDocActionsMenu.tsx';
const SERVICE = 'src/modules/finance/services/inboundService.ts';

describe('a cancelled inbound document', () => {
  describe('the predicate', () => {
    it('reads the cancellation MARK, and only a real one', () => {
      expect(isCancelledDocument({ cancelled_by_mark: '400007122392568' })).toBe(true);
      expect(isCancelledDocument({ cancelled_by_mark: null })).toBe(false);
      expect(isCancelledDocument({ cancelled_by_mark: '' })).toBe(false);
      // Whitespace is not a cancellation. Treating it as one would void live documents.
      expect(isCancelledDocument({ cancelled_by_mark: '   ' })).toBe(false);
      expect(isCancelledDocument({})).toBe(false);
    });
  });

  describe('what the operator is told', () => {
    it('states the cancellation instead of a normal outcome', () => {
      const out = inboundOutcomes({ status: 'new', cancelled_by_mark: '400007122392568' });
      expect(out.map((o) => o.label)).toEqual(['Cancelled at AADE']);
    });

    it('outranks "In Expenses" — the void fact is the one that matters', () => {
      const out = inboundOutcomes({
        status: 'classified',
        created_supplier_bill_id: 'bill-1',
        cancelled_by_mark: '400007122392568',
      });
      expect(out.map((o) => o.label)).toEqual(['Cancelled at AADE']);
    });

    it('is still stated once dismissed, alongside the dismissal', () => {
      const out = inboundOutcomes({ status: 'dismissed', cancelled_by_mark: '4000071' });
      expect(out.map((o) => o.label)).toEqual(['Cancelled at AADE', 'Dismissed']);
    });

    it('leaves an uncancelled document exactly as it was', () => {
      expect(inboundOutcomes({ status: 'new' })).toEqual([]);
      expect(inboundOutcomes({ status: 'classified', created_supplier_bill_id: 'b' }).map((o) => o.label))
        .toEqual(['In Expenses']);
      expect(inboundOutcomes({ status: 'dismissed' }).map((o) => o.label)).toEqual(['Dismissed']);
    });

    it('writes its tone as a light/dark pair, never a single dark-mode shade', () => {
      const tone = inboundOutcomes({ status: 'new', cancelled_by_mark: 'x' })[0].tone;
      expect(tone).toMatch(/(^|\s)text-[a-z]+-(7|8|9)00(\s|$)/);
      expect(tone).toMatch(/dark:text-/);
    });
  });

  describe('the poller', () => {
    it('captures the cancellation AADE reports on the document itself', () => {
      expect(code(SYNC)).toContain('cancelled_by_mark');
      expect(code(SYNC)).toMatch(/pickTag\(b, 'cancelledByMark'\)/);
    });

    it('captures EVERY classification on a line, not just the first', () => {
      const src = code(SYNC);
      expect(src).toContain('expenses_classification');
      // 12 lines here carry two. `pickAllTagBlocks` is the only reader that returns both;
      // a `pickTag` would silently keep one and drop the other.
      expect(src).toMatch(/pickAllTagBlocks\(lb, 'expensesClassification'\)/);
    });
  });

  describe('every surface that could act on one', () => {
    it('gates the menu actions on the cancellation, not just the label', () => {
      const src = code(MENU);
      expect(src).toMatch(/const isCancelled = isCancelledDocument\(doc\)/);
      // Book / receive / itemise / pay — each must consult it. The label alone is decoration.
      expect(src).toMatch(/const canReceive =[^;]*!isCancelled/s);
      expect(src).toMatch(/const canAddDetail =[^;]*!isCancelled/s);
      expect(src).toMatch(/const canPay =[^;]*!isCancelled/s);
      expect(src).toMatch(/disabled=\{[^}]*isCancelled[^}]*\}/);
    });

    it('selects the column, or every client reads undefined and offers the action', () => {
      expect(code(SERVICE)).toContain("'cancelled_by_mark'");
    });
  });
});
