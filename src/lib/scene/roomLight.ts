import { pointInPolygon } from '@/lib/scene/sceneGeometry';

export interface LitRoom { id: string; outline: Array<[number, number]>; centre: [number, number]; height: number }

const DOORWAY_M = 0.6;

function awayFrom(x: number, z: number, outline: Array<[number, number]>): number {
  let best = Infinity;
  for (let i = 0; i < outline.length; i++) {
    const [ax, az] = outline[i]; const [bx, bz] = outline[(i + 1) % outline.length];
    const dx = bx - ax; const dz = bz - az;
    const t = Math.min(1, Math.max(0, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1)));
    best = Math.min(best, Math.hypot(x - ax - t * dx, z - az - t * dz));
  }
  return best;
}

export function litRoomAt(rooms: LitRoom[], held: string | null, x: number, y: number, z: number): LitRoom | null {
  const low = (r: LitRoom) => y > 0 && y < r.height;
  const inside = rooms.find((r) => low(r) && pointInPolygon(x, z, r.outline));
  if (inside) return inside;
  const last = rooms.find((r) => r.id === held);
  return last && low(last) && awayFrom(x, z, last.outline) < DOORWAY_M ? last : null;
}
