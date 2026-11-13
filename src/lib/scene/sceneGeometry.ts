export interface PlanRoom { id: string; name: string; outline: Array<[number, number]>; height_mm: number | null }
export interface PlanWall { id: string; x1_mm: number; y1_mm: number; x2_mm: number; y2_mm: number; thickness_mm: number; height_mm: number | null }
export interface PlanOpening { id: string; wall_id: string; kind: 'door' | 'window' | 'opening'; offset_mm: number; width_mm: number; sill_mm: number; head_mm: number }

export interface Bounds { minX: number; minY: number; maxX: number; maxY: number }

export function planBounds(rooms: Pick<PlanRoom, 'outline'>[], walls: Pick<PlanWall, 'x1_mm' | 'y1_mm' | 'x2_mm' | 'y2_mm'>[]): Bounds {
  const xs: number[] = [];
  const ys: number[] = [];
  for (const r of rooms) for (const [x, y] of r.outline) { xs.push(x); ys.push(y); }
  for (const w of walls) { xs.push(w.x1_mm, w.x2_mm); ys.push(w.y1_mm, w.y2_mm); }
  const finiteXs = xs.filter(Number.isFinite);
  const finiteYs = ys.filter(Number.isFinite);
  if (!finiteXs.length || !finiteYs.length) return { minX: 0, minY: 0, maxX: 4000, maxY: 4000 };
  return { minX: Math.min(...finiteXs), minY: Math.min(...finiteYs), maxX: Math.max(...finiteXs), maxY: Math.max(...finiteYs) };
}

export interface PlanFrame { cx: number; cy: number }

export const planFrame = (b: Bounds): PlanFrame => ({ cx: (b.minX + b.maxX) / 2, cy: (b.minY + b.maxY) / 2 });

export const toScene = (xMm: number, yMm: number, f: PlanFrame): [number, number] => [(xMm - f.cx) / 1000, (yMm - f.cy) / 1000];

export const toPlan = (x: number, z: number, f: PlanFrame): [number, number] => [Math.round(x * 1000 + f.cx), Math.round(z * 1000 + f.cy)];

export function rotationToScene(deg: number): number {
  const r = (-deg * Math.PI) / 180;
  return Number.isFinite(r) ? r + 0 : 0;
}

export function rotationToPlan(rad: number): number {
  const d = Math.round((-rad * 180) / Math.PI);
  return ((d % 360) + 360) % 360;
}

export interface WallPiece { center: [number, number, number]; length: number; height: number; thickness: number; rotationY: number }

export function wallPieces(wall: PlanWall, openings: PlanOpening[], f: PlanFrame, defaultHeightMm: number): WallPiece[] {
  const dx = wall.x2_mm - wall.x1_mm;
  const dy = wall.y2_mm - wall.y1_mm;
  const len = Math.hypot(dx, dy);
  if (!(len > 0)) return [];
  const ux = dx / len;
  const uy = dy / len;
  const height = (wall.height_mm ?? defaultHeightMm);
  const rotationY = -Math.atan2(dy, dx);
  const thickness = Math.max(wall.thickness_mm, 20) / 1000;

  const piece = (from: number, to: number, bottom: number, top: number): WallPiece | null => {
    if (to - from < 1 || top - bottom < 1) return null;
    const mid = (from + to) / 2;
    const [x, z] = toScene(wall.x1_mm + ux * mid, wall.y1_mm + uy * mid, f);
    return { center: [x, (bottom + top) / 2000, z], length: (to - from) / 1000, height: (top - bottom) / 1000, thickness, rotationY };
  };

  const cuts = openings
    .filter((o) => o.wall_id === wall.id)
    .map((o) => ({ from: Math.max(0, o.offset_mm), to: Math.min(len, o.offset_mm + o.width_mm), sill: Math.max(0, o.sill_mm), head: Math.min(height, o.head_mm) }))
    .filter((c) => c.to > c.from)
    .sort((a, b) => a.from - b.from);

  const out: WallPiece[] = [];
  let cursor = 0;
  for (const c of cuts) {
    const from = Math.max(c.from, cursor);
    if (from > cursor) out.push(piece(cursor, from, 0, height)!);
    if (c.to > from) {
      const below = piece(from, c.to, 0, c.sill);
      const above = piece(from, c.to, c.head, height);
      if (below) out.push(below);
      if (above) out.push(above);
    }
    cursor = Math.max(cursor, c.to);
  }
  if (cursor < len) out.push(piece(cursor, len, 0, height)!);
  return out.filter(Boolean);
}

export function openingPlacement(wall: PlanWall, o: PlanOpening, f: PlanFrame): { center: [number, number, number]; width: number; height: number; rotationY: number } {
  const dx = wall.x2_mm - wall.x1_mm;
  const dy = wall.y2_mm - wall.y1_mm;
  const len = Math.hypot(dx, dy) || 1;
  const mid = o.offset_mm + o.width_mm / 2;
  const [x, z] = toScene(wall.x1_mm + (dx / len) * mid, wall.y1_mm + (dy / len) * mid, f);
  return { center: [x, (o.sill_mm + o.head_mm) / 2000, z], width: o.width_mm / 1000, height: (o.head_mm - o.sill_mm) / 1000, rotationY: -Math.atan2(dy, dx) };
}

export function polygonCentroid(pts: Array<[number, number]>): [number, number] {
  let a = 0; let cx = 0; let cy = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x0, y0] = pts[i];
    const [x1, y1] = pts[(i + 1) % pts.length];
    const cross = x0 * y1 - x1 * y0;
    a += cross; cx += (x0 + x1) * cross; cy += (y0 + y1) * cross;
  }
  if (Math.abs(a) < 1e-6) {
    const n = pts.length || 1;
    return [pts.reduce((s, p) => s + p[0], 0) / n, pts.reduce((s, p) => s + p[1], 0) / n];
  }
  return [cx / (3 * a), cy / (3 * a)];
}

export function pointInPolygon(x: number, y: number, pts: Array<[number, number]>): boolean {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i];
    const [xj, yj] = pts[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}


export interface SizeMm { width_mm: number; depth_mm: number; height_mm: number }

const MM_PER_UNIT: Record<string, number> = { mm: 1, cm: 10, m: 1000, in: 25.4, inch: 25.4 };
const objOf = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {});
const pos = (v: unknown): number | null => {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number.parseFloat(v.replace(',', '.')) : NaN;
  return Number.isFinite(n) && n > 0 ? n : null;
};

export function productSizeMm(row: { attributes?: unknown; metadata?: unknown } | null | undefined): SizeMm | null {
  if (!row) return null;
  const attributes = objOf(row.attributes);
  const metadata = objOf(row.metadata);
  for (const src of [attributes, objOf(metadata.dimensions), metadata]) {
    const w = pos(src.width_mm); const d = pos(src.depth_mm); const h = pos(src.height_mm);
    if (w && d && h) return { width_mm: w, depth_mm: d, height_mm: h };
  }
  for (const src of [objOf(attributes.dimensions), objOf(metadata.dimensions)]) {
    const factor = MM_PER_UNIT[String(src.unit ?? 'cm').trim().toLowerCase()];
    const w = pos(src.width); const d = pos(src.depth ?? src.length); const h = pos(src.height);
    if (factor && w && d && h) return { width_mm: w * factor, depth_mm: d * factor, height_mm: h * factor };
  }
  return null;
}

export function effectiveSize(
  obj: SizeMm & { size_source: 'estimated' | 'manual' },
  product: { attributes?: unknown; metadata?: unknown } | null | undefined,
): SizeMm & { basis: 'product' | 'estimated' | 'manual' } {
  const p = productSizeMm(product);
  if (p) return { ...p, basis: 'product' };
  return { width_mm: obj.width_mm, depth_mm: obj.depth_mm, height_mm: obj.height_mm, basis: obj.size_source };
}


export function idColour(index: number): [number, number, number] {
  const h = ((index * 137.508) % 360) / 60;
  const s = 1; const v = index % 2 === 0 ? 1 : 0.78;
  const c = v * s;
  const x = c * (1 - Math.abs((h % 2) - 1));
  const [r, g, b] = h < 1 ? [c, x, 0] : h < 2 ? [x, c, 0] : h < 3 ? [0, c, x] : h < 4 ? [0, x, c] : h < 5 ? [x, 0, c] : [c, 0, x];
  return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
}

export const rgbToHex = ([r, g, b]: [number, number, number]): string =>
  `#${[r, g, b].map((n) => n.toString(16).padStart(2, '0')).join('')}`;

export function hexToRgb(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex.trim());
  return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : null;
}

export function maskForColour(rgba: Uint8ClampedArray | Uint8Array, rgb: [number, number, number], tolerance = 40): Uint8Array {
  const n = rgba.length / 4;
  const mask = new Uint8Array(n);
  const t2 = tolerance * tolerance;
  for (let i = 0; i < n; i++) {
    const dr = rgba[i * 4] - rgb[0];
    const dg = rgba[i * 4 + 1] - rgb[1];
    const db = rgba[i * 4 + 2] - rgb[2];
    if (dr * dr + dg * dg + db * db <= t2) mask[i] = 1;
  }
  return mask;
}

export function dilateMask(mask: Uint8Array, width: number, height: number, radius: number): Uint8Array {
  if (radius <= 0) return mask.slice();
  const tmp = new Uint8Array(mask.length);
  for (let y = 0; y < height; y++) {
    let run = -1;
    for (let x = 0; x < width; x++) if (mask[y * width + x]) run = x; else if (run >= 0 && x - run <= radius) tmp[y * width + x] = 1;
    run = -1;
    for (let x = width - 1; x >= 0; x--) {
      if (mask[y * width + x]) { run = x; tmp[y * width + x] = 1; } else if (run >= 0 && run - x <= radius) tmp[y * width + x] = 1;
    }
  }
  const out = new Uint8Array(mask.length);
  for (let x = 0; x < width; x++) {
    let run = -1;
    for (let y = 0; y < height; y++) if (tmp[y * width + x]) run = y; else if (run >= 0 && y - run <= radius) out[y * width + x] = 1;
    run = -1;
    for (let y = height - 1; y >= 0; y--) {
      if (tmp[y * width + x]) { run = y; out[y * width + x] = 1; } else if (run >= 0 && run - y <= radius) out[y * width + x] = 1;
    }
  }
  return out;
}

export function maskBox(mask: Uint8Array, width: number, height: number): { x0: number; y0: number; x1: number; y1: number; coverage: number } | null {
  let x0 = width; let y0 = height; let x1 = -1; let y1 = -1; let count = 0;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    if (!mask[y * width + x]) continue;
    count++;
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  if (x1 < 0) return null;
  return { x0: x0 / width, y0: y0 / height, x1: (x1 + 1) / width, y1: (y1 + 1) / height, coverage: count / (width * height) };
}

export function describeBox(b: { x0: number; y0: number; x1: number; y1: number }): string {
  const cx = (b.x0 + b.x1) / 2;
  const cy = (b.y0 + b.y1) / 2;
  const h = cx < 1 / 3 ? 'left' : cx > 2 / 3 ? 'right' : 'centre';
  const v = cy < 1 / 3 ? 'upper' : cy > 2 / 3 ? 'lower' : 'middle';
  const pct = (n: number) => Math.round(n * 100);
  return `${v} ${h} of the picture (about ${pct(b.x0)}–${pct(b.x1)}% across, ${pct(b.y0)}–${pct(b.y1)}% down)`;
}

export function describeObject(label: string, kind: string, size: SizeMm, colourHex: string | null, productName: string | null): string {
  const cm = (mm: number) => Math.round(mm / 10);
  const what = productName ? `${label} — the product "${productName}"` : label;
  const colour = colourHex ? `, colour ${colourHex}` : '';
  return `${what} (${kind.replace(/_/g, ' ')}), about ${cm(size.width_mm)} × ${cm(size.depth_mm)} cm, ${cm(size.height_mm)} cm high${colour}`;
}
