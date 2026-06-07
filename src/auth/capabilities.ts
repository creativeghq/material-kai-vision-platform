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
  | 'end_user';  // project client / referral-joined member — restricted surface

/** Every gateable capability on the platform. Keep verbs coarse + surface-oriented. */
export type Capability =
  | 'platform.admin'        // /admin shell: modules, secrets, base pricing, user mgmt
  | 'catalog.import'        // operator-assisted catalog ingestion (operator only)
  | 'network.manage'        // child workspaces, commission %, referral links (/network)
  | 'pricing.manage'        // markup + pricing rules for this node's offerings
  | 'finance.manage'        // finance module: settings, documents, payments
  | 'invoice.issue'         // create/transmit invoices, receipts, credit/delivery notes
  | 'crm.view'              // CRM parties (contacts/companies/suppliers)
  | 'warehouse.manage'      // inventory / stock
  | 'downstream.view'       // operator: see procurement quotes escalated from children
  | 'marketplace.browse'    // browse the upstream catalog to buy/quote
  | 'quotes.use'            // create + manage quotes
  | 'sales.portal'          // simplified Sales portal — reps build quotes/orders for customers (#201)
  | 'projects.use'          // projects + client views
  | 'moodboards.use'        // moodboards / design surfaces
  | 'agent.use';            // KAI agent / chat

const ALL_BUSINESS: Capability[] = [
  'network.manage', 'pricing.manage', 'finance.manage', 'invoice.issue', 'crm.view',
  'warehouse.manage', 'marketplace.browse', 'quotes.use', 'projects.use', 'moodboards.use', 'agent.use',
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
  staff: ['finance.manage', 'invoice.issue', 'crm.view', 'warehouse.manage', 'marketplace.browse', 'quotes.use', 'projects.use', 'moodboards.use', 'agent.use'],
  // Invited accountant: ONLY the Finance surface (nav + route). Within finance, settings
  // stay gated on `canManageFinance` and write-ops on `canOperateFinance` (useCapabilities),
  // so they get read + record-payment + myDATA submit but no settings/pricing/CRM (#202).
  accountant: ['finance.manage'],
  // Invited sales rep (#201): Sales portal only — build quotes/orders for customers from the
  // catalog. NO finance/CRM-module/pricing/network/warehouse. Reps see only their OWN quotes
  // (enforced by RLS on created_by); the customer picker is embedded in the Sales surface, so
  // they get marketplace.browse for catalog selection but not crm.view (the full CRM module).
  sales: ['sales.portal', 'quotes.use', 'marketplace.browse', 'agent.use'],
  // Project clients / referral end-users: their own work only, no business back-office.
  end_user: ['quotes.use', 'projects.use', 'moodboards.use', 'agent.use'],
};

export interface PersonaInputs {
  isPlatformOperator: boolean;
  rank: 'operator' | 'dealer' | 'architect' | null;
  workspaceRole: string | null; // owner | admin | member | client
}

/** Resolve the single persona from the (already-reconciled) workspace signals. */
export function resolvePersona({ isPlatformOperator, rank, workspaceRole }: PersonaInputs): Persona {
  if (isPlatformOperator) return 'operator';
  const role = workspaceRole ?? '';
  if (role === 'client') return 'end_user';
  if (role === 'accountant') return 'accountant';
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
