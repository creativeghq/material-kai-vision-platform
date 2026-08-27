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
  Layers,
  Ruler,
  DraftingCompass,
  Handshake,
  FileSearch,
  Radar,
  ScanLine,
  Store,
  Globe,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { PRODUCT_BROWSE_ANY, type Capability } from '@/auth/capabilities';

export type NavRoleRequirement = 'admin';

/**
 * HubSpot-style "Hubs": the App Launcher and Profile → Modules group the
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
  // "supplier analytics" left this description with #350: that app was /factory-analytics, which is
  // gone, and per-supplier analytics now live on the CRM company record — inside CRM, not as a tile.
  // "services" never had an app at all. Describe the tiles this hub actually holds.
  { id: 'sales', label: 'Sales Hub', icon: Briefcase, description: 'CRM, quotes, appointments, properties & market demand.' },
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
  /** Capability gate — hide unless the active persona holds this capability. */
  requireCapability?: Capability;
  /** OR-gate — hide unless the active persona holds ANY of these (e.g. catalog browse). */
  requireAnyCapability?: Capability[];
  /** Optional module gate. When set, item is only shown if the referenced module is enabled. */
  moduleSlug?: string;
  /**
   * Supplier-workspace gate — hide unless the ACTIVE workspace is one that supplies products
   * (`workspaces.can_supply_products`). This is about what the workspace IS, not what the member is
   * allowed to do, so it is neither a role nor a capability: every member of a supplier workspace
   * sees a supplier surface, and no member of a buyer workspace does.
   */
  requireSupplierWorkspace?: boolean;
  /** One-line description shown on the App Launcher / Profile → Modules cards (surface:'app'). */
  description?: string;
  /**
   * Which Hub this app belongs to in the App Launcher / Profile → Modules grouping.
   * Only meaningful for `surface:'app'` items; `top` surfaces stay in the lean top bar.
   * Apps with no `hub` land in the launcher's catch-all "More" group.
   */
  hub?: HubId;
  /**
   * Where the item renders (App Launcher IA):
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
 * To add a role-gated entry: set `requireRole` to 'admin'.
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

  // ── App Launcher (surface:'app'): entitle-able business modules, off the top bar,
  //    grouped into Hubs via the `hub` field. ──
  // Multi-tenant inbox (directional messaging + WhatsApp channel + agent takeover P2).
  { id: 'inbox', label: 'Inbox', path: '/inbox', icon: Inbox, requireCapability: 'inbox.use', moduleSlug: 'inbox', surface: 'app', hub: 'service', description: 'Shared inbox for customer conversations.' },
  // WhatsApp + Reviews — agent-driven comms/reputation (Hermes), same launcher pattern; the send /
  // public reply are confirm-gated inside the tools. All-users via agent.use + their module.
  { id: 'messaging', label: 'WhatsApp', path: '/agent-hub?capability=messaging', icon: MessageCircle, requireCapability: 'agent.use', moduleSlug: 'messaging', surface: 'app', hub: 'service', description: 'Message customers on WhatsApp — in the AI studio.' },
  { id: 'reviews', label: 'Reviews', path: '/agent-hub?capability=reviews', icon: Star, requireCapability: 'agent.use', moduleSlug: 'reviews', surface: 'app', hub: 'service', description: 'Read reviews about you and reply — in the AI studio.' },
  { id: 'projects', label: 'Projects', path: '/projects', icon: FolderKanban, moduleSlug: 'projects', surface: 'app', hub: 'studio', description: 'Plan and manage design projects.' },
  // MoodBoards moved off the lean top bar into Studio Hub — it's creative
  // delivery work, grouped alongside Projects and client presentations.
  { id: 'moodboard', label: 'MoodBoards', path: '/moodboard', icon: Palette, surface: 'app', hub: 'studio', description: 'Curate materials and design inspiration.' },
  // Interior Design is agent-first (the Vision agent + generation toolkit on the canvas), so the
  // Studio Hub entry deep-links into the Agent Hub with Vision pre-selected rather than a static page.
  { id: 'interior', label: 'Interior Design', path: '/agent-hub?capability=interior', icon: Sofa, surface: 'app', hub: 'studio', description: 'Design, render & stage rooms with the AI studio.' },
  // Room Planner (#321 M3 / #259). Built, tested, and reachable from NOTHING until now — the route
  // existed in App.tsx and no surface linked it, so the only way in was typing the URL. Gated like
  // MoodBoards (no module, no extra capability): it draws the workspace's own catalogue on a plan,
  // and `room_layouts` is workspace-scoped by RLS.
  { id: 'room-planner', label: 'Room Planner', path: '/room-planner', icon: Ruler, surface: 'app', hub: 'studio', description: 'Arrange catalog products on a floor plan, at their real size.' },
  // Blueprints. Previously reachable ONLY from a button on the Projects list page — the nav comment
  // claimed they "live under Projects", which was true of the page and not of any menu. Gated like
  // MoodBoards and Room Planner (no module, no extra capability): `blueprints` is workspace-scoped
  // by RLS and the editor draws the workspace's own catalogue. No `hub` on purpose, same reason as
  // Templates below: a blueprint is a reusable starting point that prices a project, a quote or an
  // order, so it cuts across Studio, Sales and Finance rather than belonging to any one of them —
  // which puts it in the launcher's catch-all "More" group.
  { id: 'blueprints', label: 'Blueprints', path: '/blueprints', icon: DraftingCompass, surface: 'app', description: 'Reusable room and scope templates that price a project in one click.' },
  // Catalogs — agent-driven builder (Pepper); the create/extract tools self-gate to admin/owner.
  { id: 'catalogs', label: 'Catalogs', path: '/agent-hub?capability=catalog', icon: BookOpen, requireCapability: 'agent.use', moduleSlug: 'presentation-catalogs', surface: 'app', hub: 'studio', description: 'Build branded product catalogs — in the AI studio.' },
  // Image Studio — general image generation/editing (Vision + Gemini pipeline), for marketing
  // visuals / product shots / social imagery, distinct from the room-focused Interior tile. Reuses
  // the existing generation engine; opens the studio with the image pipeline (image-edit) primed.
  { id: 'image-studio', label: 'Image Studio', path: '/agent-hub?capability=image-studio&generation_mode=image-edit', icon: ImagePlus, requireCapability: 'agent.use', surface: 'app', hub: 'studio', description: 'Generate & edit product shots and marketing visuals — in the AI studio.' },
  { id: 'quotes', label: 'Quotes', path: '/quotes', icon: FileText, requireCapability: 'quotes.use', moduleSlug: 'quotes', surface: 'app', hub: 'sales', description: 'Build and send client quotes.' },
  // Sales portal for invited reps (persona 'sales').
  { id: 'sales', label: 'Sales', path: '/sales', icon: Briefcase, requireCapability: 'sales.portal', surface: 'app', hub: 'sales', description: 'Sales-rep portal for quotes.' },
  // Business-workspace surfaces — gated through the capability layer, so end-users
  // (project clients / referral members) never see CRM or Finance.
  { id: 'crm', label: 'CRM', path: '/crm', icon: Contact, requireCapability: 'crm.view', moduleSlug: 'crm', surface: 'app', hub: 'sales', description: 'Contacts, companies, and leads.' },
  // Price Monitoring — agent-driven capability, exposed in the launcher like Interior/Social/SEO:
  // the tile opens the studio primed on the price-monitoring toolkit (track a product, pull prices).
  // All-users via agent.use + module gate; the full admin dashboard stays at /admin/monitoring.
  // Appointments — agent-driven scheduling over CRM Meetings (self-reminders); page is the Calendar tab.
  { id: 'appointments', label: 'Appointments', path: '/agent-hub?capability=appointments', icon: CalendarClock, requireCapability: 'agent.use', moduleSlug: 'crm', surface: 'app', hub: 'sales', description: 'List & schedule appointments with reminders — in the AI studio.' },
  // Deals & Pipeline. Lives on /crm?tab=pipeline (one deal object across CRM and Real Estate,
  // segmented by deal type), but it is a paid add-on of its own and a daily sales surface, so it
  // gets a Sales tile rather than staying a chip on the CRM card where it read as a CRM sub-view.
  // Both gates are real: `crm.view` because it is a CRM tab, `deals` because that is what is sold.
  { id: 'deals', label: 'Deals', path: '/crm?tab=pipeline', icon: Handshake, requireCapability: 'crm.view', moduleSlug: 'deals', surface: 'app', hub: 'sales', description: 'Track opportunities from first contact to won.' },
  // Real Estate module: appears only when the workspace is entitled to 'real-estate' AND the
  // persona holds realestate.view (owner/admin at P0; P1 adds the scoped realestate_agent persona).
  { id: 'real-estate', label: 'Real Estate', path: '/properties', icon: Building2, requireCapability: 'realestate.view', moduleSlug: 'real-estate', surface: 'app', hub: 'sales', description: 'List, manage and publish properties.' },
  { id: 'finance', label: 'Finance', path: '/finance', icon: Wallet, requireCapability: 'finance.manage', moduleSlug: 'sales-finance', surface: 'app', hub: 'finance', description: 'Invoices, payments, and reports.' },
  // Warehouse: inventory extracted from the Finance tab into its own paid add-on (module slug stays
  // 'stock' internally). Appears only when the workspace is entitled AND the persona holds warehouse.manage.
  { id: 'stock', label: 'Warehouse', path: '/warehouse', icon: Package, requireCapability: 'warehouse.manage', moduleSlug: 'stock', surface: 'app', hub: 'finance', description: 'Inventory, dispatch, movements & stocktake.' },
  // Cloud POS (Ταμειακή Online) — issues myDATA retail receipts. Only linked from inside Finance's
  // Documents view until now. Gated to MATCH ITS ROUTE, which is CapabilityGuard 'invoice.issue',
  // plus the sales-finance module it is built on: a tile looser than its own guard just sends people
  // to a permission wall.
  { id: 'pos', label: 'POS', path: '/pos', icon: ScanLine, requireCapability: 'invoice.issue', moduleSlug: 'sales-finance', surface: 'app', hub: 'finance', description: 'Cash register — issue retail receipts, take payment and print.' },
  // Supplier portal — the POs sent to this workspace's supplier identity, across every buyer.
  // Gated on the workspace SUPPLYING products, not on being its admin: "am I a supplier" is the
  // question this surface answers, and a supplier's order desk is rarely the workspace owner. An
  // admin gate would have hidden it from the staff who actually confirm and ship, while showing it
  // to the admin of every buyer-only workspace on the platform — wrong on both sides.
  //
  // A supplier workspace that has not finished its claim lands on the page's own "claim your
  // identity" empty state, which is the correct next step for them rather than a dead end.
  { id: 'supplier-portal', label: 'Supplier Portal', path: '/supplier-portal', icon: Store, requireSupplierWorkspace: true, surface: 'app', hub: 'finance', description: 'Purchase orders sent to you as a claimed supplier — confirm and mark shipped.' },
  // Contracts & e-signature — agent-driven (Trinity); the send-for-signature is confirm-gated.
  { id: 'contracts', label: 'Contracts', path: '/agent-hub?capability=contract', icon: FileSignature, requireCapability: 'agent.use', moduleSlug: 'contracts', surface: 'app', hub: 'finance', description: 'List contracts and send drafts for e-signature — in the AI studio.' },
  // HR module: appears only when the workspace is entitled to 'hr' AND the persona holds
  // hr.view (owner/admin, not plain members — employee salary/absence data is sensitive).
  { id: 'hr', label: 'HR', path: '/hr', icon: Users, requireCapability: 'hr.view', moduleSlug: 'hr', surface: 'app', hub: 'people', description: 'Employees, absences, and HR documents.' },
  // Employee self-service. hr.self is held ONLY by the 'employee' persona, so this shows
  // for invited employees (never owners/admins, who use the full HR above).
  { id: 'my-hr', label: 'My HR', path: '/my-hr', icon: UserCircle, requireCapability: 'hr.self', surface: 'app', hub: 'people', description: 'Your payslips, absences, and requests.' },
  // Email Marketing: appears only when the workspace is entitled to 'email-marketing' AND
  // the persona holds marketing.email (owner/admin of a business node).
  { id: 'email-marketing', label: 'Email Marketing', path: '/marketing/email', icon: Megaphone, requireCapability: 'marketing.email', moduleSlug: 'email-marketing', surface: 'app', hub: 'marketing', description: 'Design templates and send bulk email campaigns.' },
  // Flows toolkit: appears when the workspace owns 'flows-toolkit' AND the user can use
  // the agent (Flows are agent-built). The page is the management view; chat is the create surface.
  { id: 'automations', label: 'Automations', path: '/automations', icon: Workflow, requireCapability: 'agent.use', moduleSlug: 'flows-toolkit', surface: 'app', hub: 'marketing', description: 'Automate actions when things happen in your workspace.' },
  // Social + SEO are agent-first toolkits (Hermes / Edith), so they deep-link through the
  // capability registry into the agent with the right toolkit primed — same "one capability,
  // every surface" pattern. moduleSlug gates them into the launcher (active if entitled, else an
  // "available to add" upsell card).
  { id: 'social', label: 'Social Media', path: '/agent-hub?capability=social-post', icon: Share2, requireCapability: 'agent.use', moduleSlug: 'social-media', surface: 'app', hub: 'marketing', description: 'Publish & schedule social posts with the AI studio.' },
  // WhatsApp sits under Social Media because that is how an operator thinks about it — both are
  // channels you publish on, both run on the same Zernio account. The Service-hub `messaging` tile
  // is the AGENT deep-link and stays as it is; this one opens the management surface, which now
  // lives beside the social accounts on the profile rather than on its own admin-shaped page.
  { id: 'whatsapp', label: 'WhatsApp', path: '/profile?tab=social-accounts&section=whatsapp', icon: MessageCircle, moduleSlug: 'messaging', surface: 'app', hub: 'marketing', description: 'Your number, templates, campaigns and the message log.' },
  // SEO & Content — one tile for the whole seo-toolkit; the launcher center lists research/audits +
  // article writing as sections (Content Writer merged in here, no longer a separate tile). Mention
  // Monitoring is nested under Social Media (see LAUNCHER_SECTIONS) to keep the Marketing list lean.
  { id: 'seo', label: 'SEO & Content', path: '/agent-hub?capability=seo-research', icon: TrendingUp, requireCapability: 'agent.use', moduleSlug: 'seo-toolkit', surface: 'app', hub: 'marketing', description: 'Keyword research, audits & SEO article writing — in the AI studio.' },
  // Mention Monitoring. The dashboard has always existed; the launcher only ever offered the AGENT
  // deep-link, nested under Social Media, so the page itself was unreachable from the menu.
  // `requireRole: 'admin'` mirrors the route's own `requireWorkspaceAdmin`. Deliberately NO
  // moduleSlug: the `mention-monitoring` row in `modules` is `enabled = false`, and
  // get_workspace_module_access only returns published modules — gating on it would hide the tile
  // from everyone, root workspace included. Add the slug here the day the module is published.
  { id: 'mention-monitoring', label: 'Mention Monitoring', path: '/mention-monitoring', icon: Radar, requireRole: 'admin', surface: 'app', hub: 'marketing', description: 'Track where your brand is mentioned across the web.' },
  // Page Monitoring (#331) — watch a non-product page and report the diff. Shipped with NO surface
  // linking it at all; the route existed and the only way in was typing the URL. Carries no module
  // and no capability of its own, so it is gated like the other workspace-scoped tools: nesting it
  // under a paid tile would hide it behind an add-on it does not need.
  { id: 'page-monitoring', label: 'Page Monitoring', path: '/monitoring/pages', icon: FileSearch, surface: 'app', hub: 'marketing', description: 'Watch any page — a supplier price list, a competitor spec — and see what changed.' },
  // Platform-wide buyer demand. Per-supplier analytics are NOT here — they live on the CRM
  // company's Market tab, keyed on brand_company_id (#350). The old 'factory' role gate went with
  // them: it resolved from user_profiles.factory_verified, which no account has ever held, so this
  // tile rendered for nobody.
  {
    id: 'market-trends',
    label: 'Market Trends',
    path: '/market-trends',
    icon: BarChart3,
    requireRole: 'admin',
    surface: 'app',
    hub: 'sales',
    description: 'What buyers search for, save and quote across the platform.',
  },
  // Templates (#322) — one library for every record type: invoices, quotes, projects, moodboards,
  // plus link-outs to the template systems that have their own editors. No `hub` on purpose: it is
  // not a business module, it cuts across all of them, so it belongs in the launcher's catch-all
  // "More" group. No capability gate either — every persona that can create a record can reuse one.
  {
    id: 'templates',
    label: 'Templates',
    path: '/templates',
    icon: Layers,
    surface: 'app',
    description: 'Reusable starting points for invoices, quotes, projects and moodboards.',
  },
  // SEO Module — the workspace's connected WEBSITES and each site's own SEO dashboard
  // (articles, keyword research, toolkit runs, domain audits). That surface lives on the profile
  // (Profile → Websites), so it had no launcher presence at all: the only way in was the profile
  // menu. Deliberately NO `hub` — it is the management/setup half of SEO, not the agent tile that
  // already sits in Marketing ('seo'), so it belongs in the catch-all "More" group beside Templates
  // and Blueprints. No moduleSlug and no capability either: the tab itself is ungated (any signed-in
  // member can connect a site), and gating the tile on `seo-toolkit` would hide a surface the page
  // still lets them open — and list it as an add-on to buy for something already free.
  {
    id: 'seo-websites',
    label: 'SEO Module',
    path: '/profile?tab=websites',
    icon: Globe,
    surface: 'app',
    description: 'Connect a website and open its SEO dashboard — articles, keywords, audits and Search Console.',
  },
  // Supplier portal lives under Finance → Payables /
  // Profile → Supplier Portal. Admin moved to the profile menu (operator-only). Network is on the
  // workspace switcher.
];

/** Context the nav gates resolve against. Computed from hooks by the consuming component. */
export interface NavGateContext {
  isAdmin: boolean;
  /** Active workspace supplies products (`workspaces.can_supply_products`). */
  isSupplierWorkspace: boolean;
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
    // Scoped invited roles see a focused subset only. The subset narrows what CAN show —
    // it does not bypass the gates below, so a paid module (Finance, Quotes, Real Estate)
    // still hides when the workspace isn't entitled to it (#212).
    if (ctx.isAccountant && item.id !== 'dashboard' && item.id !== 'finance') return false;
    // The Sales portal itself MUST be in this subset: `sales.portal` is held by no other persona,
    // so omitting it here made the "Sales" entry unreachable for everyone — reps landed on /sales
    // only via the Index redirect and had no way back to it.
    if (ctx.isSalesRep && item.id !== 'dashboard' && item.id !== 'sales' && item.id !== 'quotes') return false;
    // Estate Agent: Real Estate surface only (their own listings/leads + open-for-all).
    if (ctx.isRealEstateAgent && item.id !== 'dashboard' && item.id !== 'real-estate') return false;
    if (item.requirePlatform && !ctx.isPlatformOperator) return false;
    if (item.requireRole === 'admin' && !ctx.isAdmin) return false;
    if (item.requireSupplierWorkspace && !ctx.isSupplierWorkspace) return false;
    // Capability gate (the unified persona model — drives end-user restriction).
    if (item.requireCapability && !ctx.can(item.requireCapability)) return false;
    // OR-gate — visible if the persona holds ANY of the listed capabilities.
    if (item.requireAnyCapability && !item.requireAnyCapability.some(ctx.can)) return false;
    // Entitlement gate — hide a paid module unless the active workspace owns it.
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
  'deals',
  'inbox',
  'finance',
  'pos',
  'sales',
  // Scheduling & operations
  'appointments',
  'projects',
  'stock',
  // Design studio
  'moodboard',
  'interior',
  'room-planner',
  'blueprints',
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
  'mention-monitoring',
  'page-monitoring',
  // Cross-cutting
  'templates',
  // Niche / role-specific
  'market-trends',
  'supplier-portal',
];
