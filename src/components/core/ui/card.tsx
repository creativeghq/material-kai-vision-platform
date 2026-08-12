import * as React from 'react';

import { cn } from '@/lib/utils';

/** Elevation is the hierarchy the old system lacked: every surface was the same
 *  glass panel, so a grouping container, a single-idea card and a hero all read
 *  identically. `glass` stays the default so the 307 existing call sites are
 *  unchanged in kind — only sharpened. */
export type CardElevation = 'glass' | 'flat' | 'raised' | 'float';

const ELEVATION_SHADOW: Record<CardElevation, string> = {
  glass: 'var(--glass-shadow), inset 0 1px 0 rgba(255,255,255,0.045)',
  flat: 'var(--elev-flat)',
  raised: 'var(--elev-raise)',
  float: 'var(--elev-float)',
};

const Card = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & { elevation?: CardElevation }
>(({ className, style, elevation = 'glass', ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      'gradient-border rounded-[1.25rem] transition-all duration-300',
      className,
    )}
    style={{
      background: elevation === 'glass' ? 'var(--glass-background)' : 'hsl(var(--card))',
      backdropFilter: elevation === 'glass' ? 'blur(var(--glass-blur))' : undefined,
      border: '1px solid transparent',
      boxShadow: ELEVATION_SHADOW[elevation],
      ...style,
    }}
    {...props}
  />
));
Card.displayName = 'Card';

// Canonical card header: a bordered header bar with tight vertical padding. Horizontal padding
// stays px-6 so the header's left edge aligns with CardContent's p-6. Cards that want a
// borderless header (e.g. mini KPI tiles) can override with `border-0`.
const CardHeader = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn('flex flex-col space-y-1 px-6 py-4 border-b border-border/60', className)}
    {...props}
  />
));
CardHeader.displayName = 'CardHeader';

// Canonical card title: 16px. This is THE single card-header size across the platform — do not
// pass ad-hoc text-* overrides. Page-level gradient headers (PageHeader, 24px) and the compact
// glass analytics headers (h3 text-sm) are separate, deliberately-distinct tiers.
const CardTitle = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
  <h3
    ref={ref}
    className={cn(
      'text-base font-semibold leading-none tracking-tight',
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
    className={cn('text-sm text-muted-foreground', className)}
    {...props}
  />
));
CardDescription.displayName = 'CardDescription';

// Content sits below the bordered header, so it carries its own top padding (p-6, not pt-0).
// Tables still override to p-0 for edge-to-edge rows.
const CardContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn('p-6', className)} {...props} />
));
CardContent.displayName = 'CardContent';

const CardFooter = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn('flex items-center p-6 pt-0', className)}
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
