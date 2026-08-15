/**
 * Messaging Service
 * Handles WhatsApp messaging via Zernio (Meta Cloud API) through Supabase Edge Functions.
 * SMS / Twilio removed.
 * @see https://docs.zernio.com
 *
 * IMPORTANT: the Zernio API key is resolved server-side (env-first / platform_secrets
 * fallback). All messaging operations go through the messaging-api Edge Function.
 */

import { supabase } from '@/integrations/supabase/client';
import { edgeErrorMessage } from '@/utils/edgeError';
import type {
  MessagingChannel,
  MessagingTemplate,
  MessagingLog,
  MessagingOptout,
  MessagingChannelType,
  SendMessageOptions,
  SendBulkOptions,
  ConnectWhatsAppOptions,
  WhatsAppOAuthStart,
  WhatsAppOnboardingMode,
  ZernioWebhookStatus,
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
        throw new Error(await edgeErrorMessage(error, 'Failed to send message'));
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
        throw new Error('Messaging service error. Please check Zernio configuration.');
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
        throw new Error(await edgeErrorMessage(error, 'Failed to send bulk messages'));
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
    dateRange?: { start: string; end: string },
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
      return {
        totalSent: data?.totalSent ?? 0,
        totalDelivered: data?.totalDelivered ?? 0,
        totalRead: data?.totalRead ?? 0,
        totalFailed: data?.totalFailed ?? 0,
        totalCost: data?.totalCost ?? 0,
        deliveryRate: data?.deliveryRate ?? 0,
        readRate: data?.readRate ?? 0,
        failureRate: data?.failureRate ?? 0,
        dailyData: data?.dailyData ?? [],
      };
    } catch (error) {
      console.error('Error getting analytics:', error);
      throw error;
    }
  }

  /**
   * Get WhatsApp account health (quality rating + messaging tier) from Zernio.
   * Replaces the former Twilio account-balance call.
   */
  async getAccountInfo(from?: string): Promise<Record<string, any>> {
    try {
      const { data, error } = await supabase.functions.invoke('messaging-api', {
        body: { action: 'account-info', from },
      });
      if (error) throw error;
      return data || {};
    } catch (error) {
      console.error('Error getting account info:', error);
      return {};
    }
  }

  /**
   * Start Meta Embedded Signup, brokered by Zernio. Returns the URL to send the operator to;
   * Zernio redirects back with ?connected=whatsapp&accountId=… which finishWhatsAppOAuth()
   * turns into a channel. This is the DEFAULT connect path — no Meta token is ever typed
   * into this app, exactly like the social accounts flow.
   */
  async startWhatsAppOAuth(options: {
    workspaceId?: string;
    redirectUrl?: string;
    /**
     * Which Embedded Signup screen Meta shows. `api` = standard WABA/number picker (a number
     * already on Cloud API); `business_app` = coexistence, sharing a number with the consumer
     * WhatsApp Business app. Omitted means Zernio's default, which is coexistence.
     */
    onboarding?: WhatsAppOnboardingMode;
  } = {}): Promise<WhatsAppOAuthStart> {
    const { data, error } = await supabase.functions.invoke('messaging-api', {
      body: { action: 'connect-whatsapp-oauth', ...options },
    });
    if (error) throw new Error(await edgeErrorMessage(error, 'Failed to start WhatsApp connection'));
    if (data?.error) throw new Error(data.error);
    if (!data?.oauth_url) throw new Error('Zernio returned no authorisation URL');
    return data;
  }

  /**
   * Finish Embedded Signup — exchanges the Zernio accountId from the redirect for a channel.
   */
  async finishWhatsAppOAuth(options: {
    zernioAccountId: string;
    workspaceId?: string;
    displayName?: string;
  }): Promise<{ channel: MessagingChannel; account: any }> {
    const { data, error } = await supabase.functions.invoke('messaging-api', {
      body: { action: 'connect-whatsapp-callback', ...options },
    });
    if (error) throw new Error(await edgeErrorMessage(error, 'Failed to finish connecting WhatsApp'));
    if (data?.error) throw new Error(data.error);
    return data;
  }

  /**
   * Headless connect for a caller that already holds Meta WABA credentials.
   * Prefer startWhatsAppOAuth() for anything a person drives.
   */
  async connectWhatsApp(options: ConnectWhatsAppOptions): Promise<{ channel: MessagingChannel; account: any }> {
    const { data, error } = await supabase.functions.invoke('messaging-api', {
      body: { action: 'connect-whatsapp', ...options },
    });
    if (error) throw new Error(await edgeErrorMessage(error, 'Failed to connect WhatsApp'));
    if (data?.error) throw new Error(data.error);
    return data;
  }

  /**
   * Is our webhook handler actually registered with Zernio?
   *
   * Nothing in this platform ever registered it, so the inbound path (replies, delivery
   * receipts, number health) was unreachable by construction. "No inbound messages" and
   * "Zernio was never told where to deliver" are indistinguishable without asking.
   */
  async getWebhookStatus(): Promise<ZernioWebhookStatus> {
    const { data, error } = await supabase.functions.invoke('messaging-api', {
      body: { action: 'webhook-status' },
    });
    if (error) throw new Error(await edgeErrorMessage(error, 'Failed to read webhook status'));
    if (data?.error) throw new Error(data.error);
    return data;
  }

  /** Create or repair the Zernio webhook registration (also re-enables an auto-disabled one). */
  async registerWebhook(): Promise<ZernioWebhookStatus> {
    const { data, error } = await supabase.functions.invoke('messaging-api', {
      body: { action: 'register-webhook' },
    });
    if (error) throw new Error(await edgeErrorMessage(error, 'Failed to register the webhook'));
    if (data?.error) throw new Error(data.error);
    return data;
  }

  /**
   * Submit a WhatsApp template to Meta. Pass `libraryTemplateName` for one of Meta's
   * pre-approved library templates (usable immediately), or `components` for a custom
   * template (review can take up to 24h).
   */
  async createWhatsAppTemplate(options: {
    name: string;
    category: 'AUTHENTICATION' | 'MARKETING' | 'UTILITY';
    language: string;
    components?: unknown[];
    libraryTemplateName?: string;
    from?: string;
  }): Promise<{ template: Record<string, unknown> }> {
    const { data, error } = await supabase.functions.invoke('messaging-api', {
      body: { action: 'create-whatsapp-template', ...options },
    });
    if (error) throw new Error(await edgeErrorMessage(error, 'Failed to create the template'));
    if (data?.error) throw new Error(data.error);
    return data;
  }

  /**
   * Sync channels from Zernio — pulls connected WhatsApp accounts into messaging_channels.
   */
  async syncChannels(): Promise<{
    synced: number;
    channels: Array<{ action: string; senderId: string }>;
    message?: string;
    errors?: string[];
  }> {
    try {
      const { data, error } = await supabase.functions.invoke('messaging-api', {
        body: { action: 'sync-channels' },
      });
      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error syncing channels from Zernio:', error);
      throw error;
    }
  }

  /**
   * Get Meta-approved WhatsApp templates for the default (or given) channel's WABA.
   */
  async getWhatsAppTemplates(from?: string): Promise<any[]> {
    try {
      const { data, error } = await supabase.functions.invoke('messaging-api', {
        body: { action: 'whatsapp-templates', from },
      });

      if (error) throw error;
      return data.templates || [];
    } catch (error) {
      console.error('Error fetching WhatsApp templates from Zernio:', error);
      throw error;
    }
  }

  // Inbound WhatsApp replies are captured into the unified inbox by the
  // zernio-webhook-handler (inbox_threads / inbox_participants / inbox_messages) and read
  // through inboxApi + the /inbox UI. The former messaging_conversations holding pen was
  // dropped — no separate conversation methods live here anymore.

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
    source: 'keyword' | 'manual' | 'api' | 'complaint' = 'manual',
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
