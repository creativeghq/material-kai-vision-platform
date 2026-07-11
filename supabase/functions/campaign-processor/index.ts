/**
 * Campaign Processor Edge Function
 * Processes scheduled + sending EMAIL campaigns and dispatches to recipients via email-api.
 * Runs via cron every minute.
 *
 * #255 — this only handles `channel_type='email'` campaigns (WhatsApp/messaging campaigns are
 * driven by messaging-processor). Every send is workspace-scoped and BYOK-only:
 *   • passes `workspace_id` so email-api resolves the workspace's OWN Resend key + verified sender
 *     AND enforces the platform-controlled per-workspace daily cap (checkWorkspaceSendQuota).
 *   • passes `templateSlug` (resolved from campaign.template_id) + `subjectOverride` so email-api
 *     renders the template with variables while the campaign's subject_line wins.
 *   • passes `requireWorkspaceSender: true` → email-api 503s rather than falling back to the
 *     platform domain. A campaign whose workspace has no BYOK is short-circuited to `paused` with
 *     a `blocked_reason` (the UI surfaces "configure Resend") instead of burning every recipient.
 *
 * The previous version POSTed `{template_id, subject, variables}` (keys email-api doesn't read) and
 * never passed workspace_id — every campaign send errored and would have used the platform key.
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from '@supabase/supabase-js';
import { bootstrapForFunction } from '../_shared/secrets-bootstrap.ts';
import { withApiLogging } from '../_shared/api-logger.ts';
import { isCronAuthorized } from '../_shared/auth.ts';

const SEND_RATE_PER_MINUTE = 8; // ~500 per hour

// deno-lint-ignore no-explicit-any
type Any = any;

/** Can this workspace send marketing? BYOK configured (mirrors resolveWorkspaceEmailSender's
 *  `source === 'workspace'`) OR the operator ROOT workspace, which sends from the platform default
 *  sender (BYOK-only is a tenant rule; the operator is exempt — matches email-api's send gate). */
async function canWorkspaceSendMarketing(supabase: Any, workspaceId: string | null): Promise<boolean> {
  if (!workspaceId) return false;
  const [{ data: cfg }, { data: ws }] = await Promise.all([
    supabase.from('workspace_email_config').select('resend_api_key, from_email, enabled').eq('workspace_id', workspaceId).maybeSingle(),
    supabase.from('workspaces').select('is_root').eq('id', workspaceId).maybeSingle(),
  ]);
  const hasByok = !!(cfg && cfg.enabled !== false && (cfg.resend_api_key ?? '').trim() && (cfg.from_email ?? '').trim());
  return hasByok || ws?.is_root === true;
}

/** Mark a campaign as blocked (paused) with a reason, so the cron stops re-picking it and the UI
 *  can show a clear "configure Resend"/"template missing" state. */
async function blockCampaign(supabase: Any, campaign: Any, reason: string, message: string): Promise<void> {
  await supabase
    .from('campaigns')
    .update({
      status: 'paused',
      metadata: { ...(campaign.metadata || {}), blocked_reason: reason, blocked_message: message, blocked_at: new Date().toISOString() },
    })
    .eq('id', campaign.id);
  console.warn(`Campaign ${campaign.id} blocked (${reason}): ${message}`);
}

serve(withApiLogging('campaign-processor', async (req) => {
  await bootstrapForFunction();
  try {
    // Cron-only: accept the service-role bearer OR the shared x-cron-secret (the pattern the live
    // pg_cron schedule uses — see isCronAuthorized). Rejects everything else.
    if (!isCronAuthorized(req)) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log('Campaign processor started');

    // 1. Start scheduled EMAIL campaigns whose time has come.
    const now = new Date().toISOString();
    const { data: scheduledCampaigns, error: scheduledError } = await supabase
      .from('campaigns')
      .select('*')
      .eq('channel_type', 'email')
      .eq('status', 'scheduled')
      .lte('scheduled_at', now);

    if (scheduledError) throw scheduledError;

    for (const campaign of scheduledCampaigns || []) {
      await supabase.from('campaigns').update({ status: 'sending' }).eq('id', campaign.id);
      console.log(`Started campaign: ${campaign.id}`);
    }

    // 2. Process EMAIL campaigns that are currently sending.
    const { data: sendingCampaigns, error: sendingError } = await supabase
      .from('campaigns')
      .select('*')
      .eq('channel_type', 'email')
      .eq('status', 'sending');

    if (sendingError) throw sendingError;

    let totalProcessed = 0;
    // Per-WORKSPACE send budget for this tick. Sends go through each tenant's own BYOK Resend, so the
    // rate that matters is per-Resend-account: cap total sends per workspace this tick (was applied
    // per-campaign, so N concurrent campaigns in one workspace sent N× the intended rate).
    const wsSendBudget = new Map<string, number>();

    for (const campaign of sendingCampaigns || []) {
      // Server-side paywall: email-marketing is a paid add-on. The route/UI is entitlement-gated on
      // the client, but the cron must enforce it too — otherwise a workspace with an operator + BYOK
      // could drive sends without owning the module. Skip (don't burn recipients) if not entitled.
      if (campaign.workspace_id) {
        const { data: entitled } = await supabase.rpc('is_workspace_entitled', {
          p_workspace_id: campaign.workspace_id, p_module_slug: 'email-marketing',
        });
        if (entitled !== true) {
          await blockCampaign(
            supabase, campaign, 'not_entitled',
            'The Email Marketing add-on is not active for this workspace.',
          );
          continue;
        }
      }

      // BYOK is mandatory for tenant marketing (root/operator sends via platform). Short-circuit
      // before touching recipients so a mis-configured workspace doesn't churn the list into `failed`.
      if (!(await canWorkspaceSendMarketing(supabase, campaign.workspace_id))) {
        await blockCampaign(
          supabase, campaign, 'workspace_sender_required',
          'Configure your workspace Resend account (API key + verified sender) to send this campaign.',
        );
        continue;
      }

      // Resolve the template slug once per campaign (email-api sends by slug).
      if (!campaign.template_id) {
        await blockCampaign(supabase, campaign, 'template_missing', 'This campaign has no email template selected.');
        continue;
      }
      const { data: template } = await supabase
        .from('email_templates')
        .select('slug, is_active, workspace_id')
        .eq('id', campaign.template_id)
        .maybeSingle();
      if (!template?.slug || template.is_active === false) {
        await blockCampaign(supabase, campaign, 'template_missing', 'The campaign template is missing or inactive.');
        continue;
      }
      // The template must belong to the campaign's workspace (defense against a forged template_id
      // pointing at another tenant's template).
      if (template.workspace_id && template.workspace_id !== campaign.workspace_id) {
        await blockCampaign(supabase, campaign, 'template_missing', 'The campaign template does not belong to this workspace.');
        continue;
      }

      // Get the next batch of pending recipients, bounded by this workspace's remaining send budget
      // for the tick (shared across all of the workspace's campaigns). 0 → skip; it resumes next tick.
      const wid = campaign.workspace_id ?? 'no-ws';
      const wsRemaining = wsSendBudget.get(wid) ?? SEND_RATE_PER_MINUTE;
      if (wsRemaining <= 0) continue;
      const { data: recipients, error: recipientsError } = await supabase
        .from('campaign_recipients')
        .select('*')
        .eq('campaign_id', campaign.id)
        .eq('status', 'pending')
        .limit(wsRemaining);

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
            ...(failedCount ? { metadata: { ...(campaign.metadata || {}), failed_recipients: failedCount } } : {}),
          })
          .eq('id', campaign.id);

        console.log(`Completed campaign: ${campaign.id} (${finalStatus}, ${failedCount ?? 0} failed)`);
        continue;
      }

      for (const recipient of recipients) {
        try {
          await supabase.from('campaign_recipients').update({ status: 'sending' }).eq('id', recipient.id);

          // Merge recipient-level variables with the always-available identity tags the templates
          // reference ({{firstName}}, {{fullName}}, {{email}}). Recipient-supplied variables win.
          const rv = (recipient.variables && typeof recipient.variables === 'object') ? recipient.variables : {};
          const variables: Record<string, string> = {
            email: recipient.email,
            firstName: rv.firstName || rv.first_name || '',
            lastName: rv.lastName || rv.last_name || '',
            fullName: rv.fullName || rv.full_name || rv.name || recipient.email,
            ...rv,
          };

          const emailResponse = await fetch(`${supabaseUrl}/functions/v1/email-api`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${supabaseKey}`,
            },
            body: JSON.stringify({
              action: 'send',
              to: recipient.email,
              templateSlug: template.slug,
              subjectOverride: campaign.subject_line || undefined,
              variables,
              emailType: 'marketing',
              workspace_id: campaign.workspace_id,
              requireWorkspaceSender: true,
              tags: {
                feature: 'email_marketing',
                campaign_id: campaign.id,
                recipient_id: recipient.id,
              },
            }),
          });

          const result = await emailResponse.json().catch(() => ({}));

          if (emailResponse.ok && result?.success) {
            await supabase
              .from('campaign_recipients')
              .update({ status: 'sent', sent_at: new Date().toISOString(), email_log_id: result.logId ?? null })
              .eq('id', recipient.id);
            totalProcessed++;
          } else if (emailResponse.status === 503 && result?.code === 'workspace_sender_required') {
            // BYOK disappeared mid-run (key removed/disabled). Re-queue this recipient and block the
            // whole campaign rather than marking recipients failed.
            await supabase.from('campaign_recipients').update({ status: 'pending' }).eq('id', recipient.id);
            await blockCampaign(
              supabase, campaign, 'workspace_sender_required',
              'Configure your workspace Resend account (API key + verified sender) to send this campaign.',
            );
            break;
          } else if (emailResponse.status === 429 && result?.code === 'workspace_email_quota_exceeded') {
            // Daily cap hit — re-queue and stop this campaign's batch; the cron retries tomorrow.
            await supabase.from('campaign_recipients').update({ status: 'pending' }).eq('id', recipient.id);
            console.log(`Campaign ${campaign.id} hit daily send cap; will resume when the cap resets.`);
            break;
          } else {
            throw new Error(result?.error || `Email API error: ${emailResponse.status}`);
          }
        } catch (error) {
          console.error(`Error sending to ${recipient.email}:`, error);
          await supabase
            .from('campaign_recipients')
            .update({
              status: 'failed',
              error_message: error instanceof Error ? error.message : String(error),
              retry_count: (recipient.retry_count || 0) + 1,
            })
            .eq('id', recipient.id);
        }
      }
      // Charge this batch against the workspace's per-tick budget so its other campaigns share it.
      wsSendBudget.set(wid, wsRemaining - recipients.length);
    }

    console.log(`Campaign processor completed. Processed ${totalProcessed} emails.`);

    return new Response(
      JSON.stringify({
        success: true,
        processed: totalProcessed,
        scheduledCampaigns: scheduledCampaigns?.length || 0,
        sendingCampaigns: sendingCampaigns?.length || 0,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  } catch (error) {
    console.error('Campaign processor error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : String(error) }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    );
  }
}));
