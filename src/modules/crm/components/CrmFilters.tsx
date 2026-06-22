import React from 'react';
import { Search, Plus, FilterX } from 'lucide-react';

import { Input } from '@/components/core/ui/input';
import { Button } from '@/components/core/ui/button';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/core/ui/select';
import { ANY, type Option } from '../crmConstants';

export interface FilterDef {
  key: string;
  /** Shown as the "Any …" placeholder, e.g. "role" → "Any role". */
  label: string;
  value: string;
  options: Option[];
  onChange: (value: string) => void;
}

interface Props {
  search: string;
  onSearch: (value: string) => void;
  searchPlaceholder?: string;
  filters: FilterDef[];
  onAdd?: () => void;
  addLabel?: string;
}

/** Compact CRM list toolbar: small search + inline filter dropdowns + an Add button. */
export const CrmFilters: React.FC<Props> = ({
  search, onSearch, searchPlaceholder = 'Search…', filters, onAdd, addLabel,
}) => {
  const anyActive = filters.some((f) => f.value && f.value !== ANY);
  const clearAll = () => filters.forEach((f) => f.onChange(ANY));

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative w-full sm:w-56">
        <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder={searchPlaceholder}
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          className="pl-8 h-9"
        />
      </div>

      {filters.map((f) => (
        <Select key={f.key} value={f.value || ANY} onValueChange={f.onChange}>
          <SelectTrigger className="h-9 w-auto min-w-[8rem] gap-1">
            <SelectValue placeholder={`Any ${f.label}`} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ANY}>Any {f.label}</SelectItem>
            {f.options.map((o) => (
              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      ))}

      {anyActive && (
        <Button variant="ghost" size="sm" onClick={clearAll} title="Clear filters">
          <FilterX className="h-4 w-4" />
        </Button>
      )}

      <div className="flex-1" />

      {onAdd && (
        <Button onClick={onAdd} size="sm">
          <Plus className="h-4 w-4 mr-2" /> {addLabel || 'Add'}
        </Button>
      )}
    </div>
  );
};

export default CrmFilters;
