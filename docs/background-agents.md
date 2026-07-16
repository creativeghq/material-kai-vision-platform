# Background Agent Framework

Autonomous background agents that run on schedules, respond to events, or are triggered manually. Each agent is a typed, registered runner that operates on workspace data using Claude and the MIVAA API.

---

## Overview

Background agents are long-running tasks that run outside the request/response cycle. They are stored as configuration records in the DB, and each execution is tracked end-to-end with logs and heartbeats.

**Admin UI:** `/admin/background-agents`

**Edge Functions:**
- `background-agent-runner` — Universal executor for all agent types
- `agent-scheduler-cron` — pg_cron every minute; dispatches agents due to run
- `auto-recovery-cron` — Every 5 minutes; detects and recovers stuck runs

---

## Architecture

```
DB record (background_agents)
    ↓
Triggered by: cron | event | manual | chain (parent completion)
    ↓
agent-scheduler-cron / event emitter / UI invokes background-agent-runner
    ↓
Runner authenticates → fetches agent config → looks up runner in registry
    ↓
AgentRunner.run(context) executes (Claude, MIVAA API, Supabase)
    ↓
Tasks >25s → throws DelegateToMivaaError → runner POSTs to Python backend
    ↓
Results written to agent_runs + agent_run_logs
    ↓
chain triggers: child agents with parent_agent_id auto-dispatch on completion
```

---

## Registered Agent Types

| Agent Type | Name | Description |
|---|---|---|
| `kai-task` | JARVIS Task Agent | Runs arbitrary JARVIS agent tool calls autonomously |
| `product-enrichment` | Product Enrichment | Fills missing product metadata using Claude + web search |
| `material-tagger` | Material Tagger | Auto-tags products with structured material classifications |
| `social-analytics-sync` | Social Analytics Sync | Syncs per-post engagement metrics from Zernio |
| `social-insights-sync` | Social Insights Sync | Syncs account-level follower/reach snapshots from Zernio |
| `factory-enrichment` | Factory Enrichment | Enriches factory/manufacturer records via Apollo, Firecrawl, Hunter.io |

To add a new agent type: implement `AgentRunner` in `_shared/agents/your-agent.ts`, import and add to `_shared/agents/registry.ts`.

---

## Trigger Types

| Trigger | How it fires |
|---|---|
| `cron` | `agent-scheduler-cron` checks schedule expression every minute |
| `event` | `emitAgentEvent(eventType, data)` in `_shared/flow-events.ts` matches `event_type` |
| `manual` | Admin clicks "Run Now" in UI; calls `background-agent-runner` directly |
| `chain` | `trigger_type='chain'` + `parent_agent_id` — auto-dispatched when parent `completed` |

---

## Database Tables

### `background_agents`
Configuration records. One row = one agent definition.

| Column | Type | Description |
|---|---|---|
| `id` | uuid | Primary key |
| `name` | text | Human-readable name |
| `description` | text | What the agent does |
| `agent_type` | text | Registry key (e.g., `product-enrichment`) |
| `trigger_type` | text | `cron` \| `event` \| `manual` \| `chain` |
| `schedule` | text | Cron expression (when `trigger_type = 'cron'`) |
| `event_type` | text | Event to listen for (when `trigger_type = 'event'`) |
| `parent_agent_id` | uuid | Parent agent (when `trigger_type = 'chain'`) |
| `model` | text | Claude model override |
| `system_prompt_override` | text | Custom system prompt |
| `config` | jsonb | Agent-specific input config |
| `enabled` | boolean | Whether the agent will fire |
| `workspace_id` | uuid | Scope (null = global) |
| `last_run_at` | timestamptz | Last execution time |
| `last_run_status` | text | Last execution result |
| `run_count` | int | Total executions |

### `agent_runs`
Execution records. One row = one agent run. Real-time enabled.

| Column | Type | Description |
|---|---|---|
| `id` | uuid | Run ID |
| `agent_id` | uuid | FK to `background_agents` |
| `status` | text | `pending` \| `processing` \| `completed` \| `failed` \| `cancelled` |
| `triggered_by` | text | `cron` \| `event` \| `manual` \| `chain` \| `api` |
| `input_data` | jsonb | Config merged with runtime input overrides |
| `output_data` | jsonb | Final output from agent |
| `error_message` | text | Error detail on failure |
| `model_used` | text | Claude model that ran |
| `input_tokens` | int | LLM input token count |
| `output_tokens` | int | LLM output token count |
| `credits_debited` | int | Credits consumed |
| `started_at` | timestamptz | Execution start |
| `completed_at` | timestamptz | Execution end |
| `duration_ms` | int | Wall-clock duration |
| `last_heartbeat` | timestamptz | Updated every ~10s while running (used by auto-recovery) |
| `recovery_attempts` | int | Times auto-recovery has re-dispatched this run |
| `delegated_to_python` | boolean | True if delegated to MIVAA Python backend |
| `python_job_id` | text | Background job ID on Python side |
| `parent_run_id` | uuid | Parent run (for chain executions) |

### `agent_run_logs`
Structured log entries per run. Real-time enabled.

| Column | Type | Description |
|---|---|---|
| `run_id` | uuid | FK to `agent_runs` |
| `level` | text | `debug` \| `info` \| `warn` \| `error` |
| `message` | text | Log message |
| `data` | jsonb | Structured log payload |
| `created_at` | timestamptz | Log timestamp |

---

## Cancellation

A run can be cancelled mid-flight by flipping `agent_runs.status` to `'cancelled'` (the admin dashboard's "Cancel" button does exactly this). The signal is picked up on the agent's next heartbeat:

1. `ctx.heartbeat()` does a combined update+read: bumps `last_heartbeat` and reads back `status` in one round-trip
2. If `status === 'cancelled'`, it throws `CancelledError`
3. The runner catches `CancelledError`, finalizes the run with `status='cancelled'` (not `failed`), and skips failure notifications

Agents do **not** need to handle `CancelledError` themselves — let it bubble. Just call `ctx.heartbeat()` periodically (every ~10s) inside any long loop so cancellation is detected quickly. Without heartbeats the run will only stop at completion.

---

## Auto-Recovery

`auto-recovery-cron` runs every 5 minutes and:
1. Finds runs with `status = 'processing'` and `last_heartbeat` older than 8 minutes
2. If `recovery_attempts < 3` → re-dispatches the agent run, increments `recovery_attempts`
3. If `recovery_attempts >= 3` → marks run as `failed` with message "Auto-recovery limit reached"

Detected job types: `pdf_processing`, `xml_import`, `web_scraping`, background agent runs.

---

## Delegation to Python

Tasks expected to run longer than 25 seconds should throw `DelegateToMivaaError`:

```typescript
throw new DelegateToMivaaError({ job_type: 'your-long-task', input: context.inputData });
```

The runner catches this, POSTs to `https://v1api.materialshub.gr/api/agents/run` (Python endpoint: `agent_routes.py`), stores the returned `python_job_id` in the run record, and marks it as `delegated_to_python = true`.

---

## API

### Run an agent

```
POST /functions/v1/background-agent-runner
Authorization: Bearer <jwt>
Content-Type: application/json

{
  "agent_id": "uuid",
  "triggered_by": "manual",
  "input_data": {}        // optional — overrides config
}
```

**Response:**
```json
{
  "success": true,
  "run_id": "uuid",
  "status": "completed",
  "duration_ms": 4200,
  "output": { ... }
}
```

### Get agent type catalog

```
GET /functions/v1/background-agent-runner?catalog=1
```

Returns the registered agent type catalog (name, description, default tools, default model) for the UI dropdown.

---

## Frontend Components

| Component | Location | Purpose |
|---|---|---|
| `BackgroundAgentsPage` | `/admin/background-agents` | List, create, enable/disable agents |
| `AgentRunHistoryDrawer` | Same page | Slide-out panel with run history |
| `AgentLogsViewer` | Same page | Real-time log stream for a run |
| `CreateAgentModal` | Same page | Form to define a new agent |

The dashboard supports filtering by status / agent type, viewing real-time logs, and cancelling in-flight runs (see [Cancellation](#cancellation)). Subscribes to `agent_runs` and `agent_run_logs` via Supabase Realtime for live updates.

### Status tabs

The page exposes one extra synthetic status beyond the DB enum:

| Tab | Definition |
|-----|------------|
| `all` / `pending` / `processing` / `completed` / `failed` / `cancelled` | Direct match on `agent_runs.status` |
| `stuck` | `status='processing'` AND `last_heartbeat` older than `STUCK_MS` (8 min — same threshold the auto-recovery cron uses before re-dispatching) |

`isStuck(run)` lives in [`src/services/backgroundAgents.ts`](../src/services/backgroundAgents.ts) and is the single source of truth for the threshold.

### Agent-level alerts

In addition to per-run rows, the list surfaces synthetic "agent alert" rows for problems that aren't tied to any single run:

| Alert kind | Condition |
|------------|-----------|
| `disabled` | `enabled=false` AND `trigger_type` is `cron` or `event` (the agent will never fire) |
| `never-ran` | `enabled=true` AND `trigger_type='cron'` AND `last_run_at` is null (the schedule has never produced a run) |

Alerts appear under the `all`, `failed`, and `stuck` tabs (folded into the `failed`/`stuck` counters so the tab badge matches what's visible).

### Service API

`src/services/backgroundAgents.ts` exposes:

- `listAgents()` — all agent definitions
- `listAllRuns(limit = 100)` — server-side ordered + limited query across every agent (single round-trip; replaces the old per-agent fan-out)
- `listRuns(agentId, limit)` — runs for one agent (used by the history drawer)
- `cancelRun(runId)` — flips `status` to `'cancelled'`; the running agent picks it up on its next heartbeat
- `isStuck(run)` / `STUCK_MS` — stuck detection threshold
- `formatDuration` / `statusColor` — display helpers

---

**Last Updated:** April 15, 2026
