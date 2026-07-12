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
  UserCircle,
  Megaphone,
  Package,
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
  /** One-line description shown on the App Launcher / /apps cards (for surface:'app' items). */
  description?: string;
  /**
   * Where the item renders (#251 App Launcher IA):
   * - `'top'` (default) → the lean top nav bar (universal surfaces).
   * - `'app'` → the workspace **App Launcher** + `/apps` hub, alongside optional modules.
   *   Keeps the top bar uncluttered as the platform grows to many modules. Routes/guards
   *   are unchanged — only the entry point moves.
   */
  surface?: 'top' | 'app';
}

/**
 * Data-driven sidebar navigation. Order here is the order shown to users.
 *
 * To add a module-gated entry: set `moduleSlug` to the module's registry slug.
 * To add a role-gated entry: set `requireRole` to 'factory' or 'admin'.
 */
export const SIDEBAR_NAV_ITEMS: SidebarNavItem[] = [
  // ── Top bar: universal surfaces every user relies on ──
  { id: 'dashboard', label: 'Dashboard', path: '/', icon: Home },
  { id: 'agent-hub', label: 'Agent Hub', path: '/agent-hub', icon: MessageSquare },
  { id: 'moodboard', label: 'MoodBoards', path: '/moodboard', icon: Palette },
  { id: 'discover', label: 'Discover', path: '/discover', icon: Users, requireCapability: 'marketplace.browse' },

  // ── App Launcher (surface:'app'): entitle-able business modules, off the top bar (#251) ──
  // #209 — Multi-tenant inbox (directional messaging + WhatsApp channel + agent takeover P2).
  { id: 'inbox', label: 'Inbox', path: '/inbox', icon: Inbox, requireCapability: 'inbox.use', moduleSlug: 'inbox', surface: 'app', description: 'Shared inbox for customer conversations.' },
  { id: 'projects', label: 'Projects', path: '/projects', icon: FolderKanban, moduleSlug: 'projects', surface: 'app', description: 'Plan and manage design projects.' },
  { id: 'quotes', label: 'Quotes', path: '/quotes', icon: FileText, requireCapability: 'quotes.use', moduleSlug: 'quotes', surface: 'app', description: 'Build and send client quotes.' },
  // #201 — Sales portal for invited reps (persona 'sales').
  { id: 'sales', label: 'Sales', path: '/sales', icon: Briefcase, requireCapability: 'sales.portal', surface: 'app', description: 'Sales-rep portal for quotes.' },
  // Business-workspace surfaces — gated through the #195 capability layer, so end-users
  // (project clients / referral members) never see CRM or Finance. Part of #174.
  { id: 'crm', label: 'CRM', path: '/crm', icon: Contact, requireCapability: 'crm.view', moduleSlug: 'crm', surface: 'app', description: 'Contacts, companies, and leads.' },
  { id: 'finance', label: 'Finance', path: '/finance', icon: Wallet, requireCapability: 'finance.manage', moduleSlug: 'sales-finance', surface: 'app', description: 'Invoices, payments, and reports.' },
  // Warehouse: inventory extracted from the Finance tab into its own paid add-on (module slug stays
  // 'stock' internally). Appears only when the workspace is entitled AND the persona holds warehouse.manage.
  { id: 'stock', label: 'Warehouse', path: '/warehouse', icon: Package, requireCapability: 'warehouse.manage', moduleSlug: 'stock', surface: 'app', description: 'Inventory, dispatch, movements & stocktake.' },
  // #252 — HR module: appears only when the workspace is entitled to 'hr' AND the persona holds
  // hr.view (owner/admin, not plain members — employee salary/absence data is sensitive).
  { id: 'hr', label: 'HR', path: '/hr', icon: Users, requireCapability: 'hr.view', moduleSlug: 'hr', surface: 'app', description: 'Employees, absences, and HR documents.' },
  // #252 — employee self-service. hr.self is held ONLY by the 'employee' persona, so this shows
  // for invited employees (never owners/admins, who use the full HR above).
  { id: 'my-hr', label: 'My HR', path: '/my-hr', icon: UserCircle, requireCapability: 'hr.self', surface: 'app', description: 'Your payslips, absences, and requests.' },
  // #255 — Email Marketing: appears only when the workspace is entitled to 'email-marketing' AND
  // the persona holds marketing.email (owner/admin of a business node).
  { id: 'email-marketing', label: 'Email Marketing', path: '/marketing/email', icon: Megaphone, requireCapability: 'marketing.email', moduleSlug: 'email-marketing', surface: 'app', description: 'Design templates and send bulk email campaigns.' },
  {
    id: 'factory-analytics',
    label: 'Supplier Analytics',
    path: '/factory-analytics',
    icon: BarChart3,
    requireRole: 'factory',
    surface: 'app',
    description: 'Supplier demand and engagement analytics.',
  },
  // Blueprints (#242) live under Projects. Supplier portal (#247) lives under Finance → Payables /
  // Profile → Supplier Portal. Admin moved to the profile menu (operator-only). Network is on the
  // workspace switcher.
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
  'discover',
];
