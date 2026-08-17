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
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
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

  it('the workspace role beats EVERY account tier, for every role', () => {
    // #358 PQ-1. Five roles (`client`, `accountant`, `sales`, `employee`, `realestate_agent`)
    // resolved BELOW the account-tier switch, so a user carrying `supplier` / `dealer` /
    // `factory` / `architect` and invited as a CLIENT came out a `dealer` — finance.manage,
    // crm.view, warehouse.manage, network.manage and pricing.manage, shown to the customer.
    // The single-role test above passes `accountRole: null`, which is exactly why it never fired.
    const TIERS = [null, 'user', 'supplier', 'dealer', 'factory', 'architect', 'admin'];
    for (const role of WORKSPACE_MEMBER_ROLES) {
      // owner/admin resolve from the WORKSPACE's rank, not the user's tier — checked separately.
      if (role === 'owner' || role === 'admin') continue;
      for (const accountRole of TIERS) {
        const persona = resolvePersona({
          isPlatformOperator: false, rank: null, workspaceRole: role, accountRole,
        });
        expect(
          persona,
          `"${role}" + account tier "${accountRole}" resolved to "${persona}" — the workspace role must win`,
        ).toBe(PERSONA_BY_ROLE[role]);
      }
    }
  });

  it('no scoped workspace role can reach a workspace-management capability through a tier', () => {
    // The consequence, stated directly: whatever tier a customer or an invited specialist carries,
    // they never come out holding the keys to the workspace.
    const SCOPED = WORKSPACE_MEMBER_ROLES.filter((r) => r !== 'owner' && r !== 'admin' && r !== 'member');
    for (const role of SCOPED) {
      for (const accountRole of ['supplier', 'architect', 'factory', 'admin']) {
        const persona = resolvePersona({
          isPlatformOperator: false, rank: 'dealer', workspaceRole: role, accountRole,
        });
        for (const cap of NEVER_FOR_TEAM_ROLES) {
          expect(
            PERSONA_CAPABILITIES[persona],
            `"${role}" + tier "${accountRole}" resolved to "${persona}", which holds ${cap}`,
          ).not.toContain(cap);
        }
      }
    }
  });

  it('every scoped role is in the map rather than an `if` below the tier switch', () => {
    // The structural half: the fix is only durable while the map is exhaustive. A role added later
    // with a hand-written branch would pass the behavioural tests above only until someone moved it.
    const src = readFileSync(join(__dirname, '..', '..', 'src', 'auth', 'capabilities.ts'), 'utf8');
    const map = src.slice(src.indexOf('const TEAM_ROLE_PERSONA'), src.indexOf('export function resolvePersona'));
    for (const role of WORKSPACE_MEMBER_ROLES) {
      if (role === 'owner' || role === 'admin' || role === 'member') continue;
      expect(map, `"${role}" is not in TEAM_ROLE_PERSONA — it resolves below the account-tier switch`)
        .toMatch(new RegExp(`\\b${role}:`));
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
      // #358 PQ-10: all three portals are paid modules and none of them declared it, so the
      // invite form offered an accountant a Finance portal the workspace had not bought.
      accountant: 'sales-finance', sales: 'quotes', sales_manager: 'quotes',
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
  };

  it('every account tier with a dedicated persona is handled by resolvePersona', () => {
    for (const [accountRole, expected] of Object.entries(ACCOUNT_TIER_PERSONAS)) {
      const persona = resolvePersona({
        isPlatformOperator: false, rank: null, workspaceRole: null, accountRole,
      });
      expect(persona, `account tier "${accountRole}" fell through to "${persona}"`).toBe(expected);
    }
  });

  it('every account tier has a human label — never a raw snake_case value', () => {
    for (const name of Object.keys(ACCOUNT_TIER_PERSONAS)) {
      expect(roleLabel(name), `"${name}" has no ROLE_LABELS entry`).not.toContain('_');
    }
  });

  it('NO functional team role is assignable as a global account tier', () => {
    // public.roles is global: a tier is true in every workspace the user belongs to. "Runs HR" /
    // "on the warehouse team" / "sales manager" are per-workspace facts, so they must exist ONLY in
    // workspace_members.role. Five of them were briefly added here and withdrawn.
    const TEAM_ONLY = [
      'sales', 'sales_manager', 'hr', 'hr_manager', 'warehouse', 'marketing',
      'accountant', 'employee', 'realestate_agent',
    ] as const;
    for (const role of TEAM_ONLY) {
      expect(Object.values(ROLES) as string[],
        `"${role}" must not be an account tier — it is a workspace team role`).not.toContain(role);
      // …but it must still resolve correctly as a WORKSPACE role.
      expect(resolvePersona({
        isPlatformOperator: false, rank: null, workspaceRole: role, accountRole: null,
      }), `"${role}" must still work as a workspace role`).not.toBe('staff');
    }
  });

  it('the account tier holds ONLY genuine platform tiers', () => {
    // What is left after the cleanup: the two tiers role_upgrade_requests accepts, the operator
    // flag, and the baseline. Anything else appearing here is a functional role in disguise.
    // (OWNER / FACTORY / DEALER / SUPER_ADMIN are legacy or workspace values, not `roles` rows.)
    const TIERS = new Set(['admin', 'super_admin', 'owner', 'supplier', 'architect', 'user', 'factory', 'dealer']);
    for (const value of Object.values(ROLES)) {
      expect(TIERS, `"${value}" is not a platform tier — did a functional role sneak back in?`).toContain(value);
    }
  });

  it('`finance` is no longer a second name for the accountant workspace role', () => {
    // workspace_members accepted BOTH 'finance' and 'accountant'. 'finance' was absent from this
    // catalog and had no resolvePersona branch, so a member stored with it silently became `staff` —
    // drift the DB allowed but the TypeScript side could not see. Dropped from the CHECK constraint.
    expect(WORKSPACE_MEMBER_ROLES as readonly string[]).not.toContain('finance');
    expect(WORKSPACE_MEMBER_ROLES as readonly string[]).toContain('accountant');
  });
});
