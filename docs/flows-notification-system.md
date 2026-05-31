# Flows — Notification & Automation System

_Last updated: 2026-05-31_

This document is the single reference for how platform notifications/emails are
delivered through the **Flows** engine, how events map to flows, and how the
governance layer (locking + System Areas) keeps coverage from silently breaking.

---

## 1. What this is

Historically, every "send a notification / email" action was hardcoded at its
call site (a direct `user_notifications` insert or an `email-api` call). That
made them invisible and uncontrollable — you couldn't pause, edit, retarget, or
add a channel without a code change.

The migration moved each of those sends behind a **flow event**. Now:

- The source code only **emits an event** (`flowEventService.emit(...)` on the
  frontend, `emitFlowEvent(...)` in edge functions) carrying a fully-resolved
  notification payload.
- A **flow** with a matching trigger picks up the event and performs the actual
  delivery (Create Notification / Send Email / Send Push / etc.).
- An admin can pause, edit, re-target, or extend any of these from the **Flows**
  admin page — no deploy required.

---

## 2. Architecture / execution model

```
source (frontend or edge fn)
   |  emit event: { type, payload }
   v
flow-engine  (action: 'trigger-event')
   |  find all flows where trigger_type = event AND status = 'active'
   v
for each matching flow -> execute graph (BFS over nodes)
   trigger -> condition(s) -> action(s)
```

- **Frontend emit:** `src/services/flows/flowEventService.ts -> emit(eventType, data)`
  (fire-and-forget; never throws into the calling feature).
- **Edge emit:** `supabase/functions/_shared/flow-events.ts -> emitFlowEvent(eventType, data)`.
- **Engine:** `supabase/functions/flow-engine/index.ts`.
  - `trigger-event` -> runs every **active** flow whose `trigger_type` matches.
  - `execute-flow` / `test-flow` -> run a single flow (used by **Run Now** + builder).
- **Templating:** action configs use `{{trigger.data.fieldname}}` (and `{{item}}`
  inside a Loop). Unresolved templates are guarded (see section 6).

### Tables

| Table | Purpose |
|---|---|
| `flows` | The flows themselves (`graph_definition` jsonb, `trigger_type`, `status`, `is_locked`, `tags`). |
| `flow_runs` | One row per execution (status, timing, error). |
| `flow_run_steps` | Per-node execution log within a run. |
| `flow_area_registry` | Coverage registry — maps each platform **area** to its canonical flow. |
| `user_notifications` | Bell notifications (written by the `create_notification` action). |

---

## 3. Triggers, actions, conditions

### Trigger types (event vocabulary)
Defined in `src/services/flows/types.ts` (`TriggerType`). Beyond the originals
(`manual` is removed — use **Run Now**; plus `scheduled`, `webhook`, `user_signup`,
quote/moodboard/profile events, etc.), the migration added:

`quote_pdf_generated`, `factory_approved`, `factory_rejected`,
`appointment_booked/confirmed/cancelled`, `svbrdf_extraction_complete`,
`virtual_staging_completed`, `vr_world_failed`,
`video_generation_completed/failed`, `background_agent_failed`,
`role_upgrade_request_submitted/approved/rejected`,
`stripe_payment_succeeded/failed`, `project_invitation_sent/resent`.

### Action types (engine handlers in `flow-engine/index.ts`)
- `create_notification` — insert into `user_notifications` (bell). Guarded.
- `send_email` — invoke `email-api`. Guarded.
- `send_sms` — invoke `messaging-api`.
- `send_push` — resolve the user's `push_subscriptions` -> `notification-dispatcher`.
- `log_event` — insert an audit/dedup-marker row (`{table, row}`).
- `run_edge_function` — invoke any edge function with a JSON payload.
- `send_price_alert`, `send_quote`, `build_quote`, `send_agent_message`,
  `create_moodboard`, `add_to_moodboard`, `http_request`, plus the enrichment
  actions (`web_search`, `firecrawl_scrape`, `apollo_enrich`,
  `hunter_find_contacts`, `zerobounce_validate`).

### Conditions
- `if_else`, `switch`, `filter`, `delay` — implemented.
- `loop` — implemented. Config `{ collection_field, item_variable, max_iterations }`.
  Runs the directly-connected downstream action node(s) once per item in the
  collection, exposing `{{item}}` and `loop_index`. Single-level body; hard cap 1000.
  Used by the quote admin fan-out flows.
- `stop` — hard short-circuit of a branch (pair with `if_else` for dedup).

---

## 4. Converted events -> default flows

All default flows are tagged `system-default` and seeded **active**. Each source
emits an enriched payload (`user_id`/recipient, `title`, `body`, `action_url`,
`type`, plus event-specific fields).

| Area (trigger) | Source | Delivery |
|---|---|---|
| `hire_me_received` | `HireMeModal.tsx` | Create Notification |
| `profile_followed` | `FollowButton.tsx` | Create Notification |
| `material_reviewed` | `MaterialReviews.tsx` | Create Notification (owner) |
| `preferred_factory_added` | `ProfileTab.tsx` | Create Notification (factory) |
| `vr_world_created` / `vr_world_failed` | `generate-vr-world` | Create Notification |
| `virtual_staging_completed` | `generate-virtual-staging` | Create Notification |
| `video_generation_completed` / `_failed` | `generate-interior-video-v2` | Create Notification |
| `svbrdf_extraction_complete` | `svbrdfExtractionAPI.ts` | Create Notification |
| `agent_search_completed` / `background_agent_failed` | `background-agent-runner` | Create Notification |
| `role_upgrade_request_submitted` | `role-upgrade-requests` | Create Notification (per-admin emit) |
| `role_upgrade_approved` / `_rejected` | `role-upgrade-requests` | Create Notification |
| `factory_approved` / `factory_rejected` | `FactoryRegistrationsTab.tsx` | Create Notification |
| `appointment_booked` | `BookingModal.tsx` | Create Notification (professional) |
| `appointment_confirmed` / `_cancelled` | `AppointmentsPage.tsx` | Create Notification (client) |
| `quote_approved` / `quote_rejected` | `QuotesService.ts` | **Loop** over `admin_ids` -> Create Notification |
| `quote_pdf_generated` | `generate-quote-pdf` | Create Notification |
| `stripe_payment_succeeded` / `_failed` | `stripe-webhooks` | Create Notification |
| `project_invitation_sent` / `_resent` | `projectsService.ts` | Send Email |

> The **credit grant** in `stripe-webhooks` stays in the webhook; only the
> notification was moved to a flow.

---

## 5. Governance — locking & System Areas

Because these flows are wired to real platform functionality, two protections
exist so a flow can't be accidentally deleted or an area left without a handler.

### 5a. Lock / unlock (prevent deletion)
- `flows.is_locked boolean` (default false). All `system-default` flows are locked.
- **UI:** the **My Flows** tab shows a Locked badge; the row's "..." menu has
  **Lock (prevent delete)** / **Unlock (allow delete)**, and **Delete** is disabled
  while locked.
- **DB enforcement:** a `BEFORE DELETE` trigger (`prevent_locked_flow_delete`)
  raises an error if `is_locked` — so even a direct API/SQL delete is blocked
  until the flow is unlocked. The frontend surfaces this as a clear message.

### 5b. System Areas (coverage registry)
- `flow_area_registry` — one row per platform area that should always have a flow
  pointed at it: `{ area_key, title, description, category, trigger_type,
  required, bound_flow_id, sort_order }`.
- **UI:** the **System Areas** tab groups areas by category and shows each as
  **Linked** (green) or **Empty** (red). A per-row dropdown lists every flow whose
  `trigger_type` matches the area; picking one sets `bound_flow_id`, choosing
  "Empty" clears it. A header badge warns when any **required** area is empty.
- This is the "always something is pointed to that area" guarantee: coverage is
  visible at a glance and one click away from being restored.

> Note: `bound_flow_id` is the **declared canonical handler** for visibility/governance.
> The engine still dispatches by `trigger_type` to all active matching flows, so
> binding is a coverage/ownership signal, not a routing switch. (A future option is
> to make the engine prefer the bound flow exclusively — deliberately not done yet.)

---

## 6. Deploy-order safety

The seeded flows are live in the DB before the emitting code ships. To keep the
transition clean in **any** order:

- `create_notification` **skips** (no row) if the templated `user_id` or `title`
  didn't resolve (still contains `{{`).
- `send_email` **skips** if the templated `to` didn't resolve.
- Old (pre-migration) clients that emit id-only payloads therefore cause a clean
  skip rather than a broken notification; meanwhile any still-hardcoded insert
  keeps delivering until its source ships. No double-sends, no lost notifications.

---

## 7. How to operate

- **Run a flow on demand:** My Flows -> **Run Now** (works for any flow regardless
  of trigger; there is no "Manual Trigger" node).
- **Pause a notification:** My Flows -> "..." -> **Pause** (the source still emits;
  nothing is delivered until reactivated).
- **Edit the message/recipient/channel:** open the flow in the **Flow Builder**,
  edit the action node config (uses `{{trigger.data.*}}` templates).
- **Protect a flow:** "..." -> **Lock**. **Restore coverage:** **System Areas** -> pick
  a flow for the empty area.
- **Add a channel** (e.g. also send a push): add a `send_push` action node to the
  flow alongside `create_notification`.

---

## 8. How to add a NEW converted event

1. Add the trigger string to `TriggerType` (+ config interface + the exhaustive
   icon/label maps + palette entry) in `src/services/flows/types.ts`,
   `MyFlowsTab.tsx`, `nodes/TriggerNode.tsx`, `panels/configs/TriggerConfigForm.tsx`,
   `utils/paletteItems.ts`.
2. In the source, replace the hardcoded send with an emit carrying the full
   payload (`user_id`/recipient, `title`, `body`, `action_url`, `type`).
3. Seed an **active** default flow (trigger -> `create_notification` / `send_email`),
   tag it `system-default`, and lock it.
4. Add a `flow_area_registry` row for the new area and bind it to the seeded flow.
5. Typecheck (`npx tsc -p tsconfig.json --noEmit`) and deploy.

---

## 9. Known follow-ups (not yet converted)

- `stripe` **invoice_paid** notification — needs an `invoice_paid` trigger type.
- **Finance statement** email (`finance-send-statement`) — needs `send_email`
  attachment support (it sends a PDF).
- **Email channel** for role-upgrade / factory — needs `send_email` to support
  `template_slug` + `variables` (the bell channel is already on flows).
- **Python monitoring** (price / mention / job alerts) — detection + credit
  metering intentionally stay in Python; only a future emit-to-flow bridge +
  `debit_credits` action would move channel fan-out into Flows.

---

## 10. Source map (quick reference)

| Concern | File |
|---|---|
| Engine (actions, conditions, loop, guards) | `supabase/functions/flow-engine/index.ts` |
| Frontend emit | `src/services/flows/flowEventService.ts` |
| Edge emit | `supabase/functions/_shared/flow-events.ts` |
| Types (Flow, triggers, area registry) | `src/services/flows/types.ts` |
| Service (CRUD, lock, areas) | `src/services/flows/flowService.ts` |
| Admin UI shell + tabs | `src/components/Admin/FlowsManagement/FlowsManagement.tsx` |
| My Flows (Run Now, lock) | `src/components/Admin/FlowsManagement/MyFlowsTab.tsx` |
| System Areas tab | `src/components/Admin/FlowsManagement/SystemAreasTab.tsx` |
