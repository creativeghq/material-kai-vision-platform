// Shared, design-system-compliant building blocks for the HR sections.
import React from 'react';
import type { LucideIcon } from 'lucide-react';
import { SectionHeader as SharedSectionHeader } from '@/components/shared/SectionHeader';
import { HubEmptyState } from '@/components/core/hub';
import { formatMoney } from '@/utils/decimal';
import { statusTone } from '@/utils/statusTone';

/**
 * Currency formatter for the HR sections — now a thin adapter over the canonical `formatMoney`
 * rather than a third implementation. It kept its own: browser locale (so the grouping changed with
 * the viewer's language) and a trailing currency CODE, so a payroll figure read "1,234.56 EUR"
 * while the same amount everywhere else read "€1,234.56". The API is unchanged.
 *
 * `minDecimals` defaults to 2 (accounting-style); pass 0 for payroll totals that read cleaner whole.
 * `nullDash` shows "—" for null instead of 0.
 */
export function hrMoney(
  n: number | null | undefined,
  currency: string,
  opts: { minDecimals?: number; nullDash?: boolean } = {},
): string {
  if (n == null && !opts.nullDash) return formatMoney(0, currency, { decimals: opts.minDecimals ?? 2 });
  return formatMoney(n, currency, { decimals: opts.minDecimals ?? 2 });
}

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

/**
 * Section header row — delegates to the platform-canonical SectionHeader so HR sections
 * match every other tab/page (18px title). Kept as a local re-export so the ~10 HR call
 * sites don't need to change their import.
 */
export function SectionHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: React.ReactNode }) {
  return <SharedSectionHeader title={title} subtitle={subtitle} actions={actions} />;
}

/** Read a File as base64 (no data: prefix) — HR uploads go through hr-api (service role), since the
 *  pdf-documents bucket refuses client writes outside the caller's own uid/ prefix. */
export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1] ?? '');
    r.onerror = () => reject(new Error('Could not read file'));
    r.readAsDataURL(file);
  });
}

/**
 * Ergani filing status as a plain colored word. `submitted` means "filed with the Ministry", which
 * is the good outcome — but the platform-wide `statusTone` has no opinion on that word (it is
 * "handed off, awaiting" nearly everywhere else), so the good tone is applied here rather than
 * widening the shared helper for one module's vocabulary.
 */
export const FILING_STATUS_LABELS: Record<string, string> = { draft: 'Draft', submitted: 'Filed', failed: 'Failed' };
export function filingTone(status: string): string {
  return status === 'submitted' ? 'text-emerald-600 dark:text-emerald-400' : statusTone(status);
}

/**
 * HR's empty state — now a thin adapter over the platform `HubEmptyState` rather than a second
 * implementation of one.
 *
 * It had no `action` slot at all, across 42 call sites in 17 files. So the module's empty screens
 * described the way out in prose — "Create departments to organise your team", "Create a run — it
 * pulls active employees…", "Upload contracts, IDs, certificates" — and then made the reader go
 * find the button themselves. `hint` maps to `description`; `action` is the addition.
 *
 * `variant` is forwarded because the distinction is load-bearing: "you have no employees" offers
 * Add employee, "no employees match your filters" must offer Clear filters and NEVER the create
 * action — inviting somebody with 400 employees and a department filter set to add a 401st is how
 * duplicate people get onto a payroll.
 */
export function EmptyState({
  icon,
  title,
  hint,
  action,
  variant,
}: {
  icon?: LucideIcon;
  title: string;
  hint?: string;
  action?: React.ReactNode;
  variant?: 'empty' | 'filtered';
}) {
  return <HubEmptyState icon={icon} title={title} description={hint} action={action} variant={variant} />;
}
