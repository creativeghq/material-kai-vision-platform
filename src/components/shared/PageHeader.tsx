import React from 'react';
import { Link } from 'react-router-dom';

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/core/ui/breadcrumb';

export interface PageHeaderCrumb {
  label: string;
  /** Omit on the current page — a crumb with no `to` renders as plain text. */
  to?: string;
}

interface PageHeaderProps {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  subtitle?: string;
  /**
   * Ancestor trail, rendered above the title. A deep record page ("this
   * invoice, inside Finance") is otherwise indistinguishable from a top-level
   * one, and the back button is the only way out.
   */
  breadcrumbs?: PageHeaderCrumb[];
  /** Custom action buttons rendered on the right of the title row (e.g. "New MoodBoard") */
  actions?: React.ReactNode;
  /** Extra content rendered below the title row (e.g. a tab strip or filter bar) */
  children?: React.ReactNode;
}

/**
 * PAGE HEADER — the identity band at the top of every page.
 *
 * This is the ONE surface that still uses the display serif and still gets to
 * be a little larger than the UI around it, because it answers "where am I".
 * Everything else in the header is chrome: 20px title, 12px subtitle, actions
 * right-aligned, one hairline underneath. The icon sits in a small tinted
 * square rather than a coloured circle — a circle at this size reads as an
 * avatar, and this is not a person.
 *
 * It deliberately does NOT carry the brand gradient any more. A gradient band
 * across the top of every screen makes each page announce the product instead
 * of announcing itself, and it collided with the page's own content colours.
 */
export function PageHeader({
  icon: Icon,
  title,
  subtitle,
  breadcrumbs,
  actions,
  children,
}: PageHeaderProps) {
  return (
    <section className="border-b border-hairline bg-card px-4 pt-3 sm:px-6">
      {/* The shared Breadcrumb primitive rather than a hand-rolled row of links: it emits
          nav[aria-label] > ol > li with aria-current="page" on the leaf, which is what a screen
          reader needs to announce "breadcrumb, 2 of 3" instead of three unrelated links. */}
      {breadcrumbs && breadcrumbs.length > 0 && (
        <Breadcrumb className="mb-1.5">
          <BreadcrumbList className="gap-1 text-xs sm:gap-1.5">
            {breadcrumbs.map((crumb, i) => (
              <React.Fragment key={`${crumb.label}-${i}`}>
                {i > 0 && <BreadcrumbSeparator className="opacity-60" />}
                <BreadcrumbItem className="min-w-0">
                  {crumb.to ? (
                    <BreadcrumbLink asChild className="truncate hover:text-primary hover:underline">
                      <Link to={crumb.to}>{crumb.label}</Link>
                    </BreadcrumbLink>
                  ) : (
                    <BreadcrumbPage className="truncate">{crumb.label}</BreadcrumbPage>
                  )}
                </BreadcrumbItem>
              </React.Fragment>
            ))}
          </BreadcrumbList>
        </Breadcrumb>
      )}

      {/* On mobile the actions drop to their own row (and may wrap) so a wide
          primary button is never clipped off the right edge; from sm up it sits
          inline on the right. The title truncates rather than pushing actions
          off-screen. */}
      <div className="flex flex-col gap-2 pb-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        {/* Left: page icon + title */}
        <div className="flex min-w-0 items-center gap-2.5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-sm bg-primary/10">
            <Icon className="h-4 w-4 text-primary" />
          </div>
          <div className="min-w-0">
            <h1 className="truncate font-display text-xl font-semibold leading-tight tracking-tight text-foreground">
              {title}
            </h1>
            {subtitle && (
              <p className="mt-0.5 hidden truncate text-xs text-muted-foreground sm:block">{subtitle}</p>
            )}
          </div>
        </div>

        {/* Right: page-scoped action buttons only — profile + notifications live in
            the top nav. Always allowed to wrap so action-heavy headers (e.g. a
            quote with submit / share / email / download) never overflow at narrow
            and mid widths; on wide screens they stay on one line and align right. */}
        {actions && (
          <div className="flex flex-wrap items-center gap-2 sm:justify-end">{actions}</div>
        )}
      </div>

      {/* A tab strip passed as children sits flush with the header's own bottom
          rule, so the two read as one band rather than two stacked borders. */}
      {children && <div className="-mb-px">{children}</div>}
    </section>
  );
}
