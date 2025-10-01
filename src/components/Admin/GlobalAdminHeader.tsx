import React from 'react';
import { Home, ArrowLeft } from 'lucide-react';
import { useRouter } from 'next/router';

import { Button } from '@/components/ui/button';

interface GlobalAdminHeaderProps {
  title: string;
  description?: string;
  breadcrumbs?: { label: string; path?: string }[];
}

export const GlobalAdminHeader: React.FC<GlobalAdminHeaderProps> = ({
  title,
  description,
  breadcrumbs = [],
}) => {
  const router = useRouter();

  return (
    <div className="border-b bg-card px-6 py-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          {/* Navigation Buttons */}
          <div className="flex items-center space-x-2">
            <Button
              onClick={() => router.push('/')}
              className="flex items-center gap-2 border border-input bg-background hover:bg-accent hover:text-accent-foreground h-9 px-3 text-sm"
            >
              <Home className="h-4 w-4" />
              Main App
            </Button>
            <Button
              onClick={() => router.push('/admin')}
              className="flex items-center gap-2 border border-input bg-background hover:bg-accent hover:text-accent-foreground h-9 px-3 text-sm"
            >
              <ArrowLeft className="h-4 w-4" />
              Admin Dashboard
            </Button>
          </div>

          {/* Breadcrumbs */}
          {breadcrumbs.length > 0 && (
            <>
              <div className="h-6 w-px bg-border" />
              <div className="flex items-center space-x-2 text-sm text-muted-foreground">
                {breadcrumbs.map((crumb, index) => (
                  <React.Fragment key={index}>
                    {crumb.path ? (
                      <button
                        onClick={() => router.push(crumb.path!)}
                        className="hover:text-foreground transition-colors"
                      >
                        {crumb.label}
                      </button>
                    ) : (
                      <span>{crumb.label}</span>
                    )}
                    {index < breadcrumbs.length - 1 && <span>/</span>}
                  </React.Fragment>
                ))}
              </div>
            </>
          )}

          <div className="h-6 w-px bg-border" />

          {/* Title and Description */}
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
            {description && (
              <p className="text-sm text-muted-foreground">{description}</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
