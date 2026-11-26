export interface ChartSize { key: string; w: number; h: number }
export interface ChartRect { key: string; x: number; y: number; w: number; h: number }
export interface Atlas { side: number; density: number; pad: number; rects: Map<string, ChartRect>; sig: string }

export const LIGHTMAP_PAD = 2;
const DENSITIES = [40, 32, 25, 20, 16, 12, 10, 8];
const SIDES = [512, 1024, 2048];

function shelf(charts: ChartSize[], density: number, side: number): Map<string, ChartRect> | null {
  const sized = charts.map((c) => ({ key: c.key, w: Math.max(1, Math.ceil(c.w * density)) + LIGHTMAP_PAD * 2, h: Math.max(1, Math.ceil(c.h * density)) + LIGHTMAP_PAD * 2 }))
    .sort((a, b) => b.h - a.h || b.w - a.w || (a.key < b.key ? -1 : 1));
  const rects = new Map<string, ChartRect>();
  let x = 0; let y = 0; let row = 0;
  for (const c of sized) {
    if (c.w > side) return null;
    if (x + c.w > side) { y += row; x = 0; row = 0; }
    if (y + c.h > side) return null;
    rects.set(c.key, { key: c.key, x, y, w: c.w, h: c.h });
    x += c.w;
    row = Math.max(row, c.h);
  }
  return rects;
}

export function packCharts(charts: ChartSize[]): Atlas | null {
  const unique = [...new Map(charts.map((c) => [c.key, c])).values()];
  for (const density of DENSITIES) {
    for (const side of SIDES) {
      const rects = shelf(unique, density, side);
      if (!rects) continue;
      const rows = [...rects.values()].sort((a, b) => (a.key < b.key ? -1 : 1)).map((r) => `${r.key}:${r.x},${r.y},${r.w},${r.h}`).join('|');
      let h = 0x811c9dc5;
      const text = `${side}/${density}/${rows}`;
      for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193) >>> 0;
      return { side, density, pad: LIGHTMAP_PAD, rects, sig: h.toString(16) };
    }
  }
  return null;
}
