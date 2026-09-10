/**
 * "Which job is this document for?" — DERIVED, for the two documents that carry no `project_id`
 * of their own (#378 L5).
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
