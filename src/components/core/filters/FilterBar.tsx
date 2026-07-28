/**
 * The drop-in toolbar every filterable list uses: inline search box (optional), a Filter
 * icon button carrying the active-constraint count, and a row of removable chips so the
 * applied state stays visible without reopening the modal.
 */
import React, { useMemo, useState } from 'react';
import { Filter, Search, X } from 'lucide-react';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { cn } from '@/lib/utils';
import { FilterModal } from './FilterModal';
import { countActive, describeValue, isFieldActive, type FilterGroupDef, type FilterValues } from './types';

export interface FilterBarProps {
  groups: FilterGroupDef[];
  values: FilterValues;
  onChange: (values: FilterValues) => void;
  /**
   * Key of a `text` field promoted out of the modal into an always-visible search box.
   * Pass null to keep every field inside the modal.
   */
  searchKey?: string | null;
  searchPlaceholder?: string;
  /**
   * Live count for the modal's Apply button — usually `(v) => applyFilters(rows, groups, v).length`
   * client-side, or an async `head: true` count query for server-side surfaces.
   */
  previewCount?: (values: FilterValues) => number | Promise<number>;
  title?: string;
  className?: string;
  /** Extra controls (New, Export…) rendered after the Filter button. */
  children?: React.ReactNode;
}

export const FilterBar: React.FC<FilterBarProps> = ({
  groups, values, onChange, searchKey = 'q', searchPlaceholder = 'Search…', previewCount, title, className, children,
}) => {
  const [open, setOpen] = useState(false);

  const allFields = useMemo(() => groups.flatMap((g) => g.fields), [groups]);
  const searchField = searchKey ? allFields.find((f) => f.key === searchKey && f.type === 'text') : undefined;
  /**
   * What the modal actually shows: everything except the promoted search box (it owns that
   * field) and except choice fields that cannot narrow anything — a list whose options were
   * derived from the rows can collapse to a single value ("Status: New — 1000"), and ticking
   * the only box returns the same list. Pruned here rather than per-surface so it holds for
   * every filterable list. A value already set on a pruned field still applies and still has
   * its removable chip; it just isn't offered again.
   */
  const modalGroups = useMemo(() => (
    groups
      .map((g) => ({
        ...g,
        fields: g.fields.filter((f) => {
          if (f.key === searchField?.key) return false;
          if (f.type === 'multi' || f.type === 'select') return f.options.length > 1;
          return true;
        }),
      }))
      .filter((g) => g.fields.length > 0)
  ), [groups, searchField]);

  const chips = allFields
    .filter((f) => f.key !== searchField?.key && isFieldActive(f, values[f.key]))
    .map((f) => ({ key: f.key, label: describeValue(f, values[f.key]) }));
  const count = countActive(modalGroups, values);

  return (
    <div className={cn('flex flex-wrap items-center gap-2', className)}>
      {searchField && (
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={(values[searchField.key] as string) ?? ''}
            onChange={(e) => onChange({ ...values, [searchField.key]: e.target.value || undefined })}
            placeholder={(searchField as any).placeholder ?? searchPlaceholder}
            className="h-8 w-56 pl-8 text-xs"
          />
        </div>
      )}

      {modalGroups.length > 0 && (
        <Button
          variant={count > 0 ? 'default' : 'outline'}
          size="sm"
          className="h-8 gap-1.5 text-xs"
          onClick={() => setOpen(true)}
          title="Filters"
        >
          <Filter className="h-3.5 w-3.5" />
          Filters
          {count > 0 && (
            <span className="ml-0.5 rounded-full bg-primary-foreground/25 px-1.5 text-[10px] tabular-nums">{count}</span>
          )}
        </Button>
      )}

      {chips.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          {chips.map((c) => (
            <button
              key={c.key}
              type="button"
              onClick={() => onChange({ ...values, [c.key]: undefined })}
              className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-muted/40 px-2.5 py-0.5 text-[11px] text-muted-foreground transition-colors hover:border-destructive/50 hover:text-foreground"
              title="Remove filter"
            >
              {c.label}
              <X className="h-3 w-3" />
            </button>
          ))}
          {chips.length > 1 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-[11px] text-muted-foreground"
              onClick={() => onChange(searchField ? { [searchField.key]: values[searchField.key] } : {})}
            >
              Clear all
            </Button>
          )}
        </div>
      )}

      {children}

      <FilterModal
        open={open}
        onOpenChange={setOpen}
        groups={modalGroups}
        values={values}
        onApply={(next) => onChange(searchField ? { ...next, [searchField.key]: values[searchField.key] } : next)}
        title={title}
        previewCount={previewCount}
      />
    </div>
  );
};
