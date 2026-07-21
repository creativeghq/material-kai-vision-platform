/**
 * Email Logs Tab
 * View and filter email sending logs
 */

import React, { useState, useEffect, useMemo } from 'react';
import { Download } from 'lucide-react';
import { Button } from '@/components/core/ui/button';
import { Badge } from '@/components/core/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/core/ui/table';
import { TablePagination, paginate, clampPage } from '@/components/core/ui/table-pagination';
import { FilterBar, useFilters } from '@/components/core/filters';
import { emailService, EmailLog } from '../services/emailService';
import { buildEmailLogFilters } from './emailFilters';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { humanizeLabel } from '@/utils/humanize';

export const EmailLogsTab: React.FC = () => {
  const [logs, setLogs] = useState<EmailLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const { toast } = useToast();

  const filterGroups = useMemo(() => buildEmailLogFilters(logs), [logs]);
  const { values: filterValues, setValues: setFilterValues, filtered, previewCount } =
    useFilters<EmailLog>(logs, filterGroups);

  // status + email_type are the server-side fields; changing either re-queries.
  const statusFilter = (filterValues.status as string) || 'all';
  const typeFilter = (filterValues.email_type as string) || 'all';

  useEffect(() => {
    loadLogs();
  }, [statusFilter, typeFilter]);

  // Client-side narrowing shrinks the list — don't strand the user on a now-empty page.
  useEffect(() => { setPage((p) => clampPage(p, filtered.length)); }, [filtered.length]);

  const loadLogs = async () => {
    try {
      setLoading(true);
      const filters: any = { limit: 100 };

      if (statusFilter !== 'all') {
        filters.status = statusFilter;
      }
      if (typeFilter !== 'all') {
        filters.emailType = typeFilter;
      }

      const data = await emailService.getEmailLogs(filters);
      setLogs(data);
      // Filters are applied server-side, so a reload is always a fresh result set.
      setPage(1);
    } catch (error) {
      console.error('Error loading logs:', error);
      toast({
        title: 'Error',
        description: 'Failed to load email logs',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
      sent: 'default',
      delivered: 'default',
      queued: 'secondary',
      bounced: 'destructive',
      complained: 'destructive',
      failed: 'destructive',
    };

    return <Badge variant={variants[status] || 'outline'}>{humanizeLabel(status)}</Badge>;
  };

  const exportLogs = () => {
    const csv = [
      ['Date', 'To', 'From', 'Subject', 'Status', 'Type'].join(','),
      ...filtered.map(log => [
        log.sent_at ? format(new Date(log.sent_at), 'yyyy-MM-dd HH:mm:ss') : 'N/A',
        log.to_email,
        log.from_email,
        `"${log.subject}"`,
        log.status,
        log.email_type || 'N/A',
      ].join(',')),
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `email-logs-${format(new Date(), 'yyyy-MM-dd')}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);

    toast({
      title: 'Exported',
      description: 'Email logs exported successfully',
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Email Logs</h3>
          <p className="text-sm text-muted-foreground">
            View all sent emails and their delivery status
          </p>
        </div>
        <FilterBar
          groups={filterGroups}
          values={filterValues}
          onChange={setFilterValues}
          previewCount={previewCount}
          title="Filter email logs"
          searchPlaceholder="Search recipient / subject…"
        >
          <Button variant="outline" onClick={exportLogs}>
            <Download className="mr-2 h-4 w-4" />
            Export
          </Button>
        </FilterBar>
      </div>

      <div className="dashboard-card p-0">
        {loading ? (
          <div className="py-8 text-center text-muted-foreground">
            Loading email logs...
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-8 text-center text-muted-foreground">
            No email logs found
          </div>
        ) : (
            <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>To</TableHead>
                  <TableHead>Subject</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Delivered</TableHead>
                  <TableHead>Opened</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginate(filtered, page).map((log) => (
                  <TableRow key={log.id}>
                    <TableCell className="text-sm">
                      {log.sent_at ? format(new Date(log.sent_at), 'MMM dd, HH:mm') : 'Pending'}
                    </TableCell>
                    <TableCell className="text-sm">{log.to_email}</TableCell>
                    <TableCell className="text-sm max-w-xs truncate">{log.subject}</TableCell>
                    <TableCell>{getStatusBadge(log.status)}</TableCell>
                    <TableCell className="text-sm capitalize">{log.email_type ? humanizeLabel(log.email_type) : 'N/A'}</TableCell>
                    <TableCell className="text-sm">
                      {log.delivered_at ? format(new Date(log.delivered_at), 'MMM dd, HH:mm') : '-'}
                    </TableCell>
                    <TableCell className="text-sm">
                      {log.opened_at ? format(new Date(log.opened_at), 'MMM dd, HH:mm') : '-'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <TablePagination
              page={page}
              total={filtered.length}
              onPageChange={setPage}
              label="emails"
            />
            </>
          )}
      </div>
    </div>
  );
};

export default EmailLogsTab;

