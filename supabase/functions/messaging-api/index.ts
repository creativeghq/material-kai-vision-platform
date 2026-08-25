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
import { fetchImageGuardedOrNull } from '../_shared/fetch-image.ts';
import { generateImageWithGemini } from '../_shared/ai-client.ts';
import {
  materialiseInlineAttachments,
  storeParticipantPicture,
  fetchOwnBusinessAvatar,
} from '../_shared/inbox-media.ts';
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
import { billChannelsForMonth, retryFailedCharges } from '../_shared/channel-recurring-billing.ts';
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
      'register-webhook', 'create-whatsapp-template', 'backfill-inbox', 'repair-attachments',
      'open-whatsapp-thread', 'sync-avatars', 'zernio-probe', 'generate-avatar-cast',
      // Buying a number puts a recurring charge on the OPERATOR's Zernio/Stripe subscription and
      // releasing one cancels it (and disconnects the WhatsApp account on it). Those are the
      // platform's money and the platform's lifecycle, so they sit with the other operator
      // actions. Searching availability and listing what a workspace already has are reads.
      // 'release-phone-number' is deliberately absent. A tenant may retire their own number
      // (decided 2026-08-24): the only way out of a recurring charge was to contact support,
      // which is not a way out. BUYING still puts a charge on the platform's Zernio account, so
      // that stays operator-only — giving one up costs the tenant money and saves us ours.
      'purchase-phone-number',
      // Operator maintenance: both read or repair platform-level billing state.
      'reconcile-phone-numbers', 'reconcile-whatsapp-costs', 'set-whatsapp-rate',
      // 'retry-failed-charges' is deliberately absent for the same reason as release: a
      // workspace put on hold by a failed debit had no way to get itself back other than
      // waiting for the nightly sweep. It is scoped to the caller's own workspace below.
      'bill-channels-monthly', 'set-channel-read-receipts',
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
      // ─────────────────────────────────────────────────────────────
      // open-whatsapp-thread — from a CRM contact's phone number to a conversation.
      //
      // "Does this number have WhatsApp" is NOT answerable in advance: Meta withdrew the contact
      // validation endpoint, and nothing in Zernio's API replaces it. Claiming otherwise would be a
      // green tick in the CRM that means nothing. What IS true is that most mobile numbers do, so
      // this OPENS the conversation and reports honestly if the platform refuses.
      //
      // It does not send anything. It resolves (or creates) the thread and hands back its id so the
      // UI can drop the operator into the Inbox with the composer focused — where the 24-hour
      // window rules already apply, rather than being re-implemented in a CRM button.
      // ─────────────────────────────────────────────────────────────
      case 'open-whatsapp-thread': {
        const { workspaceId, phone, name } = requestBody;
        const wsId = await resolveTargetWorkspaceId(workspaceId);
        if (!wsId) throw new HttpError(400, 'workspaceId is required (you belong to more than one workspace)');
        { const gate = await requireMessaging(wsId); if (gate) return gate; }

        const digits = String(phone ?? '').replace(/[^0-9]/g, '');
        if (digits.length < 6) throw new HttpError(400, 'A phone number in international format is required');
        const e164 = `+${digits}`;

        // Already talking to them? Then this is a navigation, not a creation.
        const { data: existing } = await supabaseClient
          .from('inbox_threads').select('id')
          .eq('workspace_id', wsId).eq('channel', 'whatsapp')
          .eq('metadata->>contact_phone', e164)
          .order('last_message_at', { ascending: false })
          .limit(1).maybeSingle();
        if (existing) {
          return jsonResponse({ success: true, thread_id: (existing as { id: string }).id, created: false });
        }

        const { data: channel } = await supabaseClient
          .from('messaging_channels').select('zernio_account_id')
          .eq('workspace_id', wsId).eq('channel_type', 'whatsapp').eq('is_active', true)
          .not('zernio_account_id', 'is', null)
          .limit(1).maybeSingle();
        const accountId = (channel as { zernio_account_id?: string } | null)?.zernio_account_id;
        if (!accountId) {
          throw new HttpError(409, 'No active WhatsApp number is connected for this workspace.');
        }

        // The thread is created LOCALLY and empty. Nothing is sent — a business-initiated message
        // outside the 24-hour window needs an approved template, and silently spending one because
        // somebody clicked a CRM row would be the platform acting on its own again.
        const { data: created, error: createErr } = await supabaseClient
          .from('inbox_threads').insert({
            workspace_id: wsId,
            thread_type: 'customer',
            channel: 'whatsapp',
            subject: (typeof name === 'string' && name.trim()) ? name.trim() : e164,
            status: 'open',
            agent_state: 'off',
            metadata: { contact_phone: e164, zernio_account_id: accountId, opened_from: 'crm' },
            last_message_at: new Date().toISOString(),
          }).select('id').single();
        if (createErr) throw new HttpError(500, `Could not open the conversation: ${createErr.message}`);

        return jsonResponse({
          success: true,
          thread_id: (created as { id: string }).id,
          created: true,
          // Said plainly: the operator is about to type into a thread whose first message is
          // business-initiated, and that is template territory unless the customer wrote first.
          note: 'Nothing sent yet. A first message to a number that has not written to you needs an approved template.',
        });
      }

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
      // Read receipts, per number.
      //
      // Whether the customer sees a blue tick is a business decision and it differs by desk: a
      // sales team usually wants it, a support desk triaging overnight usually does not, because
      // "read, no reply" lands worse than silence. Stored on the channel rather than globally —
      // one workspace can run both kinds of number.
      // ─────────────────────────────────────────────────────────────
      case 'set-channel-read-receipts': {
        const channelId = String(requestBody.channelId || '').trim();
        const enabled = requestBody.enabled !== false;
        if (!channelId) throw new HttpError(400, 'channelId is required');

        const wsId = await resolveTargetWorkspaceId(requestBody.workspaceId);
        if (!wsId) throw new HttpError(400, 'workspaceId is required (you belong to more than one workspace)');

        // The channel id comes from the client, so it is bound to the caller's workspace before
        // anything is written — otherwise one tenant could silence another tenant's receipts.
        const { data: ch } = await supabaseClient
          .from('messaging_channels').select('id, config, workspace_id')
          .eq('id', channelId).maybeSingle();
        if (!ch || ch.workspace_id !== wsId) throw new HttpError(404, 'No such channel on this workspace');

        const { error } = await supabaseClient.from('messaging_channels')
          .update({
            config: { ...((ch.config || {}) as Record<string, unknown>), send_read_receipts: enabled },
            updated_at: new Date().toISOString(),
          })
          .eq('id', channelId);
        if (error) throw new HttpError(500, `Could not save the setting: ${error.message}`);

        return jsonResponse({ success: true, channel_id: channelId, send_read_receipts: enabled });
      }

      // ─────────────────────────────────────────────────────────────
      // Charge the month's recurring channel lines.
      //
      // Seats and rented numbers were metered and never billed: a workspace could hold four
      // connected accounts and a Greek number, cost the platform $15/month, and pay nothing.
      // Idempotent on (workspace, type, month) — running this twice bills nobody twice.
      // ─────────────────────────────────────────────────────────────
      // Re-attempt unpaid months and lift the hold once a workspace is fully settled. Nightly,
      // not monthly: a customer who tops up on the 3rd should not sit on hold until the 1st.
      case 'retry-failed-charges': {
        // The operator sweeps everybody (this is the nightly cron's call). Anyone else is
        // clamped to the one workspace they run — the scope is derived from the JWT and the
        // membership row, never from the body, so a tenant cannot spend another tenant's
        // credits by naming their workspace here.
        let scope: string | undefined;
        if (!isAdminAccess(auth)) {
          const wsId = await resolveTargetWorkspaceId(requestBody.workspaceId);
          if (!wsId) throw new HttpError(400, 'workspaceId is required (you belong to more than one workspace)');
          const { data: role } = await supabaseClient
            .from('workspace_members').select('role')
            .eq('workspace_id', wsId).eq('user_id', auth.userId).eq('status', 'active').maybeSingle();
          if (!['owner', 'admin'].includes(String(role?.role ?? ''))) {
            throw new HttpError(403, 'Only a workspace owner or admin can retry a failed charge');
          }
          scope = wsId;
        }
        const result = await retryFailedCharges(supabaseClient, scope);
        return jsonResponse({ success: true, ...result });
      }

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
      // Read receipts, per number.
      //
      // Whether the customer sees a blue tick is a business decision and it differs by desk: a
      // sales team usually wants it, a support desk triaging overnight usually does not, because
      // "read, no reply" lands worse than silence. Stored on the channel rather than globally —
      // one workspace can run both kinds of number.
      // ─────────────────────────────────────────────────────────────
      case 'set-channel-read-receipts': {
        const channelId = String(requestBody.channelId || '').trim();
        const enabled = requestBody.enabled !== false;
        if (!channelId) throw new HttpError(400, 'channelId is required');

        const wsId = await resolveTargetWorkspaceId(requestBody.workspaceId);
        if (!wsId) throw new HttpError(400, 'workspaceId is required (you belong to more than one workspace)');

        // The channel id comes from the client, so it is bound to the caller's workspace before
        // anything is written — otherwise one tenant could silence another tenant's receipts.
        const { data: ch } = await supabaseClient
          .from('messaging_channels').select('id, config, workspace_id')
          .eq('id', channelId).maybeSingle();
        if (!ch || ch.workspace_id !== wsId) throw new HttpError(404, 'No such channel on this workspace');

        const { error } = await supabaseClient.from('messaging_channels')
          .update({
            config: { ...((ch.config || {}) as Record<string, unknown>), send_read_receipts: enabled },
            updated_at: new Date().toISOString(),
          })
          .eq('id', channelId);
        if (error) throw new HttpError(500, `Could not save the setting: ${error.message}`);

        return jsonResponse({ success: true, channel_id: channelId, send_read_receipts: enabled });
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
        if (!(await isWorkspaceEntitled(supabaseClient, wsId, 'messaging'))) return notEntitledResponse('messaging');

        // Open to the tenant now, but only to someone who runs the workspace. Releasing is
        // irreversible and takes the number away from everyone using it — not a thing an ordinary
        // member should be able to do on the workspace's behalf.
        if (!isAdminAccess(auth)) {
          const { data: role } = await supabaseClient
            .from('workspace_members').select('role')
            .eq('workspace_id', wsId).eq('user_id', auth.userId).eq('status', 'active').maybeSingle();
          if (!['owner', 'admin'].includes(String(role?.role ?? ''))) {
            throw new HttpError(403, 'Only a workspace owner or admin can give up a number');
          }
        }

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
      // ─────────────────────────────────────────────────────────────
      // backfill-inbox — pull conversations Zernio holds into the unified inbox.
      //
      // Re-running this is NORMAL, not a repair. A coexistence number's history arrives from Meta
      // asynchronously over hours: the first run on 2026-08-24 found 8 conversations because the
      // sync was 19% complete, and the rest only became fetchable later. So the action is
      // idempotent by construction — the webhook handler skips any message whose provider id is
      // already filed (inbox_messages_wamid_unique) — and running it a second time picks up what
      // has since landed without filing a duplicate of anything.
      //
      // `phone` / `conversationId` narrow it to ONE conversation, which is how you chase a
      // specific chat that has not shown up. That is deliberately a FILTER on the same loop
      // rather than a second importer: the one thing worse than a missing conversation is two
      // import paths that disagree about how a message becomes a thread.
      // ─────────────────────────────────────────────────────────────
      // ─────────────────────────────────────────────────────────────
      // repair-attachments — fetch media we filed a LINK to but never downloaded.
      //
      // An inbound media message arrives with the provider's own URL:
      //   https://zernio.com/api/v1/whatsapp/media/{id}?accountId=...
      // which is an authenticated API endpoint, not a file. Until the bytes are pulled server-side
      // the browser cannot render it — it shows a broken image — and the message is stuck that way
      // permanently, because a webhook fires once.
      //
      // Cheaper and narrower than the back-fill, which lists conversations from Zernio and replays
      // every message: this reads the rows that are actually broken and fetches only those.
      // ─────────────────────────────────────────────────────────────
      case 'repair-attachments': {
        const { workspaceId, threadId, messageId } = requestBody;
        const wsId = await resolveTargetWorkspaceId(workspaceId);
        if (!wsId) throw new HttpError(400, 'workspaceId is required (you belong to more than one workspace)');
        { const gate = await requireMessaging(wsId); if (gate) return gate; }

        let q = supabaseClient
          .from('inbox_messages')
          .select('id, thread_id, attachments, inbox_threads!inner(workspace_id, channel)')
          .eq('inbox_threads.workspace_id', wsId)
          .not('attachments', 'eq', '[]')
          .limit(200);
        if (messageId) q = q.eq('id', String(messageId));
        else if (threadId) q = q.eq('thread_id', String(threadId));

        const { data: rows, error: readErr } = await q;
        if (readErr) throw new HttpError(500, `Could not read messages: ${readErr.message}`);

        let repaired = 0;
        let stillBroken = 0;
        const errors: string[] = [];

        for (const row of (rows ?? []) as Array<{ id: string; thread_id: string; attachments: Array<Record<string, unknown>> }>) {
          const atts = Array.isArray(row.attachments) ? row.attachments : [];
          // Only the ones holding a link we never resolved. An attachment already in our storage
          // is left alone — re-fetching it would burn a download to produce the same bytes.
          const broken = atts.filter((a) => !a.storage_object_path && typeof a.url === 'string' && a.url);
          if (!broken.length) continue;

          try {
            const fixed = await materialiseInlineAttachments(supabaseClient, row.thread_id, broken);
            const ok = fixed.filter((a) => a.storage_object_path);
            if (!ok.length) { stillBroken++; continue; }

            // Keep the ones that were already fine, replace the ones we just fetched.
            const merged = [...atts.filter((a) => a.storage_object_path), ...ok];
            const { error: upErr } = await supabaseClient
              .from('inbox_messages').update({ attachments: merged }).eq('id', row.id);
            if (upErr) { errors.push(`${row.id}: ${upErr.message}`); continue; }
            repaired += ok.length;
          } catch (err) {
            errors.push(`${row.id}: ${String(err)}`);
          }
        }

        return jsonResponse({
          success: true,
          scanned: (rows ?? []).length,
          repaired,
          still_broken: stillBroken,
          // Never a silent partial — "0 repaired" and "0 needed repair" are different answers.
          message: repaired === 0 && stillBroken === 0
            ? 'Nothing needed repairing — every attachment is already stored.'
            : stillBroken > 0
              ? `${repaired} recovered; ${stillBroken} could not be fetched (the media may have expired on WhatsApp).`
              : `${repaired} attachment(s) recovered.`,
          errors: errors.slice(0, 10),
        });
      }

      // ─────────────────────────────────────────────────────────────
      // sync-avatars — go and GET the profile photos.
      //
      // Every WhatsApp thread rendered as coloured initials because the only place we ever looked
      // for a photo was `conversation.participantPicture` on an inbound webhook, and that field is
      // OPTIONAL: measured absent on four consecutive real `message.received` payloads.
      //
      // `GET /v1/inbox/conversations` documents `participantPicture` on every conversation it
      // returns, and each of our threads carries the `zernio_conversation_id` it belongs to, so
      // the match is exact rather than a phone-number guess. Same shape as inbound media, which
      // works for exactly this reason: we fetch the bytes instead of waiting to be handed a link.
      //
      // Also refreshes OUR OWN number's photo — a different endpoint, because that is a business
      // profile rather than a conversation participant.
      // ─────────────────────────────────────────────────────────────
      // ─────────────────────────────────────────────────────────────
      // zernio-probe — ask Zernio a question without shipping a release.
      //
      // The API key lives only in the edge runtime, so "what does this endpoint actually
      // return?" could not be answered from a terminal. Every such question therefore cost a
      // full deploy, and each deploy answered exactly one narrowly-guessed question. Two days of
      // the profile-photo hunt went that way: reading the spec, guessing, shipping, learning one
      // fact, guessing again. The spec says what a field MAY hold; only a response says what it
      // does, and there was no way to look.
      //
      // GET only, and the path is appended to the pinned Zernio base by `zernioApi` — so no
      // caller-supplied host (invariant 7 cannot be reached from here) and nothing that mutates.
      // Admin only, because a raw read of the provider crosses every workspace on the key.
      // ─────────────────────────────────────────────────────────────
      case 'zernio-probe': {
        if (!isAdminAccess(auth)) throw new HttpError(404, 'Not found');

        const rawPath = typeof requestBody.path === 'string' ? requestBody.path.trim() : '';
        if (!rawPath.startsWith('/')) {
          throw new HttpError(400, 'path is required and must start with "/" (e.g. /inbox/conversations?limit=1)');
        }
        // No scheme, no host, no traversal — the base URL is `zernioApi`'s and stays that way.
        if (/^\/\//.test(rawPath) || rawPath.includes('..') || /https?:/i.test(rawPath)) {
          throw new HttpError(400, 'path must be a bare API path, not a URL');
        }

        try {
          const data = await zernioApi('GET', rawPath);
          // `keys_only` for a question about SHAPE — which is most of them — so a shape check
          // never has to pull somebody's conversation text back through here to answer it.
          if (requestBody.keys_only) {
            const shapeOf = (v: unknown): unknown => {
              if (Array.isArray(v)) return v.length ? [shapeOf(v[0]), `…${v.length} items`] : [];
              if (v && typeof v === 'object') {
                const out: Record<string, string> = {};
                for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
                  out[k] = val === null ? 'null'
                    : Array.isArray(val) ? `array(${val.length})`
                    : typeof val === 'object' ? 'object'
                    : `${typeof val}${typeof val === 'string' && val ? '' : '(empty)'}`;
                }
                return out;
              }
              return typeof v;
            };
            return jsonResponse({ success: true, path: rawPath, shape: shapeOf(data) });
          }
          return jsonResponse({ success: true, path: rawPath, data });
        } catch (err) {
          // Returned, not thrown: the STATUS is usually the answer (404 says the route does not
          // exist, 401 says the key lacks that resource group), and a 500 here would hide it.
          return jsonResponse({
            success: false,
            path: rawPath,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }

      // ─────────────────────────────────────────────────────────────
      // generate-avatar-cast — render the cast of character avatars, once.
      //
      // WhatsApp gives a business no customer profile picture (measured: 0 of 100 conversations,
      // 0 of 516 contact records), so every contact needs a stand-in and it should look drawn
      // rather than like a missing image.
      //
      // A CAST, not one render per contact. 516 contacts would be 516 generations to bill, store
      // and wait for, and the style would drift between calls; a few dozen characters assigned by
      // a hash of the contact id costs a couple of dollars once, is instant from then on, and
      // every contact keeps the same face forever.
      //
      // `prompt` and `variations` are overridable so the look can be iterated from a terminal.
      // The alternative is a deploy per attempt, which is how the profile-photo hunt burned two
      // days — see `zernio-probe` for the same lesson.
      // ─────────────────────────────────────────────────────────────
      case 'generate-avatar-cast': {
        if (!isAdminAccess(auth)) throw new HttpError(404, 'Not found');

        const count = Math.min(Math.max(Number(requestBody.count) || 12, 1), 48);
        const startIndex = Math.max(Number(requestBody.startIndex) || 0, 0);
        const basePrompt = typeof requestBody.prompt === 'string' && requestBody.prompt.trim()
          ? requestBody.prompt.trim()
          : 'A friendly 3D cartoon avatar of a single human head and shoulders, rendered in a '
            + 'glossy soft-plastic style with smooth rounded forms, large expressive eyes, warm '
            + 'subsurface skin shading and soft studio lighting. Head centred and facing forward, '
            + 'gentle smile, clean flat pure-white background, no text, no watermark, no border.';

        // Diversity is spread across the CAST deliberately — it is a set of characters, and a set
        // that is all one age or one hair length just looks broken. Nothing here is derived from
        // any real contact; assignment to a person happens later, by hash of their id.
        const DEFAULT_VARIATIONS = [
          'young woman, long dark wavy hair, warm brown skin, small gold earrings',
          'older man, short grey hair, neat grey beard, glasses with dark rectangular frames, light skin',
          'young man, short black textured hair, deep brown skin, wide friendly smile',
          'woman in her thirties, blonde shoulder-length bob, fair skin, light freckles',
          'man in his forties, brown hair swept to one side, olive skin, clean shaven',
          'young woman, black hair in a high bun, East Asian features, round thin-rimmed glasses',
          'man with a shaved head, dark brown skin, short full beard, broad smile',
          'woman with curly auburn hair, pale skin, green eyes, small silver nose stud',
          'older woman, silver hair in a short crop, light skin, warm smile, pearl earrings',
          'young man, red hair, freckled fair skin, big grin, no facial hair',
          'woman wearing a deep purple headscarf, brown skin, dark eyes, subtle smile',
          'man with long black hair tied back, tan skin, thin moustache',
          'young woman, straight black hair with a blunt fringe, light tan skin, red lipstick',
          'man in his fifties, receding light brown hair, ruddy skin, thick eyebrows',
          'woman with tightly coiled black hair worn full, dark skin, round tortoiseshell glasses',
          'young man, dark blonde undercut, fair skin, small stud earring',
          'woman with straight brown hair past the shoulders, medium skin, hazel eyes',
          'man with a turban, dark full beard, brown skin, calm expression',
          'young woman, pink-dyed short hair, pale skin, cat-eye glasses',
          'older man, bald on top with grey at the sides, light skin, moustache',
          'woman with box braids gathered back, deep brown skin, bright smile',
          'man with wavy dark hair, Mediterranean skin, light stubble',
          'young woman, ash-brown ponytail, fair skin, dimples',
          'man with short salt-and-pepper hair, medium skin, rectangular glasses',
        ];
        const variations: string[] = Array.isArray(requestBody.variations) && requestBody.variations.length
          ? requestBody.variations.map((v: unknown) => String(v))
          : DEFAULT_VARIATIONS;

        const made: Array<{ slot: number; path: string }> = [];
        const errors: string[] = [];

        for (let i = 0; i < count; i++) {
          const slot = startIndex + i;
          const variation = variations[slot % variations.length];
          const prompt = `${basePrompt} The character is a ${variation}.`;
          try {
            const img = await generateImageWithGemini(prompt, {
              aspectRatio: '1:1',
              task: 'inbox_avatar_cast',
            });
            const bytes = Uint8Array.from(atob(img.base64), (c) => c.charCodeAt(0));
            // A FIXED path per slot, so re-running replaces a character rather than growing the
            // cast — otherwise every iteration on the prompt leaves the rejects behind and the
            // assignment picks them up.
            const path = `avatars/cast/${String(slot).padStart(3, '0')}.png`;
            const { error: upErr } = await supabaseClient.storage
              .from('generation-images')
              .upload(path, bytes, { contentType: img.mimeType || 'image/png', upsert: true });
            if (upErr) { errors.push(`${slot}: ${upErr.message}`); continue; }
            made.push({ slot, path });
          } catch (err) {
            errors.push(`${slot}: ${err instanceof Error ? err.message : String(err)}`);
          }
        }

        return jsonResponse({
          success: true,
          generated: made.length,
          requested: count,
          cast: made,
          bucket: 'generation-images',
          // Said plainly: a partial run is the normal failure here (a safety refusal on one
          // prompt, a rate limit) and "generated 9 of 12" must not read as a full cast.
          message: made.length === count
            ? `${made.length} character(s) rendered into avatars/cast/.`
            : `${made.length} of ${count} rendered — the rest failed, see errors.`,
          errors: errors.slice(0, 10),
        });
      }

      case 'sync-avatars': {
        const { workspaceId, threadId: onlyThreadId, force, debug } = requestBody;
        const wsId = await resolveTargetWorkspaceId(workspaceId);
        if (!wsId) throw new HttpError(400, 'workspaceId is required (you belong to more than one workspace)');
        { const gate = await requireMessaging(wsId); if (gate) return gate; }

        const { data: channels } = await supabaseClient
          .from('messaging_channels')
          .select('id, config, zernio_account_id')
          .eq('workspace_id', wsId)
          .eq('channel_type', 'whatsapp')
          .not('zernio_account_id', 'is', null);

        const chans = (channels ?? []) as Array<{ id: string; config: Record<string, unknown>; zernio_account_id: string }>;
        if (!chans.length) {
          return jsonResponse({
            success: true, conversations: 0, with_picture: 0, stored: 0, own_avatar: false,
            message: 'No connected WhatsApp number in this workspace.',
          });
        }

        /**
         * Once a day, not once a page load.
         *
         * The inbox calls this whenever a thread has no photo, and on WhatsApp that is now the
         * permanent state — measured 2026-08-24 against the live number: 100 conversations and
         * 516 contact records, zero photos in either, no errors. Meta does not give a business a
         * customer's profile picture unless that contact has published it.
         *
         * So the honest cost of the auto-sync is four Zernio calls on every single page load,
         * forever, to re-learn the same nothing. The stamp is on the CHANNEL rather than in the
         * browser because it is a fact about the number, not about one person's tab — otherwise
         * every teammate and every device pays it separately.
         *
         * `force` is the way past it, for the case where someone HAS just changed their photo.
         * Only the throttle is skipped, never the work.
         */
        const THROTTLE_MS = 24 * 60 * 60 * 1000;
        if (!force && !onlyThreadId) {
          const stamps = chans
            .map((c) => (c.config ?? {}).avatars_checked_at)
            .filter((v): v is string => typeof v === 'string');
          const freshest = stamps.length ? Math.max(...stamps.map((v) => Date.parse(v) || 0)) : 0;
          if (freshest && Date.now() - freshest < THROTTLE_MS) {
            return jsonResponse({
              success: true,
              skipped: true,
              conversations: 0, with_picture: 0, stored: 0, own_avatar: false,
              checked_at: new Date(freshest).toISOString(),
              message: 'Profile photos were already checked in the last 24 hours. Re-run with force to check again.',
            });
          }
        }

        // Our threads for this workspace, keyed by the Zernio conversation each one mirrors.
        let tq = supabaseClient
          .from('inbox_threads')
          .select('id, metadata')
          .eq('workspace_id', wsId)
          .eq('channel', 'whatsapp');
        if (onlyThreadId) tq = tq.eq('id', String(onlyThreadId));
        const { data: threadRows, error: tErr } = await tq;
        if (tErr) throw new HttpError(500, `Could not read threads: ${tErr.message}`);

        type AvatarTarget = { id: string; avatarSource: string | null; hasPhoto: boolean; name: string };
        const byConversation = new Map<string, AvatarTarget>();
        // A second index by phone digits, because the contacts endpoint identifies people by
        // `platformIdentifier` (the number) while conversations identify them by id.
        const byPhone = new Map<string, AvatarTarget>();
        for (const t of (threadRows ?? []) as Array<{ id: string; metadata: Record<string, unknown> }>) {
          const meta = (t.metadata ?? {}) as Record<string, unknown>;
          const prof = (meta.wa_profile ?? {}) as Record<string, unknown>;
          const target: AvatarTarget = {
            id: t.id,
            // Present AND already downloaded. A source recorded next to a null path means the last
            // download failed, so that one is retried rather than counted as done.
            avatarSource: (typeof prof.avatar_source === 'string' && typeof prof.avatar_path === 'string')
              ? prof.avatar_source : null,
            hasPhoto: typeof prof.avatar_path === 'string',
            name: typeof prof.name === 'string' ? prof.name : '',
          };
          const convId = typeof meta.zernio_conversation_id === 'string' ? meta.zernio_conversation_id : '';
          if (convId) byConversation.set(convId, target);
          const phone = typeof meta.contact_phone === 'string' ? meta.contact_phone.replace(/\D/g, '') : '';
          if (phone) byPhone.set(phone, target);
        }

        /**
         * What the provider ACTUALLY sends, in field names.
         *
         * This exists because the photo question was answered twice from the SPEC and both
         * answers were wrong — confidently enough that "participantPicture is in every payload"
         * went into a comment as fact and a working lookup was deleted on the strength of it. A
         * schema says what a field MAY hold; only a response says what it does. `avatarUrl` is
         * declared on both the contacts LIST and the contacts DETAIL, and the docs do not say
         * what fills either, so both get asked and both get reported.
         *
         * Key names only, never values: the question is which fields carry something, and the
         * values are someone's private conversation.
         */
        const shapes: Record<string, unknown> = {};

        let conversations = 0;
        let withPicture = 0;
        let stored = 0;
        let contactsScanned = 0;
        let contactsWithAvatar = 0;
        let fromContacts = 0;
        let ownAvatar = false;
        const errors: string[] = [];

        for (const chan of chans) {
          const accountId = chan.zernio_account_id;

          // ── our own number's photo (a business profile, not a conversation) ──
          const knownCfg = (chan.config ?? {}) as Record<string, unknown>;
          const own = await fetchOwnBusinessAvatar(supabaseClient, accountId, knownCfg, zernioApi);
          // Said out loud rather than counted as a plain failure: "you have not set one" and "we
          // could not fetch it" are different answers, and only one of them is ours to fix.
          if (own.error) errors.push(`own avatar: ${own.error}`);
          if (own.fragment.avatar_path) {
            // CHECKED: supabase-js RESOLVES on an RLS denial, so an unchecked write here would
            // report the photo as synced while the row still points at nothing — and the operator
            // would keep seeing initials with every signal green.
            const { error: cfgErr } = await supabaseClient.from('messaging_channels').update({
              config: { ...knownCfg, ...own.fragment },
              updated_at: new Date().toISOString(),
            }).eq('id', chan.id);
            if (cfgErr) errors.push(`own avatar: ${cfgErr.message}`);
            else ownAvatar = true;
          }

          // ── every counterparty ──
          let cursor: string | undefined;
          let pages = 0;
          for (;;) {
            if (pages >= 20) { errors.push(`${accountId}: stopped at 20 pages — run again to continue`); break; }
            const qs = new URLSearchParams({ accountId, limit: '100' });
            if (cursor) qs.set('cursor', cursor);

            let page: any;
            try {
              page = await zernioApi('GET', `/inbox/conversations?${qs.toString()}`);
            } catch (err) {
              errors.push(`${accountId}: ${err instanceof Error ? err.message : String(err)}`);
              break;
            }

            const items = (page?.data ?? page?.conversations ?? []) as Array<Record<string, any>>;
            if (debug && !shapes.conversation && items.length) {
              shapes.conversation_keys = Object.keys(items[0]).sort();
              // PRESENT-and-null is a different fact from ABSENT: the first says Zernio has the
              // field and Meta handed it nothing, the second says we may be asking wrongly.
              shapes.participantPicture_present = 'participantPicture' in items[0];
              shapes.participantPicture_type = items[0].participantPicture === null
                ? 'null' : typeof items[0].participantPicture;
              shapes.conversation = true;
            }
            for (const conv of items) {
              conversations++;
              const convId = typeof conv.id === 'string' ? conv.id : '';
              const pic = typeof conv.participantPicture === 'string' ? conv.participantPicture : '';
              if (!pic) continue;
              withPicture++;
              const target = convId ? byConversation.get(convId) : undefined;
              if (!target) continue;                      // a conversation we never imported
              if (target.avatarSource === pic) continue;  // the same photo, already held
              const ok = await storeParticipantPicture(
                supabaseClient, target.id, pic,
                typeof conv.participantName === 'string' ? conv.participantName : '',
              );
              if (ok) { stored++; target.hasPhoto = true; }
            }

            cursor = page?.nextCursor ?? page?.cursor ?? undefined;
            pages++;
            if (!cursor || !items.length) break;
          }

          // ── second source: Zernio's own contact records ──
          //
          // MEASURED 2026-08-25 against the live number, and the answer is that neither source
          // has a photo to give:
          //
          //   /inbox/conversations  100 results. `participantPicture` PRESENT on every one,
          //                         value `null`. Zernio has the field; Meta fills nothing.
          //   /contacts             516 results. `avatarUrl` NOT PRESENT AT ALL — not on the
          //                         list, not on `/contacts/{id}`. It is declared in Zernio's
          //                         OpenAPI schema and on docs.zernio.com and the live API does
          //                         not return it. (`channels` on the detail response is the
          //                         same: documented, absent.)
          //
          // Kept rather than deleted, because the two are different origins — Meta feeds the
          // conversation, the handset's address book feeds the contact under coexistence — and a
          // field Zernio ships later would be picked up here for free. Throttled to once a day,
          // so the cost of asking is three requests per day, not three per page load.
          //
          // Do NOT re-derive this from the spec. Both wrong answers in this file's history came
          // from reading a schema and believing it; use `zernio-probe` and look.
          //
          // Only for threads still without a photo, and matched on the digits of the number
          // because contacts are keyed by `platformIdentifier` rather than by conversation id.
          if (Array.from(byPhone.values()).some((t) => !t.hasPhoto)) {
            let skip = 0;
            for (let cpage = 0; cpage < 10; cpage++) {
              let cres: any;
              try {
                const cqs = new URLSearchParams({
                  accountId, platform: 'whatsapp', limit: '200', skip: String(skip),
                });
                cres = await zernioApi('GET', `/contacts?${cqs.toString()}`);
              } catch (err) {
                errors.push(`contacts: ${err instanceof Error ? err.message : String(err)}`);
                break;
              }
              const cItems = (cres?.contacts ?? cres?.data ?? []) as Array<Record<string, any>>;
              if (!cItems.length) break;
              if (debug && !shapes.contact && cItems.length) {
                shapes.contact_list_keys = Object.keys(cItems[0]).sort();
                shapes.list_avatarUrl_present = 'avatarUrl' in cItems[0];
                shapes.list_avatarUrl_type = cItems[0].avatarUrl === null ? 'null' : typeof cItems[0].avatarUrl;
                // How many of the WHOLE page carry one, not just the first — a single sample
                // would say nothing about a field that is populated for some people and not others.
                shapes.list_with_avatar = cItems.filter((c) => typeof c.avatarUrl === 'string' && c.avatarUrl).length;
                shapes.list_page_size = cItems.length;

                // The DETAIL endpoint is a SEPARATE read and may fill fields the list omits.
                // Assuming otherwise is the exact shape of this whole bug, so it gets asked.
                if (cItems[0].id) {
                  try {
                    const one = await zernioApi('GET', `/contacts/${encodeURIComponent(String(cItems[0].id))}`);
                    const c1 = (one?.contact ?? one?.data ?? null) as Record<string, any> | null;
                    if (c1) {
                      shapes.contact_detail_keys = Object.keys(c1).sort();
                      shapes.detail_avatarUrl_present = 'avatarUrl' in c1;
                      shapes.detail_avatarUrl_type = c1.avatarUrl === null ? 'null' : typeof c1.avatarUrl;
                      shapes.detail_avatarUrl_filled = typeof c1.avatarUrl === 'string' && !!c1.avatarUrl;
                      shapes.detail_channel_keys = Array.isArray(c1.channels) && c1.channels.length
                        ? Object.keys(c1.channels[0]).sort() : [];
                    }
                  } catch (err) {
                    shapes.contact_detail_error = err instanceof Error ? err.message : String(err);
                  }
                }
                shapes.contact = true;
              }
              for (const c of cItems) {
                contactsScanned++;
                const avatar = typeof c.avatarUrl === 'string' ? c.avatarUrl : '';
                if (!avatar) continue;
                contactsWithAvatar++;
                const digits = String(c.platformIdentifier ?? c.displayIdentifier ?? '').replace(/\D/g, '');
                if (!digits) continue;
                const target = byPhone.get(digits);
                if (!target || target.hasPhoto || target.avatarSource === avatar) continue;
                const ok = await storeParticipantPicture(
                  supabaseClient, target.id, avatar,
                  typeof c.name === 'string' ? c.name : target.name,
                );
                if (ok) { fromContacts++; target.hasPhoto = true; }
              }
              if (cItems.length < 200) break;
              skip += 200;
            }
          }
        }

        // Stamped whatever the outcome: "we asked and there were none" is exactly the answer the
        // throttle exists to avoid re-buying, and only stamping on success would mean the empty
        // case — the common one — never throttles at all.
        for (const chan of chans) {
          // RE-READ before merging. `fetchOwnBusinessAvatar` may have written this same config
          // earlier in this run, and `chan.config` is the value from before that write — spreading
          // the stale copy would erase the avatar path we just stored, on the one channel whose
          // photo actually exists.
          const { data: fresh } = await supabaseClient
            .from('messaging_channels').select('config').eq('id', chan.id).maybeSingle();
          const cfg = ((fresh as { config?: Record<string, unknown> } | null)?.config
            ?? chan.config ?? {}) as Record<string, unknown>;
          const { error: stampErr } = await supabaseClient.from('messaging_channels').update({
            config: { ...cfg, avatars_checked_at: new Date().toISOString() },
            updated_at: new Date().toISOString(),
          }).eq('id', chan.id);
          if (stampErr) errors.push(`stamp: ${stampErr.message}`);
        }

        return jsonResponse({
          success: true,
          conversations,
          with_picture: withPicture,
          contacts_scanned: contactsScanned,
          contacts_with_avatar: contactsWithAvatar,
          from_contacts: fromContacts,
          stored,
          own_avatar: ownAvatar,
          ...(debug ? { provider_shape: shapes } : {}),
          // Every count is a different diagnosis, and one "synced N" would hide all of them: no
          // conversations = the listing failed; conversations but no pictures = the platform
          // withholds them; pictures but nothing stored = we already hold them, or those threads
          // were never imported.
          // BOTH sources are named in the answer. "No photos" is only true once the conversation
          // list AND the contact records have both been asked, and saying which one had them is
          // what turns a bare zero into something anybody can act on.
          message: conversations === 0
            ? 'Zernio returned no conversations for this number.'
            : (stored + fromContacts) > 0
              ? `${stored + fromContacts} profile photo(s) downloaded (${stored} from conversations, ${fromContacts} from contact records).`
              : (withPicture + contactsWithAvatar) === 0
                ? `${conversations} conversation(s) and ${contactsScanned} contact record(s) checked — neither source carries a photo. WhatsApp does not hand a customer's profile picture to a business unless that contact has made it public.`
                : `${withPicture + contactsWithAvatar} photo(s) are available and every one was already stored.`,
          errors: errors.slice(0, 10),
        });
      }

      case 'backfill-inbox': {
        const { workspaceId, limit, phone: onlyPhone, conversationId: onlyConversationId } = requestBody;
        // Compare digits only: Zernio hands back `306948408542`, a person types `+30 694 840 8542`,
        // and a substring match either way round is what makes both work without a parser.
        const wantDigits = String(onlyPhone ?? '').replace(/\D/g, '');
        const wantConversation = String(onlyConversationId ?? '').trim();
        const targeted = !!(wantDigits || wantConversation);
        const wsId = await resolveTargetWorkspaceId(workspaceId);
        if (!wsId) throw new HttpError(400, 'workspaceId is required (you belong to more than one workspace)');
        { const gate = await requireMessaging(wsId); if (gate) return gate; }

        // Default raised with paging: 50 was a single page, and the old ceiling of 200 was
        // chosen when one request was all we made.
        const cap = Math.min(Math.max(Number(limit) || 500, 1), 1000);

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
        // Only meaningful when targeted, and it is the whole verdict there: 0 means Zernio does
        // not have that conversation yet (Meta is still syncing it, or it never flowed through
        // the API), which is a completely different problem from "we imported it and it was
        // empty". Reporting only `imported` would collapse the two into the same 0.
        let matched = 0;
        const errors: string[] = [];
        // Why the handler declined, tallied. "Nothing arrived" is not a diagnosis; "47 messages
        // had no workspace bound to Zernio account X" is one, and it names the fix.
        const dropReasons: Record<string, number> = {};
        // A named conversation is searched for across accounts; only a total miss is an error.
        let namedRead = false;
        const namedErrors: string[] = [];

        for (const accountId of accountIds) {
          let convs: Array<Record<string, any>> = [];
          // A NAMED conversation is fetched, not searched for.
          //
          // The listing is how you discover conversations; it is not how you reach one you can
          // already name. It does not return everything — thread 7538b29e's conversation answered
          // `/inbox/conversations/{id}/messages` with 50 messages while appearing on no page of
          // the list — so scanning for an id we were handed found nothing and the caller was told
          // "WhatsApp has not handed that conversation over yet. Try again later." That is a
          // diagnosis, it names a cause, and it was false: the conversation was there and
          // readable the whole time. Waiting was the one thing that could not fix it.
          if (wantConversation) {
            convs = [{ id: wantConversation }];
          } else {
            try {
              // PAGE through them. This read one page and stopped, so `limit` was not "how many to
              // import" but "how many exist as far as we are concerned" — a number with hundreds of
              // conversations back-filled the first fifty and reported success. Walk until a short
              // page comes back, capped so a large account cannot run the function out of time.
              const pageSize = 50;
              for (let page = 1; page <= 20 && convs.length < cap; page++) {
                const qs = new URLSearchParams({
                  accountId,
                  limit: String(Math.min(pageSize, cap - convs.length)),
                  page: String(page),
                });
                const data = await zernioApi('GET', `/inbox/conversations?${qs.toString()}`);
                const batch = (data.data ?? data.conversations ?? []) as Array<Record<string, any>>;
                convs.push(...batch);
                if (batch.length < pageSize) break;
              }
            } catch (err) {
              // One account's failure must not abandon the others — a revoked token on a single
              // number would otherwise silently truncate the whole backfill.
              errors.push(`${accountId}: ${String(err)}`);
              continue;
            }
          }

          for (const conv of convs) {
            if (targeted) {
              const convDigits = [conv.participantPhone, conv.participantId, conv.contactId]
                .map((v) => String(v ?? '').replace(/\D/g, '')).filter(Boolean);
              const phoneHit = wantDigits
                && convDigits.some((d) => d.endsWith(wantDigits) || wantDigits.endsWith(d));
              const idHit = wantConversation && String(conv.id) === wantConversation;
              if (!phoneHit && !idHit) continue;
              matched++;
            }
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
              // A NAMED conversation is tried against every connected account, because the caller
              // gives us an id and not the account that owns it — so the accounts that do not own
              // it answer 400/404 and that is the search working, not a fault. Held back and only
              // surfaced if NO account could read it; reported per-account it would put a scary
              // error next to a backfill that had just succeeded.
              if (wantConversation) namedErrors.push(`${accountId}: ${String(err)}`);
              else errors.push(`${conv.id}: ${String(err)}`);
              continue;
            }
            if (wantConversation) namedRead = true;

            for (const m of messages) {
              // Replay each one through the webhook handler's own path so the backfill and the
              // live path can never diverge into two different importers — the second copy is
              // exactly how "it works live but not on replay" gets built.
              // Media keys forwarded WHOLESALE rather than picked.
              //
              // The replay used to hand the handler `attachments: m.attachments ?? []` — one
              // guessed field name, resolved HERE, before the handler's normaliser could look at
              // anything else. So a message whose media arrived under `media` or `mediaUrl` was
              // stripped in transit and the handler correctly reported no attachment on a payload
              // that no longer had one. Whatever Zernio calls it, it reaches the normaliser.
              const mediaPassthrough: Record<string, unknown> = {};
              for (const k of ['attachments', 'media', 'files', 'documents', 'attachment', 'file',
                               'document', 'image', 'video', 'audio', 'mediaUrl', 'fileUrl',
                               'attachmentUrl', 'mediaType', 'mimeType', 'fileName', 'caption']) {
                if (m[k] !== undefined) mediaPassthrough[k] = m[k];
              }

              const replayBody = JSON.stringify({
                  event: 'message.received',
                  // THE flag that separates "a customer just wrote to us" from "we are filing
                  // paperwork". The handler replays history through the live path on purpose —
                  // one importer, so replay and live cannot diverge — and the price of that is
                  // that without this marker an import IS N new inbound messages: N assistant
                  // takeovers, N auto-replies, N notifications, order intake over months of old
                  // chat. On 2026-08-24 that shipped 22 AI replies into 8 real conversations.
                  backfill: true,
                  account: { accountId, platform: conv.platform },
                  message: {
                    id: m.id,
                    platformMessageId: m.platformMessageId ?? m.id,
                    platform: conv.platform,
                    direction: m.direction ?? 'incoming',
                    text: m.text ?? m.message ?? null,
                    ...mediaPassthrough,
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
          // Targeted runs only. Distinguishes "we could not find that chat" from "we found it and
          // it had nothing new", which are the same `imported: 0` and need opposite responses.
          matched: targeted ? matched : undefined,
          // The handler's own words, counted. No log-diving to find out why an inbox is empty.
          drop_reasons: Object.keys(dropReasons).length ? dropReasons : undefined,
          message: targeted && matched === 0
            ? 'WhatsApp has not handed that conversation over yet. On a coexistence number Meta '
              + 'syncs history in the background over several hours — the chat stays on the phone '
              + 'and only becomes importable once that sync reaches it. Try again later.'
            : wantConversation && !namedRead
              ? 'No connected account could read that conversation — check the id. This is NOT '
                + 'the coexistence sync lagging: the id was fetched directly, so a failure here '
                + 'means the conversation does not exist on any account we hold, and waiting '
                + 'will not change it. See errors.'
              : targeted && imported === 0
                ? 'That conversation was found and every message in it is already in the inbox.'
                : accepted > 0 && imported === 0
                  ? 'Every message was accepted and none was filed — see drop_reasons for why. '
                    + '("already imported" here just means it was pulled in by an earlier run.)'
                  : scanned === 0
                    ? 'Zernio returned no conversations for these accounts. A number connected in '
                      + 'coexistence mode keeps its existing chats on the phone; only messages that '
                      + 'flow through Zernio after connecting are its to hand back.'
                    : undefined,
          // Never a silent partial: a truncated backfill that reports plain success is
          // indistinguishable from one that found nothing.
          errors: (namedRead ? errors : [...errors, ...namedErrors]).slice(0, 20),
          truncated: (namedRead ? errors : [...errors, ...namedErrors]).length > 20,
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
            .from('messaging_channels').select('id, config')
            .eq('zernio_account_id', accountId).maybeSingle();

          // The number's OWN WhatsApp Business profile — including the photo customers actually
          // see beside our messages. `GET /whatsapp/business-profile` returns it; nothing had ever
          // asked, so the operator's side of every thread rendered as initials while their real
          // avatar sat on WhatsApp. This is OUR profile: unlike a counterparty's, Meta does expose
          // it, and confusing the two is what made me tell the operator it was unavailable.
          const knownCfg = ((existing as { config?: Record<string, unknown> } | null)?.config ?? {}) as Record<string, unknown>;
          const own = await fetchOwnBusinessAvatar(supabaseClient, accountId, knownCfg, zernioApi);
          if (own.error) {
            console.warn(`[messaging-api] business profile for ${accountId}: ${own.error}`);
          }
          const profileCfg = own.profile ? own.fragment : {};

          if (existing) {
            // Zernio flags an account whose token Meta has invalidated. It still LISTS, so
            // treating the row as healthy left a channel that looked connected and failed
            // every send. needsReconnection is the only signal that says so.
            const needsReconnect = acc.needsReconnection === true;
            await supabaseClient.from('messaging_channels').update({
              sender_id: senderId,
              display_name: acc.displayName || senderId,
              is_active: acc.isActive !== false && !needsReconnect,
              config: { ...knownCfg, ...(acc.metadata ?? {}), ...profileCfg, zernio_account_id: accountId, display_phone_number: senderId, needs_reconnection: needsReconnect },
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
              config: { ...profileCfg, zernio_account_id: accountId, display_phone_number: senderId, needs_reconnection: acc.needsReconnection === true },
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
