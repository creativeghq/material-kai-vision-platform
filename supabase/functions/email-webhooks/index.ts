/**
 * Email Webhooks Handler
 * Processes SNS notifications from Amazon SES for bounces, complaints, and delivery events
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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

interface SESEvent {
  eventType: 'Bounce' | 'Complaint' | 'Delivery' | 'Send' | 'Reject' | 'Open' | 'Click';
  mail: {
    timestamp: string;
    source: string;
    sourceArn: string;
    sendingAccountId: string;
    messageId: string;
    destination: string[];
  };
  bounce?: {
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
  };
  complaint?: {
    complainedRecipients: Array<{
      emailAddress: string;
    }>;
    timestamp: string;
    feedbackId: string;
    userAgent?: string;
    complaintFeedbackType?: string;
  };
  delivery?: {
    timestamp: string;
    processingTimeMillis: number;
    recipients: string[];
    smtpResponse: string;
  };
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Initialize Supabase client
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    const body: SNSMessage = await req.json();

    // Handle SNS subscription confirmation
    if (body.Type === 'SubscriptionConfirmation') {
      console.log('SNS Subscription Confirmation:', body.SubscribeURL);
      
      // Auto-confirm subscription
      if (body.SubscribeURL) {
        await fetch(body.SubscribeURL);
      }

      return new Response(
        JSON.stringify({ success: true, message: 'Subscription confirmed' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Handle SNS notification
    if (body.Type === 'Notification') {
      const sesEvent: SESEvent = JSON.parse(body.Message);
      const messageId = sesEvent.mail.messageId;

      // Find the email log entry
      const { data: emailLog, error: logError } = await supabaseClient
        .from('email_logs')
        .select('id')
        .eq('message_id', messageId)
        .single();

      if (logError || !emailLog) {
        console.warn('Email log not found for message ID:', messageId);
        return new Response(
          JSON.stringify({ success: true, message: 'Email log not found' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Process event based on type
      let eventType = sesEvent.eventType.toLowerCase();
      let eventSubtype: string | undefined;
      let diagnosticCode: string | undefined;
      let bounceType: string | undefined;
      let bounceSubtype: string | undefined;
      let complaintFeedbackType: string | undefined;

      if (sesEvent.bounce) {
        eventType = 'bounce';
        bounceType = sesEvent.bounce.bounceType;
        bounceSubtype = sesEvent.bounce.bounceSubType;
        if (sesEvent.bounce.bouncedRecipients[0]) {
          diagnosticCode = sesEvent.bounce.bouncedRecipients[0].diagnosticCode;
        }
      } else if (sesEvent.complaint) {
        eventType = 'complaint';
        complaintFeedbackType = sesEvent.complaint.complaintFeedbackType;
      } else if (sesEvent.delivery) {
        eventType = 'delivery';
      }

      // Insert event record
      await supabaseClient.from('email_events').insert({
        email_log_id: emailLog.id,
        message_id: messageId,
        event_type: eventType,
        event_subtype: eventSubtype,
        timestamp: sesEvent.mail.timestamp,
        bounce_type: bounceType,
        bounce_subtype: bounceSubtype,
        complaint_feedback_type: complaintFeedbackType,
        diagnostic_code: diagnosticCode,
        raw_event: sesEvent,
      });

      // The trigger will automatically update the email_logs table

      return new Response(
        JSON.stringify({ success: true, message: 'Event processed' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ success: true, message: 'Unknown event type' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error processing webhook:', error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

