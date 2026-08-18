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
 * sitting BELOW the `PageHeader`. This is the "section" tier of the type scale:
 *
 *   page 20px (PageHeader, serif)  ›  SECTION 16px (this)  ›  panel 14px (CardTitle)
 *
 * Each tier is one step down and each is a different JOB (you are here / this region /
 * this box). Use it as the first element of every tab, settings pane and page section so
 * every view opens the same way. Do NOT hand-roll `h1/h2/h3` section headers — they
 * drifted to a dozen different sizes and weights, which is what this replaces.
 */
export const SectionHeader: React.FC<SectionHeaderProps> = ({ icon: Icon, title, subtitle, actions, className }) => (
  <div className={cn('mb-4 flex flex-wrap items-start justify-between gap-3', className)}>
    <div className="min-w-0">
      <h2 className="flex items-center gap-2 font-sans text-base font-semibold tracking-tight">
        {Icon && <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />}
        {title}
      </h2>
      {subtitle && <p className="mt-0.5 max-w-2xl text-xs text-muted-foreground">{subtitle}</p>}
    </div>
    {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
  </div>
);

export default SectionHeader;
