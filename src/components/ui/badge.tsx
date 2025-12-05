import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
  {
    variants: {
      variant: {
        default:
          'bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm border-none',
        secondary:
          'bg-secondary text-secondary-foreground hover:bg-secondary/90 shadow-sm border-none',
        destructive:
          'bg-destructive text-destructive-foreground hover:bg-destructive/90 shadow-sm border-none',
        outline: 'text-foreground hover:bg-accent shadow-sm border-none',
        success:
          'badge-success border-none',
        warning:
          'badge-warning border-none',
        error:
          'badge-error border-none',
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
