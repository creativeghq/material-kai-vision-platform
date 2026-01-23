/**
 * Messaging Webhook Handler
 * Handles delivery reports and status callbacks from Twilio
 * @see https://www.twilio.com/docs/messaging/guides/webhook-request
 * @see https://www.twilio.com/docs/usage/webhooks/messaging-webhooks
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// =====================================================
// Twilio Webhook Types
// @see https://www.twilio.com/docs/usage/webhooks/messaging-webhooks
// =====================================================

/**
 * Twilio Status Callback Parameters
 * Sent as form-urlencoded POST data
 */
interface TwilioStatusCallback {
  MessageSid: string;
  MessageStatus: 'accepted' | 'queued' | 'sending' | 'sent' | 'delivered' | 'undelivered' | 'failed' | 'read';
  To: string;
  From: string;
  ApiVersion?: string;
  AccountSid?: string;
  ErrorCode?: string;
  ErrorMessage?: string;
  // SMS specific
  SmsSid?: string;
  SmsStatus?: string;
  // WhatsApp specific
  ChannelPrefix?: string;
  // Pricing
  Price?: string;
  PriceUnit?: string;
}

/**
 * Twilio Incoming Message Parameters
 */
interface TwilioIncomingMessage {
  MessageSid: string;
  From: string;
  To: string;
  Body: string;
  NumMedia?: string;
  MediaContentType0?: string;
  MediaUrl0?: string;
  // WhatsApp specific
  ProfileName?: string;
  WaId?: string;
}

// =====================================================
// Status Mapping
// =====================================================

function mapTwilioStatus(status: string): 'queued' | 'sent' | 'delivered' | 'read' | 'failed' {
  switch (status.toLowerCase()) {
    case 'accepted':
    case 'queued':
    case 'sending':
      return 'queued';
    case 'sent':
      return 'sent';
    case 'delivered':
      return 'delivered';
    case 'read':
      return 'read';
    case 'undelivered':
    case 'failed':
      return 'failed';
    default:
      return 'sent';
  }
}

function getChannelTypeFromNumber(phoneNumber: string): 'sms' | 'whatsapp' {
  if (phoneNumber.startsWith('whatsapp:')) {
    return 'whatsapp';
  }
  return 'sms';
}

function cleanPhoneNumber(phoneNumber: string): string {
  return phoneNumber.replace('whatsapp:', '');
}

// =====================================================
// Parse Form Data
// =====================================================

async function parseFormData(request: Request): Promise<Record<string, string>> {
  const contentType = request.headers.get('content-type') || '';

  if (contentType.includes('application/x-www-form-urlencoded')) {
    const text = await request.text();
    const params = new URLSearchParams(text);
    const result: Record<string, string> = {};
    params.forEach((value, key) => {
      result[key] = value;
    });
    return result;
  }

  if (contentType.includes('application/json')) {
    return await request.json();
  }

  // Try to parse as form data anyway
  try {
    const text = await request.text();
    const params = new URLSearchParams(text);
    const result: Record<string, string> = {};
    params.forEach((value, key) => {
      result[key] = value;
    });
    return result;
  } catch {
    return {};
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

    const url = new URL(req.url);
    const webhookType = url.searchParams.get('type') || 'status';

    // Parse the request body (Twilio sends form-urlencoded data)
    const body = await parseFormData(req);

    console.log(`Processing ${webhookType} webhook:`, JSON.stringify(body).substring(0, 500));

    switch (webhookType) {
      // =====================================================
      // Status Callbacks (Delivery Reports)
      // @see https://www.twilio.com/docs/usage/webhooks/messaging-webhooks
      // =====================================================
      case 'status':
      case 'delivery': {
        const callback = body as unknown as TwilioStatusCallback;

        if (!callback.MessageSid) {
          return new Response(JSON.stringify({ message: 'Missing MessageSid' }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200,
          });
        }

        const messageSid = callback.MessageSid;
        const status = mapTwilioStatus(callback.MessageStatus || '');
        const channelType = getChannelTypeFromNumber(callback.From || callback.To || '');

        // Find message log by provider message ID
        const { data: messageLog } = await supabase
          .from('messaging_logs')
          .select('id, campaign_id, status')
          .eq('provider_message_id', messageSid)
          .single();

        if (!messageLog) {
          // Try finding by recipient phone number
          const recipientPhone = cleanPhoneNumber(callback.To);
          const { data: logByPhone } = await supabase
            .from('messaging_logs')
            .select('id, campaign_id, status')
            .eq('recipient', recipientPhone)
            .in('status', ['queued', 'sent'])
            .order('created_at', { ascending: false })
            .limit(1)
            .single();

          if (!logByPhone) {
            console.warn('Message log not found for:', messageSid);
            return new Response(JSON.stringify({ message: 'Message not found' }), {
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
              status: 200,
            });
          }
        }

        const logId = messageLog?.id;
        if (!logId) {
          return new Response(JSON.stringify({ message: 'No log ID' }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200,
          });
        }

        // Prepare update data
        const updateData: Record<string, any> = {
          status,
        };

        if (status === 'delivered') {
          updateData.delivered_at = new Date().toISOString();
        } else if (status === 'read') {
          updateData.read_at = new Date().toISOString();
        } else if (status === 'failed') {
          updateData.failed_at = new Date().toISOString();
          if (callback.ErrorCode) {
            updateData.error_code = callback.ErrorCode;
          }
          if (callback.ErrorMessage) {
            updateData.error_message = callback.ErrorMessage;
          }
        }

        // Update cost if provided
        if (callback.Price) {
          updateData.cost = parseFloat(callback.Price);
          updateData.currency = callback.PriceUnit || 'USD';
        }

        await supabase
          .from('messaging_logs')
          .update(updateData)
          .eq('id', logId);

        // Update campaign recipient if applicable
        if (messageLog?.campaign_id) {
          const recipientUpdate: Record<string, any> = {
            status: status === 'delivered' ? 'delivered' : status === 'failed' ? 'failed' : 'sent',
          };

          if (status === 'delivered') {
            recipientUpdate.delivered_at = new Date().toISOString();
          } else if (status === 'failed') {
            recipientUpdate.failed_at = new Date().toISOString();
            recipientUpdate.error_message = callback.ErrorMessage;
          }

          await supabase
            .from('messaging_campaign_recipients')
            .update(recipientUpdate)
            .eq('message_log_id', logId);
        }

        console.log(`Updated message ${messageSid} status: ${status}`);

        // Return empty TwiML response (Twilio expects this)
        return new Response('<?xml version="1.0" encoding="UTF-8"?><Response></Response>', {
          headers: { ...corsHeaders, 'Content-Type': 'text/xml' },
          status: 200,
        });
      }

      // =====================================================
      // Incoming Messages (SMS/WhatsApp)
      // @see https://www.twilio.com/docs/messaging/guides/webhook-request
      // =====================================================
      case 'incoming': {
        const message = body as unknown as TwilioIncomingMessage;

        if (!message.From || !message.Body) {
          return new Response('<?xml version="1.0" encoding="UTF-8"?><Response></Response>', {
            headers: { ...corsHeaders, 'Content-Type': 'text/xml' },
            status: 200,
          });
        }

        const phone = cleanPhoneNumber(message.From);
        const text = message.Body.toUpperCase().trim();
        const channelType = getChannelTypeFromNumber(message.From);

        // Check for opt-out keywords
        const optOutKeywords = ['STOP', 'UNSUBSCRIBE', 'CANCEL', 'END', 'QUIT', 'STOPALL', 'STOP ALL'];
        const isOptOut = optOutKeywords.some(keyword =>
          text === keyword || text.startsWith(keyword + ' ')
        );

        if (isOptOut) {
          // Check if auto opt-out is enabled
          const { data: settings } = await supabase
            .from('messaging_settings')
            .select('*')
            .single();

          const autoOptoutEnabled = settings?.auto_optout_enabled !== false;

          if (autoOptoutEnabled) {
            await supabase
              .from('messaging_optouts')
              .upsert({
                phone_number: phone,
                channel_type: channelType,
                reason: `STOP keyword: ${text}`,
                source: 'keyword',
                opted_out_at: new Date().toISOString(),
              }, {
                onConflict: 'phone_number,channel_type',
              });

            console.log(`Added ${phone} to opt-out list via keyword: ${text}`);
          }
        }

        // Check for opt-in keywords
        const optInKeywords = ['START', 'YES', 'UNSTOP', 'SUBSCRIBE'];
        const isOptIn = optInKeywords.some(keyword =>
          text === keyword || text.startsWith(keyword + ' ')
        );

        if (isOptIn) {
          // Remove from opt-out list
          await supabase
            .from('messaging_optouts')
            .delete()
            .eq('phone_number', phone)
            .eq('channel_type', channelType);

          console.log(`Removed ${phone} from opt-out list via keyword: ${text}`);
        }

        console.log(`Incoming ${channelType} from ${phone}: ${text.substring(0, 50)}`);

        // Return empty TwiML response
        return new Response('<?xml version="1.0" encoding="UTF-8"?><Response></Response>', {
          headers: { ...corsHeaders, 'Content-Type': 'text/xml' },
          status: 200,
        });
      }

      default:
        return new Response('<?xml version="1.0" encoding="UTF-8"?><Response></Response>', {
          headers: { ...corsHeaders, 'Content-Type': 'text/xml' },
          status: 200,
        });
    }
  } catch (error) {
    console.error('Error processing webhook:', error);
    // Still return 200 to prevent Twilio from retrying
    return new Response('<?xml version="1.0" encoding="UTF-8"?><Response></Response>', {
      headers: { ...corsHeaders, 'Content-Type': 'text/xml' },
      status: 200,
    });
  }
});
