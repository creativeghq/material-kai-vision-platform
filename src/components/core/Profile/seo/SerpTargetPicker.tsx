import React, { useEffect, useState } from 'react';
import { Check, ChevronsUpDown, Loader2, MapPin } from 'lucide-react';

import { Button } from '@/components/core/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/core/ui/popover';
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from '@/components/core/ui/command';
import { HubSegmented } from '@/components/core/hub/HubSegmented';
import { cn } from '@/lib/utils';
import {
  userWebsitesService,
  type KeywordTarget,
  type SerpDevice,
  type SerpLocation,
} from '@/services/userWebsitesService';

const DEVICE_OPTIONS = [
  { value: 'desktop', label: 'Desktop' },
  { value: 'mobile', label: 'Mobile' },
] as const;

const LOCATION_CACHE = new Map<string, Promise<SerpLocation[]>>();

function loadLocations(websiteId: string, country: string): Promise<SerpLocation[]> {
  let p = LOCATION_CACHE.get(country);
  if (!p) {
    p = userWebsitesService.serpLocations(websiteId, country);
    p.catch(() => LOCATION_CACHE.delete(country));
    LOCATION_CACHE.set(country, p);
  }
  return p;
}

export function shortLocationName(name: string | null | undefined): string {
  if (!name) return '';
  const parts = name.split(',').map((s) => s.trim()).filter(Boolean);
  return (parts.length > 1 ? parts.slice(0, -1) : parts).join(', ');
}

export const SerpTargetPicker: React.FC<{
  websiteId: string;
  countryCode: string;
  value: KeywordTarget;
  onChange: (next: KeywordTarget) => void;
  disabled?: boolean;
}> = ({ websiteId, countryCode, value, onChange, disabled }) => {
  const [open, setOpen] = useState(false);
  const [locations, setLocations] = useState<SerpLocation[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || locations) return;
    let live = true;
    setError(null);
    loadLocations(websiteId, countryCode)
      .then((l) => { if (live) setLocations(l); })
      .catch((e: unknown) => { if (live) setError(e instanceof Error ? e.message : 'Could not load locations'); });
    return () => { live = false; };
  }, [open, locations, websiteId, countryCode]);

  const pick = (loc: SerpLocation | null) => {
    onChange({
      ...value,
      location: loc ? { location_code: loc.location_code, location_name: loc.location_name } : null,
    });
    setOpen(false);
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <HubSegmented
        aria-label="Device"
        options={DEVICE_OPTIONS}
        value={value.device}
        onChange={(d: SerpDevice) => onChange({ ...value, device: d })}
      />
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button size="sm" variant="outline" disabled={disabled} className="min-w-[180px] justify-between" aria-label="Location">
            <span className="flex items-center gap-1.5 truncate">
              <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              {value.location ? shortLocationName(value.location.location_name) : `All of ${countryCode}`}
            </span>
            <ChevronsUpDown className="ml-1 h-3.5 w-3.5 shrink-0 opacity-60" aria-hidden="true" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[300px] p-0" align="start">
          <Command>
            <CommandInput placeholder="Search a city or region…" />
            <CommandList>
              {error ? (
                <p className="px-3 py-3 text-xs text-amber-800 dark:text-amber-300">
                  Could not load {countryCode} locations: {error}. Country-level tracking still works.
                </p>
              ) : !locations ? (
                <div className="flex justify-center py-4"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>
              ) : (
                <>
                  <CommandEmpty>No location matches.</CommandEmpty>
                  <CommandGroup>
                    <CommandItem value={`__country ${countryCode}`} onSelect={() => pick(null)}>
                      <Check className={cn('mr-2 h-3.5 w-3.5', value.location ? 'opacity-0' : 'opacity-100')} />
                      All of {countryCode}
                    </CommandItem>
                    {locations.map((l) => (
                      <CommandItem
                        key={l.location_code}
                        value={`${l.location_name} ${l.location_code}`}
                        onSelect={() => pick(l)}
                      >
                        <Check className={cn('mr-2 h-3.5 w-3.5', value.location?.location_code === l.location_code ? 'opacity-100' : 'opacity-0')} />
                        <span className="truncate">{shortLocationName(l.location_name)}</span>
                        <span className="ml-auto pl-2 text-[11px] text-muted-foreground">{l.location_type}</span>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </>
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
};
