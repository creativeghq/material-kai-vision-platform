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
  Workflow,
  Headset,
  Sofa,
  Share2,
  TrendingUp,
  FileSignature,
  MessageCircle,
  Star,
  CalendarClock,
  BookOpen,
  ImagePlus,
  Building2,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { PRODUCT_BROWSE_ANY, type Capability } from '@/auth/capabilities';

export type NavRoleRequirement = 'factory' | 'admin';

/**
 * HubSpot-style "Hubs" (#251 follow-up): the App Launcher and Profile → Modules group the
 * workspace's business modules into a small, organized set of Hubs instead of a flat list.
 * A Hub is purely an IA/grouping layer over the existing `surface:'app'` items — routes,
 * module slugs, capabilities, and entitlements are unchanged. Each app declares its `hub`;
 * apps with no `hub` fall into a catch-all "More" bucket in the launcher.
 */
export type HubId = 'marketing' | 'sales' | 'finance' | 'service' | 'studio' | 'people';

export interface Hub {
  id: HubId;
  label: string;
  icon: LucideIcon;
  /** One-line description shown under the Hub header in the launcher / apps hub. */
  description: string;
}

/** Order here is the order Hubs render in the launcher rail and Profile → Modules. */
export const HUBS: readonly Hub[] = [
  { id: 'marketing', label: 'Marketing Hub', icon: Megaphone, description: 'Campaigns, automations, social & SEO — powered by the Agent.' },
  { id: 'sales', label: 'Sales Hub', icon: Briefcase, description: 'CRM, quotes, orders, services & supplier analytics.' },
  { id: 'finance', label: 'Finance Hub', icon: Wallet, description: 'Invoices, payments, reporting & warehouse.' },
  { id: 'service', label: 'Service Hub', icon: Headset, description: 'Customer conversations, reviews & knowledge base.' },
  { id: 'studio', label: 'Studio Hub', icon: Palette, description: 'Projects, moodboards & client presentations.' },
  { id: 'people', label: 'People Hub', icon: Users, description: 'Employees, absences & HR documents.' },
];

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
  /** OR-gate — hide unless the active persona holds ANY of these (e.g. catalog browse). */
  requireAnyCapability?: Capability[];
  /** Optional module gate. When set, item is only shown if the referenced module is enabled. */
  moduleSlug?: string;
  /** One-line description shown on the App Launcher / Profile → Modules cards (surface:'app'). */
  description?: string;
  /**
   * Which Hub this app belongs to in the App Launcher / Profile → Modules grouping (#251).
   * Only meaningful for `surface:'app'` items; `top` surfaces stay in the lean top bar.
   * Apps with no `hub` land in the launcher's catch-all "More" group.
   */
  hub?: HubId;
  /**
   * Where the item renders (#251 App Launcher IA):
   * - `'top'` (default) → the lean top nav bar (universal surfaces).
   * - `'app'` → the workspace **App Launcher**, alongside optional modules.
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
  // Material Search no longer has its own top-bar entry — it moved under Discover → Products
  // (the "Smart search" mode) so browsing and searching materials live in one place, and the
  // universal Mac-style Spotlight (⌘K, top bar) is the always-available quick-search entry point.
  // Reachable by anyone who works with the catalog (marketplace buyers + clients building
  // moodboards/quotes). The marketplace-only tabs (Profiles/Brand/Marketplace) self-gate inside.
  { id: 'discover', label: 'Discover', path: '/discover', icon: Users, requireAnyCapability: PRODUCT_BROWSE_ANY },

  // ── App Launcher (surface:'app'): entitle-able business modules, off the top bar (#251),
  //    grouped into Hubs (#251 follow-up) via the `hub` field. ──
  // #209 — Multi-tenant inbox (directional messaging + WhatsApp channel + agent takeover P2).
  { id: 'inbox', label: 'Inbox', path: '/inbox', icon: Inbox, requireCapability: 'inbox.use', moduleSlug: 'inbox', surface: 'app', hub: 'service', description: 'Shared inbox for customer conversations.' },
  // WhatsApp + Reviews — agent-driven comms/reputation (Hermes), same launcher pattern; the send /
  // public reply are confirm-gated inside the tools. All-users via agent.use + their module.
  { id: 'messaging', label: 'WhatsApp', path: '/agent-hub?capability=messaging', icon: MessageCircle, requireCapability: 'agent.use', moduleSlug: 'messaging', surface: 'app', hub: 'service', description: 'Message customers on WhatsApp — in the AI studio.' },
  { id: 'reviews', label: 'Reviews', path: '/agent-hub?capability=reviews', icon: Star, requireCapability: 'agent.use', moduleSlug: 'reviews', surface: 'app', hub: 'service', description: 'Read reviews about you and reply — in the AI studio.' },
  { id: 'projects', label: 'Projects', path: '/projects', icon: FolderKanban, moduleSlug: 'projects', surface: 'app', hub: 'studio', description: 'Plan and manage design projects.' },
  // MoodBoards moved off the lean top bar into Studio Hub (#251 follow-up) — it's creative
  // delivery work, grouped alongside Projects and client presentations.
  { id: 'moodboard', label: 'MoodBoards', path: '/moodboard', icon: Palette, surface: 'app', hub: 'studio', description: 'Curate materials and design inspiration.' },
  // Interior Design is agent-first (the Vision agent + generation toolkit on the canvas), so the
  // Studio Hub entry deep-links into the Agent Hub with Vision pre-selected rather than a static page.
  { id: 'interior', label: 'Interior Design', path: '/agent-hub?capability=interior', icon: Sofa, surface: 'app', hub: 'studio', description: 'Design, render & stage rooms with the AI studio.' },
  // Catalogs — agent-driven builder (Pepper); the create/extract tools self-gate to admin/owner.
  { id: 'catalogs', label: 'Catalogs', path: '/agent-hub?capability=catalog', icon: BookOpen, requireCapability: 'agent.use', moduleSlug: 'presentation-catalogs', surface: 'app', hub: 'studio', description: 'Build branded product catalogs — in the AI studio.' },
  // Image Studio — general image generation/editing (Vision + Gemini pipeline), for marketing
  // visuals / product shots / social imagery, distinct from the room-focused Interior tile. Reuses
  // the existing generation engine; opens the studio with the image pipeline (image-edit) primed.
  { id: 'image-studio', label: 'Image Studio', path: '/agent-hub?capability=image-studio&generation_mode=image-edit', icon: ImagePlus, requireCapability: 'agent.use', surface: 'app', hub: 'studio', description: 'Generate & edit product shots and marketing visuals — in the AI studio.' },
  { id: 'quotes', label: 'Quotes', path: '/quotes', icon: FileText, requireCapability: 'quotes.use', moduleSlug: 'quotes', surface: 'app', hub: 'sales', description: 'Build and send client quotes.' },
  // #201 — Sales portal for invited reps (persona 'sales').
  { id: 'sales', label: 'Sales', path: '/sales', icon: Briefcase, requireCapability: 'sales.portal', surface: 'app', hub: 'sales', description: 'Sales-rep portal for quotes.' },
  // Business-workspace surfaces — gated through the #195 capability layer, so end-users
  // (project clients / referral members) never see CRM or Finance. Part of #174.
  { id: 'crm', label: 'CRM', path: '/crm', icon: Contact, requireCapability: 'crm.view', moduleSlug: 'crm', surface: 'app', hub: 'sales', description: 'Contacts, companies, and leads.' },
  // Price Monitoring — agent-driven capability, exposed in the launcher like Interior/Social/SEO:
  // the tile opens the studio primed on the price-monitoring toolkit (track a product, pull prices).
  // All-users via agent.use + module gate; the full admin dashboard stays at /admin/monitoring.
  // Appointments — agent-driven scheduling over CRM Meetings (self-reminders); page is the Calendar tab.
  { id: 'appointments', label: 'Appointments', path: '/agent-hub?capability=appointments', icon: CalendarClock, requireCapability: 'agent.use', moduleSlug: 'crm', surface: 'app', hub: 'sales', description: 'List & schedule appointments with reminders — in the AI studio.' },
  // #249 — Real Estate module: appears only when the workspace is entitled to 'real-estate' AND the
  // persona holds realestate.view (owner/admin at P0; P1 adds the scoped realestate_agent persona).
  { id: 'real-estate', label: 'Real Estate', path: '/properties', icon: Building2, requireCapability: 'realestate.view', moduleSlug: 'real-estate', surface: 'app', hub: 'sales', description: 'List, manage and publish properties.' },
  { id: 'finance', label: 'Finance', path: '/finance', icon: Wallet, requireCapability: 'finance.manage', moduleSlug: 'sales-finance', surface: 'app', hub: 'finance', description: 'Invoices, payments, and reports.' },
  // Warehouse: inventory extracted from the Finance tab into its own paid add-on (module slug stays
  // 'stock' internally). Appears only when the workspace is entitled AND the persona holds warehouse.manage.
  { id: 'stock', label: 'Warehouse', path: '/warehouse', icon: Package, requireCapability: 'warehouse.manage', moduleSlug: 'stock', surface: 'app', hub: 'finance', description: 'Inventory, dispatch, movements & stocktake.' },
  // Contracts & e-signature — agent-driven (Trinity); the send-for-signature is confirm-gated.
  { id: 'contracts', label: 'Contracts', path: '/agent-hub?capability=contract', icon: FileSignature, requireCapability: 'agent.use', moduleSlug: 'contracts', surface: 'app', hub: 'finance', description: 'List contracts and send drafts for e-signature — in the AI studio.' },
  // #252 — HR module: appears only when the workspace is entitled to 'hr' AND the persona holds
  // hr.view (owner/admin, not plain members — employee salary/absence data is sensitive).
  { id: 'hr', label: 'HR', path: '/hr', icon: Users, requireCapability: 'hr.view', moduleSlug: 'hr', surface: 'app', hub: 'people', description: 'Employees, absences, and HR documents.' },
  // #252 — employee self-service. hr.self is held ONLY by the 'employee' persona, so this shows
  // for invited employees (never owners/admins, who use the full HR above).
  { id: 'my-hr', label: 'My HR', path: '/my-hr', icon: UserCircle, requireCapability: 'hr.self', surface: 'app', hub: 'people', description: 'Your payslips, absences, and requests.' },
  // #255 — Email Marketing: appears only when the workspace is entitled to 'email-marketing' AND
  // the persona holds marketing.email (owner/admin of a business node).
  { id: 'email-marketing', label: 'Email Marketing', path: '/marketing/email', icon: Megaphone, requireCapability: 'marketing.email', moduleSlug: 'email-marketing', surface: 'app', hub: 'marketing', description: 'Design templates and send bulk email campaigns.' },
  // #256 — Flows toolkit: appears when the workspace owns 'flows-toolkit' AND the user can use
  // the agent (Flows are agent-built). The page is the management view; chat is the create surface.
  { id: 'automations', label: 'Automations', path: '/automations', icon: Workflow, requireCapability: 'agent.use', moduleSlug: 'flows-toolkit', surface: 'app', hub: 'marketing', description: 'Automate actions when things happen in your workspace.' },
  // Social + SEO are agent-first toolkits (Hermes / Edith), so they deep-link through the
  // capability registry (#275) into the agent with the right toolkit primed — same "one capability,
  // every surface" pattern. moduleSlug gates them into the launcher (active if entitled, else an
  // "available to add" upsell card).
  { id: 'social', label: 'Social Media', path: '/agent-hub?capability=social-post', icon: Share2, requireCapability: 'agent.use', moduleSlug: 'social-media', surface: 'app', hub: 'marketing', description: 'Publish & schedule social posts with the AI studio.' },
  // SEO & Content — one tile for the whole seo-toolkit; the launcher center lists research/audits +
  // article writing as sections (Content Writer merged in here, no longer a separate tile). Mention
  // Monitoring is nested under Social Media (see LAUNCHER_SECTIONS) to keep the Marketing list lean.
  { id: 'seo', label: 'SEO & Content', path: '/agent-hub?capability=seo-research', icon: TrendingUp, requireCapability: 'agent.use', moduleSlug: 'seo-toolkit', surface: 'app', hub: 'marketing', description: 'Keyword research, audits & SEO article writing — in the AI studio.' },
  {
    id: 'factory-analytics',
    label: 'Supplier Analytics',
    path: '/factory-analytics',
    icon: BarChart3,
    requireRole: 'factory',
    surface: 'app',
    hub: 'sales',
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
  isRealEstateAgent: boolean;
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
    // #249 — Estate Agent: Real Estate surface only (their own listings/leads + open-for-all).
    if (ctx.isRealEstateAgent) return item.id === 'dashboard' || item.id === 'real-estate';
    if (item.requirePlatform && !ctx.isPlatformOperator) return false;
    // Factory analytics is for verified factories only — not dealers/operators.
    if (item.requireRole === 'factory' && !ctx.isFactory) return false;
    if (item.requireRole === 'admin' && !ctx.isAdmin) return false;
    // #195 capability gate (the unified persona model — drives end-user restriction).
    if (item.requireCapability && !ctx.can(item.requireCapability)) return false;
    // OR-gate — visible if the persona holds ANY of the listed capabilities.
    if (item.requireAnyCapability && !item.requireAnyCapability.some(ctx.can)) return false;
    // #212 entitlement gate — hide a paid module unless the active workspace owns it.
    if (item.moduleSlug && !ctx.isModuleAvailable(item.moduleSlug)) return false;
    return true;
  });
}

/**
 * Importance ranking that drives the ENTIRE mobile nav order (bottom bar + "More" sheet).
 * MobileBottomNav sorts every gated item by this list: the first BAR_SLOTS (4) entitled entries
 * fill the visible bottom bar, and the remainder flow into the "More" sheet in this same order.
 * IDs not listed here fall back after these, in raw SIDEBAR_NAV_ITEMS order — so keep this complete.
 * This is the ONE place to re-rank mobile importance; it does NOT affect the desktop nav/launcher.
 * Grouped by how central each surface is to running the business day-to-day.
 */
export const BOTTOM_NAV_PRIORITY: readonly string[] = [
  // Everyday drivers — these fill the visible bottom bar (top 4 entitled)
  'dashboard',
  'agent-hub',
  'discover',
  'quotes',
  // Customers & revenue
  'crm',
  'inbox',
  'finance',
  'sales',
  // Scheduling & operations
  'appointments',
  'projects',
  'stock',
  // Design studio
  'moodboard',
  'interior',
  'catalogs',
  'image-studio',
  // Vertical modules
  'real-estate',
  // Comms
  'messaging',
  'reviews',
  // Documents & people
  'contracts',
  'hr',
  'my-hr',
  // Marketing
  'email-marketing',
  'social',
  'seo',
  'automations',
  // Niche / role-specific
  'factory-analytics',
];
