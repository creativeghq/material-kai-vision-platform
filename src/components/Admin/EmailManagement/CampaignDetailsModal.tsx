/**
 * Campaign Details Modal
 * View and manage campaign details, recipients, and statistics
 */

import React, { useState, useEffect } from 'react';
import { X, Users, BarChart3, Settings, Trash2, Play, Pause, Mail } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { campaignService } from '@/services/email/campaignService';
import { RecipientsTab } from './RecipientsTab';
import { format } from 'date-fns';

interface Campaign {
  id: string;
  name: string;
  description?: string;
  status: 'draft' | 'scheduled' | 'sending' | 'sent' | 'paused' | 'cancelled';
  scheduled_at?: string;
  sent_at?: string;
  recipient_count: number;
  subject_line?: string;
  preview_text?: string;
  from_name?: string;
  from_email?: string;
  reply_to?: string;
  track_opens: boolean;
  track_clicks: boolean;
  template?: {
    id: string;
    name: string;
  };
  created_at: string;
}

interface CampaignDetailsModalProps {
  campaign: Campaign;
  onClose: () => void;
  onUpdate: () => void;
}

interface CampaignStats {
  totalRecipients: number;
  sent: number;
  delivered: number;
  opened: number;
  clicked: number;
  bounced: number;
  complained: number;
  deliveryRate: number;
  openRate: number;
  clickRate: number;
}

const statusColors = {
  draft: 'bg-gray-500',
  scheduled: 'bg-blue-500',
  sending: 'bg-yellow-500',
  sent: 'bg-green-500',
  paused: 'bg-orange-500',
  cancelled: 'bg-red-500',
};

export const CampaignDetailsModal: React.FC<CampaignDetailsModalProps> = ({
  campaign,
  onClose,
  onUpdate,
}) => {
  const [stats, setStats] = useState<CampaignStats>({
    totalRecipients: 0,
    sent: 0,
    delivered: 0,
    opened: 0,
    clicked: 0,
    bounced: 0,
    complained: 0,
    deliveryRate: 0,
    openRate: 0,
    clickRate: 0,
  });
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [testEmail, setTestEmail] = useState('');
  const [showTestDialog, setShowTestDialog] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    loadCampaignStats();
  }, [campaign.id]);

  const loadCampaignStats = async () => {
    try {
      setLoading(true);

      const { data, error } = await supabase
        .from('campaign_recipients')
        .select('status, opened_at, clicked_at, bounced_at, complained_at')
        .eq('campaign_id', campaign.id);

      if (error) throw error;

      const recipients = data || [];
      const totalRecipients = recipients.length;
      const sent = recipients.filter(r => r.status === 'sent').length;
      const delivered = recipients.filter(r => r.status === 'sent' && !r.bounced_at).length;
      const opened = recipients.filter(r => r.opened_at).length;
      const clicked = recipients.filter(r => r.clicked_at).length;
      const bounced = recipients.filter(r => r.bounced_at).length;
      const complained = recipients.filter(r => r.complained_at).length;

      const deliveryRate = sent > 0 ? (delivered / sent) * 100 : 0;
      const openRate = delivered > 0 ? (opened / delivered) * 100 : 0;
      const clickRate = opened > 0 ? (clicked / opened) * 100 : 0;

      setStats({
        totalRecipients,
        sent,
        delivered,
        opened,
        clicked,
        bounced,
        complained,
        deliveryRate,
        openRate,
        clickRate,
      });
    } catch (error) {
      console.error('Error loading campaign stats:', error);
      toast({
        title: 'Error',
        description: 'Failed to load campaign statistics',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleStartCampaign = async () => {
    try {
      setActionLoading(true);
      await campaignService.startCampaign(campaign.id);
      toast({
        title: 'Success',
        description: 'Campaign started successfully',
      });
      onUpdate();
    } catch (error) {
      console.error('Error starting campaign:', error);
      toast({
        title: 'Error',
        description: 'Failed to start campaign',
        variant: 'destructive',
      });
    } finally {
      setActionLoading(false);
    }
  };

  const handlePauseCampaign = async () => {
    try {
      setActionLoading(true);
      await campaignService.pauseCampaign(campaign.id);
      toast({
        title: 'Success',
        description: 'Campaign paused successfully',
      });
      onUpdate();
    } catch (error) {
      console.error('Error pausing campaign:', error);
      toast({
        title: 'Error',
        description: 'Failed to pause campaign',
        variant: 'destructive',
      });
    } finally {
      setActionLoading(false);
    }
  };

  const handleResumeCampaign = async () => {
    try {
      setActionLoading(true);
      await campaignService.resumeCampaign(campaign.id);
      toast({
        title: 'Success',
        description: 'Campaign resumed successfully',
      });
      onUpdate();
    } catch (error) {
      console.error('Error resuming campaign:', error);
      toast({
        title: 'Error',
        description: 'Failed to resume campaign',
        variant: 'destructive',
      });
    } finally {
      setActionLoading(false);
    }
  };

  const handleCancelCampaign = async () => {
    if (!confirm('Are you sure you want to cancel this campaign? This action cannot be undone.')) {
      return;
    }

    try {
      setActionLoading(true);
      await campaignService.cancelCampaign(campaign.id);
      toast({
        title: 'Success',
        description: 'Campaign cancelled successfully',
      });
      onUpdate();
    } catch (error) {
      console.error('Error cancelling campaign:', error);
      toast({
        title: 'Error',
        description: 'Failed to cancel campaign',
        variant: 'destructive',
      });
    } finally {
      setActionLoading(false);
    }
  };

  const handleSendTest = async () => {
    if (!testEmail.trim()) {
      toast({
        title: 'Validation Error',
        description: 'Please enter a test email address',
        variant: 'destructive',
      });
      return;
    }

    try {
      setActionLoading(true);
      await campaignService.sendTestEmail(campaign.id, testEmail);
      toast({
        title: 'Success',
        description: `Test email sent to ${testEmail}`,
      });
      setShowTestDialog(false);
      setTestEmail('');
    } catch (error) {
      console.error('Error sending test email:', error);
      toast({
        title: 'Error',
        description: 'Failed to send test email',
        variant: 'destructive',
      });
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span>{campaign.name}</span>
              <Badge className={statusColors[campaign.status]}>
                {campaign.status}
              </Badge>
            </div>
            <Button variant="ghost" size="sm" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </DialogTitle>
        </DialogHeader>

        {/* Campaign Actions */}
        <div className="flex items-center gap-2 pb-4 border-b">
          {campaign.status === 'draft' && (
            <>
              <Button onClick={handleStartCampaign} disabled={actionLoading}>
                <Play className="h-4 w-4 mr-2" />
                Start Campaign
              </Button>
              <Button variant="outline" onClick={() => setShowTestDialog(true)} disabled={actionLoading}>
                <Mail className="h-4 w-4 mr-2" />
                Send Test
              </Button>
            </>
          )}

          {campaign.status === 'sending' && (
            <Button variant="outline" onClick={handlePauseCampaign} disabled={actionLoading}>
              <Pause className="h-4 w-4 mr-2" />
              Pause
            </Button>
          )}

          {campaign.status === 'paused' && (
            <Button onClick={handleResumeCampaign} disabled={actionLoading}>
              <Play className="h-4 w-4 mr-2" />
              Resume
            </Button>
          )}

          {['draft', 'scheduled', 'sending', 'paused'].includes(campaign.status) && (
            <Button variant="destructive" onClick={handleCancelCampaign} disabled={actionLoading}>
              <Trash2 className="h-4 w-4 mr-2" />
              Cancel Campaign
            </Button>
          )}
        </div>

        {/* Test Email Dialog */}
        {showTestDialog && (
          <div className="p-4 border rounded-lg bg-muted/50 space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="font-medium">Send Test Email</h4>
              <Button variant="ghost" size="sm" onClick={() => setShowTestDialog(false)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="space-y-2">
              <Label htmlFor="test_email">Test Email Address</Label>
              <div className="flex gap-2">
                <Input
                  id="test_email"
                  type="email"
                  value={testEmail}
                  onChange={(e) => setTestEmail(e.target.value)}
                  placeholder="test@example.com"
                />
                <Button onClick={handleSendTest} disabled={actionLoading}>
                  Send
                </Button>
              </div>
            </div>
          </div>
        )}

        <Tabs defaultValue="overview" className="space-y-4">
          <TabsList>
            <TabsTrigger value="overview">
              <BarChart3 className="h-4 w-4 mr-2" />
              Overview
            </TabsTrigger>
            <TabsTrigger value="recipients">
              <Users className="h-4 w-4 mr-2" />
              Recipients ({campaign.recipient_count})
            </TabsTrigger>
            <TabsTrigger value="settings">
              <Settings className="h-4 w-4 mr-2" />
              Settings
            </TabsTrigger>
          </TabsList>

          {/* Overview Tab */}
          <TabsContent value="overview" className="space-y-4">
            {/* Campaign Info */}
            <div className="p-4 rounded-lg border bg-card">
              <h4 className="font-medium mb-3">Campaign Information</h4>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground">Subject Line</p>
                  <p className="font-medium">{campaign.subject_line || 'Not set'}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Template</p>
                  <p className="font-medium">{campaign.template?.name || 'No template'}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Created</p>
                  <p className="font-medium">{format(new Date(campaign.created_at), 'MMM d, yyyy HH:mm')}</p>
                </div>
                {campaign.scheduled_at && (
                  <div>
                    <p className="text-muted-foreground">Scheduled</p>
                    <p className="font-medium">{format(new Date(campaign.scheduled_at), 'MMM d, yyyy HH:mm')}</p>
                  </div>
                )}
                {campaign.sent_at && (
                  <div>
                    <p className="text-muted-foreground">Sent</p>
                    <p className="font-medium">{format(new Date(campaign.sent_at), 'MMM d, yyyy HH:mm')}</p>
                  </div>
                )}
              </div>
              {campaign.description && (
                <div className="mt-4">
                  <p className="text-muted-foreground text-sm">Description</p>
                  <p className="text-sm">{campaign.description}</p>
                </div>
              )}
            </div>

            {/* Statistics */}
            {!loading && stats.totalRecipients > 0 && (
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <div className="p-4 rounded-lg border bg-card">
                  <p className="text-sm text-muted-foreground mb-1">Total Recipients</p>
                  <p className="text-2xl font-bold">{stats.totalRecipients}</p>
                </div>
                <div className="p-4 rounded-lg border bg-card">
                  <p className="text-sm text-muted-foreground mb-1">Sent</p>
                  <p className="text-2xl font-bold">{stats.sent}</p>
                </div>
                <div className="p-4 rounded-lg border bg-card">
                  <p className="text-sm text-muted-foreground mb-1">Delivered</p>
                  <p className="text-2xl font-bold">{stats.delivered}</p>
                  <p className="text-xs text-muted-foreground">{stats.deliveryRate.toFixed(1)}%</p>
                </div>
                <div className="p-4 rounded-lg border bg-card">
                  <p className="text-sm text-muted-foreground mb-1">Opened</p>
                  <p className="text-2xl font-bold">{stats.opened}</p>
                  <p className="text-xs text-muted-foreground">{stats.openRate.toFixed(1)}%</p>
                </div>
                <div className="p-4 rounded-lg border bg-card">
                  <p className="text-sm text-muted-foreground mb-1">Clicked</p>
                  <p className="text-2xl font-bold">{stats.clicked}</p>
                  <p className="text-xs text-muted-foreground">{stats.clickRate.toFixed(1)}%</p>
                </div>
                <div className="p-4 rounded-lg border bg-card">
                  <p className="text-sm text-muted-foreground mb-1">Bounced</p>
                  <p className="text-2xl font-bold">{stats.bounced}</p>
                </div>
              </div>
            )}
          </TabsContent>

          {/* Recipients Tab */}
          <TabsContent value="recipients">
            <RecipientsTab campaignId={campaign.id} />
          </TabsContent>

          {/* Settings Tab - Placeholder */}
          <TabsContent value="settings">
            <div className="p-8 text-center text-muted-foreground">
              Campaign settings coming soon
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
};

export default CampaignDetailsModal;

