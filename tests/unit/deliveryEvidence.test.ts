/**
 * Proof of delivery and goods-receipt inspection (#424, #440).
 *
 * ePOD is the most universal feature in the builders-merchant vertical — 6 of 6 vendors ship it —
 * and a delivery here either happened or it did not, with no evidence either way. One idea carries
 * both halves: the FAILURE is as first-class an outcome as the success.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { stripComments } from '../helpers/stripComments';
import {
  DELIVERY_OUTCOME_LABEL, DISPOSITION_LABEL, CLAIM_RESOLUTION_LABEL,
  deliveryFellShort, outcomeNeedsPhoto, inspectionStartsClaim, quantitiesAgree,
  type DeliveryOutcome, type Disposition, type ReceiptInspection,
} from '@/modules/stock/evidenceRules';

const ROOT = join(__dirname, '..', '..');
const read = (p: string) => stripComments(readFileSync(join(ROOT, p), 'utf8'));

const service = read('src/modules/stock/services/evidenceService.ts');
const card = read('src/modules/stock/components/DeliveryEvidenceCard.tsx');
const ordersPanel = read('src/modules/finance/components/OrdersPanel.tsx');

const insp = (over: Partial<ReceiptInspection>): ReceiptInspection => ({
  id: 'i', received_quantity: null, accepted_quantity: null, rejected_quantity: null,
  disposition: null, inspected_at: '2026-09-01T00:00:00Z', notes: null, ...over,
});

describe('the failure is a first-class outcome', () => {
  it('everything but a full delivery fell short', () => {
    const outcomes: DeliveryOutcome[] = ['delivered', 'short', 'refused', 'damaged', 'failed', 'partial'];
    for (const o of outcomes) expect(DELIVERY_OUTCOME_LABEL[o]).toBeTruthy();
    expect(deliveryFellShort('delivered')).toBe(false);
    for (const o of outcomes.filter((x) => x !== 'delivered')) {
      expect(deliveryFellShort(o), `${o} should count as short`).toBe(true);
    }
  });

  it('a short delivery is evidenced by the photo, not by a note', () => {
    // A successful delivery is evidenced by the signature; the disputed one is evidenced by the
    // picture, and a note written afterwards is not the same thing.
    expect(outcomeNeedsPhoto('short')).toBe(true);
    expect(outcomeNeedsPhoto('damaged')).toBe(true);
    expect(outcomeNeedsPhoto('delivered')).toBe(false);
  });

  it('the card says so at the moment of recording, not afterwards', () => {
    expect(card).toMatch(/not by a note written[\s\S]{0,20}afterwards/);
    expect(card).toMatch(/no photograph/);
  });
});

describe('a rejected receipt starts a claim', () => {
  it('any rejected quantity does', () => {
    // Absorbing it silently is how a supplier's quality problem becomes our margin problem, with
    // no row anywhere being wrong.
    expect(inspectionStartsClaim(insp({ rejected_quantity: 12 }))).toBe(true);
    expect(inspectionStartsClaim(insp({ rejected_quantity: 0 }))).toBe(false);
    expect(inspectionStartsClaim(insp({ rejected_quantity: null }))).toBe(false);
  });

  it('breakage is its own disposition', () => {
    // Klipboard is the only vendor naming it apart from returned-saleable, and on a tile container
    // breakage is the normal case.
    const ds: Disposition[] = ['breakage', 'wrong_item', 'quality', 'shortage', 'returned_saleable'];
    for (const d of ds) expect(DISPOSITION_LABEL[d]).toBeTruthy();
    expect(DISPOSITION_LABEL.breakage).toBe('Breakage');
  });

  it('a write-off is a named outcome, not an absence of one', () => {
    expect(CLAIM_RESOLUTION_LABEL.write_off).toMatch(/We absorb it/);
    expect(CLAIM_RESOLUTION_LABEL.refund).toBeTruthy();
    expect(CLAIM_RESOLUTION_LABEL.replacement).toBeTruthy();
  });

  it('the claim is raised by the same action, not remembered later', () => {
    // CLAUDE.md: never assert on comment prose. So this reads the CODE — the claim call sits
    // inside the `inspectionStartsClaim` branch of the same handler that records the inspection.
    expect(card).toMatch(/if \(inspectionStartsClaim\(created\)\) \{[\s\S]{0,200}raiseClaim/);
  });
});

describe('an unstated quantity is not zero', () => {
  it('the split is unknown rather than wrong when a figure is missing', () => {
    // A receipt with no accepted figure is not a receipt that accepted nothing.
    expect(quantitiesAgree(insp({ received_quantity: 100, accepted_quantity: 90, rejected_quantity: 10 }))).toBe(true);
    expect(quantitiesAgree(insp({ received_quantity: 100, accepted_quantity: 90, rejected_quantity: 5 }))).toBe(false);
    expect(quantitiesAgree(insp({ received_quantity: 100, accepted_quantity: null, rejected_quantity: 10 }))).toBeNull();
    expect(quantitiesAgree(insp({}))).toBeNull();
  });
});

describe('the evidence does not stamp an invoice', () => {
  it('nothing here issues or files anything', () => {
    // Klipboard triggers invoices after picking and BisTrack on delivery. Adopting that would put
    // the myDATA filing downstream of a driver's phone on a flaky network — anti-regression rule
    // 4's create-then-stamp pair with a mobile signal in the middle.
    for (const [name, src] of [['service', service], ['card', card]] as const) {
      expect(src, `${name} issues a document`).not.toMatch(/mark_invoice_issued|issue_invoice|finance-issue-invoice/);
      expect(src, `${name} touches a fiscal submission`).not.toMatch(/fiscal_submissions|transmit/);
    }
  });

  it('it is mounted on the order, both directions', () => {
    expect(ordersPanel).toContain('DeliveryEvidenceCard');
    expect(ordersPanel).toMatch(/isPurchase=\{order\.order_type === 'purchase'\}/);
  });

  it('a failed read is unknown, not empty', () => {
    expect(card).toMatch(/not a statement that there is[\s\S]{0,20}none/);
  });
});
