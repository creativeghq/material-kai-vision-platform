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

import { createClient } from '@supabase/supabase-js';
import { corsHeaders } from '../_shared/cors.ts';
import { debitExternalServiceCredits } from '../_shared/credit-utils.ts';
import { authenticate, isAdminAccess } from '../_shared/auth.ts';
import { withApiLogging, HttpError } from '../_shared/api-logger.ts';
import { notConfiguredResponse } from '../_shared/api-provider-errors.ts';
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

/** Resolve a WhatsApp channel by sender_id, else the default active one. */
async function resolveChannel(supabase: any, from?: string) {
  if (from) {
    const { data } = await supabase
      .from('messaging_channels')
      .select('*')
      .eq('sender_id', from)
      .eq('channel_type', 'whatsapp')
      .maybeSingle();
    return data;
  }
  const { data } = await supabase
    .from('messaging_channels')
    .select('*')
    .eq('channel_type', 'whatsapp')
    .eq('is_default', true)
    .eq('is_active', true)
    .maybeSingle();
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

    switch (action) {
      // ─────────────────────────────────────────────────────────────
      // Send single message (1+ recipients)
      // ─────────────────────────────────────────────────────────────
      case 'send': {
        const body: SendMessageRequest = requestBody;
        const channel = await resolveChannel(supabaseClient, body.from);
        if (!channel) throw new Error('No WhatsApp channel configured. Connect a WhatsApp number first.');
        if (!channel.zernio_account_id) throw new Error('Channel is not linked to a Zernio account.');

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
          const result = await sendWhatsAppMessage({
            accountId: channel.zernio_account_id,
            to,
            message: template
              ? renderTemplate(template.content, body.templateVariables || {})
              : body.content,
            templateName: template?.whatsapp_template_name || undefined,
            templateLanguage: template?.whatsapp_language_code || undefined,
            templateParams: template ? orderedTemplateParams(template, body.templateVariables || {}) : undefined,
          });
          results.push({ to, ...result });

          if (result.success) {
            await supabaseClient.from('messaging_logs').insert({
              created_by: user.id,
              workspace_id: channel.workspace_id ?? auth.workspace_id, // #250 B6: tenant scope
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
            await debitExternalServiceCredits(
              supabaseClient, user.id, 'zernio-whatsapp', 'messaging_whatsapp', 1,
              { to, message_id: result.messageId },
            );
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

        const channel = await resolveChannel(supabaseClient, body.from);
        if (!channel) throw new Error('No WhatsApp channel configured');
        if (!channel.zernio_account_id) throw new Error('Channel is not linked to a Zernio account.');
        if (channel.daily_quota && body.recipients.length > channel.daily_quota) {
          throw new Error(`Recipient count (${body.recipients.length}) exceeds channel daily quota (${channel.daily_quota})`);
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
          const result = await sendWhatsAppMessage({
            accountId: channel.zernio_account_id,
            to,
            message: template ? renderTemplate(template.content, vars) : body.content,
            templateName: template?.whatsapp_template_name || undefined,
            templateLanguage: template?.whatsapp_language_code || undefined,
            templateParams: template ? orderedTemplateParams(template, vars) : undefined,
          });
          results.push({ to, ...result });

          if (result.success) {
            await supabaseClient.from('messaging_logs').insert({
              created_by: user.id,
              workspace_id: channel.workspace_id ?? auth.workspace_id, // #250 B6: tenant scope
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
          }
          await new Promise((res) => setTimeout(res, 50));
        }

        const sent = results.filter((r) => r.success).length;
        if (sent > 0) {
          await debitExternalServiceCredits(
            supabaseClient, user.id, 'zernio-whatsapp', 'messaging_bulk_whatsapp', sent,
            { total_sent: sent },
          );
        }
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

        const wsId = workspaceId || auth.workspace_id;
        if (!wsId) throw new Error('No workspace context to attach the WhatsApp account to');
        // #250 C27: operator roles are workspace-scoped — verify the caller belongs to the
        // target workspace before attaching a WhatsApp account (else operator-of-A could
        // connect an account to workspace-B by passing its id). Platform-secret callers pass.
        if (!isAdminAccess(auth)) {
          const { data: _mem } = await supabaseClient.from('workspace_members')
            .select('id').eq('user_id', auth.userId).eq('workspace_id', wsId)
            .eq('status', 'active').limit(1).maybeSingle();
          if (!_mem) return jsonResponse({ error: 'Not a member of the target workspace' }, 403);
        }
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
              workspace_id: wsId, // #250 B6: bind the channel to the caller's workspace
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
              workspace_id: auth.workspace_id, // #250 B6: bind to the caller's workspace
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
        const channel = await resolveChannel(supabaseClient, requestBody.from);
        if (!channel?.zernio_account_id) throw new Error('No connected WhatsApp account');
        const data = await zernioApi('GET', `/whatsapp/templates?accountId=${encodeURIComponent(channel.zernio_account_id)}`);
        return jsonResponse({ templates: data.templates || [] });
      }

      // ─────────────────────────────────────────────────────────────
      // Channels / templates / logs / analytics (DB reads)
      // ─────────────────────────────────────────────────────────────
      case 'channels': {
        const { data, error } = await supabaseClient
          .from('messaging_channels').select('*')
          .eq('channel_type', 'whatsapp')
          .order('is_default', { ascending: false });
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
        const { limit = 50, offset = 0, status } = requestBody;
        let query = supabaseClient
          .from('messaging_logs').select('*', { count: 'exact' })
          .eq('channel_type', 'whatsapp')
          .order('created_at', { ascending: false })
          .range(offset, offset + limit - 1);
        if (status) query = query.eq('status', status);
        const { data, count, error } = await query;
        if (error) throw error;
        return jsonResponse({ logs: data, total: count });
      }

      case 'analytics': {
        const { startDate, endDate } = requestBody;
        const start = startDate || new Date(Date.now() - 30 * 86400000).toISOString();
        const end = endDate || new Date().toISOString();
        const { data: logs } = await supabaseClient
          .from('messaging_logs').select('status')
          .eq('channel_type', 'whatsapp')
          .gte('created_at', start).lte('created_at', end);

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
        const channel = await resolveChannel(supabaseClient, requestBody.from);
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
