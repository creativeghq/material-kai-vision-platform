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
  - `trigger-event` -> runs every **active** flow whose `trigger_type` matches,
    **scoped to workspace** (see the note below).
  - `execute-flow` / `test-flow` -> run a single flow (used by **Run Now** + builder).
- **Templating:** action configs use `{{trigger.data.fieldname}}` (and `{{item}}`
  inside a Loop). Unresolved templates are guarded (see section 6).

> **Workspace-scoped now (#256).** Flows are no longer only global/admin. Each `flows`
> row carries `workspace_id` + `is_global`; `trigger-event` resolves the event's
> **authoritative, non-spoofable** workspace (trusting a body `workspace_id` only from a
> service-role/cron emitter, else a workspace the caller verifiably belongs to) and matches
> **all `is_global` flows PLUS that workspace's own non-global flows** — never another
> tenant's rows. Tenants can create simple workspace automations from chat via the KAI
> `manage_flows` tool (allowlist RPCs `create_simple_flow`/`toggle_simple_flow`/`delete_simple_flow`),
> and the `send_campaign` action bridges to the Email-Marketing module (#255). Full detail:
> `docs/flow-engine.md` → "Workspace Scoping (#256)".

### Tables

| Table | Purpose |
|---|---|
| `flows` | The flows themselves (`graph_definition` jsonb, `trigger_type`, `status`, `is_locked`, `tags`, `workspace_id`, `is_global`). |
| `flow_runs` | One row per execution (status, timing, error). |
| `flow_run_steps` | Per-node execution log within a run. |
| `flow_area_registry` | Coverage registry — maps each platform **area** to its canonical flow. |
| `user_notifications` | Bell notifications (written by the `create_notification` action). |

---

## 2a. Trigger entry points (how a flow actually fires)

There are **four** ways a flow runs. All converge on the `flow-engine` edge function.

| Trigger | How it fires | Entry point | Verified |
|---|---|---|---|
| **Event** (platform actions) | code calls `flowEventService.emit(type, data)` / `emitFlowEvent(type, data)` → runs **all active** flows with matching `trigger_type` | `flow-engine` `trigger-event` | ✅ live (the 27 notification flows) |
| **Webhook** (external code/HTTP) | external system `POST`s to the flow's URL | `flow-webhook` edge fn → `flow-engine` `execute-flow` | ✅ smoke-tested 2026-05-31 |
| **Scheduled** (cron) | `flow-scheduler-cron` runs every minute, matches each `scheduled` flow's cron + timezone | `flow-scheduler-cron` → `flow-engine` `execute-flow` | ✅ running in prod (pg_cron `* * * * *`) |
| **Manual** (Run Now) | the **Run Now** button on the Flows dashboard | `flow-engine` `execute-flow` | ✅ live |
| **Test** | dry-run in the builder (resolves templates, doesn't fire actions) | `flow-engine` `test-flow` | ✅ live |

> Note on the action names: `flow-engine`'s top-level switch has only
> `execute-flow` / `test-flow` / `trigger-event`. There is **no** `webhook` or
> `scheduled` action — those edge functions each call `execute-flow` after their
> own validation. So "webhook" and "scheduled" are *entry points*, not engine actions.

### Webhook usage (triggering a flow from outside code)

A flow whose trigger is `webhook` gets a unique URL. External systems call:

```
POST https://<project-ref>.supabase.co/functions/v1/flow-webhook?flow_id=<uuid>
X-Webhook-Secret: <secret from the flow's trigger_config>   # optional
Content-Type: application/json

{ "any": "json", "you": "want" }
```

- The request JSON body becomes `trigger.data.*` in the graph (so an action can
  template `{{trigger.data.any}}`). Query params land under `trigger.data._webhook.query_params`.
- The function validates: flow exists, `trigger_type = 'webhook'`, `status = 'active'`,
  the HTTP method matches `trigger_config.method`, and (if set) the `X-Webhook-Secret`
  header matches `trigger_config.secret`.
- On success returns `{ success: true, data: { flow_id, run_id, status } }`.
- Secret validation is **verified working** (smoke test 2026-05-31: wrong secret →
  `401 Invalid webhook secret`, correct secret → `200`). The `timingSafeEqual`
  double-HMAC (both operands hashed under the same per-call random key, digests
  compared) is a legitimate constant-time compare.
- File: `supabase/functions/flow-webhook/index.ts`.

### Scheduled usage

Set the flow's trigger to `scheduled` with `trigger_config = { cron, timezone }`.
`flow-scheduler-cron` (pg_cron, every minute) finds due flows, stamps `last_run_at`
before dispatch (55s double-fire guard), and calls `execute-flow`. File:
`supabase/functions/flow-scheduler-cron/index.ts`.

---

## 3. Triggers, actions, conditions

### Trigger types (event vocabulary)
Defined in `src/services/flows/types.ts` (`TriggerType`). Beyond the originals
(the `manual` **palette node** was removed — use **Run Now** instead — but the
`manual` *type* still exists and is the default; plus `scheduled`, `webhook`,
`user_signup`, quote/moodboard/profile events, etc.), the migration added:

`quote_pdf_generated`, `factory_approved`, `factory_rejected`,
`appointment_booked/confirmed/cancelled`, `svbrdf_extraction_complete`,
`virtual_staging_completed`, `vr_world_failed`,
`video_generation_completed/failed`, `background_agent_failed`,
`role_upgrade_request_submitted/approved/rejected`,
`stripe_payment_succeeded/failed`, `project_invitation_sent/resent`.

**Module lifecycle triggers** (each wired to a real emit point — a trigger with no
emitter is not shipped):
- **HR** (`hr-api`): `hr.employee_added` (create-employee), `hr.absence_requested`
  (record-absence), `hr.absence_reviewed` (approve/reject-absence), `hr.departure_recorded`
  (create-separation), `hr.overtime_recorded` (create-overtime), plus the existing
  `hr_late_checkin` (cron) and `hr.applicant_stage_changed` (ATS).
  `hr.ergani_filing_failed` is emitted from the **audit chokepoint** in `ergani.ts` — every
  Ε-document rejection, in one place, rather than per handler. It is deliberately NOT emitted
  for work-card punches (`workcard.ts` has its own audit path): punches fail transiently by the
  dozen, so alerting on those would be noise. A rejected Ε3/Ε4/Ε5/Ε6/Ε7/Ε8 is the signal —
  before this, that failure only ever landed as a row in `hr_ergani_submissions` and nobody
  was told the filing never reached the ministry.
- **Finance** (`ordersService`): `order_created` (order create), `order_status_changed`
  (status transition) — alongside the existing invoice/receipt/payment/expense/PO events.
- **Finance — leftover customer money**: `customer_credit_releasable`, raised from TWO places
  that share one cooldown: `ordersService.announceReleasableCredit` (frontend) on a sale's closing
  transition, and the SQL function `finance_sweep_releasable_credit()` nightly, straight from
  pg_cron, for parties with money on account and no open order. The sweep emits through
  `net.http_post` → `flow-engine` like `_notify_low_stock` and the other SQL-side emitters — no
  edge function, because the only step that ever needed a runtime was the HTTP call. The rule itself is neither caller's — it is
  `vw_finance_parties.credit_releasable` (money unallocated AND nothing outstanding), so the
  Parties list, the order prompt and the sweep cannot disagree about what is releasable. The
  claim stamps BEFORE the emit: a lost nudge costs nothing, a doubled one gets the bell muted.
- **Docs** (`docsService`): `document_published` (draft→published transition, fires once),
  `doc_suggestion_submitted` (a member proposes an edit).
- **Email Marketing** (#255): `campaign_sent` (`campaign-processor` completion, once per
  campaign), `email_bounced` + `email_complained` (`email-webhooks`, workspace-scoped +
  campaign-aware via `email_logs.tags`). Opens/clicks are **intentionally not** triggers
  (high-volume; every open would fire a metered flow run — the campaign dashboard already
  aggregates them). The `send_campaign` **action** dispatches an existing campaign.
- **Social publishing** (Zernio): `social_post_published` + `social_post_failed`
  (`zernio-webhook-handler` `post.published`/`post.partial`/`post.failed`, workspace-scoped).
- **Project Client Views**: `client_view_feedback_received` (`moodboard-sheet-share` — a
  client approves / requests changes / comments on a shared deliverable; routed to the
  deliverable owner + resolved workspace via the project).
- **CRM**: `crm_contact_created` + `crm_company_created` (`crm-api` handlers). The contact
  payload carries `lead_source` so a Filter node can exclude bulk imports (e.g. fire only
  when `lead_source != 'import'`).
- **Email Marketing engagement**: `email_opened` + `email_clicked` (`email-webhooks`).
  **HIGH-VOLUME** — each event fires a metered flow run, so pair with a Filter node
  (e.g. a specific `campaign_id`). Surfaced because they enable drip / re-engagement flows.
- **Catalogs**: `catalog_sent_to_customers` (`catalog-send-to-customers`). **Quotes**:
  `quote_sent` (`send-quote-email`) — enables "N days after sending, follow up" automations.
- **Monitoring** (Price / Mention / Job): `price_alert_triggered`, `mention_alert_triggered`,
  `job_alert_triggered`. Detection + credit metering stay in the Python dispatchers; the
  bridge is an **AFTER INSERT DB trigger** on each `*_alert_log` table (`_notify_price_alert`
  / `_notify_mention_alert` / `_notify_job_alert`) that POSTs `trigger-event` to `flow-engine`
  via `pg_net` (same pattern as `_notify_want_match`), resolving `workspace_id` from the
  tracked subject. This finally routes the monitoring channel fan-out through Flows.

- **e-Invoicing** (`finance-fiscal-offline-recovery`, #193): `fiscal_document_rejected` — a
  legal document burned a series number but never reached AADE, either because AADE refused it
  on delayed transmission or because it has sat offline with no verdict (`reason` in the payload
  separates the two). `fiscal_credits_low` — the **operator's** provider credit pool crossed a
  low tier; unlike every other Finance trigger this one is not about a tenant's document but
  about the shared pool all tenants transmit through. Both are seeded **active + locked**
  (unlike the optional module-lifecycle triggers below) because the failure they report is
  otherwise silent: the document keeps a legal number and the invoice page keeps looking normal.

> **myAADE** is intentionally NOT given a trigger — it's a synchronous registry-lookup
> helper (fill a business profile from ΑΦΜ), not a lifecycle with an automatable event.

These are registered in `flow_area_registry` as **optional** (unbound) automation
surfaces — an operator builds and binds their own flow. They are NOT pre-seeded with
a skip-forever default notification (no natural single recipient), so nothing runs
until an operator wires one in the builder.

### Action types (engine handlers in `flow-engine/index.ts`)
- `create_notification` — insert into `user_notifications` (bell). Guarded.
- `send_email` — invoke `email-api`. Guarded. Tenant-scoped flows send BYOK.
- `send_whatsapp` — invoke `messaging-api` (WhatsApp via Zernio). `send_sms` is a
  legacy alias kept for old flows; both route to the same handler.
- `send_campaign` — flip an existing Email-Marketing campaign (#255) owned by the
  flow's workspace to `sending`. Tenant-scoped only; never cross-tenant.
- `send_price_alert` — module-gated (`price-monitoring-notifications`) bell + audit row.
- `send_push` — resolve the user's `push_subscriptions` -> `notification-dispatcher`.
- `log_event` — insert an audit/dedup-marker row (`{table, row}`).
- `run_edge_function` — invoke any edge function with a JSON payload.
- `send_quote`, `build_quote`, `approve_quote`, `send_agent_message`,
  `create_moodboard`, `add_to_moodboard`, `http_request`, CRM writes
  (`assign_user`, `add_tag`, `add_note`, `update_contact`, `update_product`),
  plus the enrichment actions (`web_search`, `firecrawl_scrape`, `apollo_enrich`,
  `hunter_find_contacts`, `zerobounce_validate`).

> **Admin builder ↔ tenant modal are unified.** The admin Flow Builder palette
> (`utils/paletteItems.ts`) now exposes the **full engine action vocabulary** —
> including `send_whatsapp`, `send_campaign`, and `send_price_alert`. The tenant
> chat modal (`FlowFormModal` + `create_simple_flow` allowlist) is a **curated
> subset** of that same vocabulary (`create_notification`, `send_email`,
> `send_whatsapp`, `send_agent_message`, `send_campaign`), so every action a tenant
> can pick also exists in the admin builder. `send_sms`/`send_whatsapp` are one
> handler; the palette offers WhatsApp (SMS was removed 2026-06-08).

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
| `preferred_factory_added` | `AmbassadorTab.tsx` | Create Notification (brand) |
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

### 5c. Platform defaults — the workspace owner's off switch

A `system-default` flow is `is_global` with `workspace_id IS NULL`, and the engine
matches `is_global.eq.true` for **every** workspace. So it genuinely runs inside a
tenant's workspace, raising its bells and mailing its members — while being invisible
on every tenant surface, and locked against the operator's own delete.

That was a real hole, not just a missing feature. Measured 2026-08-24: **115 flows,
all of them global, zero workspace-owned** — so *Automations* was structurally empty
for every workspace that has ever existed, and the seeded `Inbox Message → Notify
Recipient` flow (`create_notification` **+** `send_email`) mailed the owner on every
inbox message, WhatsApp replies included, with no off switch anywhere in the product.

**The fix is an overlay, never a per-workspace copy of the 113 defaults.** Copies
would drift the moment the operator fixed a default, need seeding for every new
workspace and back-filling for every new default. Instead:

| Piece | What it is |
|---|---|
| `flows.tenant_configurable` | Operator marks a global flow as one an owner may govern. Default **false** = fail-closed: a newly seeded flow is invisible to tenants until deliberately opened. Toggled per row in **/admin → Flows** ("Let workspaces switch this off"). |
| `workspace_flow_preferences` | Sparse `(workspace_id, flow_id) → {enabled, muted_actions[]}`. **No row = the platform default**, fully on. SELECT policy for members; no write policy at all. |
| `get_workspace_flow_defaults(ws)` | The tenant read. A **projection** — title, description, category, trigger, channels, state. Never returns `graph_definition`, so a tenant learns what a notification *is*, never how the operator builds one. Self-guarding on `is_workspace_member`. |
| `set_workspace_flow_preference(...)` | The tenant write. Requires `is_workspace_admin`; refuses any flow that is not `is_global AND tenant_configurable AND active`; narrows `muted_actions` to channels the flow actually has. **Silencing every channel a flow has is switching it off** — the RPC flips `enabled` to false and clears the mute list, because an "on" row that can deliver nothing is a lie the surface would repeat. It RETURNS the resolved `{enabled, muted_actions}` so the client displays that answer rather than keeping its own copy of the rule. |
| Automations → **Platform defaults** | `PlatformDefaultsSection.tsx`. Grouped by area category, searchable, one master switch + per-channel chips per row. |

**Mutable channels are delivery only** — `create_notification`, `send_email`,
`send_whatsapp`. `run_edge_function` and friends are mechanism: muting one would
half-break the automation rather than quieten it.

**Which defaults stay operator-only.** `tenant_configurable` is left **false** for
four kinds, because silencing any of them hides breakage rather than noise:
1. the operator's own business / the platform account tier (`role_upgrade_*`,
   `stripe_payment_*`, `module_access_requested`, `→ Notify Operator` flows);
2. flows where **the email IS the feature** — invite sends. Muting one does not
   quieten anything, it breaks inviting people with no other symptom;
3. alarms about the platform failing a legal or delivery obligation
   (`fiscal_document_rejected`, `email_bounced`, `email_complained`,
   `email_sender_not_configured`, `hr.ergani_filing_failed`);
4. delivery of a business document to the **customer** (`invoice_issued`,
   `payment_received`, `receipt_issued`, `payment_sent`, `order_dispatched`) — a
   finance decision made on the finance surface, so an owner who "turned off email
   noise" never discovers they also stopped invoicing customers.

Starting split: **86 configurable / 25 operator-only.**

**Engine.** `handleTriggerEvent` resolves the overlay once per event, keyed on the
**event's** workspace — a global flow's own `workspace_id` is NULL, so scoping to the
flow would silently never match. Disabled flows are dropped from the match; muted
channels are threaded down and skipped inside **`executeAction`**, the single point
both the BFS walk and the loop-node body pass through (a check at either call site
alone would let a fanned-out `send_email` straight past). A muted action records a
`skipped / muted_by_workspace` step, so a run still shows why nothing was sent.

**A tenant's own flow is never subject to this** — it is already theirs to pause via
`toggle_simple_flow`, and two independent off switches would disagree.

#### Reusing one = forking it

Switching a default off is not the same as changing it. **Reuse** copies the
default into the workspace as an ordinary automation and disables the global for
that workspace **in the same transaction** — leave a window where both are live
and the owner gets every notification twice, which is the opposite of why they
opened the screen.

- `fork_workspace_flow_default(ws, flow)` — admin-gated, idempotent (a second click returns the copy you already have), and it pre-checks the vocabulary so the caller gets a sentence, not a raw `42501`.
- The copy drops the `system-default` tag and gains `from-platform-default`.
- `workspace_flow_preferences.forked_flow_id` points at it, **`ON DELETE CASCADE`**: deleting your copy drops the whole preference row, which restores the platform default. Without the cascade you would delete your copy and be left with the global silently off forever.
- **The copy is BILLED.** A platform default is an operator flow and runs free; a workspace flow costs 20 credits/run from the workspace pool plus per-action cost. On `inbox.message_received` that is a real bill, so the confirmation says so before the fork, not after.

**Only 4 of the 86 are forkable today** — `inbox.message_received`, `quote_approved`,
`invoice_paid`, `appointment_booked`. The rest are listed and switchable but not
editable, because `enforce_tenant_flow_allowlist` would reject the INSERT. The UI
reads the server-derived `forkable` flag rather than keeping its own list of
editable triggers, so the Reuse button appears exactly where the write would succeed.
Widening that set is a per-trigger security decision, not a UI change: several are
in `SERVER_ONLY_EVENTS` precisely because a forged payload reaches a mailbox.

#### The tenant vocabulary is ONE list (it was three)

`TENANT_TRIGGERS`/`TENANT_ACTIONS` (offered to the LLM), `create_simple_flow`'s
`v_allowed_*` (the agent create path) and **`enforce_tenant_flow_allowlist`** (a
`BEFORE INSERT OR UPDATE` trigger on `flows` — the real floor, crossed by every
write path). The docs and the guard test both described **two**. `payment_sent`
was added to the first two when this drift was last "fixed"; the trigger never got
it, so *notify me when a payment goes out* passed zod, passed the RPC, and died on
a raw `42501` one layer below where anyone had looked.

Both SQL halves now read `tenant_flow_allowed_triggers()` /
`tenant_flow_allowed_actions()`. One list in the database, one mirror in
TypeScript, pinned by `flowEventContract.test.ts`. **Do not add a fourth.**

Membership rules, both learned the hard way:
- a trigger needs a TriggerType-union entry **and** a workspace-stamping emitter, or a flow bound to it can never fire and nothing reports that. `product_added` had neither and was dropped;
- `manual` has no emitter **by design** — it is what `createFlowForWorkspace` stamps on every empty automation the builder creates. Remove it from the floor and the *New automation* button starts raising `42501`.

Guarded by [tests/unit/workspaceFlowDefaults.test.ts](../tests/unit/workspaceFlowDefaults.test.ts).
Not repo-checkable: the RPC bodies live in `pg_proc`, so the admin gate and the
`tenant_configurable` filter are enforced by the functions and probed by hand.

**Known gap:** the switch is per **workspace**, not per **member**. An owner can stop
the workspace being emailed; one member cannot mute only their own copy while
colleagues keep theirs. That needs a recipient-level evaluation inside the action
loop rather than a per-event lookup.

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

1. **Add the trigger string to `TriggerType`** in `src/services/flows/types.ts`
   (the union + a `*TriggerConfig` interface + a `TriggerConfigMap` entry), then
   update the **exhaustive `Record<TriggerType, …>` maps** — TypeScript fails the
   build if you miss one, which is the safety net:
   - `MyFlowsTab.tsx` — **two** maps: `triggerIcons` AND `triggerLabels`.
   - `nodes/TriggerNode.tsx` — `triggerIcons`.
   - `utils/paletteItems.ts` — add a trigger palette item so it's draggable in the builder.
   - `panels/configs/TriggerConfigForm.tsx` — **only if** the trigger needs a custom
     config form. Payload-only events (the common case) need nothing here; they fall
     through the `default` and the shared migration-events block. Add a `case` only
     for filter/config UI.
2. **In the source, replace the hardcoded send with an emit** carrying the full
   payload the action will template — `user_id` (recipient), `title`, `body`,
   `action_url`, `type`, plus any event-specific fields.
   - Frontend: `flowEventService.emit('your_event', {...})`.
   - Edge function: `import { emitFlowEvent } from '../_shared/flow-events.ts'`
     then `emitFlowEvent('your_event', {...})` (remember the import!).
3. **Seed an active default flow** (trigger -> `create_notification` / `send_email`),
   tag it `system-default`, and set `is_locked = true`. Copy the `graph_definition`
   shape from an existing `system-default` flow (trigger node + action node + one edge,
   config values as `{{trigger.data.*}}`). Seed via `mcp__supabase__execute_sql`.
4. **Register the area:** insert a `flow_area_registry` row and set `bound_flow_id`
   to the seeded flow, so it shows **Linked** in the System Areas tab.
5. **Verify:** `npx tsc -p tsconfig.json --noEmit` (0 errors), commit. Edge functions +
   frontend deploy via the **"Deploy FE & Supabase"** GitHub Action on merge to `main`.

### 8a. Branching: an edge out of a condition node MUST carry `sourceHandle`

The engine follows a condition's outgoing edges by **handle**, not by position:

```ts
const branchEdges = edges.filter((e) => e.source === nodeId && e.sourceHandle === branch);
```

A passing `filter` (and a `delay`) returns branch **`'output'`**; `if_else` returns
`'true'` / `'false'`; `switch` returns the case value. An edge with **no**
`sourceHandle` matches nothing — so the condition evaluates, logs `passed: true`,
routes nowhere, and the run is recorded as **`completed`**. No error, no failed step,
a green run that performed no action. This cost real time while building the #343
reminder flows; it is invisible from the product, because the graph is valid, the
flow is active and the engine reports success.

`loop` and `stop` are the exceptions. `loop` executes its children **inline**
(`edges.filter(e => e.source === nodeId)`, no handle check) and marks them visited,
so its edges legitimately carry no handle — nine seeded `loop → notify` flows are
correct as written. `stop` is terminal.

Backstop: **`ops.flow_condition_edge_unrouted`** flags any active flow with an
unhandled edge out of a branching condition node.

If the new feature instead needs an **external/webhook** or **scheduled** trigger
(not a platform event), you don't add a new `TriggerType` value — reuse
`webhook` / `scheduled` and configure the flow in the builder (see §2a).

---

## 9. Governance decisions (#245 D)

Automated bell paths that previously bypassed Flows are now governable trigger types
(seeded active locked `system-default` flows, registered in the area registry):

- **`material_alert`** — `check-material-alerts` cron (saved-search matches). Was a
  direct `user_notifications` insert; now emits one event per match.
- **`finance_follow_up`** — `finance-digest-aggregate` cron (due/stale quote bell).
  Was a direct insert; now emits per follow-up. (The digest **email** stays a direct
  `email-api` template send — see "intentionally direct" below.)
- **`invoice_paid`** — `stripe-webhooks` `invoice.paid`, the **creator** bell. The
  customer-facing `payment_received` event was already on Flows and is unchanged.

**Resolved (no change needed):**
- **WhatsApp replies** already flow through Flows: `zernio-webhook-handler` emits
  `inbox.message_received` (+ `inbox.thread_assigned`), both registered with seeded
  flows. There is **no** separate `whatsapp.reply_received` event — the earlier
  "dead event" note was stale.
- **role-upgrade-requests** is **not** a duplicate: the `role_upgrade_*` flow events
  drive the **bell**; the direct `sendEmail` calls are the **email** channel
  (transactional, intentionally direct — see below). Two channels, not a dup.

**Intentionally direct (NOT routed through Flows):**
- User-initiated / transactional sends — `finance-send-invoice-email`,
  `send-quote-email`, `finance-send-statement`, `catalog-send-to-customers`,
  role-upgrade emails — Flows governs **automation**, not button-clicks.
- **Python monitoring** (price / mention / job alerts) — detection + credit metering
  intentionally stay in Python; only a future emit-to-flow bridge + a `debit_credits`
  action would move channel fan-out into Flows. Decided to keep them out for now.

## Known follow-ups (not yet converted)

- **Finance statement / digest** email — needs `send_email` action with attachment
  support (they send a PDF), to fully route the email channel through Flows.
- **Email channel** for role-upgrade / factory — needs `send_email` to support
  `template_slug` + `variables` (the bell channel is already on flows).

---

## 10. Source map (quick reference)

| Concern | File |
|---|---|
| Engine (actions, conditions, loop, guards) | `supabase/functions/flow-engine/index.ts` |
| Webhook trigger receiver | `supabase/functions/flow-webhook/index.ts` |
| Scheduled trigger driver | `supabase/functions/flow-scheduler-cron/index.ts` |
| Frontend emit | `src/services/flows/flowEventService.ts` |
| Edge emit | `supabase/functions/_shared/flow-events.ts` |
| Types (Flow, triggers, area registry) | `src/services/flows/types.ts` |
| Service (CRUD, lock, areas) | `src/services/flows/flowService.ts` |
| Admin UI shell + tabs | `src/components/Admin/FlowsManagement/FlowsManagement.tsx` |
| My Flows (Run Now, lock) | `src/components/Admin/FlowsManagement/MyFlowsTab.tsx` |
| System Areas tab | `src/components/Admin/FlowsManagement/SystemAreasTab.tsx` |
