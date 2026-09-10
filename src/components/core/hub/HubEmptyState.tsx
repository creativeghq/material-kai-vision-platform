import React from 'react';
import type { LucideIcon } from 'lucide-react';

import { cn } from '@/lib/utils';

interface HubEmptyStateProps {
  icon?: LucideIcon;
  title: string;
  /** One sentence: why it is empty, or what to do about it. */
  description?: string;
  /** The action that fixes it — "Create contact", "Import", "Clear filters". */
  action?: React.ReactNode;
  /**
   * `filtered` renders the "your filters excluded everything" wording weight —
   * quieter, because nothing is wrong. `empty` is a genuinely new/blank surface.
   */
  variant?: 'empty' | 'filtered';
  className?: string;
}

/** EMPTY STATE. */
export const HubEmptyState: React.FC<HubEmptyStateProps> = ({
  icon: Icon,
  title,
  description,
  action,
  variant = 'empty',
  className,
}) => (
  <div className={cn('flex flex-col items-center px-6 py-12 text-center', className)}>
    {Icon && (
      <div
        className={cn(
          'mb-3 flex h-12 w-12 items-center justify-center rounded-md',
          variant === 'filtered' ? 'bg-surface-sunken' : 'bg-primary/10',
        )}
      >
        <Icon
          className={cn(
            'h-6 w-6',
            variant === 'filtered' ? 'text-muted-foreground' : 'text-primary',
          )}
          aria-hidden="true"
        />
      </div>
    )}
    <p className="font-sans text-base font-semibold text-foreground">{title}</p>
    {description && (
      <p className="mt-1 max-w-md text-sm text-muted-foreground">{description}</p>
    )}
    {action && (
      <div className="mt-4 flex flex-wrap items-center justify-center gap-2 [&_a]:h-9 [&_a]:px-3.5 [&_a]:text-sm [&_button]:h-9 [&_button]:px-3.5 [&_button]:text-sm">
        {action}
      </div>
    )}
  </div>
);
