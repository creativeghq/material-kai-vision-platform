import React, { useRef, useState } from 'react';

import { Button } from '@/components/core/ui/button';
import { cn } from '@/lib/utils';

export interface CornerPoint { x: number; y: number }

const LABELS = ['Far left', 'Far right', 'Near right', 'Near left'];

interface Props {
  url: string;
  corners: CornerPoint[];
  onChange: (corners: CornerPoint[]) => void;
}

export const RoomPhotoCorners: React.FC<Props> = ({ url, corners, onChange }) => {
  const ref = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<number | null>(null);
  const at = (e: React.PointerEvent): CornerPoint => {
    const r = ref.current!.getBoundingClientRect();
    return { x: Math.min(Math.max((e.clientX - r.left) / r.width, 0), 1), y: Math.min(Math.max((e.clientY - r.top) / r.height, 0), 1) };
  };
  const next = corners.length < 4 ? LABELS[corners.length] : null;
  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">
        {next ? <>Click the floor's <b className="text-foreground">{next.toLowerCase()}</b> corner ({corners.length + 1} of 4). Use the room's width and depth above for its real size.</> : 'Drag a corner to adjust it.'}
      </p>
      <div
        ref={ref}
        className="relative w-full cursor-crosshair touch-none select-none overflow-hidden rounded-sm border border-hairline"
        onPointerDown={(e) => {
          if (corners.length < 4) {
            onChange([...corners, at(e)]);
            return;
          }
          const p = at(e);
          let best = 0;
          corners.forEach((c, i) => {
            if (Math.hypot(c.x - p.x, c.y - p.y) < Math.hypot(corners[best].x - p.x, corners[best].y - p.y)) best = i;
          });
          e.currentTarget.setPointerCapture(e.pointerId);
          setDrag(best);
        }}
        onPointerMove={(e) => {
          if (drag === null) return;
          const p = at(e);
          onChange(corners.map((c, i) => (i === drag ? p : c)));
        }}
        onPointerUp={() => setDrag(null)}
      >
        <img src={url} alt="Your room" draggable={false} className="pointer-events-none block w-full" />
        <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 1 1" preserveAspectRatio="none">
          {corners.length > 1 && (
            <polygon
              points={corners.map((c) => `${c.x},${c.y}`).join(' ')}
              fill={corners.length === 4 ? 'rgba(245,158,11,0.18)' : 'none'}
              stroke="#f59e0b"
              strokeWidth={0.004}
            />
          )}
        </svg>
        {corners.map((c, i) => (
          <span
            key={i}
            className={cn('pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 rounded-sm border border-amber-600 bg-amber-400 px-1 text-[10px] font-semibold text-amber-950', drag === i && 'ring-2 ring-amber-300')}
            style={{ left: `${c.x * 100}%`, top: `${c.y * 100}%` }}
          >
            {i + 1}
          </span>
        ))}
      </div>
      {corners.length > 0 && (
        <Button type="button" variant="ghost" size="sm" onClick={() => onChange([])}>Start the corners again</Button>
      )}
    </div>
  );
};
