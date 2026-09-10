import React from 'react';

import { cn } from '@/lib/utils';

export interface HubSegment<T extends string> {
  value: T;
  label: React.ReactNode;
  /** Native tooltip. Use it when the label has to be short but the meaning is not obvious. */
  title?: string;
}

interface HubSegmentedProps<T extends string> {
  /** `T` is inferred from HERE — the one place that always states the real union. */
  options: readonly HubSegment<T>[];
  value: NoInfer<T>;
  /**
   * `NoInfer` because the natural call is `onChange={setView}`, and a `Dispatch<SetStateAction<T>>`
   * takes `T | ((prev: T) => T)`. Left as an inference site that widens `T` to `string`, so the
   * options a caller had just spelled out stopped constraining anything and the setter no longer
   * type-checked against its own state.
   */
  onChange: (value: NoInfer<T>) => void;
  /** Required: a group of unlabelled buttons tells a screen reader nothing about what it picks. */
  'aria-label': string;
  className?: string;
}

/** SEGMENTED CONTROL — "which of these two or three am I looking at". */
export function HubSegmented<T extends string>({
  options,
  value,
  onChange,
  'aria-label': ariaLabel,
  className,
}: HubSegmentedProps<T>) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className={cn(
        'inline-flex items-center gap-0.5 rounded-sm border border-hairline bg-surface-sunken p-0.5 text-xs',
        className,
      )}
    >
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            aria-pressed={active}
            title={opt.title}
            onClick={() => onChange(opt.value)}
            className={cn(
              'rounded-xs px-3 py-1 font-medium transition-colors',
              active
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
