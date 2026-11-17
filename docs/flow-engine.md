# Flow Engine — Workflow Automation System

Visual drag-and-drop workflow automation built on xyflow. Create flows that connect triggers, conditions, and actions into automated pipelines.

---

## Overview

The Flow Engine lets workspace admins build multi-step automations without code. Flows are stored as xyflow graph definitions (nodes + edges) and executed server-side by the `flow-engine` edge function.

**Access:** `/admin/flows`

**Edge Functions:**
- `flow-engine` — Executes and tests flows
- `flow-scheduler-cron` — Runs scheduled flows on cron intervals
- `flow-webhook` — Triggers flows from external webhooks

---

## Architecture

```
Admin builds flow (drag-and-drop xyflow canvas)
    ↓
Flow saved to DB (flows table — nodes + edges JSON)
    ↓
Triggered by: cron schedule | incoming webhook | manual | event emission
    ↓
flow-engine edge function walks the graph:
  - Resolves {{template}} variables from execution context
  - Evaluates condition nodes (branches to true/false/case_N)
  - Executes action nodes (WhatsApp, email, HTTP, notification, etc.)
    ↓
Execution log written to flow_runs table
```

---

## Node Types

### Trigger Nodes
Define when a flow starts. One trigger node per flow.

| Trigger Type | Description |
|---|---|
| `manual` | Triggered via UI or API call |
| `cron` | Runs on a schedule (managed by `flow-scheduler-cron`) |
| `webhook` | Triggered by incoming webhook POST to `flow-webhook` |
| `event` | Fires on platform events (product created, quote submitted, etc.) |

### Condition Nodes
Branch the flow based on data values.

| Condition Type | Description |
|---|---|
| `if_else` | Evaluates field vs value → `true` / `false` branches |
| `switch` | Matches field against N cases → `case_0`, `case_1`, … branches |
| `filter` | Evaluates multiple conditions with AND / OR logic |
| `delay` | Pauses execution for a duration (capped at 30s in edge function) |

**Supported Operators for `if_else`:**

| Operator | Meaning |
|---|---|
| `equals` | Exact match |
| `not_equals` | Not equal |
| `contains` | String contains substring |
| `not_contains` | String does not contain |
| `starts_with` | String prefix |
| `ends_with` | String suffix |
| `gt` / `gte` | Greater than / greater than or equal |
| `lt` / `lte` | Less than / less than or equal |
| `is_empty` | Empty string, undefined, or null |
| `is_not_empty` | Non-empty value |

### Action Nodes
Perform side effects. Templated values like `{{trigger.data.user_email}}` are resolved at runtime.

| Action Type | What it does | Cost |
|---|---|---|
| `send_sms` | **Legacy alias for `send_whatsapp`** — both route to `messaging-api` debiting `zernio-whatsapp` (~0.005/msg). SMS (Twilio) removed 2026-06-08. Old saved flows using `send_sms` continue to work via this alias. | ~0.005/msg |
| `send_whatsapp` | Sends WhatsApp message via `messaging-api` (Zernio). Requires a Meta-approved template outside the 24h session window. | ~0.005/msg |
| `send_email` | Sends email via `email-api` (Resend). Tenant flows (`is_global=false`) send from the workspace's own BYOK Resend sender; global/operator flows send as the platform. | Resend per-message |
| `http_request` | Makes outbound HTTP call (GET/POST/PUT/DELETE) | None |
| `create_notification` | Inserts record into `notifications` table | None |
| `send_quote` | Generates and sends quote PDF via `generate-quote-pdf` | Included |

---

## Template Variables

Action configs support `{{path.to.value}}` syntax. The context is built from execution data:

```
{{trigger.data.field}}          — data from the trigger event
{{node_id.output.field}}        — output of a previous node
```

**Example:** A `send_whatsapp` (or its `send_sms` alias) action with `to: "{{trigger.data.customer_phone}}"` resolves the phone number from whatever data triggered the flow.

---

## Execution Modes

### `execute-flow`
Runs the flow for real. All actions fire (WhatsApp messages sent, emails sent, etc.).

```json
POST /functions/v1/flow-engine
{
  "action": "execute-flow",
  "flow_id": "uuid",
  "trigger_data": { "customer_phone": "+30...", "name": "Basil" }
}
```

### `test-flow`
Dry-run. Templates are resolved but no external actions fire. Returns the resolved config for each node so you can verify the output.

```json
POST /functions/v1/flow-engine
{
  "action": "test-flow",
  "flow_id": "uuid",
  "trigger_data": { "customer_phone": "+30...", "name": "Basil" }
}
```

### `trigger-event`
Auto-dispatch mode used by DB triggers and internal services. Finds all flows with `trigger_type = 'event'` and `event_type` matching the event, then runs them.

```json
POST /functions/v1/flow-engine
{
  "action": "trigger-event",
  "event_type": "quote.submitted",
  "event_data": { ... }
}
```

---

## Scheduling

`flow-scheduler-cron` runs every minute (pg_cron). It:
1. Queries all flows where `trigger_type = 'cron'` and `enabled = true`
2. Checks if the cron schedule is due (uses cron expression from flow config)
3. Invokes `flow-engine` with `action: 'execute-flow'` for each due flow
4. Updates `last_run_at` and `next_run_at` in the flows table

---

## Webhooks

`flow-webhook` exposes a public endpoint for external systems to trigger flows:

```
POST /functions/v1/flow-webhook?flow_id=<uuid>
Content-Type: application/json

{ "any": "payload", "from": "external-system" }
```

The payload is passed as `trigger.data` in the execution context.

**Security:** Flows with webhook triggers can optionally require an HMAC signature header (`X-Webhook-Signature`).

---

## Workspace Scoping (#256)

Flows are no longer only global/admin — they are **tenant-scoped**. Each `flows` row carries:

- `workspace_id` — the owning workspace (NULL for platform-wide flows).
- `is_global boolean` — `true` = a platform/operator flow that runs for every event; `false` = a tenant flow that only runs for its own workspace's events.

**Authoritative, non-spoofable dispatch.** When `trigger-event` fires, `flow-engine` resolves the event's workspace before matching flows and never trusts a client-supplied `workspace_id`:

- A **trusted server emitter** (service-role bearer or the cron secret — how `emitFlowEvent` / DB triggers dispatch) may assert the payload's `workspace_id`.
- A plain authenticated user may only scope to a workspace they actually belong to (verified via `userCanAccessWorkspace`), so a caller can never forge another tenant's context.
- Server-only / financial event types (see `SERVER_ONLY_EVENTS`) are rejected outright (403) when emitted by a browser/user.

The engine then matches on `trigger_type` + `status = 'active'` with a scoped filter: **all `is_global` flows PLUS the resolved workspace's own non-global flows** — never another tenant's rows. When no trustworthy workspace is established, only `is_global` flows run.

**Chat-driven tenant automations.** Workspace owners can build simple flows from chat (no `/admin/flows` access needed) via the JARVIS agent's **`manage_flows`** tool (`supabase/functions/_shared/tools/flow-tools.ts`). It writes real workspace-scoped rows through the SECURITY DEFINER allowlist RPCs **`create_simple_flow` / `toggle_simple_flow` / `delete_simple_flow`**, which enforce a tenant-safe trigger/action vocabulary server-side (the tool/UI restriction is not the security line):

- Allowed triggers: `scheduled`, `quote_approved`, `invoice_paid`, `payment_received`, `inbox.message_received`.
- Allowed actions: `send_email`, `send_whatsapp`, `create_notification`, `send_agent_message`, `send_campaign`.
- Tenant flows are always `is_global=false`; the RPC never lets a tenant set `is_global`. Gated on the `flows-toolkit` module being enabled + the workspace being entitled.

**`send_campaign` bridge to Email Marketing (#255).** The `send_campaign` action names an existing email campaign owned by the flow's own workspace and flips it to `status='sending'` so `campaign-processor` fans it out via the workspace's BYOK Resend. It is tenant-only (refuses when the flow has no workspace scope) and never dispatches a campaign belonging to another workspace.

---

## Database Tables

| Table | Purpose |
|---|---|
| `flows` | Flow definitions (name, graph JSON, trigger config, enabled state, `workspace_id`, `is_global`) |
| `flow_runs` | Execution log (status, duration, node results, errors) |

---

## Credit Usage

Individual actions may consume credits (e.g., `send_sms`/`send_whatsapp` via Zernio (~0.005/msg), `http_request` to paid APIs). Credit deduction is handled by the individual invoked functions, not the flow engine itself.

---

## Error Handling

- **Node failure**: Execution stops at the failed node; `flow_runs` records the error and which node failed.
- **Timeout**: Edge function has a 60s wall-clock limit. Use `delay` nodes conservatively (capped at 30s).
- **Template resolution failure**: Unresolvable `{{path}}` returns the literal `{{path}}` string — execution continues.

---

**Last Updated:** March 2026
