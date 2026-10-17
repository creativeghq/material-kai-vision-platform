/**
 * A price-list number in either European ("1.234,56") or English ("1,234.56") notation. The
 * WHOLE string must be consumed: a partial parse is how "1.234,56" became 1.234. A lone
 * separator followed by exactly three digits ("1.234") could be either, so it is refused.
 */
export function parseLocaleNumber(raw: string): number | null {
  const s = String(raw ?? '')
    .replace(/[€$£  \s']/g, '')
    .replace(/^(EUR|USD|GBP)|(EUR|USD|GBP)$/i, '');
  if (!/^[+-]?\d[\d.,]*$/.test(s)) return null;
  const sign = s.startsWith('-') ? -1 : 1;
  const body = s.replace(/^[+-]/, '');
  const lastDot = body.lastIndexOf('.');
  const lastComma = body.lastIndexOf(',');

  let intPart: string;
  let fracPart = '';
  let thousands: string | null = null;
  if (lastDot >= 0 && lastComma >= 0) {
    const decimal = lastDot > lastComma ? '.' : ',';
    thousands = decimal === '.' ? ',' : '.';
    const at = body.lastIndexOf(decimal);
    intPart = body.slice(0, at);
    fracPart = body.slice(at + 1);
    if (intPart.includes(decimal)) return null;
  } else if (lastDot >= 0 || lastComma >= 0) {
    const sep = lastDot >= 0 ? '.' : ',';
    const count = body.split(sep).length - 1;
    if (count > 1) {
      thousands = sep;
      intPart = body;
    } else {
      const [a, b] = body.split(sep);
      if (b.length === 3) return null;
      intPart = a;
      fracPart = b;
    }
  } else {
    intPart = body;
  }

  if (thousands) {
    const groups = intPart.split(thousands);
    if (!/^\d{1,3}$/.test(groups[0]) || groups.slice(1).some((g) => !/^\d{3}$/.test(g))) return null;
    intPart = groups.join('');
  }
  if (!/^\d+$/.test(intPart) || !/^\d*$/.test(fracPart)) return null;
  const n = Number(fracPart ? `${intPart}.${fracPart}` : intPart);
  return Number.isFinite(n) ? sign * n : null;
}
