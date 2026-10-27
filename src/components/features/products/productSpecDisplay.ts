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
