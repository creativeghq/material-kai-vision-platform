import React from 'react';
import { ArrowUpRight, ArrowDown, ArrowUp, Minus } from 'lucide-react';

import { cn } from '@/lib/utils';

/* ────────────────────────────────────────────────────────────────────────────
   The small parts a metric is assembled from. Each is deliberately dumb — they
   take formatted strings and render type. No derivation happens here (money
   quantities derive in SQL; see CLAUDE.md "One derivation per money quantity").
   ──────────────────────────────────────────────────────────────────────────── */

/** MicroLabel — the tiny uppercase caption above a metric. */
export const MicroLabel: React.FC<{
  children: React.ReactNode;
  icon?: React.ComponentType<{ className?: string }>;
  className?: string;
}> = ({ children, icon: Icon, className }) => (
  <span className={cn('micro-label', className)}>
    {Icon && <Icon className="h-3 w-3 shrink-0" />}
    {children}
  </span>
);

export type DeltaDirection = 'up' | 'down' | 'flat';

/** Resolve the visual direction of a change.
 *
 *  `inverted` matters: for "overdue invoices" or "churn risk" a RISE is bad, so
 *  the chip must go red on an increase. Getting this wrong paints a worsening
 *  number in the positive accent, which is worse than no chip at all. */
export function deltaDirection(change: number, inverted = false): DeltaDirection {
  if (change === 0) return 'flat';
  const rising = change > 0;
  if (inverted) return rising ? 'down' : 'up';
  return rising ? 'up' : 'down';
}

/** DeltaChip — the small +2 / −12% marker riding beside a metric. */
export const DeltaChip: React.FC<{
  /** Pre-formatted label, e.g. "+2" or "−12%". */
  label: string;
  direction: DeltaDirection;
  showIcon?: boolean;
  className?: string;
}> = ({ label, direction, showIcon = false, className }) => {
  const Icon = direction === 'up' ? ArrowUp : direction === 'down' ? ArrowDown : Minus;
  return (
    <span
      className={cn(
        'delta-chip',
        direction === 'up' && 'delta-up',
        direction === 'down' && 'delta-down',
        direction === 'flat' && 'delta-flat',
        className,
      )}
    >
      {showIcon && <Icon className="h-2.5 w-2.5" />}
      {label}
    </span>
  );
};

/** Meter — track + fill + dot marker beneath a KPI. */
export const Meter: React.FC<{
  /** 0–1. Clamped, so an out-of-range ratio can never overflow the track. */
  value: number;
  /** Draw the dot marker at the fill head. */
  marker?: boolean;
  className?: string;
  'aria-label'?: string;
}> = ({ value, marker = true, className, 'aria-label': ariaLabel }) => {
  const pct = Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0)) * 100;
  return (
    <div
      className={cn('meter-track', className)}
      role="progressbar"
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={ariaLabel}
    >
      <div className="meter-fill" style={{ width: `${pct}%` }} />
      {marker && <div className="meter-dot" style={{ left: `${pct}%` }} />}
    </div>
  );
};

/** CircleAction — the round "open this" affordance in a card corner. */
export const CircleAction = React.forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement> & { label: string }
>(({ label, className, ...props }, ref) => (
  <button
    ref={ref}
    type="button"
    aria-label={label}
    title={label}
    className={cn('circle-action', className)}
    {...props}
  >
    {/* The button rotates 45° on hover (see `.circle-action:hover`), which swings
        this arrow from up-right to straight-right — a "go there" cue for free. */}
    <ArrowUpRight className="h-4 w-4" />
  </button>
));
CircleAction.displayName = 'CircleAction';
