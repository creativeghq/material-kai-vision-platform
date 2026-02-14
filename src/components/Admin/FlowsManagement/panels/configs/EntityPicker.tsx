import React, { useState, useEffect, useCallback } from 'react';
import { Search, Check, Code2, X } from 'lucide-react';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/core/ui/command';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/core/ui/popover';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/core/ui/tooltip';
import { searchEntities, resolveEntityLabel, type EntityType, type EntityResult } from './entitySearchService';

interface EntityPickerProps {
  entityType: EntityType;
  value: string;
  onSelect: (id: string, label: string) => void;
  placeholder?: string;
  /** Allow switching to raw template mode e.g. {{trigger.data.user_id}} */
  allowTemplateValue?: boolean;
}

const entityTypeLabels: Record<EntityType, string> = {
  user: 'User',
  product: 'Product',
  contact: 'Contact',
  company: 'Company',
  edge_function: 'Edge Function',
  moodboard: 'Moodboard',
  quote: 'Quote',
  conversation: 'Conversation',
};

export function EntityPicker({
  entityType,
  value,
  onSelect,
  placeholder,
  allowTemplateValue = true,
}: EntityPickerProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<EntityResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [resolvedLabel, setResolvedLabel] = useState<string | null>(null);
  const [templateMode, setTemplateMode] = useState(false);

  // Detect if current value is a template expression
  const isTemplate = value?.startsWith('{{');

  // Resolve label for the current value
  useEffect(() => {
    if (!value || isTemplate) {
      setResolvedLabel(null);
      return;
    }
    let cancelled = false;
    resolveEntityLabel(entityType, value).then((label) => {
      if (!cancelled) setResolvedLabel(label);
    });
    return () => { cancelled = true; };
  }, [value, entityType, isTemplate]);

  // Debounced search
  useEffect(() => {
    if (!open) return;
    if (search.length < 2) {
      setResults([]);
      return;
    }

    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        const res = await searchEntities(entityType, search);
        setResults(res);
      } catch (err) {
        console.error('Entity search failed:', err);
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [search, entityType, open]);

  const handleSelect = useCallback(
    (entity: EntityResult) => {
      onSelect(entity.id, entity.label);
      setOpen(false);
      setSearch('');
    },
    [onSelect],
  );

  const handleClear = useCallback(() => {
    onSelect('', '');
    setResolvedLabel(null);
  }, [onSelect]);

  const displayLabel = entityTypeLabels[entityType] || 'Entity';
  const defaultPlaceholder = placeholder || `Search ${displayLabel.toLowerCase()}s...`;

  // Template mode: raw text input
  if (templateMode || (isTemplate && !templateMode)) {
    return (
      <div className="flex gap-1">
        <Input
          value={value || ''}
          onChange={(e) => onSelect(e.target.value, e.target.value)}
          placeholder="{{trigger.data.id}}"
          className="h-8 text-sm font-mono flex-1"
        />
        {allowTemplateValue && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 shrink-0"
                onClick={() => {
                  setTemplateMode(false);
                  if (isTemplate) onSelect('', '');
                }}
              >
                <Search className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top">
              <p className="text-xs">Switch to search picker</p>
            </TooltipContent>
          </Tooltip>
        )}
      </div>
    );
  }

  // Picker mode
  return (
    <div className="flex gap-1">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="h-8 text-sm w-full justify-between font-normal"
          >
            {value ? (
              <span className="truncate">{resolvedLabel || value}</span>
            ) : (
              <span className="text-muted-foreground truncate">{defaultPlaceholder}</span>
            )}
            <Search className="ml-1 h-3.5 w-3.5 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[320px] p-0" align="start">
          <Command shouldFilter={false}>
            <CommandInput
              placeholder={`Search ${displayLabel.toLowerCase()}s...`}
              value={search}
              onValueChange={setSearch}
            />
            <CommandList>
              {loading && (
                <div className="py-4 text-center text-xs text-muted-foreground">
                  Searching...
                </div>
              )}
              {!loading && search.length < 2 && (
                <CommandEmpty>Type at least 2 characters</CommandEmpty>
              )}
              {!loading && search.length >= 2 && results.length === 0 && (
                <CommandEmpty>No {displayLabel.toLowerCase()}s found</CommandEmpty>
              )}
              {!loading && results.length > 0 && (
                <CommandGroup>
                  {results.map((entity) => (
                    <CommandItem
                      key={entity.id}
                      value={entity.id}
                      onSelect={() => handleSelect(entity)}
                      className="cursor-pointer"
                    >
                      <div className="flex items-center justify-between w-full gap-2">
                        <div className="flex flex-col min-w-0">
                          <span className="text-sm truncate">{entity.label}</span>
                          {entity.sublabel && (
                            <span className="text-[11px] text-muted-foreground truncate">
                              {entity.sublabel}
                            </span>
                          )}
                        </div>
                        {value === entity.id && (
                          <Check className="h-3.5 w-3.5 text-primary shrink-0" />
                        )}
                      </div>
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {value && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0"
              onClick={handleClear}
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top">
            <p className="text-xs">Clear selection</p>
          </TooltipContent>
        </Tooltip>
      )}

      {allowTemplateValue && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0"
              onClick={() => setTemplateMode(true)}
            >
              <Code2 className="h-3.5 w-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top">
            <p className="text-xs">Use template expression</p>
          </TooltipContent>
        </Tooltip>
      )}
    </div>
  );
}
