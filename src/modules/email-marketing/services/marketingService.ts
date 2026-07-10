/**
 * Email Marketing service — workspace-scoped campaigns + templates for the tenant module (#255).
 *
 * All reads/writes carry the active workspace_id; RLS (is_workspace_member) enforces tenancy.
 * Audience resolution goes through the membership-guarded crm_categories_resolve_recipients_ws RPC.
 * Sends are driven by the campaign-processor cron via email-api with strict BYOK — nothing here
 * calls Resend directly.
 */
import { supabase } from '@/integrations/supabase/client';

export type CampaignStatus =
  | 'draft' | 'scheduled' | 'sending' | 'sent' | 'partial_failure' | 'paused' | 'cancelled';

export interface MarketingCampaign {
  id: string;
  workspace_id: string;
  name: string;
  description: string | null;
  status: CampaignStatus;
  template_id: string | null;
  subject_line: string | null;
  preview_text: string | null;
  scheduled_at: string | null;
  sent_at: string | null;
  recipient_count: number;
  metadata: Record<string, any> | null;
  created_at: string;
  template?: { id: string; name: string } | null;
}

export interface MarketingTemplate {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  subject_template: string | null;
  is_active: boolean;
  updated_at: string;
}

export interface CrmCategory {
  id: string;
  name: string;
  slug: string;
  kind: string | null;
}

export interface AudienceRecipient {
  email: string;
  member_kind: string | null;
  crm_contact_id: string | null;
  crm_company_id: string | null;
  display_name: string | null;
}

function randomSlugSuffix(): string {
  // 8 hex chars — enough to keep the globally-unique email_templates.slug from colliding.
  return Math.random().toString(16).slice(2, 10).padEnd(8, '0');
}

class MarketingService {
  // ── Templates ──────────────────────────────────────────────────────────────
  async listTemplates(workspaceId: string): Promise<MarketingTemplate[]> {
    const { data, error } = await supabase
      .from('email_templates')
      .select('id, name, slug, description, subject_template, is_active, updated_at')
      .eq('workspace_id', workspaceId)
      .order('updated_at', { ascending: false });
    if (error) throw error;
    return (data || []) as MarketingTemplate[];
  }

  /** Create a workspace-scoped marketing template with a globally-unique auto slug, then return
   *  its id so the caller can open the builder. */
  async createTemplate(workspaceId: string, input: { name: string; description?: string }): Promise<string> {
    const { data: { user } } = await supabase.auth.getUser();
    const base = input.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 40) || 'template';
    const slug = `mkt-${base}-${randomSlugSuffix()}`;
    const { data, error } = await supabase
      .from('email_templates')
      .insert({
        workspace_id: workspaceId,
        name: input.name.trim(),
        slug,
        description: input.description?.trim() || null,
        category: 'marketing',
        subject_template: '',
        html_template: '',
        text_template: '',
        variables: [],
        is_active: false,
        created_by: user?.id ?? null,
      })
      .select('id')
      .single();
    if (error) throw error;
    return data.id as string;
  }

  async deleteTemplate(id: string): Promise<void> {
    const { error } = await supabase.from('email_templates').delete().eq('id', id);
    if (error) throw error;
  }

  // ── Audience ───────────────────────────────────────────────────────────────
  async listCategories(): Promise<CrmCategory[]> {
    const { data, error } = await supabase
      .from('crm_categories')
      .select('id, name, slug, kind')
      .eq('is_active', true)
      .order('name', { ascending: true });
    if (error) throw error;
    return (data || []) as CrmCategory[];
  }

  async resolveAudience(workspaceId: string, categoryIds: string[]): Promise<AudienceRecipient[]> {
    if (!categoryIds.length) return [];
    const { data, error } = await supabase.rpc('crm_categories_resolve_recipients_ws', {
      p_workspace_id: workspaceId,
      p_category_ids: categoryIds,
    });
    if (error) throw error;
    return (data || []) as AudienceRecipient[];
  }

  // ── Campaigns ──────────────────────────────────────────────────────────────
  async listCampaigns(workspaceId: string): Promise<MarketingCampaign[]> {
    const { data, error } = await supabase
      .from('campaigns')
      .select('*, template:email_templates(id, name)')
      .eq('workspace_id', workspaceId)
      .eq('channel_type', 'email')
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data || []) as MarketingCampaign[];
  }

  /**
   * Create a campaign + its recipient rows in the active workspace. `sendNow` sets status to
   * 'sending' immediately (the cron picks it up next tick); otherwise draft, or scheduled when a
   * future time is given.
   */
  async createCampaign(
    workspaceId: string,
    input: {
      name: string;
      description?: string;
      template_id: string;
      subject_line?: string;
      preview_text?: string;
      audience: { category_ids: string[]; manual_emails: string[] };
      recipients: AudienceRecipient[];
      schedule: 'now' | 'draft' | 'later';
      scheduled_at?: string | null;
    },
  ): Promise<string> {
    const { data: { user } } = await supabase.auth.getUser();

    const status: CampaignStatus =
      input.schedule === 'now' ? 'sending' : input.schedule === 'later' ? 'scheduled' : 'draft';
    const scheduledAt = input.schedule === 'later' ? (input.scheduled_at ?? null) : null;

    const { data: campaign, error: campErr } = await supabase
      .from('campaigns')
      .insert({
        workspace_id: workspaceId,
        channel_type: 'email',
        name: input.name.trim(),
        description: input.description?.trim() || null,
        template_id: input.template_id,
        subject_line: input.subject_line?.trim() || null,
        preview_text: input.preview_text?.trim() || null,
        audience_filter: { category_ids: input.audience.category_ids, manual_emails: input.audience.manual_emails },
        status,
        scheduled_at: scheduledAt,
        recipient_count: input.recipients.length,
        created_by: user?.id ?? null,
      })
      .select('id')
      .single();
    if (campErr) throw campErr;

    const campaignId = campaign.id as string;

    if (input.recipients.length) {
      const rows = input.recipients.map((r) => ({
        campaign_id: campaignId,
        email: r.email,
        contact_id: r.crm_contact_id ?? null,
        variables: r.display_name ? { fullName: r.display_name } : {},
        status: 'pending',
      }));
      // Chunk to keep the insert payload reasonable for large audiences.
      const CHUNK = 500;
      for (let i = 0; i < rows.length; i += CHUNK) {
        const { error: recErr } = await supabase.from('campaign_recipients').insert(rows.slice(i, i + CHUNK));
        if (recErr) throw recErr;
      }
    }

    return campaignId;
  }

  async setStatus(campaignId: string, next: CampaignStatus, fromStatuses: CampaignStatus[]): Promise<void> {
    let q = supabase.from('campaigns').update({ status: next }).eq('id', campaignId);
    if (fromStatuses.length === 1) q = q.eq('status', fromStatuses[0]);
    else q = q.in('status', fromStatuses);
    const { error } = await q;
    if (error) throw error;
  }

  startCampaign(id: string) { return this.setStatus(id, 'sending', ['draft', 'paused']); }
  pauseCampaign(id: string) { return this.setStatus(id, 'paused', ['sending']); }
  resumeCampaign(id: string) { return this.setStatus(id, 'sending', ['paused']); }
  cancelCampaign(id: string) { return this.setStatus(id, 'cancelled', ['draft', 'scheduled', 'sending', 'paused']); }

  async deleteCampaign(id: string): Promise<void> {
    const { error } = await supabase.from('campaigns').delete().eq('id', id).eq('status', 'draft');
    if (error) throw error;
  }

  async getStats(campaignId: string) {
    const { data, error } = await supabase
      .from('campaign_recipients')
      .select('status, opened_at, clicked_at, bounced_at')
      .eq('campaign_id', campaignId);
    if (error) throw error;
    const rows = data || [];
    const total = rows.length;
    const sent = rows.filter((r) => ['sent', 'sending'].includes(r.status as string)).length;
    const failed = rows.filter((r) => r.status === 'failed').length;
    const pending = rows.filter((r) => r.status === 'pending').length;
    const opened = rows.filter((r) => r.opened_at).length;
    const clicked = rows.filter((r) => r.clicked_at).length;
    return { total, sent, failed, pending, opened, clicked };
  }
}

export const marketingService = new MarketingService();
