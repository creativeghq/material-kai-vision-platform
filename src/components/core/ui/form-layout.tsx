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

/** 4 auto-fits to the CONTAINER: sm:/md: measure the window, and a dialog is narrower than its window. */
const GRID_COLS = {
  1: 'grid gap-3',
  2: 'grid gap-3 sm:grid-cols-2',
  3: 'grid gap-3 sm:grid-cols-3',
  4: 'grid gap-3 grid-cols-[repeat(auto-fit,minmax(10rem,1fr))]',
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

const OptionalTag = () => <span className="ml-1 font-normal text-muted-foreground">(optional)</span>;

/**
 * Label above control, optional hint below. Without `htmlFor`, a single child with no `id` gets a
 * generated one so the label still targets it.
 */
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
}) => {
  const generated = React.useId();
  let control = children;
  let target = htmlFor;
  if (!target && React.isValidElement<{ id?: string }>(children) && typeof children.type !== 'symbol') {
    target = children.props.id ?? generated;
    if (!children.props.id) control = React.cloneElement(children, { id: generated });
  }
  return (
    <div className={cn('min-w-0 space-y-1', className)}>
      <Label htmlFor={target} className="text-xs">
        {label}
        {optional && <OptionalTag />}
      </Label>
      {control}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
};

export { FormSection, FormGrid, FormField, OptionalTag };
