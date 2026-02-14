/**
 * Push Notifications Tab
 * Manage web push notifications, subscriptions, and VAPID configuration
 */

import React, { useState, useEffect } from 'react';
import { Bell, Send, Trash2, AlertCircle, CheckCircle2, Chrome, Globe, Smartphone } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import { Textarea } from '@/components/core/ui/textarea';
import { Badge } from '@/components/core/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/core/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/core/ui/dialog';
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from '@/components/core/ui/alert';

interface PushSubscription {
  id: string;
  user_id: string;
  endpoint: string;
  p256dh_key: string;
  auth_key: string;
  is_active: boolean;
  user_agent?: string;
  created_at: string;
  last_used_at?: string;
}

interface PushAnalytics {
  totalSubscriptions: number;
  activeSubscriptions: number;
  inactiveSubscriptions: number;
  browserBreakdown: Record<string, number>;
  recentActivity: number;
}

export const PushNotificationsTab: React.FC = () => {
  const [subscriptions, setSubscriptions] = useState<PushSubscription[]>([]);
  const [analytics, setAnalytics] = useState<PushAnalytics>({
    totalSubscriptions: 0,
    activeSubscriptions: 0,
    inactiveSubscriptions: 0,
    browserBreakdown: {},
    recentActivity: 0,
  });
  const [loading, setLoading] = useState(true);
  const [testDialogOpen, setTestDialogOpen] = useState(false);
  const [testNotification, setTestNotification] = useState({
    title: 'Test Notification',
    message: 'This is a test push notification from Material KAI Vision Platform',
  });
  const [sendingTest, setSendingTest] = useState(false);
  const [vapidConfig, setVapidConfig] = useState<{
    publicKey?: string;
    configured: boolean;
  }>({ configured: false });
  const { toast } = useToast();

  useEffect(() => {
    loadData();
    checkVapidConfig();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);

      // Load push subscriptions
      const { data: subs, error } = await supabase
        .from('push_subscriptions')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;

      setSubscriptions(subs || []);

      // Calculate analytics
      const active = (subs || []).filter(s => s.is_active);
      const inactive = (subs || []).filter(s => !s.is_active);

      // Browser breakdown (parse from user_agent or endpoint)
      const browserBreakdown: Record<string, number> = {};
      (subs || []).forEach(sub => {
        const browser = detectBrowser(sub.user_agent || sub.endpoint);
        browserBreakdown[browser] = (browserBreakdown[browser] || 0) + 1;
      });

      // Recent activity (last 7 days)
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      const recentActivity = (subs || []).filter(
        s => new Date(s.created_at) > sevenDaysAgo
      ).length;

      setAnalytics({
        totalSubscriptions: (subs || []).length,
        activeSubscriptions: active.length,
        inactiveSubscriptions: inactive.length,
        browserBreakdown,
        recentActivity,
      });
    } catch (error) {
      console.error('Error loading push subscriptions:', error);
      toast({
        title: 'Error',
        description: 'Failed to load push subscriptions',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const checkVapidConfig = async () => {
    try {
      // Try to get VAPID public key from edge function
      const { data, error } = await supabase.functions.invoke('notification-dispatcher', {
        body: { action: 'get-vapid-key' },
      });

      if (!error && data?.publicKey) {
        setVapidConfig({
          publicKey: data.publicKey,
          configured: true,
        });
      }
    } catch (error) {
      console.log('VAPID not configured:', error);
    }
  };

  const detectBrowser = (userAgentOrEndpoint: string): string => {
    const ua = userAgentOrEndpoint.toLowerCase();
    if (ua.includes('chrome') || ua.includes('fcm.googleapis.com')) return 'Chrome';
    if (ua.includes('firefox') || ua.includes('mozilla.com')) return 'Firefox';
    if (ua.includes('safari') && !ua.includes('chrome')) return 'Safari';
    if (ua.includes('edge')) return 'Edge';
    return 'Other';
  };

  const getBrowserIcon = (browser: string) => {
    switch (browser) {
      case 'Chrome':
      case 'Edge':
        return <Chrome className="h-4 w-4" />;
      case 'Firefox':
        return <Globe className="h-4 w-4 text-orange-500" />;
      case 'Safari':
        return <Smartphone className="h-4 w-4 text-blue-500" />;
      default:
        return <Globe className="h-4 w-4" />;
    }
  };

  const handleSendTestNotification = async () => {
    try {
      setSendingTest(true);

      // Get current user
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      // Get user's active push subscriptions
      const { data: subs, error: subsError } = await supabase
        .from('push_subscriptions')
        .select('*')
        .eq('user_id', user.id)
        .eq('is_active', true);

      if (subsError) throw subsError;
      if (!subs || subs.length === 0) {
        throw new Error('No active push subscriptions found for your account');
      }

      // Send test notification via edge function
      const { data, error } = await supabase.functions.invoke('notification-dispatcher', {
        body: {
          action: 'send-push',
          subscriptions: subs,
          notification: {
            title: testNotification.title,
            body: testNotification.message,
            icon: '/favicon.ico',
            badge: '/favicon.ico',
            data: {
              url: window.location.origin,
              timestamp: new Date().toISOString(),
            },
          },
        },
      });

      if (error) throw error;

      toast({
        title: 'Test Notification Sent',
        description: `Sent to ${subs.length} active subscription(s)`,
      });

      setTestDialogOpen(false);
    } catch (error) {
      console.error('Error sending test notification:', error);
      toast({
        title: 'Failed to Send',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setSendingTest(false);
    }
  };

  const handleDeleteSubscription = async (subscriptionId: string) => {
    try {
      const { error } = await supabase
        .from('push_subscriptions')
        .update({ is_active: false })
        .eq('id', subscriptionId);

      if (error) throw error;

      toast({
        title: 'Subscription Removed',
        description: 'Push subscription has been deactivated',
      });

      loadData();
    } catch (error) {
      console.error('Error deleting subscription:', error);
      toast({
        title: 'Error',
        description: 'Failed to remove subscription',
        variant: 'destructive',
      });
    }
  };

  const handleCleanupInactive = async () => {
    try {
      const { error } = await supabase
        .from('push_subscriptions')
        .delete()
        .eq('is_active', false);

      if (error) throw error;

      toast({
        title: 'Cleanup Complete',
        description: 'Inactive subscriptions have been removed',
      });

      loadData();
    } catch (error) {
      console.error('Error cleaning up subscriptions:', error);
      toast({
        title: 'Error',
        description: 'Failed to cleanup subscriptions',
        variant: 'destructive',
      });
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-muted-foreground">Loading push notifications data...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* VAPID Configuration Alert */}
      {!vapidConfig.configured && (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>VAPID Configuration Required</AlertTitle>
          <AlertDescription>
            To enable web push notifications, you need to configure VAPID keys in your Supabase Edge Function secrets.
            Add <code className="px-1 py-0.5 bg-muted rounded">VAPID_PUBLIC_KEY</code>,{' '}
            <code className="px-1 py-0.5 bg-muted rounded">VAPID_PRIVATE_KEY</code>, and{' '}
            <code className="px-1 py-0.5 bg-muted rounded">VAPID_SUBJECT</code> to enable push notifications.
          </AlertDescription>
        </Alert>
      )}

      {vapidConfig.configured && (
        <Alert className="border-green-200 bg-green-50">
          <CheckCircle2 className="h-4 w-4 text-green-600" />
          <AlertTitle className="text-green-900">VAPID Configured</AlertTitle>
          <AlertDescription className="text-green-800">
            Push notifications are enabled. Public Key: <code className="px-1 py-0.5 bg-white rounded text-xs">
              {vapidConfig.publicKey?.substring(0, 20)}...
            </code>
          </AlertDescription>
        </Alert>
      )}

      {/* Analytics Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {/* Total Subscriptions */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Subscriptions
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{analytics.totalSubscriptions}</div>
            <p className="text-xs text-muted-foreground mt-1">All time</p>
          </CardContent>
        </Card>

        {/* Active Subscriptions */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Active Subscriptions
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{analytics.activeSubscriptions}</div>
            <p className="text-xs text-muted-foreground mt-1">Currently active</p>
          </CardContent>
        </Card>

        {/* Recent Activity */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Recent Activity
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{analytics.recentActivity}</div>
            <p className="text-xs text-muted-foreground mt-1">Last 7 days</p>
          </CardContent>
        </Card>

        {/* Browser Breakdown */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Browser Breakdown
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {Object.entries(analytics.browserBreakdown).map(([browser, count]) => (
                <Badge key={browser} variant="outline" className="flex items-center gap-1">
                  {getBrowserIcon(browser)}
                  {browser}: {count}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Actions */}
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold">Active Subscriptions</h3>
        <div className="flex gap-2">
          {analytics.inactiveSubscriptions > 0 && (
            <Button variant="outline" onClick={handleCleanupInactive}>
              <Trash2 className="mr-2 h-4 w-4" />
              Cleanup Inactive ({analytics.inactiveSubscriptions})
            </Button>
          )}
          <Button onClick={() => setTestDialogOpen(true)} disabled={!vapidConfig.configured}>
            <Send className="mr-2 h-4 w-4" />
            Send Test Notification
          </Button>
        </div>
      </div>

      {/* Subscriptions Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User ID</TableHead>
                <TableHead>Browser</TableHead>
                <TableHead>Endpoint</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {subscriptions.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                    <Bell className="mx-auto h-8 w-8 mb-2 opacity-50" />
                    <p>No push subscriptions found</p>
                    <p className="text-sm mt-1">Users need to enable push notifications in their browser</p>
                  </TableCell>
                </TableRow>
              ) : (
                subscriptions.map((sub) => (
                  <TableRow key={sub.id}>
                    <TableCell className="font-mono text-xs">
                      {sub.user_id.substring(0, 8)}...
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {getBrowserIcon(detectBrowser(sub.user_agent || sub.endpoint))}
                        <span className="text-sm">{detectBrowser(sub.user_agent || sub.endpoint)}</span>
                      </div>
                    </TableCell>
                    <TableCell className="font-mono text-xs max-w-xs truncate">
                      {sub.endpoint}
                    </TableCell>
                    <TableCell>
                      <Badge variant={sub.is_active ? 'default' : 'secondary'}>
                        {sub.is_active ? 'Active' : 'Inactive'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {new Date(sub.created_at).toLocaleDateString()}
                    </TableCell>
                    <TableCell className="text-right">
                      {sub.is_active && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeleteSubscription(sub.id)}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Test Notification Dialog */}
      <Dialog open={testDialogOpen} onOpenChange={setTestDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Send Test Push Notification</DialogTitle>
            <DialogDescription>
              This will send a test notification to all your active push subscriptions.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="test-title">Title</Label>
              <Input
                id="test-title"
                value={testNotification.title}
                onChange={(e) => setTestNotification({ ...testNotification, title: e.target.value })}
                placeholder="Notification title"
              />
            </div>
            <div>
              <Label htmlFor="test-message">Message</Label>
              <Textarea
                id="test-message"
                value={testNotification.message}
                onChange={(e) => setTestNotification({ ...testNotification, message: e.target.value })}
                placeholder="Notification message"
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTestDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSendTestNotification} disabled={sendingTest}>
              {sendingTest ? 'Sending...' : 'Send Test'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default PushNotificationsTab;
