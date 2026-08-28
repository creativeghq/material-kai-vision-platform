/**
 * Money Viva tells us about is recorded before it is acknowledged (#360 CB-5 … CB-9).
 *
 * Viva retries a webhook 24 times, hourly, until it gets a 2xx — so a 200 is a promise that the
 * delivery was handled, and anything lost behind one is lost permanently. Five findings, all the
 * same sentence from different angles: *money received and unbooked, with no retry and no record.*
 *
 *   CB-5 a verified, captured card payment whose intent row was missing returned 200 `ignored`
 *   CB-6 the RF sweep `continue`d past every failure into an unconditional 200
 *   CB-7 a reversal was announced (a console.error and a `.catch(() => {})` flow event) and
 *        never written down
 *   CB-8 the paid amount was never compared to the amount we asked for
 *   CB-9 no delivery dedupe outside the card path's accidental one
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { stripComments } from '../helpers/stripComments';

const ROOT = join(__dirname, '..', '..');
const raw = readFileSync(join(ROOT, 'supabase/functions/viva-webhooks/index.ts'), 'utf8').replace(/\r\n/g, '\n');
const src = stripComments(raw);

describe('#360 CB-5 — money we cannot place is still money', () => {
  it('a verified payment with no intent is recorded, not acknowledged away', () => {
    const branch = src.slice(src.indexOf('if (!intent) {'), src.indexOf('if (intent.workspace_id !== cfg.workspace_id)'));
    expect(branch).toMatch(/upsertVivaFeedRow\(/);
    expect(branch).toMatch(/matchedInvoiceId: null/);
    expect(branch, 'the unknown-order 200 is back').not.toMatch(/reason: 'unknown order'/);
  });

  it('a failed record refuses the acknowledgement so Viva retries', () => {
    const branch = src.slice(src.indexOf('if (!intent) {'), src.indexOf('if (intent.workspace_id !== cfg.workspace_id)'));
    expect(branch).toMatch(/if \(!feed\.ok\)[\s\S]{0,220}\}, 500\)/);
  });

  it('unmatched money is visible, not stamped ignored', () => {
    // `ignored` hides a row from the review queue — right for a fee we never expected to match,
    // wrong for money that arrived and could not be placed.
    expect(src).toMatch(/match_status: row\.matchedInvoiceId \? 'matched' : 'unmatched'/);
  });

  it('the feed writer can report failure at all', () => {
    // It returned void and swallowed the error, so no caller could tell whether the money had
    // been written down.
    expect(src).toMatch(/\}\): Promise<\{ ok: boolean; error\?: string \}>/);
    expect(src).toMatch(/return \{ ok: false, error: message \};/);
  });
});

describe('#360 CB-8 — the amount must be the amount we asked for', () => {
  it('the expected amount is loaded and compared', () => {
    expect(src).toMatch(/\.select\('id, invoice_id, workspace_id, method, currency, amount'\)/);
    expect(src).toMatch(/Math\.round\(expected \* 100\) !== Math\.round\(paid \* 100\)/);
  });

  it('a mismatch is not settled', () => {
    const branch = src.slice(src.indexOf('if (expected > 0 &&'), src.indexOf('const res = await recordInvoicePayment'));
    expect(branch).toMatch(/outcome: 'amount_mismatch'/);
    expect(branch, 'a mismatched payment still reaches recordInvoicePayment')
      .not.toMatch(/recordInvoicePayment/);
  });

  it('a mismatch is not thrown away either', () => {
    const branch = src.slice(src.indexOf('if (expected > 0 &&'), src.indexOf('const res = await recordInvoicePayment'));
    expect(branch).toMatch(/upsertVivaFeedRow\(/);
    expect(branch).toMatch(/paid \$\{paid\.toFixed\(2\)\}, expected/);
  });

  it('the comparison precedes the settlement', () => {
    expect(src.indexOf('Math.round(expected * 100)')).toBeLessThan(src.indexOf('const res = await recordInvoicePayment'));
  });
});

describe('#360 CB-7 — a reversal goes in the books', () => {
  it('it writes a feed row, money OUT', () => {
    const branch = src.slice(src.indexOf('EVENT_REVERSAL_CREATED) {'), src.indexOf('EVENT_ACCOUNT_TRANSACTION) {'));
    expect(branch).toMatch(/upsertVivaFeedRow\(/);
    expect(branch).toMatch(/direction: 'out'/);
    expect(branch).toMatch(/type: 'refund'/);
  });

  it('a failed write refuses the acknowledgement', () => {
    const branch = src.slice(src.indexOf('EVENT_REVERSAL_CREATED) {'), src.indexOf('EVENT_ACCOUNT_TRANSACTION) {'));
    expect(branch).toMatch(/could not record the reversal/);
  });

  it('the notification is still sent, and is still best-effort', () => {
    // The alarm matters; it is just no longer the ONLY thing that happens.
    const branch = src.slice(src.indexOf('EVENT_REVERSAL_CREATED) {'), src.indexOf('EVENT_ACCOUNT_TRANSACTION) {'));
    expect(branch).toMatch(/emitFlowEventToWorkspaceRoles\(/);
    const feed = branch.indexOf('upsertVivaFeedRow(');
    const emit = branch.indexOf('emitFlowEventToWorkspaceRoles(');
    expect(feed < emit, 'the notification is sent before the money is recorded').toBe(true);
  });

  it('the invoice is still NOT un-allocated from an unsigned message', () => {
    // Reversing settled books is the credit note's job — that part was always right.
    const branch = src.slice(src.indexOf('EVENT_REVERSAL_CREATED) {'), src.indexOf('EVENT_ACCOUNT_TRANSACTION) {'));
    expect(branch).not.toMatch(/recordInvoicePayment|payment_allocations/);
  });
});

describe('#360 CB-6 — the RF sweep does not acknowledge what it did not do', () => {
  it('failures are collected', () => {
    expect(src).toMatch(/const failures: string\[\] = \[\]/);
    expect(src).toMatch(/failures\.push\(`\$\{intent\.provider_order_code\}: \$\{res\.error\}`\)/);
  });

  it('an incomplete sweep answers 500', () => {
    expect(src).toMatch(/if \(failures\.length > 0\)[\s\S]{0,200}\}, 500\)/);
  });

  it('every failure path records itself', () => {
    const fn = src.slice(src.indexOf('async function settlePendingRfOrders'));
    for (const marker of ['retrieve failed', 'feed row not written', 'intent not marked paid']) {
      expect(fn, marker).toContain(marker);
    }
  });
});

describe('#360 CB-9 — one delivery, one processing', () => {
  it('the delivery is claimed before anything acts on it', () => {
    const claim = src.indexOf("from('payment_webhook_events').insert(");
    const ctx = src.indexOf('const ctx = ctxFromConfig(cfg);');
    expect(claim).toBeGreaterThan(-1);
    expect(claim < ctx, 'the handler acts before it claims the delivery').toBe(true);
  });

  it('only a FINISHED delivery short-circuits a duplicate', () => {
    // The trap in the obvious version: if any duplicate short-circuits, a delivery that failed
    // and answered 500 is claimed forever, and Viva's retry — the thing meant to recover it —
    // gets acknowledged as "already processed". The dedupe would make the failure permanent.
    expect(src).toMatch(/status\?: string \} \| null\)\?\.status === 'done'/);
    expect(src).toMatch(/update\(\{ status: 'processing'/);
  });

  it('a claim that cannot be written stops the handler', () => {
    expect(src).toMatch(/could not claim the delivery/);
  });

  it('every terminal path settles the claim', () => {
    // A row stuck at `processing` should mean a run that died, not a run that finished quietly.
    for (const outcome of ['payment_failed', 'rf_sweep', 'not_settled', 'no_order_code',
                           'unmatched_receipt', 'amount_mismatch', 'settled', 'reversal_recorded']) {
      expect(src, outcome).toContain(outcome);
    }
  });

  it('a non-2xx from the RF sweep settles as failed, not done', () => {
    expect(src).toMatch(/rf\.status < 300 \? 'done' : 'failed'/);
  });
});

describe('#360 — the security model note still stands', () => {
  it('money still comes from the read-back, never from the POST body', () => {
    // Everything above adds record-keeping; none of it may start trusting the delivery.
    expect(raw).toMatch(/THE WEBHOOK IS A TRIGGER, NEVER DATA/);
    expect(src).toMatch(/retrieveVivaTransaction\(/);
    expect(src).toMatch(/amount: tx\.amount/);
  });
});
