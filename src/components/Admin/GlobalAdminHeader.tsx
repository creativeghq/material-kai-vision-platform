import React from 'react';
import { Brain, Activity, Settings } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import { Button } from '@/components/core/ui/button';
import { Badge } from '@/components/core/ui/badge';

interface GlobalAdminHeaderProps {
  title: string;
  description?: React.ReactNode;
  breadcrumbs?: { label: string; path?: string }[];
  badge?: string;
}

export const GlobalAdminHeader: React.FC<GlobalAdminHeaderProps> = ({
  title,
  description,
  badge,
}) => {
  const navigate = useNavigate();

  return (
    <div className="px-4 sm:px-6 py-3 sm:py-4 border-b border-white/8">
      <div className="flex items-center justify-between gap-4">
        {/* Left: icon + title */}
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-primary/15 flex items-center justify-center shrink-0">
            <Settings className="h-4.5 w-4.5 text-primary" />
          </div>
          <div className="min-w-0">
            <h1 className="text-lg font-light text-foreground tracking-tight">{title}</h1>
            {description && (
              <p className="text-xs text-muted-foreground mt-0.5 hidden sm:block">{description}</p>
            )}
          </div>
        </div>

        {/* Right: nav buttons + badge */}
        <div className="flex items-center gap-2 shrink-0">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate('/')}
            className="flex items-center gap-2"
          >
            <Brain className="h-4 w-4" />
            <span className="hidden sm:inline">Main</span>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate('/admin')}
            className="flex items-center gap-2"
          >
            <Activity className="h-4 w-4" />
            <span className="hidden sm:inline">Admin</span>
          </Button>
          {badge && (
            <Badge className="text-xs px-2 py-0.5">{badge}</Badge>
          )}
        </div>
      </div>
    </div>
  );
};
