/** Product in Place: the pure parts — cut-out of a studio shot, and hit-testing a rotated item. */

export interface PlacedItem {
  uid: number;
  productId: string;
  cx: number;
  cy: number;
  /** Drawn width in photo pixels; height follows the sprite's aspect. */
  w: number;
  aspect: number;
  rot: number;
  flip: boolean;
}

export function itemHeight(item: PlacedItem): number {
  return item.w / item.aspect;
}

export function toLocal(item: PlacedItem, x: number, y: number): { x: number; y: number } {
  const dx = x - item.cx;
  const dy = y - item.cy;
  const c = Math.cos(-item.rot);
  const s = Math.sin(-item.rot);
  return { x: dx * c - dy * s, y: dx * s + dy * c };
}

export function hitItem(item: PlacedItem, x: number, y: number, pad = 0): boolean {
  const p = toLocal(item, x, y);
  return Math.abs(p.x) <= item.w / 2 + pad && Math.abs(p.y) <= itemHeight(item) / 2 + pad;
}

export function topItemAt(items: PlacedItem[], x: number, y: number): PlacedItem | null {
  for (let i = items.length - 1; i >= 0; i--) if (hitItem(items[i], x, y)) return items[i];
  return null;
}

export function handlePoint(item: PlacedItem): { x: number; y: number } {
  const hx = item.w / 2;
  const hy = itemHeight(item) / 2;
  const c = Math.cos(item.rot);
  const s = Math.sin(item.rot);
  return { x: item.cx + hx * c - hy * s, y: item.cy + hx * s + hy * c };
}

function dist(data: Uint8ClampedArray, i: number, r: number, g: number, b: number): number {
  return Math.abs(data[i] - r) + Math.abs(data[i + 1] - g) + Math.abs(data[i + 2] - b);
}

export interface CutoutResult {
  cut: boolean;
  box: { x: number; y: number; w: number; h: number };
}

/** Flood-fills a flat studio background from the border; refuses a non-uniform border, which would eat the product. */
export function cutoutStudioBackground(
  data: Uint8ClampedArray, w: number, h: number, tolerance = 42, uniformShare = 0.8,
): CutoutResult {
  const whole = { cut: false, box: { x: 0, y: 0, w, h } };
  if (w < 3 || h < 3) return whole;

  const border: number[] = [];
  for (let x = 0; x < w; x++) border.push(x, (h - 1) * w + x);
  for (let y = 1; y < h - 1; y++) border.push(y * w, y * w + w - 1);

  const rs: number[] = [];
  const gs: number[] = [];
  const bs: number[] = [];
  for (const p of border) { rs.push(data[p * 4]); gs.push(data[p * 4 + 1]); bs.push(data[p * 4 + 2]); }
  const median = (a: number[]) => a.sort((m, n) => m - n)[a.length >> 1];
  const r = median(rs);
  const g = median(gs);
  const b = median(bs);

  const matching = border.filter((p) => data[p * 4 + 3] < 16 || dist(data, p * 4, r, g, b) <= tolerance).length;
  if (matching / border.length < uniformShare) return whole;

  const bg = new Uint8Array(w * h);
  const stack: number[] = [];
  for (const p of border) {
    if (!bg[p] && (data[p * 4 + 3] < 16 || dist(data, p * 4, r, g, b) <= tolerance)) { bg[p] = 1; stack.push(p); }
  }
  while (stack.length) {
    const p = stack.pop()!;
    const x = p % w;
    const y = (p - x) / w;
    const next = [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, y > 0 ? p - w : -1, y < h - 1 ? p + w : -1];
    for (const q of next) {
      if (q < 0 || bg[q]) continue;
      if (data[q * 4 + 3] < 16 || dist(data, q * 4, r, g, b) <= tolerance) { bg[q] = 1; stack.push(q); }
    }
  }

  let kept = 0;
  for (let p = 0; p < w * h; p++) if (!bg[p]) kept++;
  if (kept < w * h * 0.02) return whole;

  let minX = w;
  let minY = h;
  let maxX = -1;
  let maxY = -1;
  for (let p = 0; p < w * h; p++) {
    const x = p % w;
    const y = (p - x) / w;
    if (bg[p]) { data[p * 4 + 3] = 0; continue; }
    const edge = (x > 0 && bg[p - 1]) || (x < w - 1 && bg[p + 1]) || (y > 0 && bg[p - w]) || (y < h - 1 && bg[p + w]);
    if (edge && dist(data, p * 4, r, g, b) <= tolerance * 2) data[p * 4 + 3] = Math.min(data[p * 4 + 3], 140);
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  if (maxX < 0) return whole;
  return { cut: true, box: { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 } };
}
