/**
 * The selling chain has to be walkable in the product, not just in the schema.
 *
 * Every defect this guards was the same shape: the engine existed, the link existed in the
 * database, and there was no way to reach it from the screen an operator works on. None of them
 * failed — a quote you cannot accept and an order you cannot dispatch both look like an empty
 * list, which is indistinguishable from having no work to do.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { stripComments } from '../helpers/stripComments';

const ROOT = join(__dirname, '..', '..');
const read = (p: string) => stripComments(readFileSync(join(ROOT, p), 'utf8'));

const DISPATCH_SVC = read('src/modules/finance/services/deliveryNotesService.ts');
const BOARD = read('src/modules/finance/components/DispatchBoard.tsx');
const QUOTE_ADMIN = read('src/modules/quotes/pages/QuoteDetailAdminPage.tsx');
const ORDERS = read('src/modules/finance/components/OrdersPanel.tsx');
const INVOICE = read('src/pages/Admin/InvoiceDetailPage.tsx');
const QUOTE_LINES = read('src/modules/quotes/components/QuoteItemsList.tsx');

describe('you can dispatch what you sold on terms', () => {
  const queue = DISPATCH_SVC.slice(DISPATCH_SVC.indexOf('async listDispatchQueue'));

  it('the board does not gate on the money being in', () => {
    // Building materials sell on 30/60-day terms. `status='paid'` made the board structurally
    // empty for every such sale — and an empty board reads as "nothing to ship today".
    expect(queue, 'the dispatch queue filters on paid again').not.toMatch(/\.eq\('status', 'paid'\)/);
  });

  it('but it still says whether the money is in', () => {
    // Removing the filter without surfacing the fact would just move the mistake: the warehouse
    // would ship unpaid orders with no signal. Holding a delivery is a decision, not a default.
    expect(DISPATCH_SVC).toMatch(/payment_status: /);
    expect(DISPATCH_SVC).toMatch(/is_paid: /);
    expect(BOARD).toMatch(/o\.is_paid/);
  });

  it('and a cancelled document is not a delivery', () => {
    expect(queue).toMatch(/\.not\('status', 'in', '\(void,draft\)'\)/);
  });
});

describe('a quote can be closed from the screen an operator uses', () => {
  it('the admin quote page can accept', () => {
    // acceptQuote had three callers and all three were the CUSTOMER's — the public share link and
    // two customer-facing routes. Acceptance mints the order AND the draft invoice, so a sale
    // agreed over WhatsApp could not be entered into the system at all.
    expect(QUOTE_ADMIN).toMatch(/quotesService\.acceptQuote\(/);
    expect(QUOTE_ADMIN).toMatch(/Mark accepted/);
  });

  it('and reports the service\'s own refusal rather than a generic failure', () => {
    // The service distinguishes an expired quote from an unpriced line from an undecided upsell.
    const handler = QUOTE_ADMIN.slice(QUOTE_ADMIN.indexOf('const handleAcceptQuote'));
    expect(handler.slice(0, 1200)).toMatch(/res\.error/);
  });
});

describe('provenance is readable in both directions', () => {
  it('the order names the quote it came from', () => {
    // `orders.source_quote_id` is written by the acceptance trigger and was rendered nowhere —
    // the same write-only-link shape as `source_thread_id`, which was fixed while this was missed.
    expect(ORDERS).toMatch(/order\.source_quote_id/);
  });

  it('the invoice names the quote it came from', () => {
    expect(INVOICE).toMatch(/\(invoice as any\)\.quote_id/);
  });

  it('the order menu points at the board that exists', () => {
    // /finance?tab=doc_dispatch is a placeholder card that only links onward.
    expect(ORDERS).not.toMatch(/finance\?tab=doc_dispatch/);
    expect(ORDERS).toMatch(/warehouse\?tab=dispatch/);
  });
});

describe('a quote line does not claim stock it has not checked', () => {
  it('reads the warehouse, not catalog metadata', () => {
    expect(QUOTE_LINES).toMatch(/ordersService\.getAvailableStock\(/);
  });

  it('never hardcodes availability', () => {
    // `status: 'Available'` beside `metadata.stock_quantity` told an operator a catalog number
    // was free stock, in a word that was always reassuring.
    expect(QUOTE_LINES).not.toMatch(/status: 'Available'/);
  });

  it('says so when it could not read it, rather than showing zero', () => {
    // A warehouse we could not reach is UNKNOWN. Rendering 0 free would stop a sale for no reason.
    expect(QUOTE_LINES).toMatch(/freeStock === null/);
    expect(QUOTE_LINES).toMatch(/Stock unknown/);
  });
});
