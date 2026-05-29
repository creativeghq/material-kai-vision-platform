# Project Workspace API

External Project Workspace API — create projects, attach rooms, manage tasks (with subtasks), invite read-only collaborators by email, and read the timeline. Mirror of the price / mention / job tracking patterns: `Authorization: Bearer kai_*` API key auth, per-call partner credit metering for the few writes that incur platform cost.

For the module overview (architecture, RLS model, triggers, frontend), see [docs/projects.md](../projects.md).

**Host**: `https://v1api.materialshub.gr`
**OpenAPI tag**: `Project Workspace (Public API)`
**Interactive docs (Swagger UI)**: `GET https://v1api.materialshub.gr/docs` — filter by tag
**Machine-readable spec**: `GET https://v1api.materialshub.gr/openapi.json` — auto-generated from FastAPI route signatures, always in sync with what's deployed.

---

## Changelog

### v0.1.0 — 2026-05-24 — Initial release

- 16 endpoints across project CRUD, rooms, tasks (with subtasks), collaborator invitations, and the read-only event timeline.
- Auth: `Authorization: Bearer kai_*` (same `api_keys` table as price / mention / job tracking).
- Credits: writes are 0 cr except `invite_collaborator` (1 cr — covers the transactional email).
- Reads are 0 cr.
- Soft-delete semantics on projects (archive, never hard delete).
- Subtasks via `parent_task_id` — max 1 level of nesting, enforced by trigger.
- Read-only timeline of the last 500 events per project.
- Collaborator invitations send a branded HTML email via the platform's `email-api`; invitees sign in passwordlessly via Supabase OTP.

---

## Authentication

All endpoints require an API key issued to a platform user. Send it as:

```
Authorization: Bearer kai_<your_api_key>
```

Get a key from `/profile` → API Keys (admin role can issue keys for any user via `/admin/api-keys`). Keys are scoped to one platform user (`api_keys.user_id`); every project created via the API is owned by that user with the standard Supabase RLS guarantees (no other user / no other api_key can read or write it).

Missing or malformed key → `401`. Key revoked or expired → `401`. Key valid but referencing a deleted user → `403`. Key valid but you're trying to operate on a project owned by a different user → `404` (we don't leak existence by returning `403`).

Internal flow (browser session JWT) is **not** exposed via this API — it talks to Supabase directly. The TypeScript SDK in `src/modules/projects/services/projectsService.ts` is the canonical client for that path.

---

## Pricing

| Operation | Credits | Notes |
|---|---|---|
| Reads (list, get, list rooms / tasks / collaborators / events) | 0 | No upstream cost. |
| Project create / update / archive | 0 | Pure DB write. |
| Room create / delete | 0 | |
| Task create / update / delete | 0 | |
| `invite_collaborator` | **1** | Covers the transactional email via `email-api`. Refunded on hard failure (the row is still created so you can `copy_link` manually). |
| `revoke_collaborator` | 0 | |

`402 Insufficient credits` returned when balance won't cover the requested op. Top up at `/profile` → Credits.

Standard MIVAA rate limit applies (`60 req/min` default per key, configurable per-key by an admin). `429 Too Many Requests` with `Retry-After` header.

---

## Endpoint inventory

| # | Method | Path | Auth | Cr | Summary |
|---|---|---|---|---|---|
| 1 | POST | `/api/v1/projects` | kai_* | 0 | Create a project (+ optional inline rooms) |
| 2 | GET | `/api/v1/projects` | kai_* | 0 | List the API key user's projects |
| 3 | GET | `/api/v1/projects/{id}` | kai_* | 0 | Get one project |
| 4 | PUT | `/api/v1/projects/{id}` | kai_* | 0 | Update project fields |
| 5 | DELETE | `/api/v1/projects/{id}` | kai_* | 0 | Archive project (soft delete) |
| 6 | GET | `/api/v1/projects/{id}/rooms` | kai_* | 0 | List rooms |
| 7 | POST | `/api/v1/projects/{id}/rooms` | kai_* | 0 | Add a room |
| 8 | DELETE | `/api/v1/projects/rooms/{room_id}` | kai_* | 0 | Delete a room |
| 9 | GET | `/api/v1/projects/{id}/tasks` | kai_* | 0 | List tasks (subtasks nested) |
| 10 | POST | `/api/v1/projects/{id}/tasks` | kai_* | 0 | Add a task or subtask |
| 11 | PUT | `/api/v1/projects/tasks/{task_id}` | kai_* | 0 | Update a task |
| 12 | DELETE | `/api/v1/projects/tasks/{task_id}` | kai_* | 0 | Delete a task (CASCADEs subtasks) |
| 13 | GET | `/api/v1/projects/{id}/collaborators` | kai_* | 0 | List collaborator invitations |
| 14 | POST | `/api/v1/projects/{id}/collaborators` | kai_* | 1 | Invite a collaborator (sends email) |
| 15 | DELETE | `/api/v1/projects/collaborators/{id}` | kai_* | 0 | Revoke access immediately |
| 16 | GET | `/api/v1/projects/{id}/events` | kai_* | 0 | Read the event timeline (newest first) |

---

## Quickstart

```bash
# 0. Set your key
KEY="kai_..."
HOST="https://v1api.materialshub.gr"

# 1. Create a project with inline rooms
curl -X POST "$HOST/api/v1/projects" \
  -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
  -d '{
    "name": "Kavouri Villa Renovation",
    "description": "Full refit — coastal palette, beige + ivory tones",
    "deadline": "2026-09-30",
    "budget_amount": 50000,
    "budget_currency": "EUR",
    "rooms": [
      { "name": "Master Bath", "room_type": "bathroom" },
      { "name": "Kitchen", "room_type": "kitchen" },
      { "name": "Living", "room_type": "living" }
    ]
  }'
# → { "success": true, "data": { "project": { "id": "...", ... }, "rooms": [ ... ] } }

PROJECT_ID="<id from above>"

# 2. Add a task with a subtask
curl -X POST "$HOST/api/v1/projects/$PROJECT_ID/tasks" \
  -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
  -d '{ "title": "Order marble samples", "visibility": "client_visible" }'
# → { "success": true, "data": { "id": "PARENT_TASK_ID", ... } }

curl -X POST "$HOST/api/v1/projects/$PROJECT_ID/tasks" \
  -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
  -d '{ "title": "Chase invoice from supplier", "parent_task_id": "PARENT_TASK_ID" }'

# 3. Invite a client (sends magic-link email, no password)
curl -X POST "$HOST/api/v1/projects/$PROJECT_ID/collaborators" \
  -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
  -d '{
    "email": "client@example.com",
    "message": "Take a look when you have a moment.",
    "expires_in_days": 90
  }'
# → 1 credit debited; row contains share_token + invite URL is /projects/invite/<share_token>

# 4. Read the timeline
curl -X GET "$HOST/api/v1/projects/$PROJECT_ID/events?limit=50" \
  -H "Authorization: Bearer $KEY"

# 5. Archive when done
curl -X DELETE "$HOST/api/v1/projects/$PROJECT_ID" \
  -H "Authorization: Bearer $KEY"
```

---

## Endpoint reference

### 1. `POST /api/v1/projects` — Create project

Insert one `projects` row owned by the API key's user, optionally with inline rooms.

**Request body:**

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| `name` | string | ✅ | — | 1-200 chars. |
| `description` | string \| null | | null | Up to 4000 chars. |
| `status` | enum | | `planning` | `planning` / `in_progress` / `on_hold` / `completed` / `archived`. |
| `client_company_id` | uuid \| null | | null | XOR with `client_contact_id` (400 if both set). Must reference an existing `crm_companies` row. |
| `client_contact_id` | uuid \| null | | null | XOR with `client_company_id`. |
| `deadline` | date (YYYY-MM-DD) \| null | | null | |
| `budget_amount` | number \| null | | null | ≥ 0. |
| `budget_currency` | string(3) | | `EUR` | ISO 4217. |
| `cover_image_url` | string \| null | | null | Optional. |
| `rooms` | `Array<{ name, room_type? }>` \| null | | null | When set, rooms are inserted in the same call. `room_type` must be `bedroom`/`bathroom`/`kitchen`/`living`/`dining`/`office`/`outdoor`/`hallway`/`other`. |

**Response 200:**

```json
{
  "success": true,
  "data": {
    "project": {
      "id": "uuid",
      "user_id": "uuid",
      "workspace_id": "uuid | null",
      "name": "Kavouri Villa Renovation",
      "description": "Full refit ...",
      "status": "planning",
      "client_company_id": null,
      "client_contact_id": null,
      "deadline": "2026-09-30",
      "budget_amount": "50000.00",
      "budget_currency": "EUR",
      "cover_image_url": null,
      "actual_amount": "0.00",
      "accepted_quote_count": 0,
      "moodboard_count": 0,
      "last_activity_at": "2026-05-24T10:15:00Z",
      "created_at": "2026-05-24T10:15:00Z",
      "updated_at": "2026-05-24T10:15:00Z"
    },
    "rooms": [
      { "id": "uuid", "project_id": "uuid", "name": "Master Bath", "room_type": "bathroom", "sort_order": 0, ... }
    ]
  }
}
```

**Errors:** `400` (XOR violation), `401`, `403` (API key has no associated user), `500`.

### 2. `GET /api/v1/projects` — List projects

**Query params:** `include_archived` (bool, default `false`), `limit` (1-500, default 100).

**Response 200:** `{ success, data: Project[], count }`.

### 3. `GET /api/v1/projects/{project_id}` — Get one project

Returns the project row with all denormalised counters. `404` if not owned.

### 4. `PUT /api/v1/projects/{project_id}` — Update fields

PATCH-like semantics: only the fields you send are touched. Same XOR check on the two client FKs as create.

### 5. `DELETE /api/v1/projects/{project_id}` — Archive (soft delete)

Sets `status = 'archived'`. Hard-delete is intentionally not exposed through the API — the audit log, financial history, and collaborator records are load-bearing. To delete a project, log into the Supabase dashboard as the data owner.

### 6. `GET /api/v1/projects/{project_id}/rooms` — List rooms

Sorted by `sort_order` ascending.

### 7. `POST /api/v1/projects/{project_id}/rooms` — Add a room

**Body:** `{ name, room_type?, budget_amount?, deadline?, notes?, sort_order? }`.

### 8. `DELETE /api/v1/projects/rooms/{room_id}` — Delete a room

Cascades: `moodboards.room_id` becomes `NULL` for any moodboards that referenced this room (FK ON DELETE SET NULL). Quote items that used the structured `quote_items.room_id` likewise drop the link.

### 9. `GET /api/v1/projects/{project_id}/tasks` — List tasks

Returns a flat array of parent tasks, each with a `subtasks: []` field plus computed `subtask_total_count` and `subtask_done_count`. Sorted by `sort_order` then `created_at`.

```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "project_id": "uuid",
      "parent_task_id": null,
      "room_id": "uuid | null",
      "title": "Order marble samples",
      "status": "todo",
      "visibility": "client_visible",
      "due_date": "2026-06-01",
      "subtasks": [
        { "id": "uuid", "parent_task_id": "uuid", "title": "Chase invoice from supplier", "status": "in_progress", "visibility": "internal", ... }
      ],
      "subtask_total_count": 1,
      "subtask_done_count": 0,
      ...
    }
  ]
}
```

### 10. `POST /api/v1/projects/{project_id}/tasks` — Add task (or subtask)

**Body:**

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| `title` | string | ✅ | — | 1-500 chars. |
| `description` | string | | null | Up to 4000 chars. |
| `parent_task_id` | uuid | | null | When set, this becomes a subtask. Max nesting depth = 1 (enforced by trigger). The parent must be in the same project. |
| `room_id` | uuid | | null | Ignored when `parent_task_id` is set — subtasks inherit room from parent. |
| `status` | enum | | `todo` | `todo` / `in_progress` / `done` / `blocked`. |
| `due_date` | date | | null | |
| `visibility` | enum | | `internal` | `internal` (only owner sees it) or `client_visible` (collaborators see it). |
| `sort_order` | int | | 0 | |

**Notes on subtasks:**
- A task with a `parent_task_id` cannot itself have children.
- A task that already has children cannot become a subtask.
- Cross-project parenting is rejected.
- Deleting a parent CASCADEs to all subtasks.
- Status `done` auto-stamps `completed_at` (and reverts to NULL on un-done).

Trigger violations return `500` with the Postgres exception message in `detail`. The frontend treats those as "the model is correct, retry without parent_task_id".

### 11. `PUT /api/v1/projects/tasks/{task_id}` — Update task fields

Partial update. Status flips to `done` stamp `completed_at`; flips away from `done` clear it.

### 12. `DELETE /api/v1/projects/tasks/{task_id}` — Delete task

CASCADEs subtasks. Emits a `task.deleted` (or `subtask.deleted`) event in the timeline.

### 13. `GET /api/v1/projects/{project_id}/collaborators` — List invitations

Returns ALL rows (active / pending / revoked / expired). Filter client-side by:

```
active   = revoked_at IS NULL AND accepted_at IS NOT NULL AND expires_at > now()
pending  = revoked_at IS NULL AND accepted_at IS NULL AND expires_at > now()
revoked  = revoked_at IS NOT NULL
expired  = expires_at < now()
```

### 14. `POST /api/v1/projects/{project_id}/collaborators` — Invite

Inserts a `project_collaborators` row + sends a branded HTML email via the platform's `email-api`. The invitee opens the link, enters their email, signs in via Supabase OTP, and the `accept_project_invitation` RPC verifies their email matches the invitation before stamping `user_id`.

**Body:**

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| `email` | string | ✅ | — | The invitee's email. Forced to lowercase + trimmed on insert. |
| `message` | string \| null | | null | Up to 1000 chars. Shown in the invite email and stored on the row. |
| `expires_in_days` | int | | 90 | 1-365. Drives `expires_at`. |

**Response 200:**

```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "project_id": "uuid",
    "email": "client@example.com",
    "user_id": null,
    "share_token": "uuid",
    "role": "client",
    "invited_by": "uuid",
    "invited_at": "2026-05-24T10:15:00Z",
    "accepted_at": null,
    "revoked_at": null,
    "expires_at": "2026-08-22T10:15:00Z",
    "message": "Take a look when you have a moment.",
    "created_at": "2026-05-24T10:15:00Z"
  },
  "partner_credits_debited": 1
}
```

**The invite URL the invitee receives:** `https://app.materialshub.gr/projects/invite/<share_token>` (or whatever `PUBLIC_APP_URL` is set to on the MIVAA host).

**Errors:** `400` (invalid email), `402` (insufficient credits), `404` (project not owned by your API key), `409` (active invitation already exists for this email — revoke first to re-invite). Email-send failures are logged but do NOT cause the call to fail — the row + share_token are returned so you can `copy_link` manually.

### 15. `DELETE /api/v1/projects/collaborators/{collaborator_id}` — Revoke

Sets `revoked_at = now()`. Effect is **immediate** — RLS policies on every protected resource check `revoked_at IS NULL`, so the collaborator's next request returns the project as not-found.

### 16. `GET /api/v1/projects/{project_id}/events` — Read timeline

Newest events first, capped at the requested `limit` (default 100, max 500). The platform itself caps the per-project timeline at 500 entries (oldest pruned by the `append_project_event` RPC).

**Emitted event types:**

| Event | Payload fields |
|---|---|
| `project.created` | `{ name, budget_amount, budget_currency, deadline }` |
| `project.status_changed` | `{ from, to }` |
| `project.budget_changed` | `{ from, to, currency }` |
| `project.deadline_changed` | `{ from, to }` |
| `room.added` | `{ room_id, name, room_type }` |
| `room.removed` | `{ room_id, name, room_type }` |
| `moodboard.attached` | `{ moodboard_id, title, room_id }` |
| `moodboard.detached` | `{ moodboard_id, title }` |
| `quote.attached` | `{ quote_id, name, status }` |
| `quote.detached` | `{ quote_id, name }` |
| `quote.status_changed` | `{ quote_id, name, from, to, grand_total, currency }` |
| `quote.revised` | `{ quote_id, parent_quote_id, revision_number, name }` |
| `task.created` / `subtask.created` | `{ task_id, title, parent_task_id, visibility }` |
| `task.completed` / `subtask.completed` | `{ task_id, title, parent_task_id }` |
| `task.deleted` / `subtask.deleted` | `{ task_id, title, parent_task_id }` |

---

## Schemas

### Project

```typescript
interface Project {
  id: string;                       // uuid
  user_id: string;                  // owner
  workspace_id: string | null;
  name: string;
  description: string | null;
  status: 'planning' | 'in_progress' | 'on_hold' | 'completed' | 'archived';
  client_company_id: string | null; // XOR with client_contact_id
  client_contact_id: string | null;
  deadline: string | null;          // ISO date
  budget_amount: string | null;     // numeric — returned as string by PostgREST
  budget_currency: string;          // ISO 4217, default 'EUR'
  cover_image_url: string | null;
  // Denormalised cache (read-only, maintained by triggers)
  actual_amount: string;            // SUM(grand_total) of accepted quotes
  accepted_quote_count: number;
  moodboard_count: number;
  last_activity_at: string;         // ISO timestamp
  created_at: string;
  updated_at: string;
}
```

### Room

```typescript
interface ProjectRoom {
  id: string;
  project_id: string;
  name: string;
  room_type: 'bedroom' | 'bathroom' | 'kitchen' | 'living' | 'dining' | 'office' | 'outdoor' | 'hallway' | 'other' | null;
  sort_order: number;
  budget_amount: string | null;
  deadline: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}
```

### Task

```typescript
interface ProjectTask {
  id: string;
  project_id: string;
  parent_task_id: string | null;    // when set → subtask (max nesting = 1)
  room_id: string | null;           // subtasks inherit from parent
  title: string;
  description: string | null;
  status: 'todo' | 'in_progress' | 'done' | 'blocked';
  assignee_id: string | null;
  due_date: string | null;          // ISO date
  visibility: 'internal' | 'client_visible';
  sort_order: number;
  created_by: string;
  created_at: string;
  updated_at: string;
  completed_at: string | null;      // auto-stamped on status='done'
}

interface ProjectTaskWithSubtasks extends ProjectTask {
  subtasks: ProjectTask[];          // sorted by sort_order then created_at
  subtask_total_count: number;
  subtask_done_count: number;
}
```

### Collaborator

```typescript
interface ProjectCollaborator {
  id: string;
  project_id: string;
  email: string;                    // lowercase + trimmed
  user_id: string | null;           // NULL until accept
  share_token: string;              // bearer token in the invite URL
  role: 'client' | 'editor';        // 'editor' reserved for future use
  invited_by: string;
  invited_at: string;
  accepted_at: string | null;
  revoked_at: string | null;        // setting this revokes access immediately
  expires_at: string;               // default invited_at + 90 days
  message: string | null;
  created_at: string;
}
```

### Event

```typescript
interface ProjectEvent {
  id: string;
  project_id: string;
  event_type: string;               // see table above
  actor_id: string | null;
  payload: Record<string, any>;     // varies by event_type
  occurred_at: string;
}
```

---

## Error format

All errors return JSON with at least a `detail` string:

```json
{ "detail": "project not found" }
```

| Status | When |
|---|---|
| `400` | Validation failure (mutually exclusive fields both set; bad enum value; invalid email). |
| `401` | Missing / malformed / revoked API key. |
| `402` | Insufficient credits for the requested op. |
| `403` | API key has no associated user. |
| `404` | Resource not found OR not owned by your API key (we don't leak existence). |
| `409` | Duplicate active collaborator invitation for this email. |
| `429` | Rate limit exceeded (60 req/min default). `Retry-After` header included. |
| `500` | Postgres trigger violation (e.g. subtask depth cap) or service error. `detail` carries the upstream message. |

---

## Idempotency

- **Collaborators**: re-inviting the same email while an unrevoked invitation already exists returns `409`. Revoke first, then re-invite. No silent dedup — partner systems should treat each successful POST as a discrete invitation event.
- **Tasks / rooms**: no natural dedup key. Sending the same body twice creates two rows.
- **Project create**: no natural dedup key. Use the returned `id` for any follow-up calls.

---

## Webhooks

This API does not push webhooks on project events. To consume the event timeline:

1. **Poll**: `GET /api/v1/projects/{id}/events` periodically (events are capped at 500 per project so a daily poll is sufficient for most use cases).
2. **Internal flow only — Supabase realtime**: the frontend uses `supabase.channel(...).on('postgres_changes', { table: 'project_events', filter: 'project_id=eq.<id>' })` for live updates. External integrations would need their own listener.

Webhook push is on the roadmap once enough partners ask for it.

---

## Required environment variables (MIVAA host)

| Env var | Required | Default | Purpose |
|---|---|---|---|
| `SUPABASE_URL` | ✅ | — | Used to call email-api edge function from the invite path. |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ | — | Same. |
| `PUBLIC_APP_URL` | | `https://app.materialshub.gr` | Used to build the absolute invite URL in the email. Set this in production so the link points at your customer-facing host. |
| `RESEND_API_KEY` | ✅ (on the edge function) | — | Set on the `email-api` edge function, not on MIVAA. The invite email goes out via Resend. |

---

## Future / not yet shipped

- Webhook push on `project.*` / `task.*` / `quote.attached` / `quote.status_changed` events.
- Bulk write endpoints (`POST /api/v1/projects/{id}/tasks/bulk`).
- Editor-role collaborators (`role: 'editor'`) — schema supports it but RLS treats every collaborator as read-only today.
- Per-quote line-item access for collaborators (today they see quote summary only).
- Pre-signed download URLs for presentation sheets attached to project moodboards. Today the sheet PDF storage paths are returned in `GET /projects/{id}/events` (`moodboard.attached` payload) but you have to mint your own signed URL via Supabase storage.
- Acceptance-on-behalf-of-invitee — today the invitee MUST go through Supabase OTP. A future endpoint could let a partner confirm the email out-of-band and skip the OTP.

---

## See also

- [docs/projects.md](../projects.md) — full module architecture.
- [docs/api/README.md](README.md) — full API index.
- [docs/api/mention-monitoring-api.md](mention-monitoring-api.md) — sister Public API with the same auth + credit pattern.
- [docs/api/job-research-api.md](job-research-api.md) — same.
- [docs/api/price-monitoring-api.md](price-monitoring-api.md) — same.
- [mivaa-pdf-extractor/app/api/project_tracking_routes.py](../../mivaa-pdf-extractor/app/api/project_tracking_routes.py) — source.
