import { pointInPolygon, toScene, type PlanFrame, type PlanRoom } from '@/lib/scene/sceneGeometry';

export interface WorldPose { position: [number, number, number]; target: [number, number, number]; fov: number }

export interface WorldObstacle { x_mm: number; y_mm: number; width_mm: number; depth_mm: number; rotation_deg: number; top_mm: number }

const EYE = 1.5;
const INSET_MM = 320;
const CLEAR_MM = 320;
const FOV = 62;
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

export function worldViewPoses(room: Pick<PlanRoom, 'outline' | 'height_mm'>, frame: PlanFrame, obstacles: WorldObstacle[], shot?: WorldPose | null, max = 16): WorldPose[] {
  const poly = room.outline;
  if (poly.length < 3) return [];
  const free = (x: number, y: number) => pointInPolygon(x, y, poly)
    && edgeDistance(poly, x, y) >= INSET_MM * 0.8
    && obstacles.every((o) => o.top_mm < EYE * 1000 - 250 || distanceTo(o, x, y) >= CLEAR_MM);

  const cx = poly.reduce((s, p) => s + p[0], 0) / poly.length;
  const cy = poly.reduce((s, p) => s + p[1], 0) / poly.length;
  const out: WorldPose[] = [];
  const at = (x: number, y: number, h: number, tx: number, ty: number, th: number): WorldPose => {
    const [px, pz] = toScene(x, y, frame);
    const [qx, qz] = toScene(tx, ty, frame);
    return { position: [px, h, pz], target: [qx, th, qz], fov: FOV };
  };
  if (shot) out.push({ position: [...shot.position], target: [...shot.target], fov: shot.fov });

  const spots: Array<[number, number]> = [];
  for (let i = 0; i < poly.length; i++) {
    const [ax, ay] = poly[i];
    const [bx, by] = poly[(i + 1) % poly.length];
    const steps = Math.max(1, Math.min(3, Math.round(Math.hypot(bx - ax, by - ay) / 1600)));
    for (let s = 0; s < steps; s++) spots.push([ax + ((bx - ax) * s) / steps, ay + ((by - ay) * s) / steps]);
  }
  for (const [sx, sy] of spots) {
    const d = Math.hypot(sx - cx, sy - cy) || 1;
    for (const pull of [INSET_MM * 1.45, INSET_MM * 2.2, INSET_MM * 3]) {
      const k = Math.max(0.15, 1 - pull / d);
      const x = cx + (sx - cx) * k;
      const y = cy + (sy - cy) * k;
      if (!free(x, y)) continue;
      out.push(at(x, y, EYE, cx - (sx - cx) * 0.6, cy - (sy - cy) * 0.6, 0.95));
      break;
    }
  }
  const [mx, my] = free(cx, cy) ? [cx, cy] : spots.map(([x, y]): [number, number] => [cx + (x - cx) * 0.4, cy + (y - cy) * 0.4]).find(([x, y]) => free(x, y)) ?? [cx, cy];
  const reach = Math.max(...poly.map((p) => Math.hypot(p[0] - cx, p[1] - cy)));
  for (const [ux, uy] of [[0, -1], [0, 1], [1, 0], [-1, 0]]) {
    out.push(at(mx - ux * reach * 0.25, my - uy * reach * 0.25, 1.4, mx + ux * reach, my + uy * reach, 1.05));
  }
  const kept = out.filter((p, i) => i === 0 || (() => {
    const x = p.position[0] * 1000 + frame.cx;
    const y = p.position[2] * 1000 + frame.cy;
    return free(x, y);
  })());
  kept.push({ ...at(mx, my, 1.3, mx + reach * 0.35, my, ((room.height_mm ?? 2700) / 1000) + 0.3), fov: 72 });
  return kept.slice(0, Math.min(max, MAX_WORLD_VIEWS));
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
