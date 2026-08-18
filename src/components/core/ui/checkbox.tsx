import * as React from 'react';
import * as CheckboxPrimitive from '@radix-ui/react-checkbox';
import { Check, Minus } from 'lucide-react';

import { cn } from '@/lib/utils';

/**
 * CHECKBOX. 16px, 2px radius, neutral hairline at rest and accent when set.
 *
 * Two details that matter more than they look:
 *
 *  - **An unchecked box is outlined in a NEUTRAL colour, not the accent.** It
 *    used to be `border-primary`, so an untouched box was drawn in the same
 *    colour as a checked one — an empty selection column read as fully selected
 *    at a glance.
 *  - **Indeterminate gets its own glyph (a dash), not the tick.** Radix renders
 *    `Indicator` for both `checked` and `indeterminate`, so a tick with nothing
 *    else to distinguish it says "all rows selected" when the truth is "some".
 *    On a bulk action — delete, assign, export — that difference is the whole
 *    question.
 */
const Checkbox = React.forwardRef<
  React.ElementRef<typeof CheckboxPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof CheckboxPrimitive.Root>
>(({ className, ...props }, ref) => (
  <CheckboxPrimitive.Root
    ref={ref}
    className={cn(
      'peer h-4 w-4 shrink-0 rounded-xs border border-muted-foreground/60 bg-card ring-offset-background transition-colors hover:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:border-primary data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground data-[state=indeterminate]:border-primary data-[state=indeterminate]:bg-primary data-[state=indeterminate]:text-primary-foreground',
      className,
    )}
    {...props}
  >
    <CheckboxPrimitive.Indicator className="flex items-center justify-center text-current">
      {props.checked === 'indeterminate' ? (
        <Minus className="h-3 w-3" strokeWidth={3} />
      ) : (
        <Check className="h-3 w-3" strokeWidth={3} />
      )}
    </CheckboxPrimitive.Indicator>
  </CheckboxPrimitive.Root>
));
Checkbox.displayName = CheckboxPrimitive.Root.displayName;

export { Checkbox };
