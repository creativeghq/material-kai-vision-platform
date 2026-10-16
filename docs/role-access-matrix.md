# Role & Access Matrix

Single source of truth for **who can see/do what** on the platform. Reflects the
code as of this writing — where the model is *not* enforced, it says so explicitly.

> TL;DR — there are **two different "role" concepts**, and day-to-day access is driven
> by the **persona** (derived from workspace membership), not by the global account role.

---

## 1. The two "role" concepts

### a) Account role — `roles` table (`user_profiles.role_id`)
A global, per-user value — **the access tier**, set from `/admin/crm` → Users. Set: `user`(1) · `supplier`(2) · `architect`(3) · `admin`(4) — the two tiers `role_upgrade_requests` accepts, the operator flag, and the baseline. **Nothing functional lives here.** A tier is global: true in every workspace the user belongs to. `sales` and `finance` were removed 2026-07-31 (zero users; both are workspace roles — `sales`, `accountant`). `level` is display ordering only, but it is UNIQUE (`roles_level_key`), so a renumber needs a parking pass (`SET level = level + 100`) before landing final values.

The tier only shapes the persona when the user has **no workspace role** (§2) — in practice almost never, because every signup owns a workspace.

**Platform operator.** Frontend: owner/admin of the **root** workspace (`isPlatformOperator` in `WorkspaceContext`) — what `AdminGuard` checks. Edge: account tier `admin`/`super_admin` (`isPlatformOperator` in `_shared/auth.ts`, used by `authenticatePlatformOperator`). SQL: `is_platform_admin()`, same tier test. The operator holds both.

Managed in **Admin → CRM → Users** (inline Role dropdown).

### b) Workspace membership role — `workspace_members.role`
Per workspace: `owner` · `admin` · `member` · `client` · `accountant` · `sales` · `sales_manager` · `hr` · `hr_manager` · `warehouse` · `marketing` · `employee` · `realestate_agent`. (`finance` was dropped 2026-07-31 — a duplicate of `accountant` with no `resolvePersona` branch, so a member stored with it silently resolved to `staff`.) Catalogued in [`src/auth/workspaceRoles.ts`](../src/auth/workspaceRoles.ts) and mirrored by two CHECK constraints + two RPC allowlists. Combined with the workspace's **marketplace rank** (`operator` / `dealer` / `architect`) and the platform-operator flag, this resolves to a single **persona**, which is what gates features.

Source of truth: [`src/auth/capabilities.ts`](../src/auth/capabilities.ts).

---

## 2. Personas (the real access tiers)

| Persona | Account role that grants it | Notes |
|---|---|---|
| Persona | Granted by | Notes |
|---|---|---|
| **operator** | owner/admin of the root workspace | Everything except `sales.portal`. |
| **dealer** / **architect** | workspace `owner`/`admin` (by the workspace's rank); else account tier `supplier` / `architect` | Full business set. |
| **staff** | workspace `member` | Finance ops, CRM, quotes, stock, projects; no network/pricing/team. |
| **accountant** | workspace `accountant` | `finance.manage` only; `isAccountant` restricts it further (no expense approval, no settings). |
| **sales** / **sales_manager** | `sales` / `sales_manager` | Own quote book / the whole team's (`sales.team.view`, RLS `is_workspace_sales_manager`). |
| **hr_staff** / **hr_manager** | `hr` / `hr_manager` | `hr.view` / `hr.view` + `hr.manage`. `hr-api` grants the same. |
| **warehouse_staff** | `warehouse` | `warehouse.manage`. |
| **marketing_staff** | `marketing` | `marketing.email`. |
| **employee** | `employee` | `hr.self` — own HR record. |
| **realestate_agent** | `realestate_agent` | Own listings and leads. |
| **guest** | `client`, or a guest-kind workspace | Nothing. |

Resolution (`resolvePersona()`): operator → guest workspace → `TEAM_ROLE_PERSONA` → owner/admin by rank → member → account tier (only with no workspace role) → staff.

---

## 3. Capability matrix (persona → what they can do)

✓ = granted. From `PERSONA_CAPABILITIES`.

| Capability | operator | dealer | architect | staff | accountant | sales | end_user |
|---|:--:|:--:|:--:|:--:|:--:|:--:|:--:|
| `platform.admin` (/admin shell) | ✓ | | | | | | |
| `catalog.import` | ✓ | | | | | | |
| `downstream.view` | ✓ | | | | | | |
| `network.manage` (/network) | ✓ | ✓ | ✓ | | | | |
| `pricing.manage` | ✓ | ✓ | ✓ | | | | |
| `finance.manage` (/finance) | ✓ | ✓ | ✓ | ✓ | ✓ | | |
| `invoice.issue` (/pos) | ✓ | ✓ | ✓ | ✓ | | | |
| `crm.view` (/crm) | ✓ | ✓ | ✓ | ✓ | | ✓ | |
| `warehouse.manage` | ✓ | ✓ | ✓ | ✓ | | | |
| `marketplace.browse` (/discover) | ✓ | ✓ | ✓ | ✓ | | ✓ | |
| `quotes.use` | ✓ | ✓ | ✓ | ✓ | | ✓ | ✓ |
| `sales.portal` (/sales) | | | | | | ✓ | |
| `projects.use` | ✓ | ✓ | ✓ | ✓ | | | ✓ |
| `moodboards.use` | ✓ | ✓ | ✓ | ✓ | | | ✓ |
| `agent.use` | ✓ | ✓ | ✓ | ✓ | | ✓ | ✓ |
| `inbox.use` | ✓ | ✓ | ✓ | ✓ | | ✓ | ✓ |

Notes:
- **operator** = everything **except** `sales.portal` (the Sales portal belongs to the two sales personas only — owners/admins work quotes via `/quotes`).
- **dealer** and **architect** are identical today (full business set); they differ only in marketplace position (dealer sells downstream, architect sells to end users).
- **accountant** is intentionally narrow — Finance surface only; within Finance, write-ops are further gated by `isWorkspaceManager` / `canOperateFinance`.
- **sales** sees only their **own** quotes (RLS on `user_id`); customer financials are workspace-scoped reads. **sales_manager** additionally passes `is_workspace_sales_manager(workspace_id)` in `consolidated_quotes_select_public`, so the team-wide read is enforced in the database, not just unhidden in the UI.

---

## 4. Enforcement layers (where it's actually checked)

1. **`AuthGuard`** — authenticated or not. Wraps the user-facing app.
2. **`CapabilityGuard` / `usePermissions().can(cap)`** — per-route/per-feature persona capability check (the table above). e.g. `/finance` needs `finance.manage`, `/network` needs `network.manage`.
3. **`AdminGuard`** — wraps all `/admin/*`. Passes only for **Platform Operator** (`owner`/`admin`/`super_admin` of the **root** workspace). A dealer/architect who owns their own workspace does **not** pass.
4. **Edge functions** (`_shared/auth.ts`):
   - `authenticate({ allowedRoles })` passes when the caller holds a listed role as account tier **or in ANY workspace** — a partner `kai_` key passes when its owner would. It is never a platform gate: every signup owns a workspace, so `owner`/`admin` there means "any signed-in user". Bind the target workspace with `userCanAccessWorkspace` plus a role read for that workspace.
   - Platform work (cron fan-outs, integrity runs, billing rates, seats, the platform email sender, MIVAA `/api/admin`) uses `authenticatePlatformOperator(req)`: secret/service-role, or account tier `admin`/`super_admin`. Guarded by `tests/unit/platformScopedAuthGates.test.ts`.
   - `hr-api` grants view to `hr` and manage to `hr_manager`, as the UI does.
   - Agents: JARVIS is open to every role; specialist agents allow `member/admin/owner` (+ `viewer` for no membership) only, so team roles are refused them. Widening that needs tools filtered per capability first — agent tools are gated per workspace module, so a `warehouse` user on the `member` list would reach finance tools.
5. **Postgres RLS** — `is_admin_user()` (account role = **`admin`** only — note: not `super_admin`), `is_workspace_member(workspace_id)` (row belongs to a workspace you're in). Used by CRM/activity/notes/finance tables.

---

## 5. Public (no auth) surfaces
`/tools` (IP-quota), `/knowledge-base`, `/brand/:slug`, `/u/:userId`, `/ar/:productId`, and token-gated links (`/board/:id`, `/q/:token`, `/c/:slug`, `/cv/:token`, `/pay/:token`).

---

## 6. Known gaps / notes (be honest)
- The role set is not a numeric *ladder* — `level` is informational. Access = persona-capability + operator(root) + edge `allowedRoles`.
- The marketplace **#227 pyramid still keys on the workspace tree** (a supplier/architect *node* with parent/rank/commission). So the Role grants the *surface*; the workspace node provides the *downstream data* (`/network` shows only the caller's own subtree via `get_manageable_workspaces`). A user tagged `supplier` with no workspace node sees the surface but an empty network until a node exists.
- `super_admin` was merged into `admin`; leftover `'super_admin'` strings in edge `allowedRoles` are harmless dead entries.
- Agent **sub-agent orchestration** is documented as admin/owner-only, but tool-list filtering by role at injection time should be re-verified.

---

_Last verified against `src/auth/capabilities.ts`, `src/components/core/{AuthGuard,AdminGuard,CapabilityGuard}.tsx`, `supabase/functions/_shared/auth.ts`, and the live `roles` table. Update this file when `PERSONA_CAPABILITIES` or the guards change._


## Functional team roles (added 2026-07-31)

Sales was the only business function with real team roles. HR, Warehouse and Marketing each had a
module, a portal and capabilities but **no role that granted them** — so the only way to let someone
run HR was making them a workspace `admin`, which also handed over finance, pricing, the network and
the team. `hr_departments.head_contact_id` is a label on a department row; it grants nothing.

HR mirrors Sales exactly (a staff tier + a manager tier). Warehouse and Marketing get ONE role each
for now: there is no second capability to split them on yet, and a manager tier behaving identically
to its staff tier would be inert UI. The split lands with the access-level pass.

These personas are deliberately **minimal** — each holds only its own module's capability plus
`agent.use`. Widening them is the access-level work; [tests/unit/workspaceRoles.test.ts](../tests/unit/workspaceRoles.test.ts)
pins the floor: no functional team role may ever hold `platform.admin`, `network.manage`,
`pricing.manage` or `catalog.import`, and each must hold its own module capability and not its
neighbours'. Module **entitlement** is still enforced separately, so holding the capability gets you
nothing until the workspace owns the module.


### Which axis owns what

`public.roles` (account tier, `/admin/crm` → Users) answers **what kind of account this is**,
platform-wide: operator, supplier, architect. `role_upgrade_requests` only ever accepts
`supplier` | `architect`, which is the clearest statement of that table's intent.

`workspace_members.role` (Profile → Team) answers **what this person does in THIS workspace**. Every
functional team role belongs here and nowhere else — putting one in `public.roles` would make it
true in every workspace the user belongs to, which is never what "invite someone to run HR" means.
