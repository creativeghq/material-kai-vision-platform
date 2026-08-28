/**
 * Admin Log Viewer Component
 *
 * Displays backend Python logs from the database.
 * Shows recent logs with filtering, search, and export capabilities.
 * Paginated with numbered pages — an append-forever list made it impossible to tell how many
 * logs matched a filter or to reach older ones.
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Badge } from '@/components/core/ui/badge';
import { Button } from '@/components/core/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/core/ui/dialog';
import { CalendarDays, Download, RefreshCw, Trash2, Clock, AlertCircle, Database, ListFilter } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { GlobalAdminHeader } from './GlobalAdminHeader';
import { supabase } from '@/integrations/supabase/client';
import {
  FilterBar,
  applyFiltersToQuery,
  optionsFromRows,
  type FilterGroupDef,
  type FilterValues,
  type DateRangeValue,
} from '@/components/core/filters';
import { TablePagination, TABLE_PAGE_SIZE } from '@/components/core/ui/table-pagination';
import { formatDate, toLocalISODate } from '@/utils/datetime';
type LogLevel = 'DEBUG' | 'INFO' | 'WARNING' | 'ERROR' | 'CRITICAL';

interface LogEntry {
  id: string;
  timestamp: string;
  level: LogLevel;
  logger_name: string;
  message: string;
  context?: Record<string, any>;
  job_id?: string;
  user_id?: string;
  request_id?: string;
  created_at: string;
}

const PAGE_SIZE = TABLE_PAGE_SIZE;

const iso = (d: Date) => toLocalISODate(d);

/**
 * Default window. system_logs holds hundreds of thousands of rows (INFO is pruned at 7d,
 * WARNING+ at 30d), so the page must never open unbounded — the previous fixed "Last 24h"
 * Select existed for the same reason and this preserves it as a real, editable dateRange.
 */
function defaultWindow(): DateRangeValue {
  const from = new Date();
  from.setDate(from.getDate() - 1);
  return { from: iso(from), to: iso(new Date()) };
}

export function LogViewer() {
  const { toast } = useToast();
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [selectedLog, setSelectedLog] = useState<LogEntry | null>(null);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  // 1-based page. Reset by the effect below on every filter change — otherwise narrowing the
  // filters while on page 5 leaves you staring at an empty table with no obvious way back.
  const [page, setPage] = useState(1);
  const [values, setValues] = useState<FilterValues>(() => ({ timestamp: defaultWindow() }));

  // Loggers are free-form strings written by whatever module logged, so the option list is
  // derived from the rows currently loaded.
  const loggerOptions = useMemo(() => optionsFromRows(logs, (l) => l.logger_name), [logs]);

  const groups = useMemo<FilterGroupDef[]>(() => [
    {
      key: 'general', label: 'Log', icon: ListFilter,
      fields: [
        { key: 'q', type: 'text', label: 'Message', placeholder: 'Search logs…', column: 'message' },
        {
          key: 'level', type: 'multi', label: 'Level',
          description: 'Multi-select — "everything at WARNING and above" is two clicks.',
          column: 'level',
          options: [
            { value: 'DEBUG', label: 'Debug' },
            { value: 'INFO', label: 'Info' },
            { value: 'WARNING', label: 'Warning' },
            { value: 'ERROR', label: 'Error' },
            { value: 'CRITICAL', label: 'Critical' },
          ],
        },
        { key: 'logger_name', type: 'multi', label: 'Logger', column: 'logger_name', options: loggerOptions, searchable: true },
        {
          // No `column`: this lives inside the `context` jsonb and needs `contains()`,
          // which has no generic mapping. Composed by hand in buildQuery.
          key: 'source', type: 'select', label: 'Source',
          options: [{ value: 'backend', label: 'Backend' }, { value: 'frontend', label: 'Frontend' }],
        },
      ],
    },
    {
      key: 'time', label: 'Time', icon: CalendarDays,
      fields: [{
        key: 'timestamp', type: 'dateRange', label: 'Time window',
        description: 'Defaults to the last day so the page never loads all history.',
        column: 'timestamp',
      }],
    },
  ], [loggerOptions]);

  const window_ = (values.timestamp as DateRangeValue | undefined) ?? {};

  const buildQuery = useCallback((offset: number, limit: number) => {
    let query: any = supabase
      .from('system_logs')
      .select('*', { count: 'exact' })
      .order('timestamp', { ascending: false })
      .range(offset, offset + limit - 1);

    query = applyFiltersToQuery(query, groups, values);

    // Backstop: "Clear all" can wipe the default window, and an exact count over the whole
    // table (hundreds of thousands of rows) is not something a log page should ever issue.
    const win = (values.timestamp as DateRangeValue | undefined) ?? {};
    if (!win.from && !win.to) {
      const floor = new Date();
      floor.setDate(floor.getDate() - 30);
      query = query.gte('timestamp', floor.toISOString());
    }

    const source = values.source;
    if (source) query = query.contains('context', { source });

    return query;
  }, [groups, values]);

  // Load initial logs from database
  const loadLogs = async () => {
    try {
      setLoading(true);

      const query = buildQuery((page - 1) * PAGE_SIZE, PAGE_SIZE);
      const { data, error, count } = await query;

      if (error) {
        // Check if table doesn't exist
        if (error.message.includes('relation') && error.message.includes('does not exist')) {
          toast({
            title: 'Database Setup Required',
            description: 'The system_logs table needs to be created. Please run the database migrations.',
            variant: 'destructive',
          });
          setLogs([]);
          setTotal(0);
          return;
        }
        throw error;
      }

      setLogs(data || []);
      setTotal(count || 0);

    } catch (error) {
      console.error('Failed to load logs:', error);
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to load logs from database',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  // Clear the logs inside the active time window. Scoped to the window (not the other
  // filters) so the button's blast radius stays something the operator can see on screen.
  const clearAllLogs = async () => {
    if (!window_.from && !window_.to) {
      toast({ title: 'Pick a time window first', description: 'Clearing is scoped to the selected window.', variant: 'destructive' });
      return;
    }
    try {
      let del: any = supabase.from('system_logs').delete();
      if (window_.from) del = del.gte('timestamp', window_.from);
      if (window_.to) del = del.lte('timestamp', `${window_.to}T23:59:59.999`);

      const { error } = await del;
      if (error) throw error;

      setLogs([]);
      setTotal(0);

      toast({
        title: 'Logs cleared',
        description: `System logs between ${window_.from ?? 'the beginning'} and ${window_.to ?? 'now'} have been cleared.`,
      });

      // Reload to show remaining logs
      await loadLogs();
    } catch (error) {
      console.error('Failed to clear logs:', error);
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to clear logs',
        variant: 'destructive',
      });
    }
  };

  useEffect(() => { setPage(1); }, [values]);

  // Auto-refresh every 5 seconds
  useEffect(() => {
    loadLogs();

    if (autoRefresh) {
      const interval = setInterval(loadLogs, 5000);
      return () => clearInterval(interval);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRefresh, values, page]);

  // Get level as a plain colored word (no pill) — house rule for table/detail rows.
  const getLevelBadge = (level: string) => {
    const tone: Record<string, string> = {
      DEBUG: 'text-muted-foreground',
      INFO: 'text-blue-500 dark:text-blue-400',
      WARNING: 'text-amber-600 dark:text-amber-400',
      ERROR: 'text-red-500 dark:text-red-400',
      CRITICAL: 'text-red-600 dark:text-red-400',
    };
    return (
      <span className={`text-xs font-medium ${tone[level] || 'text-muted-foreground'}`}>
        {tone[level] ? level : 'UNKNOWN'}
      </span>
    );
  };

  // Format timestamp
  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('en-US', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  // Get relative time
  const getRelativeTime = (timestamp: string) => {
    const now = Date.now();
    const then = new Date(timestamp).getTime();
    const diff = now - then;

    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days}d ago`;
    if (hours > 0) return `${hours}h ago`;
    if (minutes > 0) return `${minutes}m ago`;
    return `${seconds}s ago`;
  };

  // Open details modal
  function openDetailsModal(log: LogEntry) {
    setSelectedLog(log);
    setShowDetailsModal(true);
  }

  return (
    <div className="min-h-screen">
      <GlobalAdminHeader
        title="Application Logs"
        description="Backend Python logs from database"
        breadcrumbs={[
          { label: 'Admin', path: '/admin' },
          { label: 'Logs' },
        ]}
        badge="Monitoring"
      />

      <div className="p-3 sm:p-6 space-y-4">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Database className="h-4 w-4" />
                  Backend System Logs
                </CardTitle>
                <CardDescription>
                  Showing {logs.length} of {total} logs from database
                  {loading && <span className="ml-2 text-primary">Loading...</span>}
                </CardDescription>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setAutoRefresh(!autoRefresh)}
                >
                  <RefreshCw className={`h-4 w-4 mr-2 ${autoRefresh ? 'animate-spin' : ''}`} />
                  {autoRefresh ? 'Auto' : 'Manual'}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={loadLogs}
                  disabled={loading}
                >
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Refresh
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const dataStr = JSON.stringify(logs, null, 2);
                    const dataBlob = new Blob([dataStr], { type: 'application/json' });
                    const url = URL.createObjectURL(dataBlob);
                    const link = document.createElement('a');
                    link.href = url;
                    link.download = `logs-${new Date().toISOString()}.json`;
                    link.click();
                  }}
                  disabled={logs.length === 0}
                >
                  <Download className="h-4 w-4 mr-2" />
                  Export
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={clearAllLogs}
                  disabled={logs.length === 0}
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Clear all
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <FilterBar
              className="mb-4"
              groups={groups}
              values={values}
              onChange={setValues}
              title="Filter logs"
              searchPlaceholder="Search logs…"
            />

            {/* Logs Table */}
            <div className="border rounded-lg overflow-hidden">
              <div>
                {logs.length === 0 ? (
                  <div className="p-8 text-center text-muted-foreground">
                    {loading ? (
                      <>
                        <RefreshCw className="h-12 w-12 mx-auto mb-4 text-muted-foreground/60 animate-spin" />
                        <p className="font-medium">Loading logs...</p>
                      </>
                    ) : (
                      <>
                        <Database className="h-12 w-12 mx-auto mb-4 text-muted-foreground/60" />
                        <p className="font-medium">No logs available</p>
                        <p className="text-sm">Logs will appear here as your backend processes run</p>
                      </>
                    )}
                  </div>
                ) : (
                  <>
                    <div className="table-scroll max-h-[600px] overflow-y-auto">
                    <table className="w-full">
                      <thead className="sticky top-0 bg-muted/50 border-b border-border/50">
                        <tr>
                          <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground uppercase">Time</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground uppercase">Level</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground uppercase">Logger</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground uppercase">Message</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground uppercase">Details</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {logs.map((log) => (
                          <tr key={log.id} className="hover:bg-muted/50 transition-colors">
                            <td className="px-4 py-3 whitespace-nowrap">
                              <div className="flex flex-col gap-1">
                                <span className="text-xs font-mono text-foreground">
                                  {formatTime(log.timestamp)}
                                </span>
                                <span className="text-xs text-muted-foreground flex items-center gap-1">
                                  <Clock className="h-3 w-3" />
                                  {getRelativeTime(log.timestamp)}
                                </span>
                              </div>
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap">
                              {getLevelBadge(log.level)}
                            </td>
                            <td className="px-4 py-3 text-sm">
                              <Badge variant="outline" className="text-xs">
                                {log.logger_name}
                              </Badge>
                            </td>
                            <td className="px-4 py-3 text-sm max-w-md">
                              <div className="truncate" title={log.message}>
                                {log.message}
                              </div>
                              {log.context?.exception && (
                                <div className="flex items-center gap-1 mt-1 text-xs text-destructive">
                                  <AlertCircle className="h-3 w-3" />
                                  {log.context.exception.message}
                                </div>
                              )}
                            </td>
                            <td className="px-4 py-3">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => openDetailsModal(log)}
                              >
                                View
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    </div>

                    <TablePagination
                      page={page}
                      total={total}
                      pageSize={PAGE_SIZE}
                      onPageChange={setPage}
                      label="logs"
                    />
                  </>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Details Modal */}
      <Dialog open={showDetailsModal} onOpenChange={setShowDetailsModal}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Log Details</DialogTitle>
            <DialogDescription>
              Full log entry with metadata and context
            </DialogDescription>
          </DialogHeader>

          {selectedLog && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <span className="block text-sm font-medium text-muted-foreground">Timestamp</span>
                  <p className="text-sm font-mono">{formatDate(selectedLog.timestamp, { withTime: true })}</p>
                </div>
                <div>
                  <span className="block text-sm font-medium text-muted-foreground">Level</span>
                  <div className="mt-1">{getLevelBadge(selectedLog.level)}</div>
                </div>
                <div>
                  <span className="block text-sm font-medium text-muted-foreground">Logger</span>
                  <p className="text-sm">{selectedLog.logger_name}</p>
                </div>
                {selectedLog.job_id && (
                  <div>
                    <span className="block text-sm font-medium text-muted-foreground">Job ID</span>
                    <p className="text-sm font-mono">{selectedLog.job_id}</p>
                  </div>
                )}
                {selectedLog.request_id && (
                  <div>
                    <span className="block text-sm font-medium text-muted-foreground">Request ID</span>
                    <p className="text-sm font-mono">{selectedLog.request_id}</p>
                  </div>
                )}
              </div>

              <div>
                <span className="block text-sm font-medium text-muted-foreground">Message</span>
                <p className="text-sm mt-1 p-3 bg-muted text-foreground rounded border border-border">{selectedLog.message}</p>
              </div>

              {selectedLog.context && Object.keys(selectedLog.context).length > 0 && (
                <div>
                  <span className="block text-sm font-medium text-muted-foreground">Context</span>
                  <pre className="text-xs mt-1 p-3 bg-muted text-foreground rounded border border-border overflow-x-auto">
                    {JSON.stringify(selectedLog.context, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

