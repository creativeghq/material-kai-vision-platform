/**
 * Messaging Logs Tab
 * View message delivery logs and status
 */

import React, { useState, useEffect, useMemo } from 'react';
import { RefreshCw, MessageCircle } from 'lucide-react';
import { Button } from '@/components/core/ui/button';
import { TablePagination, paginate, clampPage } from '@/components/core/ui/table-pagination';
import { SectionHeader } from '@/components/shared/SectionHeader';
import { FilterBar, useFilters } from '@/components/core/filters';
import { useToast } from '@/hooks/use-toast';
import { messagingService, MessagingLog, MessagingChannelType, MessageStatus } from '../services';
import { buildMessagingLogFilters } from './messagingFilters';
import { humanizeLabel } from '@/utils/humanize';
import { statusTone } from '@/utils/statusTone';
import { format } from 'date-fns';

const WhatsAppIcon = <MessageCircle className="h-4 w-4 text-green-500" />;

export const MessagingLogsTab: React.FC = () => {
  const [logs, setLogs] = useState<MessagingLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const { toast } = useToast();

  const filterGroups = useMemo(() => buildMessagingLogFilters(logs), [logs]);
  const { values: filterValues, setValues: setFilterValues, filtered: filteredLogs, previewCount } =
    useFilters<MessagingLog>(logs, filterGroups);

  // channel_type + status are the server-side fields; changing either re-queries.
  const filterChannel = (filterValues.channel_type as string) || 'all';
  const filterStatus = (filterValues.status as string) || 'all';

  useEffect(() => {
    loadLogs();
  }, [filterChannel, filterStatus]);

  // Client-side narrowing shrinks the list — keep the page in range.
  useEffect(() => { setPage((p) => clampPage(p, filteredLogs.length)); }, [filteredLogs.length]);

  const loadLogs = async () => {
    try {
      setLoading(true);
      const data = await messagingService.getMessageLogs({
        channelType: filterChannel !== 'all' ? filterChannel as MessagingChannelType : undefined,
        status: filterStatus !== 'all' ? filterStatus as MessageStatus : undefined,
        // Raised from 100 so the paginated view isn't paging over a silently truncated slice.
        limit: 500,
      });
      setLogs(data);
      // Channel/status filters are applied server-side, so a reload is a fresh result set.
      setPage(1);
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

  return (
    <div className="space-y-6">
      {/* Header */}
      <SectionHeader
        title="Message Logs"
        subtitle="View delivery status and details for all sent messages"
        actions={
          <Button onClick={loadLogs} variant="outline" disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        }
      />

      {/* Filters */}
      <div className="dashboard-card">
        <FilterBar
          groups={filterGroups}
          values={filterValues}
          onChange={setFilterValues}
          previewCount={previewCount}
          title="Filter message logs"
          searchPlaceholder="Search phone number or content…"
        />
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
          <>
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
                {paginate(filteredLogs, page).map((log) => (
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
                      <span className={`text-sm capitalize ${statusTone(log.status)}`}>
                        {humanizeLabel(log.status)}
                      </span>
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
          <TablePagination
            page={page}
            total={filteredLogs.length}
            onPageChange={setPage}
            label="messages"
          />
          </>
        )}
      </div>
    </div>
  );
};

export default MessagingLogsTab;
