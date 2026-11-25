import { pointInPolygon, toScene, type PlanFrame, type PlanRoom } from '@/lib/scene/sceneGeometry';

export interface WorldPose { position: [number, number, number]; target: [number, number, number]; fov: number }

export interface WorldObstacle { x_mm: number; y_mm: number; width_mm: number; depth_mm: number; rotation_deg: number; top_mm: number }

const EYE = 1.5;
const OFF_WALL_MM = [600, 480, 360];
const CLEAR_MM = 400;
const TALL_MM = 1000;
const FOV = 55;
const WALL_SPAN_MM = 2000;
const WALL_AWAY_MM = [2200, 1800, 1400, 1000, 700];
export const MAX_WORLD_VIEWS = 20;
export const WORLD_VIEW_W = 1280;
export const WORLD_VIEW_H = 720;

function distanceTo(o: WorldObstacle, x: number, y: number): number {
  const a = (-o.rotation_deg * Math.PI) / 180;
  const dx = x - o.x_mm;
  const dy = y - o.y_mm;
  const u = Math.abs(dx * Math.cos(a) - dy * Math.sin(a)) - o.width_mm / 2;
  const v = Math.abs(dx * Math.sin(a) + dy * Math.cos(a)) - o.depth_mm / 2;
  return Math.hypot(Math.max(u, 0), Math.max(v, 0));
}

function edgeDistance(poly: Array<[number, number]>, x: number, y: number): number {
  let best = Infinity;
  for (let i = 0; i < poly.length; i++) {
    const [ax, ay] = poly[i];
    const [bx, by] = poly[(i + 1) % poly.length];
    const len2 = (bx - ax) ** 2 + (by - ay) ** 2 || 1;
    const t = Math.max(0, Math.min(1, ((x - ax) * (bx - ax) + (y - ay) * (by - ay)) / len2));
    best = Math.min(best, Math.hypot(x - (ax + t * (bx - ax)), y - (ay + t * (by - ay))));
  }
  return best;
}

export interface FreeSpots { free(x: number, y: number): boolean; offWallMm: number }

export function freeSpots(poly: Array<[number, number]>, obstacles: WorldObstacle[]): FreeSpots {
  const tall = obstacles.filter((o) => o.top_mm >= TALL_MM);
  const test = (off: number) => (x: number, y: number) => pointInPolygon(x, y, poly)
    && edgeDistance(poly, x, y) >= off && tall.every((o) => distanceTo(o, x, y) >= CLEAR_MM);
  const xs = poly.map((p) => p[0]);
  const ys = poly.map((p) => p[1]);
  for (const off of OFF_WALL_MM) {
    const free = test(off);
    let spots = 0;
    for (let x = Math.min(...xs); x <= Math.max(...xs); x += 200) for (let y = Math.min(...ys); y <= Math.max(...ys); y += 200) if (free(x, y)) spots++;
    if (spots >= 12 || off === OFF_WALL_MM[OFF_WALL_MM.length - 1]) return { free, offWallMm: off };
  }
  return { free: test(OFF_WALL_MM[0]), offWallMm: OFF_WALL_MM[0] };
}

const seen = (poly: Array<[number, number]>, ax: number, ay: number, bx: number, by: number) =>
  [0.2, 0.4, 0.6, 0.8].every((t) => pointInPolygon(ax + (bx - ax) * t, ay + (by - ay) * t, poly));

export function worldViewPoses(room: Pick<PlanRoom, 'outline' | 'height_mm'>, frame: PlanFrame, obstacles: WorldObstacle[], shot?: WorldPose | null, max = MAX_WORLD_VIEWS): WorldPose[] {
  const poly = room.outline;
  if (poly.length < 3) return [];
  const { free, offWallMm } = freeSpots(poly, obstacles);
  const cx = poly.reduce((s, p) => s + p[0], 0) / poly.length;
  const cy = poly.reduce((s, p) => s + p[1], 0) / poly.length;
  const at = (x: number, y: number, h: number, tx: number, ty: number, th: number, fov = FOV): WorldPose => {
    const [px, pz] = toScene(x, y, frame);
    const [qx, qz] = toScene(tx, ty, frame);
    return { position: [px, h, pz], target: [qx, th, qz], fov };
  };
  const ceiling = (room.height_mm ?? 2700) / 1000;

  const walls: WorldPose[] = [];
  for (let i = 0; i < poly.length; i++) {
    const [ax, ay] = poly[i];
    const [bx, by] = poly[(i + 1) % poly.length];
    const len = Math.hypot(bx - ax, by - ay);
    if (len < 900) continue;
    const n = Math.max(1, Math.min(3, Math.round(len / WALL_SPAN_MM)));
    for (let k = 0; k < n; k++) {
      const t = (k + 0.5) / n;
      const wx = ax + (bx - ax) * t;
      const wy = ay + (by - ay) * t;
      const side = pointInPolygon(wx - ((by - ay) / len) * 100, wy + ((bx - ax) / len) * 100, poly) ? 1 : -1;
      const nx = (-(by - ay) / len) * side;
      const ny = ((bx - ax) / len) * side;
      for (const away of WALL_AWAY_MM) {
        const x = wx + nx * away;
        const y = wy + ny * away;
        if (!free(x, y) || !seen(poly, x, y, wx + nx * 60, wy + ny * 60)) continue;
        walls.push(at(x, y, EYE, wx, wy, 1.2));
        break;
      }
    }
  }

  const corners: WorldPose[] = [];
  for (let i = 0; i < poly.length; i++) {
    const [sx, sy] = poly[i];
    const d = Math.hypot(sx - cx, sy - cy) || 1;
    for (let pull = offWallMm; pull < d * 0.8; pull += 120) {
      const k = 1 - pull / d;
      const x = cx + (sx - cx) * k;
      const y = cy + (sy - cy) * k;
      if (!free(x, y)) continue;
      corners.push(at(x, y, EYE, cx - (sx - cx) * 0.6, cy - (sy - cy) * 0.6, 0.95));
      break;
    }
  }

  const middle = (() => {
    if (free(cx, cy)) return [cx, cy] as const;
    const near = poly.flatMap(([x, y]) => [0.15, 0.3, 0.45].map((k) => [cx + (x - cx) * k, cy + (y - cy) * k] as const)).find(([x, y]) => free(x, y));
    return near ?? ([cx, cy] as const);
  })();
  const floors: WorldPose[] = [];
  for (const [sx, sy] of poly) {
    const x = cx + (sx - cx) * 0.45;
    const y = cy + (sy - cy) * 0.45;
    if (free(x, y)) floors.push(at(x, y, 1.65, x + (sx - x) * 0.35, y + (sy - y) * 0.35, 0, 64));
  }
  const up = at(middle[0], middle[1], 1.3, middle[0] + (poly[0][0] - middle[0]) * 0.3, middle[1] + (poly[0][1] - middle[1]) * 0.3, ceiling + 0.3, 72);

  const first = shot && free(shot.position[0] * 1000 + frame.cx, shot.position[2] * 1000 + frame.cy)
    ? [{ position: [...shot.position] as WorldPose['position'], target: [...shot.target] as WorldPose['target'], fov: shot.fov }] : [];
  const around = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([ux, uy]) => at(middle[0], middle[1], 1.4, middle[0] + ux * 1500, middle[1] + uy * 1500, 1.05, 64));
  const left = Math.min(max, MAX_WORLD_VIEWS) - first.length - 1;
  const picked = [...walls.slice(0, 10), ...corners.slice(0, 5), ...floors.slice(0, 4), ...around].slice(0, left);
  return [...first, ...picked, up];
}

function slide(src: Float32Array, w: number, h: number, r: number, far: boolean): Float32Array {
  const pick = far ? Math.max : Math.min;
  const none = far ? -Infinity : Infinity;
  const mid = new Float32Array(src.length);
  const out = new Float32Array(src.length);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let v = none;
      for (let k = Math.max(0, x - r); k <= Math.min(w - 1, x + r); k++) v = pick(v, src[y * w + k]);
      mid[y * w + x] = v;
    }
  }
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) {
      let v = none;
      for (let k = Math.max(0, y - r); k <= Math.min(h - 1, y + r); k++) v = pick(v, mid[k * w + x]);
      out[y * w + x] = v;
    }
  }
  return out;
}

export function solidDots(dots: Float32Array, w: number, h: number): Float32Array {
  const z = Float32Array.from(dots, (v) => (v > 0 ? v : Infinity));
  const opened = slide(slide(z, w, h, 3, true), w, h, 3, false);
  const closed = slide(slide(opened, w, h, 9, false), w, h, 9, true);
  return Float32Array.from(closed, (v) => (Number.isFinite(v) ? v : 0));
}

export function nearest(a: Float32Array, b: Float32Array): Float32Array {
  return Float32Array.from(a, (v, i) => (b[i] > 0 && (!(v > 0) || b[i] < v) ? b[i] : v));
}

const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();

function chunk(type: string, data: Uint8Array): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(12 + data.length);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  let c = 0xffffffff;
  for (let i = 4; i < 8 + data.length; i++) c = CRC[(c ^ out[i]) & 255] ^ (c >>> 8);
  dv.setUint32(8 + data.length, (c ^ 0xffffffff) >>> 0);
  return out;
}

export async function encodeLogDepthPng(depth: Float32Array, width: number, height: number): Promise<{ png: Blob; zMin: number; zMax: number }> {
  let zMin = Infinity;
  let zMax = 0;
  for (const z of depth) if (z > 0.02 && Number.isFinite(z)) { if (z < zMin) zMin = z; if (z > zMax) zMax = z; }
  if (!(zMax > 0)) throw new Error('A view of the room was empty.');
  if (zMax <= zMin) zMax = zMin * 1.001;
  const span = Math.log(zMax / zMin);
  const raw = new Uint8Array(height * (1 + width * 2));
  for (let y = 0, p = 0; y < height; y++) {
    raw[p++] = 0;
    for (let x = 0; x < width; x++) {
      const z = depth[y * width + x];
      const v = z > 0.02 && Number.isFinite(z) ? Math.max(1, Math.min(65535, Math.round(65535 * (1 - Math.log(z / zMin) / span)))) : 0;
      raw[p++] = v >> 8;
      raw[p++] = v & 255;
    }
  }
  const packed = new Uint8Array(await new Response(new Blob([raw]).stream().pipeThrough(new CompressionStream('deflate'))).arrayBuffer());
  const ihdr = new Uint8Array(13);
  const dv = new DataView(ihdr.buffer);
  dv.setUint32(0, width);
  dv.setUint32(4, height);
  ihdr[8] = 16;
  ihdr[9] = 0;
  const png = new Blob([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', packed), chunk('IEND', new Uint8Array(0))], { type: 'image/png' });
  return { png, zMin, zMax };
}

interface SigObject { id: string; room_id: string | null; x_mm: number; y_mm: number; rotation_deg: number; width_mm: number; depth_mm: number; height_mm: number; colour_hex: string | null; removed_at?: string | null }
interface SigSurface { room_id: string; surface: string; wall_id?: string | null; zone_key?: string | null; product_id: string | null; colour_hex: string | null }
interface SigFinish { object_id: string; slot: string; product_id: string | null; colour_hex: string | null }

export function roomSignature(roomId: string, objects: SigObject[], surfaces: SigSurface[], finishes: SigFinish[]): string {
  const mine = objects.filter((o) => !o.removed_at && o.room_id === roomId);
  const ids = new Set(mine.map((o) => o.id));
  const rows = [
    ...mine.map((o) => `o|${o.id}|${[o.x_mm, o.y_mm, o.rotation_deg, o.width_mm, o.depth_mm, o.height_mm].map((n) => Math.round(Number(n))).join(',')}|${o.colour_hex ?? ''}`),
    ...surfaces.filter((s) => s.room_id === roomId).map((s) => `s|${s.surface}|${s.wall_id ?? ''}|${s.zone_key ?? ''}|${s.product_id ?? ''}|${s.colour_hex ?? ''}`),
    ...finishes.filter((f) => ids.has(f.object_id)).map((f) => `f|${f.object_id}|${f.slot}|${f.product_id ?? ''}|${f.colour_hex ?? ''}`),
  ].sort().join('\n');
  let h = 0x811c9dc5;
  for (let i = 0; i < rows.length; i++) h = Math.imul(h ^ rows.charCodeAt(i), 0x01000193) >>> 0;
  return h.toString(16);
}

export function worldsNear(worlds: Array<{ roomId: string; url: string }>, rooms: Array<Pick<PlanRoom, 'id' | 'outline'>>, x: number, y: number, keep = 2): string[] {
  const away = (id: string) => {
    const poly = rooms.find((r) => r.id === id)?.outline ?? [];
    if (poly.length < 3) return Infinity;
    return pointInPolygon(x, y, poly) ? -1 : edgeDistance(poly, x, y);
  };
  return [...worlds].sort((a, b) => away(a.roomId) - away(b.roomId)).slice(0, keep).map((w) => w.url).sort();
}
