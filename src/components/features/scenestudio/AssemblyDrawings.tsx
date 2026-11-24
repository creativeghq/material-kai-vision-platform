import React from 'react';

import { DRAWING, DrawingSheet, fitDrawing } from '@/components/features/scenestudio/KitchenDrawings';
import { PART_LABELS, type BoardSlot, type CabinetAssembly, type Panel, type Vec3 } from '@/lib/scene/cabinetPanels';
import { MODULE_LABELS } from '@/lib/scene/kitchenComposition';

const { SHEET_W, SHEET_H, MARGIN, INK, FAINT, STATED, CONFLICT } = DRAWING;
const PANEL_W = 132;
const C30 = Math.cos(Math.PI / 6);
const S30 = 0.5;

const SLOT_FILL: Record<BoardSlot, string> = { carcass: '#f4efe4', fronts: '#dfe8f5', back: '#ece4d3', plinth: '#d9d4c8' };
const SLOT_LABEL: Record<BoardSlot, string> = { carcass: 'Carcass', fronts: 'Fronts', back: 'Back', plinth: 'Plinth' };

const shade = (hex: string, f: number) => {
  const n = parseInt(hex.slice(1), 16);
  const ch = (v: number) => Math.max(0, Math.min(255, Math.round(v * f))).toString(16).padStart(2, '0');
  return `#${ch((n >> 16) & 255)}${ch((n >> 8) & 255)}${ch(n & 255)}`;
};

const project = ([x, y, z]: Vec3): [number, number] => [(x - z) * C30, -y + (x + z) * S30];

function explode(p: Panel, e: number): Vec3 {
  const [x, y, z] = p.pos;
  switch (p.role) {
    case 'side': return [x + (x > 0 ? 2.6 : 0.8) * e, y, z];
    case 'top': case 'rail': return [x, y + e, z];
    case 'bottom': return [x, y - e * 0.5, z];
    case 'plinth': return [x, y - e * 1.2, z + e * 0.4];
    case 'back': return [x, y, z - e];
    case 'door': case 'drawer_front': case 'lift_door': case 'fixed_front': return [x, y, z + e * 2.6];
    case 'drawer_side': case 'drawer_end': case 'drawer_bottom': return [x, y, z + e * 1.4];
    default: return [x, y, z];
  }
}

interface Face { pts: [number, number][]; fill: string }

function paintOrder(boxes: Array<{ c: Vec3; s: Vec3 }>): number[] {
  const lo = boxes.map((b) => b.c.map((v, k) => v - b.s[k] / 2));
  const hi = boxes.map((b) => b.c.map((v, k) => v + b.s[k] / 2));
  const behind = (a: number, b: number) => [0, 1, 2].some((k) => hi[a][k] <= lo[b][k] + 0.5) && ![0, 1, 2].some((k) => hi[b][k] <= lo[a][k] + 0.5);
  const order: number[] = [];
  const done = new Set<number>();
  const rest = boxes.map((_, i) => i).sort((a, b) => boxes[a].c.reduce((x, y) => x + y, 0) - boxes[b].c.reduce((x, y) => x + y, 0));
  while (order.length < boxes.length) {
    const next = rest.find((i) => !done.has(i) && !rest.some((j) => j !== i && !done.has(j) && behind(j, i))) ?? rest.find((i) => !done.has(i))!;
    done.add(next);
    order.push(next);
  }
  return order;
}

function boxFaces(c: Vec3, s: Vec3, fill: string): Face[] {
  const [hx, hy, hz] = [s[0] / 2, s[1] / 2, s[2] / 2];
  const v = (dx: number, dy: number, dz: number) => project([c[0] + dx * hx, c[1] + dy * hy, c[2] + dz * hz]);
  return [
    { pts: [v(-1, -1, 1), v(1, -1, 1), v(1, 1, 1), v(-1, 1, 1)], fill },
    { pts: [v(1, -1, 1), v(1, -1, -1), v(1, 1, -1), v(1, 1, 1)], fill: shade(fill, 0.86) },
    { pts: [v(-1, 1, 1), v(1, 1, 1), v(1, 1, -1), v(-1, 1, -1)], fill: shade(fill, 1.04) },
  ];
}

const area = (pts: [number, number][]) => Math.abs(pts.reduce((a, p, i) => { const q = pts[(i + 1) % pts.length]; return a + p[0] * q[1] - q[0] * p[1]; }, 0)) / 2;
const inside = (q: [number, number], pts: [number, number][]) => {
  let hit = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i];
    const [xj, yj] = pts[j];
    if (yi > q[1] !== yj > q[1] && q[0] < ((xj - xi) * (q[1] - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
};
const onFace = (pts: [number, number][], u: number, v: number): [number, number] => {
  const lerp = (a: [number, number], b: [number, number], t: number): [number, number] => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  return lerp(lerp(pts[0], pts[1], u), lerp(pts[3], pts[2], u), v);
};
const SPOTS: Array<[number, number]> = [[0.5, 0.5], [0.3, 0.3], [0.7, 0.7], [0.3, 0.7], [0.7, 0.3], [0.5, 0.15], [0.5, 0.85], [0.15, 0.5], [0.85, 0.5]];

const band = (long: number | null, short: number | null) => (long == null ? '?' : long + short! === 0 ? '—' : [long ? `${long}L` : '', short ? `${short}S` : ''].filter(Boolean).join(' '));

export function assemblyTitle(a: CabinetAssembly): string {
  return `${MODULE_LABELS[a.type] ?? a.type} ${Math.round(a.width_mm / 10)} × ${Math.round(a.height_mm / 10)} × ${Math.round(a.depth_mm / 10)}`;
}

const ExplodedView: React.FC<{ a: CabinetAssembly }> = ({ a }) => {
  const [W, H, D] = a.cabinet.size;
  const e = Math.max(140, 0.28 * Math.max(W, D, H * 0.6));
  const placed = a.cabinet.panels.map((p, i) => ({ p, i, c: explode(p, e) }));
  const order = paintOrder(placed.map(({ p, c }) => ({ c, s: p.size })));
  const rank = new Map(order.map((k, r) => [k, r]));
  const faces = order.flatMap((k) => boxFaces(placed[k].c, placed[k].p.size, SLOT_FILL[placed[k].p.slot]).map((f) => ({ ...f, k })));
  const xs = faces.flatMap((f) => f.pts.map((q) => q[0]));
  const ys = faces.flatMap((f) => f.pts.map((q) => q[1]));
  const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const { s, ox, oy } = fitDrawing(maxX - minX, maxY - minY, PANEL_W + 6);
  const tx = (q: [number, number]) => `${ox + (q[0] - minX) * s},${oy + (q[1] - minY) * s}`;
  const labelled = new Set<number>();
  const bubbles: Array<{ no: number; at: [number, number] }> = [];
  for (const { p, i, c } of [...placed].sort((x, y) => rank.get(y.i)! - rank.get(x.i)!)) {
    const no = a.panel_part[i];
    if (labelled.has(no)) continue;
    labelled.add(no);
    const own = boxFaces(c, p.size, '#fff').filter((f) => area(f.pts) * s * s > 4).sort((f, g) => area(g.pts) - area(f.pts));
    const cover = faces.filter((f) => rank.get(f.k)! > rank.get(i)!).map((f) => f.pts);
    const toSheet = (q: [number, number]): [number, number] => [ox + (q[0] - minX) * s, oy + (q[1] - minY) * s];
    const free = (q: [number, number]) => !cover.some((pts) => inside(q, pts)) && bubbles.every((b) => Math.hypot(b.at[0] - toSheet(q)[0], b.at[1] - toSheet(q)[1]) > 4.6);
    const spot = own.flatMap((f) => SPOTS.map(([u, v]) => onFace(f.pts, u, v))).find(free) ?? onFace((own[0] ?? boxFaces(c, p.size, '#fff')[0]).pts, 0.5, 0.5);
    bubbles.push({ no, at: toSheet(spot) });
  }
  return (
    <g>
      {faces.map((f, k) => <polygon key={k} points={f.pts.map(tx).join(' ')} fill={f.fill} stroke={INK} strokeWidth={0.14} strokeLinejoin="round" />)}
      <g fontFamily="Arial, sans-serif">
        {bubbles.map((b) => (
          <g key={b.no} transform={`translate(${b.at[0]}, ${b.at[1]})`}>
            <circle r={2.1} fill="#fff" stroke={STATED} strokeWidth={0.3} />
            <text y={0.75} fontSize={2.1} textAnchor="middle" fill={STATED} fontWeight={700}>{b.no}</text>
          </g>
        ))}
      </g>
    </g>
  );
};

const PartsPanel: React.FC<{ a: CabinetAssembly }> = ({ a }) => {
  const x0 = SHEET_W - MARGIN - PANEL_W;
  const cols = [0, 7, 40, 49, 84, 112];
  let y = MARGIN + 6;
  const rows: React.ReactNode[] = [];
  const text = (key: string, x: number, t: string, o: { bold?: boolean; size?: number; fill?: string; anchor?: 'end' } = {}) =>
    rows.push(<text key={key} x={x0 + x} y={y} fontSize={o.size ?? 2} fontWeight={o.bold ? 700 : undefined} fill={o.fill ?? INK} textAnchor={o.anchor}>{t}</text>);
  text('h', 0, 'Panel List', { bold: true, size: 2.6 });
  y += 4.2;
  ['No.', 'Part', 'Qty', 'L × W × T (mm)', 'Board', 'Edges'].forEach((h, i) => text(`hc${i}`, cols[i], h, { bold: true, size: 1.8 }));
  rows.push(<line key="hl" x1={x0} y1={y + 1} x2={x0 + PANEL_W} y2={y + 1} stroke={INK} strokeWidth={0.2} />);
  y += 3.6;
  for (const p of a.parts) {
    const t = Math.min(p.thickness_mm, 99);
    const board = a.boards[p.slot] ?? SLOT_LABEL[p.slot];
    text(`n${p.no}`, cols[0], String(p.no), { fill: STATED, bold: true, size: 1.9 });
    text(`r${p.no}`, cols[1], PART_LABELS[p.role], { size: 1.9 });
    text(`q${p.no}`, cols[2], String(p.qty * a.count), { size: 1.9 });
    text(`d${p.no}`, cols[3], `${p.length_mm} × ${p.width_mm} × ${t}`, { size: 1.9 });
    text(`b${p.no}`, cols[4], board.length > 30 ? `${board.slice(0, 29)}…` : board, { size: 1.7 });
    text(`e${p.no}`, cols[5], band(p.band_long, p.band_short), { size: 1.9, fill: p.band_long == null ? CONFLICT : INK });
    y += 3.1;
  }
  y += 1.6;
  text('note', 0, `Qty covers all ${a.count} ${a.count === 1 ? 'cabinet' : 'cabinets'} of this size. Edges: L long, S short edges banded.`, { size: 1.6, fill: FAINT });
  y += 4.6;
  text('hw', 0, 'Hardware per Cabinet', { bold: true, size: 2.4 });
  y += 3.8;
  const hw = a.hardware;
  const items = [
    hw.doors ? `${hw.doors} ${hw.doors === 1 ? 'door' : 'doors'} (hinges per the kitchen's hardware schedule)` : '',
    hw.drawer_runners ? `${hw.drawer_runners} drawer runner ${hw.drawer_runners === 1 ? 'set' : 'sets'}` : '',
    hw.lift_stays ? `${hw.lift_stays} lift-up stay ${hw.lift_stays === 1 ? 'set' : 'sets'}` : '',
    hw.handles ? `${hw.handles} ${hw.handles === 1 ? 'handle' : 'handles'}` : '',
    hw.knobs ? `${hw.knobs} ${hw.knobs === 1 ? 'knob' : 'knobs'}` : '',
  ].filter(Boolean);
  for (const [i, t] of (items.length ? items : ['None']).entries()) { text(`hw${i}`, 0, t, { size: 1.9 }); y += 2.9; }
  y += 2;
  text('ck', 0, 'Checks before cutting', { bold: true, size: 2.4 });
  y += 3.8;
  for (const [i, c] of a.checks.entries()) {
    text(`c${i}`, 0, `${c.ok ? '✓' : '✗'} ${c.rule}`, { bold: true, size: 1.9, fill: c.ok ? '#2e7d32' : CONFLICT });
    y += 2.8;
    if (!c.ok) for (const [j, part] of wrap(c.detail, 78).slice(0, 2).entries()) { text(`c${i}-${j}`, 2.5, part, { size: 1.7 }); y += 2.5; }
  }
  return (
    <g fontFamily="Arial, sans-serif">
      <line x1={x0 - 3} y1={MARGIN + 2} x2={x0 - 3} y2={y} stroke="#d9d6cf" strokeWidth={0.3} />
      {rows}
    </g>
  );
};

function wrap(text: string, width: number): string[] {
  const out: string[] = [];
  let cur = '';
  for (const w of text.split(/\s+/)) {
    if ((cur + ' ' + w).trim().length > width) { out.push(cur); cur = w; } else cur = `${cur} ${w}`.trim();
  }
  if (cur) out.push(cur);
  return out;
}

const SlotLegend: React.FC<{ a: CabinetAssembly }> = ({ a }) => {
  const slots = [...new Set(a.cabinet.panels.map((p) => p.slot))];
  return (
    <g fontFamily="Arial, sans-serif" fontSize={2.1} fill={INK}>
      {slots.map((sl, i) => (
        <g key={sl} transform={`translate(${MARGIN + i * 24}, ${MARGIN - 1.5})`}>
          <rect width={5} height={3} fill={SLOT_FILL[sl]} stroke={INK} strokeWidth={0.15} />
          <text x={7} y={2.4}>{SLOT_LABEL[sl]}</text>
        </g>
      ))}
      <text x={MARGIN} y={SHEET_H - MARGIN} fontSize={1.9} fill={a.stated ? INK : FAINT} fontStyle={a.stated ? undefined : 'italic'}>
        {`${a.stated ? '' : '≈ '}${Math.round(a.width_mm / 10)} wide × ${Math.round(a.height_mm / 10)} high × ${Math.round(a.depth_mm / 10)} deep carcass, cm · used at ${a.where.slice(0, 6).join(', ')}${a.where.length > 6 ? ` +${a.where.length - 6}` : ''}`}
      </text>
    </g>
  );
};

export const AssemblySheets: React.FC<{ assemblies: CabinetAssembly[]; project: string; company?: string }> = ({ assemblies, project, company }) => (
  <div className="space-y-4">
    {assemblies.map((a, i) => (
      <DrawingSheet key={a.key} title="Workshop Assembly" company={company} project={project} sheet={`${assemblyTitle(a)} · ×${a.count}`} index={i + 1} total={assemblies.length} scaleNote="Exploded view · not to scale">
        <SlotLegend a={a} />
        <ExplodedView a={a} />
        <PartsPanel a={a} />
      </DrawingSheet>
    ))}
  </div>
);
