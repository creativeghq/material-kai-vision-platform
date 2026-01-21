/**
 * Messaging Webhook Handler
 * Handles delivery reports, read receipts, and opt-out requests from Infobip
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// =====================================================
// Types
// =====================================================

interface InfobipDeliveryReport {
  results: Array<{
    bulkId?: string;
    messageId: string;
    to: string;
    sender?: string;
    sentAt?: string;
    doneAt?: string;
    messageCount?: number;
    price?: {
      pricePerMessage: number;
      currency: string;
    };
    status: {
      groupId: number;
      groupName: 'PENDING' | 'UNDELIVERABLE' | 'DELIVERED' | 'EXPIRED' | 'REJECTED' | 'ACCEPTED';
      id: number;
      name: string;
      description: string;
    };
    error?: {
      groupId: number;
      groupName: string;
      id: number;
      name: string;
      description: string;
      permanent: boolean;
    };
    callbackData?: string;
  }>;
}

interface InfobipSeenReport {
  results: Array<{
    messageId: string;
    to: string;
    seenAt: string;
    sender?: string;
    callbackData?: string;
  }>;
}

interface InfobipIncomingMessage {
  results: Array<{
    messageId: string;
    from: string;
    to: string;
    text: string;
    receivedAt: string;
    keyword?: string;
    callbackData?: string;
  }>;
}

// =====================================================
// Status Mapping
// =====================================================

function mapInfobipStatus(groupName: string): 'sent' | 'delivered' | 'failed' | 'rejected' | 'expired' {
  switch (groupName) {
    case 'DELIVERED':
      return 'delivered';
    case 'UNDELIVERABLE':
    case 'REJECTED':
      return 'failed';
    case 'EXPIRED':
      return 'expired';
    case 'PENDING':
    case 'ACCEPTED':
    default:
      return 'sent';
  }
}

// =====================================================
// Main Handler
// =====================================================

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Verify webhook secret if configured
    const webhookSecret = Deno.env.get('INFOBIP_WEBHOOK_SECRET');
    if (webhookSecret) {
      const signature = req.headers.get('x-infobip-signature');
      // Note: Implement proper signature verification based on Infobip's documentation
      // For now, we'll just check if the secret header matches
      const authHeader = req.headers.get('authorization');
      if (authHeader && authHeader !== `Bearer ${webhookSecret}`) {
        console.warn('Invalid webhook signature');
        // Continue processing but log the warning
      }
    }

    const body = await req.json();

    // Determine the type of webhook
    const url = new URL(req.url);
    const webhookType = url.searchParams.get('type') || 'delivery';

    console.log(`Processing ${webhookType} webhook:`, JSON.stringify(body).substring(0, 500));

    switch (webhookType) {
      // =====================================================
      // Delivery Reports
      // =====================================================
      case 'delivery': {
        const report: InfobipDeliveryReport = body;

        if (!report.results || report.results.length === 0) {
          return new Response(JSON.stringify({ message: 'No results to process' }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200,
          });
        }

        for (const result of report.results) {
          const messageId = result.messageId;
          const status = mapInfobipStatus(result.status.groupName);

          // Find the message log entry
          const { data: messageLog } = await supabase
            .from('messaging_logs')
            .select('id, campaign_id')
            .eq('provider_message_id', messageId)
            .single();

          if (!messageLog) {
            console.warn('Message log not found for messageId:', messageId);
            continue;
          }

          // Update message log
          const updateData: any = {
            status,
          };

          if (status === 'delivered') {
            updateData.delivered_at = result.doneAt || new Date().toISOString();
          } else if (status === 'failed' || status === 'rejected') {
            updateData.failed_at = result.doneAt || new Date().toISOString();
            updateData.error_code = result.error?.id?.toString();
            updateData.error_message = result.error?.description || result.status.description;
          } else if (status === 'expired') {
            updateData.failed_at = result.doneAt || new Date().toISOString();
            updateData.error_message = 'Message expired';
          }

          // Add cost if available
          if (result.price) {
            updateData.cost = result.price.pricePerMessage;
            updateData.currency = result.price.currency;
          }

          if (result.messageCount) {
            updateData.segment_count = result.messageCount;
          }

          await supabase
            .from('messaging_logs')
            .update(updateData)
            .eq('id', messageLog.id);

          // Update campaign recipient if applicable
          if (messageLog.campaign_id) {
            const recipientUpdate: any = {
              status: status === 'delivered' ? 'delivered' : status === 'failed' ? 'failed' : 'sent',
            };

            if (status === 'delivered') {
              recipientUpdate.delivered_at = result.doneAt || new Date().toISOString();
            } else if (status === 'failed') {
              recipientUpdate.failed_at = result.doneAt || new Date().toISOString();
              recipientUpdate.error_message = result.error?.description || result.status.description;
            }

            await supabase
              .from('messaging_campaign_recipients')
              .update(recipientUpdate)
              .eq('message_log_id', messageLog.id);
          }

          console.log(`Updated message ${messageId} to status: ${status}`);
        }

        return new Response(JSON.stringify({ message: 'Delivery reports processed' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200,
        });
      }

      // =====================================================
      // Seen/Read Reports (WhatsApp/Viber)
      // =====================================================
      case 'seen': {
        const report: InfobipSeenReport = body;

        if (!report.results || report.results.length === 0) {
          return new Response(JSON.stringify({ message: 'No results to process' }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200,
          });
        }

        for (const result of report.results) {
          const messageId = result.messageId;

          // Find the message log entry
          const { data: messageLog } = await supabase
            .from('messaging_logs')
            .select('id, campaign_id')
            .eq('provider_message_id', messageId)
            .single();

          if (!messageLog) {
            console.warn('Message log not found for messageId:', messageId);
            continue;
          }

          // Update message log
          await supabase
            .from('messaging_logs')
            .update({
              status: 'read',
              read_at: result.seenAt || new Date().toISOString(),
            })
            .eq('id', messageLog.id);

          // Update campaign recipient if applicable
          if (messageLog.campaign_id) {
            await supabase
              .from('messaging_campaign_recipients')
              .update({
                status: 'read',
                read_at: result.seenAt || new Date().toISOString(),
              })
              .eq('message_log_id', messageLog.id);
          }

          console.log(`Updated message ${messageId} to read status`);
        }

        return new Response(JSON.stringify({ message: 'Seen reports processed' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200,
        });
      }

      // =====================================================
      // Incoming Messages (for opt-out handling)
      // =====================================================
      case 'incoming': {
        const report: InfobipIncomingMessage = body;

        if (!report.results || report.results.length === 0) {
          return new Response(JSON.stringify({ message: 'No results to process' }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200,
          });
        }

        // Check if auto opt-out is enabled
        const { data: settings } = await supabase
          .from('messaging_settings')
          .select('setting_value')
          .eq('setting_key', 'auto_optout_enabled')
          .single();

        const autoOptoutEnabled = settings?.setting_value !== 'false';

        for (const result of report.results) {
          const text = result.text?.toUpperCase().trim();
          const fromNumber = result.from;

          // Check for opt-out keywords
          const optOutKeywords = ['STOP', 'UNSUBSCRIBE', 'CANCEL', 'END', 'QUIT'];
          const isOptOut = optOutKeywords.some(keyword => text === keyword || text?.startsWith(keyword + ' '));

          if (isOptOut && autoOptoutEnabled) {
            // Parse callback data to get channel type
            let channelType = 'sms';
            if (result.callbackData) {
              try {
                const callbackData = JSON.parse(result.callbackData);
                channelType = callbackData.channel || 'sms';
              } catch {
                // Ignore parse errors
              }
            }

            // Add to opt-out list
            await supabase
              .from('messaging_optouts')
              .upsert({
                phone_number: fromNumber,
                channel_type: channelType,
                reason: `STOP keyword: ${text}`,
                source: 'keyword',
                opted_out_at: new Date().toISOString(),
              }, {
                onConflict: 'phone_number,channel_type',
              });

            console.log(`Added ${fromNumber} to opt-out list for ${channelType}`);
          }

          // Log incoming message (optional)
          console.log(`Incoming message from ${fromNumber}: ${text?.substring(0, 50)}`);
        }

        return new Response(JSON.stringify({ message: 'Incoming messages processed' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200,
        });
      }

      default:
        return new Response(JSON.stringify({ message: 'Unknown webhook type' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400,
        });
    }
  } catch (error) {
    console.error('Error processing webhook:', error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});
