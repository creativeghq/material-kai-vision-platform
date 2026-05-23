/**
 * Email Webhooks Handler
 * Processes webhook events from Resend for bounces, complaints, delivery, opens, and clicks.
 *
 * Resend uses Svix for webhook signing. Signature verification uses HMAC-SHA256.
 * Set RESEND_WEBHOOK_SECRET in Supabase Edge Function secrets (from Resend dashboard → Webhooks).
 */

import { createClient } from '@supabase/supabase-js';
import { bootstrapForFunction } from '../_shared/secrets-bootstrap.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, svix-id, svix-timestamp, svix-signature',
};

// Map Resend event types to our internal event_type values
const RESEND_EVENT_MAP: Record<string, string> = {
  'email.sent': 'send',
  'email.delivered': 'delivery',
  'email.delivery_delayed': 'delivery_delayed',
  'email.bounced': 'bounce',
  'email.complained': 'complaint',
  'email.opened': 'open',
  'email.clicked': 'click',
};

interface ResendWebhookEvent {
  type: string;
  created_at: string;
  data: {
    email_id: string;
    from: string;
    to: string[];
    subject: string;
    bounce?: {
      message: string;
    };
    click?: {
      link: string;
    };
  };
}

/**
 * Verify Resend webhook signature (Svix-based HMAC-SHA256).
 * Returns true if the signature is valid.
 */
async function verifyResendSignature(
  rawBody: string,
  svixId: string,
  svixTimestamp: string,
  svixSignature: string,
  secret: string,
): Promise<boolean> {
  try {
    // Svix signs: "{svix-id}.{svix-timestamp}.{body}"
    const toSign = `${svixId}.${svixTimestamp}.${rawBody}`;

    // Secret is prefixed with "whsec_" and is base64-encoded
    const secretBytes = Uint8Array.from(
      atob(secret.replace(/^whsec_/, '')),
      (c) => c.charCodeAt(0),
    );

    const key = await crypto.subtle.importKey(
      'raw',
      secretBytes,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign'],
    );

    const signatureBuffer = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(toSign));
    const computedSignature = btoa(String.fromCharCode(...new Uint8Array(signatureBuffer)));

    // svix-signature may contain multiple space-separated "v1,<base64>" values
    const signatures = svixSignature.split(' ');
    return signatures.some((sig) => {
      const sigValue = sig.replace(/^v1,/, '');
      return sigValue === computedSignature;
    });
  } catch (err) {
    console.error('Signature verification error:', err);
    return false;
  }
}

Deno.serve(async (req) => {
  await bootstrapForFunction();
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    // Read raw body (needed for signature verification)
    const rawBody = await req.text();

    // Verify Resend webhook signature if secret is configured
    const webhookSecret = Deno.env.get('RESEND_WEBHOOK_SECRET');
    if (webhookSecret) {
      const svixId = req.headers.get('svix-id') ?? '';
      const svixTimestamp = req.headers.get('svix-timestamp') ?? '';
      const svixSignature = req.headers.get('svix-signature') ?? '';

      if (!svixId || !svixTimestamp || !svixSignature) {
        console.warn('Missing Svix headers — rejecting webhook');
        return new Response(JSON.stringify({ error: 'Missing webhook signature headers' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      const valid = await verifyResendSignature(rawBody, svixId, svixTimestamp, svixSignature, webhookSecret);
      if (!valid) {
        console.warn('Invalid webhook signature');
        return new Response(JSON.stringify({ error: 'Invalid webhook signature' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        });
      }
    } else {
      console.warn('RESEND_WEBHOOK_SECRET not set — skipping signature verification');
    }

    const event: ResendWebhookEvent = JSON.parse(rawBody);
    const eventType = RESEND_EVENT_MAP[event.type];

    if (!eventType) {
      console.log(`Unhandled Resend event type: ${event.type}`);
      return new Response(JSON.stringify({ success: true, message: 'Event type not tracked' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const messageId = event.data.email_id;

    // Find the email log entry by Resend's email ID
    const { data: emailLog, error: logError } = await supabaseClient
      .from('email_logs')
      .select('id')
      .eq('message_id', messageId)
      .single();

    if (logError || !emailLog) {
      console.warn('Email log not found for message ID:', messageId);
      // Return 200 so Resend doesn't retry — this can happen for emails sent outside the platform
      return new Response(JSON.stringify({ success: true, message: 'Email log not found' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Build event record
    const eventRecord: Record<string, unknown> = {
      email_log_id: emailLog.id,
      message_id: messageId,
      event_type: eventType,
      timestamp: event.created_at,
      raw_event: event,
    };

    if (event.type === 'email.bounced' && event.data.bounce) {
      eventRecord.bounce_type = 'Permanent';
      eventRecord.diagnostic_code = event.data.bounce.message;
    }

    // Insert event record
    await supabaseClient.from('email_events').insert(eventRecord);

    // The DB trigger automatically updates email_logs status based on email_events inserts.
    // For delivery events we also update delivered_at directly as a safety net.
    if (event.type === 'email.delivered') {
      await supabaseClient
        .from('email_logs')
        .update({ status: 'delivered', delivered_at: event.created_at })
        .eq('id', emailLog.id);
    } else if (event.type === 'email.bounced') {
      await supabaseClient
        .from('email_logs')
        .update({ status: 'bounced' })
        .eq('id', emailLog.id);
    } else if (event.type === 'email.complained') {
      await supabaseClient
        .from('email_logs')
        .update({ status: 'complained' })
        .eq('id', emailLog.id);
    } else if (event.type === 'email.opened') {
      await supabaseClient
        .from('email_logs')
        .update({ opened_at: event.created_at })
        .eq('id', emailLog.id);
    } else if (event.type === 'email.clicked') {
      await supabaseClient
        .from('email_logs')
        .update({ clicked_at: event.created_at })
        .eq('id', emailLog.id);
    }

    return new Response(JSON.stringify({ success: true, event_type: eventType }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error processing Resend webhook:', error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : String(error) }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
