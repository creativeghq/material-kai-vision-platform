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
  Grid3x3,
  DraftingCompass,
  Handshake,
  FileSearch,
  Radar,
  ScanLine,
  Store,
  Globe,
  UserPlus,
  Bell,
  Mail,
  Radio,
  LayoutDashboard,
  Plug,
  BookText,
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
export type HubId = 'marketing' | 'sales' | 'projects' | 'finance' | 'service' | 'studio' | 'people' | 'operator';

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
  { id: 'sales', label: 'Sales Hub', icon: Briefcase, description: 'CRM, quotes, appointments, properties & market demand.' },
  { id: 'projects', label: 'Projects Hub', icon: FolderKanban, description: 'Jobs, tasks, schedules, site work, costs and blueprints.' },
  { id: 'finance', label: 'Finance Hub', icon: Wallet, description: 'Invoices, payments, reporting & warehouse.' },
  { id: 'service', label: 'Service Hub', icon: Headset, description: 'Customer conversations, reviews & knowledge base.' },
  { id: 'studio', label: 'Studio Hub', icon: Palette, description: 'Moodboards, renders, room planning & client presentations.' },
  { id: 'people', label: 'People Hub', icon: Users, description: 'Employees, absences & HR documents.' },
  { id: 'operator', label: 'Operator Hub', icon: Radio, description: 'Headquarters, platform flows, and push, email and WhatsApp to users and customers.' },
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
  /**
   * Position within its launcher group. Lower sorts first; ties fall back to the
   * alphabetical order every tile used before this existed, so an unset value is
   * exactly today's behaviour. Only set it where the alphabet gets the reading
   * order wrong.
   */
  launcherOrder?: number;
  hub?: HubId;
  /**
   * Where the item renders (App Launcher IA):
   * - `'top'` (default) → the lean top nav bar (universal surfaces).
   * - `'app'` → the workspace **App Launcher**, alongside optional modules.
   *   Keeps the top bar uncluttered as the platform grows to many modules. Routes/guards
   *   are unchanged — only the entry point moves.
   */
  surface?: 'top' | 'app';
  /** An `'app'` item that is ALSO pinned to the top bar; it stays in its launcher hub. */
  pinTopBar?: boolean;
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
  { id: 'shared', label: 'Shared with Me', path: '/shared', icon: Share2, surface: 'app', description: 'Projects, properties and moodboards someone has given you access to.' },
  { id: 'agent-hub', label: 'Agent Hub', path: '/agent-hub', icon: MessageSquare },
  { id: 'discover', label: 'Discover', path: '/discover', icon: Users, requireAnyCapability: PRODUCT_BROWSE_ANY },

  // ── App Launcher (surface:'app'): entitle-able business modules, off the top bar,
  //    grouped into Hubs via the `hub` field. ──
  // Multi-tenant inbox (directional messaging + WhatsApp channel + agent takeover P2).
  { id: 'inbox', label: 'Inbox', path: '/inbox', icon: Inbox, requireCapability: 'inbox.use', moduleSlug: 'inbox', surface: 'app', pinTopBar: true, hub: 'service', description: 'Shared inbox for customer conversations.' },
  { id: 'messaging', label: 'WhatsApp', path: '/profile?tab=social-accounts&section=whatsapp', icon: MessageCircle, moduleSlug: 'messaging', surface: 'app', hub: 'service', description: 'Your number, templates, campaigns and the message log.' },
  { id: 'reviews', label: 'Reviews', path: '/profile?tab=reviews', icon: Star, moduleSlug: 'reviews', surface: 'app', hub: 'service', description: 'Reviews about you, and your replies.' },
  { id: 'projects', label: 'Projects', path: '/projects', icon: FolderKanban, moduleSlug: 'projects', surface: 'app', hub: 'projects', description: 'Run jobs end to end: tasks, schedule, site, costs, visits and team.' },
  { id: 'moodboard', label: 'MoodBoards', path: '/moodboard', icon: Palette, surface: 'app', hub: 'studio', description: 'Curate materials and design inspiration.' },
  // Interior Design is agent-first (the Vision agent + generation toolkit on the canvas), so the
  // Studio Hub entry deep-links into the Agent Hub with Vision pre-selected rather than a static page.
  { id: 'interior', label: 'Interior Design', path: '/agent-hub?capability=interior', icon: Sofa, surface: 'app', hub: 'studio', description: 'Design, render & stage rooms with the AI studio.' },
  { id: 'room-planner', label: 'Room Planner', path: '/room-planner', icon: Ruler, surface: 'app', hub: 'studio', description: 'Arrange catalog products on a floor plan, at their real size.' },
  { id: 'surface-visualizer', label: 'Surface Visualizer', path: '/visualizer', icon: Grid3x3, surface: 'app', hub: 'studio', description: 'A tile, stone or floor on a room photo, at its real size — drawn in the browser.' },
  { id: 'blueprints', label: 'Blueprints', path: '/blueprints', icon: DraftingCompass, surface: 'app', hub: 'projects', description: 'Reusable room and scope templates that price a project in one click.' },
  { id: 'installation-guides', label: 'Installation Guides', path: '/guides', icon: BookOpen, moduleSlug: 'installation-guides', surface: 'app', hub: 'projects', description: 'Upload a supplier manual and watch it put together, step by step, in 3D.' },
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
  { id: 'appointments', label: 'Appointments', path: '/agent-hub?capability=appointments', icon: CalendarClock, requireCapability: 'agent.use', moduleSlug: 'crm', surface: 'app', hub: 'sales', description: 'List & schedule appointments with reminders — in the AI studio.' },
  // Deals & Pipeline. Lives on /crm?tab=pipeline (one deal object across CRM and Real Estate,
  // segmented by deal type), but it is a paid add-on of its own and a daily sales surface, so it
  // gets a Sales tile rather than staying a chip on the CRM card where it read as a CRM sub-view.
  // Both gates are real: `crm.view` because it is a CRM tab, `deals` because that is what is sold.
  { id: 'deals', label: 'Deals', path: '/crm?tab=pipeline', icon: Handshake, requireCapability: 'crm.view', moduleSlug: 'deals', surface: 'app', hub: 'sales', description: 'Track opportunities from first contact to won.' },
  // Real Estate module: appears only when the workspace is entitled to 'real-estate' AND the
  // persona holds realestate.view (owner/admin at P0; P1 adds the scoped realestate_agent persona).
  { id: 'real-estate', label: 'Real Estate', path: '/properties', icon: Building2, requireCapability: 'realestate.view', moduleSlug: 'real-estate', surface: 'app', hub: 'sales', description: 'List, manage and publish properties.' },
  // Registry modules given a hub. Commerce Core is granted by any channel module; each channel is a chip.
  { id: 'commerce', label: 'Sales Channels', path: '/commerce', icon: Plug, moduleSlug: 'commerce-core', surface: 'app', hub: 'sales', description: 'Shopify, WooCommerce and Skroutz: connections, inbound orders and the documents issued for them.' },
  { id: 'docs', label: 'Docs', path: '/docs', icon: BookText, moduleSlug: 'docs', surface: 'app', hub: 'service', description: 'Internal team documentation the agent can search.' },
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
  { id: 'supplier-portal', label: 'Supplier Portal', path: '/supplier-portal', icon: Store, requireSupplierWorkspace: true, surface: 'app', hub: 'finance', description: 'Purchase orders sent to you as a claimed supplier — confirm and mark shipped.' },
  { id: 'page-monitoring', label: 'Page Monitoring', path: '/monitoring/pages', icon: FileSearch, surface: 'app', hub: 'finance', description: 'Watch a page you do not control — a supplier price list, a competitor spec — and see what changed.' },
  // Signals (#462): one page, one entry per module, so each kind appears only where it is held.
  { id: 'signals-hiring', label: 'Hiring Signals', path: '/signals?tab=explore&kind=hiring', icon: UserPlus, requireCapability: 'crm.view', moduleSlug: 'signals-hiring', surface: 'app', hub: 'marketing', description: 'Companies that start hiring for a role or skill, from their own job boards.' },
  { id: 'signals-technographics', label: 'Technology Signals', path: '/signals?tab=explore&kind=technology', icon: Layers, requireCapability: 'crm.view', moduleSlug: 'signals-technographics', surface: 'app', hub: 'marketing', description: 'Who runs which ERP, e-commerce, CAD/BIM or marketing stack.' },
  { id: 'signals-intent', label: 'Intent Signals', path: '/signals?tab=explore&kind=intent', icon: Radar, requireCapability: 'crm.view', moduleSlug: 'signals-intent', surface: 'app', hub: 'marketing', description: 'Companies whose hiring says they are in market for a use case.' },
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
  { id: 'seo', label: 'SEO & Content', path: '/agent-hub?capability=seo-research', icon: TrendingUp, requireCapability: 'agent.use', moduleSlug: 'seo-toolkit', surface: 'app', hub: 'marketing', description: 'Keyword research, audits & SEO article writing — in the AI studio.' },
  // Mention Monitoring. The dashboard has always existed; the launcher only ever offered the AGENT
  // deep-link, nested under Social Media, so the page itself was unreachable from the menu.
  // `requireRole: 'admin'` mirrors the route's own `requireWorkspaceAdmin`. Deliberately NO
  // moduleSlug: the `mention-monitoring` row in `modules` is `enabled = false`, and
  // get_workspace_module_access only returns published modules — gating on it would hide the tile
  // from everyone, root workspace included. Add the slug here the day the module is published.
  { id: 'mention-monitoring', label: 'Mention Monitoring', path: '/mention-monitoring', icon: Radar, requireRole: 'admin', surface: 'app', hub: 'marketing', description: 'Track where your brand is mentioned across the web.' },
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
  // and Blueprints.
  {
    id: 'seo-websites',
    label: 'SEO Module',
    path: '/profile?tab=websites',
    icon: Globe,
    surface: 'app',
    // Reads last in "More": Blueprints, Docs, Templates are workspace primitives,
    // this is a whole product surface and belongs at the end rather than wedged
    // between Docs and Templates by the alphabet.
    launcherOrder: 10,
    description: 'Connect a website and open its SEO dashboard — articles, keywords, audits and Search Console.',
  },
  // Operator Hub. Headquarters' chips are DERIVED from ADMIN_NAV (launcher-sections.ts), so every
  // HQ area is in this menu without a second list.
  { id: 'operator-hq', label: 'Headquarters', path: '/admin', icon: LayoutDashboard, requirePlatform: true, surface: 'app', hub: 'operator', launcherOrder: -10, description: 'Agents, data pipeline, operations and platform settings.' },
  { id: 'operator-flows', label: 'Platform Flows', path: '/flows', icon: Workflow, requirePlatform: true, surface: 'app', hub: 'operator', description: 'The default notification and automation flows every workspace receives.' },
  { id: 'push-notifications', label: 'Push Notifications', path: '/push-notifications', icon: Bell, requirePlatform: true, surface: 'app', hub: 'operator', description: 'Broadcast a push notification to platform users.' },
  { id: 'operator-emails', label: 'Emails', path: '/emails', icon: Mail, requirePlatform: true, surface: 'app', hub: 'operator', description: 'Platform email: sending domains, templates, campaigns and the delivery log.' },
  { id: 'operator-whatsapp', label: 'WhatsApp Campaigns', path: '/messaging', icon: MessageCircle, requirePlatform: true, surface: 'app', hub: 'operator', description: 'Platform WhatsApp: channels, templates, campaigns and opt-outs.' },
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
  isGuest: boolean;
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
    if (ctx.isGuest && item.id !== 'dashboard' && item.id !== 'shared') return false;
    if (item.id === 'shared' && !ctx.isGuest) return false;
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
 * Importance ranking that decides which destinations get a cell in the mobile BOTTOM BAR.
 * MobileBottomNav sorts every gated item by this list and the first BAR_SLOTS (4) entitled entries
 * fill the bar; everything else is reached through the fifth cell, Apps, which opens the mobile
 * Apps panel (MobileAppsMenu). That panel is grouped by Hub exactly like the desktop launcher and
 * does NOT read this list, so ranking only matters for who makes the bar.
 */
export const BOTTOM_NAV_PRIORITY: readonly string[] = [
  // Everyday drivers — these fill the visible bottom bar (top 4 entitled)
  'dashboard',
  'shared',
  'agent-hub',
  'inbox',
  'quotes',
  // Customers & revenue
  'crm',
  'deals',
  'discover',
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
  'surface-visualizer',
  'blueprints',
  'installation-guides',
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
  'seo-websites',
  'automations',
  'mention-monitoring',
  // Cross-cutting
  'templates',
  // Niche / role-specific
  'market-trends',
  'supplier-portal',
  // Sits with the supplier surfaces rather than under Marketing, matching its Hub — what it
  // actually watches is a supplier's terms page, and it is niche enough never to earn a slot
  // in the visible bottom four.
  'page-monitoring',
  'signals-hiring',
  'signals-technographics',
  'signals-intent',
  'operator-hq',
  'operator-flows',
  'push-notifications',
  'commerce',
  'docs',
  'operator-emails',
  'operator-whatsapp',
];
