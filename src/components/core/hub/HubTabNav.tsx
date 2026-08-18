import React from 'react';
import { Link, useMatch, useResolvedPath } from 'react-router-dom';
import { Plus } from 'lucide-react';

import { cn } from '@/lib/utils';

export interface HubTabItem {
  id: string;
  label: string;
  /** Route for a link tab. Omit and pass `onSelect` for a controlled tab. */
  to?: string;
  /** Right-hand count. `0` renders nothing — an empty count is noise. */
  count?: number;
  /** Marks a saved/pinned view (a dot before the label). */
  pinned?: boolean;
  /** Match the route as a prefix rather than exactly (a section with children). */
  matchPrefix?: boolean;
}

interface HubTabNavProps {
  items: HubTabItem[];
  /** Controlled mode: the active tab id. Ignored for items that carry `to`. */
  activeId?: string;
  onSelect?: (id: string) => void;
  /** Trailing action rendered after the last tab — "+ Add view", "All views". */
  trailing?: React.ReactNode;
  className?: string;
  'aria-label'?: string;
}

// Shared box for both the link and the button form. Colour, weight and the
// active underline all come from the platform's `[role="tab"]` rules in
// index.css, so a route tab and an in-page tab are indistinguishable on screen.
const TAB_CLASS =
  'relative inline-flex min-h-9 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap px-3 py-1.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 md:min-h-0';

const TabBody: React.FC<{ item: HubTabItem }> = ({ item }) => (
  <>
    {item.pinned && (
      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" aria-label="Saved view" />
    )}
    {item.label}
    {!!item.count && <span className="tabular-nums opacity-70">{item.count}</span>}
  </>
);

/**
 * A route tab. A real <a>, not a button that calls `navigate()` — middle-click,
 * ⌘-click and "copy link address" are how people actually use a tab strip in a
 * CRM, and all three disappear the moment navigation is a click handler.
 *
 * `data-state` is resolved here rather than through NavLink's className
 * render-prop because the platform's tab CSS keys off the attribute, and a
 * render-prop can only produce a class.
 */
const HubTabLink: React.FC<{ item: HubTabItem }> = ({ item }) => {
  const resolved = useResolvedPath(item.to ?? '');
  const match = useMatch({ path: resolved.pathname, end: !item.matchPrefix });
  const active = !!match;

  return (
    <Link
      to={item.to ?? ''}
      role="tab"
      aria-selected={active}
      data-state={active ? 'active' : 'inactive'}
      className={TAB_CLASS}
    >
      <TabBody item={item} />
    </Link>
  );
};

/**
 * TAB NAV — the underline strip used for page sections and saved views.
 *
 * `role="tablist"` + `role="tab"` so the shared CSS picks it up, but in link
 * mode it deliberately omits `aria-controls`/`tabpanel` wiring: there is no
 * panel in this document to control — activating a tab loads a route.
 */
export const HubTabNav: React.FC<HubTabNavProps> = ({
  items,
  activeId,
  onSelect,
  trailing,
  className,
  'aria-label': ariaLabel = 'Sections',
}) => (
  <div
    role="tablist"
    aria-label={ariaLabel}
    aria-orientation="horizontal"
    className={cn(
      'flex w-full items-center gap-1 overflow-x-auto border-b border-hairline [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
      className,
    )}
  >
    {items.map((item) =>
      item.to ? (
        <HubTabLink key={item.id} item={item} />
      ) : (
        <button
          key={item.id}
          type="button"
          role="tab"
          aria-selected={activeId === item.id}
          data-state={activeId === item.id ? 'active' : 'inactive'}
          onClick={() => onSelect?.(item.id)}
          className={TAB_CLASS}
        >
          <TabBody item={item} />
        </button>
      ),
    )}

    {trailing && <div className="ml-2 flex shrink-0 items-center gap-2 pl-1">{trailing}</div>}
  </div>
);

/** "+ Add view" — the standard trailing action on a saved-views strip. */
export const HubTabAddAction: React.FC<{ label: string; onClick?: () => void }> = ({
  label,
  onClick,
}) => (
  <button
    type="button"
    onClick={onClick}
    className="inline-flex items-center gap-0.5 rounded-xs px-1 text-xs font-semibold text-primary hover:underline"
  >
    <Plus className="h-3 w-3" aria-hidden="true" />
    {label}
  </button>
);
