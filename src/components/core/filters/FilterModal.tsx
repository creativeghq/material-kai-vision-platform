/**
 * The one filter modal. A surface hands it `FilterGroupDef[]` and the current values; it
 * renders a category sidebar (left) + the active category's fields (right), edits a DRAFT
 * copy, and only commits on Apply — so half-set constraints never flash through the table.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Filter, Search, X, RotateCcw, Check } from 'lucide-react';
import { Dialog, DialogContent, DialogTitle } from '@/components/core/ui/dialog';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Badge } from '@/components/core/ui/badge';
import { Checkbox } from '@/components/core/ui/checkbox';
import { Slider } from '@/components/core/ui/slider';
import { ScrollArea } from '@/components/core/ui/scroll-area';
import { cn } from '@/lib/utils';
import {
  NONE_VALUE,
  countActive,
  foldForSearch,
  isFieldActive,
  type FilterField,
  type FilterGroupDef,
  type FilterValues,
  type DateRangeValue,
  type RangeValue,
} from './types';
import { toLocalISODate } from '@/utils/datetime';

/** Quick date windows offered on every dateRange field. */
const DATE_PRESETS: { label: string; days: number | 'mtd' | 'ytd' }[] = [
  { label: '7 days', days: 7 },
  { label: '30 days', days: 30 },
  { label: '90 days', days: 90 },
  { label: 'This month', days: 'mtd' },
  { label: 'Year to date', days: 'ytd' },
];

const iso = (d: Date) => toLocalISODate(d);

function presetRange(days: number | 'mtd' | 'ytd'): DateRangeValue {
  const today = new Date();
  if (days === 'mtd') return { from: iso(new Date(today.getFullYear(), today.getMonth(), 1)), to: iso(today) };
  if (days === 'ytd') return { from: iso(new Date(today.getFullYear(), 0, 1)), to: iso(today) };
  const from = new Date(today);
  from.setDate(from.getDate() - days);
  return { from: iso(from), to: iso(today) };
}

const FieldShell: React.FC<{ field: FilterField; active: boolean; onClear: () => void; children: React.ReactNode }> = ({
  field, active, onClear, children,
}) => (
  <div className="space-y-2">
    <div className="flex items-center justify-between gap-2">
      <div>
        <div className="text-sm font-medium">{field.label}</div>
        {field.description && <p className="text-[11px] text-muted-foreground">{field.description}</p>}
      </div>
      {active && (
        <Button variant="ghost" size="sm" className="h-6 px-2 text-[11px] text-muted-foreground" onClick={onClear}>
          Clear
        </Button>
      )}
    </div>
    {children}
  </div>
);

/** Option list shared by select (single) and multi — same look, different commit semantics. */
const OptionList: React.FC<{
  field: Extract<FilterField, { type: 'select' | 'multi' }>;
  selected: string[];
  onToggle: (value: string) => void;
}> = ({ field, selected, onToggle }) => {
  const [q, setQ] = useState('');
  const searchable = field.searchable ?? field.options.length > 8;
  // foldForSearch, not toLowerCase: these lists are full of Greek company and contact names,
  // where the accent and the final sigma are exactly what the user types differently.
  const shown = useMemo(() => {
    const needle = foldForSearch(q).trim();
    if (!needle) return field.options;
    return field.options.filter((o) => foldForSearch(o.label).includes(needle) || foldForSearch(o.hint).includes(needle));
  }, [field.options, q]);

  return (
    <div className="space-y-2">
      {searchable && (
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Search ${field.label.toLowerCase()}…`} className="h-8 pl-8 text-xs" />
        </div>
      )}
      <div className={cn('space-y-0.5', field.options.length > 10 && 'max-h-64 overflow-y-auto pr-1')}>
        {shown.length === 0 && <p className="py-3 text-center text-xs text-muted-foreground">No matches.</p>}
        {shown.map((opt) => {
          const checked = selected.includes(opt.value);
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => onToggle(opt.value)}
              className={cn(
                'flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-sm transition-colors',
                checked ? 'bg-primary/10 text-foreground' : 'hover:bg-muted/60',
              )}
            >
              <Checkbox checked={checked} className="pointer-events-none h-3.5 w-3.5" />
              <span className="min-w-0 flex-1">
                <span className="block truncate">{opt.label}</span>
                {opt.hint && <span className="block truncate text-[11px] text-muted-foreground">{opt.hint}</span>}
              </span>
              {opt.count != null && <span className="text-[11px] tabular-nums text-muted-foreground">{opt.count}</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
};

const RangeControl: React.FC<{
  field: Extract<FilterField, { type: 'range' }>;
  value: RangeValue;
  onChange: (v: RangeValue) => void;
}> = ({ field, value, onChange }) => {
  const lo = value.min ?? field.min;
  const hi = value.max ?? field.max;
  const num = (s: string): number | undefined => {
    const t = s.trim();
    if (!t) return undefined;
    const n = Number(t.replace(',', '.'));
    return Number.isFinite(n) ? n : undefined;
  };
  return (
    <div className="space-y-3">
      <Slider
        min={field.min}
        max={field.max}
        step={field.step ?? 1}
        value={[lo, hi]}
        onValueChange={([a, b]) => onChange({ min: a, max: b })}
        className="mt-1"
      />
      <div className="flex items-center gap-2">
        <Input
          className="h-8 text-xs"
          inputMode="decimal"
          placeholder={`Min ${field.unit ?? ''}`.trim()}
          value={value.min ?? ''}
          onChange={(e) => onChange({ ...value, min: num(e.target.value) })}
        />
        <span className="text-xs text-muted-foreground">to</span>
        <Input
          className="h-8 text-xs"
          inputMode="decimal"
          placeholder={`Max ${field.unit ?? ''}`.trim()}
          value={value.max ?? ''}
          onChange={(e) => onChange({ ...value, max: num(e.target.value) })}
        />
      </div>
    </div>
  );
};

const DateRangeControl: React.FC<{ value: DateRangeValue; onChange: (v: DateRangeValue) => void }> = ({ value, onChange }) => (
  <div className="space-y-2">
    <div className="flex flex-wrap gap-1.5">
      {DATE_PRESETS.map((p) => (
        <Button key={p.label} variant="outline" size="sm" className="h-6 px-2.5 text-[11px]" onClick={() => onChange(presetRange(p.days))}>
          {p.label}
        </Button>
      ))}
    </div>
    <div className="flex items-center gap-2">
      <Input type="date" className="h-8 text-xs" value={value.from ?? ''} onChange={(e) => onChange({ ...value, from: e.target.value || undefined })} />
      <span className="text-xs text-muted-foreground">to</span>
      <Input type="date" className="h-8 text-xs" value={value.to ?? ''} onChange={(e) => onChange({ ...value, to: e.target.value || undefined })} />
    </div>
  </div>
);

const FieldControl: React.FC<{ field: FilterField; value: any; onChange: (v: any) => void }> = ({ field, value, onChange }) => {
  switch (field.type) {
    case 'text':
      return (
        <Input
          className="h-8 text-xs"
          value={(value as string) ?? ''}
          placeholder={field.placeholder ?? `Search ${field.label.toLowerCase()}…`}
          onChange={(e) => onChange(e.target.value || undefined)}
        />
      );
    case 'select':
      return (
        <OptionList
          field={field}
          selected={value ? [String(value)] : []}
          // Re-picking the selected option clears it — no separate "All" row needed.
          onToggle={(v) => onChange(value === v ? undefined : v)}
        />
      );
    case 'multi': {
      const sel = (value as string[]) ?? [];
      return (
        <OptionList
          field={field}
          selected={sel}
          onToggle={(v) => {
            const next = sel.includes(v) ? sel.filter((x) => x !== v) : [...sel, v];
            onChange(next.length ? next : undefined);
          }}
        />
      );
    }
    case 'range':
      return <RangeControl field={field} value={(value as RangeValue) ?? {}} onChange={(v) => onChange(v.min == null && v.max == null ? undefined : v)} />;
    case 'dateRange':
      return <DateRangeControl value={(value as DateRangeValue) ?? {}} onChange={(v) => onChange(!v.from && !v.to ? undefined : v)} />;
    case 'bool':
      return (
        <div className="flex gap-2">
          {[true, false].map((b) => (
            <Button
              key={String(b)}
              variant={value === b ? 'default' : 'outline'}
              size="sm"
              className="h-7 flex-1 text-xs"
              onClick={() => onChange(value === b ? undefined : b)}
            >
              {b ? (field.trueLabel ?? 'Yes') : (field.falseLabel ?? 'No')}
            </Button>
          ))}
        </div>
      );
    default:
      return null;
  }
};

export interface FilterModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  groups: FilterGroupDef[];
  values: FilterValues;
  onApply: (values: FilterValues) => void;
  title?: string;
  /**
   * Row count under the current draft — rendered live on the Apply button. May be async
   * (e.g. a `head: true` count query) for server-side surfaces; results are debounced and
   * stale responses are discarded.
   */
  previewCount?: (values: FilterValues) => number | Promise<number>;
}

/** Resolves `previewCount` for the draft, debounced, ignoring out-of-order responses. */
function usePreviewCount(
  draft: FilterValues,
  previewCount: FilterModalProps['previewCount'],
  enabled: boolean,
): number | undefined {
  const [count, setCount] = useState<number | undefined>(undefined);

  useEffect(() => {
    if (!previewCount || !enabled) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      Promise.resolve(previewCount(draft))
        .then((n) => { if (!cancelled) setCount(n); })
        // A failed count must not block Apply — fall back to the generic label.
        .catch(() => { if (!cancelled) setCount(undefined); });
    }, 200);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [draft, previewCount, enabled]);

  return count;
}

export const FilterModal: React.FC<FilterModalProps> = ({
  open, onOpenChange, groups, values, onApply, title = 'Filters', previewCount,
}) => {
  const [draft, setDraft] = useState<FilterValues>(values);
  const [activeGroup, setActiveGroup] = useState(groups[0]?.key ?? '');

  // Re-seed the draft each time the modal opens so a cancelled edit is truly discarded.
  useEffect(() => { if (open) setDraft(values); }, [open, values]);
  useEffect(() => {
    if (!groups.some((g) => g.key === activeGroup)) setActiveGroup(groups[0]?.key ?? '');
  }, [groups, activeGroup]);

  const group = groups.find((g) => g.key === activeGroup) ?? groups[0];
  const setValue = (key: string, v: any) => setDraft((d) => ({ ...d, [key]: v }));
  const activeInGroup = (g: FilterGroupDef) => g.fields.filter((f) => isFieldActive(f, draft[f.key])).length;
  const total = countActive(groups, draft);
  const preview = usePreviewCount(draft, previewCount, open);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl gap-0 overflow-hidden p-0">
        <div className="flex items-center justify-between border-b border-border/60 px-5 py-3">
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-muted-foreground" />
            {/* DialogTitle, not a raw h2: Radix wires aria-labelledby from it, which a plain
                heading does not. This is the shared filter modal on every list view, so it was
                the most-used unnamed dialog in the app. */}
            <DialogTitle className="text-sm font-semibold">{title}</DialogTitle>
            {total > 0 && <Badge variant="secondary" className="h-5 text-[10px]">{total} active</Badge>}
          </div>
        </div>

        <div className="flex min-h-[22rem]">
          {/* Category sidebar — one entry per filter group. */}
          <nav className="w-48 shrink-0 border-r border-border/60 bg-muted/20 p-2">
            {groups.map((g) => {
              const Icon = g.icon;
              const n = activeInGroup(g);
              return (
                <button
                  key={g.key}
                  type="button"
                  onClick={() => setActiveGroup(g.key)}
                  className={cn(
                    'flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-xs transition-colors',
                    g.key === activeGroup ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground',
                  )}
                >
                  {Icon && <Icon className="h-3.5 w-3.5 shrink-0" />}
                  <span className="min-w-0 flex-1 truncate">{g.label}</span>
                  {n > 0 && (
                    <span className={cn(
                      'rounded-full px-1.5 text-[10px] tabular-nums',
                      g.key === activeGroup ? 'bg-primary-foreground/20' : 'bg-primary/15 text-foreground',
                    )}>{n}</span>
                  )}
                </button>
              );
            })}
          </nav>

          <ScrollArea className="max-h-[26rem] flex-1">
            <div className="space-y-5 p-5">
              {group?.fields.map((field) => (
                <FieldShell
                  key={field.key}
                  field={field}
                  active={isFieldActive(field, draft[field.key])}
                  onClear={() => setValue(field.key, undefined)}
                >
                  <FieldControl field={field} value={draft[field.key]} onChange={(v) => setValue(field.key, v)} />
                </FieldShell>
              ))}
              {!group?.fields.length && <p className="text-xs text-muted-foreground">No filters in this group.</p>}
            </div>
          </ScrollArea>
        </div>

        <div className="flex items-center justify-between border-t border-border/60 px-5 py-3">
          <Button variant="ghost" size="sm" className="text-xs text-muted-foreground" disabled={total === 0} onClick={() => setDraft({})}>
            <RotateCcw className="mr-1.5 h-3.5 w-3.5" /> Clear all
          </Button>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button size="sm" onClick={() => { onApply(draft); onOpenChange(false); }}>
              <Check className="mr-1.5 h-3.5 w-3.5" />
              {preview != null ? `Show ${preview} result${preview === 1 ? '' : 's'}` : 'Apply filters'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export { NONE_VALUE, X };
