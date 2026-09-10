/** Where Finance lives in the URL — one answer, imported by everything that links into it. */
export const FINANCE_BASE = '/finance';

/**
 * The `?tab=` keys FinancePage renders panes for. Named here rather than spelled at each call
 * site, because the key and the label differ everywhere it matters: the Orders pane is keyed
 * `doc_orders`, not `orders`, and every stored order notification carried `?tab=orders` until
 * that was found — a valid URL that opened Finance with no pane selected and a blank body.
 *
 * FinancePage's own `DOC_TABS` is built from this, so a rename cannot leave a link behind.
 */
export const FINANCE_TAB = {
  dashboard: 'dashboard',
  receivables: 'ar',
  payables: 'ap',
  bankFeed: 'bank_feed',
  /** Purchase orders sent TO us, seen from the supplier's side of the same rail. */
  supplierPortal: 'supplier_portal',
  orders: 'doc_orders',
  invoices: 'doc_invoices',
  receipts: 'doc_receipts',
  creditNotes: 'doc_credit_notes',
  payments: 'doc_payments',
  expenses: 'doc_expenses',
  /** The same inbox seen by ISSUER — filing, the CRM link, and one supplier's whole history. */
  expenseSuppliers: 'expense_suppliers',
  deliveryNotes: 'doc_delivery',
  cheques: 'doc_cheques',
  parties: 'parties',
  planning: 'planning',
  tripCards: 'trip_cards',
  assets: 'assets',
  time: 'time',
  followUps: 'followups',
  sourcing: 'sourcing',
  reports: 'reports',
  /** AADE's own aggregate book — a read-only mirror, deliberately not a Reports entry. */
  mydataBook: 'mydata_book',
  /** OUR transmission log — every attempt, with the MARK or the reason there is none. The Book
   *  above is AADE's aggregate answer; this is the per-document record behind it. */
  transmissions: 'mydata_transmissions',
  settings: 'settings',
  /** The AI Assessment pane — its own paid module (`finance-assessment`). */
  assessment: 'assessment',
} as const;

/** `?<key>=` params the finance lists read their filter bag out of (see `filterUrl`). */
export const ORDERS_FILTER_KEY = 'of';
export const AR_FILTER_KEY = 'arf';
export const AP_FILTER_KEY = 'apf';

/** Field keys inside the AR/AP bag. Declared here, in the dependency-free routes module, so a
 *  surface that only wants to BUILD a link does not have to import the filter definitions —
 *  which pull in the finance service, and through it the Supabase client. */
export const AGE_BUCKET_KEY = 'age_bucket';
export const OVERDUE_KEY = 'overdue';

/** A Finance URL that names its pane. Anything linking into Finance goes through here — landing
 *  on the default Dashboard pane when you meant the Orders list is the bug this closes. */
export function financeTabUrl(tab: typeof FINANCE_TAB[keyof typeof FINANCE_TAB]): string {
  return `${FINANCE_BASE}?tab=${tab}`;
}
