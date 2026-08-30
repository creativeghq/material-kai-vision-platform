/**
 * A trip cost reaches the order, not only the job (#378 L6).
 *
 * `trip_expense_items` carried `project_id`, `billable` and `billed_invoice_id`, and
 * `get_project_pnl` already read it as job cost — so job P&L was RIGHT, which is exactly why this
 * was hard to notice. What the trip cost never reached was the ORDER: its Expenses tab, its
 * three-way match, and committed-vs-actual at order level. A hotel bill for a job that already had
 * an order attached to the job and stopped there.
 *
 * The column and its cross-tenant trigger are SQL and are verified by a rolled-back probe (a line
 * linked to an order in the same workspace is accepted; one naming another tenant's order is
 * refused with a 404-shaped `P0002`, because naming the mismatch would confirm the order exists).
 * This guards the TypeScript half: the write path has to carry the column, and the two links have
 * to stay INDEPENDENT.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { stripComments } from '../helpers/stripComments';

const ROOT = join(__dirname, '..', '..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');
const src = (p: string) => stripComments(read(p));

const SERVICE = 'src/modules/finance/services/tripExpenseService.ts';
const PANEL = 'src/modules/finance/components/TripExpensesPanel.tsx';
const TYPES = 'src/integrations/supabase/types.ts';

describe('#378 L6 — the write path carries the order', () => {
  it('the service accepts it and inserts it', () => {
    const svc = src(SERVICE);
    expect(svc).toMatch(/order_id\?: string \| null;/);
    expect(svc, 'addItem drops the column, so the picker would appear to work and store nothing')
      .toMatch(/order_id: input\.order_id \?\? null,/);
  });

  it('the update path can change it too', () => {
    // Attaching the order later is the normal case: the receipt is entered on the road and the
    // order is raised back at the office. A create-only link answers the question once.
    const svc = src(SERVICE);
    const patch = svc.slice(svc.indexOf("'expense_date' | 'category'"));
    expect(patch.slice(0, 400)).toMatch(/'order_id'/);
  });

  it('the row type knows about it', () => {
    expect(src(SERVICE)).toMatch(/\n {2}order_id: string \| null;/);
    // The generated types too, or every write is an `any` cast waiting to happen.
    const types = src(TYPES);
    const block = types.slice(types.indexOf('      trip_expense_items: {'));
    expect(block.slice(0, block.indexOf('Relationships'))).toMatch(/order_id/);
  });

  it('the dialog offers the order and the job as SEPARATE questions', () => {
    const panel = src(PANEL);
    expect(panel).toMatch(/setOrderId/);
    expect(panel).toMatch(/order_id: orderId \|\| null/);
    // Independence is the point: an order may have no project and a project has many orders, so
    // deriving one from the other would attribute the cost to a commitment nobody chose.
    expect(panel, 'the order is being derived from the project')
      .not.toMatch(/setOrderId\([^)]*project/i);
    expect(panel, 'the project is being derived from the order')
      .not.toMatch(/setProjectId\([^)]*order/i);
  });

  it('the form clears both links after a save', () => {
    // A sticky link is the worst kind of default here: the next receipt silently inherits the
    // last one's order, and the operator has no reason to look.
    const panel = src(PANEL);
    const reset = panel.slice(panel.indexOf("setDescription('');"));
    expect(reset.slice(0, 200)).toMatch(/setProjectId\(''\)/);
    expect(reset.slice(0, 200)).toMatch(/setOrderId\(''\)/);
  });
});
