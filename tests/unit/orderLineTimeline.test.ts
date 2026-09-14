/**
 * An order line gets a status ladder, eight dates and a fulfilment mode (#432, #434).
 *
 * A line had quantities and no status, and for a kitchen or bathroom job the status is what the
 * customer is actually asking about. `damaged` is a first-class outcome, not a note — on tile it
 * is the common case, and it has to reach a supplier claim.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { stripComments } from '../helpers/stripComments';
import {
  LINE_LADDER, LINE_STATUS_LABEL, FULFILMENT_LABEL, LINE_DATE_FIELDS, BUCKET_LABEL,
  lineIsUndated, isTerminalStatus, needsSupplierClaim, ladderPosition,
  type QueueRow, type FulfilmentType,
} from '@/modules/finance/orderLineRules';

const ROOT = join(__dirname, '..', '..');
const read = (p: string) => stripComments(readFileSync(join(ROOT, p), 'utf8'));

const service = read('src/modules/finance/services/orderLineService.ts');
const timeline = read('src/modules/finance/components/OrderLineTimelineCard.tsx');
const queue = read('src/modules/finance/components/LineWorkQueueCard.tsx');
const lost = read('src/modules/finance/components/LostSaleDialog.tsx');
const pos = read('src/modules/finance/pages/PosPage.tsx');
const planning = read('src/modules/finance/tabs/PlanningTab.tsx');
const ordersPanel = read('src/modules/finance/components/OrdersPanel.tsx');

const row = (over: Partial<QueueRow>): QueueRow => ({
  order_item_id: 'i', description: 'vanity', order_number: 'SO-1', order_type: 'sales',
  line_status: 'ordered', tracking_reference: null, due_on: '2026-10-01', bucket: 'later', ...over,
});

describe('both sides of the money timeline sit on the line', () => {
  it('all eight dates exist, four logistics and four money', () => {
    // A kitchen is paid in stages by the customer and in stages to the supplier, and those
    // schedules do not align. Today nothing on the line knew either.
    expect(LINE_DATE_FIELDS).toHaveLength(8);
    expect(LINE_DATE_FIELDS.filter((f) => f.side === 'money')).toHaveLength(4);
    expect(LINE_DATE_FIELDS.filter((f) => f.side === 'logistics')).toHaveLength(4);
    const keys = LINE_DATE_FIELDS.map((f) => f.key);
    expect(keys).toContain('client_deposit_on');
    expect(keys).toContain('supplier_deposit_on');
    expect(keys).toContain('client_balance_on');
    expect(keys).toContain('supplier_balance_on');
  });

  it('the card says a blank date is not a guess', () => {
    expect(timeline).toMatch(/never a guess derived[\s\S]{0,30}from another date/);
  });
});

describe('damaged is an outcome, not a note', () => {
  it('it takes the line off the ladder and asks for a claim', () => {
    // On tile it is the common case, and absorbing it as a quantity adjustment leaves no trace of
    // what actually happened.
    expect(LINE_LADDER).not.toContain('damaged');
    expect(LINE_LADDER).not.toContain('cancelled');
    expect(needsSupplierClaim('damaged')).toBe(true);
    expect(needsSupplierClaim('delivered')).toBe(false);
    expect(needsSupplierClaim(null)).toBe(false);
    expect(isTerminalStatus('damaged')).toBe(true);
    expect(isTerminalStatus('installed')).toBe(true);
    expect(isTerminalStatus('shipped')).toBe(false);
  });

  it('the ladder reads in order and an outcome has no position on it', () => {
    expect(ladderPosition('specified')).toBe(0);
    expect(ladderPosition('installed')).toBe(LINE_LADDER.length - 1);
    expect(ladderPosition('damaged')).toBeNull();
    expect(ladderPosition(null)).toBeNull();
    for (const s of LINE_LADDER) expect(LINE_STATUS_LABEL[s]).toBeTruthy();
  });

  it('the card names the consequence', () => {
    expect(timeline).toMatch(/not a quantity adjustment/);
  });
});

describe('a line with no date is its own bucket', () => {
  it('undated is not "later"', () => {
    // Nothing can be late if nothing was promised, and sorting it to the bottom of "later" makes
    // it read as comfortable.
    expect(lineIsUndated(row({ bucket: 'undated' }))).toBe(true);
    expect(lineIsUndated(row({ bucket: 'later' }))).toBe(false);
    expect(BUCKET_LABEL.undated).toMatch(/No date promised/);
  });

  it('the queue shows undated ahead of later', () => {
    const order = queue.match(/const ORDER: QueueBucket\[\] = \[([^\]]+)\]/)?.[1] ?? '';
    expect(order.indexOf('undated')).toBeGreaterThan(-1);
    expect(order.indexOf('undated')).toBeLessThan(order.indexOf('later'));
  });
});

describe('fulfilment is per LINE', () => {
  it('all five counter modes exist', () => {
    // One ticket, goods taken, goods delivered and goods returned — which is what a trade counter
    // actually is, and why this is not a property of the document.
    const modes: FulfilmentType[] = ['collect_now', 'delivered', 'direct_order', 'quotation', 'credit'];
    for (const m of modes) expect(FULFILMENT_LABEL[m]).toBeTruthy();
    expect(Object.keys(FULFILMENT_LABEL)).toHaveLength(5);
  });

  it('the line editor offers them', () => {
    expect(timeline).toContain('setFulfilment');
    expect(ordersPanel).toContain('OrderLineTimelineCard');
  });
});

describe('marking complete keeps the date it was late against', () => {
  it('the service stamps a completion rather than clearing the date', () => {
    expect(service).toContain('completed_at');
    expect(service).not.toMatch(/delivery_on: null.*markComplete|markComplete[\s\S]{0,200}delivery_on: null/);
  });
});

describe('a walk-away is recorded where it happens', () => {
  it('the counter can capture it from the shift bar', () => {
    expect(pos).toContain('LostSaleDialog');
    expect(pos).toMatch(/Asked for something we had not got/);
  });

  it('the dialog says why ten seconds is worth it', () => {
    expect(lost).toMatch(/Nothing else in the system will ever know/);
  });

  it('the churn signal is stated as unraisable by anything else', () => {
    expect(queue).toMatch(/leaves no defective record anywhere/);
  });

  it('it is reachable where late work is reviewed', () => {
    expect(planning).toContain('LineWorkQueueCard');
  });
});
