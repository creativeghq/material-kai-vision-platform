import * as React from 'react';

import { cn } from '@/lib/utils';

/** PANEL — the container surface of the design system. */
const Card = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      'rounded-md border border-hairline bg-card text-card-foreground',
      className,
    )}
    {...props}
  />
));
Card.displayName = 'Card';

/**
 * Header bar of a panel: title/description on the left, actions on the right.
 * Laid out as a row so `<CardAction>` needs no absolute positioning, and kept
 * flex-col-friendly for the many existing call sites that pass stacked children.
 */
const CardHeader = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      'flex flex-col gap-1 px-4 py-3 border-b border-hairline',
      className,
    )}
    {...props}
  />
));
CardHeader.displayName = 'CardHeader';

/**
 * Panel title. 14px semibold sans — deliberately NOT the display serif and
 * deliberately not large. A page has one title (PageHeader, 20px, serif); a
 * panel header is a label for a region, and eight serif labels down a dashboard
 * read as eight competing page titles.
 */
const CardTitle = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
  <h3
    ref={ref}
    className={cn(
      'font-sans text-sm font-semibold leading-tight tracking-tight text-foreground',
      className,
    )}
    {...props}
  />
));
CardTitle.displayName = 'CardTitle';

const CardDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <p
    ref={ref}
    className={cn('text-xs text-muted-foreground', className)}
    {...props}
  />
));
CardDescription.displayName = 'CardDescription';

const CardContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn('p-4', className)} {...props} />
));
CardContent.displayName = 'CardContent';

/** Footer bar — sunken so it reads as chrome (pagination, totals, bulk actions). */
const CardFooter = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      'flex items-center gap-2 px-4 py-3 border-t border-hairline',
      className,
    )}
    {...props}
  />
));
CardFooter.displayName = 'CardFooter';

export {
  Card,
  CardHeader,
  CardFooter,
  CardTitle,
  CardDescription,
  CardContent,
};
