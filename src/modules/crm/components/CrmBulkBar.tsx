import React, { useState } from 'react';
import { X, Trash2, Loader2, Check } from 'lucide-react';

import { Button } from '@/components/core/ui/button';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/core/ui/select';
import type { Option } from '../crmConstants';

export interface BulkSelectAction {
  /** Stable key passed back to onApply. */
  key: string;
  /** Button label, e.g. "Assign role". */
  label: string;
  /** Placeholder for the value picker. */
  placeholder: string;
  options: Option[];
}

interface Props {
  count: number;
  actions: BulkSelectAction[];
  /** Apply a value for an action across the whole selection. Should resolve when done. */
  onApply: (actionKey: string, value: string) => Promise<void>;
  /** Delete the whole selection. */
  onDelete: () => Promise<void>;
  onClear: () => void;
  busy?: boolean;
}

/**
 * Sticky bulk-action toolbar shown when ≥1 row is selected. Picking an action reveals
 * an inline value selector; Apply runs it across the selection. Delete confirms first.
 */
export const CrmBulkBar: React.FC<Props> = ({ count, actions, onApply, onDelete, onClear, busy }) => {
  const [active, setActive] = useState<BulkSelectAction | null>(null);
  const [value, setValue] = useState('');

  const startAction = (a: BulkSelectAction) => {
    setActive((cur) => (cur?.key === a.key ? null : a));
    setValue('');
  };

  const apply = async () => {
    if (!active || !value) return;
    await onApply(active.key, value);
    setActive(null);
    setValue('');
  };

  const confirmDelete = async () => {
    if (!window.confirm(`Delete ${count} selected ${count === 1 ? 'record' : 'records'}? This cannot be undone.`)) return;
    await onDelete();
  };

  return (
    <div className="sticky top-2 z-10 rounded-lg border bg-card/95 backdrop-blur px-3 py-2 shadow-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium px-1">{count} selected</span>
        <div className="h-5 w-px bg-border mx-1" />
        {actions.map((a) => (
          <Button
            key={a.key}
            variant={active?.key === a.key ? 'secondary' : 'outline'}
            size="sm"
            disabled={busy}
            onClick={() => startAction(a)}
          >
            {a.label}
          </Button>
        ))}
        <Button variant="outline" size="sm" disabled={busy} onClick={confirmDelete} className="text-red-500">
          <Trash2 className="h-4 w-4 mr-1" /> Delete
        </Button>
        <div className="flex-1" />
        {busy && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
        <Button variant="ghost" size="sm" onClick={onClear} disabled={busy} title="Clear selection">
          <X className="h-4 w-4" />
        </Button>
      </div>

      {active && (
        <div className="flex flex-wrap items-center gap-2 mt-2 pt-2 border-t">
          <span className="text-sm text-muted-foreground">{active.label}:</span>
          <Select value={value} onValueChange={setValue}>
            <SelectTrigger className="h-8 w-56">
              <SelectValue placeholder={active.placeholder} />
            </SelectTrigger>
            <SelectContent>
              {active.options.map((o) => (
                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button size="sm" disabled={!value || busy} onClick={apply}>
            <Check className="h-4 w-4 mr-1" /> Apply to {count}
          </Button>
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => setActive(null)}>Cancel</Button>
        </div>
      )}
    </div>
  );
};

export default CrmBulkBar;
