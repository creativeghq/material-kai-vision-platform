import React from 'react';
import { cn } from '@/lib/utils';
import { LucideIcon } from 'lucide-react';

import { Metric } from './Metric';
import { MicroLabel, DeltaChip } from './MetricParts';

interface StatCardProps {
  title: string;
  value: string | number;
  change?: {
    value: string;
    type: 'increase' | 'decrease' | 'neutral';
  };
  icon?: LucideIcon;
  iconColor?: string;
  className?: string;
}

/**
 * StatCard - Statistics card with optional icon and change indicator
 *
 * Usage:
 * <StatCard
 *   title="Total Revenue"
 *   value="$12,345"
 *   change={{ value: "+12.5%", type: "increase" }}
 *   icon={DollarSign}
 * />
 */
export const StatCard: React.FC<StatCardProps> = ({
  title,
  value,
  change,
  icon: Icon,
  iconColor = 'text-primary',
  className,
}) => {
  return (
    <div className={cn('stat-card', className)}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          {/* Micro-label above, oversized numeral below — the order that makes a
              number read as instrumentation. Was a 14px caption over a 24px value. */}
          <MicroLabel className="mb-3">{title}</MicroLabel>
          <Metric value={String(value)} size="md" />
          {change && (
            <div className="mt-3">
              <DeltaChip
                label={change.value}
                direction={
                  change.type === 'increase' ? 'up' : change.type === 'decrease' ? 'down' : 'flat'
                }
                showIcon
              />
            </div>
          )}
        </div>
        {Icon && (
          <div className={cn('p-2.5 rounded-xl bg-secondary/50 shrink-0', iconColor)}>
            <Icon className="w-5 h-5" />
          </div>
        )}
      </div>
    </div>
  );
};

