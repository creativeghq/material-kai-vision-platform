import {
  Home,
  MessageSquare,
  Palette,
  Users,
  FileText,
  BarChart3,
  FolderKanban,
  Wallet,
  Contact,
  Briefcase,
  Inbox,
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
  // #209 — Multi-tenant inbox (directional messaging + WhatsApp channel + agent takeover P2).
  { id: 'inbox', label: 'Inbox', path: '/inbox', icon: Inbox, requireCapability: 'inbox.use', moduleSlug: 'inbox' },
  { id: 'projects', label: 'Projects', path: '/projects', icon: FolderKanban, moduleSlug: 'projects' },
  { id: 'moodboard', label: 'MoodBoards', path: '/moodboard', icon: Palette },
  { id: 'discover', label: 'Discover', path: '/discover', icon: Users, requireCapability: 'marketplace.browse' },
  { id: 'quotes', label: 'Quotes', path: '/quotes', icon: FileText, requireCapability: 'quotes.use', moduleSlug: 'quotes' },
  // Blueprints (#242) are reached from under Projects (Projects list → Blueprints,
  // and each project's Plan tab), not as a top-level nav item.
  // #201 — Sales portal for invited reps (persona 'sales'). Gated on sales.portal so only
  // sales reps see it; managers use the full Quotes/Finance surfaces.
  { id: 'sales', label: 'Sales', path: '/sales', icon: Briefcase, requireCapability: 'sales.portal' },
  // #247 F — supplier portal is NOT a top-level nav item. It lives under Finance → Payables
  // (for finance-enabled workspaces) and under My Profile → Supplier Portal (for supplier-only,
  // non-finance workspaces). Route /supplier-portal still resolves for deep-links.
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
    label: 'Supplier Analytics',
    path: '/factory-analytics',
    icon: BarChart3,
    requireRole: 'factory',
  },
  // Admin was moved off the top nav into the profile menu (operator-only) — see Sidebar.tsx (#251).
];

/** Context the nav gates resolve against. Computed from hooks by the consuming component. */
export interface NavGateContext {
  isFactory: boolean;
  isAdmin: boolean;
  isPlatformOperator: boolean;
  isAccountant: boolean;
  isSalesRep: boolean;
  isModuleAvailable: (slug: string) => boolean;
  can: (c: Capability) => boolean;
}

/**
 * Single source of truth for which nav entries the active persona may see.
 * Shared by the desktop top nav, the mobile drawer, and the mobile bottom bar
 * so all three surfaces stay perfectly in sync.
 */
export function filterNavItems(
  items: readonly SidebarNavItem[],
  ctx: NavGateContext,
): SidebarNavItem[] {
  return items.filter((item) => {
    // Scoped invited roles see a focused subset only (overrides the gates below).
    if (ctx.isAccountant) return item.id === 'dashboard' || item.id === 'finance';
    if (ctx.isSalesRep) return item.id === 'dashboard' || item.id === 'quotes';
    if (item.requirePlatform && !ctx.isPlatformOperator) return false;
    // Factory analytics is for verified factories only — not dealers/operators.
    if (item.requireRole === 'factory' && !ctx.isFactory) return false;
    if (item.requireRole === 'admin' && !ctx.isAdmin) return false;
    // #195 capability gate (the unified persona model — drives end-user restriction).
    if (item.requireCapability && !ctx.can(item.requireCapability)) return false;
    // #212 entitlement gate — hide a paid module unless the active workspace owns it.
    if (item.moduleSlug && !ctx.isModuleAvailable(item.moduleSlug)) return false;
    return true;
  });
}

/**
 * Priority order for the mobile bottom tab bar. The first N visible entries
 * (after gating) fill the bar; everything else is reachable via the "More" sheet.
 * Dashboard and Agent Hub lead because they're the most-used surfaces.
 */
export const BOTTOM_NAV_PRIORITY: readonly string[] = [
  'dashboard',
  'agent-hub',
  'moodboard',
  'projects',
  'quotes',
  'inbox',
  'crm',
  'discover',
  'finance',
  'sales',
  'factory-analytics',
];
