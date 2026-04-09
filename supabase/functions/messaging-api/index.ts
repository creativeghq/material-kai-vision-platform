/**
 * Messaging API Edge Function
 * Provider-agnostic messaging service with Twilio implementation
 * Supports SMS and WhatsApp channels
 *
 * @see https://www.twilio.com/docs/messaging
 * @see https://www.twilio.com/docs/whatsapp
 *
 * Authentication:
 * - Secret key (apikey header): Full admin access
 * - User JWT (Authorization header): User-specific operations
 */

import { createClient } from '@supabase/supabase-js';
import { corsHeaders } from '../_shared/cors.ts';
import { debitExternalServiceCredits } from '../_shared/credit-utils.ts';
import { authenticate, isAdminAccess } from '../_shared/auth.ts';
import { withApiLogging } from '../_shared/api-logger.ts';

// =====================================================
// Types
// =====================================================

type ChannelType = 'sms' | 'whatsapp';

interface SendMessageRequest {
  channel: ChannelType;
  to: string | string[];
  from?: string;
  content?: string;
  templateId?: string;
  templateVariables?: Record<string, string>;
  mediaUrl?: string;
  statusCallback?: string;
  messageType?: 'transactional' | 'marketing' | 'otp' | 'notification';
}

interface SendBulkRequest extends Omit<SendMessageRequest, 'to'> {
  recipients: Array<{
    to: string;
    variables?: Record<string, string>;
  }>;
}

interface MessageResult {
  success: boolean;
  messageId?: string;
  status?: string;
  error?: string;
  to?: string;
}

// =====================================================
// Messaging Provider Interface (Provider Agnostic)
// =====================================================

interface MessagingProvider {
  sendSms(params: {
    from: string;
    to: string;
    body: string;
    statusCallback?: string;
  }): Promise<MessageResult>;

  sendWhatsApp(params: {
    from: string;
    to: string;
    body: string;
    mediaUrl?: string;
    statusCallback?: string;
  }): Promise<MessageResult>;

  sendWhatsAppTemplate(params: {
    from: string;
    to: string;
    contentSid: string;
    contentVariables?: Record<string, string>;
    statusCallback?: string;
  }): Promise<MessageResult>;

  getAccountInfo(): Promise<{ balance?: number; currency?: string }>;

  listPhoneNumbers(): Promise<Array<{
    phoneNumber: string;
    friendlyName: string;
    capabilities: { sms: boolean; voice: boolean; mms: boolean };
  }>>;
}

// =====================================================
// Twilio Provider Implementation
// @see https://www.twilio.com/docs/messaging/api
// =====================================================

class TwilioProvider implements MessagingProvider {
  private accountSid: string;
  private authToken: string;
  private baseUrl: string;

  constructor(accountSid: string, authToken: string) {
    this.accountSid = accountSid;
    this.authToken = authToken;
    this.baseUrl = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}`;
  }

  /**
   * Make authenticated request to Twilio API
   */
  private async request(
    endpoint: string,
    method: string,
    body?: Record<string, string>
  ): Promise<any> {
    const auth = btoa(`${this.accountSid}:${this.authToken}`);

    const options: RequestInit = {
      method,
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    };

    if (body && method !== 'GET') {
      const formData = new URLSearchParams();
      for (const [key, value] of Object.entries(body)) {
        if (value !== undefined && value !== null) {
          formData.append(key, value);
        }
      }
      options.body = formData.toString();
    }

    const response = await fetch(`${this.baseUrl}${endpoint}`, options);
    const data = await response.json();

    if (!response.ok) {
      const errorMessage = data.message || data.error_message || `Twilio API error: ${response.statusText}`;
      throw new Error(errorMessage);
    }

    return data;
  }

  /**
   * Send SMS message
   * @see https://www.twilio.com/docs/messaging/api/message-resource#create-a-message-resource
   */
  async sendSms(params: {
    from: string;
    to: string;
    body: string;
    statusCallback?: string;
  }): Promise<MessageResult> {
    try {
      const requestBody: Record<string, string> = {
        From: params.from,
        To: params.to,
        Body: params.body,
      };

      if (params.statusCallback) {
        requestBody.StatusCallback = params.statusCallback;
      }

      const result = await this.request('/Messages.json', 'POST', requestBody);

      return {
        success: true,
        messageId: result.sid,
        status: result.status,
        to: params.to,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        to: params.to,
      };
    }
  }

  /**
   * Send WhatsApp message
   * @see https://www.twilio.com/docs/whatsapp/api#sending-a-freeform-whatsapp-message
   */
  async sendWhatsApp(params: {
    from: string;
    to: string;
    body: string;
    mediaUrl?: string;
    statusCallback?: string;
  }): Promise<MessageResult> {
    try {
      // WhatsApp numbers must be prefixed with 'whatsapp:'
      const from = params.from.startsWith('whatsapp:') ? params.from : `whatsapp:${params.from}`;
      const to = params.to.startsWith('whatsapp:') ? params.to : `whatsapp:${params.to}`;

      const requestBody: Record<string, string> = {
        From: from,
        To: to,
        Body: params.body,
      };

      if (params.mediaUrl) {
        requestBody.MediaUrl = params.mediaUrl;
      }

      if (params.statusCallback) {
        requestBody.StatusCallback = params.statusCallback;
      }

      const result = await this.request('/Messages.json', 'POST', requestBody);

      return {
        success: true,
        messageId: result.sid,
        status: result.status,
        to: params.to,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        to: params.to,
      };
    }
  }

  /**
   * Send WhatsApp template message
   * @see https://www.twilio.com/docs/whatsapp/tutorial/send-whatsapp-notification-messages-templates
   */
  async sendWhatsAppTemplate(params: {
    from: string;
    to: string;
    contentSid: string;
    contentVariables?: Record<string, string>;
    statusCallback?: string;
  }): Promise<MessageResult> {
    try {
      const from = params.from.startsWith('whatsapp:') ? params.from : `whatsapp:${params.from}`;
      const to = params.to.startsWith('whatsapp:') ? params.to : `whatsapp:${params.to}`;

      const requestBody: Record<string, string> = {
        From: from,
        To: to,
        ContentSid: params.contentSid,
      };

      if (params.contentVariables) {
        requestBody.ContentVariables = JSON.stringify(params.contentVariables);
      }

      if (params.statusCallback) {
        requestBody.StatusCallback = params.statusCallback;
      }

      const result = await this.request('/Messages.json', 'POST', requestBody);

      return {
        success: true,
        messageId: result.sid,
        status: result.status,
        to: params.to,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        to: params.to,
      };
    }
  }

  /**
   * Get account balance info
   * @see https://www.twilio.com/docs/usage/api/account#read-an-account-resource
   */
  async getAccountInfo(): Promise<{ balance?: number; currency?: string }> {
    try {
      const balanceResult = await this.request('/Balance.json', 'GET');
      return {
        balance: parseFloat(balanceResult.balance),
        currency: balanceResult.currency,
      };
    } catch (error) {
      console.error('Error getting account info:', error);
      return {};
    }
  }

  /**
   * List phone numbers (SMS capable)
   * @see https://www.twilio.com/docs/phone-numbers/api/incomingphonenumber-resource
   */
  async listPhoneNumbers(): Promise<Array<{
    phoneNumber: string;
    friendlyName: string;
    capabilities: { sms: boolean; voice: boolean; mms: boolean };
  }>> {
    try {
      const result = await this.request('/IncomingPhoneNumbers.json', 'GET');
      return (result.incoming_phone_numbers || []).map((num: any) => ({
        phoneNumber: num.phone_number,
        friendlyName: num.friendly_name,
        capabilities: {
          sms: num.capabilities?.sms || false,
          voice: num.capabilities?.voice || false,
          mms: num.capabilities?.mms || false,
        },
      }));
    } catch (error) {
      console.error('Error listing phone numbers:', error);
      return [];
    }
  }
}

// =====================================================
// Helper Functions
// =====================================================

function renderTemplate(content: string, variables: Record<string, string>): string {
  let rendered = content;
  for (const [key, value] of Object.entries(variables)) {
    rendered = rendered.replace(new RegExp(`{{${key}}}`, 'g'), value);
  }
  return rendered;
}

function normalizePhoneNumber(phone: string): string {
  let normalized = phone.replace(/[^\d+]/g, '');
  if (!normalized.startsWith('+')) {
    normalized = '+' + normalized;
  }
  return normalized;
}

// =====================================================
// Main Handler
// =====================================================

Deno.serve(withApiLogging('messaging-api', async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    // Authenticate request
    const auth = await authenticate(req);

    if (!auth.success) {
      throw new Error(auth.error || 'Unauthorized');
    }

    const user = auth.user;
    const userId = auth.userId;

    // Get Twilio credentials from environment
    const twilioAccountSid = Deno.env.get('TWILIO_ACCOUNT_SID');
    const twilioAuthToken = Deno.env.get('TWILIO_AUTH_TOKEN');

    if (!twilioAccountSid || !twilioAuthToken) {
      throw new Error('Twilio credentials not configured. Please set TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN secrets.');
    }

    const provider = new TwilioProvider(twilioAccountSid, twilioAuthToken);
    const webhookUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/messaging-webhook`;

    const requestBody = req.method === 'POST' ? await req.json() : {};
    const action = requestBody.action;

    switch (action) {
      // =====================================================
      // Send single message
      // =====================================================
      case 'send': {
        const body: SendMessageRequest = requestBody;

        if (!body.channel) {
          throw new Error('Channel type is required');
        }

        let channel: any = null;
        if (body.from) {
          const { data } = await supabaseClient
            .from('messaging_channels')
            .select('*')
            .eq('sender_id', body.from)
            .eq('channel_type', body.channel)
            .single();
          channel = data;
        } else {
          const { data } = await supabaseClient
            .from('messaging_channels')
            .select('*')
            .eq('channel_type', body.channel)
            .eq('is_default', true)
            .eq('is_active', true)
            .single();
          channel = data;
        }

        if (!channel) {
          throw new Error(`No ${body.channel} channel configured. Please add a channel first.`);
        }

        const fromNumber = channel.sender_id;
        const recipients = Array.isArray(body.to) ? body.to : [body.to];
        const results: MessageResult[] = [];

        let messageContent = body.content || '';

        if (body.templateId) {
          const { data: template } = await supabaseClient
            .from('messaging_templates')
            .select('*')
            .eq('id', body.templateId)
            .single();

          if (template) {
            messageContent = renderTemplate(template.content, body.templateVariables || {});
          }
        }

        for (const recipient of recipients) {
          const to = normalizePhoneNumber(recipient);
          let result: MessageResult;

          switch (body.channel) {
            case 'sms':
              result = await provider.sendSms({
                from: fromNumber,
                to,
                body: messageContent,
                statusCallback: webhookUrl,
              });
              break;

            case 'whatsapp':
              result = await provider.sendWhatsApp({
                from: fromNumber,
                to,
                body: messageContent,
                mediaUrl: body.mediaUrl,
                statusCallback: webhookUrl,
              });
              break;

            default:
              result = { success: false, error: `Unsupported channel: ${body.channel}`, to };
          }

          results.push(result);

          if (result.success) {
            await supabaseClient.from('messaging_logs').insert({
              user_id: user.id,
              channel_id: channel.id,
              channel_type: body.channel,
              recipient: to,
              content: messageContent.substring(0, 500),
              message_type: body.messageType || 'transactional',
              provider_message_id: result.messageId,
              status: result.status || 'queued',
            });
            // Debit credits for Twilio message
            const serviceName = body.channel === 'whatsapp' ? 'twilio-whatsapp' : 'twilio-sms';
            await debitExternalServiceCredits(supabaseClient, user.id, serviceName, `messaging_${body.channel}`, 1, { to, message_id: result.messageId });
          }
        }

        const successful = results.filter(r => r.success);
        const failed = results.filter(r => !r.success);

        return new Response(
          JSON.stringify({
            success: failed.length === 0,
            sent: successful.length,
            failed: failed.length,
            results,
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // =====================================================
      // Send bulk messages
      // =====================================================
      case 'send-bulk': {
        const body: SendBulkRequest = requestBody;

        if (!body.channel) {
          throw new Error('Channel type is required');
        }

        if (!body.recipients || body.recipients.length === 0) {
          throw new Error('Recipients are required');
        }

        let channel: any = null;
        if (body.from) {
          const { data } = await supabaseClient
            .from('messaging_channels')
            .select('*')
            .eq('sender_id', body.from)
            .eq('channel_type', body.channel)
            .single();
          channel = data;
        } else {
          const { data } = await supabaseClient
            .from('messaging_channels')
            .select('*')
            .eq('channel_type', body.channel)
            .eq('is_default', true)
            .eq('is_active', true)
            .single();
          channel = data;
        }

        if (!channel) {
          throw new Error(`No ${body.channel} channel configured`);
        }

        const fromNumber = channel.sender_id;
        const results: MessageResult[] = [];

        let baseContent = body.content || '';
        if (body.templateId) {
          const { data: template } = await supabaseClient
            .from('messaging_templates')
            .select('*')
            .eq('id', body.templateId)
            .single();

          if (template) {
            baseContent = template.content;
          }
        }

        for (const recipient of body.recipients) {
          const to = normalizePhoneNumber(recipient.to);
          const variables = recipient.variables || {};
          const messageContent = renderTemplate(baseContent, variables);

          let result: MessageResult;

          switch (body.channel) {
            case 'sms':
              result = await provider.sendSms({
                from: fromNumber,
                to,
                body: messageContent,
                statusCallback: webhookUrl,
              });
              break;

            case 'whatsapp':
              result = await provider.sendWhatsApp({
                from: fromNumber,
                to,
                body: messageContent,
                mediaUrl: body.mediaUrl,
                statusCallback: webhookUrl,
              });
              break;

            default:
              result = { success: false, error: `Unsupported channel: ${body.channel}`, to };
          }

          results.push(result);

          if (result.success) {
            await supabaseClient.from('messaging_logs').insert({
              user_id: user.id,
              channel_id: channel.id,
              channel_type: body.channel,
              recipient: to,
              content: messageContent.substring(0, 500),
              message_type: body.messageType || 'marketing',
              provider_message_id: result.messageId,
              status: result.status || 'queued',
            });
          }

          await new Promise(resolve => setTimeout(resolve, 50));
        }

        const successful = results.filter(r => r.success);
        const failed = results.filter(r => !r.success);

        // Debit credits for all successful bulk messages
        if (successful.length > 0) {
          const serviceName = body.channel === 'whatsapp' ? 'twilio-whatsapp' : 'twilio-sms';
          await debitExternalServiceCredits(supabaseClient, user.id, serviceName, `messaging_bulk_${body.channel}`, successful.length, { total_sent: successful.length });
        }

        return new Response(
          JSON.stringify({
            success: true,
            sent: successful.length,
            failed: failed.length,
            results,
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // =====================================================
      // List channels
      // =====================================================
      case 'channels': {
        const { data: channels, error } = await supabaseClient
          .from('messaging_channels')
          .select('*')
          .order('channel_type', { ascending: true })
          .order('is_default', { ascending: false });

        if (error) throw error;

        return new Response(
          JSON.stringify({ channels }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // =====================================================
      // List templates
      // =====================================================
      case 'templates': {
        const { data: templates, error } = await supabaseClient
          .from('messaging_templates')
          .select('*')
          .order('name', { ascending: true });

        if (error) throw error;

        return new Response(
          JSON.stringify({ templates }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // =====================================================
      // Get message logs
      // =====================================================
      case 'logs': {
        const { limit = 50, offset = 0, channel, status } = requestBody;

        let query = supabaseClient
          .from('messaging_logs')
          .select('*', { count: 'exact' })
          .order('created_at', { ascending: false })
          .range(offset, offset + limit - 1);

        if (channel) {
          query = query.eq('channel_type', channel);
        }
        if (status) {
          query = query.eq('status', status);
        }

        const { data: logs, count, error } = await query;

        if (error) throw error;

        return new Response(
          JSON.stringify({ logs, total: count }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // =====================================================
      // Get analytics
      // =====================================================
      case 'analytics': {
        const { startDate, endDate } = requestBody;

        const start = startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
        const end = endDate || new Date().toISOString();

        const { data: logs } = await supabaseClient
          .from('messaging_logs')
          .select('status, channel_type')
          .gte('created_at', start)
          .lte('created_at', end);

        const analytics = {
          total: logs?.length || 0,
          byStatus: {} as Record<string, number>,
          byChannel: {} as Record<string, number>,
        };

        for (const log of logs || []) {
          analytics.byStatus[log.status] = (analytics.byStatus[log.status] || 0) + 1;
          analytics.byChannel[log.channel_type] = (analytics.byChannel[log.channel_type] || 0) + 1;
        }

        return new Response(
          JSON.stringify(analytics),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // =====================================================
      // Get account balance
      // =====================================================
      case 'balance': {
        const accountInfo = await provider.getAccountInfo();

        return new Response(
          JSON.stringify(accountInfo),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // =====================================================
      // Sync channels from Twilio
      // =====================================================
      case 'sync-channels': {
        const syncedChannels: any[] = [];
        const errors: string[] = [];

        try {
          console.log('Fetching phone numbers from Twilio...');
          const phoneNumbers = await provider.listPhoneNumbers();
          console.log(`Found ${phoneNumbers.length} phone numbers`);

          for (const num of phoneNumbers) {
            try {
              if (!num.capabilities.sms) continue;

              // Create SMS channel
              const { data: existingSms } = await supabaseClient
                .from('messaging_channels')
                .select('id')
                .eq('sender_id', num.phoneNumber)
                .eq('channel_type', 'sms')
                .single();

              if (existingSms) {
                await supabaseClient
                  .from('messaging_channels')
                  .update({
                    display_name: num.friendlyName,
                    is_active: true,
                    updated_at: new Date().toISOString(),
                  })
                  .eq('id', existingSms.id);

                syncedChannels.push({
                  action: 'updated',
                  channelType: 'sms',
                  senderId: num.phoneNumber,
                  displayName: num.friendlyName,
                });
              } else {
                const { count } = await supabaseClient
                  .from('messaging_channels')
                  .select('*', { count: 'exact', head: true })
                  .eq('channel_type', 'sms');

                const isDefault = (count || 0) === 0;

                await supabaseClient.from('messaging_channels').insert({
                  channel_type: 'sms',
                  provider: 'twilio',
                  sender_id: num.phoneNumber,
                  display_name: num.friendlyName,
                  is_active: true,
                  is_default: isDefault,
                  config: { capabilities: num.capabilities },
                  daily_quota: 10000,
                  max_send_rate: 100,
                });

                syncedChannels.push({
                  action: 'created',
                  channelType: 'sms',
                  senderId: num.phoneNumber,
                  displayName: num.friendlyName,
                  isDefault,
                });
              }

              // Create WhatsApp channel for the same number
              const { data: existingWa } = await supabaseClient
                .from('messaging_channels')
                .select('id')
                .eq('sender_id', num.phoneNumber)
                .eq('channel_type', 'whatsapp')
                .single();

              if (!existingWa) {
                const { count: waCount } = await supabaseClient
                  .from('messaging_channels')
                  .select('*', { count: 'exact', head: true })
                  .eq('channel_type', 'whatsapp');

                const isWaDefault = (waCount || 0) === 0;

                await supabaseClient.from('messaging_channels').insert({
                  channel_type: 'whatsapp',
                  provider: 'twilio',
                  sender_id: num.phoneNumber,
                  display_name: `WhatsApp ${num.friendlyName}`,
                  is_active: true,
                  is_default: isWaDefault,
                  config: {},
                  daily_quota: 10000,
                  max_send_rate: 100,
                });

                syncedChannels.push({
                  action: 'created',
                  channelType: 'whatsapp',
                  senderId: num.phoneNumber,
                  displayName: `WhatsApp ${num.friendlyName}`,
                  isDefault: isWaDefault,
                });
              }
            } catch (err) {
              console.error('Error processing number:', err);
              errors.push(`Failed to process ${num.phoneNumber}: ${err}`);
            }
          }
        } catch (err) {
          console.error('Error syncing channels:', err);
          errors.push(`Twilio API error: ${err instanceof Error ? err.message : String(err)}`);
        }

        const message = syncedChannels.length > 0
          ? `Successfully synced ${syncedChannels.length} channel(s) from Twilio.`
          : 'No phone numbers found in Twilio. Make sure you have purchased phone numbers in your Twilio account.';

        return new Response(
          JSON.stringify({
            success: true,
            synced: syncedChannels.length,
            channels: syncedChannels,
            message,
            errors: errors.length > 0 ? errors : undefined,
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // =====================================================
      // Send test message
      // =====================================================
      case 'send-test': {
        const { channel, testNumber, content = 'Test message from MIVAA' } = requestBody;

        if (!channel || !testNumber) {
          throw new Error('Channel and test number are required');
        }

        const { data: channelData } = await supabaseClient
          .from('messaging_channels')
          .select('*')
          .eq('channel_type', channel)
          .eq('is_default', true)
          .eq('is_active', true)
          .single();

        if (!channelData) {
          throw new Error(`No default ${channel} channel configured`);
        }

        const fromNumber = channelData.sender_id;
        const to = normalizePhoneNumber(testNumber);
        let result: MessageResult;

        switch (channel) {
          case 'sms':
            result = await provider.sendSms({
              from: fromNumber,
              to,
              body: `[TEST] ${content}`,
              statusCallback: webhookUrl,
            });
            break;

          case 'whatsapp':
            result = await provider.sendWhatsApp({
              from: fromNumber,
              to,
              body: `[TEST] ${content}`,
              statusCallback: webhookUrl,
            });
            break;

          default:
            throw new Error(`Unsupported channel: ${channel}`);
        }

        return new Response(
          JSON.stringify({
            success: result.success,
            messageId: result.messageId,
            error: result.error,
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // =====================================================
      // Get settings
      // =====================================================
      case 'get-settings': {
        const { data: settings } = await supabaseClient
          .from('messaging_settings')
          .select('*')
          .single();

        return new Response(
          JSON.stringify({ settings: settings || { provider: 'twilio' } }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // =====================================================
      // Update settings
      // =====================================================
      case 'update-settings': {
        const { settings } = requestBody;

        const { data, error } = await supabaseClient
          .from('messaging_settings')
          .upsert({
            id: settings.id || undefined,
            ...settings,
            provider: 'twilio',
            updated_at: new Date().toISOString(),
          })
          .select()
          .single();

        if (error) throw error;

        return new Response(
          JSON.stringify({ settings: data }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      default:
        throw new Error(`Unknown action: ${action}`);
    }
  } catch (error) {
    console.error('Messaging API error:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }),
      {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
}));
