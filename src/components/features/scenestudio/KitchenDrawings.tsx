/** A room's drawing set: the dimensioned plan of any room, plus an elevation per kitchen wall and the cut list when there is a kitchen; A4 landscape sheets. */
import React, { useMemo } from 'react';

import { kitchenElevations, kitchenPlan, roomPlan, type DimLine, type DrawRun, type Elevation, type Pt } from '@/lib/scene/kitchenDrawings';
import { serviceChecks, type DrawingCheck, type ServiceKey, type ServicePoint } from '@/lib/scene/kitchenComposition';
import type { PlanOpening, PlanRoom, PlanWall } from '@/lib/scene/sceneGeometry';
import { yieldMeta } from '@/utils/blueprintComposition';
import { todayLocalISO } from '@/utils/datetime';

const SHEET_W = 297;
const SHEET_H = 210;
const MARGIN = 10;
const BLOCK_H = 22;
const INK = '#1d1d1b';
const FAINT = '#8a8780';
const STATED = '#1f5fbf';
const CONFLICT = '#c0392b';
const SIDE_W = 96;
const WATER = '#2e86c1';

export interface CutLine { label: string; quantity: number; unit: string | null }

interface SheetProps { title: string; company?: string; project: string; sheet: string; index: number; total: number; children: React.ReactNode; scaleNote: string }

const Sheet: React.FC<SheetProps> = ({ title, company, project, sheet, index, total, children, scaleNote }) => (
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
        <text x={2} y={13} fontSize={3}>{clip(sheet, 40)}</text>
        <text x={2} y={19} fontSize={2.4} fill={FAINT}>{clip(company ? `${project} · ${company}` : project, 50)}</text>
        <text x={72} y={13} fontSize={2.4}>Sheet {index} of {total}</text>
        <text x={72} y={17} fontSize={2.4}>{todayLocalISO()}</text>
        <text x={72} y={21} fontSize={2.2} fill={FAINT}>{scaleNote}</text>
      </g>
    </svg>
  </div>
);

/** Fits a drawing of `w × h` mm into the sheet's drawing area; returns the scale and the offset. */
const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);

function fit(w: number, h: number, side = 0) {
  const areaW = SHEET_W - 2 * MARGIN - side;
  const areaH = SHEET_H - 2 * MARGIN - BLOCK_H - 4;
  const s = Math.min(areaW / Math.max(w, 1), areaH / Math.max(h, 1));
  return { s, ox: MARGIN + (areaW - w * s) / 2, oy: MARGIN + (areaH - h * s) / 2 };
}

const Hatch: React.FC = () => (
  <defs>
    <pattern id="conflict-hatch" width={1.6} height={1.6} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
      <line x1={0} y1={0} x2={0} y2={1.6} stroke={CONFLICT} strokeWidth={0.35} />
    </pattern>
  </defs>
);

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
      <text
        x={mid[0]} y={mid[1] - 0.8} fontSize={2.2} textAnchor="middle" stroke="none" fontFamily="Arial, sans-serif"
        fill={d.tone === 'stated' ? STATED : d.tone === 'assumed' ? FAINT : INK} fontStyle={d.tone === 'assumed' ? 'italic' : undefined}
        transform={`rotate(${upright} ${mid[0]} ${mid[1]})`}
      >{d.tone === 'assumed' ? `≈${d.text}` : d.text}</text>
    </g>
  );
};

const PlanSheet: React.FC<{ rooms: PlanRoom[]; walls: PlanWall[]; openings: PlanOpening[]; runs: DrawRun[]; furniture: DrawRun[]; side: number }> = ({ rooms, walls, openings, runs, furniture, side }) => {
  const plan = useMemo(() => kitchenPlan(runs), [runs]);
  const base = useMemo(() => roomPlan(rooms, walls, furniture), [rooms, walls, furniture]);
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
  const { s, ox, oy } = fit(maxX - minX, maxY - minY, side);
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
      {base.furniture.map((f) => {
        const c = f.outline.reduce<Pt>((acc, p) => [acc[0] + p[0] / 4, acc[1] + p[1] / 4], [0, 0]);
        const [x, y] = tx(c);
        return (
          <g key={f.id}>
            <polygon points={poly(f.outline)} fill="none" stroke={FAINT} strokeWidth={0.2} />
            <text x={x} y={y + 0.7} fontSize={1.7} textAnchor="middle" fill={FAINT} fontFamily="Arial, sans-serif">{f.label}</text>
          </g>
        );
      })}
      {base.labels.map((l, i) => {
        const [x, y] = tx(l.at);
        return (
          <g key={`r${i}`} fontFamily="Arial, sans-serif" fill={INK} textAnchor="middle">
            <text x={x} y={y - 1} fontSize={2.6} fontWeight={700}>{l.name}</text>
            <text x={x} y={y + 2.2} fontSize={2.2}>{l.area}</text>
          </g>
        );
      })}
      {base.dims.map((d, i) => <Dim key={`w${i}`} d={d} tx={tx} />)}
      {plan.conflicts.map((c, i) => <polygon key={`c${i}`} points={poly(c)} fill="url(#conflict-hatch)" stroke={CONFLICT} strokeWidth={0.3} />)}
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
    conflict: { fill: 'url(#conflict-hatch)', stroke: CONFLICT, w: 0.3 },
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
        <Dim key={i} d={{ a: [d.x0, 0], b: [d.x1, 0], offset: [0, d.y], text: d.text, tone: d.tone }} tx={([x, y]) => tx(x, y)} />
      ))}
      {e.heights.map((h, i) => (
        <Dim key={`h${i}`} d={{ a: [0, h.y0], b: [0, h.y1], offset: [-250 - i * 200, 0], text: h.text }} tx={([x, y]) => tx(x, y)} />
      ))}
    </g>
  );
};

const wrap = (text: string, max: number): string[] => {
  const out: string[] = [];
  let line = '';
  for (const w of text.split(/\s+/)) {
    if ((line + ' ' + w).trim().length > max) { if (line) out.push(line); line = w; } else line = `${line} ${w}`.trim();
  }
  if (line) out.push(line);
  return out;
};

const Legend: React.FC<{ kitchen: boolean }> = ({ kitchen }) => {
  const items: Array<{ w: number; node: React.ReactNode; label: string }> = [
    ...(kitchen ? [
      { w: 22, node: <rect width={4} height={2.4} fill="none" stroke={INK} strokeWidth={0.25} />, label: 'Base / Tall Unit' },
      { w: 24, node: <rect width={4} height={2.4} fill="none" stroke={INK} strokeWidth={0.22} strokeDasharray="1.2 0.8" />, label: 'Wall Unit (In Plan)' },
      { w: 32, node: <rect width={4} height={2.4} fill="url(#conflict-hatch)" stroke={CONFLICT} strokeWidth={0.25} />, label: 'Does Not Add Up as Drawn' },
    ] : []),
    { w: 30, node: <text y={2.2} fontSize={2.4} fill={STATED} fontFamily="Arial, sans-serif">228</text>, label: 'From the Drawing or Confirmed' },
    { w: 20, node: <text y={2.2} fontSize={2.4} fill={FAINT} fontStyle="italic" fontFamily="Arial, sans-serif">≈60</text>, label: 'Assumed' },
  ];
  let x = MARGIN;
  return (
    <g fontFamily="Arial, sans-serif" fontSize={2.1} fill={INK}>
      {items.map((it) => {
        const at = x;
        x += it.w + 6;
        return <g key={it.label} transform={`translate(${at}, ${MARGIN - 1.5})`}>{it.node}<text x={6} y={2.1}>{it.label}</text></g>;
      })}
    </g>
  );
};

interface ScheduleRow { key: ServiceKey; label: string; count: number; unit: string }

const ReadingPanel: React.FC<{ sourceUrl?: string | null; notes: string[]; checks: DrawingCheck[]; schedule?: ScheduleRow[] }> = ({ sourceUrl, notes, checks, schedule = [] }) => {
  const x0 = SHEET_W - MARGIN - SIDE_W + 4;
  let y = MARGIN + 4;
  const rows: React.ReactNode[] = [];
  if (schedule.length) {
    rows.push(<text key="sh" x={x0} y={y} fontSize={2.4} fontWeight={700}>Services Schedule</text>);
    y += 4.4;
    for (const r of schedule) {
      rows.push(<g key={`s${r.key}`}><ServiceSymbol k={r.key} x={x0 + 1.4} y={y - 0.7} /><text x={x0 + 4.5} y={y} fontSize={2}>{r.label}</text><text x={x0 + SIDE_W - 8} y={y} fontSize={2} textAnchor="end">{r.count} {r.unit}</text></g>);
      y += 3.6;
    }
    y += 2;
  }
  if (sourceUrl) {
    rows.push(<text key="st" x={x0} y={y} fontSize={2.4} fontWeight={700}>Original drawing</text>);
    rows.push(<image key="si" href={sourceUrl} x={x0} y={y + 1.5} width={SIDE_W - 6} height={52} preserveAspectRatio="xMidYMid meet" />);
    y += 58;
  }
  if (notes.length) {
    rows.push(<text key="nt" x={x0} y={y} fontSize={2.4} fontWeight={700}>How the drawing reads</text>);
    y += 3.6;
    for (const [i, n] of notes.slice(0, 8).entries()) {
      for (const [j, l] of wrap(n, 62).entries()) { rows.push(<text key={`n${i}-${j}`} x={x0} y={y} fontSize={1.9}>{j ? '  ' : '• '}{l}</text>); y += 2.6; }
      if (y > SHEET_H - BLOCK_H - 48) break;
    }
    y += 2;
  }
  if (checks.length) {
    rows.push(<text key="ct" x={x0} y={y} fontSize={2.4} fontWeight={700}>Checks before building</text>);
    y += 3.6;
    for (const [i, c] of checks.entries()) {
      rows.push(<text key={`c${i}`} x={x0} y={y} fontSize={2} fontWeight={700} fill={c.ok ? '#2e7d32' : CONFLICT}>{c.ok ? '✓' : '✗'} {c.rule}</text>);
      y += 2.6;
      if (!c.ok) for (const [j, l] of wrap(c.detail, 64).slice(0, 3).entries()) { rows.push(<text key={`c${i}-${j}`} x={x0 + 2.5} y={y} fontSize={1.8} fill={INK}>{l}</text>); y += 2.4; }
      if (y > SHEET_H - BLOCK_H - 8) break;
    }
  }
  return (
    <g fontFamily="Arial, sans-serif" fill={INK}>
      <line x1={x0 - 3} y1={MARGIN} x2={x0 - 3} y2={SHEET_H - MARGIN - BLOCK_H - 2} stroke="#d9d6cf" strokeWidth={0.3} />
      {rows}
    </g>
  );
};

const ServiceSymbol: React.FC<{ k: ServiceKey; x: number; y: number }> = ({ k, x, y }) => {
  const r = 1.2;
  const box = <rect x={x - r} y={y - r} width={2 * r} height={2 * r} fill="#fff" stroke={INK} strokeWidth={0.25} />;
  const tag = (t: string, fill = INK) => <text x={x} y={y + 0.55} fontSize={1.4} fontWeight={700} textAnchor="middle" fill={fill} fontFamily="Arial, sans-serif">{t}</text>;
  if (k === 'socket') return <g>{box}<circle cx={x} cy={y} r={0.35} fill={INK} /></g>;
  if (k === 'socket_dedicated') return <g>{box}{tag('DC')}</g>;
  if (k === 'carbon_filter') return <g>{box}{tag('CF')}</g>;
  if (k === 'water_in') return <circle cx={x} cy={y} r={r} fill="#fff" stroke={WATER} strokeWidth={0.35} />;
  if (k === 'waste_out') return <circle cx={x} cy={y} r={r} fill={INK} />;
  if (k === 'gas_point') return <g><circle cx={x} cy={y} r={r} fill="#fff" stroke={INK} strokeWidth={0.25} />{tag('G')}</g>;
  return (
    <g stroke={INK} strokeWidth={0.3}>
      <line x1={x} y1={y + r} x2={x} y2={y - r + 0.6} strokeDasharray="0.6 0.4" />
      <polygon points={`${x - 0.8},${y - r + 0.8} ${x + 0.8},${y - r + 0.8} ${x},${y - r - 0.6}`} fill={INK} stroke="none" />
    </g>
  );
};

const SERVICE_ORDER: ServiceKey[] = ['socket', 'socket_dedicated', 'water_in', 'waste_out', 'gas_point', 'duct_run', 'carbon_filter'];

const scheduleOf = (points: ServicePoint[]): ScheduleRow[] => SERVICE_ORDER
  .map((key) => ({ key, count: points.filter((p) => p.key === key).length, ...yieldMeta(key) }))
  .filter((r) => r.count > 0);

const ServiceLegend: React.FC = () => {
  let x = MARGIN;
  const items = [
    ...SERVICE_ORDER.map((k) => ({ id: k, node: <ServiceSymbol k={k} x={1.2} y={1.2} />, label: yieldMeta(k).label })),
    { id: 'stated', node: <text y={2.2} fontSize={2.4} fill={STATED}>110</text>, label: 'Set by a Person' },
    { id: 'assumed', node: <text y={2.2} fontSize={2.4} fill={FAINT} fontStyle="italic">≈110</text>, label: 'Trade Default' },
  ];
  const maxX = SHEET_W - MARGIN - SIDE_W - 4;
  let row = 0;
  return (
    <g fontFamily="Arial, sans-serif" fontSize={2.1} fill={INK}>
      {items.map((it) => {
        const lead = it.id === 'assumed' ? 7.5 : it.id === 'stated' ? 6 : 4;
        const w = lead + it.label.length * 1.05 + 6;
        if (x + w > maxX && x > MARGIN) { x = MARGIN; row += 1; }
        const at = x;
        x += w;
        return <g key={it.id} transform={`translate(${at}, ${MARGIN - 1.5 + row * 4.5})`}>{it.node}<text x={lead} y={2.1}>{it.label}</text></g>;
      })}
    </g>
  );
};

const ServicesSheet: React.FC<{ e: Elevation; checks: DrawingCheck[] }> = ({ e, checks }) => {
  const levels = [...new Map(e.services.map((p) => [p.height_mm, p])).values()].sort((a, b) => a.height_mm - b.height_mm);
  const along = [...new Map(e.services.map((p) => [p.x_mm, p])).values()].sort((a, b) => a.x_mm - b.x_mm);
  const pad = 500;
  const padL = 450 + levels.length * 180;
  const right = Math.max(e.width_mm, ...e.services.map((p) => p.x_mm));
  const top = Math.max(e.height_mm, ...e.services.map((p) => p.height_mm));
  const { s, ox, oy } = fit(right + padL + pad, top + 2 * pad + 300, SIDE_W);
  const tx = (x: number, y: number): Pt => [ox + (x + padL) * s, oy + (top + pad - y) * s];
  const dimTx = ([x, y]: Pt) => tx(x, y);
  let prev = 0;
  const chain: DimLine[] = [];
  for (const p of along) {
    if (p.x_mm - prev < 50) continue;
    chain.push({ a: [prev, 0], b: [p.x_mm, 0], offset: [0, -300], text: `${Math.round((p.x_mm - prev) / 10)}`, tone: p.tone });
    prev = p.x_mm;
  }
  return (
    <g>
      <ServiceLegend />
      <line x1={tx(-200, 0)[0]} y1={tx(0, 0)[1]} x2={tx(right + 200, 0)[0]} y2={tx(0, 0)[1]} stroke={INK} strokeWidth={0.5} />
      {e.rects.filter((r) => r.kind !== 'handle').map((r, i) => {
        const [x, y] = tx(r.x, r.y + r.h);
        const fill = r.kind === 'conflict' ? 'url(#conflict-hatch)' : r.kind === 'window' ? '#f3f6f8' : 'none';
        return <rect key={i} x={x} y={y} width={r.w * s} height={r.h * s} fill={fill} stroke={r.kind === 'conflict' ? CONFLICT : '#c9c5bc'} strokeWidth={0.15} />;
      })}
      {levels.map((p, i) => (
        <Dim key={`h${i}`} d={{ a: [0, 0], b: [0, p.height_mm], offset: [-(300 + i * 180), 0], text: `${Math.round(p.height_mm / 10)}`, tone: p.height_tone }} tx={dimTx} />
      ))}
      {chain.map((d, i) => <Dim key={`x${i}`} d={d} tx={dimTx} />)}
      {e.services.map((p, i) => {
        const [x, y] = tx(p.x_mm, p.height_mm);
        return <ServiceSymbol key={i} k={p.key} x={x} y={y} />;
      })}
      <ReadingPanel notes={[]} checks={checks} schedule={scheduleOf(e.services)} />
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
  furniture?: DrawRun[];
  lines?: CutLine[];
  company?: string;
  notes?: string[];
  sourceUrl?: string | null;
  checks?: DrawingCheck[];
}> = ({ project, rooms, walls, openings, runs, furniture = [], lines = [], company, notes = [], sourceUrl = null, checks = [] }) => {
  const side = notes.length || sourceUrl || checks.length ? SIDE_W : 0;
  const elevations = useMemo(() => kitchenElevations(runs, walls, openings), [runs, walls, openings]);
  const sheets: Array<{ name: string; body: React.ReactNode }> = [
    { name: 'Floor Plan', body: <><Legend kitchen={runs.length > 0} /><PlanSheet rooms={rooms} walls={walls} openings={openings} runs={runs} furniture={furniture} side={side} />{side ? <ReadingPanel sourceUrl={sourceUrl} notes={notes} checks={checks} /> : null}</> },
    ...elevations.map((e, i) => ({
      name: `Elevation ${String.fromCharCode(65 + i)} · ${e.runs.join(', ')}`,
      body: <ElevationSheet e={e} />,
    })),
    ...elevations.map((e, i) => ({ e, i })).filter(({ e }) => e.services.length).map(({ e, i }) => ({
      name: `Services ${String.fromCharCode(65 + i)} · ${e.runs.join(', ')}`,
      body: <ServicesSheet e={e} checks={serviceChecks(runs.filter((r) => e.run_ids.includes(r.id)))} />,
    })),
    ...(lines.length ? [{ name: 'Cut List', body: <CutListSheet lines={lines} /> }] : []),
  ];
  return (
    <div className="space-y-4">
      {sheets.map((sh, i) => (
        <Sheet key={sh.name} title={runs.length ? 'Kitchen' : 'Floor Plan'} company={company} project={project} sheet={sh.name} index={i + 1} total={sheets.length} scaleNote="Dimensions in cm · not to scale">
          <Hatch />
          {sh.body}
        </Sheet>
      ))}
    </div>
  );
};
