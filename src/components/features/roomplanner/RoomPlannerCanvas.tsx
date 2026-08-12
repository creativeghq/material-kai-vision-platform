/**
 * 2D top-down room canvas (#321 M3, #259 Phase 1).
 *
 * SVG rather than a 3D scene on purpose: Phase 1 needs no geometry, and a top-down plan is the
 * view people actually arrange furniture in. Phase 2 swaps this for an R3F scene consuming the
 * same rows.
 *
 * Everything is metres. Pixels appear only where the SVG is drawn, via a single scale computed by
 * `fitScale` and passed down — two components deriving "px per metre" separately is how a plan ends
 * up with furniture at a different scale from its own room.
 *
 * Dragging updates local state on every pointer move and writes to the database only on release.
 * A write per frame would be ~60 round trips a second, and the intermediate positions are not
 * facts anyone wants stored.
 */
import React, { useCallback, useMemo, useRef, useState } from 'react';
import { RotateCw, Trash2 } from 'lucide-react';
import {
  clampToRoom, fitScale, overlappingPairs, snapToGrid, GRID_M,
  type Placement, type RoomSize,
} from './roomGeometry';
import type { ResolvedLayoutItem } from '@/services/roomPlannerService';

interface RoomPlannerCanvasProps {
  room: RoomSize;
  items: ResolvedLayoutItem[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  /** Fired once on pointer release, not on every move. */
  onMoveCommit: (id: string, at: { xM: number; yM: number }) => void;
  onRotate: (id: string, rotationDeg: number) => void;
  onRemove: (id: string) => void;
  /**
   * Product image per product id (#259 item 1).
   *
   * The plan drew labelled rectangles, and a name truncated to 18 characters is not how anyone
   * recognises furniture — three grey boxes reading "Lounge Armchair —" tell a client nothing. The
   * image is clipped to the item's real footprint, so it still reads as the space the thing takes
   * rather than as a photo floating on a plan.
   */
  imageUrls?: Map<string, string>;
}

const CANVAS_W = 720;
const CANVAS_H = 480;

function toPlacement(item: ResolvedLayoutItem, override?: { xM: number; yM: number }): Placement {
  return {
    xM: override?.xM ?? Number(item.x_m),
    yM: override?.yM ?? Number(item.y_m),
    rotationDeg: Number(item.rotation_deg),
    widthM: Number(item.effective_width_m),
    depthM: Number(item.effective_depth_m),
  };
}

export const RoomPlannerCanvas: React.FC<RoomPlannerCanvasProps> = ({
  room, items, selectedId, onSelect, onMoveCommit, onRotate, onRemove, imageUrls,
}) => {
  const svgRef = useRef<SVGSVGElement>(null);
  // Position while a drag is in flight. Null when nothing is being dragged.
  const [drag, setDrag] = useState<{ id: string; xM: number; yM: number } | null>(null);

  const scale = useMemo(() => fitScale(room, CANVAS_W, CANVAS_H), [room]);
  const originX = (CANVAS_W - room.widthM * scale) / 2;
  const originY = (CANVAS_H - room.depthM * scale) / 2;

  const placements = useMemo(
    () => items.map((i) => toPlacement(i, drag?.id === i.id ? drag : undefined)),
    [items, drag],
  );

  const colliding = useMemo(() => {
    const flagged = new Set<string>();
    for (const [a, b] of overlappingPairs(placements)) {
      flagged.add(items[a].id);
      flagged.add(items[b].id);
    }
    return flagged;
  }, [placements, items]);

  /** Pointer position → room metres. */
  const pointerToMetres = useCallback((clientX: number, clientY: number) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return { xM: 0, yM: 0 };
    // The SVG is rendered with a viewBox, so a CSS pixel is not a viewBox unit unless we rescale.
    const vbX = ((clientX - rect.left) / rect.width) * CANVAS_W;
    const vbY = ((clientY - rect.top) / rect.height) * CANVAS_H;
    return { xM: (vbX - originX) / scale, yM: (vbY - originY) / scale };
  }, [originX, originY, scale]);

  const handlePointerDown = (e: React.PointerEvent, item: ResolvedLayoutItem) => {
    e.stopPropagation();
    (e.target as Element).setPointerCapture?.(e.pointerId);
    onSelect(item.id);
    setDrag({ id: item.id, xM: Number(item.x_m), yM: Number(item.y_m) });
  };

  const handlePointerMove = (e: React.PointerEvent, item: ResolvedLayoutItem) => {
    if (drag?.id !== item.id) return;
    const raw = pointerToMetres(e.clientX, e.clientY);
    const snapped = { xM: snapToGrid(raw.xM), yM: snapToGrid(raw.yM) };
    // Clamp against the ROTATED extent, so a turned item cannot be dragged through a wall it
    // visually clears.
    const clamped = clampToRoom({ ...toPlacement(item), ...snapped }, room);
    setDrag({ id: item.id, ...clamped });
  };

  const handlePointerUp = (item: ResolvedLayoutItem) => {
    if (drag?.id !== item.id) return;
    const { xM, yM } = drag;
    setDrag(null);
    if (xM !== Number(item.x_m) || yM !== Number(item.y_m)) onMoveCommit(item.id, { xM, yM });
  };

  const gridLines: React.ReactNode[] = [];
  for (let x = 0; x <= room.widthM + 1e-9; x += GRID_M * 5) {
    const px = originX + x * scale;
    gridLines.push(<line key={`v${x}`} x1={px} y1={originY} x2={px} y2={originY + room.depthM * scale}
      stroke="currentColor" strokeWidth={0.5} className="text-border" />);
  }
  for (let y = 0; y <= room.depthM + 1e-9; y += GRID_M * 5) {
    const py = originY + y * scale;
    gridLines.push(<line key={`h${y}`} x1={originX} y1={py} x2={originX + room.widthM * scale} y2={py}
      stroke="currentColor" strokeWidth={0.5} className="text-border" />);
  }

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${CANVAS_W} ${CANVAS_H}`}
      className="w-full rounded-lg border border-border/60 bg-muted/20 touch-none"
      onPointerDown={() => onSelect(null)}
      role="application"
      aria-label="Room plan"
    >
      {gridLines}

      {/* The room outline. */}
      <rect
        x={originX} y={originY}
        width={room.widthM * scale} height={room.depthM * scale}
        fill="none" stroke="currentColor" strokeWidth={2} className="text-foreground/40"
      />
      <text x={originX} y={originY - 8} className="fill-muted-foreground" fontSize={12}>
        {room.widthM} m × {room.depthM} m
      </text>

      {items.map((item, idx) => {
        const p = placements[idx];
        const w = p.widthM * scale;
        const d = p.depthM * scale;
        const cx = originX + p.xM * scale;
        const cy = originY + p.yM * scale;
        const selected = selectedId === item.id;
        const clash = colliding.has(item.id);

        return (
          <g
            key={item.id}
            transform={`translate(${cx} ${cy}) rotate(${p.rotationDeg})`}
            onPointerDown={(e) => handlePointerDown(e, item)}
            onPointerMove={(e) => handlePointerMove(e, item)}
            onPointerUp={() => handlePointerUp(item)}
            onPointerCancel={() => setDrag(null)}
            className="cursor-move"
          >
            <rect
              x={-w / 2} y={-d / 2} width={w} height={d} rx={3}
              className={
                clash ? 'fill-destructive/25 stroke-destructive'
                  : selected ? 'fill-primary/25 stroke-primary'
                    : 'fill-foreground/10 stroke-foreground/40'
              }
              strokeWidth={selected || clash ? 2 : 1}
            />
            {/* A tick on the front edge, so a rotated item reads as rotated rather than as a
                slightly different rectangle. */}
            <line x1={0} y1={-d / 2} x2={0} y2={-d / 2 + Math.min(10, d / 3)}
              className="stroke-foreground/60" strokeWidth={1.5} />
            {(() => {
              const img = item.product_id ? imageUrls?.get(item.product_id) : null;
              if (!img) {
                // No photo: the name is still better than an unlabelled box.
                return (
                  <text textAnchor="middle" y={4} fontSize={11} className="pointer-events-none fill-foreground">
                    {item.product_name?.slice(0, 18) ?? ''}
                  </text>
                );
              }
              return (
                <>
                  <image
                    href={img}
                    x={-w / 2 + 1} y={-d / 2 + 1}
                    width={Math.max(0, w - 2)} height={Math.max(0, d - 2)}
                    preserveAspectRatio="xMidYMid slice"
                    className="pointer-events-none"
                    opacity={0.9}
                  />
                  {/* The name stays, on a scrim. A photo at plan scale is often 40px across and
                      two beige sofas are indistinguishable at that size. */}
                  <text
                    textAnchor="middle" y={d / 2 - 4} fontSize={10}
                    className="pointer-events-none fill-foreground"
                    style={{ paintOrder: 'stroke', stroke: 'var(--background)', strokeWidth: 3 }}
                  >
                    {item.product_name?.slice(0, 16) ?? ''}
                  </text>
                </>
              );
            })()}
          </g>
        );
      })}

      {/* Controls for the selected item, drawn last so they sit above everything. */}
      {selectedId && (() => {
        const idx = items.findIndex((i) => i.id === selectedId);
        if (idx === -1) return null;
        const p = placements[idx];
        const cx = originX + p.xM * scale;
        const cy = originY + p.yM * scale - (p.depthM * scale) / 2 - 16;
        return (
          <g>
            <g transform={`translate(${cx - 22} ${cy - 8})`} className="cursor-pointer"
              onPointerDown={(e) => { e.stopPropagation(); onRotate(selectedId, (p.rotationDeg + 45) % 360); }}>
              <rect width={18} height={18} rx={9} className="fill-background stroke-border" />
              <RotateCw className="text-foreground" x={3} y={3} width={12} height={12} />
            </g>
            <g transform={`translate(${cx + 4} ${cy - 8})`} className="cursor-pointer"
              onPointerDown={(e) => { e.stopPropagation(); onRemove(selectedId); }}>
              <rect width={18} height={18} rx={9} className="fill-background stroke-border" />
              <Trash2 className="text-destructive" x={3} y={3} width={12} height={12} />
            </g>
          </g>
        );
      })()}
    </svg>
  );
};
