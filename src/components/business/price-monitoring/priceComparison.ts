/**
 * Comparing our price to a competitor's (#360 CB-14).
 *
 * The component did this:
 *
 *     const priceDiff = (p) => ((p - currentPrice) / currentPrice) * 100;
 *
 * `p` is a competitor price in `row.current_currency`; `currentPrice` is our list price in the
 * component's `currency` prop, which defaults to `'USD'`. Nothing compared the two. A GBP price
 * against a EUR list price produced a percentage that means nothing and was rendered as a
 * confident red "+12%" next to a trend arrow.
 *
 * That is the currency-mixing pattern this platform has now hit a dozen times, and CLAUDE.md's
 * money rule applies: a wrong number is a valid `number`, so no typecheck and no integrity probe
 * can see it. The only thing that can is refusing to produce it.
 *
 * WHY NOT CONVERT. An FX conversion needs a rate and a date. A monitoring snapshot has neither —
 * it records what a page said, not when the money would move — so a converted comparison would be
 * a second invented number layered on the first. "We cannot compare these" is the true answer, and
 * anti-regression rule 3 says a stated reason beats a plausible figure.
 *
 * Import-free so a test can load it directly.
 */

export type PriceComparison =
  | { kind: 'pct'; value: number }
  /** Both prices are real; they are simply not in the same money. */
  | { kind: 'incomparable'; reason: 'currency'; ours: string; theirs: string }
  /** One side is missing — not an error, just nothing to say. */
  | { kind: 'unknown' };

/** Normalise a currency for comparison. Absent is NOT a match for anything. */
function code(c: string | null | undefined): string | null {
  const v = String(c ?? '').trim().toUpperCase();
  return v.length === 3 ? v : null;
}

export function comparePrices(input: {
  ours: number | null | undefined;
  oursCurrency: string | null | undefined;
  theirs: number | null | undefined;
  theirsCurrency: string | null | undefined;
}): PriceComparison {
  // `null` must not become 0: `Number(null)` is 0, and 0 is a price a competitor could plausibly
  // have. Absent and free are different answers.
  if (input.ours == null || input.theirs == null) return { kind: 'unknown' };
  const ours = Number(input.ours);
  const theirs = Number(input.theirs);
  if (!Number.isFinite(ours) || ours <= 0) return { kind: 'unknown' };
  if (!Number.isFinite(theirs) || theirs < 0) return { kind: 'unknown' };

  const a = code(input.oursCurrency);
  const b = code(input.theirsCurrency);
  // An unknown currency on either side is not "probably the same" — that assumption is the whole
  // defect, and it is exactly what the `currency = 'USD'` default was doing.
  if (!a || !b) return { kind: 'unknown' };
  if (a !== b) return { kind: 'incomparable', reason: 'currency', ours: a, theirs: b };

  return { kind: 'pct', value: ((theirs - ours) / ours) * 100 };
}

/** What to show where the percentage would have gone. Formatting only. */
export function comparisonLabel(c: PriceComparison): string | null {
  if (c.kind === 'pct') return `${c.value > 0 ? '+' : ''}${c.value.toFixed(1)}%`;
  if (c.kind === 'incomparable') return `${c.theirs} vs ${c.ours}`;
  return null;
}

/**
 * A symbol for a currency, or the ISO code when we do not have one (#360 CB-14).
 *
 * The component had `c === 'EUR' ? '€' : c === 'GBP' ? '£' : '$'` — so every currency it did not
 * recognise, INCLUDING a missing one, rendered as dollars. On a platform that prices in euro that
 * is not a cosmetic default; it is a wrong figure stated confidently. An ISO code is uglier and
 * true.
 */
export function currencySymbol(c: string | null | undefined): string {
  switch (code(c)) {
    case 'EUR': return '€';
    case 'GBP': return '£';
    case 'USD': return '$';
    case null: return '';
    default: return `${code(c)} `;
  }
}
