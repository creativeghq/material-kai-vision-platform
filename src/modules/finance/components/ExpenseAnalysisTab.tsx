import React from 'react';
import { AlertTriangle, Tags } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/core/ui/card';
import { formatMoney } from '@/utils/decimal';
import { financeService, type ExpenseAnalysis } from '@/modules/finance/services/financeService';
import { expenseKindCopy, originLabel } from '@/modules/finance/expenseSegments';

const pct = (part: number, whole: number) => (whole ? Math.round((part / whole) * 1000) / 10 : 0);

const Bar: React.FC<{ share: number }> = ({ share }) => (
  <div className="mt-1 h-1.5 w-full rounded-sm bg-surface-sunken">
    <div className="h-1.5 rounded-sm bg-primary" style={{ width: `${Math.max(share, 1)}%` }} />
  </div>
);

export const ExpenseAnalysisTab: React.FC<{
  workspaceId: string;
  from: string;
  to: string;
  periodLabel: string;
}> = ({ workspaceId, from, to, periodLabel }) => {
  const [data, setData] = React.useState<ExpenseAnalysis | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!workspaceId) return;
    let live = true;
    financeService.expenseAnalysis(workspaceId, from, to)
      .then((d) => { if (live) { setData(d); setError(null); } })
      .catch((e) => { if (live) { setData(null); setError(e instanceof Error ? e.message : String(e)); } });
    return () => { live = false; };
  }, [workspaceId, from, to]);

  if (error) {
    return (
      <Card>
        <CardContent className="flex items-start gap-2 p-4 text-xs text-amber-800 dark:text-amber-300">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          The spend breakdown could not be read — {error}. That is not a statement that nothing was spent.
        </CardContent>
      </Card>
    );
  }
  if (!data) return null;

  const total = data.total_net;
  const catchallDominates = data.catchall.share >= 80 && data.catchall.docs > 0;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="border-b border-hairline px-5 py-3">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Tags className="h-4 w-4 text-muted-foreground" /> Spend — {periodLabel}
          </CardTitle>
          <p className="pt-1 text-[11px] text-muted-foreground">
            {formatMoney(total, 'EUR')} across {data.total_docs.toLocaleString()} documents, whether
            or not they are booked yet.
          </p>
        </CardHeader>

        {catchallDominates && (
          <CardContent className="border-b border-hairline pt-4">
            <p className="flex items-start gap-2 text-xs text-amber-800 dark:text-amber-300">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                <strong>{data.catchall.share}% of this sits in one category, “{data.catchall.name}”</strong>
                {' '}— {data.catchall.docs.toLocaleString()} documents. That category is named after
                the inlet the documents arrived through, not after what the money bought, so the
                category split below cannot tell you anything yet. Suppliers and kinds can.
              </span>
            </p>
          </CardContent>
        )}

        <CardContent className="space-y-6 pt-4">
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              By kind
            </h3>
            <div className="mt-2 space-y-2">
              {data.kinds.map((k) => (
                <div key={k.kind}>
                  <div className="flex items-baseline justify-between gap-3 text-sm">
                    <span className="font-medium">{expenseKindCopy(k.kind).label}</span>
                    <span className="shrink-0 tabular-nums">
                      {formatMoney(k.net, 'EUR')}
                      <span className="ml-2 text-xs text-muted-foreground">{pct(k.net, total)}%</span>
                    </span>
                  </div>
                  <Bar share={pct(k.net, total)} />
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    {k.docs.toLocaleString()} document{k.docs === 1 ? '' : 's'}
                    {k.abroad_net > 0 ? ` · ${formatMoney(k.abroad_net, 'EUR')} from outside Greece` : ''}
                  </p>
                </div>
              ))}
            </div>
          </section>

          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Top suppliers
            </h3>
            <div className="table-scroll mt-2">
              <table className="w-full text-sm">
                <thead className="bg-surface-sunken">
                  <tr className="text-left text-[11px] font-semibold text-muted-foreground">
                    <th className="px-3 py-2">Supplier</th>
                    <th className="px-3 py-2">Kind</th>
                    <th className="px-3 py-2">From</th>
                    <th className="px-3 py-2 text-right">Docs</th>
                    <th className="px-3 py-2 text-right">Net</th>
                    <th className="px-3 py-2 text-right">Share</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {data.suppliers.map((s) => (
                    <tr key={s.name}>
                      <td className="max-w-xs truncate px-3 py-2 font-medium" title={s.name}>{s.name}</td>
                      <td className="px-3 py-2 text-muted-foreground">
                        {s.expense_kind === 'mixed' ? 'Mixed' : expenseKindCopy(s.expense_kind).label}
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">
                        {s.origin === 'mixed' ? 'Mixed' : originLabel(s.origin)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{s.docs}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{formatMoney(s.net, 'EUR')}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                        {pct(s.net, total)}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              By category
            </h3>
            <div className="mt-2 space-y-2">
              {data.categories.map((c) => (
                <div key={c.name}>
                  <div className="flex items-baseline justify-between gap-3 text-sm">
                    <span className="font-medium">
                      {c.name}
                      {c.is_catchall && (
                        <span className="ml-2 text-[11px] font-normal text-muted-foreground">
                          (not a real category — the inlet)
                        </span>
                      )}
                    </span>
                    <span className="shrink-0 tabular-nums">
                      {formatMoney(c.net, 'EUR')}
                      <span className="ml-2 text-xs text-muted-foreground">{pct(c.net, total)}%</span>
                    </span>
                  </div>
                  <Bar share={pct(c.net, total)} />
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    {c.docs.toLocaleString()} document{c.docs === 1 ? '' : 's'} · {c.booked_docs} booked
                    {c.abroad_net > 0 ? ` · ${formatMoney(c.abroad_net, 'EUR')} from outside Greece` : ''}
                  </p>
                </div>
              ))}
            </div>
          </section>
        </CardContent>
      </Card>
    </div>
  );
};
