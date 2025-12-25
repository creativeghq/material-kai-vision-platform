/**
 * Email Management Component
 * Admin dashboard for managing emails, domains, templates, and analytics
 */

import React, { useState, useEffect } from 'react';
import { Mail, Send, Database, BarChart3, Settings, TestTube, Zap, Megaphone } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { emailService } from '@/services/email/emailService';
import { GlobalAdminHeader } from './GlobalAdminHeader';
import { EmailDomainsTab } from './EmailManagement/EmailDomainsTab';
import { EmailLogsTab } from './EmailManagement/EmailLogsTab';
import { EmailAnalyticsTab } from './EmailManagement/EmailAnalyticsTab';
import { EmailTemplatesTab } from './EmailManagement/EmailTemplatesTab';
import { EmailActionsTab } from './EmailManagement/EmailActionsTab';
import { CampaignsTab } from './EmailManagement/CampaignsTab';
import { TestEmailDialog } from './EmailManagement/TestEmailDialog';
import { EmailSettingsModal } from './EmailManagement/EmailSettingsModal';

export const EmailManagement: React.FC = () => {
  const [analytics, setAnalytics] = useState({
    totalSent: 0,
    totalDelivered: 0,
    totalBounced: 0,
    totalComplained: 0,
    deliveryRate: 0,
    bounceRate: 0,
    complaintRate: 0,
  });
  const [sendingStats, setSendingStats] = useState({
    max24HourSend: 0,
    maxSendRate: 0,
    sentLast24Hours: 0,
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

      // Load analytics for last 30 days
      const fromDate = new Date();
      fromDate.setDate(fromDate.getDate() - 30);

      const [analyticsData, statsData] = await Promise.all([
        emailService.getAnalytics(fromDate),
        emailService.getSendingStats(),
      ]);

      setAnalytics(analyticsData);
      setSendingStats(statsData);
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
      <div className="max-w-7xl mx-auto px-6 py-8 space-y-6">
        {/* Header Actions */}
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => setShowSettingsDialog(true)}>
            <Settings className="mr-2 h-4 w-4" />
            Email Settings
          </Button>
          <Button onClick={() => setShowTestDialog(true)}>
            <TestTube className="mr-2 h-4 w-4" />
            Send Test Email
          </Button>
        </div>

        {/* Stats Cards */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {/* Total Sent Card */}
          <div className="dashboard-card">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <div
                  className="flex items-center justify-center"
                  style={{
                    width: '2.5rem',
                    height: '2.5rem',
                    borderRadius: 'var(--radius-lg)',
                    backgroundColor: 'hsl(var(--primary) / 0.1)'
                  }}
                >
                  <Send className="h-5 w-5" style={{ color: 'hsl(var(--primary))' }} />
                </div>
              </div>
            </div>
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">Total Sent</p>
              <p className="text-2xl font-bold">{analytics.totalSent.toLocaleString()}</p>
              <p className="text-xs text-muted-foreground">Last 30 days</p>
            </div>
          </div>

          {/* Delivery Rate Card */}
          <div className="dashboard-card">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <div
                  className="flex items-center justify-center"
                  style={{
                    width: '2.5rem',
                    height: '2.5rem',
                    borderRadius: 'var(--radius-lg)',
                    backgroundColor: 'hsl(142 71% 45% / 0.1)'
                  }}
                >
                  <BarChart3 className="h-5 w-5" style={{ color: 'hsl(142 71% 45%)' }} />
                </div>
              </div>
            </div>
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">Delivery Rate</p>
              <p className="text-2xl font-bold">{analytics.deliveryRate.toFixed(1)}%</p>
              <p className="text-xs text-muted-foreground">
                {analytics.totalDelivered.toLocaleString()} delivered
              </p>
            </div>
          </div>

          {/* Bounce Rate Card */}
          <div className="dashboard-card">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <div
                  className="flex items-center justify-center"
                  style={{
                    width: '2.5rem',
                    height: '2.5rem',
                    borderRadius: 'var(--radius-lg)',
                    backgroundColor: analytics.bounceRate > 5 ? 'hsl(var(--destructive) / 0.1)' : 'hsl(var(--muted) / 0.5)'
                  }}
                >
                  <Mail className="h-5 w-5" style={{ color: analytics.bounceRate > 5 ? 'hsl(var(--destructive))' : 'hsl(var(--muted-foreground))' }} />
                </div>
              </div>
              <Badge variant={analytics.bounceRate > 5 ? 'destructive' : 'secondary'}>
                {analytics.bounceRate.toFixed(2)}%
              </Badge>
            </div>
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">Bounce Rate</p>
              <p className="text-2xl font-bold">{analytics.totalBounced.toLocaleString()}</p>
              <p className="text-xs text-muted-foreground">bounced emails</p>
            </div>
          </div>

          {/* Daily Quota Card */}
          <div className="dashboard-card">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <div
                  className="flex items-center justify-center"
                  style={{
                    width: '2.5rem',
                    height: '2.5rem',
                    borderRadius: 'var(--radius-lg)',
                    backgroundColor: 'hsl(271 76% 53% / 0.1)'
                  }}
                >
                  <Database className="h-5 w-5" style={{ color: 'hsl(271 76% 53%)' }} />
                </div>
              </div>
            </div>
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">Daily Quota</p>
              <p className="text-2xl font-bold">
                {sendingStats.sentLast24Hours} / {sendingStats.max24HourSend}
              </p>
              <p className="text-xs text-muted-foreground">
                {((sendingStats.sentLast24Hours / sendingStats.max24HourSend) * 100).toFixed(1)}% used
              </p>
            </div>
          </div>
        </div>

        {/* Main Content Tabs */}
        <Tabs defaultValue="analytics" className="space-y-6">
          <TabsList className="bg-muted/50">
            <TabsTrigger value="analytics">
              <BarChart3 className="mr-2 h-4 w-4" />
              Analytics
            </TabsTrigger>
            <TabsTrigger value="logs">
              <Mail className="mr-2 h-4 w-4" />
              Email Logs
            </TabsTrigger>
            <TabsTrigger value="domains">
              <Database className="mr-2 h-4 w-4" />
              Domains
            </TabsTrigger>
            <TabsTrigger value="templates">
              <Settings className="mr-2 h-4 w-4" />
              Templates
            </TabsTrigger>
            <TabsTrigger value="actions">
              <Zap className="mr-2 h-4 w-4" />
              Actions
            </TabsTrigger>
            <TabsTrigger value="campaigns">
              <Megaphone className="mr-2 h-4 w-4" />
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

