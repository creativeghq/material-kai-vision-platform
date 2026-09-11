/** How an inbound (myDATA received) document's triage state is WORDED for the operator. */
import { isCancelledDocument } from '@/modules/finance/utils/inboundProvenance';

export type InboundStatus = 'new' | 'classified' | 'received' | 'dismissed';

/** Table cell: only the acted-on states get a word. `new` is absent on purpose. */
export const INBOUND_OUTCOME: Record<string, { label: string; tone: string }> = {
  // "Billed" reads as something that was sent OUT. What actually happened is that the document
  // became an expense you owe — say that, in the same word the tab and the menu use.
  classified: { label: 'In Expenses', tone: 'text-emerald-600 dark:text-emerald-400' },
  received: { label: 'Stocked', tone: 'text-emerald-600 dark:text-emerald-400' },
  ordered: { label: 'Ordered', tone: 'text-emerald-600 dark:text-emerald-400' },
  dismissed: { label: 'Dismissed', tone: 'text-muted-foreground line-through' },
  // AADE voided the document. Written as a light/dark PAIR because `red-400` is chosen for
  // plum-black and renders far too pale on the light themes' cream.
  cancelled: { label: 'Cancelled at AADE', tone: 'text-red-700 dark:text-red-400' },
};

/**
 * What actually happened to a document, as words — because "billed" and "stocked" are BOTH
 * true of a document that was invoiced and received, and a single `status` column can only
 * hold one of them. `created_supplier_bill_id` is the durable record that a bill exists, so
 * billing is read from that rather than from the status the last action happened to write.
 */
export function inboundOutcomes(
  doc: { status: string; created_supplier_bill_id?: string | null; cancelled_by_mark?: string | null },
  /** `ordered` is held on the expense (`supplier_bills.order_id`), so the caller resolves it. */
  opts?: { ordered?: boolean },
): { label: string; tone: string }[] {
  // Outranks every other outcome, and is stated even once dismissed: a void document that reads
  // only "In Expenses" is the reading that let 15 of them sit bookable in the inbox.
  if (isCancelledDocument(doc)) {
    return doc.status === 'dismissed'
      ? [INBOUND_OUTCOME.cancelled, INBOUND_OUTCOME.dismissed]
      : [INBOUND_OUTCOME.cancelled];
  }
  if (doc.status === 'dismissed') return [INBOUND_OUTCOME.dismissed];
  const out: { label: string; tone: string }[] = [];
  if (opts?.ordered) out.push(INBOUND_OUTCOME.ordered);
  if (doc.created_supplier_bill_id) out.push(INBOUND_OUTCOME.classified);
  if (doc.status === 'received') out.push(INBOUND_OUTCOME.received);
  return out;
}

/** Filter option label — here `new` needs a name, since you filter FOR the untouched pile. */
export function inboundStatusLabel(status: string): string {
  return INBOUND_OUTCOME[status]?.label ?? (status === 'new' ? 'Not handled' : status);
}
