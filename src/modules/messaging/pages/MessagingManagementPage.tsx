/**
 * Messaging Management
 * Main dashboard for managing WhatsApp messaging via Zernio (Meta Cloud API).
 * @see https://docs.zernio.com
 */

import React, { useState, useEffect } from 'react';
import { MessageCircle, Send, FileText, BarChart3, Settings, Users, TestTube, Bell, Loader2 } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/core/ui/tabs';
import { Button } from '@/components/core/ui/button';
import { Badge } from '@/components/core/ui/badge';
import { GlobalAdminHeader } from '@/components/Admin/GlobalAdminHeader';
import { MessagingChannelsTab } from '../components/MessagingChannelsTab';
import { MessagingTemplatesTab } from '../components/MessagingTemplatesTab';
import { MessagingLogsTab } from '../components/MessagingLogsTab';
import { MessagingAnalyticsTab } from '../components/MessagingAnalyticsTab';
import { MessagingCampaignsTab } from '../components/MessagingCampaignsTab';
import { MessagingOptoutsTab } from '../components/MessagingOptoutsTab';
import { PushNotificationsTab } from '../components/PushNotificationsTab';
import { messagingService } from '../services';
import { useToast } from '@/hooks/use-toast';
import { formatNumber } from '@/utils/decimal';

export const MessagingManagement: React.FC = () => {
  const [activeTab, setActiveTab] = useState('channels');
  const [loading, setLoading] = useState(true);
  const [analytics, setAnalytics] = useState({
    totalSent: 0,
    totalDelivered: 0,
    totalRead: 0,
    totalFailed: 0,
    deliveryRate: 0,
    readRate: 0,
  });
  const [channelCounts, setChannelCounts] = useState({ whatsapp: 0 });
  const { toast } = useToast();

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);

      // Load analytics and channels in parallel
      const [analyticsData, channels] = await Promise.all([
        messagingService.getAnalytics().catch(() => ({
          totalSent: 0,
          totalDelivered: 0,
          totalRead: 0,
          totalFailed: 0,
          deliveryRate: 0,
          readRate: 0,
        })),
        messagingService.getChannels().catch(() => []),
      ]);

      setAnalytics({
        totalSent: analyticsData.totalSent ?? 0,
        totalDelivered: analyticsData.totalDelivered ?? 0,
        totalRead: analyticsData.totalRead ?? 0,
        totalFailed: analyticsData.totalFailed ?? 0,
        deliveryRate: analyticsData.deliveryRate ?? 0,
        readRate: analyticsData.readRate ?? 0,
      });

      // Count channels by type
      const counts = { whatsapp: 0 };
      channels.forEach((ch: any) => {
        if (ch.channel_type in counts) {
          counts[ch.channel_type as keyof typeof counts]++;
        }
      });
      setChannelCounts(counts);
    } catch (error) {
      console.error('Error loading messaging data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleTestMessage = () => {
    toast({
      title: 'Test Message',
      description: 'Go to the Campaigns tab to send a test message.',
    });
    setActiveTab('campaigns');
  };

  return (
    <div className="min-h-screen">
      {/* Global Admin Header */}
      <GlobalAdminHeader
        title="Messaging Management"
        description="Manage WhatsApp campaigns, replies, and Push Notifications"
        badge="WhatsApp"
      />

      {/* Main Content */}
      <div className="p-3 sm:p-6 space-y-6">
        {/* Header Actions */}
        <div className="flex justify-end items-center gap-2">
          {loading && (
            <span className="flex items-center gap-2 text-xs text-muted-foreground mr-auto">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading messaging data…
            </span>
          )}
          <Button onClick={handleTestMessage}>
            <TestTube className="mr-2 h-4 w-4" />
            Send test message
          </Button>
        </div>

        {/* Stats Cards */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {/* Total Sent Card */}
          <div className="dashboard-card" style={{ padding: 'var(--card-padding)' }}>
            <div className="flex items-center gap-3 mb-3">
              <div
                className="flex items-center justify-center flex-shrink-0"
                style={{
                  width: '2rem',
                  height: '2rem',
                  borderRadius: 'var(--radius-md)',
                  backgroundColor: 'hsl(var(--primary) / 0.1)',
                }}
              >
                <Send className="h-4 w-4" style={{ color: 'hsl(var(--primary))' }} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-muted-foreground">Total Sent</p>
                <p className="text-lg font-bold">{formatNumber(analytics.totalSent)}</p>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">All channels combined</p>
          </div>

          {/* Delivery Rate Card */}
          <div className="dashboard-card" style={{ padding: 'var(--card-padding)' }}>
            <div className="flex items-center gap-3 mb-3">
              <div
                className="flex items-center justify-center flex-shrink-0"
                style={{
                  width: '2rem',
                  height: '2rem',
                  borderRadius: 'var(--radius-md)',
                  backgroundColor: 'hsl(142 71% 45% / 0.1)',
                }}
              >
                <BarChart3 className="h-4 w-4" style={{ color: 'hsl(142 71% 45%)' }} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-muted-foreground">Delivery Rate</p>
                <p className="text-lg font-bold">{analytics.deliveryRate.toFixed(1)}%</p>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              {formatNumber(analytics.totalDelivered)} delivered
            </p>
          </div>

          {/* Read Rate Card */}
          <div className="dashboard-card" style={{ padding: 'var(--card-padding)' }}>
            <div className="flex items-center gap-3 mb-3">
              <div
                className="flex items-center justify-center flex-shrink-0"
                style={{
                  width: '2rem',
                  height: '2rem',
                  borderRadius: 'var(--radius-md)',
                  backgroundColor: 'hsl(221 83% 53% / 0.1)',
                }}
              >
                <MessageCircle className="h-4 w-4" style={{ color: 'hsl(221 83% 53%)' }} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-muted-foreground">Read Rate</p>
                <p className="text-lg font-bold">{analytics.readRate.toFixed(1)}%</p>
              </div>
              <Badge variant="secondary" className="text-xs">
                WhatsApp
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">{formatNumber(analytics.totalRead)} read</p>
          </div>

          {/* Channels Card */}
          <div className="dashboard-card" style={{ padding: 'var(--card-padding)' }}>
            <div className="flex items-center gap-3 mb-3">
              <div
                className="flex items-center justify-center flex-shrink-0"
                style={{
                  width: '2rem',
                  height: '2rem',
                  borderRadius: 'var(--radius-md)',
                  backgroundColor: 'hsl(271 76% 53% / 0.1)',
                }}
              >
                <Settings className="h-4 w-4" style={{ color: 'hsl(271 76% 53%)' }} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-muted-foreground">Active Channels</p>
                <p className="text-lg font-bold">{channelCounts.whatsapp}</p>
              </div>
            </div>
            <div className="flex gap-2">
              <Badge variant="outline" className="text-xs flex items-center gap-1 text-green-600">
                <MessageCircle className="h-3 w-3" />
                {channelCounts.whatsapp} WhatsApp
              </Badge>
            </div>
          </div>
        </div>

        {/* Main Content Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="w-full h-auto flex-wrap justify-start gap-2 p-2">
            <TabsTrigger value="channels">
              <Settings className="h-4 w-4 mr-2" />
              Channels
            </TabsTrigger>
            <TabsTrigger value="templates">
              <FileText className="h-4 w-4 mr-2" />
              Templates
            </TabsTrigger>
            <TabsTrigger value="campaigns">
              <Send className="h-4 w-4 mr-2" />
              Campaigns
            </TabsTrigger>
            <TabsTrigger value="logs">
              <MessageCircle className="h-4 w-4 mr-2" />
              Message Logs
            </TabsTrigger>
            <TabsTrigger value="analytics">
              <BarChart3 className="h-4 w-4 mr-2" />
              Analytics
            </TabsTrigger>
            <TabsTrigger value="optouts">
              <Users className="h-4 w-4 mr-2" />
              Opt-Outs
            </TabsTrigger>
            <TabsTrigger value="push">
              <Bell className="h-4 w-4 mr-2" />
              Push Notifications
            </TabsTrigger>
          </TabsList>

          <TabsContent value="channels" className="space-y-4">
            <MessagingChannelsTab />
          </TabsContent>

          <TabsContent value="templates" className="space-y-4">
            <MessagingTemplatesTab />
          </TabsContent>

          <TabsContent value="campaigns" className="space-y-4">
            <MessagingCampaignsTab />
          </TabsContent>

          <TabsContent value="logs" className="space-y-4">
            <MessagingLogsTab />
          </TabsContent>

          <TabsContent value="analytics" className="space-y-4">
            <MessagingAnalyticsTab />
          </TabsContent>

          <TabsContent value="optouts" className="space-y-4">
            <MessagingOptoutsTab />
          </TabsContent>

          <TabsContent value="push" className="space-y-4">
            <PushNotificationsTab />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default MessagingManagement;
