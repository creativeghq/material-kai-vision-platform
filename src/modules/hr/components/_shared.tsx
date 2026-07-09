// Shared, design-system-compliant building blocks for the HR sections.
import React from 'react';
import type { LucideIcon } from 'lucide-react';

/** Stat tile — a glass dashboard-card div (NOT a shadcn Card, which kills the glass effect). */
export function HrStat({ icon: Icon, label, value, hint }: { icon?: LucideIcon; label: string; value: React.ReactNode; hint?: string }) {
  return (
    <div className="dashboard-card rounded-2xl border-0 shadow-sm p-5">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">{label}</span>
        {Icon && <Icon className="h-4 w-4 text-primary" />}
      </div>
      <div className="mt-2 text-2xl font-semibold tracking-tight">{value}</div>
      {hint && <div className="mt-1 text-xs text-muted-foreground">{hint}</div>}
    </div>
  );
}

/** Section header row: title (+ optional subtitle) on the left, actions on the right. */
export function SectionHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2 flex-wrap">
      <div>
        <h2 className="text-base font-display font-semibold">{title}</h2>
        {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

export function EmptyState({ icon: Icon, title, hint }: { icon?: LucideIcon; title: string; hint?: string }) {
  return (
    <div className="py-12 text-center text-muted-foreground">
      {Icon && <Icon className="h-8 w-8 mx-auto mb-2 opacity-40" />}
      <p className="text-sm font-medium">{title}</p>
      {hint && <p className="text-xs mt-1">{hint}</p>}
    </div>
  );
}
