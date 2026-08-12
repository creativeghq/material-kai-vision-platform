import React from 'react';
import { useNavigate } from 'react-router-dom';

import { cn } from '@/lib/utils';

import { Metric, type MetricSize } from './Metric';
import { MicroLabel, DeltaChip, CircleAction, type DeltaDirection } from './MetricParts';

export interface ComparePeriod {
  /** Caption above the bar, e.g. "Last Month". */
  label: string;
  /** 0–1, relative to the larger of the two periods. */
  ratio: number;
}

interface KpiCardProps {
  label: string;
  icon?: React.ComponentType<{ className?: string }>;
  /** Formatted headline value. */
  value: string;
  size?: MetricSize;
  delta?: { label: string; direction: DeltaDirection };
  /** The hatched "previous" bar and solid "current" bar beneath the number. */
  compare?: { previous: ComparePeriod; current: ComparePeriod };
  /** Target for the corner circle-action. */
  to?: string;
  /** Plain caption under the number when there is no compare pair. */
  caption?: string;
  className?: string;
}

/**
 * KpiCard — the headline metric card: micro-label, oversized two-tone numeral,
 * and a hatched-vs-solid period comparison.
 *
 * The comparison bars are the part that carries meaning the number alone cannot:
 * a stripe pattern reads as "historic" and a solid fill as "current" without a
 * legend, so the card answers "is this good?" at a glance.
 */
export const KpiCard: React.FC<KpiCardProps> = ({
  label,
  icon: Icon,
  value,
  size = 'lg',
  delta,
  compare,
  to,
  caption,
  className,
}) => {
  const navigate = useNavigate();

  return (
    <div className={cn('surface-raised p-5 sm:p-6 flex flex-col', className)}>
      <div className="flex items-start justify-between gap-3">
        <MicroLabel icon={Icon}>{label}</MicroLabel>
        {to && <CircleAction label={`Open ${label}`} onClick={() => navigate(to)} />}
      </div>

      <div className="mt-4 flex items-end gap-2 flex-wrap">
        <Metric value={value} size={size} />
        {delta && <DeltaChip label={delta.label} direction={delta.direction} showIcon className="mb-1.5" />}
      </div>

      {compare ? (
        <div className="mt-6 grid grid-cols-2 gap-3 items-end">
          <div>
            <p className="text-[10px] text-muted-foreground mb-1.5 truncate">{compare.previous.label}</p>
            <div
              className="hatch-bar"
              style={{ height: `${Math.max(10, compare.previous.ratio * 44)}px` }}
            />
          </div>
          <div>
            <p className="text-[10px] text-muted-foreground mb-1.5 truncate">{compare.current.label}</p>
            <div
              className={cn(
                'rounded-md flex items-center justify-center',
                delta?.direction === 'down' ? 'bg-error/70' : 'bg-vivid',
              )}
              style={{ height: `${Math.max(10, compare.current.ratio * 44)}px` }}
            >
              {delta && (
                <span
                  className={cn(
                    'text-[10px] font-semibold px-1.5 py-0.5 rounded-full',
                    delta.direction === 'down'
                      ? 'bg-black/25 text-white'
                      : 'bg-black/15 text-vivid-foreground',
                  )}
                >
                  {delta.label}
                </span>
              )}
            </div>
          </div>
        </div>
      ) : (
        caption && <p className="mt-4 text-xs text-muted-foreground">{caption}</p>
      )}
    </div>
  );
};
