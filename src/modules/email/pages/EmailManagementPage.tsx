/**
 * Email Management Component
 * Admin dashboard for managing emails, domains, templates, and analytics
 */

import React, { useState, useEffect } from 'react';
import { Mail, Send, Database, BarChart3, Settings, TestTube, Zap, Megaphone, Loader2 } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/core/ui/tabs';
import { Button } from '@/components/core/ui/button';
import { Badge } from '@/components/core/ui/badge';
import { emailService } from '../services/emailService';
import { GlobalAdminHeader } from '@/components/Admin/GlobalAdminHeader';
import { EmailDomainsTab } from '../components/EmailDomainsTab';
import { EmailLogsTab } from '../components/EmailLogsTab';
import { EmailAnalyticsTab } from '../components/EmailAnalyticsTab';
import { EmailTemplatesTab } from '../components/EmailTemplatesTab';
import { EmailActionsTab } from '../components/EmailActionsTab';
import { CampaignsTab } from '../components/CampaignsTab';
import { TestEmailDialog } from '../components/TestEmailDialog';
import { EmailSettingsModal } from '../components/EmailSettingsModal';
import { formatNumber } from '@/utils/decimal';
import { toLocalISODate, todayLocalISO } from '@/utils/datetime';

export const EmailManagement: React.FC = () => {
  const [analytics, setAnalytics] = useState({
    totalSent: 0,
    totalDelivered: 0,
    totalBounced: 0,
    totalComplained: 0,
    totalOpened: 0,
    totalClicked: 0,
    deliveryRate: 0,
    bounceRate: 0,
    complaintRate: 0,
    openRate: 0,
    clickRate: 0,
  });
  const [loading, setLoading] = useState(true);
  const [showTestDialog, setShowTestDialog] = useState(false);
  const [showSettingsDialog, setShowSettingsDialog] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);

      const fromDate = new Date();
      fromDate.setDate(fromDate.getDate() - 30);

      const analyticsData = await emailService.getAnalytics({
        start: toLocalISODate(fromDate),
        end: todayLocalISO(),
      });

      setAnalytics((prev) => ({ ...prev, ...analyticsData }));
    } catch (error) {
      console.error('Error loading email data:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen">
      {/* Global Admin Header */}
      <GlobalAdminHeader
        title="Email Management"
        description="Manage email domains, templates, and monitor delivery analytics"
        badge="Email System"
      />

      {/* Main Content */}
      <div className="p-3 sm:p-6 space-y-6">
        {/* Header Actions */}
        <div className="flex justify-end items-center gap-2">
          {loading && (
            <span className="flex items-center gap-2 text-xs text-muted-foreground mr-auto">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading analytics…
            </span>
          )}
          <Button variant="outline" onClick={() => setShowSettingsDialog(true)}>
            <Settings className="mr-2 h-4 w-4" />
            Email settings
          </Button>
          <Button onClick={() => setShowTestDialog(true)}>
            <TestTube className="mr-2 h-4 w-4" />
            Send test email
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
            <p className="text-xs text-muted-foreground">Last 30 days</p>
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

          {/* Bounce Rate Card */}
          <div className="dashboard-card" style={{ padding: 'var(--card-padding)' }}>
            <div className="flex items-center gap-3 mb-3">
              <div
                className="flex items-center justify-center flex-shrink-0"
                style={{
                  width: '2rem',
                  height: '2rem',
                  borderRadius: 'var(--radius-md)',
                  backgroundColor: analytics.bounceRate > 5 ? 'hsl(var(--destructive) / 0.1)' : 'hsl(var(--muted) / 0.5)',
                }}
              >
                <Mail className="h-4 w-4" style={{ color: analytics.bounceRate > 5 ? 'hsl(var(--destructive))' : 'hsl(var(--muted-foreground))' }} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-muted-foreground">Bounce Rate</p>
                <p className="text-lg font-bold">{formatNumber(analytics.totalBounced)}</p>
              </div>
              <Badge variant={analytics.bounceRate > 5 ? 'destructive' : 'secondary'} className="text-xs">
                {analytics.bounceRate.toFixed(1)}%
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">bounced emails</p>
          </div>

          {/* Open Rate Card */}
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
                <Database className="h-4 w-4" style={{ color: 'hsl(271 76% 53%)' }} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-muted-foreground">Open Rate</p>
                <p className="text-lg font-bold">{analytics.openRate.toFixed(1)}%</p>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              {formatNumber(analytics.totalOpened)} opens
            </p>
          </div>
        </div>

        {/* Main Content Tabs */}
        <Tabs defaultValue="analytics" className="space-y-6">
          <TabsList className="w-full h-auto flex-wrap justify-start gap-2 bg-transparent p-0">
            <TabsTrigger value="analytics">
              <BarChart3 className="h-4 w-4 mr-2" />
              Analytics
            </TabsTrigger>
            <TabsTrigger value="logs">
              <Mail className="h-4 w-4 mr-2" />
              Email Logs
            </TabsTrigger>
            <TabsTrigger value="domains">
              <Database className="h-4 w-4 mr-2" />
              Domains
            </TabsTrigger>
            <TabsTrigger value="templates">
              <Settings className="h-4 w-4 mr-2" />
              Templates
            </TabsTrigger>
            <TabsTrigger value="actions">
              <Zap className="h-4 w-4 mr-2" />
              Actions
            </TabsTrigger>
            <TabsTrigger value="campaigns">
              <Megaphone className="h-4 w-4 mr-2" />
              Campaigns
            </TabsTrigger>
          </TabsList>

          <TabsContent value="analytics" className="space-y-4">
            <EmailAnalyticsTab />
          </TabsContent>

          <TabsContent value="logs" className="space-y-4">
            <EmailLogsTab />
          </TabsContent>

          <TabsContent value="domains" className="space-y-4">
            <EmailDomainsTab onDomainVerified={loadData} />
          </TabsContent>

          <TabsContent value="templates" className="space-y-4">
            <EmailTemplatesTab />
          </TabsContent>

          <TabsContent value="actions" className="space-y-4">
            <EmailActionsTab />
          </TabsContent>

          <TabsContent value="campaigns" className="space-y-4">
            <CampaignsTab />
          </TabsContent>
        </Tabs>

        {/* Dialogs */}
        <TestEmailDialog open={showTestDialog} onOpenChange={setShowTestDialog} />
        <EmailSettingsModal open={showSettingsDialog} onOpenChange={setShowSettingsDialog} />
      </div>
    </div>
  );
};

export default EmailManagement;

