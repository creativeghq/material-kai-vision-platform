// #251 App Launcher (three-pane) — the center "inner links" per module + the right-column
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
  Sparkles, Calculator, Flame, Thermometer, PencilRuler,
  Radar, Search, PenTool,
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
  // high-value work is the AI presentation sheets — surface them as agent deep-links so a click
  // opens the studio primed on the presentation-sheets toolkit (9 sheet types) instead of hunting
  // for the per-board Sheets tab. (#275 — sheets are an agent capability, not a page tab.)
  moodboard: [
    { label: 'Presentation sheets', to: '/agent-hub?capability=presentation-sheet', icon: LayoutTemplate },
    { label: 'Design breakdown', to: '/agent-hub?capability=presentation-sheet', icon: PencilRuler },
    { label: 'Interior studio', to: '/agent-hub?capability=interior', icon: Sparkles },
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
  // here as an agent deep-link (#275 — folded in from a standalone tile to keep the Sales list lean).
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
  // Sales/Inbox/Automations have no URL tabs → Open-only.
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
};

/** Right-column "Jump to" — a few high-value shortcuts across the workspace. All real routes. */
export const LAUNCHER_SHORTCUTS: LauncherSection[] = [
  { label: 'Quotes', to: '/quotes', icon: FileText },
  { label: 'Orders', to: '/finance?tab=doc_orders', icon: ShoppingCart },
  { label: 'Contacts', to: '/crm?tab=contacts', icon: Contact },
];
