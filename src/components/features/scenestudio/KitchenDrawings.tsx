/** The kitchen's drawing set (#604 phase 5): plan, one elevation per wall, cut list; printed as A4 landscape sheets. */
import React, { useMemo } from 'react';

import { kitchenElevations, kitchenPlan, type DimLine, type DrawRun, type Elevation, type Pt } from '@/lib/scene/kitchenDrawings';
import type { PlanOpening, PlanRoom, PlanWall } from '@/lib/scene/sceneGeometry';
import { todayLocalISO } from '@/utils/datetime';

const SHEET_W = 297;
const SHEET_H = 210;
const MARGIN = 10;
const BLOCK_H = 22;
const INK = '#1d1d1b';
const FAINT = '#8a8780';

export interface CutLine { label: string; quantity: number; unit: string | null }

interface SheetProps { title: string; project: string; sheet: string; index: number; total: number; children: React.ReactNode; scaleNote: string }

const Sheet: React.FC<SheetProps> = ({ title, project, sheet, index, total, children, scaleNote }) => (
  <div className="kitchen-sheet mx-auto w-full max-w-[1100px] bg-white">
    <svg viewBox={`0 0 ${SHEET_W} ${SHEET_H}`} className="block h-auto w-full" role="img" aria-label={`${sheet}, ${project}`}>
      <rect width={SHEET_W} height={SHEET_H} fill="#fff" />
      <rect x={MARGIN / 2} y={MARGIN / 2} width={SHEET_W - MARGIN} height={SHEET_H - MARGIN} fill="none" stroke={INK} strokeWidth={0.5} />
      {children}
      <g transform={`translate(${SHEET_W - MARGIN / 2 - 110}, ${SHEET_H - MARGIN / 2 - BLOCK_H})`} fontFamily="Arial, sans-serif" fill={INK}>
        <rect width={110} height={BLOCK_H} fill="#fff" stroke={INK} strokeWidth={0.4} />
        <line x1={0} y1={8} x2={110} y2={8} stroke={INK} strokeWidth={0.25} />
        <line x1={70} y1={8} x2={70} y2={BLOCK_H} stroke={INK} strokeWidth={0.25} />
        <text x={2} y={5.6} fontSize={3.6} fontWeight={700}>{title}</text>
        <text x={2} y={13} fontSize={3}>{sheet}</text>
        <text x={2} y={19} fontSize={2.4} fill={FAINT}>{project}</text>
        <text x={72} y={13} fontSize={2.4}>Sheet {index} of {total}</text>
        <text x={72} y={17} fontSize={2.4}>{todayLocalISO()}</text>
        <text x={72} y={21} fontSize={2.2} fill={FAINT}>{scaleNote}</text>
      </g>
    </svg>
  </div>
);

/** Fits a drawing of `w × h` mm into the sheet's drawing area; returns the scale and the offset. */
function fit(w: number, h: number) {
  const areaW = SHEET_W - 2 * MARGIN;
  const areaH = SHEET_H - 2 * MARGIN - BLOCK_H - 4;
  const s = Math.min(areaW / Math.max(w, 1), areaH / Math.max(h, 1));
  return { s, ox: MARGIN + (areaW - w * s) / 2, oy: MARGIN + (areaH - h * s) / 2 };
}

const Dim: React.FC<{ d: DimLine; tx: (p: Pt) => Pt }> = ({ d, tx }) => {
  const a = tx([d.a[0] + d.offset[0], d.a[1] + d.offset[1]]);
  const b = tx([d.b[0] + d.offset[0], d.b[1] + d.offset[1]]);
  const a0 = tx(d.a);
  const b0 = tx(d.b);
  const mid: Pt = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const angle = (Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI;
  const upright = angle > 90 || angle < -90 ? angle + 180 : angle;
  return (
    <g stroke={INK} strokeWidth={0.18}>
      <line x1={a0[0]} y1={a0[1]} x2={a[0]} y2={a[1]} stroke={FAINT} />
      <line x1={b0[0]} y1={b0[1]} x2={b[0]} y2={b[1]} stroke={FAINT} />
      <line x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} />
      <circle cx={a[0]} cy={a[1]} r={0.35} fill={INK} />
      <circle cx={b[0]} cy={b[1]} r={0.35} fill={INK} />
      <text x={mid[0]} y={mid[1] - 0.8} fontSize={2.2} textAnchor="middle" stroke="none" fill={INK} fontFamily="Arial, sans-serif" transform={`rotate(${upright} ${mid[0]} ${mid[1]})`}>{d.text}</text>
    </g>
  );
};

const PlanSheet: React.FC<{ rooms: PlanRoom[]; walls: PlanWall[]; openings: PlanOpening[]; runs: DrawRun[] }> = ({ rooms, walls, openings, runs }) => {
  const plan = useMemo(() => kitchenPlan(runs), [runs]);
  const pts: Pt[] = [
    ...rooms.flatMap((r) => r.outline),
    ...walls.flatMap((w) => [[w.x1_mm, w.y1_mm], [w.x2_mm, w.y2_mm]] as Pt[]),
    ...plan.runs.flatMap((r) => r.outline),
  ];
  if (!pts.length) return null;
  const pad = 700;
  const minX = Math.min(...pts.map((p) => p[0])) - pad;
  const minY = Math.min(...pts.map((p) => p[1])) - pad;
  const maxX = Math.max(...pts.map((p) => p[0])) + pad;
  const maxY = Math.max(...pts.map((p) => p[1])) + pad;
  const { s, ox, oy } = fit(maxX - minX, maxY - minY);
  const tx = (p: Pt): Pt => [ox + (p[0] - minX) * s, oy + (p[1] - minY) * s];
  const poly = (o: Pt[]) => o.map((p) => tx(p).join(',')).join(' ');
  return (
    <g>
      {walls.map((w) => {
        const a = tx([w.x1_mm, w.y1_mm]);
        const b = tx([w.x2_mm, w.y2_mm]);
        return <line key={w.id} x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke={INK} strokeWidth={Math.max(0.6, w.thickness_mm * s)} />;
      })}
      {openings.map((o) => {
        const w = walls.find((x) => x.id === o.wall_id);
        if (!w) return null;
        const len = Math.hypot(w.x2_mm - w.x1_mm, w.y2_mm - w.y1_mm) || 1;
        const u: Pt = [(w.x2_mm - w.x1_mm) / len, (w.y2_mm - w.y1_mm) / len];
        const a = tx([w.x1_mm + u[0] * o.offset_mm, w.y1_mm + u[1] * o.offset_mm]);
        const b = tx([w.x1_mm + u[0] * (o.offset_mm + o.width_mm), w.y1_mm + u[1] * (o.offset_mm + o.width_mm)]);
        return (
          <g key={o.id}>
            <line x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke="#fff" strokeWidth={Math.max(0.6, w.thickness_mm * s) + 0.2} />
            <line x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke={INK} strokeWidth={0.2} strokeDasharray={o.kind === 'window' ? undefined : '1 0.6'} />
          </g>
        );
      })}
      {plan.runs.map((r) => (
        <g key={r.id}>
          {r.units.map((u, i) => (
            <g key={i}>
              <polygon points={poly(u.outline)} fill="none" stroke={INK} strokeWidth={0.22} strokeDasharray={u.hidden ? '1.2 0.8' : undefined} />
              {u.label && !u.hidden && (() => {
                const c = u.outline.reduce<Pt>((acc, p) => [acc[0] + p[0] / 4, acc[1] + p[1] / 4], [0, 0]);
                const [x, y] = tx(c);
                return <text x={x} y={y + 0.8} fontSize={1.9} textAnchor="middle" fill={INK} fontFamily="Arial, sans-serif">{u.label}</text>;
              })()}
            </g>
          ))}
          <polygon points={poly(r.outline)} fill="none" stroke={INK} strokeWidth={0.4} />
        </g>
      ))}
      {plan.dims.map((d, i) => <Dim key={i} d={d} tx={tx} />)}
    </g>
  );
};

const ElevationSheet: React.FC<{ e: Elevation }> = ({ e }) => {
  const pad = 500;
  const { s, ox, oy } = fit(e.width_mm + 2 * pad, e.height_mm + 2 * pad);
  const tx = (x: number, y: number): Pt => [ox + (x + pad) * s, oy + (e.height_mm + pad - y) * s];
  const style: Record<string, { fill: string; stroke: string; w: number }> = {
    carcass: { fill: 'none', stroke: FAINT, w: 0.15 },
    plinth: { fill: '#d9d6cf', stroke: INK, w: 0.2 },
    front: { fill: '#fff', stroke: INK, w: 0.28 },
    handle: { fill: INK, stroke: INK, w: 0.1 },
    appliance: { fill: '#3a3a38', stroke: INK, w: 0.2 },
    worktop: { fill: '#e7e3da', stroke: INK, w: 0.3 },
    window: { fill: '#eef3f6', stroke: INK, w: 0.25 },
  };
  return (
    <g>
      <line x1={tx(-200, 0)[0]} y1={tx(0, 0)[1]} x2={tx(e.width_mm + 200, 0)[0]} y2={tx(0, 0)[1]} stroke={INK} strokeWidth={0.5} />
      {[...e.rects].sort((a, b) => (a.kind === 'window' ? -1 : 0) - (b.kind === 'window' ? -1 : 0)).map((r, i) => {
        const [x, y] = tx(r.x, r.y + r.h);
        const st = style[r.kind];
        return <rect key={i} x={x} y={y} width={r.w * s} height={r.h * s} fill={st.fill} stroke={st.stroke} strokeWidth={st.w} />;
      })}
      {e.dims.map((d, i) => (
        <Dim key={i} d={{ a: [d.x0, 0], b: [d.x1, 0], offset: [0, d.y], text: d.text }} tx={([x, y]) => tx(x, y)} />
      ))}
      {e.heights.map((h, i) => (
        <Dim key={`h${i}`} d={{ a: [0, h.y0], b: [0, h.y1], offset: [-250 - i * 200, 0], text: h.text }} tx={([x, y]) => tx(x, y)} />
      ))}
    </g>
  );
};

const CutListSheet: React.FC<{ lines: CutLine[] }> = ({ lines }) => (
  <g fontFamily="Arial, sans-serif" fill={INK}>
    <text x={MARGIN + 4} y={MARGIN + 10} fontSize={5} fontWeight={700}>Cut List and Hardware</text>
    {lines.map((l, i) => (
      <g key={i} transform={`translate(${MARGIN + 4}, ${MARGIN + 20 + i * 6})`}>
        <line x1={0} y1={1.8} x2={170} y2={1.8} stroke="#d9d6cf" strokeWidth={0.2} />
        <text x={0} y={0} fontSize={3.2}>{l.label}</text>
        <text x={170} y={0} fontSize={3.2} textAnchor="end">{Number(l.quantity).toLocaleString('en-US', { maximumFractionDigits: 2 })} {l.unit ?? ''}</text>
      </g>
    ))}
  </g>
);

export const KitchenDrawings: React.FC<{
  project: string;
  rooms: PlanRoom[];
  walls: PlanWall[];
  openings: PlanOpening[];
  runs: DrawRun[];
  lines?: CutLine[];
}> = ({ project, rooms, walls, openings, runs, lines = [] }) => {
  const elevations = useMemo(() => kitchenElevations(runs, walls, openings), [runs, walls, openings]);
  const sheets: Array<{ name: string; body: React.ReactNode }> = [
    { name: 'Floor Plan', body: <PlanSheet rooms={rooms} walls={walls} openings={openings} runs={runs} /> },
    ...elevations.map((e, i) => ({
      name: `Elevation ${String.fromCharCode(65 + i)} · ${e.runs.join(', ')}`,
      body: <ElevationSheet e={e} />,
    })),
    ...(lines.length ? [{ name: 'Cut List', body: <CutListSheet lines={lines} /> }] : []),
  ];
  return (
    <div className="space-y-4">
      {sheets.map((sh, i) => (
        <Sheet key={sh.name} title="Kitchen" project={project} sheet={sh.name} index={i + 1} total={sheets.length} scaleNote="Dimensions in cm · not to scale">
          {sh.body}
        </Sheet>
      ))}
    </div>
  );
};
