/**
 * Campaign Processor Edge Function
 * Processes scheduled + sending EMAIL campaigns and dispatches to recipients via email-api.
 * Runs via cron every minute.
 *
 * This only handles `channel_type='email'` campaigns (WhatsApp/messaging campaigns are
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
import { chargeCronWorkspace } from '../_shared/cron-billing.ts';
import { emitFlowEvent } from '../_shared/flow-events.ts';
// One answer to "may this workspace send" (#357 AE-1).
import { resolveWorkspaceEmailSender } from '../_shared/email-sender.ts';

const SEND_RATE_PER_MINUTE = 8; // ~500 per hour

// deno-lint-ignore no-explicit-any
type Any = any;

/** Can this workspace send marketing? BYOK configured (mirrors resolveWorkspaceEmailSender's
 *  `source === 'workspace'`) OR the operator ROOT workspace, which sends from the platform default
 *  sender (BYOK-only is a tenant rule; the operator is exempt — matches email-api's send gate). */
async function canWorkspaceSendMarketing(supabase: Any, workspaceId: string | null): Promise<boolean> {
  if (!workspaceId) return false;
  // ASK THE RESOLVER (#357 AE-1). This was a hand-written copy of "BYOK complete, or the
  // operator's root workspace" — the fourth of five. `unconfigured` is precisely that rule's
  // negative, and having it in one place is what stops a campaign blocking on a condition the
  // send path would have allowed (or worse, the reverse).
  const sender = await resolveWorkspaceEmailSender(supabase, workspaceId);
  return sender.source !== 'unconfigured';
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

      // Credit metering: charge the workspace owner ONCE per campaign (one unit of work), guarded so
      // the many ticks a large send spans never double-charge. Out of credits → skip this tick and
      // leave the campaign 'sending' with a blocked_reason; the next tick re-charges and auto-resumes
      // the moment the owner tops up.
      if (!campaign.metadata?.credit_charged) {
        const gate = await chargeCronWorkspace(supabase, campaign.workspace_id, 'email-campaign', { description: `Email campaign: ${campaign.name}` });
        if (!gate.allowed) {
          await supabase.from('campaigns').update({
            metadata: { ...(campaign.metadata || {}), blocked_reason: 'insufficient_credits', blocked_message: 'Paused — the workspace owner is out of credits. Sending resumes automatically once credits are added.', blocked_at: new Date().toISOString() },
          }).eq('id', campaign.id);
          console.log(`Campaign ${campaign.id} skipped: insufficient credits (auto-resumes on top-up).`);
          continue;
        }
        campaign.metadata = { ...(campaign.metadata || {}), credit_charged: true };
        await supabase.from('campaigns').update({
          metadata: { ...campaign.metadata, credit_charged_at: new Date().toISOString(), blocked_reason: null },
        }).eq('id', campaign.id);
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
        /**
         * A campaign is not finished while rows are still IN FLIGHT (#357 AE-4).
         *
         * "No pending recipients" was the whole completion test, and a row claimed by another
         * worker is `sending`, not `pending` — so a second concurrent run saw an empty pending
         * set, declared the campaign `sent`, and fired the `campaign_sent` flow while the first
         * run was still delivering. The owner is told it finished, with a count that is short.
         */
        const { count: inFlight } = await supabase
          .from('campaign_recipients')
          .select('id', { count: 'exact', head: true })
          .eq('campaign_id', campaign.id)
          .eq('status', 'sending');
        if ((inFlight ?? 0) > 0) {
          console.log(`Campaign ${campaign.id}: ${inFlight} recipient(s) still sending — not completing yet.`);
          continue;
        }

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
        // Flows — the campaign finished sending. Fires once (this block only runs when no
        // pending recipients remain). Best-effort; never block the completion.
        try {
          const { count: sentCount } = await supabase
            .from('campaign_recipients')
            .select('id', { count: 'exact', head: true })
            .eq('campaign_id', campaign.id)
            .eq('status', 'sent');
          // Notify the campaign owner that their send finished. create_notification
          // needs a concrete user_id, so resolve the creator (skip if absent).
          const { data: campOwner } = await supabase
            .from('campaigns').select('created_by').eq('id', campaign.id).maybeSingle();
          const campCreatorId = (campOwner as { created_by?: string } | null)?.created_by ?? campaign.created_by ?? null;
          if (campCreatorId) {
            await emitFlowEvent('campaign_sent', {
              user_id: campCreatorId,
              type: 'campaign_sent',
              workspace_id: campaign.workspace_id,
              campaign_id: campaign.id,
              campaign_name: campaign.name,
              status: finalStatus,
              sent_count: sentCount ?? 0,
              failed_count: failedCount ?? 0,
              title: `Campaign sent: ${campaign.name}`,
              body: `"${campaign.name}" finished sending — ${sentCount ?? 0} delivered${failedCount ? `, ${failedCount} failed` : ''}.`,
              action_url: '/marketing/email?tab=campaigns',
            });
          }
        } catch { /* best-effort */ }
        continue;
      }

      for (const recipient of recipients) {
        try {
          /**
           * CLAIM THE ROW, do not merely mark it (#357 AE-4).
           *
           * This was an unconditional `update({status:'sending'}).eq('id', …)` after a plain
           * SELECT of pending rows. Two concurrent runs — a retry, an overlapping cron tick,
           * a manual trigger — both read the same pending set, both wrote 'sending', and both
           * sent. The recipient gets the campaign twice, which for marketing mail is a
           * compliance problem and not merely untidy.
           *
           * `.eq('status', 'pending')` makes the UPDATE itself the claim: Postgres applies it
           * to at most one worker, and the loser gets no row back and skips. Same shape as
           * `receive_order_into_warehouse` (#355), which makes a repeat receive a no-op by
           * construction rather than by hoping the caller does not retry.
           */
          const { data: claimed, error: claimErr } = await supabase
            .from('campaign_recipients')
            .update({ status: 'sending' })
            .eq('id', recipient.id)
            .eq('status', 'pending')
            .select('id')
            .maybeSingle();
          if (claimErr) {
            console.error(`[campaign-processor] claim failed for recipient ${recipient.id}:`, claimErr.message);
            continue;
          }
          // No row: another worker claimed it between our SELECT and this UPDATE.
          if (!claimed) continue;

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
              previewText: campaign.preview_text || undefined,
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
          } else if (result?.suppressed || result?.code === 'recipient_unsubscribed') {
            // Recipient opted out of this workspace's marketing (Email#1). Terminal, not a failure —
            // mark it so it drops out of the pending queue and the campaign completes cleanly.
            await supabase
              .from('campaign_recipients')
              .update({ status: 'unsubscribed', error_message: 'Recipient unsubscribed' })
              .eq('id', recipient.id);
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
          } else if (emailResponse.status === 429) {
            /**
             * ANY other 429 — a provider throttle, an upstream Resend limit (#357 AE-16).
             *
             * Only the daily-cap code above was treated as retryable; every other 429 fell to
             * the `throw` below and the catch marked the recipient FAILED. Failed is terminal:
             * it drops out of the pending queue for good, so transient throttling permanently
             * removed people from a campaign they were meant to receive — and the campaign then
             * completed as `partial_failure` with a count that looks like bad addresses.
             *
             * Re-queued and the batch stops, rather than continuing to hammer something that
             * has just asked us to slow down. The cron picks it up on the next tick.
             */
            await supabase.from('campaign_recipients').update({ status: 'pending' }).eq('id', recipient.id);
            console.warn(
              `[campaign-processor] campaign ${campaign.id} throttled (429 ${result?.code ?? 'no code'}) — `
              + 'recipient re-queued, batch paused until the next tick.',
            );
            break;
          } else if (emailResponse.status >= 500) {
            // Upstream is unwell, not the address. Same reasoning as the 429: a 502 from the
            // provider is not evidence that this recipient can never be mailed. Re-queue and move
            // on — the batch is bounded by the send budget, so this cannot spin.
            await supabase.from('campaign_recipients').update({ status: 'pending' }).eq('id', recipient.id);
            console.warn(
              `[campaign-processor] campaign ${campaign.id} upstream ${emailResponse.status} for `
              + `recipient ${recipient.id} — re-queued.`,
            );
          } else {
            // A 4xx that is not a throttle IS about this recipient — a malformed address, a
            // rejected payload. Terminal, and correctly so.
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
