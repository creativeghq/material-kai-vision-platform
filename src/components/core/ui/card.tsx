import * as React from 'react';

import { cn } from '@/lib/utils';

/**
 * PANEL — the container surface of the design system.
 *
 * Opaque fill, one hairline, 6px radius, no shadow at rest. The previous card
 * was a glass panel (translucent white film + 12px backdrop blur + a floating
 * shadow + a 2px hover lift). Three reasons that is gone:
 *
 *  - A translucent panel has no fixed contrast ratio. The legibility of a table
 *    row inside it depended on whatever happened to be scrolling underneath,
 *    so the same content was compliant in one scroll position and marginal in
 *    another — and no static audit can catch that.
 *  - `backdrop-filter` forces the compositor to re-sample everything behind the
 *    element. On a dashboard with a dozen panels that is a dozen live blurs.
 *  - The 2px hover lift meant passing the mouse across a grid rippled it.
 *
 * A panel is a quiet frame; the data inside it is the thing worth looking at.
 * For a panel that IS a click target, add `panel-interactive` (or wrap it in an
 * <a>/<button> — the CSS picks that up) to get a border+fill hover, still with
 * no movement.
 */
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
