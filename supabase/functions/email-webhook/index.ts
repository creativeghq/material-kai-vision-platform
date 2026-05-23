/**
 * Email Webhook Handler — Campaign Recipient Tracking
 * Processes email events from Resend for campaign delivery tracking.
 *
 * Resend sends events with type like "email.delivered", "email.bounced", etc.
 * This handler maps those to campaign_recipients table updates.
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from '@supabase/supabase-js';
import { bootstrapForFunction } from '../_shared/secrets-bootstrap.ts';

// Map Resend event types to our normalized event_type strings
const RESEND_EVENT_MAP: Record<string, string> = {
  'email.delivered': 'delivered',
  'email.bounced': 'bounced',
  'email.complained': 'complained',
  'email.opened': 'opened',
  'email.clicked': 'clicked',
  'email.sent': 'sent',
};

serve(async (req) => {
  await bootstrapForFunction();
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const payload = await req.json();
    console.log('Received email event:', payload);

    // Normalize: support both direct event_type strings and Resend's typed format
    let event_type: string = payload.event_type || payload.type || '';
    if (RESEND_EVENT_MAP[event_type]) {
      event_type = RESEND_EVENT_MAP[event_type];
    }

    // Resend wraps data under `data`; direct callers may pass fields at root
    const data = payload.data || payload;
    const recipient_id: string | undefined = data.recipient_id || payload.recipient_id;
    const campaign_id: string | undefined = data.campaign_id || payload.campaign_id;
    const email: string | undefined = data.to?.[0] || data.email || payload.email;
    const timestamp: string | undefined = data.created_at || payload.timestamp;
    const metadata = data.metadata || payload.metadata;

    if (!recipient_id && !campaign_id) {
      return new Response(
        JSON.stringify({ error: 'Missing recipient_id or campaign_id' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Find the recipient
    let query = supabase.from('campaign_recipients').select('*');

    if (recipient_id) {
      query = query.eq('id', recipient_id);
    } else if (campaign_id && email) {
      query = query.eq('campaign_id', campaign_id).eq('email', email);
    }

    const { data: recipients, error: fetchError } = await query.limit(1);

    if (fetchError) throw fetchError;
    if (!recipients || recipients.length === 0) {
      console.warn('Recipient not found:', { recipient_id, campaign_id, email });
      return new Response(
        JSON.stringify({ warning: 'Recipient not found' }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const recipient = recipients[0];
    const now = new Date().toISOString();

    let updateData: Record<string, unknown> = {};

    switch (event_type) {
      case 'delivered':
        updateData = { delivered_at: timestamp || now };
        break;

      case 'opened':
      case 'open':
        updateData = { opened_at: recipient.opened_at || timestamp || now };
        break;

      case 'clicked':
      case 'click':
        updateData = {
          clicked_at: recipient.clicked_at || timestamp || now,
          opened_at: recipient.opened_at || timestamp || now,
        };
        break;

      case 'bounced':
      case 'bounce':
        updateData = {
          status: 'bounced',
          bounced_at: timestamp || now,
          error_message: metadata?.reason || 'Email bounced',
        };
        break;

      case 'complained':
      case 'complaint':
      case 'spam':
        updateData = {
          status: 'complained',
          complained_at: timestamp || now,
        };
        break;

      case 'failed':
        updateData = {
          status: 'failed',
          error_message: metadata?.reason || 'Email failed to send',
        };
        break;

      default:
        console.warn('Unknown event type:', event_type);
        return new Response(
          JSON.stringify({ warning: 'Unknown event type' }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
    }

    const { error: updateError } = await supabase
      .from('campaign_recipients')
      .update(updateData)
      .eq('id', recipient.id);

    if (updateError) throw updateError;

    console.log(`Updated recipient ${recipient.id} for event ${event_type}`);

    return new Response(
      JSON.stringify({ success: true, event_type, recipient_id: recipient.id }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Email webhook error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : String(error) }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
});
