/**
 * Messaging Campaign Processor — WhatsApp via Zernio.
 *
 * Cron-invoked (every minute). Sends scheduled WhatsApp campaigns per-recipient
 * through Zernio's inbox conversation-create path with an approved template
 * (WhatsApp blocks cold freeform sends). SMS / Twilio removed.
 *
 * Outbound sends are logged to messaging_logs only — they deliberately do NOT
 * create an inbox conversation. A thread is surfaced + assigned only when the
 * recipient replies (handled in zernio-webhook-handler on message.received).
 *
 * @see https://docs.zernio.com — /v1/inbox/conversations
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from '@supabase/supabase-js';
import { corsHeaders } from '../_shared/cors.ts';
import { bootstrapForFunction } from '../_shared/secrets-bootstrap.ts';
import { notConfiguredResponse } from '../_shared/api-provider-errors.ts';
import { zernioKey, sendWhatsAppMessage } from '../_shared/zernio.ts';
import { withApiLogging } from '../_shared/api-logger.ts';

const BATCH_SIZE = 10;
const MAX_RETRIES = 3;

function renderTemplate(content: string, variables: Record<string, any>): string {
  let out = content || '';
  for (const [k, v] of Object.entries(variables || {})) {
    out = out.replace(new RegExp(`{{${k}}}`, 'g'), String(v ?? ''));
  }
  return out;
}

function orderedTemplateParams(template: any, variables: Record<string, any>): string[] {
  const names: string[] = Array.isArray(template?.variables) ? template.variables : [];
  return names.map((name) => String(variables?.[name] ?? ''));
}

serve(withApiLogging('messaging-processor', async (req) => {
  await bootstrapForFunction();
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const cronSecret = req.headers.get('x-cron-secret');
  const expectedSecret = Deno.env.get('CRON_SECRET') || '';
  if (!expectedSecret || cronSecret !== expectedSecret) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const startTime = Date.now();
  const stats = { campaignsProcessed: 0, messagesSent: 0, messagesFailed: 0, campaignsCompleted: 0, campaignsStarted: 0 };

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    if (!zernioKey()) {
      console.warn('[messaging-processor] Zernio not configured — skipping this tick');
      return notConfiguredResponse({
        provider: 'Zernio',
        envVarHint: 'Cron tick skipped — set ZERNIO_API_KEY on the host, or paste it',
        settingsPath: '/admin/modules/messaging/settings → Keys',
      });
    }

    const now = new Date().toISOString();

    // 1. Start scheduled WhatsApp campaigns that are due
    const { data: scheduled } = await supabase
      .from('campaigns').select('id')
      .eq('status', 'scheduled').eq('channel_type', 'whatsapp')
      .lte('scheduled_at', now);
    for (const c of scheduled || []) {
      await supabase.from('campaigns').update({ status: 'sending' }).eq('id', c.id);
      stats.campaignsStarted++;
    }

    // 2. Active (sending) WhatsApp campaigns
    const { data: activeCampaigns } = await supabase
      .from('campaigns')
      .select(`
        id, name, channel_type, messaging_template_id, messaging_channel_id,
        template:messaging_templates(*),
        channel:messaging_channels(*)
      `)
      .eq('status', 'sending').eq('channel_type', 'whatsapp');

    if (!activeCampaigns?.length) {
      return new Response(JSON.stringify({ success: true, message: 'No active campaigns', stats }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    for (const campaign of activeCampaigns) {
      stats.campaignsProcessed++;
      const template = campaign.template as any;
      const channel = campaign.channel as any;

      if (!template || !channel) {
        console.warn(`Campaign ${campaign.id} missing template or channel, skipping`);
        continue;
      }
      if (!channel.zernio_account_id) {
        console.warn(`Campaign ${campaign.id} channel has no Zernio account, skipping`);
        continue;
      }

      // Opt-outs (whatsapp + all) checked once per campaign
      const { data: optouts } = await supabase
        .from('messaging_optouts').select('phone_number')
        .or('channel_type.eq.whatsapp,channel_type.eq.all');
      const optedOut = new Set((optouts || []).map((o) => o.phone_number));

      const { data: pending } = await supabase
        .from('messaging_campaign_recipients').select('*')
        .eq('campaign_id', campaign.id).eq('status', 'pending')
        .lt('retry_count', MAX_RETRIES).limit(BATCH_SIZE);

      if (!pending?.length) {
        const { count: remaining } = await supabase
          .from('messaging_campaign_recipients')
          .select('*', { count: 'exact', head: true })
          .eq('campaign_id', campaign.id).in('status', ['pending', 'sending']);
        if (remaining === 0) {
          await supabase.from('campaigns')
            .update({ status: 'sent', sent_at: new Date().toISOString() })
            .eq('id', campaign.id);
          stats.campaignsCompleted++;
        }
        continue;
      }

      for (const recipient of pending) {
        if (optedOut.has(recipient.phone_number)) {
          await supabase.from('messaging_campaign_recipients')
            .update({ status: 'opted_out', error_message: 'Recipient has opted out' })
            .eq('id', recipient.id);
          continue;
        }

        await supabase.from('messaging_campaign_recipients').update({ status: 'sending' }).eq('id', recipient.id);

        try {
          const variables = { name: recipient.contact_name || '', phone: recipient.phone_number, ...(recipient.variables || {}) };
          const content = renderTemplate(template.content, variables);

          const result = await sendWhatsAppMessage({
            accountId: channel.zernio_account_id,
            to: recipient.phone_number,
            message: content,
            templateName: template.whatsapp_template_name || undefined,
            templateLanguage: template.whatsapp_language_code || undefined,
            templateParams: orderedTemplateParams(template, variables),
          });

          if (!result.success) throw new Error(result.error || 'Failed to send message');

          const { data: messageLog } = await supabase.from('messaging_logs').insert({
            channel_type: 'whatsapp',
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
          }).select().single();

          await supabase.from('messaging_campaign_recipients').update({
            status: 'sent',
            sent_at: new Date().toISOString(),
            message_log_id: messageLog?.id,
          }).eq('id', recipient.id);

          stats.messagesSent++;
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          await supabase.from('messaging_campaign_recipients').update({
            status: 'pending',
            error_message: errorMessage,
            retry_count: recipient.retry_count + 1,
          }).eq('id', recipient.id);

          if (recipient.retry_count + 1 >= MAX_RETRIES) {
            await supabase.from('messaging_campaign_recipients')
              .update({ status: 'failed', failed_at: new Date().toISOString() })
              .eq('id', recipient.id);
          }
          stats.messagesFailed++;
          console.error(`Failed to send to ${recipient.phone_number}:`, errorMessage);
        }

        await new Promise((res) => setTimeout(res, 100));
      }
    }

    return new Response(JSON.stringify({ success: true, message: 'Processing complete', stats, durationMs: Date.now() - startTime }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error in messaging processor:', error);
    return new Response(JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Unknown error', stats }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
}));
