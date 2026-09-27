/** Spend as an OVERVIEW. Which supplier, one by one, is the By-supplier tab — not this. */
import React from 'react';
import { AlertTriangle, ArrowDownRight, ArrowUpRight, Minus, Sparkles, Tags } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/core/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/core/ui/card';
import { formatMoney } from '@/utils/decimal';
import { financeService, type ExpenseOverview } from '@/modules/finance/services/financeService';
import { expenseKindCopy, originLabel } from '@/modules/finance/expenseSegments';

const Bar: React.FC<{ share: number; muted?: boolean }> = ({ share, muted }) => (
  <div className="mt-1 h-1.5 w-full rounded-sm bg-surface-sunken">
    <div
      className={`h-1.5 rounded-sm ${muted ? 'bg-muted-foreground/40' : 'bg-primary'}`}
      style={{ width: `${Math.min(Math.max(share, 1), 100)}%` }}
    />
  </div>
);

/** A movement is a direction and a size, or the honest absence of a comparison. */
const Delta: React.FC<{ pct: number | null; inverse?: boolean }> = ({ pct, inverse }) => {
  if (pct === null || pct === undefined) {
    return <span className="text-[11px] text-muted-foreground">no earlier period to compare</span>;
  }
  const up = pct > 0;
  const flat = Math.abs(pct) < 0.05;
  // Spending MORE is the unwelcome direction, so up is amber and down is green.
  const tone = flat ? 'text-muted-foreground'
    : (up !== !!inverse) ? 'text-amber-800 dark:text-amber-300' : 'text-emerald-700 dark:text-emerald-400';
  const Icon = flat ? Minus : up ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={`inline-flex items-center gap-1 text-[11px] font-medium ${tone}`}>
      <Icon className="h-3 w-3" />
      {flat ? 'flat' : `${up ? '+' : ''}${pct}%`}
    </span>
  );
};

export const ExpenseAnalysisTab: React.FC<{
  workspaceId: string;
  from: string;
  to: string;
  periodLabel: string;
}> = ({ workspaceId, from, to, periodLabel }) => {
  const [data, setData] = React.useState<ExpenseOverview | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!workspaceId) return;
    let live = true;
    financeService.expenseOverview(workspaceId, from, to)
      .then((d) => { if (live) { setData(d); setError(null); } })
      .catch((e) => { if (live) { setData(null); setError(e instanceof Error ? e.message : String(e)); } });
    return () => { live = false; };
  }, [workspaceId, from, to]);

  if (error) {
    return (
      <Card>
        <CardContent className="flex items-start gap-2 p-4 text-xs text-amber-800 dark:text-amber-300">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          The spend overview could not be read — {error}. That is not a statement that nothing was spent.
        </CardContent>
      </Card>
    );
  }
  if (!data) return null;

  const { total, previous, filed, concentration } = data;
  const readable = data.categories.filter((c) => !c.is_inlet);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="border-b border-hairline px-5 py-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Tags className="h-4 w-4 text-muted-foreground" /> Spend — {periodLabel}
            </CardTitle>
            <Button asChild variant="secondary" size="sm">
              <Link to="/finance?tab=expense_suppliers">
                <Sparkles className="mr-2 h-3.5 w-3.5" /> Suggest categories
              </Link>
            </Button>
          </div>
        </CardHeader>

        <CardContent className="pt-4">
          <div className="flex flex-wrap items-end gap-x-10 gap-y-4">
            <div>
              <p className="text-[11px] text-muted-foreground">Total spend</p>
              <p className="text-2xl font-semibold tabular-nums">{formatMoney(total.net, 'EUR')}</p>
              <p className="mt-0.5 flex items-center gap-2">
                <Delta pct={data.delta_pct} />
                <span className="text-[11px] text-muted-foreground">
                  vs {formatMoney(previous.net, 'EUR')} in the {data.period.prev_from} → {data.period.prev_to} period
                </span>
              </p>
            </div>
            <div>
              <p className="text-[11px] text-muted-foreground">VAT on it</p>
              <p className="text-base font-semibold tabular-nums">{formatMoney(total.vat, 'EUR')}</p>
            </div>
            <div>
              <p className="text-[11px] text-muted-foreground">Documents</p>
              <p className="text-base font-semibold tabular-nums">{total.docs.toLocaleString()}</p>
            </div>
            <div>
              <p className="text-[11px] text-muted-foreground">Suppliers</p>
              <p className="text-base font-semibold tabular-nums">{total.suppliers.toLocaleString()}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* What share of the money can actually be read by category. Stated as a figure, because a
          category chart built on 0% filed looks complete and answers nothing. */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <p className="text-sm font-medium">
              {filed.share}% of this is filed under a real category
            </p>
            <p className="text-[11px] tabular-nums text-muted-foreground">
              {formatMoney(filed.net, 'EUR')} of {formatMoney(total.net, 'EUR')} ·{' '}
              {filed.docs.toLocaleString()} of {total.docs.toLocaleString()} documents
            </p>
          </div>
          <Bar share={filed.share} muted={filed.share < 50} />
          {filed.share < 100 && (
            <p className="mt-2 text-[11px] text-muted-foreground">
              The rest is still under the inlet it arrived through, which says nothing about what
              the money bought. <strong>Suggest categories</strong> proposes one per supplier —
              from their registered ΚΑΔ where we hold it, and from the trade name where we do not.
            </p>
          )}
        </CardContent>
      </Card>

      {readable.length > 0 && (
        <Card>
          <CardHeader className="border-b border-hairline px-5 py-3">
            <CardTitle className="text-sm">Where it goes</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 pt-4">
            {readable.map((c) => (
              <div key={c.name}>
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="font-medium">{c.name}</span>
                  <span className="flex shrink-0 items-baseline gap-3 tabular-nums">
                    <Delta pct={c.delta_pct} />
                    <span>{formatMoney(c.net, 'EUR')}</span>
                    <span className="w-10 text-right text-xs text-muted-foreground">{c.share}%</span>
                  </span>
                </div>
                <Bar share={c.share} />
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="border-b border-hairline px-5 py-3">
            <CardTitle className="text-sm">What kind of spend</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 pt-4">
            {data.kinds.map((k) => (
              <div key={k.kind}>
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="font-medium">{expenseKindCopy(k.kind).label}</span>
                  <span className="shrink-0 tabular-nums">
                    {formatMoney(k.net, 'EUR')}
                    <span className="ml-2 text-xs text-muted-foreground">{k.share}%</span>
                  </span>
                </div>
                <Bar share={k.share} />
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="border-b border-hairline px-5 py-3">
            <CardTitle className="text-sm">Where it comes from</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 pt-4">
            {data.origins.map((o) => (
              <div key={o.origin}>
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="font-medium">
                    {o.origin === 'unknown' ? 'Not stated on the document' : originLabel(o.origin)}
                  </span>
                  <span className="shrink-0 tabular-nums">
                    {formatMoney(o.net, 'EUR')}
                    <span className="ml-2 text-xs text-muted-foreground">{o.share}%</span>
                  </span>
                </div>
                <Bar share={o.share} muted={o.origin === 'unknown'} />
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="pt-4 text-sm">
          <p>
            The five largest suppliers are{' '}
            <strong className="tabular-nums">{concentration.top5_share}%</strong> of this
            {concentration.largest_name && concentration.largest_share !== null && (
              <>
                , and {concentration.largest_name} alone is{' '}
                <strong className="tabular-nums">{concentration.largest_share}%</strong>
              </>
            )}
            {' '}— out of {concentration.supplier_count.toLocaleString()} suppliers in the period.
          </p>
          <p className="mt-1 text-[11px] text-muted-foreground">
            Supplier by supplier, with their whole history, is{' '}
            <Link to="/finance?tab=expense_suppliers" className="underline underline-offset-2 hover:text-foreground">
              By supplier
            </Link>.
          </p>
        </CardContent>
      </Card>
    </div>
  );
};
