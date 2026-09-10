/** The project page's sections — their ids, their titles, and the one way to link to them. */
export const PROJECT_TABS = [
  'overview', 'rooms', 'products', 'moodboards', 'plan', 'purchases', 'quotes', 'billing',
  'finance', 'sheets', 'client-view', 'contracts', 'handover', 'tasks', 'site', 'documents',
  'requests', 'assessment', 'timeline',
] as const;
export type ProjectTab = typeof PROJECT_TABS[number];

/** The section's title, exactly as its tab reads. */
export const PROJECT_SECTION_LABELS: Record<ProjectTab, string> = {
  overview: 'Overview',
  rooms: 'Rooms',
  products: 'Products',
  moodboards: 'Moodboards',
  plan: 'Plan',
  purchases: 'Purchases',
  quotes: 'Quotes',
  billing: 'Billing',
  finance: 'Finance',
  sheets: 'Sheets',
  'client-view': 'Client View',
  contracts: 'Contracts',
  handover: 'Handover',
  tasks: 'Tasks',
  site: 'Site',
  documents: 'Documents',
  requests: 'Requests',
  assessment: 'Assessment',
  timeline: 'Timeline',
};

/**
 * The route to a section. `overview` is the page itself and carries no `?tab=`; anything in
 * `params` (`{ request: id }`) follows the tab, which is the shape every notification link uses.
 */
export function projectSectionPath(
  projectId: string,
  tab: ProjectTab,
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
