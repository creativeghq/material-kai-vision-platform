/**
 * A ΔΑ and the ΤΙΜ that bills it — one purchase, two documents, and every way of joining them
 * that renders perfectly well while being wrong.
 *
 * myDATA is REQUIRED to file the pair as two documents: a delivery note is not a tax document, so
 * it carries the items at zero money, and the invoice carries the money with its itemisation
 * collapsed to one value-only line. Both rows are individually correct. The failures live entirely
 * in how they are JOINED, and none of them can be caught by a typecheck, a constraint or an
 * integrity probe over stored data, because in all of them the stored data is flawless:
 *
 *   - A 0.25-confidence coincidence rendered in the same words as the issuer's own declaration.
 *   - The invoice's €626.44 shown in the delivery note's money column, which is summed, so the
 *     supplier's spend doubles while every individual figure stays right.
 *   - An invoice total divided by the line count to fill in a per-item cost that nobody stated.
 *   - A cited MARK we do not hold, dropped from the list, so "correlated with a document we have
 *     not received" renders identically to "not correlated with anything".
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import {
  INBOUND_LINE_COST_NOTE,
  INBOUND_LINK_SOURCE_LABEL,
  correlationCellLabel,
  type InboundLinkSummary,
} from '@/modules/finance/utils/inboundCorrelation';

const ROOT = join(__dirname, '..', '..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

/** The real pair: ALKYON ΤΙΜ 2734 (400015177151096) and ΔΑ 2944 (400015175778744), 2026-09-08. */
const base: InboundLinkSummary = {
  doc_id: 'e6e3ae86-5121-4925-b283-0df549c63065',
  status: 'suggested',
  other_doc_id: '57aa1e5a-e9e1-46ef-bcb7-735fb1106fdf',
  other_mark: '400015175778744',
  other_label: 'ΔΑ 2944',
  other_doc_type: '9.3',
  other_total_gross: 0,
  other_line_count: 2,
  other_is_held: true,
  relation: 'itemised_by',
  link_id: '1cc7fb14-12dc-441c-acb9-b271543c4f0c',
  link_source: 'derived',
  confidence: 0.95,
  reason: 'Only invoice from this supplier carrying the same dispatch date (2026-09-08).',
  alternatives: 0,
};

const link = (over: Partial<InboundLinkSummary> = {}): InboundLinkSummary => ({ ...base, ...over });

describe('a guess never renders as a fact', () => {
  it('asks a question when nobody has confirmed the match', () => {
    const cell = correlationCellLabel(link({ status: 'suggested' }))!;
    expect(cell.actionable).toBe(true);
    expect(cell.text).toMatch(/\?$/);
    // The evidence travels with the question. A bare "ΔΑ 2944?" gives the operator nothing to
    // rule on, and they will click yes because it is the only thing on offer.
    expect(cell.title).toContain('dispatch date');
    expect(cell.title).toContain('not confirmed');
  });

  it('states it plainly once somebody stands behind it', () => {
    for (const source of ['aade', 'user'] as const) {
      const cell = correlationCellLabel(link({ status: 'linked', link_source: source }))!;
      expect(cell.actionable).toBe(false);
      expect(cell.text).not.toMatch(/\?$/);
      expect(cell.text).toContain('ΔΑ 2944');
      // WHO says so is on the record, because "AADE declared it" and "somebody here clicked yes"
      // are different warranties and the operator is entitled to know which one they have.
      expect(cell.title).toContain(INBOUND_LINK_SOURCE_LABEL[source]);
    }
  });

  it('never gives a confirmed and an unconfirmed link the same wording', () => {
    const guessed = correlationCellLabel(link({ status: 'suggested' }))!;
    const settled = correlationCellLabel(link({ status: 'linked', link_source: 'aade' }))!;
    expect(guessed.text).not.toBe(settled.text);
  });

  it('says how many other candidates there are, so one-of-four is not read as the answer', () => {
    const cell = correlationCellLabel(link({ alternatives: 3 }))!;
    expect(cell.title).toContain('4 candidates');
  });
});

describe('the delivery note keeps its own zero', () => {
  /**
   * The obvious fix for a ΔΑ row reading €0.00 is to show the invoice's total there. It is double
   * counting: the money column is summed, and the €626.44 already sits on the ΤΙΜ row. So the
   * correlation is allowed to NAME the invoice and never to restate its amount as this row's.
   */
  it('names the invoice without putting its money in the delivery note cell', () => {
    const cell = correlationCellLabel(link({
      doc_id: base.other_doc_id!, relation: 'invoiced_by', status: 'linked', link_source: 'aade',
      other_label: 'ΤΙΜ 2734', other_doc_type: '1.1', other_total_gross: 626.44, other_line_count: 1,
    }))!;
    expect(cell.text).toContain('ΤΙΜ 2734');
    expect(cell.text).not.toContain('626.44');
    // The amount may be explained in the tooltip, where nothing sums it.
    expect(cell.title).toContain('626.44');
  });
});

describe('an unheld MARK is an answer, not an absence', () => {
  it('reports a cited document we never received rather than rendering as uncorrelated', () => {
    const cell = correlationCellLabel(link({ other_is_held: false, other_doc_id: null }))!;
    expect(cell).not.toBeNull();
    expect(cell.text).toContain('400015175778744');
    expect(cell.actionable).toBe(false);
    expect(cell.title).toContain('not received');
  });

  it('falls through to the caller when there is no correlation at all', () => {
    // `null`, not a third invented state — the column already has "Needs detail" and "—".
    expect(correlationCellLabel(undefined)).toBeNull();
  });
});

describe('per-item cost from a delivery note is unknown, never zero', () => {
  it('carries a note explaining that only the document total is real', () => {
    expect(INBOUND_LINE_COST_NOTE.unallocated).toBeTruthy();
    expect(INBOUND_LINE_COST_NOTE.unallocated).toMatch(/not stated/i);
    expect(INBOUND_LINE_COST_NOTE.stated).toBeNull();
  });

  /**
   * The arithmetic that must never appear: 505.19 over two zero-valued delivery-note lines. Net
   * share divides by zero; an even split invents 252.60 twice. Both are valid numbers that reach
   * stock valuation, and nothing downstream can tell them from a price somebody actually paid.
   */
  it('never derives a per-line cost from a document total anywhere in the correlation code', () => {
    for (const file of [
      'src/modules/finance/utils/inboundCorrelation.ts',
      'src/modules/finance/components/InboundDetailCell.tsx',
    ]) {
      const src = read(file);
      expect(src).not.toMatch(/total_gross\s*\/\s*/);
      expect(src).not.toMatch(/total_net\s*\/\s*/);
      expect(src).not.toMatch(/\/\s*(?:lines\.length|other_line_count)/);
    }
  });
});

describe('one cell, not one per table', () => {
  /**
   * Both tables carried byte-identical copies of the "Needs detail" span before this. That is how
   * the wording for the other three states ends up living in two places on the first edit — and
   * the two tables are the inbox and the supplier's own document list, which operators compare.
   */
  it('routes both inbound tables through the shared component', () => {
    for (const file of [
      'src/modules/finance/pages/DocumentsPage.tsx',
      'src/modules/finance/components/SupplierInboundDocs.tsx',
    ]) {
      const src = read(file);
      expect(src).toContain('<InboundDetailCell');
      // No re-inlined copy of the cell's own wording. Matched on the RENDERED form (`>Needs
      // detail<`), so a comment explaining what the cell falls back to is not mistaken for one.
      expect(src).not.toMatch(/>\s*Needs detail\s*</);
    }
    expect(read('src/modules/finance/components/InboundDetailCell.tsx')).toMatch(/>\s*Needs detail\s*</);
  });
});
