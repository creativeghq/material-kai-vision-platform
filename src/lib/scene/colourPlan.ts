import type { SceneObject, SceneObjectFinish, SceneSurface } from '@/services/sceneStudioService';

export type ColourRole = 'walls' | 'wall_fronts' | 'worktop' | 'tall_fronts' | 'furniture' | 'floor' | 'base_fronts' | 'accent';

export const COLOUR_ROLE_LABELS: Record<ColourRole, string> = {
  walls: 'Walls', wall_fronts: 'Wall Unit Fronts', worktop: 'Worktop', tall_fronts: 'Tall Unit Fronts',
  furniture: 'Furniture', floor: 'Floor', base_fronts: 'Base Unit Fronts', accent: 'Accents and Decor',
};

const LIGHT_TO_DARK: ColourRole[] = ['walls', 'wall_fronts', 'worktop', 'tall_fronts', 'furniture', 'floor', 'base_fronts', 'accent'];
const BASE_KINDS = new Set(['kitchen_base', 'sink', 'island']);
const FURNITURE_KINDS = new Set(['sofa', 'armchair', 'chair', 'stool', 'dining_table', 'coffee_table', 'side_table', 'desk', 'bed', 'nightstand', 'wardrobe', 'cabinet', 'shelving', 'tv_unit', 'vanity']);

export interface ColourPlanEntry { role: ColourRole; hex: string }

const HEX = /^#[0-9a-f]{6}$/i;

export function luminance(hex: string): number {
  const n = Number.parseInt(hex.slice(1), 16);
  return 0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255);
}

export function colourRolesOf(objects: Pick<SceneObject, 'kind' | 'removed_at'>[]): ColourRole[] {
  const kinds = new Set(objects.filter((o) => !o.removed_at).map((o) => o.kind));
  const has = (pred: (k: string) => boolean) => [...kinds].some(pred);
  return LIGHT_TO_DARK.filter((r) =>
    r === 'walls' || r === 'floor' || r === 'accent'
    || (r === 'wall_fronts' && kinds.has('kitchen_wall'))
    || (r === 'tall_fronts' && kinds.has('kitchen_tall'))
    || ((r === 'base_fronts' || r === 'worktop') && has((k) => BASE_KINDS.has(k)))
    || (r === 'furniture' && has((k) => FURNITURE_KINDS.has(k))));
}

export function defaultColourPlan(palette: string[], objects: Pick<SceneObject, 'kind' | 'removed_at'>[]): ColourPlanEntry[] {
  const colours = [...new Set(palette.filter((c) => HEX.test(c)).map((c) => c.toLowerCase()))].sort((a, b) => luminance(b) - luminance(a));
  if (!colours.length) return [];
  const roles = colourRolesOf(objects);
  const step = roles.length > 1 ? (colours.length - 1) / (roles.length - 1) : 0;
  const plan = roles.map((role, i) => ({ role, hex: colours[Math.round(i * step)] }));
  for (const hex of colours) if (!plan.some((p) => p.hex === hex)) plan.push({ role: 'accent', hex });
  return plan;
}

export function colourPlanLines(plan: ColourPlanEntry[]): string[] {
  const byRole = new Map<ColourRole, string[]>();
  for (const p of plan) byRole.set(p.role, [...(byRole.get(p.role) ?? []), p.hex]);
  return [...byRole].map(([role, hexes]) => `${COLOUR_ROLE_LABELS[role]}: ${hexes.join(', ')}`);
}

const roleOf = (kind: string): ColourRole | null =>
  kind === 'kitchen_wall' ? 'wall_fronts' : kind === 'kitchen_tall' ? 'tall_fronts' : BASE_KINDS.has(kind) ? 'base_fronts' : FURNITURE_KINDS.has(kind) ? 'furniture' : null;

export function applyColourPlan(
  plan: ColourPlanEntry[],
  objects: SceneObject[],
  finishes: SceneObjectFinish[],
  surfaces: SceneSurface[],
  roomIds: string[],
): { objects: SceneObject[]; finishes: SceneObjectFinish[]; surfaces: SceneSurface[] } {
  if (!plan.length) return { objects, finishes, surfaces };
  const hexOf = (role: ColourRole) => plan.find((p) => p.role === role)?.hex ?? null;
  const own = (objectId: string, slot: string) => finishes.some((f) => f.object_id === objectId && f.slot === slot);
  const extra: SceneObjectFinish[] = [];
  const planned = objects.map((o) => {
    const role = roleOf(o.kind);
    const hex = role ? hexOf(role) : null;
    if (!hex || o.colour_hex || o.product_id) return o;
    if (role === 'base_fronts' && hexOf('worktop') && !own(o.id, 'worktop')) {
      extra.push({ id: `plan-${o.id}-worktop`, object_id: o.id, slot: 'worktop', product_id: null, colour_hex: hexOf('worktop') });
    }
    return own(o.id, 'fronts') ? o : { ...o, colour_hex: hex };
  });
  const virtual: SceneSurface[] = [];
  for (const roomId of roomIds) {
    for (const [surface, role] of [['walls', 'walls'], ['floor', 'floor']] as const) {
      const hex = hexOf(role);
      const taken = surfaces.some((s) => s.room_id === roomId && (s.surface === surface || (surface === 'walls' && s.surface === 'wall')));
      if (hex && !taken) {
        virtual.push({ id: `plan-${roomId}-${surface}`, room_id: roomId, surface, wall_id: null, band_from_mm: null, band_to_mm: null, product_id: null, colour_hex: hex });
      }
    }
  }
  return { objects: planned, finishes: [...finishes, ...extra], surfaces: [...surfaces, ...virtual] };
}
