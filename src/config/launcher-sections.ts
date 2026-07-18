// #251 App Launcher (three-pane) — the center "inner links" for each module and the right-column
// jump-to shortcuts. EVERY path here is a route or ?tab= deep-link that is ALREADY used as a
// navigation target elsewhere in the app (verified 2026-07-18) — nothing is invented. A module
// that is absent from LAUNCHER_SECTIONS intentionally renders an "Open" card only; it has no
// verified sub-tab deep-link yet. Add a row the moment a module gains a real ?tab= target — never
// guess a path, or the launcher ships dead links.
import {
  ShoppingCart, Receipt, Contact, Briefcase, FolderTree, FileText,
  Users, CalendarClock, CalendarX, LayoutTemplate, UserPlus, Building2, FilePlus,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export interface LauncherSection {
  label: string;
  /** Real route or ?tab= deep-link. */
  to: string;
  icon: LucideIcon;
}

/** Keyed by SidebarNavItem.id (=== LauncherApp.id). */
export const LAUNCHER_SECTIONS: Record<string, LauncherSection[]> = {
  finance: [
    { label: 'Orders', to: '/finance?tab=orders', icon: ShoppingCart },
    { label: 'Documents', to: '/finance?tab=doc', icon: Receipt },
    { label: 'Customers & Suppliers', to: '/finance?tab=parties', icon: Contact },
    { label: 'Trip Expenses', to: '/finance?tab=trip', icon: Briefcase },
  ],
  crm: [
    { label: 'Categories', to: '/crm?tab=categories', icon: FolderTree },
  ],
  quotes: [
    { label: 'Requests', to: '/quotes?tab=requests', icon: FileText },
  ],
  hr: [
    { label: 'Employees', to: '/hr?tab=employees', icon: Users },
    { label: 'Absences', to: '/hr?tab=absences', icon: CalendarX },
    { label: 'Attendance', to: '/hr?tab=attendance', icon: CalendarClock },
    { label: 'Recruitment', to: '/hr?tab=recruitment', icon: Briefcase },
  ],
  'email-marketing': [
    { label: 'Templates', to: '/marketing/email?tab=templates', icon: LayoutTemplate },
  ],
};

// Right-column context-aware quick-CREATE triggers, keyed by SidebarNavItem.id. Each `to` carries a
// ?new= param that the target PAGE reads to open its real create modal/route (wired 2026-07-18):
//   /crm?new=contact → contacts/new · /crm?new=company → AddCompanyModal
//   /finance?new=invoice → New Invoice modal · /finance?tab=orders&new=order → New (sales) order
//   /quotes?new=quote → Create Quote modal
// Add a row ONLY after wiring the matching ?new= handler on the page — an unwired trigger is inert.
export const LAUNCHER_ACTIONS: Record<string, LauncherSection[]> = {
  crm: [
    { label: 'New Contact', to: '/crm?new=contact', icon: UserPlus },
    { label: 'New Company', to: '/crm?new=company', icon: Building2 },
  ],
  finance: [
    { label: 'New Invoice', to: '/finance?new=invoice', icon: Receipt },
    { label: 'New Order', to: '/finance?tab=orders&new=order', icon: ShoppingCart },
  ],
  quotes: [
    { label: 'New Quote', to: '/quotes?new=quote', icon: FilePlus },
  ],
};

/** Right-column "Jump to" — a few high-value shortcuts across the workspace. All real routes. */
export const LAUNCHER_SHORTCUTS: LauncherSection[] = [
  { label: 'Quotes', to: '/quotes', icon: FileText },
  { label: 'Orders', to: '/finance?tab=orders', icon: ShoppingCart },
  { label: 'Contacts', to: '/crm', icon: Contact },
];
