/**
 * Money primitives shared by every module: PARSE what the user typed, ROUND it to cents, FORMAT it
 * for display. They live together, outside any feature module, because finance is not the only
 * place that handles money — quotes, projects, orders, blueprints, trip expenses and warehouse
 * pricing all do, and none of them should import from finance to round or print a number.
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

/** Round to 2 decimals (currency). THE rounding function for money — import it, never re-declare it. */
export function round2(n: number): number {
  return Math.round(((Number(n) || 0) + Number.EPSILON) * 100) / 100;
}

/** Format a money value for display. THE money formatter — import it, never re-declare it. */
/** Plain number for display — thousand separators, no currency. */
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
