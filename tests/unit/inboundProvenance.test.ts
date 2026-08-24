/**
 * Issue #377 — the Expenses Inbox reads two inlets and must not lie about either.
 *
 * Every case here is a WRONG NUMBER OR LABEL THAT RENDERS PERFECTLY WELL. A reverse-charged VAT
 * figure is a valid number, our own ΑΦΜ is a valid document number, and a payroll document is a
 * valid supplier bill as far as any type or constraint is concerned. None of these can be caught
 * by typecheck, by a DB constraint, or by an integrity probe over stored data — the stored data
 * is flawless in all of them. So they are caught here.
 */
import { describe, it, expect } from 'vitest';
import {
  INBOUND_SOURCE_CHIP,
  docFamily,
  inboundDetailLabel,
  inboundDocumentNumber,
  inboundSourceLabel,
  isPayrollDocument,
  isReverseCharged,
  needsLineDetail,
} from '@/modules/finance/utils/inboundProvenance';

/** The real KEROS CERAMICA document, MARK 400014425265085, 2026-06-22. */
const KEROS = {
  source: 'mydata_self',
  doc_type: '14.1',
  series: '802349569 - 0', // OUR ΑΦΜ, not theirs
  aa: '43661',             // a counter we assigned ourselves
  total_net: 1126.22,
  total_vat: 270.29,
  total_gross: 1396.51,
  lines_source: 'none',
};

/** A Greek supplier invoice that arrived on RequestDocs with real line detail. */
const GREEK = {
  source: 'mydata',
  doc_type: '1.1',
  series: 'ΤΔΑ',
  aa: '5160',
  lines_source: 'mydata',
};

describe('reverse charge is never a payable', () => {
  it('flags 13.x and 14.x, and nothing else', () => {
    for (const t of ['13.1', '13.30', '14.1', '14.2', '14.3', '14.4', '14.5']) {
      expect(isReverseCharged(t), t).toBe(true);
    }
    // 1.x/2.x domestic really do owe the VAT; 16.1 rent is domestic; 11.x retail is ours.
    for (const t of ['1.1', '1.2', '2.1', '2.2', '3.1', '11.1', '16.1', '17.1', '5.1', '9.3']) {
      expect(isReverseCharged(t), t).toBe(false);
    }
  });

  it('does not mistake 1.4 or 4.x for a 14.x on a string prefix', () => {
    // `startsWith('14')` would be true for none of these, but `startsWith('1')` and a sloppy
    // `includes('14')` both go wrong here — 4.1 is a self-billing type, 1.4 does not exist but a
    // typo in the data must not silently reverse-charge a domestic invoice.
    expect(isReverseCharged('1.4')).toBe(false);
    expect(isReverseCharged('4.1')).toBe(false);
    expect(isReverseCharged('140.1')).toBe(false);
  });

  it('treats a missing or malformed type as NOT reverse-charged', () => {
    // Fail towards the domestic reading: booking gross on a foreign document overstates payables
    // by the VAT, but booking net on a domestic one UNDERSTATES what we owe a supplier who will
    // absolutely come asking. Neither is good; only one leaves the supplier short.
    expect(isReverseCharged(null)).toBe(false);
    expect(isReverseCharged(undefined)).toBe(false);
    expect(isReverseCharged('')).toBe(false);
  });

  it('the KEROS payable is the net, not the gross', () => {
    expect(isReverseCharged(KEROS.doc_type)).toBe(true);
    // What the table must NOT present as owed. 1396.51 - 1126.22 = 270.29 of VAT that never moves.
    expect(KEROS.total_gross - KEROS.total_net).toBeCloseTo(KEROS.total_vat, 2);
  });
});

describe('payroll is never a supplier bill', () => {
  it('flags 17.x only', () => {
    expect(isPayrollDocument('17.1')).toBe(true);
    expect(isPayrollDocument('17.5')).toBe(true);
    expect(isPayrollDocument('16.1')).toBe(false); // rent IS a real payable, to a landlord
    expect(isPayrollDocument('14.1')).toBe(false);
    expect(isPayrollDocument('1.1')).toBe(false);
  });
});

describe('a self-transmitted document has no supplier invoice number', () => {
  it('refuses to print our own ΑΦΜ as the number', () => {
    // This is the whole point: `series` here is 802349569 — our VAT number — and `aa` is a
    // counter we allocated. Rendering "802349569 - 0 43661" gives the operator something to
    // reconcile against the supplier's statement that will never, ever match.
    expect(inboundDocumentNumber(KEROS)).toBeNull();
  });

  it('still prints a real supplier number when there is one', () => {
    expect(inboundDocumentNumber(GREEK)).toBe('ΤΔΑ 5160');
  });

  it('treats an absent source as the received-docs inlet', () => {
    // Rows written before Phase 0 backfilled, and any read that forgets to select the column.
    expect(inboundDocumentNumber({ series: 'ΤΠΥ', aa: '12' })).toBe('ΤΠΥ 12');
  });

  it('returns null rather than a stray fragment when the document names nothing', () => {
    expect(inboundDocumentNumber({ source: 'mydata', series: null, aa: null })).toBeNull();
    expect(inboundDocumentNumber({ source: 'mydata', series: '  ', aa: '' })).toBeNull();
    // Only one half present is still a number worth showing.
    expect(inboundDocumentNumber({ source: 'mydata', series: null, aa: '5160' })).toBe('5160');
  });
});

describe('provenance and line-detail are separate facts', () => {
  it('the source chip is permanent and the detail chip is not', () => {
    // A 14.x whose lines have been typed in is STILL "Entered in myAADE" — that is what tells the
    // reader the totals are an AADE anchor and the lines are ours. Only the detail state moves.
    const completed = { ...KEROS, lines_source: 'user' };
    expect(INBOUND_SOURCE_CHIP[completed.source as 'mydata_self']).toBe('Entered in myAADE');
    expect(needsLineDetail(KEROS)).toBe(true);
    expect(needsLineDetail(completed)).toBe(false);
  });

  it('gives the ordinary supplier-filed document no chip at all', () => {
    // 1,769 of 1,769 rows are this one today. A chip on every row is a chip on no row.
    expect(INBOUND_SOURCE_CHIP.mydata).toBeUndefined();
  });

  it('withholds the line editor from a document whose lines carry a MARK', () => {
    // A 1.1's lines were transmitted by the supplier under their own MARK. Rewriting them makes
    // our records diverge from the tax record, so the editor is offered on `none` and only `none`.
    expect(needsLineDetail(GREEK)).toBe(false);
    expect(needsLineDetail({ lines_source: 'document' })).toBe(false);
    // Missing column reads as "needs detail" — fail towards asking a human, not towards
    // pretending a document is complete.
    expect(needsLineDetail({})).toBe(true);
  });

  it('words both axes for the operator, not for the enum', () => {
    expect(inboundSourceLabel('mydata')).toBe('From supplier (myDATA)');
    expect(inboundSourceLabel('mydata_self')).toBe('Entered in myAADE');
    expect(inboundSourceLabel(null)).toBe('From supplier (myDATA)');
    expect(inboundDetailLabel('none')).toBe('Needs detail');
    // Typed by hand and read off an attached PDF are the same fact to the reader: it is done.
    expect(inboundDetailLabel('user')).toBe(inboundDetailLabel('document'));
    expect(inboundDetailLabel(null)).toBe('Needs detail');
  });
});

describe('docFamily', () => {
  it('splits on the dot and nothing else', () => {
    expect(docFamily('14.1')).toBe('14');
    expect(docFamily('1.1')).toBe('1');
    expect(docFamily('17')).toBe('17');
    expect(docFamily(null)).toBe('');
  });
});
