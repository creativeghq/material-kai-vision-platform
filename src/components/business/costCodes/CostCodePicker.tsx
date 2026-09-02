/**
 * The one cost code picker. Every surface that codes money uses this — a supplier bill, an
 * expense, a time entry, a quote line, an order line, a project task, a snag.
 *
 * Two things it deliberately does that a plain <Select> would not:
 *
 *  • An empty list says WHY it is empty and where to fix it, rather than rendering an empty menu.
 *    A picker with no options looks identical to a feature that is broken, and the workspace that
 *    has not installed a library yet is exactly the one that needs telling.
 *  • A failed load is reported, never rendered as "no cost codes". The uncoded bucket in the cost
 *    report is real money; a picker that quietly offers nothing is how it gets there.
 */
import React from 'react';
import { Loader2, AlertTriangle } from 'lucide-react';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/core/ui/select';
import { useCostCodes } from '@/hooks/useCostCodes';
import { costCodeLabel } from '@/services/costCodesService';

/** Radix Select cannot hold an empty-string value, so the "none" choice needs a sentinel. */
const NONE = '__none__';

export interface CostCodePickerProps {
  value: string | null | undefined;
  onChange: (costCodeId: string | null) => void;
  disabled?: boolean;
  className?: string;
  /** Shown when nothing is picked. */
  placeholder?: string;
  /** Rendered instead of the control when the workspace has no codes yet. */
  emptyHint?: React.ReactNode;
}

export const CostCodePicker: React.FC<CostCodePickerProps> = ({
  value,
  onChange,
  disabled,
  className,
  placeholder = 'No cost code',
  emptyHint,
}) => {
  const { ordered, loading, error } = useCostCodes();

  if (loading) {
    return (
      <div className={`flex h-9 items-center gap-2 px-2 text-xs text-muted-foreground ${className ?? ''}`}>
        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
        Loading cost codes…
      </div>
    );
  }

  if (error) {
    return (
      <div className={`flex h-9 items-center gap-2 px-2 text-xs text-destructive ${className ?? ''}`}>
        <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
        Cost codes could not be loaded
      </div>
    );
  }

  if (ordered.length === 0) {
    return (
      <p className={`text-xs text-muted-foreground ${className ?? ''}`}>
        {emptyHint ?? 'No cost codes yet — an owner or admin can add them in Finance → Settings.'}
      </p>
    );
  }

  return (
    <Select
      value={value ?? NONE}
      onValueChange={(v) => onChange(v === NONE ? null : v)}
      disabled={disabled}
    >
      <SelectTrigger className={className}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NONE}>{placeholder}</SelectItem>
        {ordered.map(({ code, depth }) => (
          <SelectItem key={code.id} value={code.id}>
            {/* Indent with a real space run rather than padding: Radix renders the selected item's
                text in the trigger too, where a padded child would look mis-aligned. */}
            <span style={{ paddingLeft: `${depth * 12}px` }}>{costCodeLabel(code)}</span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
};
