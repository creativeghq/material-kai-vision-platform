# Sales Portal, Marketplace Catalog Access & Procurement Routing

Three related B2B surfaces that sit on top of the [capability system](capabilities-and-tenancy.md) and the workspace hierarchy:

1. **Sales Portal (#201)** — a stripped-down quote/order surface for invited sales reps.
2. **Marketplace catalog access (#196)** — supplier→factory catalog access requests with operator approval.
3. **Master-request parent inbox (#177)** — procurement routing/escalation up the workspace tree.

> ⚠️ Naming caution: there are **two unrelated "catalog access" concepts** — the B2B factory-access request flow (`factory_access_requests`, §2) and the public presentation-catalog **email gate** (`catalog-access` edge function, §3). They share a word but nothing else.

---

## 1. Sales Portal (#201)

A rep sees only their own orders (RLS: `quotes.user_id = auth.uid()`), picks or quick-creates a CRM customer, names the order, and is handed off to the standard quote detail page to add catalog line items. No finance, pricing, warehouse, or network surfaces.

### Persona & access
- Workspace role `sales` resolves to persona `'sales'` (`resolvePersona`, checked **before** the member/staff fallback). Capabilities: `sales.portal`, `quotes.use`, `crm.view`, `marketplace.browse`, `agent.use` — see the [capability matrix](capabilities-and-tenancy.md#13-personacapability-matrix). `usePermissions()` also exposes `isSalesRep`.
- **Onboarding**: workspace owner invites from **Profile → Team** (or Finance → Settings → Team) via `TeamPanel` — by email (bound to that address) or by link. Roles come from `src/auth/workspaceRoles.ts` (`member | accountant | sales | sales_manager | employee | realestate_agent`); the invitee signs up at `/auth?mode=signup&invite=CODE` and auto-joins with that role. `sales_manager` gets the same portal as a rep but reads the whole team's quote book (RLS: `is_workspace_sales_manager`).

### Routes
| Path | Guard | Component |
|---|---|---|
| `/sales` | `CapabilityGuard capability="sales.portal"` | `SalesPage` |
| `/crm/contacts/:id` | `CapabilityGuard capability="crm.view"` | `CrmContactDetailPage` |
| `/crm/companies/:id` | `CapabilityGuard capability="crm.view"` | `CrmCompanyDetailPage` |

Nav item `{ id:'sales', path:'/sales', requireCapability:'sales.portal' }` (visible only to the `sales` persona).

### `SalesPage` (`src/pages/Sales/SalesPage.tsx`)
- Stats (total / submitted / accepted / drafts) + orders table (RLS scopes to the rep's rows).
- `NewOrderDialog`: debounced customer search across `crm_contacts`/`crm_companies` (6 each), "Quick add" inline contact create, required order name → `quotesService.createQuote({ name, workspace_id, customer_* })` (writes `user_id = auth.uid()`) → navigates to `/quotes/:id`.

### CRM access for reps
The CRM contact/company detail pages render an **Account** tab mounting `CustomerAccountOverview` (`src/modules/finance/components/CustomerFinanceTabs.tsx`): reads `vw_customer_account_summary` + payments + `report_customer_top_products`, renders KPI tiles (Owed / Total sales / Revenue / Open orders / Last payment), a "top products to push" table, and an "Email account info" button (`financeService.sendStatement()`). Gated only by route-level `crm.view`.

### Quotes RLS
`consolidated_quotes_select_public`: `auth.uid() = user_id OR is_workspace_admin(workspace_id)`. Reps see only their own quotes; can only UPDATE while `status='draft'`.

---

## 2. Marketplace catalog access — factory access requests (#196)

A `factory` (a `user_profiles` row with `factory_verified=true`, `professional_type='supplier'`) exposes its catalog; a supplier workspace requests access; the **platform operator** (root-workspace admin) approves/rejects. The approved request **is** the grant.

### Flow
1. **Supplier applies** — `RequestFactoryAccessButton` (`src/components/features/discover/RequestFactoryAccessButton.tsx`) → `factoryAccessService.requestAccess(workspaceId, factoryUserId, message?)` inserts a `pending` `factory_access_requests` row. Button reflects state (request / requested / approved).
2. **Operator reviews** — `FactoryAccessRequestsTab` (`src/components/Admin/FactoryAccessRequestsTab.tsx`) in `AdminPanel` → `factoryAccessService.review(requestId, decision, reason?)` → `review_factory_access_request(p_request_id, p_decision, p_reason)` RPC (validates caller is admin of the root workspace; sets status + `decided_by`/`decided_at`/`rejection_reason`).
3. **Grant takes effect** — `get_accessible_factory_products(p_workspace_id)` (SECURITY DEFINER, validates `is_workspace_member`) returns `products` from the factory's workspace for every `approved` request. It finds the factory's workspace by joining `workspace_members WHERE user_id=factory_user_id AND role IN ('owner','admin')`.

### `factory_access_requests`
`requester_workspace_id`, `requester_user_id`, `factory_user_id`, `status` (pending/approved/rejected/revoked), `message`, `decided_by`, `decided_at`, `rejection_reason`. RLS: requester members insert + withdraw (pending only); factory user reads own; root admin reads all. Approval/rejection only via RPC.

> Separate axis: `workspaces.catalog_access` (`operator_catalog` | `own_products_only`, default `operator_catalog`) is an operator-set per-workspace policy (managed via `MarketplaceNetworkPage`) controlling whether a child can browse the full operator catalog — distinct from factory access requests.

### Gaps
- `get_accessible_factory_products` assumes the factory user is owner/admin of their workspace (a `member`-only factory returns nothing).
- No notification on submit or on approve/reject (operator/requester must poll).
- No DB UNIQUE on `(requester_workspace_id, factory_user_id)` — multiple pending requests possible.

---

## 3. Presentation-catalog email gate (`catalog-access` edge function)

A **customer-facing** email gate for published marketing catalogs shared at `/c/:slug` — unrelated to §2. Edge function `supabase/functions/catalog-access/index.ts`, service-role, anonymous.

Actions: `public_meta` (landing meta, no body), `request` (`{slug, email}` → email match → 30-day token), `verify` (`{slug, token}` → full payload incl. 7-day signed PDF URL), `track_view`, `track_download`.

**Email matching** (priority): platform user who is a workspace_member of the owner → CRM contact → CRM company → `catalog_email_grants` allowlist → denied (no catalog-existence leak). Token: 48 hex chars, 30-day TTL, stored in `catalog_access_log.cookie_token`.

Tables: `catalog_access_log` (one row per attempt), `catalog_email_grants` (admin allowlist), `catalog_view_events` (page_view/pdf_download). All admin-read-only RLS; writes service-role. RPCs `catalog_bump_unique_email_count`, `catalog_increment_view_count`. Operator analytics: `CatalogOperationsTab` at `/admin/operations`.

> Gaps: tokens stored plaintext; no rate limiting on `request` (unlike the Turnstile-gated [public tools](../CLAUDE.md)); `pdf_view` enum value defined but never emitted.

See also [presentation-catalogs.md](presentation-catalogs.md).

---

## 4. Master-request parent inbox (#177)

Procurement routing for marketplace networks: a child workspace submits a quote to its parent node for pricing; the parent prices it or escalates it further up the tree (to the root operator). The "inbox" is a tab on `/quotes` gated on `network.manage`.

All writes go through SECURITY DEFINER RPCs (`master_requests` has a `false`-for-ALL direct-write policy):

- **`submit_procurement_request(p_quote_id)`** — validates `is_workspace_member(quote.workspace_id)`; targets `workspaces.parent_workspace_id` (falls back to the root workspace); idempotent for `new`/`in_review`; inserts `master_requests`.
- **`return_priced_request(p_request_id, p_note?)`** — only the receiving parent (`is_workspace_member(parent_workspace_id)`) sets `status='priced'`.
- **`escalate_request(p_request_id)`** — the current parent escalates to its own parent (or root); marks the original `escalated`, inserts a new row with `escalated_from` (audit chain).

Status: `new → in_review → priced | escalated`.

`master_requests`: `quote_id`, `requester_workspace_id`, `parent_workspace_id`, `status`, `note`, `amount`, `currency`, `priced_by/at`, `escalated_from`. RLS SELECT: member of requester OR parent.

**Frontend**: `RequestsInboxPanel` (`src/modules/quotes/components/RequestsInboxPanel.tsx`) mounts as `/quotes?tab=requests` when `can('network.manage')` — incoming (with Return-priced / Escalate buttons) + sent-upward sections. Child side: "Submit to parent" button on `QuoteDetailAdminPage`. `/requests` redirects to `/quotes?tab=requests`.

> Gaps: `in_review`/`cancelled` statuses have no write path; escalation copies a possibly-stale `amount` from the original request; the inbox "open quote" link targets the admin route `/admin/quotes/:id`.

---

**Last updated**: 2026-06-09 · Covers #201, #196, #177.
