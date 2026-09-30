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
import { formatDate } from '@/utils/datetime';
import { cn } from '@/lib/utils';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/core/ui/table';
import {
  HubEmptyState,
  HubFilterSelect,
  HubResetFilters,
  HubSortButton,
  HubToolbar,
  HUB_FILTER_ALL,
  useHubTable,
  type HubSort,
  type HubTableField,
} from '@/components/core/hub';
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
  /** The edge function this job POSTs to, or null for a pure-SQL job. */
  target_function: string | null;
  /** What that invocation ACTUALLY returned. Null = no record; see StatusBadge. */
  last_invocation_status: number | null;
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

/** What a cron's status actually means. */
const StatusBadge: React.FC<{
  status: string | null;
  invocationStatus?: number | null;
  targetFunction?: string | null;
}> = ({ status, invocationStatus, targetFunction }) => {
  if (!status) return <span className="text-xs text-muted-foreground">Never run</span>;
  // The function's own answer outranks pg_cron's, in both directions.
  if (invocationStatus != null && invocationStatus >= 400) {
    return (
      <span
        className="text-xs inline-flex items-center text-red-500 dark:text-red-400"
        title={`pg_cron reported "${status}" because the request was enqueued. ${targetFunction ?? 'The function'} actually returned ${invocationStatus}.`}
      >
        <XCircle className="h-3 w-3 mr-1" />
        Function failed · {invocationStatus}
      </span>
    );
  }
  if (status === 'succeeded') {
    const verified = invocationStatus != null;
    if (!verified && targetFunction) {
      return (
        <span
          className="text-xs inline-flex items-center text-muted-foreground"
          title={`pg_cron enqueued the request to ${targetFunction}, but no invocation was recorded, so whether the work ran is unknown.`}
        >
          <Clock className="h-3 w-3 mr-1" />
          Sent · not confirmed
        </span>
      );
    }
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

const JOB_FIELDS: HubTableField<CronJobRow>[] = [
  { id: 'job', sortValue: (j) => j.jobname, searchText: (j) => `${j.jobname} ${j.target_function ?? ''}` },
  { id: 'schedule', sortValue: (j) => j.schedule },
  { id: 'last_run', sortValue: (j) => j.last_run_started_at },
  {
    id: 'status',
    sortValue: (j) => j.last_run_status,
    filterValue: (j) => j.last_run_status,
    filterLabel: 'Status',
    filterOptionLabel: (v) => v.charAt(0).toUpperCase() + v.slice(1),
  },
  { id: 'duration', sortValue: (j) => j.last_run_duration_ms },
  { id: 'runs', sortValue: (j) => j.runs_24h },
  { id: 'fails', sortValue: (j) => j.failures_24h },
  {
    id: 'active',
    sortValue: (j) => j.active,
    filterValue: (j) => (j.active ? 'on' : 'off'),
    filterLabel: 'Active',
    filterOptionLabel: (v) => (v === 'on' ? 'Active' : 'Inactive'),
  },
];

const SortHead: React.FC<{
  id: string;
  sort?: HubSort;
  onSort: (id: string) => void;
  align?: 'left' | 'right';
  className?: string;
  children: React.ReactNode;
}> = ({ id, sort, onSort, align, className, children }) => {
  const active = sort?.columnId === id ? sort.direction : undefined;
  return (
    <TableHead
      className={cn(align === 'right' && 'text-right', className)}
      aria-sort={active ? (active === 'asc' ? 'ascending' : 'descending') : undefined}
    >
      <HubSortButton active={active} align={align} onClick={() => onSort(id)}>
        {children}
      </HubSortButton>
    </TableHead>
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

  const jobTable = useHubTable(jobs, JOB_FIELDS);
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
          <>
            <HubToolbar
              search={jobTable.search}
              onSearchChange={jobTable.setSearch}
              searchPlaceholder="Search jobs"
              filters={
                <>
                  <HubFilterSelect
                    label="Status"
                    value={jobTable.filters.status ?? HUB_FILTER_ALL}
                    options={jobTable.filterOptions.status}
                    onChange={(v) => jobTable.setFilter('status', v)}
                  />
                  <HubFilterSelect
                    label="Active"
                    value={jobTable.filters.active ?? HUB_FILTER_ALL}
                    options={jobTable.filterOptions.active}
                    onChange={(v) => jobTable.setFilter('active', v)}
                  />
                  <HubResetFilters count={jobTable.activeFilterCount} onReset={jobTable.reset} />
                </>
              }
            />
            <Table>
              <TableHeader>
                <TableRow>
                  <SortHead id="job" sort={jobTable.sort} onSort={jobTable.toggleSort}>Job</SortHead>
                  <SortHead id="schedule" sort={jobTable.sort} onSort={jobTable.toggleSort} className="hidden lg:table-cell">Schedule</SortHead>
                  <SortHead id="last_run" sort={jobTable.sort} onSort={jobTable.toggleSort} className="hidden sm:table-cell">Last run</SortHead>
                  <SortHead id="status" sort={jobTable.sort} onSort={jobTable.toggleSort}>Status</SortHead>
                  <SortHead id="duration" sort={jobTable.sort} onSort={jobTable.toggleSort} align="right" className="hidden md:table-cell">Duration</SortHead>
                  <SortHead id="runs" sort={jobTable.sort} onSort={jobTable.toggleSort} align="right" className="hidden md:table-cell">24h runs</SortHead>
                  <SortHead id="fails" sort={jobTable.sort} onSort={jobTable.toggleSort} align="right">24h fail</SortHead>
                  <SortHead id="active" sort={jobTable.sort} onSort={jobTable.toggleSort} align="right" className="hidden sm:table-cell">Active</SortHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {jobTable.rows.length === 0 && (
                  <TableRow className="hover:bg-transparent">
                    <TableCell colSpan={8} className="p-0">
                      <HubEmptyState
                        variant="filtered"
                        title="No cron jobs match these filters"
                        action={
                          <Button variant="outline" size="sm" onClick={jobTable.reset}>
                            Clear filters
                          </Button>
                        }
                      />
                    </TableCell>
                  </TableRow>
                )}
                {jobTable.rows.map((j) => (
                  <TableRow
                    key={j.jobid}
                    className="cursor-pointer"
                    // Row onClick is a MOUSE CONVENIENCE only — the keyboard/AT path is the button on the
                    // primary cell. A <tr> cannot be made focusable correctly: tabIndex + role="button" on a
                    // row is invalid ARIA and yields a focus stop with no name.
                    onClick={() => openHistory(j.jobname)}
                  >
                    <TableCell>
                      <div className="flex min-w-0 items-center gap-2">
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); openHistory(j.jobname); }}
                          className="block max-w-[18rem] truncate text-left font-semibold text-primary hover:underline rounded-xs focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          title={j.jobname}
                        >
                          {j.jobname}
                        </button>
                        <History className="h-3 w-3 shrink-0 text-muted-foreground" />
                      </div>
                    </TableCell>
                    <TableCell className="hidden whitespace-nowrap font-mono text-xs text-muted-foreground lg:table-cell">
                      {j.schedule}
                    </TableCell>
                    <TableCell className="hidden whitespace-nowrap text-muted-foreground sm:table-cell">
                      {formatRelative(j.last_run_started_at)}
                    </TableCell>
                    <TableCell>
                      <StatusBadge
                        status={j.last_run_status}
                        invocationStatus={j.last_invocation_status}
                        targetFunction={j.target_function}
                      />
                    </TableCell>
                    <TableCell className="hidden text-right tabular-nums text-muted-foreground md:table-cell">
                      {formatDuration(j.last_run_duration_ms)}
                    </TableCell>
                    <TableCell className="hidden text-right tabular-nums md:table-cell">{j.runs_24h}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {j.failures_24h > 0 ? (
                        <span className="text-destructive font-semibold">
                          {j.failures_24h}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">0</span>
                      )}
                    </TableCell>
                    <TableCell className="hidden text-right sm:table-cell">
                      {j.active ? (
                        <span className="text-xs text-emerald-600 dark:text-emerald-400">on</span>
                      ) : (
                        <span className="text-xs text-muted-foreground">off</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </>
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
            <div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Started</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Duration</TableHead>
                    <TableHead className="hidden sm:table-cell">Message</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginate(history, historyPage).map((r) => (
                    <TableRow key={r.runid} className="align-top">
                      <TableCell className="whitespace-nowrap text-muted-foreground">
                        {formatDate(r.start_time, { withTime: true })}
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={r.status} />
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-right tabular-nums text-muted-foreground">
                        {formatDuration(r.duration_ms)}
                      </TableCell>
                      <TableCell className="hidden text-xs font-mono break-all text-muted-foreground sm:table-cell">
                        {r.return_message || '—'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
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
