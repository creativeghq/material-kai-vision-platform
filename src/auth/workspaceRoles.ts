/**
 * The invitable workspace-team roles — ONE catalog, read by the invite form, the members list and
 * the pending-invite list, so a role's label, portal and description can never disagree between
 * the three surfaces.
 *
 * This is the "who is a sales manager?" answer: a workspace role, set by invitation (or by
 * re-roling an existing member), which `resolvePersona` in `./capabilities` turns into a persona
 * and therefore a portal. It is deliberately NOT the `roles` table — that one holds the global
 * ACCOUNT tier (Operator / Supplier / Architect …) set by a platform admin under Users.
 *
 * Mirrored server-side by `workspace_invites_role_check` / `workspace_members_role_check` and the
 * role allowlists inside `create_workspace_invite` / `set_workspace_member_role`. Adding a role
 * means: enum here + both CHECK constraints + both RPC allowlists + a `crm_categories` row of
 * kind='role' with `source_value` = the role value (so the derived category appears) + a
 * `resolvePersona` branch. Guarded by tests/unit/workspaceRoles.test.ts.
 */

/** Roles that can be handed out via an invite link / invite email. */
export const WORKSPACE_INVITE_ROLES = [
  'member', 'accountant', 'sales', 'sales_manager', 'employee', 'realestate_agent',
] as const;
export type WorkspaceInviteRole = typeof WORKSPACE_INVITE_ROLES[number];

/** Everything `workspace_members.role` may hold — the invitable set plus the two that are only
 *  reachable by promotion (`owner`, `admin`) or by a project/referral join (`client`). */
export const WORKSPACE_MEMBER_ROLES = [
  'owner', 'admin', ...WORKSPACE_INVITE_ROLES, 'client',
] as const;
export type WorkspaceMemberRole = typeof WORKSPACE_MEMBER_ROLES[number];

export interface WorkspaceRoleMeta {
  /** Human label — the ONLY place a role's display name is written. */
  label: string;
  /** Where this role lands after signing in, in words the inviter recognises. */
  portal: string;
  /** What they can and (importantly) cannot do. Shown under the role picker. */
  description: string;
  /** Module slug that must be enabled for the role to be worth offering, if any. */
  requiresModule?: string;
}

export const WORKSPACE_ROLE_META: Record<WorkspaceMemberRole, WorkspaceRoleMeta> = {
  owner: {
    label: 'Owner',
    portal: 'Full workspace',
    description: 'Owns the workspace: every module, all settings, billing and the team itself.',
  },
  admin: {
    label: 'Admin',
    portal: 'Full workspace',
    description: 'Runs the workspace alongside the owner — all modules and settings.',
  },
  member: {
    label: 'Member',
    portal: 'Full workspace (no admin)',
    description: 'Standard staff access: finance ops, CRM, quotes, stock, projects. No network, pricing or team management.',
  },
  accountant: {
    label: 'Accountant',
    portal: 'Finance portal',
    description: 'Finance only: view invoices/bills/reports, record payments, submit to myDATA. No settings, pricing, CRM or new documents.',
  },
  sales: {
    label: 'Sales Rep',
    portal: 'Sales portal',
    description: 'Builds quotes and orders for their own customers. Sees only their own book. No finance, pricing or settings.',
  },
  sales_manager: {
    label: 'Sales Manager',
    portal: 'Sales portal (team-wide)',
    description: 'Everything a rep can do, across the WHOLE team’s quote book, including cost and margin. Still no finance settings, pricing rules or team management.',
  },
  employee: {
    label: 'Employee',
    portal: 'HR self-service',
    description: 'Their own HR record only: profile, onboarding, time off, documents, clock in/out. Cannot see any other person’s details.',
    requiresModule: 'hr',
  },
  realestate_agent: {
    label: 'Estate Agent',
    portal: 'Real Estate portal',
    description: 'Real Estate only: their own listings and leads, plus any listing marked “open for all”. No finance, pricing or settings.',
    requiresModule: 'real-estate',
  },
  client: {
    label: 'Client',
    portal: 'Client view',
    description: 'A project client or referral-joined user: their own projects, quotes and moodboards only.',
  },
};

/** Display label for any stored role value, including legacy/unknown ones. */
export function workspaceRoleLabel(role: string | null | undefined): string {
  if (!role) return '—';
  return WORKSPACE_ROLE_META[role as WorkspaceMemberRole]?.label
    ?? role.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}
