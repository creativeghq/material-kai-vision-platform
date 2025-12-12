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
import { Download, RefreshCw, Search, Filter, X } from 'lucide-react';

export function LogViewer() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [filteredLogs, setFilteredLogs] = useState<LogEntry[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedLevel, setSelectedLevel] = useState<LogLevel | 'all'>('all');
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [selectedService, setSelectedService] = useState<string>('all');

  // Get unique services from logs
  const services = Array.from(new Set(logs.map(log => log.metadata?.service).filter(Boolean))) as string[];

  // Load logs
  const loadLogs = () => {
    const recentLogs = logger.getRecentLogs(100);
    setLogs(recentLogs);
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

  // Format timestamp
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

  // Clear logs
  const clearLogs = () => {
    logger.clearBuffer();
    setLogs([]);
    setFilteredLogs([]);
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Application Logs</CardTitle>
              <CardDescription>
                Real-time logs from the logger service ({filteredLogs.length} of {logs.length} logs)
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
                onClick={clearLogs}
                disabled={logs.length === 0}
              >
                <X className="h-4 w-4 mr-2" />
                Clear
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
                        <td className="px-4 py-3 text-xs font-mono text-gray-600 whitespace-nowrap">
                          {formatTime(log.timestamp)}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          {getLevelBadge(log.level)}
                        </td>
                        <td className="px-4 py-3 text-sm">
                          {String(log.metadata?.service || log.service || '-')}
                        </td>
                        <td className="px-4 py-3 text-sm max-w-md">
                          <div className="truncate" title={log.message}>
                            {log.message}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <details className="cursor-pointer">
                            <summary className="text-xs text-blue-500 hover:text-blue-700">
                              View Details
                            </summary>
                            <div className="mt-2 p-2 bg-gray-50 rounded text-xs font-mono max-w-2xl overflow-auto">
                              {log.metadata && (
                                <div className="mb-2">
                                  <div className="font-semibold text-gray-700 mb-1">Metadata:</div>
                                  <pre className="whitespace-pre-wrap">
                                    {JSON.stringify(log.metadata, null, 2)}
                                  </pre>
                                </div>
                              )}
                              {log.error && (
                                <div>
                                  <div className="font-semibold text-red-700 mb-1">Error:</div>
                                  <div className="text-red-600">
                                    <div className="font-semibold">{log.error.message}</div>
                                    {log.error.stack && (
                                      <pre className="mt-1 text-xs whitespace-pre-wrap">
                                        {log.error.stack}
                                      </pre>
                                    )}
                                  </div>
                                </div>
                              )}
                            </div>
                          </details>
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
    </div>
  );
}
