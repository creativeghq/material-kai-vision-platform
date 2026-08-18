import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

/**
 * BUTTON — rectangular, 4px radius, flat fill, no lift.
 *
 * The previous button was a fully-rounded pill that rose 2px and grew its
 * shadow on hover. Two problems, in order of how much they cost:
 *
 *  1. A pill is the same silhouette as a status chip, a filter chip and an
 *     active tab — all of which this platform also rendered as pills. In a
 *     toolbar you could not tell an action from a label without reading it.
 *     Squaring the action and squaring the tag differently is what makes a
 *     toolbar scannable.
 *  2. `hover:-translate-y-0.5` moves the target out from under the pointer,
 *     and in a row of buttons it shoves the row.
 *
 * Hierarchy is carried by FILL, not by size: `default` (solid accent) is the
 * one primary action on a screen; `secondary` (accent outline) is its partner;
 * `outline` (neutral hairline) is everything else; `ghost` is icon/table-row
 * chrome. If a screen has two solid buttons, one of them is wrong.
 */
const buttonVariants = cva(
  'inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-sm text-sm font-semibold ring-offset-background transition-colors duration-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default:
          'bg-primary text-primary-foreground hover:bg-primary/90 active:bg-primary/80',
        destructive:
          'bg-destructive text-destructive-foreground hover:bg-destructive/90 active:bg-destructive/80',
        // Accent outline — the canonical "second action" next to a primary.
        secondary:
          'bg-transparent text-primary border border-primary hover:bg-primary/[0.08] active:bg-primary/[0.14]',
        // Neutral outline — tertiary actions, toolbars, filter triggers.
        outline:
          'bg-card text-foreground border border-hairline hover:bg-surface-hover hover:border-muted-foreground/50',
        ghost:
          'bg-transparent text-muted-foreground hover:bg-surface-hover hover:text-foreground',
        link: 'text-primary underline-offset-2 hover:underline p-0 h-auto',
      },
      size: {
        // 36px default. The old default was 44px, which is a touch target
        // standing in for a desktop control: it set the height of every table
        // row that carried an action and every toolbar it appeared in. 36px is
        // dense enough for a data UI and still comfortably tappable; `sm` (32px)
        // is for inside a table row, `lg` (40px) for a page's single hero CTA.
        default: 'h-9 px-3.5',
        sm: 'h-8 px-2.5 text-xs',
        lg: 'h-10 px-5',
        icon: 'h-9 w-9 p-0',
        'icon-sm': 'h-8 w-8 p-0',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  },
);
Button.displayName = 'Button';

export { Button, buttonVariants };
