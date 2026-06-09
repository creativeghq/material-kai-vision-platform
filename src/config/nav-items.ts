import {
  Home,
  MessageSquare,
  Palette,
  Users,
  FileText,
  BarChart3,
  Settings,
  FolderKanban,
  Wallet,
  Contact,
  Briefcase,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { Capability } from '@/auth/capabilities';

export type NavRoleRequirement = 'factory' | 'admin';

export interface SidebarNavItem {
  id: string;
  label: string;
  path: string;
  icon: LucideIcon;
  /** Optional role gate. When undefined, item is visible to every authenticated user. */
  requireRole?: NavRoleRequirement;
  /** Platform-operator only (owner/admin of the root workspace). Hides from dealers/architects/end-users. */
  requirePlatform?: boolean;
  /** #195 capability gate — hide unless the active persona holds this capability. */
  requireCapability?: Capability;
  /** Optional module gate. When set, item is only shown if the referenced module is enabled. */
  moduleSlug?: string;
}

/**
 * Data-driven sidebar navigation. Order here is the order shown to users.
 *
 * To add a module-gated entry: set `moduleSlug` to the module's registry slug.
 * To add a role-gated entry: set `requireRole` to 'factory' or 'admin'.
 */
export const SIDEBAR_NAV_ITEMS: SidebarNavItem[] = [
  { id: 'dashboard', label: 'Dashboard', path: '/', icon: Home },
  { id: 'agent-hub', label: 'Agent Hub', path: '/agent-hub', icon: MessageSquare },
  { id: 'projects', label: 'Projects', path: '/projects', icon: FolderKanban, moduleSlug: 'projects' },
  { id: 'moodboard', label: 'MoodBoards', path: '/moodboard', icon: Palette },
  { id: 'discover', label: 'Discover', path: '/discover', icon: Users, requireCapability: 'marketplace.browse' },
  { id: 'quotes', label: 'Quotes', path: '/quotes', icon: FileText, requireCapability: 'quotes.use', moduleSlug: 'quotes' },
  // #201 — Sales portal for invited reps (persona 'sales'). Gated on sales.portal so only
  // sales reps see it; managers use the full Quotes/Finance surfaces.
  { id: 'sales', label: 'Sales', path: '/sales', icon: Briefcase, requireCapability: 'sales.portal' },
  // Business-workspace surfaces — gated through the #195 capability layer, so end-users
  // (project clients / referral members) never see CRM or Finance. Part of #174.
  { id: 'crm', label: 'CRM', path: '/crm', icon: Contact, requireCapability: 'crm.view', moduleSlug: 'crm' },
  { id: 'finance', label: 'Finance', path: '/finance', icon: Wallet, requireCapability: 'finance.manage', moduleSlug: 'sales-finance' },
  // #177 — "Requests" (master-request procurement inbox) is now a tab inside Quotes
  // (/quotes?tab=requests), not a top-nav item. The Inbox icon is freed for the upcoming
  // INBOX feature.
  // Workspace Settings was removed from the top nav — branding lives in Finance → Settings →
  // Business identity, members in Finance → Settings → Team, and credits under User Profile.
  // Network is reached from the workspace switcher ("Manage network"), not the top nav.
  {
    id: 'factory-analytics',
    label: 'Factory Analytics',
    path: '/factory-analytics',
    icon: BarChart3,
    requireRole: 'factory',
  },
  { id: 'admin', label: 'Admin', path: '/admin', icon: Settings, requirePlatform: true },
];
