import React from 'react';

interface PageHeaderProps {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  subtitle?: string;
  /** Custom action buttons rendered on the right of the title row (e.g. "New MoodBoard") */
  actions?: React.ReactNode;
  /** Extra content rendered below the title row (e.g. search/filter bar) */
  children?: React.ReactNode;
  /** Eyebrow above the title — the workspace / section this page belongs to. */
  eyebrow?: string;
}

export function PageHeader({ icon: Icon, title, subtitle, actions, children, eyebrow }: PageHeaderProps) {
  return (
    <section className="px-4 sm:px-6 pt-5 pb-4 sm:pt-7 sm:pb-5 border-b border-border/50">
      {/* On mobile the actions drop to their own row (and may wrap) so a wide
          primary button is never clipped off the right edge; from sm up it sits
          inline on the right. The title truncates rather than pushing actions
          off-screen. */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between sm:gap-4">
        {/* Left: page icon + title. The title moved from text-lg (18px) to the
            display tier (32px): a page title that sat 2px above body text was a
            large part of why every screen read as flat. */}
        <div className="flex items-start gap-3 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-primary/12 flex items-center justify-center shrink-0 mt-0.5">
            <Icon className="h-5 w-5 text-primary" />
          </div>
          <div className="min-w-0">
            {eyebrow && <p className="micro-label mb-1.5">{eyebrow}</p>}
            <h1 className="display-page text-foreground truncate">{title}</h1>
            {subtitle && (
              <p className="text-sm text-muted-foreground mt-1.5 hidden sm:block">{subtitle}</p>
            )}
          </div>
        </div>

        {/* Right: page-scoped action buttons only — profile + notifications live in
            the top nav. Always allowed to wrap so action-heavy headers (e.g. a
            quote with submit / share / email / download) never overflow at narrow
            and mid widths; on wide screens they stay on one line and align right. */}
        {actions && (
          <div className="flex items-center gap-2 flex-wrap sm:justify-end shrink-0">{actions}</div>
        )}
      </div>

      {children && <div className="mt-4">{children}</div>}
    </section>
  );
}
