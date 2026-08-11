/**
 * Inline AgentHub card for the `kitchen_cost` chunk emitted by the calculate_kitchen_cost tool.
 *
 * The shape is declared here rather than imported from a calculator module, because — unlike its
 * two siblings — kitchen pricing has no frontend twin: the rates live in the `kitchen_cabinets`
 * blueprint and the edge tool is the only thing that resolves them.
 *
 * `unmatched` is rendered prominently on purpose. It means the user asked for a finish the price
 * list does not have and the DEFAULT was priced instead, so a total presented without that note
 * is a quote for a spec nobody asked for.
 */

import { AlertTriangle, CookingPot } from 'lucide-react';
import { Card, CardContent } from '@/components/core/ui/card';
import { formatMoney } from '@/utils/decimal';

export interface KitchenCostResult {
  currency: string;
  dimensions: { label: string; value: number; unit: string | null }[];
  subtotal: number;
  chosen: { group: string | null; label: string }[];
  sections: {
    section: string;
    total: number;
    lines: { label: string; quantity: number; unit: string | null; unit_price: number; line_total: number }[];
  }[];
  unmatched?: string[];
}

export function KitchenCostResultCard({ result }: { result: KitchenCostResult }) {
  if (!result?.sections?.length) return null;
  const currency = result.currency || 'EUR';
  const money = (v: number) => {
    try {
      return formatMoney(v, currency, { decimals: 0, maxDecimals: 0 });
    } catch {
      return `${Math.round(v)} ${currency}`;
    }
  };

  return (
    <Card className="dashboard-card border-primary/30 max-w-md">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-2 text-sm font-medium">
            <CookingPot className="h-4 w-4 text-primary" />
            Kitchen estimate
          </span>
          <span className="text-lg font-semibold tabular-nums text-primary">{money(result.subtotal)}</span>
        </div>

        {result.dimensions?.length > 0 && (
          <div className="text-xs text-muted-foreground">
            {result.dimensions.map((d) => `${d.label} ${d.value}${d.unit ? ` ${d.unit}` : ''}`).join(' · ')}
          </div>
        )}

        {result.chosen?.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {result.chosen.map((c) => (
              <span key={`${c.group}-${c.label}`} className="rounded-full bg-muted px-2 py-0.5 text-[11px]">
                {c.label}
              </span>
            ))}
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

        {result.unmatched && result.unmatched.length > 0 && (
          <div className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-2">
            <AlertTriangle className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <p className="text-[11px] text-amber-700 dark:text-amber-300">
              Not in the price list, so the standard option was priced instead:{' '}
              {result.unmatched.join(', ')}
            </p>
          </div>
        )}

        <p className="text-[11px] text-muted-foreground">
          Ballpark excluding VAT · appliances and sink not included · subject to survey.
        </p>
      </CardContent>
    </Card>
  );
}
