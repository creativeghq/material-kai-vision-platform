/**
 * What sort of job a project is, and which parts of the project page it offers by default.
 * `projects.kind` CHECK holds the same four values. A part is a section (a rail entry) or a
 * feature that lives inside one (takeoff in Estimate, tenders in Purchases, …).
 */
import type { ProjectTab } from './projectSections';

import { PROJECT_KINDS, type ProjectKind } from './projectKindVocabulary';

export {
  PROJECT_KINDS, PROJECT_KIND_LABELS, PROJECT_KIND_DESCRIPTIONS, type ProjectKind,
} from './projectKindVocabulary';

export const PROJECT_FEATURES = ['takeoff', 'tenders', 'applications', 'cvr'] as const;
export type ProjectFeature = typeof PROJECT_FEATURES[number];

export const PROJECT_FEATURE_LABELS: Record<ProjectFeature, string> = {
  takeoff: 'Drawing Takeoff',
  tenders: 'Tender Packages',
  applications: 'Valuations & Retention',
  cvr: 'Cost-Value Reconciliation',
};

export type ProjectPart = ProjectTab | ProjectFeature;

const ALWAYS: readonly ProjectTab[] = ['overview', 'timeline'];

const DESIGN: readonly ProjectPart[] = [
  ...ALWAYS, 'assessment', 'rooms', 'moodboards', 'sheets', 'products', 'quotes', 'contracts',
  'billing', 'purchases', 'finance', 'tasks', 'documents', 'requests',
];
const FIT_OUT: readonly ProjectPart[] = [...DESIGN, 'plan', 'changes', 'site', 'handover'];

export const KIND_DEFAULT_PARTS: Record<ProjectKind, readonly ProjectPart[]> = {
  general: [...ALWAYS, 'tasks', 'documents', 'purchases', 'finance', 'requests'],
  design_supply: DESIGN,
  fit_out: FIT_OUT,
  construction: [...FIT_OUT, 'takeoff', 'tenders', 'applications', 'cvr'],
};

export const isProjectKind = (v: unknown): v is ProjectKind =>
  typeof v === 'string' && (PROJECT_KINDS as readonly string[]).includes(v);

/** The parts this project offers: its own list when it has one, else its kind's defaults. */
export function projectParts(p: { kind?: string | null; sections?: string[] | null }): Set<ProjectPart> {
  const base = p.sections ?? KIND_DEFAULT_PARTS[isProjectKind(p.kind) ? p.kind : 'fit_out'];
  return new Set<ProjectPart>([...ALWAYS, ...(base as ProjectPart[])]);
}
