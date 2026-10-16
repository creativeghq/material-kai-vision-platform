// GENERATED MIRROR of src/auth/roleCapabilities.ts — do not edit here.
// Regenerate: npm run vocab:mirror (part of gen:all). Freshness is enforced by
// tests/unit/vocabularyMirrors.test.ts, which fails the build on any drift.

/**
 * What each WORKSPACE role may do in that workspace — the one table the UI, the edge functions
 * (mirrored by `npm run vocab:mirror`) and SQL (`workspace_role_capability_matrix()`) all read.
 * Import-free so the mirror can be a byte copy.
 */

export const CAPABILITIES = [
  'platform.admin',
  'catalog.import',
  'downstream.view',
  'workspace.manage',
  'workspace.read',
  'network.manage',
  'pricing.manage',
  'finance.manage',
  'finance.operate',
  'invoice.issue',
  'crm.view',
  'warehouse.manage',
  'marketplace.browse',
  'quotes.use',
  'sales.portal',
  'sales.team.view',
  'projects.use',
  'moodboards.use',
  'agent.use',
  'inbox.use',
  'hr.view',
  'hr.manage',
  'hr.self',
  'marketing.email',
  'marketing.seo',
  'realestate.view',
  'realestate.listings.manage',
  'realestate.leads.view',
] as const;

export type Capability = typeof CAPABILITIES[number];

/**
 * Running a business node: everything except the operator-only three. `workspace.read` is reading
 * the business's own data at all — every role but `client` and `employee`, who are outsiders to it.
 * `finance.operate` is writing finance records: managers and the accountant, never a plain member.
 */
export const BUSINESS_CAPABILITIES: readonly Capability[] = [
  'workspace.manage', 'workspace.read', 'network.manage', 'pricing.manage', 'finance.manage',
  'finance.operate', 'invoice.issue',
  'crm.view', 'warehouse.manage', 'marketplace.browse', 'quotes.use', 'projects.use',
  'moodboards.use', 'agent.use', 'inbox.use', 'hr.view', 'hr.manage', 'marketing.email', 'marketing.seo',
  'realestate.view', 'realestate.listings.manage', 'realestate.leads.view',
];

/** The capabilities only the platform operator holds, on top of the business set. */
export const OPERATOR_ONLY_CAPABILITIES: readonly Capability[] = [
  'platform.admin', 'catalog.import', 'downstream.view',
];

const SALES_CAPABILITIES: readonly Capability[] = [
  'workspace.read', 'sales.portal', 'quotes.use', 'crm.view', 'marketplace.browse', 'agent.use', 'inbox.use',
];

/**
 * Workspace role → capabilities. Team roles are deliberately minimal: a role that inherits more
 * than its own module is how finance leaks to a warehouse login.
 */
export const WORKSPACE_ROLE_CAPABILITIES: Readonly<Record<string, readonly Capability[]>> = {
  owner: BUSINESS_CAPABILITIES,
  admin: BUSINESS_CAPABILITIES,
  member: [
    'workspace.read', 'finance.manage', 'invoice.issue', 'crm.view', 'warehouse.manage', 'marketplace.browse',
    'quotes.use', 'projects.use', 'moodboards.use', 'agent.use', 'inbox.use',
  ],
  accountant: ['workspace.read', 'finance.manage', 'finance.operate', 'invoice.issue'],
  sales: SALES_CAPABILITIES,
  sales_manager: [...SALES_CAPABILITIES, 'sales.team.view'],
  hr: ['workspace.read', 'hr.view', 'agent.use'],
  hr_manager: ['workspace.read', 'hr.view', 'hr.manage', 'agent.use'],
  warehouse: ['workspace.read', 'warehouse.manage', 'agent.use'],
  marketing: ['workspace.read', 'marketing.email', 'marketing.seo', 'agent.use'],
  employee: ['hr.self', 'agent.use'],
  realestate_agent: [
    'workspace.read', 'realestate.view', 'realestate.listings.manage', 'realestate.leads.view', 'crm.view', 'agent.use',
  ],
  client: [],
};

/** True when `role` holds `capability`, or any of them when given a list. Unknown roles hold nothing. */
export function roleHasCapability(role: string | null | undefined, capability: Capability | readonly Capability[]): boolean {
  const held = (role && WORKSPACE_ROLE_CAPABILITIES[role]) || [];
  const wanted = typeof capability === 'string' ? [capability] : capability;
  return wanted.some((c) => held.includes(c));
}
