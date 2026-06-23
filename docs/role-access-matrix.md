# Role & Access Matrix

Single source of truth for **who can see/do what** on the platform. Reflects the
code as of this writing — where the model is *not* enforced, it says so explicitly.

> TL;DR — there are **two different "role" concepts**, and day-to-day access is driven
> by the **persona** (derived from workspace membership), not by the global account role.

---

## 1. The two "role" concepts

### a) Account role — `roles` table (`user_profiles.role_id`)
A global, per-user value. Levels: `user`(1) · `dealer`(2) · `factory`(3) · `finance`(4) · `admin`(5) · `super_admin`(6).

What it **actually** gates:
- `admin` / `super_admin` (and `owner` of the **root** workspace) ⇒ **Platform Operator** — full `/admin/*` access.
- `admin` specifically ⇒ passes the `is_admin_user()` RLS check on admin-governed tables.
- **`dealer` and `factory` as *global* account roles are essentially vestigial** — the frontend does not branch on them (the `FACTORY_OR_ADMIN_ROLES` constant is unused). Dealer/architect behaviour comes from **workspace ownership + marketplace rank**, not this column. The `dealer`↔`factory` values are still used by the role-upgrade-request approval flow.

Managed in **Admin → CRM → Users** (inline Role dropdown).

### b) Workspace membership role — `workspace_members.role`
Per workspace: `owner` · `admin` · `member` · `client` · `accountant` · `sales`. Combined with the workspace's **marketplace rank** (`operator` / `dealer` / `architect`) and the platform-operator flag, this resolves to a single **persona**, which is what gates features.

Source of truth: [`src/auth/capabilities.ts`](../src/auth/capabilities.ts).

---

## 2. Personas (the real access tiers)

| Persona | Who | How it's resolved |
|---|---|---|
| **operator** | Platform team | `owner`/`admin`/`super_admin` (account role) of the **root** workspace → `isPlatformOperator` |
| **dealer** | Supplier node owner | workspace `owner`/`admin` + rank `dealer` (or root-rank, non-operator) |
| **architect** | Architect node owner | workspace `owner`/`admin` + rank `architect` |
| **staff** | Business team member | workspace `member` |
| **accountant** | Invited external accountant | workspace role `accountant` |
| **sales** | Invited sales rep | workspace role `sales` |
| **end_user** | Project client / referral | workspace role `client` |

Resolution order is in `resolvePersona()` — `client` → `accountant` → `sales` → owner/admin(by rank) → `staff`.

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
   - Agents: KAI / Interior Designer → `viewer/member/admin/owner`; Demo + `insights`/`seo` aliases → `admin/owner` only.
5. **Postgres RLS** — `is_admin_user()` (account role = **`admin`** only — note: not `super_admin`), `is_workspace_member(workspace_id)` (row belongs to a workspace you're in). Used by CRM/activity/notes/finance tables.

---

## 5. Public (no auth) surfaces
`/tools` (IP-quota), `/knowledge-base`, `/brand/:slug`, `/u/:userId`, `/ar/:productId`, and token-gated links (`/board/:id`, `/q/:token`, `/c/:slug`, `/cv/:token`, `/pay/:token`).

---

## 6. Known gaps / not-enforced (be honest)
- The **global role *hierarchy* is not a ladder** — there's no "level ≥ N grants X". Access is `auth` + persona-capability + platform-operator + edge `allowedRoles`.
- **Global `dealer`/`factory` account roles** don't drive frontend access (dealer/architect behaviour is workspace-rank based). They're effectively labels + inputs to the upgrade-request flow.
- **`is_admin_user()` matches `admin` only, not `super_admin`** — a `super_admin` who isn't also a workspace member can miss some RLS-gated reads. Workspace membership + `owner`/`admin` cover the normal operator case.
- Agent **sub-agent orchestration** is documented as admin/owner-only, but tool-list filtering by role at injection time should be re-verified.

---

_Last verified against `src/auth/capabilities.ts`, `src/components/core/{AuthGuard,AdminGuard,CapabilityGuard}.tsx`, `supabase/functions/_shared/auth.ts`, and the live `roles` table. Update this file when `PERSONA_CAPABILITIES` or the guards change._
