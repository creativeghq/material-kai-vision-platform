import React from 'react';
import { Brain, Activity } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

interface GlobalAdminHeaderProps {
  title: string;
  description?: string;
  breadcrumbs?: { label: string; path?: string }[];
  badge?: string;
}

export const GlobalAdminHeader: React.FC<GlobalAdminHeaderProps> = ({
  title,
  description,
  breadcrumbs = [],
  badge,
}) => {
  const navigate = useNavigate();

  return (
    <div className="border-b bg-card px-6 py-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-2">
            <Button
              onClick={() => navigate('/')}
              onKeyDown={(e) => e.key === 'Enter' && navigate('/')}
              className="px-2 py-1 text-sm border border-gray-300 hover:bg-gray-50 flex items-center gap-2"
            >
              <Brain className="h-4 w-4" />
              Back to Main
            </Button>
            <Button
              onClick={() => navigate('/admin')}
              onKeyDown={(e) => e.key === 'Enter' && navigate('/admin')}
              className="px-2 py-1 text-sm border border-gray-300 hover:bg-gray-50 flex items-center gap-2"
            >
              <Activity className="h-4 w-4" />
              Back to Admin
            </Button>
          </div>
          <div className="h-6 w-px bg-border" />
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
            {description && (
              <p className="text-sm text-muted-foreground">{description}</p>
            )}
          </div>
        </div>
        {badge && (
          <Badge className="text-sm px-2 py-1" style={{ background: 'hsl(var(--primary))' }}>
            {badge}
          </Badge>
        )}
      </div>
    </div>
  );
};
