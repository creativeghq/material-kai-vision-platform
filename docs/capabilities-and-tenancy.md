# Capabilities, Module Entitlements & Workspace Tenancy

The authorization backbone of the platform. **Three gates** must all pass for a user to use a feature:

1. **Authentication** — valid JWT / API key.
2. **Capability** — the user's persona has the capability (role-based; §1).
3. **Entitlement** — the workspace owns or is plan-covered for the module (purchase-based; §2).

Tenancy (§3) is the substrate: **tenant = workspace**, every business row is `workspace_id`-scoped, and a small set of `SECURITY DEFINER` guard RPCs enforce membership.

Source of truth: `src/auth/capabilities.ts`, `src/hooks/usePermissions.ts`, `src/hooks/useEntitlements.ts`, `supabase/functions/_shared/auth.ts`, `supabase/functions/_shared/entitlement.ts`.

---

## 1. Capability system (#195, #208)

`#208` merged two parallel capability systems into one (`usePermissions`). `src/auth/roles.ts` survives only for raw role-string constants (`ROLES`, `ADMIN_ROLES`) used in RLS-style checks; **all component gating goes through `usePermissions()`**.

### 1.1 Personas (`Persona`)

| Persona | Who |
|---|---|
| `operator` | Owner/admin of the Materials Hub **root** workspace — runs the platform |
| `dealer` | Owner/admin of a supplier node (sells catalog downstream) |
| `architect` | Owner/admin of an architect node (sells to end-users with margin) |
| `staff` | Team member of a business node (`member` workspace role) |
| `accountant` | Invited external accountant — Finance surface only (#202) |
| `sales` | Invited sales rep — Sales portal only (#201) |
| `end_user` | Project client / referral-joined member — restricted surface |

### 1.2 Capabilities (`Capability`)

`platform.admin`, `catalog.import`, `network.manage`, `pricing.manage`, `finance.manage`, `invoice.issue`, `crm.view`, `warehouse.manage`, `downstream.view`, `marketplace.browse`, `quotes.use`, `sales.portal`, `projects.use`, `moodboards.use`, `agent.use`.

### 1.3 Persona→capability matrix

(exact from `PERSONA_CAPABILITIES`; `ALL_BUSINESS` = the 11 capabilities shared by operator/dealer/architect)

| Capability | operator | dealer | architect | staff | accountant | sales | end_user |
|---|:--:|:--:|:--:|:--:|:--:|:--:|:--:|
| `platform.admin` | ✅ | | | | | | |
| `catalog.import` | ✅ | | | | | | |
| `downstream.view` | ✅ | | | | | | |
| `network.manage` | ✅ | ✅ | ✅ | | | | |
| `pricing.manage` | ✅ | ✅ | ✅ | | | | |
| `finance.manage` | ✅ | ✅ | ✅ | ✅ | ✅ | | |
| `invoice.issue` | ✅ | ✅ | ✅ | ✅ | | | |
| `crm.view` | ✅ | ✅ | ✅ | ✅ | | ✅ | |
| `warehouse.manage` | ✅ | ✅ | ✅ | ✅ | | | |
| `marketplace.browse` | ✅ | ✅ | ✅ | ✅ | | ✅ | |
| `quotes.use` | ✅ | ✅ | ✅ | ✅ | | ✅ | ✅ |
| `sales.portal` | | | | | | ✅ | |
| `projects.use` | ✅ | ✅ | ✅ | ✅ | | | ✅ |
| `moodboards.use` | ✅ | ✅ | ✅ | ✅ | | | ✅ |
| `agent.use` | ✅ | ✅ | ✅ | ✅ | | ✅ | ✅ |

Notes: `operator` differs from `dealer`/`architect` only in the three operator-exclusive capabilities (`platform.admin`, `catalog.import`, `downstream.view`); the 11 `ALL_BUSINESS` capabilities are otherwise shared. `staff` runs day-to-day (finance, invoicing) but cannot administer the node (no `network.manage`/`pricing.manage`). `accountant` gets only `finance.manage`.

### 1.4 `resolvePersona(inputs)` — first match wins

Inputs `{ isPlatformOperator, rank, workspaceRole }`:

1. `isPlatformOperator` → `operator`
2. `workspaceRole === 'client'` → `end_user`
3. `workspaceRole === 'accountant'` → `accountant`
4. `workspaceRole === 'sales'` → `sales` (must precede member/staff fallback)
5. owner/admin + rank `dealer` → `dealer`
6. owner/admin + rank `architect` → `architect`
7. owner/admin + unknown rank → `dealer`
8. else → `staff`

`rank` is derived in `WorkspaceContext` from the active workspace node: `isRoot` → `operator`, `canSupplyProducts` → `dealer`, else → `architect`.

### 1.5 `usePermissions()` API

| Field | Derivation |
|---|---|
| `loading` | mirrors `WorkspaceContext.loading` — gate on this before trusting `can()` |
| `persona` | `resolvePersona(...)` |
| `can(cap)` / `canAny(...caps)` | `personaCan(persona, cap)` |
| `isOperator` / `isEndUser` | `persona === 'operator'` / `'end_user'` (derived from persona, #208) |
| `isAccountant` / `isSalesRep` | `workspaceRole === 'accountant'` / `'sales'` |
| `isWorkspaceManager` | `ADMIN_ROLES.includes(workspaceRole)` (`admin`/`super_admin`/`owner`) |
| `canSupplyProducts` | rank is `operator` or `dealer` |
| `canOperateFinance` | `isWorkspaceManager \|\| isAccountant` — day-to-day finance without settings |
| `canManageNetwork` | `isWorkspaceManager && canSupplyProducts` |

### 1.6 `CapabilityGuard`

`src/components/core/CapabilityGuard.tsx` — props `{ capability, children, fallbackPath='/' }`. Renders `null` while loading, children when `can(capability)`, else an "Access Restricted" card showing the persona. Route-level usage in `App.tsx`: `/network` (`network.manage`), `/finance` + `/finance/invoices/:id` (`finance.manage`), `/crm*` (`crm.view`), `/pos` (`invoice.issue`), `/sales` (`sales.portal`), marketplace browse (`marketplace.browse`).

### 1.7 Edge / persona reconciliation (#195)

`supabase/functions/_shared/auth.ts` — `validateUserToken` with `allowedRoles` grants access when **either** the global role (`user_profiles.role_id → roles.name`) **or** the workspace role (`workspace_members.role`) matches (additive — `globalOk || workspaceOk`). This is why a dealer (global `user`, workspace `owner`) passes a gate requiring `['admin','super_admin','owner','finance','accountant']`. `userCanAccessWorkspace(adminClient, userId, workspaceId)` is the second tier: re-checks active membership of the specific workspace (or global admin) to prevent cross-tenant IDOR.

---

## 2. Module entitlements (#212)

Gates **feature visibility on purchase, not just role**.

### Tables
- **`modules`** (PK `slug`): `name`, `description`, `category`, `price_tier` (`free`/`pro`/`enterprise`), `icon`, `version`, `enabled` (platform-level toggle). ~21 rows (e.g. `sales-finance` pro, `crm` free, `quotes` pro). Disabled modules (`idealo`, `mention-monitoring*`) aren't available to anyone.
- **`workspace_module_entitlements`** (unique `(workspace_id, module_slug)`): `enabled`, `granted_by`, `granted_at`. (There is **no** `workspace_modules` table — this is the canonical name.)

### RPCs
- **`is_workspace_entitled(p_workspace_id, p_module_slug) → bool`** — true if **any** of: workspace `is_root`; an enabled entitlement row exists; or `tier_rank(module.price_tier) <= workspace_plan_level(workspace_id)`.
- **`get_workspace_module_access(p_workspace_id) → (slug, available, tier)`** — calls `assert_workspace_member` first, returns all enabled modules with availability. Backs `useEntitlements()`.
- **`set_workspace_entitlement(p_workspace_id, p_module_slug, p_enabled)`** — caller must be owner/admin of an **ancestor** of the workspace (via `get_workspace_ancestors`); upserts the entitlement.
- **`workspace_plan_level(p_workspace_id) → int`** — max `tier_rank` of the workspace owner's active `user_subscriptions → subscription_plans.name`. So a 'pro' subscription auto-grants all `pro` modules without explicit rows.
- **`tier_rank(tier) → int`** — `free`→0, `pro`→1, `enterprise`→2, else NULL.

### Enforcement
- **Edge (real boundary)**: `supabase/functions/_shared/entitlement.ts` — `isWorkspaceEntitled` (**fails closed** on error), `notEntitledResponse` (HTTP **402** `{code:'not_entitled', module}`), `assertEntitled` wrapper. `finance-issue-invoice` checks `is_workspace_entitled('sales-finance')` inline before transmitting invoices, credit notes, and delivery notes; `finance-inbound-sync` and `finance-storefront` also check.
- **Frontend (UX only)**: `EntitlementGuard` (`src/components/core/EntitlementGuard.tsx`) → `useEntitlements().isModuleAvailable(slug)`. **Fails open** while loading / on error (renders children) — never flash a lock screen on a paying tenant. On unavailable, renders an upsell card linking to `/billing/subscriptions`.

### Granting
Two paths: (1) **subscription** — owner holds an active Stripe plan whose `subscription_plans.name` maps via `tier_rank` (the plan **name must literally be** `free`/`pro`/`enterprise`); (2) **explicit grant** — operator/ancestor calls `set_workspace_entitlement` (`workspaceManagementService.setEntitlement`).

---

## 3. Workspace tenancy (#194, #174)

### Tables
- **`workspaces`**: `name`, `slug`, `is_root` (one row platform-wide), `parent_workspace_id` (hierarchy, cycle-protected by trigger `workspaces_reject_cycle`), `can_supply_products` (dealer flag), `catalog_access` (`operator_catalog`/`own_products_only`), `commission_pct`, `referral_code`/`referral_enabled`, `status`.
- **`workspace_members`**: `workspace_id`, `user_id`, `role` (`owner`/`admin`/`member`/`client`/`accountant`/`sales`), `permissions` jsonb (**unused** by the capability system — dead state), `status`.

### Signup → own workspace (#194)
Two `auth.users` INSERT triggers: `create_user_profile_on_signup` (creates `user_profiles` + `user_credits`) and `handle_new_user_workspace_assignment` (creates a child workspace of root named `<email-prefix>'s workspace`, slug `ws-<uid>`, with the new user as `owner`). Every signup gets their own personal workspace — they are **not** added to root.

### Settings / branding (#174)
`/settings` is **retired** — it redirects to `/finance` (`App.tsx`). Branding/members/plan now live inside the Finance module. **`finance_settings` is the canonical branding store** (business identity incl. EN variants, contact/branding lines, banking, invoice numbering, myDATA defaults — see [finance §7](finance-system.md#7-key-db-tables)); catalog branding was repointed to it ("Option A cutover").

### Tenancy guard RPCs (all `SECURITY DEFINER`)
- **`is_workspace_member(workspace_id) → bool`** — active member where `user_id = auth.uid()`.
- **`assert_workspace_member(p_workspace_id)`** — raises `42501` if `auth.uid()` is set and not a member; **passes silently when `auth.uid()` is null** (service-role calls).
- **`is_workspace_admin(p_workspace_id) → bool`** — active member with role `admin`/`owner`.
- **`is_workspace_finance_manager(p_workspace_id) → bool`** — active member `owner`/`admin` **OR** global role `admin`/`super_admin`/`finance`. The finance-write gate.
- **`userCanAccessWorkspace(adminClient, userId, workspaceId)`** (TS, `_shared/auth.ts`) — edge equivalent.

### Hierarchy
Exactly one `is_root=true` workspace; its owner/admins get `isPlatformOperator` and all modules free. All others are tenants linked by `parent_workspace_id`. `get_workspace_ancestors` / `get_workspace_descendants` walk the tree (cycle-protected). `create_child_workspace` (via `workspaceManagementService.createChild`): caller must be parent owner/admin; a child may only set `can_supply_products=true` if its parent can or is root; creator becomes `owner`. Invites (`workspace_invites`, roles `member`/`accountant`/`sales`, one-time, 30-day) vs referrals (always join as `member`). Active workspace is persisted per-user in localStorage.

### Gaps
- `workspace_members.permissions` jsonb is unused.
- `workspace_plan_level` requires plan names to be exactly `free`/`pro`/`enterprise` (a plan named "Professional" → rank 0).
- `user_subscriptions` is user-scoped, not workspace-scoped — multi-owner / transferred workspaces can lose auto-entitlements.
- `assert_workspace_member` no-ops under service-role (intentional).
- `EntitlementGuard` fails open — the edge `is_workspace_entitled` check is the real boundary.

---

**Last updated**: 2026-06-09 · Covers #195, #208, #212, #174, #194, #202.
