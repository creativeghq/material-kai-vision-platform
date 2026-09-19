/** The per-website SEO rail — ONE declaration, read by the dashboard that renders it. */
import {
  Bot, FileBarChart, FileStack, FileText, Filter, FlaskConical, Gauge, Globe, Globe2, LayoutDashboard,
  LineChart, MonitorSmartphone, Radar, Repeat, Scissors, Search, ShieldCheck, ShoppingBag, Sparkles,
  Spline, Swords,
  Target, TrendingUp,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export type SeoSectionId =
  | 'overview'
  | 'gsc' | 'cannibalisation' | 'ranks'
  | 'analytics' | 'analytics-pages' | 'analytics-geo' | 'analytics-tech' | 'analytics-commerce'
  | 'analytics-funnel' | 'analytics-retention'
  | 'ai' | 'rankings' | 'competitors' | 'domains'
  | 'articles' | 'research' | 'brand'
  | 'crawl' | 'health' | 'llms'
  | 'runs' | 'reports';

export type SeoGroupId = 'search' | 'audience' | 'visibility' | 'content' | 'technical' | 'activity';

export interface SeoSection {
  /** The `?section=` key — the external contract. Labels are free to change; this is not. */
  value: SeoSectionId;
  label: string;
  icon: LucideIcon;
  group?: SeoGroupId;
  /** The pane opened when `?section=` is absent. Exactly one section carries it. */
  landing?: boolean;
}

export const SEO_SECTION_GROUPS = {
  search: 'Search',
  audience: 'Audience',
  visibility: 'Visibility',
  content: 'Content',
  technical: 'Technical',
  activity: 'Activity',
} as const;

/**
 * Seventeen panes in five groups, ONE pane per row. A row stacking several panels has no way to
 * address the second one, so it stops being reviewable while still looking complete.
 */
export const SEO_SECTIONS: readonly SeoSection[] = [
  { value: 'overview', label: 'Overview', icon: LayoutDashboard, landing: true },

  { value: 'gsc', label: 'Search Console', icon: LineChart, group: 'search' },
  { value: 'cannibalisation', label: 'Cannibalisation', icon: Scissors, group: 'search' },
  { value: 'ranks', label: 'Rank Tracker', icon: Target, group: 'search' },

  { value: 'analytics', label: 'Overview', icon: Spline, group: 'audience' },
  { value: 'analytics-pages', label: 'Pages', icon: FileStack, group: 'audience' },
  { value: 'analytics-geo', label: 'Geography', icon: Globe2, group: 'audience' },
  { value: 'analytics-tech', label: 'Devices & events', icon: MonitorSmartphone, group: 'audience' },
  { value: 'analytics-commerce', label: 'Products & ads', icon: ShoppingBag, group: 'audience' },
  { value: 'analytics-funnel', label: 'Funnel', icon: Filter, group: 'audience' },
  { value: 'analytics-retention', label: 'Retention', icon: Repeat, group: 'audience' },

  { value: 'ai', label: 'AI Visibility', icon: Sparkles, group: 'visibility' },
  { value: 'rankings', label: 'Backlinks & Authority', icon: TrendingUp, group: 'visibility' },
  { value: 'competitors', label: 'Competitors', icon: Swords, group: 'visibility' },
  { value: 'domains', label: 'Domain Audits', icon: Radar, group: 'visibility' },

  { value: 'articles', label: 'Articles', icon: FileText, group: 'content' },
  { value: 'research', label: 'Keyword Research', icon: Search, group: 'content' },
  { value: 'brand', label: 'Brand Profile', icon: ShieldCheck, group: 'content' },

  { value: 'crawl', label: 'Site Crawl', icon: Globe, group: 'technical' },
  { value: 'health', label: 'Page Health', icon: Gauge, group: 'technical' },
  { value: 'llms', label: 'llms.txt', icon: Bot, group: 'technical' },

  { value: 'runs', label: 'Toolkit Runs', icon: FlaskConical, group: 'activity' },
  { value: 'reports', label: 'Reports', icon: FileBarChart, group: 'activity' },
];

export const DEFAULT_SEO_SECTION: SeoSectionId = 'overview';
export const SEO_SECTION_IDS: readonly SeoSectionId[] = SEO_SECTIONS.map((s) => s.value);

const OFFERED = new Set<string>(SEO_SECTION_IDS);

/** The pane to render: the one asked for, or the landing pane. */
export function resolveSeoSection(raw: string | null | undefined): SeoSectionId {
  return raw && OFFERED.has(raw) ? (raw as SeoSectionId) : DEFAULT_SEO_SECTION;
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
