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

/**
 * EMPTY STATE.
 *
 * A list with no rows has to say WHICH kind of nothing it is, because the two
 * look identical and need opposite responses:
 *
 *   "You have no contacts yet"       → offer the create action
 *   "No contacts match these filters" → offer to clear the filters
 *
 * Showing the create action on a filtered-empty list is the classic version of
 * this mistake: the user has 4,000 contacts and is being invited to make
 * another one because a stage filter is set.
 */
export const HubEmptyState: React.FC<HubEmptyStateProps> = ({
  icon: Icon,
  title,
  description,
  action,
  variant = 'empty',
  className,
}) => (
  <div className={cn('flex flex-col items-center px-6 py-10 text-center', className)}>
    {Icon && (
      <div
        className={cn(
          'mb-3 flex h-10 w-10 items-center justify-center rounded-md',
          variant === 'filtered' ? 'bg-surface-sunken' : 'bg-primary/10',
        )}
      >
        <Icon
          className={cn(
            'h-5 w-5',
            variant === 'filtered' ? 'text-muted-foreground' : 'text-primary',
          )}
          aria-hidden="true"
        />
      </div>
    )}
    <p className="font-sans text-sm font-semibold text-foreground">{title}</p>
    {description && (
      <p className="mt-1 max-w-sm text-xs text-muted-foreground">{description}</p>
    )}
    {action && <div className="mt-3 flex flex-wrap items-center justify-center gap-2">{action}</div>}
  </div>
);
