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
 * to "mirror the mount point" — the mirror CRM genuinely has (`/admin/crm/*` is real). Finance has
 * no such twin, so every one of those links resolved to the `path="*"` catch-all the moment it was
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
