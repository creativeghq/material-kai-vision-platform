/**
 * A received document can hang off several orders, payments and documents. The money rules live in
 * SQL and tests/integration/inbound-attachments.test.ts runs them; this pins the wiring.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { stripComments } from '../helpers/stripComments';

const ROOT = join(__dirname, '..', '..');
const read = (p: string) => stripComments(readFileSync(join(ROOT, p), 'utf8'));

const DIALOG = read('src/modules/finance/components/InboundAttachDialog.tsx');
const CELL = read('src/modules/finance/components/InboundAttachCell.tsx');
const SERVICE = read('src/modules/finance/services/inboundService.ts');
const PAGE = read('src/modules/finance/pages/DocumentsPage.tsx');
const FEED = read('src/modules/finance/tabs/BankFeedTab.tsx');
const TOOLS = read('supabase/functions/_shared/tools/expense-tools.ts');

describe('attaching from the document', () => {
  it('the Expenses table renders the cell beside the delivery-note correlation', () => {
    expect(PAGE).toMatch(/<InboundDetailCell[\s\S]{0,120}<InboundAttachCell/);
  });

  it('booking and allocating are one server call, never two from the client', () => {
    expect(SERVICE).toMatch(/rpc\('attach_payment_to_inbound_doc'/);
    expect(SERVICE).toMatch(/rpc\('attach_order_to_inbound_doc'/);
    expect(DIALOG).not.toMatch(/toSupplierBill|from\('payment_allocations'\)|from\('payments'\)/);
  });

  it('candidates come from SQL, so the dialog cannot disagree about what fits', () => {
    expect(DIALOG).toMatch(/inboundService\.suggestPayments/);
    expect(DIALOG).toMatch(/inboundService\.suggestOrders/);
    expect(DIALOG).not.toMatch(/from\('orders'\)/);
  });

  it('warns when attaching also books the expense', () => {
    expect(DIALOG).toMatch(/adds the document to your expenses/);
    expect(DIALOG).toMatch(/window\.confirm/);
  });

  it('a shipping document is told apart by its myDATA code, never by its amount', () => {
    expect(DIALOG).toMatch(/const shipping = isDeliveryNote\(doc\.doc_type\)/);
    expect(DIALOG).not.toMatch(/total_gross \?\? 0\) > 0/);
  });

  it('a failed read is not "none"', () => {
    expect(PAGE).toMatch(/attachments === null \? undefined/);
    expect(CELL).toMatch(/attachments === undefined/);
    expect(DIALOG).toMatch(/setReadError/);
  });

  it('a payment carried from an order is removed by removing the order', () => {
    expect(DIALOG).toMatch(/!!p\.via_order_id/);
  });
});

describe('a split transfer on the bank feed', () => {
  it('says part matched and stays in the review queue', () => {
    expect(FEED).toMatch(/case 'partial'/);
    expect(FEED).toMatch(/\['suggested', 'unmatched', 'partial'\]/);
  });

  it('can still be matched to another bill, but not closed as a plan or ignored', () => {
    expect(FEED).toMatch(/r\.match_status !== 'partial' && \(\s*<DropdownMenuItem[\s\S]{0,80}kind: 'plan'/);
    expect(FEED).toMatch(/r\.match_status !== 'matched' && r\.match_status !== 'partial' && \(\s*r\.match_status === 'ignored'/);
  });
});

describe('the agent tool', () => {
  const body = TOOLS.slice(TOOLS.indexOf('createAttachExpenseDocumentTool'), TOOLS.indexOf("name: 'attach_expense_document'"));

  it('runs as the caller, because every RPC behind it checks auth.uid()', () => {
    expect(body).toMatch(/callerDbClient\(userJwt, userId, workspaceId\)/);
    expect(body).not.toMatch(/\bsvc\(\)/);
  });

  it('asks for approval BEFORE any write', () => {
    const gate = body.indexOf('confirm !== true');
    const write = body.indexOf("rpc('attach_order_to_inbound_doc'");
    expect(gate).toBeGreaterThan(-1);
    expect(write).toBeGreaterThan(gate);
  });
});

describe('attaching from the bank line', () => {
  it('candidates come from SQL and the attach is the same one-call RPC the document side uses', () => {
    expect(SERVICE).toMatch(/rpc\('suggest_inbound_docs_for_bank_tx'/);
    expect(FEED).toMatch(/inboundService\.suggestDocsForBankLine/);
    expect(FEED).toMatch(/inboundService\.attachPayment\(doc\.doc_id, \{ kind: 'feed_line', id: row\.id \}\)/);
    expect(FEED).toMatch(/window\.confirm/);
  });
});

describe('a bank notification opens its own line', () => {
  it.each([
    'supabase/functions/_shared/revolut/sync-core.ts',
    'supabase/functions/_shared/revolut/reconcile.ts',
  ])('%s links the feed line, never the settings pane', (file) => {
    const src = read(file);
    expect(src).not.toMatch(/action_url:\s*'\/finance\?tab=settings/);
    expect(src).toMatch(/action_url:\s*`\/finance\?tab=bank_feed&tx=\$\{tx\.id\}`/);
  });

  it('the feed narrows to the linked line and offers the way back', () => {
    expect(FEED).toMatch(/searchParams\.get\('tx'\)/);
    expect(FEED).toMatch(/if \(focusTx\) query = query\.eq\('id', focusTx\)/);
    expect(FEED).toMatch(/Show all transactions/);
  });
});
