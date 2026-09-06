/**
 * The ONE lucide-name → component map for every run/workflow surface.
 *
 * WorkflowTracker and WorkflowWizardCard each carried their own copy and they had already
 * drifted (the tracker had no `Newspaper`, so the SEO pipeline's own header icon fell back
 * to a wrench). An icon resolving to the fallback is invisible — it renders perfectly, it
 * is just the wrong picture — so a third copy was not an option.
 *
 * Named imports, not `import * as`: a namespace import of lucide-react defeats tree-shaking
 * and pulls the whole icon set into the bundle.
 */
import type { ComponentType } from 'react';
import {
  BadgeCheck, BookOpen, Bot, Briefcase, Building2, Calculator, CalendarClock, Code2,
  Compass, FileDown, FileSearch, FileText, FolderKanban, Gauge, Globe, Grid3x3, HardHat,
  Image as ImageIcon, Inbox, Layers, LayoutTemplate, Link2, ListTree, Mail, Megaphone,
  Network, Newspaper, Package, PencilLine, PenLine, Percent, Plus, Radar, ReceiptText,
  RefreshCw, Save, Search, Send, Settings2, Share2, ShoppingCart, Sparkles, Star, Users,
  Wallet, Workflow, Wrench,
} from 'lucide-react';

export type StepIconComponent = ComponentType<{ className?: string }>;

export const STEP_ICONS: Record<string, StepIconComponent> = {
  BadgeCheck, BookOpen, Bot, Briefcase, Building2, Calculator, CalendarClock, Code2,
  Compass, FileDown, FileSearch, FileText, FolderKanban, Gauge, Globe, Grid3x3, HardHat,
  ImageIcon, Inbox, Layers, LayoutTemplate, Link2, ListTree, Mail, Megaphone, Network,
  Newspaper, Package, PencilLine, PenLine, Percent, Plus, Radar, ReceiptText, RefreshCw,
  Save, Search, Send, Settings2, Share2, ShoppingCart, Sparkles, Star, Users, Wallet,
  Workflow, Wrench,
};

/** Resolve a lucide name to a component. Unknown / absent names get the generic tool icon. */
export function stepIcon(name?: string): StepIconComponent {
  return (name && STEP_ICONS[name]) || Wrench;
}

/**
 * Tool CATEGORY → icon, for a step discovered from a `tool_call` chunk (which carries a
 * tool id and nothing else). The category comes from the tool catalog, so a new tool in an
 * existing category is drawn correctly with no edit here.
 */
const CATEGORY_ICON: Record<string, string> = {
  'Admin': 'Settings2',
  'Appointments': 'CalendarClock',
  'B2B Research': 'Building2',
  'CRM': 'Users',
  'Calculators': 'Calculator',
  'Catalogs': 'BookOpen',
  'Contracts': 'FileText',
  'Email Marketing': 'Mail',
  'Finance': 'Wallet',
  'Generation': 'ImageIcon',
  'Inbox': 'Inbox',
  'Job Research': 'Briefcase',
  'Mentions': 'Megaphone',
  'Messaging': 'Send',
  'Price Monitoring': 'Percent',
  'Projects': 'FolderKanban',
  'Quotes': 'ReceiptText',
  'Real Estate': 'Building2',
  'Reviews': 'Star',
  'Search': 'Search',
  'Sub-Agents': 'Bot',
};

export function iconNameForCategory(category?: string): string {
  if (!category) return 'Wrench';
  // Every SEO family ("SEO Research", "SEO Backlinks", …) shares one picture rather than
  // needing a row each — the family is what the reader is distinguishing, not the sub-area.
  if (category.startsWith('SEO')) return 'Gauge';
  return CATEGORY_ICON[category] || 'Wrench';
}
