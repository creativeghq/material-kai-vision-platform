/** Product in Place (#474): the room reading Claude returns, its schema, and the check it must pass. */

export interface SpacePoint { x: number; y: number }

export interface PlaceSpace {
  floor_visible: boolean;
  horizon_y: number;
  scale_row_y: number;
  scale_span_m: number;
  scale_reference: string;
  floor_polygon: SpacePoint[];
  spots: SpacePoint[];
  confidence: 'high' | 'medium' | 'low';
}

const POINT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['x', 'y'],
  properties: { x: { type: 'number' }, y: { type: 'number' } },
} as const;

export const PLACE_SPACE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'floor_visible', 'horizon_y', 'scale_row_y', 'scale_span_m', 'scale_reference',
    'floor_polygon', 'spots', 'confidence',
  ],
  properties: {
    floor_visible: { type: 'boolean' },
    horizon_y: { type: 'number' },
    scale_row_y: { type: 'number' },
    scale_span_m: { type: 'number' },
    scale_reference: { type: 'string' },
    floor_polygon: { type: 'array', items: POINT_SCHEMA },
    spots: { type: 'array', items: POINT_SCHEMA },
    confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
  },
} as const;

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

function points(raw: unknown, max: number): SpacePoint[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((p): p is { x: number; y: number } =>
      !!p && typeof p === 'object' && Number.isFinite((p as SpacePoint).x) && Number.isFinite((p as SpacePoint).y))
    .slice(0, max)
    .map((p) => ({ x: clamp01(p.x), y: clamp01(p.y) }));
}

/** The reading, or null for no floor, a horizon below the scale row, or a span no room has. */
export function validatePlaceSpace(raw: unknown): PlaceSpace | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const h = Number(r.horizon_y);
  const row = Number(r.scale_row_y);
  const span = Number(r.scale_span_m);
  if (r.floor_visible !== true) return null;
  if (![h, row, span].every(Number.isFinite)) return null;
  if (h < -1 || h > 0.95 || row <= 0 || row > 1) return null;
  if (row - h < 0.05) return null;
  if (span < 0.3 || span > 30) return null;
  const confidence = r.confidence === 'high' || r.confidence === 'medium' ? r.confidence : 'low';
  const spots = points(r.spots, 4).filter((p) => p.y > h + 0.02);
  return {
    floor_visible: true,
    horizon_y: h,
    scale_row_y: row,
    scale_span_m: span,
    scale_reference: typeof r.scale_reference === 'string' ? r.scale_reference.slice(0, 120) : '',
    floor_polygon: points(r.floor_polygon, 8),
    spots,
    confidence,
  };
}
