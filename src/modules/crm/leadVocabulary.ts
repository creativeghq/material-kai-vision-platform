export const LEAD_STATUSES = ['new', 'contacted', 'quoted', 'lost', 'converted'] as const;
export type LeadStatus = typeof LEAD_STATUSES[number];

export const LEAD_SOURCES = ['email', 'phone', 'website', 'whatsapp', 'walk_in', 'referral', 'social', 'other'] as const;
export type LeadSource = typeof LEAD_SOURCES[number];

export const LEAD_STATUS_LABEL: Record<LeadStatus, string> = {
  new: 'New', contacted: 'Contacted', quoted: 'Quoted', lost: 'Lost', converted: 'Converted',
};

export const LEAD_SOURCE_LABEL: Record<LeadSource, string> = {
  email: 'Email', phone: 'Phone', website: 'Website', whatsapp: 'WhatsApp', walk_in: 'Walk-in',
  referral: 'Referral', social: 'Social', other: 'Other',
};

export const LEAD_STATUS_VARIANT: Record<LeadStatus, 'info' | 'warning' | 'success' | 'neutral'> = {
  new: 'info', contacted: 'warning', quoted: 'warning', converted: 'success', lost: 'neutral',
};

export const LEAD_CAPTURE_CHANNELS = ['email', 'whatsapp'] as const;
export type LeadCaptureChannel = typeof LEAD_CAPTURE_CHANNELS[number];
export const LEAD_CAPTURE_FIELDS = ['subject', 'body'] as const;
export type LeadCaptureField = typeof LEAD_CAPTURE_FIELDS[number];
export const LEAD_CAPTURE_MODES = ['starts_with', 'contains'] as const;
export type LeadCaptureMode = typeof LEAD_CAPTURE_MODES[number];

export const LEAD_CAPTURE_CHANNEL_LABEL: Record<LeadCaptureChannel, string> = { email: 'Email (Gmail)', whatsapp: 'WhatsApp' };
export const LEAD_CAPTURE_FIELD_LABEL: Record<LeadCaptureField, string> = { subject: 'Subject', body: 'Message Text' };
export const LEAD_CAPTURE_MODE_LABEL: Record<LeadCaptureMode, string> = { starts_with: 'Starts With', contains: 'Contains' };
