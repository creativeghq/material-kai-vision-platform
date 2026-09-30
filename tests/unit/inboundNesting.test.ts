import { describe, expect, it } from 'vitest';
import { hasLinkedDelivery, nestDeliveryNotes } from '@/modules/finance/utils/inboundNesting';
import type { InboundLinkSummary } from '@/modules/finance/utils/inboundCorrelation';

const link = (over: Partial<InboundLinkSummary>): InboundLinkSummary => ({
  doc_id: 'x', status: 'linked', other_doc_id: 'y', other_mark: 'm', other_label: '', other_doc_type: '1.1',
  other_total_gross: 0, other_line_count: 0, other_is_held: true, relation: 'invoiced_by', link_id: 'l',
  link_source: 'derived', confidence: 1, reason: null, alternatives: 0, other_claimants: 0, ...over,
});

describe('a linked ΔΑ folds under its invoice', () => {
  it('nests a linked delivery note under an invoice in the same list', () => {
    const rows = [{ id: 'inv' }, { id: 'dn' }, { id: 'other' }];
    const { top, nested } = nestDeliveryNotes(rows, {
      dn: link({ doc_id: 'dn', other_doc_id: 'inv' }),
      inv: link({ doc_id: 'inv', other_doc_id: 'dn', relation: 'itemised_by' }),
    });
    expect(top.map((r) => r.id)).toEqual(['inv', 'other']);
    expect(nested.inv.map((r) => r.id)).toEqual(['dn']);
  });

  it('keeps a ΔΑ top-level when its invoice is not in the list', () => {
    const { top } = nestDeliveryNotes([{ id: 'dn' }], { dn: link({ doc_id: 'dn', other_doc_id: 'elsewhere' }) });
    expect(top.map((r) => r.id)).toEqual(['dn']);
  });

  it('never nests on a mere suggestion', () => {
    const rows = [{ id: 'inv' }, { id: 'dn' }];
    const { top } = nestDeliveryNotes(rows, { dn: link({ doc_id: 'dn', other_doc_id: 'inv', status: 'suggested' }) });
    expect(top).toHaveLength(2);
    expect(hasLinkedDelivery(link({ status: 'suggested' }))).toBe(false);
  });
});
