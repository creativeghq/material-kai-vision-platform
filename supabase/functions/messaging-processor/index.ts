/**
 * Messaging Campaign Processor
 * Cron job to process scheduled messaging campaigns via Twilio
 *
 * This function should be invoked by a scheduled job (e.g., every minute)
 * to process pending messages in messaging campaigns.
 *
 * @see https://www.twilio.com/docs/messaging/api
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from '@supabase/supabase-js';
import { corsHeaders } from '../_shared/cors.ts';
import { bootstrapForFunction } from '../_shared/secrets-bootstrap.ts';

// Configuration
const BATCH_SIZE = 10; // Messages per batch
const MAX_RETRIES = 3;

// =====================================================
// Twilio Provider (Provider-Agnostic Interface)
// =====================================================

interface MessageResult {
  success: boolean;
  messageId?: string;
  error?: string;
  errorCode?: string;
}

class TwilioProvider {
  private accountSid: string;
  private authToken: string;
  private baseUrl: string;

  constructor(accountSid: string, authToken: string) {
    this.accountSid = accountSid;
    this.authToken = authToken;
    this.baseUrl = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}`;
  }

  private async request(endpoint: string, method: string, body?: Record<string, string>): Promise<any> {
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
      const error = data.message || data.error_message || 'Twilio API error';
      const errorCode = data.code?.toString() || data.error_code;
      throw new Error(`${error}${errorCode ? ` (${errorCode})` : ''}`);
    }

    return data;
  }

  async sendSms(params: {
    from: string;
    to: string;
    body: string;
    statusCallback?: string;
  }): Promise<MessageResult> {
    try {
      const result = await this.request('/Messages.json', 'POST', {
        From: params.from,
        To: params.to,
        Body: params.body,
        ...(params.statusCallback && { StatusCallback: params.statusCallback }),
      });

      return {
        success: true,
        messageId: result.sid,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

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
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

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
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }
}

// =====================================================
// Helper Functions
// =====================================================

function renderTemplate(content: string, variables: Record<string, any>): string {
  let rendered = content;
  for (const [key, value] of Object.entries(variables)) {
    rendered = rendered.replace(new RegExp(`{{${key}}}`, 'g'), String(value || ''));
  }
  return rendered;
}

// =====================================================
// Main Handler
// =====================================================

serve(async (req) => {
  await bootstrapForFunction();
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const cronSecret = req.headers.get('x-cron-secret');
  const expectedSecret = Deno.env.get('CRON_SECRET') || '';
  if (!expectedSecret || cronSecret !== expectedSecret) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const startTime = Date.now();
  const stats = {
    campaignsProcessed: 0,
    messagesSent: 0,
    messagesFailed: 0,
    campaignsCompleted: 0,
    campaignsStarted: 0,
  };

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get Twilio credentials
    const twilioAccountSid = () => Deno.env.get('TWILIO_ACCOUNT_SID') || '';
    const twilioAuthToken = () => Deno.env.get('TWILIO_AUTH_TOKEN') || '';

    if (!twilioAccountSid() || !twilioAuthToken()) {
      throw new Error('Twilio credentials not configured');
    }

    const twilio = new TwilioProvider(twilioAccountSid(), twilioAuthToken());

    // Get webhook URL for status callbacks
    const webhookBaseUrl = Deno.env.get('SUPABASE_URL')?.replace('.supabase.co', '.functions.supabase.co');
    const statusCallbackUrl = webhookBaseUrl ? `${webhookBaseUrl}/messaging-webhook?type=status` : undefined;

    // =====================================================
    // Step 1: Start scheduled campaigns that are ready
    // =====================================================
    const now = new Date().toISOString();

    const { data: scheduledCampaigns } = await supabase
      .from('campaigns')
      .select('id')
      .eq('status', 'scheduled')
      .in('channel_type', ['sms', 'whatsapp'])
      .lte('scheduled_at', now);

    for (const campaign of scheduledCampaigns || []) {
      await supabase
        .from('campaigns')
        .update({ status: 'sending' })
        .eq('id', campaign.id);

      stats.campaignsStarted++;
      console.log(`Started scheduled campaign: ${campaign.id}`);
    }

    // =====================================================
    // Step 2: Get campaigns in "sending" status
    // =====================================================
    const { data: activeCampaigns } = await supabase
      .from('campaigns')
      .select(`
        id,
        name,
        channel_type,
        messaging_template_id,
        messaging_channel_id,
        template:messaging_templates(*),
        channel:messaging_channels(*)
      `)
      .eq('status', 'sending')
      .in('channel_type', ['sms', 'whatsapp']);

    if (!activeCampaigns || activeCampaigns.length === 0) {
      console.log('No active messaging campaigns to process');
      return new Response(
        JSON.stringify({ success: true, message: 'No active campaigns', stats }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // =====================================================
    // Step 3: Process each campaign
    // =====================================================
    for (const campaign of activeCampaigns) {
      stats.campaignsProcessed++;

      const template = campaign.template as any;
      const channel = campaign.channel as any;

      if (!template || !channel) {
        console.warn(`Campaign ${campaign.id} missing template or channel, skipping`);
        continue;
      }

      // Check opt-outs once for the campaign
      const { data: optouts } = await supabase
        .from('messaging_optouts')
        .select('phone_number')
        .or(`channel_type.eq.${campaign.channel_type},channel_type.eq.all`);

      const optedOutNumbers = new Set(optouts?.map(o => o.phone_number) || []);

      // Get pending recipients (limit batch size)
      const { data: pendingRecipients } = await supabase
        .from('messaging_campaign_recipients')
        .select('*')
        .eq('campaign_id', campaign.id)
        .eq('status', 'pending')
        .lt('retry_count', MAX_RETRIES)
        .limit(BATCH_SIZE);

      if (!pendingRecipients || pendingRecipients.length === 0) {
        // Check if all recipients have been processed
        const { count: remainingCount } = await supabase
          .from('messaging_campaign_recipients')
          .select('*', { count: 'exact', head: true })
          .eq('campaign_id', campaign.id)
          .in('status', ['pending', 'sending']);

        if (remainingCount === 0) {
          // Mark campaign as sent
          await supabase
            .from('campaigns')
            .update({
              status: 'sent',
              sent_at: new Date().toISOString(),
            })
            .eq('id', campaign.id);

          stats.campaignsCompleted++;
          console.log(`Campaign ${campaign.id} completed`);
        }

        continue;
      }

      // Process each recipient
      for (const recipient of pendingRecipients) {
        // Check if opted out
        if (optedOutNumbers.has(recipient.phone_number)) {
          await supabase
            .from('messaging_campaign_recipients')
            .update({
              status: 'opted_out',
              error_message: 'Recipient has opted out',
            })
            .eq('id', recipient.id);

          continue;
        }

        // Mark as sending
        await supabase
          .from('messaging_campaign_recipients')
          .update({ status: 'sending' })
          .eq('id', recipient.id);

        try {
          // Render template with recipient variables
          const variables = {
            name: recipient.contact_name || '',
            phone: recipient.phone_number,
            ...(recipient.variables || {}),
          };

          const content = renderTemplate(template.content, variables);

          // Send message based on channel type
          let result: MessageResult;

          switch (campaign.channel_type) {
            case 'sms':
              result = await twilio.sendSms({
                from: channel.sender_id,
                to: recipient.phone_number,
                body: content,
                statusCallback: statusCallbackUrl,
              });
              break;

            case 'whatsapp': {
              // Check if using a pre-approved template (content SID)
              if (template.whatsapp_content_sid) {
                result = await twilio.sendWhatsAppTemplate({
                  from: channel.sender_id,
                  to: recipient.phone_number,
                  contentSid: template.whatsapp_content_sid,
                  contentVariables: variables as Record<string, string>,
                  statusCallback: statusCallbackUrl,
                });
              } else {
                result = await twilio.sendWhatsApp({
                  from: channel.sender_id,
                  to: recipient.phone_number,
                  body: content,
                  mediaUrl: template.media_url,
                  statusCallback: statusCallbackUrl,
                });
              }
              break;
            }

            default:
              throw new Error(`Unsupported channel: ${campaign.channel_type}`);
          }

          if (!result.success) {
            throw new Error(result.error || 'Failed to send message');
          }

          // Create message log
          const { data: messageLog } = await supabase
            .from('messaging_logs')
            .insert({
              channel_type: campaign.channel_type,
              template_id: template.id,
              channel_id: channel.id,
              provider_message_id: result.messageId,
              from_number: channel.sender_id,
              to_number: recipient.phone_number,
              content,
              status: 'sent',
              message_type: template.category || 'marketing',
              sent_at: new Date().toISOString(),
              variables: recipient.variables || {},
              campaign_id: campaign.id,
            })
            .select()
            .single();

          // Update recipient status
          await supabase
            .from('messaging_campaign_recipients')
            .update({
              status: 'sent',
              sent_at: new Date().toISOString(),
              message_log_id: messageLog?.id,
            })
            .eq('id', recipient.id);

          stats.messagesSent++;
          console.log(`Sent message to ${recipient.phone_number} for campaign ${campaign.id}`);

        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';

          // Update recipient with error and increment retry count
          await supabase
            .from('messaging_campaign_recipients')
            .update({
              status: 'pending', // Set back to pending for retry
              error_message: errorMessage,
              retry_count: recipient.retry_count + 1,
            })
            .eq('id', recipient.id);

          // If max retries reached, mark as failed
          if (recipient.retry_count + 1 >= MAX_RETRIES) {
            await supabase
              .from('messaging_campaign_recipients')
              .update({
                status: 'failed',
                failed_at: new Date().toISOString(),
              })
              .eq('id', recipient.id);
          }

          stats.messagesFailed++;
          console.error(`Failed to send message to ${recipient.phone_number}:`, errorMessage);
        }

        // Small delay between messages to respect rate limits
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    const duration = Date.now() - startTime;

    console.log('Messaging processor completed:', {
      ...stats,
      durationMs: duration,
    });

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Processing complete',
        stats,
        durationMs: duration,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in messaging processor:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        stats,
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
