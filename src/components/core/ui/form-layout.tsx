import * as React from 'react';

import { cn } from '@/lib/utils';
import { Label } from '@/components/core/ui/label';

/** A titled group of fields. A form with eight or more fields is split into these. */
const FormSection = ({
  title,
  description,
  className,
  children,
}: {
  title: string;
  description?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) => (
  <section className={cn('space-y-2', className)}>
    <div className="space-y-0.5">
      <h3 className="text-xs font-semibold text-muted-foreground">{title}</h3>
      {description && <p className="text-xs text-muted-foreground">{description}</p>}
    </div>
    {children}
  </section>
);

const GRID_COLS = {
  1: 'grid gap-3',
  2: 'grid gap-3 sm:grid-cols-2',
  3: 'grid gap-3 sm:grid-cols-3',
  4: 'grid gap-3 sm:grid-cols-2 md:grid-cols-4',
  6: 'grid gap-3 sm:grid-cols-6',
} as const;

const FormGrid = ({
  cols = 2,
  className,
  children,
}: {
  cols?: keyof typeof GRID_COLS;
  className?: string;
  children: React.ReactNode;
}) => <div className={cn(GRID_COLS[cols], className)}>{children}</div>;

/** Label above control, optional hint below. "Optional" belongs in the label, never the placeholder. */
const FormField = ({
  label,
  htmlFor,
  hint,
  optional,
  className,
  children,
}: {
  label: React.ReactNode;
  htmlFor?: string;
  hint?: React.ReactNode;
  optional?: boolean;
  className?: string;
  children: React.ReactNode;
}) => (
  <div className={cn('min-w-0 space-y-1', className)}>
    <Label htmlFor={htmlFor} className="text-xs">
      {label}
      {optional && <span className="ml-1 font-normal text-muted-foreground">(optional)</span>}
    </Label>
    {children}
    {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
  </div>
);

export { FormSection, FormGrid, FormField };
