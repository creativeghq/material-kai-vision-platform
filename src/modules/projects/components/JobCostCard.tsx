/**
 * Job cost: revenue against actual and committed cost, margin, WIP and the labour behind it.
 * Every figure is read from `get_project_pnl` (labour from the `get_project_labor` it embeds);
 * this component formats and never derives. `contracted_revenue` and `billed_revenue` are two
 * views of revenue and are never added — an invoice normally derives from a quote.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { Loader2, TrendingUp, TrendingDown, AlertTriangle, Clock } from 'lucide-react';
import { Button } from '@/components/core/ui/button';
import { HubEmptyState } from '@/components/core/hub';
import { LogTimeDialog } from './LogTimeDialog';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/core/ui/card';
import { fetchDisplayProfiles } from '@/services/displayProfilesService';
import { formatMoney } from '@/utils/decimal';
import { useToast } from '@/hooks/use-toast';
import type { ProjectLaborWorker } from '@/modules/finance/utils/projectLabor';
import { projectsService, type ProjectPnl } from '../services/projectsService';

const money = (n: number | null | undefined, c: string) => formatMoney(n, c);
const hoursOf = (minutes: number) => Math.round((minutes / 60) * 100) / 100;
const hours = (minutes: number) => `${(minutes / 60).toFixed(1)}h`;

const marginTone = (n: number) => (n < 0 ? 'text-destructive' : 'text-emerald-700 dark:text-emerald-400');

const WHY_UNCOSTED: Record<Exclude<ProjectLaborWorker['actual_status'], 'ok'>, string> = {
  not_on_roster: 'not on the HR roster',
  no_payroll: 'no payroll run yet',
  hours_unknown: 'payroll records no hours, so an hourly cost cannot be derived',
};

const Stat: React.FC<{ label: string; value: string; hint?: string; tone?: string }> = ({ label, value, hint, tone }) => (
  <div className="min-w-0">
    <p className="text-xs text-muted-foreground">{label}</p>
    <p className={`mt-1 truncate text-xl font-semibold tabular-nums ${tone ?? ''}`}>{value}</p>
    {hint && <p className="truncate text-[11px] text-muted-foreground" title={hint}>{hint}</p>}
  </div>
);

export const JobCostCard: React.FC<{
  projectId: string;
  /** Enables "Log time". Omitted on surfaces that only report. */
  workspaceId?: string | null;
  /** The currency behind the figures, for sibling cards whose RPC does not carry one. */
  onCurrency?: (currency: string) => void;
}> = ({ projectId, workspaceId, onCurrency }) => {
  const [logOpen, setLogOpen] = useState(false);
  const { toast } = useToast();
  const [pnl, setPnl] = useState<ProjectPnl | null>(null);
  const [failed, setFailed] = useState(false);
  const [userNames, setUserNames] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setFailed(false);
    try {
      const result = await projectsService.getProjectPnl(projectId);
      setPnl(result);
      if (result.currencies[0]) onCurrency?.(result.currencies[0]);
      const ids = result.labor.by_user.map((u) => u.user_id).filter(Boolean) as string[];
      if (ids.length) {
        const profiles = await fetchDisplayProfiles(ids);
        const names: Record<string, string> = {};
        for (const u of profiles) names[u.userId] = u.fullName || u.email || u.userId;
        setUserNames(names);
      }
    } catch (err) {
      setFailed(true);
      toast({ title: 'Failed to load job cost', description: (err as Error)?.message, variant: 'destructive' });
    }
  }, [projectId, toast, onCurrency]);
  useEffect(() => { void load(); }, [load]);

  const logTime = workspaceId ? (
    <Button size="sm" variant="outline" onClick={() => setLogOpen(true)}>
      <Clock className="mr-1 h-3.5 w-3.5" /> Log time
    </Button>
  ) : null;

  return (
    <Card className="dashboard-card">
      <CardHeader className="flex-row items-start justify-between gap-3 space-y-0 border-b border-hairline px-5 py-3">
        <div>
          <CardTitle className="flex items-center gap-2 text-sm font-medium">
            <TrendingUp className="h-4 w-4 text-primary" /> Job cost
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Margin on what was sold, and the forecast against what the client agreed to. Net of VAT.
          </p>
        </div>
        {logTime}
      </CardHeader>
      <CardContent className="space-y-5 p-5">
        {failed ? (
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-sm text-amber-800 dark:text-amber-300">Job cost could not be loaded. Its figures are unknown, not zero.</p>
            <Button size="sm" variant="outline" onClick={() => void load()}>Retry</Button>
          </div>
        ) : !pnl ? (
          <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
        ) : (
          <Body pnl={pnl} userNames={userNames} logTime={logTime} />
        )}
      </CardContent>

      {workspaceId && (
        <LogTimeDialog
          open={logOpen}
          onOpenChange={setLogOpen}
          workspaceId={workspaceId}
          projectId={projectId}
          onLogged={load}
        />
      )}
    </Card>
  );
};

const Body: React.FC<{ pnl: ProjectPnl; userNames: Record<string, string>; logTime: React.ReactNode }> = ({ pnl, userNames, logTime }) => {
  const mixed = pnl.currencies.length > 1;
  const currency = pnl.currencies[0] ?? 'EUR';
  const m = (v: number | null | undefined) => money(v, currency);

  return (
    <>
      {mixed && (
        <p className="flex items-start gap-2 text-xs text-amber-800 dark:text-amber-400">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          This project mixes {pnl.currencies.join(', ')}. Totals below add different currencies together and are
          indicative only.
        </p>
      )}

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Stat label="Contracted" value={m(pnl.contracted_revenue)} hint="Accepted quotes" />
        <Stat
          label="Revenue"
          value={m(pnl.revenue)}
          hint={pnl.order_revenue > 0.005
            ? (pnl.billed_revenue > 0.005
              ? `${m(pnl.billed_revenue)} invoiced + ${m(pnl.order_revenue)} on orders`
              : 'On orders, not yet invoiced')
            : 'Issued invoices'}
        />
        <Stat label="Spent" value={m(pnl.actual_cost)} hint="Bills, labour and expenses" />
        <Stat
          label="Margin"
          value={m(pnl.margin_amount)}
          tone={marginTone(pnl.margin_amount)}
          hint={pnl.margin_pct == null ? 'Nothing sold yet' : `${pnl.margin_pct}% of revenue`}
        />
      </div>

      <div className="divide-y divide-hairline rounded-sm border border-hairline text-sm">
        <Row label="Supplier Bills" value={m(pnl.supplier_cost)} />
        {pnl.order_cogs > 0 && <Row label="Cost of Goods on Orders" value={m(pnl.order_cogs)} hint="Stock sold on orders not yet invoiced" />}
        <Row label="Labour" value={m(pnl.labor_cost)}
          hint={pnl.labor.total_minutes > 0 ? `${hoursOf(pnl.labor.total_minutes)}h logged, at the rate on each entry` : 'No time logged'} />
        <Row label="Expenses" value={m(pnl.expense_cost)}
          hint={pnl.expense_count > 0 ? 'Approved claims' : 'No claims on this project'} />
        {pnl.pending_expense_cost > 0 && (
          <Row label="Pending Claims" value={m(pnl.pending_expense_cost)} hint="Awaiting approval — not counted yet" muted />
        )}
        <Row label="On Order" value={m(pnl.committed_cost)} hint="Purchase orders not billed yet" muted />
        <Row
          label="Forecast Margin"
          value={m(pnl.forecast_margin_amount)}
          hint={pnl.forecast_margin_pct == null ? 'No accepted quote' : `${pnl.forecast_margin_pct}% of contracted, after spent and on order`}
          tone={marginTone(pnl.forecast_margin_amount)}
        />
        <Row label="WIP" value={m(pnl.wip)} hint="Cost incurred, not yet billed" muted />
      </div>

      <Labour pnl={pnl} userNames={userNames} m={m} logTime={logTime} />
    </>
  );
};

const Labour: React.FC<{
  pnl: ProjectPnl;
  userNames: Record<string, string>;
  m: (v: number | null | undefined) => string;
  logTime: React.ReactNode;
}> = ({ pnl, userNames, m, logTime }) => {
  const { labor } = pnl;
  if (labor.entry_count === 0 && labor.by_user.length === 0) {
    return (
      <HubEmptyState
        icon={Clock}
        className="py-6"
        title="No hours logged against this job"
        description="Labour cost comes from time logged on the project."
        action={logTime ?? undefined}
      />
    );
  }

  const { payroll } = labor;
  const overspend = payroll.variance != null && payroll.variance > 0;
  const uncosted = payroll.by_worker.filter((w) => w.actual_status !== 'ok');
  const reasons = [...new Set(uncosted.map((w) => WHY_UNCOSTED[w.actual_status as Exclude<ProjectLaborWorker['actual_status'], 'ok'>]))];

  return (
    <div className="space-y-3">
      <p className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
        <Clock className="h-3 w-3" /> Labour by Person
        <span className="ml-auto font-normal tabular-nums">
          {hours(labor.total_minutes)} · {labor.entry_count} {labor.entry_count === 1 ? 'entry' : 'entries'}
        </span>
      </p>
      {labor.by_user.length > 0 && (
        <div className="divide-y divide-hairline rounded-sm border border-hairline text-sm">
          {labor.by_user.map((u) => (
            <div key={u.user_id ?? 'unassigned'} className="flex items-center gap-3 px-4 py-2">
              <span className="min-w-0 flex-1 truncate">
                {u.user_id ? (userNames[u.user_id] || u.user_id.slice(0, 8)) : 'Unassigned'}
              </span>
              <span className="w-16 text-right text-xs text-muted-foreground tabular-nums">{hoursOf(u.minutes)}h</span>
              <span className="w-24 text-right tabular-nums">{m(u.cost)}</span>
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-3 gap-3 rounded-sm border border-hairline bg-surface-sunken px-4 py-3">
        <div>
          <p className="text-[11px] text-muted-foreground">At the Typed Rate</p>
          <p className="text-sm font-semibold tabular-nums">{m(payroll.estimate_cost)}</p>
        </div>
        <div>
          <p className="text-[11px] text-muted-foreground">Payroll Actual</p>
          <p className="text-sm font-semibold tabular-nums">{payroll.actual_cost == null ? '—' : m(payroll.actual_cost)}</p>
        </div>
        <div>
          <p className="text-[11px] text-muted-foreground">Variance</p>
          {payroll.variance == null ? (
            <p className="text-sm text-muted-foreground">Not comparable</p>
          ) : (
            <p className={`flex items-center gap-1 text-sm font-semibold tabular-nums ${
              overspend ? 'text-red-700 dark:text-red-400' : 'text-emerald-700 dark:text-emerald-400'
            }`}>
              {overspend ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
              {m(Math.abs(payroll.variance))}
            </p>
          )}
        </div>
      </div>

      {payroll.uncosted_minutes > 0 && (
        <p className="text-xs text-muted-foreground">
          {payroll.costed_minutes === 0
            ? `None of the ${hours(payroll.uncosted_minutes)} logged could be costed against payroll.`
            : `The payroll comparison covers ${hours(payroll.costed_minutes)} of ${hours(payroll.costed_minutes + payroll.uncosted_minutes)}; `
              + `${hours(payroll.uncosted_minutes)} could not be costed.`}
          {reasons.length > 0 && <> Reason{reasons.length > 1 ? 's' : ''}: {reasons.join('; ')}.</>}
        </p>
      )}
      {payroll.variance != null && (
        <p className="text-xs text-muted-foreground">
          {overspend
            ? 'The hours cost more than the rate on the entries says. The job margin is optimistic by the difference.'
            : 'The hours cost less than the rate on the entries says.'}
        </p>
      )}
    </div>
  );
};

const Row: React.FC<{ label: string; value: string; hint?: string; tone?: string; muted?: boolean }> = ({
  label, value, hint, tone, muted,
}) => (
  <div className="flex items-center gap-3 px-4 py-2.5">
    <div className="min-w-0 flex-1">
      <p className={muted ? 'text-muted-foreground' : ''}>{label}</p>
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
    <span className={`tabular-nums ${tone ?? (muted ? 'text-muted-foreground' : '')}`}>{value}</span>
  </div>
);

export default JobCostCard;
