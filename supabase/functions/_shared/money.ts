/**
 * Money primitives for the Deno runtime — round it, print it.
 *
 * DELIBERATE CROSS-RUNTIME MIRROR of `src/utils/decimal.ts`, for the same reason
 * `_shared/fiscal/invoice-builder.ts` mirrors `VAT_PCT_TO_CATEGORY`: edge functions run on Deno
 * and cannot import a Vite-aliased module. Keep the two in step when either changes.
 *
 * Before this file, the edge side carried eight `round2` copies and twelve money formatters
 * (`money` ×8, `fmtMoney` ×4). Six of the eight `round2`s omitted the epsilon nudge, so a
 * half-cent rounded one way in `expense-math` and the other in `quote-tools`. The formatters had
 * drifted across `en-IE`, `en-GB`, `en-US`, `el-GR`, hand-rolled symbol ladders, and a bare
 * `toFixed(2)` — one of them twice inside a single file.
 */

/**
 * Round to 2 decimals (currency).
 *
 * The epsilon nudge is load-bearing: `Math.round(1.005 * 100) / 100` is 1.00, because 1.005 is
 * stored as 1.00499999999999989. Nudging by one ULP first yields 1.01, which is what half-up cent
 * rounding means.
 */
export function round2(n: number): number {
  return Math.round(((Number(n) || 0) + Number.EPSILON) * 100) / 100;
}

export interface FormatMoneyOptions {
  /** Minimum fraction digits — 2 (accounting) by default, 0 for figures that read better whole. */
  decimals?: number;
  /** What null/undefined renders as. "—" by default. */
  fallback?: string;
}

/**
 * Format a money value for display. Locale pinned to `en-IE`, matching the frontend: English is
 * the platform default for all UI and documents, and one amount must read the same everywhere.
 */
export function formatMoney(
  value: number | null | undefined,
  currency = 'EUR',
  opts: FormatMoneyOptions = {},
): string {
  if (value == null || Number.isNaN(Number(value))) return opts.fallback ?? '—';
  const min = opts.decimals ?? 2;
  try {
    return new Intl.NumberFormat('en-IE', {
      style: 'currency',
      currency: currency || 'EUR',
      minimumFractionDigits: min,
      maximumFractionDigits: 2,
    }).format(Number(value));
  } catch {
    // Unknown/invalid currency code — Intl throws rather than degrading.
    return `${currency} ${Number(value).toFixed(min)}`;
  }
}

/**
 * Format for a customer-facing document that is rendered in a chosen language.
 *
 * Only for surfaces that genuinely carry a `lang` (statements, digests). Everything else uses
 * {@link formatMoney} — "which locale?" is not a question a caller should be answering per call.
 *
 * NOTE: `finance-invoice-pdf` deliberately does NOT use this. It prints "1,234.56 €" — amount then
 * symbol — which no Intl currency style produces for English, and it is a fiscal document whose
 * layout must not shift underneath already-issued invoices.
 */
export function formatMoneyLocalized(value: number, currency = 'EUR', lang: 'el' | 'en' = 'el'): string {
  const locale = lang === 'el' ? 'el-GR' : 'en-IE';
  try {
    return new Intl.NumberFormat(locale, { style: 'currency', currency: currency || 'EUR', maximumFractionDigits: 2 })
      .format(Number(value) || 0);
  } catch {
    return `${currency} ${(Number(value) || 0).toFixed(2)}`;
  }
}
