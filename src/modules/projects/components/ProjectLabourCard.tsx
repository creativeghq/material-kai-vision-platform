/**
 * A job's labour, at the rate somebody TYPED against what payroll says it actually cost (#378 N1).
 *
 * THE DEFECT THIS EXISTS FOR
 * --------------------------
 * `get_project_labor` costs a job at `minutes / 60 * time_entries.hourly_rate`. The real cost of
 * that hour is `hr_payroll_items.employer_cost` — gross plus employer contributions — which reaches
 * Finance through `post-payroll-to-finance` and never reached the job. Nothing compared them, so
 * every job's margin was built on a guess that nothing anywhere labelled as one.
 *
 * The roll-up itself had no reader at all in `src/`: it was derived, typed, and consumed only by
 * `get_project_pnl` inside SQL. This is its surface.
 *
 * WHAT IT REFUSES TO DO
 * ---------------------
 * Show a number it does not have. `actual_cost` and `variance` come back NULL when no worker on
 * the job could be costed, and this renders that as "Not comparable" with the reason — never as
 * €0.00, which would make a job look more profitable the more unpayrolled labour it consumed.
 * When only some workers are costed it says so, because a variance computed over two thirds of the
 * hours is not a variance over the job.
 *
 * The estimate is never replaced by the actual: payroll is monthly and a job is not, so the actual
 * is an ALLOCATION. Both are shown, which is also why this card does not feed the P&L — that still
 * reads the one derivation.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { Loader2, Clock, TrendingUp, TrendingDown } from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/core/ui/card';
import { formatMoney } from '@/utils/decimal';
import { useToast } from '@/hooks/use-toast';
import { getErrorMessage } from '@/core/errors/utils';
import {
  timeTrackingService, EMPTY_PROJECT_LABOR,
  type ProjectLabor, type ProjectLaborWorker,
} from '@/modules/finance/services/timeTrackingService';

const hours = (minutes: number) => `${(minutes / 60).toFixed(1)}h`;

/** Why a worker's hours could not be costed, in the operator's words. */
const WHY_UNCOSTED: Record<Exclude<ProjectLaborWorker['actual_status'], 'ok'>, string> = {
  not_on_roster: 'not on the HR roster',
  no_payroll: 'no payroll run yet',
  hours_unknown: 'payroll records no hours, so an hourly cost cannot be derived',
};

export const ProjectLabourCard: React.FC<{ projectId: string; currency?: string | null }> = ({
  projectId, currency,
}) => {
  const { toast } = useToast();
  const [labour, setLabour] = useState<ProjectLabor>(EMPTY_PROJECT_LABOR);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setLabour(await timeTrackingService.getProjectLabor(projectId));
    } catch (err) {
      toast({ title: 'Could not load labour', description: getErrorMessage(err), variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [projectId, toast]);

  useEffect(() => { void load(); }, [load]);

  if (loading) {
    return (
      <Card className="dashboard-card">
        <CardContent className="flex items-center justify-center py-10">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
        </CardContent>
      </Card>
    );
  }

  // No hours logged is a real, complete answer — not an error and not a zero-cost job.
  if (labour.entry_count === 0) {
    return (
      <Card className="dashboard-card">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm"><Clock className="h-4 w-4" /> Labour</CardTitle>
        </CardHeader>
        <CardContent className="pb-4 pt-0">
          <p className="text-sm text-muted-foreground">No hours logged against this job yet.</p>
        </CardContent>
      </Card>
    );
  }

  const { payroll } = labour;
  const money = (n: number | null) => (n == null ? '—' : formatMoney(n, currency ?? 'EUR'));
  const overspend = payroll.variance != null && payroll.variance > 0;
  const uncosted = payroll.by_worker.filter((w) => w.actual_status !== 'ok');

  return (
    <Card className="dashboard-card">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Clock className="h-4 w-4" /> Labour
          <span className="ml-auto text-xs font-normal text-muted-foreground tabular-nums">
            {hours(labour.total_minutes)} · {labour.entry_count} {labour.entry_count === 1 ? 'entry' : 'entries'}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 pb-4 pt-0">
        <div className="grid grid-cols-3 gap-3">
          <div>
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">At the typed rate</p>
            <p className="text-sm font-semibold tabular-nums">{money(payroll.estimate_cost)}</p>
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Payroll actual</p>
            <p className="text-sm font-semibold tabular-nums">{money(payroll.actual_cost)}</p>
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Variance</p>
            {payroll.variance == null ? (
              <p className="text-sm text-muted-foreground">Not comparable</p>
            ) : (
              <p className={`flex items-center gap-1 text-sm font-semibold tabular-nums ${
                overspend ? 'text-red-700 dark:text-red-400' : 'text-emerald-700 dark:text-emerald-400'
              }`}>
                {overspend ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
                {money(Math.abs(payroll.variance))}
              </p>
            )}
          </div>
        </div>

        {/* The coverage, always — a variance over two thirds of the hours is not a variance over
            the job, and the reader has to be able to see which they are looking at. */}
        {payroll.uncosted_minutes > 0 && (
          <p className="text-xs text-muted-foreground">
            {payroll.costed_minutes === 0
              ? `None of the ${hours(payroll.uncosted_minutes)} logged could be costed against payroll.`
              : `Covers ${hours(payroll.costed_minutes)} of ${hours(payroll.costed_minutes + payroll.uncosted_minutes)}; `
                + `${hours(payroll.uncosted_minutes)} could not be costed.`}
            {uncosted.length > 0 && (
              <> Reason{uncosted.length > 1 ? 's' : ''}: {[...new Set(uncosted.map((w) => WHY_UNCOSTED[
                w.actual_status as Exclude<ProjectLaborWorker['actual_status'], 'ok'>
              ]))].join('; ')}.</>
            )}
          </p>
        )}

        {payroll.variance != null && (
          <p className="text-xs text-muted-foreground">
            {overspend
              ? 'The hours cost more than the rate on the entries says. The job margin is optimistic by the difference.'
              : 'The hours cost less than the rate on the entries says.'}
          </p>
        )}
      </CardContent>
    </Card>
  );
};
