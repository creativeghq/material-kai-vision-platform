// GENERATED MIRROR of src/lib/scene/kitchenComposition.ts — do not edit here.
// Regenerate: npm run vocab:mirror (part of gen:all). Freshness is enforced by
// tests/unit/vocabularyMirrors.test.ts, which fails the build on any drift.

interface ZoneModuleRow { id: string; type: string; width_cm: number; qty: number; options?: Record<string, string> }
interface ZoneConfig { enabled?: boolean; globals?: Record<string, number | string | string[]>; modules?: ZoneModuleRow[]; length_m?: number; appliances?: unknown[] }
export type RoomComposition = Record<string, ZoneConfig>;

export interface KitchenObject { id: string; kind: string; width_mm: number; depth_mm: number; height_mm: number; removed_at?: string | null }

export const KITCHEN_KINDS = new Set(['kitchen_base', 'sink', 'kitchen_wall', 'kitchen_tall', 'island']);

const ZONE_OF: Record<string, 'base' | 'wall' | 'tall' | 'island'> = {
  kitchen_base: 'base', sink: 'base', kitchen_wall: 'wall', kitchen_tall: 'tall', island: 'island',
};

const cm = (mm: number) => Math.round(mm / 10);

function splitRun(widthCm: number, sink: boolean, tall: boolean, doubleOnly: boolean, seq: { n: number }): ZoneModuleRow[] {
  const rows: ZoneModuleRow[] = [];
  let left = widthCm;
  if (sink && left >= 60) { const w = Math.min(90, left); rows.push({ id: `room-${seq.n++}`, type: 'sink_base', width_cm: w, qty: 1 }); left -= w; }
  if (left < 30) return rows;
  if (tall) {
    const n = Math.max(1, Math.round(left / 60));
    rows.push({ id: `room-${seq.n++}`, type: 'larder', width_cm: Math.round(left / n), qty: n });
    return rows;
  }
  const n = Math.max(1, Math.round(left / 80));
  const w = Math.round(left / n);
  rows.push({ id: `room-${seq.n++}`, type: w >= 60 || doubleOnly ? 'door2' : 'door1', width_cm: w, qty: n });
  return rows;
}

export function kitchenCompositionFromRoom(objects: KitchenObject[], previous: RoomComposition = {}): RoomComposition {
  const seq = { n: 1 };
  const zones: Record<'base' | 'wall' | 'tall' | 'island', { rows: ZoneModuleRow[]; height: number[]; depth: number[]; run: number }> = {
    base: { rows: [], height: [], depth: [], run: 0 }, wall: { rows: [], height: [], depth: [], run: 0 },
    tall: { rows: [], height: [], depth: [], run: 0 }, island: { rows: [], height: [], depth: [], run: 0 },
  };
  for (const o of objects) {
    if (o.removed_at || !KITCHEN_KINDS.has(o.kind)) continue;
    const z = ZONE_OF[o.kind];
    const width = cm(o.width_mm);
    zones[z].rows.push(...splitRun(width, o.kind === 'sink', z === 'tall', z === 'island', seq));
    zones[z].run += width;
    const carcass = z === 'base' || z === 'island' ? cm(o.height_mm) - 14 : cm(o.height_mm);
    zones[z].height.push(carcass);
    zones[z].depth.push(cm(o.depth_mm));
  }
  const avg = (xs: number[]) => Math.round(xs.reduce((a, b) => a + b, 0) / xs.length);
  const out: RoomComposition = {};
  for (const key of ['base', 'wall', 'tall', 'island'] as const) {
    const z = zones[key];
    const keep = previous[key]?.globals ?? {};
    out[key] = z.rows.length
      ? { enabled: true, modules: z.rows, globals: { ...keep, height: Math.max(30, avg(z.height)), depth: Math.max(20, avg(z.depth)) } }
      : { enabled: false, modules: [], globals: keep };
  }
  const worktop = zones.base.run / 100;
  const islandTop = zones.island.run / 100;
  out.worktop = { ...(previous.worktop ?? {}), enabled: worktop > 0, length_m: Math.round(worktop * 100) / 100 };
  out.island_worktop = { ...(previous.island_worktop ?? {}), enabled: islandTop > 0, length_m: Math.round(islandTop * 100) / 100 };
  for (const key of ['highboard', 'bar', 'appliances']) out[key] = previous[key] ?? { enabled: false };
  for (const key of Object.keys(previous)) if (!(key in out)) out[key] = previous[key];
  return out;
}

export const kitchenSignature = (objects: KitchenObject[]) =>
  objects.filter((o) => !o.removed_at && KITCHEN_KINDS.has(o.kind))
    .map((o) => `${o.id}:${o.kind}:${cm(o.width_mm)}:${cm(o.depth_mm)}:${cm(o.height_mm)}`).sort().join('|');
