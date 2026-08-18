import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

/**
 * TAG — a squared, low-saturation label. Not a pill, and not a solid block of
 * brand colour.
 *
 * Two rules this encodes:
 *
 *  - **Shape separates label from action.** Buttons are squared with a 4px
 *    radius; a tag is squared with 2px. When both were pills, a toolbar of
 *    chips and buttons had no readable grammar.
 *  - **A status is tinted, not filled.** A saturated fill has the visual weight
 *    of a primary button, so a table with a status column read as a table with
 *    a button in every row. Semantic variants are a pale tint + a deep text
 *    colour + a matching hairline, which is legible at 11px and still lets the
 *    row's own text stay the loudest thing in the row.
 *
 * `default` (solid accent) survives for the one case that wants weight: a count
 * badge on a nav item.
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
