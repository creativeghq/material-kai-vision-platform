/** Inline AgentHub card for the `project_plan_estimate` chunk emitted by estimate_project_plan. */

import { AlertTriangle, ListChecks } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Card, CardContent } from '@/components/core/ui/card';
import { formatMoney } from '@/utils/decimal';

export interface ProjectPlanEstimateResult {
  title: string;
  currency: string;
  dimensions: { key: string; label: string; value: number; unit: string | null }[];
  subtotal: number;
  sections: { section: string; total: number }[];
  unmatched?: string[];
  assumptions?: string[];
}

export function ProjectPlanEstimateCard({ result }: { result: ProjectPlanEstimateResult }) {
  if (!result?.sections?.length) return null;
  const currency = result.currency || 'EUR';
  const money = (v: number) => {
    try {
      return formatMoney(v, currency, { decimals: 0, maxDecimals: 0 });
    } catch {
      return `${Math.round(v)} ${currency}`;
    }
  };
  const notes = [
    ...(result.unmatched?.length ? [`Not in the price list, standard option priced instead: ${result.unmatched.join(', ')}.`] : []),
    ...(result.assumptions ?? []),
  ];

  return (
    <Card className="dashboard-card border-primary/30 max-w-md">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-2 text-sm font-medium">
            <ListChecks className="h-4 w-4 text-primary" />
            {result.title}
          </span>
          <span className="text-lg font-semibold tabular-nums text-primary">{money(result.subtotal)}</span>
        </div>

        {result.dimensions?.length > 0 && (
          <div className="text-xs text-muted-foreground">
            {result.dimensions.map((d) => `${d.label} ${d.value}${d.unit ? ` ${d.unit}` : ''}`).join(' · ')}
          </div>
        )}

        <div className="space-y-1.5">
          {result.sections.map((s) => (
            <div key={s.section} className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground truncate">{s.section}</span>
              <span className="tabular-nums font-medium shrink-0">{money(s.total)}</span>
            </div>
          ))}
        </div>

        {notes.length > 0 && (
          <div className="flex items-start gap-2 rounded-sm border border-amber-500/40 bg-amber-500/10 p-2">
            <AlertTriangle className="h-3.5 w-3.5 text-amber-700 dark:text-amber-400 shrink-0 mt-0.5" />
            <p className="text-[11px] text-amber-800 dark:text-amber-300">{notes.join(' ')}</p>
          </div>
        )}

        <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
          <span>Ballpark at standard rates, excluding VAT.</span>
          <Link to="/tools/project-plan" className="text-primary hover:underline shrink-0">Edit the plan →</Link>
        </div>
      </CardContent>
    </Card>
  );
}
