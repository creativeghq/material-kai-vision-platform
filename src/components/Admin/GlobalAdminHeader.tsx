import React from 'react';
import { Home, ArrowLeft } from 'lucide-react';
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
    <div
      className="px-6 py-4 m-4 rounded-3xl"
      style={{
        background: 'var(--glass-bg)',
        backdropFilter: 'var(--glass-blur)',
        border: '1px solid var(--glass-border)',
        boxShadow: 'var(--glass-shadow)',
      }}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          {/* Navigation Buttons */}
          <div className="flex items-center space-x-2">
            <Button
              onClick={() => navigate('/')}
              onKeyDown={(e) => e.key === 'Enter' && navigate('/')}
              className="flex items-center gap-2 px-3 py-1 text-sm hover:bg-white/10"
              variant="ghost"
            >
              <Home className="h-4 w-4" />
              Back to Main
            </Button>
            <Button
              onClick={() => navigate('/admin')}
              onKeyDown={(e) => e.key === 'Enter' && navigate('/admin')}
              className="flex items-center gap-2 px-3 py-1 text-sm hover:bg-white/10"
              variant="ghost"
            >
              <ArrowLeft className="h-4 w-4" />
              Admin Dashboard
            </Button>
          </div>

          <div className="h-6 w-px bg-white/20" />

          {/* Title and Description */}
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
            {description && (
              <p className="text-sm text-muted-foreground">{description}</p>
            )}
          </div>
        </div>

        {/* Badge */}
        {badge && (
          <Badge className="text-sm px-2 py-1" style={{ background: 'var(--mocha-color)' }}>
            {badge}
          </Badge>
        )}
      </div>
    </div>
  );
};
