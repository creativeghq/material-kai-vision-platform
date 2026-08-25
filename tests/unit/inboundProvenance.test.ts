/**
 * Issue #377 — the Expenses Inbox reads two inlets and must not lie about either.
 *
 * Every case here is a WRONG NUMBER OR LABEL THAT RENDERS PERFECTLY WELL. A reverse-charged VAT
 * figure is a valid number, our own ΑΦΜ is a valid document number, and a payroll document is a
 * valid supplier bill as far as any type or constraint is concerned. None of these can be caught
 * by typecheck, by a DB constraint, or by an integrity probe over stored data — the stored data
 * is flawless in all of them. So they are caught here.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import {
  INBOUND_SOURCE_CHIP,
  docFamily,
  inboundDetailLabel,
  inboundDocumentNumber,
  inboundSourceLabel,
  invoicedTotal,
  isPayrollDocument,
  isReverseCharged,
  needsLineDetail,
  selfAccountedVat,
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

describe('what a human is shown as the cost', () => {
  it('shows the net on a reverse-charged purchase, never AADE gross', () => {
    // KEROS billed 1,126.22 and their paper says 1,126.22. myDATA's totalGrossValue is 1,396.51
    // because it adds the 270.29 of Greek VAT WE self-assess — an artefact of our own accounting
    // entry, not a figure on anything the supplier sent, and not money that will ever move.
    // Printing it is the display-layer twin of booking gross into payables.
    expect(invoicedTotal(KEROS)).toBe(1126.22);
    expect(invoicedTotal(KEROS)).not.toBe(KEROS.total_gross);
  });

  it('shows the gross on an ordinary domestic document, where the VAT really is owed', () => {
    const domestic = { doc_type: '1.1', total_net: 1000, total_gross: 1240 };
    expect(invoicedTotal(domestic)).toBe(1240);
  });

  it('does not invent a total when the document states none', () => {
    expect(invoicedTotal({ doc_type: '14.1', total_net: null, total_gross: 999 })).toBe(0);
    expect(invoicedTotal({ doc_type: '1.1', total_net: 100, total_gross: null })).toBe(0);
  });

  it('keeps the self-assessed VAT reachable rather than deleting it', () => {
    // It belongs on the VAT return — it is withheld from the COST, not from the record.
    expect(selfAccountedVat(KEROS)).toBe(270.29);
    // On an ordinary document there is no such thing: null means "this VAT is genuinely owed".
    expect(selfAccountedVat({ doc_type: '1.1', total_vat: 240 })).toBeNull();
  });

  it('rent and payroll keep their gross — neither is reverse-charged', () => {
    expect(invoicedTotal({ doc_type: '16.1', total_net: 400, total_gross: 400 })).toBe(400);
    expect(invoicedTotal({ doc_type: '17.1', total_net: 30846, total_gross: 30846 })).toBe(30846);
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

describe('the inbox is ordered by the date it SHOWS', () => {
  const src = readFileSync(
    join(process.cwd(), 'src/modules/finance/services/inboundService.ts'), 'utf8',
  );

  it('orders by issue_date, not by when we happened to fetch the row', () => {
    // `created_at` and `issue_date` agree only while a single inlet polls daily. The first
    // RequestTransmittedDocs run inserted 87 documents spanning 2024-02 to 2026-06 within one
    // second, so ordering by created_at put all of them ahead of every supplier invoice and
    // buried the inbox under four and a half pages of backfill. Nothing was misfiled; the list
    // was answering "most recently fetched" to a question nobody asked. Any future inlet that
    // backfills history — email, upload, Peppol — re-creates this the same way.
    const list = src.slice(src.indexOf('async list('), src.indexOf('async setLines('));
    expect(list).toMatch(/\.order\(\s*'issue_date'/);
    const issueAt = list.indexOf("order('issue_date'");
    const createdAt = list.indexOf("order('created_at'");
    expect(issueAt).toBeGreaterThan(-1);
    // created_at may remain as the tie-break, but never as the primary sort.
    if (createdAt > -1) expect(issueAt).toBeLessThan(createdAt);
  });

  it('reports the total so a capped list cannot pass for a complete one', () => {
    // A list that stops at its limit looks exactly like a list that short. The cap has to be
    // visible to the operator, or "my 2024 invoices are missing" is the next bug report.
    const list = src.slice(src.indexOf('async list('), src.indexOf('async setLines('));
    expect(list).toMatch(/count:\s*'exact'/);
    expect(list).toMatch(/total/);
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
