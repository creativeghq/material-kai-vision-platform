/**
 * Email Marketing service — workspace-scoped campaigns + templates for the tenant module.
 *
 * All reads/writes carry the active workspace_id; RLS (is_workspace_member) enforces tenancy.
 * Audience resolution and recipient materialization go through resolve_campaign_audience /
 * campaign_materialize_recipients — the single SQL derivation of "who does this campaign go to".
 * SQL derives, this file formats; do not rebuild the union/dedupe here.
 * Sends are driven by the campaign-processor cron via email-api with strict BYOK — nothing here
 * calls Resend directly.
 */
import { supabase } from '@/integrations/supabase/client';
import type { Json } from '@/integrations/supabase/types';
import { edgeError } from '@/utils/edgeError';

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

/**
 * What a campaign is addressed to — stored verbatim as `campaigns.audience_filter` and resolved by
 * `resolve_campaign_audience`. This is the ONLY audience shape; the admin page's old
 * `{ type, emails, recipients }` variant is retired (two schemas in one jsonb column meant a
 * campaign created on one page resolved to zero recipients on the other).
 */
export interface CampaignAudience {
  category_ids: string[];
  manual_emails: string[];
  contact_ids?: string[];
  member_user_ids?: string[];
  include_all_contacts?: boolean;
  include_all_members?: boolean;
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
    // crm_categories is a global taxonomy whose table RLS is admin-only, so a direct select returns
    // empty for normal tenants. Read the picker fields via the membership-agnostic RPC instead.
    const { data, error } = await supabase.rpc('list_crm_categories');
    if (error) throw error;
    return (data || []) as CrmCategory[];
  }

  /**
   * THE audience read. One RPC resolves every source (category members, whole-contact-book,
   * workspace members, hand-picked records, typed addresses), deduped by address, unsubscribe-
   * suppressed and workspace-scoped — so the preview a user approves is exactly the row set that
   * gets materialized. Never union or de-dupe audience sources in TypeScript.
   */
  async resolveAudience(workspaceId: string, audience: CampaignAudience): Promise<AudienceRecipient[]> {
    const { data, error } = await supabase.rpc('resolve_campaign_audience', {
      p_workspace_id: workspaceId,
      p_audience: audience as unknown as Json,
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
      audience: CampaignAudience;
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
        audience_filter: input.audience as unknown as Json,
        status,
        scheduled_at: scheduledAt,
        recipient_count: 0,
        created_by: user?.id ?? null,
      })
      .select('id')
      .single();
    if (campErr) throw campErr;

    const campaignId = campaign.id as string;
    // Materialize from the stored filter, not from a client-built list: the two can disagree, and
    // when they did the campaign sent to whatever the page happened to be holding.
    await this.ensureRecipients(campaignId);
    return campaignId;
  }

  async setStatus(campaignId: string, next: CampaignStatus, fromStatuses: CampaignStatus[]): Promise<void> {
    let q = supabase.from('campaigns').update({ status: next }).eq('id', campaignId);
    if (fromStatuses.length === 1) q = q.eq('status', fromStatuses[0]);
    else q = q.in('status', fromStatuses);
    const { error } = await q;
    if (error) throw error;
  }

  /** Ensure a campaign has recipient rows before it sends, from its OWN stored audience_filter.
   *  Idempotent and additive — safe to call on every create and every start. Agent-created drafts
   *  used to reach the processor with no rows at all, so "send" was a status flip that emailed
   *  nobody; that is why this exists. Returns the recipient count. */
  async ensureRecipients(campaignId: string): Promise<number> {
    const { data, error } = await supabase.rpc('campaign_materialize_recipients', { p_campaign_id: campaignId });
    if (error) throw error;
    return (data as number) ?? 0;
  }

  async startCampaign(id: string) {
    const n = await this.ensureRecipients(id);
    if (n === 0) throw new Error('This campaign resolves to 0 recipients — set an audience before sending.');
    return this.setStatus(id, 'sending', ['draft', 'paused']);
  }
  pauseCampaign(id: string) { return this.setStatus(id, 'paused', ['sending']); }
  /** Resume a paused campaign — also clears the stale amber "blocked" banner (the processor only
   *  cleared it on the credits path, so a manual resume left it lingering). */
  async resumeCampaign(id: string) {
    const { data } = await supabase.from('campaigns').select('metadata').eq('id', id).maybeSingle();
    const md = { ...(((data as any)?.metadata) || {}) };
    delete (md as Record<string, unknown>).blocked_reason;
    delete (md as Record<string, unknown>).blocked_message;
    const { error } = await supabase.from('campaigns').update({ status: 'sending', metadata: md }).eq('id', id).eq('status', 'paused');
    if (error) throw error;
  }
  cancelCampaign(id: string) { return this.setStatus(id, 'cancelled', ['draft', 'scheduled', 'sending', 'paused']); }

  async deleteCampaign(id: string): Promise<void> {
    const { error } = await supabase.from('campaigns').delete().eq('id', id).eq('status', 'draft');
    if (error) throw error;
  }

  /** Pull fresh delivery/open/click/bounce status from the workspace's OWN Resend account and
   *  update campaign_recipients. Returns how many rows were refreshed. */
  async syncStats(campaignId: string, workspaceId: string): Promise<{ updated: number; synced: number; by_status: Record<string, number>; capped: boolean; total_dispatched: number | null }> {
    const { data, error } = await supabase.functions.invoke('email-api', {
      body: { action: 'sync-campaign-stats', campaign_id: campaignId, workspace_id: workspaceId },
    });
    if (error) throw await edgeError(error);
    if (!data?.success) throw new Error(data?.error || 'Failed to sync stats');
    return { updated: data.updated ?? 0, synced: data.synced ?? 0, by_status: data.by_status ?? {}, capped: !!data.capped, total_dispatched: data.total_dispatched ?? null };
  }

  // ── Resend audience / contacts sync ──────────────────────────────────────────
  async listResendContacts(workspaceId: string): Promise<ResendContactsResult> {
    const { data, error } = await supabase.functions.invoke('email-api', {
      body: { action: 'resend-contacts', workspace_id: workspaceId },
    });
    if (error) throw await edgeError(error);
    if (!data?.success) throw new Error(data?.error || 'Failed to load Resend contacts');
    return {
      allowed: !!data.allowed,
      contacts: (data.contacts || []) as ResendContact[],
      auto_sync: !!data.auto_sync,
      last_synced_at: data.last_synced_at ?? null,
      last_sync_count: data.last_sync_count ?? null,
      last_sync_error: data.last_sync_error ?? null,
    };
  }

  async syncResendContacts(workspaceId: string): Promise<{ added: number; already: number; total_crm: number; capped: boolean }> {
    const { data, error } = await supabase.functions.invoke('email-api', {
      body: { action: 'sync-resend-contacts', workspace_id: workspaceId },
    });
    if (error) throw await edgeError(error);
    if (!data?.success) throw new Error(data?.error || 'Failed to sync contacts');
    return { added: data.added ?? 0, already: data.already ?? 0, total_crm: data.total_crm ?? 0, capped: !!data.capped };
  }

  async setContactAutoSync(workspaceId: string, autoSync: boolean): Promise<void> {
    const { data, error } = await supabase.functions.invoke('email-api', {
      body: { action: 'set-resend-contact-sync', workspace_id: workspaceId, auto_sync: autoSync },
    });
    if (error) throw await edgeError(error);
    if (!data?.success) throw new Error(data?.error || 'Failed to update setting');
  }

  async getStats(campaignId: string): Promise<CampaignStats> {
    const { data, error } = await supabase
      .from('campaign_recipients')
      .select('status, delivered_at, opened_at, clicked_at, bounced_at, complained_at')
      .eq('campaign_id', campaignId);
    if (error) throw error;
    const rows = data || [];
    const is = (r: any, s: string) => r.status === s;
    return {
      total: rows.length,
      pending: rows.filter((r) => is(r, 'pending')).length,
      sent: rows.filter((r) => ['sent', 'sending', 'bounced', 'complained'].includes(r.status as string)).length,
      delivered: rows.filter((r) => r.delivered_at).length,
      opened: rows.filter((r) => r.opened_at).length,
      clicked: rows.filter((r) => r.clicked_at).length,
      bounced: rows.filter((r) => is(r, 'bounced') || r.bounced_at).length,
      complained: rows.filter((r) => is(r, 'complained') || r.complained_at).length,
      failed: rows.filter((r) => is(r, 'failed')).length,
      unsubscribed: rows.filter((r) => is(r, 'unsubscribed')).length,
    };
  }
}

export interface CampaignStats {
  total: number; pending: number; sent: number; delivered: number;
  opened: number; clicked: number; bounced: number; complained: number; failed: number; unsubscribed: number;
}

export interface ResendContact {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  unsubscribed: boolean;
  created_at: string | null;
}

export interface ResendContactsResult {
  allowed: boolean;
  contacts: ResendContact[];
  auto_sync: boolean;
  last_synced_at: string | null;
  last_sync_count: number | null;
  last_sync_error: string | null;
}

export const marketingService = new MarketingService();
