// App Launcher (three-pane) — the center "inner links" per module + the right-column
// quick-CREATE triggers + jump-to shortcuts. EVERY path is a real route or a ?tab= value copied
// DIRECTLY from the target page's own <TabsTrigger> list — never guessed.
// Only ALWAYS-available tabs are listed; role-, module- and BYOK-gated tabs are omitted so a link
// never lands on a blank tab or an upsell. Sales and Inbox have no URL-backed tabs and no nested
// surface → the center shows an "Open" card only.
//
// A ?tab= key here that names NO pane is caught — tests/unit/deepLinkTargets.test.ts resolves every
// one against the target page. Two failure modes it cannot see, because both produce a link that
// resolves perfectly:
//   • a tab that EXISTS but is listed nowhere here — a gap, not a break. Finance's bank feed and HR's
//     schedules/overtime/onboarding each shipped a month before anything in the launcher named them.
//   • a link to a tab that renders behind a padlock. It resolves, so the guard passes; the click
//     just lands the user on an upsell (see the real-estate and CRM notes below).
// Neither is machine-checkable cheaply, so re-read the target page's TabsTrigger list by hand
// whenever you touch its tabs.
import {
  Users, Contact, Building2, Tags, ArrowDownCircle, ArrowUpCircle, ShoppingCart,
  FileText, Banknote, BarChart3, Plane, CalendarDays, Clock, Briefcase, Wallet,
  FolderOpen, Send, Settings, UserPlus, Receipt, FilePlus, FolderPlus,
  MessageSquarePlus, Megaphone, LayoutTemplate, Store, Landmark, BellRing,
  CalendarClock, Timer, ClipboardCheck,
  Boxes, TrendingUp, Ship, Truck, ArrowLeftRight, ClipboardList,
  Calculator, Flame, Thermometer,
  Radar, Search, PenTool, Activity,
  Wand2, Lightbulb, ListChecks, PauseCircle, Workflow,
  Share2, Globe, Coins, CreditCard, ScanLine, Star, MessagesSquare,
  Link2, FileSearch, Layers, BadgeCheck, Bot,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { HubId } from './nav-items';
import { PRODUCT_BROWSE_ANY, type Capability } from '@/auth/capabilities';
// A filtered list is spelled ONE way. Hand-writing `?f={"source":…}` here is a URL every router
// resolves and the Inbox reads as "no filter" — the exact silent shape filterUrl exists to stop.
import { filterUrl } from '@/components/core/filters/filterUrl';

export interface LauncherSection {
  label: string;
  /** Real route or ?tab= deep-link whose value matches the page's own TabsTrigger. */
  to: string;
  icon: LucideIcon;
  /**
   * Entitlement gate for a tab that sits behind a SEPARATE add-on from the app card it hangs under
   * (Real Estate's Property Mgmt / Investments, CRM's Pipeline). The launcher hides the chip unless
   * the workspace owns the slug, so the link never lands on an upsell — and, just as importantly,
   * a workspace that DOES own the add-on still gets the shortcut. Omitting these entries outright
   * was the older answer, and it punished exactly the customers who had paid for them.
   */
  moduleSlug?: string;
  /**
   * Capability gate, same shape as a nav item's `requireAnyCapability`. A `moduleSlug` answers
   * "has this workspace bought it"; this answers "may this PERSON open it", which is a different
   * question and the one a `CapabilityGuard` on the route asks. Without it a shortcut to a guarded
   * route resolves perfectly and then renders an access-denied page — a live link to a wall.
   */
  requireAnyCapability?: Capability[];
  /**
   * Mirrors a route's `requireWorkspaceAdmin`. Entitlement says the workspace BOUGHT the module,
   * which every member shares; this says the person may rewire it. Channels, campaign senders and
   * the workspace-wide social account list all sit behind WorkspaceAdminGuard, so offering them
   * to a plain member is a live link to a wall.
   */
  requireWorkspaceAdmin?: boolean;
}

/**
 * Center-pane sections, keyed by SidebarNavItem.id (=== LauncherApp.id).
 * Tab values are the exact `<TabsTrigger value>` strings on each module's landing page:
 *   CRM      (src/modules/crm/pages/CRMPage.tsx)            → users | contacts | companies | categories
 *   Finance  (src/pages/Admin/FinancePage.tsx)             → ar | ap | doc_orders | doc_invoices |
 *                                                            doc_payments | reports | parties | trip_cards
 *   HR       (src/modules/hr/pages/HRPage.tsx)             → employees | timeoff | attendance |
 *                                                            recruitment | payroll | documents
 *   Email    (src/modules/email-marketing/pages/…Page.tsx) → campaigns | templates | contacts | setup
 */
export const LAUNCHER_SECTIONS: Record<string, LauncherSection[]> = {
  // Property Mgmt and Investments carry their own add-on slug — shown to a workspace that owns
  // them, hidden from one that doesn't. Syndication is `canManage`-gated (a role, not a purchase,
  // so there is no slug to hang it on) and Overview is the landing tab "Open" already reaches.
  'real-estate': [
    { label: 'Listings', to: '/properties?tab=listings', icon: Building2 },
    { label: 'Pipeline', to: '/properties?tab=pipeline', icon: ClipboardList },
    { label: 'Leads', to: '/properties?tab=leads', icon: Contact },
    { label: 'Buyers', to: '/properties?tab=buyers', icon: Users },
    { label: 'Sellers', to: '/properties?tab=sellers', icon: Store },
    { label: 'Viewings', to: '/properties?tab=viewings', icon: CalendarDays },
    { label: 'Sales', to: '/properties?tab=sales', icon: Banknote },
    { label: 'Property Mgmt', to: '/properties?tab=lettings', icon: FolderOpen, moduleSlug: 'real-estate-management' },
    { label: 'Investments', to: '/properties?tab=investments', icon: BarChart3, moduleSlug: 'real-estate-investments' },
  ],
  crm: [
    { label: 'Users', to: '/crm?tab=users', icon: Users },
    { label: 'Contacts', to: '/crm?tab=contacts', icon: Contact },
    { label: 'Companies', to: '/crm?tab=companies', icon: Building2 },
    { label: 'Categories', to: '/crm?tab=categories', icon: Tags },
  ],
  finance: [
    { label: 'Receivables', to: '/finance?tab=ar', icon: ArrowDownCircle },
    { label: 'Payables', to: '/finance?tab=ap', icon: ArrowUpCircle },
    // The Revolut bank feed shipped with no launcher presence at all — reconciliation is a daily
    // surface and the only way in was the Finance sidebar. `bank_feed` is ungated (the BYOK
    // connection prompt lives inside the tab, so it is never blank).
    { label: 'Bank feed', to: '/finance?tab=bank_feed', icon: Landmark },
    { label: 'Orders', to: '/finance?tab=doc_orders', icon: ShoppingCart },
    { label: 'Invoices', to: '/finance?tab=doc_invoices', icon: FileText },
    { label: 'Payments', to: '/finance?tab=doc_payments', icon: Banknote },
    { label: 'Follow-ups', to: '/finance?tab=followups', icon: BellRing },
    { label: 'Reports', to: '/finance?tab=reports', icon: BarChart3 },
    { label: 'Customers & Suppliers', to: '/finance?tab=parties', icon: Users },
    { label: 'Expense cards', to: '/finance?tab=trip_cards', icon: Plane },
  ],
  hr: [
    { label: 'Employees', to: '/hr?tab=employees', icon: Users },
    { label: 'Time Off', to: '/hr?tab=timeoff', icon: CalendarDays },
    { label: 'Attendance', to: '/hr?tab=attendance', icon: Clock },
    { label: 'Schedules', to: '/hr?tab=schedules', icon: CalendarClock },
    { label: 'Overtime', to: '/hr?tab=overtime', icon: Timer },
    { label: 'Jobs & Applicants', to: '/hr?tab=recruitment', icon: Briefcase },
    { label: 'Onboarding', to: '/hr?tab=onboarding', icon: ClipboardCheck },
    { label: 'Payroll', to: '/hr?tab=payroll', icon: Wallet },
    { label: 'Documents', to: '/hr?tab=documents', icon: FolderOpen },
  ],
  'email-marketing': [
    { label: 'Campaigns', to: '/marketing/email?tab=campaigns', icon: Send },
    { label: 'Templates', to: '/marketing/email?tab=templates', icon: FileText },
    { label: 'Contacts', to: '/marketing/email?tab=contacts', icon: Users },
    { label: 'Setup', to: '/marketing/email?tab=setup', icon: Settings },
  ],
  // Warehouse (nav id 'stock', route /warehouse) — src/modules/stock/pages/StockPage.tsx tabs:
  // overview | inventory | resupply | inbound | dispatch | movements | counts (URL-backed + validated).
  stock: [
    { label: 'Inventory', to: '/warehouse?tab=inventory', icon: Boxes },
    { label: 'Resupply', to: '/warehouse?tab=resupply', icon: TrendingUp },
    { label: 'Inbound', to: '/warehouse?tab=inbound', icon: Ship },
    { label: 'Dispatch', to: '/warehouse?tab=dispatch', icon: Truck },
    { label: 'Movements', to: '/warehouse?tab=movements', icon: ArrowLeftRight },
    { label: 'Stock counts', to: '/warehouse?tab=counts', icon: ClipboardList },
  ],
  // MoodBoards (nav id 'moodboard', route /moodboard). The board list is the Open target; the
  // high-value work is the AI presentation sheets — surface them as ONE agent deep-link so a click
  // opens the studio primed on the presentation-sheets toolkit (its picker offers all 9 sheet types,
  // incl. the "design breakdown" board) instead of hunting for the per-board Sheets tab.
  // (sheets are an agent capability, not a page tab.) Deliberately a single entry:
  // "Design breakdown" pointed at the same URL (a sheet TYPE, not a separate action), and
  // "Interior studio" duplicated the top-level Interior Design app — both removed as redundant.
  moodboard: [
    { label: 'Presentation sheets', to: '/agent-hub?capability=presentation-sheet', icon: LayoutTemplate },
  ],
  // Projects (nav id 'projects', route /projects). No URL tabs on the page, but the module owns
  // real agent + calculator capabilities that were invisible in the menu: the purchase-sheet builder
  // (agent) and the three estimators (real pages under /tools). Surface them here.
  projects: [
    { label: 'Purchase sheet', to: '/agent-hub?capability=project', icon: ClipboardList },
    { label: 'Project estimator', to: '/tools/project-plan', icon: Calculator },
    { label: 'Heat-pump sizer', to: '/tools/heat-pump', icon: Flame },
    { label: 'Heating cost compare', to: '/tools/heating-cost', icon: Thermometer },
  ],
  // Contracts (nav id 'contracts'). The tile itself deep-links into the agent (drafting +
  // send-for-signature); `/contracts` is the real list page, registered by the contracts module.
  // It used to surface as a SECOND "Contracts" card in the launcher's "More" group — deduped in
  // useLauncherApps, so the list has to be reachable from this card instead.
  contracts: [
    { label: 'All contracts', to: '/contracts', icon: FileText },
  ],
  // Quotes (nav id 'quotes', route /quotes). The list is the Open target; Price Monitoring is nested
  // here as an agent deep-link (folded in from a standalone tile to keep the Sales list lean).
  quotes: [
    { label: 'Price monitoring', to: '/agent-hub?capability=price-monitoring', icon: TrendingUp },
  ],
  // Mention Monitoring now has its own Marketing tile pointing at the DASHBOARD; this is the agent
  // side of the same capability, so it hangs off that tile rather than off Social Media, where it
  // was the only way in and pointed away from the page.
  'mention-monitoring': [
    { label: 'Ask the agent', to: '/agent-hub?capability=mention-monitoring', icon: Radar },
  ],
  // SEO & Content (agent app, seo-toolkit). One tile for both research and article writing —
  // Content Writer merged in here as a section instead of a separate tile.
  seo: [
    { label: 'Keyword research', to: '/agent-hub?capability=seo-research', icon: Search },
    { label: 'Write an article', to: '/agent-hub?capability=seo-article', icon: PenTool },
  ],
  // SEO Module (nav id 'seo-websites', /profile?tab=websites). The tile itself is the connected
  // WEBSITES surface — free, ungated. These chips are the rest of Edith's SEO bench: six toolkit
  // clusters that existed in the picker and were reachable from no menu at all. `?capability=`
  // primes the toolkit and shows its quick-starts without firing one, which is what makes a chip
  // an entry point rather than a spend.
  // Both gates are real, and they are different questions. `seo-toolkit` is the PURCHASE: seo-api
  // refuses a workspace that doesn't own it, so an ungated chip would be a live link to a 402.
  // `agent.use` is the PERSON: these all land in the AI studio.
  // The FIRST chip is deliberately ungated, and that is what gives this tile a card at all.
  // Every other chip needs `seo-toolkit`, so on a workspace without it the launcher found zero
  // links, judged the app "nothing to expand", and promoted it out of the centre column into the
  // Jump-to rail — correct by its own rule, and misleading here, because the surface behind the
  // tile is a seven-tab dashboard that is free. A paid bench should not make a free surface look
  // like a bare link.
  //
  // Keyword research and Write an article ARE repeated from the Marketing 'seo' tile on purpose.
  // The earlier note called that duplication; it is not the kind the rail rule guards against
  // (two CARDS for one app). These are two entry points to one capability from two different
  // starting questions — "market my content" and "manage this website" — and a person in the SEO
  // Module should not have to know the Marketing hub exists to write an article about their site.
  'seo-websites': [
    { label: 'Connected websites', to: '/profile?tab=websites', icon: Globe },
    { label: 'Keyword research', to: '/agent-hub?capability=seo-research', icon: Search, moduleSlug: 'seo-toolkit', requireAnyCapability: ['agent.use'] },
    { label: 'Write an article', to: '/agent-hub?capability=seo-article', icon: PenTool, moduleSlug: 'seo-toolkit', requireAnyCapability: ['agent.use'] },
    { label: 'Domain intel', to: '/agent-hub?capability=seo-domain', icon: Globe, moduleSlug: 'seo-toolkit', requireAnyCapability: ['agent.use'] },
    { label: 'Backlinks', to: '/agent-hub?capability=seo-backlinks', icon: Link2, moduleSlug: 'seo-toolkit', requireAnyCapability: ['agent.use'] },
    { label: 'Content & tech', to: '/agent-hub?capability=seo-content', icon: FileSearch, moduleSlug: 'seo-toolkit', requireAnyCapability: ['agent.use'] },
    { label: 'Beyond Google', to: '/agent-hub?capability=seo-multi-engine', icon: Layers, moduleSlug: 'seo-toolkit', requireAnyCapability: ['agent.use'] },
    { label: 'Full site audit', to: '/agent-hub?capability=seo-composite', icon: BadgeCheck, moduleSlug: 'seo-toolkit', requireAnyCapability: ['agent.use'] },
    { label: 'AI visibility', to: '/agent-hub?capability=ai-visibility', icon: Bot, moduleSlug: 'seo-toolkit', requireAnyCapability: ['agent.use'] },
  ],
  // Image Studio (agent app). Its path uses ?generation_mode= rather than ?capability=, so the
  // launcher's capability-quickstart fallback can't resolve anything → it rendered empty. These
  // deep-link straight into real `generation` toolkit quick-starts via `?quickstart=<toolkit>:<label>`
  // (honored by pages/AgentHub.tsx independently of ?capability=). Labels after the colon MUST match
  // the toolkit quick_start `label` verbatim; the display label here is ours (image-neutral wording).
  'image-studio': [
    { label: 'Edit an image', to: '/agent-hub?capability=image-studio&generation_mode=image-edit&quickstart=generation:Edit%20a%20photo', icon: Wand2 },
    { label: 'Re-light an image', to: '/agent-hub?capability=image-studio&quickstart=generation:Re-light%20a%20room', icon: Lightbulb },
  ],
  // Automations (nav id 'automations', route /automations). The page has no URL tabs and creating a
  // flow is an agent flow (not a page modal), so this surfaces the real `flows-toolkit` quick-starts.
  automations: [
    { label: 'My flows', to: '/agent-hub?capability=flow&quickstart=flows-toolkit:My%20flows', icon: ListChecks },
    { label: 'Pause a flow', to: '/agent-hub?capability=flow&quickstart=flows-toolkit:Pause%20a%20flow', icon: PauseCircle },
  ],
  // Templates (#322). The library filters on ?type=, whose values are the LIVE_TEMPLATE_TYPES keys
  // in src/services/templates/schema.ts — not a tab list. Keep these in step with that array.
  templates: [
    { label: 'Invoices', to: '/templates?type=invoice', icon: Receipt },
    { label: 'Quotes', to: '/templates?type=quote', icon: FilePlus },
    { label: 'Orders', to: '/templates?type=order', icon: ShoppingCart },
    { label: 'Expenses', to: '/templates?type=expense', icon: ArrowUpCircle },
    { label: 'Projects', to: '/templates?type=project', icon: FolderPlus },
    { label: 'Moodboards', to: '/templates?type=moodboard', icon: LayoutTemplate },
    { label: 'Contracts', to: '/templates?type=contract', icon: FileText },
    { label: 'Onboarding', to: '/templates?type=hr_onboarding', icon: ClipboardList },
    { label: 'Listings', to: '/templates?type=property_listing', icon: Building2 },
    { label: 'Customer terms', to: '/templates?type=crm_company', icon: Contact },
  ],
  // Blueprints — the source rail on BlueprintLibraryPage. "All" is what Open reaches, so it is not
  // repeated here. Giving this card sub-picks is also what takes it OUT of the launcher's Jump-to
  // rail: that rail is for apps with nothing to expand, computed from these entries rather than
  // listed by hand, so a card gains chips and leaves the rail in one move.
  blueprints: [
    { label: 'My blueprints', to: '/blueprints?tab=mine', icon: LayoutTemplate },
  ],
  // Market Trends — the four sub-areas of MarketTrendsTab (its MARKET_TABS array).
  'market-trends': [
    { label: 'Demand', to: '/market-trends?tab=demand', icon: TrendingUp },
    { label: 'Discovery', to: '/market-trends?tab=discovery', icon: Search },
    { label: 'Buyers', to: '/market-trends?tab=buyers', icon: Users },
    { label: 'Activity', to: '/market-trends?tab=activity', icon: Activity },
  ],
  // Docs (module registry entry; its launcher id is the module SLUG, not a SIDEBAR_NAV_ITEMS id).
  // The page is a list + editor with no URL tabs, so the useful inner link is the create verb —
  // see LAUNCHER_ACTIONS below. Categories are free text typed per doc, not a fixed vocabulary, so
  // there is nothing stable to list here: a chip per category would be a different menu per
  // workspace and would break the moment someone renamed one.
  // Sales/Inbox have no URL tabs → Open-only. My HR is Open-only too: EmployeeSelfServicePage uses
  // Tabs `defaultValue` and never reads ?tab=, so a tab deep-link would be inert.
};

// Right-column context-aware quick-CREATE triggers, keyed by SidebarNavItem.id. Each `to` carries a
// ?new= param that the target PAGE reads to open its real create modal/route:
//   /crm?new=contact → contacts/new · /crm?new=company → AddCompanyModal
//   /finance?new=invoice → New Invoice modal · /finance?tab=doc_orders&new=order → New (sales) order
//   /quotes?new=quote → Create Quote · /projects?new=project → New Project
//   /sales?new=order → New Order dialog · /inbox?new=conversation → New internal thread
//   /hr?tab=employees&new=employee → Add-employee dialog
//   /marketing/email?new=campaign → Create Campaign · ...?tab=templates&new=template → New Template
// Add a row ONLY after wiring the matching ?new= handler on the page — an unwired trigger is inert.
// (Automations/Flows deliberately omitted: create is a window.prompt + the agent, not a modal.)
export const LAUNCHER_ACTIONS: Record<string, LauncherSection[]> = {
  crm: [
    { label: 'New Contact', to: '/crm?new=contact', icon: UserPlus },
    { label: 'New Company', to: '/crm?new=company', icon: Building2 },
  ],
  finance: [
    { label: 'New Invoice', to: '/finance?new=invoice', icon: Receipt },
    { label: 'New Order', to: '/finance?tab=doc_orders&new=order', icon: ShoppingCart },
  ],
  quotes: [
    { label: 'New Quote', to: '/quotes?new=quote', icon: FilePlus },
  ],
  projects: [
    { label: 'New Project', to: '/projects?new=project', icon: FolderPlus },
  ],
  sales: [
    { label: 'New Order', to: '/sales?new=order', icon: ShoppingCart },
  ],
  inbox: [
    { label: 'New Conversation', to: '/inbox?new=conversation', icon: MessageSquarePlus },
  ],
  hr: [
    { label: 'New Employee', to: '/hr?tab=employees&new=employee', icon: UserPlus },
  ],
  stock: [
    { label: 'New Stocktake', to: '/warehouse?tab=counts&new=count', icon: ClipboardList },
  ],
  'email-marketing': [
    { label: 'New Campaign', to: '/marketing/email?new=campaign', icon: Megaphone },
    { label: 'New Template', to: '/marketing/email?tab=templates&new=template', icon: LayoutTemplate },
  ],
  // Automations has no page create-modal (a flow is built by the agent), so this create trigger is
  // an agent deep-link into the flows-toolkit "Create a flow" quick-start, which opens a real
  // guided form (name / trigger / action) and then runs manage_flows. Wired, not inert.
  automations: [
    { label: 'New automation', to: '/agent-hub?capability=flow&quickstart=flows-toolkit:Create%20a%20flow', icon: Workflow },
  ],
  docs: [
    { label: 'New doc', to: '/docs?new=doc', icon: FilePlus },
  ],
};

/**
 * Right-column "Jump to", PER HUB. The rail follows the Hub selected on the left, so the menu
 * changes as you move through it instead of showing the same three links under every hub.
 *
 * What belongs here is decided by ONE rule: **the middle column must not already offer it.** The
 * centre pane renders every app in the selected hub with all of its sections and create actions, so
 * a rail entry that repeats one of those is pure duplication — the same trap the promoted-apps note
 * in AppLauncher describes, and the reason the rail exists at all. Each entry is therefore a
 * cross-cutting surface the hub's own cards cannot reach: a Profile tab, a public calculator, a
 * template type, a billing page.
 *
 * Guarded by tests/unit/launcherHubShortcuts.test.ts (every hub covered; nothing repeated from that
 * hub's cards), and every `?tab=` value is resolved against its page by tests/unit/deepLinkTargets.
 * Both are cheap; neither can tell you an entry is USEFUL, so pick real destinations by hand.
 */
export const LAUNCHER_HUB_SHORTCUTS: Record<HubId, LauncherSection[]> = {
  // The channels marketing actually has to keep connected, plus the one-off scan that needs no
  // module (the Mention Monitoring tile is the subscribed version of the same capability).
  marketing: [
    { label: 'Social accounts', to: '/profile?tab=social-accounts', icon: Share2 },
    { label: 'My websites', to: '/profile?tab=websites', icon: Globe },
    { label: 'Quick mention scan', to: '/tools/mention-scan', icon: Radar },
  ],
  // What a rep reaches for around a quote but never finds on the Quotes card: the catalog they
  // price from, a saved starting point, and their own trip card.
  sales: [
    // /discover is wrapped in <CapabilityGuard anyOf={PRODUCT_BROWSE_ANY}> — carry the same gate.
    { label: 'Find materials', to: '/discover?tab=products', icon: Search, requireAnyCapability: PRODUCT_BROWSE_ANY },
    { label: 'Quote templates', to: '/templates?type=quote', icon: FilePlus },
    { label: 'My trip expenses', to: '/trip-expenses', icon: Plane },
  ],
  // Finance's own cards cover documents and stock; what they never cover is what the workspace
  // itself is paying for.
  finance: [
    { label: 'Invoice templates', to: '/templates?type=invoice', icon: Receipt },
    { label: 'Credits & top-ups', to: '/billing/credits', icon: Coins },
    { label: 'Subscription', to: '/billing/subscriptions', icon: CreditCard },
  ],
  // Service is three agent surfaces (Inbox / WhatsApp / Reviews); the personal side of the same
  // conversations lives on the profile and is otherwise unreachable from this menu — except
  // profile enquiries, which are now Inbox threads tagged `Public profile` rather than a
  // separate screen, so this points at that filtered view of the one Inbox.
  service: [
    { label: 'Reviews about you', to: '/profile?tab=reviews', icon: Star },
    { label: 'My appointments', to: '/profile?tab=schedule&section=appointments', icon: CalendarDays },
    { label: 'Profile enquiries', to: filterUrl('/inbox', 'f', { source: 'public_profile' }), icon: MessagesSquare },
  ],
  // The Projects card already lists the project / heat-pump / heating estimators, so the kitchen
  // calculator is the one that is missing — plus photo recognition and a board starting point.
  studio: [
    { label: 'Kitchen calculator', to: '/tools/kitchen-cost', icon: Calculator },
    { label: 'Identify a material', to: '/recognition', icon: ScanLine },
    { label: 'Moodboard templates', to: '/templates?type=moodboard', icon: LayoutTemplate },
  ],
  // HR's card is the manager view of everyone; these are the employee's own surfaces.
  people: [
    { label: 'Onboarding templates', to: '/templates?type=hr_onboarding', icon: ClipboardCheck },
    { label: 'My documents', to: '/profile?tab=documents', icon: FolderOpen },
    { label: 'My calendar', to: '/profile?tab=schedule&section=calendar', icon: CalendarDays },
  ],
};

/**
 * Fallback for the catch-all "More" group — apps with no `hub` (Templates, registry modules), which
 * by definition cut across every hub and so have no hub-specific set of their own.
 */
export const LAUNCHER_SHORTCUTS: LauncherSection[] = [
  { label: 'Quotes', to: '/quotes', icon: FileText },
  { label: 'Orders', to: '/finance?tab=doc_orders', icon: ShoppingCart },
  { label: 'Contacts', to: '/crm?tab=contacts', icon: Contact },
];
