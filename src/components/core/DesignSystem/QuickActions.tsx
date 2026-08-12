import React from 'react';
import { Link } from 'react-router-dom';
import { Plus } from 'lucide-react';

import { cn } from '@/lib/utils';

export interface QuickAction {
  label: string;
  to: string;
  /** Optional leading icon; defaults to the "+" affordance from the reference. */
  icon?: React.ComponentType<{ className?: string }>;
}

interface QuickActionsProps {
  actions: QuickAction[];
  /** Target for the trailing solid "+" button that opens the full create menu. */
  moreTo?: string;
  onMore?: () => void;
  className?: string;
}

/**
 * QuickActions — the outlined pill row of create shortcuts.
 *
 * Sits directly under the page title, above the metrics. Its job is to make the
 * five things you actually start a session by doing reachable in one click,
 * instead of buried three levels into a nav.
 */
export const QuickActions: React.FC<QuickActionsProps> = ({
  actions,
  moreTo,
  onMore,
  className,
}) => (
  <div className={cn('flex items-center gap-2 flex-wrap', className)}>
    {actions.map((a) => {
      const Icon = a.icon ?? Plus;
      return (
        <Link key={a.to + a.label} to={a.to} className="pill-action">
          <span className="flex h-5 w-5 items-center justify-center rounded-full border border-current/25 opacity-70">
            <Icon className="h-3 w-3" />
          </span>
          {a.label}
        </Link>
      );
    })}

    {(moreTo || onMore) &&
      (moreTo ? (
        <Link
          to={moreTo}
          aria-label="More actions"
          title="More actions"
          className="flex h-9 w-9 items-center justify-center rounded-full bg-foreground text-background transition-transform hover:scale-105"
        >
          <Plus className="h-4 w-4" />
        </Link>
      ) : (
        <button
          type="button"
          onClick={onMore}
          aria-label="More actions"
          title="More actions"
          className="flex h-9 w-9 items-center justify-center rounded-full bg-foreground text-background transition-transform hover:scale-105"
        >
          <Plus className="h-4 w-4" />
        </button>
      ))}
  </div>
);
