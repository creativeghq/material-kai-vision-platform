import React, { useEffect, useRef, useState } from 'react';
import type { LucideIcon } from 'lucide-react';

export interface SwipeAction {
  label: string;
  Icon: LucideIcon;
  tone: 'danger' | 'success' | 'info';
  run: () => void;
}

const TONE: Record<SwipeAction['tone'], string> = {
  danger: 'bg-destructive text-destructive-foreground',
  success: 'bg-success text-success-foreground',
  info: 'bg-primary text-primary-foreground',
};
const COMMIT = 0.35;
const AXIS_LOCK_PX = 10;

/**
 * A list row that swipes: right runs `right`, left runs `left`. Vertical scrolling stays native
 * (`touch-action: pan-y`); a horizontal drag never also counts as a click on the row.
 */
export const SwipeRow: React.FC<{
  left?: SwipeAction;
  right?: SwipeAction;
  enabled: boolean;
  children: React.ReactNode;
}> = ({ left, right, enabled, children }) => {
  const box = useRef<HTMLDivElement>(null);
  const start = useRef<{ x: number; y: number; axis: 'x' | 'y' | null } | null>(null);
  const dragged = useRef(false);
  const crossed = useRef(false);
  const [dx, setDx] = useState(0);
  const [dragging, setDragging] = useState(false);

  const pending = useRef<{ timer: number; run: () => void } | null>(null);
  const reset = () => { start.current = null; setDragging(false); setDx(0); crossed.current = false; };
  // A committed swipe is the user's decision: it still runs if the row goes away first.
  const flush = () => { const p = pending.current; if (p) { window.clearTimeout(p.timer); pending.current = null; p.run(); } };
  useEffect(() => () => flush(), []);

  const live = enabled && (!!left || !!right);
  const action = dx < 0 ? left : dx > 0 ? right : undefined;
  const width = () => box.current?.offsetWidth ?? 360;

  return (
    <div
      ref={box}
      className="relative overflow-hidden"
      style={live ? { touchAction: 'pan-y' } : undefined}
      onTouchStart={(e) => {
        if (pending.current) { flush(); reset(); }
        if (!live || e.touches.length > 1) { reset(); return; }
        dragged.current = false;
        start.current = { x: e.touches[0].clientX, y: e.touches[0].clientY, axis: null };
      }}
      onTouchMove={(e) => {
        const s = start.current;
        if (!s) return;
        const mx = e.touches[0].clientX - s.x;
        const my = e.touches[0].clientY - s.y;
        if (!s.axis) {
          if (Math.abs(mx) < AXIS_LOCK_PX && Math.abs(my) < AXIS_LOCK_PX) return;
          s.axis = Math.abs(mx) > Math.abs(my) ? 'x' : 'y';
          if (s.axis === 'y') { start.current = null; return; }
        }
        dragged.current = true;
        setDragging(true);
        const v = (mx < 0 && !left) || (mx > 0 && !right) ? mx * 0.15 : mx;
        const over = Math.abs(v) > width() * COMMIT;
        if (over !== crossed.current) { crossed.current = over; if (over) navigator.vibrate?.(8); }
        setDx(v);
      }}
      onTouchEnd={() => {
        const s = start.current;
        if (!s || s.axis !== 'x') { start.current = null; return; }
        const act = dx < 0 ? left : right;
        if (act && Math.abs(dx) > width() * COMMIT) {
          start.current = null;
          setDragging(false);
          setDx(dx < 0 ? -width() : width());
          const run = () => { act.run(); reset(); };
          pending.current = { run, timer: window.setTimeout(() => { pending.current = null; run(); }, 180) };
        } else reset();
      }}
      onTouchCancel={reset}
      onClickCapture={(e) => {
        if (dragged.current) { e.stopPropagation(); e.preventDefault(); dragged.current = false; }
      }}
    >
      {action && (
        <div className={`absolute inset-0 flex items-center gap-2 px-6 text-sm font-medium ${TONE[action.tone]} ${dx < 0 ? 'justify-end' : 'justify-start'}`}>
          <action.Icon className={`w-5 h-5 transition-transform ${crossed.current ? 'scale-125' : 'opacity-80'}`} />
          {action.label}
        </div>
      )}
      <div
        className="relative bg-card"
        style={{ transform: `translateX(${dx}px)`, transition: dragging ? 'none' : 'transform 180ms ease-out' }}
      >
        {children}
      </div>
    </div>
  );
};
