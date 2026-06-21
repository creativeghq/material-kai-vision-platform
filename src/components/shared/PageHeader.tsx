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
      {/* On mobile the actions drop to their own row (and may wrap) so a wide
          primary button is never clipped off the right edge; from sm up it sits
          inline on the right. The title truncates rather than pushing actions
          off-screen. */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        {/* Left: page icon + title */}
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-lg bg-primary/15 flex items-center justify-center shrink-0">
            <Icon className="h-5 w-5 text-primary" />
          </div>
          <div className="min-w-0">
            <h1 className="text-lg font-light text-foreground tracking-tight truncate">{title}</h1>
            {subtitle && (
              <p className="text-xs text-muted-foreground mt-0.5 hidden sm:block">{subtitle}</p>
            )}
          </div>
        </div>

        {/* Right: page-scoped action buttons only — profile + notifications live in
            the top nav. Always allowed to wrap so action-heavy headers (e.g. a
            quote with submit / share / email / download) never overflow at narrow
            and mid widths; on wide screens they stay on one line and align right. */}
        {actions && (
          <div className="flex items-center gap-2 flex-wrap sm:justify-end">{actions}</div>
        )}
      </div>

      {children && <div className="mt-3">{children}</div>}
    </section>
  );
}
