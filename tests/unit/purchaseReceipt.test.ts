/**
 * "Received" must mean the goods arrived.
 *
 * The three-way match computed its received leg from `quantity_delivered` — a column written by
 * the "Delivered" editor, which passes `p_move_stock => FALSE` (#320). So the match said
 * "Safe to pay" with nothing in the warehouse. A wrong verdict is a valid string.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { stripComments } from '../helpers/stripComments';

const ROOT = join(__dirname, '..', '..');
const read = (p: string) => stripComments(readFileSync(join(ROOT, p), 'utf8'));

const ORDERS = read('src/modules/finance/components/OrdersPanel.tsx');
const DIALOG = read('src/modules/finance/components/ReceiveOrderLinesDialog.tsx');
const SERVICE = read('src/modules/finance/services/ordersService.ts');

describe('a partial delivery can be recorded as stock', () => {
  it('the order offers a quantity-bearing receipt, not only all-or-nothing', () => {
    expect(ORDERS).toMatch(/Receive goods \(part or all\)/);
    expect(ORDERS).toMatch(/Receive everything outstanding/);
    expect(ORDERS).toMatch(/ReceiveOrderLinesDialog/);
  });

  it('it goes through the RPC that moves stock', () => {
    expect(DIALOG).toMatch(/rpc\('receive_order_lines'/);
    // Writing the columns from the client would be the second stock writer this codebase has a
    // probe against (dic_detect__stock_writers_outside_core).
    expect(DIALOG, 'the dialog writes order_items directly instead of calling the RPC')
      .not.toMatch(/from\('order_items'\)/);
  });

  it('offers only what is still outstanding, measured on the RECEIPT column', () => {
    // `quantity - quantity_delivered` would offer goods again that are already on the shelf,
    // because the line editor moves that column without moving stock.
    expect(DIALOG).toMatch(/Number\(i\.quantity \?\? 0\) - Number\(i\.quantity_shipped \?\? 0\)/);
  });

  it('reports the function\'s own refusal', () => {
    // It distinguishes "more than outstanding" from "not a finance manager" from "no stocked
    // lines", and each needs a different response from the operator.
    const submit = DIALOG.slice(DIALOG.indexOf('const submit'));
    expect(submit).toMatch(/\(e as Error\)\.message/);
  });
});

describe('the receipt fact is a typed field, not an accident', () => {
  it('OrderItem carries quantity_shipped', () => {
    expect(SERVICE).toMatch(/quantity_shipped: number;/);
  });

  it('and the column list selects it', () => {
    expect(SERVICE).toMatch(/'quantity_delivered', 'quantity_shipped'/);
  });
});

describe('the two columns keep their separate meanings', () => {
  it('the "Delivered" editor still calls the non-stock-moving path', () => {
    // This is correct and must stay: #320 says stock moves only on a fiscal document. The bug was
    // never that this editor exists — it was the match reading what it writes.
    expect(ORDERS).toMatch(/setLineDelivered/);
  });

  it('and the receipt dialog says which one moves stock', () => {
    // An operator who cannot tell them apart will reach for the wrong one, which is exactly how
    // this defect was produced in the first place.
    expect(DIALOG).toMatch(/does not/);
    expect(DIALOG).toMatch(/moves stock/);
  });
});
