/**
 * Email Logs Tab
 * View and filter email sending logs
 */

import React, { useState, useEffect } from 'react';
import { Mail, Filter, Download, Eye } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { emailService, EmailLog } from '@/services/email/emailService';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';

export const EmailLogsTab: React.FC = () => {
  const [logs, setLogs] = useState<EmailLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const { toast } = useToast();

  useEffect(() => {
    loadLogs();
  }, [statusFilter, typeFilter]);

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

    return <Badge variant={variants[status] || 'outline'}>{status}</Badge>;
  };

  const exportLogs = () => {
    const csv = [
      ['Date', 'To', 'From', 'Subject', 'Status', 'Type'].join(','),
      ...logs.map(log => [
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
        <div className="flex items-center gap-2">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[150px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="queued">Queued</SelectItem>
              <SelectItem value="sent">Sent</SelectItem>
              <SelectItem value="delivered">Delivered</SelectItem>
              <SelectItem value="bounced">Bounced</SelectItem>
              <SelectItem value="complained">Complained</SelectItem>
              <SelectItem value="failed">Failed</SelectItem>
            </SelectContent>
          </Select>

          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-[150px]">
              <SelectValue placeholder="Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="transactional">Transactional</SelectItem>
              <SelectItem value="marketing">Marketing</SelectItem>
              <SelectItem value="notification">Notification</SelectItem>
            </SelectContent>
          </Select>

          <Button variant="outline" onClick={exportLogs}>
            <Download className="mr-2 h-4 w-4" />
            Export
          </Button>
        </div>
      </div>

      <div className="dashboard-card p-0">
        {loading ? (
          <div className="py-8 text-center text-muted-foreground">
            Loading email logs...
          </div>
        ) : logs.length === 0 ? (
          <div className="py-8 text-center text-muted-foreground">
            No email logs found
          </div>
        ) : (
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
                {logs.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell className="text-sm">
                      {log.sent_at ? format(new Date(log.sent_at), 'MMM dd, HH:mm') : 'Pending'}
                    </TableCell>
                    <TableCell className="text-sm">{log.to_email}</TableCell>
                    <TableCell className="text-sm max-w-xs truncate">{log.subject}</TableCell>
                    <TableCell>{getStatusBadge(log.status)}</TableCell>
                    <TableCell className="text-sm capitalize">{log.email_type || 'N/A'}</TableCell>
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
          )}
      </div>
    </div>
  );
};

export default EmailLogsTab;

