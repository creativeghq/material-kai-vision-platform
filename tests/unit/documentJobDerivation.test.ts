/**
 * A delivery note and a cheque know their job by DERIVATION, never by a column (#378 L5).
 *
 * WHY NO COLUMN
 * -------------
 * Both are downstream of a document that already holds the job: a note is cut FROM an order, a
 * cheque settles an invoice or a supplier bill. A `project_id` on either would be a second copy of
 * that fact, free to disagree the moment somebody re-files the parent — and `get_project_pnl`
 * reads the PARENTS, so the copy would not even be the number the P&L used. This is the same rule
 * as every other derived quantity here: derive it, or add a drift check. Deriving is cheaper.
 *
 * WHY THE CHEQUE RULE IS A DIRECTION
 * ----------------------------------
 * A cheque carries BOTH `invoice_id` and `supplier_bill_id`. "Whichever is set" would let a cheque
 * holding both point at the wrong side of the trade — the mistake `moneyDerivation.test.ts` exists
 * to stop, one document down. Money IN settles a customer invoice; money OUT settles a supplier
 * bill. The direction decides, so a cheque with both is still unambiguous.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { chequeJob, deliveryNoteJob } from '@/modules/finance/utils/documentJob';

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8').replace(/\r\n/g, '\n');

const JOB = { project_id: 'proj-1', projects: { name: 'Kolonaki fit-out' } };
const OTHER = { project_id: 'proj-2', projects: { name: 'Glyfada villa' } };

describe('a delivery note takes the job of the order it was cut from', () => {
  it('reports the order\u2019s project', () => {
    expect(deliveryNoteJob({ orders: JOB })).toEqual({ projectId: 'proj-1', projectName: 'Kolonaki fit-out' });
  });

  it('an order with no job is an absent job, not a wrong one', () => {
    expect(deliveryNoteJob({ orders: { project_id: null } })).toBeNull();
    expect(deliveryNoteJob({})).toBeNull();
  });

  it('survives PostgREST returning the embed as a one-element array', () => {
    // Every embed is typed as possibly an array; reading `[0]` only sometimes is how one surface
    // renders the job and another renders a dash for the same row.
    expect(deliveryNoteJob({ orders: [JOB] })?.projectName).toBe('Kolonaki fit-out');
  });
});

describe('a cheque takes the job of the document it settles, chosen by DIRECTION', () => {
  it('money in reads the invoice', () => {
    expect(chequeJob({ direction: 'in', invoices: JOB, supplier_bills: OTHER })?.projectId).toBe('proj-1');
  });

  it('money out reads the supplier bill', () => {
    expect(chequeJob({ direction: 'out', invoices: OTHER, supplier_bills: JOB })?.projectId).toBe('proj-1');
  });

  it('does NOT fall back to the other side when its own side has no job', () => {
    // The fallback is the whole defect: an outgoing cheque whose bill has no job must read as
    // unfiled, not borrow the job of an unrelated invoice that happens to be linked.
    expect(chequeJob({ direction: 'out', invoices: JOB, supplier_bills: { project_id: null } })).toBeNull();
    expect(chequeJob({ direction: 'in', invoices: { project_id: null }, supplier_bills: JOB })).toBeNull();
  });
});

describe('the derivation is fed by the read, and nothing stores it', () => {
  it('both list queries embed the parent that carries the job', () => {
    expect(read('src/modules/finance/services/deliveryNotesService.ts'))
      .toMatch(/from\('delivery_notes'\)[\s\S]{0,600}?orders\(project_id, projects\(name\)\)/);
    const cheques = read('src/modules/finance/services/chequesService.ts');
    expect(cheques).toMatch(/invoices\(project_id, projects\(name\)\)/);
    expect(cheques).toMatch(/supplier_bills\(project_id, projects\(name\)\)/);
  });

  it('neither table grows a project_id of its own', () => {
    // The tripwire. If someone adds the column, this says why they should not have.
    const types = read('src/integrations/supabase/types.ts');
    for (const table of ['delivery_notes', 'cheques']) {
      const block = types.slice(types.indexOf(`\n      ${table}: {`), types.indexOf(`\n      ${table}: {`) + 3000);
      expect(
        block,
        `${table} has a project_id column. It is derived from its parent — a stored copy is free to `
        + 'disagree with the parent, and get_project_pnl reads the parent.',
      ).not.toMatch(/^\s{10}project_id:/m);
    }
  });
});
