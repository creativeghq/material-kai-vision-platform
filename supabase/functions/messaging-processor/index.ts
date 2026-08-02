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
import { sendDelayMs } from '../_shared/messaging-rate.ts';
import { withApiLogging } from '../_shared/api-logger.ts';
import { debitExternalServiceCredits } from '../_shared/credit-utils.ts';

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
        id, name, channel_type, messaging_template_id, messaging_channel_id, created_by,
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

      // T2-1 — the cron send path must enforce the same gates as messaging-api's `send`:
      const wsId: string | null = channel.workspace_id ?? null;
      const ownerId: string | null = campaign.created_by ?? null;
      // (a) entitlement/module: a workspace without the messaging add-on must not get free bulk delivery.
      if (wsId) {
        const { data: entitled } = await supabase.rpc('is_workspace_entitled', { p_workspace_id: wsId, p_module_slug: 'messaging' });
        if (entitled !== true) {
          await supabase.from('campaigns').update({ status: 'paused', metadata: { blocked_reason: 'not_entitled', blocked_message: 'The Messaging add-on is not active for this workspace.' } }).eq('id', campaign.id);
          continue;
        }
      }
      // (b) template validation: WhatsApp rejects a cold/marketing freeform send outside the 24h window —
      // a template row with no approved Meta template name would mark every recipient failed. Block early.
      if (!template.whatsapp_template_name) {
        await supabase.from('campaigns').update({ status: 'paused', metadata: { blocked_reason: 'template_not_approved', blocked_message: 'This campaign\'s template has no approved WhatsApp template name.' } }).eq('id', campaign.id);
        continue;
      }

      // Opt-outs (whatsapp + all) checked once per campaign
      const { data: optouts } = await supabase
        .from('messaging_optouts').select('phone_number')
        .or('channel_type.eq.whatsapp,channel_type.eq.all');
      const optedOut = new Set((optouts || []).map((o) => o.phone_number));

      // T2-5 — enforce the channel's CUMULATIVE daily send cap (was only a per-request size guard in
      // send-bulk; the cron blew past it unchecked). Count today's sends for this channel and cap this
      // tick's batch to what's left; if the cap is hit, skip the campaign until after midnight UTC.
      let batchLimit = BATCH_SIZE;
      if (channel.daily_quota && channel.daily_quota > 0) {
        const startOfDay = new Date(); startOfDay.setUTCHours(0, 0, 0, 0);
        const { count: sentToday } = await supabase
          .from('messaging_logs').select('id', { count: 'exact', head: true })
          .eq('channel_id', channel.id).gte('created_at', startOfDay.toISOString());
        const remaining = channel.daily_quota - (sentToday ?? 0);
        if (remaining <= 0) continue;
        batchLimit = Math.min(BATCH_SIZE, remaining);
      }

      const { data: pending } = await supabase
        .from('messaging_campaign_recipients').select('*')
        .eq('campaign_id', campaign.id).eq('status', 'pending')
        .lt('retry_count', MAX_RETRIES).limit(batchLimit);

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

        // T2-1 — debit the campaign owner BEFORE the send (invariant #10), mirroring messaging-api.
        // Out of credits → re-queue the recipient and pause the campaign so it resumes on top-up
        // (don't churn the whole list into 'failed'). No owner → skip metering (shouldn't happen).
        let debitedCredits = 0;
        if (ownerId) {
          const debit = await debitExternalServiceCredits(supabase, ownerId, 'zernio-whatsapp', 'messaging_campaign_whatsapp', 1, { to: recipient.phone_number });
          if (!debit.success) {
            await supabase.from('messaging_campaign_recipients').update({ status: 'pending' }).eq('id', recipient.id);
            await supabase.from('campaigns').update({ status: 'paused', metadata: { blocked_reason: 'insufficient_credits', blocked_message: 'Paused — the workspace owner is out of credits. Resumes automatically once credits are added.' } }).eq('id', campaign.id);
            break;
          }
          debitedCredits = debit.credits_debited ?? 1;
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

          // The error MUST be checked. Discarding it left `messageLog` undefined, and the very
          // next statement wrote status:'sent' with message_log_id: undefined — three cascading
          // losses from one silent failure: the message vanishes from the WhatsApp log; the
          // messaging_logs_analytics trigger never fires so messaging_analytics under-counts;
          // and the cumulative daily cap counts messaging_logs rows, so the channel's
          // daily_quota is silently exceeded. The receipt webhook cannot find the row either.
          // The WhatsApp send already SUCCEEDED here, so this throws into the per-recipient
          // catch below, which records the recipient as failed rather than silently 'sent'.
          const { data: messageLog, error: logErr } = await supabase.from('messaging_logs').insert({
            channel_type: 'whatsapp',
            workspace_id: channel.workspace_id, // Tenant scope
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
          if (logErr || !messageLog?.id) {
            throw new Error(`Message sent but its log row failed: ${logErr?.message ?? 'no row returned'}`);
          }

          await supabase.from('messaging_campaign_recipients').update({
            status: 'sent',
            sent_at: new Date().toISOString(),
            message_log_id: messageLog.id,
          }).eq('id', recipient.id);

          stats.messagesSent++;
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          // Refund the credit for this failed attempt — the next retry tick re-debits, so a message
          // is only ever billed for a send that actually left.
          if (ownerId && debitedCredits > 0) {
            await supabase.rpc('refund_credits', {
              p_user_id: ownerId, p_amount: debitedCredits, p_operation_type: 'messaging_campaign_whatsapp_refund',
              p_description: 'Refund: WhatsApp campaign send failed', p_metadata: { to: recipient.phone_number }, p_workspace_id: null,
            }).then(() => {}, () => {});
          }
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

        // Pace from the channel's configured rate, not a constant.
        await new Promise((res) => setTimeout(res, sendDelayMs(channel.max_send_rate)));
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
