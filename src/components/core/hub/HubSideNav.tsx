import React from 'react';
import { NavLink } from 'react-router-dom';
import type { LucideIcon } from 'lucide-react';

import { cn } from '@/lib/utils';
import { useStripAffordance } from '@/hooks/useStripAffordance';

export interface HubNavItem {
  id: string;
  label: string;
  /** Route for a link item. Omit and pass `onSelect` for a controlled pane. */
  to?: string;
  icon?: LucideIcon;
  /** Right-aligned count. `0` renders nothing — an empty count is noise. */
  count?: number;
  children?: HubNavItem[];
}

export interface HubNavGroup {
  /** Group heading. Omit for an ungrouped run of items. */
  label?: string;
  items: HubNavItem[];
}

interface HubSideNavProps {
  groups: HubNavGroup[];
  /** Controlled mode: the active item id. Ignored for items that carry `to`. */
  activeId?: string;
  onSelect?: (id: string) => void;
  className?: string;
  'aria-label'?: string;
}

/** SIDE NAV — the settings/section rail (Settings, Finance sections, Admin). */
export const HubSideNav: React.FC<HubSideNavProps> = ({
  groups,
  activeId,
  onSelect,
  className,
  'aria-label': ariaLabel = 'Section navigation',
}) => {
  const ref = React.useRef<HTMLElement | null>(null);
  const overflow = useStripAffordance(ref, '.sidebar-item.active');

  return (
    <nav
      ref={ref}
      aria-label={ariaLabel}
      data-overflow={overflow}
      className={cn(
        'section-rail scroll-y-clean w-full shrink-0 border-hairline lg:sticky lg:top-0 lg:max-h-[calc(100dvh-3rem)] lg:w-56 lg:border-r lg:pr-2',
        className,
      )}
    >
      {groups.map((group, gi) => (
        <div
          key={group.label ?? `group-${gi}`}
          data-rail-group=""
          className={gi > 0 ? 'mt-4' : undefined}
        >
          {group.label && (
            <h3
              data-rail-heading=""
              className="px-3 pb-1 font-sans text-[11px] font-semibold text-muted-foreground"
            >
              {group.label}
            </h3>
          )}
          <ul className="space-y-0.5">
            {group.items.map((item) => (
              <HubSideNavRow key={item.id} item={item} activeId={activeId} onSelect={onSelect} />
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
};

/** A group separator for a rail built from a FLAT list of rows. */
export const HubRailSectionLabel: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div data-rail-heading="" className="flex w-full items-center gap-2 px-3 pb-1 pt-3">
    <span className="h-px flex-1 bg-hairline" aria-hidden="true" />
    <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
      {children}
    </span>
    <span className="h-px flex-1 bg-hairline" aria-hidden="true" />
  </div>
);

const HubSideNavRow: React.FC<{
  item: HubNavItem;
  activeId?: string;
  onSelect?: (id: string) => void;
  depth?: number;
}> = ({ item, activeId, onSelect, depth = 0 }) => {
  const Icon = item.icon;
  const hasChildren = !!item.children?.length;
  const isActive = activeId === item.id;

  const inner = (
    <>
      {Icon && <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />}
      <span className="min-w-0 flex-1 truncate">{item.label}</span>
      {!!item.count && (
        <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{item.count}</span>
      )}
    </>
  );

  const rowClass = (active: boolean) =>
    cn('sidebar-item w-full text-left', active && 'active', depth > 0 && 'pl-8');

  return (
    <li>
      {item.to ? (
        <NavLink to={item.to} className={({ isActive: navActive }) => rowClass(navActive)} end>
          {inner}
        </NavLink>
      ) : (
        <button type="button" onClick={() => onSelect?.(item.id)} className={rowClass(isActive)}>
          {inner}
        </button>
      )}

      {hasChildren && (
        <ul className="mt-0.5 space-y-0.5">
          {item.children?.map((child) => (
            <HubSideNavRow
              key={child.id}
              item={child}
              activeId={activeId}
              onSelect={onSelect}
              depth={depth + 1}
            />
          ))}
        </ul>
      )}
    </li>
  );
};
