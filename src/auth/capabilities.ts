/**
 * #195 — capability layer (single source of truth for "what can this user do here?").
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
  | 'accountant' // invited external accountant — Finance surface only (#202)
  | 'sales'      // invited sales rep — Sales portal only: build quotes/orders for customers (#201)
  | 'sales_manager' // sales lead — same portal as a rep, but across the whole team's book
  | 'employee'   // invited staff member — HR self-service ONLY (#252): their own record, nothing else
  | 'realestate_agent' // invited property agent — Real Estate portal only (#249): manage listings +
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
  | 'sales.portal'          // simplified Sales portal — reps build quotes/orders for customers (#201)
  | 'sales.team.view'       // sales manager: the WHOLE team's quote book, not just own rows.
                            // Backed server-side by is_workspace_sales_manager(workspace_id) in
                            // consolidated_quotes_select_public — this flag only unhides the UI.
  | 'projects.use'          // projects + client views
  | 'moodboards.use'        // moodboards / design surfaces
  | 'agent.use'             // KAI agent / chat
  | 'inbox.use'             // #209 multi-tenant inbox (directional messaging)
  | 'hr.view'               // #252 HR module: see employees + absences (sensitive PII)
  | 'hr.manage'             // #252 HR module: create/edit employees, approve/reject absences
  | 'hr.self'               // #252 HR self-service: an employee sees/acts on ONLY their own record
  | 'marketing.email'       // #255 Email Marketing module: design templates + send bulk campaigns
  | 'realestate.view'           // #249 Real Estate: see the module + listings (owner/admin + agent)
  | 'realestate.listings.manage' // #249 create/edit/publish listings (owner/admin + realestate_agent)
  | 'realestate.leads.view';     // #249 property leads/viewings pipeline (owner/admin see all; agent own)

const ALL_BUSINESS: Capability[] = [
  'network.manage', 'pricing.manage', 'finance.manage', 'invoice.issue', 'crm.view',
  'warehouse.manage', 'marketplace.browse', 'quotes.use', 'projects.use', 'moodboards.use', 'agent.use',
  'inbox.use',
  // HR data (salary/absence) is owner/admin-only — in ALL_BUSINESS (dealer/architect/operator),
  // deliberately NOT in the `staff` list below, so plain members don't see HR. Module ENTITLEMENT
  // (workspace owns 'hr') is enforced separately by EntitlementGuard + assertEntitled.
  'hr.view', 'hr.manage',
  // #255 Email Marketing — sending from the company's own verified domain is an owner/admin
  // function (BYOK config is finance-manager-gated). Module entitlement gates it per-workspace.
  'marketing.email',
  // #249 Real Estate — owner/admin (broker) get the full surface: view + manage listings + all leads.
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
  // so they get read + record-payment + myDATA submit but no settings/pricing/CRM (#202).
  accountant: ['finance.manage'],
  // Invited sales rep (#201): Sales portal + CRM (manage their customers) + per-customer
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
  // Invited employee (#252): HR self-service ONLY — their own profile, onboarding, time off and
  // documents. Deliberately NO crm.view / sales.portal / finance / anything else, so an employee
  // can never see another person's (e.g. a sales rep's) details. Data is further self-scoped in
  // hr-api's self- endpoints (the caller's own linked hr_employees row).
  //
  // `agent.use` is granted so the employee can reach My HR from chat via the self-scoped
  // `manage_my_hr` tool ("how much leave do I have left?", "request 3 days off"). It opens the
  // Agent Hub surface, NOT data: every toolkit is independently gated (module slug / adminOnly /
  // capability), so an employee still only gets Core + My HR, and manage_my_hr takes no
  // employee_id — hr-api resolves the subject from their own JWT. Note the cost side: agent use
  // draws on the workspace's pooled credits, so an employee can spend the owner's balance.
  employee: ['hr.self', 'agent.use'],
  // Invited property agent (#249): the Real Estate surface only. Manages listings (shared team asset,
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
 * Resolve the single persona. The account role (set under Users) is the primary tier;
 * `operator` is granted ONLY by root-workspace ownership (never by account role) so a
 * tenant can never become a platform operator. Account role falls back to the legacy
 * workspace-derived persona for plain `user`/unset (no regression for existing users).
 */
export function resolvePersona({ isPlatformOperator, rank, workspaceRole, accountRole }: PersonaInputs): Persona {
  if (isPlatformOperator) return 'operator';

  // Sales manager is a workspace TEAM role with no account-role equivalent, and it must win over
  // the account-role switch below — otherwise a user whose account tier is `sales` would be
  // downgraded to a plain rep despite being invited as the manager. Safe to place first: the value
  // is new, so no existing membership carries it.
  if (workspaceRole === 'sales_manager') return 'sales_manager';

  // Account role drives the tenant tiers. 'admin'/'super_admin' here do NOT grant
  // operator (multi-tenancy) — only root-workspace ownership above does.
  switch (accountRole) {
    case 'supplier':
    case 'dealer':   // legacy alias
    case 'factory':  // legacy alias → supplier tier
      return 'dealer';
    case 'architect': return 'architect';
    case 'sales_manager': return 'sales_manager';
    case 'sales': return 'sales';
    case 'finance': return 'accountant';
  }

  const role = workspaceRole ?? '';
  if (role === 'client') return 'end_user';
  if (role === 'accountant') return 'accountant';
  // Invited employee (#252) — HR self-service only. Must precede the member/staff fallback so an
  // 'employee' role never inherits staff finance/CRM/warehouse capabilities.
  if (role === 'employee') return 'employee';
  // Invited property agent (#249) — Real Estate portal only. Before the member/staff fallback so a
  // 'realestate_agent' role never inherits staff finance/warehouse capabilities.
  if (role === 'realestate_agent') return 'realestate_agent';
  // Invited sales rep (#201) — Sales portal only. Must come BEFORE the member/staff fallback,
  // otherwise a 'sales' role falls through to 'staff' and wrongly inherits finance/CRM/invoice.
  if (role === 'sales') return 'sales';
  if (role === 'owner' || role === 'admin') {
    if (rank === 'dealer') return 'dealer';
    if (rank === 'architect') return 'architect';
    // Root rank but not the platform operator, or unknown — treat as a dealer-level business.
    return 'dealer';
  }
  // member / anything else = team staff of a business node.
  return 'staff';
}

export function personaCan(persona: Persona, capability: Capability): boolean {
  return PERSONA_CAPABILITIES[persona].includes(capability);
}
