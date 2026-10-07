import React, { useMemo, useState } from 'react';
import { Check, ChevronsUpDown, Loader2, Plus, X } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/core/ui/popover';
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator,
} from '@/components/core/ui/command';
import { Button } from '@/components/core/ui/button';
import { cn } from '@/lib/utils';
import { CategoryColorPicker } from './CategoryColorPicker';
import { DEFAULT_CATEGORY_COLOR, categoryChipStyle, isCategoryColor } from './categoryColors';

export interface CategoryOption {
  id: string;
  name: string;
  color_hex: string | null;
  /** Group heading in the list, e.g. "Your categories" / "Professional type". */
  group?: string;
}

interface Props {
  options: CategoryOption[];
  value: string[];
  onToggle: (id: string) => void;
  /** Present only when the viewer may create categories. Creates AND selects the new one. */
  onCreate?: (name: string, color: string) => Promise<CategoryOption>;
  disabled?: boolean;
  saving?: boolean;
  placeholder?: string;
  className?: string;
}

export const CategoryDot: React.FC<{ color: string | null; className?: string }> = ({ color, className }) => (
  <span
    className={cn('h-2.5 w-2.5 shrink-0 rounded-full', !isCategoryColor(color) && 'bg-muted-foreground/40', className)}
    style={isCategoryColor(color) ? { backgroundColor: color } : undefined}
  />
);

export const CategoryChip: React.FC<{
  name: string;
  color: string | null;
  onRemove?: () => void;
}> = ({ name, color, onRemove }) => (
  <span
    className="inline-flex max-w-full items-center gap-1.5 rounded-sm border border-hairline bg-surface-sunken px-2 py-0.5 text-xs text-foreground"
    style={categoryChipStyle(color)}
  >
    <CategoryDot color={color} className="h-2 w-2" />
    <span className="truncate">{name}</span>
    {onRemove && (
      <button
        type="button"
        aria-label={`Remove ${name}`}
        onClick={(e) => { e.stopPropagation(); onRemove(); }}
        className="opacity-60 hover:opacity-100"
      >
        <X className="h-3 w-3" />
      </button>
    )}
  </span>
);

export const CategoryMultiSelect: React.FC<Props> = ({
  options, value, onToggle, onCreate, disabled, saving, placeholder = 'Add categories…', className,
}) => {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [draft, setDraft] = useState<{ name: string; color: string } | null>(null);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const selected = useMemo(
    () => value.map((id) => options.find((o) => o.id === id)).filter((o): o is CategoryOption => !!o),
    [value, options],
  );
  const groups = useMemo(() => {
    const out = new Map<string, CategoryOption[]>();
    for (const o of options) {
      const key = o.group ?? '';
      out.set(key, [...(out.get(key) ?? []), o]);
    }
    return [...out.entries()];
  }, [options]);

  const term = search.trim();
  const exactMatch = options.some((o) => o.name.toLowerCase() === term.toLowerCase());

  const submitDraft = async () => {
    if (!draft || !onCreate || !draft.name.trim()) return;
    setCreating(true);
    setCreateError(null);
    try {
      await onCreate(draft.name.trim(), draft.color);
      setDraft(null);
      setSearch('');
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Could not create the category.');
    } finally {
      setCreating(false);
    }
  };

  return (
    <Popover open={open} onOpenChange={(v) => { setOpen(v); if (!v) { setDraft(null); setCreateError(null); } }}>
      <PopoverTrigger asChild disabled={disabled}>
        <div
          role="button"
          tabIndex={0}
          aria-disabled={disabled}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpen(true); } }}
          className={cn(
            'flex min-h-9 w-full cursor-pointer items-center gap-2 rounded-sm border border-input bg-background px-2 py-1.5 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            disabled && 'pointer-events-none opacity-60',
            className,
          )}
        >
          <div className="flex flex-1 flex-wrap items-center gap-1.5">
            {selected.length === 0
              ? <span className="text-muted-foreground">{placeholder}</span>
              : selected.map((o) => (
                <CategoryChip key={o.id} name={o.name} color={o.color_hex} onRemove={disabled ? undefined : () => onToggle(o.id)} />
              ))}
          </div>
          {saving
            ? <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-muted-foreground" />
            : <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
        </div>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] min-w-[280px] p-0" align="start">
        {draft ? (
          <div className="space-y-3 p-3">
            <div className="text-xs font-semibold">New category</div>
            <input
              autoFocus
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void submitDraft(); } }}
              className="h-9 w-full rounded-sm border border-input bg-background px-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              placeholder="Category name"
            />
            <CategoryColorPicker value={draft.color} onChange={(color) => setDraft({ ...draft, color })} />
            <div className="flex items-center gap-2">
              <CategoryChip name={draft.name.trim() || 'Preview'} color={draft.color} />
            </div>
            {createError && <p className="text-xs text-destructive">{createError}</p>}
            <div className="flex justify-end gap-2">
              <Button size="sm" variant="ghost" onClick={() => setDraft(null)}>Back</Button>
              <Button size="sm" onClick={() => void submitDraft()} disabled={creating || !draft.name.trim()}>
                {creating && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
                Create
              </Button>
            </div>
          </div>
        ) : (
          <Command>
            <CommandInput placeholder="Search categories…" value={search} onValueChange={setSearch} />
            <CommandList>
              <CommandEmpty>{onCreate ? 'No match — create it below.' : 'No match.'}</CommandEmpty>
              {options.length === 0 && (
                <p className="px-3 py-2 text-xs text-muted-foreground">No categories yet.</p>
              )}
              {groups.map(([group, list]) => (
                <CommandGroup key={group || 'all'} heading={group || undefined}>
                  {list.map((o) => {
                    const checked = value.includes(o.id);
                    return (
                      <CommandItem key={o.id} value={o.name} onSelect={() => onToggle(o.id)}>
                        <span className={cn(
                          'mr-2 flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border',
                          checked ? 'border-primary bg-primary text-primary-foreground' : 'border-input',
                        )}>
                          {checked && <Check className="h-3 w-3" />}
                        </span>
                        <CategoryDot color={o.color_hex} className="mr-2" />
                        <span className="flex-1 truncate">{o.name}</span>
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              ))}
            </CommandList>
            {onCreate && (
              <>
                <CommandSeparator />
                <div className="p-1">
                  <button
                    type="button"
                    onClick={() => setDraft({ name: exactMatch ? '' : term, color: DEFAULT_CATEGORY_COLOR })}
                    className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    {term && !exactMatch ? <>Create “{term}”</> : 'New category'}
                  </button>
                </div>
              </>
            )}
          </Command>
        )}
      </PopoverContent>
    </Popover>
  );
};
