# Project Workspace

Container above moodboards, quotes, and tasks — one row per engagement. Tracks rooms, deadlines, budget vs. actual, presentation sheets, and **passwordless email invitations** so clients can view a curated read-only slice without creating an account.

---

## Overview

Before Projects, moodboards and quotes were standalone objects scoped to one user. There was no place to say *"these three moodboards + this quote + that pinboard + the tile-selection task all belong to the same client engagement."* Projects fixes that — it's an opt-in container that gathers all the related artifacts under one roof and adds the missing primitives: **rooms**, **budget vs actual**, **tasks** (with one-level GitHub-style subtasks), an **append-only timeline**, and **read-only collaborator invites** that work over plain email.

**Routes:**
- `/projects` — list of the user's active projects (card grid)
- `/projects/:id` — project detail (7 tabs: Overview / Rooms / Moodboards / Quotes / Sheets / Tasks / Timeline)
- `/projects/invite/:token` — public landing for invitees (no auth)
- `/projects/accept-invite?token=…` — post-OTP redirect target

**Top-level nav:** between Agent Hub and MoodBoards. Module-gated on `projects` (default-enabled).

**Module folder:** [`src/modules/projects/`](../src/modules/projects/) — manifest, ModuleDefinition, service, pages, components.

**External API:** [docs/projects-api.md](projects-api.md) (`/api/v1/projects/*` — Bearer `kai_*` partner integrations).

**JARVIS agent surface:** four tools on the `kai` + `interior-designer` agents — `create_project`, `list_my_projects`, `find_project`, `add_task`. See [supabase/functions/_shared/tools/project-tools.ts](../supabase/functions/_shared/tools/project-tools.ts).

---

## Mental model

A project is the **engagement** — one client, one timeline, one budget. Everything else hangs off it:

```
workspace (tenant)
  └─ project ("Kavouri Villa Renovation")
       ├─ client (crm_company XOR crm_contact)
       ├─ rooms (optional — bedroom / bathroom / kitchen / …)
       ├─ moodboards (existing table, gains project_id + room_id)
       │    └─ presentation sheets (existing — roll up at project level)
       ├─ quotes (existing table, gains project_id + parent_quote_id + revision_number)
       ├─ tasks (with subtasks, max 1 level of nesting)
       ├─ events (append-only audit log — capped at 500 per project)
       └─ collaborators (passwordless email invites — read-only)
```

**Critical design call:** projects are an **opt-in overlay**. Existing moodboards and quotes keep working untouched; they just have no `project_id`. We do not backfill or force migration. (Per the [no dual-read transitions](../CLAUDE.md) rule, we add one new path — we don't try to maintain two semantics on the existing tables.)

---

## Tables

All four tables landed across migrations `projects_module_phase_1` → `projects_module_phase_4_collaborators` (applied via `mcp__supabase__apply_migration`). RLS is owner-only by default; Phase 4 adds permissive collaborator-read overlays.

### `projects`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `user_id` | uuid FK auth.users | Required. CASCADE on user delete. |
| `workspace_id` | uuid FK workspaces | Optional (nullable). |
| `name`, `description` | text | |
| `status` | text | `planning` / `in_progress` / `on_hold` / `completed` / `archived`. |
| `client_company_id` | uuid FK crm_companies | XOR with `client_contact_id`. Both nullable (no client yet). |
| `client_contact_id` | uuid FK crm_contacts | XOR with `client_company_id`. |
| `deadline` | date | Optional. |
| `budget_amount` | numeric(12,2) | Optional. |
| `budget_currency` | text | Default `EUR`. |
| `cover_image_url` | text | Optional. |
| **Denormalised cache** | | Maintained by triggers — read directly, do not write. |
| `actual_amount` | numeric(12,2) | `SUM(grand_total)` of `accepted` quotes attached to the project. |
| `accepted_quote_count` | int | |
| `moodboard_count` | int | |
| `last_activity_at` | timestamptz | Bumped on every trigger fire. |

### `project_rooms`

`(id, project_id, name, room_type, sort_order, budget_amount, deadline, notes, created_at, updated_at)` — `room_type` is constrained to the enum `bedroom / bathroom / kitchen / living / dining / office / outdoor / hallway / other`.

Optional — single-space projects skip this table. The UI hides the room column when count = 0.

### `project_tasks`

`(id, project_id, parent_task_id, room_id, title, description, status, assignee_id, due_date, visibility, sort_order, created_by, created_at, updated_at, completed_at)`

**Subtask rule (enforced by `_project_tasks_enforce_depth_cap` trigger):** a task with `parent_task_id IS NOT NULL` cannot itself become a parent, and a task with children cannot become a subtask. Max nesting depth = 1 — same as GitHub sub-issues. Cross-project links are also rejected by the trigger.

**`status`**: `todo` / `in_progress` / `done` / `blocked`. Flipping to/from `done` auto-stamps `completed_at` via the `_project_tasks_sync_completed_at` trigger.

**`visibility`**: `internal` (default) or `client_visible`. The collaborator read policy (Phase 4) filters tasks down to `client_visible`-only.

### `project_events`

Append-only audit log: `(id, project_id, event_type, actor_id, payload jsonb, occurred_at)`. Capped at **500 entries per project** by the `append_project_event` SECURITY DEFINER RPC (oldest pruned when overflowing).

**Emitted event types** (by triggers on the source tables):

| Source | Events |
|---|---|
| `projects` | `project.created`, `project.status_changed`, `project.budget_changed`, `project.deadline_changed` |
| `project_rooms` | `room.added`, `room.removed` |
| `moodboards` | `moodboard.attached`, `moodboard.detached` |
| `quotes` | `quote.attached`, `quote.detached`, `quote.status_changed`, `quote.revised` |
| `project_tasks` | `task.created`, `task.completed`, `task.deleted`, `subtask.created`, `subtask.completed`, `subtask.deleted` |

Each row carries a `payload jsonb` with the fields relevant to that event (e.g. `quote.status_changed` carries `quote_id, name, from, to, grand_total, currency`).

### `project_collaborators` (Phase 4 — passwordless invites)

`(id, project_id, email, user_id, share_token, role, invited_by, invited_at, accepted_at, revoked_at, expires_at, message, created_at)`

- `email` is the load-bearing identity (immutable from the moment of invite).
- `user_id` stays NULL until the invitee signs in via OTP and accepts.
- `share_token` is a UUID embedded in the public invite URL.
- `expires_at` defaults to `invited_at + 90 days`.
- `role` is reserved for future use (currently only `client`).

---

## RLS model

**Owner-all** (Phase 1): `user_id = auth.uid()` gets full ALL on `projects` / `project_rooms` / `project_tasks` / (via parent project lookup) `project_events`.

**Collaborator-read** (Phase 4): five additional permissive SELECT policies on `projects` / `project_rooms` / `project_tasks` (filtered to `client_visible`) / `moodboards` / `moodboard_items` / `moodboard_presentation_sheets` / `quotes`, gated on the EXISTS predicate:

```sql
EXISTS (
  SELECT 1 FROM public.project_collaborators pc
  WHERE pc.project_id = <table>.project_id
    AND pc.user_id = auth.uid()
    AND pc.revoked_at IS NULL
    AND (pc.expires_at IS NULL OR pc.expires_at > now())
)
```

Tasks add the extra `visibility = 'client_visible'` filter so internal tasks stay hidden.

**Note**: `quote_items` is intentionally **not** in the collaborator-read set. Collaborators can see that a quote exists (`name`, `status`, `grand_total`) but not its line items. That keeps the internal pricing surface hidden by default. Adjust deliberately if you need to expose it.

---

## RPCs

| Function | Returns | Notes |
|---|---|---|
| `append_project_event(project_id, event_type, actor_id, payload)` | uuid | SECURITY DEFINER. Caps the timeline at 500 events per project. |
| `accept_project_invitation(share_token)` | TABLE(project_id, project_name) | SECURITY DEFINER. Verifies the JWT `email` matches the invitation, stamps `user_id` + `accepted_at`. |
| `get_project_invitation_preview(share_token)` | TABLE(project_name, project_id, invited_email_masked, invited_by_name, expires_at, is_revoked, is_expired) | SECURITY DEFINER. Pre-auth lookup for the public landing page. Grant: `anon, authenticated`. |

---

## Triggers

| Trigger | When | Effect |
|---|---|---|
| `quotes_refresh_project_budget_iu` / `_d` | After INSERT/UPDATE OF (status, project_id, grand_total) / DELETE on `quotes` | Recomputes `projects.actual_amount` + `accepted_quote_count` + `last_activity_at`. Handles cross-project moves. |
| `moodboards_refresh_project_count_iu` / `_d` | Same for `moodboards` | Recomputes `projects.moodboard_count`. |
| `project_tasks_depth_cap` | Before INSERT/UPDATE OF parent_task_id | Enforces max 1 level of nesting + same-project constraint. |
| `project_tasks_completed_at` | Before INSERT/UPDATE OF status | Auto-stamps `completed_at` on flip to/from `done`. |
| `projects_log_events` | After INSERT/UPDATE on `projects` | Writes `project.created` / `status_changed` / `budget_changed` / `deadline_changed` to `project_events`. |
| `project_rooms_log_events` | After INSERT/DELETE on `project_rooms` | Writes `room.added` / `room.removed`. |
| `moodboards_log_project_events` | After INSERT/UPDATE OF project_id on `moodboards` | Writes `moodboard.attached` / `moodboard.detached`. |
| `quotes_log_project_events` | After INSERT/UPDATE OF (project_id, status) on `quotes` | Writes `quote.attached` / `detached` / `status_changed` / `revised` (the last when `parent_quote_id IS NOT NULL`). |
| `project_tasks_log_events` | After INSERT/UPDATE OF status / DELETE on `project_tasks` | Writes `task.created` / `completed` / `deleted` (or the `subtask.*` variants). |
| Trigger functions for `updated_at` | Before UPDATE on each of the new tables | Single shared `_projects_touch_updated_at()` function. |

---

## Service layer

[`src/modules/projects/services/projectsService.ts`](../src/modules/projects/services/projectsService.ts) — single class with three concerns:

1. **CRUD** for projects / rooms / tasks (`listProjects`, `getProject`, `createProject`, `updateProject`, `archiveProject`, `listRooms`, `createRoom`, …).
2. **Rollups**: `getRoomBudgetSummary(projectId)` aggregates `accepted` quote-item `line_total` per `room_id`.
3. **Collaborators**: `inviteCollaborator`, `listCollaborators`, `revokeCollaborator`, `resendCollaboratorInvite`, `getInvitationPreview`, `acceptInvitation`, `isCollaborator`.

It talks to Supabase directly (anon key for authenticated user reads/writes, RLS enforces ownership). The invite email is sent via the `email-api` edge function.

---

## Collaborator invitation flow (Phase 4 — passwordless)

1. **Owner** clicks **Invite client** on `/projects/:id`. Modal opens → owner types email + optional message → submit.
2. We `INSERT INTO project_collaborators (project_id, email, invited_by, message)`. The DB defaults `share_token` + `expires_at`.
3. We dispatch a branded HTML email via `email-api?action=send` with a link to `/projects/invite/{share_token}`.
4. **Invitee** opens the link → public [InviteLandingPage](../src/modules/projects/pages/InviteLandingPage.tsx). The page calls `get_project_invitation_preview` (no auth required) to render the project name + a masked email (`ba••••@gmail.com`) so the invitee can confirm they're at the right invite.
5. Invitee types their email → submit → we call `supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: true, emailRedirectTo: '/projects/accept-invite?token=…' } })`. Supabase sends a magic link.
6. Invitee clicks the magic link → Supabase auth exchanges the OTP for a session and redirects to [AcceptInvitePage](../src/modules/projects/pages/AcceptInvitePage.tsx).
7. AcceptInvitePage calls the `accept_project_invitation(share_token)` RPC. The RPC checks `auth.jwt() ->> 'email'` matches `project_collaborators.email`, then stamps `user_id = auth.uid()` + `accepted_at = now()`. RLS now grants read access.
8. Redirect to `/projects/:id`. The same `ProjectDetailPage` renders, but the `isOwner` check is false → collaborator-only UI (no Timeline tab, no budget, no internal tasks, no add/edit/delete controls).

**Security**: 2-factor — possession of the share-token link AND control of the matching email inbox. Either alone isn't enough. Revocation is immediate (RLS checks `revoked_at IS NULL` on every query).

---

## Quote revisions (Phase 2)

`quotes.parent_quote_id` + `quotes.revision_number` form a per-quote revision chain. "Issue Revision" on `QuoteDetailAdminPage` clones the source quote + all items, links the new row to the chain root, bumps `revision_number`, status = `draft`. The project's `QuotesTab` groups quotes by chain root and renders them as `rev 1 → rev 2 → rev 3` so the audit trail of "what was sent, when, accepted by whom" stays intact.

---

## Structured rooms on quote items (Phase 2 — partially shipped)

`quote_items.room_id` (FK → `project_rooms`, ON DELETE SET NULL) co-exists with the legacy freeform `quote_items.room` text column. The `quote_items_with_room` view exposes `effective_room_name = COALESCE(joined room.name, freeform string)` so consumers can switch transparently.

**Status:** the column + view + service support are live. The structured-room-picker UI swap in `AddProductsSheet` is a deferred follow-up — the freeform text input still works.

---

## JARVIS agent integration

Four tools on the `kai` + `interior-designer` agents. Source: [supabase/functions/_shared/tools/project-tools.ts](../supabase/functions/_shared/tools/project-tools.ts). All are 0 credits (DB-only) and module-gated on `projects`.

| Tool | When the agent should call it | Notes |
|---|---|---|
| `create_project(name, description?, deadline?, budget_amount?, budget_currency?, rooms[]?)` | User says "start a project for X" | Rooms only when explicitly listed. |
| `list_my_projects(include_archived?)` | "what am I working on", "show my projects" | Returns budget + deadline + counts. |
| `find_project(query)` | Before any project-scoped action when project is referenced by name | Fuzzy name match, max 5 results. |
| `add_task(project_id ∣ project_name, title, parent_task_id?, room_name?, due_date?, visibility?)` | "remind me to X for [project]" | Resolves project + room by name internally. Pass `parent_task_id` for subtasks. |

A JARVIS prompt addendum (idempotent block `--BEGIN_PROJECT_WORKSPACE_ADDENDUM--`) teaches both agents the natural-language mappings to these tools.

---

## Frontend pages + components

| File | Purpose |
|---|---|
| [pages/ProjectsListPage.tsx](../src/modules/projects/pages/ProjectsListPage.tsx) | Card grid with budget bar + deadline countdown. |
| [pages/ProjectDetailPage.tsx](../src/modules/projects/pages/ProjectDetailPage.tsx) | 7 tabs. `isOwner` check switches between owner UX and collaborator UX. |
| [pages/InviteLandingPage.tsx](../src/modules/projects/pages/InviteLandingPage.tsx) | Public, no auth. Pre-auth invitation preview + email entry. |
| [pages/AcceptInvitePage.tsx](../src/modules/projects/pages/AcceptInvitePage.tsx) | Magic-link redirect target. Calls `accept_project_invitation`. |
| [components/CreateProjectModal.tsx](../src/modules/projects/components/CreateProjectModal.tsx) | Wizard: name + client + rooms + deadline + budget. Calls `useUserRole()` to switch the client picker between admin/simple modes. |
| [components/ClientPicker.tsx](../src/modules/projects/components/ClientPicker.tsx) | Admin mode: B2B/B2C tabs over full CRM. Simple mode: contact-only, scoped to user's own contacts, with inline "+ Add new client" form. |
| [components/ProjectPickerInline.tsx](../src/modules/projects/components/ProjectPickerInline.tsx) | Reusable picker embedded in `CreateQuoteModal` + `AddToMoodboardModal` so existing flows can attach to a project. |
| [components/InviteCollaboratorsModal.tsx](../src/modules/projects/components/InviteCollaboratorsModal.tsx) | Owner-only invite/list/revoke/resend/copy-link. |
| [components/tabs/](../src/modules/projects/components/tabs/) | Seven tab components: Overview / Rooms / Moodboards / Quotes / Sheets / Tasks / Timeline. Each accepts `isOwner` for collaborator-aware rendering. |

---

## Integration points with other modules

| Module | Integration |
|---|---|
| **Moodboards** | `moodboards.project_id` + `room_id` columns. `AddToMoodboardModal` shows the project picker on the new-moodboard branch. `MoodboardsTab` in the project lists every linked moodboard. |
| **Quotes** | `quotes.project_id` column. `CreateQuoteModal` shows the project picker. `QuotesTab` groups quotes by revision chain. Quote acceptance feeds `projects.actual_amount` via trigger. |
| **CRM** | `projects.client_company_id` XOR `client_contact_id` (mirrors `quotes` pattern). Owner picker hits the full CRM; non-admin picker is scoped to the user's own contacts with inline add-new. |
| **Presentation sheets** | `SheetsTab` rolls up `moodboard_presentation_sheets` across every moodboard attached to the project. |
| **JARVIS agent** | Four tools listed above + system-prompt addendum on `kai` + `interior-designer`. |
| **email-api** | Used by both the frontend service AND the MIVAA wrapper to send branded HTML invite emails. No template needed (HTML is rendered inline). |

---

## What we deliberately don't do

- **No forced backfill.** Existing moodboards and quotes created before Projects shipped stay project-less.
- **Projects ≠ workspaces.** Workspace = tenant/org boundary. Project = one engagement inside the workspace.
- **No hard delete via API.** Archive only — the financial / audit history is load-bearing.
- **Quote line items are not exposed to collaborators.** They see quote name + status + total only.
- **No collaborator write access.** Read-only by design; comments/approval is a future feature (issue #2 in the brainstorm).
- **No realtime collaboration.** Standard cache-invalidate-on-action; no presence channels.

---

## Operational notes

- The MIVAA wrapper at `/api/v1/projects/*` requires `PUBLIC_APP_URL` env var on the MIVAA host so the invite emails point at production (falls back to `https://app.materialshub.gr`).
- Frontend invite emails read `VITE_PUBLIC_APP_URL` (build-time env var, falls back to `window.location.origin`).
- After applying any migration touching projects, regenerate `src/integrations/supabase/types.ts` to drop the `as any` casts in `projectsService.ts` — non-blocking, runtime works without it.
- Edge functions touched: `agent-chat` (added 4 JARVIS tools) + `email-api` (used for invites, no changes). Deploy `agent-chat` to bring the agent tools live.

---

## Pending follow-ups (not shipped)

- **Structured room picker on `AddProductsSheet`** — DB column ready, UI swap not done. Freeform `quote_items.room` text still works.
- **Client share + approval flow** (issue #2 in the brainstorm) — read-only collaborator surface is live (Phase 4); per-item comments + approve/reject is the natural next layer on top.
- **AgentHub rich-card chunk renderer for `project_created`** — agent's text reply works fine, cards are polish.
- **Activity surface for collaborators** — they currently can't see Timeline events. A `client_visible_events` filter would be the equivalent of `client_visible` on tasks.
- **External-API collaborator acceptance via partner credentials** — today the invitee MUST go through Supabase OTP. A future API could let a partner accept on the invitee's behalf via the share_token + a verified-email assertion.

---

## See also

- [docs/projects-api.md](projects-api.md) — full external API reference (Bearer `kai_*` partner endpoints).
- [src/modules/projects/](../src/modules/projects/) — frontend source.
- [supabase/functions/_shared/tools/project-tools.ts](../supabase/functions/_shared/tools/project-tools.ts) — JARVIS agent tools.
- [mivaa-pdf-extractor/app/api/project_tracking_routes.py](../mivaa-pdf-extractor/app/api/project_tracking_routes.py) — Python MIVAA wrapper.
- Phase 1 → 4 migrations (apply order):
  - `projects_module_phase_1` — tables, columns, triggers, RLS.
  - `projects_module_phase_2` — quote revisions + `quote_items.room_id`.
  - `projects_module_phase_3` — `project_events` + timeline triggers.
  - `projects_module_phase_4_collaborators` — invitations + accept/preview RPCs + collaborator-read RLS.
