/**
 * Messaging API Edge Function — WhatsApp via Zernio (Meta Cloud API).
 *
 * Replaces the former Twilio SMS+WhatsApp implementation. SMS is gone; WhatsApp
 * now runs on Zernio's official WhatsApp Cloud API wrapper.
 *
 * A "channel" is a connected Zernio WhatsApp account (a WABA phone number).
 * `messaging_channels.zernio_account_id` holds the Zernio accountId; the WABA
 * id / phone-number id / display number live in `config`.
 *
 * @see https://docs.zernio.com — /v1/connect/whatsapp/*, /v1/inbox/*, /v1/whatsapp/*
 *
 * Authentication: secret key (apikey header) = admin; user JWT = user-scoped.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { jsonResponse } from '../_shared/http.ts';
import { corsHeaders } from '../_shared/cors.ts';
import { debitExternalServiceCredits } from '../_shared/credit-utils.ts';
import { authenticate, isAdminAccess, listUserWorkspaceIds } from '../_shared/auth.ts';
import { isWorkspaceEntitled, notEntitledResponse } from '../_shared/entitlement.ts';
import { withApiLogging, HttpError } from '../_shared/api-logger.ts';
import { notConfiguredResponse } from '../_shared/api-provider-errors.ts';
import { sendDelayMs } from '../_shared/messaging-rate.ts';
import { isFixtureWorkspace } from '../_shared/fixture-guard.ts';
import { priceWhatsAppMessage } from '../_shared/whatsapp-rates.ts';
import { checkChannelSeat } from '../_shared/channel-seats.ts';
import { reconcileWaba } from '../_shared/whatsapp-cost-reconcile.ts';
import { billChannelsForMonth } from '../_shared/channel-recurring-billing.ts';
import {
  zernioApi,
  zernioKey,
  ensureZernioSecrets,
  fetchZernioAccount,
  ensureZernioWebhook,
  getZernioWebhookStatus,
  getZernioPlan,
  signZernioBody,
  publicAppUrl,
  resolveWorkspaceProfile,
  sendWhatsAppMessage,
} from '../_shared/zernio.ts';
import {
  searchAvailablePhoneNumbers,
  listPhoneNumbers,
  purchasePhoneNumber,
  releasePhoneNumber,
  assertOwnProfile,
} from '../_shared/zernio-phone-numbers.ts';

interface SendMessageRequest {
  to: string | string[];
  from?: string;          // channel sender_id (display number) to send from
  content?: string;       // freeform body (only valid inside the 24h window)
  templateId?: string;    // messaging_templates.id
  templateVariables?: Record<string, string>;
  messageType?: 'transactional' | 'marketing' | 'otp' | 'notification';
}

interface SendBulkRequest extends Omit<SendMessageRequest, 'to'> {
  recipients: Array<{ to: string; variables?: Record<string, string> }>;
}


function normalizePhoneNumber(phone: string): string {
  let n = (phone || '').replace(/[^\d+]/g, '');
  if (!n.startsWith('+')) n = '+' + n;
  return n;
}

/** Best-effort refund of a pre-charged WhatsApp credit when the send fails (invariant #10). */
async function refundWhatsAppCredits(
  supabaseClient: SupabaseClient<any, 'public', 'public', any, any>,
  userId: string,
  credits: number,
  to: string,
): Promise<void> {
  if (!(credits > 0)) return;
  await supabaseClient.rpc('refund_credits', {
    p_user_id: userId,
    p_amount: credits,
    p_operation_type: 'messaging_whatsapp_refund',
    p_description: 'Refund: WhatsApp send failed',
    p_metadata: { to },
    p_workspace_id: null,
  }).then(() => {}, () => {});
}

function renderTemplate(content: string, variables: Record<string, string>): string {
  let out = content || '';
  for (const [k, v] of Object.entries(variables || {})) {
    out = out.replace(new RegExp(`{{${k}}}`, 'g'), v ?? '');
  }
  return out;
}

/** Build ordered WhatsApp template body params from the template's declared variable order. */
function orderedTemplateParams(template: any, variables: Record<string, string>): string[] {
  const names: string[] = Array.isArray(template?.variables) ? template.variables : [];
  return names.map((name) => String(variables?.[name] ?? ''));
}

/**
 * Resolve a WhatsApp channel by sender_id, else the default active one — WITHIN the
 * caller's workspaces.
 *
 * SECURITY: this had no workspace predicate at all. It runs on the
 * service-role client, so RLS does not apply, and it returned the globally-first default
 * channel — or, with `from`, ANY channel matching that sender_id. `send` then derived
 * `tenantWsId` from the RESOLVED channel and gated entitlement on that, so the tenancy
 * check validated the victim rather than the caller: a workspace-A operator could send
 * from workspace B's WABA number, on B's Zernio quota and B's Meta reputation, with
 * messaging_logs recording it under B.
 *
 * `workspaceIds` is REQUIRED and must be passed explicitly — `null` means "no scope"
 * (admin/service access only). Making it a required parameter rather than an optional one
 * is deliberate: the original bug was an omission, and an optional argument would let the
 * next caller reintroduce it silently.
 */
async function resolveChannel(supabase: any, workspaceIds: string[] | null, from?: string) {
  // Scoped caller with no workspaces: nothing is resolvable. Return null rather than
  // falling through to an unscoped query.
  if (workspaceIds && workspaceIds.length === 0) return null;

  let query = supabase
    .from('messaging_channels')
    .select('*')
    .eq('channel_type', 'whatsapp');

  if (from) {
    query = query.eq('sender_id', from);
  } else {
    query = query.eq('is_default', true).eq('is_active', true);
  }
  if (workspaceIds) query = query.in('workspace_id', workspaceIds);

  // `maybeSingle` ERRORS when more than one row matches (e.g. two channels both flagged
  // default — nothing enforces one per type). Take the first deterministically instead, so
  // a misconfiguration degrades to "picked one" rather than "no WhatsApp channel
  // configured", which sends the admin looking for the opposite of the real problem.
  const { data, error } = await query.order('created_at', { ascending: true }).limit(1);
  if (error) {
    console.error('[messaging-api] resolveChannel failed:', error.message);
    return null;
  }
  return data?.[0] ?? null;
}


/**
 * Whether a template-less send may go out as a Meta Direct Send UTILITY message.
 *
 * WhatsApp refuses a business-initiated message outside the 24h service window unless it uses
 * an approved template. Before Direct Send existed, a send with no template bound simply
 * failed at Meta for every cold recipient — the operator saw a provider error and had no way
 * to act on it except to go and get a template approved (up to 24h).
 *
 * `category: 'utility'` lifts that for UTILITY content: Meta matches or auto-creates the
 * template asynchronously. It is NOT a way around marketing rules — marketing content under
 * this category is rejected — so a marketing send still requires its approved template, and
 * asking for one here would swap a clear Meta rejection for a confusing one.
 */
function directSendCategory(
  template: { whatsapp_template_name?: string | null } | null | undefined,
  messageType: string | undefined,
): 'utility' | undefined {
  if (template?.whatsapp_template_name) return undefined;   // a template wins; both is a 400
  if (messageType === 'marketing') return undefined;        // not allowed under utility
  return 'utility';
}

/**
 * Insert-or-update the messaging_channels row for a connected Zernio WhatsApp account.
 * Shared by both connect paths (OAuth redirect and headless credentials) so the two can
 * never drift into writing differently-shaped channels.
 */
async function upsertWhatsAppChannel(
  supabaseClient: SupabaseClient<any, 'public', 'public', any, any>,
  params: {
    workspaceId: string;
    accountId: string;
    profileId: string;
    senderId: string;
    displayName?: string;
    wabaId?: string | null;
    phoneNumberId?: string | null;
  },
): Promise<any> {
  const config = {
    zernio_account_id: params.accountId,
    waba_id: params.wabaId ?? null,
    phone_number_id: params.phoneNumberId ?? null,
    display_phone_number: params.senderId,
    profile_id: params.profileId,
  };

  // Insert or update by zernio_account_id (no reliance on a composite unique constraint).
  const { data: existing } = await supabaseClient
    .from('messaging_channels').select('id')
    .eq('zernio_account_id', params.accountId).maybeSingle();

  if (existing) {
    const { data, error } = await supabaseClient
      .from('messaging_channels')
      .update({
        // workspace_id is set on INSERT and was left alone here, so a channel row that predates
        // the column — or one reconnected from a different workspace — kept a stale/NULL owner,
        // and the webhook resolver reads exactly this column to route inbound messages.
        workspace_id: params.workspaceId,
        sender_id: params.senderId,
        display_name: params.displayName || params.senderId,
        is_active: true,
        provider: 'zernio',
        config,
        updated_at: new Date().toISOString(),
      })
      .eq('id', existing.id).select().single();
    if (error) throw error;
    return data;
  }

  const { count } = await supabaseClient
    .from('messaging_channels')
    .select('*', { count: 'exact', head: true })
    .eq('channel_type', 'whatsapp');
  const { data, error } = await supabaseClient
    .from('messaging_channels')
    .insert({
      workspace_id: params.workspaceId, // Bind the channel to the caller's workspace
      channel_type: 'whatsapp',
      provider: 'zernio',
      sender_id: params.senderId,
      zernio_account_id: params.accountId,
      display_name: params.displayName || params.senderId,
      is_active: true,
      is_default: (count || 0) === 0,
      daily_quota: 10000,
      max_send_rate: 100,
      config,
    })
    .select().single();
  if (error) throw error;
  return data;
}

Deno.serve(withApiLogging('messaging-api', async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    const auth = await authenticate(req);
    if (!auth.success) throw new HttpError(401, auth.error || 'Unauthorized');
    const user = auth.user;
    // Service-role / secret-key callers (e.g. the Flows send_whatsapp action via flow-engine) have NO
    // user — `user.id` would crash and every WhatsApp automation would 500. Use a null-safe billing id:
    // when there's no user, skip the internal per-recipient debit (the flow-engine already debited for
    // that path — debiting here too would double-charge). A real session/partner caller still debits.
    const billingUserId: string | null = auth.userId ?? user?.id ?? null;

    // Zernio is the engine for every WhatsApp action. Resolve the key through the platform
    // resolver FIRST (env → platform_secrets) — reading Deno.env alone made the admin-facing
    // settings path in the 503 below a dead end. Then fail with a clean 503 when it is absent.
    await ensureZernioSecrets(supabaseClient);
    if (!zernioKey()) {
      return notConfiguredResponse(
        {
          provider: 'Zernio',
          envVarHint: 'Set ZERNIO_API_KEY on the host, or paste it',
          settingsPath: '/admin/modules/messaging/settings → Keys',
        },
        corsHeaders,
      );
    }

    let requestBody: any = {};
    if (req.method === 'POST') {
      try {
        requestBody = await req.json();
      } catch {
        throw new HttpError(400, 'Invalid JSON body');
      }
    }
    const action = requestBody.action;

    // Messaging is a platform-global feature (channels are not per-workspace) that
    // spends the platform's WhatsApp credits and edits connection config. Gate the
    // credit-spending / config-mutating actions to platform operators; reads stay
    // open to any authenticated user.
    const OPERATOR_ACTIONS = new Set([
      'send', 'send-bulk', 'connect-whatsapp', 'connect-whatsapp-oauth',
      'connect-whatsapp-callback', 'sync-channels', 'update-settings',
      'register-webhook', 'create-whatsapp-template', 'backfill-inbox',
      // Buying a number puts a recurring charge on the OPERATOR's Zernio/Stripe subscription and
      // releasing one cancels it (and disconnects the WhatsApp account on it). Those are the
      // platform's money and the platform's lifecycle, so they sit with the other operator
      // actions. Searching availability and listing what a workspace already has are reads.
      'purchase-phone-number', 'release-phone-number',
      // Operator maintenance: both read or repair platform-level billing state.
      'reconcile-phone-numbers', 'reconcile-whatsapp-costs', 'set-whatsapp-rate',
      'bill-channels-monthly', 'set-channel-seats',
    ]);
    if (OPERATOR_ACTIONS.has(action) && !isAdminAccess(auth)) {
      const op = await authenticate(req, { allowedRoles: ['admin', 'super_admin', 'owner'] });
      if (!op.success) return jsonResponse({ error: 'Operator role required for this action' }, 403);
    }

    // Entitlement: WhatsApp is a paid ('messaging') feature. Gate the credit-spending /
    // config-mutating actions on the TARGET workspace's entitlement (operator root bypasses inside
    // isWorkspaceEntitled). Skips when no workspace is resolvable so the action's own guards + RLS
    // still apply — never fail-closed on a null workspace and break a legit send.
    const requireMessaging = async (wsId: string | null | undefined): Promise<Response | null> => {
      if (!OPERATOR_ACTIONS.has(action) || isAdminAccess(auth) || !wsId) return null;
      return (await isWorkspaceEntitled(supabaseClient, wsId, 'messaging')) ? null : notEntitledResponse('messaging');
    };

    // ── Caller workspace resolution ───────────────────────────────────────────
    // AuthResult carries NO `workspace_id` field — every `auth.workspace_id` in this
    // file read `undefined`, which silently disabled the #250 B6/C27 tenancy binding
    // (channels inserted with a NULL workspace) and made the channels/logs/analytics
    // reads return empty forever. Derive it from active membership instead.
    let _callerWsIds: string[] | null = null;
    const callerWorkspaceIds = async (): Promise<string[]> => {
      if (!_callerWsIds) _callerWsIds = await listUserWorkspaceIds(supabaseClient, auth.userId);
      return _callerWsIds;
    };

    /**
     * The single workspace to bind/gate an action against.
     *
     * An explicit id must be one the caller is an ACTIVE member of — strict membership,
     * NOT `userCanAccessWorkspace`, because that grants global admin/super_admin and would
     * reopen exactly the hole that was closed: operator-of-A attaching an account to workspace-B.
     * With no explicit id, only an unambiguous single membership is used; ambiguous (or none)
     * returns null so the caller decides whether that is fatal.
     */
    const resolveTargetWorkspaceId = async (explicit?: string | null): Promise<string | null> => {
      if (explicit) {
        if (isAdminAccess(auth)) return explicit;
        const ids = await callerWorkspaceIds();
        if (!ids.includes(explicit)) throw new HttpError(403, 'Not a member of the target workspace');
        return explicit;
      }
      const ids = await callerWorkspaceIds();
      return ids.length === 1 ? ids[0] : null;
    };

    /** Workspace ids a read action may see: null = unrestricted (platform secret-key caller). */
    const readScopeWorkspaceIds = async (): Promise<string[] | null> =>
      isAdminAccess(auth) ? null : await callerWorkspaceIds();

    switch (action) {
      // ─────────────────────────────────────────────────────────────
      // Send single message (1+ recipients)
      // ─────────────────────────────────────────────────────────────
      case 'send': {
        const body: SendMessageRequest = requestBody;
        const channel = await resolveChannel(supabaseClient, await readScopeWorkspaceIds(), body.from);
        if (!channel) throw new Error('No WhatsApp channel configured. Connect a WhatsApp number first.');
        if (!channel.zernio_account_id) throw new Error('Channel is not linked to a Zernio account.');
        const tenantWsId = channel.workspace_id ?? (await resolveTargetWorkspaceId());
        { const gate = await requireMessaging(tenantWsId); if (gate) return gate; }

        let template: any = null;
        if (body.templateId) {
          const { data } = await supabaseClient
            .from('messaging_templates').select('*').eq('id', body.templateId).maybeSingle();
          template = data;
        }

        const recipients = Array.isArray(body.to) ? body.to : [body.to];
        const results: any[] = [];

        for (const raw of recipients) {
          const to = normalizePhoneNumber(raw);

          // Debit BEFORE the WhatsApp send (invariant #10 — fail-closed). A caller with no
          // credits is blocked before the message is delivered; the charge is refunded if the
          // send itself fails. Per-recipient debit keeps accounting exact. Skipped for service-role
          // callers (no billingUserId) — that path is billed upstream by the flow-engine.
          let debit: { success: boolean; credits_debited?: number; error?: string } = { success: true, credits_debited: 0 };
          if (billingUserId) {
            // A template opens a paid Meta conversation priced by the recipient's country and the
            // template's category; a free-form reply inside the 24h window costs nothing at all.
            // One flat rate across both under-charged the first by roughly 10x and over-charged
            // the second by infinity, and neither showed up as anything but a plausible number.
            const priced = await priceWhatsAppMessage(supabaseClient, {
              to,
              isTemplate: Boolean(template),
              category: template?.category ?? null,
            });
            debit = await debitExternalServiceCredits(
              supabaseClient, billingUserId, priced.serviceKey, 'messaging_whatsapp', 1,
              {
                to,
                template_id: body.templateId ?? null,
                rate_country: priced.country,
                rate_category: priced.category,
                // Surfaced because the wildcard is the EXPENSIVE row: a country appearing here
                // often is one whose real rate is worth adding to whatsapp_template_rates.
                rate_wildcard: priced.usedWildcard,
              },
              tenantWsId,
              {},
              priced.costPerUnit,
            );
            if (!debit.success) {
              results.push({ to, success: false, error: debit.error || 'Insufficient credits' });
              continue;
            }
          }

          // Fixture tenants never reach a provider. The integration suite runs against
          // PRODUCTION, and one test already produced 134 attempted sends. (#292 item 1)
          if (await isFixtureWorkspace(supabaseClient, tenantWsId)) {
            results.push({ to, success: true, skipped: 'fixture_workspace' });
            continue;
          }

          let result: any;
          try {
            result = await sendWhatsAppMessage({
              accountId: channel.zernio_account_id,
              to,
              message: template
                ? renderTemplate(template.content, body.templateVariables || {})
                : body.content,
              templateName: template?.whatsapp_template_name || undefined,
              templateLanguage: template?.whatsapp_language_code || undefined,
              templateParams: template ? orderedTemplateParams(template, body.templateVariables || {}) : undefined,
              category: directSendCategory(template, body.messageType),
            });
          } catch (sendErr) {
            if (billingUserId && debit.credits_debited) await refundWhatsAppCredits(supabaseClient, billingUserId, debit.credits_debited, to);
            results.push({ to, success: false, error: sendErr instanceof Error ? sendErr.message : String(sendErr) });
            continue;
          }
          results.push({ to, ...result });

          if (result.success) {
            // The message is already sent, so this must not throw — but the row is the only
            // billing and audit trace of it, and discarding the result made a lost one
            // invisible (#347 audit).
            const { error: logErr } = await supabaseClient.from('messaging_logs').insert({
              created_by: billingUserId,
              workspace_id: tenantWsId, // Tenant scope
              channel_id: channel.id,
              channel_type: 'whatsapp',
              template_id: template?.id ?? null,
              from_number: channel.sender_id,
              to_number: to,
              content: (template ? renderTemplate(template.content, body.templateVariables || {}) : body.content || '').substring(0, 500),
              message_type: body.messageType || 'transactional',
              provider_message_id: result.messageId,
              status: 'sent',
              sent_at: new Date().toISOString(),
            });
            if (logErr) console.error('[messaging-api] message sent but messaging_logs row FAILED', to, logErr);
          } else {
            // Send returned a soft failure — refund the pre-charged credit (only if we debited).
            if (billingUserId && debit.credits_debited) await refundWhatsAppCredits(supabaseClient, billingUserId, debit.credits_debited, to);
          }
        }

        const sent = results.filter((r) => r.success).length;
        return jsonResponse({ success: sent === results.length, sent, failed: results.length - sent, results, messageId: results[0]?.messageId });
      }

      // ─────────────────────────────────────────────────────────────
      // Send bulk
      // ─────────────────────────────────────────────────────────────
      case 'send-bulk': {
        const body: SendBulkRequest = requestBody;
        if (!body.recipients?.length) throw new Error('Recipients are required');

        const channel = await resolveChannel(supabaseClient, await readScopeWorkspaceIds(), body.from);
        if (!channel) throw new Error('No WhatsApp channel configured');
        if (!channel.zernio_account_id) throw new Error('Channel is not linked to a Zernio account.');
        const tenantWsId = channel.workspace_id ?? (await resolveTargetWorkspaceId());
        { const gate = await requireMessaging(tenantWsId); if (gate) return gate; }
        // Cumulative daily cap: count what the channel already sent TODAY, not just this request's
        // size, so many small requests can't blow past the quota.
        if (channel.daily_quota && channel.daily_quota > 0) {
          const startOfDay = new Date(); startOfDay.setUTCHours(0, 0, 0, 0);
          const { count: sentToday } = await supabaseClient
            .from('messaging_logs').select('id', { count: 'exact', head: true })
            .eq('channel_id', channel.id).gte('created_at', startOfDay.toISOString());
          if ((sentToday ?? 0) + body.recipients.length > channel.daily_quota) {
            throw new HttpError(429, `Channel daily quota reached (${sentToday ?? 0}/${channel.daily_quota} sent today; this request is ${body.recipients.length}).`);
          }
        }

        let template: any = null;
        if (body.templateId) {
          const { data } = await supabaseClient
            .from('messaging_templates').select('*').eq('id', body.templateId).maybeSingle();
          template = data;
        }

        const results: any[] = [];
        for (const r of body.recipients) {
          const to = normalizePhoneNumber(r.to);
          const vars = r.variables || {};

          // Debit BEFORE each send (invariant #10 — fail-closed). Out-of-credits stops the
          // blast before delivery; per-recipient debit keeps bulk accounting exact and each
          // charge is refunded if its send fails. Skipped for service-role callers (billed upstream).
          let debit: { success: boolean; credits_debited?: number; error?: string } = { success: true, credits_debited: 0 };
          if (billingUserId) {
            // Same split as the single send: bulk is almost always templated, and a template is
            // a paid Meta conversation whose rate depends on the recipient's country.
            const priced = await priceWhatsAppMessage(supabaseClient, {
              to,
              isTemplate: Boolean(template),
              category: template?.category ?? null,
            });
            debit = await debitExternalServiceCredits(
              supabaseClient, billingUserId, priced.serviceKey, 'messaging_bulk_whatsapp', 1,
              {
                to,
                template_id: body.templateId ?? null,
                rate_country: priced.country,
                rate_category: priced.category,
                rate_wildcard: priced.usedWildcard,
              },
              tenantWsId,
              {},
              priced.costPerUnit,
            );
            if (!debit.success) {
              results.push({ to, success: false, error: debit.error || 'Insufficient credits' });
              // Stop the bulk run once the owner is out of credits — no point retrying every row.
              break;
            }
          }

          // Fixture tenants never reach a provider. The integration suite runs against
          // PRODUCTION, and one test already produced 134 attempted sends. (#292 item 1)
          if (await isFixtureWorkspace(supabaseClient, tenantWsId)) {
            results.push({ to, success: true, skipped: 'fixture_workspace' });
            continue;
          }

          let result: any;
          try {
            result = await sendWhatsAppMessage({
              accountId: channel.zernio_account_id,
              to,
              message: template ? renderTemplate(template.content, vars) : body.content,
              templateName: template?.whatsapp_template_name || undefined,
              templateLanguage: template?.whatsapp_language_code || undefined,
              templateParams: template ? orderedTemplateParams(template, vars) : undefined,
              category: directSendCategory(template, body.messageType),
            });
          } catch (sendErr) {
            if (billingUserId && debit.credits_debited) await refundWhatsAppCredits(supabaseClient, billingUserId, debit.credits_debited, to);
            results.push({ to, success: false, error: sendErr instanceof Error ? sendErr.message : String(sendErr) });
            // Pace from the channel's configured rate, not a constant.
          await new Promise((res) => setTimeout(res, sendDelayMs(channel.max_send_rate)));
            continue;
          }
          results.push({ to, ...result });

          if (result.success) {
            // The message is already sent, so this must not throw — but the row is the only
            // billing and audit trace of it, and discarding the result made a lost one
            // invisible (#347 audit).
            const { error: logErr } = await supabaseClient.from('messaging_logs').insert({
              created_by: billingUserId,
              workspace_id: tenantWsId, // Tenant scope
              channel_id: channel.id,
              channel_type: 'whatsapp',
              template_id: template?.id ?? null,
              from_number: channel.sender_id,
              to_number: to,
              content: (template ? renderTemplate(template.content, vars) : body.content || '').substring(0, 500),
              message_type: body.messageType || 'marketing',
              provider_message_id: result.messageId,
              status: 'sent',
              sent_at: new Date().toISOString(),
            });
            if (logErr) console.error('[messaging-api] message sent but messaging_logs row FAILED', to, logErr);
          } else {
            // Soft failure — refund the pre-charged credit for this recipient.
            await refundWhatsAppCredits(supabaseClient, user.id, debit.credits_debited, to);
          }
          // Pace from the channel's configured rate, not a constant.
          await new Promise((res) => setTimeout(res, sendDelayMs(channel.max_send_rate)));
        }

        const sent = results.filter((r) => r.success).length;
        return jsonResponse({ success: true, sent, failed: results.length - sent, results });
      }

      // ─────────────────────────────────────────────────────────────
      // Connect a WhatsApp number with Meta credentials — the HEADLESS path.
      // Prefer connect-whatsapp-oauth below for anything a human drives.
      // ─────────────────────────────────────────────────────────────
      case 'connect-whatsapp': {
        const { accessToken, wabaId, phoneNumberId, displayName, workspaceId } = requestBody;
        if (!accessToken || !wabaId || !phoneNumberId) {
          throw new HttpError(400, 'accessToken, wabaId and phoneNumberId are required (from Meta Business Suite)');
        }

        // Operator roles are workspace-scoped — the caller must be an active member
        // of the target workspace before attaching a WhatsApp account (else operator-of-A could
        // connect an account to workspace-B by passing its id). resolveTargetWorkspaceId does
        // that check (403 on non-member) and falls back to the caller's sole workspace when the
        // body omits one. Platform-secret callers pass.
        const wsId = await resolveTargetWorkspaceId(workspaceId);
        if (!wsId) throw new HttpError(400, 'workspaceId is required (you belong to more than one workspace)');
        { const gate = await requireMessaging(wsId); if (gate) return gate; }
        const profileId = await resolveWorkspaceProfile(supabaseClient, wsId);

        // Zernio: POST /v1/connect/whatsapp/credentials -> { account: { accountId, username, displayName, selectedPhoneNumber } }
        const res = await zernioApi('POST', '/connect/whatsapp/credentials', {
          profileId, accessToken, wabaId, phoneNumberId,
        });
        const account = res?.account ?? {};

        const saved = await upsertWhatsAppChannel(supabaseClient, {
          workspaceId: wsId,
          accountId: account.accountId,
          profileId,
          senderId: account.selectedPhoneNumber || account.username || phoneNumberId,
          displayName: displayName || account.displayName,
          wabaId,
          phoneNumberId,
        });

        return jsonResponse({ success: true, channel: saved, account });
      }

      // ─────────────────────────────────────────────────────────────
      // Connect a WhatsApp number via Meta Embedded Signup (the DEFAULT path).
      //
      // Mirrors the social flow in zernio-api/handlers/oauth.ts: Zernio brokers the OAuth,
      // the operator picks the WABA + number on Meta's own screen, and no Meta access token
      // ever reaches this app. 'connect-whatsapp' above is the headless sibling Zernio
      // documents for server-to-server callers that already hold credentials — it is NOT the
      // path a human should be pushed down, which is what the UI used to do.
      // ─────────────────────────────────────────────────────────────
      case 'connect-whatsapp-oauth': {
        const { workspaceId, redirectUrl, onboarding } = requestBody;

        // WhatsApp-only. Meta shows a different Embedded Signup screen per mode, and Zernio's
        // DEFAULT is coexistence — a number shared with the consumer WhatsApp Business app.
        // A business connecting a Cloud API number wants 'api' (Meta's WABA/number picker).
        // Getting this wrong is not an error, it is a differently-provisioned number, so let
        // the caller choose rather than inheriting a default nobody picked.
        if (onboarding && onboarding !== 'api' && onboarding !== 'business_app') {
          throw new HttpError(400, "onboarding must be 'api' or 'business_app'");
        }

        const wsId = await resolveTargetWorkspaceId(workspaceId);
        if (!wsId) throw new HttpError(400, 'workspaceId is required (you belong to more than one workspace)');
        { const gate = await requireMessaging(wsId); if (gate) return gate; }

        // A WhatsApp number is a connected account on Zernio's bill exactly like an Instagram
        // profile is, so it draws on the same allowance. Checked before the OAuth URL is minted:
        // sending someone through Meta's Embedded Signup and refusing the result afterwards is
        // the worst possible place to say no.
        const waSeat = await checkChannelSeat(supabaseClient, wsId);
        if (!waSeat.ok) {
          return jsonResponse({ success: false, code: 'channel_seat_required', error: waSeat.message, usage: waSeat.usage }, 402);
        }

        const profileId = await resolveWorkspaceProfile(supabaseClient, wsId);

        // A caller-supplied redirect is an open-redirect/phishing vector — require
        // same-origin before handing it to Zernio (same rule as the social handler).
        let appRedirect = `${publicAppUrl()}/messaging`;
        if (redirectUrl) {
          let sameOrigin = false;
          try {
            sameOrigin = new URL(redirectUrl).origin === new URL(publicAppUrl()).origin;
          } catch {
            throw new HttpError(400, 'invalid redirectUrl');
          }
          if (!sameOrigin) throw new HttpError(400, 'redirectUrl must be same-origin as the app');
          appRedirect = redirectUrl;
        }

        // Zernio: GET /v1/connect/whatsapp?profileId=&redirect_url= -> { authUrl, state }
        const qs = new URLSearchParams({ profileId, redirect_url: appRedirect });
        if (onboarding) qs.set('onboarding', onboarding);
        const data = await zernioApi('GET', `/connect/whatsapp?${qs.toString()}`);

        return jsonResponse({
          success: true,
          oauth_url: data.authUrl,
          state: data.state ?? null,
          profile_id: profileId,
        });
      }

      // ─────────────────────────────────────────────────────────────
      // Finish the Embedded Signup. Zernio sends the browser back to the app with
      // ?connected=whatsapp&profileId=&accountId=&username=<phone>. The UI posts that
      // accountId here and we read the real account off Zernio rather than trusting it.
      // ─────────────────────────────────────────────────────────────
      case 'connect-whatsapp-callback': {
        const { zernioAccountId, workspaceId, displayName } = requestBody;
        if (!zernioAccountId) throw new HttpError(400, 'zernioAccountId is required');

        const wsId = await resolveTargetWorkspaceId(workspaceId);
        if (!wsId) throw new HttpError(400, 'workspaceId is required (you belong to more than one workspace)');
        { const gate = await requireMessaging(wsId); if (gate) return gate; }
        const profileId = await resolveWorkspaceProfile(supabaseClient, wsId);

        // There is NO GET /v1/accounts/{accountId} — the spec exposes only PUT/PATCH/DELETE
        // there, so reading one account by id 404s. The list endpoint is the supported read.
        const account = await fetchZernioAccount(zernioAccountId, { profileId, platform: 'whatsapp' });
        if (!account) throw new HttpError(404, 'Zernio has no such connected WhatsApp account');
        const senderId = account.selectedPhoneNumber || account.username || account.platformIdentifier;
        if (!senderId) throw new HttpError(502, 'Zernio returned no phone number for this account');

        const meta = account.metadata ?? {};
        const saved = await upsertWhatsAppChannel(supabaseClient, {
          workspaceId: wsId,
          accountId: account._id || account.accountId || zernioAccountId,
          profileId,
          senderId,
          displayName: displayName || account.displayName,
          // Embedded Signup fills these in on Meta's side; keep them when Zernio reports
          // them so the channel card can still show the WABA.
          wabaId: meta.wabaId ?? account.wabaId ?? null,
          phoneNumberId: meta.phoneNumberId ?? account.phoneNumberId ?? null,
        });

        return jsonResponse({ success: true, channel: saved, account });
      }

      // ─────────────────────────────────────────────────────────────
      // Repair number attribution.
      //
      // A number is bought on Zernio and recorded locally in two steps, and the second one can
      // fail: the purchase returns success, the workspace_phone_numbers row does not land, and
      // the platform now pays a monthly charge with nobody to bill. The purchase cannot be undone
      // to make that safe, so the answer is a repair that can be run at any time — the profile
      // map already says which workspace owns which number, so nothing has to be guessed.
      // ─────────────────────────────────────────────────────────────
      case 'reconcile-phone-numbers': {
        const { data: profiles } = await supabaseClient
          .from('social_zernio_profiles').select('workspace_id, zernio_profile_id');

        let checked = 0, repaired = 0;
        const errors: string[] = [];

        for (const prof of ((profiles ?? []) as Array<{ workspace_id: string; zernio_profile_id: string }>)) {
          try {
            const owned = await listPhoneNumbers(supabaseClient, prof.zernio_profile_id);
            for (const n of owned.filter((x) => !x.broughtYourOwn)) {
              checked++;
              // The lookup's own error matters: a failed read here would look like "no row yet"
              // and insert a duplicate, which the unique index would then reject as a repair
              // failure on a number that was already fine.
              const { data: existing, error: lookupErr } = await supabaseClient
                .from('workspace_phone_numbers').select('id').eq('zernio_number_id', n.id).maybeSingle();
              if (lookupErr) { errors.push(`${n.phoneNumber}: ${lookupErr.message}`); continue; }
              if (existing) continue;

              const { error } = await supabaseClient.from('workspace_phone_numbers').insert({
                workspace_id: prof.workspace_id,
                zernio_number_id: n.id,
                phone_number: n.phoneNumber,
                country: n.country,
                monthly_cents: n.monthlyCents,
                status: n.status ?? 'active',
              });
              if (error) errors.push(`${n.phoneNumber}: ${error.message}`);
              else repaired++;
            }
          } catch (err) {
            errors.push(`profile ${prof.zernio_profile_id}: ${err instanceof Error ? err.message : String(err)}`);
          }
        }

        // `success` reports whether the REPAIR worked, not whether the handler ran. A partial
        // sweep that left numbers unattributed is the state this action exists to remove, and
        // reporting it as success is how it would be run once and believed.
        return jsonResponse({
          success: errors.length === 0,
          checked,
          repaired,
          errors: errors.length ? errors : undefined,
        });
      }

      // ─────────────────────────────────────────────────────────────
      // Charge the month's recurring channel lines.
      //
      // Seats and rented numbers were metered and never billed: a workspace could hold four
      // connected accounts and a Greek number, cost the platform $15/month, and pay nothing.
      // Idempotent on (workspace, type, month) — running this twice bills nobody twice.
      // ─────────────────────────────────────────────────────────────
      case 'bill-channels-monthly': {
        const { month, lines } = await billChannelsForMonth(supabaseClient, new Date());
        const charged = lines.filter((l) => l.status === 'charged');
        const failed = lines.filter((l) => l.status === 'failed');
        return jsonResponse({
          // False when anything failed: a partial billing run reported as success is a month of
          // revenue nobody goes looking for.
          success: failed.length === 0,
          month,
          charged: charged.length,
          credits_charged: Math.round(charged.reduce((n, l) => n + l.credits, 0) * 100) / 100,
          failed: failed.length,
          skipped: lines.filter((l) => l.status === 'skipped').length,
          lines,
        });
      }

      // ─────────────────────────────────────────────────────────────
      // Grant paid channel seats to a workspace.
      //
      // Self-serve seat purchase needs a Stripe price that does not exist yet. This is the half
      // that works today: an operator records the seats a workspace has agreed to pay for, the
      // connect gate starts enforcing against the new allowance, and the monthly billing charges
      // for what is actually connected. Replaced, not duplicated, when checkout arrives.
      // ─────────────────────────────────────────────────────────────
      case 'set-channel-seats': {
        const targetWs = String(requestBody.workspaceId || '').trim();
        const seats = Number(requestBody.seats);
        if (!targetWs) throw new HttpError(400, 'workspaceId is required');
        if (!Number.isInteger(seats) || seats < 0 || seats > 500) {
          throw new HttpError(400, 'seats must be a whole number between 0 and 500');
        }

        const { error } = await supabaseClient.from('workspace_module_subscriptions').upsert({
          workspace_id: targetWs,
          module_slug: 'messaging',
          // Seats granted by an operator are active by definition — there is no Stripe
          // subscription behind them to take a status from.
          status: 'active',
          quantity: seats,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'workspace_id,module_slug' });
        if (error) throw new HttpError(500, `Could not set seats: ${error.message}`);

        const { data: usage } = await supabaseClient.rpc('workspace_channel_usage', { p_workspace_id: targetWs });
        return jsonResponse({ success: true, workspace_id: targetWs, seats, usage: Array.isArray(usage) ? usage[0] : usage });
      }

      // ─────────────────────────────────────────────────────────────
      // Record a template rate read off an invoice.
      //
      // Automatic reconciliation only works where WE own the WhatsApp Business Account. Connect a
      // number through a BSP's embedded signup and the WABA lives in THEIR Business Manager, so
      // Meta returns nothing for it — no token, however well-scoped, can read a WABA the operator
      // does not own.
      //
      // In that case the real figure exists on the partner's invoice and nowhere else, and a human
      // has to carry it across. That is not a lesser answer than the API one: both end with a rate
      // stamped `last_verified_at`, which is what the unverified-rates probe actually asks for. A
      // probe nothing can satisfy fires forever and teaches everyone to ignore it.
      // ─────────────────────────────────────────────────────────────
      case 'set-whatsapp-rate': {
        const country = String(requestBody.country || '').trim().toUpperCase();
        const category = String(requestBody.category || '').trim().toLowerCase();
        const cost = Number(requestBody.cost_per_message_usd);
        const note = String(requestBody.source_note || '').trim();

        if (!country) throw new HttpError(400, 'country is required (ISO alpha-2, or * for the wildcard)');
        if (!['marketing', 'utility', 'authentication', 'service'].includes(category)) {
          throw new HttpError(400, "category must be marketing, utility, authentication or service");
        }
        if (!Number.isFinite(cost) || cost < 0) throw new HttpError(400, 'cost_per_message_usd must be a number >= 0');

        const { data, error } = await supabaseClient
          .from('whatsapp_template_rates')
          .upsert({
            country_code: country,
            category,
            cost_per_message_usd: cost,
            // Where the number came from is part of the number. A rate with no provenance is the
            // seeded guess again, just with a fresher timestamp on it.
            source_note: note || 'Entered by the operator from a provider invoice.',
            last_verified_at: new Date().toISOString(),
            // Distinguishes an invoice-derived figure from one Meta reported directly.
            derived_from_actuals: false,
            active: true,
            updated_at: new Date().toISOString(),
          }, { onConflict: 'country_code,category' })
          .select('country_code, category, cost_per_message_usd, last_verified_at')
          .single();

        if (error) throw new HttpError(500, `Could not save the rate: ${error.message}`);
        return jsonResponse({ success: true, rate: data });
      }

      // ─────────────────────────────────────────────────────────────
      // Reconcile what Meta actually charged.
      //
      // The one cost this platform genuinely could not see — template messages are billed by Meta
      // straight to the WABA and never touch Zernio's invoice, so template pricing ran entirely on
      // seeded guesses. Meta does expose it: pricing_analytics on the WABA returns COST and VOLUME
      // by country and category. This reads it back, stores billed-vs-actual, and rewrites the
      // rate table from Meta's own numbers where the sample is large enough to mean anything.
      // ─────────────────────────────────────────────────────────────
      case 'reconcile-whatsapp-costs': {
        const days = Math.min(Math.max(Number(requestBody.days) || 30, 1), 90);
        const periodEnd = new Date();
        const periodStart = new Date(periodEnd.getTime() - days * 86400000);

        // Every distinct WABA we know about, with the workspace that owns it.
        const { data: channels } = await supabaseClient
          .from('messaging_channels').select('workspace_id, config').eq('channel_type', 'whatsapp');

        const seen = new Map<string, string | null>();
        for (const c of ((channels ?? []) as Array<{ workspace_id: string | null; config: Record<string, unknown> | null }>)) {
          const waba = (c.config?.waba_id as string) || null;
          if (waba && !seen.has(waba)) seen.set(waba, c.workspace_id);
        }

        if (seen.size === 0) {
          // Two very different situations reach here and only one is a defect, so say which.
          const { count: waChannels } = await supabaseClient
            .from('messaging_channels')
            .select('*', { count: 'exact', head: true })
            .eq('channel_type', 'whatsapp');

          return jsonResponse({
            success: true,
            wabas: 0,
            results: [],
            whatsapp_channels: waChannels ?? 0,
            message: (waChannels ?? 0) === 0
              ? 'No WhatsApp channel is connected, so there is nothing to reconcile yet.'
              : 'WhatsApp is connected but no channel carries a WABA id. That normally means the '
                + 'number was onboarded through the provider\'s own Meta app, so the WhatsApp '
                + 'Business Account sits in THEIR Business Manager and Meta will not report its '
                + 'cost to us at all. Take the figures from the provider invoice and record them '
                + 'with set-whatsapp-rate — no Meta token can read a WABA you do not own.',
          });
        }

        const results = [];
        for (const [wabaId, workspaceId] of seen) {
          results.push(await reconcileWaba(supabaseClient, { wabaId, workspaceId, periodStart, periodEnd }));
        }

        return jsonResponse({
          success: true,
          wabas: seen.size,
          period: { from: periodStart.toISOString().slice(0, 10), to: periodEnd.toISOString().slice(0, 10) },
          rates_updated: results.reduce((n, r) => n + r.ratesUpdated, 0),
          results,
        });
      }

      // ─────────────────────────────────────────────────────────────
      // Phone numbers: search / list / buy / release.
      //
      // The gap this closes: connecting WhatsApp assumed you already owned a number. Zernio
      // sells them in 54 countries and we never offered it, so a workspace without one had no
      // route to WhatsApp at all.
      //
      // Tenancy on all four is the workspace's own Zernio profile — purchases go into it, lists
      // are filtered by it, and a release is verified against it before the id is passed on.
      // ─────────────────────────────────────────────────────────────
      case 'search-phone-numbers': {
        const { country, numberType, prefix, locality, contains, sms, limit } = requestBody;
        const wsId = await resolveTargetWorkspaceId(requestBody.workspaceId);
        if (!wsId) throw new HttpError(400, 'workspaceId is required (you belong to more than one workspace)');
        if (!(await isWorkspaceEntitled(supabaseClient, wsId, 'messaging'))) return notEntitledResponse('messaging');

        const result = await searchAvailablePhoneNumbers(supabaseClient, {
          country, type: numberType, prefix, locality, contains, sms: Boolean(sms), limit,
        });
        return jsonResponse({ success: true, ...result });
      }

      case 'list-phone-numbers': {
        const wsId = await resolveTargetWorkspaceId(requestBody.workspaceId);
        if (!wsId) throw new HttpError(400, 'workspaceId is required (you belong to more than one workspace)');
        if (!(await isWorkspaceEntitled(supabaseClient, wsId, 'messaging'))) return notEntitledResponse('messaging');

        const profileId = await resolveWorkspaceProfile(supabaseClient, wsId);
        const numbers = await listPhoneNumbers(supabaseClient, profileId, requestBody.status);
        return jsonResponse({ success: true, numbers, profile_id: profileId });
      }

      case 'purchase-phone-number': {
        const { country, numberType, areaCode, wantsSms, purchaseIntentId } = requestBody;
        const wsId = await resolveTargetWorkspaceId(requestBody.workspaceId);
        if (!wsId) throw new HttpError(400, 'workspaceId is required (you belong to more than one workspace)');
        { const gate = await requireMessaging(wsId); if (gate) return gate; }

        const profileId = await resolveWorkspaceProfile(supabaseClient, wsId);
        // Never spend into a profile this workspace shares with other tenants.
        await assertOwnProfile(supabaseClient, wsId, profileId);

        try {
          const outcome = await purchasePhoneNumber(supabaseClient, {
            profileId,
            country,
            numberType,
            areaCode,
            wantsSms: Boolean(wantsSms),
            // A number bought from inside the WhatsApp screen is for WhatsApp. Buying one that
            // then has to be connected by hand is the same dead end in two steps.
            connectWhatsapp: true,
            wantsWhatsapp: true,
            purchaseIntentId,
          });
          // Record it against the workspace that will be billed. Only on a completed purchase —
          // a checkout URL means nothing exists yet, and a row for a number that was never paid
          // for is a phantom line on somebody's invoice.
          const attributionErrors: string[] = [];
          if (outcome.kind === 'done') {
            const owned = await listPhoneNumbers(supabaseClient, profileId);
            for (const n of owned.filter((x) => !x.broughtYourOwn)) {
              const { error: attrErr } = await supabaseClient.from('workspace_phone_numbers').upsert({
                workspace_id: wsId,
                zernio_number_id: n.id,
                phone_number: n.phoneNumber,
                country: n.country,
                // What Zernio charges US. The tenant price is derived from it at billing time;
                // storing both would be two copies of one money quantity.
                monthly_cents: n.monthlyCents,
                status: n.status ?? 'active',
                purchased_by: auth.userId ?? null,
              }, { onConflict: 'zernio_number_id' });
              // The number is already bought and already costing us money. A failed attribution
              // row means a recurring charge with NOBODY to bill it to, and the purchase cannot
              // be un-done to make that safe — so it is reported loudly rather than swallowed
              // behind a success the operator would never question.
              if (attrErr) {
                console.error('[messaging-api] phone number attribution FAILED', n.id, attrErr);
                attributionErrors.push(`${n.phoneNumber}: ${attrErr.message}`);
              }
            }
          }
          return jsonResponse({
            success: true,
            workspace_id: wsId,
            profile_id: profileId,
            ...outcome,
            ...(attributionErrors.length
              ? {
                  warning: 'The number was purchased but could not be attributed to this workspace '
                    + 'for billing. It is costing the platform money with nobody to bill — fix the '
                    + 'workspace_phone_numbers row before the next invoice.',
                  attribution_errors: attributionErrors,
                }
              : {}),
          });
        } catch (err) {
          // Zernio's specific refusals are actionable and a generic 500 throws that away.
          const status = (err as { status?: number })?.status;
          const text = err instanceof Error ? err.message : String(err);
          if (status === 402) {
            throw new HttpError(402, 'Zernio has no payment method on file. Add one in the Zernio dashboard before buying a number.');
          }
          if (status === 409 && /VELOCITY/i.test(text)) {
            throw new HttpError(409, 'Zernio blocked this as a duplicate purchase within 10 minutes. Wait, or confirm you really want a second number.');
          }
          if (status === 409) {
            throw new HttpError(409, 'That area code has no numbers available right now — try another, or drop the area code.');
          }
          throw err;
        }
      }

      case 'release-phone-number': {
        const { phoneNumberId } = requestBody;
        if (!phoneNumberId) throw new HttpError(400, 'phoneNumberId is required');
        const wsId = await resolveTargetWorkspaceId(requestBody.workspaceId);
        if (!wsId) throw new HttpError(400, 'workspaceId is required (you belong to more than one workspace)');
        { const gate = await requireMessaging(wsId); if (gate) return gate; }

        const profileId = await resolveWorkspaceProfile(supabaseClient, wsId);
        await assertOwnProfile(supabaseClient, wsId, profileId);

        // Ownership comes from the SAME authority that will perform the delete, filtered to this
        // workspace's profile. Trusting the id from the body would let one tenant cancel another
        // tenant's number and disconnect their WhatsApp with it. 404, not 403, so a probe cannot
        // tell "not yours" from "does not exist".
        const owned = await listPhoneNumbers(supabaseClient, profileId);
        const target = owned.find((n) => n.id === phoneNumberId);
        if (!target) throw new HttpError(404, 'No such phone number on this workspace');
        if (target.broughtYourOwn) {
          throw new HttpError(400, 'This is a number you connected yourself, not one bought here. Disconnect the WhatsApp channel instead of releasing it.');
        }

        const released = await releasePhoneNumber(supabaseClient, phoneNumberId);
        // Stop billing for it. Marked released rather than deleted: a number charged for three
        // months and then let go is a fact the invoice still needs.
        // Unchecked, this is the release mirror of the purchase bug: Zernio has let the number go
        // and we keep billing the tenant for it every month, with a clean success on screen.
        const { error: releaseRowErr } = await supabaseClient
          .from('workspace_phone_numbers')
          .update({ status: 'released', released_at: new Date().toISOString(), updated_at: new Date().toISOString() })
          .eq('zernio_number_id', phoneNumberId)
          .eq('workspace_id', wsId);
        if (releaseRowErr) {
          console.error('[messaging-api] release bookkeeping FAILED', phoneNumberId, releaseRowErr);
        }
        // The channel row points at a number that no longer exists; leaving it active would keep
        // offering a sender whose every send fails.
        await supabaseClient
          .from('messaging_channels')
          .update({ is_active: false, updated_at: new Date().toISOString() })
          .eq('workspace_id', wsId)
          .eq('sender_id', target.phoneNumber);

        return jsonResponse({
          success: true,
          ...released,
          ...(releaseRowErr
            ? {
                warning: 'The number was released at Zernio but the local record was not updated, '
                  + 'so billing for it will continue. Run reconcile-phone-numbers.',
                bookkeeping_error: releaseRowErr.message,
              }
            : {}),
        });
      }

      // ─────────────────────────────────────────────────────────────
      // Plan headroom.
      //
      // Not a vanity metric. resolveWorkspaceProfile falls back to the SHARED default profile
      // when Zernio refuses a new one at the plan ceiling — so at exactly that moment, every
      // further workspace's accounts and conversations land in the same profile and tenant
      // separation is gone, with the connect still reporting success. This is how you see it
      // coming instead of discovering it afterwards.
      // ─────────────────────────────────────────────────────────────
      case 'plan-status': {
        const plan = await getZernioPlan();
        const { count: mappedProfiles } = await supabaseClient
          .from('social_zernio_profiles').select('*', { count: 'exact', head: true });
        return jsonResponse({
          success: true,
          ...plan,
          workspacesMapped: mappedProfiles ?? 0,
          // Stated rather than implied: at the ceiling the NEXT workspace silently shares.
          warning: plan.profileCeilingReached
            ? 'The Zernio profile limit is reached. Any workspace connecting from now on will '
              + 'share the default profile, and its accounts will not be separated from other tenants.'
            : null,
        });
      }

      // ─────────────────────────────────────────────────────────────
      // Backfill the inbox from Zernio.
      //
      // Webhooks are a PUSH channel with no history: Zernio does not resend after a 200, and it
      // was never registered at all until this pass, so every conversation that happened before
      // then exists on the platform and nowhere here. There is no local signal for that — an
      // empty inbox and an inbox that missed a month look the same.
      //
      // This is also the recovery path for the two states that lose events afterwards: a
      // webhook Zernio auto-disabled after 10 failures, and a deploy window. Idempotent, so
      // running it twice is safe.
      // ─────────────────────────────────────────────────────────────
      case 'backfill-inbox': {
        const { workspaceId, limit } = requestBody;
        const wsId = await resolveTargetWorkspaceId(workspaceId);
        if (!wsId) throw new HttpError(400, 'workspaceId is required (you belong to more than one workspace)');
        { const gate = await requireMessaging(wsId); if (gate) return gate; }

        const cap = Math.min(Math.max(Number(limit) || 50, 1), 200);

        // Only this workspace's accounts. Zernio's key is platform-wide, so an unfiltered pull
        // would import another tenant's conversations into this inbox.
        const [{ data: channels }, { data: socials }] = await Promise.all([
          supabaseClient.from('messaging_channels').select('zernio_account_id')
            .eq('workspace_id', wsId).eq('channel_type', 'whatsapp').not('zernio_account_id', 'is', null),
          supabaseClient.from('social_accounts').select('zernio_account_id')
            .eq('workspace_id', wsId).eq('is_active', true).not('zernio_account_id', 'is', null),
        ]);
        const accountIds = [
          ...((channels ?? []) as Array<{ zernio_account_id: string }>).map((c) => c.zernio_account_id),
          ...((socials ?? []) as Array<{ zernio_account_id: string }>).map((a) => a.zernio_account_id),
        ].filter(Boolean);

        if (!accountIds.length) {
          return jsonResponse({ success: true, imported: 0, message: 'No connected accounts to back-fill from.' });
        }

        // Count what LANDS, not what was accepted. The webhook handler answers 200 to a message it
        // deliberately drops — an unresolvable workspace, an echo of our own reply, an event it
        // does not branch on are all "handled". Counting res.ok therefore reported a backfill of
        // N messages while the inbox stayed empty, which is the exit-code-instead-of-the-world
        // mistake this codebase keeps paying for.
        const { count: messagesBefore } = await supabaseClient
          .from('inbox_messages').select('*', { count: 'exact', head: true });

        let accepted = 0;
        let scanned = 0;
        const errors: string[] = [];
        // Why the handler declined, tallied. "Nothing arrived" is not a diagnosis; "47 messages
        // had no workspace bound to Zernio account X" is one, and it names the fix.
        const dropReasons: Record<string, number> = {};

        for (const accountId of accountIds) {
          let convs: Array<Record<string, any>> = [];
          try {
            const data = await zernioApi('GET', `/inbox/conversations?accountId=${encodeURIComponent(accountId)}&limit=${cap}`);
            convs = (data.data ?? []) as Array<Record<string, any>>;
          } catch (err) {
            // One account's failure must not abandon the others — a revoked token on a single
            // number would otherwise silently truncate the whole backfill.
            errors.push(`${accountId}: ${String(err)}`);
            continue;
          }

          for (const conv of convs) {
            scanned++;
            let messages: Array<Record<string, any>> = [];
            try {
              // accountId is REQUIRED on this endpoint — Zernio answers 400
              // `missing_required_field` without it. Omitting it meant the back-fill found
              // conversations, failed to read a single message from any of them, and still
              // returned success: five conversations scanned, five 400s, an empty inbox and a
              // green toast. The conversation id alone is not enough to identify a conversation
              // on a key that spans every tenant.
              const md = await zernioApi(
                'GET',
                `/inbox/conversations/${encodeURIComponent(String(conv.id))}/messages`
                + `?accountId=${encodeURIComponent(accountId)}&limit=50`,
              );
              messages = (md.data ?? md.messages ?? []) as Array<Record<string, any>>;
            } catch (err) {
              errors.push(`${conv.id}: ${String(err)}`);
              continue;
            }

            for (const m of messages) {
              // Replay each one through the webhook handler's own path so the backfill and the
              // live path can never diverge into two different importers — the second copy is
              // exactly how "it works live but not on replay" gets built.
              const replayBody = JSON.stringify({
                  event: 'message.received',
                  account: { accountId, platform: conv.platform },
                  message: {
                    id: m.id,
                    platformMessageId: m.platformMessageId ?? m.id,
                    platform: conv.platform,
                    direction: m.direction ?? 'incoming',
                    text: m.text ?? m.message ?? null,
                    attachments: m.attachments ?? [],
                    conversationId: conv.id,
                    sentAt: m.sentAt ?? m.createdTime ?? null,
                    sender: {
                      // `phoneNumber` is the field the handler reads FIRST. The replay set only
                      // `phone`, which nothing looks at, and left the handler to parse a JID out
                      // of `id` — which it could not. Send the name it actually reads, and keep
                      // the alternates so a change on either side degrades instead of dropping.
                      phoneNumber: conv.platform === 'whatsapp'
                        ? (conv.participantPhone ?? conv.participantId ?? conv.contactId)
                        : undefined,
                      id: conv.participantId,
                      name: conv.participantName,
                      username: conv.accountUsername ?? conv.participantName,
                    },
                  },
              });

              // Signed with the real webhook secret rather than let in through a service-role
              // bypass: invariant 6 is verify-before-process and fail closed, and a second door
              // added "only for replay" is the one that ends up reachable.
              const res = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/zernio-webhook-handler`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'X-Zernio-Signature': await signZernioBody(replayBody),
                },
                body: replayBody,
              });
              if (res.ok) {
                accepted++;
                const body = await res.json().catch(() => ({}));
                if (body?.outcome === 'dropped') {
                  const why = String(body.reason ?? 'unspecified');
                  dropReasons[why] = (dropReasons[why] ?? 0) + 1;
                }
              } else {
                errors.push(`replay ${m.id}: ${res.status}`);
              }
            }
          }
        }

        const { count: messagesAfter } = await supabaseClient
          .from('inbox_messages').select('*', { count: 'exact', head: true });
        const imported = Math.max((messagesAfter ?? 0) - (messagesBefore ?? 0), 0);

        return jsonResponse({
          success: true,
          accounts: accountIds.length,
          conversations: scanned,
          // The real answer: rows that appeared in the inbox.
          imported,
          // Kept separate rather than collapsed, because the gap between them IS the diagnosis.
          // accepted >> imported means the handler took every message and filed none — a
          // resolution problem, not a transport one — and that is invisible if only one is shown.
          accepted,
          dropped_silently: Math.max(accepted - imported, 0),
          // The handler's own words, counted. No log-diving to find out why an inbox is empty.
          drop_reasons: Object.keys(dropReasons).length ? dropReasons : undefined,
          message: accepted > 0 && imported === 0
            ? 'Every message was accepted and none was filed — see drop_reasons for why.'
            : scanned === 0
              ? 'Zernio returned no conversations for these accounts. A number connected in '
                + 'coexistence mode keeps its existing chats on the phone; only messages that '
                + 'flow through Zernio after connecting are its to hand back.'
              : undefined,
          // Never a silent partial: a truncated backfill that reports plain success is
          // indistinguishable from one that found nothing.
          errors: errors.slice(0, 20),
          truncated: errors.length > 20,
        });
      }

      // ─────────────────────────────────────────────────────────────
      // Connection health, straight from Zernio.
      //
      // account-info reports what META thinks of ONE number (quality rating, tier). This is the
      // orthogonal question — whether the token we hold still works at all. A revoked or expired
      // token keeps listing as a connected account, so nothing in messaging_channels can tell
      // the difference between "connected and idle" and "connected and unable to send".
      // ─────────────────────────────────────────────────────────────
      case 'channel-health': {
        const wsIds = await readScopeWorkspaceIds();
        const data = await zernioApi('GET', '/accounts/health?platform=whatsapp');
        const accounts = (data.accounts ?? []) as Array<Record<string, any>>;

        // Only report on numbers this caller can actually see. Zernio's key is platform-wide,
        // so returning its whole health list would leak other tenants' numbers.
        let visible = accounts;
        if (wsIds !== null) {
          const { data: mine } = await supabaseClient
            .from('messaging_channels').select('zernio_account_id')
            .eq('channel_type', 'whatsapp').in('workspace_id', wsIds);
          const allowed = new Set((mine ?? []).map((c: any) => c.zernio_account_id).filter(Boolean));
          visible = accounts.filter((a) => allowed.has(a.accountId));
        }

        // Mirror the verdict onto the channel so the card is right even before anyone opens
        // this panel — a token Zernio calls invalid must not leave a green "Active" badge.
        for (const acc of visible) {
          const unusable = acc.needsReconnect === true || acc.tokenValid === false || acc.status === 'error';
          const { error: healthErr } = await supabaseClient
            .from('messaging_channels')
            .update({
              is_active: !unusable,
              config: {
                zernio_account_id: acc.accountId,
                display_phone_number: acc.username,
                needs_reconnection: acc.needsReconnect === true,
                health_status: acc.status ?? null,
                health_issues: acc.issues ?? [],
                token_expires_at: acc.tokenExpiresAt ?? null,
                health_checked_at: new Date().toISOString(),
              },
              updated_at: new Date().toISOString(),
            })
            .eq('zernio_account_id', acc.accountId);
          if (healthErr) console.error('[messaging-api] channel-health write FAILED', acc.accountId, healthErr);
        }

        return jsonResponse({
          success: true,
          summary: {
            total: visible.length,
            healthy: visible.filter((a) => a.status === 'healthy').length,
            warning: visible.filter((a) => a.status === 'warning').length,
            error: visible.filter((a) => a.status === 'error').length,
            needsReconnect: visible.filter((a) => a.needsReconnect === true).length,
          },
          accounts: visible,
        });
      }

      // ─────────────────────────────────────────────────────────────
      // Inbox analytics — the two-way view.
      //
      // `analytics` below counts what WE sent, out of messaging_logs. It cannot see a reply, so
      // it cannot answer the only question that matters on a conversational channel: are we
      // answering people, and how fast. Zernio holds both sides.
      // ─────────────────────────────────────────────────────────────
      case 'inbox-analytics': {
        const { from, fromDate, toDate } = requestBody;
        const channel = await resolveChannel(supabaseClient, await readScopeWorkspaceIds(), from);
        if (!channel?.zernio_account_id) throw new HttpError(400, 'No WhatsApp channel configured');

        // Zernio requires fromDate and caps the range at 365 days.
        const start = fromDate || new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10);
        const qs = new URLSearchParams({ fromDate: start, accountId: channel.zernio_account_id });
        if (toDate) qs.set('toDate', toDate);

        // One slow endpoint must not take the panel down with it — analytics is a stricter
        // rate-limit bucket (~6 req/s), so a 429 on one of these is normal and survivable.
        const [volume, responseTime] = await Promise.allSettled([
          zernioApi('GET', `/analytics/inbox/volume?${qs.toString()}`),
          zernioApi('GET', `/analytics/inbox/response-time?${qs.toString()}`),
        ]);

        return jsonResponse({
          success: true,
          from: start,
          to: toDate ?? null,
          volume: volume.status === 'fulfilled' ? volume.value : null,
          responseTime: responseTime.status === 'fulfilled' ? responseTime.value : null,
          errors: [volume, responseTime]
            .filter((r): r is PromiseRejectedResult => r.status === 'rejected')
            .map((r) => String(r.reason)),
        });
      }

      // ─────────────────────────────────────────────────────────────
      // Webhook registration.
      //
      // Nothing ever told Zernio where to deliver events, so zernio-webhook-handler — which
      // verifies signatures and writes the whole WhatsApp inbox — was unreachable by
      // construction. That cannot be inferred locally: "no inbound messages" and "Zernio was
      // never asked to send any" look identical from here.
      // ─────────────────────────────────────────────────────────────
      case 'webhook-status': {
        const status = await getZernioWebhookStatus();
        return jsonResponse({ success: true, ...status });
      }

      case 'register-webhook': {
        try {
          const { action: outcome, status } = await ensureZernioWebhook(supabaseClient);
          return jsonResponse({ success: true, outcome, ...status });
        } catch (err) {
          // A missing signing secret is the operator's to fix, not a server fault.
          throw new HttpError(400, err instanceof Error ? err.message : String(err));
        }
      }

      // ─────────────────────────────────────────────────────────────
      // Submit a WhatsApp template to Meta for approval.
      //
      // whatsapp-templates only ever LISTED what Meta had already approved, so the only way to
      // get a new one was to leave this app for WhatsApp Manager. A `library` template is
      // pre-approved and usable immediately; a custom one goes to review (up to 24h).
      // ─────────────────────────────────────────────────────────────
      case 'create-whatsapp-template': {
        const { from, name, category, language, components, libraryTemplateName } = requestBody;
        if (!name || !category || !language) {
          throw new HttpError(400, 'name, category and language are required');
        }
        if (!components && !libraryTemplateName) {
          throw new HttpError(400, 'Provide either components (custom template) or libraryTemplateName');
        }
        if (!['AUTHENTICATION', 'MARKETING', 'UTILITY'].includes(category)) {
          throw new HttpError(400, 'category must be AUTHENTICATION, MARKETING or UTILITY');
        }

        const channel = await resolveChannel(supabaseClient, await readScopeWorkspaceIds(), from);
        if (!channel?.zernio_account_id) throw new HttpError(400, 'No WhatsApp channel configured');
        { const gate = await requireMessaging(channel.workspace_id); if (gate) return gate; }

        const payload: Record<string, unknown> = {
          accountId: channel.zernio_account_id,
          name, category, language,
        };
        if (libraryTemplateName) payload.library_template_name = libraryTemplateName;
        else payload.components = components;

        const res = await zernioApi('POST', '/whatsapp/templates', payload);
        return jsonResponse({ success: true, template: res.template ?? res });
      }

      // ─────────────────────────────────────────────────────────────
      // Sync channels: pull connected WhatsApp accounts from Zernio
      // ─────────────────────────────────────────────────────────────
      case 'sync-channels': {
        // Channels pulled from Zernio are bound to the caller's workspace. Without a definite
        // one we cannot bind them (a NULL workspace_id channel is visible to every tenant via
        // resolveChannel), so require an explicit id rather than inserting unbound rows.
        const syncWsId = await resolveTargetWorkspaceId(requestBody.workspaceId);
        if (!syncWsId) throw new HttpError(400, 'workspaceId is required (you belong to more than one workspace)');
        { const gate = await requireMessaging(syncWsId); if (gate) return gate; }
        // includeOverLimit so a plan-limit account still reconciles instead of vanishing
        // from the sync and looking deleted.
        const data = await zernioApi('GET', '/accounts?platform=whatsapp&includeOverLimit=true');
        const accounts = (data.accounts || data.data || []) as any[];
        const synced: any[] = [];

        for (const acc of accounts) {
          const accountId = acc._id || acc.accountId || acc.id;
          const senderId = acc.selectedPhoneNumber || acc.username || acc.platformIdentifier;
          if (!accountId || !senderId) continue;

          const { data: existing } = await supabaseClient
            .from('messaging_channels').select('id')
            .eq('zernio_account_id', accountId).maybeSingle();

          if (existing) {
            // Zernio flags an account whose token Meta has invalidated. It still LISTS, so
            // treating the row as healthy left a channel that looked connected and failed
            // every send. needsReconnection is the only signal that says so.
            const needsReconnect = acc.needsReconnection === true;
            await supabaseClient.from('messaging_channels').update({
              sender_id: senderId,
              display_name: acc.displayName || senderId,
              is_active: acc.isActive !== false && !needsReconnect,
              config: { ...(acc.metadata ?? {}), zernio_account_id: accountId, display_phone_number: senderId, needs_reconnection: needsReconnect },
              updated_at: new Date().toISOString(),
            }).eq('id', existing.id);
            synced.push({ action: needsReconnect ? 'needs_reconnection' : 'updated', senderId });
          } else {
            const { count } = await supabaseClient
              .from('messaging_channels').select('*', { count: 'exact', head: true })
              .eq('channel_type', 'whatsapp');
            // `synced` drives the "Synced N WhatsApp account(s)" message below, so a discarded
            // result meant the caller was told a channel was created that does not exist —
            // supabase-js resolves on an RLS denial rather than throwing (#347 audit).
            const { error: chanErr } = await supabaseClient.from('messaging_channels').insert({
              workspace_id: syncWsId, // Bind to the caller's workspace
              channel_type: 'whatsapp',
              provider: 'zernio',
              sender_id: senderId,
              zernio_account_id: accountId,
              display_name: acc.displayName || senderId,
              is_active: acc.isActive !== false && acc.needsReconnection !== true,
              is_default: (count || 0) === 0,
              daily_quota: 10000,
              max_send_rate: 100,
              config: { zernio_account_id: accountId, display_phone_number: senderId, needs_reconnection: acc.needsReconnection === true },
            });
            if (chanErr) {
              console.error(`[messaging-api] could not create the channel for ${senderId}`, chanErr);
              continue;
            }
            synced.push({ action: 'created', senderId });
          }
        }

        return jsonResponse({
          success: true,
          synced: synced.length,
          channels: synced,
          message: synced.length
            ? `Synced ${synced.length} WhatsApp account(s) from Zernio.`
            : 'No connected WhatsApp accounts found in Zernio. Connect a number first.',
        });
      }

      // ─────────────────────────────────────────────────────────────
      // List Meta-approved templates for a channel's WABA
      // ─────────────────────────────────────────────────────────────
      case 'whatsapp-templates': {
        const channel = await resolveChannel(supabaseClient, await readScopeWorkspaceIds(), requestBody.from);
        if (!channel?.zernio_account_id) throw new Error('No connected WhatsApp account');
        const data = await zernioApi('GET', `/whatsapp/templates?accountId=${encodeURIComponent(channel.zernio_account_id)}`);
        return jsonResponse({ templates: data.templates || [] });
      }

      // ─────────────────────────────────────────────────────────────
      // Channels / templates / logs / analytics (DB reads)
      // ─────────────────────────────────────────────────────────────
      case 'channels': {
        // Tenancy (invariant #1): these read actions use the RLS-bypassing service-role client and
        // are NOT operator-gated, so they MUST filter by the caller's workspace or any authenticated user
        // could enumerate every tenant's WhatsApp channels (waba_id/phone_number_id). No workspace → none.
        const chScope = await readScopeWorkspaceIds();
        if (chScope && chScope.length === 0) return jsonResponse({ channels: [] });
        let chQuery = supabaseClient
          .from('messaging_channels').select('*')
          .eq('channel_type', 'whatsapp');
        if (chScope) chQuery = chQuery.in('workspace_id', chScope);
        const { data, error } = await chQuery.order('is_default', { ascending: false });
        if (error) throw error;
        return jsonResponse({ channels: data });
      }

      case 'templates': {
        const { data, error } = await supabaseClient
          .from('messaging_templates').select('*')
          .eq('channel_type', 'whatsapp')
          .order('name', { ascending: true });
        if (error) throw error;
        return jsonResponse({ templates: data });
      }

      case 'logs': {
        // Tenancy: without a workspace filter any user could read every tenant's customer phone numbers
        // + message bodies. Scope to the caller's workspace.
        const logScope = await readScopeWorkspaceIds();
        if (logScope && logScope.length === 0) return jsonResponse({ logs: [], total: 0 });
        const { limit = 50, offset = 0, status } = requestBody;
        let query = supabaseClient
          .from('messaging_logs').select('*', { count: 'exact' })
          .eq('channel_type', 'whatsapp')
          .order('created_at', { ascending: false })
          .range(offset, offset + limit - 1);
        if (logScope) query = query.in('workspace_id', logScope);
        if (status) query = query.eq('status', status);
        const { data, count, error } = await query;
        if (error) throw error;
        return jsonResponse({ logs: data, total: count });
      }

      case 'analytics': {
        const anScope = await readScopeWorkspaceIds();
        if (anScope && anScope.length === 0) return jsonResponse({ total: 0, totalSent: 0, totalDelivered: 0, totalRead: 0, totalFailed: 0, deliveryRate: 0, readRate: 0, failureRate: 0, byStatus: {}, dailyData: [] });
        const { startDate, endDate } = requestBody;
        const start = startDate || new Date(Date.now() - 30 * 86400000).toISOString();
        const end = endDate || new Date().toISOString();
        let anQuery = supabaseClient
          .from('messaging_logs').select('status')
          .eq('channel_type', 'whatsapp')
          .gte('created_at', start).lte('created_at', end);
        if (anScope) anQuery = anQuery.in('workspace_id', anScope);
        const { data: logs } = await anQuery;

        const byStatus: Record<string, number> = {};
        for (const l of logs || []) byStatus[l.status] = (byStatus[l.status] || 0) + 1;
        const total = logs?.length || 0;
        const delivered = (byStatus.delivered || 0) + (byStatus.read || 0);
        return jsonResponse({
          total,
          totalSent: total,
          totalDelivered: delivered,
          totalRead: byStatus.read || 0,
          totalFailed: byStatus.failed || 0,
          deliveryRate: total ? delivered / total : 0,
          readRate: total ? (byStatus.read || 0) / total : 0,
          failureRate: total ? (byStatus.failed || 0) / total : 0,
          byStatus,
          dailyData: [],
        });
      }

      // Account health (replaces Twilio "balance"): quality rating + messaging tier.
      case 'account-info': {
        const channel = await resolveChannel(supabaseClient, await readScopeWorkspaceIds(), requestBody.from);
        if (!channel?.zernio_account_id) return jsonResponse({});
        try {
          const data = await zernioApi('GET', `/whatsapp/number-info?accountId=${encodeURIComponent(channel.zernio_account_id)}`);
          return jsonResponse(data);
        } catch {
          return jsonResponse({});
        }
      }

      case 'get-settings': {
        const { data } = await supabaseClient.from('messaging_settings').select('*').maybeSingle();
        return jsonResponse({ settings: data || { provider: 'zernio' } });
      }

      case 'update-settings': {
        const { settings } = requestBody;
        const { data, error } = await supabaseClient
          .from('messaging_settings')
          .upsert({ id: settings?.id || undefined, ...settings, provider: 'zernio', updated_at: new Date().toISOString() })
          .select().single();
        if (error) throw error;
        return jsonResponse({ settings: data });
      }

      default:
        throw new HttpError(400, `Unknown action: ${action}`);
    }
  } catch (error) {
    // Typed client errors carry their own status and skip Sentry via the wrapper.
    if (error instanceof HttpError) throw error;
    console.error('Messaging API error:', error);
    // Genuine server/DB faults are 500 (not a blanket 400) so they surface in Sentry
    // and the client can retry; validation/auth above are already typed HttpErrors.
    return jsonResponse({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }, 500);
  }
}));
