import * as React from 'react';

import { cn } from '@/lib/utils';

/**
 * TEXT FIELD. 36px tall, 4px radius, opaque card fill, hairline border,
 * accent border + a 3px accent halo on focus.
 *
 * The old field was a translucent white film — `bg-white/5` over a
 * `border-white/12` edge. Two consequences: on the light theme a literal white
 * overlay is invisible, so the field had no discernible edge at all; and `/12`
 * is not a step in Tailwind's opacity scale, so that border utility compiled to
 * nothing and the dark theme had no edge either. Fields are painted from tokens
 * now, so they are correct in both themes and both accents by construction.
 *
 * Height, radius, padding and focus treatment are IDENTICAL here, in
 * `SelectTrigger` and in `Textarea`. A form row that mixes a 40px input with a
 * 36px select is the most common way a settings page looks broken.
 */
const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<'input'>>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
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
