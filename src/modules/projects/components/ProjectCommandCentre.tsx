import React, { useEffect, useState } from 'react';
import { AlertTriangle, ArrowRight, Gauge, Loader2 } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Badge } from '@/components/core/ui/badge';
import { Button } from '@/components/core/ui/button';
import { formatMoney } from '@/utils/decimal';
import {
  projectsService,
  type CommandCentreFlagKey,
  type CostSnapshot,
  type ProjectCommandCentre as CommandCentreData,
} from '../services/projectsService';

type Money = (v: number) => string;

const FLAG_TEXT: Record<CommandCentreFlagKey, (v: number, money: Money) => string> = {
  negative_forecast_margin: (v, m) => `Forecast margin is ${m(v)} — costs to date plus open orders exceed the contract.`,
  over_budget: (v, m) => `Over budget by ${m(-v)} once open purchase orders are counted.`,
  billed_exceeds_contract: (v, m) => `Billed ${m(v)} more than the contract plus approved variations.`,
  pending_variations_exposure: (v, m) => `${m(v)} of variations await a decision — more than 10% of the contract.`,
  certified_unpaid_overdue: (v) => `${v} certified application${v === 1 ? ' is' : 's are'} past the due date and unpaid.`,
  late_deliveries: (v) => `${v} purchase order${v === 1 ? ' is' : 's are'} past the supplier ETA.`,
  critical_snags_open: (v) => `${v} critical snag${v === 1 ? ' is' : 's are'} still open.`,
  overdue_requests: (v) => `${v} RFI/request${v === 1 ? ' is' : 's are'} past the due date.`,
  mixed_currencies: (v) => `Figures add amounts across ${v} currencies.`,
};

const SEVERITY_VARIANT = { high: 'error', medium: 'warning', info: 'neutral' } as const;

const monthLabel = (ym: string) => {
  const [y, m] = ym.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('en-GB', { month: 'short' });
};

export const ProjectCommandCentre: React.FC<{
  projectId: string;
  onOpenSection: (tab: string) => void;
}> = ({ projectId, onOpenSection }) => {
  const [data, setData] = useState<CommandCentreData | null>(null);
  const [failed, setFailed] = useState(false);
  const [snaps, setSnaps] = useState<CostSnapshot[] | null>([]);

  useEffect(() => {
    let cancelled = false;
    projectsService.getCostSnapshots(projectId)
      .then((s) => { if (!cancelled) setSnaps(s); })
      .catch(() => { if (!cancelled) setSnaps(null); });
    return () => { cancelled = true; };
  }, [projectId]);

  useEffect(() => {
    let cancelled = false;
    setData(null);
    setFailed(false);
    projectsService.getProjectCommandCentre(projectId)
      .then((d) => { if (!cancelled) setData(d); })
      .catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, [projectId]);

  return (
    <Card className="dashboard-card">
      <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
        <div>
          <CardTitle className="flex items-center gap-2 font-medium"><Gauge className="h-4 w-4 text-primary" />Command centre</CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">
            Contract, billing, retention and what needs attention. Net of VAT.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => onOpenSection('finance')}>
          Finance<ArrowRight className="ml-1.5 h-3.5 w-3.5" />
        </Button>
      </CardHeader>
      <CardContent>
        {failed ? (
          <p className="text-sm text-amber-800 dark:text-amber-300">
            The command centre could not be loaded. Its figures are unknown, not zero.
          </p>
        ) : !data ? (
          <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : (
          <Body data={data} snaps={snaps} onOpenSection={onOpenSection} />
        )}
      </CardContent>
    </Card>
  );
};

const Stat: React.FC<{ label: string; value: string; hint?: string }> = ({ label, value, hint }) => (
  <div>
    <p className="text-[11px] text-muted-foreground">{label}</p>
    <p className="mt-1 text-xl font-medium tabular-nums">{value}</p>
    {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
  </div>
);

const Body: React.FC<{ data: CommandCentreData; snaps: CostSnapshot[] | null; onOpenSection: (tab: string) => void }> = ({ data, snaps, onOpenSection }) => {
  const pnl = data.dashboard.pnl ?? {};
  const currency: string = pnl.currencies?.[0] ?? data.dashboard.budget_currency ?? 'EUR';
  const money: Money = (v) => formatMoney(v ?? 0, currency);
  const { contract, open_items: oi, series } = data;

  const cash = series.billed_by_month.map((b, i) => ({
    month: monthLabel(b.month),
    Billed: b.amount,
    'Supplier bills': series.bills_by_month[i]?.amount ?? 0,
  }));
  const hasCash = cash.some((c) => c.Billed !== 0 || c['Supplier bills'] !== 0);
  const labour = series.labour_by_week.map((w) => ({
    week: new Date(w.week).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }),
    Hours: Math.round((w.minutes / 60) * 10) / 10,
  }));
  const hasLabour = labour.some((l) => l.Hours > 0);

  const items: Array<{ label: string; count: number; tab: string; alert?: boolean }> = [
    { label: 'Open RFIs', count: oi.rfis, tab: 'requests' },
    { label: 'Open submittals', count: oi.submittals, tab: 'requests' },
    { label: 'Open snags', count: oi.snags, tab: 'site', alert: oi.critical_snags > 0 },
    { label: 'Inspections to sign off', count: oi.inspections, tab: 'site' },
    { label: 'Open tasks', count: oi.tasks, tab: 'tasks', alert: oi.overdue_tasks > 0 },
    { label: 'Late deliveries', count: oi.late_deliveries, tab: 'purchases', alert: oi.late_deliveries > 0 },
  ];

  return (
    <div className="space-y-6">
      {data.flags.length > 0 && (
        <ul className="space-y-2">
          {data.flags.map((f) => (
            <li key={f.key} className="flex items-start gap-2 text-sm">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <Badge variant={SEVERITY_VARIANT[f.severity]}>{f.severity}</Badge>
              <span>{FLAG_TEXT[f.key]?.(f.value, money) ?? f.key}</span>
            </li>
          ))}
        </ul>
      )}

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
        <Stat
          label="Contract incl. variations"
          value={contract.total > 0 ? money(contract.total) : '—'}
          hint={contract.variations_approved !== 0 ? `${money(contract.variations_approved)} approved variations` : 'Accepted quotes'}
        />
        <Stat label="Billed" value={money(pnl.billed_revenue ?? 0)} hint="Issued invoices, less credit notes" />
        <Stat label="Certified" value={money(data.certified)} hint="Progress applications" />
        <Stat label="Retention held" value={money(data.retention.outstanding)} hint={data.retention.released > 0 ? `${money(data.retention.released)} released` : undefined} />
        <Stat
          label="Variations pending"
          value={money(contract.variations_pending)}
          hint={contract.variations_pending_count > 0 ? `${contract.variations_pending_count} awaiting a decision` : 'None awaiting a decision'}
        />
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {items.map((i) => (
          <button
            key={i.label}
            type="button"
            onClick={() => onOpenSection(i.tab)}
            className="panel-interactive flex items-center justify-between rounded-sm border border-hairline bg-card px-3 py-2 text-left text-sm"
          >
            <span className="text-muted-foreground">{i.label}</span>
            <span className={`tabular-nums font-medium ${i.alert ? 'text-destructive' : ''}`}>{i.count}</span>
          </button>
        ))}
      </div>

      <div>
        <p className="mb-2 text-xs text-muted-foreground">Cost to date plus open orders, against the cost budget — one point a day</p>
        {snaps === null ? (
          <p className="text-sm text-amber-800 dark:text-amber-300">
            The cost history could not be loaded. It is unknown, not empty.
          </p>
        ) : snaps.length >= 2 ? (
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={snaps.map((s) => ({
              day: new Date(s.snapshot_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }),
              Actual: s.actual_cost,
              'Actual + on order': s.actual_cost + s.committed_cost,
              Budget: s.budget_cost > 0 ? s.budget_cost : null,
            }))}>
              <CartesianGrid vertical={false} stroke="hsl(var(--hairline))" />
              <XAxis dataKey="day" tickLine={false} axisLine={false} fontSize={11} />
              <YAxis tickLine={false} axisLine={false} fontSize={11} width={48} tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
              <Tooltip formatter={(v: number) => money(v)} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Line type="monotone" dataKey="Actual" stroke="hsl(var(--chart-1))" dot={false} strokeWidth={2} />
              <Line type="monotone" dataKey="Actual + on order" stroke="hsl(var(--chart-2))" dot={false} strokeWidth={2} />
              <Line type="stepAfter" dataKey="Budget" stroke="hsl(var(--chart-3))" dot={false} strokeDasharray="4 3" connectNulls />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <p className="text-sm text-muted-foreground">
            The cost curve starts with the first nightly snapshot — {snaps.length === 1 ? 'one point is recorded so far; a second appears tomorrow.' : 'none is recorded yet.'}
          </p>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div>
          <p className="mb-2 text-xs text-muted-foreground">Billed vs supplier bills booked, last 12 months</p>
          {hasCash ? (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={cash}>
                <CartesianGrid vertical={false} stroke="hsl(var(--hairline))" />
                <XAxis dataKey="month" tickLine={false} axisLine={false} fontSize={11} />
                <YAxis tickLine={false} axisLine={false} fontSize={11} width={48} tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
                <Tooltip formatter={(v: number) => money(v)} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="Billed" fill="hsl(var(--chart-1))" radius={[2, 2, 0, 0]} />
                <Bar dataKey="Supplier bills" fill="hsl(var(--chart-2))" radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-sm text-muted-foreground">No invoices or supplier bills on this project yet.</p>
          )}
        </div>
        <div>
          <p className="mb-2 text-xs text-muted-foreground">Labour hours per week, last 8 weeks</p>
          {hasLabour ? (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={labour}>
                <CartesianGrid vertical={false} stroke="hsl(var(--hairline))" />
                <XAxis dataKey="week" tickLine={false} axisLine={false} fontSize={11} />
                <YAxis tickLine={false} axisLine={false} fontSize={11} width={32} />
                <Tooltip />
                <Bar dataKey="Hours" fill="hsl(var(--chart-3))" radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-sm text-muted-foreground">No time logged against this project in the last 8 weeks.</p>
          )}
        </div>
      </div>
    </div>
  );
};
