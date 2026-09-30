/** The CVR — what this job is worth against what it costs, per cost code. */
import React, { useCallback, useEffect, useState } from 'react';
import { Loader2, Scale } from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/core/ui/card';
import { HubEmptyState, HubSortButton, useHubTable, type HubTableField } from '@/components/core/hub';
import { formatMoney } from '@/utils/decimal';
import { useToast } from '@/hooks/use-toast';
import { variationsService, type CvrRow } from '../services/variationsService';

interface Props {
  projectId: string;
  currency?: string;
  reloadToken?: number;
}

const n = (v: number | string | null | undefined) => Number(v ?? 0);

const CVR_FIELDS: HubTableField<CvrRow>[] = [
  { id: 'code', sortValue: (r) => r.code },
  { id: 'value', sortValue: (r) => n(r.total_value) },
  { id: 'actual', sortValue: (r) => n(r.actual_cost) },
  { id: 'cost', sortValue: (r) => n(r.total_cost) },
  { id: 'margin', sortValue: (r) => n(r.margin) },
];
const NO_ROWS: CvrRow[] = [];

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

  const list = rows ?? NO_ROWS;
  const t = useHubTable(list, CVR_FIELDS);
  const sortHead = (id: string, label: string, align?: 'right') => (
    <HubSortButton align={align} active={t.sort?.columnId === id ? t.sort.direction : undefined} onClick={() => t.toggleSort(id)}>
      {label}
    </HubSortButton>
  );
  const ariaSort = (id: string) =>
    t.sort?.columnId === id ? (t.sort.direction === 'asc' ? 'ascending' : 'descending') : undefined;
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
                <tr className="border-b border-hairline bg-surface-sunken text-[11px] font-semibold text-muted-foreground">
                  <th className="px-5 py-2 text-left" aria-sort={ariaSort('code')}>{sortHead('code', 'Code')}</th>
                  <th className="hidden px-3 py-2 text-right lg:table-cell">Contracted</th>
                  <th className="hidden px-3 py-2 text-right lg:table-cell">Variations</th>
                  <th className="px-3 py-2 text-right" aria-sort={ariaSort('value')}>{sortHead('value', 'Value', 'right')}</th>
                  <th className="hidden px-3 py-2 text-right md:table-cell" aria-sort={ariaSort('actual')}>
                    {sortHead('actual', 'Actual', 'right')}
                  </th>
                  <th className="hidden px-3 py-2 text-right md:table-cell">Pending</th>
                  <th className="hidden px-3 py-2 text-right md:table-cell">Committed</th>
                  <th className="hidden px-3 py-2 text-right sm:table-cell" aria-sort={ariaSort('cost')}>
                    {sortHead('cost', 'Cost', 'right')}
                  </th>
                  <th className="px-5 py-2 text-right" aria-sort={ariaSort('margin')}>{sortHead('margin', 'Margin', 'right')}</th>
                </tr>
              </thead>
              <tbody>
                {t.rows.map((r) => (
                  <tr key={r.cost_code_id ?? 'uncoded'} className="border-t border-hairline">
                    <td className="max-w-[20rem] break-words px-5 py-2">
                      {r.cost_code_id ? (
                        <>
                          <span className="font-mono text-xs tabular-nums text-muted-foreground">{r.code}</span>
                          <span className="ml-2">{r.name}</span>
                        </>
                      ) : (
                        <span className="text-amber-800 dark:text-amber-300">Not coded</span>
                      )}
                    </td>
                    <td className="hidden px-3 py-2 text-right tabular-nums lg:table-cell">{cell(r.contracted_value)}</td>
                    <td className="hidden px-3 py-2 text-right tabular-nums lg:table-cell">{cell(r.variation_value)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{cell(r.total_value)}</td>
                    <td className="hidden px-3 py-2 text-right tabular-nums md:table-cell">{cell(r.actual_cost)}</td>
                    <td className="hidden px-3 py-2 text-right tabular-nums md:table-cell">{cell(r.pending_cost)}</td>
                    <td className="hidden px-3 py-2 text-right tabular-nums md:table-cell">{cell(r.committed_cost)}</td>
                    <td className="hidden px-3 py-2 text-right tabular-nums sm:table-cell">{cell(r.total_cost)}</td>
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
                <tr className="border-t border-hairline bg-surface-sunken font-medium">
                  <td className="px-5 py-2">Total</td>
                  <td className="hidden lg:table-cell" />
                  <td className="hidden lg:table-cell" />
                  <td className="px-3 py-2 text-right tabular-nums">{money(totals.value)}</td>
                  <td className="hidden md:table-cell" />
                  <td className="hidden md:table-cell" />
                  <td className="hidden md:table-cell" />
                  <td className="hidden px-3 py-2 text-right tabular-nums sm:table-cell">{money(totals.cost)}</td>
                  <td className={`px-5 py-2 text-right tabular-nums ${marginTone(totals.margin)}`}>
                    {money(totals.margin)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        )}

        {/* #431 -- pending is money nobody has approved. Naming it apart from committed is the
            whole point: a job with unapproved POs used to read exactly like a job with none. */}
        {list.some((r) => n(r.pending_cost) > 0) && (
          <p className="border-t border-border/60 px-5 py-3 text-xs text-muted-foreground">
            Pending is purchase orders still in draft. It is shown here and NOT added into Cost —
            an order nobody has approved is not yet a spend.
          </p>
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
