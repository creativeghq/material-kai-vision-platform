import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

/**
 * TAG — a squared, low-saturation label. Not a pill, and not a solid block of
 * brand colour.
 */
const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded-xs border px-1.5 py-0.5 text-xs font-semibold leading-4 transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1',
  {
    variants: {
      variant: {
        default:
          'border-transparent bg-primary text-primary-foreground',
        secondary:
          'border-hairline bg-surface-sunken text-foreground',
        destructive:
          'border-transparent bg-destructive text-destructive-foreground',
        outline: 'border-hairline bg-transparent text-foreground',
        success:
          'border-[hsl(var(--success)/0.25)] bg-[hsl(var(--success-bg))] text-[hsl(var(--success))]',
        warning:
          'border-[hsl(var(--warning)/0.25)] bg-[hsl(var(--warning-bg))] text-[hsl(var(--warning))]',
        error:
          'border-[hsl(var(--error)/0.25)] bg-[hsl(var(--error-bg))] text-[hsl(var(--error))]',
        info:
          'border-[hsl(var(--info)/0.25)] bg-[hsl(var(--info-bg))] text-[hsl(var(--info))]',
        high:
          'border-[hsl(var(--error)/0.25)] bg-[hsl(var(--error-bg))] text-[hsl(var(--error))]',
        medium:
          'border-[hsl(var(--warning)/0.25)] bg-[hsl(var(--warning-bg))] text-[hsl(var(--warning))]',
        low:
          'border-hairline bg-surface-sunken text-muted-foreground',
        neutral:
          'border-hairline bg-surface-sunken text-muted-foreground',
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
