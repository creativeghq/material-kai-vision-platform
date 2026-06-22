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
