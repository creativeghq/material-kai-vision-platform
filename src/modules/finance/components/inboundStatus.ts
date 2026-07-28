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
  classified: { label: 'Billed', tone: 'text-emerald-600 dark:text-emerald-400' },
  received: { label: 'Stocked', tone: 'text-emerald-600 dark:text-emerald-400' },
  dismissed: { label: 'Dismissed', tone: 'text-muted-foreground line-through' },
};

/** Filter option label — here `new` needs a name, since you filter FOR the untouched pile. */
export function inboundStatusLabel(status: string): string {
  return INBOUND_OUTCOME[status]?.label ?? (status === 'new' ? 'Not handled' : status);
}
