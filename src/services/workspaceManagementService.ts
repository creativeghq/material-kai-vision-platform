import { supabase } from '@/integrations/supabase/client';
import { escapeHtml } from '@/utils/escapeHtml';
import { flowEventService } from '@/services/flows/flowEventService';
import { WORKSPACE_ROLE_META, type WorkspaceInviteRole, type WorkspaceMemberRole } from '@/auth/workspaceRoles';

/** A claimable (or historical) team invitation. */
export interface WorkspaceInvite {
  id: string;
  workspace_id: string;
  code: string;
  role: WorkspaceInviteRole;
  /** Set when the invite was addressed to a person — binds redemption to that address. */
  email: string | null;
  invitee_name: string | null;
  created_at: string;
  expires_at: string;
  accepted_at: string | null;
  revoked_at: string | null;
}

export interface CreateChildInput {
  name: string;
  parentId: string;
  canSupplyProducts: boolean;
  catalogAccess: 'operator_catalog' | 'own_products_only';
  /** The child's discount off this workspace's catalog retail — i.e. what they pay us
   *  (their cost basis) = their resale margin room. 0–100. */
  discountPct?: number;
}

export const workspaceManagementService = {
  /** Mint a child workspace (operator → dealer, dealer → architect). Caller must own/admin the parent. */
  async createChild(input: CreateChildInput): Promise<string> {
    const { data, error } = await supabase.rpc('create_child_workspace', {
      p_name: input.name,
      p_parent_id: input.parentId,
      p_can_supply_products: input.canSupplyProducts,
      p_catalog_access: input.catalogAccess,
      p_discount_pct: input.discountPct ?? 0,
    });
    if (error) throw error;
    return data as string;
  },

  /** All workspaces in the caller's manageable subtree. */
  async listManageable(): Promise<any[]> {
    const { data, error } = await supabase.rpc('get_manageable_workspaces');
    if (error) throw error;
    return data ?? [];
  },

  /** Edit a direct child's per-edge settings (caller must own/admin the parent). */
  async updateChildSettings(
    workspaceId: string,
    patch: { catalogAccess?: 'operator_catalog' | 'own_products_only'; canSupplyProducts?: boolean; discountPct?: number },
  ): Promise<void> {
    const { error } = await supabase.rpc('update_child_workspace_settings', {
      p_workspace_id: workspaceId,
      p_catalog_access: patch.catalogAccess ?? null,
      p_can_supply_products: patch.canSupplyProducts ?? null,
      p_discount_pct: patch.discountPct ?? null,
    });
    if (error) throw error;
  },

  /** Owner/admin: get-or-create this workspace's referral code (enables referral join). */
  async generateReferral(workspaceId: string): Promise<string> {
    const { data, error } = await supabase.rpc('generate_workspace_referral', { p_workspace_id: workspaceId });
    if (error) throw error;
    return data as string;
  },

  /** Signed-in user redeems a referral code → becomes a member of that workspace. */
  async redeemReferral(code: string): Promise<{ ok: boolean; workspace_name?: string; error?: string }> {
    const { data, error } = await supabase.rpc('redeem_workspace_referral', { p_code: code });
    if (error) throw error;
    return data as any;
  },

  /** Owner/admin mints a role-carrying invite (#201/#202); returns the code.
   *  Passing `email` binds the invite to that address — redeem_workspace_invite then refuses a
   *  forwarded link claimed by anyone else, and the address is what the invite email goes to. */
  async createInvite(
    workspaceId: string,
    role: WorkspaceInviteRole,
    opts?: { email?: string; name?: string },
  ): Promise<string> {
    const { data, error } = await supabase.rpc('create_workspace_invite', {
      p_workspace_id: workspaceId,
      p_role: role,
      p_email: opts?.email ?? null,
      p_invitee_name: opts?.name ?? null,
    });
    if (error) throw error;
    return data as string;
  },

  /**
   * Mint an invite AND have it delivered by email. Returns the link too, so the inviter can still
   * hand it over another way.
   *
   * Delivery goes through the `workspace_invitation_sent` flow event (a seeded, admin-editable
   * default flow with a Send Email action) rather than a hardcoded email-api call, so an operator
   * can retarget or pause team invites without a deploy.
   */
  async inviteByEmail(input: {
    workspaceId: string;
    workspaceName: string;
    role: WorkspaceInviteRole;
    email: string;
    name?: string;
  }): Promise<{ code: string; url: string }> {
    const email = input.email.trim().toLowerCase();
    const code = await this.createInvite(input.workspaceId, input.role, { email, name: input.name });
    const appUrl = (import.meta.env.VITE_PUBLIC_APP_URL || window.location.origin).replace(/\/$/, '');
    const url = `${appUrl}/auth?mode=signup&invite=${code}`;

    const { data: { user } } = await supabase.auth.getUser();
    const inviterName = (user?.user_metadata as any)?.full_name || user?.email || 'A colleague';
    const meta = WORKSPACE_ROLE_META[input.role];

    flowEventService.emit('workspace_invitation_sent', {
      to: email,
      subject: `${inviterName} invited you to join ${input.workspaceName} as ${meta.label}`,
      body: renderTeamInviteEmailHtml({
        workspaceName: input.workspaceName,
        inviterName,
        roleLabel: meta.label,
        portal: meta.portal,
        roleDescription: meta.description,
        inviteUrl: url,
      }),
      workspace_id: input.workspaceId,
      workspace_name: input.workspaceName,
      role: input.role,
      role_label: meta.label,
      portal: meta.portal,
      invite_url: url,
      inviter_name: inviterName,
    });

    return { code, url };
  },

  /** Invites that are still claimable — not accepted, not revoked, not expired. */
  async listPendingInvites(workspaceId: string): Promise<WorkspaceInvite[]> {
    const { data, error } = await supabase
      .from('workspace_invites')
      .select('id, workspace_id, code, role, email, invitee_name, created_at, expires_at, accepted_at, revoked_at')
      .eq('workspace_id', workspaceId)
      .is('accepted_at', null)
      .is('revoked_at', null)
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data ?? []) as WorkspaceInvite[];
  },

  /** Owner/admin takes an unaccepted invite back. Returns false when not permitted / not found. */
  async revokeInvite(inviteId: string): Promise<boolean> {
    const { data, error } = await supabase.rpc('revoke_workspace_invite', { p_invite_id: inviteId });
    if (error) throw error;
    return data === true;
  },

  /** Owner/admin re-roles a member. The RPC refuses to strip a workspace's last owner. */
  async setMemberRole(workspaceId: string, userId: string, role: WorkspaceMemberRole): Promise<boolean> {
    const { data, error } = await supabase.rpc('set_workspace_member_role', {
      p_workspace_id: workspaceId, p_user_id: userId, p_role: role,
    });
    if (error) throw error;
    return data === true;
  },

  /** Owner/admin removes a member. The RPC refuses to remove a workspace's last owner. */
  async removeMember(workspaceId: string, userId: string): Promise<boolean> {
    const { data, error } = await supabase.rpc('remove_workspace_member', {
      p_workspace_id: workspaceId, p_user_id: userId,
    });
    if (error) throw error;
    return data === true;
  },

  /** Signed-in user redeems an invite → joins the workspace with the invite's role. */
  async redeemInvite(code: string): Promise<{ ok: boolean; workspace_id?: string; role?: string; error?: string }> {
    const { data, error } = await supabase.rpc('redeem_workspace_invite', { p_code: code });
    if (error) throw error;
    return data as any;
  },

  /** Operator/ancestor grants or revokes a module entitlement for a workspace (#181). */
  async setEntitlement(workspaceId: string, moduleSlug: string, enabled: boolean): Promise<void> {
    const { error } = await supabase.rpc('set_workspace_entitlement', {
      p_workspace_id: workspaceId, p_module_slug: moduleSlug, p_enabled: enabled,
    });
    if (error) throw error;
  },

  /** Map of workspace_id → enabled for a given module entitlement. */
  async getEntitlements(moduleSlug: string): Promise<Record<string, boolean>> {
    const { data } = await supabase
      .from('workspace_module_entitlements')
      .select('workspace_id, enabled')
      .eq('module_slug', moduleSlug);
    return Object.fromEntries((data ?? []).map((r: any) => [r.workspace_id, r.enabled]));
  },
};

/** Invite email body. All interpolation goes through the canonical `escapeHtml` (attribute-safe). */
function renderTeamInviteEmailHtml(input: {
  workspaceName: string;
  inviterName: string;
  roleLabel: string;
  portal: string;
  roleDescription: string;
  inviteUrl: string;
}): string {
  const e = escapeHtml;
  return `<!doctype html>
<html><body style="font-family:'Open Sans',Arial,sans-serif;max-width:560px;margin:32px auto;padding:24px;color:#222;">
  <h2 style="margin:0 0 16px;font-weight:300;">You've been invited to join the team</h2>
  <p style="margin:0 0 12px;"><strong>${e(input.inviterName)}</strong> invited you to join <strong>${e(input.workspaceName)}</strong> as <strong>${e(input.roleLabel)}</strong>.</p>
  <p style="margin:16px 0;padding:12px;background:#f5f5f5;border-left:3px solid #999;">
    <strong>${e(input.portal)}</strong><br>
    <span style="font-size:13px;color:#555;">${e(input.roleDescription)}</span>
  </p>
  <p style="margin:24px 0;">
    <a href="${e(input.inviteUrl)}" style="display:inline-block;padding:12px 24px;background:#8a3a6b;color:#fff;text-decoration:none;border-radius:9999px;font-weight:500;">Accept invitation</a>
  </p>
  <p style="margin:24px 0 0;font-size:13px;color:#666;">This invitation is tied to your email address and expires in 30 days.</p>
  <p style="margin:8px 0 0;font-size:12px;color:#999;word-break:break-all;">If the button doesn't work, paste this URL into your browser:<br>${e(input.inviteUrl)}</p>
</body></html>`;
}

/** Stash a referral code seen in the URL (?ref=) until the user is authenticated. */
export const REFERRAL_STORAGE_KEY = 'mk_pending_referral';

/** Stash an invite code seen in the URL (?invite=) until the user is authenticated. */
export const INVITE_STORAGE_KEY = 'mk_pending_invite';

