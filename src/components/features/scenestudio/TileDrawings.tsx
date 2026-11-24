import React, { useMemo } from 'react';

import { ConflictHatch, DRAWING, DrawingDim, DrawingSheet, fitDrawing } from '@/components/features/scenestudio/KitchenDrawings';
import { buildTileFloorPlan, DEFAULT_TILE_FLOOR, tileSetOut, type TilePiece } from '@/lib/installation/tileFloorTemplate';
import type { DimLine, Pt } from '@/lib/scene/kitchenDrawings';
import { PATTERN_LABELS, type Pattern } from '@/lib/surfaceRenderer/patternVocabulary';

const { SHEET_W, MARGIN, BLOCK_H, SIDE_W, INK, FAINT, STATED, CONFLICT } = DRAWING;
const CUT_FILL = '#ece9e2';
const JOINT = '#9b978e';

export interface TileRoomInput { label: string; width_m: number; depth_m: number; stated: boolean }
export interface TileSetOutInput { rooms: TileRoomInput[]; tileLengthMm: number; tileWidthMm: number; pattern: Pattern; jointMm: number; tileLabel: string }

const corners = (p: TilePiece): Pt[] => {
  const c = Math.cos(p.angle);
  const s = Math.sin(p.angle);
  return ([[-1, -1], [1, -1], [1, 1], [-1, 1]] as const).map(([u, v]) => {
    const lx = (u * p.length) / 2;
    const lz = (v * p.width) / 2;
    return [p.cx + lx * c - lz * s, p.cz + lx * s + lz * c] as Pt;
  });
};

const extent = (p: TilePiece) => ({
  x: Math.abs(p.length * Math.cos(p.angle)) + Math.abs(p.width * Math.sin(p.angle)),
  z: Math.abs(p.length * Math.sin(p.angle)) + Math.abs(p.width * Math.cos(p.angle)),
});

const nearest = (values: number[], to: number) => values.reduce((best, v) => (Math.abs(v - to) < Math.abs(best - to) ? v : best), values[0]);

const Legend: React.FC = () => {
  const items: Array<{ id: string; node: React.ReactNode; label: string }> = [
    { id: 'full', node: <rect width={5} height={3} fill="#fff" stroke={JOINT} strokeWidth={0.2} />, label: 'Full Tile' },
    { id: 'cut', node: <rect width={5} height={3} fill={CUT_FILL} stroke={JOINT} strokeWidth={0.2} />, label: 'Cut Piece' },
    { id: 'thin', node: <rect width={5} height={3} fill="url(#conflict-hatch)" stroke={CONFLICT} strokeWidth={0.2} />, label: 'Under a Third of a Tile' },
    { id: 'start', node: <line x1={0} y1={1.5} x2={5} y2={1.5} stroke={STATED} strokeWidth={0.35} strokeDasharray="1.2 0.8" />, label: 'Start Line' },
    { id: 'stated', node: <text y={2.6} fontSize={2.4} fill={STATED}>300</text>, label: 'Room Size Given' },
    { id: 'assumed', node: <text y={2.6} fontSize={2.4} fill={FAINT} fontStyle="italic">≈300</text>, label: 'Assumed' },
  ];
  let x = MARGIN;
  return (
    <g fontFamily="Arial, sans-serif" fontSize={2.1} fill={INK}>
      {items.map((it) => {
        const at = x;
        x += it.label.length * 1.05 + 14;
        return <g key={it.id} transform={`translate(${at}, ${MARGIN - 1.5})`}>{it.node}<text x={it.id === 'assumed' ? 8 : 7} y={2.4}>{it.label}</text></g>;
      })}
    </g>
  );
};

const RoomSheet: React.FC<{ room: TileRoomInput; input: TileSetOutInput; index: number; total: number; project: string; company?: string }> = ({ room, input, index, total, project, company }) => {
  const plan = useMemo(() => buildTileFloorPlan({
    ...DEFAULT_TILE_FLOOR, areaWidthM: room.width_m, areaDepthM: room.depth_m,
    tileLengthMm: input.tileLengthMm, tileWidthMm: input.tileWidthMm, pattern: input.pattern, jointMm: input.jointMm,
  }), [room, input]);
  const so = useMemo(() => tileSetOut(plan, { sizesStated: room.stated }), [plan, room.stated]);
  const W = room.width_m * 1000;
  const D = room.depth_m * 1000;
  const pad = 700;
  const { s, ox, oy } = fitDrawing(W + 2 * pad, D + 2 * pad, SIDE_W);
  const tx = (p: Pt): Pt => [ox + (p[0] + pad) * s, oy + (p[1] + pad) * s];
  const tone = room.stated ? 'stated' : 'assumed';
  const full = plan.pieces.filter((p) => !p.cut);
  const xs = full.flatMap((p) => [p.cx - extent(p).x / 2, p.cx + extent(p).x / 2]);
  const zs = full.flatMap((p) => [p.cz - extent(p).z / 2, p.cz + extent(p).z / 2]);
  const startX = xs.length && so.axisAligned ? nearest(xs, W / 2) : null;
  const startZ = zs.length && so.axisAligned ? nearest(zs, D / 2) : null;
  const dims: DimLine[] = [
    { a: [0, 0], b: [W, 0], offset: [0, -450], text: `${Math.round(W / 10)}`, tone },
    { a: [0, 0], b: [0, D], offset: [-450, 0], text: `${Math.round(D / 10)}`, tone },
    ...(startX != null ? [{ a: [0, D] as Pt, b: [startX, D] as Pt, offset: [0, 350] as Pt, text: `${Math.round(startX / 10)}` }] : []),
    ...(startZ != null ? [{ a: [W, 0] as Pt, b: [W, startZ] as Pt, offset: [350, 0] as Pt, text: `${Math.round(startZ / 10)}` }] : []),
  ];
  const [x0, y0] = tx([0, 0]);
  const [x1, y1] = tx([W, D]);
  const clipId = `tile-room-${index}`;
  const panelX = SHEET_W - MARGIN - SIDE_W + 4;
  let y = MARGIN + 8;
  const rows: React.ReactNode[] = [];
  const line = (key: string, text: string, opts: { bold?: boolean; size?: number; fill?: string; indent?: number } = {}) => {
    rows.push(<text key={key} x={panelX + (opts.indent ?? 0)} y={y} fontSize={opts.size ?? 2} fontWeight={opts.bold ? 700 : undefined} fill={opts.fill ?? INK}>{text}</text>);
    y += (opts.size ?? 2) + 1.4;
  };
  line('t', 'Tile and Joint', { bold: true, size: 2.4 });
  line('t1', input.tileLabel);
  line('t2', `${PATTERN_LABELS[input.pattern]} · ${input.jointMm} mm joints · ${DEFAULT_TILE_FLOOR.perimeterGapMm} mm gap at the walls`);
  y += 2;
  line('c', 'Cut Schedule', { bold: true, size: 2.4 });
  line('cf', `Full tiles: ${so.full}`);
  if (!so.axisAligned) line('cx', 'Angled pattern: cuts are marked out on site.', { fill: FAINT });
  for (const [i, g] of so.cuts.slice(0, 12).entries()) {
    line(`cg${i}`, `${g.count} pcs · ${g.xMm / 10} × ${g.zMm / 10} cm${g.thin ? ' · under a third' : ''}`, { fill: g.thin ? CONFLICT : INK });
  }
  if (so.cuts.length > 12) line('cm', `+ ${so.cuts.length - 12} more sizes`, { fill: FAINT });
  y += 2;
  line('k', 'Checks before laying', { bold: true, size: 2.4 });
  for (const [i, c] of so.checks.entries()) {
    line(`k${i}`, `${c.ok ? '✓' : '✗'} ${c.rule}`, { bold: true, fill: c.ok ? '#2e7d32' : CONFLICT });
    if (!c.ok) for (const [j, part] of wrap(c.detail, 64).slice(0, 3).entries()) line(`k${i}-${j}`, part, { size: 1.8, indent: 2.5 });
  }
  return (
    <DrawingSheet title="Tiling" company={company} project={project} sheet={`Setting Out · ${room.label}`} index={index} total={total} scaleNote="Dimensions in cm · not to scale">
      <ConflictHatch />
      <Legend />
      <defs><clipPath id={clipId}><rect x={x0} y={y0} width={x1 - x0} height={y1 - y0} /></clipPath></defs>
      <g clipPath={`url(#${clipId})`}>
        {plan.pieces.map((p) => {
          const thin = so.thinCuts.includes(p.index);
          return (
            <polygon
              key={p.index}
              points={corners(p).map((k) => tx(k).join(',')).join(' ')}
              fill={thin ? 'url(#conflict-hatch)' : p.cut ? CUT_FILL : '#fff'}
              stroke={thin ? CONFLICT : JOINT}
              strokeWidth={0.12}
            />
          );
        })}
      </g>
      <rect x={x0} y={y0} width={x1 - x0} height={y1 - y0} fill="none" stroke={INK} strokeWidth={0.9} />
      {startX != null && <line x1={tx([startX, 0])[0]} y1={y0 - 3} x2={tx([startX, 0])[0]} y2={y1 + 3} stroke={STATED} strokeWidth={0.35} strokeDasharray="1.2 0.8" />}
      {startZ != null && <line x1={x0 - 3} y1={tx([0, startZ])[1]} x2={x1 + 3} y2={tx([0, startZ])[1]} stroke={STATED} strokeWidth={0.35} strokeDasharray="1.2 0.8" />}
      {dims.map((d, i) => <DrawingDim key={i} d={d} tx={tx} />)}
      <g fontFamily="Arial, sans-serif" fill={INK}>
        <line x1={panelX - 3} y1={MARGIN + 4} x2={panelX - 3} y2={MARGIN + 175 - BLOCK_H} stroke="#d9d6cf" strokeWidth={0.3} />
        {rows}
      </g>
      <text x={x0} y={tx([0, D + 620])[1] + 2} fontSize={2} fill={FAINT} fontFamily="Arial, sans-serif">
        Edge pieces: left {cm(so.edges.left)}, right {cm(so.edges.right)}, top {cm(so.edges.top)}, bottom {cm(so.edges.bottom)}. Start from the blue lines and lay full tiles out to the walls.
      </text>
    </DrawingSheet>
  );
};

const cm = (mm: number | null) => (mm == null ? '—' : `${Math.round(mm) / 10} cm`);

function wrap(text: string, width: number): string[] {
  const out: string[] = [];
  let cur = '';
  for (const w of text.split(/\s+/)) {
    if ((cur + ' ' + w).trim().length > width) { out.push(cur); cur = w; } else cur = `${cur} ${w}`.trim();
  }
  if (cur) out.push(cur);
  return out;
}

export const TileSetOutSheets: React.FC<{ input: TileSetOutInput; project: string; company?: string }> = ({ input, project, company }) => (
  <div className="space-y-3">
    {input.rooms.map((room, i) => (
      <RoomSheet key={`${room.label}-${i}`} room={room} input={input} index={i + 1} total={input.rooms.length} project={project} company={company} />
    ))}
  </div>
);
