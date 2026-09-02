/**
 * Where this job's money went, by cost code.
 *
 * Every number comes from `get_project_cost_by_code`; this component formats and does not derive.
 * That function computes its three components with the SAME predicates `get_project_pnl` uses for
 * `supplier_cost`, `labor_cost` and `expense_cost`, so the rows here sum to exactly those three —
 * a breakdown and a headline that cannot disagree, because there is one derivation.
 *
 * Two things it deliberately shows rather than hides:
 *
 *  • The UNCODED row. Money on a bill, a timesheet or an expense that nobody classified is the
 *    normal state of a job that has just started coding, and it is the number that tells you the
 *    report is incomplete. Dropping it would leave a tidy breakdown that quietly understates.
 *  • WHAT IT LEAVES OUT. Committed cost and order COGS are recorded at order level while the code
 *    sits on the order line, so splitting them needs an apportionment rule that does not exist
 *    yet. Saying so is the difference between "this is all your cost" and "this is your bought,
 *    labour and expense cost" — and only one of those is true.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { Loader2, Ruler } from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/core/ui/card';
import { HubEmptyState } from '@/components/core/hub';
import { formatMoney } from '@/utils/decimal';
import { useToast } from '@/hooks/use-toast';
import { costCodesService, type ProjectCostByCode } from '@/services/costCodesService';

interface Props {
  projectId: string;
  /** The project's currency, for formatting only — the RPC does not convert. */
  currency?: string;
  reloadToken?: number;
}

export const CostByCodeCard: React.FC<Props> = ({ projectId, currency = 'EUR', reloadToken }) => {
  const { toast } = useToast();
  const [rows, setRows] = useState<ProjectCostByCode[] | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await costCodesService.projectCostByCode(projectId));
    } catch (e) {
      toast({ title: 'Failed to load the cost breakdown', description: (e as Error).message, variant: 'destructive' });
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [projectId, toast]);

  useEffect(() => { void load(); }, [load, reloadToken]);

  const money = (n: number) => formatMoney(n, currency);
  const total = (rows ?? []).reduce((sum, r) => sum + Number(r.total_cost || 0), 0);
  const uncoded = (rows ?? []).find((r) => r.cost_code_id === null);

  return (
    <Card>
      <CardHeader className="border-b border-border/60 px-5 py-3">
        <CardTitle>Cost by code</CardTitle>
        <p className="mt-1 text-sm text-muted-foreground">
          Supplier bills, labour and approved expenses on this job. Committed cost on open purchase
          orders is not included — it is recorded per order, not per line.
        </p>
      </CardHeader>
      <CardContent className="px-0 py-0">
        {loading ? (
          <div className="flex items-center gap-2 px-5 py-8 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Loading…
          </div>
        ) : (rows ?? []).length === 0 ? (
          <HubEmptyState
            icon={Ruler}
            title="No costs recorded yet"
            description="Supplier bills, logged time and approved expenses on this job appear here, grouped by the cost code each one carries."
          />
        ) : (
          <div className="table-scroll">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-surface-sunken text-[11px] font-semibold text-muted-foreground">
                  <th className="px-5 py-2 text-left">Code</th>
                  <th className="px-3 py-2 text-right">Bought</th>
                  <th className="px-3 py-2 text-right">Labour</th>
                  <th className="px-3 py-2 text-right">Expenses</th>
                  <th className="px-5 py-2 text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {(rows ?? []).map((r) => (
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
                    <td className="px-3 py-2 text-right tabular-nums">{Number(r.supplier_cost) ? money(Number(r.supplier_cost)) : '—'}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{Number(r.labor_cost) ? money(Number(r.labor_cost)) : '—'}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{Number(r.expense_cost) ? money(Number(r.expense_cost)) : '—'}</td>
                    <td className="px-5 py-2 text-right font-medium tabular-nums">{money(Number(r.total_cost))}</td>
                  </tr>
                ))}
                <tr className="border-t border-border/60 bg-surface-sunken">
                  <td className="px-5 py-2 font-medium">Total</td>
                  <td colSpan={3} />
                  <td className="px-5 py-2 text-right font-medium tabular-nums">{money(total)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}

        {uncoded && Number(uncoded.total_cost) > 0 && (
          <p className="border-t border-border/60 px-5 py-3 text-xs text-muted-foreground">
            {money(Number(uncoded.total_cost))} across {uncoded.entry_count}{' '}
            {uncoded.entry_count === 1 ? 'record' : 'records'} carries no cost code, so it is not
            attributed to any part of the job. Set a code on the bill, timesheet or expense to move it.
          </p>
        )}
      </CardContent>
    </Card>
  );
};
