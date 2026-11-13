// GENERATED MIRROR of src/lib/scene/sceneReadSchema.ts — do not edit here.
// Regenerate: npm run vocab:mirror (part of gen:all). Freshness is enforced by
// tests/unit/vocabularyMirrors.test.ts, which fails the build on any drift.

export const SCENE_OBJECT_KINDS = [
  'sofa', 'armchair', 'chair', 'stool', 'dining_table', 'coffee_table', 'side_table', 'desk', 'bed', 'nightstand',
  'wardrobe', 'cabinet', 'shelving', 'tv_unit', 'tv', 'rug', 'lamp', 'pendant', 'plant', 'artwork', 'mirror', 'curtain',
  'kitchen_base', 'kitchen_wall', 'kitchen_tall', 'island', 'appliance', 'sink', 'toilet', 'bathtub', 'shower', 'vanity',
  'stairs', 'fireplace', 'radiator', 'other',
] as const;
export type SceneObjectKind = typeof SCENE_OBJECT_KINDS[number];

export const SCENE_OPENING_KINDS = ['door', 'window', 'opening'] as const;
export type SceneOpeningKind = typeof SCENE_OPENING_KINDS[number];

export const SCENE_SCALE_BASES = ['printed_dimensions', 'typical_sizes', 'assumed'] as const;
export type SceneScaleBasis = typeof SCENE_SCALE_BASES[number];

export interface ScenePoint { x: number; y: number }
export interface SceneReadRoom { name: string; room_type: string; outline: ScenePoint[]; floor_colour_hex: string; wall_colour_hex: string }
export interface SceneReadWall { x1: number; y1: number; x2: number; y2: number; thickness_mm: number }
export interface SceneReadOpening { wall: number; kind: SceneOpeningKind; offset_mm: number; width_mm: number; sill_mm: number; head_mm: number }
export interface SceneReadObject {
  label: string; kind: SceneObjectKind; room: number;
  x_mm: number; y_mm: number; rotation_deg: number;
  width_mm: number; depth_mm: number; height_mm: number; elevation_mm: number; colour_hex: string;
}
export interface SceneReadCamera { x_mm: number; y_mm: number; height_mm: number; look_x_mm: number; look_y_mm: number; fov_deg: number }

export interface SceneRead {
  read_ok: boolean;
  reason: string;
  scale_basis: SceneScaleBasis;
  wall_height_mm: number;
  assumptions: string[];
  rooms: SceneReadRoom[];
  walls: SceneReadWall[];
  openings: SceneReadOpening[];
  objects: SceneReadObject[];
  camera: SceneReadCamera;
}

const str = { type: 'string' } as const;
const num = { type: 'number' } as const;
const int = { type: 'integer' } as const;
const bool = { type: 'boolean' } as const;
const closed = <P extends Record<string, unknown>>(properties: P) => ({
  type: 'object',
  properties,
  required: Object.keys(properties),
  additionalProperties: false,
}) as const;

export const SCENE_READ_SCHEMA = closed({
  read_ok: bool,
  reason: str,
  scale_basis: { type: 'string', enum: [...SCENE_SCALE_BASES] },
  wall_height_mm: int,
  assumptions: { type: 'array', items: str },
  rooms: {
    type: 'array',
    items: closed({
      name: str, room_type: str,
      outline: { type: 'array', items: closed({ x: num, y: num }) },
      floor_colour_hex: str, wall_colour_hex: str,
    }),
  },
  walls: { type: 'array', items: closed({ x1: num, y1: num, x2: num, y2: num, thickness_mm: int }) },
  openings: {
    type: 'array',
    items: closed({
      wall: int, kind: { type: 'string', enum: [...SCENE_OPENING_KINDS] },
      offset_mm: num, width_mm: num, sill_mm: int, head_mm: int,
    }),
  },
  objects: {
    type: 'array',
    items: closed({
      label: str, kind: { type: 'string', enum: [...SCENE_OBJECT_KINDS] }, room: int,
      x_mm: num, y_mm: num, rotation_deg: num,
      width_mm: num, depth_mm: num, height_mm: num, elevation_mm: num, colour_hex: str,
    }),
  },
  camera: closed({ x_mm: num, y_mm: num, height_mm: num, look_x_mm: num, look_y_mm: num, fov_deg: num }),
});

const MAX_ROOMS = 30;
const MAX_WALLS = 240;
const MAX_OPENINGS = 160;
const MAX_OBJECTS = 160;
const MAX_EXTENT_MM = 100_000;

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const text = (v: unknown, max: number): string => (typeof v === 'string' ? v.trim().replace(/\s+/g, ' ').slice(0, max) : '');
const finite = (v: unknown, fallback = 0): number => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);
const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);
const mm = (v: unknown) => Math.round(clamp(finite(v), -MAX_EXTENT_MM, MAX_EXTENT_MM));
const size = (v: unknown, lo: number, hi: number, fallback: number) => Math.round(clamp(finite(v, fallback), lo, hi));
const oneOf = <T extends string>(v: unknown, list: readonly T[], fallback: T): T =>
  (list as readonly string[]).includes(v as string) ? (v as T) : fallback;
const hex = (v: unknown): string => (typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v.trim()) ? v.trim().toLowerCase() : '');

export function wallsFromRooms(rooms: SceneReadRoom[]): SceneReadWall[] {
  const seen = new Set<string>();
  const out: SceneReadWall[] = [];
  for (const room of rooms) {
    const pts = room.outline;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i];
      const b = pts[(i + 1) % pts.length];
      if (a.x === b.x && a.y === b.y) continue;
      const key = [`${a.x},${a.y}`, `${b.x},${b.y}`].sort().join('|');
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ x1: a.x, y1: a.y, x2: b.x, y2: b.y, thickness_mm: 120 });
    }
  }
  return out.slice(0, MAX_WALLS);
}

export function sanitizeSceneRead(raw: unknown): SceneRead {
  const o = isObj(raw) ? raw : {};
  const wallHeight = size(o.wall_height_mm, 2000, 6000, 2700);

  const rooms: SceneReadRoom[] = [];
  for (const r of Array.isArray(o.rooms) ? o.rooms : []) {
    if (!isObj(r) || rooms.length >= MAX_ROOMS) continue;
    const outline = (Array.isArray(r.outline) ? r.outline : []).filter(isObj).map((p) => ({ x: mm(p.x), y: mm(p.y) })).slice(0, 64);
    if (outline.length < 3) continue;
    rooms.push({
      name: text(r.name, 80) || `Room ${rooms.length + 1}`,
      room_type: text(r.room_type, 40),
      outline,
      floor_colour_hex: hex(r.floor_colour_hex),
      wall_colour_hex: hex(r.wall_colour_hex),
    });
  }

  let walls: SceneReadWall[] = [];
  for (const w of Array.isArray(o.walls) ? o.walls : []) {
    if (!isObj(w) || walls.length >= MAX_WALLS) continue;
    const wall = { x1: mm(w.x1), y1: mm(w.y1), x2: mm(w.x2), y2: mm(w.y2), thickness_mm: size(w.thickness_mm, 50, 600, 120) };
    if (Math.hypot(wall.x2 - wall.x1, wall.y2 - wall.y1) < 100) continue;
    walls.push(wall);
  }
  const wallsWereRead = walls.length > 0;
  if (!wallsWereRead) walls = wallsFromRooms(rooms);

  const openings: SceneReadOpening[] = [];
  if (wallsWereRead) {
    for (const p of Array.isArray(o.openings) ? o.openings : []) {
      if (!isObj(p) || openings.length >= MAX_OPENINGS) continue;
      const wall = Math.round(finite(p.wall, -1));
      if (wall < 0 || wall >= walls.length) continue;
      const w = walls[wall];
      const len = Math.hypot(w.x2 - w.x1, w.y2 - w.y1);
      const width = clamp(finite(p.width_mm, 900), 300, len);
      const kind = oneOf(p.kind, SCENE_OPENING_KINDS, 'opening');
      const sill = kind === 'window' ? size(p.sill_mm, 0, wallHeight - 300, 900) : 0;
      const head = size(p.head_mm, sill + 300, wallHeight, kind === 'window' ? 2100 : 2100);
      openings.push({ wall, kind, offset_mm: Math.round(clamp(finite(p.offset_mm), 0, len - width)), width_mm: Math.round(width), sill_mm: sill, head_mm: head });
    }
  }

  const objects: SceneReadObject[] = [];
  for (const b of Array.isArray(o.objects) ? o.objects : []) {
    if (!isObj(b) || objects.length >= MAX_OBJECTS) continue;
    const room = Math.round(finite(b.room, -1));
    objects.push({
      label: text(b.label, 120) || 'Object',
      kind: oneOf(b.kind, SCENE_OBJECT_KINDS, 'other'),
      room: room >= 0 && room < rooms.length ? room : -1,
      x_mm: mm(b.x_mm), y_mm: mm(b.y_mm),
      rotation_deg: ((Math.round(finite(b.rotation_deg)) % 360) + 360) % 360,
      width_mm: size(b.width_mm, 50, 12000, 600),
      depth_mm: size(b.depth_mm, 20, 12000, 600),
      height_mm: size(b.height_mm, 5, 5000, 800),
      elevation_mm: size(b.elevation_mm, 0, 5000, 0),
      colour_hex: hex(b.colour_hex),
    });
  }

  const c = isObj(o.camera) ? o.camera : {};
  return {
    read_ok: o.read_ok === true && rooms.length > 0,
    reason: text(o.reason, 400),
    scale_basis: oneOf(o.scale_basis, SCENE_SCALE_BASES, 'assumed'),
    wall_height_mm: wallHeight,
    assumptions: (Array.isArray(o.assumptions) ? o.assumptions : []).map((t) => text(t, 240)).filter(Boolean).slice(0, 12),
    rooms,
    walls,
    openings,
    objects,
    camera: {
      x_mm: mm(c.x_mm), y_mm: mm(c.y_mm), height_mm: size(c.height_mm, 300, 20000, 1500),
      look_x_mm: mm(c.look_x_mm), look_y_mm: mm(c.look_y_mm), fov_deg: size(c.fov_deg, 20, 110, 60),
    },
  };
}
