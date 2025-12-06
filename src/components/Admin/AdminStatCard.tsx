import React from 'react';
import { LucideIcon } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
  const isGlass = variant === 'glass';

  return (
    <Card
      className={cn(
        'transition-all duration-300 hover:shadow-lg',
        isGlass &&
          'bg-white/60 backdrop-blur-md border-white/20 shadow-lg hover:bg-white/70',
        className,
      )}
    >
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-gray-700">{title}</CardTitle>
        <Icon className="h-4 w-4 text-gray-500" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold text-gray-900">{value}</div>
        {description && <p className="text-xs text-gray-600 mt-1">{description}</p>}
        {trend && (
          <p
            className={cn(
              'text-xs mt-1 flex items-center gap-1',
              trend.isPositive ? 'text-green-600' : 'text-red-600',
            )}
          >
            <span>{trend.isPositive ? '↑' : '↓'}</span>
            <span>{Math.abs(trend.value)}%</span>
            <span className="text-gray-500">from last period</span>
          </p>
        )}
      </CardContent>
    </Card>
  );
};

