import React from 'react';
import type { LucideIcon } from 'lucide-react';
import { Loader2, AlertTriangle } from 'lucide-react';

import { CardDescription, CardHeader, CardTitle } from '@/components/core/ui/card';

export const WorkPanelHeader: React.FC<{
  icon: LucideIcon;
  title: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
}> = ({ icon: Icon, title, description, action }) => (
  <CardHeader className="flex-row items-center justify-between gap-3 space-y-0 border-b border-hairline px-5 py-3">
    <div className="min-w-0">
      <CardTitle className="flex items-center gap-2">
        <Icon className="h-4 w-4 text-muted-foreground" /> {title}
      </CardTitle>
      {description && <CardDescription className="mt-0.5 text-xs">{description}</CardDescription>}
    </div>
    {action && <div className="flex shrink-0 items-center gap-2">{action}</div>}
  </CardHeader>
);

export const WorkPanelLoading: React.FC = () => (
  <div className="flex justify-center py-10">
    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
  </div>
);

export const WorkPanelError: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <p className="flex items-start gap-2 px-5 py-6 text-sm text-destructive">
    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
    <span>{children}</span>
  </p>
);

export const WorkPanelForm: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="flex flex-wrap items-end gap-2 border-b border-hairline bg-surface-sunken px-5 py-3 [&_label]:text-[11px]">
    {children}
  </div>
);
