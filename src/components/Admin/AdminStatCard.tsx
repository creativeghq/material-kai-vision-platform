import React from 'react';
import { LucideIcon } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/core/ui/card';
import { cn } from '@/lib/utils';

interface AdminStatCardProps {
  title: string;
  value: string | number;
  icon: LucideIcon;
  description?: string;
  trend?: {
    value: number;
    isPositive: boolean;
  };
  className?: string;
  variant?: 'default' | 'glass';
}

export const AdminStatCard: React.FC<AdminStatCardProps> = ({
  title,
  value,
  icon: Icon,
  description,
  trend,
  className,
  variant = 'glass',
}) => {
  return (
    <div className={cn('dashboard-card', className)}>
      <div className="flex items-center gap-2 mb-2">
        <Icon className="h-4 w-4" style={{ color: 'hsl(var(--primary))' }} />
        <p className="text-xs text-muted-foreground">{title}</p>
      </div>
      <div className="text-[28px] font-display leading-none tracking-tight tabular-nums" style={{ fontWeight: 700 }}>{value}</div>
      {description && <p className="text-xs text-muted-foreground mt-1.5">{description}</p>}
      {trend && (
        <p
          className={cn(
            'text-xs mt-1.5 flex items-center gap-1',
            trend.isPositive ? 'text-success' : 'text-destructive',
          )}
        >
          <span>{trend.isPositive ? '↑' : '↓'}</span>
          <span>{Math.abs(trend.value)}%</span>
          <span className="text-muted-foreground">from last period</span>
        </p>
      )}
    </div>
  );
};

