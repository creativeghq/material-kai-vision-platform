import React from 'react';
import { cn } from '@/lib/utils';

interface DashboardCardProps {
  children: React.ReactNode;
  className?: string;
  title?: string;
  subtitle?: string;
  action?: React.ReactNode;
  hover?: boolean;
}

/**
 * DashboardCard - Reusable dark-themed card component
 *
 * Usage:
 * <DashboardCard title="Total Shipping Amount" subtitle="Last 6 months">
 *   <YourContent />
 * </DashboardCard>
 */
export const DashboardCard: React.FC<DashboardCardProps> = ({
  children,
  className,
  title,
  subtitle,
  action,
  hover = true,
}) => {
  return (
    <div className={cn('dashboard-card', !hover && 'hover:transform-none hover:shadow-card', className)}>
      {(title || subtitle || action) && (
        <div className="flex items-center justify-between mb-4">
          <div>
            {title && <h3 className="text-lg font-semibold text-foreground">{title}</h3>}
            {subtitle && <p className="text-sm text-muted-foreground mt-1">{subtitle}</p>}
          </div>
          {action && <div>{action}</div>}
        </div>
      )}
      {children}
    </div>
  );
};

