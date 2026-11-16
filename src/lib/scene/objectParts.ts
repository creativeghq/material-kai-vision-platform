import type { SceneObjectSlot } from '@/lib/scene/sceneReadSchema';

export interface ObjectPart {
  pos: [number, number, number];
  size: [number, number, number];
  color: string;
  slot: SceneObjectSlot | null;
  rough?: number;
  metal?: number;
  round?: number;
}

export const WOOD = '#9c7550';
export const WHITE = '#f2efe9';
export const STEEL = '#c3c7cc';
export const STONE = '#e9e5de';
export const DARK = '#3b3a38';

export function objectParts(kind: string, w: number, d: number, h: number, c: string): ObjectPart[] {
  const p: ObjectPart[] = [];
  const legs = (top: number, inset: number, t: number, color: string) => {
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      p.push({ pos: [sx * (w / 2 - inset), top / 2, sz * (d / 2 - inset)], size: [t, top, t], color, slot: 'legs' });
    }
  };
  const fronts = (y0: number, y1: number, z: number, color: string, cols: number, rows = 1) => {
    const gap = 0.004;
    const fw = w / cols; const fh = (y1 - y0) / rows;
    for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
      const cx = -w / 2 + fw * (i + 0.5); const cy = y0 + fh * (j + 0.5);
      p.push({ pos: [cx, cy, z], size: [fw - gap * 2, fh - gap * 2, 0.018], color, slot: 'fronts', rough: 0.35 });
      p.push({ pos: [cx, rows > 1 ? cy + fh * 0.36 : y1 - 0.07, z + 0.02], size: [Math.min(0.16, fw * 0.5), 0.012, 0.02], color: STEEL, slot: 'handles', metal: 0.8, rough: 0.25 });
    }
  };
  switch (kind) {
    case 'sofa':
    case 'armchair': {
      const seatH = Math.min(0.45, h * 0.55); const back = Math.min(0.2, d * 0.22); const arm = Math.min(0.16, w * 0.12);
      legs(0.08, 0.06, 0.04, WOOD);
      p.push({ pos: [0, 0.08 + (seatH - 0.08) / 2 - 0.06, 0], size: [w, seatH - 0.2, d], color: c, slot: 'upholstery', rough: 0.95, round: 0.03 });
      const seats = kind === 'sofa' ? Math.max(2, Math.round((w - arm * 2) / 0.8)) : 1;
      const sw = (w - arm * 2) / seats;
      for (let i = 0; i < seats; i++) p.push({ pos: [-w / 2 + arm + sw * (i + 0.5), seatH - 0.08, back / 2 + 0.01], size: [sw - 0.01, 0.16, d - back - 0.02], color: c, slot: 'upholstery', rough: 0.95, round: 0.05 });
      p.push({ pos: [0, (seatH + h) / 2 - 0.05, -d / 2 + back / 2], size: [w, h - seatH + 0.1, back], color: c, slot: 'upholstery', rough: 0.95, round: 0.05 });
      for (const sx of [-1, 1]) p.push({ pos: [sx * (w / 2 - arm / 2), seatH * 0.75, 0], size: [arm, seatH * 0.7 + 0.12, d], color: c, slot: 'upholstery', rough: 0.95, round: 0.04 });
      return p;
    }
    case 'bed': {
      const head = Math.max(0.9, h); const frameH = 0.28;
      p.push({ pos: [0, frameH / 2, 0], size: [w, frameH, d], color: c, slot: 'frame', rough: 0.9, round: 0.02 });
      p.push({ pos: [0, frameH + 0.11, 0.02], size: [w - 0.05, 0.22, d - 0.08], color: '#fbfaf7', slot: null, rough: 0.95, round: 0.05 });
      p.push({ pos: [0, frameH + 0.235, d * 0.15], size: [w - 0.02, 0.05, d * 0.68], color: '#e4dccf', slot: 'bedding', rough: 0.95, round: 0.03 });
      for (const sx of [-1, 1]) p.push({ pos: [sx * w * 0.24, frameH + 0.28, -d / 2 + 0.3], size: [w * 0.42, 0.13, 0.4], color: '#ffffff', slot: 'bedding', rough: 0.95, round: 0.05 });
      p.push({ pos: [0, head / 2, -d / 2 + 0.04], size: [w + 0.04, head, 0.08], color: c, slot: 'frame', rough: 0.9, round: 0.02 });
      return p;
    }
    case 'dining_table':
    case 'coffee_table':
    case 'side_table':
    case 'desk': {
      const top = 0.035;
      p.push({ pos: [0, h - top / 2, 0], size: [w, top, d], color: kind === 'dining_table' || kind === 'desk' ? WOOD : c, slot: 'top', rough: 0.5, round: 0.008 });
      legs(h - top, 0.06, 0.05, DARK);
      return p;
    }
    case 'chair':
    case 'stool': {
      const seat = Math.min(0.46, h * 0.6);
      p.push({ pos: [0, seat, 0], size: [w, 0.04, d], color: c, slot: 'seat', rough: 0.6, round: 0.01 });
      legs(seat - 0.02, 0.04, 0.035, WOOD);
      if (kind === 'chair') p.push({ pos: [0, (seat + h) / 2, -d / 2 + 0.02], size: [w, h - seat, 0.035], color: c, slot: 'seat', rough: 0.6, round: 0.01 });
      return p;
    }
    case 'kitchen_base':
    case 'island':
    case 'sink': {
      const plinth = 0.1; const wt = 0.04; const carcassTop = h - wt;
      p.push({ pos: [0, plinth / 2, 0.02], size: [w, plinth, d - 0.06], color: DARK, slot: 'plinth', rough: 0.8 });
      p.push({ pos: [0, plinth + (carcassTop - plinth) / 2, 0], size: [w, carcassTop - plinth, d - 0.02], color: c, slot: 'carcass', rough: 0.5 });
      fronts(plinth, carcassTop, d / 2 - 0.005, c, Math.max(1, Math.round(w / 0.6)), 1);
      p.push({ pos: [0, h - wt / 2, 0.01], size: [w + 0.02, wt, d + 0.02], color: STONE, slot: 'worktop', rough: 0.3 });
      if (kind === 'sink') {
        p.push({ pos: [0, h + 0.004, 0], size: [Math.min(0.55, w * 0.8), 0.01, Math.min(0.42, d * 0.7)], color: STEEL, slot: null, metal: 0.8, rough: 0.2 });
        p.push({ pos: [0, h + 0.15, -d / 2 + 0.08], size: [0.03, 0.3, 0.03], color: STEEL, slot: null, metal: 0.9, rough: 0.2 });
      }
      return p;
    }
    case 'kitchen_wall':
      p.push({ pos: [0, h / 2, 0], size: [w, h, d - 0.02], color: c, slot: 'carcass', rough: 0.5 });
      fronts(0, h, d / 2 - 0.005, c, Math.max(1, Math.round(w / 0.6)), 1);
      return p;
    case 'kitchen_tall':
    case 'wardrobe':
      p.push({ pos: [0, 0.05, 0.02], size: [w, 0.1, d - 0.06], color: DARK, slot: 'plinth', rough: 0.8 });
      p.push({ pos: [0, 0.1 + (h - 0.1) / 2, 0], size: [w, h - 0.1, d - 0.02], color: c, slot: 'carcass', rough: 0.5 });
      fronts(0.1, h, d / 2 - 0.005, c, Math.max(1, Math.round(w / 0.6)), kind === 'kitchen_tall' ? 2 : 1);
      return p;
    case 'cabinet':
    case 'nightstand':
    case 'tv_unit':
    case 'vanity':
      legs(0.1, 0.04, 0.03, DARK);
      p.push({ pos: [0, 0.1 + (h - 0.1) / 2, 0], size: [w, h - 0.1, d], color: c, slot: 'fronts', rough: 0.45, round: 0.01 });
      fronts(0.1, h, d / 2 + 0.004, c, Math.max(1, Math.round(w / 0.5)), kind === 'nightstand' ? 2 : 1);
      return p;
    case 'shelving':
      for (const sx of [-1, 1]) p.push({ pos: [sx * (w / 2 - 0.01), h / 2, 0], size: [0.02, h, d], color: c, slot: 'body', rough: 0.6 });
      for (let i = 0; i <= 4; i++) p.push({ pos: [0, (h - 0.02) * (i / 4) + 0.01, 0], size: [w, 0.02, d], color: c, slot: 'body', rough: 0.6 });
      return p;
    case 'appliance':
      p.push({ pos: [0, h / 2, 0], size: [w, h, d], color: STEEL, slot: 'body', metal: 0.6, rough: 0.3 });
      p.push({ pos: [0, h * 0.62, d / 2 + 0.003], size: [w * 0.86, h * 0.3, 0.006], color: '#1d1f22', slot: null, rough: 0.15 });
      return p;
    case 'toilet':
      p.push({ pos: [0, 0.2, d * 0.1], size: [w * 0.9, 0.4, d * 0.75], color: '#fbfbfb', slot: 'body', rough: 0.15, round: 0.08 });
      p.push({ pos: [0, Math.max(0.6, h) - 0.2, -d / 2 + 0.09], size: [w, 0.4, 0.18], color: '#fbfbfb', slot: 'body', rough: 0.15, round: 0.04 });
      return p;
    case 'bathtub':
      p.push({ pos: [0, h / 2, 0], size: [w, h, d], color: '#fbfbfb', slot: 'body', rough: 0.15, round: 0.04 });
      p.push({ pos: [0, h - 0.02, 0], size: [w - 0.12, 0.03, d - 0.12], color: '#e6ecef', slot: null, rough: 0.1 });
      return p;
    case 'shower':
      p.push({ pos: [0, 0.03, 0], size: [w, 0.06, d], color: '#fbfbfb', slot: 'body', rough: 0.2 });
      p.push({ pos: [0, h / 2, d / 2], size: [w, h, 0.01], color: '#cfe3ec', slot: null, rough: 0.05 });
      return p;
    case 'rug':
      p.push({ pos: [0, 0.006, 0], size: [w, 0.012, d], color: c, slot: 'fabric', rough: 1 });
      return p;
    case 'lamp':
      p.push({ pos: [0, 0.015, 0], size: [w * 0.5, 0.03, w * 0.5], color: DARK, slot: 'base', rough: 0.5, round: 0.01 });
      p.push({ pos: [0, h * 0.4, 0], size: [0.025, h * 0.8, 0.025], color: DARK, slot: 'base', metal: 0.6, rough: 0.4 });
      p.push({ pos: [0, h * 0.86, 0], size: [w, h * 0.28, w], color: '#f6eedd', slot: 'shade', rough: 0.9, round: 0.02 });
      return p;
    case 'tv':
      p.push({ pos: [0, h / 2, 0], size: [w, h, 0.04], color: '#111214', slot: 'body', rough: 0.2 });
      return p;
    case 'artwork':
    case 'mirror':
      p.push({ pos: [0, h / 2, 0], size: [w, h, 0.03], color: DARK, slot: 'body', rough: 0.6 });
      p.push({ pos: [0, h / 2, 0.018], size: [w - 0.06, h - 0.06, 0.006], color: kind === 'mirror' ? '#dfe6ea' : c, slot: null, rough: kind === 'mirror' ? 0.05 : 0.8, metal: kind === 'mirror' ? 0.9 : 0 });
      return p;
    case 'radiator':
      for (let x = -w / 2 + 0.04; x < w / 2; x += 0.08) p.push({ pos: [x, h / 2, 0], size: [0.05, h, d], color: WHITE, slot: 'body', rough: 0.4 });
      return p;
    case 'curtain':
      for (let x = -w / 2 + 0.05; x < w / 2; x += 0.1) p.push({ pos: [x, h / 2, (Math.round(x * 10) % 2) * 0.03], size: [0.09, h, 0.03], color: c, slot: 'fabric', rough: 1 });
      return p;
    case 'stairs': {
      const steps = Math.max(3, Math.round(h / 0.18));
      for (let i = 0; i < steps; i++) p.push({ pos: [0, (h / steps) * (i + 0.5), -d / 2 + (d / steps) * (i + 0.5)], size: [w, h / steps, d / steps], color: WOOD, slot: 'body', rough: 0.6 });
      return p;
    }
    default:
      p.push({ pos: [0, h / 2, 0], size: [w, h, d], color: c, slot: 'body', rough: 0.7, round: Math.min(0.04, Math.min(w, d, h) * 0.15) });
      return p;
  }
}
