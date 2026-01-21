/**
 * Messaging Campaign Processor
 * Cron job to process scheduled messaging campaigns
 *
 * This function should be invoked by a scheduled job (e.g., every minute)
 * to process pending messages in messaging campaigns.
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Configuration
const BATCH_SIZE = 10; // Messages per batch
const MAX_RETRIES = 3;

// =====================================================
// Infobip Client
// =====================================================

class InfobipClient {
  private apiKey: string;
  private baseUrl: string;
  private webhookUrl: string;

  constructor(apiKey: string, baseUrl: string, webhookUrl: string) {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.webhookUrl = webhookUrl;
  }

  private async request(endpoint: string, method: string, body?: any): Promise<any> {
    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      method,
      headers: {
        'Authorization': `App ${this.apiKey}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: response.statusText }));
      throw new Error(error.requestError?.serviceException?.text || error.message || 'Infobip API error');
    }

    return response.json();
  }

  async sendSms(from: string, to: string, text: string, callbackData?: string): Promise<any> {
    return this.request('/sms/2/text/advanced', 'POST', {
      messages: [{
        from,
        destinations: [{ to }],
        text,
        notifyUrl: this.webhookUrl,
        notifyContentType: 'application/json',
        callbackData,
      }],
    });
  }

  async sendWhatsAppText(from: string, to: string, text: string, callbackData?: string): Promise<any> {
    return this.request('/whatsapp/1/message/text', 'POST', {
      from,
      to,
      content: { text },
      notifyUrl: this.webhookUrl,
      callbackData,
    });
  }

  async sendViber(from: string, to: string, text: string, callbackData?: string): Promise<any> {
    return this.request('/viber/1/message/promotional', 'POST', {
      messages: [{
        from,
        to,
        content: { text },
        notifyUrl: this.webhookUrl,
        callbackData,
      }],
    });
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
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
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

    // Get Infobip credentials
    const infobipApiKey = Deno.env.get('INFOBIP_API_KEY');
    const infobipBaseUrl = Deno.env.get('INFOBIP_BASE_URL') || 'https://api.infobip.com';
    const webhookUrl = `${supabaseUrl}/functions/v1/messaging-webhook`;

    if (!infobipApiKey) {
      throw new Error('Infobip API key not configured');
    }

    const infobip = new InfobipClient(infobipApiKey, infobipBaseUrl, webhookUrl);

    // =====================================================
    // Step 1: Start scheduled campaigns that are ready
    // =====================================================
    const now = new Date().toISOString();

    const { data: scheduledCampaigns } = await supabase
      .from('campaigns')
      .select('id')
      .eq('status', 'scheduled')
      .in('channel_type', ['sms', 'whatsapp', 'viber'])
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
      .in('channel_type', ['sms', 'whatsapp', 'viber']);

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

          const callbackData = JSON.stringify({
            channel: campaign.channel_type,
            campaignId: campaign.id,
            recipientId: recipient.id,
          });

          // Send message based on channel type
          let response: any;

          switch (campaign.channel_type) {
            case 'sms':
              response = await infobip.sendSms(
                channel.sender_id,
                recipient.phone_number,
                content,
                callbackData
              );
              break;

            case 'whatsapp':
              response = await infobip.sendWhatsAppText(
                channel.sender_id,
                recipient.phone_number,
                content,
                callbackData
              );
              break;

            case 'viber':
              response = await infobip.sendViber(
                channel.sender_id,
                recipient.phone_number,
                content,
                callbackData
              );
              break;

            default:
              throw new Error(`Unsupported channel: ${campaign.channel_type}`);
          }

          const messageInfo = response.messages?.[0] || response;

          // Create message log
          const { data: messageLog } = await supabase
            .from('messaging_logs')
            .insert({
              channel_type: campaign.channel_type,
              template_id: template.id,
              channel_id: channel.id,
              provider_message_id: messageInfo.messageId,
              bulk_id: response.bulkId,
              from_number: channel.sender_id,
              to_number: recipient.phone_number,
              content,
              status: 'sent',
              message_type: template.category || 'marketing',
              sent_at: new Date().toISOString(),
              variables: recipient.variables || {},
              campaign_id: campaign.id,
              callback_data: callbackData,
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
