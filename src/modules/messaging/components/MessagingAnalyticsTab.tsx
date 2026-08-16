/**
 * Messaging Analytics Tab
 *
 * Two sources, deliberately: `getAnalytics()` reads messaging_logs — what WE sent, plus what it
 * cost, which only we know. `getInboxAnalytics()` reads Zernio, which sees BOTH sides and can
 * therefore answer the question a conversational channel actually turns on: are we replying to
 * people, and how fast. Our own logs cannot see a reply at all, so a 100%-delivered dashboard
 * was compatible with nobody ever being answered.
 */

import React, { useState, useEffect } from 'react';
import { RefreshCw, Send, CheckCircle, Eye, XCircle, DollarSign, MessageSquare, Timer, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/core/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/core/ui/select';
import { SectionHeader } from '@/components/shared/SectionHeader';
import { useToast } from '@/hooks/use-toast';
import { messagingService, MessagingAnalyticsResponse } from '../services';
import type { InboxAnalyticsResponse } from '../services/types';
import { formatNumber } from '@/utils/decimal';
import { toLocalISODate } from '@/utils/datetime';

interface StatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: React.ReactNode;
  trend?: { value: number; isPositive: boolean };
}

const StatCard: React.FC<StatCardProps> = ({ title, value, subtitle, icon, trend }) => (
  <div className="dashboard-card">
    <div className="flex items-start justify-between">
      <div>
        <p className="text-sm text-muted-foreground">{title}</p>
        <p className="text-2xl font-bold mt-1">{value}</p>
        {subtitle && <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>}
        {trend && (
          <p className={`text-xs mt-1 ${trend.isPositive ? 'text-green-500' : 'text-red-500'}`}>
            {trend.isPositive ? '+' : ''}{trend.value}% from last period
          </p>
        )}
      </div>
      <div className="p-2 bg-primary/10 rounded-lg">
        {icon}
      </div>
    </div>
  </div>
);

/** Seconds → the coarsest unit that still reads honestly. */
function formatDuration(seconds: number | undefined): string {
  if (seconds == null || !Number.isFinite(seconds)) return '—';
  if (seconds < 60) return `${Math.round(seconds)}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  if (seconds < 86400) return `${(seconds / 3600).toFixed(1)}h`;
  return `${(seconds / 86400).toFixed(1)}d`;
}

export const MessagingAnalyticsTab: React.FC = () => {
  const [analytics, setAnalytics] = useState<MessagingAnalyticsResponse | null>(null);
  const [inbox, setInbox] = useState<InboxAnalyticsResponse | null>(null);
  const [inboxError, setInboxError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState<string>('7d');
  const { toast } = useToast();

  useEffect(() => {
    loadAnalytics();
  }, [dateRange]);

  const getDateRange = () => {
    const end = new Date();
    const start = new Date();

    switch (dateRange) {
      case '24h':
        start.setDate(start.getDate() - 1);
        break;
      case '7d':
        start.setDate(start.getDate() - 7);
        break;
      case '30d':
        start.setDate(start.getDate() - 30);
        break;
      case '90d':
        start.setDate(start.getDate() - 90);
        break;
    }

    return {
      start: toLocalISODate(start),
      end: toLocalISODate(end),
    };
  };

  const loadAnalytics = async () => {
    try {
      setLoading(true);
      const data = await messagingService.getAnalytics(undefined, getDateRange());
      setAnalytics(data);

      // Zernio-side, and independently fallible: no channel connected yet, no key, or a 429
      // from the stricter analytics bucket. None of those should blank the cost/delivery half
      // above, which comes from our own tables and is always available.
      try {
        const range = getDateRange();
        setInbox(await messagingService.getInboxAnalytics({ fromDate: range.start, toDate: range.end }));
        setInboxError(null);
      } catch (err: any) {
        setInbox(null);
        setInboxError(err?.message || 'Two-way stats are unavailable');
      }
    } catch (error) {
      console.error('Error loading analytics:', error);
      toast({
        title: 'Error',
        description: 'Failed to load messaging analytics',
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
        title="Messaging Analytics"
        subtitle="Track message delivery and engagement metrics"
        actions={
          <div className="flex items-center gap-4">
            <Select value={dateRange} onValueChange={setDateRange}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="Date range" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="24h">Last 24 hours</SelectItem>
                <SelectItem value="7d">Last 7 days</SelectItem>
                <SelectItem value="30d">Last 30 days</SelectItem>
                <SelectItem value="90d">Last 90 days</SelectItem>
              </SelectContent>
            </Select>
            <Button onClick={loadAnalytics} variant="outline" disabled={loading}>
              <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>
        }
      />

      {loading ? (
        <div className="dashboard-card">
          <div className="py-8 text-center text-muted-foreground">
            Loading analytics...
          </div>
        </div>
      ) : analytics ? (
        <>
          {/* Overview Stats */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <StatCard
              title="Total Sent"
              value={formatNumber((analytics.totalSent ?? 0))}
              icon={<Send className="h-5 w-5 text-primary" />}
            />
            <StatCard
              title="Delivered"
              value={formatNumber((analytics.totalDelivered ?? 0))}
              subtitle={`${analytics.deliveryRate ?? 0}% delivery rate`}
              icon={<CheckCircle className="h-5 w-5 text-green-500" />}
            />
            <StatCard
              title="Read"
              value={formatNumber((analytics.totalRead ?? 0))}
              subtitle={`${analytics.readRate ?? 0}% read rate`}
              icon={<Eye className="h-5 w-5 text-blue-500" />}
            />
            <StatCard
              title="Failed"
              value={formatNumber((analytics.totalFailed ?? 0))}
              subtitle={`${analytics.failureRate ?? 0}% failure rate`}
              icon={<XCircle className="h-5 w-5 text-red-500" />}
            />
          </div>

          {/* Cost */}
          <div className="grid gap-4 md:grid-cols-2">
            <StatCard
              title="Total Cost"
              value={`${(analytics.totalCost ?? 0).toFixed(2)} USD`}
              subtitle={`Average: ${((analytics.totalSent ?? 0) > 0 ? (analytics.totalCost ?? 0) / (analytics.totalSent ?? 1) : 0).toFixed(4)} USD/msg`}
              icon={<DollarSign className="h-5 w-5 text-yellow-500" />}
            />
          </div>

          {/* Two-way conversation stats — Zernio sees the replies our own logs cannot. */}
          {inbox?.volume?.summary && (
            <>
              <h4 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">
                Conversations
              </h4>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <StatCard
                  title="Received"
                  value={formatNumber(inbox.volume.summary.received ?? 0)}
                  subtitle={`${formatNumber(inbox.volume.summary.uniqueConversations ?? 0)} conversations`}
                  icon={<MessageSquare className="h-5 w-5 text-primary" />}
                />
                <StatCard
                  title="Reply rate"
                  value={
                    inbox.volume.summary.received > 0 && inbox.responseTime?.summary
                      ? `${Math.round((inbox.responseTime.summary.sampleSize / inbox.volume.summary.received) * 100)}%`
                      : '—'
                  }
                  subtitle={
                    inbox.responseTime?.summary
                      ? `${formatNumber(inbox.responseTime.summary.sampleSize)} answered`
                      : 'No replies measured'
                  }
                  icon={<CheckCircle className="h-5 w-5 text-green-500" />}
                />
                <StatCard
                  title="Median reply time"
                  value={formatDuration(inbox.responseTime?.summary?.medianSeconds)}
                  subtitle={
                    inbox.responseTime?.summary
                      ? `p90 ${formatDuration(inbox.responseTime.summary.p90Seconds)}`
                      : undefined
                  }
                  icon={<Timer className="h-5 w-5 text-blue-500" />}
                />
                <StatCard
                  title="Slowest reply"
                  value={formatDuration(inbox.responseTime?.summary?.slowestSeconds)}
                  subtitle={
                    inbox.responseTime?.summary
                      ? `fastest ${formatDuration(inbox.responseTime.summary.fastestSeconds)}`
                      : undefined
                  }
                  icon={<Timer className="h-5 w-5 text-amber-500" />}
                />
              </div>

              {/* Partial failure is stated, never rendered as a zero — an endpoint that 429'd
                  and a genuinely empty window look identical once you print 0. */}
              {(inbox.errors?.length ?? 0) > 0 && (
                <p className="text-xs text-amber-500 flex items-start gap-1.5">
                  <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />
                  Some conversation stats could not be loaded, so the figures above are incomplete.
                </p>
              )}
            </>
          )}

          {inboxError && !inbox && (
            <p className="text-xs text-muted-foreground flex items-start gap-1.5">
              <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />
              Reply-rate and response-time stats are unavailable ({inboxError}). Delivery and cost
              figures above come from this platform&apos;s own logs and are unaffected.
            </p>
          )}

          {/* Daily Data Table */}
          {analytics.dailyData && analytics.dailyData.length > 0 && (
            <div className="dashboard-card">
              <h4 className="font-semibold mb-4">Daily Breakdown</h4>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="sticky top-0 bg-muted/50 border-b border-border/50">
                    <tr>
                      <th className="text-left py-2 px-4 font-medium">Date</th>
                      <th className="text-left py-2 px-4 font-medium">Channel</th>
                      <th className="text-right py-2 px-4 font-medium">Sent</th>
                      <th className="text-right py-2 px-4 font-medium">Delivered</th>
                      <th className="text-right py-2 px-4 font-medium">Read</th>
                      <th className="text-right py-2 px-4 font-medium">Failed</th>
                      <th className="text-right py-2 px-4 font-medium">Cost</th>
                    </tr>
                  </thead>
                  <tbody>
                    {analytics.dailyData
                      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                      .slice(0, 14)
                      .map((day, idx) => (
                        <tr key={`${day.date}-${day.channel_type}-${idx}`} className="border-b last:border-0">
                          <td className="py-2 px-4 text-sm">{day.date}</td>
                          <td className="py-2 px-4 text-sm capitalize">{day.channel_type}</td>
                          <td className="py-2 px-4 text-sm text-right">{day.total_sent}</td>
                          <td className="py-2 px-4 text-sm text-right">{day.total_delivered}</td>
                          <td className="py-2 px-4 text-sm text-right">{day.total_read}</td>
                          <td className="py-2 px-4 text-sm text-right">{day.total_failed}</td>
                          <td className="py-2 px-4 text-sm text-right">{parseFloat(day.total_cost as any || 0).toFixed(2)}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      ) : (
        <div className="dashboard-card">
          <div className="py-8 text-center text-muted-foreground">
            No analytics data available
          </div>
        </div>
      )}
    </div>
  );
};

export default MessagingAnalyticsTab;
