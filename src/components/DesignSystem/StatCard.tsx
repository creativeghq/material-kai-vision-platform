import React from 'react';
import { cn } from '@/lib/utils';
import { LucideIcon } from 'lucide-react';

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
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <p className="text-sm text-muted-foreground mb-2">{title}</p>
          <p className="text-2xl font-bold text-foreground">{value}</p>
          {change && (
            <div className="mt-2">
              <span
                className={cn(
                  'text-sm font-medium',
                  change.type === 'increase' && 'text-success',
                  change.type === 'decrease' && 'text-error',
                  change.type === 'neutral' && 'text-muted-foreground'
                )}
              >
                {change.value}
              </span>
            </div>
          )}
        </div>
        {Icon && (
          <div className={cn('p-3 rounded-lg bg-secondary/50', iconColor)}>
            <Icon className="w-6 h-6" />
          </div>
        )}
      </div>
    </div>
  );
};

