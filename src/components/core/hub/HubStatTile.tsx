import React from 'react';
import { ArrowDown, ArrowUp, Info, Minus } from 'lucide-react';

import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/core/ui/tooltip';

export interface HubStatDelta {
  /** Already-formatted, e.g. "43.75%" or "+1.2k". This does not format numbers. */
  value: string;
  direction: 'up' | 'down' | 'flat';
  /**
   * Whether `up` is good. Defaults to true. Set false for cost, churn, latency —
   * a rising bounce rate is not a green arrow, and colouring by DIRECTION alone
   * is how a dashboard ends up congratulating you on your error rate.
   */
  upIsGood?: boolean;
  /** Period the delta is measured against, e.g. "vs last month". */
  caption?: string;
}

interface HubStatTileProps {
  label: string;
  /** The number. Pre-formatted (currency, unit, thousands separators). */
  value: React.ReactNode;
  /** Small qualifier under the label — "OFFLINE SOURCE", "LEAD", "VIEWS". */
  category?: string;
  delta?: HubStatDelta;
  /** Explains how the metric is derived. Rendered as an info tooltip. */
  help?: string;
  /** Sparkline / mini chart slot, rendered below the number. */
  chart?: React.ReactNode;
  onClick?: () => void;
  className?: string;
}

/**
 * KPI TILE — one number, its label, and how it moved.
 *
 * Rules this encodes, all of which a hand-rolled tile tends to get wrong:
 *
 *  - **The number is the loudest thing.** 24px semibold with `tabular-nums`, so
 *    a row of tiles has its digits on a shared grid and the eye can compare
 *    magnitudes without reading each one.
 *  - **The delta is coloured by MEANING, not direction** (see `upIsGood`), and
 *    carries an arrow as well as a colour, because roughly 1 in 12 men cannot
 *    separate the red from the green.
 *  - **The label sits above the number.** Below, it reads as a caption for
 *    whatever comes next in the column rather than a name for the figure.
 */
export const HubStatTile: React.FC<HubStatTileProps> = ({
  label,
  value,
  category,
  delta,
  help,
  chart,
  onClick,
  className,
}) => {
  const good = delta ? (delta.upIsGood ?? true) === (delta.direction === 'up') : false;
  const DeltaIcon = delta?.direction === 'up' ? ArrowUp : delta?.direction === 'down' ? ArrowDown : Minus;

  const body = (
    <>
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-semibold text-muted-foreground">{label}</p>
        {help && (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                aria-label={`About ${label}`}
                className="shrink-0 rounded-xs text-muted-foreground hover:text-foreground"
              >
                <Info className="h-3.5 w-3.5" />
              </button>
            </TooltipTrigger>
            <TooltipContent className="max-w-xs">{help}</TooltipContent>
          </Tooltip>
        )}
      </div>

      {category && (
        <p className="mt-1 text-[10px] font-semibold tracking-wide text-muted-foreground">
          {category}
        </p>
      )}

      <p className="mt-1 text-2xl font-semibold tabular-nums leading-none tracking-tight text-foreground">
        {value}
      </p>

      {delta && (
        <p
          className={cn(
            'mt-1.5 flex items-center gap-1 text-xs font-semibold tabular-nums',
            delta.direction === 'flat'
              ? 'text-muted-foreground'
              : good
                ? 'text-[hsl(var(--success))]'
                : 'text-[hsl(var(--error))]',
          )}
        >
          <DeltaIcon className="h-3 w-3" aria-hidden="true" />
          {delta.value}
          {delta.caption && (
            <span className="font-normal text-muted-foreground">{delta.caption}</span>
          )}
        </p>
      )}

      {chart && <div className="mt-2.5">{chart}</div>}
    </>
  );

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={cn(
          'panel-interactive rounded-md border border-hairline bg-card p-3.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          className,
        )}
      >
        {body}
      </button>
    );
  }

  return (
    <div className={cn('rounded-md border border-hairline bg-card p-3.5', className)}>{body}</div>
  );
};

/**
 * The dashboard grid. Auto-fits tiles at a ~220px minimum rather than pinning a
 * column count per breakpoint: a report page can hold 3 tiles or 11, and a fixed
 * `lg:grid-cols-4` leaves an orphan on its own row for every count that is not a
 * multiple of four.
 */
export const HubStatGrid: React.FC<{ children: React.ReactNode; className?: string }> = ({
  children,
  className,
}) => (
  <div
    className={cn('grid gap-3', className)}
    style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}
  >
    {children}
  </div>
);
