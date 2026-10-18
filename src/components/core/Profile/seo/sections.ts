/** The per-website SEO rail — ONE declaration, read by the dashboard that renders it. */
import {
  FileBarChart, FileText, Gauge, KeyRound, LayoutDashboard, LineChart, Radar, Sparkles, Spline, Swords,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export type SeoSectionId =
  | 'overview' | 'gsc' | 'keywords' | 'analytics'
  | 'ai' | 'authority' | 'competitors'
  | 'articles' | 'health' | 'reports';

export type SeoGroupId = 'search' | 'audience' | 'visibility' | 'content' | 'technical' | 'activity';

export interface SeoView {
  value: string;
  label: string;
}

export interface SeoSection {
  /** The `?section=` key — the external contract. Labels are free to change; this is not. */
  value: SeoSectionId;
  label: string;
  icon: LucideIcon;
  group?: SeoGroupId;
  /** The pane opened when `?section=` is absent. Exactly one section carries it. */
  landing?: boolean;
  /** `&view=` tabs inside the section, rendered as a strip, never a second rail. The first is the default. */
  views?: readonly SeoView[];
}

export const SEO_SECTION_GROUPS = {
  search: 'Search',
  audience: 'Audience',
  visibility: 'Visibility',
  content: 'Content',
  technical: 'Technical',
  activity: 'Activity',
} as const;

export const SEO_SECTIONS: readonly SeoSection[] = [
  { value: 'overview', label: 'Overview', icon: LayoutDashboard, landing: true },

  {
    value: 'gsc', label: 'Search performance', icon: LineChart, group: 'search',
    views: [{ value: 'queries', label: 'Queries' }, { value: 'cannibalisation', label: 'Cannibalisation' }],
  },
  {
    value: 'keywords', label: 'Keywords', icon: KeyRound, group: 'search',
    views: [
      { value: 'tracked', label: 'Tracked' },
      { value: 'serp', label: 'SERP features' },
      { value: 'research', label: 'Research' },
    ],
  },

  {
    value: 'analytics', label: 'Audience', icon: Spline, group: 'audience',
    views: [
      { value: 'overview', label: 'Overview' },
      { value: 'pages', label: 'Pages' },
      { value: 'geo', label: 'Geography' },
      { value: 'tech', label: 'Devices & events' },
      { value: 'commerce', label: 'Products & ads' },
      { value: 'funnel', label: 'Funnel' },
      { value: 'retention', label: 'Retention' },
    ],
  },

  { value: 'ai', label: 'AI Citations', icon: Sparkles, group: 'visibility' },
  {
    value: 'authority', label: 'Authority', icon: Radar, group: 'visibility',
    views: [{ value: 'summary', label: 'Backlinks & authority' }, { value: 'history', label: 'Audit history' }],
  },
  {
    value: 'competitors', label: 'Competitors', icon: Swords, group: 'visibility',
    views: [{ value: 'domains', label: 'Competitors' }, { value: 'gap', label: 'Keyword gap' }],
  },

  {
    value: 'articles', label: 'Articles', icon: FileText, group: 'content',
    views: [{ value: 'articles', label: 'Articles' }, { value: 'brand', label: 'Brand profile' }],
  },

  {
    value: 'health', label: 'Site health', icon: Gauge, group: 'technical',
    views: [
      { value: 'crawl', label: 'Site crawl' },
      { value: 'pages', label: 'Pages' },
      { value: 'homepage', label: 'Page health' },
      { value: 'llms', label: 'llms.txt' },
    ],
  },

  {
    value: 'reports', label: 'Reports', icon: FileBarChart, group: 'activity',
    views: [{ value: 'reports', label: 'Reports' }, { value: 'runs', label: 'Toolkit runs' }, { value: 'schedules', label: 'Schedules' }],
  },
];

export const DEFAULT_SEO_SECTION: SeoSectionId = 'overview';
export const SEO_SECTION_IDS: readonly SeoSectionId[] = SEO_SECTIONS.map((s) => s.value);

/** Every `?section=` id that existed before the 10-section rail (#475), and where it lives now. Old links must keep landing. */
export const LEGACY_SECTION_ALIASES: Readonly<Record<string, { section: SeoSectionId; view: string }>> = {
  cannibalisation: { section: 'gsc', view: 'cannibalisation' },
  ranks: { section: 'keywords', view: 'tracked' },
  'serp-features': { section: 'keywords', view: 'serp' },
  research: { section: 'keywords', view: 'research' },
  'analytics-pages': { section: 'analytics', view: 'pages' },
  'analytics-geo': { section: 'analytics', view: 'geo' },
  'analytics-tech': { section: 'analytics', view: 'tech' },
  'analytics-commerce': { section: 'analytics', view: 'commerce' },
  'analytics-funnel': { section: 'analytics', view: 'funnel' },
  'analytics-retention': { section: 'analytics', view: 'retention' },
  rankings: { section: 'authority', view: 'summary' },
  domains: { section: 'authority', view: 'history' },
  brand: { section: 'articles', view: 'brand' },
  crawl: { section: 'health', view: 'crawl' },
  llms: { section: 'health', view: 'llms' },
  runs: { section: 'reports', view: 'runs' },
};

const BY_ID = new Map<string, SeoSection>(SEO_SECTIONS.map((s) => [s.value, s]));

export interface SeoTarget {
  section: SeoSectionId;
  /** Null for a section with no views. */
  view: string | null;
}

/** The pane to render for `?section=&view=`. Accepts a legacy id, and a `section/view` pair in `section`. */
export function resolveSeoTarget(rawSection: string | null | undefined, rawView?: string | null): SeoTarget {
  let sectionId = rawSection ?? '';
  let viewId = rawView ?? null;
  if (sectionId.includes('/')) [sectionId, viewId] = sectionId.split('/', 2);
  const legacy = LEGACY_SECTION_ALIASES[sectionId];
  if (legacy) return legacy;
  const section = BY_ID.get(sectionId) ?? BY_ID.get(DEFAULT_SEO_SECTION)!;
  if (!section.views?.length) return { section: section.value, view: null };
  const view = section.views.find((v) => v.value === viewId) ?? section.views[0];
  return { section: section.value, view: view.value };
}

export function seoSectionViews(section: SeoSectionId): readonly SeoView[] {
  return BY_ID.get(section)?.views ?? [];
}

export type SeoRailRow =
  | { kind: 'heading'; label: string }
  | { kind: 'section'; section: SeoSection };

/** The rail as rendered, with a heading before the first row of each group. */
export function seoRailRows(): SeoRailRow[] {
  const rows: SeoRailRow[] = [];
  let openGroup: SeoSection['group'];
  for (const section of SEO_SECTIONS) {
    if (section.group && section.group !== openGroup) {
      rows.push({ kind: 'heading', label: SEO_SECTION_GROUPS[section.group] });
    }
    openGroup = section.group;
    rows.push({ kind: 'section', section });
  }
  return rows;
}
