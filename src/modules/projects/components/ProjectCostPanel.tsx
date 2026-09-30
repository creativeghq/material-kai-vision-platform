import React, { useEffect, useState } from 'react';
import { ArrowRight, HardHat, Loader2, Package, Wallet } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Badge } from '@/components/core/ui/badge';
import { Button } from '@/components/core/ui/button';
import { cn } from '@/lib/utils';
import { formatMoney } from '@/utils/decimal';
import { formatDate, fromLocalISODate } from '@/utils/datetime';
import { projectsService, type ProjectDashboard } from '../services/projectsService';

// --chart-1..3 in fixed order; dark-mode green is one step darker than the token to stay in band.
const SEGMENTS = [
  { key: 'materials', label: 'Materials & suppliers', swatch: 'bg-[hsl(var(--chart-2))]' },
  { key: 'labour', label: 'Labour', swatch: 'bg-[hsl(var(--chart-1))] dark:bg-[hsl(142_55%_44%)]' },
  { key: 'expenses', label: 'Expenses', swatch: 'bg-[hsl(var(--chart-3))]' },
] as const;

const HATCH = 'repeating-linear-gradient(45deg, hsl(var(--chart-2) / 0.55) 0 3px, transparent 3px 6px)';

export const ProjectCostPanel: React.FC<{
  projectId: string;
  onOpenSection: (tab: string) => void;
}> = ({ projectId, onOpenSection }) => {
  const [data, setData] = useState<ProjectDashboard | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setData(null);
    setFailed(false);
    projectsService.getProjectDashboard(projectId)
      .then((d) => { if (!cancelled) setData(d); })
      .catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, [projectId]);

  return (
    <Card className="dashboard-card">
      <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
        <div>
          <CardTitle className="flex items-center gap-2 font-medium"><Wallet className="h-4 w-4 text-primary" />Cost & margin</CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">
            Supplier bills, labour, expenses and open purchase orders tagged to this project, net of VAT.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => onOpenSection('finance')}>
          Job cost detail<ArrowRight className="ml-1.5 h-3.5 w-3.5" />
        </Button>
      </CardHeader>
      <CardContent>
        {failed ? (
          <p className="text-sm text-amber-800 dark:text-amber-300">
            Cost figures could not be loaded. They are unknown, not zero.
          </p>
        ) : !data ? (
          <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : (
          <Body data={data} onOpenSection={onOpenSection} />
        )}
      </CardContent>
    </Card>
  );
};

const Body: React.FC<{ data: ProjectDashboard; onOpenSection: (tab: string) => void }> = ({ data, onOpenSection }) => {
  const { pnl } = data;
  const mixed = pnl.currencies.length > 1;
  const currency = pnl.currencies[0] ?? data.budget_currency ?? 'EUR';
  const money = (v: number | null | undefined) => formatMoney(v ?? 0, currency);

  const parts = {
    materials: pnl.supplier_cost + pnl.order_cogs,
    labour: pnl.labor_cost,
    expenses: pnl.expense_cost,
  };
  const spent = pnl.actual_cost;
  const committed = pnl.committed_cost;
  const onContract = pnl.contracted_revenue > 0;
  const baseLabel = onContract ? 'contract value' : data.budget_comparable ? 'budget' : null;
  const base = onContract ? pnl.contracted_revenue : data.budget_comparable ? data.budget_amount ?? 0 : 0;
  const headroom = onContract ? pnl.forecast_margin_amount : data.budget_headroom;
  const scale = Math.max(base, spent + committed, 1);
  const pct = (v: number) => `${(v / scale) * 100}%`;
  const over = headroom !== null && base > 0 && headroom < 0;

  return (
    <div className="space-y-6">
      {!onContract && data.budget_amount && !data.budget_comparable && (
        <p className="text-xs text-amber-800 dark:text-amber-300">
          The budget is in {data.budget_currency ?? 'another currency'} and the costs are not, so they are not compared.
        </p>
      )}
      {mixed && (
        <p className="text-xs text-amber-800 dark:text-amber-300">
          These figures mix {pnl.currencies.join(', ')}; totals add amounts in different currencies.
        </p>
      )}

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat label="Contract value" value={pnl.contracted_revenue > 0 ? money(pnl.contracted_revenue) : '—'} hint="Accepted quotes" />
        <Stat label="Spent so far" value={money(spent)} hint={base > 0 ? `${Math.round((spent / base) * 100)}% of ${baseLabel}` : undefined} />
        <Stat label="On order" value={money(committed)} hint="Purchase orders not billed yet" />
        <Stat
          label="Forecast margin"
          value={pnl.contracted_revenue > 0 ? money(pnl.forecast_margin_amount) : '—'}
          hint={pnl.forecast_margin_pct !== null ? `${pnl.forecast_margin_pct}% of contract` : 'Needs an accepted quote'}
          tone={pnl.contracted_revenue > 0 && pnl.forecast_margin_amount < 0 ? 'bad' : undefined}
        />
      </div>

      <div className="space-y-2">
        <div className="flex h-3 w-full gap-[2px] overflow-hidden rounded-sm bg-surface-sunken" role="img"
          aria-label={`Spent ${money(spent)} and ${money(committed)} on order${base > 0 ? ` against ${baseLabel} ${money(base)}` : ''}`}
        >
          {SEGMENTS.map((s) => parts[s.key] > 0 && (
            <div key={s.key} className={cn('h-full', s.swatch)} style={{ width: pct(parts[s.key]) }} title={`${s.label}: ${money(parts[s.key])}`} />
          ))}
          {committed > 0 && <div className="h-full" style={{ width: pct(committed), backgroundImage: HATCH }} title={`On order: ${money(committed)}`} />}
        </div>
        {base > 0 && headroom !== null && (
          <div className="flex justify-between text-[11px] text-muted-foreground tabular-nums">
            <span>0</span>
            <span className={over ? 'text-destructive' : ''}>
              {over ? `Over ${baseLabel} by ${money(-headroom)}` : `${money(headroom)} left of ${baseLabel}`}
            </span>
          </div>
        )}
        <ul className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
          {SEGMENTS.map((s) => (
            <LegendRow key={s.key} swatch={<span className={cn('h-2.5 w-2.5 rounded-sm', s.swatch)} />} label={s.label} value={money(parts[s.key])} />
          ))}
          <LegendRow swatch={<span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundImage: HATCH }} />} label="On order, not billed yet" value={money(committed)} />
        </ul>
        {pnl.pending_expense_cost > 0 && (
          <p className="text-xs text-muted-foreground">
            {money(pnl.pending_expense_cost)} of expense claims await approval and are not counted yet.
          </p>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section>
          <h4 className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-muted-foreground"><Package className="h-3.5 w-3.5" />Material deliveries</h4>
          {data.deliveries.length === 0 ? (
            <div className="flex items-center justify-between gap-3 rounded-sm border border-hairline bg-surface-sunken px-3 py-2 text-sm text-muted-foreground">
              <span>No purchase orders waiting on delivery.</span>
              <Button variant="ghost" size="sm" onClick={() => onOpenSection('purchases')}>Purchases</Button>
            </div>
          ) : (
            <ul className="divide-y divide-hairline rounded-sm border border-hairline">
              {data.deliveries.map((d) => (
                <li key={d.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{d.supplier_name ?? 'Supplier not set'}</p>
                    <p className="truncate text-xs text-muted-foreground">{d.order_number ?? 'Purchase order'}{d.supplier_status ? ` · ${d.supplier_status}` : ''}</p>
                  </div>
                  <span className="text-xs tabular-nums text-muted-foreground">{d.amount_net !== null ? formatMoney(d.amount_net, d.currency ?? currency) : '—'}</span>
                  {d.eta ? (
                    <Badge variant={d.is_late ? 'error' : 'neutral'} className="shrink-0 text-[11px]">
                      {d.is_late ? 'Late · ' : ''}{formatDate(fromLocalISODate(d.eta))}
                    </Badge>
                  ) : (
                    <Badge variant="warning" className="shrink-0 text-[11px]">No ETA</Badge>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <h4 className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-muted-foreground"><HardHat className="h-3.5 w-3.5" />Crew on the job, last 7 days</h4>
          <CrewStrip crew={data.crew} />
        </section>
      </div>
    </div>
  );
};

const CrewStrip: React.FC<{ crew: ProjectDashboard['crew'] }> = ({ crew }) => {
  const max = Math.max(1, ...crew.map((c) => c.workers));
  const anyone = crew.some((c) => c.workers > 0);
  return (
    <div>
      <div className="flex h-24 items-end gap-1.5">
        {crew.map((c) => {
          const day = fromLocalISODate(c.day);
          const weekday = day.toLocaleDateString('en-US', { weekday: 'short' });
          return (
            <div key={c.day} className="flex flex-1 flex-col items-center gap-1" title={`${formatDate(day)}: ${c.workers} ${c.workers === 1 ? 'person' : 'people'}, ${Math.round(c.minutes / 60)}h logged`}>
              <span className="text-[11px] tabular-nums text-muted-foreground">{c.workers || ''}</span>
              <div className="w-full rounded-t-sm bg-[hsl(var(--chart-2))]" style={{ height: `${(c.workers / max) * 56}px`, minHeight: c.workers ? 4 : 0 }} />
              <span className="text-[11px] text-muted-foreground">{weekday}</span>
            </div>
          );
        })}
      </div>
      {!anyone && <p className="mt-1 text-xs text-muted-foreground">Nobody logged time on this project this week. Hours come from Log time on a task.</p>}
    </div>
  );
};

const Stat: React.FC<{ label: string; value: string; hint?: string; tone?: 'bad' }> = ({ label, value, hint, tone }) => (
  <div className="min-w-0">
    <p className="text-xs text-muted-foreground">{label}</p>
    <p className={cn('truncate text-xl font-semibold tabular-nums', tone === 'bad' && 'text-destructive')}>{value}</p>
    {hint && <p className="truncate text-[11px] text-muted-foreground">{hint}</p>}
  </div>
);

const LegendRow: React.FC<{ swatch: React.ReactNode; label: string; value: string }> = ({ swatch, label, value }) => (
  <li className="flex items-center gap-2">
    {swatch}
    <span className="flex-1 text-muted-foreground">{label}</span>
    <span className="tabular-nums">{value}</span>
  </li>
);
