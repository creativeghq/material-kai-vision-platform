/**
 * Messaging Campaigns Tab
 * Create and manage WhatsApp campaigns via Zernio
 */

import React, { useState, useEffect } from 'react';
import { Plus, Send, Calendar, Users, Play, Pause, Trash2, MessageCircle } from 'lucide-react';
import { Button } from '@/components/core/ui/button';
import { TablePagination, paginate, clampPage } from '@/components/core/ui/table-pagination';
import { SectionHeader } from '@/components/shared/SectionHeader';
import { useToast } from '@/hooks/use-toast';
import { messagingCampaignService, MessagingCampaign } from '../services/messagingCampaignService';
import { humanizeLabel } from '@/utils/humanize';
import { statusTone } from '@/utils/statusTone';
import { format } from 'date-fns';

const WhatsAppIcon = <MessageCircle className="h-4 w-4 text-green-500" />;

export const MessagingCampaignsTab: React.FC = () => {
  const [campaigns, setCampaigns] = useState<MessagingCampaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const { toast } = useToast();

  useEffect(() => {
    loadCampaigns();
  }, []);

  const loadCampaigns = async () => {
    try {
      setLoading(true);
      const data = await messagingCampaignService.getCampaigns();
      setCampaigns(data);
      // Cancelling a campaign can shrink the list — don't strand the user on a now-empty page.
      setPage((p) => clampPage(p, data.length));
    } catch (error) {
      console.error('Error loading campaigns:', error);
      toast({
        title: 'Error',
        description: 'Failed to load messaging campaigns',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleStartCampaign = async (campaignId: string) => {
    try {
      await messagingCampaignService.startCampaign(campaignId);
      toast({
        title: 'Success',
        description: 'Campaign started',
      });
      loadCampaigns();
    } catch (error) {
      console.error('Error starting campaign:', error);
      toast({
        title: 'Error',
        description: 'Failed to start campaign',
        variant: 'destructive',
      });
    }
  };

  const handlePauseCampaign = async (campaignId: string) => {
    try {
      await messagingCampaignService.pauseCampaign(campaignId);
      toast({
        title: 'Success',
        description: 'Campaign paused',
      });
      loadCampaigns();
    } catch (error) {
      console.error('Error pausing campaign:', error);
      toast({
        title: 'Error',
        description: 'Failed to pause campaign',
        variant: 'destructive',
      });
    }
  };

  const handleResumeCampaign = async (campaignId: string) => {
    try {
      await messagingCampaignService.resumeCampaign(campaignId);
      toast({
        title: 'Success',
        description: 'Campaign resumed',
      });
      loadCampaigns();
    } catch (error) {
      console.error('Error resuming campaign:', error);
      toast({
        title: 'Error',
        description: 'Failed to resume campaign',
        variant: 'destructive',
      });
    }
  };

  const handleCancelCampaign = async (campaignId: string) => {
    if (!confirm('Are you sure you want to cancel this campaign?')) return;

    try {
      await messagingCampaignService.cancelCampaign(campaignId);
      toast({
        title: 'Success',
        description: 'Campaign cancelled',
      });
      loadCampaigns();
    } catch (error) {
      console.error('Error cancelling campaign:', error);
      toast({
        title: 'Error',
        description: 'Failed to cancel campaign',
        variant: 'destructive',
      });
    }
  };

  if (loading) {
    return (
      <div className="dashboard-card">
        <div className="py-8 text-center text-muted-foreground">
          Loading campaigns...
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <SectionHeader
          title="Messaging Campaigns"
          subtitle="Create and manage WhatsApp campaigns"
          actions={
            <Button disabled>
              <Plus className="h-4 w-4 mr-2" />
              Create campaign
            </Button>
          }
        />
        <p className="-mt-4 text-sm text-muted-foreground">
          Note: Create messaging campaigns from the main Campaigns tab with channel type selection.
        </p>
      </div>

      {/* Campaigns List */}
      {campaigns.length === 0 ? (
        <div className="dashboard-card">
          <div className="py-12 text-center">
            <Send className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No messaging campaigns yet</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Create your first messaging campaign to get started
            </p>
          </div>
        </div>
      ) : (
        <div className="dashboard-card">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="sticky top-0 bg-muted/50 border-b border-border/50">
                <tr>
                  <th className="text-left py-3 px-4 font-medium">Campaign</th>
                  <th className="text-left py-3 px-4 font-medium">Channel</th>
                  <th className="text-left py-3 px-4 font-medium">Status</th>
                  <th className="text-left py-3 px-4 font-medium">Recipients</th>
                  <th className="text-left py-3 px-4 font-medium">Scheduled</th>
                  <th className="text-right py-3 px-4 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {paginate(campaigns, page).map((campaign) => (
                  <tr key={campaign.id} className="border-b last:border-0 hover:bg-muted/50">
                    <td className="py-3 px-4">
                      <div className="font-medium">{campaign.name}</div>
                      {campaign.description && (
                        <div className="text-xs text-muted-foreground">{campaign.description}</div>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        {WhatsAppIcon}
                        <span className="capitalize">{campaign.channel_type}</span>
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <span className={`text-sm capitalize ${statusTone(campaign.status)}`}>
                        {humanizeLabel(campaign.status)}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-1">
                        <Users className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm">{campaign.recipient_count}</span>
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      {campaign.scheduled_at ? (
                        <div className="flex items-center gap-1 text-sm">
                          <Calendar className="h-4 w-4 text-muted-foreground" />
                          {format(new Date(campaign.scheduled_at), 'MMM d, yyyy HH:mm')}
                        </div>
                      ) : (
                        <span className="text-sm text-muted-foreground">Not scheduled</span>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center justify-end gap-2">
                        {campaign.status === 'draft' && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleStartCampaign(campaign.id)}
                            title="Start campaign"
                          >
                            <Play className="h-4 w-4" />
                          </Button>
                        )}
                        {campaign.status === 'sending' && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handlePauseCampaign(campaign.id)}
                            title="Pause campaign"
                          >
                            <Pause className="h-4 w-4" />
                          </Button>
                        )}
                        {campaign.status === 'paused' && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleResumeCampaign(campaign.id)}
                            title="Resume campaign"
                          >
                            <Play className="h-4 w-4" />
                          </Button>
                        )}
                        {['draft', 'scheduled', 'sending', 'paused'].includes(campaign.status) && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleCancelCampaign(campaign.id)}
                            title="Cancel campaign"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <TablePagination
            page={page}
            total={campaigns.length}
            onPageChange={setPage}
            label="campaigns"
          />
        </div>
      )}
    </div>
  );
};

export default MessagingCampaignsTab;
