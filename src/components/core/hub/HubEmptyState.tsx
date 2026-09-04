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
 *
 * ONE SIZE, SET HERE
 * ------------------
 * The offer is the only control on an empty surface, so it renders at the
 * platform's standard button — 36px, 14px text — whatever `size` the caller
 * put on it. Billing's "Go to quotes" shipped as `size="sm"` (32px, 12px text)
 * on the same project page as a Quotes tab whose hand-rolled empty state used
 * the standard button, and the two read as different sizes of the same thing.
 * A hundred call sites had copied the `size="sm"` from the doc example, so the
 * fix is not a sweep: the action slot normalises every button (and link
 * rendered as one) inside it. Guarded by tests/unit/emptyStates.test.ts.
 */
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
