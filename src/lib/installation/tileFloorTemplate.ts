/** Tile-floor installation template: layout, quantities, steps and per-step 3D scene state. */
import { PATTERN_LABELS, type Pattern } from '@/lib/surfaceRenderer/patternVocabulary';
import { clipSegment, layPattern } from './tilePieces';

export type TileAnchor = 'centre' | 'corner';

export interface TileFloorParams {
  areaWidthM: number;
  areaDepthM: number;
  /** Long side, laid along the area's width. */
  tileLengthMm: number;
  tileWidthMm: number;
  tileThicknessMm: number;
  jointMm: number;
  perimeterGapMm: number;
  trowelNotchMm: number;
  pattern: Pattern;
  rotationDeg: number;
  anchor: TileAnchor;
  prime: boolean;
  backButter: boolean;
  adhesiveCureHours: number;
  groutCureHours: number;
}

export interface TilePiece {
  index: number;
  row: number;
  cx: number;
  cz: number;
  length: number;
  width: number;
  angle: number;
  cut: boolean;
  visible: { lx: number; lz: number } | null;
  /** 0-based position in the laying order: every full tile first, then the cuts. */
  order: number;
}

export interface TileSpacer {
  x: number;
  z: number;
  /** Laying-order index of the last piece touching it; it appears once that piece is down. */
  afterOrder: number;
}

export interface TileIssue {
  level: 'error' | 'warning';
  message: string;
}

export type TileStepKey =
  | 'prepare'
  | 'prime'
  | 'set_out'
  | 'spread'
  | 'back_butter'
  | 'lay_full'
  | 'lay_cuts'
  | 'level'
  | 'grout'
  | 'clean';

export type CameraShot = 'overview' | 'low' | 'top' | 'close' | 'side';

export interface TileStep {
  key: TileStepKey;
  title: string;
  instruction: string;
  tools: string[];
  wait?: string;
  warning?: string;
  camera: CameraShot;
  durationS: number;
}

export interface TileQuantities {
  areaM2: number;
  tileAreaM2: number;
  pieces: number;
  fullTiles: number;
  cutTiles: number;
  tilesFromLayout: number;
  tilesToBuy: number;
  sparePct: number;
  spacers: number;
  adhesiveKg: number;
  groutKg: number;
}

export interface TileFloorPlan {
  params: TileFloorParams;
  innerWidthMm: number;
  innerDepthMm: number;
  pieces: TilePiece[];
  spacers: TileSpacer[];
  centreX: number;
  centreZ: number;
  dryLay: number[];
  quantities: TileQuantities;
  steps: TileStep[];
  issues: TileIssue[];
}

export const TILE_FLOOR_LIMITS = {
  areaM: { min: 0.5, max: 8 },
  tileMm: { min: 50, max: 3200 },
  thicknessMm: { min: 3, max: 30 },
  jointMm: { min: 1, max: 20 },
  gapMm: { min: 0, max: 20 },
  notchMm: { min: 3, max: 20 },
  maxPieces: 4000,
} as const;

export const SPARE_PCT = 5;
const CUT_ALLOWANCE_MM = 5;
const GROUT_DENSITY = 1.6;
const BACK_BUTTER_KG_M2 = 1;

export function suggestedTrowelNotchMm(longSideMm: number): number {
  if (longSideMm <= 200) return 6;
  if (longSideMm <= 400) return 8;
  if (longSideMm <= 600) return 10;
  return 12;
}

export function suggestBackButter(longSideMm: number): boolean {
  return longSideMm >= 600;
}

export function adhesiveKgPerM2(notchMm: number): number {
  const table: Array<[number, number]> = [[3, 1.5], [6, 2.5], [8, 3.2], [10, 4], [12, 5], [20, 8]];
  if (notchMm <= table[0][0]) return table[0][1];
  for (let i = 1; i < table.length; i++) {
    const [n1, k1] = table[i];
    if (notchMm <= n1) {
      const [n0, k0] = table[i - 1];
      return k0 + ((notchMm - n0) / (n1 - n0)) * (k1 - k0);
    }
  }
  return table[table.length - 1][1];
}

export function groutKgPerM2(lengthMm: number, widthMm: number, thicknessMm: number, jointMm: number): number {
  return ((lengthMm + widthMm) / (lengthMm * widthMm)) * thicknessMm * jointMm * GROUT_DENSITY;
}

export const DEFAULT_TILE_FLOOR: TileFloorParams = {
  areaWidthM: 3,
  areaDepthM: 2.4,
  tileLengthMm: 600,
  tileWidthMm: 600,
  tileThicknessMm: 10,
  jointMm: 3,
  perimeterGapMm: 5,
  trowelNotchMm: suggestedTrowelNotchMm(600),
  pattern: 'stack',
  rotationDeg: 0,
  anchor: 'centre',
  prime: true,
  backButter: suggestBackButter(600),
  adhesiveCureHours: 24,
  groutCureHours: 24,
};

const EPS = 0.5;

function tilesForCuts(cuts: Array<{ lx: number; lz: number }>, tl: number, tw: number): number {
  const binPack = (sizes: number[], capacity: number): number => {
    const left: number[] = [];
    for (const size of [...sizes].sort((x, y) => y - x)) {
      const i = left.findIndex((room) => room >= size + CUT_ALLOWANCE_MM);
      if (i >= 0) left[i] -= size + CUT_ALLOWANCE_MM;
      else left.push(capacity - size);
    }
    return left.length;
  };
  const alongLength = cuts.filter((c) => c.lz >= tw - EPS).map((c) => c.lx);
  const alongWidth = cuts.filter((c) => c.lx >= tl - EPS).map((c) => c.lz);
  const corners = cuts.length - alongLength.length - alongWidth.length;
  return binPack(alongLength, tl) + binPack(alongWidth, tw) + corners;
}

const RUNNING: Pattern[] = ['stack', 'offset_1_2', 'offset_1_3'];

function validate(p: TileFloorParams): TileIssue[] {
  const L = TILE_FLOOR_LIMITS;
  const issues: TileIssue[] = [];
  const within = (v: number, r: { min: number; max: number }) => Number.isFinite(v) && v >= r.min && v <= r.max;
  if (!within(p.areaWidthM, L.areaM) || !within(p.areaDepthM, L.areaM)) {
    issues.push({ level: 'error', message: `Room sides must be between ${L.areaM.min} and ${L.areaM.max} m.` });
  }
  if (!within(p.tileLengthMm, L.tileMm) || !within(p.tileWidthMm, L.tileMm)) {
    issues.push({ level: 'error', message: `Tile sides must be between ${L.tileMm.min} and ${L.tileMm.max} mm.` });
  }
  if (!within(p.tileThicknessMm, L.thicknessMm)) {
    issues.push({ level: 'error', message: `Tile thickness must be between ${L.thicknessMm.min} and ${L.thicknessMm.max} mm.` });
  }
  if (!within(p.jointMm, L.jointMm)) {
    issues.push({ level: 'error', message: `Joint width must be between ${L.jointMm.min} and ${L.jointMm.max} mm.` });
  }
  if (!within(p.perimeterGapMm, L.gapMm)) {
    issues.push({ level: 'error', message: `Perimeter gap must be between ${L.gapMm.min} and ${L.gapMm.max} mm.` });
  }
  if (!within(p.trowelNotchMm, L.notchMm)) {
    issues.push({ level: 'error', message: `Trowel notch must be between ${L.notchMm.min} and ${L.notchMm.max} mm.` });
  }
  if (!Number.isFinite(p.adhesiveCureHours) || p.adhesiveCureHours < 0 || !Number.isFinite(p.groutCureHours) || p.groutCureHours < 0) {
    issues.push({ level: 'error', message: 'Curing times cannot be negative.' });
  }
  return issues;
}

function buildSteps(p: TileFloorParams, q: TileQuantities, pattern: string): TileStep[] {
  const size = `${p.tileLengthMm}×${p.tileWidthMm} mm`;
  const steps: TileStep[] = [
    {
      key: 'prepare',
      title: 'Check and prepare the floor',
      instruction:
        'The floor must be sound, clean, dry and flat. Lay a 2 m straightedge in several directions: a gap of more than 3 mm under it needs a levelling compound first.',
      tools: ['2 m straightedge', 'Vacuum', 'Levelling compound (if needed)'],
      camera: 'low',
      durationS: 4,
    },
  ];
  if (p.prime) {
    steps.push({
      key: 'prime',
      title: 'Prime the floor',
      instruction: 'Roll primer over the whole floor so the adhesive bonds and does not dry out on a porous base.',
      tools: ['Primer', 'Roller'],
      wait: 'Let the primer dry as its label says, usually 1–2 hours.',
      camera: 'overview',
      durationS: 3,
    });
  }
  steps.push(
    {
      key: 'set_out',
      title: 'Set out from the centre',
      instruction: `Snap two chalk lines through the middle of the room and dry-lay a row of ${size} tiles with ${p.jointMm} mm joints along each. Starting from the centre makes the cuts at opposite walls match. Leave a ${p.perimeterGapMm} mm gap at every wall.`,
      tools: ['Chalk line', 'Tape measure', 'Square'],
      camera: 'top',
      durationS: 4,
    },
    {
      key: 'spread',
      title: 'Spread the adhesive',
      instruction: `Spread adhesive with a ${p.trowelNotchMm} mm notched trowel and comb it in straight parallel lines. Work from the far wall towards the door, and spread only what you can tile before the adhesive skins over (its open time, often 20–30 minutes).`,
      tools: [`${p.trowelNotchMm} mm notched trowel`, 'Tile adhesive', 'Bucket and mixer'],
      warning: 'Touch the adhesive before each tile: if it no longer sticks to your finger, scrape it off and spread fresh.',
      camera: 'low',
      durationS: 5,
    },
  );
  if (p.backButter) {
    steps.push({
      key: 'back_butter',
      title: 'Back-butter each tile',
      instruction: 'Large tiles need adhesive on both faces. Skim a thin flat coat on the back of each tile with the flat side of the trowel.',
      tools: ['Flat trowel'],
      camera: 'close',
      durationS: 3,
    });
  }
  const laying: TileStep[] = [
    {
      key: 'lay_full',
      title: `Lay the ${q.fullTiles} full tiles`,
      instruction: `Lay the full tiles in a ${pattern} pattern, starting at the centre lines and working back towards the door. Press and slide each tile slightly across the ridges, and put a spacer at every joint corner.`,
      tools: [`${p.jointMm} mm spacers`, 'Rubber mallet'],
      camera: 'overview',
      durationS: 8,
    },
    {
      key: 'lay_cuts',
      title: `Cut and lay the ${q.cutTiles} edge pieces`,
      instruction: `Measure each edge piece from the last full tile to the wall, minus the ${p.perimeterGapMm} mm gap, and cut it. Lay cuts with the factory edge against the field and the cut edge to the wall.`,
      tools: ['Tile cutter', 'Angle grinder (for notches)', 'Pencil'],
      camera: 'top',
      durationS: 6,
    },
  ];
  steps.push(...laying.filter((s) => (s.key === 'lay_full' ? q.fullTiles : q.cutTiles) > 0));
  steps.push(
    {
      key: 'level',
      title: 'Check level and lippage',
      instruction: 'Run a spirit level across the tiles in both directions. Neighbouring edges should sit flush; tap a high tile down with the mallet while the adhesive is still soft.',
      tools: ['Spirit level', 'Rubber mallet'],
      wait: `Let the adhesive cure ${p.adhesiveCureHours} h before walking on the floor or grouting.`,
      camera: 'side',
      durationS: 4,
    },
    {
      key: 'grout',
      title: 'Remove spacers and grout',
      instruction: `Pull out every spacer, then work grout diagonally across the joints with a rubber float until they are full. You need about ${q.groutKg.toFixed(1)} kg for this floor.`,
      tools: ['Grout', 'Rubber float'],
      camera: 'close',
      durationS: 5,
    },
    {
      key: 'clean',
      title: 'Clean and let it cure',
      instruction: 'When the grout firms up, wipe the haze off with a damp sponge, rinsing it often. Fill the perimeter gap with flexible sealant, not grout.',
      tools: ['Sponge', 'Clean water', 'Flexible sealant'],
      wait: `Keep foot traffic off for ${p.groutCureHours} h while the grout cures.`,
      camera: 'overview',
      durationS: 4,
    },
  );
  return steps;
}

export function buildTileFloorPlan(params: TileFloorParams): TileFloorPlan {
  const issues = validate(params);
  const gap = params.perimeterGapMm;
  const roomW = params.areaWidthM * 1000;
  const roomD = params.areaDepthM * 1000;
  const innerW = Math.max(roomW - 2 * gap, 0);
  const innerD = Math.max(roomD - 2 * gap, 0);
  const { tileLengthMm: tl, tileWidthMm: tw, jointMm: j } = params;

  const empty = (): TileFloorPlan => {
    const quantities: TileQuantities = {
      areaM2: 0, tileAreaM2: 0, pieces: 0, fullTiles: 0, cutTiles: 0,
      tilesFromLayout: 0, tilesToBuy: 0, sparePct: SPARE_PCT, spacers: 0, adhesiveKg: 0, groutKg: 0,
    };
    return {
      params, innerWidthMm: innerW, innerDepthMm: innerD, pieces: [], spacers: [],
      centreX: roomW / 2, centreZ: roomD / 2, dryLay: [], quantities, steps: [], issues,
    };
  };
  if (issues.some((i) => i.level === 'error')) return empty();

  const area = { x0: gap, z0: gap, x1: gap + innerW, z1: gap + innerD };
  const axisAligned = RUNNING.includes(params.pattern) && (((params.rotationDeg % 90) + 90) % 90) === 0;
  const L = Math.max(tl, tw);
  const Wd = Math.min(tl, tw);
  const frame = (ox: number, oz: number) => ({ originX: ox, originZ: oz, rotationDeg: params.rotationDeg });
  let candidates = [frame(0, 0)];
  if (params.anchor === 'centre') {
    const cx = roomW / 2;
    const cz = roomD / 2;
    candidates = [
      frame(cx - L / 2, cz - Wd / 2), frame(cx + j / 2, cz - Wd / 2),
      frame(cx - L / 2, cz + j / 2), frame(cx + j / 2, cz + j / 2),
    ];
  }
  const estimate = Math.ceil((innerW * innerD) / ((Wd + j) * (L + j))) + Math.ceil((2 * (innerW + innerD)) / Wd);
  if (estimate > TILE_FLOOR_LIMITS.maxPieces) {
    issues.push({ level: 'error', message: `That is about ${estimate} pieces, more than the viewer can draw. Use a smaller room or larger tiles.` });
    return empty();
  }
  type Laid = { p: ReturnType<typeof layPattern>[number]; cut: boolean; visible: { lx: number; lz: number } | null };
  const describe = (pcs: ReturnType<typeof layPattern>): Laid[] => pcs.map((p) => {
    const xs = p.corners.map((k) => k[0]);
    const zs = p.corners.map((k) => k[1]);
    const inside = xs.every((x) => x >= area.x0 - EPS && x <= area.x1 + EPS) && zs.every((z) => z >= area.z0 - EPS && z <= area.z1 + EPS);
    const visible = axisAligned
      ? {
        lx: Math.min(Math.max(...xs), area.x1) - Math.max(Math.min(...xs), area.x0),
        lz: Math.min(Math.max(...zs), area.z1) - Math.max(Math.min(...zs), area.z0),
      }
      : null;
    return { p, cut: !inside, visible };
  });
  const smallest = (laid: Laid[]) => Math.min(Infinity, ...laid.filter((x) => x.cut && x.visible).map((x) => Math.min(x.visible!.lx, x.visible!.lz)));
  let laid = describe(layPattern(params.pattern, tw, tl, j, candidates[0], area));
  for (const f of candidates.slice(1)) {
    const next = describe(layPattern(params.pattern, tw, tl, j, f, area));
    if (smallest(next) > smallest(laid) + EPS) laid = next;
  }

  const byPosition = (x: Laid, y: Laid) => (x.p.cz - y.p.cz) || (x.p.cx - y.p.cx);
  const full = laid.filter((x) => !x.cut).sort(byPosition);
  const cuts = laid.filter((x) => x.cut).sort(byPosition);
  const ordered = [...full, ...cuts];
  const pieces: TilePiece[] = ordered.map((x, i) => ({
    index: i, row: x.p.j, cx: x.p.cx, cz: x.p.cz, length: x.p.length, width: x.p.width, angle: x.p.angle,
    cut: x.cut, visible: x.visible, order: i,
  }));

  const radius = j * 1.5 + 1;
  const cells = new Map<string, TileSpacer[]>();
  const spacers: TileSpacer[] = [];
  const addSpacer = (x: number, z: number, order: number) => {
    const ki = Math.floor(x / radius);
    const kj = Math.floor(z / radius);
    for (let di = -1; di <= 1; di++) {
      for (let dj = -1; dj <= 1; dj++) {
        for (const sp of cells.get(`${ki + di}:${kj + dj}`) ?? []) {
          if (Math.hypot(sp.x - x, sp.z - z) <= radius) {
            sp.afterOrder = Math.max(sp.afterOrder, order);
            return;
          }
        }
      }
    }
    const sp = { x, z, afterOrder: order };
    spacers.push(sp);
    const key = `${ki}:${kj}`;
    cells.set(key, [...(cells.get(key) ?? []), sp]);
  };
  const atRoomCorner = (px: number, pz: number) =>
    (Math.abs(px - area.x0) < EPS || Math.abs(px - area.x1) < EPS) && (Math.abs(pz - area.z0) < EPS || Math.abs(pz - area.z1) < EPS);
  ordered.forEach((x, order) => {
    const k = x.p.corners;
    for (let n = 0; n < 4; n++) {
      const seg = clipSegment(k[n], k[(n + 1) % 4], area);
      if (!seg) continue;
      for (const [px, pz] of seg) if (!atRoomCorner(px, pz)) addSpacer(px, pz, order);
    }
  });

  const centreX = roomW / 2;
  const centreZ = roomD / 2;
  const dryLay = pieces
    .filter((pc) => !pc.cut && (Math.abs(pc.cz - centreZ) <= Wd || Math.abs(pc.cx - centreX) <= Wd))
    .map((pc) => pc.index);

  const tilesFromLayout = full.length + (axisAligned ? tilesForCuts(cuts.map((x) => x.visible!), L, Wd) : cuts.length);
  const areaM2 = params.areaWidthM * params.areaDepthM;
  const tileAreaM2 = (tl * tw) / 1e6;
  const quantities: TileQuantities = {
    areaM2,
    tileAreaM2,
    pieces: pieces.length,
    fullTiles: full.length,
    cutTiles: cuts.length,
    tilesFromLayout,
    tilesToBuy: Math.ceil(tilesFromLayout * (1 + SPARE_PCT / 100) - 1e-9),
    sparePct: SPARE_PCT,
    spacers: spacers.length,
    adhesiveKg: areaM2 * (adhesiveKgPerM2(params.trowelNotchMm) + (params.backButter ? BACK_BUTTER_KG_M2 : 0)),
    groutKg: areaM2 * groutKgPerM2(tl, tw, params.tileThicknessMm, j),
  };

  if (params.pattern === 'offset_1_2' && Math.max(tl, tw) >= 600) {
    issues.push({
      level: 'warning',
      message: 'Large tiles are slightly bowed, so a half offset puts a high centre next to a low edge. Most manufacturers allow at most a one-third offset — check the tile data sheet.',
    });
  }
  if (params.trowelNotchMm < suggestedTrowelNotchMm(Math.max(tl, tw))) {
    issues.push({
      level: 'warning',
      message: `A ${params.trowelNotchMm} mm notch is small for this tile; ${suggestedTrowelNotchMm(Math.max(tl, tw))} mm is typical. Too little adhesive leaves hollow spots that crack.`,
    });
  }
  const minCut = Math.min(Infinity, ...cuts.filter((c) => c.visible).map((c) => Math.min(c.visible!.lx, c.visible!.lz)));
  if (Number.isFinite(minCut) && minCut < Math.min(tl, tw) / 4) {
    issues.push({
      level: 'warning',
      message: `The narrowest edge piece is ${Math.round(minCut)} mm. Pieces that thin break easily when cut; a different tile size, pattern or starting line avoids them.`,
    });
  }

  return {
    params,
    innerWidthMm: innerW,
    innerDepthMm: innerD,
    pieces,
    spacers,
    centreX,
    centreZ,
    dryLay,
    quantities,
    steps: buildSteps(params, quantities, PATTERN_LABELS[params.pattern].toLowerCase()),
    issues,
  };
}

export interface TileSceneState {
  straightedge: number | null;
  primer: number;
  chalk: number;
  dryLay: number;
  adhesive: number;
  backButter: number | null;
  /** Pieces placed in laying order; the fractional part is the piece being set down. */
  placed: number;
  spacersVisible: boolean;
  highlightCuts: boolean;
  level: number | null;
  grout: number;
  sponge: number | null;
}

function emptyScene(): TileSceneState {
  return {
    straightedge: null, primer: 0, chalk: 0, dryLay: 0, adhesive: 0, backButter: null,
    placed: 0, spacersVisible: false, highlightCuts: false, level: null, grout: 0, sponge: null,
  };
}

function applyStep(s: TileSceneState, step: TileStep, t: number, plan: TileFloorPlan, current: boolean): void {
  const { fullTiles, cutTiles } = plan.quantities;
  switch (step.key) {
    case 'prepare':
      s.straightedge = current ? t : null;
      break;
    case 'prime':
      s.primer = t;
      break;
    case 'set_out':
      s.chalk = Math.min(1, t * 2);
      s.dryLay = current ? Math.max(0, t * 2 - 1) : 0;
      break;
    case 'spread':
      s.adhesive = t;
      break;
    case 'back_butter':
      s.backButter = current ? t : null;
      break;
    case 'lay_full':
      s.chalk = current ? 1 - t : 0;
      s.placed = t * fullTiles;
      s.spacersVisible = true;
      break;
    case 'lay_cuts':
      s.placed = fullTiles + t * cutTiles;
      s.highlightCuts = current;
      s.spacersVisible = true;
      break;
    case 'level':
      s.level = current ? t : null;
      break;
    case 'grout':
      s.spacersVisible = !(t > 0);
      s.grout = current ? Math.max(0, (t - 0.15) / 0.85) : 1;
      break;
    case 'clean':
      s.sponge = current ? t : null;
      break;
  }
}

export function sceneStateAt(plan: TileFloorPlan, stepIndex: number, progress: number): TileSceneState {
  const s = emptyScene();
  const last = Math.min(Math.max(stepIndex, 0), plan.steps.length - 1);
  const t = Math.min(Math.max(progress, 0), 1);
  for (let i = 0; i <= last; i++) applyStep(s, plan.steps[i], i === last ? t : 1, plan, i === last);
  return s;
}

export interface TileProgressCounts {
  tilesPlaced: number;
  cutsPlaced: number;
  spacersPlaced: number;
}

export function progressCounts(plan: TileFloorPlan, state: TileSceneState): TileProgressCounts {
  const placed = Math.floor(state.placed + 1e-9);
  const { fullTiles } = plan.quantities;
  return {
    tilesPlaced: Math.min(placed, fullTiles),
    cutsPlaced: Math.max(0, placed - fullTiles),
    spacersPlaced: state.spacersVisible ? plan.spacers.filter((sp) => sp.afterOrder < placed).length : 0,
  };
}

export interface CameraPose {
  position: [number, number, number];
  target: [number, number, number];
}

export function cameraPose(shot: CameraShot, widthM: number, depthM: number): CameraPose {
  const span = Math.max(widthM, depthM);
  const from = (dir: [number, number, number], dist: number, target: [number, number, number]): CameraPose => {
    const len = Math.hypot(...dir);
    return {
      position: [target[0] + (dir[0] / len) * dist, target[1] + (dir[1] / len) * dist, target[2] + (dir[2] / len) * dist],
      target,
    };
  };
  switch (shot) {
    case 'top':
      return from([0, 1, 0.12], span * 1.45, [0, 0, 0]);
    case 'low':
      return from([-0.25, 0.38, 1], span * 1.5, [0, 0, -depthM * 0.05]);
    case 'close':
      return from([0.35, 0.75, 1], span * 1.05, [widthM * 0.1, 0, depthM * 0.2]);
    case 'side':
      return from([1, 0.28, 0.25], span * 1.45, [0, 0, 0]);
    case 'overview':
    default:
      return from([0.55, 0.95, 1], span * 1.55, [0, 0, 0]);
  }
}
