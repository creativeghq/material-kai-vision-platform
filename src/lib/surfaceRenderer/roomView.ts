import type { Pt } from './homography';
import { insideQuad } from './homography';
import type { Coverage } from './coverage';
import type { Pattern } from './patternVocabulary';
import { normalizeUnit } from '../units';

export interface RoomViewLayer {
  surface_key: string;
  surface_kind: string;
  surface_label: string;
  width_cm: number;
  depth_cm: number;
  product_id: string;
  product_name: string;
  pattern: Pattern;
  pattern_label: string;
  grout_width_mm: number;
  grout_color_hex: string;
  rotation_deg: number;
  format_label: string;
  format_assumed: boolean;
}

export interface RoomViewPin {
  surface_key: string;
  product_id: string;
  x: number;
  y: number;
}

export interface RoomViewData {
  scene_id: string;
  scene_name: string;
  render_image_url: string;
  rendered_at: string;
  layers: RoomViewLayer[];
  pins: RoomViewPin[];
}

export function pinPointForSurface(quad: [Pt, Pt, Pt, Pt], painted: (p: Pt) => boolean, steps = 24): Pt {
  const c = { x: quad.reduce((s, p) => s + p.x, 0) / 4, y: quad.reduce((s, p) => s + p.y, 0) / 4 };
  const xs = quad.map((p) => p.x);
  const ys = quad.map((p) => p.y);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const candidates: Pt[] = [];
  for (let i = 0; i <= steps; i++) {
    for (let j = 0; j <= steps; j++) {
      const p = { x: x0 + ((x1 - x0) * i) / steps, y: y0 + ((y1 - y0) * j) / steps };
      if (insideQuad(p, quad)) candidates.push(p);
    }
  }
  candidates.sort((a, b) => (a.x - c.x) ** 2 + (a.y - c.y) ** 2 - ((b.x - c.x) ** 2 + (b.y - c.y) ** 2));
  return candidates.find(painted) ?? c;
}

export function staleProductIds(
  renderedAt: string | null | undefined,
  products: { id: string; updated_at: string | null }[],
): string[] {
  const t = renderedAt ? Date.parse(renderedAt) : NaN;
  if (!Number.isFinite(t)) return [];
  return products
    .filter((p) => p.updated_at && Number.isFinite(Date.parse(p.updated_at)) && Date.parse(p.updated_at) > t)
    .map((p) => p.id);
}

export type OrderUnit = 'm2' | 'box' | 'pcs';

export function orderQuantityForUnit(
  coverage: Coverage,
  rawUnit: string | null | undefined,
): { quantity: number; unit: OrderUnit } | null {
  if (!coverage.orderable) return null;
  if (!rawUnit || !String(rawUnit).trim()) return null;
  const unit = normalizeUnit(rawUnit);
  if (unit === 'm2' && coverage.m2Gross !== null) return { quantity: coverage.m2Gross, unit };
  if (unit === 'box' && coverage.boxes !== null) return { quantity: coverage.boxes, unit };
  if (unit === 'pcs' && coverage.piecesGross !== null) return { quantity: coverage.piecesGross, unit };
  return null;
}
