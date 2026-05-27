/**
 * Campaign Processor Edge Function
 * Processes scheduled campaigns and sends emails to recipients
 * Runs via cron job every minute
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from '@supabase/supabase-js';
import { bootstrapForFunction } from '../_shared/secrets-bootstrap.ts';

const SEND_RATE_PER_MINUTE = 8; // ~500 per hour

serve(async (req) => {
  await bootstrapForFunction();
  try {
    // Verify this is a cron request
    const authHeader = req.headers.get('Authorization');
    const expectedKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    if (!authHeader || authHeader !== `Bearer ${expectedKey}`) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log('Campaign processor started');

    // 1. Check for scheduled campaigns that should start
    const now = new Date().toISOString();
    const { data: scheduledCampaigns, error: scheduledError } = await supabase
      .from('campaigns')
      .select('*')
      .eq('status', 'scheduled')
      .lte('scheduled_at', now);

    if (scheduledError) throw scheduledError;

    // Start scheduled campaigns
    for (const campaign of scheduledCampaigns || []) {
      await supabase
        .from('campaigns')
        .update({ status: 'sending' })
        .eq('id', campaign.id);
      
      console.log(`Started campaign: ${campaign.id}`);
    }

    // 2. Process campaigns that are currently sending
    const { data: sendingCampaigns, error: sendingError } = await supabase
      .from('campaigns')
      .select('*')
      .eq('status', 'sending');

    if (sendingError) throw sendingError;

    let totalProcessed = 0;

    for (const campaign of sendingCampaigns || []) {
      // Get pending recipients for this campaign
      const { data: recipients, error: recipientsError } = await supabase
        .from('campaign_recipients')
        .select('*')
        .eq('campaign_id', campaign.id)
        .eq('status', 'pending')
        .limit(SEND_RATE_PER_MINUTE);

      if (recipientsError) {
        console.error(`Error fetching recipients for campaign ${campaign.id}:`, recipientsError);
        continue;
      }

      if (!recipients || recipients.length === 0) {
        const { count: failedCount } = await supabase
          .from('campaign_recipients')
          .select('id', { count: 'exact', head: true })
          .eq('campaign_id', campaign.id)
          .eq('status', 'failed');

        const finalStatus = (failedCount ?? 0) > 0 ? 'partial_failure' : 'sent';
        await supabase
          .from('campaigns')
          .update({
            status: finalStatus,
            sent_at: new Date().toISOString(),
            ...(failedCount ? { metadata: { failed_recipients: failedCount } } : {}),
          })
          .eq('id', campaign.id);

        console.log(`Completed campaign: ${campaign.id} (${finalStatus}, ${failedCount ?? 0} failed)`);
        continue;
      }

      // Send emails to recipients
      for (const recipient of recipients) {
        try {
          // Update status to sending
          await supabase
            .from('campaign_recipients')
            .update({ status: 'sending' })
            .eq('id', recipient.id);

          // Call email-api to send the email
          const emailResponse = await fetch(`${supabaseUrl}/functions/v1/email-api`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${supabaseKey}`,
            },
            body: JSON.stringify({
              to: recipient.email,
              template_id: campaign.template_id,
              subject: campaign.subject_line,
              variables: recipient.variables || {},
              metadata: {
                campaign_id: campaign.id,
                recipient_id: recipient.id,
              },
            }),
          });

          if (emailResponse.ok) {
            // Update recipient status to sent
            await supabase
              .from('campaign_recipients')
              .update({ 
                status: 'sent',
                sent_at: new Date().toISOString()
              })
              .eq('id', recipient.id);
            
            totalProcessed++;
          } else {
            const errorData = await emailResponse.text();
            throw new Error(`Email API error: ${errorData}`);
          }
        } catch (error) {
          console.error(`Error sending to ${recipient.email}:`, error);
          
          // Update recipient with error
          await supabase
            .from('campaign_recipients')
            .update({ 
              status: 'failed',
              error_message: error.message,
              retry_count: (recipient.retry_count || 0) + 1
            })
            .eq('id', recipient.id);
        }
      }
    }

    console.log(`Campaign processor completed. Processed ${totalProcessed} emails.`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        processed: totalProcessed,
        scheduledCampaigns: scheduledCampaigns?.length || 0,
        sendingCampaigns: sendingCampaigns?.length || 0,
      }),
      { 
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('Campaign processor error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
});

