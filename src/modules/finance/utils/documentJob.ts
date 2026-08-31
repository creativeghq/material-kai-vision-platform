/**
 * "Which job is this document for?" — DERIVED, for the two documents that carry no `project_id`
 * of their own (#378 L5).
 *
 * WHY THERE IS NO COLUMN
 * ----------------------
 * A delivery note and a cheque are both downstream of a document that already knows the job:
 * a note is cut FROM an order, and a cheque settles an invoice or a supplier bill. Adding
 * `project_id` to either would be a second copy of a fact the parent already holds — and a copy
 * that can disagree the moment somebody re-files the parent. `get_project_pnl` reads the parents,
 * so a divergent copy would not even be the number the P&L used. Derive it on read instead.
 *
 * THE CHEQUE RULE IS A DIRECTION, NOT A PRECEDENCE
 * -----------------------------------------------
 * A cheque carries BOTH `invoice_id` and `supplier_bill_id`, and which one is the subject is
 * decided by which way the money moves: an incoming cheque settles what a customer owes us (an
 * invoice); an outgoing one settles what we owe a supplier (a bill). Reading "whichever is set"
 * would let a cheque with both point at the wrong side of the trade — the same mistake the money
 * derivations already record, one document down.
 *
 * Pure, so both the list and any later surface answer identically.
 */

/** A document's job, as far as its parent knows. `null` = the parent has none, or there is no parent. */
export interface DocumentJob {
  projectId: string;
  projectName: string | null;
}

/** Shape of the embedded parent that carries the job. PostgREST types every embed as possibly an array. */
type JobBearer = { project_id: string | null; projects?: { name: string | null } | { name: string | null }[] | null } | null;

/** PostgREST returns an embed as an object OR a one-element array depending on the relationship. */
function one<T>(v: T | T[] | null | undefined): T | null {
  if (!v) return null;
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

function jobOf(bearer: JobBearer | JobBearer[] | undefined): DocumentJob | null {
  const row = one(bearer ?? null);
  if (!row?.project_id) return null;
  return { projectId: row.project_id, projectName: one(row.projects)?.name ?? null };
}

/** A delivery note's job is the job of the order it was cut from. */
export function deliveryNoteJob(note: { orders?: JobBearer | JobBearer[] }): DocumentJob | null {
  return jobOf(note.orders);
}

/**
 * A cheque's job is the job of the document it settles, chosen by DIRECTION:
 * money in settles an invoice, money out settles a supplier bill.
 */
export function chequeJob(cheque: {
  direction: 'in' | 'out';
  invoices?: JobBearer | JobBearer[];
  supplier_bills?: JobBearer | JobBearer[];
}): DocumentJob | null {
  return cheque.direction === 'in' ? jobOf(cheque.invoices) : jobOf(cheque.supplier_bills);
}
