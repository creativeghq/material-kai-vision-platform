/**
 * Capability layer (single source of truth for "what can this user do here?").
 *
 * The platform has historically gated on ad-hoc `isAdmin()` string checks scattered
 * across components, plus three disconnected role sources. This file collapses gating
 * into ONE model:
 *
 *     (role in active workspace) + (marketplace rank of that workspace) + (platform-operator flag)
 *        → a single PERSONA
 *        → a fixed set of CAPABILITIES
 *
 * Adding a capability or changing who gets it is a one-line edit to PERSONA_CAPABILITIES,
 * never a 20-file sweep. Consume via `usePermissions()` / `<Can>` — never re-derive
 * persona logic in a component.
 */

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
  | 'end_user';  // project client / referral-joined member — restricted surface

/** Every gateable capability on the platform. Keep verbs coarse + surface-oriented. */
export type Capability =
  | 'platform.admin'        // /admin shell: modules, secrets, base pricing, user mgmt
  | 'catalog.import'        // operator-assisted catalog ingestion (operator only)
  | 'network.manage'        // child workspaces, catalog access, referral links (/network)
  | 'pricing.manage'        // markup + pricing rules for this node's offerings
  | 'finance.manage'        // finance module: settings, documents, payments
  | 'invoice.issue'         // create/transmit invoices, receipts, credit/delivery notes
  | 'crm.view'              // CRM parties (contacts/companies/suppliers)
  | 'warehouse.manage'      // inventory / stock
  | 'downstream.view'       // operator: see procurement quotes escalated from children
  | 'marketplace.browse'    // browse the upstream catalog to buy/quote
  | 'quotes.use'            // create + manage quotes
  | 'sales.portal'          // simplified Sales portal — reps build quotes/orders for customers
  | 'sales.team.view'       // sales manager: the WHOLE team's quote book, not just own rows.
                            // Backed server-side by is_workspace_sales_manager(workspace_id) in
                            // consolidated_quotes_select_public — this flag only unhides the UI.
  | 'projects.use'          // projects + client views
  | 'moodboards.use'        // moodboards / design surfaces
  | 'agent.use'             // KAI agent / chat
  | 'inbox.use'             // multi-tenant inbox (directional messaging)
  | 'hr.view'               // HR module: see employees + absences (sensitive PII)
  | 'hr.manage'             // HR module: create/edit employees, approve/reject absences
  | 'hr.self'               // HR self-service: an employee sees/acts on ONLY their own record
  | 'marketing.email'       // Email Marketing module: design templates + send bulk campaigns
  | 'realestate.view'           // Real Estate: see the module + listings (owner/admin + agent)
  | 'realestate.listings.manage' // create/edit/publish listings (owner/admin + realestate_agent)
  | 'realestate.leads.view';     // Property leads/viewings pipeline (owner/admin see all; agent own)

const ALL_BUSINESS: Capability[] = [
  'network.manage', 'pricing.manage', 'finance.manage', 'invoice.issue', 'crm.view',
  'warehouse.manage', 'marketplace.browse', 'quotes.use', 'projects.use', 'moodboards.use', 'agent.use',
  'inbox.use',
  // HR data (salary/absence) is owner/admin-only — in ALL_BUSINESS (dealer/architect/operator),
  // deliberately NOT in the `staff` list below, so plain members don't see HR. Module ENTITLEMENT
  // (workspace owns 'hr') is enforced separately by EntitlementGuard + assertEntitled.
  'hr.view', 'hr.manage',
  // Email Marketing — sending from the company's own verified domain is an owner/admin
  // function (BYOK config is finance-manager-gated). Module entitlement gates it per-workspace.
  'marketing.email',
  // Real Estate — owner/admin (broker) get the full surface: view + manage listings + all leads.
  // Module entitlement gates it per-workspace; the invited realestate_agent persona gets a scoped subset.
  'realestate.view', 'realestate.listings.manage', 'realestate.leads.view',
];

/**
 * Personas that work with the product catalog — browse it and run material search. Broader than
 * `marketplace.browse`: project clients / end-users don't buy on the marketplace but DO pick
 * materials for moodboards and quotes, so the Products tab + Spotlight product results are gated
 * on ANY of these, not marketplace membership. (Deliberately excludes `agent.use`, which an
 * HR-only employee holds — so a pure employee still gets no catalog access.)
 */
export const PRODUCT_BROWSE_ANY: Capability[] = [
  'marketplace.browse', 'moodboards.use', 'quotes.use', 'projects.use',
];

/** Persona → granted capabilities. The ONE place gating policy lives. */
export const PERSONA_CAPABILITIES: Record<Persona, Capability[]> = {
  operator: [
    'platform.admin', 'catalog.import', 'downstream.view', ...ALL_BUSINESS,
  ],
  dealer: [...ALL_BUSINESS],
  // Architects sell to end users (they have a downstream network) but never import catalog.
  architect: [...ALL_BUSINESS],
  // Team members run day-to-day but don't administer the node (no network/pricing).
  staff: ['finance.manage', 'invoice.issue', 'crm.view', 'warehouse.manage', 'marketplace.browse', 'quotes.use', 'projects.use', 'moodboards.use', 'agent.use', 'inbox.use'],
  // Invited accountant: ONLY the Finance surface (nav + route). Within finance, settings
  // stay gated on `isWorkspaceManager` and write-ops on `canOperateFinance` (usePermissions),
  // so they get read + record-payment + myDATA submit but no settings/pricing/CRM.
  accountant: ['finance.manage'],
  // Invited sales rep: Sales portal + CRM (manage their customers) + per-customer
  // account overview (balance owed, total sales/revenue, open orders, last payment, top items
  // to push, email account info — all read-only via membership-gated RPCs). NO finance module
  // settings/issuing, pricing, network, or warehouse. Reps see only their OWN quotes (RLS on
  // user_id); customer financials are workspace-scoped reads.
  sales: ['sales.portal', 'quotes.use', 'crm.view', 'marketplace.browse', 'agent.use', 'inbox.use'],
  // Sales manager: the rep surface plus `sales.team.view` — the whole team's quote book and
  // cost/margin on it. Still NOT a workspace manager: no finance settings, pricing, network or
  // warehouse. The team-wide read is enforced in RLS (is_workspace_sales_manager), so the extra
  // capability only reveals UI the server would already answer.
  sales_manager: ['sales.portal', 'sales.team.view', 'quotes.use', 'crm.view', 'marketplace.browse', 'agent.use', 'inbox.use'],
  // ── Functional team roles. Deliberately MINIMAL: each holds only its own module's capability
  //    plus agent.use, so a team member can never reach finance, pricing, the network or the team.
  //    Widening these is the "access levels" pass — start narrow, because a role that falls through
  //    to `staff` silently inherits finance/CRM/warehouse, which is the failure this model exists to
  //    prevent. Module ENTITLEMENT is enforced separately (EntitlementGuard + assertEntitled), so
  //    holding the capability still gets you nothing until the workspace owns the module.
  hr_staff: ['hr.view', 'agent.use'],
  hr_manager: ['hr.view', 'hr.manage', 'agent.use'],
  warehouse_staff: ['warehouse.manage', 'agent.use'],
  marketing_staff: ['marketing.email', 'agent.use'],
  // Invited employee: HR self-service ONLY — their own profile, onboarding, time off and
  // documents. Deliberately NO crm.view / sales.portal / finance / anything else, so an employee
  // can never see another person's (e.g. a sales rep's) details. Data is further self-scoped in
  // hr-api's self- endpoints (the caller's own linked hr_employees row).
  // `agent.use` is granted so the employee can reach My HR from chat via the self-scoped
  // `manage_my_hr` tool ("how much leave do I have left?", "request 3 days off"). It opens the
  // Agent Hub surface, NOT data: every toolkit is independently gated (module slug / adminOnly /
  // capability), so an employee still only gets Core + My HR, and manage_my_hr takes no
  // employee_id — hr-api resolves the subject from their own JWT. Note the cost side: agent use
  // draws on the workspace's pooled credits, so an employee can spend the owner's balance.
  employee: ['hr.self', 'agent.use'],
  // Invited property agent: the Real Estate surface only. Manages listings (shared team asset,
  // D1) and works their own leads/viewings (self-scoped via responsible_sales_user_ids / listing_agent_id
  // in real-estate-api, D7). Gets crm.view (leads ARE crm_contacts, D9) + agent.use (reach listings from
  // chat), but NO finance/pricing/network/warehouse. Broker (owner/admin) holds the full realestate.* set.
  realestate_agent: ['realestate.view', 'realestate.listings.manage', 'realestate.leads.view', 'crm.view', 'agent.use'],
  // Project clients / referral end-users: their own work only, no business back-office.
  end_user: ['quotes.use', 'projects.use', 'moodboards.use', 'agent.use', 'inbox.use'],
};

export interface PersonaInputs {
  isPlatformOperator: boolean;
  rank: 'operator' | 'dealer' | 'architect' | null;
  workspaceRole: string | null; // owner | admin | member | client
  /** Global account role (roles.name) — the access TIER set under Users. Primary driver. */
  accountRole?: string | null;
}

/**
 * Workspace TEAM roles → their scoped persona. EXHAUSTIVE over every scoped role in
 * `WORKSPACE_MEMBER_ROLES`; checked ahead of the account tier in `resolvePersona`.
 *
 * Five of these (`client`, `accountant`, `sales`, `employee`, `realestate_agent`) used to sit
 * BELOW the account-tier switch as individual `if`s, on the theory that moving them would change
 * who wins for an existing user. It changed who won in the wrong direction: a user carrying a
 * global tier of `supplier`/`dealer`/`factory`/`architect` and invited into a workspace as a
 * CLIENT resolved to `dealer` — finance.manage, crm.view, warehouse.manage, network.manage and
 * pricing.manage, handed to the customer (#358 PQ-1). The `if`s each carried a comment about
 * preceding the `staff` fallback; the hazard was the switch ABOVE them.
 *
 * The only roles NOT here are `owner`/`admin` (whose persona depends on the workspace's rank) and
 * `member` (the plain-staff fallback). Guarded by tests/unit/workspaceRoles.test.ts, which fails
 * when a role in the catalog has no entry here.
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
  client: 'end_user',
};

/**
 * Resolve the single persona.
 *
 * THE ORDER IS THE POINT (#358 PQ-1). The WORKSPACE role decides who you are here; the global
 * account tier only answers when there is no workspace role to read. It used to be the other way
 * round for five roles — `client`, `accountant`, `sales`, `employee`, `realestate_agent` sat as
 * individual `if`s BELOW the account-tier switch — so a user carrying a tier of
 * `supplier`/`dealer`/`factory`/`architect` and invited into a workspace as a CLIENT resolved to
 * `dealer` and was shown finance, CRM, warehouse, network and pricing. Each of those `if`s carried
 * a comment about preceding the `staff` fallback; the hazard was the switch above them.
 *
 * `operator` is granted ONLY by root-workspace ownership, never by an account role, so a tenant
 * can never become a platform operator.
 */
export function resolvePersona({ isPlatformOperator, rank, workspaceRole, accountRole }: PersonaInputs): Persona {
  if (isPlatformOperator) return 'operator';

  const role = workspaceRole ?? '';

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
  //    the `user` baseline. "Sales", "finance", "runs HR", "warehouse team" are per-workspace facts
  //    and live ONLY in workspace_members.role. `sales` and `finance` were removed from this switch
  //    on 2026-07-31 along with their rows.
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
