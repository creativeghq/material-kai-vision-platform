/**
 * A ΔΑ and the ΤΙΜ that bills it, told apart and shown together.
 *
 * myDATA is REQUIRED to file one delivery as two documents, because they are two different legal
 * instruments: a delivery note is not a tax document, so it carries the items at zero money, and
 * the invoice carries the money with its itemisation collapsed to one value-only line — the detail
 * already reached AADE on the delivery note, so repeating it would be filing it twice.
 *
 * Held apart, the Expenses inbox shows 104 deliveries worth nothing next to 701 invoices of
 * nothing, and neither row is wrong. This module is the wording that joins them.
 *
 * Two rules it exists to keep, both of which are easy to break by writing the obvious thing:
 *
 *  1. **A guess never renders as a fact.** `status` is `linked` (AADE stated it in the document
 *     header, or an operator confirmed it) or `suggested` (ours, nobody has ruled on it). The
 *     suggested wording is a QUESTION — "ΔΑ 2944?" — and the confirmed wording is a statement.
 *     Rendering both as "Detail on ΔΑ 2944" would make a 0.25-confidence coincidence and the
 *     issuer's own declaration the same sentence.
 *
 *  2. **The invoice's money never appears in the delivery note's money column.** It is the
 *     obvious fix for a ΔΑ row reading €0.00 and it is double counting: the column is summed, and
 *     the €626.44 is already on the ΤΙΜ row two lines up. A delivery note is worth zero because
 *     it IS worth zero; what it was missing is a NAME for the money, not the money. So the
 *     correlation goes in the detail column as "Invoiced by ΤΙΜ 2734" and the totals stay put.
 */

/** What an edge means, read from this document's side. Derived in SQL by `_inbound_link_relation`. */
export type InboundLinkRelation =
  /** The other document is a delivery note: this document's itemisation lives there. */
  | 'itemised_by'
  /** This document is the delivery note: the other one is the money for it. */
  | 'invoiced_by'
  | 'corrects'
  | 'corrected_by'
  | 'related';

/** Who says the two documents belong together. The whole point of keeping the column. */
export type InboundLinkSource = 'aade' | 'derived' | 'user';

/** Whether anybody stands behind the link yet. */
export type InboundLinkStatus = 'linked' | 'suggested';

/** One row of `get_inbound_link_summary` — the best edge for one document. */
export interface InboundLinkSummary {
  doc_id: string;
  status: InboundLinkStatus;
  other_doc_id: string | null;
  other_mark: string;
  other_label: string;
  other_doc_type: string | null;
  other_total_gross: number | null;
  other_line_count: number;
  /** FALSE when AADE cites a MARK we have never received. Still shown — it is an answer. */
  other_is_held: boolean;
  relation: InboundLinkRelation;
  link_id: string;
  link_source: InboundLinkSource;
  confidence: number | null;
  reason: string | null;
  /** Other live candidates for the same document. One of four is a different claim from one of one. */
  alternatives: number;
}

/** Where a link came from, in the operator's words rather than the enum's. */
export const INBOUND_LINK_SOURCE_LABEL: Record<InboundLinkSource, string> = {
  aade: 'Stated by the issuer on myDATA',
  derived: 'Matched by us',
  user: 'Linked by an operator',
};

/**
 * The detail-column cell for a document that takes part in a correlation.
 *
 * Returns `null` when the correlation should not be spoken about in that column at all, so the
 * caller falls back to its own wording ("Needs detail" / "—") instead of this module inventing a
 * third state.
 */
export function correlationCellLabel(link: InboundLinkSummary | undefined): {
  text: string;
  title: string;
  /** A question the operator can answer. `false` = a statement of record. */
  actionable: boolean;
} | null {
  if (!link) return null;

  // AADE cited a document that has never reached us. Saying nothing would render as "no
  // correlation", which is the opposite of what we know.
  if (!link.other_is_held) {
    return {
      text: `Cited ${link.other_mark}`,
      title:
        `The issuer declared this document correlated with MARK ${link.other_mark}, which we have ` +
        'not received from myDATA. Nothing is missing on our side — that document was either never ' +
        'filed against us or has not been synced yet.',
      actionable: false,
    };
  }

  const others = link.alternatives > 0
    ? ` One of ${link.alternatives + 1} candidates.`
    : '';

  if (link.relation === 'itemised_by') {
    // The document has no lines of its own and the delivery note has them.
    if (link.status === 'linked') {
      return {
        text: `Detail on ${link.other_label}`,
        title:
          `${INBOUND_LINK_SOURCE_LABEL[link.link_source]}. The ${link.other_line_count} item(s) on ` +
          `${link.other_label} are what this invoice bills. Per-item cost is not stated on a ` +
          'delivery note, so the money here stays a document total.',
        actionable: false,
      };
    }
    return {
      text: `${link.other_label}?`,
      title:
        `Possible match — not confirmed by anyone. ${link.reason ?? ''}${others} ` +
        `Accept it and the ${link.other_line_count} item(s) on ${link.other_label} become this ` +
        'invoice\'s detail.',
      actionable: true,
    };
  }

  if (link.relation === 'invoiced_by') {
    // This IS the delivery note. Its own zero total is correct; what it lacked was a name for the
    // money, which is on the other row and must stay there.
    const money = link.other_total_gross;
    const amount = typeof money === 'number' ? ` (${money.toFixed(2)})` : '';
    if (link.status === 'linked') {
      return {
        text: `Invoiced by ${link.other_label}`,
        title:
          `${INBOUND_LINK_SOURCE_LABEL[link.link_source]}. This delivery note is worth zero because ` +
          `a delivery note carries no money by law; ${link.other_label}${amount} is the invoice for ` +
          'it, and that is where the amount is counted.',
        actionable: false,
      };
    }
    return {
      text: `${link.other_label}?`,
      title:
        `Possible invoice for this delivery — not confirmed by anyone. ${link.reason ?? ''}${others}`,
      actionable: true,
    };
  }

  if (link.relation === 'corrects' || link.relation === 'corrected_by') {
    const verb = link.relation === 'corrects' ? 'Corrects' : 'Corrected by';
    return {
      text: `${verb} ${link.other_label}`,
      title: `${INBOUND_LINK_SOURCE_LABEL[link.link_source]}.`,
      actionable: link.status === 'suggested',
    };
  }

  return {
    text: `Related to ${link.other_label}`,
    title: `${INBOUND_LINK_SOURCE_LABEL[link.link_source]}.`,
    actionable: link.status === 'suggested',
  };
}

/**
 * Whether the per-item cost on a set of lines is a real figure or an artefact of the lines having
 * come off a delivery note.
 *
 * `unallocated` is the load-bearing answer and it must never be flattened to zero: an invoice
 * total of 505.19 over two zero-valued delivery-note lines has NO basis to split. Pro-rating by
 * net share divides by zero; splitting evenly invents 252.60 twice. Both are valid numbers that
 * would reach stock valuation and margin, and nothing downstream could ever tell them from a
 * price somebody actually paid.
 */
export type InboundLineCostStatus = 'stated' | 'unallocated' | 'none';

export const INBOUND_LINE_COST_NOTE: Record<InboundLineCostStatus, string | null> = {
  stated: null,
  unallocated:
    'Per-item cost is not stated — these lines come from a delivery note, which carries no money. ' +
    'The document total is the only figure here that is real.',
  none: null,
};
