/**
 * Messaging Campaign Service
 * Helper functions for managing WhatsApp campaigns via Zernio
 */

import { supabase } from '@/integrations/supabase/client';
import type { MessagingCampaignRecipient, MessagingCampaignStats, MessagingChannelType } from './types';

export interface MessagingCampaign {
  id: string;
  name: string;
  description?: string;
  status: 'draft' | 'scheduled' | 'sending' | 'sent' | 'paused' | 'cancelled';
  channel_type: MessagingChannelType;
  messaging_template_id?: string;
  messaging_channel_id?: string;
  scheduled_at?: string;
  sent_at?: string;
  recipient_count: number;
  created_at: string;
}

class MessagingCampaignService {
  /**
   * Start sending a campaign immediately
   */
  async startCampaign(campaignId: string): Promise<void> {
    const { error } = await supabase
      .from('campaigns')
      .update({ status: 'sending' })
      .eq('id', campaignId)
      .eq('status', 'draft');

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
      .eq('status', 'sending');

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
      .eq('status', 'paused');

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
  async getCampaignStats(campaignId: string): Promise<MessagingCampaignStats> {
    const { data: recipients, error } = await supabase
      .from('messaging_campaign_recipients')
      .select('status, delivered_at, read_at, failed_at')
      .eq('campaign_id', campaignId);

    if (error) throw error;

    const total = recipients?.length || 0;
    const pending = recipients?.filter(r => r.status === 'pending').length || 0;
    const sent = recipients?.filter(r => ['sent', 'delivered', 'read'].includes(r.status)).length || 0;
    const delivered = recipients?.filter(r => ['delivered', 'read'].includes(r.status)).length || 0;
    const read = recipients?.filter(r => r.status === 'read').length || 0;
    const failed = recipients?.filter(r => r.status === 'failed').length || 0;
    const optedOut = recipients?.filter(r => r.status === 'opted_out').length || 0;

    // Get cost from message logs
    const { data: logs } = await supabase
      .from('messaging_logs')
      .select('cost')
      .eq('campaign_id', campaignId);

    const totalCost = logs?.reduce((sum, log) => sum + (log.cost || 0), 0) || 0;

    return {
      total,
      pending,
      sent,
      delivered,
      read,
      failed,
      optedOut,
      deliveryRate: sent > 0 ? (delivered / sent) * 100 : 0,
      readRate: delivered > 0 ? (read / delivered) * 100 : 0,
      totalCost,
    };
  }

  /**
   * Add recipients to a campaign
   */
  async addRecipients(
    campaignId: string,
    recipients: Array<{ phoneNumber: string; contactId?: string; contactName?: string; variables?: Record<string, any> }>,
  ): Promise<void> {
    const recipientRecords = recipients.map(r => ({
      campaign_id: campaignId,
      phone_number: r.phoneNumber,
      contact_id: r.contactId,
      contact_name: r.contactName,
      variables: r.variables || {},
      status: 'pending',
    }));

    const { error } = await supabase
      .from('messaging_campaign_recipients')
      .insert(recipientRecords);

    if (error) throw error;

    // Update recipient count on campaign
    await this.updateRecipientCount(campaignId);
  }

  /**
   * Remove a recipient from a campaign
   */
  async removeRecipient(recipientId: string): Promise<void> {
    // Get campaign ID before deleting
    const { data: recipient } = await supabase
      .from('messaging_campaign_recipients')
      .select('campaign_id')
      .eq('id', recipientId)
      .single();

    const { error } = await supabase
      .from('messaging_campaign_recipients')
      .delete()
      .eq('id', recipientId)
      .eq('status', 'pending');

    if (error) throw error;

    // Update recipient count
    if (recipient?.campaign_id) {
      await this.updateRecipientCount(recipient.campaign_id);
    }
  }

  /**
   * Update recipient count on campaign
   */
  private async updateRecipientCount(campaignId: string): Promise<void> {
    const { count } = await supabase
      .from('messaging_campaign_recipients')
      .select('*', { count: 'exact', head: true })
      .eq('campaign_id', campaignId);

    await supabase
      .from('campaigns')
      .update({ recipient_count: count || 0 })
      .eq('id', campaignId);
  }

  /**
   * Get campaign recipients
   */
  async getRecipients(campaignId: string, status?: string): Promise<MessagingCampaignRecipient[]> {
    let query = supabase
      .from('messaging_campaign_recipients')
      .select('*')
      .eq('campaign_id', campaignId)
      .order('created_at', { ascending: false });

    if (status) {
      query = query.eq('status', status);
    }

    const { data, error } = await query;

    if (error) throw error;
    return data || [];
  }

  /**
   * Send a test message for a campaign
   */
  async sendTestMessage(campaignId: string, testNumber: string): Promise<void> {
    const { data, error } = await supabase.functions.invoke('messaging-api', {
      body: {
        action: 'send-test',
        campaignId,
        testNumber,
      },
    });

    if (error) throw error;
    return data;
  }

  /**
   * Import recipients from CSV data
   */
  async importRecipients(
    campaignId: string,
    csvData: Array<Record<string, string>>,
    phoneColumnName: string = 'phone',
    nameColumnName?: string,
  ): Promise<{ imported: number; skipped: number; errors: string[] }> {
    const recipients: Array<{ phoneNumber: string; contactName?: string; variables: Record<string, any> }> = [];
    const errors: string[] = [];
    let skipped = 0;

    for (let i = 0; i < csvData.length; i++) {
      const row = csvData[i];
      const phoneNumber = row[phoneColumnName];

      if (!phoneNumber) {
        errors.push(`Row ${i + 1}: Missing phone number`);
        skipped++;
        continue;
      }

      // Normalize phone number
      const normalized = this.normalizePhoneNumber(phoneNumber);
      if (!this.validatePhoneNumber(normalized)) {
        errors.push(`Row ${i + 1}: Invalid phone number format: ${phoneNumber}`);
        skipped++;
        continue;
      }

      recipients.push({
        phoneNumber: normalized,
        contactName: nameColumnName ? row[nameColumnName] : undefined,
        variables: row, // Include all columns as variables
      });
    }

    if (recipients.length > 0) {
      await this.addRecipients(campaignId, recipients);
    }

    return {
      imported: recipients.length,
      skipped,
      errors,
    };
  }

  /**
   * Validate phone number format (E.164)
   */
  private validatePhoneNumber(phoneNumber: string): boolean {
    const e164Regex = /^\+[1-9]\d{7,14}$/;
    return e164Regex.test(phoneNumber);
  }

  /**
   * Normalize phone number to E.164 format
   */
  private normalizePhoneNumber(phoneNumber: string, defaultCountryCode: string = '+1'): string {
    let normalized = phoneNumber.replace(/[^\d+]/g, '');

    if (!normalized.startsWith('+')) {
      if (normalized.startsWith('00')) {
        normalized = '+' + normalized.substring(2);
      } else {
        normalized = defaultCountryCode + normalized;
      }
    }

    return normalized;
  }

  /**
   * Create a new messaging campaign
   */
  async createCampaign(campaign: {
    name: string;
    description?: string;
    channel_type: MessagingChannelType;
    messaging_template_id?: string;
    messaging_channel_id?: string;
    scheduled_at?: string;
  }): Promise<MessagingCampaign> {
    const { data, error } = await supabase
      .from('campaigns')
      .insert({
        ...campaign,
        status: 'draft',
        recipient_count: 0,
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  /**
   * Get messaging campaigns
   */
  async getCampaigns(channelType?: MessagingChannelType): Promise<MessagingCampaign[]> {
    let query = supabase
      .from('campaigns')
      .select('*')
      .eq('channel_type', 'whatsapp')
      .order('created_at', { ascending: false });

    if (channelType) {
      query = query.eq('channel_type', channelType);
    }

    const { data, error } = await query;

    if (error) throw error;
    return data || [];
  }
}

export const messagingCampaignService = new MessagingCampaignService();
