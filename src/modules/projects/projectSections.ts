/** The project page's sections — their ids, their titles, and the one way to link to them. */
export const PROJECT_TABS = [
  'overview', 'timeline', 'assessment', 'rooms', 'moodboards', 'sheets', 'products', 'plan',
  'quotes', 'changes', 'contracts', 'billing', 'purchases', 'finance', 'tasks', 'site', 'documents',
  'handover', 'requests',
] as const;
export type ProjectTab = typeof PROJECT_TABS[number];

/**
 * Ids that were sections and are now a view inside another. Stored notification links and
 * agent tools still carry them, so they keep resolving: `?tab=takeoff` opens Estimate on drawings.
 */
export const PROJECT_TAB_ALIASES = {
  takeoff: 'plan',
  'client-view': 'sheets',
} as const satisfies Record<string, ProjectTab>;
export type ProjectTabAlias = keyof typeof PROJECT_TAB_ALIASES;
export type ProjectTabOrAlias = ProjectTab | ProjectTabAlias;

export function resolveProjectTab(raw: string | null): { tab: ProjectTab | null; alias: ProjectTabAlias | null } {
  if (!raw) return { tab: null, alias: null };
  if (raw in PROJECT_TAB_ALIASES) {
    const alias = raw as ProjectTabAlias;
    return { tab: PROJECT_TAB_ALIASES[alias], alias };
  }
  return { tab: (PROJECT_TABS as readonly string[]).includes(raw) ? (raw as ProjectTab) : null, alias: null };
}

/** The section's title, exactly as its tab reads. */
export const PROJECT_SECTION_LABELS: Record<ProjectTab, string> = {
  overview: 'Overview',
  timeline: 'Timeline',
  assessment: 'Assessment',
  rooms: 'Rooms',
  moodboards: 'Moodboards',
  sheets: 'Presentations',
  products: 'Selections',
  plan: 'Estimate',
  quotes: 'Quotes',
  changes: 'Changes',
  contracts: 'Contracts',
  billing: 'Invoicing',
  purchases: 'Purchases',
  finance: 'Costs',
  tasks: 'Tasks',
  site: 'Site',
  documents: 'Documents',
  handover: 'Equipment & Warranties',
  requests: 'Requests',
};

/**
 * The route to a section. `overview` is the page itself and carries no `?tab=`; anything in
 * `params` (`{ request: id }`) follows the tab, which is the shape every notification link uses.
 */
export function projectSectionPath(
  projectId: string,
  tab: ProjectTabOrAlias,
  params?: Record<string, string>,
): string {
  const q = new URLSearchParams();
  if (tab !== 'overview') q.set('tab', tab);
  for (const [k, v] of Object.entries(params ?? {})) q.set(k, v);
  const s = q.toString();
  return `/projects/${projectId}${s ? `?${s}` : ''}`;
}

/** The label of a button that opens a section — "Go to Quotes", never a hand-typed "Go to quotes". */
export function goToSectionLabel(tab: ProjectTab): string {
  return `Go to ${PROJECT_SECTION_LABELS[tab]}`;
}
