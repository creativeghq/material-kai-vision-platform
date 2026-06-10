/**
 * SES Webhook Handler
 * Handles SNS notifications from Amazon SES for bounces, complaints, and delivery confirmations
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from '@supabase/supabase-js';
import { corsHeaders } from '../_shared/cors.ts';
import { bootstrapForFunction } from '../_shared/secrets-bootstrap.ts';
import { withApiLogging } from '../_shared/api-logger.ts';

interface SNSMessage {
  Type: string;
  MessageId: string;
  TopicArn: string;
  Subject?: string;
  Message: string;
  Timestamp: string;
  SignatureVersion: string;
  Signature: string;
  SigningCertURL: string;
  UnsubscribeURL: string;
  SubscribeURL?: string;
}

interface SESBounce {
  bounceType: string;
  bounceSubType: string;
  bouncedRecipients: Array<{
    emailAddress: string;
    action?: string;
    status?: string;
    diagnosticCode?: string;
  }>;
  timestamp: string;
  feedbackId: string;
}

interface SESComplaint {
  complainedRecipients: Array<{
    emailAddress: string;
  }>;
  timestamp: string;
  feedbackId: string;
  complaintFeedbackType?: string;
}

interface SESDelivery {
  timestamp: string;
  recipients: string[];
  processingTimeMillis: number;
  smtpResponse: string;
}

serve(withApiLogging('ses-webhook', async (req) => {
  await bootstrapForFunction();
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const snsMessage: SNSMessage = await req.json();

    // Handle SNS subscription confirmation
    if (snsMessage.Type === 'SubscriptionConfirmation') {
      console.log('SNS Subscription Confirmation:', snsMessage.SubscribeURL);
      
      // Auto-confirm subscription
      if (snsMessage.SubscribeURL) {
        await fetch(snsMessage.SubscribeURL);
      }

      return new Response(JSON.stringify({ message: 'Subscription confirmed' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      });
    }

    // Handle SNS notification
    if (snsMessage.Type === 'Notification') {
      const message = JSON.parse(snsMessage.Message);
      const notificationType = message.notificationType;
      const mail = message.mail;

      console.log('SES Notification:', notificationType, mail);

      // Find the email log entry
      const messageId = mail.messageId;
      const { data: emailLog } = await supabase
        .from('email_logs')
        .select('id')
        .eq('message_id', messageId)
        .single();

      if (!emailLog) {
        console.warn('Email log not found for message:', messageId);
        return new Response(JSON.stringify({ message: 'Email log not found' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200,
        });
      }

      // Handle different notification types
      switch (notificationType) {
        case 'Bounce': {
          const bounce: SESBounce = message.bounce;
          const bounceType = bounce.bounceType;
          const isPermanent = bounceType === 'Permanent';

          // Update email log
          await supabase
            .from('email_logs')
            .update({
              status: 'bounced',
              bounced_at: bounce.timestamp,
              bounce_type: bounceType,
              bounce_subtype: bounce.bounceSubType,
              error_message: bounce.bouncedRecipients[0]?.diagnosticCode || 'Email bounced',
            })
            .eq('id', emailLog.id);

          // Update campaign recipients if applicable
          for (const recipient of bounce.bouncedRecipients) {
            await supabase
              .from('campaign_recipients')
              .update({
                status: 'bounced',
                bounced_at: bounce.timestamp,
                error_message: recipient.diagnosticCode || 'Email bounced',
              })
              .eq('email_log_id', emailLog.id)
              .eq('email', recipient.emailAddress);
          }

          console.log('Processed bounce:', bounceType, bounce.bouncedRecipients.length, 'recipients');
          break;
        }

        case 'Complaint': {
          const complaint: SESComplaint = message.complaint;

          // Update email log
          await supabase
            .from('email_logs')
            .update({
              status: 'complained',
              complained_at: complaint.timestamp,
            })
            .eq('id', emailLog.id);

          // Update campaign recipients
          for (const recipient of complaint.complainedRecipients) {
            await supabase
              .from('campaign_recipients')
              .update({
                status: 'complained',
                complained_at: complaint.timestamp,
              })
              .eq('email_log_id', emailLog.id)
              .eq('email', recipient.emailAddress);
          }

          console.log('Processed complaint:', complaint.complainedRecipients.length, 'recipients');
          break;
        }

        case 'Delivery': {
          const delivery: SESDelivery = message.delivery;

          // Update email log
          await supabase
            .from('email_logs')
            .update({
              status: 'delivered',
              delivered_at: delivery.timestamp,
            })
            .eq('id', emailLog.id);

          // Update campaign recipients
          for (const recipient of delivery.recipients) {
            await supabase
              .from('campaign_recipients')
              .update({
                status: 'sent',
                delivered_at: delivery.timestamp,
              })
              .eq('email_log_id', emailLog.id)
              .eq('email', recipient);
          }

          console.log('Processed delivery:', delivery.recipients.length, 'recipients');
          break;
        }

        default:
          console.log('Unknown notification type:', notificationType);
      }

      return new Response(JSON.stringify({ message: 'Notification processed' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      });
    }

    return new Response(JSON.stringify({ message: 'Unknown SNS message type' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    });
  } catch (error) {
    console.error('Error processing SES webhook:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
}));

