/**
 * Email Management Component
 * Admin dashboard for managing emails, domains, templates, and analytics
 */

import React, { useState, useEffect } from 'react';
import { Mail, Send, Database, BarChart3, Settings, TestTube } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { emailService } from '@/services/email/emailService';
import { EmailDomainsTab } from './EmailManagement/EmailDomainsTab';
import { EmailLogsTab } from './EmailManagement/EmailLogsTab';
import { EmailAnalyticsTab } from './EmailManagement/EmailAnalyticsTab';
import { EmailTemplatesTab } from './EmailManagement/EmailTemplatesTab';
import { TestEmailDialog } from './EmailManagement/TestEmailDialog';

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
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Email Management</h1>
          <p className="text-muted-foreground mt-1">
            Manage email domains, templates, and monitor delivery analytics
          </p>
        </div>
        <Button onClick={() => setShowTestDialog(true)}>
          <TestTube className="mr-2 h-4 w-4" />
          Send Test Email
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Sent</CardTitle>
            <Send className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{analytics.totalSent.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">Last 30 days</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Delivery Rate</CardTitle>
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{analytics.deliveryRate.toFixed(1)}%</div>
            <p className="text-xs text-muted-foreground">
              {analytics.totalDelivered.toLocaleString()} delivered
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Bounce Rate</CardTitle>
            <Mail className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              <Badge variant={analytics.bounceRate > 5 ? 'destructive' : 'secondary'}>
                {analytics.bounceRate.toFixed(2)}%
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              {analytics.totalBounced.toLocaleString()} bounced
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Daily Quota</CardTitle>
            <Database className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {sendingStats.sentLast24Hours} / {sendingStats.max24HourSend}
            </div>
            <p className="text-xs text-muted-foreground">
              {((sendingStats.sentLast24Hours / sendingStats.max24HourSend) * 100).toFixed(1)}% used
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Main Content Tabs */}
      <Tabs defaultValue="analytics" className="space-y-4">
        <TabsList>
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
      </Tabs>

      {/* Test Email Dialog */}
      <TestEmailDialog open={showTestDialog} onOpenChange={setShowTestDialog} />
    </div>
  );
};

export default EmailManagement;

