/**
 * Inline AgentHub card for the `heating_cost_comparison` chunk emitted by the
 * calculate_heating_cost_comparison tool. Compact ranked table of annual
 * running cost per heating method.
 */

import { Trophy } from 'lucide-react';
import { Card, CardContent } from '@/components/core/ui/card';
import type { HeatingCostResult } from '@/lib/calculators/heatingCostComparison';

function eur(v: number): string {
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(v);
  } catch {
    return `€${Math.round(v)}`;
  }
}

export function HeatingCostResultCard({ result }: { result: HeatingCostResult }) {
  if (!result?.methods?.length) return null;
  const maxCost = Math.max(...result.methods.map((m) => m.annualCostEur));
  return (
    <Card className="dashboard-card border-primary/30 max-w-md">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Trophy className="h-4 w-4 text-primary" />
          Cheapest: {result.cheapest.label} · <span className="text-primary tabular-nums">{eur(result.cheapest.annualCostEur)}/yr</span>
        </div>
        <div className="space-y-2">
          {result.methods.map((m) => {
            const barPct = maxCost > 0 ? (m.annualCostEur / maxCost) * 100 : 0;
            return (
              <div key={m.key}>
                <div className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-1.5">
                    {m.label}
                    {m.rank === 1 && (
                      <span className="text-[10px] font-medium text-primary">best</span>
                    )}
                  </span>
                  <span className="tabular-nums font-medium">{eur(m.annualCostEur)}</span>
                </div>
                <div className="mt-1 h-1.5 rounded-full bg-muted overflow-hidden">
                  <div className={`h-full rounded-full ${m.rank === 1 ? 'bg-primary' : 'bg-muted-foreground/30'}`} style={{ width: `${barPct}%` }} />
                </div>
              </div>
            );
          })}
        </div>
        <p className="text-[11px] text-muted-foreground">Annual running cost only — excludes equipment + installation.</p>
      </CardContent>
    </Card>
  );
}
