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
  Network,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

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
  { id: 'discover', label: 'Discover', path: '/discover', icon: Users },
  { id: 'quotes', label: 'Quotes', path: '/quotes', icon: FileText },
  // Business-workspace surfaces — visible to a workspace owner/admin (operator, dealer,
  // architect), hidden from end-users. Part of unifying admin into the front-end (#174).
  { id: 'finance', label: 'Finance', path: '/finance', icon: Wallet, requireRole: 'admin' },
  { id: 'network', label: 'Network', path: '/network', icon: Network, requireRole: 'admin' },
  {
    id: 'factory-analytics',
    label: 'Factory Analytics',
    path: '/factory-analytics',
    icon: BarChart3,
    requireRole: 'factory',
  },
  { id: 'admin', label: 'Admin', path: '/admin', icon: Settings, requirePlatform: true },
];
