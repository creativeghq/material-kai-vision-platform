/**
 * Finance's section rail — ONE declaration, read by the page that renders it and by the App
 * Launcher that links into it.
 *
 * It was two. `FinancePage`'s `<TabsList>` held 25 sections; `LAUNCHER_SECTIONS.finance` held a
 * hand-written 10, so the Apps menu offered Receivables, Payables, Bank feed, Orders, Invoices,
 * Payments, Follow-ups, Reports, Customers & Suppliers and Expense Cards — and silently knew
 * nothing about Receipts, Credit Notes, Expenses, By Supplier, Delivery Notes, Cheques, Planning,
 * Assets, Time & Billing, AI Assessment, the myDATA Book, myDATA Transmissions, Sourcing, Settings
 * or the Supplier Portal. Nothing could see it: every link the launcher DID hold resolved
 * perfectly, so `deepLinkTargets.test.ts` passed, and a section that is listed nowhere raises
 * nothing at all — it is simply a part of the app you cannot reach from the menu. The header of
 * `launcher-sections.ts` names this exact failure mode and calls it "a gap, not a break"; this is
 * the half of it that can be closed structurally instead of remembered.
 *
 * So: add a section HERE and both surfaces get it. The rail keeps what only the rail can know —
 * the live counts, the two jump-off buttons above it — and everything that is shared (the key, the
 * label, the icon, the grouping, the accountant gate) lives in this list.
 *
 * Import-free apart from icons and `./routes`, so `src/config/launcher-sections.ts` can read it
 * without dragging the finance service (and through it the Supabase client) into the launcher.
 */
import {
  PieChart, ArrowDownCircle, ArrowUpCircle, Landmark, Truck, ShoppingCart, FileText, Receipt,
  FileMinus, Banknote, FileSignature, Building2, CalendarClock, Plane, Boxes, Clock, Gauge,
  BarChart3, BookOpen, Send, Users, Bell, PackageSearch, Settings,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { FINANCE_TAB } from './routes';

/** Every `?tab=` key Finance renders a pane for. */
export type FinanceTab = typeof FINANCE_TAB[keyof typeof FINANCE_TAB];

/** The document panes `DocumentsView` renders, keyed by its `embeddedType`. */
export type FinanceDocType =
  | 'orders' | 'invoices' | 'receipts' | 'credit_notes' | 'payments'
  | 'expenses' | 'delivery_notes' | 'cheques';

export interface FinanceSection {
  /** The `?tab=` key. Always a `FINANCE_TAB` value — never a string spelled twice. */
  value: FinanceTab;
  label: string;
  icon: LucideIcon;
  /** Heading this entry sits under in the rail and in the launcher. */
  group?: 'documents' | 'tools';
  /**
   * The pane the page opens on. "Open <app>" already lands here, so the launcher does not repeat
   * it as a chip — but the rail still needs the row.
   */
  landing?: boolean;
  /**
   * Hidden from the accountant persona, whose portal is the books and nothing operational. The
   * gate is on the SECTION, so the rail and the launcher apply the same one; a launcher chip an
   * accountant can click into a tab their own page does not render is the shape this avoids.
   */
  hideForAccountant?: boolean;
  /** A live count the rail appends to the label. The launcher has no counts and ignores it. */
  count?: 'ar' | 'ap' | 'followups';
  /** Set on the folded-in document panes; drives `DocumentsView embeddedType`. */
  docType?: FinanceDocType;
}

/** Group headings, in rail order. */
export const FINANCE_SECTION_GROUPS = { documents: 'Documents', tools: 'Tools' } as const;

export const FINANCE_SECTIONS: readonly FinanceSection[] = [
  { value: FINANCE_TAB.dashboard, label: 'Dashboard', icon: PieChart, landing: true },
  { value: FINANCE_TAB.receivables, label: 'Receivables', icon: ArrowDownCircle, count: 'ar' },
  { value: FINANCE_TAB.payables, label: 'Payables', icon: ArrowUpCircle, count: 'ap' },
  { value: FINANCE_TAB.bankFeed, label: 'Bank feed', icon: Landmark },
  { value: FINANCE_TAB.supplierPortal, label: 'Supplier Portal', icon: Truck, hideForAccountant: true },

  { value: FINANCE_TAB.orders, label: 'Orders', icon: ShoppingCart, group: 'documents', docType: 'orders' },
  { value: FINANCE_TAB.invoices, label: 'Invoices', icon: FileText, group: 'documents', docType: 'invoices' },
  { value: FINANCE_TAB.receipts, label: 'Receipts', icon: Receipt, group: 'documents', docType: 'receipts' },
  { value: FINANCE_TAB.creditNotes, label: 'Credit Notes', icon: FileMinus, group: 'documents', docType: 'credit_notes' },
  { value: FINANCE_TAB.payments, label: 'Payments', icon: Banknote, group: 'documents', docType: 'payments' },
  { value: FINANCE_TAB.expenses, label: 'Expenses', icon: ArrowUpCircle, group: 'documents', docType: 'expenses' },
  // Sits next to Expenses because it is the same inbox read the other way round — by issuer
  // rather than by document. Not a `docType`: it has its own panel.
  { value: FINANCE_TAB.expenseSuppliers, label: 'By Supplier', icon: Building2, group: 'documents' },
  // The dispatch board lives in the Warehouse module (a fulfilment surface, not a finance
  // document); this is the delivery-note LIST. Reachable from the WH jump-off too.
  { value: FINANCE_TAB.deliveryNotes, label: 'Delivery Notes', icon: Truck, group: 'documents', docType: 'delivery_notes' },
  { value: FINANCE_TAB.cheques, label: 'Cheques', icon: FileSignature, group: 'documents', docType: 'cheques' },

  { value: FINANCE_TAB.planning, label: 'Planning', icon: CalendarClock, group: 'tools' },
  { value: FINANCE_TAB.tripCards, label: 'Expense Cards', icon: Plane, group: 'tools' },
  { value: FINANCE_TAB.assets, label: 'Assets', icon: Boxes, group: 'tools' },
  { value: FINANCE_TAB.time, label: 'Time & Billing', icon: Clock, group: 'tools', hideForAccountant: true },
  // AI Assessment sits above Reports on purpose: everything below is a number you read yourself,
  // and this is the one that reads them for you and says what to do. Its own paid module, so the
  // PANE gates rather than the entry — a hidden entry cannot explain what it is you are not being
  // offered. The launcher chip is ungated for the same reason.
  { value: FINANCE_TAB.assessment, label: 'AI Assessment', icon: Gauge, group: 'tools' },
  { value: FINANCE_TAB.reports, label: 'Reports', icon: BarChart3, group: 'tools' },
  // Deliberately its own entry and not a 25th line in Reports: everything in that dropdown is
  // derived from OUR tables, and this one is AADE's answer.
  { value: FINANCE_TAB.mydataBook, label: 'myDATA Book (ΑΑΔΕ)', icon: BookOpen, group: 'tools' },
  // Sits with the Book because they answer the same question from opposite ends: the Book is what
  // AADE holds, this is what we sent to get it there.
  { value: FINANCE_TAB.transmissions, label: 'myDATA Transmissions', icon: Send, group: 'tools' },
  { value: FINANCE_TAB.parties, label: 'Customers & Suppliers', icon: Users, group: 'tools' },
  { value: FINANCE_TAB.followUps, label: 'Follow-Ups', icon: Bell, group: 'tools', count: 'followups' },
  { value: FINANCE_TAB.sourcing, label: 'Sourcing', icon: PackageSearch, group: 'tools', hideForAccountant: true },
  { value: FINANCE_TAB.settings, label: 'Settings', icon: Settings, group: 'tools', hideForAccountant: true },
];

/** The document panes, in rail order — `DocumentsView`'s catalog. */
export const FINANCE_DOC_SECTIONS = FINANCE_SECTIONS.filter(
  (s): s is FinanceSection & { docType: FinanceDocType } => s.docType !== undefined,
);

export type FinanceRailRow =
  | { kind: 'heading'; label: string }
  | { kind: 'section'; section: FinanceSection };

/**
 * The rail exactly as it is rendered: the visible sections for this persona, with a group heading
 * before the FIRST VISIBLE row of each group.
 *
 * Separated from the JSX because the interleave has a case worth pinning: a heading must follow
 * what survives the persona gate, not the declaration order. Every Tools row an accountant may see
 * still needs its "Tools" heading, and a group whose rows are ALL hidden must not leave a heading
 * standing over the next group's rows.
 */
export function financeRailRows(opts: { isAccountant: boolean }): FinanceRailRow[] {
  const rows: FinanceRailRow[] = [];
  let openGroup: FinanceSection['group'];
  for (const section of FINANCE_SECTIONS) {
    if (section.hideForAccountant && opts.isAccountant) continue;
    if (section.group && section.group !== openGroup) {
      rows.push({ kind: 'heading', label: FINANCE_SECTION_GROUPS[section.group] });
    }
    openGroup = section.group;
    rows.push({ kind: 'section', section });
  }
  return rows;
}
