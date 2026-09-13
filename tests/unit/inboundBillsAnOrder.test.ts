/**
 * A supplier's document must be able to reach the order it is billing.
 *
 * `_inbound_doc_to_supplier_bill_core` never wrote `order_id`, which is the column the three-way
 * match reads, so every expense born from myDATA left its order stuck on `awaiting_bill`.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { stripComments } from '../helpers/stripComments';

const ROOT = join(__dirname, '..', '..');
const read = (p: string) => stripComments(readFileSync(join(ROOT, p), 'utf8'));

const MENU = read('src/modules/finance/components/InboundDocActionsMenu.tsx');
const HOOK = read('src/modules/finance/components/useInboundDocActions.tsx');
const DIALOG = read('src/modules/finance/components/BillToExistingOrderDialog.tsx');
const SERVICE = read('src/modules/finance/services/inboundService.ts');

describe('the inbox can book a document against an order that already exists', () => {
  it('the menu offers it next to the one that raises a new order', () => {
    expect(MENU).toMatch(/Bill an existing order/);
    expect(MENU).toMatch(/onBillExistingOrder/);
  });

  it('and the hook mounts the dialog, so the entry is not offered into nothing', () => {
    expect(HOOK).toMatch(/onBillExistingOrder=\{/);
    expect(HOOK).toMatch(/<BillToExistingOrderDialog/);
  });

  it('the candidates are DERIVED in SQL, never assembled by the client', () => {
    expect(SERVICE).toMatch(/rpc\('suggest_orders_for_inbound_doc'/);
    expect(DIALOG).toMatch(/inboundService\.suggestOrders/);
    expect(DIALOG, 'the dialog queries orders itself instead of reading the derivation')
      .not.toMatch(/from\('orders'\)/);
  });

  it('creating the expense and attaching it are ONE call', () => {
    // Two writes with a button that stays armed is anti-regression rule 4: the first books the
    // payable, the second fails, and the retry books it again.
    expect(SERVICE).toMatch(/rpc\('inbound_doc_bill_to_order'/);
    expect(DIALOG).toMatch(/inboundService\.billToOrder\(doc\.id, row\.order_id\)/);
    expect(DIALOG, 'the dialog converts and then stamps as two calls')
      .not.toMatch(/toSupplierBill|setSupplierBillOrder/);
  });

  it('a failed read is not rendered as "there are no orders"', () => {
    // The empty state and the failure state are different facts and only one of them is news.
    expect(DIALOG).toMatch(/setRows\(null\)/);
    expect(DIALOG).toMatch(/rows\?\.length === 0/);
  });

  it('the bill is the SUPPLIER\'s figures, so a variance can still be seen', () => {
    // `generate_supplier_bill_from_order` writes a bill from what WE ordered. A match built from
    // our own numbers can never report "we ordered 100, they billed 120".
    expect(DIALOG).not.toMatch(/generate_supplier_bill_from_order/);
    expect(SERVICE).not.toMatch(/generate_supplier_bill_from_order/);
  });
});
