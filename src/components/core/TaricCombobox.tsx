import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, Check, ChevronsUpDown, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/core/ui/button';
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from '@/components/core/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/core/ui/popover';
import { taricService, formatTaricCode, type TaricCode } from '@/services/taricService';

/**
 * Searchable TARIC commodity-code picker, replacing the free-text boxes that used to accept
 * anything at all.
 *
 * Only declarable lines (product line suffix 80) are offered — an intermediate line is real
 * nomenclature but cannot appear on a declaration, so offering it would just move the rejection
 * from here to the border. A code already stored on the record is resolved on mount so a value
 * that has since expired or was typed by hand before this picker existed shows as unrecognised
 * instead of silently looking fine.
 *
 * `value` is the 10-digit code (digits only) or '' when unset.
 */
export const TaricCombobox: React.FC<{
  value: string;
  onChange: (code: string) => void;
  /** Restrict the search to these 2-digit chapters. */
  chapters?: string[];
  placeholder?: string;
  triggerClassName?: string;
  id?: string;
  disabled?: boolean;
}> = ({ value, onChange, chapters, placeholder = 'Not set', triggerClassName, id, disabled }) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<TaricCode[]>([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<TaricCode | null>(null);
  const [resolving, setResolving] = useState(false);
  const seq = useRef(0);

  // Resolve the stored code to its description (and find out whether it is still valid).
  useEffect(() => {
    let live = true;
    if (!value) { setSelected(null); return; }
    if (selected?.code === value) return;
    setResolving(true);
    taricService.lookup(value)
      .then((row) => { if (live) setSelected(row); })
      .catch(() => { if (live) setSelected(null); })
      .finally(() => { if (live) setResolving(false); });
    return () => { live = false; };
  }, [value]); // eslint-disable-line react-hooks/exhaustive-deps

  const runSearch = useCallback((q: string) => {
    const mine = ++seq.current;
    if (q.trim().length < 2) { setResults([]); setSearching(false); return; }
    setSearching(true);
    taricService.search(q, { chapters, limit: 25 })
      .then((rows) => { if (mine === seq.current) setResults(rows); })
      .catch(() => { if (mine === seq.current) setResults([]); })
      .finally(() => { if (mine === seq.current) setSearching(false); });
  }, [chapters]);

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => runSearch(query), 250);
    return () => clearTimeout(t);
  }, [query, open, runSearch]);

  // A stored value the reference table does not recognise. Distinct from "not set" — the
  // operator needs to know their existing code is the problem.
  const unrecognised = !!value && !resolving && !selected;

  return (
    <Popover open={open} onOpenChange={(v) => { setOpen(v); if (v) setQuery(''); }}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn('justify-between font-normal rounded-md', unrecognised && 'border-destructive/60', triggerClassName)}
        >
          {resolving ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
          ) : selected ? (
            <span className="flex items-center gap-2 truncate">
              <span className="font-mono text-[10px] shrink-0">{formatTaricCode(selected.code)}</span>
              <span className="truncate text-muted-foreground">{selected.description_en ?? selected.description_el}</span>
            </span>
          ) : unrecognised ? (
            <span className="flex items-center gap-2 truncate text-destructive">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              <span className="font-mono text-[10px]">{formatTaricCode(value)}</span>
              <span className="truncate text-[11px]">not in the nomenclature</span>
            </span>
          ) : (
            <span className="text-muted-foreground">{placeholder}</span>
          )}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[420px] p-0" align="start">
        {/* shouldFilter off: the ranking is done in SQL (full-text + trigram), and cmdk's own
            substring filter would throw away perfectly good semantic matches. */}
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Search by description or type a code…"
            value={query}
            onValueChange={setQuery}
          />
          <CommandList>
            {searching ? (
              <div className="flex justify-center py-6"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>
            ) : (
              <>
                <CommandEmpty>
                  {query.trim().length < 2
                    ? 'Type at least 2 characters, or paste a code.'
                    : 'No declarable code matched.'}
                </CommandEmpty>
                <CommandGroup>
                  {value && (
                    <CommandItem value="__clear" onSelect={() => { onChange(''); setOpen(false); }}>
                      <Check className="mr-2 h-4 w-4 opacity-0" />
                      <span className="text-muted-foreground">Clear</span>
                    </CommandItem>
                  )}
                  {results.map((r) => (
                    <CommandItem
                      key={r.code}
                      value={r.code}
                      onSelect={() => { setSelected(r); onChange(r.code); setOpen(false); }}
                      className="items-start"
                    >
                      <Check className={cn('mr-2 h-4 w-4 mt-0.5 shrink-0', value === r.code ? 'opacity-100' : 'opacity-0')} />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-baseline gap-2">
                          <span className="font-mono text-[10px] shrink-0">{formatTaricCode(r.code)}</span>
                          <span className="truncate text-xs">{r.description_en ?? r.description_el}</span>
                        </span>
                        {r.breadcrumb && (
                          <span className="block truncate text-[10px] text-muted-foreground">{r.breadcrumb}</span>
                        )}
                      </span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
};

export default TaricCombobox;
