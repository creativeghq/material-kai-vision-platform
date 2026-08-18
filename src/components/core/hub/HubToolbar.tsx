import React from 'react';
import { Search, X } from 'lucide-react';

import { cn } from '@/lib/utils';
import { Input } from '@/components/core/ui/input';
import { Button } from '@/components/core/ui/button';

interface HubToolbarProps {
  /** Controlled search text. Omit both search props to hide the field. */
  search?: string;
  onSearchChange?: (value: string) => void;
  searchPlaceholder?: string;
  /** Filter controls — usually a row of <HubFilterSelect>. */
  filters?: React.ReactNode;
  /** Right-aligned actions (Export, Save view, column picker…). */
  actions?: React.ReactNode;
  className?: string;
}

/**
 * TOOLBAR — the band directly above a list: search, filters, view actions.
 *
 * It is a sunken strip, not another panel. That matters: a list screen has a
 * page header, a toolbar and a table, and if all three are cards you get three
 * stacked white boxes with two gutters of dead space between them. Sinking the
 * toolbar and letting it sit flush on top of the table makes the two read as
 * one object — the list and its controls.
 *
 * Filters are LEFT-aligned next to search because they narrow the same result
 * set; actions are right-aligned because they act on it. That split is the
 * whole reason the row is legible without labels.
 */
export const HubToolbar: React.FC<HubToolbarProps> = ({
  search,
  onSearchChange,
  searchPlaceholder = 'Search',
  filters,
  actions,
  className,
}) => {
  const showSearch = onSearchChange !== undefined;

  return (
    <div
      className={cn(
        'flex flex-wrap items-center gap-2 border-b border-hairline bg-surface-sunken px-3 py-2',
        className,
      )}
    >
      {showSearch && (
        <div className="relative min-w-[180px] flex-1 sm:max-w-xs">
          <Search
            className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            value={search ?? ''}
            onChange={(e) => onSearchChange?.(e.target.value)}
            placeholder={searchPlaceholder}
            aria-label={searchPlaceholder}
            className="h-8 pl-8 pr-8"
          />
          {!!search && (
            <button
              type="button"
              onClick={() => onSearchChange?.('')}
              aria-label="Clear search"
              className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-xs p-0.5 text-muted-foreground hover:bg-surface-hover hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      )}

      {filters && <div className="flex flex-wrap items-center gap-1.5">{filters}</div>}

      {actions && <div className="ml-auto flex flex-wrap items-center gap-1.5">{actions}</div>}
    </div>
  );
};

export interface HubFilterOption {
  value: string;
  label: string;
}

interface HubFilterSelectProps {
  label: string;
  value: string;
  options: HubFilterOption[];
  onChange: (value: string) => void;
  /** Value that means "no filter". Defaults to `'all'`. */
  allValue?: string;
  className?: string;
}

/**
 * FILTER CHIP — a compact native <select> dressed as a toolbar control.
 *
 * Native rather than a Radix Select on purpose: a filter row can hold six of
 * these, each with a few hundred options (owners, stages, categories), and the
 * native control gets keyboard type-ahead, mobile's own picker and zero popup
 * layout cost for free.
 *
 * When a filter is ACTIVE the chip switches to the accent — border, text and a
 * faint fill. Without that, a list showing 3 of 400 rows looks like a list with
 * 3 rows, and "why is this empty" is the single most common support question a
 * filtered table generates.
 */
export const HubFilterSelect: React.FC<HubFilterSelectProps> = ({
  label,
  value,
  options,
  onChange,
  allValue = 'all',
  className,
}) => {
  const active = value !== allValue;
  const selected = options.find((o) => o.value === value);

  return (
    <label
      className={cn(
        'relative inline-flex h-8 items-center rounded-sm border pl-2.5 pr-6 text-xs transition-colors',
        active
          ? 'border-primary bg-primary/[0.08] text-primary font-semibold'
          : 'border-hairline bg-card text-muted-foreground hover:border-muted-foreground/50 hover:text-foreground',
        className,
      )}
    >
      <span className="sr-only">{label}</span>
      <span aria-hidden="true" className="whitespace-nowrap">
        {active ? (selected?.label ?? value) : label}
      </span>
      {/* The real control is stretched invisibly over the chip so the whole chip
          is the hit target and the browser still owns the popup. */}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={label}
        className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <svg
        aria-hidden="true"
        viewBox="0 0 12 12"
        className="pointer-events-none absolute right-2 h-3 w-3 opacity-70"
      >
        <path d="M2.5 4.5 6 8l3.5-3.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </label>
  );
};

interface HubResetFiltersProps {
  count: number;
  onReset: () => void;
}

/** "3 filters · Clear" — only rendered when something is actually filtering. */
export const HubResetFilters: React.FC<HubResetFiltersProps> = ({ count, onReset }) =>
  count > 0 ? (
    <Button variant="link" size="sm" onClick={onReset} className="h-8 text-xs">
      Clear {count} filter{count === 1 ? '' : 's'}
    </Button>
  ) : null;
