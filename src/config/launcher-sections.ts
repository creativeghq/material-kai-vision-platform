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
  // Quotes: only the 'quotes' list tab is always-on (requests/settings are network-manager gated),
  // and that list IS the module's Open target — so no separate sections. Projects/Sales/Inbox/
  // Automations have no URL tabs → Open-only as well.
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
