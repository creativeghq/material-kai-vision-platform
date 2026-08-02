// App Launcher (three-pane) — the center "inner links" per module + the right-column
// quick-CREATE triggers + jump-to shortcuts. EVERY path is a real route or a ?tab= value copied
// DIRECTLY from the target page's own <TabsTrigger> list (verified 2026-07-18) — never guessed.
// Only ALWAYS-available tabs are listed; role/BYOK-gated tabs are omitted so a link never lands on
// a blank tab. Modules with no URL-backed tabs (Projects, Sales, Inbox, Automations) intentionally
// have no sections → the center shows an "Open" card only.
import {
  Users, Contact, Building2, Tags, ArrowDownCircle, ArrowUpCircle, ShoppingCart,
  FileText, Banknote, BarChart3, Plane, CalendarDays, Clock, Briefcase, Wallet,
  FolderOpen, Send, Settings, UserPlus, Receipt, FilePlus, FolderPlus,
  MessageSquarePlus, Megaphone, LayoutTemplate,
  Boxes, TrendingUp, Ship, Truck, ArrowLeftRight, ClipboardList,
  Calculator, Flame, Thermometer,
  Radar, Search, PenTool,
  Wand2, Lightbulb, ListChecks, PauseCircle, Workflow,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export interface LauncherSection {
  label: string;
  /** Real route or ?tab= deep-link whose value matches the page's own TabsTrigger. */
  to: string;
  icon: LucideIcon;
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
  'real-estate': [
    { label: 'Listings', to: '/properties?tab=listings', icon: Building2 },
    { label: 'Pipeline', to: '/properties?tab=pipeline', icon: ClipboardList },
    { label: 'Leads', to: '/properties?tab=leads', icon: Contact },
    { label: 'Buyers', to: '/properties?tab=buyers', icon: Users },
    { label: 'Viewings', to: '/properties?tab=viewings', icon: CalendarDays },
    { label: 'Sales', to: '/properties?tab=sales', icon: Banknote },
    { label: 'Property Mgmt', to: '/properties?tab=lettings', icon: FolderOpen },
    { label: 'Investments', to: '/properties?tab=investments', icon: BarChart3 },
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
    { label: 'Orders', to: '/finance?tab=doc_orders', icon: ShoppingCart },
    { label: 'Invoices', to: '/finance?tab=doc_invoices', icon: FileText },
    { label: 'Payments', to: '/finance?tab=doc_payments', icon: Banknote },
    { label: 'Reports', to: '/finance?tab=reports', icon: BarChart3 },
    { label: 'Customers & Suppliers', to: '/finance?tab=parties', icon: Users },
    { label: 'Expense cards', to: '/finance?tab=trip_cards', icon: Plane },
  ],
  hr: [
    { label: 'Employees', to: '/hr?tab=employees', icon: Users },
    { label: 'Time Off', to: '/hr?tab=timeoff', icon: CalendarDays },
    { label: 'Attendance', to: '/hr?tab=attendance', icon: Clock },
    { label: 'Jobs & Applicants', to: '/hr?tab=recruitment', icon: Briefcase },
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
  // Quotes (nav id 'quotes', route /quotes). The list is the Open target; Price Monitoring is nested
  // here as an agent deep-link (folded in from a standalone tile to keep the Sales list lean).
  quotes: [
    { label: 'Price monitoring', to: '/agent-hub?capability=price-monitoring', icon: TrendingUp },
  ],
  // Social Media (agent app). Mention Monitoring is nested here (folded in from a standalone tile).
  social: [
    { label: 'Mention monitoring', to: '/agent-hub?capability=mention-monitoring', icon: Radar },
  ],
  // SEO & Content (agent app, seo-toolkit). One tile for both research and article writing —
  // Content Writer merged in here as a section instead of a separate tile.
  seo: [
    { label: 'Keyword research', to: '/agent-hub?capability=seo-research', icon: Search },
    { label: 'Write an article', to: '/agent-hub?capability=seo-article', icon: PenTool },
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
  // Sales/Inbox have no URL tabs → Open-only. My HR is Open-only too: EmployeeSelfServicePage uses
  // Tabs `defaultValue` and never reads ?tab=, so a tab deep-link would be inert.
};

// Right-column context-aware quick-CREATE triggers, keyed by SidebarNavItem.id. Each `to` carries a
// ?new= param that the target PAGE reads to open its real create modal/route (wired 2026-07-18):
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
};

/** Right-column "Jump to" — a few high-value shortcuts across the workspace. All real routes. */
export const LAUNCHER_SHORTCUTS: LauncherSection[] = [
  { label: 'Quotes', to: '/quotes', icon: FileText },
  { label: 'Orders', to: '/finance?tab=doc_orders', icon: ShoppingCart },
  { label: 'Contacts', to: '/crm?tab=contacts', icon: Contact },
];
