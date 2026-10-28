import type { ModelTable } from './productModelTable';

export interface PlaceholderShape {
  label: string;
  w: number;
  h: number;
  /** Null when the catalog states no depth. */
  d: number | null;
}

const positive = (v: string | undefined): number | null => {
  const n = parseFloat((v ?? '').replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? n : null;
};

/** One shape per model that states both a width and a height. */
export function shapesFromModelTable(table: ModelTable | null): PlaceholderShape[] {
  if (!table) return [];
  const out: PlaceholderShape[] = [];
  for (const r of table.rows) {
    const w = positive(r.cells.width_mm);
    const h = positive(r.cells.height_mm);
    if (w && h) out.push({ label: r.model, w, h, d: positive(r.cells.depth_mm) });
  }
  return out;
}

export interface IsoPoint {
  x: number;
  y: number;
}

export interface IsoBox {
  front: IsoPoint[];
  side: IsoPoint[];
  top: IsoPoint[];
  /** Mid-points of the three edges the labels sit on. */
  widthAt: IsoPoint;
  heightAt: IsoPoint;
  depthAt: IsoPoint;
}

/** Isometric projection of a w × h × d box, scaled to fit the canvas with `pad` on every side. */
export function isoBox(w: number, h: number, d: number, width: number, height: number, pad: number): IsoBox {
  const cos = Math.cos(Math.PI / 6);
  const project = (x: number, y: number, z: number): IsoPoint => ({ x: (x - z) * cos, y: (x + z) * 0.5 - y });
  const corners = [
    project(0, 0, 0), project(w, 0, 0), project(0, h, 0), project(w, h, 0),
    project(0, 0, d), project(w, 0, d), project(0, h, d), project(w, h, d),
  ];
  const xs = corners.map(c => c.x);
  const ys = corners.map(c => c.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const spanX = Math.max(...xs) - minX;
  const spanY = Math.max(...ys) - minY;
  const scale = Math.min((width - 2 * pad) / spanX, (height - 2 * pad) / spanY);
  const offX = (width - spanX * scale) / 2;
  const offY = (height - spanY * scale) / 2;
  const at = (x: number, y: number, z: number): IsoPoint => {
    const p = project(x, y, z);
    return { x: offX + (p.x - minX) * scale, y: offY + (p.y - minY) * scale };
  };
  const mid = (a: IsoPoint, b: IsoPoint): IsoPoint => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
  return {
    front: [at(0, 0, d), at(w, 0, d), at(w, h, d), at(0, h, d)],
    side: [at(w, 0, 0), at(w, 0, d), at(w, h, d), at(w, h, 0)],
    top: [at(0, h, 0), at(w, h, 0), at(w, h, d), at(0, h, d)],
    widthAt: mid(at(0, 0, d), at(w, 0, d)),
    heightAt: mid(at(0, 0, d), at(0, h, d)),
    depthAt: mid(at(w, 0, 0), at(w, 0, d)),
  };
}
