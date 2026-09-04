/**
 * The questions a bid's own numbers raise — derived, not generated.
 *
 * Every question here names a line the analysis flagged, and there is no path to a question
 * without one. That is the same rule the AI assessment work runs on: a model may write ABOUT
 * findings, never invent them. A generated "have you allowed for scaffolding?" that no figure
 * supports is worse than silence — it teaches the reader that the list is padding, and the two
 * questions that actually matter get skimmed with the rest.
 *
 * It imports nothing but the canonical money formatter — a leaf module with no imports of its own
 * — so the derivation stays testable without a Supabase client. A local `money` helper was the
 * first draft and `moneyPrimitives.test.ts` rejected it: a second `Intl.NumberFormat` is exactly
 * the drift that guard exists to prevent, and a clarification printing €1850.00 next to a table
 * printing €1,850 reads as two different figures.
 *
 * What it deliberately does NOT do: rank bidders, recommend one, or decide anything. The ranking
 * is `comparable_total` and it comes from SQL.
 */
import { formatMoney } from '@/utils/decimal';

/** The shape `get_tender_bid_analysis` returns. Restated structurally so this file imports nothing. */
export interface BidAnalysisLine {
  package_item_id: string;
  item_ref: string | null;
  description: string;
  unit: string | null;
  quantity: number | null;
  bid_id: string;
  company_name: string | null;
  amount: number | null;
  median_amount: number | null;
  variance_pct: number | null;
  bidders_priced: number;
  flag: 'unpriced' | 'low_outlier' | 'high_outlier' | 'ok';
}

export type ClarificationKind = 'unpriced' | 'low_outlier' | 'high_outlier';

export interface Clarification {
  kind: ClarificationKind;
  /** The line this question exists because of. There is no question without one. */
  itemRef: string | null;
  description: string;
  /** Ready to paste into an email. Plain text — this is not rendered as HTML anywhere. */
  question: string;
}

export interface BidClarifications {
  bidId: string;
  companyName: string | null;
  items: Clarification[];
}

/** Whole pounds/euros: a clarification is a conversation, not a valuation. */
const money = (n: number | null, currency: string): string =>
  formatMoney(n, currency, { decimals: 0, maxDecimals: 0 });

const label = (l: BidAnalysisLine): string =>
  l.item_ref ? `${l.item_ref} ${l.description}` : l.description;

/**
 * How many other bids the comparison rests on, said out loud.
 *
 * A median from two bids and a median from six are both "the median", and only one of them is
 * worth putting to a subcontractor. Leaving the count off would make the weaker one sound as firm
 * as the stronger, which is how a clarification turns into an argument.
 */
const evidence = (n: number): string =>
  n <= 1 ? 'the only other price we hold'
    : `the middle of the ${n} prices we hold`;

/**
 * Turn the derived analysis into the questions to put to each bidder.
 *
 * Ordering is by how much the answer could move the number: an unpriced line first (it is a hole
 * in the offer), then the biggest variances. A list nobody reads to the bottom should have the
 * expensive question at the top.
 */
export function bidClarifications(
  rows: readonly BidAnalysisLine[],
  currency = 'EUR',
): BidClarifications[] {
  const byBid = new Map<string, BidClarifications>();

  for (const l of rows) {
    if (l.flag === 'ok') continue;
    let entry = byBid.get(l.bid_id);
    if (!entry) {
      entry = { bidId: l.bid_id, companyName: l.company_name, items: [] };
      byBid.set(l.bid_id, entry);
    }

    if (l.flag === 'unpriced') {
      entry.items.push({
        kind: 'unpriced',
        itemRef: l.item_ref,
        description: l.description,
        // Named as a gap in the offer, not as an accusation: the commonest cause is that the
        // bidder believes it is covered elsewhere in their price, and that answer is the useful
        // one. It is asked either way, because "included in 1.1" and "we missed it" produce very
        // different subcontracts.
        question:
          `${label(l)} — we have no price from you against this item. `
          + (l.median_amount !== null
            ? `Others are at around ${money(l.median_amount, currency)} (${evidence(l.bidders_priced)}). `
            : 'Nobody has priced it, so we have nothing to compare against. ')
          + 'Is it covered elsewhere in your figure, or should it be added?',
      });
      continue;
    }

    const pct = l.variance_pct === null ? null : Math.round(Math.abs(l.variance_pct));
    if (l.flag === 'low_outlier') {
      entry.items.push({
        kind: 'low_outlier',
        itemRef: l.item_ref,
        description: l.description,
        // The question that pays for this whole feature. A rate well under everybody else usually
        // means the scope was read differently, and the difference arrives later as a variation at
        // a rate nobody competed on.
        question:
          `${label(l)} — your ${money(l.amount, currency)} is about ${pct}% below `
          + `${money(l.median_amount, currency)}, ${evidence(l.bidders_priced)}. `
          + 'Please confirm your price covers the full scope described, including anything you have '
          + 'assumed is by others.',
      });
    } else {
      entry.items.push({
        kind: 'high_outlier',
        itemRef: l.item_ref,
        description: l.description,
        // Not "you are too expensive". A high outlier is often the only bidder who has spotted a
        // real risk, and finding that out before award is worth more than the saving.
        question:
          `${label(l)} — your ${money(l.amount, currency)} is about ${pct}% above `
          + `${money(l.median_amount, currency)}, ${evidence(l.bidders_priced)}. `
          + 'Is there something in this item the others may not have allowed for?',
      });
    }
  }

  const weight: Record<ClarificationKind, number> = { unpriced: 0, low_outlier: 1, high_outlier: 2 };
  for (const entry of byBid.values()) {
    entry.items.sort((a, b) => weight[a.kind] - weight[b.kind]);
  }
  return [...byBid.values()];
}

/** The whole list for one bidder as plain text, ready to paste into an email. */
export function clarificationsAsText(c: BidClarifications): string {
  if (c.items.length === 0) return '';
  return [
    `Clarifications — ${c.companyName ?? 'your tender'}`,
    '',
    ...c.items.map((i, n) => `${n + 1}. ${i.question}`),
  ].join('\n');
}
