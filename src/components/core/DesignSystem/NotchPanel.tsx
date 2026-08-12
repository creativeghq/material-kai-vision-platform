import React from 'react';

import { cn } from '@/lib/utils';

interface NotchPanelProps {
  /** Tab label — Title Case, it reads as a section heading. */
  title: string;
  /** Count bubble inside the tab. */
  count?: number;
  /** Rendered inline to the right of the tab, outside the panel (filters etc). */
  toolbar?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

/**
 * NotchPanel — the folder-tab section container.
 *
 * The tab and the panel share one recessed surface joined by a concave corner
 * (carved by a radial mask in `.tab-notch::after`). It groups a row of tiles
 * into one labelled region, which is the job the platform previously did with
 * yet another identical glass card — so a group of stats and a single stat
 * looked the same.
 */
export const NotchPanel: React.FC<NotchPanelProps> = ({
  title,
  count,
  toolbar,
  children,
  className,
}) => (
  <section className={cn('w-full', className)}>
    <div className="flex items-end gap-3 flex-wrap">
      <div className="tab-notch">
        {typeof count === 'number' && (
          <span className="flex h-6 min-w-6 items-center justify-center rounded-full bg-vivid px-1.5 text-xs font-semibold text-vivid-foreground">
            {count}
          </span>
        )}
        <h2 className="text-base font-semibold tracking-tight">{title}</h2>
      </div>
      {toolbar && <div className="flex items-center gap-2 pb-3 ml-auto">{toolbar}</div>}
    </div>

    <div className="tab-notch-panel p-4 sm:p-6">{children}</div>
  </section>
);

/**
 * NotchGroup — a labelled column of tiles inside a NotchPanel, separated from
 * its neighbour by a hairline rather than another card border.
 */
export const NotchGroup: React.FC<{
  label: string;
  children: React.ReactNode;
  className?: string;
}> = ({ label, children, className }) => (
  <div className={cn('min-w-0', className)}>
    <p className="text-sm text-muted-foreground mb-3">{label}</p>
    {children}
  </div>
);
