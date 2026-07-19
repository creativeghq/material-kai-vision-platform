/**
 * Email Marketing Tools — agent-chat surface for the tenant email-marketing add-on (#255/#275).
 *
 * ONE tool, actions:
 *   - list           — recent email campaigns in the workspace
 *   - list_templates — the workspace's marketing templates (needed to compose)
 *   - create_draft   — create a DRAFT campaign the user reviews + sends on the page
 *
 * Deliberately DRAFT-ONLY: sending is a paid, mass-comms action with BYOK + quota rules, so the
 * agent never sends. It composes the draft (name + template + audience filter); the user opens it
 * in Marketing → Email and hits send. The draft is workspace-scoped and shows on the page (2-way).
 *
 * Gated on module `email-marketing` enabled + workspace entitlement (paid add-on). Service-role
 * client, but EVERY read/write is scoped to the server-derived workspaceId and the template is
 * verified in-workspace before use (CLAUDE.md invariant 1 — never trust a body-supplied id).
 */

const { tool } = await import('npm:@langchain/core@1.1.15/tools');
const { z } = await import('npm:zod@3.24.0');
const { createClient } = await import('npm:@supabase/supabase-js@2');

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const MODULE_SLUG = 'email-marketing';

function svcClient() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
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
  onChunk?: (chunk: any) => void,
) => {
  return tool(
    async ({ action, name, template_id, subject_line, description, category_ids }) => {
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

      return JSON.stringify({ success: false, error: `unknown action: ${action}` });
    },
    {
      name: 'manage_email_campaign',
      description:
        'List email-marketing campaigns/templates and compose a DRAFT campaign (name + template + audience categories). ' +
        'The agent never sends — it creates a draft the user reviews and sends from Marketing → Email. ' +
        'Call action="list_templates" first to get a template_id for create_draft.',
      schema: z.object({
        action: z.enum(['list', 'list_templates', 'create_draft']).default('list'),
        name: z.string().optional().describe('Campaign name (required for create_draft).'),
        template_id: z.string().optional().describe('Marketing template id from list_templates (required for create_draft).'),
        subject_line: z.string().optional(),
        description: z.string().optional(),
        category_ids: z.array(z.string()).optional().describe('CRM category ids for the audience (resolved to recipients on the page).'),
      }),
    },
  );
};
