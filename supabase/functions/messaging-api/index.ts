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
import { corsHeaders } from '../_shared/cors.ts';
import { debitExternalServiceCredits } from '../_shared/credit-utils.ts';
import { authenticate, isAdminAccess, listUserWorkspaceIds } from '../_shared/auth.ts';
import { isWorkspaceEntitled, notEntitledResponse } from '../_shared/entitlement.ts';
import { withApiLogging, HttpError } from '../_shared/api-logger.ts';
import { notConfiguredResponse } from '../_shared/api-provider-errors.ts';
import { sendDelayMs } from '../_shared/messaging-rate.ts';
import {
  zernioApi,
  zernioKey,
  resolveWorkspaceProfile,
  sendWhatsAppMessage,
} from '../_shared/zernio.ts';

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

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
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

    // Zernio is the engine for every WhatsApp action. Fail with a clean 503 +
    // admin-actionable settings path when the key is absent (mirrors the old
    // Twilio not-configured behaviour).
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
    const OPERATOR_ACTIONS = new Set(['send', 'send-bulk', 'connect-whatsapp', 'sync-channels', 'update-settings']);
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
     * reopen exactly what #250 C27 closed (operator-of-A attaching an account to workspace-B).
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
            debit = await debitExternalServiceCredits(
              supabaseClient, billingUserId, 'zernio-whatsapp', 'messaging_whatsapp', 1,
              { to },
            );
            if (!debit.success) {
              results.push({ to, success: false, error: debit.error || 'Insufficient credits' });
              continue;
            }
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
            });
          } catch (sendErr) {
            if (billingUserId && debit.credits_debited) await refundWhatsAppCredits(supabaseClient, billingUserId, debit.credits_debited, to);
            results.push({ to, success: false, error: sendErr instanceof Error ? sendErr.message : String(sendErr) });
            continue;
          }
          results.push({ to, ...result });

          if (result.success) {
            await supabaseClient.from('messaging_logs').insert({
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
        // T2-5 — cumulative daily cap: count what the channel already sent TODAY, not just this request's
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
            debit = await debitExternalServiceCredits(
              supabaseClient, billingUserId, 'zernio-whatsapp', 'messaging_bulk_whatsapp', 1,
              { to },
            );
            if (!debit.success) {
              results.push({ to, success: false, error: debit.error || 'Insufficient credits' });
              // Stop the bulk run once the owner is out of credits — no point retrying every row.
              break;
            }
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
            await supabaseClient.from('messaging_logs').insert({
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
      // Connect a WhatsApp number (Meta credentials → Zernio account)
      // ─────────────────────────────────────────────────────────────
      case 'connect-whatsapp': {
        const { accessToken, wabaId, phoneNumberId, displayName, workspaceId } = requestBody;
        if (!accessToken || !wabaId || !phoneNumberId) {
          throw new Error('accessToken, wabaId and phoneNumberId are required (from Meta Business Suite)');
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

        // Zernio: POST /v1/connect/whatsapp/credentials → { account: { accountId, username, displayName, selectedPhoneNumber } }
        const res = await zernioApi('POST', '/connect/whatsapp/credentials', {
          profileId, accessToken, wabaId, phoneNumberId,
        });
        const account = res?.account ?? {};
        const senderId = account.selectedPhoneNumber || account.username || phoneNumberId;

        const config = {
          zernio_account_id: account.accountId,
          waba_id: wabaId,
          phone_number_id: phoneNumberId,
          display_phone_number: senderId,
          profile_id: profileId,
        };

        // Insert or update by zernio_account_id (no reliance on a composite unique constraint).
        const { data: existing } = await supabaseClient
          .from('messaging_channels').select('id')
          .eq('zernio_account_id', account.accountId).maybeSingle();

        let saved;
        if (existing) {
          const { data, error } = await supabaseClient
            .from('messaging_channels')
            .update({
              sender_id: senderId,
              display_name: displayName || account.displayName || senderId,
              is_active: true,
              provider: 'zernio',
              config,
              updated_at: new Date().toISOString(),
            })
            .eq('id', existing.id).select().single();
          if (error) throw error;
          saved = data;
        } else {
          const { count } = await supabaseClient
            .from('messaging_channels')
            .select('*', { count: 'exact', head: true })
            .eq('channel_type', 'whatsapp');
          const { data, error } = await supabaseClient
            .from('messaging_channels')
            .insert({
              workspace_id: wsId, // Bind the channel to the caller's workspace
              channel_type: 'whatsapp',
              provider: 'zernio',
              sender_id: senderId,
              zernio_account_id: account.accountId,
              display_name: displayName || account.displayName || senderId,
              is_active: true,
              is_default: (count || 0) === 0,
              daily_quota: 10000,
              max_send_rate: 100,
              config,
            })
            .select().single();
          if (error) throw error;
          saved = data;
        }

        return jsonResponse({ success: true, channel: saved, account });
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
        const data = await zernioApi('GET', '/accounts?platform=whatsapp');
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
            await supabaseClient.from('messaging_channels').update({
              sender_id: senderId,
              display_name: acc.displayName || senderId,
              is_active: acc.isActive !== false,
              updated_at: new Date().toISOString(),
            }).eq('id', existing.id);
            synced.push({ action: 'updated', senderId });
          } else {
            const { count } = await supabaseClient
              .from('messaging_channels').select('*', { count: 'exact', head: true })
              .eq('channel_type', 'whatsapp');
            await supabaseClient.from('messaging_channels').insert({
              workspace_id: syncWsId, // Bind to the caller's workspace
              channel_type: 'whatsapp',
              provider: 'zernio',
              sender_id: senderId,
              zernio_account_id: accountId,
              display_name: acc.displayName || senderId,
              is_active: acc.isActive !== false,
              is_default: (count || 0) === 0,
              daily_quota: 10000,
              max_send_rate: 100,
              config: { zernio_account_id: accountId, display_phone_number: senderId },
            });
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
        // Tenancy (#250 invariant #1): these read actions use the RLS-bypassing service-role client and
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
