/**
 * Admin Log Viewer Component
 * 
 * Displays real-time logs from the logger service in the admin panel.
 * Shows recent logs with filtering, search, and export capabilities.
 */

import { useState, useEffect } from 'react';
import { logger, LogLevel, type LogEntry } from '@/config';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Download, RefreshCw, Search, Filter, X, Trash2, Clock, AlertCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { GlobalAdminHeader } from './GlobalAdminHeader';

export function LogViewer() {
  const { toast } = useToast();
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [filteredLogs, setFilteredLogs] = useState<LogEntry[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedLevel, setSelectedLevel] = useState<LogLevel | 'all'>('all');
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [selectedService, setSelectedService] = useState<string>('all');
  const [selectedLog, setSelectedLog] = useState<LogEntry | null>(null);
  const [showDetailsModal, setShowDetailsModal] = useState(false);

  // Get unique services from logs
  const services = Array.from(new Set(logs.map(log => log.metadata?.service).filter(Boolean))) as string[];

  // Load logs and auto-cleanup old ones
  const loadLogs = () => {
    const recentLogs = logger.getRecentLogs(100);
    setLogs(recentLogs);

    // Auto-cleanup logs older than 2 days
    const twoDaysAgo = Date.now() - (2 * 24 * 60 * 60 * 1000);
    logger.clearOldLogs(twoDaysAgo);
  };

  // Clear all logs
  const clearAllLogs = () => {
    logger.clearAllLogs();
    setLogs([]);
    toast({
      title: 'Logs cleared',
      description: 'All application logs have been cleared.',
    });
  };

  // Auto-refresh every 2 seconds
  useEffect(() => {
    loadLogs();
    
    if (autoRefresh) {
      const interval = setInterval(loadLogs, 2000);
      return () => clearInterval(interval);
    }
  }, [autoRefresh]);

  // Filter logs
  useEffect(() => {
    let filtered = [...logs];

    // Filter by level
    if (selectedLevel !== 'all') {
      filtered = filtered.filter(log => log.level === selectedLevel);
    }

    // Filter by service
    if (selectedService !== 'all') {
      filtered = filtered.filter(log => log.metadata?.service === selectedService);
    }

    // Filter by search term
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(log => 
        log.message.toLowerCase().includes(term) ||
        JSON.stringify(log.metadata).toLowerCase().includes(term) ||
        log.error?.message.toLowerCase().includes(term)
      );
    }

    setFilteredLogs(filtered);
  }, [logs, searchTerm, selectedLevel, selectedService]);

  // Get level badge color
  const getLevelBadge = (level: LogLevel) => {
    switch (level) {
      case LogLevel.DEBUG:
        return <Badge variant="secondary" className="text-xs">DEBUG</Badge>;
      case LogLevel.INFO:
        return <Badge variant="default" className="text-xs bg-blue-500">INFO</Badge>;
      case LogLevel.WARN:
        return <Badge variant="default" className="text-xs bg-yellow-500">WARN</Badge>;
      case LogLevel.ERROR:
        return <Badge variant="destructive" className="text-xs">ERROR</Badge>;
      default:
        return <Badge variant="outline" className="text-xs">UNKNOWN</Badge>;
    }
  };

  // Format timestamp with relative time
  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    const time = date.toLocaleTimeString('en-US', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
    const ms = date.getMilliseconds().toString().padStart(3, '0');
    return `${time}.${ms}`;
  };

  // Get relative time (e.g., "2 minutes ago")
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
    if (seconds > 0) return `${seconds}s ago`;
    return 'just now';
  };

  // Get full datetime string
  const getFullDateTime = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    });
  };

  // Export logs as JSON
  const exportLogs = () => {
    const dataStr = JSON.stringify(filteredLogs, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `logs-${new Date().toISOString()}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  // Open details modal
  const openDetailsModal = (log: LogEntry) => {
    setSelectedLog(log);
    setShowDetailsModal(true);
  };

  return (
    <div className="min-h-screen">
      <GlobalAdminHeader
        title="Application Logs"
        description="Real-time logs from the logger service"
        breadcrumbs={[
          { label: 'Admin', path: '/admin' },
          { label: 'Logs' },
        ]}
        badge="Monitoring"
      />

      <div className="p-6 space-y-4">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Log Viewer</CardTitle>
                <CardDescription>
                  Showing {filteredLogs.length} of {logs.length} logs
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
              >
                <RefreshCw className="h-4 w-4 mr-2" />
                Refresh
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={exportLogs}
                disabled={filteredLogs.length === 0}
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
          <div className="flex gap-4 mb-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                type="text"
                placeholder="Search logs..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            
            <div className="w-48">
              <select
                className="w-full h-10 px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={selectedLevel}
                onChange={(e) => setSelectedLevel(e.target.value === 'all' ? 'all' : Number(e.target.value) as LogLevel)}
              >
                <option value="all">All Levels</option>
                <option value={LogLevel.DEBUG}>Debug</option>
                <option value={LogLevel.INFO}>Info</option>
                <option value={LogLevel.WARN}>Warning</option>
                <option value={LogLevel.ERROR}>Error</option>
              </select>
            </div>

            <div className="w-48">
              <select
                className="w-full h-10 px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={selectedService}
                onChange={(e) => setSelectedService(e.target.value)}
              >
                <option value="all">All Services</option>
                {services.map(service => (
                  <option key={service} value={service}>{service}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Logs Table */}
          <div className="border rounded-lg overflow-hidden">
            <div className="max-h-[600px] overflow-y-auto">
              {filteredLogs.length === 0 ? (
                <div className="p-8 text-center text-gray-500">
                  {logs.length === 0 ? (
                    <>
                      <Filter className="h-12 w-12 mx-auto mb-4 text-gray-300" />
                      <p className="font-medium">No logs available</p>
                      <p className="text-sm">Logs will appear here as your application runs</p>
                    </>
                  ) : (
                    <>
                      <Search className="h-12 w-12 mx-auto mb-4 text-gray-300" />
                      <p className="font-medium">No logs match your filters</p>
                      <p className="text-sm">Try adjusting your search or filter criteria</p>
                    </>
                  )}
                </div>
              ) : (
                <table className="w-full">
                  <thead className="bg-gray-50 sticky top-0">
                    <tr>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Time</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Level</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Service</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Message</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Details</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {filteredLogs.map((log, index) => (
                      <tr key={index} className="hover:bg-gray-50">
                        <td className="px-4 py-3 whitespace-nowrap">
                          <div className="flex flex-col gap-1">
                            <span className="text-xs font-mono text-gray-900">
                              {formatTime(log.timestamp)}
                            </span>
                            <span className="text-xs text-gray-500 flex items-center gap-1">
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
                            {String(log.metadata?.service || log.service || 'System')}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-sm max-w-md">
                          <div className="truncate" title={log.message}>
                            {log.message}
                          </div>
                          {log.error && (
                            <div className="flex items-center gap-1 mt-1 text-xs text-red-600">
                              <AlertCircle className="h-3 w-3" />
                              {log.error.message}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openDetailsModal(log)}
                            className="text-xs text-blue-500 hover:text-blue-700"
                          >
                            View Details
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          {/* Stats */}
          {logs.length > 0 && (
            <div className="mt-4 flex gap-4 text-sm text-gray-600">
              <div>
                <span className="font-medium">Total:</span> {logs.length}
              </div>
              <div>
                <span className="font-medium">Errors:</span>{' '}
                {logs.filter(log => log.level === LogLevel.ERROR).length}
              </div>
              <div>
                <span className="font-medium">Warnings:</span>{' '}
                {logs.filter(log => log.level === LogLevel.WARN).length}
              </div>
              <div>
                <span className="font-medium">Info:</span>{' '}
                {logs.filter(log => log.level === LogLevel.INFO).length}
              </div>
              <div>
                <span className="font-medium">Debug:</span>{' '}
                {logs.filter(log => log.level === LogLevel.DEBUG).length}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Details Modal */}
      <Dialog open={showDetailsModal} onOpenChange={setShowDetailsModal}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {selectedLog && getLevelBadge(selectedLog.level)}
              Log Details
            </DialogTitle>
            <DialogDescription>
              {selectedLog && getFullDateTime(selectedLog.timestamp)}
            </DialogDescription>
          </DialogHeader>

          {selectedLog && (
            <div className="space-y-4">
              {/* Message */}
              <div>
                <h3 className="text-sm font-semibold text-gray-700 mb-2">Message</h3>
                <p className="text-sm bg-gray-50 p-3 rounded border">{selectedLog.message}</p>
              </div>

              {/* Service */}
              <div>
                <h3 className="text-sm font-semibold text-gray-700 mb-2">Service</h3>
                <Badge variant="outline">
                  {String(selectedLog.metadata?.service || selectedLog.service || 'System')}
                </Badge>
              </div>

              {/* Timestamp Details */}
              <div>
                <h3 className="text-sm font-semibold text-gray-700 mb-2">Timestamp</h3>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div className="bg-gray-50 p-2 rounded">
                    <span className="text-gray-600">Full Time:</span>
                    <div className="font-mono">{getFullDateTime(selectedLog.timestamp)}</div>
                  </div>
                  <div className="bg-gray-50 p-2 rounded">
                    <span className="text-gray-600">Relative:</span>
                    <div className="font-mono">{getRelativeTime(selectedLog.timestamp)}</div>
                  </div>
                </div>
              </div>

              {/* Metadata */}
              {selectedLog.metadata && Object.keys(selectedLog.metadata).length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-gray-700 mb-2">Metadata</h3>
                  <pre className="text-xs font-mono bg-gray-50 p-3 rounded border overflow-x-auto">
                    {JSON.stringify(selectedLog.metadata, null, 2)}
                  </pre>
                </div>
              )}

              {/* Error Details */}
              {selectedLog.error && (
                <div>
                  <h3 className="text-sm font-semibold text-red-700 mb-2 flex items-center gap-2">
                    <AlertCircle className="h-4 w-4" />
                    Error Details
                  </h3>
                  <div className="bg-red-50 border border-red-200 rounded p-3 space-y-2">
                    <div>
                      <span className="text-xs font-semibold text-red-700">Message:</span>
                      <p className="text-sm text-red-900 mt-1">{selectedLog.error.message}</p>
                    </div>
                    {selectedLog.error.stack && (
                      <div>
                        <span className="text-xs font-semibold text-red-700">Stack Trace:</span>
                        <pre className="text-xs font-mono text-red-800 mt-1 overflow-x-auto whitespace-pre-wrap">
                          {selectedLog.error.stack}
                        </pre>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Raw Log Data */}
              <div>
                <h3 className="text-sm font-semibold text-gray-700 mb-2">Raw Log Data</h3>
                <pre className="text-xs font-mono bg-gray-900 text-green-400 p-3 rounded overflow-x-auto">
                  {JSON.stringify(selectedLog, null, 2)}
                </pre>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
      </div>
    </div>
  );
}
