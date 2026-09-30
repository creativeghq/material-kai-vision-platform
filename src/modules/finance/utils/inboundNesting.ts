/** Which received documents fold under another in the inbox: a linked ΔΑ sits inside its invoice. */
import type { InboundLinkSummary } from '@/modules/finance/utils/inboundCorrelation';

/** A document whose best correlation is a linked delivery-note ↔ invoice pair has something to expand. */
export const hasLinkedDelivery = (link: InboundLinkSummary | undefined): boolean =>
  !!link && link.status === 'linked' && !!link.other_doc_id && link.other_is_held
  && (link.relation === 'itemised_by' || link.relation === 'invoiced_by');

/** A ΔΑ nests under its invoice only when that invoice is in the SAME list. */
export function nestDeliveryNotes<T extends { id: string }>(
  rows: T[],
  links: Record<string, InboundLinkSummary | undefined>,
): { top: T[]; nested: Record<string, T[]> } {
  const present = new Set(rows.map((r) => r.id));
  const nested: Record<string, T[]> = {};
  const top: T[] = [];
  for (const r of rows) {
    const link = links[r.id];
    const parent = hasLinkedDelivery(link) && link!.relation === 'invoiced_by' ? link!.other_doc_id : null;
    if (parent && present.has(parent)) (nested[parent] ??= []).push(r);
    else top.push(r);
  }
  return { top, nested };
}

/** A row click that came from a control, or through React's tree from a portal (dialog backdrop), is not a row click. */
export const isInteractiveClick = (e: { target: EventTarget | null; currentTarget: EventTarget | null }): boolean => {
  const { target, currentTarget } = e;
  if (!(target instanceof Node) || !(currentTarget instanceof Node) || !currentTarget.contains(target)) return true;
  return target instanceof Element
    && !!target.closest('button, a, input, select, textarea, label, [role="combobox"], [role="menuitem"]');
};
