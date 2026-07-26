import React from 'react';
import { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SectionHeaderProps {
  icon?: LucideIcon;
  title: string;
  subtitle?: React.ReactNode;
  /** Right-aligned actions (buttons, filters). */
  actions?: React.ReactNode;
  className?: string;
}

/**
 * Canonical secondary / content header — the single lead-in for a tab or a page section,
 * sitting BELOW the gradient `PageHeader`. This is the "section" tier of the header scale:
 *
 *   page 24px (PageHeader gradient bar)  ›  SECTION 18px (this)  ›  card 16px (CardTitle)
 *
 * Use it as the first element of every tab / settings pane / page section so every view
 * opens the same way. Do NOT hand-roll `h1/h2/h3` section headers — they drifted to a
 * dozen different sizes/weights, which is exactly what this replaces.
 */
export const SectionHeader: React.FC<SectionHeaderProps> = ({ icon: Icon, title, subtitle, actions, className }) => (
  <div className={cn('mb-6 flex flex-wrap items-start justify-between gap-3', className)}>
    <div className="min-w-0">
      <h2 className="flex items-center gap-2 text-lg font-semibold tracking-tight">
        {Icon && <Icon className="h-5 w-5 shrink-0 text-primary" />}
        {title}
      </h2>
      {subtitle && <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{subtitle}</p>}
    </div>
    {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
  </div>
);

export default SectionHeader;
