export const LEAD_STATUSES = ['new', 'contacted', 'quoted', 'lost', 'converted'] as const;
export type LeadStatus = typeof LEAD_STATUSES[number];

export const LEAD_SOURCES = ['email', 'phone', 'website', 'walk_in', 'referral', 'social', 'other'] as const;
export type LeadSource = typeof LEAD_SOURCES[number];

export const LEAD_STATUS_LABEL: Record<LeadStatus, string> = {
  new: 'New', contacted: 'Contacted', quoted: 'Quoted', lost: 'Lost', converted: 'Converted',
};

export const LEAD_SOURCE_LABEL: Record<LeadSource, string> = {
  email: 'Email', phone: 'Phone', website: 'Website', walk_in: 'Walk-in',
  referral: 'Referral', social: 'Social', other: 'Other',
};

export const LEAD_STATUS_VARIANT: Record<LeadStatus, 'info' | 'warning' | 'success' | 'neutral'> = {
  new: 'info', contacted: 'warning', quoted: 'warning', converted: 'success', lost: 'neutral',
};
