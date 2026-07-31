/**
 * Guards the workspace-role catalog against the two ways it has already drifted:
 *
 *  1. A role accepted by `workspace_invites_role_check` but REJECTED by
 *     `workspace_members_role_check` — which is exactly what made every `sales`,
 *     `realestate_agent` and `employee` invite fail at redemption (the INSERT into
 *     workspace_members threw a CHECK violation). The DB is the real gate; this test keeps the
 *     TS catalog honest and forces the two lists to stay a superset/subset pair.
 *  2. A role with no `resolvePersona` branch, which silently falls through to `staff` and
 *     hands the invitee finance/CRM/warehouse capabilities the inviter never intended.
 */
import { describe, it, expect } from 'vitest';
import {
  WORKSPACE_INVITE_ROLES, WORKSPACE_MEMBER_ROLES, WORKSPACE_ROLE_META, ROLE_MODULE_SLUGS,
  workspaceRoleLabel, type WorkspaceMemberRole,
} from '@/auth/workspaceRoles';
import { resolvePersona, PERSONA_CAPABILITIES } from '@/auth/capabilities';
import { ROLES } from '@/auth/roles';
import { roleLabel } from '@/modules/crm/crmConstants';

/** Roles that intentionally resolve to a shared persona rather than one of their own. */
const PERSONA_BY_ROLE: Record<WorkspaceMemberRole, string> = {
  owner: 'dealer',
  admin: 'dealer',
  member: 'staff',
  accountant: 'accountant',
  sales: 'sales',
  sales_manager: 'sales_manager',
  hr: 'hr_staff',
  hr_manager: 'hr_manager',
  warehouse: 'warehouse_staff',
  marketing: 'marketing_staff',
  employee: 'employee',
  realestate_agent: 'realestate_agent',
  client: 'end_user',
};

/** Capabilities NO functional team role may hold — the ones that would make it a workspace manager
 *  rather than a member of a team. Widening access levels later must not cross this line. */
const NEVER_FOR_TEAM_ROLES = ['platform.admin', 'network.manage', 'pricing.manage', 'catalog.import'] as const;

describe('workspace role catalog', () => {
  it('every invitable role is also a storable member role', () => {
    for (const role of WORKSPACE_INVITE_ROLES) {
      expect(
        WORKSPACE_MEMBER_ROLES as readonly string[],
        `"${role}" can be invited but not stored — redeem_workspace_invite would throw a CHECK violation`,
      ).toContain(role);
    }
  });

  it('every member role has label/portal/description metadata', () => {
    for (const role of WORKSPACE_MEMBER_ROLES) {
      const meta = WORKSPACE_ROLE_META[role];
      expect(meta, `no metadata for "${role}"`).toBeTruthy();
      expect(meta.label.length, `"${role}" has no label`).toBeGreaterThan(0);
      expect(meta.portal.length, `"${role}" has no portal`).toBeGreaterThan(0);
      expect(meta.description.length, `"${role}" has no description`).toBeGreaterThan(0);
    }
  });

  it('every member role resolves to its intended persona (never an accidental staff fallback)', () => {
    for (const role of WORKSPACE_MEMBER_ROLES) {
      const persona = resolvePersona({
        isPlatformOperator: false, rank: null, workspaceRole: role, accountRole: null,
      });
      expect(persona, `"${role}" resolved to "${persona}"`).toBe(PERSONA_BY_ROLE[role]);
      expect(PERSONA_CAPABILITIES[persona], `persona "${persona}" has no capability list`).toBeTruthy();
    }
  });

  it('a sales_manager invite is not downgraded by a "sales" account tier', () => {
    // resolvePersona checks accountRole before the workspace-role fallbacks, so sales_manager has
    // to win explicitly — otherwise an invited manager whose account tier is `sales` becomes a rep.
    expect(resolvePersona({
      isPlatformOperator: false, rank: null, workspaceRole: 'sales_manager', accountRole: 'sales',
    })).toBe('sales_manager');
  });

  it('every role whose portal is a paid module declares requiresModule, and the invite form knows that slug', () => {
    // Without requiresModule the role is offered even when the workspace has not enabled the module,
    // so the invitee lands on a surface that isn't there. Without the slug being in ROLE_MODULE_SLUGS
    // the invite form has no useModule call for it and the filter silently passes it through.
    const expected: Partial<Record<WorkspaceMemberRole, string>> = {
      hr: 'hr', hr_manager: 'hr', employee: 'hr',
      warehouse: 'stock', marketing: 'email-marketing', realestate_agent: 'real-estate',
    };
    for (const [role, slug] of Object.entries(expected)) {
      expect(WORKSPACE_ROLE_META[role as WorkspaceMemberRole].requiresModule,
        `"${role}" should be gated on the ${slug} module`).toBe(slug);
    }
    for (const role of WORKSPACE_MEMBER_ROLES) {
      const slug = WORKSPACE_ROLE_META[role].requiresModule;
      if (!slug) continue;
      expect(ROLE_MODULE_SLUGS as readonly string[],
        `"${role}" needs module "${slug}", which TeamPanel has no useModule call for`).toContain(slug);
    }
  });

  it('functional team roles never hold workspace-management capabilities', () => {
    const teamRoles: WorkspaceMemberRole[] = [
      'sales', 'sales_manager', 'hr', 'hr_manager', 'warehouse', 'marketing',
      'accountant', 'employee', 'realestate_agent',
    ];
    for (const role of teamRoles) {
      const persona = resolvePersona({
        isPlatformOperator: false, rank: null, workspaceRole: role, accountRole: null,
      });
      for (const cap of NEVER_FOR_TEAM_ROLES) {
        expect(PERSONA_CAPABILITIES[persona],
          `"${role}" (persona ${persona}) must not hold ${cap}`).not.toContain(cap);
      }
    }
  });

  it('each functional team role holds its own module capability and not its neighbours’', () => {
    const owns: Array<[WorkspaceMemberRole, string, string[]]> = [
      // role, must hold, must NOT hold
      ['hr',         'hr.view',          ['hr.manage', 'warehouse.manage', 'marketing.email', 'sales.portal']],
      ['hr_manager', 'hr.manage',        ['warehouse.manage', 'marketing.email', 'sales.portal']],
      ['warehouse',  'warehouse.manage', ['hr.view', 'marketing.email', 'sales.portal']],
      ['marketing',  'marketing.email',  ['hr.view', 'warehouse.manage', 'sales.portal']],
    ];
    for (const [role, must, mustNot] of owns) {
      const persona = resolvePersona({
        isPlatformOperator: false, rank: null, workspaceRole: role, accountRole: null,
      });
      expect(PERSONA_CAPABILITIES[persona], `"${role}" should hold ${must}`).toContain(must);
      for (const cap of mustNot) {
        expect(PERSONA_CAPABILITIES[persona], `"${role}" should NOT hold ${cap}`).not.toContain(cap);
      }
    }
  });

  it('a team role is not overridden by a broader account tier', () => {
    // Being invited to run HR here is more specific than whatever global tier you carry.
    expect(resolvePersona({
      isPlatformOperator: false, rank: null, workspaceRole: 'hr_manager', accountRole: 'sales',
    })).toBe('hr_manager');
    expect(resolvePersona({
      isPlatformOperator: false, rank: null, workspaceRole: 'warehouse', accountRole: 'architect',
    })).toBe('warehouse_staff');
  });

  it('a sales manager sees the team book; a rep does not', () => {
    expect(PERSONA_CAPABILITIES.sales_manager).toContain('sales.team.view');
    expect(PERSONA_CAPABILITIES.sales).not.toContain('sales.team.view');
    // Neither is a workspace manager — the manager gains SCOPE, not administration.
    for (const cap of ['finance.manage', 'pricing.manage', 'network.manage'] as const) {
      expect(PERSONA_CAPABILITIES.sales_manager).not.toContain(cap);
    }
  });

  it('labels never fall back to a raw snake_case value for a known role', () => {
    // (see below for the account-tier half of the vocabulary)
    for (const role of WORKSPACE_MEMBER_ROLES) {
      expect(workspaceRoleLabel(role)).not.toContain('_');
    }
    // Unknown/legacy values still render something human rather than blank.
    expect(workspaceRoleLabel('some_legacy_role')).toBe('Some Legacy Role');
    expect(workspaceRoleLabel(null)).toBe('—');
  });
});

/**
 * The OTHER half of the vocabulary: the global account tier (`public.roles`, assigned from
 * /admin/crm → Users). It is a separate axis from the workspace role, but the two overlap for the
 * sales personas — and that overlap is where they drifted: `sales` existed as an account tier while
 * `sales_manager` existed only as a workspace role, so the Users tab could make someone a rep but
 * never a manager.
 */
describe('account-tier roles (public.roles)', () => {
  const ACCOUNT_TIER_PERSONAS: Record<string, string> = {
    [ROLES.SUPPLIER]: 'dealer',
    [ROLES.DEALER]: 'dealer',   // legacy alias
    [ROLES.FACTORY]: 'dealer',  // legacy alias
    [ROLES.ARCHITECT]: 'architect',
    [ROLES.SALES]: 'sales',
    [ROLES.SALES_MANAGER]: 'sales_manager',
    [ROLES.FINANCE]: 'accountant',
    [ROLES.HR]: 'hr_staff',
    [ROLES.HR_MANAGER]: 'hr_manager',
    [ROLES.WAREHOUSE]: 'warehouse_staff',
    [ROLES.MARKETING]: 'marketing_staff',
  };

  it('every account tier with a dedicated persona is handled by resolvePersona', () => {
    for (const [accountRole, expected] of Object.entries(ACCOUNT_TIER_PERSONAS)) {
      const persona = resolvePersona({
        isPlatformOperator: false, rank: null, workspaceRole: null, accountRole,
      });
      expect(persona, `account tier "${accountRole}" fell through to "${persona}"`).toBe(expected);
    }
  });

  it('both sales tiers have a human label — never a raw snake_case value', () => {
    expect(roleLabel(ROLES.SALES)).toBe('Sales Rep');
    expect(roleLabel(ROLES.SALES_MANAGER)).toBe('Sales Manager');
    for (const name of Object.keys(ACCOUNT_TIER_PERSONAS)) {
      expect(roleLabel(name), `"${name}" has no ROLE_LABELS entry`).not.toContain('_');
    }
  });

  it('the sales pair is symmetric across both axes', () => {
    // Set from Users (account tier) or from Profile → Team (workspace role) — same persona either
    // way, so an admin is never told "you can be a rep here but a manager only over there".
    for (const role of ['sales', 'sales_manager'] as const) {
      expect(resolvePersona({ isPlatformOperator: false, rank: null, workspaceRole: null, accountRole: role }))
        .toBe(resolvePersona({ isPlatformOperator: false, rank: null, workspaceRole: role, accountRole: null }));
    }
  });
});
