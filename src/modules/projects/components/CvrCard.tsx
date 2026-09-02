/**
 * The CVR — what this job is worth against what it costs, per cost code.
 *
 * Every number comes from `get_project_cvr`; this component formats and does not derive. That
 * matters more here than anywhere else in the project: a cost-value reconciliation is the number
 * an operator decides whether to keep going on, and the platform has already shipped one money
 * quantity implemented five different ways.
 *
 * So the footer total is the sum of the SQL's own per-row totals, never a re-computation from the
 * components beside them, and the margin percentage is not recalculated in TypeScript — a null
 * `margin_pct` means "there is no value to take a percentage of yet", which is a different fact
 * from 0% and reads differently to anybody deciding anything.
 *
 * It supersedes the plain cost-by-code card: that showed the cost half alone, and a cost with no
 * value beside it cannot tell you whether the job is making money.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { Loader2, Scale } from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/core/ui/card';
import { HubEmptyState } from '@/components/core/hub';
import { formatMoney } from '@/utils/decimal';
import { useToast } from '@/hooks/use-toast';
import { variationsService, type CvrRow } from '../services/variationsService';

interface Props {
  projectId: string;
  currency?: string;
  reloadToken?: number;
}

const n = (v: number | string | null | undefined) => Number(v ?? 0);

export const CvrCard: React.FC<Props> = ({ projectId, currency = 'EUR', reloadToken }) => {
  const { toast } = useToast();
  const [rows, setRows] = useState<CvrRow[] | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await variationsService.cvr(projectId));
    } catch (e) {
      toast({ title: 'Failed to load the CVR', description: (e as Error).message, variant: 'destructive' });
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [projectId, toast]);

  useEffect(() => { void load(); }, [load, reloadToken]);

  const money = (v: number | string | null | undefined) => formatMoney(n(v), currency);
  const cell = (v: number | string | null | undefined) => (n(v) ? money(v) : '—');

  const list = rows ?? [];
  // Summing the SQL's own per-row figures. Never rebuilding a row's total from its parts: that
  // would be a second derivation of the same money, free to drift from the first.
  const totals = list.reduce(
    (acc, r) => ({
      value: acc.value + n(r.total_value),
      cost: acc.cost + n(r.total_cost),
      margin: acc.margin + n(r.margin),
    }),
    { value: 0, cost: 0, margin: 0 },
  );
  const uncoded = list.find((r) => r.cost_code_id === null);

  const marginTone = (v: number) =>
    v < 0 ? 'text-destructive' : 'text-emerald-700 dark:text-emerald-400';

  return (
    <Card>
      <CardHeader className="border-b border-border/60 px-5 py-3">
        <CardTitle>Cost value reconciliation</CardTitle>
        <p className="mt-1 text-sm text-muted-foreground">
          Contracted value plus approved client variations, against actual cost, open commitments
          and approved subcontractor variations. Only approved variations count — the rest are a
          pipeline, not money.
        </p>
      </CardHeader>
      <CardContent className="px-0 py-0">
        {loading ? (
          <div className="flex items-center gap-2 px-5 py-8 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Loading…
          </div>
        ) : list.length === 0 ? (
          <HubEmptyState
            icon={Scale}
            title="Nothing to reconcile yet"
            description="Once this job has an accepted quote or any recorded cost, the value and cost sides appear here grouped by cost code."
          />
        ) : (
          <div className="table-scroll">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-surface-sunken text-[11px] font-semibold text-muted-foreground">
                  <th className="px-5 py-2 text-left">Code</th>
                  <th className="px-3 py-2 text-right">Contracted</th>
                  <th className="px-3 py-2 text-right">Variations</th>
                  <th className="px-3 py-2 text-right">Value</th>
                  <th className="px-3 py-2 text-right">Actual</th>
                  <th className="px-3 py-2 text-right">Committed</th>
                  <th className="px-3 py-2 text-right">Cost</th>
                  <th className="px-5 py-2 text-right">Margin</th>
                </tr>
              </thead>
              <tbody>
                {list.map((r) => (
                  <tr key={r.cost_code_id ?? 'uncoded'} className="border-t border-border/60">
                    <td className="px-5 py-2">
                      {r.cost_code_id ? (
                        <>
                          <span className="font-mono text-xs tabular-nums text-muted-foreground">{r.code}</span>
                          <span className="ml-2">{r.name}</span>
                        </>
                      ) : (
                        <span className="text-amber-800 dark:text-amber-300">Not coded</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{cell(r.contracted_value)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{cell(r.variation_value)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{cell(r.total_value)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{cell(r.actual_cost)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{cell(r.committed_cost)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{cell(r.total_cost)}</td>
                    <td className={`px-5 py-2 text-right font-medium tabular-nums ${marginTone(n(r.margin))}`}>
                      {money(r.margin)}
                      {/* Null means there is no value to take a percentage of — a different fact
                          from 0%, and the one that stops "0%" reading as break-even. */}
                      {r.margin_pct !== null && (
                        <span className="ml-1 text-[11px] font-normal text-muted-foreground">
                          {n(r.margin_pct).toFixed(1)}%
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
                <tr className="border-t border-border/60 bg-surface-sunken font-medium">
                  <td className="px-5 py-2">Total</td>
                  <td colSpan={2} />
                  <td className="px-3 py-2 text-right tabular-nums">{money(totals.value)}</td>
                  <td colSpan={2} />
                  <td className="px-3 py-2 text-right tabular-nums">{money(totals.cost)}</td>
                  <td className={`px-5 py-2 text-right tabular-nums ${marginTone(totals.margin)}`}>
                    {money(totals.margin)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        )}

        {uncoded && (n(uncoded.total_value) > 0 || n(uncoded.total_cost) > 0) && (
          <p className="border-t border-border/60 px-5 py-3 text-xs text-muted-foreground">
            {money(n(uncoded.total_value))} of value and {money(n(uncoded.total_cost))} of cost carry
            no cost code, so they are not attributed to any part of the job. Code the quote lines,
            bills and timesheets to move them.
          </p>
        )}
      </CardContent>
    </Card>
  );
};
