/**
 * Campaign Service
 * Helper functions for managing email campaigns
 */

import { supabase } from '@/integrations/supabase/client';

export interface Campaign {
  id: string;
  name: string;
  description?: string;
  status: 'draft' | 'scheduled' | 'sending' | 'sent' | 'paused' | 'cancelled';
  template_id?: string;
  subject_line?: string;
  scheduled_at?: string;
  sent_at?: string;
  recipient_count: number;
}

export interface CampaignRecipient {
  id: string;
  campaign_id: string;
  email: string;
  user_id?: string;
  status: 'pending' | 'sending' | 'sent' | 'failed' | 'bounced' | 'complained';
  sent_at?: string;
  delivered_at?: string;
  opened_at?: string;
  clicked_at?: string;
}

class CampaignService {
  /**
   * Start sending a campaign immediately
   */
  async startCampaign(campaignId: string): Promise<void> {
    const { error } = await supabase
      .from('campaigns')
      .update({ status: 'sending' })
      .eq('id', campaignId)
      .eq('status', 'draft'); // Only start if it's a draft

    if (error) throw error;
  }

  /**
   * Pause a sending campaign
   */
  async pauseCampaign(campaignId: string): Promise<void> {
    const { error } = await supabase
      .from('campaigns')
      .update({ status: 'paused' })
      .eq('id', campaignId)
      .eq('status', 'sending'); // Only pause if it's sending

    if (error) throw error;
  }

  /**
   * Resume a paused campaign
   */
  async resumeCampaign(campaignId: string): Promise<void> {
    const { error } = await supabase
      .from('campaigns')
      .update({ status: 'sending' })
      .eq('id', campaignId)
      .eq('status', 'paused'); // Only resume if it's paused

    if (error) throw error;
  }

  /**
   * Cancel a campaign
   */
  async cancelCampaign(campaignId: string): Promise<void> {
    const { error } = await supabase
      .from('campaigns')
      .update({ status: 'cancelled' })
      .eq('id', campaignId)
      .in('status', ['draft', 'scheduled', 'sending', 'paused']);

    if (error) throw error;
  }

  /**
   * Get campaign statistics
   */
  async getCampaignStats(campaignId: string) {
    const { data: recipients, error } = await supabase
      .from('campaign_recipients')
      .select('status, opened_at, clicked_at, bounced_at, complained_at')
      .eq('campaign_id', campaignId);

    if (error) throw error;

    const total = recipients?.length || 0;
    const sent = recipients?.filter(r => r.status === 'sent').length || 0;
    const delivered = recipients?.filter(r => r.status === 'sent' && !r.bounced_at).length || 0;
    const opened = recipients?.filter(r => r.opened_at).length || 0;
    const clicked = recipients?.filter(r => r.clicked_at).length || 0;
    const bounced = recipients?.filter(r => r.bounced_at).length || 0;
    const complained = recipients?.filter(r => r.complained_at).length || 0;
    const failed = recipients?.filter(r => r.status === 'failed').length || 0;

    return {
      total,
      sent,
      delivered,
      opened,
      clicked,
      bounced,
      complained,
      failed,
      deliveryRate: sent > 0 ? (delivered / sent) * 100 : 0,
      openRate: delivered > 0 ? (opened / delivered) * 100 : 0,
      clickRate: opened > 0 ? (clicked / opened) * 100 : 0,
      bounceRate: sent > 0 ? (bounced / sent) * 100 : 0,
      complaintRate: sent > 0 ? (complained / sent) * 100 : 0,
    };
  }

  /**
   * Send a test email for a campaign
   */
  async sendTestEmail(campaignId: string, testEmail: string): Promise<void> {
    // Get campaign details
    const { data: campaign, error: campaignError } = await supabase
      .from('campaigns')
      .select('*, template:email_templates(*)')
      .eq('id', campaignId)
      .single();

    if (campaignError) throw campaignError;

    // Call email-api to send test
    const response = await fetch('/api/email/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        to: testEmail,
        template_id: campaign.template_id,
        subject: `[TEST] ${campaign.subject_line || 'Test Email'}`,
        variables: {
          userName: 'Test User',
        },
        metadata: {
          campaign_id: campaignId,
          is_test: true,
        },
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Failed to send test email');
    }
  }

  /**
   * Add recipients to a campaign
   */
  async addRecipients(campaignId: string, emails: string[]): Promise<void> {
    const recipients = emails.map(email => ({
      campaign_id: campaignId,
      email: email.trim(),
      status: 'pending',
    }));

    const { error } = await supabase
      .from('campaign_recipients')
      .insert(recipients);

    if (error) throw error;
  }

  /**
   * Remove a recipient from a campaign
   */
  async removeRecipient(recipientId: string): Promise<void> {
    const { error } = await supabase
      .from('campaign_recipients')
      .delete()
      .eq('id', recipientId)
      .eq('status', 'pending'); // Only remove if not sent yet

    if (error) throw error;
  }
}

export const campaignService = new CampaignService();

