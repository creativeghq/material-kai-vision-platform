// GENERATED MIRROR of src/config/brandProfileFields.ts — do not edit here.
// Regenerate: npm run vocab:mirror (part of gen:all). Freshness is enforced by
// tests/unit/vocabularyMirrors.test.ts, which fails the build on any drift.

export const BRAND_LIST_FIELDS = [
  'tone_attributes',
  'personality_traits',
  'terminology_preferences',
  'avoid_list',
  'messaging_pillars',
  'active_hypotheses',
] as const;

export const BRAND_TEXT_FIELDS = ['writing_style', 'icp', 'positioning'] as const;

export const BRAND_PROPOSABLE_FIELDS = [
  'tone_attributes',
  'personality_traits',
  'terminology_preferences',
  'avoid_list',
  'messaging_pillars',
  'active_hypotheses',
  'writing_style',
  'icp',
  'positioning',
] as const;

export const BRAND_PROPOSAL_OPS = ['add', 'remove', 'set'] as const;

export const BRAND_PROPOSAL_SOURCES = ['agent', 'mention', 'unmet_request', 'editor_diff', 'member'] as const;

export const BRAND_PROPOSAL_STATUSES = ['proposed', 'approved', 'dismissed'] as const;

export type BrandListField = typeof BRAND_LIST_FIELDS[number];
export type BrandTextField = typeof BRAND_TEXT_FIELDS[number];
export type BrandProposableField = typeof BRAND_PROPOSABLE_FIELDS[number];
export type BrandProposalOp = typeof BRAND_PROPOSAL_OPS[number];
export type BrandProposalSource = typeof BRAND_PROPOSAL_SOURCES[number];

export const BRAND_FIELD_LABELS: Record<BrandProposableField, string> = {
  tone_attributes: 'Tone',
  personality_traits: 'Personality',
  terminology_preferences: 'Preferred terminology',
  avoid_list: 'Words to avoid',
  messaging_pillars: 'Messaging pillars',
  active_hypotheses: 'Active hypotheses',
  writing_style: 'Writing style',
  icp: 'Ideal customer',
  positioning: 'Positioning',
};

export const BRAND_SOURCE_LABELS: Record<BrandProposalSource, string> = {
  agent: 'Agent',
  mention: 'A mention',
  unmet_request: 'An unmet request',
  editor_diff: 'An editor\'s changes',
  member: 'A team member',
};

export function isBrandListField(field: string): field is BrandListField {
  return (BRAND_LIST_FIELDS as readonly string[]).includes(field);
}

export function brandOpAllowed(field: string, op: string): boolean {
  if (!(BRAND_PROPOSABLE_FIELDS as readonly string[]).includes(field)) return false;
  return isBrandListField(field) ? op === 'add' || op === 'remove' : op === 'set';
}
