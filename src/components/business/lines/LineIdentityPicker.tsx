/**
 * Which variant is this line? (#347 phase 5.2)
 *
 * One picker, used by the order line AND the quote line, because they answer the same question
 * and the moment they answer it differently the platform has a fifth vocabulary for "which one".
 *
 * The fields are whatever the registry calls identity for this product's category — never a
 * hardcoded size/colour pair. That pair is what the quote line carried before, which is exactly
 * why an order could not record a finish, a wood type, or a bowl shape.
 *
 * It renders as a single inline control rather than a column per field: a tiles product has
 * 22 identity fields today, and a table row cannot hold 22 selects. The resolver already
 * withholds fields with only one possible value, so what opens here is the set of REAL choices.
 */
import React, { useEffect, useState } from 'react';
import { ChevronDown, PackageCheck } from 'lucide-react';

import { Button } from '@/components/core/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/core/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/core/ui/select';
import { lineIdentityService, type LineIdentityOption } from '@/services/lineIdentityService';

export interface LineIdentityPickerProps {
  productId?: string | null;
  /** The line's current `selected_attributes`. */
  value: Record<string, string>;
  /**
   * Receives the full attribute map AND the two projected columns together — they are derived
   * from one another and must be written in the same update, or the line's label and its
   * attributes drift apart.
   */
  onChange: (next: {
    selected_attributes: Record<string, string>;
    selected_size: string | null;
    selected_color: string | null;
  }) => void;
  disabled?: boolean;
  className?: string;
}

/** Sentinel for "no choice made" — Radix Select cannot hold an empty string as a value. */
const NONE = '__none__';

export const LineIdentityPicker: React.FC<LineIdentityPickerProps> = ({
  productId, value, onChange, disabled, className,
}) => {
  const [opts, setOpts] = useState<LineIdentityOption[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!productId) { setOpts([]); return; }
    setLoading(true);
    lineIdentityService.optionsFor(productId)
      .then((r) => { if (!cancelled) setOpts(r); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [productId]);

  // A line with no product, or a product that offers no genuine choice, gets no control at all —
  // an empty popover is worse than nothing. An already-chosen value still shows, so a selection
  // made when the catalogue was richer never becomes invisible.
  const chosen = Object.entries(value ?? {}).filter(([, v]) => v && v.trim());
  if (!productId || (opts.length === 0 && chosen.length === 0)) return null;

  const set = (field: string, raw: string) => {
    const next = { ...(value ?? {}) };
    if (raw === NONE) delete next[field];
    else next[field] = raw;
    onChange({ selected_attributes: next, ...lineIdentityService.project(next) });
  };

  const summary = chosen.length ? chosen.map(([, v]) => v).join(' · ') : 'Choose variant';

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={disabled || loading}
          className={`h-7 px-2 text-xs font-normal ${chosen.length ? '' : 'text-muted-foreground'} ${className ?? ''}`}
          title="Which variant is this line?"
        >
          <span className="truncate max-w-[14rem]">{summary}</span>
          <ChevronDown className="h-3 w-3 ml-1 shrink-0" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-3 space-y-3">
        <div className="text-xs font-medium">Variant</div>
        {opts.length === 0 && (
          <p className="text-xs text-muted-foreground">
            This product offers no alternatives to choose from.
          </p>
        )}
        {opts.map((o) => {
          const ranked = lineIdentityService.rank(o);
          const inStock = new Set(o.stocked ?? []);
          return (
            <div key={o.field_name} className="space-y-1">
              <label className="text-xs text-muted-foreground">{o.label}</label>
              <Select value={value?.[o.field_name] ?? NONE} onValueChange={(v) => set(o.field_name, v)} disabled={disabled}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE} className="text-xs text-muted-foreground">—</SelectItem>
                  {ranked.map((v) => (
                    <SelectItem key={v} value={v} className="text-xs">
                      <span className="flex items-center gap-1.5">
                        {v}
                        {/* Stocked sizes rank first and say so — promising a size that is not on
                            the shelf is the mistake this ordering exists to prevent. */}
                        {inStock.has(v) && <PackageCheck className="h-3 w-3 text-success" aria-label="in stock" />}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          );
        })}
      </PopoverContent>
    </Popover>
  );
};
