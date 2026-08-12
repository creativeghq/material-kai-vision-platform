import React from 'react';
import { Link } from 'react-router-dom';

import { cn } from '@/lib/utils';

import { Metric } from './Metric';
import { Sparkline } from './Sparkline';
import { DeltaChip, type DeltaDirection } from './MetricParts';

interface StatTileProps {
  /** Formatted value — "7", "€23,876". Never a raw number to be formatted here. */
  value: string;
  label: string;
  /** Trend series for the sparkline. Omit to render the tile without one. */
  series?: number[];
  delta?: { label: string; direction: DeltaDirection };
  /** Renders the whole tile as a link. */
  to?: string;
  /** Caption under the sparkline, e.g. "Last 7 days". */
  hint?: string;
  className?: string;
}

/**
 * StatTile — the compact "2 ∿ +2 / Sales Quotes" card from the reference.
 *
 * Small number, trend shape, delta chip. Sits in a row inside a
 * `.surface-recessed` group; it is NOT a standalone raised card.
 */
export const StatTile: React.FC<StatTileProps> = ({
  value,
  label,
  series,
  delta,
  to,
  hint,
  className,
}) => {
  const body = (
    <>
      <div className="flex items-start justify-between gap-2">
        <Metric value={value} size="sm" />
        {delta && <DeltaChip label={delta.label} direction={delta.direction} className="mt-1" />}
      </div>

      {series && series.length > 1 && (
        <div className="mt-2 flex items-end gap-2">
          <Sparkline data={series} width={68} height={22} />
          {hint && <span className="text-[10px] text-muted-foreground leading-none pb-0.5">{hint}</span>}
        </div>
      )}

      <p className="mt-3 text-sm text-muted-foreground leading-tight">{label}</p>
    </>
  );

  const shell = cn(
    'surface-raised p-4 block transition-all duration-200',
    to && 'hover:-translate-y-0.5 hover:border-vivid/40',
    className,
  );

  if (to) {
    return (
      <Link to={to} className={shell}>
        {body}
      </Link>
    );
  }
  return <div className={shell}>{body}</div>;
};
