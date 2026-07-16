# Role & Access Matrix

Single source of truth for **who can see/do what** on the platform. Reflects the
code as of this writing — where the model is *not* enforced, it says so explicitly.

> TL;DR — there are **two different "role" concepts**, and day-to-day access is driven
> by the **persona** (derived from workspace membership), not by the global account role.

---

## 1. The two "role" concepts

### a) Account role — `roles` table (`user_profiles.role_id`)
A global, per-user value — **the access tier**. Set: `user`(1) · `sales`(2) · `supplier`(3) · `architect`(4) · `finance`(5) · `admin`(6). (Dealer+Factory merged into **supplier**; Super Admin merged into **admin**, 2026-06.)

This is now the **primary driver of the persona** (see §2) — `resolvePersona()` maps the account role to a persona, falling back to the workspace-derived persona only for `user`/unset. So setting the Role under **Admin → CRM → Users** is what actually grants a user's capabilities.

Reserved-tier rule: **`admin` is granted operator (see-all) ONLY via root-workspace ownership** (`isPlatformOperator`), never by the account role alone — a tenant can't self-escalate to platform operator. `is_admin_user()` RLS still keys on the `admin` role name.

Managed in **Admin → CRM → Users** (inline Role dropdown).

### b) Workspace membership role — `workspace_members.role`
Per workspace: `owner` · `admin` · `member` · `client` · `accountant` · `sales`. Combined with the workspace's **marketplace rank** (`operator` / `dealer` / `architect`) and the platform-operator flag, this resolves to a single **persona**, which is what gates features.

Source of truth: [`src/auth/capabilities.ts`](../src/auth/capabilities.ts).

---

## 2. Personas (the real access tiers)

| Persona | Account role that grants it | Notes |
|---|---|---|
| **operator** | (root-workspace ownership only) | `admin` of the **root** workspace. NOT granted by account role alone. |
| **dealer** (= Supplier tier) | `supplier` (or legacy `dealer`/`factory`) | Full business node + downstream. |
| **architect** | `architect` | Sells to end clients; own downstream. |
| **accountant** (Finance surface) | `finance` | Finance module; the `finance` role keeps **expense-approval** rights (it is NOT the restricted external accountant). |
| **sales** | `sales` | Sales portal + own customers. |
| **staff** / **end_user** | `user` / unset → workspace fallback | Team member / project client, resolved from the workspace role. |

Resolution (`resolvePersona()`): `isPlatformOperator` → operator; else **account role** maps the tenant tier; else the legacy workspace-derived persona (`client`→end_user, `accountant`→accountant, `sales`→sales, owner/admin by rank, member→staff).

The **invited external accountant** (workspace role `accountant`, #202) still resolves to the accountant persona but is flagged `isAccountant` to *restrict* it (no expense approval / no settings) — distinct from the internal `finance` account role.

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
- **operator** = everything **except** `sales.portal` (the Sales portal is the rep's surface only).
- **dealer** and **architect** are identical today (full business set); they differ only in marketplace position (dealer sells downstream, architect sells to end users).
- **accountant** is intentionally narrow — Finance surface only; within Finance, write-ops are further gated by `isWorkspaceManager` / `canOperateFinance`.
- **sales** sees only their **own** quotes (RLS on `user_id`); customer financials are workspace-scoped reads.

---

## 4. Enforcement layers (where it's actually checked)

1. **`AuthGuard`** — authenticated or not. Wraps the user-facing app.
2. **`CapabilityGuard` / `usePermissions().can(cap)`** — per-route/per-feature persona capability check (the table above). e.g. `/finance` needs `finance.manage`, `/network` needs `network.manage`.
3. **`AdminGuard`** — wraps all `/admin/*`. Passes only for **Platform Operator** (`owner`/`admin`/`super_admin` of the **root** workspace). A dealer/architect who owns their own workspace does **not** pass.
4. **Edge-function `allowedRoles`** (server, `_shared/auth.ts` — additive: global account role **or** any workspace role):
   - `admin` / `super_admin` / `owner` → all admin/CRM/email/messaging functions.
   - `crm-api` also allows `factory`.
   - Finance functions allow `finance`; issuing also allows `accountant`.
   - Agents: JARVIS / Interior Designer → `viewer/member/admin/owner`; Demo + `insights`/`seo` aliases → `admin/owner` only.
5. **Postgres RLS** — `is_admin_user()` (account role = **`admin`** only — note: not `super_admin`), `is_workspace_member(workspace_id)` (row belongs to a workspace you're in). Used by CRM/activity/notes/finance tables.

---

## 5. Public (no auth) surfaces
`/tools` (IP-quota), `/knowledge-base`, `/brand/:slug`, `/u/:userId`, `/ar/:productId`, and token-gated links (`/board/:id`, `/q/:token`, `/c/:slug`, `/cv/:token`, `/pay/:token`).

---

## 6. Known gaps / notes (be honest)
- The role set is not a numeric *ladder* — `level` is informational. Access = persona-capability + operator(root) + edge `allowedRoles`.
- **Account role drives the persona for the frontend** (2026-06 rewire). The marketplace **#227 pyramid still keys on the workspace tree** (a supplier/architect *node* with parent/rank/commission). So the Role grants the *surface*; the workspace node provides the *downstream data* (`/network` shows only the caller's own subtree via `get_manageable_workspaces`). A user tagged `supplier` with no workspace node sees the surface but an empty network until a node exists.
- `super_admin` was merged into `admin`; leftover `'super_admin'` strings in edge `allowedRoles` are harmless dead entries.
- Agent **sub-agent orchestration** is documented as admin/owner-only, but tool-list filtering by role at injection time should be re-verified.

---

_Last verified against `src/auth/capabilities.ts`, `src/components/core/{AuthGuard,AdminGuard,CapabilityGuard}.tsx`, `supabase/functions/_shared/auth.ts`, and the live `roles` table. Update this file when `PERSONA_CAPABILITIES` or the guards change._
