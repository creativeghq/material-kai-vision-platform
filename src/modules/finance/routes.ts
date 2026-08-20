/**
 * Where Finance lives in the URL — one answer, imported by everything that links into it.
 *
 * Finance is WORKSPACE-based and mounted at `/finance` (+ `/finance/invoices/:id`,
 * `/finance/orders/:id`) and NOWHERE else. There has never been an `/admin/finance` route: see
 * `src/modules/finance/index.ts`, which registers no routes at all, and `App.tsx`, where the three
 * finance paths sit under `/finance`.
 *
 * Six call sites nonetheless computed the base as
 *     useLocation().pathname.startsWith('/admin') ? '/admin/finance' : '/finance'
 * to "mirror the mount point" — a mirror CRM once had and no longer does (`/admin/crm/*` is now
 * only a redirect into `/crm/*`). Finance never had one at all, so every one of those links
 * resolved to the `path="*"` catch-all the moment it was
 * followed from an admin page: an order opened from a CRM timeline, a covering purchase order
 * opened from a sale's Suppliers tab, an invoice opened right after being created. Nothing threw —
 * React Router simply rendered NotFound, which is why it survived. `deepLinkTargets.test.ts`
 * already asserts `routeExists('/admin/finance') === false`; it was written after five stored
 * `action_url`s were found under the same dead prefix, and now guards this side too.
 *
 * If Finance ever DOES get an admin mount, this constant becomes the function that picks between
 * them — one edit, not six.
 */
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
  orders: 'doc_orders',
  invoices: 'doc_invoices',
  receipts: 'doc_receipts',
  creditNotes: 'doc_credit_notes',
  payments: 'doc_payments',
  expenses: 'doc_expenses',
  deliveryNotes: 'doc_delivery',
  cheques: 'doc_cheques',
  parties: 'parties',
  reports: 'reports',
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
