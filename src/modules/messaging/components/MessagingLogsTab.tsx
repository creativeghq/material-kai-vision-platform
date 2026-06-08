/**
 * Messaging Logs Tab
 * View message delivery logs and status
 */

import React, { useState, useEffect } from 'react';
import { RefreshCw, MessageCircle, Search, Filter } from 'lucide-react';
import { Button } from '@/components/core/ui/button';
import { Badge } from '@/components/core/ui/badge';
import { Input } from '@/components/core/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/core/ui/select';
import { useToast } from '@/hooks/use-toast';
import { messagingService, MessagingLog, MessagingChannelType, MessageStatus } from '../services';
import { format } from 'date-fns';

const WhatsAppIcon = <MessageCircle className="h-4 w-4 text-green-500" />;

const statusColors: Record<MessageStatus, string> = {
  queued: 'bg-gray-500',
  sent: 'bg-blue-500',
  delivered: 'bg-green-500',
  read: 'bg-emerald-500',
  failed: 'bg-red-500',
  rejected: 'bg-red-700',
  expired: 'bg-orange-500',
};

export const MessagingLogsTab: React.FC = () => {
  const [logs, setLogs] = useState<MessagingLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterChannel, setFilterChannel] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [searchPhone, setSearchPhone] = useState('');
  const { toast } = useToast();

  useEffect(() => {
    loadLogs();
  }, [filterChannel, filterStatus]);

  const loadLogs = async () => {
    try {
      setLoading(true);
      const data = await messagingService.getMessageLogs({
        channelType: filterChannel !== 'all' ? filterChannel as MessagingChannelType : undefined,
        status: filterStatus !== 'all' ? filterStatus as MessageStatus : undefined,
        limit: 100,
      });
      setLogs(data);
    } catch (error) {
      console.error('Error loading logs:', error);
      toast({
        title: 'Error',
        description: 'Failed to load message logs',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const filteredLogs = searchPhone
    ? logs.filter(log => log.to_number.includes(searchPhone))
    : logs;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="dashboard-card">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-lg font-semibold">Message Logs</h3>
            <p className="text-sm text-muted-foreground">
              View delivery status and details for all sent messages
            </p>
          </div>
          <Button onClick={loadLogs} variant="outline" disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="dashboard-card">
        <div className="flex flex-wrap gap-4">
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">Filters:</span>
          </div>
          <Select value={filterChannel} onValueChange={setFilterChannel}>
            <SelectTrigger className="w-[150px]">
              <SelectValue placeholder="Channel" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Channels</SelectItem>
              <SelectItem value="whatsapp">WhatsApp</SelectItem>
            </SelectContent>
          </Select>
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="w-[150px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="queued">Queued</SelectItem>
              <SelectItem value="sent">Sent</SelectItem>
              <SelectItem value="delivered">Delivered</SelectItem>
              <SelectItem value="read">Read</SelectItem>
              <SelectItem value="failed">Failed</SelectItem>
            </SelectContent>
          </Select>
          <div className="flex-1 min-w-[200px]">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={searchPhone}
                onChange={(e) => setSearchPhone(e.target.value)}
                placeholder="Search by phone number..."
                className="pl-9"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Logs Table */}
      <div className="dashboard-card">
        {loading ? (
          <div className="py-8 text-center text-muted-foreground">
            Loading logs...
          </div>
        ) : filteredLogs.length === 0 ? (
          <div className="py-8 text-center text-muted-foreground">
            No message logs found
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="sticky top-0 bg-muted/50 border-b border-border/50">
                <tr>
                  <th className="text-left py-3 px-4 font-medium">Channel</th>
                  <th className="text-left py-3 px-4 font-medium">To</th>
                  <th className="text-left py-3 px-4 font-medium">Content</th>
                  <th className="text-left py-3 px-4 font-medium">Status</th>
                  <th className="text-left py-3 px-4 font-medium">Sent</th>
                  <th className="text-left py-3 px-4 font-medium">Delivered</th>
                  <th className="text-left py-3 px-4 font-medium">Cost</th>
                </tr>
              </thead>
              <tbody>
                {filteredLogs.map((log) => (
                  <tr key={log.id} className="border-b last:border-0 hover:bg-muted/50">
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        {WhatsAppIcon}
                        <span className="capitalize text-sm">{log.channel_type}</span>
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <span className="font-mono text-sm">{log.to_number}</span>
                    </td>
                    <td className="py-3 px-4">
                      <div className="max-w-xs truncate text-sm" title={log.content || ''}>
                        {log.content || '-'}
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <Badge className={statusColors[log.status]}>
                        {log.status}
                      </Badge>
                      {log.error_message && (
                        <div className="text-xs text-red-500 mt-1" title={log.error_message}>
                          {log.error_message.substring(0, 30)}...
                        </div>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      <span className="text-sm text-muted-foreground">
                        {log.sent_at ? format(new Date(log.sent_at), 'MMM d, HH:mm') : '-'}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <span className="text-sm text-muted-foreground">
                        {log.delivered_at ? format(new Date(log.delivered_at), 'MMM d, HH:mm') : '-'}
                      </span>
                      {log.read_at && (
                        <div className="text-xs text-green-500">
                          Read: {format(new Date(log.read_at), 'HH:mm')}
                        </div>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      {log.cost ? (
                        <span className="text-sm">
                          {log.cost.toFixed(4)} {log.currency}
                        </span>
                      ) : (
                        <span className="text-sm text-muted-foreground">-</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default MessagingLogsTab;
