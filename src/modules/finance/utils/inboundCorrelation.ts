/** A ΔΑ and the ΤΙΜ that bills it, told apart and shown together. */

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
  /**
   * Other documents competing for the SAME counterpart. Live, one ΔΑ is offered to EIGHTEEN
   * invoices; each of them showed `alternatives: 0` because that count only ever looked along its
   * own edges. Accept two and one pallet itemises two supplier bills, with every figure still
   * individually right — so a contested counterpart has to be visible before anyone clicks yes.
   */
  other_claimants: number;
}

/** Where a link came from, in the operator's words rather than the enum's. */
export const INBOUND_LINK_SOURCE_LABEL: Record<InboundLinkSource, string> = {
  aade: 'Stated by the issuer on myDATA',
  derived: 'Matched by us',
  user: 'Linked by an operator',
};

/** myDATA family word, for a document whose own series does not say what it is. */
const typeWord = (docType: string | null | undefined): string => {
  const family = String(docType ?? '').split('.')[0];
  if (family === '9') return 'delivery note';
  if (family === '5' || String(docType ?? '').startsWith('13.3')) return 'credit note';
  if (family === '11') return 'receipt';
  return 'invoice';
};

/** What to CALL the other document. */
export function documentLabel(link: InboundLinkSummary): string {
  const label = (link.other_label ?? '').trim();
  if (!label) return `${typeWord(link.other_doc_type)} ${link.other_mark}`;
  if (/\p{L}/u.test(label)) return label;
  return `${typeWord(link.other_doc_type)} ${label}`;
}

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
  /**
   * Whether this correlation is the one that answers "what was on this document".
   *
   * Only an `itemised_by` edge does. A credit note or an unheld MARK says nothing about the
   * missing lines, so the caller must keep its own "Needs detail" warning visible — otherwise a
   * correlation of an entirely different kind silently clears the one flag telling the operator
   * the document still needs them. Twelve live documents were in exactly that state.
   */
  suppliesDetail: boolean;
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
      suppliesDetail: false,
    };
  }

  const name = documentLabel(link);
  const others = link.alternatives > 0 ? ` One of ${link.alternatives + 1} candidates.` : '';
  // The half that was missing: a counterpart everybody is being offered.
  const contested = link.other_claimants > 0
    ? ` Careful — ${name} is also offered to ${link.other_claimants} other document(s), and it can ` +
      'only be the detail for one of them.'
    : '';
  const evidence = `${link.reason ?? ''}${others}${contested}`;

  if (link.relation === 'itemised_by') {
    // The document has no lines of its own and the delivery note has them.
    if (link.status === 'linked') {
      return {
        text: `Detail on ${name}`,
        title:
          `${INBOUND_LINK_SOURCE_LABEL[link.link_source]}. The ${link.other_line_count} item(s) on ` +
          `${name} are what this invoice bills. Per-item cost is not stated on a delivery note, ` +
          'so the money here stays a document total.',
        actionable: false,
        suppliesDetail: true,
      };
    }
    return {
      text: `${name}?`,
      title:
        `Possible match — not confirmed by anyone. ${evidence} ` +
        `Accept it and the ${link.other_line_count} item(s) on ${name} become this document's detail.`,
      actionable: true,
      // Offered, not accepted. Nothing is supplying the detail yet.
      suppliesDetail: false,
    };
  }

  if (link.relation === 'invoiced_by') {
    // This IS the delivery note. Its own zero total is correct; what it lacked was a name for the
    // money, which is on the other row and must stay there.
    const money = link.other_total_gross;
    const amount = typeof money === 'number' ? ` (${money.toFixed(2)})` : '';
    if (link.status === 'linked') {
      return {
        text: `Invoiced by ${name}`,
        title:
          `${INBOUND_LINK_SOURCE_LABEL[link.link_source]}. A plain ΔΑ prices nothing — unlike a ` +
          'ΤΔΑ, which is itself the invoice — so this one is worth zero and stays worth zero. ' +
          `${name}${amount} is the invoice that bills the goods, and that is where the amount is ` +
          'counted.',
        actionable: false,
        // The delivery note already names its own items; the invoice supplies money, not detail.
        suppliesDetail: false,
      };
    }
    return {
      text: `${name}?`,
      title: `Possible invoice for this delivery — not confirmed by anyone. ${evidence}`,
      actionable: true,
      suppliesDetail: false,
    };
  }

  // A credit note, or a correlation whose kind two type codes cannot establish. These say nothing
  // about missing lines, so they never claim to supply detail — and, like every other relation,
  // a guess is worded as a question and carries its evidence.
  const verb = link.relation === 'corrects' ? 'Corrects'
    : link.relation === 'corrected_by' ? 'Corrected by'
    : 'Related to';
  if (link.status === 'linked') {
    return {
      text: `${verb} ${name}`,
      title: `${INBOUND_LINK_SOURCE_LABEL[link.link_source]}.`,
      actionable: false,
      suppliesDetail: false,
    };
  }
  return {
    text: `${verb} ${name}?`,
    title: `Possible correlation — not confirmed by anyone. ${evidence}`,
    actionable: true,
    suppliesDetail: false,
  };
}

/** Whether a line's money is a real figure, and if not, why not. */
export type InboundLineCostStatus = 'stated' | 'derived' | 'unallocated' | 'none';

/** Per-line verdict, so a reader never has to infer it from whether a number happens to be null. */
export type InboundLineCost = 'stated' | 'derived' | 'unknown';

export const INBOUND_LINE_COST_NOTE: Record<InboundLineCostStatus, string | null> = {
  stated: null,
  derived:
    'This delivery note carries a single item, so the invoice total is that line in full — ' +
    'nothing here is apportioned.',
  unallocated:
    'Per-item cost is not stated — these lines come from a plain ΔΑ, which prices nothing because ' +
    'the invoice bills them separately, and one invoice total cannot be split between several ' +
    'lines without inventing the split. The VAT rate and the document total below are real; the ' +
    'per-item figures are not known.',
  none: null,
};

/**
 * Where the money for these goods actually sits.
 *
 * A ΔΑ is worth zero and stays worth zero — its own totals are never overwritten, because the
 * money column is summed and the amount already sits on the invoice row. `billed_*` is the
 * separate answer to "what were these goods billed at, and on which document".
 */
export interface InboundBilledElsewhere {
  billed_net: number | null;
  billed_vat: number | null;
  billed_gross: number | null;
  /** The document number the money is on, e.g. `ΤΙΜ 2734`. */
  billed_on: string | null;
}
