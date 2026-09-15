import React from 'react';

import { cn } from '@/lib/utils';

interface HubFieldRowProps {
  /** Help text for the ROW. A column has no such prop on purpose — see HubField. */
  hint?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

export const HubFieldRow: React.FC<HubFieldRowProps> & {
  Field: typeof HubField;
  Actions: typeof HubFieldActions;
} = ({ hint, children, className }) => (
  <div className={cn('space-y-2', className)}>
    <div className="flex flex-wrap items-end gap-2">{children}</div>
    {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
  </div>
);

interface HubFieldProps {
  label: string;
  htmlFor?: string;
  grow?: boolean;
  /** A fixed width utility — `w-28`, `w-40`. Ignored when `grow` is set. */
  width?: string;
  children: React.ReactNode;
}

/**
 * One labelled column: label, then control, then NOTHING. The row bottom-aligns, so anything
 * below the control makes this column taller and drags every sibling control down to it.
 */
const HubField: React.FC<HubFieldProps> = ({ label, htmlFor, grow, width, children }) => (
  <div className={cn('space-y-1', grow ? 'min-w-[200px] flex-1' : width ?? 'w-40')}>
    <label htmlFor={htmlFor} className="text-xs font-medium text-muted-foreground">
      {label}
    </label>
    {children}
  </div>
);

const HubFieldActions: React.FC<{ children: React.ReactNode; className?: string }> = ({
  children,
  className,
}) => <div className={cn('flex gap-2', className)}>{children}</div>;

HubFieldRow.Field = HubField;
HubFieldRow.Actions = HubFieldActions;
