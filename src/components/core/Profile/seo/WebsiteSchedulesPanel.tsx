import React, { useCallback, useEffect, useRef, useState } from 'react';
import { CalendarClock, Loader2 } from 'lucide-react';

import { Badge } from '@/components/core/ui/badge';
import { Button } from '@/components/core/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/core/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/core/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/core/ui/table';
import { useToast } from '@/hooks/use-toast';
import {
  userWebsitesService, type CollectorCadence, type CollectorEstimate, type CollectorKind, type CollectorSchedule, type UserWebsite,
} from '@/services/userWebsitesService';
import { formatNumber } from '@/utils/decimal';
import { COLLECTOR_CADENCES, RUNS_PER_MONTH } from '@/services/seo/collectorSchedules';
import { timeAgo } from '@/utils/datetime';

const LABEL: Record<CollectorKind, { name: string; what: string }> = {
  rank_tracking: { name: 'Rank tracking', what: 'Google position of every tracked keyword' },
  domain_tracking: { name: 'Domain tracking', what: 'Rank, keywords, traffic and backlinks of the domain and its competitors' },
  site_audit: { name: 'Homepage audit', what: 'On-page checks of the homepage' },
  page_crawl: { name: 'Page crawl', what: 'Reads the pages Google shows and the ones not read yet' },
};
const CADENCE_LABEL: Record<CollectorCadence, string> = { off: 'Off', daily: 'Daily', weekly: 'Weekly', monthly: 'Monthly' };

const monthly = (perRun: number | null, cadence: CollectorCadence) => (perRun == null ? null : Math.ceil(perRun * RUNS_PER_MONTH[cadence]));

/** Website → Reports → Schedules: the owner decides what runs, how often, and sees the price first. */
export const WebsiteSchedulesPanel: React.FC<{ website: UserWebsite }> = ({ website }) => {
  const { toast } = useToast();
  const [schedules, setSchedules] = useState<CollectorSchedule[] | null>(null);
  const [estimates, setEstimates] = useState<CollectorEstimate[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<{ collector: CollectorKind; cadence: CollectorCadence } | null>(null);
  const [busy, setBusy] = useState(false);
  const currentId = useRef(website.id);

  const load = useCallback(async () => {
    setError(null);
    const [s, e] = await Promise.allSettled([userWebsitesService.schedules(website.id), userWebsitesService.scheduleEstimates(website.id)]);
    if (currentId.current !== website.id) return;
    if (s.status === 'fulfilled') setSchedules(s.value);
    else { setSchedules((v) => v ?? []); setError(`Could not read the schedules: ${s.reason instanceof Error ? s.reason.message : String(s.reason)}`); }
    if (e.status === 'fulfilled') setEstimates(e.value);
    else setError(`Prices are unavailable right now: ${e.reason instanceof Error ? e.reason.message : String(e.reason)}`);
  }, [website.id]);
  useEffect(() => {
    currentId.current = website.id;
    setSchedules(null);
    setEstimates(null);
    setPending(null);
    void load();
  }, [load, website.id]);

  const apply = async (collector: CollectorKind, cadence: CollectorCadence) => {
    setBusy(true);
    try {
      await userWebsitesService.setSchedule(website.id, collector, cadence);
      toast({ title: cadence === 'off' ? `${LABEL[collector].name} switched off` : `${LABEL[collector].name}: ${CADENCE_LABEL[cadence].toLowerCase()}` });
      setPending(null);
      await load();
    } catch (e) {
      toast({ title: 'Not saved', description: e instanceof Error ? e.message : String(e), variant: 'destructive' });
    } finally { setBusy(false); }
  };

  const choose = (collector: CollectorKind, cadence: CollectorCadence) => {
    if (cadence === 'off') void apply(collector, cadence);
    else setPending({ collector, cadence });
  };

  const est = (c: CollectorKind) => estimates?.find((e) => e.collector === c) ?? null;
  const pendingEst = pending ? est(pending.collector) : null;

  return (
    <Card className="dashboard-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base"><CalendarClock className="h-4 w-4 text-primary" /> Schedules</CardTitle>
        <CardDescription>
          Paid data collection runs only on the schedule you set here, and is charged to whoever switched it on, at the real
          provider cost. The figures are the most one run can cost; it is usually less.
        </CardDescription>
        {error && <p className="text-xs text-amber-700 dark:text-amber-300">{error}</p>}
      </CardHeader>
      <CardContent className="p-0">
        {schedules == null ? <Loader2 className="m-4 h-4 w-4 animate-spin text-muted-foreground" /> : (
          <div className="table-scroll">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Collector</TableHead>
                  <TableHead>Schedule</TableHead>
                  <TableHead className="text-right">Per run (max)</TableHead>
                  <TableHead className="text-right">Per month (max)</TableHead>
                  <TableHead>Last run</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(Object.keys(LABEL) as CollectorKind[]).map((c) => {
                  const s = schedules.find((x) => x.collector === c);
                  const e = est(c);
                  const cadence = s?.cadence ?? 'off';
                  return (
                    <TableRow key={c}>
                      <TableCell>
                        <div className="text-sm font-medium">{LABEL[c].name}</div>
                        <div className="text-xs text-muted-foreground">{LABEL[c].what}{e?.basis ? ` · ${e.basis}` : ''}</div>
                      </TableCell>
                      <TableCell>
                        <Select value={cadence} onValueChange={(v) => choose(c, v as CollectorCadence)} disabled={busy}>
                          <SelectTrigger className="h-8 w-32"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {COLLECTOR_CADENCES[c].map((k) => <SelectItem key={k} value={k}>{CADENCE_LABEL[k]}</SelectItem>)}
                          </SelectContent>
                        </Select>
                        {s?.platform_default && <Badge variant="neutral" className="ml-2">Platform default, not billed</Badge>}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{e?.per_run_max_credits == null ? '—' : `${formatNumber(e.per_run_max_credits)} cr`}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {cadence === 'off' ? '—' : (() => { const m = monthly(e?.per_run_max_credits ?? null, cadence); return m == null ? '—' : `${formatNumber(m)} cr`; })()}
                        {cadence !== 'off' && e?.backlog_max_credits ? <div className="text-[11px] text-muted-foreground">+ up to {formatNumber(e.backlog_max_credits)} cr once, for the unread backlog</div> : null}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {s?.last_run_at ? timeAgo(s.last_run_at) : 'Never'}
                        {s?.next_due_at && cadence !== 'off' ? ` · next ${timeAgo(s.next_due_at)}` : ''}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>

      <Dialog open={!!pending} onOpenChange={(o) => { if (!o) setPending(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{pending ? `${LABEL[pending.collector].name}: ${CADENCE_LABEL[pending.cadence].toLowerCase()}` : ''}</DialogTitle>
            <DialogDescription>
              {pending && pendingEst?.per_run_max_credits != null
                ? `Up to ${formatNumber(pendingEst.per_run_max_credits)} credits a run, so up to ${formatNumber(monthly(pendingEst.per_run_max_credits, pending.cadence) ?? 0)} a month${pendingEst.backlog_max_credits ? `, plus up to ${formatNumber(pendingEst.backlog_max_credits)} once while the backlog of unread pages is read` : ''}, charged to you at the real cost. ${pendingEst.basis}.`
                : 'The cost of a run could not be priced right now. It is charged to you at the real provider cost.'}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPending(null)}>Cancel</Button>
            <Button disabled={busy} onClick={() => pending && void apply(pending.collector, pending.cadence)}>
              {busy && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />} Turn on
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
};
