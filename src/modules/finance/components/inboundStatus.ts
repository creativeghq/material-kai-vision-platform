/**
 * How an inbound (myDATA received) document's triage state is WORDED for the operator.
 *
 * The stored states are `new | classified | received | dismissed` — written by
 * `inbound_doc_to_supplier_bill`, `inbound_doc_receive_to_warehouse` and `inboundService.dismiss`,
 * and read back to gate the row's action menu. They are the state machine, not the labels:
 * "classified" tells nobody that a supplier bill exists, and `new` is the default every polled
 * row carries, so spelling it out down a whole column of untouched rows says nothing.
 *
 * Hence: `new` renders as a dash in the table (and "Not handled" where it must be nameable, in
 * the filter), and the other three render as what actually happened.
 */
export type InboundStatus = 'new' | 'classified' | 'received' | 'dismissed';

/** Table cell: only the acted-on states get a word. `new` is absent on purpose. */
export const INBOUND_OUTCOME: Record<string, { label: string; tone: string }> = {
  // "Billed" reads as something that was sent OUT. What actually happened is that the document
  // became an expense you owe — say that, in the same word the tab and the menu use.
  classified: { label: 'In Expenses', tone: 'text-emerald-600 dark:text-emerald-400' },
  received: { label: 'Stocked', tone: 'text-emerald-600 dark:text-emerald-400' },
  dismissed: { label: 'Dismissed', tone: 'text-muted-foreground line-through' },
};

/**
 * What actually happened to a document, as words — because "billed" and "stocked" are BOTH
 * true of a document that was invoiced and received, and a single `status` column can only
 * hold one of them. `created_supplier_bill_id` is the durable record that a bill exists, so
 * billing is read from that rather than from the status the last action happened to write.
 */
export function inboundOutcomes(doc: { status: string; created_supplier_bill_id?: string | null }):
  { label: string; tone: string }[] {
  if (doc.status === 'dismissed') return [INBOUND_OUTCOME.dismissed];
  const out: { label: string; tone: string }[] = [];
  if (doc.created_supplier_bill_id) out.push(INBOUND_OUTCOME.classified);
  if (doc.status === 'received') out.push(INBOUND_OUTCOME.received);
  return out;
}

/** Filter option label — here `new` needs a name, since you filter FOR the untouched pile. */
export function inboundStatusLabel(status: string): string {
  return INBOUND_OUTCOME[status]?.label ?? (status === 'new' ? 'Not handled' : status);
}
