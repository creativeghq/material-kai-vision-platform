/** `projects.kind` — what sort of job a project is. Import-free: mirrored to Deno by `vocab:mirror`. */
export const PROJECT_KINDS = ['general', 'design_supply', 'fit_out', 'construction'] as const;
export type ProjectKind = typeof PROJECT_KINDS[number];

export const PROJECT_KIND_LABELS: Record<ProjectKind, string> = {
  general: 'General',
  design_supply: 'Design & Supply',
  fit_out: 'Renovation & Fit-Out',
  construction: 'Construction Contract',
};

export const PROJECT_KIND_DESCRIPTIONS: Record<ProjectKind, string> = {
  general: 'Tasks, documents and costs — a trip, a stock move, an internal job.',
  design_supply: 'Rooms, moodboards and selections, quoted and supplied to a client.',
  fit_out: 'Design through site work: estimate, purchases, snags and handover.',
  construction: 'Adds drawing takeoff, tender packages, valuations with retention and CVR.',
};
