// GENERATED MIRROR of src/lib/installation/guideSchema.ts — do not edit here.
// Regenerate: npm run vocab:mirror (part of gen:all). Freshness is enforced by
// tests/unit/vocabularyMirrors.test.ts, which fails the build on any drift.

export const PART_KINDS = ['panel', 'hardware', 'fitting', 'accessory'] as const;
export type PartKind = typeof PART_KINDS[number];

export const STEP_ACTIONS = ['prepare', 'insert', 'place', 'fix', 'turn', 'check', 'other'] as const;
export type StepAction = typeof STEP_ACTIONS[number];

export interface Vec3 { x: number; y: number; z: number }
export interface PageBox { x0: number; y0: number; x1: number; y1: number }

export interface GuidePart {
  id: string;
  name: string;
  code: string;
  quantity: number;
  kind: PartKind;
  size_cm: Vec3;
  size_stated: boolean;
}

export const SPOT_SIDES = ['inner', 'outer', 'top', 'bottom', 'left', 'right'] as const;
export type SpotSide = typeof SPOT_SIDES[number];
export interface GuideSpot { where: SpotSide; u: number; v: number }
export interface GuidePartUse { part_id: string; quantity: number; fixes_to: string; spots: GuideSpot[] }

export interface GuideStep {
  title: string;
  page: number;
  box: PageBox;
  instruction: string;
  parts_used: GuidePartUse[];
  tools: string[];
  warning: string;
  people: number;
  action: StepAction;
}

export interface GuidePlacement {
  part_id: string;
  instance: number;
  center_cm: Vec3;
  extent_cm: Vec3;
  step: number;
}

export interface InstallationGuideData {
  title: string;
  summary: string;
  overall_cm: Vec3 & { stated: boolean };
  people_required: number;
  tools: string[];
  warnings: string[];
  parts: GuidePart[];
  steps: GuideStep[];
  assembly: { available: boolean; placements: GuidePlacement[] };
}

const num = { type: 'number' } as const;
const int = { type: 'integer' } as const;
const str = { type: 'string' } as const;
const bool = { type: 'boolean' } as const;
const strList = { type: 'array', items: str } as const;
const closed = <P extends Record<string, unknown>>(properties: P) => ({
  type: 'object',
  properties,
  required: Object.keys(properties),
  additionalProperties: false,
}) as const;
const vec3 = closed({ x: num, y: num, z: num });

export const GUIDE_OUTPUT_SCHEMA = closed({
  title: str,
  summary: str,
  overall_cm: closed({ x: num, y: num, z: num, stated: bool }),
  people_required: int,
  tools: strList,
  warnings: strList,
  parts: {
    type: 'array',
    items: closed({
      id: str,
      name: str,
      code: str,
      quantity: int,
      kind: { type: 'string', enum: [...PART_KINDS] },
      size_cm: vec3,
      size_stated: bool,
    }),
  },
  steps: {
    type: 'array',
    items: closed({
      title: str,
      page: int,
      box: closed({ x0: num, y0: num, x1: num, y1: num }),
      instruction: str,
      parts_used: {
        type: 'array',
        items: closed({
          part_id: str,
          quantity: int,
          fixes_to: str,
          spots: { type: 'array', items: closed({ where: { type: 'string', enum: [...SPOT_SIDES] }, u: num, v: num }) },
        }),
      },
      tools: strList,
      warning: str,
      people: int,
      action: { type: 'string', enum: [...STEP_ACTIONS] },
    }),
  },
  assembly: closed({
    available: bool,
    placements: {
      type: 'array',
      items: closed({ part_id: str, instance: int, center_cm: vec3, extent_cm: vec3, step: int }),
    },
  }),
});

const P = GUIDE_OUTPUT_SCHEMA.properties;

export const KIT_PASS_SCHEMA = closed({
  title: P.title,
  summary: P.summary,
  overall_cm: P.overall_cm,
  people_required: P.people_required,
  tools: P.tools,
  warnings: P.warnings,
  parts: P.parts,
});

export const STEPS_PASS_SCHEMA = closed({ steps: P.steps });

export const ASSEMBLY_PASS_SCHEMA = closed({
  available: bool,
  placements: {
    type: 'array',
    items: closed({ part_id: str, instance: int, center_cm: vec3, extent_cm: vec3, page: int }),
  },
});

export function mergeGuidePasses(kit: unknown, stepBatches: unknown[], assembly: unknown, pageCount: number): InstallationGuideData {
  const k = isObj(kit) ? kit : {};
  const steps = stepBatches.flatMap((b) => (isObj(b) && Array.isArray(b.steps) ? b.steps : []));
  const pageOf = (s: unknown) => (isObj(s) ? finite(s.page, 0) : 0);
  steps.sort((a, b) => pageOf(a) - pageOf(b));
  const a = isObj(assembly) ? assembly : {};
  const placements = (Array.isArray(a.placements) ? a.placements : []).map((p) => {
    if (!isObj(p)) return p;
    const page = finite(p.page, 0);
    const uses = (s: unknown) => isObj(s) && Array.isArray(s.parts_used)
      && s.parts_used.some((u) => isObj(u) && u.part_id === p.part_id);
    let step = steps.findIndex((s) => pageOf(s) === page && uses(s));
    if (step < 0) step = steps.findIndex((s) => uses(s));
    if (step < 0) step = steps.findIndex((s) => pageOf(s) >= page);
    return { ...p, step: step < 0 ? steps.length - 1 : step };
  });
  return sanitizeGuide({ ...k, steps, assembly: { available: a.available === true, placements } }, pageCount);
}

const MAX_PARTS = 80;
const MAX_STEPS = 80;
const MAX_PLACEMENTS = 120;
const MAX_HARDWARE_QTY = 400;

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const text = (v: unknown, max: number): string => (typeof v === 'string' ? v.trim().replace(/\s+/g, ' ').slice(0, max) : '');
const finite = (v: unknown, fallback = 0): number => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);
const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);
const wholeIn = (v: unknown, lo: number, hi: number, fallback: number) => clamp(Math.round(finite(v, fallback)), lo, hi);
const texts = (v: unknown, maxItems: number, maxLen: number): string[] =>
  (Array.isArray(v) ? v : []).map((t) => text(t, maxLen)).filter(Boolean).slice(0, maxItems);
const oneOf = <T extends string>(v: unknown, list: readonly T[], fallback: T): T =>
  (list as readonly string[]).includes(v as string) ? (v as T) : fallback;
const vec = (v: unknown, lo: number, hi: number): Vec3 => {
  const o = isObj(v) ? v : {};
  return { x: clamp(finite(o.x), lo, hi), y: clamp(finite(o.y), lo, hi), z: clamp(finite(o.z), lo, hi) };
};

function box(v: unknown): PageBox {
  const o = isObj(v) ? v : {};
  const x0 = clamp(finite(o.x0), 0, 1);
  const y0 = clamp(finite(o.y0), 0, 1);
  const x1 = clamp(finite(o.x1, 1), 0, 1);
  const y1 = clamp(finite(o.y1, 1), 0, 1);
  const b = { x0: Math.min(x0, x1), y0: Math.min(y0, y1), x1: Math.max(x0, x1), y1: Math.max(y0, y1) };
  return b.x1 - b.x0 < 0.02 || b.y1 - b.y0 < 0.02 ? { x0: 0, y0: 0, x1: 1, y1: 1 } : b;
}

export function sanitizeGuide(raw: unknown, pageCount: number): InstallationGuideData {
  const o = isObj(raw) ? raw : {};
  const pages = Math.max(1, Math.round(pageCount));

  const seen = new Set<string>();
  const parts: GuidePart[] = [];
  for (const p of Array.isArray(o.parts) ? o.parts : []) {
    if (!isObj(p) || parts.length >= MAX_PARTS) continue;
    const id = text(p.id, 40) || `P${parts.length + 1}`;
    if (seen.has(id)) continue;
    const kind = oneOf(p.kind, PART_KINDS, 'accessory');
    seen.add(id);
    parts.push({
      id,
      name: text(p.name, 80) || 'Part',
      code: text(p.code, 40),
      quantity: wholeIn(p.quantity, 1, kind === 'hardware' ? MAX_HARDWARE_QTY : 40, 1),
      kind,
      size_cm: vec(p.size_cm, 0, 1000),
      size_stated: p.size_stated === true,
    });
  }
  const partIds = new Set(parts.map((p) => p.id));

  const steps: GuideStep[] = [];
  for (const s of Array.isArray(o.steps) ? o.steps : []) {
    if (!isObj(s) || steps.length >= MAX_STEPS) continue;
    const used: GuidePartUse[] = [];
    for (const u of Array.isArray(s.parts_used) ? s.parts_used : []) {
      if (!isObj(u)) continue;
      const partId = text(u.part_id, 40);
      if (!partIds.has(partId)) continue;
      const fixesTo = text(u.fixes_to, 40);
      const quantity = wholeIn(u.quantity, 1, MAX_HARDWARE_QTY, 1);
      const spots: GuideSpot[] = (Array.isArray(u.spots) ? u.spots : []).filter(isObj).slice(0, Math.min(quantity, 24)).map((p) => ({
        where: oneOf(p.where, SPOT_SIDES, 'inner'),
        u: clamp(finite(p.u, 0.5), 0, 1),
        v: clamp(finite(p.v, 0.5), 0, 1),
      }));
      used.push({
        part_id: partId,
        quantity,
        fixes_to: partIds.has(fixesTo) ? fixesTo : '',
        spots: partIds.has(fixesTo) ? spots : [],
      });
    }
    steps.push({
      title: text(s.title, 80) || `Step ${steps.length + 1}`,
      page: wholeIn(s.page, 1, pages, 1),
      box: box(s.box),
      instruction: text(s.instruction, 600),
      parts_used: used,
      tools: texts(s.tools, 12, 60),
      warning: text(s.warning, 300),
      people: wholeIn(s.people, 1, 6, 1),
      action: oneOf(s.action, STEP_ACTIONS, 'other'),
    });
  }

  const asm = isObj(o.assembly) ? o.assembly : {};
  const placements: GuidePlacement[] = [];
  for (const p of Array.isArray(asm.placements) ? asm.placements : []) {
    if (!isObj(p) || placements.length >= MAX_PLACEMENTS) continue;
    const partId = text(p.part_id, 40);
    if (!partIds.has(partId) || steps.length === 0) continue;
    const extent = vec(p.extent_cm, 0, 1000);
    if (extent.x <= 0 || extent.y <= 0 || extent.z <= 0) continue;
    placements.push({
      part_id: partId,
      instance: wholeIn(p.instance, 0, 200, 0),
      center_cm: vec(p.center_cm, -1000, 1000),
      extent_cm: extent,
      step: wholeIn(p.step, 0, steps.length - 1, 0),
    });
  }

  const overall = isObj(o.overall_cm) ? o.overall_cm : {};
  return {
    title: text(o.title, 120) || 'Installation guide',
    summary: text(o.summary, 400),
    overall_cm: { ...vec(overall, 0, 2000), stated: overall.stated === true },
    people_required: wholeIn(o.people_required, 1, 6, 1),
    tools: texts(o.tools, 20, 60),
    warnings: texts(o.warnings, 12, 300),
    parts,
    steps,
    assembly: { available: asm.available === true && placements.length > 0, placements },
  };
}

export const FINISH_KINDS = ['wood', 'gloss', 'matt', 'metal', 'stone', 'glass', 'fabric'] as const;
export type FinishKind = typeof FINISH_KINDS[number];

export interface GuideFinish { id: string; name: string; color: string; kind: FinishKind; swatch: PageBox | null }

export const FLOOR_KINDS = ['wood', 'tile', 'stone', 'carpet', 'concrete', 'vinyl'] as const;
export type FloorKind = typeof FLOOR_KINDS[number];

export interface GuideRoom {
  wall: string;
  floor: string;
  floor_kind: FloorKind;
  wall_swatch: PageBox | null;
  floor_swatch: PageBox | null;
}

export interface GuideAppearance {
  room: GuideRoom | null;
  image_path: string | null;
  source_url: string | null;
  finishes: GuideFinish[];
  parts: Record<string, string>;
  read_at: string | null;
}

export const APPEARANCE_READ_SCHEMA = closed({
  matches_product: bool,
  finishes: {
    type: 'array',
    items: closed({
      id: str,
      name: str,
      color_hex: str,
      kind: { type: 'string', enum: [...FINISH_KINDS] },
      textured: bool,
      swatch: closed({ x0: num, y0: num, x1: num, y1: num }),
    }),
  },
  parts: { type: 'array', items: closed({ part_id: str, finish_id: str }) },
  room: closed({
    shown: bool,
    wall_hex: str,
    floor_hex: str,
    floor_kind: { type: 'string', enum: [...FLOOR_KINDS] },
    wall_textured: bool,
    wall_swatch: closed({ x0: num, y0: num, x1: num, y1: num }),
    floor_textured: bool,
    floor_swatch: closed({ x0: num, y0: num, x1: num, y1: num }),
  }),
});

function swatchBox(v: unknown): PageBox | null {
  if (!isObj(v)) return null;
  const b = box(v);
  return b.x0 === 0 && b.y0 === 0 && b.x1 === 1 && b.y1 === 1 ? null : b;
}

function sanitizeRoom(raw: unknown): GuideRoom | null {
  if (!isObj(raw)) return null;
  if (raw.shown === false) return null;
  const wall = text(raw.wall ?? raw.wall_hex, 7);
  const floor = text(raw.floor ?? raw.floor_hex, 7);
  if (!HEX.test(wall) || !HEX.test(floor)) return null;
  return {
    wall: wall.toLowerCase(),
    floor: floor.toLowerCase(),
    floor_kind: oneOf(raw.floor_kind, FLOOR_KINDS, 'wood'),
    wall_swatch: raw.wall_textured === false ? null : swatchBox(raw.wall_swatch),
    floor_swatch: raw.floor_textured === false ? null : swatchBox(raw.floor_swatch),
  };
}

const HEX = /^#[0-9a-f]{6}$/i;
const MAX_FINISHES = 12;

export function sanitizeAppearance(raw: unknown, partIds: string[]): GuideAppearance | null {
  if (!isObj(raw)) return null;
  const finishes: GuideFinish[] = (Array.isArray(raw.finishes) ? raw.finishes : []).slice(0, MAX_FINISHES).flatMap((f) => {
    if (!isObj(f)) return [];
    const id = text(f.id, 12);
    const color = text(f.color ?? f.color_hex, 7);
    if (!id || !HEX.test(color)) return [];
    const textured = f.textured === undefined ? !!f.swatch : f.textured === true;
    const s = textured && isObj(f.swatch) ? box(f.swatch) : null;
    const swatch = s && !(s.x0 === 0 && s.y0 === 0 && s.x1 === 1 && s.y1 === 1) ? s : null;
    return [{ id, name: text(f.name, 60), color: color.toLowerCase(), kind: oneOf(f.kind, FINISH_KINDS, 'matt'), swatch }];
  });
  const finishIds = new Set(finishes.map((f) => f.id));
  const known = new Set(partIds);
  const parts: Record<string, string> = {};
  const rawParts = raw.parts;
  const pairs: Array<[unknown, unknown]> = Array.isArray(rawParts)
    ? rawParts.filter(isObj).map((p) => [p.part_id, p.finish_id])
    : isObj(rawParts) ? Object.entries(rawParts) : [];
  for (const [pid, fid] of pairs) {
    if (typeof pid === 'string' && known.has(pid) && typeof fid === 'string' && finishIds.has(fid)) parts[pid] = fid;
  }
  return {
    room: sanitizeRoom(raw.room),
    image_path: typeof raw.image_path === 'string' ? raw.image_path.slice(0, 300) : null,
    source_url: typeof raw.source_url === 'string' ? raw.source_url.slice(0, 1000) : null,
    finishes,
    parts,
    read_at: typeof raw.read_at === 'string' ? raw.read_at.slice(0, 40) : null,
  };
}
