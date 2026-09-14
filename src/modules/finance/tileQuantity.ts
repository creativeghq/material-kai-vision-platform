/**
 * Room dimensions to square metres (#436).
 *
 * The counter's most repeated action: "it's 4.2 by 3.6, and there's a hallway". Only the GEOMETRY
 * lives here — the cut allowance and the rounding to whole boxes are derived once, in SQL, by
 * `tile_line_quantity`, so the figure on the screen and the figure on the order are the same one.
 *
 * Import-free on purpose: it is arithmetic, and a test should not need a database to check it.
 */

export type LengthUnit = 'm' | 'cm' | 'mm';

export interface RoomArea {
  /** Along one wall. */
  length: number;
  /** Along the other. */
  width: number;
  /** How many rooms of this size. Defaults to one. */
  count?: number;
  unit?: LengthUnit;
  label?: string;
}

const TO_METRES: Record<LengthUnit, number> = { m: 1, cm: 0.01, mm: 0.001 };

/**
 * One room's area in square metres.
 *
 * Returns null rather than 0 for an unusable dimension. A zero area reads as "this room needs no
 * tiles", which is a different and much quieter wrong answer than "you have not told me the size".
 */
export function roomArea(r: RoomArea): number | null {
  const f = TO_METRES[r.unit ?? 'm'];
  const l = Number(r.length) * f;
  const w = Number(r.width) * f;
  const n = r.count == null ? 1 : Number(r.count);
  if (!Number.isFinite(l) || !Number.isFinite(w) || !Number.isFinite(n)) return null;
  if (l <= 0 || w <= 0 || n <= 0) return null;
  return round4(l * w * n);
}

/**
 * The total across several rooms.
 *
 * A room that could not be measured is REPORTED, not skipped: dropping it silently gives a
 * confident total for a job that is bigger than the number says.
 */
export function totalArea(rooms: RoomArea[]): { area: number; unusable: number } {
  let area = 0;
  let unusable = 0;
  for (const r of rooms) {
    const a = roomArea(r);
    if (a == null) unusable += 1;
    else area += a;
  }
  return { area: round4(area), unusable };
}

/** Two decimals is a shop-floor measurement; four is where the arithmetic is kept. */
export function round4(n: number): number {
  return Math.round((n + Number.EPSILON) * 10000) / 10000;
}

/**
 * A dimension string a person can read back, e.g. "4.2 × 3.6 m × 2".
 *
 * Stored on the line so the quantity can be checked a month later against what was measured,
 * rather than being a number nobody can re-derive.
 */
export function describeRooms(rooms: RoomArea[]): string {
  return rooms
    .map((r) => {
      const n = r.count == null || r.count === 1 ? '' : ` × ${r.count}`;
      const u = r.unit ?? 'm';
      const label = r.label ? `${r.label}: ` : '';
      return `${label}${r.length} × ${r.width} ${u}${n}`;
    })
    .join('; ');
}
