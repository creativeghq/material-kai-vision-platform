/**
 * Do the lines somebody typed add up to what AADE says the document is worth?
 *
 * This is the one rule that makes complete-the-document safe. `total_net` is transmitted, carries
 * a MARK and is not editable; the lines are ours. If they disagree, the document states two
 * different amounts for the same purchase — and both are valid numbers, so nothing downstream
 * can tell which is the real one. Warehouse intake would derive unit costs from the typed side
 * and payables from the AADE side, and the two would quietly part company.
 *
 * `inbound_doc_set_lines` is the AUTHORITY — it re-checks all of this server-side and refuses the
 * write. This module exists so the dialog can say so before the operator presses save, using the
 * same tolerance, so the button is never enabled on something the server will reject.
 */

import { round2 } from '@/utils/decimal';

/** Editable shape in the dialog. Narrower than `InboundDocLine`: `line_number` is assigned on
 *  save (position is the number) and `comments` is not something anybody types here. */
export interface DraftLine {
  item_description: string;
  /** Canonical unit key from `src/lib/units.ts` — converted to the AADE code on save. */
  unit: string | null;
  item_code: string | null;
  quantity: number | null;
  net_value: number | null;
  vat_category: number | null;
  vat_amount: number | null;
}

export interface FootingVerdict {
  /** Sum of every line's net, rounded to the cent. */
  linesTotal: number;
  /** What the document states. Null when AADE sent no net at all. */
  target: number | null;
  /** linesTotal − target. Positive = the lines claim more was spent than the document says. */
  difference: number;
  /** True only when this set may be saved. */
  foots: boolean;
  /** Why not, in the operator's words. Null when it foots. */
  problem: string | null;
}

/**
 * One cent, matching `inbound_doc_set_lines`. Enough to absorb a single rounding step off the
 * supplier's own PDF, far too little to hide a transcription error — those are never a cent.
 */
export const FOOTING_TOLERANCE = 0.01;

/** Lines with nothing typed in them yet are ignored rather than counted as errors — the grid
 *  always shows a blank row to type into, and a blank row is not a mistake. */
export const isBlankLine = (l: DraftLine): boolean =>
  !l.item_description.trim() && l.net_value == null && l.quantity == null;

export function footLines(lines: DraftLine[], targetNet: number | null | undefined): FootingVerdict {
  const real = lines.filter((l) => !isBlankLine(l));
  const linesTotal = round2(real.reduce((sum, l) => sum + (l.net_value ?? 0), 0));
  const target = targetNet == null ? null : round2(targetNet);
  const difference = round2(linesTotal - (target ?? 0));

  const fail = (problem: string): FootingVerdict =>
    ({ linesTotal, target, difference, foots: false, problem });

  if (target == null) {
    return fail('This document states no net total, so there is nothing to reconcile the lines against.');
  }
  if (real.length === 0) {
    return fail('Add at least one line.');
  }

  // Named before the arithmetic: a line with a value and no name cannot become a stock item
  // ("Line 3" is not a product), and it is the exact thing `lines_source` exists to exclude.
  const unnamed = real.findIndex((l) => !l.item_description.trim());
  if (unnamed >= 0) return fail(`Line ${unnamed + 1} has a value but no description.`);

  const valueless = real.findIndex((l) => l.net_value == null);
  if (valueless >= 0) return fail(`Line ${valueless + 1} has no net value.`);

  const badQty = real.findIndex((l) => l.quantity != null && l.quantity <= 0);
  if (badQty >= 0) {
    return fail(`Line ${badQty + 1} has a quantity of ${real[badQty].quantity} — the unit cost cannot be worked out from that.`);
  }

  if (Math.abs(difference) > FOOTING_TOLERANCE) {
    const over = difference > 0;
    return fail(
      `The lines come to ${linesTotal.toFixed(2)} but the document states ${target.toFixed(2)} — ` +
      `${over ? 'over' : 'short'} by ${Math.abs(difference).toFixed(2)}.`,
    );
  }

  return { linesTotal, target, difference, foots: true, problem: null };
}
