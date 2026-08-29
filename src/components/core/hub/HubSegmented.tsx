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

/**
 * SEGMENTED CONTROL — "which of these two or three am I looking at".
 *
 * A switch between two views of the SAME list: credit notes issued to customers vs received
 * from suppliers, all sourcing vs mine, EN vs GR. Not a tab (a tab changes the section of the
 * page), not a filter chip (a chip narrows a set), and not a button (nothing happens when you
 * press it except that the answer to a question changes).
 *
 * WHY THIS IS A COMPONENT
 * -----------------------
 * It was hand-rolled four times — Documents, Business identity, GSC breakdown, Sourcing — and
 * every copy was `rounded-full`, which the design system reserves for avatars, dots and status
 * pips. Worse, the four tracks disagreed (`border-border/60`, `bg-muted`, `border-border` +
 * `overflow-hidden`) and NONE of them gave the selected segment a radius, so a square accent
 * block sat inside a fully-round outline and the two edges visibly fought. That is what got
 * reported, and it was reported about one of the four.
 *
 * THE SHAPE
 * ---------
 *  - **Squared** (`rounded-sm` track, `rounded-xs` segment), like every other control here. A
 *    pill is the silhouette of nothing else in this platform, which is exactly why it stood out.
 *  - **The segment's radius matches the track's**, inset by the track's own 2px padding. This is
 *    the part all four copies missed.
 *  - **A sunken track**, so the control reads as a groove with something sitting in it rather
 *    than as two buttons that happen to touch.
 *  - **The selected segment keeps the accent fill** the four copies used. It is the clearest
 *    answer to "which one am I on", and this control is never the page's primary action.
 */
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
