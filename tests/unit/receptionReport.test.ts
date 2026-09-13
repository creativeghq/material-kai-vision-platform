/**
 * Back-to-back ordering, and who gets the pallet (#433).
 *
 * Roughly a third of merchant lines are non-stock specials, so at order entry "what is my stock
 * level" is the wrong question — the right one is what is on an inbound PO and unallocated.
 * `receive_order_lines` moved the goods in and nothing decided whose they were.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { stripComments } from '../helpers/stripComments';
import {
  hasClaims, claimsOldestFirst, claimedQuantity, linkIsSevered,
  type ReceptionReport, type ReceptionLine, type ReceptionClaim,
} from '@/modules/stock/receptionRules';

const ROOT = join(__dirname, '..', '..');
const read = (p: string) => stripComments(readFileSync(join(ROOT, p), 'utf8'));

const service = read('src/modules/stock/services/receptionService.ts');
const card = read('src/modules/stock/components/ReceptionReportCard.tsx');
const ordersPanel = read('src/modules/finance/components/OrdersPanel.tsx');

const claim = (over: Partial<ReceptionClaim>): ReceptionClaim => ({
  sales_order_id: 'so', order_number: 'SO-1', sales_item_id: 'si',
  quantity: 40, outstanding: 40, confirmed_at: '2026-03-01T00:00:00Z',
  already_linked: false, linked_to_this: false, pool_id: null, ...over,
});

const line = (over: Partial<ReceptionLine>): ReceptionLine =>
  ({ purchase_item_id: 'pi', description: 'tile', ordered: 40, received: 0, claims: [], ...over });

describe('nobody waiting is an answer, not an absence', () => {
  it('only `claims` has somebody to allocate to', () => {
    expect(hasClaims({ status: 'claims', reason: '' } as ReceptionReport)).toBe(true);
    // It means the goods go to free stock, which is a decision rather than a gap.
    expect(hasClaims({ status: 'nobody_waiting', reason: '' } as ReceptionReport)).toBe(false);
    expect(hasClaims(null)).toBe(false);
  });
});

describe('oldest confirmed first, and that is not a UI preference', () => {
  it('claims sort by when the sale was confirmed', () => {
    // A newer order jumping the queue because somebody opened it first is the unfairness this
    // ordering exists to prevent.
    const l = line({
      claims: [
        claim({ sales_item_id: 'new', confirmed_at: '2026-06-01T00:00:00Z' }),
        claim({ sales_item_id: 'old', confirmed_at: '2026-01-15T00:00:00Z' }),
        claim({ sales_item_id: 'mid', confirmed_at: '2026-03-01T00:00:00Z' }),
      ],
    });
    expect(claimsOldestFirst(l).map((c) => c.sales_item_id)).toEqual(['old', 'mid', 'new']);
  });

  it('an empty line sorts to nothing rather than throwing', () => {
    expect(claimsOldestFirst(line({}))).toEqual([]);
    expect(claimsOldestFirst(null)).toEqual([]);
  });
});

describe('what is spoken for counts the OUTSTANDING quantity', () => {
  it('only lines assigned to this receipt count, and only what they still need', () => {
    // A sales line half-delivered already wants the other half, not the whole original order.
    const l = line({
      claims: [
        claim({ sales_item_id: 'a', outstanding: 10, linked_to_this: true }),
        claim({ sales_item_id: 'b', outstanding: 25, linked_to_this: true }),
        claim({ sales_item_id: 'c', outstanding: 100, linked_to_this: false }),
      ],
    });
    expect(claimedQuantity(l)).toBe(35);
    expect(claimedQuantity(line({}))).toBe(0);
    expect(claimedQuantity(null)).toBe(0);
  });
});

describe('a severed link is a fact, not a hole', () => {
  it('the line still reads as waiting on something', () => {
    // Odoo severs the link on a cancelled RFQ and nothing replaces it, so the sales line looks
    // satisfied. A recorded severance is how a screen tells the two apart.
    expect(linkIsSevered({ link_severed_at: '2026-06-01T00:00:00Z' })).toBe(true);
    expect(linkIsSevered({ link_severed_at: null })).toBe(false);
    expect(linkIsSevered({})).toBe(false);
  });

  it('releasing passes a reason rather than a null', () => {
    expect(service).toMatch(/unassigned from this receipt|p_reason/);
    expect(card).toMatch(/unassigned from this receipt/);
  });
});

describe('it is derived in SQL and reachable on the receipt', () => {
  it('the service reads the derivations', () => {
    expect(service).toContain('reception_report');
    expect(service).toContain('link_sales_line_to_purchase');
  });

  it('nothing re-sorts or re-allocates in the client beyond the stated rule', () => {
    expect(card).not.toMatch(/sort\(\(a, b\) =>/);
  });

  it('it appears on a purchase order and not on a sale', () => {
    expect(ordersPanel).toContain('ReceptionReportCard');
    expect(ordersPanel).toMatch(/order\.order_type === 'purchase' && \(\s*\n?\s*<div className="mt-4">\s*\n?\s*<ReceptionReportCard/);
  });

  it('a failed read is unknown, not "nobody is waiting"', () => {
    expect(card).toMatch(/not a statement that nobody is[\s\S]{0,20}waiting for this/);
  });
});
