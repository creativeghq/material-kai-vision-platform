/**
 * Messaging Service
 * Handles SMS, WhatsApp, and Viber messaging via Infobip through Supabase Edge Functions
 *
 * IMPORTANT: Infobip credentials are stored as Supabase Secrets, NOT in environment variables
 * All messaging operations go through the messaging-api Edge Function which has access to secrets
 */

import { supabase } from '@/integrations/supabase/client';
import type {
  MessagingChannel,
  MessagingTemplate,
  MessagingLog,
  MessagingOptout,
  MessagingChannelType,
  SendMessageOptions,
  SendBulkOptions,
  MessageLogFilters,
  MessagingAnalyticsResponse,
} from './types';

export class MessagingService {
  /**
   * Send a message via the messaging-api Edge Function
   */
  async sendMessage(options: SendMessageOptions): Promise<{ messageId: string; logId: string }> {
    try {
      const { data, error } = await supabase.functions.invoke('messaging-api', {
        body: {
          action: 'send',
          ...options,
        },
      });

      if (error) {
        console.error('Edge function error:', error);
        const errorMessage = error.message || 'Failed to send message';
        throw new Error(errorMessage);
      }

      if (!data || !data.messageId) {
        throw new Error('Invalid response from messaging service');
      }

      return data;
    } catch (error: any) {
      console.error('Error sending message:', error);

      if (error.message?.includes('FunctionsRelayError')) {
        throw new Error('Messaging service unavailable. Please check edge function deployment.');
      } else if (error.message?.includes('FunctionsHttpError')) {
        throw new Error('Messaging service error. Please check Infobip configuration.');
      }

      throw error;
    }
  }

  /**
   * Send bulk messages to multiple recipients
   */
  async sendBulk(options: SendBulkOptions): Promise<{ bulkId: string; messages: any[] }> {
    try {
      const { data, error } = await supabase.functions.invoke('messaging-api', {
        body: {
          action: 'send-bulk',
          ...options,
        },
      });

      if (error) {
        console.error('Edge function error:', error);
        throw new Error(error.message || 'Failed to send bulk messages');
      }

      return data;
    } catch (error: any) {
      console.error('Error sending bulk messages:', error);
      throw error;
    }
  }

  // =====================================================
  // Channel Management
  // =====================================================

  /**
   * Get all messaging channels
   */
  async getChannels(channelType?: MessagingChannelType): Promise<MessagingChannel[]> {
    let query = supabase
      .from('messaging_channels')
      .select('*')
      .order('is_default', { ascending: false })
      .order('created_at', { ascending: false });

    if (channelType) {
      query = query.eq('channel_type', channelType);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching messaging channels:', error);
      throw new Error('Failed to fetch messaging channels');
    }

    return data || [];
  }

  /**
   * Get default channel for a specific type
   */
  async getDefaultChannel(channelType: MessagingChannelType): Promise<MessagingChannel | null> {
    const { data, error } = await supabase
      .from('messaging_channels')
      .select('*')
      .eq('channel_type', channelType)
      .eq('is_default', true)
      .eq('is_active', true)
      .single();

    if (error && error.code !== 'PGRST116') {
      console.error('Error fetching default channel:', error);
      return null;
    }

    return data;
  }

  /**
   * Create a new messaging channel
   */
  async createChannel(channel: Omit<MessagingChannel, 'id' | 'created_at' | 'updated_at'>): Promise<MessagingChannel> {
    const { data, error } = await supabase
      .from('messaging_channels')
      .insert(channel)
      .select()
      .single();

    if (error) {
      console.error('Error creating channel:', error);
      throw new Error('Failed to create messaging channel');
    }

    return data;
  }

  /**
   * Update a messaging channel
   */
  async updateChannel(id: string, updates: Partial<MessagingChannel>): Promise<MessagingChannel> {
    const { data, error } = await supabase
      .from('messaging_channels')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Error updating channel:', error);
      throw new Error('Failed to update messaging channel');
    }

    return data;
  }

  /**
   * Delete a messaging channel
   */
  async deleteChannel(id: string): Promise<void> {
    const { error } = await supabase
      .from('messaging_channels')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error deleting channel:', error);
      throw new Error('Failed to delete messaging channel');
    }
  }

  // =====================================================
  // Template Management
  // =====================================================

  /**
   * Get all messaging templates
   */
  async getTemplates(channelType?: MessagingChannelType): Promise<MessagingTemplate[]> {
    let query = supabase
      .from('messaging_templates')
      .select('*')
      .order('created_at', { ascending: false });

    if (channelType) {
      query = query.eq('channel_type', channelType);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching messaging templates:', error);
      throw new Error('Failed to fetch messaging templates');
    }

    return data || [];
  }

  /**
   * Get template by slug
   */
  async getTemplateBySlug(slug: string): Promise<MessagingTemplate | null> {
    const { data, error } = await supabase
      .from('messaging_templates')
      .select('*')
      .eq('slug', slug)
      .eq('is_active', true)
      .single();

    if (error && error.code !== 'PGRST116') {
      console.error('Error fetching template:', error);
      return null;
    }

    return data;
  }

  /**
   * Create a new messaging template
   */
  async createTemplate(template: Omit<MessagingTemplate, 'id' | 'created_at' | 'updated_at'>): Promise<MessagingTemplate> {
    const { data, error } = await supabase
      .from('messaging_templates')
      .insert(template)
      .select()
      .single();

    if (error) {
      console.error('Error creating template:', error);
      throw new Error('Failed to create messaging template');
    }

    return data;
  }

  /**
   * Update a messaging template
   */
  async updateTemplate(id: string, updates: Partial<MessagingTemplate>): Promise<MessagingTemplate> {
    const { data, error } = await supabase
      .from('messaging_templates')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Error updating template:', error);
      throw new Error('Failed to update messaging template');
    }

    return data;
  }

  /**
   * Delete a messaging template
   */
  async deleteTemplate(id: string): Promise<void> {
    const { error } = await supabase
      .from('messaging_templates')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error deleting template:', error);
      throw new Error('Failed to delete messaging template');
    }
  }

  // =====================================================
  // Message Logs
  // =====================================================

  /**
   * Get message logs with filtering
   */
  async getMessageLogs(filters?: MessageLogFilters): Promise<MessagingLog[]> {
    let query = supabase
      .from('messaging_logs')
      .select('*')
      .order('created_at', { ascending: false });

    if (filters?.status) {
      query = query.eq('status', filters.status);
    }
    if (filters?.channelType) {
      query = query.eq('channel_type', filters.channelType);
    }
    if (filters?.messageType) {
      query = query.eq('message_type', filters.messageType);
    }
    if (filters?.phoneNumber) {
      query = query.eq('to_number', filters.phoneNumber);
    }
    if (filters?.fromDate) {
      query = query.gte('created_at', filters.fromDate.toISOString());
    }
    if (filters?.toDate) {
      query = query.lte('created_at', filters.toDate.toISOString());
    }
    if (filters?.limit) {
      query = query.limit(filters.limit);
    }
    if (filters?.offset) {
      query = query.range(filters.offset, filters.offset + (filters.limit || 50) - 1);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching message logs:', error);
      throw new Error('Failed to fetch message logs');
    }

    return data || [];
  }

  // =====================================================
  // Analytics
  // =====================================================

  /**
   * Get messaging analytics
   */
  async getAnalytics(
    channelType?: MessagingChannelType,
    dateRange?: { start: string; end: string }
  ): Promise<MessagingAnalyticsResponse> {
    try {
      const { data, error } = await supabase.functions.invoke('messaging-api', {
        body: {
          action: 'analytics',
          channelType,
          dateRange,
        },
      });

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error getting analytics:', error);
      throw error;
    }
  }

  /**
   * Get Infobip account balance
   */
  async getAccountBalance(): Promise<{ balance: number; currency: string }> {
    try {
      const { data, error } = await supabase.functions.invoke('messaging-api', {
        body: {
          action: 'balance',
        },
      });

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error getting account balance:', error);
      throw error;
    }
  }

  /**
   * Sync senders from Infobip account
   * Fetches all registered SMS, WhatsApp, and Viber senders
   */
  async syncSendersFromInfobip(autoImport: boolean = false): Promise<{
    senders: {
      sms: Array<{ sender_id: string; display_name: string; status: string }>;
      whatsapp: Array<{ sender_id: string; display_name: string; status: string; quality_rating?: string }>;
      viber: Array<{ sender_id: string; display_name: string; status: string }>;
    };
    total: number;
    imported: boolean;
  }> {
    try {
      const { data, error } = await supabase.functions.invoke('messaging-api', {
        body: {
          action: 'sync-senders',
          autoImport,
        },
      });

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error syncing senders from Infobip:', error);
      throw error;
    }
  }

  /**
   * Get WhatsApp templates from Infobip for a specific sender
   */
  async getWhatsAppTemplates(sender: string): Promise<any[]> {
    try {
      const { data, error } = await supabase.functions.invoke('messaging-api', {
        body: {
          action: 'whatsapp-templates',
          sender,
        },
      });

      if (error) throw error;
      return data.templates || [];
    } catch (error) {
      console.error('Error fetching WhatsApp templates:', error);
      throw error;
    }
  }

  // =====================================================
  // Opt-out Management (Compliance)
  // =====================================================

  /**
   * Check if a phone number has opted out
   */
  async checkOptOut(phoneNumber: string, channelType: MessagingChannelType): Promise<boolean> {
    const { data, error } = await supabase
      .from('messaging_optouts')
      .select('id')
      .or(`phone_number.eq.${phoneNumber},channel_type.eq.${channelType},channel_type.eq.all`)
      .limit(1);

    if (error) {
      console.error('Error checking opt-out:', error);
      return false;
    }

    return (data?.length || 0) > 0;
  }

  /**
   * Add a phone number to opt-out list
   */
  async addOptOut(
    phoneNumber: string,
    channelType: MessagingChannelType | 'all',
    reason?: string,
    source: 'keyword' | 'manual' | 'api' | 'complaint' = 'manual'
  ): Promise<void> {
    const { error } = await supabase
      .from('messaging_optouts')
      .upsert({
        phone_number: phoneNumber,
        channel_type: channelType,
        reason,
        source,
        opted_out_at: new Date().toISOString(),
      });

    if (error) {
      console.error('Error adding opt-out:', error);
      throw new Error('Failed to add opt-out');
    }
  }

  /**
   * Remove a phone number from opt-out list
   */
  async removeOptOut(phoneNumber: string, channelType: MessagingChannelType | 'all'): Promise<void> {
    const { error } = await supabase
      .from('messaging_optouts')
      .delete()
      .eq('phone_number', phoneNumber)
      .eq('channel_type', channelType);

    if (error) {
      console.error('Error removing opt-out:', error);
      throw new Error('Failed to remove opt-out');
    }
  }

  /**
   * Get all opt-outs
   */
  async getOptOuts(channelType?: MessagingChannelType | 'all'): Promise<MessagingOptout[]> {
    let query = supabase
      .from('messaging_optouts')
      .select('*')
      .order('opted_out_at', { ascending: false });

    if (channelType) {
      query = query.eq('channel_type', channelType);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching opt-outs:', error);
      throw new Error('Failed to fetch opt-outs');
    }

    return data || [];
  }

  // =====================================================
  // Utility Methods
  // =====================================================

  /**
   * Render template with variables
   */
  renderTemplate(content: string, variables: Record<string, string>): string {
    let rendered = content;
    for (const [key, value] of Object.entries(variables)) {
      rendered = rendered.replace(new RegExp(`{{${key}}}`, 'g'), value);
    }
    return rendered;
  }

  /**
   * Calculate SMS segment count
   * GSM-7: 160 chars per segment (or 153 if multi-part)
   * Unicode: 70 chars per segment (or 67 if multi-part)
   */
  calculateSmsSegments(content: string): { segments: number; encoding: 'gsm7' | 'ucs2' } {
    // Check if content contains non-GSM characters
    const gsm7Regex = /^[@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞ\x1BÆæßÉ !"#¤%&'()*+,\-.\/0-9:;<=>?¡A-Z ÄÖÑÜ§¿a-zäöñüà\^{}\[~\]|€]*$/;
    const isGsm7 = gsm7Regex.test(content);

    const maxLength = isGsm7 ? 160 : 70;
    const multiPartMax = isGsm7 ? 153 : 67;

    const length = content.length;

    if (length <= maxLength) {
      return { segments: 1, encoding: isGsm7 ? 'gsm7' : 'ucs2' };
    }

    return {
      segments: Math.ceil(length / multiPartMax),
      encoding: isGsm7 ? 'gsm7' : 'ucs2',
    };
  }

  /**
   * Validate phone number format (E.164)
   */
  validatePhoneNumber(phoneNumber: string): boolean {
    // E.164 format: +[country code][number], 8-15 digits total
    const e164Regex = /^\+[1-9]\d{7,14}$/;
    return e164Regex.test(phoneNumber);
  }

  /**
   * Normalize phone number to E.164 format
   */
  normalizePhoneNumber(phoneNumber: string, defaultCountryCode: string = '+1'): string {
    // Remove all non-digit characters except leading +
    let normalized = phoneNumber.replace(/[^\d+]/g, '');

    // If no + prefix, add default country code
    if (!normalized.startsWith('+')) {
      // If starts with 00, replace with +
      if (normalized.startsWith('00')) {
        normalized = '+' + normalized.substring(2);
      } else {
        normalized = defaultCountryCode + normalized;
      }
    }

    return normalized;
  }
}

// Export singleton instance
export const messagingService = new MessagingService();
