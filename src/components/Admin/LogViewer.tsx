/**
 * Admin Log Viewer Component
 *
 * Displays backend Python logs from the database.
 * Shows recent logs with filtering, search, and export capabilities.
 * Supports infinite scroll for loading more logs.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Badge } from '@/components/core/ui/badge';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/core/ui/dialog';
import { Download, RefreshCw, Search, X, Trash2, Clock, AlertCircle, Database, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { GlobalAdminHeader } from './GlobalAdminHeader';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/core/ui/select';
import { supabase } from '@/integrations/supabase/client';

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

const PAGE_SIZE = 100; // Logs per page for infinite scroll

export function LogViewer() {
  const { toast } = useToast();
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedLevel, setSelectedLevel] = useState<string>('all');
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [selectedLogger, setSelectedLogger] = useState<string>('all');
  const [selectedSource, setSelectedSource] = useState<string>('all');
  const [selectedLog, setSelectedLog] = useState<LogEntry | null>(null);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hours, setHours] = useState<number>(24);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [page, setPage] = useState(0);

  // Ref for infinite scroll observer
  const observerRef = useRef<IntersectionObserver | null>(null);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);

  // Get unique loggers from logs
  const loggers = Array.from(new Set(logs.map(log => log.logger_name).filter(Boolean)));

  // Build query with filters
  const buildQuery = useCallback((offset: number, limit: number) => {
    // Calculate cutoff time
    const cutoffTime = new Date();
    cutoffTime.setHours(cutoffTime.getHours() - hours);

    // Build query
    let query = supabase
      .from('system_logs')
      .select('*', { count: 'exact' })
      .gte('timestamp', cutoffTime.toISOString())
      .order('timestamp', { ascending: false })
      .range(offset, offset + limit - 1);

    // Apply filters
    if (selectedLevel !== 'all') {
      query = query.eq('level', selectedLevel.toUpperCase());
    }

    if (selectedLogger !== 'all') {
      query = query.eq('logger_name', selectedLogger);
    }

    if (selectedSource !== 'all') {
      query = query.contains('context', { source: selectedSource });
    }

    if (searchTerm) {
      query = query.ilike('message', `%${searchTerm}%`);
    }

    return query;
  }, [hours, selectedLevel, selectedLogger, selectedSource, searchTerm]);

  // Load initial logs from database
  const loadLogs = async () => {
    try {
      setLoading(true);
      setPage(0);

      const query = buildQuery(0, PAGE_SIZE);
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
          setHasMore(false);
          return;
        }
        throw error;
      }

      setLogs(data || []);
      setTotal(count || 0);
      setHasMore((data?.length || 0) >= PAGE_SIZE && (count || 0) > PAGE_SIZE);

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

  // Load more logs (for infinite scroll)
  const loadMoreLogs = useCallback(async () => {
    if (loadingMore || !hasMore) return;

    try {
      setLoadingMore(true);
      const nextPage = page + 1;
      const offset = nextPage * PAGE_SIZE;

      const query = buildQuery(offset, PAGE_SIZE);
      const { data, error } = await query;

      if (error) throw error;

      if (data && data.length > 0) {
        setLogs(prev => [...prev, ...data]);
        setPage(nextPage);
        setHasMore(data.length >= PAGE_SIZE);
      } else {
        setHasMore(false);
      }

    } catch (error) {
      console.error('Failed to load more logs:', error);
      toast({
        title: 'Error',
        description: 'Failed to load more logs',
        variant: 'destructive',
      });
    } finally {
      setLoadingMore(false);
    }
  }, [page, hasMore, loadingMore, buildQuery, toast]);

  // Setup intersection observer for infinite scroll
  useEffect(() => {
    if (observerRef.current) {
      observerRef.current.disconnect();
    }

    observerRef.current = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !loading && !loadingMore) {
          loadMoreLogs();
        }
      },
      { threshold: 0.1 },
    );

    if (loadMoreRef.current) {
      observerRef.current.observe(loadMoreRef.current);
    }

    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect();
      }
    };
  }, [hasMore, loading, loadingMore, loadMoreLogs]);

  // Clear all logs
  const clearAllLogs = async () => {
    try {
      // Calculate cutoff time based on hours filter
      const cutoffTime = new Date();
      cutoffTime.setHours(cutoffTime.getHours() - hours);

      // Delete logs within the current time range (newer than cutoff time)
      const { error } = await supabase
        .from('system_logs')
        .delete()
        .gte('timestamp', cutoffTime.toISOString());

      if (error) throw error;

      setLogs([]);
      setTotal(0);

      toast({
        title: 'Logs cleared',
        description: `System logs from the last ${hours} hours have been cleared.`,
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

  // Auto-refresh every 5 seconds
  useEffect(() => {
    loadLogs();

    if (autoRefresh) {
      const interval = setInterval(loadLogs, 5000);
      return () => clearInterval(interval);
    }
  }, [autoRefresh, selectedLevel, selectedLogger, selectedSource, searchTerm, hours]);

  // Get level badge color
  const getLevelBadge = (level: string) => {
    switch (level) {
      case 'DEBUG':
        return <Badge variant="secondary" className="text-xs">DEBUG</Badge>;
      case 'INFO':
        return <Badge variant="default" className="text-xs bg-blue-500">INFO</Badge>;
      case 'WARNING':
        return <Badge variant="default" className="text-xs bg-yellow-500">WARNING</Badge>;
      case 'ERROR':
        return <Badge variant="destructive" className="text-xs">ERROR</Badge>;
      case 'CRITICAL':
        return <Badge variant="destructive" className="text-xs bg-red-700">CRITICAL</Badge>;
      default:
        return <Badge variant="outline" className="text-xs">UNKNOWN</Badge>;
    }
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
                  <Database className="h-5 w-5" />
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
                  Clear All
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {/* Filters */}
            <div className="flex gap-4 mb-4 flex-wrap">
              <div className="flex-1 min-w-[200px] relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  type="text"
                  placeholder="Search logs..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>

              <Select value={selectedLevel} onValueChange={setSelectedLevel}>
                <SelectTrigger className="w-48">
                  <SelectValue placeholder="All Levels" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Levels</SelectItem>
                  <SelectItem value="DEBUG">Debug</SelectItem>
                  <SelectItem value="INFO">Info</SelectItem>
                  <SelectItem value="WARNING">Warning</SelectItem>
                  <SelectItem value="ERROR">Error</SelectItem>
                  <SelectItem value="CRITICAL">Critical</SelectItem>
                </SelectContent>
              </Select>

              <Select value={selectedLogger} onValueChange={setSelectedLogger}>
                <SelectTrigger className="w-48">
                  <SelectValue placeholder="All Loggers" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Loggers</SelectItem>
                  {loggers.map(logger => (
                    <SelectItem value="logger" key={logger}>{logger}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={selectedSource} onValueChange={setSelectedSource}>
                <SelectTrigger className="w-40">
                  <SelectValue placeholder="All Sources" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Sources</SelectItem>
                  <SelectItem value="frontend">Frontend</SelectItem>
                  <SelectItem value="backend">Backend</SelectItem>
                </SelectContent>
              </Select>

              <Select value={hours.toString()} onValueChange={(v) => setHours(Number(v))}>
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">Last 1h</SelectItem>
                  <SelectItem value="6">Last 6h</SelectItem>
                  <SelectItem value="24">Last 24h</SelectItem>
                  <SelectItem value="168">Last 7d</SelectItem>
                  <SelectItem value="720">Last 30d</SelectItem>
                </SelectContent>
              </Select>

              {(searchTerm || selectedLevel !== 'all' || selectedLogger !== 'all' || selectedSource !== 'all') && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setSearchTerm('');
                    setSelectedLevel('all');
                    setSelectedLogger('all');
                    setSelectedSource('all');
                  }}
                >
                  <X className="h-4 w-4 mr-2" />
                  Clear
                </Button>
              )}
            </div>

            {/* Logs Table */}
            <div className="border rounded-lg overflow-hidden">
              <div className="max-h-[600px] overflow-y-auto">
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

                    {/* Infinite scroll trigger */}
                    <div
                      ref={loadMoreRef}
                      className="h-16 flex items-center justify-center"
                    >
                      {loadingMore && (
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          <span className="text-sm">Loading more logs...</span>
                        </div>
                      )}
                      {!loadingMore && hasMore && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={loadMoreLogs}
                          className="text-muted-foreground"
                        >
                          Load more ({logs.length} of {total})
                        </Button>
                      )}
                      {!hasMore && logs.length > 0 && (
                        <span className="text-sm text-muted-foreground">
                          All {logs.length} logs loaded
                        </span>
                      )}
                    </div>
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
                  <label className="text-sm font-medium text-muted-foreground">Timestamp</label>
                  <p className="text-sm font-mono">{new Date(selectedLog.timestamp).toLocaleString()}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Level</label>
                  <div className="mt-1">{getLevelBadge(selectedLog.level)}</div>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Logger</label>
                  <p className="text-sm">{selectedLog.logger_name}</p>
                </div>
                {selectedLog.job_id && (
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Job ID</label>
                    <p className="text-sm font-mono">{selectedLog.job_id}</p>
                  </div>
                )}
                {selectedLog.request_id && (
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Request ID</label>
                    <p className="text-sm font-mono">{selectedLog.request_id}</p>
                  </div>
                )}
              </div>

              <div>
                <label className="text-sm font-medium text-muted-foreground">Message</label>
                <p className="text-sm mt-1 p-3 bg-muted text-foreground rounded border border-border">{selectedLog.message}</p>
              </div>

              {selectedLog.context && Object.keys(selectedLog.context).length > 0 && (
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Context</label>
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

