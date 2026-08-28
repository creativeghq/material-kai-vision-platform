/**
 * Catalog line arithmetic — ONE derivation, in one place (#352 A13).
 *
 * A catalog line prints three figures the reader can add up: a unit `price`, a `discount`, and a
 * `net`. `adjust_catalog_pricing` used to scale all three INDEPENDENTLY by the same factor, each
 * rounded to 2dp on its own, and they stopped reconciling. The audit's worked case:
 *
 *     before   price 33.33  x qty 3  −  discount 10.00  =  net  89.99
 *     retarget to net 100
 *     after    price 37.04  x qty 3  −  discount 11.11  =  net 100.01   (stored: 100.00)
 *
 * Every one of those is a valid number, so nothing raises and no typecheck can see it. The
 * customer's document simply does not add up — the rule 1c failure, "every figure the reader can
 * add up must add up".
 *
 * WHY THIS IS A SEPARATE MODULE. It was inline in a tool closure, which is why it could be wrong
 * for as long as it was: there was nowhere to put the worked example. This file is import-free
 * and pure, so `tests/unit/catalogRepricing.test.ts` runs the exact numbers above. Money
 * arithmetic that no test can reach is money arithmetic nobody has checked.
 *
 * NOT a competitor to `get_order_settlements` and the SQL-derives rule. A catalog body is a JSON
 * document, not a set of ledger rows — there is no SQL source to derive from. What the rule
 * demands here is the part that IS applicable: one independent figure per line, everything else
 * derived from it, never three parallel numbers kept in step by hand.
 */

/** Round to cents. Money is never carried at full float precision between steps. */
export const r2 = (n: number): number => Math.round(n * 100) / 100;

export interface CatalogLine {
  /** Unit price. `null` when the line prints only a net value. */
  price: number | null;
  quantity: number;
  /** Discount percentage, when the line is expressed that way. */
  discountPct: number;
  /** Discount amount. `null` when the line has never carried one. */
  discountValue: number | null;
  net: number;
}

/**
 * Recompute a line's discount and net from its unit price.
 *
 * The unit price is the INDEPENDENT figure: it is what the operator sets and what the customer
 * checks. `gross = price x qty`, the discount is a percentage of that gross, and net is what
 * remains. Returns the line unchanged when there is no unit price — then `net` is itself the
 * independent figure and nothing printed can contradict it.
 */
export function rederiveFromUnitPrice(line: CatalogLine): CatalogLine {
  if (line.price == null) return line;
  const gross = r2(line.price * line.quantity);
  const discountValue = (line.discountValue != null || line.discountPct > 0)
    ? r2(gross * line.discountPct / 100)
    : line.discountValue;
  return { ...line, discountValue, net: r2(gross - Number(discountValue ?? 0)) };
}

/** Does this line's own arithmetic hold? The property the whole module exists to keep true. */
export function lineReconciles(line: CatalogLine): boolean {
  if (line.price == null) return true;
  return r2(r2(line.price * line.quantity) - Number(line.discountValue ?? 0)) === r2(line.net);
}

/**
 * Move one line's net by exactly `step`, keeping its printed figures consistent.
 *
 * Returns null when this line cannot absorb it, so the caller tries the next. Net goes UP when
 * the discount goes DOWN, and a discount is NEVER pushed below zero to win a rounding cent — a
 * negative discount prints as a surcharge in the Discount column, which is a worse lie than the
 * one this module removes.
 */
export function absorbCent(line: CatalogLine, step: number): CatalogLine | null {
  if (line.price == null) return { ...line, net: r2(line.net + step) };
  const discountValue = r2(Number(line.discountValue ?? 0) - step);
  if (discountValue < 0) return null;
  return { ...line, discountValue, net: r2(r2(line.price * line.quantity) - discountValue) };
}

/**
 * Scale a set of lines to a target net total, keeping every line's figures consistent.
 *
 * Returns the scaled lines and any remainder that could not be absorbed. A leftover remainder is
 * REPORTED rather than forced: a catalog whose lines all carry a zero discount cannot land on an
 * exact cent without breaking a printed figure, and being one cent off a target is far better
 * than a document whose own arithmetic disagrees.
 */
export function scaleToTargetNet(
  lines: CatalogLine[],
  targetNet: number,
): { lines: CatalogLine[]; remainderCents: number } {
  const currentNet = r2(lines.reduce((a, l) => a + l.net, 0));
  if (currentNet <= 0) return { lines, remainderCents: 0 };
  const factor = targetNet / currentNet;

  let out = lines.map((l) => {
    if (l.price == null) {
      return {
        ...l,
        net: r2(l.net * factor),
        discountValue: l.discountValue != null ? r2(l.discountValue * factor) : l.discountValue,
      };
    }
    return rederiveFromUnitPrice({ ...l, price: r2(l.price * factor) });
  });

  let remainderCents = Math.round((targetNet - out.reduce((a, l) => a + l.net, 0)) * 100);
  // Largest lines first: a cent is least visible where the numbers are biggest.
  const order = out
    .map((l, idx) => ({ idx, net: l.net }))
    .sort((a, b) => b.net - a.net)
    .map((x) => x.idx);

  // Bounded on BOTH counts: one cent per successful absorb, and at most one full pass over the
  // lines per cent when some refuse. Without the second bound, a catalog whose lines all have a
  // zero discount would spin forever.
  let attempts = 0;
  const maxAttempts = Math.abs(remainderCents) * order.length + order.length;
  let i = 0;
  while (remainderCents !== 0 && order.length > 0 && attempts < maxAttempts) {
    attempts++;
    const step = remainderCents > 0 ? 0.01 : -0.01;
    const idx = order[i % order.length];
    const moved = absorbCent(out[idx], step);
    if (moved) {
      out = out.map((l, k) => (k === idx ? moved : l));
      remainderCents += remainderCents > 0 ? -1 : 1;
    }
    i++;
  }

  return { lines: out, remainderCents };
}
