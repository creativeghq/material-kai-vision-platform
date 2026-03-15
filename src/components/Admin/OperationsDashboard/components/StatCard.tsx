import React from 'react';
import { Badge } from '@/components/core/ui/badge';

interface StatCardProps {
  title: string;
  value: string | number;
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  description: string;
  trend?: number;
}

export const StatCard: React.FC<StatCardProps> = ({
  title,
  value,
  icon: Icon,
  description,
  trend,
}) => (
  <div className="dashboard-card">
    <div className="flex items-center gap-2 mb-2">
      <Icon className="h-4 w-4" style={{ color: 'hsl(var(--primary))' }} />
      <p className="text-xs text-muted-foreground">{title}</p>
    </div>
    <div className="text-2xl font-bold">{value}</div>
    <div className="flex items-center justify-between mt-1">
      <p className="text-xs text-muted-foreground">{description}</p>
      {trend !== undefined && (
        <Badge
          className={`text-xs ${trend > 0 ? 'bg-green-100 text-green-800 border-green-300' : trend < 0 ? 'bg-red-100 text-red-800 border-red-300' : 'bg-slate-100 text-slate-800 border-slate-300'}`}
        >
          {trend > 0 ? '+' : ''}
          {trend}%
        </Badge>
      )}
    </div>
  </div>
);
