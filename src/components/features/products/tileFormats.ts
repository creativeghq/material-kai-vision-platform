import { parseFormatText } from '@/components/features/roomplanner/surfaceFormat';

export interface TileFormatCm {
  widthCm: number;
  heightCm: number;
  label: string;
}

/** Smallest and largest side a tile, plank or slab plausibly has; OCR fragments like "4x57" fall outside. */
const MIN_SIDE_CM = 5;
const MAX_SIDE_CM = 400;

const cm = (m: number): number => Math.round(m * 1000) / 10;
const num = (n: number): string => (Number.isInteger(n) ? String(n) : n.toFixed(1).replace(/\.0$/, ''));

function parseOne(value: unknown): TileFormatCm | null {
  let text: unknown = value;
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const o = value as Record<string, unknown>;
    if (o.metric_cm) text = `${String(o.metric_cm)} cm`;
    else if (o.width && o.height) text = `${String(o.width)}x${String(o.height)} ${typeof o.unit === 'string' ? o.unit : 'cm'}`;
    else text = o.format ?? o.size ?? o.value;
  }
  // A size split across lines is a table cell the OCR broke, not a format.
  if (typeof text !== 'string' || /\n/.test(text)) return null;
  const f = parseFormatText(text);
  if (!f) return null;
  const widthCm = cm(f.tileWidthM);
  const heightCm = cm(f.tileLengthM);
  if ([widthCm, heightCm].some(s => s < MIN_SIDE_CM || s > MAX_SIDE_CM)) return null;
  return { widthCm, heightCm, label: `${num(widthCm)}×${num(heightCm)}` };
}

/** Every distinct plausible format in `sources`, smallest area first. 30×90 and 90×30 are one format. */
export function tileFormats(...sources: unknown[]): TileFormatCm[] {
  const seen = new Map<string, TileFormatCm>();
  for (const source of sources) {
    const list = Array.isArray(source) ? source : typeof source === 'string' ? source.split(/[,;]/) : [source];
    for (const value of list) {
      const f = parseOne(value);
      if (!f) continue;
      const key = [f.widthCm, f.heightCm].sort((a, b) => a - b).join('x');
      if (!seen.has(key)) seen.set(key, f);
    }
  }
  return [...seen.values()].sort((a, b) => a.widthCm * a.heightCm - b.widthCm * b.heightCm);
}
