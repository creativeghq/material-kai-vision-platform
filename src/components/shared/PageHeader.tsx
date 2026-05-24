import React from 'react';

interface PageHeaderProps {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  subtitle?: string;
  /** Custom action buttons rendered on the right of the title row (e.g. "New MoodBoard") */
  actions?: React.ReactNode;
  /** Extra content rendered below the title row (e.g. search/filter bar) */
  children?: React.ReactNode;
}

export function PageHeader({ icon: Icon, title, subtitle, actions, children }: PageHeaderProps) {
  return (
    <section className="px-4 sm:px-6 py-3 sm:py-4 border-b border-white/8">
      <div className="flex items-center justify-between gap-4">
        {/* Left: page icon + title */}
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-primary/15 flex items-center justify-center shrink-0">
            <Icon className="h-4.5 w-4.5 text-primary" />
          </div>
          <div className="min-w-0">
            <h1 className="text-lg font-light text-foreground tracking-tight">{title}</h1>
            {subtitle && (
              <p className="text-xs text-muted-foreground mt-0.5 hidden sm:block">{subtitle}</p>
            )}
          </div>
        </div>

        {/* Right: page-scoped action buttons only — profile + notifications live in the top nav */}
        {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
      </div>

      {children && <div className="mt-3">{children}</div>}
    </section>
  );
}
