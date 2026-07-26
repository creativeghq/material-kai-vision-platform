/**
 * Cron Jobs Panel
 *
 * Admin-only view of all pg_cron schedules + their recent run history.
 * Mounted inside SystemHealthMonitor on /admin → Operations → System Health.
 *
 * Data source: public.get_cron_job_status() RPC (admin-gated SECURITY DEFINER
 * wrapper around cron.job + cron.job_run_details).
 */

import React, { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/core/ui/card';
import { Badge } from '@/components/core/ui/badge';
import { Button } from '@/components/core/ui/button';
import { TablePagination, paginate } from '@/components/core/ui/table-pagination';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/core/ui/dialog';
import {
  Calendar,
  CheckCircle2,
  XCircle,
  Clock,
  RefreshCw,
  AlertTriangle,
  History,
} from 'lucide-react';

interface CronJobRow {
  jobid: number;
  jobname: string;
  schedule: string;
  active: boolean;
  last_run_started_at: string | null;
  last_run_status: 'succeeded' | 'failed' | 'starting' | string | null;
  last_run_duration_ms: number | null;
  last_run_message: string | null;
  runs_24h: number;
  failures_24h: number;
}

interface CronRunHistoryRow {
  runid: number;
  start_time: string;
  end_time: string | null;
  status: string;
  return_message: string | null;
  duration_ms: number | null;
}

const formatRelative = (iso: string | null): string => {
  if (!iso) return '—';
  const date = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  return `${diffDay}d ago`;
};

const formatDuration = (ms: number | null): string => {
  if (ms == null) return '—';
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
};

const StatusBadge: React.FC<{ status: string | null }> = ({ status }) => {
  if (!status) return <span className="text-xs text-muted-foreground">Never run</span>;
  if (status === 'succeeded') {
    return (
      <span className="text-xs inline-flex items-center text-emerald-600 dark:text-emerald-400">
        <CheckCircle2 className="h-3 w-3 mr-1" />
        Success
      </span>
    );
  }
  if (status === 'failed') {
    return (
      <span className="text-xs inline-flex items-center text-red-500 dark:text-red-400">
        <XCircle className="h-3 w-3 mr-1" />
        Failed
      </span>
    );
  }
  return (
    <span className="text-xs inline-flex items-center capitalize text-amber-600 dark:text-amber-400">
      <Clock className="h-3 w-3 mr-1" />
      {status}
    </span>
  );
};

export const CronJobsPanel: React.FC = () => {
  const [jobs, setJobs] = useState<CronJobRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedJob, setSelectedJob] = useState<string | null>(null);
  const [history, setHistory] = useState<CronRunHistoryRow[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyPage, setHistoryPage] = useState(1);

  const fetchJobs = async () => {
    setLoading(true);
    setError(null);
    const { data, error: rpcError } = await supabase.rpc(
      'get_cron_job_status',
    );
    if (rpcError) {
      setError(rpcError.message);
      setJobs([]);
    } else {
      setJobs((data ?? []) as CronJobRow[]);
    }
    setLoading(false);
  };

  const openHistory = async (jobname: string) => {
    setSelectedJob(jobname);
    setHistory([]);
    setHistoryPage(1); // opening a different job must not inherit the previous job's page
    setHistoryLoading(true);
    const { data, error: rpcError } = await supabase.rpc(
      'get_cron_run_history',
      // Raised from 30 now that the dialog pages — per-minute crons blew past 30 in half an hour.
      { p_jobname: jobname, p_limit: 200 },
    );
    if (!rpcError) {
      setHistory((data ?? []) as CronRunHistoryRow[]);
    }
    setHistoryLoading(false);
  };

  useEffect(() => {
    fetchJobs();
    const interval = setInterval(fetchJobs, 60000); // refresh every 60s
    return () => clearInterval(interval);
  }, []);

  const totalFailures24h = jobs.reduce((sum, j) => sum + (j.failures_24h || 0), 0);
  const inactive = jobs.filter((j) => !j.active).length;

  return (
    <Card className="dashboard-card">
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              Cron Jobs
              {totalFailures24h > 0 && (
                <Badge variant="destructive">
                  <AlertTriangle className="h-3 w-3 mr-1" />
                  {totalFailures24h} failure{totalFailures24h === 1 ? '' : 's'} in 24h
                </Badge>
              )}
              {inactive > 0 && (
                <Badge variant="outline" className="border-yellow-500 text-yellow-500">
                  {inactive} inactive
                </Badge>
              )}
            </CardTitle>
            <CardDescription>
              Scheduled tasks (pg_cron). Click a row to see run history.
            </CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={fetchJobs}
            disabled={loading}
            className="rounded-full"
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {error && (
          <div className="mx-6 mb-4 p-3 rounded-md border border-destructive/50 bg-destructive/10 text-sm text-destructive">
            {error}
          </div>
        )}
        {loading && jobs.length === 0 ? (
          <div className="px-6 py-8 text-center text-sm text-muted-foreground">
            Loading cron jobs…
          </div>
        ) : jobs.length === 0 && !error ? (
          <div className="px-6 py-8 text-center text-sm text-muted-foreground">
            No cron jobs scheduled.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-6 py-3 font-medium">Job</th>
                  <th className="px-3 py-3 font-medium">Schedule</th>
                  <th className="px-3 py-3 font-medium">Last run</th>
                  <th className="px-3 py-3 font-medium">Status</th>
                  <th className="px-3 py-3 font-medium">Duration</th>
                  <th className="px-3 py-3 font-medium text-right">24h runs</th>
                  <th className="px-3 py-3 font-medium text-right">24h fail</th>
                  <th className="px-6 py-3 font-medium text-right">Active</th>
                </tr>
              </thead>
              <tbody>
                {jobs.map((j) => (
                  <tr
                    key={j.jobid}
                    className="border-b border-border/40 hover:bg-muted/30 cursor-pointer"
                    onClick={() => openHistory(j.jobname)}
                  >
                    <td className="px-6 py-3 font-medium">
                      <div className="flex items-center gap-2">
                        <span>{j.jobname}</span>
                        <History className="h-3 w-3 text-muted-foreground" />
                      </div>
                    </td>
                    <td className="px-3 py-3 font-mono text-xs text-muted-foreground">
                      {j.schedule}
                    </td>
                    <td className="px-3 py-3 text-muted-foreground">
                      {formatRelative(j.last_run_started_at)}
                    </td>
                    <td className="px-3 py-3">
                      <StatusBadge status={j.last_run_status} />
                    </td>
                    <td className="px-3 py-3 text-muted-foreground">
                      {formatDuration(j.last_run_duration_ms)}
                    </td>
                    <td className="px-3 py-3 text-right">{j.runs_24h}</td>
                    <td className="px-3 py-3 text-right">
                      {j.failures_24h > 0 ? (
                        <span className="text-destructive font-semibold">
                          {j.failures_24h}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">0</span>
                      )}
                    </td>
                    <td className="px-6 py-3 text-right">
                      {j.active ? (
                        <span className="text-xs text-emerald-600 dark:text-emerald-400">on</span>
                      ) : (
                        <span className="text-xs text-muted-foreground">off</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>

      <Dialog
        open={selectedJob !== null}
        onOpenChange={(open) => !open && setSelectedJob(null)}
      >
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <History className="h-5 w-5" />
              Run history — <span className="font-mono text-base">{selectedJob}</span>
            </DialogTitle>
          </DialogHeader>
          {historyLoading ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              Loading history…
            </div>
          ) : history.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              No runs recorded yet.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="py-2 pr-3 font-medium">Started</th>
                    <th className="py-2 pr-3 font-medium">Status</th>
                    <th className="py-2 pr-3 font-medium">Duration</th>
                    <th className="py-2 font-medium">Message</th>
                  </tr>
                </thead>
                <tbody>
                  {paginate(history, historyPage).map((r) => (
                    <tr key={r.runid} className="border-b border-border/40 align-top">
                      <td className="py-2 pr-3 whitespace-nowrap text-muted-foreground">
                        {new Date(r.start_time).toLocaleString()}
                      </td>
                      <td className="py-2 pr-3">
                        <StatusBadge status={r.status} />
                      </td>
                      <td className="py-2 pr-3 text-muted-foreground whitespace-nowrap">
                        {formatDuration(r.duration_ms)}
                      </td>
                      <td className="py-2 text-xs font-mono break-all text-muted-foreground">
                        {r.return_message || '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <TablePagination
                page={historyPage}
                total={history.length}
                onPageChange={setHistoryPage}
                label="runs"
                className="px-0"
              />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
};
