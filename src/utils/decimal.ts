/**
 * Money primitives shared by every module: PARSE what the user typed, ROUND it to cents, FORMAT it
 * for display. They live together, outside any feature module, because finance is not the only
 * place that handles money — quotes, projects, orders, blueprints, trip expenses and warehouse
 * pricing all do, and none of them should import from finance to round or print a number.
 *
 * ── Parsing ───────────────────────────────────────────────────────────────────────────────────
 * Locale-tolerant decimal parsing for money / quantity / rate inputs.
 *
 * Greek / EU users type amounts like `2.249,86` (dot = thousands separator,
 * comma = decimal) which `parseFloat` mangles into `2.249` — silently turning
 * €2,249.86 into €2.25. `<input type="number">` rejects that format outright
 * (the browser hands back an empty string). Both lose money.
 *
 * `parseDecimal` accepts every common shape and normalizes to a JS number:
 *
 *   "2.249,86"      -> 2249.86   (EU: dot thousands, comma decimal)
 *   "2,249.86"      -> 2249.86   (US: comma thousands, dot decimal)
 *   "1.234.567,89"  -> 1234567.89
 *   "2249,86"       -> 2249.86   (lone comma = decimal)
 *   "2249.86"       -> 2249.86   (lone dot   = decimal)
 *   "12.999"        -> 12.999    (lone dot   = decimal — keeps 3-dp DB values intact)
 *   "1.234.567"     -> 1234567   (repeated dot = grouping)
 *   "1,234,567"     -> 1234567   (repeated comma = grouping)
 *   "€ 1.500,50"    -> 1500.5    (currency symbols / spaces stripped)
 *   "-2.249,86"     -> -2249.86
 *
 * Disambiguation rules:
 *  - Both `.` and `,` present  -> the LAST one is the decimal separator,
 *    the other is the thousands separator. (Unambiguous, AADE-safe.)
 *  - Only one separator type, appearing ONCE -> it is the decimal separator.
 *    This deliberately keeps already-normalized values (e.g. "12.999" from the
 *    DB, a 3-decimal price) exactly intact, so the parser is a safe superset
 *    of `parseFloat` for machine-formatted numbers.
 *  - Only one separator type, appearing MORE THAN ONCE -> grouping separator
 *    (e.g. "1.234.567"), so the result is an integer.
 *
 * Returns `null` for empty / non-numeric input so callers can distinguish
 * "nothing entered" from "0".
 */
export function parseDecimal(raw: unknown): number | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;

  // Keep only digits, separators and a leading sign; drop currency symbols, spaces, %, etc.
  let s = String(raw).trim().replace(/[^\d.,\-]/g, '');
  if (!s) return null;

  const negative = s.startsWith('-');
  s = s.replace(/-/g, '');
  if (!s) return null;

  const hasDot = s.includes('.');
  const hasComma = s.includes(',');

  if (hasDot && hasComma) {
    // Last-seen separator is the decimal point.
    const decimalSep = s.lastIndexOf(',') > s.lastIndexOf('.') ? ',' : '.';
    const thousandsSep = decimalSep === ',' ? '.' : ',';
    s = s.split(thousandsSep).join('').replace(decimalSep, '.');
  } else if (hasComma) {
    s = (s.match(/,/g) || []).length > 1 ? s.split(',').join('') : s.replace(',', '.');
  } else if (hasDot) {
    // Repeated dots = grouping; a single dot stays as the decimal point.
    if ((s.match(/\./g) || []).length > 1) s = s.split('.').join('');
  }

  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return negative ? -n : n;
}

/**
 * Same as {@link parseDecimal} but returns `fallback` (default 0) instead of
 * null — a drop-in replacement for `parseFloat(x) || 0` at compute/submit sites.
 */
export function parseDecimalOr(raw: unknown, fallback = 0): number {
  const n = parseDecimal(raw);
  return n === null ? fallback : n;
}

/**
 * Round to 2 decimals (currency). THE rounding function for money — import it, never re-declare it.
 *
 * The epsilon nudge is the whole point. `Math.round(1.005 * 100) / 100` is 1.00, because 1.005 is
 * stored as 1.00499999999999989…; nudging by one ULP first makes it 1.01, which is what a half-up
 * cent rounding is supposed to do. Twelve copies of this existed and only two of them nudged, so
 * the same subtotal rounded differently depending on which file computed it — the identical drift
 * `escapeHtml` had before it was made canonical.
 *
 * Lives here, not in the finance module: quotes, orders, blueprints, trip expenses and warehouse
 * pricing all round money, and none of them should have to import from finance to do it.
 */
export function round2(n: number): number {
  return Math.round(((Number(n) || 0) + Number.EPSILON) * 100) / 100;
}

/**
 * Format a money value for display. THE money formatter — import it, never re-declare it.
 *
 * The locale is pinned to `en-IE` on purpose: English is the platform default for all UI and
 * documents, and a euro amount must look the same to every user. Five copies of this existed in
 * the projects module passing `undefined` as the locale, so the SAME amount rendered "€1,234.56"
 * on one screen and "1.234,56 €" on another depending on the viewer's browser language.
 *
 * `null`/`undefined` renders as an em dash — "we don't know" is not the same as zero, and zero
 * still prints as a real amount (one of the replaced copies returned the dash for 0 as well,
 * because it tested falsiness).
 */
/**
 * Plain number for display — thousand separators, no currency.
 *
 * The third pinned formatter, for the same reason as the other two. `n.toLocaleString()` uses the
 * BROWSER's locale, so "1,234" for one user and "1.234" for another — and at a glance those are a
 * thousand apart. 164 call sites were doing exactly that: credit balances, row counts, KPI tiles.
 *
 * `en-US` matches `formatDate`'s pin. It makes no visible difference against `formatMoney`'s
 * `en-IE` — both group as `1,234.56` — but it is pinned rather than left to agree by accident.
 *
 * `null`/`undefined` renders as an em dash: "we don't know" is not zero, and zero still prints as
 * a real number.
 */
export function formatNumber(
  value: number | null | undefined,
  opts: { decimals?: number; maxDecimals?: number; fallback?: string } = {},
): string {
  if (value == null || (typeof value === 'number' && Number.isNaN(value))) {
    return opts.fallback ?? '—';
  }
  const min = opts.decimals ?? 0;
  const max = Math.max(opts.maxDecimals ?? Math.max(min, 2), min);
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: min,
    maximumFractionDigits: max,
  }).format(value);
}

export interface FormatMoneyOptions {
  /** Minimum fraction digits. 2 (accounting) by default; 0 for figures that read better whole,
   *  like a property asking price or a payroll total. */
  decimals?: number;
  /**
   * Maximum fraction digits, 2 by default. Set to 0 for figures that must render WHOLE — a
   * property asking price or a CMA comparable, where "€450,000.00" is noise. Added because the
   * call sites that needed it were each hand-rolling `Intl.NumberFormat` to get it, and every one
   * of them picked a different locale on the way (`undefined`, `en-GB`), which is the drift this
   * helper exists to prevent.
   */
  maxDecimals?: number;
  /** What `null`/`undefined` renders as. "—" by default; a listing might want "On request". */
  fallback?: string;
}

/**
 * Just the currency SYMBOL, for an input prefix where the operator types the number themselves
 * and `formatMoney` would format it out from under them. Lives here rather than beside the input,
 * because a second `Intl.NumberFormat({ style: 'currency' })` in the codebase is the drift this
 * module exists to prevent (#329). Falls back to the code itself for an unknown currency.
 */
export function currencySymbol(currency = 'EUR'): string {
  try {
    return new Intl.NumberFormat('en-IE', {
      style: 'currency', currency: currency || 'EUR', minimumFractionDigits: 0, maximumFractionDigits: 0,
    }).formatToParts(0).find((p) => p.type === 'currency')?.value ?? currency;
  } catch {
    return currency;
  }
}

export function formatMoney(
  value: number | null | undefined,
  currency = 'EUR',
  opts: FormatMoneyOptions = {},
): string {
  if (value == null) return opts.fallback ?? '—';
  const min = opts.decimals ?? 2;
  // Max never drops below min — Intl throws on that combination rather than clamping, and a
  // caller asking for `decimals: 2, maxDecimals: 0` means "whole", not "crash".
  const max = Math.max(opts.maxDecimals ?? 2, min);
  try {
    return new Intl.NumberFormat('en-IE', {
      style: 'currency',
      currency: currency || 'EUR',
      minimumFractionDigits: min,
      maximumFractionDigits: max,
    }).format(value);
  } catch {
    // Unknown/invalid currency code — Intl throws rather than degrading.
    return `${currency} ${Number(value).toFixed(min)}`;
  }
}
