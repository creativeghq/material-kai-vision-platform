import React, { useState } from 'react';
import { Check, ChevronsUpDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/core/ui/button';
import { Badge } from '@/components/core/ui/badge';
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from '@/components/core/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/core/ui/popover';
import { VAT_COUNTRY_OPTIONS } from '@/lib/vatCountries';

/**
 * Searchable VAT-country picker. Drop-in replacement for the plain shadcn `<Select>`
 * over VAT_COUNTRY_OPTIONS — typing filters by code ("BG") or name ("bulgaria")
 * instead of scrolling ~35 countries one by one.
 *
 * `value` is the VAT prefix code (e.g. "EL", "BG") or "" when unset.
 * `onChange` emits the code, or "" when the "Not set" row is picked (allowUnset).
 */
export const VatCountryCombobox: React.FC<{
  value: string;
  onChange: (code: string) => void;
  allowUnset?: boolean;
  placeholder?: string;
  triggerClassName?: string;
  id?: string;
  disabled?: boolean;
}> = ({ value, onChange, allowUnset = false, placeholder = 'Not set', triggerClassName, id, disabled }) => {
  const [open, setOpen] = useState(false);
  const selected = VAT_COUNTRY_OPTIONS.find((o) => o.code === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn('justify-between font-normal rounded-md', triggerClassName)}
        >
          {selected ? (
            <span className="flex items-center gap-2 truncate">
              <span className="font-mono text-[10px]">{selected.code}</span>
              <span className="truncate">{selected.name}</span>
            </span>
          ) : (
            <span className="text-muted-foreground">{placeholder}</span>
          )}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[260px] p-0" align="start">
        <Command>
          <CommandInput placeholder="Search country or code…" />
          <CommandList>
            <CommandEmpty>No country found.</CommandEmpty>
            <CommandGroup>
              {allowUnset && (
                <CommandItem
                  value="__unset not set"
                  onSelect={() => { onChange(''); setOpen(false); }}
                >
                  <Check className={cn('mr-2 h-4 w-4', value ? 'opacity-0' : 'opacity-100')} />
                  <span className="text-muted-foreground">Not set</span>
                </CommandItem>
              )}
              {VAT_COUNTRY_OPTIONS.map((o) => (
                <CommandItem
                  key={o.code}
                  value={`${o.code} ${o.name}`}
                  onSelect={() => { onChange(o.code); setOpen(false); }}
                >
                  <Check className={cn('mr-2 h-4 w-4', value === o.code ? 'opacity-100' : 'opacity-0')} />
                  <span className="font-mono text-[10px] w-7 shrink-0">{o.code}</span>
                  <span className="flex-1 truncate">{o.name}</span>
                  {o.eu && <Badge variant="outline" className="text-[9px] py-0 ml-2">EU</Badge>}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
};

export default VatCountryCombobox;
