/**
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
