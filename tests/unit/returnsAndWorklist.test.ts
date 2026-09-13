/**
 * Goods coming back, and knowing what to do next.
 *
 * Two gaps at the end of the selling chain. A credit note moved money and nothing else, so a
 * returned pallet left the warehouse believing it was still gone. And the order book had filters
 * where quotes had a work queue — nothing derived "confirmed, uninvoiced and eleven days old",
 * least of all the draft pre-invoices this architecture mints on every accepted quote.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { stripComments } from '../helpers/stripComments';

const ROOT = join(__dirname, '..', '..');
const read = (p: string) => stripComments(readFileSync(join(ROOT, p), 'utf8'));

const RETURN_DLG = read('src/modules/finance/components/ReceiveReturnDialog.tsx');
const INVOICE = read('src/pages/Admin/InvoiceDetailPage.tsx');
const ORDERS = read('src/modules/finance/components/OrdersPanel.tsx');
const WORKLIST = read('src/modules/finance/components/OrderWorklistPanel.tsx');
const FINANCE_TOOL = read('supabase/functions/_shared/tools/finance-tools.ts');

describe('a return is a physical fact, stated separately from the money', () => {
  it('receiving goods back is its own action, not a side effect of the credit note', () => {
    // Most credit notes return nothing — a price correction, a discount, a billing error.
    // Inferring a stock movement from a financial document puts back goods that never arrived.
    expect(RETURN_DLG).toMatch(/rpc\('credit_note_receive_return'/);
    expect(INVOICE).toMatch(/ReceiveReturnDialog/);
  });

  it('only stocked lines can come back', () => {
    // Labour, delivery and a price adjustment are money on a credit note, never goods.
    expect(RETURN_DLG).toMatch(/filter\(\(l\) => !!l\.product_id\)/);
  });

  it('and the screen says which credit notes returned goods, rather than assuming', () => {
    expect(INVOICE).toMatch(/cn\.goods_returned_at/);
  });

  it('reports the function\'s own refusal', () => {
    // It distinguishes "already received" from "not a stock operator" from "no stocked lines".
    const submit = RETURN_DLG.slice(RETURN_DLG.indexOf('const submit'));
    expect(submit).toMatch(/\(e as Error\)\.message/);
  });
});

describe('a return can be started from the order', () => {
  it('the order offers it', () => {
    // `createCreditNote` requires an invoiceId, so the only way in was the invoice screen or the
    // global Credit Notes tab — an order had no return path at all.
    expect(ORDERS).toMatch(/Credit note \/ return/);
  });

  it('through the invoice deep link that already existed', () => {
    // ?action=credit_note is the InvoiceDetailPage convention; a second one would be a second
    // thing to keep working.
    expect(ORDERS).toMatch(/\?action=credit_note/);
    expect(INVOICE).toMatch(/action === 'credit_note'/);
  });

  it('and never against a draft', () => {
    // The credit-note picker excludes drafts, so offering one opens a dialog with nothing in it
    // and no explanation.
    expect(ORDERS).toMatch(/\['draft', 'void', 'credit_noted'\]\.includes/);
  });
});

describe('the order book says what to do next', () => {
  it('the verdict is derived, not computed on the client', () => {
    expect(WORKLIST).toMatch(/rpc\('get_order_worklist'/);
    // state / next_action / severity are read, never decided here.
    expect(WORKLIST, 'the panel assigns a severity of its own').not.toMatch(/severity\s*[:=]\s*['"`]/);
    expect(WORKLIST, 'the panel writes its own next action').not.toMatch(/next_action\s*[:=]\s*['"`]/);
  });

  it('an unreadable queue is unknown, not empty', () => {
    // Rendering nothing would read as "nothing to do", which is the one thing this exists to stop.
    expect(WORKLIST).toMatch(/Could not read the order work list/);
  });

  it('the agent can answer the same question', () => {
    expect(FINANCE_TOOL).toMatch(/rpc\('get_order_worklist'/);
    expect(FINANCE_TOOL).toMatch(/'worklist'/);
  });

  it('and an empty list is reported as a real answer', () => {
    // Orders with nothing outstanding are omitted by the derivation, so zero rows means the book
    // is clear — not that the read failed.
    expect(FINANCE_TOOL).toMatch(/Nothing on the order book is waiting on us/);
  });
});
