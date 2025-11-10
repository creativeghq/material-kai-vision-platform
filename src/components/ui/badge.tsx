import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
  {
    variants: {
      variant: {
        default:
          'border-transparent bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm',
        secondary:
          'border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/90 shadow-sm',
        destructive:
          'border-transparent bg-destructive text-destructive-foreground hover:bg-destructive/90 shadow-sm',
        outline: 'text-foreground border-border hover:bg-accent',
        success:
          'badge-success border-transparent',
        warning:
          'badge-warning border-transparent',
        error:
          'badge-error border-transparent',
        info:
          'badge-info border-transparent',
        high:
          'border-transparent bg-[hsl(var(--badge-high))] text-[hsl(var(--badge-high-fg))]',
        medium:
          'border-transparent bg-[hsl(var(--badge-medium))] text-[hsl(var(--badge-medium-fg))]',
        low:
          'border-transparent bg-[hsl(var(--badge-low))] text-[hsl(var(--badge-low-fg))]',
        neutral:
          'badge-neutral border-transparent',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
