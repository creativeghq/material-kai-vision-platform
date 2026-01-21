/**
 * Messaging Analytics Tab
 * View messaging metrics and statistics
 */

import React, { useState, useEffect } from 'react';
import { RefreshCw, Send, CheckCircle, Eye, XCircle, DollarSign, Phone, MessageCircle, Smartphone } from 'lucide-react';
import { Button } from '@/components/core/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/core/ui/select';
import { useToast } from '@/hooks/use-toast';
import { messagingService, MessagingAnalyticsResponse, MessagingChannelType } from '@/services/messaging';

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

export const MessagingAnalyticsTab: React.FC = () => {
  const [analytics, setAnalytics] = useState<MessagingAnalyticsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [filterChannel, setFilterChannel] = useState<string>('all');
  const [dateRange, setDateRange] = useState<string>('7d');
  const [accountBalance, setAccountBalance] = useState<{ balance: number; currency: string } | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    loadAnalytics();
    loadAccountBalance();
  }, [filterChannel, dateRange]);

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
      start: start.toISOString().split('T')[0],
      end: end.toISOString().split('T')[0],
    };
  };

  const loadAnalytics = async () => {
    try {
      setLoading(true);
      const data = await messagingService.getAnalytics(
        filterChannel !== 'all' ? filterChannel as MessagingChannelType : undefined,
        getDateRange()
      );
      setAnalytics(data);
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

  const loadAccountBalance = async () => {
    try {
      const balance = await messagingService.getAccountBalance();
      setAccountBalance(balance);
    } catch (error) {
      console.error('Error loading account balance:', error);
      // Don't show error toast for balance - it's not critical
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="dashboard-card">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-lg font-semibold">Messaging Analytics</h3>
            <p className="text-sm text-muted-foreground">
              Track message delivery and engagement metrics
            </p>
          </div>
          <div className="flex items-center gap-4">
            <Select value={filterChannel} onValueChange={setFilterChannel}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="Channel" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Channels</SelectItem>
                <SelectItem value="sms">SMS</SelectItem>
                <SelectItem value="whatsapp">WhatsApp</SelectItem>
                <SelectItem value="viber">Viber</SelectItem>
              </SelectContent>
            </Select>
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
        </div>
      </div>

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
              value={analytics.totalSent.toLocaleString()}
              icon={<Send className="h-5 w-5 text-primary" />}
            />
            <StatCard
              title="Delivered"
              value={analytics.totalDelivered.toLocaleString()}
              subtitle={`${analytics.deliveryRate}% delivery rate`}
              icon={<CheckCircle className="h-5 w-5 text-green-500" />}
            />
            <StatCard
              title="Read"
              value={analytics.totalRead.toLocaleString()}
              subtitle={`${analytics.readRate}% read rate`}
              icon={<Eye className="h-5 w-5 text-blue-500" />}
            />
            <StatCard
              title="Failed"
              value={analytics.totalFailed.toLocaleString()}
              subtitle={`${analytics.failureRate}% failure rate`}
              icon={<XCircle className="h-5 w-5 text-red-500" />}
            />
          </div>

          {/* Cost & Balance */}
          <div className="grid gap-4 md:grid-cols-2">
            <StatCard
              title="Total Cost"
              value={`${analytics.totalCost.toFixed(2)} EUR`}
              subtitle={`Average: ${(analytics.totalSent > 0 ? analytics.totalCost / analytics.totalSent : 0).toFixed(4)} EUR/msg`}
              icon={<DollarSign className="h-5 w-5 text-yellow-500" />}
            />
            {accountBalance && (
              <StatCard
                title="Account Balance"
                value={`${accountBalance.balance.toFixed(2)} ${accountBalance.currency}`}
                subtitle="Infobip account balance"
                icon={<DollarSign className="h-5 w-5 text-green-500" />}
              />
            )}
          </div>

          {/* Channel Breakdown */}
          {filterChannel === 'all' && analytics.dailyData && analytics.dailyData.length > 0 && (
            <div className="dashboard-card">
              <h4 className="font-semibold mb-4">Channel Breakdown</h4>
              <div className="grid gap-4 md:grid-cols-3">
                {['sms', 'whatsapp', 'viber'].map((channel) => {
                  const channelData = analytics.dailyData?.filter(d => d.channel_type === channel) || [];
                  const totalSent = channelData.reduce((sum, d) => sum + d.total_sent, 0);
                  const totalDelivered = channelData.reduce((sum, d) => sum + d.total_delivered, 0);
                  const totalCost = channelData.reduce((sum, d) => sum + parseFloat(d.total_cost as any || 0), 0);

                  const icons: Record<string, React.ReactNode> = {
                    sms: <Phone className="h-5 w-5" />,
                    whatsapp: <MessageCircle className="h-5 w-5 text-green-500" />,
                    viber: <Smartphone className="h-5 w-5 text-purple-500" />,
                  };

                  return (
                    <div key={channel} className="p-4 bg-muted/50 rounded-lg">
                      <div className="flex items-center gap-2 mb-3">
                        {icons[channel]}
                        <span className="font-medium capitalize">{channel}</span>
                      </div>
                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Sent</span>
                          <span>{totalSent.toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Delivered</span>
                          <span>{totalDelivered.toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Cost</span>
                          <span>{totalCost.toFixed(2)} EUR</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Delivery Rate</span>
                          <span>
                            {totalSent > 0 ? ((totalDelivered / totalSent) * 100).toFixed(1) : 0}%
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Daily Data Table */}
          {analytics.dailyData && analytics.dailyData.length > 0 && (
            <div className="dashboard-card">
              <h4 className="font-semibold mb-4">Daily Breakdown</h4>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b">
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
