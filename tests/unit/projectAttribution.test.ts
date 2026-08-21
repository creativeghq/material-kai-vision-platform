/**
 * A job link must be RE-ANSWERABLE, from the document's own side (#378 Phase 2).
 *
 * `get_project_pnl` builds a job's whole P&L out of five `project_id` columns:
 *
 *   contracted revenue  quotes.project_id           (accepted)
 *   billed revenue      invoices.project_id
 *   supplier cost       supplier_bills.project_id
 *   labour              time_entries.project_id
 *   committed cost      orders.project_id           (purchase, uninvoiced)
 *
 * Every one of them was WRITABLE at birth and, for three of the five, nowhere else — so a quote
 * raised before its project existed (the normal order of events), an invoice that arrived from an
 * order, or a cost that landed a week after its goods could never join the job. The number that
 * results is not an error: it is a smaller, entirely plausible P&L, and nothing raises about it.
 *
 * This asserts each of the five has a write path on the DOCUMENT side that can both SET and CLEAR.
 * Clearing matters as much as setting: a truthiness guard on the write makes a link one-way —
 * attachable, never removable — which is how a cost stays on the wrong job forever.
 *
 * It is text-based and therefore weaker than calling the code; see billLink.test.ts for the half
 * that is behavioural. What this catches is the shape that actually happened: a service that has
 * no key for the column at all.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { stripComments } from '../helpers/stripComments';

const ROOT = process.cwd();
const read = (rel: string) => stripComments(readFileSync(join(ROOT, rel), 'utf8'));

/**
 * One row per figure `get_project_pnl` derives. `writer` is the service path that must be able to
 * re-point an EXISTING document — not the create call, which every one of these already had.
 */
const ATTRIBUTION = [
  {
    figure: 'billed revenue',
    column: 'invoices.project_id',
    file: 'src/modules/finance/services/financeService.ts',
    // Allowlisted patch (invariant 8): the key has to be named to be writable at all.
    writer: /if \('project_id' in patch\) allowed\.project_id/,
  },
  {
    figure: 'supplier cost',
    column: 'supplier_bills.project_id',
    file: 'src/modules/finance/services/financeService.ts',
    writer: /row\.project_id = patch\.link\.projectId/,
  },
  {
    figure: 'contracted revenue',
    column: 'quotes.project_id',
    file: 'src/modules/quotes/services/QuotesService.ts',
    writer: /project_id\?: string \| null;/,
  },
  {
    figure: 'committed cost',
    column: 'orders.project_id',
    file: 'src/modules/finance/services/ordersService.ts',
    // `!== undefined` rather than truthiness, so `null` reaches the column and the link can be
    // removed as well as set — the same rule the filing links are held to.
    writer: /patch\.projectId !== undefined\) clean\.project_id = patch\.projectId/,
  },
  {
    figure: 'labour',
    column: 'time_entries.project_id',
    file: 'src/modules/finance/services/timeTrackingService.ts',
    writer: /project_id: entry\.project_id/,
  },
] as const;

describe('every figure in a job P&L has a document-side write path', () => {
  for (const a of ATTRIBUTION) {
    it(`${a.figure} — ${a.column} is writable from the document`, () => {
      expect(read(a.file), `${a.column} has no writer in ${a.file}`).toMatch(a.writer);
    });
  }

  /**
   * `null` is the "detach me" instruction. A `||` or a truthiness guard on the way to the column
   * swallows it, which reads as working — the field clears in the UI and silently re-saves the old
   * value — and leaves a cost booked to a job it does not belong to.
   */
  it('the invoice writer passes null through rather than coalescing it away', () => {
    const src = read('src/modules/finance/services/financeService.ts');
    const line = src.split('\n').find((l) => l.includes("'project_id' in patch"));
    expect(line, 'the invoice project writer should exist').toBeTruthy();
    expect(line, 'a truthiness guard here makes the link attachable but never removable')
      .not.toMatch(/\|\||\?\?/);
  });
});

/**
 * The control, not just the column. A writable column with nothing rendering it is the same
 * invisible gap one layer up — which is exactly the state invoices and quotes were in.
 */
describe('the document surfaces actually render a project control', () => {
  const SURFACES = [
    { what: 'the invoice record', file: 'src/pages/Admin/InvoiceDetailPage.tsx' },
    { what: 'the quote record', file: 'src/modules/quotes/pages/QuoteDetailAdminPage.tsx' },
  ];

  for (const s of SURFACES) {
    it(`${s.what} mounts ProjectLinkField`, () => {
      expect(read(s.file), `${s.file} has no project control`).toContain('<ProjectLinkField');
    });
  }

  it('the expense record offers the full link picker, not just a project', () => {
    // An expense can be for an order, a job, a building or a trip — narrowing it to a project
    // here would drop three of the four answers it is allowed to give.
    expect(read('src/modules/finance/components/EditSupplierBillDialog.tsx')).toContain('<OrderLinkPicker');
  });

  /**
   * ProjectLinkField is an ADAPTER over the canonical picker, not a second one. If it ever grows
   * its own search or its own project list, the legality rules and the workspace scoping in
   * `search_order_link_targets` stop applying to two of the surfaces that use it.
   */
  it('the project control delegates to the canonical picker rather than reimplementing one', () => {
    const src = read('src/modules/finance/components/ProjectLinkField.tsx');
    expect(src).toContain('<OrderLinkPicker');
    expect(src, 'ProjectLinkField should not query projects for a picker of its own')
      .not.toMatch(/from\('projects'\)[\s\S]{0,80}\.ilike|listProjects\(/);
  });
});
