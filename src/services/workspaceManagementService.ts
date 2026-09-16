import { supabase } from '@/integrations/supabase/client';
import { escapeHtml } from '@/utils/escapeHtml';
import { flowEventService } from '@/services/flows/flowEventService';
import { WORKSPACE_ROLE_META, type WorkspaceInviteRole, type WorkspaceMemberRole } from '@/auth/workspaceRoles';

export type InviteKind = 'team' | 'owner' | 'customer' | 'guest';

export type InviteAccessKind = 'member' | 'customer' | 'guest';

export type GrantableRecordType = 'project' | 'property' | 'moodboard';

export interface InvitableRecord {
  record_type: GrantableRecordType;
  record_id: string;
  title: string;
  subtitle: string | null;
}

export interface RecordGrant {
  record_type: GrantableRecordType;
  record_id: string;
  role?: 'viewer' | 'editor' | 'owner';
}

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
  /** The CRM record this invite was raised from; the contact is linked to the login on acceptance. */
  crm_contact_id: string | null;
  crm_company_id: string | null;
}

export interface CompanyWorkspaceStatus {
  state: 'none' | 'invited' | 'active' | 'stalled';
  workspace_id?: string;
  workspace_name?: string;
  catalog_access?: 'operator_catalog' | 'own_products_only';
  discount_pct?: number | null;
  invite_id?: string | null;
  invite_code?: string | null;
  invite_email?: string | null;
  invited_at?: string | null;
  expires_at?: string | null;
}

export function inviteUrlFor(code: string): string {
  const appUrl = (import.meta.env.VITE_PUBLIC_APP_URL || window.location.origin).replace(/\/$/, '');
  return `${appUrl}/auth?mode=signup&invite=${code}`;
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

  /** Owner/admin mints a role-carrying invite; returns the code.
   *  Passing `email` binds the invite to that address — redeem_workspace_invite then refuses a
   *  forwarded link claimed by anyone else, and the address is what the invite email goes to. */
  async createInvite(
    workspaceId: string,
    role: WorkspaceInviteRole,
    opts?: {
      email?: string; name?: string; crmContactId?: string;
      accessKind?: InviteAccessKind; grants?: RecordGrant[];
    },
  ): Promise<string> {
    const { data, error } = await supabase.rpc('create_workspace_invite', {
      p_workspace_id: workspaceId,
      p_role: role,
      p_email: opts?.email ?? null,
      p_invitee_name: opts?.name ?? null,
      p_crm_contact_id: opts?.crmContactId ?? null,
      p_access_kind: opts?.accessKind ?? 'member',
      p_grants: opts?.grants ?? null,
    } as never);
    if (error) throw error;
    return data as string;
  },

  /** Returns the link too, so the inviter can still hand it over another way. */
  async inviteByEmail(input: {
    workspaceId: string;
    workspaceName: string;
    role: WorkspaceInviteRole;
    email: string;
    name?: string;
    crmContactId?: string;
  }): Promise<{ code: string; url: string }> {
    const email = input.email.trim().toLowerCase();
    const code = await this.createInvite(input.workspaceId, input.role, {
      email, name: input.name, crmContactId: input.crmContactId,
    });
    return emitInvitation({
      code, email, kind: 'team', roleLabel: WORKSPACE_ROLE_META[input.role].label,
      role: input.role,
      workspaceId: input.workspaceId,
      workspaceName: input.workspaceName,
    });
  },

  async invitableRecords(workspaceId: string): Promise<InvitableRecord[]> {
    const { data, error } = await supabase.rpc('invitable_records', {
      p_workspace_id: workspaceId,
    } as never);
    if (error) throw error;
    return (data ?? []) as InvitableRecord[];
  },

  async inviteAsGuest(input: {
    workspaceId: string;
    workspaceName: string;
    email: string;
    name?: string;
    crmContactId?: string;
    grants: RecordGrant[];
  }): Promise<{ code: string; url: string }> {
    const email = input.email.trim().toLowerCase();
    const code = await this.createInvite(input.workspaceId, 'member', {
      email, name: input.name, crmContactId: input.crmContactId,
      accessKind: 'guest', grants: input.grants,
    });
    return emitInvitation({
      code, email, kind: 'guest',
      workspaceId: input.workspaceId,
      workspaceName: input.workspaceName,
    });
  },

  /** The Client Portal reads `crm_contacts.user_id`, never membership — the link IS the grant. */
  async inviteAsCustomer(input: {
    workspaceId: string;
    workspaceName: string;
    crmContactId: string;
    email: string;
    name?: string;
  }): Promise<{ code: string; url: string }> {
    const email = input.email.trim().toLowerCase();
    const code = await this.createInvite(input.workspaceId, 'member', {
      email, name: input.name, crmContactId: input.crmContactId, accessKind: 'customer',
    });
    return emitInvitation({
      code, email, kind: 'customer',
      workspaceId: input.workspaceId,
      workspaceName: input.workspaceName,
    });
  },

  /** The workspace is minted with NO members and gets its owner on redemption — nobody has an
   *  account created for them behind their back. */
  async inviteCompanyAsWorkspace(input: {
    companyId: string;
    companyName: string;
    email: string;
    name?: string;
    crmContactId?: string;
    canSupplyProducts?: boolean;
    catalogAccess?: 'operator_catalog' | 'own_products_only';
    discountPct?: number;
  }): Promise<{ code: string; url: string; workspaceId: string }> {
    const email = input.email.trim().toLowerCase();
    const { data, error } = await supabase.rpc('invite_crm_company_as_workspace', {
      p_company_id: input.companyId,
      p_email: email,
      p_invitee_name: input.name ?? null,
      p_crm_contact_id: input.crmContactId ?? null,
      p_can_supply_products: input.canSupplyProducts ?? false,
      p_catalog_access: input.catalogAccess ?? 'operator_catalog',
      p_discount_pct: input.discountPct ?? 0,
    } as never);
    if (error) throw error;
    const res = data as { workspace_id: string; code: string };
    const sent = await emitInvitation({
      code: res.code, email, kind: 'owner',
      workspaceId: res.workspace_id,
      workspaceName: input.companyName,
    });
    return { ...sent, workspaceId: res.workspace_id };
  },

  async upgradeGuestWorkspace(workspaceId: string): Promise<boolean> {
    const { data, error } = await supabase.rpc('upgrade_guest_workspace', {
      p_workspace_id: workspaceId,
    } as never);
    if (error) throw error;
    return data === true;
  },

  async companyWorkspaceStatus(companyId: string): Promise<CompanyWorkspaceStatus> {
    const { data, error } = await supabase.rpc('crm_company_workspace_status', {
      p_company_id: companyId,
    } as never);
    if (error) throw error;
    return (data ?? { state: 'none' }) as CompanyWorkspaceStatus;
  },

  /** Invites that are still claimable — not accepted, not revoked, not expired. */
  async listPendingInvites(workspaceId: string): Promise<WorkspaceInvite[]> {
    const { data, error } = await supabase
      .from('workspace_invites')
      .select('id, workspace_id, code, role, email, invitee_name, created_at, expires_at, accepted_at, revoked_at, crm_contact_id, crm_company_id')
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

  /** Operator/ancestor grants or revokes a module entitlement for a workspace. */
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

/** The ONE place an invitation reaches a person — every path funnels here, because a minted
 *  invite that is never sent is a code nobody will ever type. Delivery is the
 *  `workspace_invitation_sent` flow event, so an operator can retarget it without a deploy. */
async function emitInvitation(input: {
  code: string;
  email: string;
  kind: InviteKind;
  roleLabel?: string;
  role?: WorkspaceMemberRole;
  workspaceId: string;
  workspaceName: string;
}): Promise<{ code: string; url: string }> {
  const url = inviteUrlFor(input.code);

  const { data: { user } } = await supabase.auth.getUser();
  const inviterName = (user?.user_metadata as any)?.full_name || user?.email || 'A colleague';
  const copy = INVITE_COPY[input.kind];
  const roleLabel = input.roleLabel ?? copy.roleLabel;

  flowEventService.emit('workspace_invitation_sent', {
    to: input.email,
    subject: copy.subject(inviterName, input.workspaceName, roleLabel),
    body: renderInviteEmailHtml({
      workspaceName: input.workspaceName,
      inviterName,
      heading: copy.heading,
      lead: copy.lead(input.workspaceName, roleLabel),
      portal: copy.portal,
      portalDetail: copy.portalDetail,
      cta: copy.cta,
      inviteUrl: url,
    }),
    workspace_id: input.workspaceId,
    workspace_name: input.workspaceName,
    access_kind: input.kind === 'customer' ? 'customer' : 'member',
    role: input.role ?? null,
    role_label: roleLabel,
    portal: copy.portal,
    invite_url: url,
    inviter_name: inviterName,
  });

  return { code: input.code, url };
}

const INVITE_COPY: Record<InviteKind, {
  roleLabel: string;
  heading: string;
  portal: string;
  portalDetail: string;
  cta: string;
  subject: (inviter: string, workspace: string, role: string) => string;
  lead: (workspace: string, role: string) => string;
}> = {
  team: {
    roleLabel: 'Member',
    heading: "You've been invited to join the team",
    portal: 'Team access',
    portalDetail: 'You will be working inside their workspace alongside their staff.',
    cta: 'Accept invitation',
    subject: (i, w, r) => `${i} invited you to join ${w} as ${r}`,
    lead: (w, r) => `invited you to join <strong>${escapeHtml(w)}</strong> as <strong>${escapeHtml(r)}</strong>.`,
  },
  owner: {
    roleLabel: 'Owner',
    heading: 'Your workspace is ready',
    portal: 'Your own workspace',
    portalDetail: 'Your customers, prices and documents are yours alone. You invite your own people.',
    cta: 'Create my login',
    subject: (i, w) => `${i} set up ${w} for you`,
    lead: (w) => `set up <strong>${escapeHtml(w)}</strong> for you. Accept below to create your login and take ownership of it.`,
  },
  guest: {
    roleLabel: 'Guest',
    heading: 'Something has been shared with you',
    portal: 'Shared with me',
    portalDetail: 'Only what was shared with you, for as long as it is shared.',
    cta: 'Open what was shared',
    subject: (i, w) => `${i} shared something with you on ${w}`,
    lead: (w) => `shared work with you on <strong>${escapeHtml(w)}</strong>. Accept below to see it.`,
  },
  customer: {
    roleLabel: 'Customer',
    heading: 'See your orders and invoices online',
    portal: 'Your account',
    portalDetail: 'Your orders, invoices, receipts and balance. Nothing else, and nobody else can see it.',
    cta: 'Create my login',
    subject: (i, w) => `${i} set up your account with ${w}`,
    lead: (w) => `set up an account for you with <strong>${escapeHtml(w)}</strong>, so you can see your own orders, invoices and balance whenever you want them.`,
  },
};

/** Invite email body. All interpolation goes through the canonical `escapeHtml` (attribute-safe). */
function renderInviteEmailHtml(input: {
  workspaceName: string;
  inviterName: string;
  heading: string;
  lead: string;
  portal: string;
  portalDetail: string;
  cta: string;
  inviteUrl: string;
}): string {
  const e = escapeHtml;
  return `<!doctype html>
<html><body style="font-family:'Open Sans',Arial,sans-serif;max-width:560px;margin:32px auto;padding:24px;color:#222;">
  <h2 style="margin:0 0 16px;font-weight:300;">${e(input.heading)}</h2>
  <p style="margin:0 0 12px;"><strong>${e(input.inviterName)}</strong> ${input.lead}</p>
  <p style="margin:16px 0;padding:12px;background:#f5f5f5;border-left:3px solid #999;">
    <strong>${e(input.portal)}</strong><br>
    <span style="font-size:13px;color:#555;">${e(input.portalDetail)}</span>
  </p>
  <p style="margin:24px 0;">
    <a href="${e(input.inviteUrl)}" style="display:inline-block;padding:12px 24px;background:#8a3a6b;color:#fff;text-decoration:none;border-radius:9999px;font-weight:500;">${e(input.cta)}</a>
  </p>
  <p style="margin:24px 0 0;font-size:13px;color:#666;">This invitation is tied to your email address and expires in 30 days.</p>
  <p style="margin:8px 0 0;font-size:12px;color:#999;word-break:break-all;">If the button doesn't work, paste this URL into your browser:<br>${e(input.inviteUrl)}</p>
</body></html>`;
}

/** Stash a referral code seen in the URL (?ref=) until the user is authenticated. */
export const REFERRAL_STORAGE_KEY = 'mk_pending_referral';

/** Stash an invite code seen in the URL (?invite=) until the user is authenticated. */
export const INVITE_STORAGE_KEY = 'mk_pending_invite';

