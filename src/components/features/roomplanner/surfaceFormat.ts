/** What the 3D view drapes over a surface, and how big one piece of it is (#404 Phase 0.4). */
import { parseDecimal } from '@/utils/decimal';

export interface SurfaceTexture {
  /** Null when the product has no image at all; the format is still known. */
  url: string | null;
  /** A derived tileable albedo, the product photo stretched as one, or nothing. The label says which. */
  source: 'albedo' | 'photo' | 'none';
  tileWidthM: number;
  tileLengthM: number;
  /** 'default' means nobody recorded a format — the label says "assumed", never implies one. */
  formatSource: 'recorded' | 'default';
}

export type TileFormat = Pick<SurfaceTexture, 'tileWidthM' | 'tileLengthM' | 'formatSource'>;

/** The format a surface renders at when the product carries none. Stated, never implied. */
export const DEFAULT_TILE_M = 0.6;

const METRES_PER_UNIT: Record<string, number> = {
  mm: 0.001, cm: 0.01, m: 1, in: 0.0254, inch: 0.0254, '"': 0.0254, ft: 0.3048,
};

const unitFactor = (unit: unknown, fallback: string): number | null => {
  const u = (typeof unit === 'string' && unit.trim() ? unit : fallback).trim().toLowerCase();
  return METRES_PER_UNIT[u] ?? null;
};

const positive = (v: unknown): number | null => {
  const n = parseDecimal(v);
  return n !== null && n > 0 ? n : null;
};

/** Metres to the micron, so 190 mm is 0.19 and not 0.19000000000000003. */
const metres = (n: number, factor: number): number => Math.round(n * factor * 1e6) / 1e6;

const pair = (w: number | null, l: number | null, factor: number | null): TileFormat | null =>
  w && l && factor ? { tileWidthM: metres(w, factor), tileLengthM: metres(l, factor), formatSource: 'recorded' } : null;

const obj = (v: unknown): Record<string, unknown> =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};

/** "60x60", "60 × 120 cm", "320x160 cm", "12x24 in" → a format. The unit defaults to cm. */
export function parseFormatText(text: unknown): TileFormat | null {
  if (typeof text !== 'string') return null;
  const m = text.match(/(\d+(?:[.,]\d+)?)\s*[x×X]\s*(\d+(?:[.,]\d+)?)\s*(mm|cm|m|in|inch|ft|")?/);
  if (!m) return null;
  return pair(positive(m[1]), positive(m[2]), unitFactor(m[3], 'cm'));
}

/**
 * One piece's format in metres, read where the pipeline writes it: the registry's tile fields in
 * `attributes` or the `metadata.dimensions` section (with the registry's unit dropdown, cm when
 * absent), the roll and plank fields whose unit is in their name, then the structured sizes and
 * the "60x60" strings the extractors emit. The registry carries no unit column, so the units
 * here are the convention the seeds use — a bare 60x60 is centimetres.
 */
export function tileFormatM(row: { attributes?: unknown; metadata?: unknown }): TileFormat {
  const attributes = obj(row.attributes);
  const metadata = obj(row.metadata);
  const dims = obj(metadata.dimensions);

  for (const src of [attributes, dims, metadata]) {
    const f = pair(positive(src.width), positive(src.length), unitFactor(src.dimension_unit ?? src.unit, 'cm'));
    if (f) return f;
  }

  const rollW = positive(attributes.roll_width_cm ?? metadata.roll_width_cm);
  const rollL = positive(attributes.roll_length_m ?? metadata.roll_length_m);
  if (rollW && rollL) return { tileWidthM: rollW / 100, tileLengthM: rollL, formatSource: 'recorded' };

  const plank = pair(
    positive(attributes.plank_width_mm ?? metadata.plank_width_mm),
    positive(attributes.plank_length_mm ?? metadata.plank_length_mm),
    0.001,
  );
  if (plank) return plank;

  const sizes = metadata.available_sizes ?? metadata.dimensions;
  const first: unknown = Array.isArray(sizes) ? sizes[0] : sizes;
  if (first && typeof first === 'object') {
    const o = first as Record<string, unknown>;
    const f = pair(positive(o.width), positive(o.height ?? o.length), unitFactor(o.unit, 'cm'));
    if (f) return f;
  }
  for (const text of [first, metadata.dimensions_cm_from_vision, attributes.slab_size ?? metadata.slab_size]) {
    const f = parseFormatText(text);
    if (f) return f;
  }

  return { tileWidthM: DEFAULT_TILE_M, tileLengthM: DEFAULT_TILE_M, formatSource: 'default' };
}

/** "60 × 60 cm", then "assumed" when defaulted, "photo" when a product photo is being tiled, "no image". */
export function tileFormatLabel(t: SurfaceTexture): string {
  const cm = (m: number) => String(Math.round(m * 1000) / 10);
  const parts = [`${cm(t.tileWidthM)} × ${cm(t.tileLengthM)} cm`];
  if (t.formatSource === 'default') parts.push('assumed');
  if (t.source === 'photo') parts.push('photo');
  if (t.source === 'none') parts.push('no image');
  return parts.join(' · ');
}
