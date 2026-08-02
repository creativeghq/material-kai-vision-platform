/**
 * VAT / currency math — the pure, hermetic core of the finance module.
 *
 * These functions are money- and compliance-sensitive (they decide the myDATA VAT
 * category stamped on every invoice / credit note / expense line), so they live in
 * one dependency-free module that `tests/unit/vatMath.test.ts` guards directly. No
 * supabase import, no I/O — importing this file must never touch the network or env.
 *
 * `financeService.ts` re-exports `round2` / `extractNet` from here (back-compat for the
 * components that import them from the service) and uses `vatCategory` for the credit-note
 * rate→category mapping, so this module is the SINGLE source of truth on the frontend.
 *
 * NOTE — deliberate cross-runtime mirror: `supabase/functions/_shared/fiscal/invoice-builder.ts`
 * carries its own copy of the same map (`VAT_PCT_TO_CATEGORY`) because it runs on Deno and
 * cannot import a Vite/node module. Keep the two maps identical when either changes.
 */

/**
 * Round to 2 decimals (currency). Canonical implementation lives in `@/utils/decimal` — money is
 * rounded outside finance too (quotes, blueprints, warehouse pricing), so the function cannot live
 * in a finance-only module. Imported AND re-exported here because `extractVat` below needs it in
 * scope, and because `financeService` re-exports it from this file for components that reach it
 * through that chain. `@/utils/decimal` is itself pure, so the no-I/O guarantee above still holds.
 */
import { round2 } from '@/utils/decimal';

export { round2 };

/** Net value of a VAT-inclusive gross amount at the given percentage. Unrounded. */
export function extractNet(gross: number, pct: number): number {
  return (Number(gross) || 0) / (1 + (Number(pct) || 0) / 100);
}

/**
 * VAT ON a VAT-EXCLUSIVE net, unrounded. The opposite direction to {@link extractVat}, which pulls
 * VAT out of a gross figure — confusing the two is a silent 24%-of-24% error, which is why both
 * live here side by side instead of being written out at each call site.
 *
 * Unrounded because some totals deliberately accumulate every line and round ONCE at the end
 * (NewInvoiceDialog does); rounding per line first shifts a multi-line invoice by a cent.
 */
export function vatOfRaw(net: number, pct: number): number {
  return (Number(net) || 0) * (Number(pct) || 0) / 100;
}

/**
 * VAT on a VAT-exclusive net, rounded to cents — what a STORED line carries in `vat_amount`.
 * This one line of arithmetic was open-coded in nine places.
 */
export function vatOf(net: number, pct: number): number {
  return round2(vatOfRaw(net, pct));
}

/** VAT portion of a VAT-inclusive gross amount at the given percentage, rounded to cents. */
export function extractVat(gross: number, pct: number): number {
  return round2((Number(gross) || 0) - extractNet(gross, pct));
}

/**
 * EXACT Greek VAT rate → myDATA category map.
 *   24→1, 13→2, 6→3, and the reduced-ISLAND rates 17→4, 9→5, 4→6, and 0→7.
 *
 * This MUST be an exact lookup, not a `>=` ladder: an ordered `pct >= 17 ? 4 : …`
 * ladder mislabels the island rates (a 9% line lands in the 13% band), which is a
 * real fiscal-transmission bug the credit-note path shipped once already.
 */
export const VAT_PCT_TO_CATEGORY: Readonly<Record<number, number>> = Object.freeze({
  24: 1, 13: 2, 6: 3, 17: 4, 9: 5, 4: 6, 0: 7,
});

/**
 * myDATA VAT category for a rate percentage. Unknown / non-standard rates fall back to
 * category 7 (0% / exempt) — the safe default the credit-note path uses, since emitting a
 * standard-rate category for an unrecognised percent would contradict the line's own rate.
 */
export function vatCategory(pct: number): number {
  return VAT_PCT_TO_CATEGORY[Math.round(Number(pct) || 0)] ?? 7;
}
