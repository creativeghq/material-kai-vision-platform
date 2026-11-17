import React from 'react';
import { ChevronRight, Pin } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

import { cn } from '@/lib/utils';

interface HubTimelineProps {
  children: React.ReactNode;
  className?: string;
}

/**
 * ACTIVITY TIMELINE — the centre column of a record page.
 *
 * Grouped, not endless. Entries arrive under a `HubTimelineGroup` heading
 * ("Pinned", "Upcoming", "March 2020") because an undifferentiated reverse-chron
 * list of 200 events answers "what happened here" with "everything, equally".
 * The group heading is the only thing that makes the feed skimmable.
 */
export const HubTimeline: React.FC<HubTimelineProps> = ({ children, className }) => (
  <div className={cn('space-y-4', className)}>{children}</div>
);

/** A dated / named section of the feed. */
export const HubTimelineGroup: React.FC<{ label: string; children: React.ReactNode }> = ({
  label,
  children,
}) => (
  <section>
    <h4 className="mb-1.5 font-sans text-[11px] font-semibold text-muted-foreground">{label}</h4>
    <div className="space-y-1.5">{children}</div>
  </section>
);

interface HubTimelineItemProps {
  icon?: LucideIcon;
  /** The bolded lead — "Task assigned to Anna Kutch", "Note from Nick". */
  title: React.ReactNode;
  /** Right-aligned timestamp. Already-formatted text; this does not format dates. */
  timestamp?: string;
  /** Flags the timestamp as overdue (red) rather than neutral. */
  overdue?: boolean;
  pinned?: boolean;
  /** Body — the note text, the email preview, the meeting agenda. */
  children?: React.ReactNode;
  /** Renders the item as an expandable disclosure. */
  expandable?: boolean;
  defaultExpanded?: boolean;
  className?: string;
}

/**
 * One event in the feed.
 *
 * The timestamp is right-aligned on the title row and the body is indented under
 * it, so a column of times reads down the right edge and a column of subjects
 * reads down the left. Both are scannable at once; interleaving them into one
 * text run makes neither so.
 */
export const HubTimelineItem: React.FC<HubTimelineItemProps> = ({
  icon: Icon,
  title,
  timestamp,
  overdue = false,
  pinned = false,
  children,
  expandable = false,
  defaultExpanded = false,
  className,
}) => {
  const [expanded, setExpanded] = React.useState(defaultExpanded);
  const showBody = !!children && (!expandable || expanded);

  const titleRow = (
    <div className="flex w-full items-start gap-2">
      {expandable && (
        <ChevronRight
          className={cn(
            'mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform',
            expanded && 'rotate-90',
          )}
          aria-hidden="true"
        />
      )}
      {Icon && !expandable && (
        <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
      )}
      {/* The pin sits IN the title row, not absolutely in the corner: the corner
          is where the timestamp lives, and an absolute badge landed on top of it
          on every pinned item that had a date — which is all of them. */}
      {pinned && <Pin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" aria-label="Pinned" />}
      <span className="min-w-0 flex-1 text-left text-sm text-foreground">{title}</span>
      {timestamp && (
        <span
          className={cn(
            'shrink-0 whitespace-nowrap text-xs tabular-nums',
            overdue ? 'font-semibold text-destructive' : 'text-muted-foreground',
          )}
        >
          {timestamp}
        </span>
      )}
    </div>
  );

  return (
    <article
      className={cn(
        'relative rounded-md border border-hairline bg-card px-3 py-2.5',
        pinned && 'border-l-2 border-l-primary',
        className,
      )}
    >
      {expandable ? (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          className="w-full rounded-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {titleRow}
        </button>
      ) : (
        titleRow
      )}

      {showBody && (
        <div className={cn('mt-1.5 text-sm text-muted-foreground', (expandable || Icon) && 'pl-[1.375rem]')}>
          {children}
        </div>
      )}
    </article>
  );
};
