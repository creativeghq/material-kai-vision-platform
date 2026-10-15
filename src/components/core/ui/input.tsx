import * as React from 'react';

import { cn } from '@/lib/utils';

/**
 * TEXT FIELD. 36px tall, 4px radius, opaque card fill, hairline border,
 * accent border + a 3px accent halo on focus.
 */
const PICKER_TYPES = new Set(['date', 'datetime-local', 'month', 'time', 'week']);

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<'input'>>(
  ({ className, type, onClick, ...props }, ref) => {
    const picker = !!type && PICKER_TYPES.has(type);
    return (
      <input
        type={type}
        onClick={(e) => {
          onClick?.(e);
          // The whole field opens the calendar, not only the small icon at its edge.
          if (picker && !e.defaultPrevented && !props.readOnly && !props.disabled) {
            try { e.currentTarget.showPicker?.(); } catch { /* not user-activated / unsupported */ }
          }
        }}
        className={cn(
          picker && 'cursor-pointer',
          'flex h-9 w-full rounded-sm border border-hairline bg-card px-2.5 py-1 text-sm text-foreground transition-colors',
          'file:border-0 file:bg-transparent file:text-sm file:font-semibold file:text-foreground',
          'placeholder:text-muted-foreground',
          'hover:border-muted-foreground/50',
          'focus-visible:border-primary focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-primary/20',
          'disabled:cursor-not-allowed disabled:opacity-50',
          className,
        )}
        ref={ref}
        {...props}
      />
    );
  },
);
Input.displayName = 'Input';

export { Input };
