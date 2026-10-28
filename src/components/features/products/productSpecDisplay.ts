import { parseDecimal } from '@/utils/decimal';

function unwrap(v: unknown): unknown {
  if (v && typeof v === 'object' && !Array.isArray(v) && 'value' in (v as Record<string, unknown>)) {
    return (v as Record<string, unknown>).value;
  }
  return v;
}

export interface NumericSet {
  min: number;
  max: number;
  values: number[];
}

/** A scalar, a list, or a per-SKU map of numbers, folded to its distinct sorted values. */
export function numericSet(raw: unknown): NumericSet | null {
  const v = unwrap(raw);
  const items: unknown[] = Array.isArray(v)
    ? v
    : v && typeof v === 'object'
      ? Object.values(v as Record<string, unknown>)
      : [v];
  const nums = items
    .map(i => parseDecimal(unwrap(i) as string | number | null | undefined))
    .filter((n): n is number => n !== null && n > 0);
  if (nums.length === 0) return null;
  const values = Array.from(new Set(nums)).sort((a, b) => a - b);
  return { min: values[0], max: values[values.length - 1], values };
}

export function formatRange(set: NumericSet, unit: string): string {
  const u = unit ? ` ${unit}` : '';
  return set.min === set.max ? `${set.min}${u}` : `${set.min} – ${set.max}${u}`;
}

/** Per-SKU maps ({ "KRCA 700.600": "300", … }) read as a range instead of an 18-entry sentence. */
export function summariseSkuMap(raw: unknown, unit = ''): string | null {
  const v = unwrap(raw);
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
  const vals = Object.values(v as Record<string, unknown>);
  if (vals.length < 2) return null;
  const set = numericSet(v);
  if (!set || set.values.length === 0 || vals.some(x => typeof unwrap(x) === 'object')) return null;
  return formatRange(set, unit);
}

const NOISE_KEYS = new Set([
  'page', 'pages', 'page_range', 'page_number', 'page_numbers', 'start_page', 'end_page',
  'image_indices', 'image_index', 'confidence', 'unit', 'per_variant', 'chunk_index',
  'source', 'source_page', 'material_category', 'zone_intent',
  'notes', 'note', 'extraction_notes', 'dimensionalaesthetic',
]);

/** Extraction bookkeeping — never a property of the product itself. */
export function isNoiseSpecKey(key: string): boolean {
  const k = key.toLowerCase();
  return NOISE_KEYS.has(k) || k.startsWith('_') || /(^|_)pages?($|_)/.test(k) || k.endsWith('_source');
}

/** Contact details of the manufacturer, not specifications of the product. */
export function isContactKey(key: string): boolean {
  return /(^|_)(e_?mail|website|web|url|phone|telephone|tel|fax)($|_)/.test(key.toLowerCase());
}

const COMPLIANCE_FLAGS: Array<{ re: RegExp; label: string }> = [
  { re: /^en_?442_(compliant|compliance)$/, label: 'EN 442' },
  { re: /^din_?55_?900_(compliant|compliance)$/, label: 'DIN 55 900' },
];

export function complianceFlagLabel(key: string): string | null {
  const k = key.toLowerCase();
  return COMPLIANCE_FLAGS.find(f => f.re.test(k))?.label ?? null;
}

export function isAffirmative(raw: unknown): boolean {
  const v = unwrap(raw);
  if (v === true) return true;
  return typeof v === 'string' && /^(yes|true|y|1)$/i.test(v.trim());
}

/** Keys the Dimensions card owns, so the leftover grids never repeat them. */
export const DIMENSION_KEYS = [
  'width_mm', 'height_mm', 'depth_mm', 'length_mm', 'diameter_mm', 'thickness_mm',
  'weight_kg', 'sections', 'available_sizes', 'dimensions', 'size',
] as const;

const SMALL_WORDS = new Set(['and', 'or', 'of', 'in', 'on', 'for', 'to', 'with', 'the', 'a', 'an', 'at', 'by', 'per']);
const UNIT_WORDS = new Set([
  'mm', 'cm', 'm', 'kg', 'g', 'w', 'kw', 'l', 'ml', 'bar', 'pa', 'kpa', 'v', 'hz', 'a',
  'year', 'years', 'month', 'months', 'day', 'days', 'pcs', 'pc', 'h', 'min',
]);

const splitCompounds = (s: string): string => s.replace(/_+/g, ' ').replace(/(?<=\p{Ll})-(?=\p{Ll})/gu, ' ');
const capitalise = (w: string): string => (w ? w[0].toUpperCase() + w.slice(1) : w);

/**
 * The one way a value from the data reaches the screen: `wall-mounted` reads Wall Mounted,
 * `design radiator` Design Radiator, `false` False. Long sentences keep their wording and
 * only gain a capital; codes, units, URLs and tokens already in capitals are left alone.
 */
export function displayValue(input: string): string {
  const s = input.trim();
  if (!s) return s;
  if (/:\/\/|^www\.|@|^#|^\d/.test(s)) return s;
  const parts = s.split(/\s*,\s*/);
  if (parts.length > 1 && parts.every(p => p.split(/\s+/).length <= 4)) return parts.map(displayValue).join(', ');
  if (s.split(/\s+/).length > 6 || /[.;:!?]\s/.test(s)) return capitalise(s);
  const words = splitCompounds(s).split(/\s+/);
  return words
    .map((w, i) => {
      if (!/^\p{Ll}/u.test(w)) return w;
      if (i > 0 && SMALL_WORDS.has(w)) return w;
      if (i > 0 && UNIT_WORDS.has(w) && /\d/.test(words[i - 1])) return w;
      return w.split('/').map(capitalise).join('/');
    })
    .join(' ');
}

/** Colour and pattern names: shouted words are folded to Title Case, acronyms and codes kept (RAL 9016). */
export function titleCaseDisplay(input: string): string {
  return splitCompounds(input.trim())
    .split(/\s+/)
    .map(w => (/^\p{Lu}{2,3}$/u.test(w) || /\d/.test(w) ? w : capitalise(w.toLowerCase())))
    .join(' ');
}

export function humanKey(k: string): string {
  const s = k.replace(/_+/g, ' ').trim();
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}

/** Any stored value as text: nested objects read "Up to 2000 mm: 2; 2001 to 3000 mm: 3", never [object Object]. */
export function describeValue(raw: unknown): string | null {
  const v = unwrap(raw);
  if (v === null || v === undefined) return null;
  if (typeof v === 'boolean') return v ? 'True' : 'False';
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : null;
  if (typeof v === 'string') return v.trim() === '' ? null : v.trim();
  if (Array.isArray(v)) {
    const parts = v.map(describeValue).filter((p): p is string => p !== null);
    if (parts.length > 1 && parts.every(p => /^-?\d+(?:[.,]\d+)?$/.test(p))) {
      const n = (p: string) => parseFloat(p.replace(',', '.'));
      return [...new Set(parts)].sort((a, b) => n(a) - n(b)).join(', ');
    }
    return parts.length ? parts.join(', ') : null;
  }
  if (typeof v === 'object') {
    const parts = Object.entries(v as Record<string, unknown>)
      .filter(([k]) => !isNoiseSpecKey(k))
      .map(([k, x]) => {
        const d = describeValue(x);
        return d === null ? null : `${humanKey(k)}: ${d}`;
      })
      .filter((p): p is string => p !== null);
    return parts.length ? parts.join('; ') : null;
  }
  return null;
}
