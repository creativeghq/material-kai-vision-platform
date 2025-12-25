/**
 * Email Webhook Handler
 * Processes email events from email service provider (opens, clicks, bounces, complaints)
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

serve(async (req) => {
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const event = await req.json();
    console.log('Received email event:', event);

    // Extract event data (format depends on your email provider)
    const {
      event_type,
      recipient_id,
      campaign_id,
      email,
      timestamp,
      metadata,
    } = event;

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

    // Update recipient based on event type
    let updateData: any = {};

    switch (event_type) {
      case 'delivered':
        updateData = {
          delivered_at: timestamp || now,
        };
        break;

      case 'opened':
      case 'open':
        updateData = {
          opened_at: recipient.opened_at || timestamp || now, // Keep first open
        };
        break;

      case 'clicked':
      case 'click':
        updateData = {
          clicked_at: recipient.clicked_at || timestamp || now, // Keep first click
          opened_at: recipient.opened_at || timestamp || now, // Implicit open
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

    // Update the recipient
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
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
});

