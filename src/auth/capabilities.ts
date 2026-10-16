/** Capability layer: personas and their capabilities. The per-role table is roleCapabilities.ts. */
import {
  BUSINESS_CAPABILITIES, OPERATOR_ONLY_CAPABILITIES, WORKSPACE_ROLE_CAPABILITIES, type Capability,
} from './roleCapabilities';

/** Who the user effectively is in the active workspace. */
export type Persona =
  | 'operator'   // owner/admin of the Materials Hub root — runs the platform
  | 'dealer'     // owner/admin of a supplier node (sells catalog downstream)
  | 'architect'  // owner/admin of an architect node (sells to end users with margin)
  | 'staff'      // team member of a business node (member role)
  | 'accountant' // invited external accountant — Finance surface only
  | 'sales'      // invited sales rep — Sales portal only: build quotes/orders for customers
  | 'sales_manager' // sales lead — same portal as a rep, but across the whole team's book
  | 'hr_staff'      // HR officer — reads the HR module, changes nothing
  | 'hr_manager'    // HR lead — runs the HR module end to end
  | 'warehouse_staff' // warehouse team — the stock module only
  | 'marketing_staff' // marketing team — the email-marketing module only
  | 'employee'   // invited staff member — HR self-service ONLY: their own record, nothing else
  | 'realestate_agent' // invited property agent — Real Estate portal only: manage listings +
                       // own leads/viewings (scoped via responsible_sales_user_ids / listing_agent_id)
  | 'guest';     // an outsider: their own account and what was shared, nothing else

export type { Capability } from './roleCapabilities';

/**
 * Personas that work with the product catalog — browse it and run material search. Broader than
 * `marketplace.browse` because project clients pick materials too; excludes `agent.use`, which an
 * HR-only employee holds.
 */
export const PRODUCT_BROWSE_ANY: Capability[] = [
  'marketplace.browse', 'moodboards.use', 'quotes.use', 'projects.use',
];

const roleCaps = (role: string): Capability[] => [...(WORKSPACE_ROLE_CAPABILITIES[role] ?? [])];

/** Persona → granted capabilities, derived from the per-role table in roleCapabilities.ts. */
export const PERSONA_CAPABILITIES: Record<Persona, Capability[]> = {
  operator: [...OPERATOR_ONLY_CAPABILITIES, ...BUSINESS_CAPABILITIES],
  dealer: [...BUSINESS_CAPABILITIES],
  architect: [...BUSINESS_CAPABILITIES],
  staff: roleCaps('member'),
  accountant: roleCaps('accountant'),
  sales: roleCaps('sales'),
  sales_manager: roleCaps('sales_manager'),
  hr_staff: roleCaps('hr'),
  hr_manager: roleCaps('hr_manager'),
  warehouse_staff: roleCaps('warehouse'),
  marketing_staff: roleCaps('marketing'),
  employee: roleCaps('employee'),
  realestate_agent: roleCaps('realestate_agent'),
  guest: roleCaps('client'),
};

export interface PersonaInputs {
  isPlatformOperator: boolean;
  rank: 'operator' | 'dealer' | 'architect' | null;
  workspaceRole: string | null; // owner | admin | member | client
  workspaceKind?: string | null;
  /** Global account role (roles.name) — the access TIER set under Users. Primary driver. */
  accountRole?: string | null;
}

/**
 * Workspace TEAM roles → their scoped persona. EXHAUSTIVE over every scoped role in
 * `WORKSPACE_MEMBER_ROLES`; checked ahead of the account tier in `resolvePersona`.
 */
const TEAM_ROLE_PERSONA: Record<string, Persona> = {
  sales: 'sales',
  sales_manager: 'sales_manager',
  hr: 'hr_staff',
  hr_manager: 'hr_manager',
  warehouse: 'warehouse_staff',
  marketing: 'marketing_staff',
  accountant: 'accountant',
  employee: 'employee',
  realestate_agent: 'realestate_agent',
  client: 'guest',
};

/** Resolve the single persona. */
export function resolvePersona({
  isPlatformOperator, rank, workspaceRole, accountRole, workspaceKind,
}: PersonaInputs): Persona {
  if (isPlatformOperator) return 'operator';

  const role = workspaceRole ?? '';

  if (workspaceKind === 'guest') return 'guest';

  // 1. Scoped TEAM roles — the exhaustive map. What you were invited to BE in this workspace is
  //    more specific than whatever global tier you happen to carry: a client is a client here even
  //    if they sell materials somewhere else.
  //    Adding a role? Put it in TEAM_ROLE_PERSONA, not in a new `if`.
  const teamPersona = TEAM_ROLE_PERSONA[role];
  if (teamPersona) return teamPersona;

  // 2. Running this workspace. `rank` is the workspace's own marketplace rank, not the user's tier.
  if (role === 'owner' || role === 'admin') {
    if (rank === 'architect') return 'architect';
    // Dealer rank, root rank but not the platform operator, or unknown — a dealer-level business.
    return 'dealer';
  }

  // 3. A plain team member of a business node. Deliberately BEFORE the account tier: being a
  //    supplier elsewhere does not make you an administrator of this workspace.
  if (role === 'member') return 'staff';

  // 4. No workspace role at all (membership not resolved / a user outside any workspace). Only
  //    here does the global account tier speak.
  //    NOTHING functional belongs in this switch. `public.roles` is the GLOBAL account tier — a
  //    value set by a platform operator and true in EVERY workspace the user belongs to — so it
  //    holds only `supplier` / `architect` (the tiers role_upgrade_requests accepts), `admin`, and
  //    the `user` baseline.
  switch (accountRole) {
    case 'supplier':
    case 'dealer':   // legacy alias
    case 'factory':  // legacy alias → supplier tier
      return 'dealer';
    case 'architect': return 'architect';
  }

  // 5. Anything else = team staff of a business node.
  return 'staff';
}

export function personaCan(persona: Persona, capability: Capability): boolean {
  return PERSONA_CAPABILITIES[persona].includes(capability);
}
