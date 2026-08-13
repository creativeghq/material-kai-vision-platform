// Shared option lists for the CRM list filters + bulk actions.
// professional_type is an enum on user_profiles; on crm_contacts/crm_companies the
// equivalent lives in the free-text `profession` column — we offer the same vocab for both
// so the data stays consistent.

export interface Option {
  value: string;
  label: string;
}

export const PROFESSIONAL_TYPE_OPTIONS: Option[] = [
  { value: 'architect_designer', label: 'Architect / Designer' },
  { value: 'supplier', label: 'Supplier' },
  { value: 'sourcing_agent', label: 'Sourcing Agent' },
  { value: 'consultant', label: 'Consultant' },
  { value: 'other', label: 'Other' },
];

/**
 * Funnel position on crm_contacts (#311). Mirrors the CHECK on `crm_contacts.lifecycle_stage`
 * EXACTLY — the two are a pair, and adding a value here without the migration fails at runtime
 * with a CHECK violation while typechecking clean. Guarded by
 * tests/unit/dealPipelineDerivation.test.ts.
 *
 * Distinct from `lead_status`, which is a tenant-editable CRM Category ("Contacted", "Nurturing").
 * Lifecycle stage is the platform-fixed funnel; lead status is how this tenant talks about it.
 */
export const LIFECYCLE_STAGE_OPTIONS: Option[] = [
  { value: 'subscriber', label: 'Subscriber' },
  { value: 'lead', label: 'Lead' },
  { value: 'mql', label: 'Marketing qualified' },
  { value: 'sql', label: 'Sales qualified' },
  { value: 'opportunity', label: 'Opportunity' },
  { value: 'customer', label: 'Customer' },
  { value: 'evangelist', label: 'Evangelist' },
  { value: 'other', label: 'Other' },
];

export const STATUS_OPTIONS: Option[] = [
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
];

export const CLIENT_SUPPLIER_OPTIONS: Option[] = [
  { value: 'client', label: 'Clients' },
  { value: 'supplier', label: 'Suppliers' },
  { value: 'neither', label: 'Neither' },
];

/** Sentinel select value meaning "no filter" (Radix Select can't use an empty-string item). */
export const ANY = '__any__';

export function professionalTypeLabel(value?: string | null): string {
  if (!value) return '';
  return PROFESSIONAL_TYPE_OPTIONS.find((o) => o.value === value)?.label ?? value;
}

/**
 * Friendly display labels for the GLOBAL ACCOUNT TIER (the `roles` table `name`) — what kind of
 * account this is platform-wide. Team roles are NOT here: they are per-workspace and labelled by
 * `WORKSPACE_ROLE_META` in `@/auth/workspaceRoles`, assigned from Profile → Team.
 */
export const ROLE_LABELS: Record<string, string> = {
  user: 'User',
  supplier: 'Supplier',
  architect: 'Architect',
  admin: 'Admin',
  // legacy aliases (rows removed from roles; keep labels resolvable for old data)
  sales: 'Sales',      // not a tier — a workspace role
  finance: 'Finance',  // not a tier — the `accountant` workspace role
  dealer: 'Supplier',
  factory: 'Supplier',
  super_admin: 'Admin',
};

export function roleLabel(name?: string | null): string {
  if (!name) return '';
  return ROLE_LABELS[name] ?? (name.charAt(0).toUpperCase() + name.slice(1));
}
