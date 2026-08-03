/**
 * Email Marketing Tools — agent-chat surface for the tenant email-marketing add-on.
 *
 * ONE tool, actions:
 *   - list           — recent email campaigns in the workspace
 *   - list_templates — the workspace's marketing templates (needed to compose)
 *   - create_draft   — create a DRAFT campaign (name + template + audience filter)
 *   - send           — send a draft/paused campaign (mass-comms → human-in-the-loop confirm gate)
 *
 * Sending is a paid, mass-comms action with BYOK + quota rules, so `send` is gated behind an
 * explicit confirmation chunk (invariant #9). It resolves the audience the SAME way the Email page
 * does — category members PLUS any manual_emails on the campaign — then enqueues + flips to sending.
 *
 * Gated on module `email-marketing` enabled + workspace entitlement (paid add-on). Service-role
 * client, but EVERY read/write is scoped to the server-derived workspaceId and the template is
 * verified in-workspace before use (CLAUDE.md invariant 1 — never trust a body-supplied id).
 */

const { tool } = await import('npm:@langchain/core@1.1.15/tools');
const { z } = await import('npm:zod@3.24.0');
const { createClient } = await import('npm:@supabase/supabase-js@2');

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const MODULE_SLUG = 'email-marketing';

import { serviceClient as svcClient } from '../supabase-client.ts';
/** User-scoped client so the membership-guarded audience RPC + RLS behave as on the page. */
function userClient(jwt: string | undefined) {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: jwt ? { Authorization: `Bearer ${jwt}` } : {} },
  });
}

async function moduleReady(workspaceId: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const sb = svcClient();
    const { data: mod } = await sb.from('modules').select('enabled').eq('slug', MODULE_SLUG).maybeSingle();
    if (!mod?.enabled) return { ok: false, error: 'The Email Marketing module is not enabled on this platform.' };
    if (!workspaceId) return { ok: false, error: 'No active workspace for the current user.' };
    const { data: entitled } = await sb.rpc('is_workspace_entitled', {
      p_workspace_id: workspaceId, p_module_slug: MODULE_SLUG,
    });
    if (entitled !== true) {
      return { ok: false, error: 'This workspace has not activated Email Marketing. Enable it under Profile → Modules.' };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: `Email Marketing availability check failed: ${(e as Error).message}` };
  }
}

export const createManageEmailCampaignTool = (
  userId: string,
  workspaceId: string,
  jwt: string | undefined,
  onChunk?: (chunk: any) => void,
) => {
  return tool(
    async ({ action, name, template_id, subject_line, description, category_ids, campaign_id, confirm }) => {
      const gate = await moduleReady(workspaceId);
      if (!gate.ok) return JSON.stringify({ success: false, error: gate.error });
      const sb = svcClient();

      if (action === 'list') {
        const { data, error } = await sb
          .from('campaigns')
          .select('id, name, status, subject_line, recipient_count, created_at, template:email_templates(id, name)')
          .eq('workspace_id', workspaceId)
          .eq('channel_type', 'email')
          .order('created_at', { ascending: false })
          .limit(25);
        if (error) return JSON.stringify({ success: false, error: error.message });
        onChunk?.({ type: 'email_campaigns_list', workspace_id: workspaceId, campaigns: data ?? [], timestamp: Date.now() });
        return JSON.stringify({ success: true, campaigns: data ?? [] });
      }

      if (action === 'list_templates') {
        const { data, error } = await sb
          .from('email_templates')
          .select('id, name, subject_template, is_active, updated_at')
          .eq('workspace_id', workspaceId)
          .eq('category', 'marketing')
          .order('updated_at', { ascending: false })
          .limit(50);
        if (error) return JSON.stringify({ success: false, error: error.message });
        onChunk?.({ type: 'email_templates_list', workspace_id: workspaceId, templates: data ?? [], timestamp: Date.now() });
        return JSON.stringify({ success: true, templates: data ?? [] });
      }

      if (action === 'create_draft') {
        if (!name || !template_id) {
          return JSON.stringify({ success: false, error: 'create_draft needs a name and a template_id (call list_templates first).' });
        }
        // Verify the template belongs to THIS workspace before referencing it (BOLA guard).
        const { data: tpl } = await sb
          .from('email_templates')
          .select('id')
          .eq('id', template_id)
          .eq('workspace_id', workspaceId)
          .maybeSingle();
        if (!tpl) return JSON.stringify({ success: false, error: 'template not found in this workspace' });

        const { data: campaign, error } = await sb
          .from('campaigns')
          .insert({
            workspace_id: workspaceId,
            channel_type: 'email',
            name: String(name).trim(),
            description: description?.trim() || null,
            template_id,
            subject_line: subject_line?.trim() || null,
            audience_filter: { category_ids: Array.isArray(category_ids) ? category_ids : [], manual_emails: [] },
            status: 'draft',
            recipient_count: 0,   // resolved on the page when the user reviews + sends
            created_by: userId,
          })
          .select('id, name, status')
          .single();
        if (error) return JSON.stringify({ success: false, error: error.message });

        onChunk?.({
          type: 'email_campaign_created',
          workspace_id: workspaceId,
          campaign_id: campaign.id,
          name: campaign.name,
          status: campaign.status,
          open_url: `/marketing/email?tab=campaigns`,
          timestamp: Date.now(),
        });
        return JSON.stringify({
          success: true,
          campaign_id: campaign.id,
          status: 'draft',
          message: `Draft campaign "${campaign.name}" created. Open Marketing → Email to pick the audience and send.`,
        });
      }

      if (action === 'send') {
        if (!campaign_id) return JSON.stringify({ success: false, error: 'send needs a campaign_id (a draft campaign).' });
        // Load + validate the draft campaign in-workspace.
        const { data: camp } = await sb
          .from('campaigns')
          .select('id, name, status, audience_filter')
          .eq('id', campaign_id).eq('workspace_id', workspaceId).eq('channel_type', 'email').maybeSingle();
        if (!camp) return JSON.stringify({ success: false, error: 'campaign not found in this workspace' });
        if (camp.status !== 'draft' && camp.status !== 'paused') {
          return JSON.stringify({ success: false, error: `only draft/paused campaigns can be sent (this one is "${camp.status}")` });
        }

        // Resolve the audience now (membership-guarded RPC → needs the user client). Include BOTH
        // the category members AND any manual_emails on the campaign (the Email page sends both;
        // dropping manual_emails here silently under-sent the campaign). Dedupe by email.
        const categoryIds: string[] = Array.isArray(camp.audience_filter?.category_ids) ? camp.audience_filter.category_ids : [];
        const manualEmails: string[] = Array.isArray(camp.audience_filter?.manual_emails) ? camp.audience_filter.manual_emails : [];
        const usb = userClient(jwt);
        const byEmail = new Map<string, { email: string; crm_contact_id: string | null; display_name: string | null }>();
        if (categoryIds.length) {
          const { data } = await usb.rpc('crm_categories_resolve_recipients_ws', { p_workspace_id: workspaceId, p_category_ids: categoryIds });
          for (const r of (Array.isArray(data) ? data : []) as any[]) {
            const e = String(r?.email ?? '').trim().toLowerCase();
            if (!e || byEmail.has(e)) continue;
            byEmail.set(e, { email: r.email, crm_contact_id: r.crm_contact_id ?? null, display_name: r.display_name ?? null });
          }
        }
        for (const em of manualEmails) {
          const e = String(em ?? '').trim().toLowerCase();
          if (!e || byEmail.has(e)) continue;
          byEmail.set(e, { email: em, crm_contact_id: null, display_name: null });
        }
        const recipients = [...byEmail.values()];
        if (recipients.length === 0) {
          return JSON.stringify({ success: false, error: 'This campaign resolves to 0 recipients — set an audience on the Email page before sending.' });
        }

        // HUMAN-IN-THE-LOOP GATE (invariant #9): mass email — confirm before sending.
        if (confirm !== true) {
          onChunk?.({
            type: 'action_confirmation',
            tool: 'manage_email_campaign',
            input: { action: 'send', campaign_id },
            title: 'Send this email campaign?',
            summary: `Send campaign "${camp.name}" to ${recipients.length} recipient${recipients.length === 1 ? '' : 's'} from your CRM. Emails go out via the workspace's own Resend sender and cannot be recalled.`,
            danger: true,
            toolkit_id: 'email-marketing',
            timestamp: Date.now(),
          });
          return JSON.stringify({ success: true, awaiting_confirmation: true, recipient_count: recipients.length, message: 'Awaiting the user\'s approval to send. Do not retry.' });
        }

        // Confirmed → insert recipients (dedupe safety: only if none yet) + flip to sending (cron sends).
        const { count: existing } = await sb.from('campaign_recipients').select('id', { count: 'exact', head: true }).eq('campaign_id', campaign_id);
        if (!existing) {
          const nameVars = (dn: string | null | undefined) => {
            const full = (dn || '').trim();
            if (!full) return {};
            const parts = full.split(/\s+/);
            return { fullName: full, firstName: parts[0], lastName: parts.length > 1 ? parts.slice(1).join(' ') : '' };
          };
          const rows = recipients.map((r: any) => ({
            campaign_id, email: r.email, contact_id: r.crm_contact_id ?? null,
            variables: nameVars(r.display_name), status: 'pending',
          }));
          for (let i = 0; i < rows.length; i += 500) {
            const { error: recErr } = await sb.from('campaign_recipients').insert(rows.slice(i, i + 500));
            if (recErr) return JSON.stringify({ success: false, error: `recipient insert failed: ${recErr.message}` });
          }
        }
        const { error: upErr } = await sb.from('campaigns').update({ status: 'sending', recipient_count: recipients.length }).eq('id', campaign_id).eq('workspace_id', workspaceId);
        if (upErr) return JSON.stringify({ success: false, error: upErr.message });
        onChunk?.({ type: 'email_campaign_sent', campaign_id, name: camp.name, recipient_count: recipients.length, timestamp: Date.now() });
        return JSON.stringify({ success: true, sent: true, campaign_id, recipient_count: recipients.length });
      }

      return JSON.stringify({ success: false, error: `unknown action: ${action}` });
    },
    {
      name: 'manage_email_campaign',
      description:
        'Email marketing: list campaigns/templates, compose a DRAFT campaign (name + template + audience), ' +
        'and send a draft (action="send"). SENDING is a mass-comms action — it ALWAYS asks the user to ' +
        'Approve/Decline first (never set confirm:true yourself; the UI sets it on approval). ' +
        'Call list_templates first to get a template_id for create_draft.',
      schema: z.object({
        action: z.enum(['list', 'list_templates', 'create_draft', 'send']).default('list'),
        name: z.string().optional().describe('Campaign name (required for create_draft).'),
        template_id: z.string().optional().describe('Marketing template id from list_templates (required for create_draft).'),
        subject_line: z.string().optional(),
        description: z.string().optional(),
        category_ids: z.array(z.string()).optional().describe('CRM category ids for the audience.'),
        campaign_id: z.string().optional().describe('send: the draft campaign UUID to send.'),
        confirm: z.boolean().optional().describe('Do NOT set — the Approve/Decline card sets confirm:true on approval.'),
      }),
    },
  );
};
